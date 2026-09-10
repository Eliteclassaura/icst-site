# Runbook — outbound sending domain `buyingblogposts.com`

Decided 2026-09-04. Purpose: the syed.ai outbound (prospecting, Release P) sends from this domain so that cold-email reputation never touches `syed.ai`, whose mail is transactional and consented. Start the DNS now; reputation is a function of age and clean history.

Rules: this domain is used by **one** system (the prospecting module), from **one** named-person mailbox in the pilot, at the ramp in `docs/inputs/lean-prospecting-review-plan.md` §12.3 (5 → 10 → 15 → 20/day). It is never a client's sending domain and never appears in the factory's site templates. No self-hosted MTA.

## Records to add (owner or DNS controller)

| Record                  | Value                                                                                                | Why                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `MX`                    | the sending provider's MX (Google Workspace: `smtp.google.com` per current Google docs)              | replies and bounces must land somewhere we read                                  |
| `TXT @` (SPF)           | `v=spf1 include:_spf.google.com -all` — **only** the provider actually used; no `+all`, no leftovers | SPF must list authorised senders only (R33)                                      |
| `TXT google._domainkey` | DKIM public key generated in the Workspace admin (2048-bit)                                          | every outbound message signed                                                    |
| `TXT _dmarc`            | `v=DMARC1; p=none; rua=mailto:dmarc@buyingblogposts.com; adkim=s; aspf=s; pct=100`                   | start monitoring; move to `quarantine` then `reject` only after alignment proven |
| `A`/`AAAA` or `CNAME @` | a real landing page (a one-page site: who we are, what we send, unsubscribe, physical address)       | recipients and filters check the domain; a parked domain reads as spam           |
| `CAA` (optional)        | restrict certificate issuance to your CA                                                             | hygiene                                                                          |
| Postmaster tools        | verify the domain in Google Postmaster Tools                                                         | spam-rate and reputation visibility; the pause conditions read these numbers     |

Do **not** add the domain to any list-sending tool, do not run artificial warm-up exchanges, do not send anything from it until the Release P pre-send gate exists.

## What the factory will verify automatically (Release 7 `EmailProvider.health()`, Release P pre-send)

- SPF resolves to a single `-all` record with ≤ 10 DNS lookups and contains the active provider.
- DKIM selector resolves and the key length is ≥ 2048.
- DMARC record present; policy recorded; `rua` reachable.
- From-domain alignment: the visible From, the DKIM `d=` and the SPF domain are the same domain.
- Reverse path and TLS on the provider.

## Owner answers (2026-09-04)

1. DNS: **Cloudflare** controls `buyingblogposts.com`. Records above go in as DNS-only (grey cloud) for MX/TXT.
2. Mailbox: sent from the **syed.ai Google Workspace tenant** (domain added as a secondary domain). Accepted; noted risk: a provider restriction on the tenant would touch syed.ai mail too, so the pause conditions in the pilot are the control. Revisit a separate tenant if volume grows past one mailbox.
3. Footer identity: the owner's entity is not US-based. Note for the pilot: anti-spam duties follow the **recipient's** jurisdiction as much as the sender's — US recipients bring CAN-SPAM's identity/opt-out/address rules regardless of where the sender sits; UAE, Pakistan, UK/EU recipients bring their own. Which footer text applies is decided per pilot audience in Release P, with counsel if the audience is outside the owner's home jurisdiction. Not a Release 1/2 item.
