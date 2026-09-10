# The contact form — Hostinger + Gmail, start to finish

The site ships working: both the brief form and the chat post to `send.php`,
which relays over Gmail's SMTP. This is everything you have to do to make that
real. Budget 20 minutes.

Everything below was checked against Hostinger's own documentation. Where a
step differs between plans, both paths are given.

---

## Before you start — what your plan gives you

| | Single | Premium / Business / Cloud |
|---|---|---|
| SSH | ✗ | ✓ (enable in hPanel) |
| Composer | ✗ | ✓ pre-installed as `composer2` |
| PHPMailer install | Upload 3 files by hand (§2b) | One command (§2a) |

Everything else is identical. **Gmail SMTP works on every Hostinger plan** —
outbound ports 465 and 587 are open (Hostinger blocks only port 25 outbound),
and OpenSSL and cURL are enabled by default.

Confirm your PHP version first: hPanel → **Websites → Dashboard → PHP
Configuration**. Anything 8.2 or newer is fine; Hostinger defaults to 8.3.

---

## 1. Upload the site

hPanel → **File Manager** (or FTP). Upload the *contents* of the `dist` folder
into:

    /home/uXXXXXXXXX/domains/syed.ai/public_html/

so you end up with `index.html`, `assets/`, `send.php`, `.htaccess` and the rest
sitting directly in `public_html`. Hostinger's File Manager shows dotfiles by
default, so you should be able to see `.htaccess` — if it is missing, create it
with the New File button and paste the contents in.

**Do not upload `_private/`.** It is documentation and a config template. It
ships with a deny-all `.htaccess` in case you upload it anyway.

---

## 2. Install PHPMailer

### 2a. Premium and above (SSH)

hPanel → **Websites → Dashboard → SSH Access → Enable**, then connect (Hostinger
uses port 65002):

    ssh -p 65002 uXXXXXXXXX@your-server-ip
    cd domains/syed.ai/public_html
    composer2 require phpmailer/phpmailer

That creates `vendor/`. `send.php` finds it automatically.

### 2b. Single plan (no SSH, no Composer)

Download the latest release zip from
<https://github.com/PHPMailer/PHPMailer/releases>, open it, and from the `src/`
folder upload these three files into a new folder called `PHPMailer` inside
`public_html`:

    public_html/PHPMailer/PHPMailer.php
    public_html/PHPMailer/SMTP.php
    public_html/PHPMailer/Exception.php

`send.php` checks for `vendor/autoload.php` first and falls back to this folder,
so nothing else changes.

---

## 3. Create the Gmail app password

1. **Turn on 2-Step Verification** — <https://myaccount.google.com/security>.
   You cannot create an app password without it.
2. **Create the app password** — <https://myaccount.google.com/apppasswords>.
   Name it `syed.ai form`. Google shows 16 characters in four groups. Copy it.
   The spaces are display only — `send.php` strips them, along with the things
   a copy-paste picks up invisibly: a non-breaking space, a zero-width
   character, a stray line break, and quotes that ended up inside the quoted
   value. Any one of those produces `535 Username and Password not accepted`
   and looks exactly like a wrong password, so the endpoint removes them all
   before authenticating and `diagnose.php` names whatever it had to remove.
3. Keep that window open for the next step.

If the app-passwords page says the option is unavailable, your account has
Advanced Protection on, or a Workspace admin has disabled app passwords. See
**Troubleshooting** below.

---

## 4. Put the config above the web root

Copy `_private/config.example.php` and upload it as:

    /home/uXXXXXXXXX/domains/syed.ai/syedai-config.php

Note the path: **one level above `public_html`**, next to it, not inside it.
`send.php` reads `../syedai-config.php`, so this lands exactly right on
Hostinger with no edit. That directory is writable and is not served over the
web, which is the whole point — if PHP ever stops executing after a host
update, everything in `public_html` gets served as plain text, and your app
password must not be in that blast radius.

Fill in three values, **all the same Gmail address**:

    'to_email'   => 'you@gmail.com',
    'from_email' => 'you@gmail.com',
    'smtp_user'  => 'you@gmail.com',
    'smtp_pass'  => 'the 16-character app password',

**Why all three match.** Gmail rewrites the `From` header to the account you
authenticated as, unless the address is a verified *Send mail as* alias — and
Google retires third-party send-as in January 2027. Matching them means Google
signs the message with its own DKIM key, so it passes SPF, DKIM and DMARC with
no DNS work at all. The visitor's address goes in `Reply-To`, so pressing
**Reply** in Gmail answers them directly.

Also set your real domain:

    'allowed_origins' => ['https://syed.ai', 'https://www.syed.ai'],

Leave `'behind_cloudflare' => false` unless Cloudflare is genuinely proxying the
site. It tells the rate limiter to trust a request header, and trusting that
header when nothing sets it lets an attacker mint a fresh rate-limit bucket per
request.

---

## 5. Optional: Cloudflare Turnstile

Free, unlimited, invisible to most visitors, and it does not profile them.

1. <https://dash.cloudflare.com> → Turnstile → Add site → `syed.ai`.
2. Put the **secret key** in `syedai-config.php` as `turnstile_secret`.
3. Put the **site key** in `assets/js/site.js` as `TURNSTILE_KEY`.
4. In `.htaccess`, comment out the strict CSP line and uncomment the Turnstile
   variant directly beneath it — the widget needs a frame and injects its own
   styles.

Skip it to start. The honeypot and dwell-time checks already stop ordinary bots,
and no third-party request is made until you add a key.

---

## 6. Test it, in this order

1. **Send one real brief through the form.** It should arrive within seconds.
   Press **Reply** and confirm it addresses the visitor, not your own address.
2. **Send one through the chat.** The subject should read `[chat widget] New
   brief — …` so you can tell the two routes apart.
3. **Try to break it.** From a terminal:

       curl -X POST https://syed.ai/send.php

   should return `403 Bad origin`. If it returns anything else, `allowed_origins`
   is wrong.
4. **Trip the rate limit.** Six sends within an hour: the sixth returns `429`.
5. **Check the spool.** `syedai-config.php`'s folder should contain no
   `form-spool.jsonl`. If it exists, a send failed — open it, you have the lead,
   then check the error log in hPanel.
6. **Check the headers** at <https://securityheaders.com>. You should score A or
   better on the shipped `.htaccess`.

---

## If it is not working — start here

Upload **`diagnose.php`** next to `send.php`, open it in the top of the file,
change `DIAG_KEY` from `CHANGE-ME-FIRST` to anything of your own, then visit:

    https://syed.ai/diagnose.php?key=YOUR-VALUE

It runs every check in order and stops at the first broken one — PHP version and
extensions, where it looked for the config and whether it found it, whether the
keys are right, whether the app password is the right shape, whether Gmail's
ports are reachable, and finally whether your credentials actually sign in. Then
it offers a button to send one real test email.

It never prints your password — only whether one is set and how long it is.

**Delete `diagnose.php` once the form works.** It is a setup tool; there is no
reason to leave a server-inspection page on a live domain.

### The config path, which is the usual culprit

Hostinger lays sites out two ways depending on whether the domain is primary or
an add-on, so "one level above the web root" is not one fixed path:

    /home/uXXXXXXXXX/domains/syed.ai/public_html/    ← add-on / newer layout
    /home/uXXXXXXXXX/public_html/                    ← primary domain / older layout

`send.php` now looks in **five** places rather than one, so the config is found
wherever you reasonably put it. `diagnose.php` prints the exact list it searched,
in order, with `← FOUND` against the one it used. If none are found, upload the
config to the **first** path it lists.

---

## If Gmail refuses to authenticate

`diagnose.php` now prints the actual SMTP conversation with the credentials
redacted, and the response code is the whole answer:

| Code | Meaning | Fix |
|---|---|---|
| **534** or "Application-specific password required" | You used your normal Google password. | Create an app password at <https://myaccount.google.com/apppasswords>. |
| **535 ... Username and Password not accepted** | The pair was rejected. | See the four causes below, in order. |
| **Could not connect to SMTP host** | Port blocked, not credentials. | Set `'smtp_port' => 587`. |

### The four causes of a 535, in order

1. **The app password was created on a different Google account.** By far the
   most common. If your config authenticates as `syed@syed.ai`, you must be
   signed in *as that exact address* when you generate it. Generating one on a
   personal `@gmail.com` produces a valid password that will never work here.
2. **It was mistyped or partly pasted.** It is exactly 16 characters.
   `diagnose.php` counts them for you.
3. **It has been revoked.** Delete it on Google's page and create a new one.
4. **Workspace policy.** An admin can block app passwords, and Google groups
   SMTP with IMAP and POP — so if IMAP/POP access is off for the user, SMTP
   sending can fail too. Admin console → Apps → Google Workspace → Gmail →
   End User Access. You are almost certainly the admin on syed.ai.

Worth knowing: app passwords **are** still supported. Google shut down basic
authentication for "less secure apps" on 14 March 2025, but app passwords were
explicitly kept as the exception. If someone tells you Gmail SMTP no longer
works with a password, they are describing the wrong change.

---

## Switching SMTP provider, if Gmail stays stubborn

Nothing in the code is Gmail-specific — it is ordinary authenticated SMTP. Four
config lines and you are on a different provider. Two that work immediately:

**Brevo** — 300 emails a day free, no DNS setup needed to start.

    'smtp_host' => 'smtp-relay.brevo.com',
    'smtp_port' => 587,
    'smtp_user' => 'your-brevo-login@example.com',
    'smtp_pass' => 'the SMTP key from Brevo, not your password',

**Resend** — 3,000 a month free, better deliverability, wants domain verification.

    'smtp_host' => 'smtp.resend.com',
    'smtp_port' => 465,
    'smtp_user' => 'resend',
    'smtp_pass' => 're_your_api_key',

With either, leave `from_email` as an address on a domain that provider is
allowed to send for. On Brevo that means verifying `syed.ai` as a sender domain
(one TXT record); until you do, use the address you signed up with.

This is not a downgrade. A scoped, revocable API key is arguably a better
credential than a mailbox app password — it can only send, and killing it
affects nothing else.

---

## When mail fails, the lead is not lost

The endpoint writes every submission to the spool file named in your config
**before** it decides what to tell the visitor. So a spell of broken SMTP costs
you the email, not the lead.

What the visitor sees in that case is a normal thank-you, not an error. That is
deliberate. An error message invites a retry, the retry fails the same way, and
the person leaves believing the business cannot take a message — you lose the
enquiry twice over. The failure is yours to fix, and it belongs in the log and
in `diagnose.php`, which is where it goes: run the diagnostic and it counts the
stranded leads, shows the three most recent with their timestamps and email
addresses, and tells you where the file is.

**So: after any stretch where mail was broken, open `diagnose.php` and check
that line.** Read the leads, reply by hand, then empty the file.

Two things do still surface as errors, because both are true failures the
visitor needs to know about: the relay and the disk failing together, and the
browser being unable to reach the server at all. Both point the person at
LinkedIn instead.

With `'debug' => true` the JSON also carries a `detail` field with what SMTP
actually said — invisible on the page, one line in the browser console. Turn
debug off once the form works, and delete `diagnose.php` from the server.

### The chat widget, when sending fails

It offers **Try again** once. After a second failure it stops offering it and
hands over the LinkedIn route instead, because a third attempt against a relay
that is down is just a wall to walk into. Only one error line ever appears in
the transcript — a repeat replaces it rather than stacking underneath.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `500` on submit, blank page | PHPMailer not installed. Check `public_html/vendor/` or `public_html/PHPMailer/` exists. hPanel → Files → Error log will name the file. |
| `The mail library is not installed on this server yet.` | Same, and now `send.php` is telling you directly. Redo §2. |
| `Server not configured.` | `syedai-config.php` is missing or in the wrong place. It goes **beside** `public_html`, not inside it. |
| `Bad origin` from a real browser | `allowed_origins` does not match the URL you are actually on. Include both `https://syed.ai` and `https://www.syed.ai`. |
| `SMTP connect() failed` | Almost always the app password: it was typed rather than pasted, or it is the Google account password instead. Regenerate it. Nothing needs to change on Hostinger — ports 465 and 587 are open. |
| `Could not authenticate` | 2-Step Verification got turned off, or the app password was revoked. |
| App passwords unavailable in Google | Advanced Protection is on, or a Workspace admin disabled them. Two ways out: switch to OAuth2 (PHPMailer supports `XOAUTH2` — swap `SMTPAuth`/`Password` for a token provider, everything else stays), or on Workspace ask the admin to enable the **SMTP relay service** at `smtp-relay.gmail.com`, which is IP-authenticated and needs no password. |
| Mail arrives in your own spam | You are sending to yourself from yourself, which some filters dislike. Add a Gmail filter: from `you@gmail.com` with subject `New brief` → never send to spam, apply label. |
| Works, then stops after a few hundred | Gmail's daily cap: 500 messages on a personal account, 2,000 on Workspace. For a contact form you will not reach it; if you somehow do, move to a transactional API. |
| Port 465 seems blocked | Set `'smtp_port' => 587` in the config. `send.php` switches to STARTTLS automatically. |

**Never** "fix" a TLS handshake error by adding `SMTPOptions` with
`allow_self_signed` or `verify_peer => false`. That advice is all over Stack
Overflow and it silently turns off certificate validation, which is the thing
protecting the password in transit.

---

## What this is not

It is not a CRM and it does not store submissions. `form-spool.jsonl` only
receives a lead if SMTP fails, so nothing is lost during an outage — check it
after any mail incident, then empty it.

---

## Alternatives, and why this one

| Option | Verdict |
|---|---|
| **PHPMailer + Gmail SMTP** (this) | Actively maintained (7.1.1, May 2026), runs on every Hostinger plan, header-injection protection built in, no third party ever sees a lead, no DNS work because Google signs it, and revoking the app password cuts it off instantly. |
| Transactional API — Resend, Postmark, SES | The one genuinely more secure option: a scoped, send-only, instantly revocable API key instead of a mailbox password, and better deliverability at volume. Swap the PHPMailer block for one HTTPS POST. A few dollars a month, one more vendor. |
| Hostinger's own email + PHP `mail()` | Avoid. Unauthenticated `mail()` is capped at 10 per minute and 100 per day on Hostinger, and deliverability is poor. Hostinger's own documentation steers you to SMTP. |
| Hosted form backends — Formspree, Basin, Getform | Fastest to set up; your leads live on their servers and you inherit their breach surface. |
| Self-hosted Formspree | Dead. Archived July 2023, still on Python 2.7. |
| FormBee and similar | Needs Docker, Node and Postgres. Will not run on shared hosting. |
