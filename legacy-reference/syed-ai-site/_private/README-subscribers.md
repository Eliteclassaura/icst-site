# The Answer Layer — the list, and the path into a CRM

## What happens when somebody signs up

1. `send.php` validates the address (four layers — see below).
2. The subscriber is written to the log as **`pending`**, *before any email is sent*. If SMTP is down, you still have the subscriber.
3. A confirmation email goes out with one link and nothing else in it.
4. They click. `confirm.php` flips them to **`confirmed`** and sends the welcome.
5. Only then are they on the list.

That step 4 is the point. Nothing else proves an address is real **and** belongs to the person who typed it — syntax, MX and disposable-domain checks all pass happily for `dana@somebodyelse.com`.

## Where the data lives

```
/domains/syed.ai/
  syedai-config.php        ← your config
  subscribers.jsonl        ← the list. No URL reaches this.
  public_html/
    send.php               writes pending
    confirm.php            writes confirmed / unsubscribed
    subscribers.php        reads only. Key-gated, unlinked.
    subs.php               store library (404s if opened directly)
    email-check.php        validation library (404s if opened directly)
```

**Back up `subscribers.jsonl`.** The pages can be rebuilt from this repo. The list cannot be rebuilt from anything.

### Why append-only, one JSON object per line

Nothing is ever edited in place. A confirmation appends a new line; an unsubscribe appends another. Current state is the newest line per person.

- A crash mid-write cannot corrupt what is already there. Worst case is one truncated final line, and the reader skips lines that will not parse. **Tested with two deliberately corrupt lines: the list still read correctly.**
- Consent gets an audit trail for free — when each person agreed, from what IP, with what user agent. Under GDPR that record *is* your lawful basis. A mutable row throws it away on every update.
- Two simultaneous signups cannot lose each other. A locked append is atomic; read-modify-write is not.

## Before you upload

Three things, all in `syedai-config.php`:

```php
'subscribers_file' => __DIR__ . '/subscribers.jsonl',
'token_secret'     => '<64 random hex characters>',
'site_url'         => 'https://syed.ai',
```

Generate the secret once: `php -r "echo bin2hex(random_bytes(32)), PHP_EOL;"`

**Never change it afterwards.** Every confirmation link already sitting in an inbox is signed with the current value; rotating it invalidates all of them at once.

Then set `SUBS_KEY` at the top of `subscribers.php` to something of your own. Until you do, it refuses every request.

## Reading the list

`https://syed.ai/subscribers.php?key=YOUR-KEY`

Counts by status, everyone newest first, and two export buttons. It only ever reads — the only things that change a status are a signup and a click.

**The one rule: only `confirmed` may be mailed.** A `pending` row has not proved the mailbox exists; an `unsubscribed` row asked you to stop. Mailing either costs you the sending reputation this whole site depends on.

Watch the **confirm rate** tile. Under 60% is almost always a delivery problem rather than disinterest — send yourself a test signup and see whether the confirmation lands in spam. A pending row is somebody who wanted the newsletter and never got the chance to say so.

## The four validation layers

| Layer | Catches | Verdict |
|---|---|---|
| Syntax | Malformed addresses, control characters, over-length local parts and paths | hard reject |
| Disposable | 35 throwaway providers, exact match | hard reject |
| Typo | `gmial.com`, `hotmial.com`, `gmai.com` — 30 common domains, transposition-aware | **soft** — offers the correction |
| Domain | No MX, A or AAAA record — the domain cannot receive mail at all | hard reject |

Two details that matter more than they look:

**The typo check runs *before* the DNS check, on purpose.** `gmial.com` is a registered domain — typo domains of big providers are valuable precisely because people mistype them — so it resolves, publishes MX, and sails through any deliverability test. Asking "can this receive mail?" first would approve exactly the addresses this check exists to catch.

**A *known* domain is never second-guessed.** An earlier version of this ran the typo rescue first and duly offered to "correct" `yopmail.com` to `hotmail.com` — two edits apart, both real domains. Disposable and known-good lists are both checked by exact match before any fuzzy matching happens.

The typo verdict is overridable. The form shows *"Did you mean dana@gmail.com?"* with two buttons; **No, mine is right** re-submits with `email_ok=1`, which relaxes only that check. Some people really do have an address one edit from `gmail.com`, and a validator you cannot argue with refuses real subscribers.

Role addresses (`info@`, `sales@`, `admin@`) are **flagged, never rejected** — they show a `role` badge in the admin list. Plenty of real subscribers use one.

## Deduplication

The key is lower-cased, `+suffix` stripped, and for Gmail dots folded too — so `Dana@gmail.com`, `dana+news@gmail.com` and `d.a.n.a@gmail.com` are one person. That is what stops one person subscribing eleven times.

Dots are folded **for Gmail only**, because only Gmail ignores them. `d.a.n.a@fastmail.com` is a different mailbox from `dana@fastmail.com` and is treated as such.

The original spelling is always what gets stored and mailed. The key is only ever an index.

## Unsubscribe

Every newsletter email carries `List-Unsubscribe` and `List-Unsubscribe-Post` headers, which Gmail and Yahoo's bulk-sender rules expect. A mail client's one-click POST gets a plain-text acknowledgement; a person clicking the link gets a page.

"Not on the list" is a *success* for one-click, not a 404 — the desired end state already holds.

## When the Payload CRM is ready

1. `subscribers.php?key=…&export=payload` → a JSON file.
2. Add the collection: `_private/payload/Subscribers.ts`.
3. Run the importer: `npx tsx import-subscribers.ts ./syedai-subscribers-payload-YYYY-MM-DD.json`

It matches on **`externalId`**, not email, and updates rather than creates — so running it twice does not double the list, which matters because you will run it twice.

Why `externalId` and not email: people change addresses, and a corrected typo would otherwise import as a second person.

The export carries `status`, `consent` and the full `history` on every document, so the "only confirmed may be mailed" rule and the GDPR record both survive the migration. Keep the `.jsonl` after importing — it stays the audit trail.

### What the CRM will need that this does not have

Stated plainly so it is not a surprise later: **bounce and complaint handling**. The `bounced` status exists in the schema and nothing currently sets it, because that needs either a webhook from a sending provider or IMAP polling of a bounce mailbox — neither of which belongs in a static site's contact form. Until then, if an address bounces you will see it in your own inbox and can mark it by hand.
