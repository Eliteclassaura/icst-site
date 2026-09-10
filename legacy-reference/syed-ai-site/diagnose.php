<?php
/**
 * syed.ai — setup diagnostic
 * ---------------------------------------------------------------------------
 * Upload next to send.php, open it in a browser with the token below, and it
 * checks every link in the chain in order, stopping at the first broken one.
 *
 *     https://syed.ai/diagnose.php?key=CHANGE-ME-FIRST
 *
 * It never prints your password — only whether one is set and how long it is.
 *
 * DELETE THIS FILE once the form works. It is a setup tool, not part of the
 * site, and there is no reason to leave a server-inspection page on a live
 * domain.
 */

declare(strict_types=1);

// ── Change this to anything, then use the same value in the URL ──────────
const DIAG_KEY = '<legacy-admin-key-redacted>';

header('Content-Type: text/html; charset=utf-8');
header('X-Robots-Tag: noindex, nofollow');

if (DIAG_KEY === 'CHANGE-ME-FIRST' || (string)($_GET['key'] ?? '') !== DIAG_KEY) {
    http_response_code(403);
    exit('<p style="font:16px sans-serif;padding:2rem">Set <code>DIAG_KEY</code> at the top of this file to something of your own, then open it as <code>diagnose.php?key=YOUR-VALUE</code>.</p>');
}

/* ── tiny report helpers ─────────────────────────────────────────────────── */
$rows = [];
$fatal = false;
function ok(string $t, string $d = '')    { global $rows; $rows[] = ['ok', $t, $d]; }
function warn(string $t, string $d = '')  { global $rows; $rows[] = ['warn', $t, $d]; }
function bad(string $t, string $d = '')   { global $rows; $rows[] = ['bad', $t, $d]; $GLOBALS['fatal'] = true; }
function smtp_pass_clean(string $p): string {
    $p = trim($p);
    if (strlen($p) > 2 && ($p[0] === '"' || $p[0] === "'") && $p[0] === $p[strlen($p) - 1]) {
        $p = substr($p, 1, -1);
    }
    $clean = preg_replace('/[\s\x{00A0}\x{200B}-\x{200D}\x{2060}\x{FEFF}]/u', '', $p);
    return is_string($clean) ? $clean : preg_replace('/\s+/', '', $p);
}

function e($v) { return htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8'); }

/* ── 1. PHP itself ───────────────────────────────────────────────────────── */
PHP_VERSION_ID >= 80200
    ? ok('PHP ' . PHP_VERSION, 'Meets the 8.2 minimum.')
    : bad('PHP ' . PHP_VERSION . ' is too old', 'Set 8.2 or newer in hPanel → Websites → Dashboard → PHP Configuration.');

foreach (['openssl' => 'TLS for SMTP', 'curl' => 'Turnstile and the roadmap scan', 'mbstring' => 'UTF-8 handling'] as $ext => $why) {
    extension_loaded($ext)
        ? ok("Extension: {$ext}", $why)
        : bad("Extension missing: {$ext}", "Needed for {$why}. Enable it in hPanel → PHP Configuration → Extensions.");
}

/* ── 2. Where this file thinks it is ─────────────────────────────────────── */
ok('This script lives at', __DIR__);
ok('DOCUMENT_ROOT is', (string)($_SERVER['DOCUMENT_ROOT'] ?? 'not set'));
is_readable(__DIR__ . '/send.php')
    ? ok('send.php is beside this file', 'Good — they must be in the same folder.')
    : bad('send.php is NOT in this folder', 'Upload send.php into the same directory as this file (your web root).');

/* ── 2b. Are the uploaded front-end files actually the current ones? ─────
   A stale site.js is invisible from the browser and produces symptoms that
   look exactly like a server fault, so check it here rather than guessing. */
$idx = __DIR__ . '/index.html';
$js  = __DIR__ . '/assets/js/site.js';
if (is_readable($idx)) {
    preg_match('~<meta name="build" content="([^"]+)"~', (string)file_get_contents($idx), $bm);
    $build = $bm[1] ?? '';
    $build !== ''
        ? ok('index.html build ' . $build, 'It requests assets as ?v=' . $build . ', so a browser cannot serve you a stale copy.')
        : warn('index.html has no build stamp', 'It is an older copy. Re-upload index.html from the latest zip.');
} else {
    warn('index.html not found beside this file', 'Only matters if you expected the site here too.');
}
if (is_readable($js)) {
    $src = (string)file_get_contents($js);
    $current = str_contains($src, 'syed.ai build ');
    $current
        ? ok('assets/js/site.js is current', 'Contains the build marker and the detailed error reporting.')
        : bad('assets/js/site.js is an OLD copy',
              "This is almost certainly your problem. The old script shows a bare \"That did not send.\" with no reason attached.\n\n"
              . "Upload assets/js/site.js and assets/css/site.css from the latest zip, then hard-reload the page (Ctrl+Shift+R, or Cmd+Shift+R on a Mac).");
} else {
    warn('assets/js/site.js not found', 'Only matters if the site is served from this folder.');
}

/* ── 3. The config ───────────────────────────────────────────────────────── */
$paths = [
    __DIR__ . '/../syedai-config.php',
    __DIR__ . '/../../syedai-config.php',
    rtrim((string)($_SERVER['DOCUMENT_ROOT'] ?? ''), '/') . '/../syedai-config.php',
    __DIR__ . '/_secure/syedai-config.php',
    __DIR__ . '/syedai-config.php',
];
$found = '';
$tried = [];
foreach (array_unique($paths) as $p) {
    $real = @realpath($p) ?: $p;
    $tried[] = $real . (is_readable($p) ? '   ← FOUND' : (file_exists($p) ? '   ← exists but not readable' : ''));
    if ($found === '' && is_readable($p)) { $found = $p; }
}
if ($found === '') {
    bad('Config file not found', "Looked in these places, in order:\n" . implode("\n", $tried)
        . "\n\nUpload syedai-config.php to the FIRST path listed. In hPanel's File Manager, that is one level above the folder this file is in.");
} else {
    ok('Config found', (@realpath($found) ?: $found));
}

$cfg = [];
if ($found !== '') {
    $cfg = @include $found;
    if (!is_array($cfg)) {
        bad('Config did not return an array', 'The file must start with <?php and end with a return [ ... ]; — check you did not paste it into an existing file or lose the opening tag.');
    } else {
        ok('Config parsed', count($cfg) . ' keys');
        $need = ['to_email','from_email','smtp_host','smtp_port','smtp_user','smtp_pass','allowed_origins'];
        $missing = array_diff($need, array_keys($cfg));
        $missing ? bad('Config keys missing: ' . implode(', ', $missing), 'Re-download the template and fill it in again.')
                 : ok('All required keys present');

        $rawPass = (string)($cfg['smtp_pass'] ?? '');
        $pass    = smtp_pass_clean($rawPass);
        if ($pass === '' || str_contains($rawPass, 'PASTE')) {
            bad('App password not filled in', "smtp_pass still contains the placeholder. Create one at https://myaccount.google.com/apppasswords and paste it in.");
        } else {
            /* Name the characters that were stripped. "16 characters after
               cleaning" hides the fact that the file holds 19, and a stray
               quote or non-breaking space produces a 535 that looks for all the
               world like the wrong password. */
            $noise = [];
            if (preg_match('/[ \t]/', $rawPass))                 { $noise[] = 'spaces (Google shows them; they are display only)'; }
            if (str_contains($rawPass, "\xC2\xA0"))              { $noise[] = 'a non-breaking space — this one is invisible and breaks auth'; }
            if (preg_match('/[\x{200B}-\x{200D}\x{2060}\x{FEFF}]/u', $rawPass)) { $noise[] = 'a zero-width character from the paste'; }
            if (preg_match('/^[\'"].*[\'"]$/s', trim($rawPass)))  { $noise[] = 'quotes around the value inside the quoted string'; }
            if (preg_match('/[\r\n]/', $rawPass))                { $noise[] = 'a line break'; }

            if (strlen($pass) !== 16) {
                warn('App password is ' . strlen($pass) . ' characters after cleaning, not 16',
                     'Google app passwords are exactly 16 characters. If you pasted your normal Google password, that will not work — Google removed password access in 2022.'
                     . ($noise ? ' Removed: ' . e(implode('; ', $noise)) . '.' : ''));
            } elseif ($noise) {
                ok('App password looks right', '16 characters once cleaned. The file also holds ' . e(implode('; ', $noise))
                   . '. send.php strips the same characters, so this is handled — but it is worth tidying the config so the value is 16 bare characters.');
            } else {
                ok('App password looks right', '16 characters, nothing stray in the value.');
            }
        }

        /* Leads that the endpoint captured while the relay was down. They are
           on disk and nowhere else, so the diagnostic has to surface them —
           otherwise a spell of broken SMTP quietly becomes lost business. */
        $spool = (string)($cfg['spool_file'] ?? '');
        if ($spool !== '' && is_readable($spool)) {
            $lines = array_values(array_filter(explode("\n", (string)@file_get_contents($spool))));
            if ($lines) {
                $when = [];
                foreach (array_slice($lines, -3) as $ln) {
                    $j = json_decode($ln, true);
                    $when[] = ($j['ts'] ?? '?') . ' — ' . ($j['fields']['Email'] ?? $j['fields']['email'] ?? 'unknown sender');
                }
                warn(count($lines) . ' lead' . (count($lines) === 1 ? '' : 's') . ' saved while mail was failing',
                     'These were captured but never emailed. Read them, reply by hand, then empty the file. Most recent: '
                     . e(implode(' · ', array_reverse($when))) . ' — file: ' . e($spool));
            } else {
                ok('No stranded leads', 'The spool file is empty, which is what you want.');
            }
        }

        ($cfg['from_email'] ?? '') === ($cfg['smtp_user'] ?? '')
            ? ok('from_email matches smtp_user', 'Correct — Gmail rewrites From otherwise.')
            : bad('from_email does not match smtp_user', 'With Gmail these must be identical, or Google rewrites the header and DMARC alignment breaks.');

        in_array((int)($cfg['smtp_port'] ?? 0), [465, 587], true)
            ? ok('SMTP port ' . (int)$cfg['smtp_port'])
            : bad('SMTP port is ' . e($cfg['smtp_port'] ?? 'unset'), 'Use 465 (implicit TLS) or 587 (STARTTLS).');

        // Cloudflare in front changes what the rate limiter sees.
        $viaCF = !empty($_SERVER['HTTP_CF_CONNECTING_IP']) || !empty($_SERVER['HTTP_CF_RAY']);
        $cfSet = !empty($cfg['behind_cloudflare']);
        if ($viaCF && !$cfSet) {
            bad('Cloudflare is proxying this site, but behind_cloudflare is false',
                "Every visitor then looks like they came from Cloudflare's own IP, so they all share one rate-limit bucket and the fifth send of the hour locks out everybody.\n\nSet 'behind_cloudflare' => true in the config.");
        } elseif ($viaCF && $cfSet) {
            ok('Cloudflare detected, and the config knows', 'Rate limiting will use the real visitor IP.');
        } elseif (!$viaCF && $cfSet) {
            warn('behind_cloudflare is true but no Cloudflare headers arrived',
                 'Harmless — it falls back to the socket address — but set it false if you are not proxying, so a spoofed header can never be trusted.');
        }

        // The slow paths must be able to finish after the response closes.
        if (function_exists('litespeed_finish_request') || function_exists('fastcgi_finish_request')) {
            ok('Background work is supported',
               (function_exists('litespeed_finish_request') ? 'litespeed_finish_request()' : 'fastcgi_finish_request()')
               . ' exists, so the roadmap is built after the browser is answered.');
        } else {
            warn('No finish_request() function', 'Falls back to flushing, which usually works. If you see 502s on roadmap requests, that is the first thing to look at.');
        }

        $host = 'https://' . (string)($_SERVER['HTTP_HOST'] ?? '');
        in_array($host, (array)($cfg['allowed_origins'] ?? []), true)
            ? ok('This host is in allowed_origins', $host)
            : warn('This host is not in allowed_origins', "You are on {$host}, but allowed_origins is: "
                . implode(', ', (array)($cfg['allowed_origins'] ?? [])) . ". The form will return 403 from this address.");
    }
}

/* ── 4. PHPMailer ────────────────────────────────────────────────────────── */
$mailerLoaded = false;
if (is_readable(__DIR__ . '/vendor/autoload.php')) {
    require __DIR__ . '/vendor/autoload.php';
    $mailerLoaded = class_exists('PHPMailer\\PHPMailer\\PHPMailer');
    $mailerLoaded ? ok('PHPMailer found', 'vendor/autoload.php (installed by Composer)')
                  : bad('vendor/autoload.php exists but PHPMailer is not in it', 'Run: composer2 require phpmailer/phpmailer');
} elseif (is_readable(__DIR__ . '/PHPMailer/PHPMailer.php')) {
    require __DIR__ . '/PHPMailer/Exception.php';
    require __DIR__ . '/PHPMailer/PHPMailer.php';
    require __DIR__ . '/PHPMailer/SMTP.php';
    $mailerLoaded = class_exists('PHPMailer\\PHPMailer\\PHPMailer');
    $mailerLoaded ? ok('PHPMailer found', 'PHPMailer/ folder (manual install)')
                  : bad('PHPMailer folder is incomplete', 'It needs all three of PHPMailer.php, SMTP.php and Exception.php from the release zip\'s src/ folder.');
} else {
    bad('PHPMailer is not installed',
        "Neither vendor/autoload.php nor PHPMailer/PHPMailer.php exists in " . __DIR__ . ".\n\n"
        . "With SSH:  composer2 require phpmailer/phpmailer\n"
        . "Without:   download github.com/PHPMailer/PHPMailer/releases, and upload src/PHPMailer.php, src/SMTP.php and src/Exception.php into a folder called PHPMailer here.");
}

/* ── 5. Can we even reach Gmail? ─────────────────────────────────────────── */
if (!$fatal && $cfg) {
    $smtpHost = (string)$cfg['smtp_host'];
    foreach ([465, 587] as $port) {
        $t0 = microtime(true);
        $fp = @fsockopen(($port === 465 ? 'ssl://' : '') . $smtpHost, $port, $errno, $errstr, 8);
        $ms = (int)round((microtime(true) - $t0) * 1000);
        if ($fp) {
            fclose($fp);
            ok("Port {$port} to {$smtpHost} is open", "Connected in {$ms}ms.");
        } else {
            ($port === (int)$cfg['smtp_port'])
                ? bad("Port {$port} to {$smtpHost} is blocked", "The server said: {$errstr} ({$errno}).\n\nTry setting 'smtp_port' => " . ($port === 465 ? 587 : 465) . " in the config and reloading this page. If both ports are blocked, ask Hostinger support to open outbound SMTP — it is normally open on every plan.")
                : warn("Port {$port} to {$smtpHost} is blocked", "Not the port you are using, so this is only informational \u2014 but it is your fallback if the other one stops working.");
        }
    }
}

/* ── 6. The real test: authenticate ──────────────────────────────────────── */
$authOk = false;
if (!$fatal && $mailerLoaded && $cfg) {
    $m = new PHPMailer\PHPMailer\PHPMailer(true);
    $dialogue = '';
    try {
        $m->isSMTP();
        $m->Host       = $cfg['smtp_host'];
        $m->Port       = (int)$cfg['smtp_port'];
        $m->SMTPAuth   = true;
        $m->Username   = $cfg['smtp_user'];
        $m->Password   = smtp_pass_clean((string)$cfg['smtp_pass']);
        $m->SMTPSecure = (int)$cfg['smtp_port'] === 465
            ? PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS
            : PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
        $m->Timeout    = 15;

        /* Capture the actual server conversation. The literal response code is
           the whole answer here — 534 and 535 mean completely different things
           and send you to different settings pages. The password is redacted
           before anything is shown. */
        $m->SMTPDebug   = 2;
        $m->Debugoutput = function ($str, $level) use (&$dialogue) { $dialogue .= rtrim($str) . "\n"; };

        if ($m->smtpConnect()) {
            $m->smtpClose();
            $authOk = true;
            ok('Signed in successfully', 'Credentials are correct. This is the test that matters.');
        } else {
            bad('Could not sign in', 'The server refused the credentials. The exact response is below — read that, not this.');
        }
    } catch (Throwable $ex) {
        bad('SMTP error', $ex->getMessage());
    }

    if ($dialogue !== '') {
        // Never print the credentials, even to the person who owns them.
        $red = preg_replace('/^(CLIENT -> SERVER: )(?!EHLO|HELO|AUTH LOGIN|QUIT|STARTTLS)([A-Za-z0-9+\/=]{8,})$/m',
                            '$1[redacted]', $dialogue) ?? $dialogue;
        $red = str_replace(base64_encode((string)$cfg['smtp_user']), '[redacted]', $red);

        $hint = '';
        if (preg_match('/\b534\b/', $red)) {
            $hint = "534 means: you used your normal Google password. Google requires an app password. Create one at https://myaccount.google.com/apppasswords";
        } elseif (preg_match('/\b535\b/', $red)) {
            $hint = "535 means the username and password pair was rejected. In order of likelihood:\n"
                  . "  1. The app password was created on a DIFFERENT Google account than " . e($cfg['smtp_user']) . ".\n"
                  . "     Sign in as that exact address, then create it.\n"
                  . "  2. It was mistyped or only partly pasted. It is 16 characters.\n"
                  . "  3. It has been revoked. Delete it and make a new one.\n"
                  . "  4. Workspace only: an admin has blocked app passwords, or IMAP/POP is off for\n"
                  . "     this user. Google groups SMTP with IMAP and POP, so turning those off can\n"
                  . "     block sending. Admin console -> Apps -> Gmail -> End User Access.";
        } elseif (preg_match('/\b5\.7\.9\b|Application-specific/', $red)) {
            $hint = "Google is explicitly asking for an app password rather than an account password.";
        }
        $rows[] = ['warn', 'The SMTP conversation', trim($red) . ($hint ? "\n\n--- what this means ---\n" . $hint : '')];
    }
}

/* ── 7. Optional: actually send one ──────────────────────────────────────── */
$sent = null;
if ($authOk && isset($_GET['send'])) {
    try {
        $m = new PHPMailer\PHPMailer\PHPMailer(true);
        $m->isSMTP();
        $m->Host = $cfg['smtp_host']; $m->Port = (int)$cfg['smtp_port'];
        $m->SMTPAuth = true; $m->Username = $cfg['smtp_user'];
        $m->Password = smtp_pass_clean((string)$cfg['smtp_pass']);
        $m->SMTPSecure = (int)$cfg['smtp_port'] === 465
            ? PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS
            : PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
        $m->CharSet = 'UTF-8';
        $m->setFrom($cfg['from_email'], $cfg['from_name'] ?? 'syed.ai');
        $m->addAddress($cfg['to_email']);
        $m->Subject = 'syed.ai diagnostic — it works';
        $m->Body = "If you are reading this, the whole chain is working:\n\n"
                 . "  PHP        " . PHP_VERSION . "\n"
                 . "  Config     " . $found . "\n"
                 . "  SMTP       " . $cfg['smtp_host'] . ':' . $cfg['smtp_port'] . "\n"
                 . "  Sent       " . gmdate('Y-m-d H:i') . " UTC\n\n"
                 . "Delete diagnose.php now.\n";
        $m->send();
        $sent = true;
    } catch (Throwable $ex) { $sent = $ex->getMessage(); }
}
?>
<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>syed.ai — setup diagnostic</title>
<style>
:root{color-scheme:dark}
body{margin:0;background:#060504;color:#C9C3B6;font:15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:32px 20px}
main{max-width:760px;margin:0 auto}
h1{font:500 26px/1.2 Didot,'Bodoni MT',Georgia,serif;letter-spacing:.5px;color:#F7F5F0;margin:0 0 6px;text-transform:uppercase}
.sub{color:#948D7B;font-size:13px;margin:0 0 26px}
.row{display:flex;gap:14px;padding:13px 0;border-bottom:1px solid #191510}
.b{flex:none;width:8px;height:8px;border-radius:50%;margin-top:8px}
.ok .b{background:#7DAE8A}.warn .b{background:#CFAF67}.bad .b{background:#D06A60}
.t{font-weight:500;color:#F7F5F0}
.d{margin-top:5px;color:#948D7B;font-size:13.5px;white-space:pre-wrap;word-break:break-word}
.verdict{margin:26px 0;padding:18px 20px;border-left:3px solid;background:#0E0C09}
.verdict.good{border-color:#7DAE8A}.verdict.bad{border-color:#D06A60}
.verdict h2{margin:0 0 8px;font:500 18px/1.3 -apple-system,sans-serif;color:#F7F5F0}
a.btn{display:inline-block;margin-top:14px;padding:12px 22px;border:1px solid #CFAF67;color:#CFAF67;
text-decoration:none;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase}
a.btn:hover{background:#CFAF67;color:#0A0806}
code{font-family:ui-monospace,Menlo,monospace;font-size:.92em;color:#C9C3B6}
</style></head><body><main>
<h1>Setup diagnostic</h1>
<p class="sub">Checks run in order. Fix the first red one, reload, repeat.</p>

<?php foreach ($rows as [$sev, $t, $d]): ?>
  <div class="row <?= $sev ?>"><span class="b"></span><div>
    <div class="t"><?= e($t) ?></div>
    <?php if ($d !== ''): ?><div class="d"><?= e($d) ?></div><?php endif; ?>
  </div></div>
<?php endforeach; ?>

<?php if ($sent === true): ?>
  <div class="verdict good"><h2>Test email sent</h2>
  Check <code><?= e($cfg['to_email']) ?></code>. If it is not there in a minute, look in spam —
  you are sending to yourself from yourself, which some filters dislike. Add a Gmail filter for it.
  <br><br><strong>Now delete diagnose.php.</strong></div>
<?php elseif (is_string($sent)): ?>
  <div class="verdict bad"><h2>Sending failed</h2><code><?= e($sent) ?></code></div>
<?php elseif ($authOk): ?>
  <div class="verdict good"><h2>Everything checks out</h2>
  The credentials work and Gmail accepted the connection. Send one real test to be sure.
  <br><a class="btn" href="?key=<?= e(DIAG_KEY) ?>&amp;send=1">Send a test email</a></div>
<?php else: ?>
  <div class="verdict bad"><h2>Not working yet</h2>
  Fix the first red item above, then reload this page. Each fix usually unblocks the next check.</div>
<?php endif; ?>

<h2 style="font:500 19px/1.3 -apple-system,sans-serif;color:#F7F5F0;margin:34px 0 8px">Test the real endpoint</h2>
<p class="sub">This posts a genuine submission to <code>send.php</code> from your browser, exactly the way the
form does — same origin, same fields — and prints the raw reply. If the form says something went wrong,
whatever appears here is the actual reason.</p>
<p><a class="btn" href="#" id="hit">Post a test submission</a></p>
<pre id="out" style="display:none;white-space:pre-wrap;word-break:break-word;background:#0E0C09;
border:1px solid #272219;padding:16px;font:12.5px/1.6 ui-monospace,Menlo,monospace;color:#C9C3B6"></pre>
<script>
document.getElementById('hit').addEventListener('click', function (ev) {
  ev.preventDefault();
  var out = document.getElementById('out');
  out.style.display = 'block';
  out.textContent = 'Posting…';
  var fd = new FormData();
  fd.set('name', 'Diagnostic test');
  fd.set('email', 'diagnostic@example.com');
  fd.set('brief', 'This is an automated test from diagnose.php. Ignore it.');
  fd.set('website_url', '');
  fd.set('mode', 'brief');
  fd.set('source', 'diagnostic');
  fd.set('t', String(Math.floor(Date.now() / 1000) - 20));
  fetch('send.php', { method: 'POST', body: fd, headers: { 'Accept': 'application/json' } })
    .then(function (r) {
      return r.text().then(function (raw) {
        var pretty = raw;
        try { pretty = JSON.stringify(JSON.parse(raw), null, 2); } catch (e) {}
        out.textContent =
          'HTTP ' + r.status + ' ' + r.statusText + '\n' +
          'Content-Type: ' + (r.headers.get('content-type') || '(none)') + '\n' +
          '\n' + pretty +
          (raw.trim().charAt(0) === '<'
            ? '\n\n^ That is HTML, not JSON. PHP printed an error before the response. The text above names the file and line.'
            : '');
      });
    })
    .catch(function (e) { out.textContent = 'The request itself failed: ' + e.message +
      '\n\nUsually means send.php is missing, or the server refused the connection.'; });
});
</script>

<p class="sub" style="margin-top:28px">Delete this file when the form works.</p>
</main></body></html>
