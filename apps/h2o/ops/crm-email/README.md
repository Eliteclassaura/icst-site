# CRM email: Stalwart platform and E1 (M1), replies from the CRM (M2)

Control Tower brief "CRM email with Stalwart R1" (2026-10-04), milestones M1–M2.

**Placeholders.** This file uses `<sender domain>`, `<mail host>` and `<VPS IPv4>`. The real values are in the
Control Tower return for M1, not in the repository. Secrets come from the Coolify environment only.

## What M1 adds to the app

- **One mail path.** Mail goes by SMTP submission (587, STARTTLS required, certificate verified against
  `H2O_SMTP_TLS_SERVERNAME`, AUTH required) to the internal Stalwart service. Code: `src/email/transport.ts`.
- **Send gate: `H2O_EMAIL_MODE`.**
  - `off`: nothing is sent and every attempt is recorded. This is the default, and the production setting until cutover GO.
  - `allowlist`: only `H2O_EMAIL_ALLOWLIST` addresses receive mail. This is the staging setting.
  - `live`: everyone receives mail.
  - A mode that cannot be honoured (missing sender, credentials, TLS name, an empty allowlist…) becomes `off`,
    and `/api/ready/` reports `email: fail`.
- **Suppression.** The suppression ledger (do-not-contact, legal, bounce, invalid address, all-email scopes) is
  honoured in every mode.
- **E1 messages, for web RFQs only (Typeform intake).**
  - A sales alert to `H2O_SALES_ALERT_TO`. It carries the RFQ number, company, product, page, button and CRM
    link, and no customer message body.
  - A customer acknowledgement, once per RFQ. It is sent only when `H2O_EMAIL_CUSTOMER_ACK=on`, which waits for
    the owner's approval of the text below.
  - A staff password reset (Payload auth), re-enabled. It is refused while the mode is `off`. The link expires
    after 1 hour and is never logged.
- **Outbox.** Collections `crm-email-outbox` and `crm-email-events`.
  - Messages are queued in the RFQ's own transaction.
  - Idempotency keys are unique.
  - The runner drains the outbox every 15 s. Retries back off: 1 min, 5 min, 15 min, 1 h, 3 h, 6 h. A message
    is dead-lettered after 7 attempts or on a permanent 5xx.
  - Every decision writes an event row (ids and codes only) and an RFQ timeline entry.
  - Logs carry ids, kinds and codes only.
- **Migration** `20261004_214231_crm_email_m1`: two tables, three enums and one activity type. It is additive.

## M2 — replies from the CRM (E2)

- Email tab on the RFQ (full page): Admin and Sales write plain text; the HTML part is generated from it. No
  attachments (no file input; the server refuses any file). No free-form "To": the reply goes to the RFQ's
  customer address (the linked contact's, else the submitted one).
- Sent from `H2O_EMAIL_FROM` with `Reply-To: <role>+<token>@<sender domain>`. The token (26 base32 characters,
  130 bits) belongs to one RFQ (`crm-reply-tokens`, admin-read), is reused by every reply, and expires a year after
  its last use. Replies are threaded (`In-Reply-To`/`References`) and are not marked `Auto-Submitted`.
- Suppression is checked before anything is written and again before sending; the send gate applies (a reply the
  gate stops is saved on the RFQ as **Not sent** with the reason). One message per compose form (double submit safe).
- Logged as the RFQ conversation (`crm-email-messages`: author, time, subject, body, Message-ID) and an
  `EMAIL_REPLY` timeline entry. Migration `…_crm_email_m2` (additive).

## Environment (web and runner)

| Variable | Staging | Production until GO |
|---|---|---|
| `H2O_EMAIL_MODE` | `allowlist` | `off` |
| `H2O_EMAIL_ALLOWLIST` | owner + test addresses (owner input) | — |
| `H2O_EMAIL_FROM` | `H2O Cooling <rfq@<sender domain>>` (owner confirms the role address) | same |
| `H2O_SALES_ALERT_TO` | owner input | owner input |
| `H2O_EMAIL_CUSTOMER_ACK` | `off` until the text is approved | `off` |
| `H2O_SMTP_HOST` / `H2O_SMTP_PORT` | `stalwart` / `587` | same |
| `H2O_SMTP_USER` / `H2O_SMTP_PASS` | the role account / secret store | same |
| `H2O_SMTP_TLS_SERVERNAME` | `<mail host>` | same |

The web and runner containers join the Docker network `h2o-mail`.

## Stalwart service (`stalwart.compose.yaml`)

- **Image:** `stalwartlabs/stalwart:v0.16.x`, pinned by digest by Commander.
- **Resources:** memory 512 MB, log rotation 3 × 10 MB.
- **Volumes:** config in a named volume; data on a size-capped filesystem (see "Disk cap" below).
- **Published ports:** only `25`. The admin listener is bound to `127.0.0.1:18080` on the host and reached through
  an SSH tunnel (`ssh -L 18080:127.0.0.1:18080 <vps>`). It is never public.

### First-start settings

These are made in the Stalwart web admin, through the tunnel.

1. **Bootstrap.**
   - Read the one-time admin password from `docker logs stalwart 2>&1 | grep -A8 'bootstrap mode'`, or set
     `STALWART_RECOVERY_ADMIN` from the secret store for the first start only.
   - Complete the wizard: hostname `<mail host>`, default store (RocksDB), logging to Console.
   - Restart, then remove any recovery variable.
2. **Domain `<sender domain>`.**
   - DKIM automatic, RSA-SHA256 (2048-bit).
   - DNS management **Manual**: the owner publishes the records.
   - Sub-addressing **Enabled** (for M2/M3 `rfq+<token>@`).
   - Reporting address as the owner chooses.
3. **TLS (ACME, Let's Encrypt).** Ports 80 and 443 belong to Coolify's proxy, so use the **DNS-01** challenge with a
   Cloudflare token scoped to *Zone → DNS → Edit* on `<sender domain>` only. Test against the staging directory
   first.
4. **Listeners.**
   - Keep SMTP 25, submission 587, IMAPS 993 and HTTP 8080.
   - Disable POP3, plain IMAP 143 and ManageSieve. They are not published anyway.
5. **Accounts.**
   - One role account, `rfq@<sender domain>`. It is the app's submission login (so the From address matches the
     authenticated sender) and the M2/M3 mailbox. Quota 2 GB.
   - Aliases `postmaster@`, `abuse@` → that account, unless the owner chooses otherwise.
6. **Defaults to confirm, not change:**
   - the spam filter is on;
   - relaying is refused for unauthenticated sessions;
   - submission requires authentication.

### Disk cap

The VPS disk is 50 GB and cannot grow. Docker volumes have no size limit, so put Stalwart's data on a fixed-size
filesystem. Commander runs this once, after the owner's GO:

```sh
fallocate -l 4G /srv/stalwart-data.img && mkfs.ext4 -q /srv/stalwart-data.img
mkdir -p /srv/stalwart-data && mount -o loop,noatime /srv/stalwart-data.img /srv/stalwart-data
chown 2000:2000 /srv/stalwart-data
echo '/srv/stalwart-data.img /srv/stalwart-data ext4 loop,noatime 0 2' >> /etc/fstab
```

Stalwart can then never use more than 4 GB, whatever happens. The account quota keeps the mailbox below that.

## Acknowledgement text: DRAFT, owner approval required

Version `ACK_R1_DRAFT_2026-10-04`, from `src/email/messages.ts`:

> **Subject:** We received your request (RFQ-…)
>
> Thank you for your request for quotation.
>
> Your reference number is RFQ-…. Please quote it if you contact us about this request.
>
> What happens next: a member of our team will review your request and reply to you by email. If we need more
> details to prepare a quotation, we will ask you.
>
> If you did not submit this request, you can ignore this message.
>
> *(sender name from `H2O_EMAIL_FROM`)*

The text makes no promise of time, price or outcome, and names no person, phone number or address.

## Verification

Commander runs these on staging.

1. **Outbound port 25.** `timeout 10 bash -c 'exec 3<>/dev/tcp/aspmx.l.google.com/25; head -1 <&3'` should print
   a `220` banner.
2. **External port scan, from outside the VPS.** `nmap -Pn -p 1-1024,4190,8080,18080 <VPS IPv4>` should show only
   25, 80 and 443 open.
3. **Open-relay test, from outside.** `swaks --server <mail host> --port 25 --from probe@example.com --to
   someone@example.net` should be rejected (relay denied).
4. **Submission needs authentication and is internal.**
   - `swaks --server <mail host> --port 587` from outside cannot connect.
   - On `h2o-mail` without AUTH, it is refused.
5. **Admin UI.** `curl -m5 http://<VPS IPv4>:8080/` and `:18080/` from outside both fail.
6. **App readiness.** `GET /api/ready/` shows `email: ok` (allowlist), or `off`.
7. **Staging end-to-end (allowlist).**
   - A Typeform test RFQ from an allowlisted address produces the sales alert and the acknowledgement. The
     acknowledgement needs the switch, which waits for owner approval.
   - A non-allowlisted address gives `SUPPRESSED_BY_MODE` in the outbox.
   - Password reset reaches an allowlisted staff address and the link works once.
8. **Deliverability.** On received messages at Gmail and one other provider, check `Authentication-Results`:
   `spf=pass`, `dkim=pass header.d=<sender domain>`, `dmarc=pass`.
9. **Resources.** Measure `docker stats stalwart --no-stream` and `df -h /srv/stalwart-data`.

## Rollback

- Set `H2O_EMAIL_MODE=off` and redeploy. Nothing is sent from then on, and queued rows become
  `SUPPRESSED_BY_MODE`.
- The migration is additive. The outbox and event tables stay as a record.
- Stopping the Stalwart service does not affect the app: queued mail retries, then dead-letters.
