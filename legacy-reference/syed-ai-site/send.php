<?php
/**
 * syed.ai — contact endpoint
 * ---------------------------------------------------------------------------
 * Accepts the contact form, verifies it is not a bot, and relays it over
 * authenticated SMTP. Nothing is stored in a database and no third party ever
 * sees the lead.
 *
 * Requires: PHP 8.0+ and PHPMailer (composer require phpmailer/phpmailer)
 * Config:   ../syedai-config.php — ABOVE the web root. See _private/config.example.php
 *
 * Design rules, and why:
 *  - Credentials live outside the web root. A misconfigured server that stops
 *    executing PHP then serves this file as plain text and leaks nothing.
 *  - The From address is always our own domain, so SPF/DKIM/DMARC align. The
 *    visitor's address goes in Reply-To only. Putting a visitor address in From
 *    is both a spoofing vector and the fastest way into a spam folder.
 *  - Every value that could reach a mail header is stripped of CR/LF.
 *  - Errors returned to the browser are generic. Detail goes to the log only.
 */

declare(strict_types=1);

define('SYEDAI_ENDPOINT', true);

/* This endpoint must ALWAYS answer with JSON, including when PHP itself falls
   over. Without this, a warning or a fatal produces an HTML error page, the
   browser cannot parse it, and the visitor sees a useless "that did not send"
   with nothing in it to act on. */
ini_set('display_errors', '0');
error_reporting(E_ALL);

/* Error detail is priceless while you are setting up and an information leak
   once you are live. Controlled by 'debug' in the config; default off. */
function syedai_debug(): bool {
    static $d = null;
    if ($d !== null) { return $d; }
    $d = false;
    foreach (syedai_config_paths() as $p) {
        if (is_readable($p)) { $c = @include $p; $d = is_array($c) && !empty($c['debug']); break; }
    }
    return $d;
}

set_exception_handler(static function (Throwable $e): void {
    error_log('[syed.ai form] uncaught: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
    }
    echo json_encode(['ok' => false,
        'message' => 'The server hit an error. Open diagnose.php for the detail.',
        'detail'  => syedai_debug()
            ? basename($e->getFile()) . ':' . $e->getLine() . ' — ' . $e->getMessage()
            : null]);
    exit;
});

set_error_handler(static function (int $no, string $str, string $file = '', int $line = 0): bool {
    if (!(error_reporting() & $no)) { return false; }
    throw new ErrorException($str, 0, $no, $file, $line);
});

register_shutdown_function(static function (): void {
    $e = error_get_last();
    if ($e && in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        error_log('[syed.ai form] fatal: ' . $e['message'] . ' @ ' . $e['file'] . ':' . $e['line']);
        if (!headers_sent()) {
            http_response_code(500);
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode(['ok' => false,
            'message' => 'The server hit a fatal error. Open diagnose.php for the detail.',
            'detail'  => syedai_debug()
                ? basename($e['file']) . ':' . $e['line'] . ' — ' . $e['message']
                : null]);
    }
});

/* ── 1. Load config from above the web root ──────────────────────────── */
/* Hostinger lays sites out two ways depending on whether the domain is the
   primary one or an add-on, so "one level above the web root" is not a single
   path. Rather than making that your problem, look in every sensible place. */
function syedai_config_paths(): array {
    $docroot = rtrim((string)($_SERVER['DOCUMENT_ROOT'] ?? ''), '/');
    return array_values(array_unique(array_filter([
        __DIR__ . '/../syedai-config.php',              // …/domains/site/  ← documented
        __DIR__ . '/../../syedai-config.php',           // one level further up
        $docroot ? $docroot . '/../syedai-config.php' : '',
        $docroot ? dirname($docroot) . '/../syedai-config.php' : '',
        __DIR__ . '/_secure/syedai-config.php',         // hosts that forbid writing above the root
        __DIR__ . '/syedai-config.php',                 // last resort; .htaccess denies it
    ])));
}
$CONFIG_PATH = '';
foreach (syedai_config_paths() as $candidate) {
    if (is_readable($candidate)) { $CONFIG_PATH = $candidate; break; }
}
if ($CONFIG_PATH === '') {
    error_log('[syed.ai form] config not found. Looked in: ' . implode(' | ', syedai_config_paths()));
    respond(500, 'Server not configured — the mail config was not found. Run diagnose.php to see where it was looked for.');
}
$cfg = require $CONFIG_PATH;
if (!is_array($cfg)) {
    error_log('[syed.ai form] config at ' . $CONFIG_PATH . ' did not return an array');
    respond(500, 'The mail config is malformed. Run diagnose.php.');
}

/* PHPMailer, however it got here. Composer on Premium+ (composer2 require
   phpmailer/phpmailer); on the Single plan there is no SSH, so the three
   source files are uploaded to PHPMailer/ by hand instead. */
if (is_readable(__DIR__ . '/vendor/autoload.php')) {
    require __DIR__ . '/vendor/autoload.php';
} elseif (is_readable(__DIR__ . '/PHPMailer/PHPMailer.php')) {
    require __DIR__ . '/PHPMailer/Exception.php';
    require __DIR__ . '/PHPMailer/PHPMailer.php';
    require __DIR__ . '/PHPMailer/SMTP.php';
} else {
    error_log('[syed.ai form] PHPMailer not found — see _private/README-form.md step 1');
    respond(500, 'The mail library is not installed on this server yet.');
}

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\SMTP;
use PHPMailer\PHPMailer\Exception as MailException;

/* Email checking and the subscriber store. Both are optional at the file level
   so that a missed upload degrades to the old behaviour — a working form
   without the list — rather than a 500 on every submission. */
$hasChecks = is_readable(__DIR__ . '/email-check.php');
$hasSubs   = is_readable(__DIR__ . '/subs.php');
if ($hasChecks) { require_once __DIR__ . '/email-check.php'; }
if ($hasSubs && $hasChecks) { require_once __DIR__ . '/subs.php'; }

/* ── 2. Method, origin and content type ──────────────────────────────── */
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('X-Frame-Options: DENY');
header('Cache-Control: no-store');
header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");

/* Read the method from the request line only. Ignore X-HTTP-Method-Override
   and friends — they are how a GET gets laundered into a POST. */
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { respond(405, 'Method not allowed.'); }

/* Only the two encodings a real <form> produces. A JSON or XML body means
   something other than this form is calling, which is not a case to serve. */
$ctype = strtolower(explode(';', (string)($_SERVER['CONTENT_TYPE'] ?? ''))[0]);
if (!in_array($ctype, ['application/x-www-form-urlencoded', 'multipart/form-data'], true)) {
    respond(415, 'Unsupported content type.');
}

/* A brief is a few kilobytes. Anything past 64 KB is an attempt to make the
   server do work, and PHP has already buffered it by the time we look. */
if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 65536) { respond(413, 'That is too large.'); }

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin === '' && !empty($_SERVER['HTTP_REFERER'])) {
    $p = parse_url($_SERVER['HTTP_REFERER']);
    $origin = isset($p['scheme'], $p['host']) ? $p['scheme'] . '://' . $p['host'] : '';
}
if (!in_array($origin, $cfg['allowed_origins'], true)) { respond(403, 'Bad origin.'); }

/* ── 3. Rate limit, per IP, file-based (no database needed) ───────────
   Two tiers on purpose. The request cap absorbs abuse; the send cap is
   what actually protects the mailbox. Counting only successful sends
   against the low cap means a visitor who mistypes their address four
   times is not locked out of the form.                                 */
$ip = client_ip($cfg);
if (rate_count($ip, 'req', $cfg) >= $cfg['rate_max_requests']
 || rate_count($ip, 'send', $cfg) >= $cfg['rate_max_sends']) {
    respond(429, 'Too many messages from this connection. Try again later.');
}
rate_hit($ip, 'req', $cfg);

/* ── 4. Bot checks: honeypot, dwell time, Turnstile ──────────────────── */
if (trim((string)($_POST['website_url'] ?? '')) !== '') { respond(200, 'Thanks — message received.'); } // silent drop
$dwell = time() - (int)($_POST['t'] ?? 0);
if ($dwell < 3 || $dwell > 7200) { respond(400, 'Please try that again.'); }

if (!empty($cfg['turnstile_secret'])) {
    if (!turnstile_ok((string)($_POST['cf-turnstile-response'] ?? ''), $cfg['turnstile_secret'], $ip)) {
        respond(400, 'Could not verify you are human. Please reload and try again.');
    }
}

/* ── 5. Validate and normalise ───────────────────────────────────────── */
/**
 * One reader for every field. It refuses arrays (name[]=a&name[]=b is how a
 * string parameter becomes an array and blows up everything downstream),
 * drops null bytes and C0 control characters, normalises whitespace runs,
 * and truncates on characters rather than bytes so multibyte input cannot be
 * cut mid-sequence.
 */
$f = static function (string $k, int $max = 300, bool $multiline = false): string {
    $v = $_POST[$k] ?? '';
    if (!is_string($v)) { return ''; }
    if (!mb_check_encoding($v, 'UTF-8')) { return ''; }
    $v = strip_tags($v);
    // Single-line fields lose newlines outright. Without this an attacker can
    // forge label lines ("Verified: YES") inside the message I read — not
    // header injection, but the same social-engineering payoff.
    $v = $multiline
        ? preg_replace(['/\r\n?/', '/\n{3,}/'], ["\n", "\n\n"], $v)
        : preg_replace('/[\r\n]+/', ' ', $v);
    $v = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', (string)$v) ?? '';
    $v = preg_replace('/[ \t]{2,}/', ' ', $v) ?? '';
    return mb_substr(trim($v), 0, $max);
};

$name  = $f('name', 120);
$email = $f('email', 254);
$brief = $f('brief', 5000, true);

$isNews = ($_POST['mode'] ?? '') === 'newsletter';

$errors = [];
if ($name === '' && !$isNews)  { $errors[] = 'name'; }
if (!filter_var($email, FILTER_VALIDATE_EMAIL)
    || strlen($email) > 254
    || preg_match('/[\r\n,;<>]/', $email)) { $errors[] = 'email'; }
if (mb_strlen($brief) < 10 && !$isNews) { $errors[] = 'brief'; }
if ($errors) { respond(422, 'Please check the highlighted fields.', ['fields' => $errors]); }

/* The deeper address check. A syntactically valid address that nobody can
   receive mail at is worse than a rejected one: the signup looks successful,
   the confirmation bounces, and the bounce costs sending reputation on a
   domain whose whole job is landing in inboxes.
   The typo branch is the valuable one — someone who types "gmial.com" is a
   real subscriber about to be lost silently, and a suggestion recovers them. */
$emailCheck = ['ok' => true, 'verdict' => 'valid', 'role' => false, 'suggestion' => null];
if ($hasChecks) {
    /* email_ok=1 is the visitor answering "yes, I meant that domain" to a typo
       prompt. It only ever relaxes the typo check — syntax, disposable domains
       and undeliverable domains are not overridable, because no answer from the
       sender makes those addresses work. */
    $emailCheck = ec_check($email, true, ($_POST['email_ok'] ?? '') === '1');
    if (!$emailCheck['ok']) {
        respond(422, $emailCheck['reason'], [
            'fields'     => ['email'],
            'verdict'    => $emailCheck['verdict'],
            'suggestion' => $emailCheck['suggestion'],
        ]);
    }
}

/* Abuse screening. Newsletter signups skip the content checks — there is no
   message to score — but still face the caps and the duplicate check. */
$why = [];
$score = $isNews ? 0 : spam_score($name, $email, $brief, $f('company', 160), $f('site', 200), $why);
if ($score >= 5) {
    error_log('[syed.ai form] refused, spam score ' . $score . ' (' . implode('; ', $why) . ') from ' . $ip);
    respond(200, 'Thanks — message received.');   // silent drop; a bot learns nothing
}

if (duplicate_recently($email . '|' . mb_substr($brief, 0, 400), $cfg)) {
    /* A repeat of the note that just arrived is not a failure and must not be
       reported as one. Telling the visitor "that did not send" when it did is
       how a working form ends up looking broken — and it is what makes someone
       press send a third and fourth time. Acknowledge it and drop it silently. */
    respond(200, 'That is the same note you just sent — it is already with me.', ['duplicate' => true]);
}

if (global_cap_hit($cfg)) {
    error_log('[syed.ai form] global daily cap reached');
    respond(503, 'The form has taken an unusual amount of traffic today and is paused. Try again tomorrow, or reach me on Instagram.');
}

$mode = $f('mode', 20);
$mode = in_array($mode, ['brief', 'newsletter', 'roadmap'], true) ? $mode : 'brief';

$fields = [
    'Name'            => $name,
    'Email'           => $email,
    'Company'         => $f('company', 160) ?: '—',
    'Website'         => $f('site', 200) ?: '—',
    'Monthly revenue' => $f('revenue', 60),
    'Budget'          => $f('budget', 60),
    'Timeline'        => $f('timeline', 60),
    'Focus'           => $f('focus', 120),
];
$src = $f('source', 20);
$source = ['chat' => 'chat widget', 'newsletter' => 'newsletter signup',
           'scorecard' => 'scorecard'][$src] ?? 'brief form';

/* ── 6. Compose. Headers get header-safe values only. ────────────────── */
/* Everything the page can honestly tell me about the visit. None of it is
   tracking — it is the state of their own browser at the moment they hit send,
   and it is what turns "someone enquired" into "someone who read the pricing
   twice arrived from LinkedIn on a phone". */
$ctx = [
    'Page / section' => $f('page', 120) ?: '—',
    'Journey'        => $f('journey', 300) ?: '—',
    'Time on page'   => $f('dwell', 20) ? $f('dwell', 20) . 's' : '—',
    'Scorecard'      => $f('score', 40) ?: 'not taken',
    'Arrived from'   => $f('ref', 200) ?: 'direct or unknown',
    'Campaign'       => $f('utm', 200) ?: '—',
    'Screen'         => $f('screen', 40) ?: '—',
    'Language'       => $f('lang', 40) ?: '—',
    'Timezone'       => $f('tz', 60) ?: '—',
];
if ($score > 0) { $ctx['Spam score'] = $score . '/5 — ' . implode('; ', $why); }

/* ── 5b. The subscriber list ─────────────────────────────────────────── */
/* Recorded before a single email is sent, because the list is the asset. If
   SMTP is broken the subscriber is still on it; if the write fails, that is
   worth knowing about, and the signup is refused rather than silently lost. */
$subName  = $isNews ? $name : '';
$subState = null;
if ($isNews && $hasSubs && $hasChecks) {
    [$subState, $subRec] = subs_signup($cfg, $email, $subName, [
        'ip'       => $ip,
        'ua'       => (string)($_SERVER['HTTP_USER_AGENT'] ?? ''),
        'source'   => $src ?: 'newsletter',
        'page'     => $f('page', 120),
        'referrer' => $f('ref', 200),
        'campaign' => $f('utm', 200),
        'tz'       => $f('tz', 60),
        'screen'   => $f('screen', 40),
        'lang'     => $f('lang', 40),
        'role'     => (bool)($emailCheck['role'] ?? false),
    ]);

    if ($subState === 'failed') {
        error_log('[syed.ai form] could not write the subscriber file at ' . subs_file($cfg));
        respond(500, 'I could not record that subscription. Try again in a minute — and if it '
            . 'keeps failing, send a brief instead and I will add you by hand.');
    }

    /* Already confirmed: say so and send nothing. Re-mailing a confirmed
       address on every repeat submit is how a signup form becomes a way to
       mailbomb somebody. */
    if ($subState === 'confirmed') {
        rate_hit($ip, 'send', $cfg);
        respond(200, 'You are already on the list — the next issue is Tuesday.', ['already' => true]);
    }
}

$body = '';
foreach ($fields as $k => $v) { $body .= str_pad($k . ':', 18) . $v . "\n"; }
$body .= "\n--- the gap, in their words ---\n" . $brief . "\n--- end ---\n\n"
       . "CONTEXT\n";
foreach ($ctx as $k => $v) { $body .= str_pad($k . ':', 18) . $v . "\n"; }
$body .= "\n" . str_repeat('-', 56) . "\n"
       . 'Sent ' . gmdate('Y-m-d H:i') . ' UTC from the syed.ai ' . $source . ".\n"
       . 'IP ' . $ip . ' · ' . hdr($f('ua', 200) ?: ($_SERVER['HTTP_USER_AGENT'] ?? '—')) . "\n";

$mail = new PHPMailer(true);
try {
    $mail->isSMTP();
    $mail->Host          = $cfg['smtp_host'];
    $mail->Port          = $cfg['smtp_port'];
    $mail->SMTPAuth      = true;
    $mail->Username      = $cfg['smtp_user'];
    // Gmail app passwords are shown in groups of four; the spaces are cosmetic
    // and Google rejects them, so strip whitespace rather than making the
    // person remember to.
    $mail->Password      = smtp_pass_clean((string)$cfg['smtp_pass']);
    // Implicit TLS on 465, STARTTLS on 587. Certificate verification stays ON —
    // never add SMTPOptions => allow_self_signed to "fix" a handshake error.
    $mail->SMTPSecure    = $cfg['smtp_port'] === 465
        ? PHPMailer::ENCRYPTION_SMTPS
        : PHPMailer::ENCRYPTION_STARTTLS;
    $mail->SMTPAutoTLS   = true;
    $mail->Timeout       = 15;
    $mail->CharSet       = PHPMailer::CHARSET_UTF8;

    // From must be the authenticating account (Gmail rewrites anything else
    // that is not a verified alias). Google DKIM-signs it, so DMARC passes.
    $mail->setFrom($cfg['from_email'], $cfg['from_name']);
    $mail->addAddress($cfg['to_email'], $cfg['to_name']);
    $mail->addReplyTo($email, hdr($name));                   // the visitor, reply-to only
    $who = $fields['Company'] !== '—' ? $fields['Company'] : ($name !== '' ? $name : $email);
    $mail->Subject = hdr('[' . $source . '] ' . ($mode === 'newsletter' ? 'Subscriber' : 'New brief') . ' — ' . $who);
    $mail->isHTML(false);
    $mail->Body    = $body;

    $mail->send();

    /* The lead is delivered. Everything after this point is slow — a site scan
       plus two more SMTP connections — and the visitor should not be sitting on
       a spinner for it. Close the response now and finish the work in the
       background, which is also what stops a proxy in front of the site from
       returning a 502 while PHP is still busy. */
    $followUpFailed = false;
    if ($mode === 'roadmap' || $mode === 'newsletter') {
        rate_hit($ip, 'send', $cfg);
        syedai_finish_response(200, $mode === 'roadmap'
            ? 'Done — your roadmap is on its way to ' . $email . '. Give it a minute.'
            : ($subState === 'pending'
                ? 'That confirmation link is on its way again — check ' . $email . ', including spam.'
                : 'Almost there. Click the link in the email I just sent to ' . $email . ' and you are on.'));
        // Past this line nothing we say reaches the browser. Take the time we need.
        @set_time_limit(120);
        ignore_user_abort(true);
    }
    try {

    /* A subscriber who just handed over their address should hear back within
       seconds. One email, no sequence behind it. */
    /* roadmap.php carries both the plan builder and the welcome email. A file
       can easily be missed in an FTP upload, and `require` on a missing file is
       a fatal that no catch block can rescue — so check first, and degrade to
       "lead captured, courtesy email skipped" rather than dying. */
    $rmReady = is_readable(__DIR__ . '/roadmap.php');
    if ($rmReady) { require_once __DIR__ . '/roadmap.php'; }
    if (($mode === 'roadmap' || $mode === 'newsletter') && !$rmReady) {
        error_log('[syed.ai form] roadmap.php is missing from ' . __DIR__ . ' — follow-up email skipped');
        throw new RuntimeException('roadmap.php not deployed');
    }

    if ($mode === 'newsletter' && function_exists('rm_confirm_html')) {
        /* Double opt-in. The subscriber was recorded as `pending` before the
           response closed; what goes out now is a confirmation request, not a
           welcome. The welcome is sent by confirm.php once somebody has proved
           they can actually receive mail at that address.

           This is the only check that establishes an address is real AND
           belongs to the person who typed it. Syntax, MX and disposable-domain
           checks all pass happily for dana@somebodyelse.com. */
        $token = subs_token($cfg, $email, 'confirm');
        $base  = rtrim((string)($cfg['site_url'] ?? 'https://syed.ai'), '/');
        $link  = $base . '/confirm.php?a=confirm&e=' . rawurlencode($email) . '&t=' . $token;
        $unsub = $base . '/confirm.php?a=unsub&e=' . rawurlencode($email)
               . '&t=' . subs_token($cfg, $email, 'unsub');

        $w = new PHPMailer(true);
        $w->isSMTP();
        $w->Host = $cfg['smtp_host']; $w->Port = $cfg['smtp_port'];
        $w->SMTPAuth = true; $w->Username = $cfg['smtp_user'];
        $w->Password = smtp_pass_clean((string)$cfg['smtp_pass']);
        $w->SMTPSecure = $cfg['smtp_port'] === 465 ? PHPMailer::ENCRYPTION_SMTPS : PHPMailer::ENCRYPTION_STARTTLS;
        $w->Timeout = 20; $w->CharSet = PHPMailer::CHARSET_UTF8;
        $w->setFrom($cfg['from_email'], 'The Answer Layer');
        $w->addAddress($email);
        $w->addReplyTo($cfg['to_email'], $cfg['to_name']);
        /* Gmail and Yahoo's bulk-sender rules expect these on anything
           list-like, and a one-click header is cheaper than a spam report. */
        $w->addCustomHeader('List-Unsubscribe', '<' . $unsub . '>');
        $w->addCustomHeader('List-Unsubscribe-Post', 'List-Unsubscribe=One-Click');
        $w->Subject = 'One click to confirm — The Answer Layer';
        $w->isHTML(true);
        $w->Body    = rm_confirm_html((string)($subName ?? ''), $link);
        $w->AltBody = rm_confirm_text((string)($subName ?? ''), $link);
        $w->send();
    }

    /* If they asked for the plan, build it and send it to them as well. This
       happens after the notification so a failure here never loses the lead. */
    if ($mode === 'roadmap' && function_exists('rm_scan')) {
        $scan = rm_scan($fields['Website'] !== '—' ? $fields['Website'] : '');
        $find = rm_findings($scan, ['focus' => $fields['Focus'], 'budget' => $fields['Budget']]);
        $plan = rm_plan($find, ['focus' => $fields['Focus'], 'budget' => $fields['Budget']]);

        $out = new PHPMailer(true);
        $out->isSMTP();
        $out->Host       = $cfg['smtp_host'];
        $out->Port       = $cfg['smtp_port'];
        $out->SMTPAuth   = true;
        $out->Username   = $cfg['smtp_user'];
        $out->Password   = smtp_pass_clean((string)$cfg['smtp_pass']);
        $out->SMTPSecure = $cfg['smtp_port'] === 465 ? PHPMailer::ENCRYPTION_SMTPS : PHPMailer::ENCRYPTION_STARTTLS;
        $out->Timeout    = 20;
        $out->CharSet    = PHPMailer::CHARSET_UTF8;
        $out->setFrom($cfg['from_email'], $cfg['from_name']);
        $out->addAddress($email, hdr($name));
        $out->addReplyTo($cfg['to_email'], $cfg['to_name']);
        $out->Subject = hdr('Your AI visibility roadmap — ' . ($fields['Company'] !== '—' ? $fields['Company'] : $name));
        $out->isHTML(true);
        $out->Body    = rm_email_html($name, $fields, $scan, $find, $plan);
        $out->AltBody = rm_email_text($name, $fields, $scan, $find, $plan);
        $out->send();

        // and a copy of what they were told, so the reply can pick up from it
        $cc = new PHPMailer(true);
        $cc->isSMTP();
        $cc->Host = $cfg['smtp_host']; $cc->Port = $cfg['smtp_port'];
        $cc->SMTPAuth = true; $cc->Username = $cfg['smtp_user'];
        $cc->Password = smtp_pass_clean((string)$cfg['smtp_pass']);
        $cc->SMTPSecure = $cfg['smtp_port'] === 465 ? PHPMailer::ENCRYPTION_SMTPS : PHPMailer::ENCRYPTION_STARTTLS;
        $cc->Timeout = 20; $cc->CharSet = PHPMailer::CHARSET_UTF8;
        $cc->setFrom($cfg['from_email'], $cfg['from_name']);
        $cc->addAddress($cfg['to_email'], $cfg['to_name']);
        $cc->addReplyTo($email, hdr($name));
        $cc->Subject = hdr('[roadmap sent] ' . ($fields['Company'] !== '—' ? $fields['Company'] : $name) . ' — ' . rm_headline($find));
        $cc->isHTML(false);
        $cc->Body = rm_email_text($name, $fields, $scan, $find, $plan);
        $cc->send();
    }

    } catch (MailException|Throwable $fu) {
        $followUpFailed = true;
        error_log('[syed.ai form] follow-up email failed: ' . $fu->getMessage());
    }
} catch (MailException|Throwable $e) {
    error_log('[syed.ai form] ' . $e->getMessage());

    /* Keep the lead even when the relay is down. This is the whole point of the
       spool: the visitor's answers are already on disk before we decide what to
       tell them. */
    $spooled = @file_put_contents(
        $cfg['spool_file'],
        json_encode(['ts' => gmdate('c'), 'ip' => $ip, 'fields' => $fields, 'brief' => $brief],
                    JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES) . "\n",
        FILE_APPEND | LOCK_EX
    ) !== false;

    /* A captured lead is a success from where the visitor is standing, and
       saying otherwise costs real leads: an error invites a retry, the retry
       fails the same way, and the person leaves believing the business cannot
       take a message. The failure that matters is mine, and it belongs in the
       log and in diagnose.php — not in the visitor's face.

       With debug on, the JSON still carries what SMTP actually said, so a
       browser console tells you the truth while the page stays calm. */
    if ($spooled) {
        rate_hit($ip, 'send', $cfg);
        respond(200,
            $mode === 'roadmap'
                ? 'Got it — your answers are recorded and your roadmap follows by hand within one business day.'
                : ($mode === 'newsletter'
                    ? 'You are recorded. The confirmation email is delayed — I will send it by hand.'
                    : 'Thanks — that is recorded. I reply within one business day.'),
            ['spooled' => true]
            + (syedai_debug() ? ['detail' => 'SMTP: ' . mb_substr($e->getMessage(), 0, 300)] : []));
    }

    /* Both the relay and the disk failed. Now it is a real error, and the only
       honest thing is to say so and give a route that does not touch this
       server at all. */
    respond(502,
        'That did not send, and I could not save it either. Please reach me on LinkedIn — linkedin.com/in/syed — and I will pick it up there.',
        syedai_debug() ? ['detail' => 'SMTP: ' . mb_substr($e->getMessage(), 0, 300)] : []);
}

if ($mode === 'roadmap' || $mode === 'newsletter') {
    exit;   // already answered, and the follow-up work is done
}
rate_hit($ip, 'send', $cfg);

if ($followUpFailed) {
    // The lead is safe; only the courtesy email did not go out.
    respond(200, $mode === 'roadmap'
        ? 'Got it — though the roadmap email did not go out. I have your details and will send it by hand.'
        : 'You are recorded, but the confirmation email did not go out. Reply to any email of mine '
          . 'and I will confirm you by hand.');
}
respond(200, $mode === 'roadmap'
    ? 'Done — your roadmap is on its way to ' . $email . '. Give it a minute.'
    : ($mode === 'newsletter'
        ? 'Almost there. Click the link in the email I just sent and you are on.'
        : 'Thanks — that came through. I reply within one business day.'));

/* ══ Abuse screening ══════════════════════════════════════════════════════
   Layered on purpose. The honeypot and the dwell timer stop crude bots for
   free. What follows catches the ones that fill fields properly: link farms,
   SEO and crypto spam, and anyone hammering the form with the same payload.
   Nothing here can execute — the message is assembled as plain text and every
   header-bound value has already had its control characters stripped — so this
   is about your attention and your Gmail quota, not about code injection.   */


/**
 * Returns a score. 0–2 is fine, 3–4 is suspicious, 5+ is refused.
 * Deliberately generous: a false positive costs a real lead, which is far more
 * expensive than a spam email you delete.
 */
function spam_score(string $name, string $email, string $brief, string $company, string $site, array &$why): int {
    static $SPAM_PHRASES = [
        'guest post', 'link building', 'backlink', 'seo services', 'improve your ranking',
        'first page of google', 'buy now', 'click here to', 'limited time offer',
        'crypto', 'bitcoin', 'forex', 'binary option', 'casino', 'viagra', 'cialis',
        'loan offer', 'make money fast', 'work from home', 'weight loss',
        'telegram.me', 't.me/', 'whatsapp +', 'bulk email', 'email list for sale',
        'increase your traffic', 'web design services', 'mobile app development',
        'we noticed your website', 'i came across your website',
    ];
    static $THROWAWAY = [
        'mailinator.com', 'guerrillamail.com', 'guerrillamail.info', '10minutemail.com',
        'tempmail.com', 'temp-mail.org', 'throwawaymail.com', 'yopmail.com',
        'sharklasers.com', 'trashmail.com', 'getnada.com', 'dispostable.com',
        'maildrop.cc', 'fakeinbox.com', 'mintemail.com', 'spam4.me',
    ];
    $score = 0;
    $hay = mb_strtolower($name . ' ' . $brief . ' ' . $company);

    // Links. One is normal, several is an advert.
    $links = preg_match_all('~https?://|www\.\w|\w+\.(com|net|org|ru|cn|xyz|top|info|biz)\b~i', $brief);
    if ($links >= 5) { $score += 3; $why[] = "{$links} links in the message"; }
    elseif ($links >= 3) { $score += 2; $why[] = "{$links} links in the message"; }

    // Any BBCode or anchor markup is a link-spam tell; nobody types it by hand.
    if (preg_match('~\[url|\[/url\]|<a\s+href~i', $brief)) { $score += 3; $why[] = 'link markup in the message'; }

    $hits = [];
    foreach ($SPAM_PHRASES as $p) { if (str_contains($hay, $p)) { $hits[] = $p; } }
    if (count($hits) >= 3) { $score += 4; $why[] = 'phrases: ' . implode(', ', array_slice($hits, 0, 4)); }
    elseif (count($hits) === 2) { $score += 2; $why[] = 'phrases: ' . implode(', ', $hits); }
    elseif (count($hits) === 1) { $score += 1; $why[] = 'phrase: ' . $hits[0]; }

    // SHOUTING, but only on messages long enough for it to mean something.
    $letters = preg_replace('~[^a-zA-Z]~', '', $brief) ?? '';
    if (strlen($letters) > 40) {
        $upper = strlen(preg_replace('~[^A-Z]~', '', $letters) ?? '');
        if ($upper / max(1, strlen($letters)) > 0.6) { $score += 2; $why[] = 'mostly capitals'; }
    }

    // Name fields are not sentences. A paragraph in one means a bot filled it.
    if (mb_strlen($name) > 60 || substr_count($name, ' ') > 6) { $score += 2; $why[] = 'name field looks generated'; }
    if (preg_match('~https?://~i', $name . ' ' . $company)) { $score += 3; $why[] = 'URL in the name or company field'; }

    // Throwaway inbox.
    $dom = strtolower(substr(strrchr($email, '@') ?: '', 1));
    if (in_array($dom, $THROWAWAY, true)) { $score += 3; $why[] = "throwaway address ({$dom})"; }

    // Cyrillic or CJK in a message otherwise written in English.
    if (preg_match('~[\x{0400}-\x{04FF}]~u', $brief) && preg_match('~[a-z]{20,}~i', $brief)) {
        $score += 2; $why[] = 'mixed scripts';
    }

    // Nonsense keyboard runs.
    if (preg_match('~(.)\1{7,}~u', $brief)) { $score += 2; $why[] = 'repeated characters'; }

    return $score;
}

/** Same message twice inside the window: almost always a retry loop or a bot. */
function duplicate_recently(string $fingerprint, array $cfg): bool {
    $dir = $cfg['rate_dir'] . '/seen';
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) { return false; }
    $f = $dir . '/' . hash('sha256', $fingerprint) . '.t';
    $now = time();
    if (is_readable($f) && ($now - (int)@filemtime($f)) < (int)($cfg['dedupe_window'] ?? 900)) { return true; }
    @touch($f);
    if (random_int(1, 40) === 1) {
        foreach (glob($dir . '/*.t') ?: [] as $old) {
            if (@filemtime($old) < $now - 86400) { @unlink($old); }
        }
    }
    return false;
}

/** A hard ceiling across every visitor, so a botnet cannot burn the daily quota. */
function global_cap_hit(array $cfg): bool {
    $max = (int)($cfg['global_max_per_day'] ?? 200);
    if ($max <= 0) { return false; }
    $f = $cfg['rate_dir'] . '/global-' . gmdate('Y-m-d') . '.count';
    if (!is_dir($cfg['rate_dir'])) { @mkdir($cfg['rate_dir'], 0700, true); }
    $n = (int)@file_get_contents($f);
    if ($n >= $max) { return true; }
    @file_put_contents($f, (string)($n + 1), LOCK_EX);
    return false;
}

/* ── helpers ─────────────────────────────────────────────────────────── */

/** Strip anything that could break out of a mail header. */
function hdr(string $v): string {
    $v = str_replace(["\0", "\r", "\n", "\t"], ' ', $v);
    $v = preg_replace('/[\x00-\x1F\x7F]/u', '', $v) ?? '';
    return mb_substr(trim(preg_replace('/\s{2,}/', ' ', $v) ?? ''), 0, 180);
}

/**
 * The client address, used only as a rate-limit key.
 *
 * REMOTE_ADDR is the only value a client cannot forge. CF-Connecting-IP and
 * X-Forwarded-For are request headers — anyone can send them — so trusting
 * them unconditionally hands an attacker a fresh rate-limit bucket per
 * request and defeats the limiter entirely. They are read only when the
 * config says a proxy is genuinely in front of this site.
 */
function client_ip(array $cfg): string {
    $direct = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    if (!empty($cfg['behind_cloudflare']) && !empty($_SERVER['HTTP_CF_CONNECTING_IP'])) {
        $fwd = trim(explode(',', (string)$_SERVER['HTTP_CF_CONNECTING_IP'])[0]);
        if (filter_var($fwd, FILTER_VALIDATE_IP)) { return $fwd; }
    }
    return filter_var($direct, FILTER_VALIDATE_IP) ? $direct : '0.0.0.0';
}

/** Path for one bucket. The IP is hashed, so no raw address is written to disk. */
function rate_file(string $ip, string $bucket, array $cfg): ?string {
    $dir = $cfg['rate_dir'];
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) { return null; }
    return $dir . '/' . hash('sha256', $bucket . '|' . $ip) . '.json';
}

function rate_count(string $ip, string $bucket, array $cfg): int {
    $file = rate_file($ip, $bucket, $cfg);
    if ($file === null || !is_readable($file)) { return 0; }
    $cut = time() - $cfg['rate_window'];
    return count(array_filter((array)json_decode((string)file_get_contents($file), true),
                              static fn($t) => is_int($t) && $t > $cut));
}

function rate_hit(string $ip, string $bucket, array $cfg): void {
    $file = rate_file($ip, $bucket, $cfg);
    if ($file === null) { return; }
    $now = time(); $cut = $now - $cfg['rate_window'];
    $hits = is_readable($file)
        ? array_filter((array)json_decode((string)file_get_contents($file), true),
                       static fn($t) => is_int($t) && $t > $cut)
        : [];
    $hits[] = $now;
    @file_put_contents($file, json_encode(array_values($hits)), LOCK_EX);
    if (random_int(1, 50) === 1) { // occasional sweep, so the directory cannot grow forever
        foreach (glob($cfg['rate_dir'] . '/*.json') ?: [] as $old) {
            if (filemtime($old) < $now - $cfg['rate_window'] * 4) { @unlink($old); }
        }
    }
}

function turnstile_ok(string $token, string $secret, string $ip): bool {
    if ($token === '' || strlen($token) > 2048) { return false; }
    $ch = curl_init('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 8,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_POSTFIELDS     => http_build_query([
            'secret'          => $secret,
            'response'        => $token,
            'remoteip'        => $ip,
            'idempotency_key' => bin2hex(random_bytes(16)),
        ]),
    ]);
    $raw = curl_exec($ch);
    curl_close($ch);
    return $raw !== false && (json_decode((string)$raw, true)['success'] ?? false) === true;
}

/**
 * Send the response and hand the connection back, then keep running.
 *
 * Hostinger runs LiteSpeed, which exposes litespeed_finish_request(); PHP-FPM
 * has fastcgi_finish_request(). Where neither exists we fall back to declaring
 * the length and flushing, which most servers honour. Without this, a slow
 * follow-up keeps the HTTP connection open long enough for Cloudflare to give
 * up and hand the visitor a 502 while PHP is still working perfectly.
 */
function syedai_finish_response(int $code, string $message): void {
    $json = json_encode(['ok' => $code === 200, 'message' => $message],
                        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (!headers_sent()) {
        http_response_code($code);
        header('Content-Type: application/json; charset=utf-8');
        header('Content-Length: ' . strlen($json));
        header('Connection: close');
    }
    echo $json;

    if (function_exists('litespeed_finish_request')) { litespeed_finish_request(); return; }
    if (function_exists('fastcgi_finish_request'))   { fastcgi_finish_request();   return; }
    while (ob_get_level() > 0) { @ob_end_flush(); }
    @flush();
}

/**
 * The form posts here twice over: as fetch() with Accept: application/json, and
 * as a plain HTML form when JavaScript is off. Answer in whichever the caller
 * asked for, so the no-JS path gets a readable page instead of raw JSON.
 */
/**
 * Google displays an app password as "abcd efgh ijkl mnop". The spaces are
 * presentation only, and pasting them through is the single most common cause
 * of "535 Username and Password not accepted". A paste can also carry a
 * non-breaking space, a zero-width character, or the quotes that surrounded the
 * value in the config file — none of which \s matches, and every one of which
 * produces the same 535 with nothing on screen to show why.
 */
function smtp_pass_clean(string $p): string {
    $p = trim($p);
    // Only a matched pair of surrounding quotes, so a key that legitimately
    // contains one is left alone.
    if (strlen($p) > 2 && ($p[0] === '"' || $p[0] === "'") && $p[0] === $p[strlen($p) - 1]) {
        $p = substr($p, 1, -1);
    }
    $clean = preg_replace('/[\s\x{00A0}\x{200B}-\x{200D}\x{2060}\x{FEFF}]/u', '', $p);
    return is_string($clean) ? $clean : preg_replace('/\s+/', '', $p);
}

function respond(int $code, string $message, array $extra = []): never {
    http_response_code($code);
    $ok = $code === 200;

    if (str_contains($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json')) {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => $ok, 'message' => $message] + $extra,
                         JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
        exit;
    }

    header('Content-Type: text/html; charset=utf-8');
    $m = htmlspecialchars($message, ENT_QUOTES, 'UTF-8');
    echo '<!doctype html><html lang="en"><head><meta charset="utf-8">'
       . '<meta name="viewport" content="width=device-width,initial-scale=1">'
       . '<meta name="robots" content="noindex">'
       . '<title>' . ($ok ? 'Sent' : 'Not sent') . ' — syed.ai</title><style>'
       . 'body{margin:0;min-height:100vh;display:grid;place-items:center;background:#060504;color:#C9C3B6;'
       . 'font:16px/1.6 Jost,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:24px}'
       . 'main{max-width:44ch;text-align:center}h1{font:500 22px/1.2 Didot,"Bodoni MT",Georgia,serif;'
       . 'letter-spacing:.04em;text-transform:uppercase;color:#F7F5F0;margin:0 0 12px}'
       . 'p{margin:0 0 24px}a{display:inline-block;padding:14px 28px;border:1px solid #CFAF67;color:#CFAF67;'
       . 'text-decoration:none;font-size:11px;font-weight:600;letter-spacing:.16em;text-transform:uppercase}'
       . 'a:hover{background:#CFAF67;color:#0A0806}</style></head><body><main>'
       . '<h1>' . ($ok ? 'That came through' : 'That did not send') . '</h1>'
       . '<p>' . $m . '</p><a href="/">Back to syed.ai</a></main></body></html>';
    exit;
}
