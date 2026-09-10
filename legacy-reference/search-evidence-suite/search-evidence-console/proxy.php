<?php
/**
 * Search Evidence Suite — optional fetch proxy for shared hosting
 * (c) 2026 Syed.ai. All rights reserved.
 * ---------------------------------------------------------------
 * The console runs entirely in the browser, and a browser is not
 * allowed to read another domain's pages. This file does that one
 * job for it: fetch a URL server-side and hand back the response.
 *
 * IT IS DISABLED UNTIL YOU EDIT $ALLOWED_HOSTS BELOW.
 * Leaving it open would let anyone on the internet use your server
 * to fetch arbitrary URLs, which is how open proxies get abused.
 *
 * If you run this on a VPS rather than shared hosting, use the
 * companion server (sec-server) instead. It does the same job with
 * the same protections and does not need PHP at all. This file
 * exists because shared hosting cannot run a long-lived process.
 *
 * Requirements: PHP 7.4+ with cURL.
 * Upload it next to index.html. The console finds it on its own.
 * ---------------------------------------------------------------
 * A NOTE ON WHY THIS FILE IS CAREFUL
 *
 * A URL fetcher running on your web host can be pointed back at
 * your web host: at 127.0.0.1, at a database on the same private
 * network, at 169.254.169.254 for cloud credentials. So:
 *
 *   1. Every hostname is resolved and every address it resolves to
 *      is checked against a list of private and reserved ranges.
 *   2. The address that passed is PINNED for the actual connection
 *      (CURLOPT_RESOLVE), so the name cannot resolve to something
 *      else a moment later. That second lookup is the standard way
 *      this kind of check gets bypassed.
 *   3. If a name cannot be resolved and therefore cannot be
 *      checked, the request is REFUSED. It is never allowed
 *      through unchecked. An earlier version of this file did let
 *      it through, which meant an IP address written straight into
 *      $ALLOWED_HOSTS was fetched with no check at all.
 *   4. Every redirect hop is re-checked and re-pinned from scratch.
 * ---------------------------------------------------------------
 */

// ===============================================================
// 1. WHICH SITES MAY BE FETCHED.  Add the domains you audit.
//    Subdomains of each entry are included automatically.
//    Leave the array empty and the proxy refuses every request.
// ===============================================================
$ALLOWED_HOSTS = [
    // REDACTED IN THIS REPOSITORY COPY (ADR-027): the client hosts were replaced by
    // redacted-client-host-NN.invalid before the first push. Hashes: allowlist.sha256.json.
    // The operator's own crawl allowlist.
    //
    // THIS FILE IS PRIVATE AND NEVER GOES IN THE CUSTOMER ZIP. It contains a list
    // of client sites, which is commercially sensitive, so make-dist.py uses it to
    // produce a SECOND zip for your own deployment and leaves the sellable one
    // with an empty allowlist exactly as it ships today. A test asserts that.
    //
    // Format: one host per line. Lines starting with # become comments in the
    // generated proxy.php. Blank lines are kept. No scheme, no path, no trailing
    // slash — just the host.

    // ---------- your own ----------
    'syed.ai',
    'websitecontentstrategy.com',
    'redacted-client-host-01.invalid',
    'redacted-client-host-02.invalid',
    'redacted-client-host-03.invalid',
    'redacted-client-host-04.invalid',
    'redacted-client-host-05.invalid',
    'redacted-client-host-06.invalid',

    // ---------- clients ----------
    'redacted-client-host-07.invalid',

    // ---------- Hostinger preview sites ----------
    // Each is listed IN FULL, on purpose. Shortening these to 'redacted-client-host-08.invalid'
    // would allow every preview site on Hostinger — hundreds of thousands of them,
    // none of them yours — because an entry also covers its subdomains. Never do
    // that. Paste each new preview URL's host here as you get it.
    'redacted-client-host-09.invalid',
    'redacted-client-host-10.invalid',
    'redacted-client-host-11.invalid',
    'redacted-client-host-12.invalid',
    'redacted-client-host-13.invalid',
    'redacted-client-host-14.invalid',
    'redacted-client-host-15.invalid',
    'redacted-client-host-16.invalid',
    'redacted-client-host-17.invalid',
];

// ===============================================================
// 2. OPTIONAL SHARED SECRET.
//    Leave this empty unless you know you need it.
//
//    The console has no field for a proxy key, so setting one here
//    also means editing index.html: find PROXY_URL = 'proxy.php'
//    and change it to 'proxy.php?key=THESAMESTRING'. On shared
//    hosting it is easier and stronger to password-protect the whole
//    folder instead -- the browser then sends your credentials with
//    the console's own requests, so the app keeps working while a
//    stranger gets a password box.
// ===============================================================
$SECRET = '';

// ===============================================================
// 3. LIMITS
// ===============================================================
$MAX_BYTES     = 3 * 1024 * 1024;   // refuse responses larger than this
$TIMEOUT       = 12;                // seconds per request
$MAX_REDIRECTS = 5;
$RATE_PER_MIN  = 120;               // per caller IP. 0 disables the limit.
$USER_AGENT    = 'Mozilla/5.0 (compatible; SearchEvidenceSuite/1.0; +self-hosted SEO audit)';

// ---------------------------------------------------------------
// Nothing below here needs editing.
// ---------------------------------------------------------------

/* A PHP notice printed into the response would corrupt the JSON, and plenty of
   shared hosts have display_errors switched on. Errors are logged, not printed. */
@ini_set('display_errors', '0');
@ini_set('log_errors', '1');
error_reporting(E_ALL);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');
header('Referrer-Policy: no-referrer');

function out($data, $code = 200) {
    http_response_code($code);
    /* JSON_INVALID_UTF8_SUBSTITUTE (PHP 7.2+) stops a page in a broken
       encoding from making json_encode fail and return an empty body. */
    $flags = 0;
    if (defined('JSON_INVALID_UTF8_SUBSTITUTE')) $flags |= JSON_INVALID_UTF8_SUBSTITUTE;
    $json = json_encode($data, $flags);
    if ($json === false) $json = '{"error":"The response could not be encoded."}';
    echo $json;
    exit;
}

// ===============================================================
// ADDRESS SAFETY
// ===============================================================

/* Every range that must never be reachable. This is the same list the Go
   server uses. PHP's own FILTER_FLAG_NO_PRIV_RANGE|NO_RES_RANGE was used here
   before and misses seven of them, including carrier-grade NAT, all of
   multicast, and NAT64 — which embeds an IPv4 address. */
$SEC_BLOCKED_CIDRS = [
    '0.0.0.0/8',         // "this network"
    '10.0.0.0/8',        // private
    '100.64.0.0/10',     // carrier-grade NAT
    '127.0.0.0/8',       // loopback
    '169.254.0.0/16',    // link-local, including cloud metadata
    '172.16.0.0/12',     // private
    '192.0.0.0/24',      // IETF protocol assignments
    '192.0.2.0/24',      // TEST-NET-1
    '192.168.0.0/16',    // private
    '198.18.0.0/15',     // benchmarking
    '198.51.100.0/24',   // TEST-NET-2
    '203.0.113.0/24',    // TEST-NET-3
    '224.0.0.0/4',       // multicast
    '240.0.0.0/4',       // reserved, includes 255.255.255.255
    '::/128',            // unspecified
    '::1/128',           // loopback
    '64:ff9b::/96',      // NAT64 — embeds an IPv4 address
    '64:ff9b:1::/48',    // local-use NAT64
    '100::/64',          // discard-only
    '2001:db8::/32',     // documentation
    'fc00::/7',          // unique local
    'fe80::/10',         // link-local
    'ff00::/8',          // multicast
];

/* Reduce an address to one canonical form, and turn an IPv4-in-IPv6 address
   back into plain IPv4 — ::ffff:127.0.0.1 IS 127.0.0.1, and a check that
   misses that misses everything. Returns false if it is not an address. */
function sec_normalise_ip($ip) {
    $ip = trim($ip, "[] \t\r\n");
    $b = @inet_pton($ip);
    if ($b === false) return false;
    if (strlen($b) === 16 && substr($b, 0, 12) === "\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xff\xff") {
        return inet_ntop(substr($b, 12));
    }
    return inet_ntop($b);
}

function sec_ip_in_cidr($ip, $cidr) {
    $parts = explode('/', $cidr);
    if (count($parts) !== 2) return false;
    $ipb  = @inet_pton($ip);
    $netb = @inet_pton($parts[0]);
    $bits = (int)$parts[1];
    if ($ipb === false || $netb === false || strlen($ipb) !== strlen($netb)) return false;
    if ($bits < 0 || $bits > strlen($ipb) * 8) return false;

    $whole = intdiv($bits, 8);
    $rem   = $bits % 8;
    if ($whole > 0 && strncmp($ipb, $netb, $whole) !== 0) return false;
    if ($rem === 0) return true;
    $mask = chr((0xFF << (8 - $rem)) & 0xFF);
    return (($ipb[$whole] & $mask) === ($netb[$whole] & $mask));
}

function sec_is_public_ip($ip) {
    global $SEC_BLOCKED_CIDRS;
    $n = sec_normalise_ip($ip);
    if ($n === false) return false;
    foreach ($SEC_BLOCKED_CIDRS as $cidr) {
        if (sec_ip_in_cidr($n, $cidr)) return false;
    }
    return true;
}

/* Resolve a host to every address it answers with. An empty result means
   "unknown", which the caller must treat as a refusal, not as permission. */
function sec_resolve($host) {
    $literal = sec_normalise_ip($host);
    if ($literal !== false) return array($literal);

    $ips = array();
    if (function_exists('dns_get_record')) {
        foreach (array(DNS_A, DNS_AAAA) as $type) {
            $rec = @dns_get_record($host, $type);
            if (is_array($rec)) {
                foreach ($rec as $r) {
                    if (!empty($r['ip']))   $ips[] = $r['ip'];
                    if (!empty($r['ipv6'])) $ips[] = $r['ipv6'];
                }
            }
        }
    }
    /* dns_get_record is disabled on some shared hosts. gethostbyname is the
       fallback; it returns only one IPv4 address, which is enough to check
       because the connection is then pinned to it. */
    if (!$ips) {
        $r = @gethostbyname($host);
        if ($r !== $host && filter_var($r, FILTER_VALIDATE_IP)) $ips[] = $r;
    }

    $out = array();
    foreach ($ips as $ip) {
        $n = sec_normalise_ip($ip);
        if ($n !== false && !in_array($n, $out, true)) $out[] = $n;
    }
    return $out;
}

/* Returns array(ip, error). Every address the host resolves to must pass, and
   the one returned is the one the connection is pinned to. */
function sec_vet_host($host) {
    $ips = sec_resolve($host);
    if (!$ips) {
        return array(null, 'Could not resolve ' . $host . ', so its address cannot be checked. Refusing rather than guessing.');
    }
    foreach ($ips as $ip) {
        if (!sec_is_public_ip($ip)) {
            return array(null, 'Refusing to fetch a private or reserved address. The crawler only reaches public sites.');
        }
    }
    return array($ips[0], null);
}

function sec_host_allowed($host) {
    global $ALLOWED_HOSTS;
    $host = strtolower($host);
    foreach ($ALLOWED_HOSTS as $allowed) {
        $allowed = strtolower(trim($allowed));
        if ($allowed === '') continue;
        if ($host === $allowed) return true;
        if (substr($host, -(strlen($allowed) + 1)) === '.' . $allowed) return true;
    }
    return false;
}

/* Resolve a Location header against the URL it came from — enough of RFC 3986
   relative resolution to handle what real sites send. */
function sec_absolute_url($loc, $base) {
    $loc = trim($loc);
    if ($loc === '') return null;
    if (preg_match('#^[a-z][a-z0-9+.-]*://#i', $loc)) return $loc;

    $b = parse_url($base);
    if (!$b || empty($b['scheme']) || empty($b['host'])) return null;
    $prefix = $b['scheme'] . '://' . $b['host'] . (isset($b['port']) ? ':' . $b['port'] : '');

    if (substr($loc, 0, 2) === '//') return $b['scheme'] . ':' . $loc;
    if ($loc[0] === '/')             return $prefix . $loc;
    if ($loc[0] === '?')             return $prefix . (isset($b['path']) ? $b['path'] : '/') . $loc;

    $dir = isset($b['path']) ? $b['path'] : '/';
    $cut = strrpos($dir, '/');
    $dir = ($cut === false) ? '/' : substr($dir, 0, $cut + 1);
    if ($dir === '') $dir = '/';
    return $prefix . $dir . $loc;
}

// ===============================================================
// RATE LIMIT
// A counter per caller IP in a temp file. There is no session on
// shared hosting, so this and the allowlist are the only brakes.
// If the filesystem will not cooperate the limit is skipped rather
// than the request refused — a read-only temp directory should not
// take the crawler down.
// ===============================================================
/* The caller's address, as best it can be known. Behind Cloudflare -- which is
   how a lot of shared hosting is fronted -- REMOTE_ADDR is Cloudflare's edge,
   so without this every visitor in the world shares one rate-limit bucket.
   CF-Connecting-IP is set by Cloudflare and stripped from client requests by
   it; a spoofed value only moves the spoofer into a different bucket, which is
   not a security boundary here (the allowlist is), so it is safe to prefer. */
function sec_caller_ip() {
    foreach (array('HTTP_CF_CONNECTING_IP', 'HTTP_X_REAL_IP') as $h) {
        if (!empty($_SERVER[$h]) && filter_var($_SERVER[$h], FILTER_VALIDATE_IP)) return $_SERVER[$h];
    }
    if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        $parts = explode(',', $_SERVER['HTTP_X_FORWARDED_FOR']);
        $first = trim($parts[0]);
        if (filter_var($first, FILTER_VALIDATE_IP)) return $first;
    }
    return isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : 'unknown';
}

function sec_rate_ok($perMinute) {
    if ($perMinute <= 0) return true;
    $ip = sec_caller_ip();
    $file = rtrim(sys_get_temp_dir(), '/\\') . '/sec-proxy-' . md5($ip) . '.rl';
    $fh = @fopen($file, 'c+');
    if (!$fh) return true;
    $ok = true;
    if (@flock($fh, LOCK_EX)) {
        $raw   = stream_get_contents($fh);
        $parts = explode(':', (string)$raw);
        $start = isset($parts[0]) ? (int)$parts[0] : 0;
        $count = isset($parts[1]) ? (int)$parts[1] : 0;
        $now   = time();
        if ($now - $start >= 60) { $start = $now; $count = 0; }
        $count++;
        if ($count > $perMinute) $ok = false;
        @ftruncate($fh, 0);
        @rewind($fh);
        @fwrite($fh, $start . ':' . $count);
        @fflush($fh);
        @flock($fh, LOCK_UN);
    }
    @fclose($fh);
    return $ok;
}

// ===============================================================
// REQUEST
// ===============================================================

$hasCurl = function_exists('curl_init');

if (isset($_GET['ping'])) {
    out(array(
        'ok'         => true,
        'service'    => 'sec-proxy',
        'version'    => 3,
        'engine'     => 'php',
        'configured' => count($ALLOWED_HOSTS) > 0,
        'hosts'      => count($ALLOWED_HOSTS),
        'curl'       => $hasCurl,
        'pinned'     => $hasCurl && defined('CURLOPT_RESOLVE'),
        'ratePerMin' => $RATE_PER_MIN,
    ));
}

/* Without cURL the checked address cannot be pinned, which means the name
   could resolve to a private address on the connection that actually happens.
   Rather than ship a quietly weaker path, this refuses and says what to do.
   The previous version fell back to file_get_contents here. */
if (!$hasCurl) {
    out(array('error' => 'This PHP build has no cURL extension, and without it the proxy cannot pin the address it just checked. Enable cURL in your hosting control panel, or use the companion server instead.'), 501);
}

if ($SECRET !== '' && (!isset($_GET['key']) || !hash_equals($SECRET, (string)$_GET['key']))) {
    out(array('error' => 'Bad or missing key.'), 403);
}

if (!count($ALLOWED_HOSTS)) {
    out(array('error' => 'This proxy has no allowed hosts configured. Open proxy.php and add your domains to $ALLOWED_HOSTS.'), 403);
}

if (!sec_rate_ok($RATE_PER_MIN)) {
    header('Retry-After: 30');
    out(array('error' => 'Too many requests to the proxy. Slow the page rate in the console\'s Crawl settings.'), 429);
}

$url = isset($_GET['url']) ? trim((string)$_GET['url']) : '';
if ($url === '')         out(array('error' => 'No url parameter.'), 400);
if (strlen($url) > 2048) out(array('error' => 'URL too long.'), 400);

$parts = parse_url($url);
if (!$parts || empty($parts['scheme']) || empty($parts['host'])) {
    out(array('error' => 'Malformed URL.'), 400);
}
if (!in_array(strtolower($parts['scheme']), array('http', 'https'), true)) {
    out(array('error' => 'Only http and https are allowed.'), 400);
}

$host = strtolower(trim($parts['host'], '[]'));
if (!sec_host_allowed($host)) {
    out(array('error' => 'Host not in the allowlist: ' . $host), 403);
}

// ===============================================================
// FETCH — one hop at a time, each hop vetted and pinned
// ===============================================================
$binary    = isset($_GET['bin']);
$start     = microtime(true);
$redirects = array();
$current   = $url;
$finalUrl  = $url;
$status    = 0;
$headers   = array();
$body      = '';

for ($hop = 0; $hop <= $MAX_REDIRECTS; $hop++) {
    $cp = parse_url($current);
    if (!$cp || empty($cp['scheme']) || empty($cp['host'])) {
        out(array('error' => 'Malformed URL after a redirect.', 'url' => $current), 200);
    }
    $chost   = strtolower(trim($cp['host'], '[]'));
    $cscheme = strtolower($cp['scheme']);
    $cport   = isset($cp['port']) ? (int)$cp['port'] : ($cscheme === 'https' ? 443 : 80);

    $vet = sec_vet_host($chost);
    if ($vet[0] === null) {
        out(array('error' => $vet[1], 'url' => $current), 200);
    }
    $pinIp = $vet[0];

    $ch = curl_init($current);
    $opts = array(
        CURLOPT_RETURNTRANSFER   => true,
        CURLOPT_FOLLOWLOCATION   => false,
        CURLOPT_HEADER           => true,
        CURLOPT_TIMEOUT          => $TIMEOUT,
        CURLOPT_CONNECTTIMEOUT   => 8,
        CURLOPT_USERAGENT        => $USER_AGENT,
        CURLOPT_ENCODING         => '',
        CURLOPT_SSL_VERIFYPEER   => true,
        CURLOPT_SSL_VERIFYHOST   => 2,
        CURLOPT_BUFFERSIZE       => 65536,
        CURLOPT_NOPROGRESS       => false,
        /* Pin the connection to the address that was just checked. Without
           this, curl resolves the name again and the check means nothing. */
        CURLOPT_RESOLVE          => array($chost . ':' . $cport . ':' . $pinIp),
        CURLOPT_PROGRESSFUNCTION => function ($res, $dlTotal, $dlNow) use ($MAX_BYTES) {
            return ($dlNow > $MAX_BYTES) ? 1 : 0;
        },
    );
    /* CURLOPT_PROTOCOLS is the older spelling; the _STR form replaced it and
       avoids a deprecation notice on newer builds. */
    if (defined('CURLOPT_PROTOCOLS_STR')) {
        $opts[CURLOPT_PROTOCOLS_STR] = 'http,https';
    } else {
        $opts[CURLOPT_PROTOCOLS] = CURLPROTO_HTTP | CURLPROTO_HTTPS;
    }
    curl_setopt_array($ch, $opts);

    $raw = curl_exec($ch);
    if ($raw === false) {
        $err = curl_error($ch);
        curl_close($ch);
        out(array('error' => 'Fetch failed: ' . $err, 'url' => $current), 200);
    }
    $status  = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $hSize   = (int)curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    $rawHead = substr($raw, 0, $hSize);
    $body    = substr($raw, $hSize);
    curl_close($ch);

    $headers = array();
    foreach (explode("\r\n", $rawHead) as $line) {
        $p = strpos($line, ':');
        if ($p > 0) $headers[strtolower(trim(substr($line, 0, $p)))] = trim(substr($line, $p + 1));
    }
    $finalUrl = $current;

    if ($status >= 300 && $status < 400 && !empty($headers['location'])) {
        $next = sec_absolute_url($headers['location'], $current);
        if ($next === null) {
            $redirects[] = array('from' => $current, 'to' => $headers['location'], 'status' => $status, 'note' => 'unparseable, not followed');
            break;
        }
        $np      = parse_url($next);
        $nscheme = isset($np['scheme']) ? strtolower($np['scheme']) : '';
        if ($nscheme !== 'http' && $nscheme !== 'https') {
            $redirects[] = array('from' => $current, 'to' => $next, 'status' => $status, 'note' => 'non-http scheme, not followed');
            break;
        }
        $nhost = isset($np['host']) ? strtolower(trim($np['host'], '[]')) : '';
        if (!sec_host_allowed($nhost)) {
            $redirects[] = array('from' => $current, 'to' => $next, 'status' => $status, 'note' => 'off-allowlist, not followed');
            break;
        }
        if ($hop >= $MAX_REDIRECTS) {
            $redirects[] = array('from' => $current, 'to' => $next, 'status' => $status, 'note' => 'redirect limit reached');
            break;
        }
        $redirects[] = array('from' => $current, 'to' => $next, 'status' => $status);
        $current = $next;
        continue;
    }
    break;
}

$truncated = false;
if (strlen($body) > $MAX_BYTES) {
    $body = substr($body, 0, $MAX_BYTES);
    $truncated = true;
}

if ($binary) {
    header_remove('Content-Type');
    header('Content-Type: application/octet-stream');
    header('X-Proxy-Status: ' . (int)$status);
    echo $body;
    exit;
}

$text = $body;
if (function_exists('mb_convert_encoding')) {
    $text = mb_convert_encoding($body, 'UTF-8', 'UTF-8');
} elseif (function_exists('iconv')) {
    $conv = @iconv('UTF-8', 'UTF-8//IGNORE', $body);
    if ($conv !== false) $text = $conv;
}

out(array(
    'ok'        => true,
    'status'    => $status,
    'url'       => $url,
    'finalUrl'  => $finalUrl,
    'redirects' => $redirects,
    'headers'   => $headers,
    'bytes'     => strlen($body),
    'ms'        => (int)round((microtime(true) - $start) * 1000),
    'truncated' => $truncated,
    'body'      => $text,
));
