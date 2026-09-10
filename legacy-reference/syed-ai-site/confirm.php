<?php
/**
 * syed.ai — confirmation and unsubscribe
 * ---------------------------------------------------------------------------
 * One public endpoint, two actions, reached only from a link in an email:
 *
 *   /confirm.php?a=confirm&e=<email>&t=<token>
 *   /confirm.php?a=unsub&e=<email>&t=<token>
 *
 * The token is an HMAC of the address and the action (subs.php), so a confirm
 * link cannot be replayed as an unsubscribe, nothing secret is stored on disk,
 * and a link cannot be guessed from an address.
 *
 * GET is used deliberately, because a link in an email is a GET and nothing
 * else. That means a security scanner or a link-preview bot can fire it, which
 * is a real and known trade-off of every confirmation link on the web: the
 * alternative — a page with a button — costs real subscribers who will not
 * click twice. Consent is recorded with the requesting IP and user agent
 * either way, so a machine-triggered confirmation is at least auditable.
 *
 * Unsubscribe additionally answers POST, because Gmail and Yahoo's bulk-sender
 * rules require List-Unsubscribe-Post one-click support.
 */

declare(strict_types=1);

define('SYEDAI_ENDPOINT', true);
ini_set('display_errors', '0');

header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header('Cache-Control: no-store');
header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");

/* ── config, the same discovery send.php uses ─────────────────────────── */
function cf_config_paths(): array {
    $docroot = rtrim((string)($_SERVER['DOCUMENT_ROOT'] ?? ''), '/');
    return array_values(array_unique(array_filter([
        __DIR__ . '/../syedai-config.php',
        __DIR__ . '/../../syedai-config.php',
        $docroot ? $docroot . '/../syedai-config.php' : '',
        $docroot ? dirname($docroot) . '/../syedai-config.php' : '',
        __DIR__ . '/_secure/syedai-config.php',
        __DIR__ . '/syedai-config.php',
    ])));
}

function cf_page(string $title, string $body, int $code = 200): never {
    http_response_code($code);
    header('Content-Type: text/html; charset=utf-8');
    header('X-Robots-Tag: noindex, nofollow');
    $t = htmlspecialchars($title, ENT_QUOTES, 'UTF-8');
    echo '<!doctype html><html lang="en"><head><meta charset="utf-8">'
       . '<meta name="viewport" content="width=device-width,initial-scale=1">'
       . '<meta name="robots" content="noindex,nofollow">'
       . '<title>' . $t . ' — syed.ai</title><style>'
       . 'body{margin:0;min-height:100vh;display:grid;place-items:center;background:#060504;color:#C9C3B6;'
       . 'font:16px/1.7 Jost,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:24px}'
       . 'main{max-width:46ch;text-align:center}'
       . 'h1{font:500 22px/1.25 Georgia,"Times New Roman",serif;color:#F7F5F0;margin:0 0 14px}'
       . 'p{margin:0 0 22px}strong{color:#F7F5F0;font-weight:500}'
       . 'a.b{display:inline-block;padding:14px 28px;border:1px solid #CFAF67;color:#CFAF67;'
       . 'text-decoration:none;font-size:11px;font-weight:600;letter-spacing:.16em;text-transform:uppercase}'
       . 'a.b:hover{background:#CFAF67;color:#0A0806}'
       . '</style></head><body><main><h1>' . $t . '</h1>' . $body
       . '<a class="b" href="/">Back to syed.ai</a></main></body></html>';
    exit;
}

$path = '';
foreach (cf_config_paths() as $c) { if (is_readable($c)) { $path = $c; break; } }
if ($path === '') { cf_page('Not available', '<p>This link cannot be processed right now.</p>', 500); }
$cfg = require $path;
if (!is_array($cfg)) { cf_page('Not available', '<p>This link cannot be processed right now.</p>', 500); }

require_once __DIR__ . '/email-check.php';
require_once __DIR__ . '/subs.php';

/* ── rate limit, so a token cannot be brute-forced ───────────────────── */
$ip = (string)($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
if (!empty($cfg['behind_cloudflare']) && !empty($_SERVER['HTTP_CF_CONNECTING_IP'])) {
    $cand = (string)$_SERVER['HTTP_CF_CONNECTING_IP'];
    if (filter_var($cand, FILTER_VALIDATE_IP)) { $ip = $cand; }
}
$dir = (string)($cfg['rate_dir'] ?? sys_get_temp_dir());
$rf  = rtrim($dir, '/') . '/cf_' . hash('sha256', $ip) . '.txt';
$hits = (int)@file_get_contents($rf);
$age  = is_file($rf) ? time() - (int)@filemtime($rf) : PHP_INT_MAX;
if ($age > 900) { $hits = 0; }
if ($hits > 40) {
    cf_page('Too many attempts', '<p>Too many requests from this connection. Try again in fifteen minutes.</p>', 429);
}
@file_put_contents($rf, (string)($hits + 1), LOCK_EX);

/* ── read and check the link ─────────────────────────────────────────── */
$action = strtolower(trim((string)($_GET['a'] ?? '')));
$email  = trim((string)($_GET['e'] ?? ''));
$token  = trim((string)($_GET['t'] ?? ''));

if (!in_array($action, ['confirm', 'unsub'], true)
    || $email === '' || strlen($email) > 254
    || !preg_match('/^[0-9a-f]{32}$/i', $token)) {
    cf_page('That link is not complete',
        '<p>The link seems to have been cut short — some mail clients wrap long links across lines. '
        . 'Try copying the whole thing into your browser, or reply to the email and I will sort it by hand.</p>', 400);
}

/* Syntax only, deliberately: no DNS lookup and no typo rescue.
 
   This address was already checked at signup, and re-litigating it here is a
   bug I shipped once — the typo rescue fired on the very address the visitor
   had just confirmed they meant, and the correct link came back "not valid".
   At this point the only question worth asking is whether the address in the
   link is well-formed; the token proves the rest. */
if (!ec_check($email, false, true)['ok']) {
    cf_page('That link is not valid', '<p>The address in this link is not a valid one.</p>', 400);
}
if (!subs_verify($cfg, $email, $action, $token)) {
    cf_page('That link is not valid',
        '<p>This link does not match its address. It may have been altered in transit, '
        . 'or it may be from an older email — the most recent one is the one that works.</p>', 403);
}

$rec  = subs_find($cfg, $email);
$safe = htmlspecialchars($email, ENT_QUOTES, 'UTF-8');

/* ── unsubscribe ─────────────────────────────────────────────────────── */
if ($action === 'unsub') {
    $isOneClick = ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST';

    /* Decide the outcome first, render second. An earlier version checked
       "already unsubscribed" before it checked the method, so a mail client
       doing a one-click POST got a full HTML page back instead of a plain
       acknowledgement. Every branch below has to answer in the shape the
       caller asked in. */
    $already = $rec !== null && ($rec['status'] ?? '') === 'unsubscribed';
    $missing = $rec === null;
    $ok = true;

    if (!$already && !$missing) {
        $ok = subs_transition($cfg, $email, 'unsubscribed', [
            'unsubscribedAt' => subs_now(),
            'consent' => ['method' => 'unsubscribed', 'ip' => $ip,
                          'userAgent' => mb_substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 300)],
        ]);
    }

    if ($isOneClick) {
        /* RFC 8058: a one-click unsubscribe wants a 2xx and nothing to render.
           "Not on the list" is a success from the mail client's point of view —
           the desired end state already holds — so it must not be a 404. */
        http_response_code($ok ? 200 : 500);
        header('Content-Type: text/plain; charset=utf-8');
        echo $ok ? "unsubscribed\n" : "failed\n";
        exit;
    }

    if ($missing) {
        cf_page('Not on the list',
            '<p><strong>' . $safe . '</strong> is not subscribed, so there is nothing to remove.</p>');
    }
    if ($already) {
        cf_page('Already removed',
            '<p><strong>' . $safe . '</strong> was already unsubscribed. Nothing further will be sent.</p>');
    }
    $ok ? cf_page('Removed',
            '<p><strong>' . $safe . '</strong> is off the list. No further issues, and no confirmation email '
            . 'about the unsubscribe either — that would rather defeat the point.</p>')
        : cf_page('Could not save that',
            '<p>Something went wrong writing that change. Reply to any issue and I will remove you by hand, today.</p>', 500);
}

/* ── confirm ─────────────────────────────────────────────────────────── */
if ($rec === null) {
    cf_page('Nothing to confirm',
        '<p>There is no pending signup for <strong>' . $safe . '</strong>. '
        . 'If you meant to subscribe, the form on the site takes a moment.</p>', 404);
}
if (($rec['status'] ?? '') === 'confirmed') {
    cf_page('Already confirmed',
        '<p><strong>' . $safe . '</strong> is confirmed. The next issue is Tuesday.</p>');
}
if (($rec['status'] ?? '') === 'unsubscribed') {
    cf_page('That address was removed',
        '<p><strong>' . $safe . '</strong> unsubscribed, so this older confirmation link no longer applies. '
        . 'Sign up again on the site if you would like to come back.</p>', 409);
}

$ok = subs_transition($cfg, $email, 'confirmed', [
    'confirmedAt' => subs_now(),
    'consent' => [
        'method'      => 'double-opt-in',
        'requested'   => $rec['consent']['requested'] ?? ($rec['signupAt'] ?? null),
        'confirmedAt' => subs_now(),
        'ip'          => $ip,
        'userAgent'   => mb_substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 300),
    ],
]);

if (!$ok) {
    cf_page('Could not save that',
        '<p>Your click registered but the change did not save. Reply to the confirmation email '
        . 'and I will add you by hand.</p>', 500);
}

/* The welcome goes out now rather than at signup, so only a real, confirmed
   mailbox ever receives it. If it fails, the subscription still stands —
   the record is already written and that is what matters. */
$sent = false;
if (is_readable(__DIR__ . '/roadmap.php')
    && (is_readable(__DIR__ . '/vendor/autoload.php') || is_readable(__DIR__ . '/PHPMailer/PHPMailer.php'))) {
    try {
        if (is_readable(__DIR__ . '/vendor/autoload.php')) {
            require __DIR__ . '/vendor/autoload.php';
        } else {
            require __DIR__ . '/PHPMailer/Exception.php';
            require __DIR__ . '/PHPMailer/PHPMailer.php';
            require __DIR__ . '/PHPMailer/SMTP.php';
        }
        require_once __DIR__ . '/roadmap.php';

        $m = new \PHPMailer\PHPMailer\PHPMailer(true);
        $m->isSMTP();
        $m->Host       = $cfg['smtp_host'];
        $m->Port       = (int)$cfg['smtp_port'];
        $m->SMTPAuth   = true;
        $m->Username   = $cfg['smtp_user'];
        $m->Password   = preg_replace('/[\s\x{00A0}\x{200B}-\x{200D}\x{2060}\x{FEFF}]/u', '', (string)$cfg['smtp_pass']) ?? '';
        $m->SMTPSecure = (int)$cfg['smtp_port'] === 465
            ? \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS
            : \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
        $m->Timeout = 20;
        $m->CharSet = \PHPMailer\PHPMailer\PHPMailer::CHARSET_UTF8;
        $m->setFrom($cfg['from_email'], $cfg['from_name']);
        $m->addAddress($email, (string)($rec['name'] ?? ''));

        $unsub = rtrim((string)($cfg['site_url'] ?? 'https://syed.ai'), '/')
               . '/confirm.php?a=unsub&e=' . rawurlencode($email)
               . '&t=' . subs_token($cfg, $email, 'unsub');
        $m->addCustomHeader('List-Unsubscribe', '<' . $unsub . '>');
        $m->addCustomHeader('List-Unsubscribe-Post', 'List-Unsubscribe=One-Click');

        $m->Subject = 'You are on the list — The Answer Layer';
        $m->isHTML(true);
        $m->Body    = rm_welcome_html('');
        $m->AltBody = rm_welcome_text('');
        $m->send();
        $sent = true;
    } catch (\Throwable $e) {
        error_log('[syed.ai confirm] welcome email failed: ' . $e->getMessage());
    }
}

cf_page('Confirmed',
    '<p><strong>' . $safe . '</strong> is on the list. '
    . ($sent ? 'A short welcome is on its way. ' : '')
    . 'Issues land on Tuesdays, and every one of them ends with a one-click unsubscribe.</p>');
