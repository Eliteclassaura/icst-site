<?php
/**
 * syed.ai — mail configuration  (Gmail SMTP)
 *
 * UPLOAD THIS FILE ONE DIRECTORY ABOVE YOUR WEB ROOT, renamed:
 *
 *     /home/youraccount/syedai-config.php      ← here
 *     /home/youraccount/public_html/send.php   ← the endpoint reads it from ../
 *
 * If it cannot go above the web root on your host, put it in a folder with a
 * .htaccess containing "Require all denied" — but above the root is better.
 * Never commit the real file to git.
 */

return [

    /* ── Where the brief lands ───────────────────────────────────────── */
    'to_email'   => 'YOUR-ADDRESS@gmail.com',   // or you@syed.ai on Workspace
    'to_name'    => 'Syed Abdul',

    /* ── Who it comes from ────────────────────────────────────────────
       WITH GMAIL, THIS MUST MATCH 'smtp_user' BELOW.
       Gmail rewrites the From header to the authenticated account unless the
       address is a verified "Send mail as" alias — and Google is retiring
       third-party send-as in January 2027. Setting From = the authenticating
       account is the one configuration that cannot break: Google signs it with
       its own DKIM, so it passes DMARC everywhere.
       The visitor's address is never used here. It goes in Reply-To, so
       hitting Reply in Gmail answers them directly.                        */
    'from_email' => 'YOUR-ADDRESS@gmail.com',
    'from_name'  => 'syed.ai contact form',

    /* ── Gmail SMTP ───────────────────────────────────────────────────
       Host and port are fixed. 465 is implicit TLS and is what you want;
       587 (STARTTLS) also works if your host blocks 465 outbound.

       'smtp_pass' is a 16-character APP PASSWORD, not your Google password:
         1. Turn on 2-Step Verification: https://myaccount.google.com/security
         2. Create the app password:     https://myaccount.google.com/apppasswords
         3. Paste it below — spaces optional, they are ignored.
       Google removed plain-password ("less secure app") access in 2022, so an
       app password is the only password-based route in. Revoking it from that
       same page instantly kills this form's access and nothing else.

       Limits: 500 messages/day on a personal Gmail, 2,000/day on Workspace.
       Note: app passwords are unavailable on accounts with Advanced Protection,
       and Workspace admins can disable them — see README-form.md for the
       OAuth2 route if that applies to you.                                 */
    'smtp_host'  => 'smtp.gmail.com',
    'smtp_port'  => 465,
    'smtp_user'  => 'YOUR-ADDRESS@gmail.com',   // must equal 'from_email'
    'smtp_pass'  => 'xxxx xxxx xxxx xxxx',      // the 16-character app password

    /* ── Cloudflare Turnstile ─────────────────────────────────────────
       Free, unlimited verifications, no personal data collected.
       Leave empty to disable; the honeypot and dwell-time checks still run.
       https://dash.cloudflare.com → Turnstile                             */
    'turnstile_secret' => '',

    /* ── Abuse control ───────────────────────────────────────────────── */
    'allowed_origins'   => ['https://syed.ai', 'https://www.syed.ai'],

    /* TRUE because Cloudflare is proxying syed.ai. This matters: without it
       every visitor appears to arrive from Cloudflare's own IP, they all share
       one rate-limit bucket, and the fifth send of the hour locks out everybody.
       Set it back to false only if you stop proxying through Cloudflare.

       (Original note: only set this true if Cloudflare or another proxy is
       genuinely in front It tells the rate limiter to read CF-Connecting-IP instead
       of the socket address. Leave it false on plain Hostinger: the header is
       client-supplied, so trusting it when nothing sets it lets an attacker
       mint a fresh rate-limit bucket on every request. */
    'behind_cloudflare' => true,
    'rate_dir'          => __DIR__ . '/form-rate',  // outside the web root
    'rate_max_requests' => 20,                      // any POST, per IP, per window
    'rate_max_sends'    => 5,                       // successful sends, per IP, per window
    'rate_window'       => 3600,                    // one hour

    /* A ceiling across ALL visitors, so a botnet cannot burn your Gmail quota
       (2,000/day on Workspace). Set 0 to disable. */
    'global_max_per_day' => 200,

    /* The same message from the same address inside this many seconds is
       treated as a duplicate and refused. */
    'dedupe_window'      => 900,

    /* Show PHP error detail in the browser. Priceless while you are setting up,
       an information leak once you are live. Turn it off when the form works. */
    'debug'              => true,

    /* ── Failure spool: leads are appended here if SMTP is down ──────── */
    'spool_file' => __DIR__ . '/form-spool.jsonl',

    /* ── The newsletter list ─────────────────────────────────────────────
       An append-only log of every signup, confirmation and unsubscribe. It
       lives HERE, above the web root, next to this file — there is no URL
       that can reach it. Back this up: it is the least replaceable thing the
       site holds, and unlike the pages it cannot be regenerated. */
    'subscribers_file' => __DIR__ . '/subscribers.jsonl',

    /* Signs the confirm and unsubscribe links. Nothing is stored server-side,
       so this secret is the only thing standing between a stranger and the
       ability to confirm or remove any address they can guess.

       Generate one and never change it afterwards — every link already sitting
       in somebody's inbox is signed with the current value, and rotating this
       invalidates all of them at once:

           php -r "echo bin2hex(random_bytes(32)), PHP_EOL;"

       If you leave this empty the code derives a fallback from your SMTP
       password and paths, which works but means changing your app password
       silently breaks every outstanding confirmation link. Set it properly. */
    'token_secret' => 'PASTE-64-RANDOM-HEX-CHARACTERS-HERE',

    /* The public origin, used to build those links. No trailing slash. Must be
       the canonical host — a link built on the wrong one lands on a redirect,
       and some mail clients will not follow it. */
    'site_url' => 'https://syed.ai',
];
