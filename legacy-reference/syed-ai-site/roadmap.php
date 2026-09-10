<?php
/**
 * syed.ai — personalised AI strategy roadmap
 * ---------------------------------------------------------------------------
 * Included by send.php. Takes what the visitor told us plus a light, safe read
 * of their own site, and produces a ranked plan that is actually about them
 * rather than a template with a name merged into it.
 *
 * The scan stays deliberately small — six requests at most: the homepage, up
 * to two internal pages found in its own links, robots.txt, llms.txt and
 * sitemap.xml. That is enough to measure whether a page can be retrieved at
 * all, whether the entity behind it is identifiable, and whether there is a
 * liftable answer on it; and it is the most that can be done in seconds
 * without behaving like a crawler on someone else's server.
 *
 * It is not an audit. It cannot see who is being recommended instead of them,
 * which is the thing that actually matters — so every number it reports is
 * paired with the range I would want it in, and the email says plainly what
 * the machine could not know.
 */

declare(strict_types=1);

if (!defined('SYEDAI_ENDPOINT')) { http_response_code(404); exit; }

/* ══ Safe fetch ═══════════════════════════════════════════════════════════
   Anything that takes a URL from a stranger and fetches it server-side is an
   SSRF hole until proven otherwise. The rules here: http(s) only, public IPs
   only (re-checked on every redirect hop), no userinfo, standard ports, a hard
   size cap and a short timeout.                                              */

/* PHP's NO_PRIV_RANGE and NO_RES_RANGE between them cover 10/8, 172.16/12,
   192.168/16, 127/8, 169.254/16, 0/8 and the IPv6 equivalents — but not every
   range that can reach something it should not. 100.64.0.0/10 in particular
   (RFC 6598 shared address space) is treated as public by the filter and is
   routed to provider infrastructure on a good many hosts, so a hostname
   pointed there would sail through. These are the gaps, blocked by hand. */
const RM_BLOCKED_V4 = [
    ['100.64.0.0',   10],   // RFC 6598 carrier-grade NAT — reaches provider kit
    ['192.0.0.0',    24],   // IETF protocol assignments
    ['192.0.2.0',    24],   // documentation
    ['198.18.0.0',   15],   // benchmarking
    ['198.51.100.0', 24],   // documentation
    ['203.0.113.0',  24],   // documentation
    ['224.0.0.0',     4],   // multicast
];

function rm_ip_in_cidr(string $ip, string $net, int $bits): bool {
    $a = ip2long($ip); $b = ip2long($net);
    if ($a === false || $b === false) { return false; }
    $mask = $bits === 0 ? 0 : (-1 << (32 - $bits)) & 0xFFFFFFFF;
    return (($a & $mask) === ($b & $mask));
}

function rm_is_public_ip(string $ip): bool {
    if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4 | FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
        foreach (RM_BLOCKED_V4 as [$net, $bits]) {
            if (rm_ip_in_cidr($ip, $net, $bits)) { return false; }
        }
        return true;
    }
    if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6 | FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
        $low = strtolower($ip);
        // Unique-local, link-local, and anything tunnelling an IPv4 address.
        if (preg_match('~^(f[cd]|fe8|fe9|fea|feb)~', $low)) { return false; }
        if (str_contains($low, '::ffff:') || str_contains($low, '::')) {
            // 6to4 / IPv4-mapped forms can smuggle a private v4 address through.
            if (preg_match('~(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})~', $low, $m)) {
                return rm_is_public_ip($m[1]);
            }
        }
        return true;
    }
    return false;
}

/** Every IP the host resolves to must be public — one private answer is enough to refuse. */
function rm_host_is_safe(string $host): bool {
    if ($host === '' || !str_contains($host, '.')) { return false; }
    if (filter_var($host, FILTER_VALIDATE_IP)) { return rm_is_public_ip($host); }
    $ips = [];
    foreach ((array)@dns_get_record($host, DNS_A) as $r)    { if (!empty($r['ip']))   { $ips[] = $r['ip']; } }
    foreach ((array)@dns_get_record($host, DNS_AAAA) as $r) { if (!empty($r['ipv6'])) { $ips[] = $r['ipv6']; } }
    if (!$ips) { return false; }
    foreach ($ips as $ip) { if (!rm_is_public_ip($ip)) { return false; } }
    return true;
}

function rm_normalise_url(string $raw): ?string {
    /* No control characters, anywhere — checked BEFORE trim, deliberately.
       PHP's trim() quietly eats NUL, tab, CR and LF at the ends, which turns a
       payload into a clean-looking URL and hides that anything was attempted.
       There is no legitimate URL that needs a control character, so this is a
       refusal rather than a sanitisation, and it happens first. */
    if (preg_match('~[\x00-\x1F\x7F]~', $raw)) { return null; }
    $raw = trim($raw);
    if ($raw === '' || strlen($raw) > 300) { return null; }
    if (preg_match('~\s~', $raw)) { return null; }
    if (!preg_match('~^https?://~i', $raw)) { $raw = 'https://' . $raw; }
    $p = parse_url($raw);
    if (!$p || empty($p['host'])) { return null; }
    if (!in_array(strtolower($p['scheme'] ?? ''), ['http', 'https'], true)) { return null; }
    if (isset($p['user']) || isset($p['pass'])) { return null; }
    if (isset($p['port']) && !in_array((int)$p['port'], [80, 443], true)) { return null; }
    $host = strtolower($p['host']);
    if (!preg_match('/^[a-z0-9.\-]+$/', $host) || !str_contains($host, '.')) { return null; }
    $port = isset($p['port']) ? ':' . (int)$p['port'] : '';
    /* The query has to survive. A redirect to /?lang=en re-fetched without it
       either 404s or bounces straight back here, and a scan then reports a
       healthy site as unreachable. It is validated the same as the rest. */
    $query = isset($p['query']) && $p['query'] !== '' ? '?' . $p['query'] : '';
    return strtolower($p['scheme']) . '://' . $host . $port . ($p['path'] ?? '/') . $query;
}

/** @return array{ok:bool,status:int,body:string,url:string,ms:int,headers:array<string,string>} */
function rm_fetch(string $url, int $maxBytes = 300000): array {
    $out = ['ok' => false, 'status' => 0, 'body' => '', 'url' => $url, 'ms' => 0, 'headers' => []];
    $t0  = microtime(true);

    for ($hop = 0; $hop < 3; $hop++) {
        $u = rm_normalise_url($url);
        if ($u === null) { return $out; }
        $host = (string)parse_url($u, PHP_URL_HOST);
        if (!rm_host_is_safe($host)) { return $out; }

        $body = '';
        /* Headers are worth as much as the body here. An x-robots-tag of
           noindex is invisible in the HTML and silently removes the page from
           every index — you cannot find it by reading the source. */
        $heads = [];
        $ch = curl_init($u);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER  => false,
            CURLOPT_FOLLOWLOCATION  => false,        // hops are re-validated by hand
            CURLOPT_CONNECTTIMEOUT  => 3,
            CURLOPT_TIMEOUT         => 6,
            CURLOPT_SSL_VERIFYPEER  => true,
            CURLOPT_SSL_VERIFYHOST  => 2,
            CURLOPT_PROTOCOLS_STR   => 'http,https',
            CURLOPT_USERAGENT       => 'syed.ai-roadmap/1.0 (+https://syed.ai/; one-off check requested by the site owner)',
            CURLOPT_ACCEPT_ENCODING => '',
            CURLOPT_HEADER          => false,
            CURLOPT_HEADERFUNCTION  => function ($ch, $line) use (&$heads) {
                $len = strlen($line);
                if (count($heads) < 60 && str_contains($line, ':')) {
                    [$k, $v] = explode(':', $line, 2);
                    $k = strtolower(trim($k));
                    if ($k !== '' && strlen($k) < 64) { $heads[$k] = trim(mb_substr($v, 0, 300)); }
                }
                return $len;
            },
            CURLOPT_WRITEFUNCTION   => function ($ch, $chunk) use (&$body, $maxBytes) {
                $body .= $chunk;
                if (strlen($body) > $maxBytes) { return 0; }   // abort the transfer
                return strlen($chunk);
            },
        ]);
        curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $loc    = (string)curl_getinfo($ch, CURLINFO_REDIRECT_URL);
        $ip     = (string)curl_getinfo($ch, CURLINFO_PRIMARY_IP);
        curl_close($ch);

        // A DNS answer can change between resolve and connect; check what we actually talked to.
        if ($ip !== '' && !rm_is_public_ip($ip)) { return $out; }

        if (in_array($status, [301, 302, 303, 307, 308], true) && $loc !== '') {
            $url = $loc;
            continue;
        }
        $out = ['ok' => $status >= 200 && $status < 300, 'status' => $status,
                'body' => $body, 'url' => $u, 'ms' => (int)round((microtime(true) - $t0) * 1000),
                'headers' => $heads];
        return $out;
    }
    return $out;
}

/* ══ The scan ═════════════════════════════════════════════════════════════ */

const RM_AGENTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'ClaudeBot', 'Google-Extended', 'anthropic-ai'];

/** Whole-scan budget. The scan now makes up to six requests — homepage,
    robots.txt, llms.txt, sitemap.xml and two internal pages — so the ceiling
    goes up with it. This costs the visitor nothing: send.php has already
    closed the response and answered them before any of this runs, so the only
    thing the budget protects is the PHP worker. Every optional fetch is gated
    on it, and a scan that runs out of time reports what it got rather than
    failing. */
function rm_budget_left(float $started, float $budget = 24.0): bool {
    return (microtime(true) - $started) < $budget;
}

/**
 * Answer-shape metrics.
 *
 * Everything here is a proxy for one question: if a model retrieves this page,
 * is there a liftable answer on it? Word count alone does not decide that. A
 * 2,000-word page whose first paragraph is a mission statement gets skipped;
 * a 500-word page that answers in its opening lines gets quoted.
 */
function rm_text_metrics(string $html): array {
    $m = [];
    $m['html_bytes'] = strlen($html);

    // Strip the chrome before counting words, so navigation does not inflate it.
    $stripped = preg_replace('~<(script|style|nav|header|footer|svg|noscript)[^>]*>.*?</\1>~is', ' ', $html) ?? $html;
    $text = trim(preg_replace('~\s+~', ' ', html_entity_decode(strip_tags($stripped), ENT_QUOTES, 'UTF-8')) ?? '');
    $m['words']   = $text === '' ? 0 : count(explode(' ', $text));
    $m['opening'] = mb_substr($text, 0, 400);

    /* Text-to-markup ratio. Below about 3% on a page of any size means the
       readable content is a rounding error next to the framework — usually a
       shell that paints itself with JavaScript. */
    $m['text_ratio'] = $m['html_bytes'] > 0
        ? round(strlen($text) / $m['html_bytes'] * 100, 1) : 0.0;

    /* An app shell serves almost no text and hands the browser a mount point.
       Google renders JavaScript; the assistant crawlers largely do not, so a
       page like this is retrievable in theory and empty in practice. */
    $shellMark = (bool)preg_match('~<div[^>]+id=["\'](root|app|__next|__nuxt)["\']~i', $html)
              || (bool)preg_match('~data-reactroot|ng-app=|__NEXT_DATA__~i', $html);
    $m['app_shell'] = $shellMark && $m['words'] < 250;

    /* The first substantial paragraph is what an extractive model reaches for.
       Under ~25 words it is a strapline; over ~130 it is an essay and the
       answer is buried inside it. */
    $m['first_para_words'] = 0;
    if (preg_match_all('~<p[^>]*>(.*?)</p>~is', $stripped, $pp)) {
        foreach ($pp[1] as $para) {
            $t = trim(preg_replace('~\s+~', ' ', html_entity_decode(strip_tags($para), ENT_QUOTES, 'UTF-8')) ?? '');
            $w = $t === '' ? 0 : count(explode(' ', $t));
            if ($w >= 15) { $m['first_para_words'] = $w; $m['first_para'] = mb_substr($t, 0, 300); break; }
        }
    }

    $m['h2'] = preg_match_all('~<h2[\s>]~i', $html);
    $m['h3'] = preg_match_all('~<h3[\s>]~i', $html);

    /* Headings phrased as questions are the cheapest retrieval win there is:
       they match the shape of what the user typed. */
    $m['q_headings'] = 0;
    if (preg_match_all('~<h([2-4])[^>]*>(.*?)</h\1>~is', $html, $hh)) {
        foreach ($hh[2] as $t) {
            if (str_ends_with(rtrim(html_entity_decode(strip_tags($t), ENT_QUOTES, 'UTF-8')), '?')) { $m['q_headings']++; }
        }
    }

    $m['tables'] = preg_match_all('~<table[\s>]~i', $html);
    $m['lists']  = preg_match_all('~<(ul|ol)[\s>]~i', $html);
    $m['dl']     = preg_match_all('~<dl[\s>]~i', $html);

    /* Concrete numbers are what makes a claim quotable. A page with no digits
       in it is making assertions a model has no reason to repeat. */
    $digits = preg_match_all('~\d~', $text);
    $m['digits_per_100w'] = $m['words'] > 0 ? round($digits / $m['words'] * 100, 1) : 0.0;

    /* Long sentences survive summarising badly — they get cut in the middle and
       the claim goes with the second half. */
    $sent = preg_split('~(?<=[.!?])\s+~', $text) ?: [];
    $sent = array_values(array_filter($sent, fn($x) => str_word_count($x) > 2));
    $m['sentences']    = count($sent);
    $m['avg_sentence'] = $m['sentences'] > 0
        ? (int)round(array_sum(array_map('str_word_count', $sent)) / $m['sentences']) : 0;

    // Latest year that appears in the prose — a rough freshness signal.
    $m['year'] = 0;
    if (preg_match_all('~\b(20[12]\d)\b~', $text, $yy)) { $m['year'] = max(array_map('intval', $yy[1])); }

    return $m;
}

/**
 * Retrieval readiness, 0–100.
 *
 * Deliberately weighted so that being crawlable and being identifiable
 * outweigh every cosmetic tag: a site with perfect meta tags that blocks GPTBot
 * scores worse than a plain one that does not, because that is the truth of it.
 * Reported with its own components so the number is auditable rather than
 * oracular — a score you cannot take apart is a score nobody should trust.
 *
 * @return array{score:int,band:string,parts:array<int,array{0:string,1:int,2:int,3:string}>}
 */
function rm_score(array $s): array {
    $parts = [];
    $add = function (string $label, int $got, int $max, string $note) use (&$parts) {
        $parts[] = [$label, max(0, min($got, $max)), $max, $note];
    };

    if (!($s['reachable'] ?? false)) {
        return ['score' => 0, 'band' => 'not measured',
                'parts' => [['Reachable', 0, 100, 'the scan could not read the site']]];
    }

    // 1 ── Retrievable at all (25)
    $g = 25; $why = [];
    if ($s['blocked'] ?? []) { $g -= 18; $why[] = count($s['blocked']) . ' AI agent(s) blocked in robots.txt'; }
    if ($s['noindex'] ?? false)   { $g -= 12; $why[] = 'noindex is set'; }
    if (!($s['https'] ?? true))   { $g -= 5;  $why[] = 'no HTTPS'; }
    if ($s['app_shell'] ?? false) { $g -= 10; $why[] = 'the text needs JavaScript to appear'; }
    $add('Can be retrieved', $g, 25, $why ? implode('; ', $why) : 'nothing is standing in the way');

    // 2 ── Identifiable as a business (20)
    $has  = array_map('strtolower', $s['schema_types'] ?? []);
    $core = (bool)array_intersect(['organization','localbusiness','professionalservice','corporation'], $has);
    $g = 0; $why = [];
    if ($s['schema'] ?? false) { $g += 6; } else { $why[] = 'no structured data at all'; }
    if ($core) { $g += 8; }
    elseif (in_array('person', $has, true)) { $g += 4; $why[] = 'a Person node but no Organization'; }
    elseif ($s['schema'] ?? false) { $why[] = 'no Organization-type node'; }
    $sa = (int)($s['sameas'] ?? 0);
    if ($sa >= 3) { $g += 6; } elseif ($sa >= 1) { $g += 3; $why[] = 'only ' . $sa . ' sameAs link'; }
    else { $why[] = 'no sameAs links to corroborating profiles'; }
    $add('Identifiable entity', $g, 20, $why ? implode('; ', $why) : 'named, typed and cross-referenced');

    // 3 ── Has a liftable answer (20)
    $w = (int)($s['words'] ?? 0); $fp = (int)($s['first_para_words'] ?? 0);
    $g = 0; $why = [];
    if ($w >= 600) { $g += 8; } elseif ($w >= 300) { $g += 4; $why[] = $w . ' words is thin'; }
    else { $why[] = 'only ' . $w . ' readable words'; }
    if ($fp >= 25 && $fp <= 130) { $g += 8; }
    elseif ($fp > 0) { $g += 3; $why[] = 'the opening paragraph is ' . $fp . ' words'; }
    else { $why[] = 'no substantial opening paragraph'; }
    if ((float)($s['digits_per_100w'] ?? 0) >= 1.5) { $g += 4; } else { $why[] = 'almost no numbers in the prose'; }
    $add('Liftable answer', $g, 20, $why ? implode('; ', $why) : 'opens with a real, specific answer');

    // 4 ── Shaped like an answer (15)
    $g = 0; $why = [];
    if ((int)($s['h1'] ?? 0) === 1) { $g += 4; } else { $why[] = ($s['h1'] ?? 0) . ' H1 headings'; }
    if ((int)($s['h2'] ?? 0) >= 3) { $g += 4; } else { $why[] = 'a flat outline'; }
    if ((int)($s['q_headings'] ?? 0) >= 1) { $g += 4; } else { $why[] = 'no question-shaped headings'; }
    if ((int)($s['tables'] ?? 0) >= 1) { $g += 3; } else { $why[] = 'no comparison table'; }
    $add('Answer shape', $g, 15, $why ? implode('; ', $why) : 'outlined and tabulated the way answers get built');

    // 5 ── The basics still matter (12)
    $g = 0; $why = [];
    $t = (int)($s['title_len'] ?? 0); $d = (int)($s['desc_len'] ?? 0);
    if ($t >= 25 && $t <= 65) { $g += 4; } else { $why[] = 'title is ' . $t . ' characters'; }
    if ($d >= 110 && $d <= 165) { $g += 4; } else { $why[] = 'description is ' . $d . ' characters'; }
    if ($s['canonical'] ?? false) { $g += 2; } else { $why[] = 'no canonical'; }
    if ($s['og_image'] ?? false)  { $g += 2; } else { $why[] = 'no og:image'; }
    $add('Fundamentals', $g, 12, $why ? implode('; ', $why) : 'all four in range');

    // 6 ── Fresh and quick (8)
    $g = 0; $why = [];
    if (($s['date_modified'] ?? false) || ($s['last_modified'] ?? '') !== '') { $g += 4; }
    else { $why[] = 'nothing states when the page last changed'; }
    $ms = (int)($s['ms'] ?? 0);
    if ($ms > 0 && $ms <= 1500) { $g += 4; } else { $why[] = $ms . 'ms to first byte'; }
    $add('Fresh and quick', $g, 8, $why ? implode('; ', $why) : 'dated and fast');

    $score = array_sum(array_map(fn($p) => $p[1], $parts));
    $band = $score >= 80 ? 'strong' : ($score >= 60 ? 'workable' : ($score >= 40 ? 'weak' : 'not retrievable yet'));
    return ['score' => (int)$score, 'band' => $band, 'parts' => $parts];
}

function rm_scan(string $site): array {
    $t0 = microtime(true);
    $base = rm_normalise_url($site);
    $r = ['reachable' => false, 'url' => $base];
    if ($base === null) { return $r; }
    $port   = parse_url($base, PHP_URL_PORT);
    $origin = (string)parse_url($base, PHP_URL_SCHEME) . '://' . (string)parse_url($base, PHP_URL_HOST)
            . ($port ? ':' . (int)$port : '');

    $home = rm_fetch($origin . '/');
    $r['reachable'] = $home['ok'];
    $r['status']    = $home['status'];
    $r['ms']        = $home['ms'];
    $r['final']     = $home['url'];
    $r['https']     = str_starts_with((string)$home['url'], 'https://');
    $r['requests']  = 1;
    $r['scan_ms']   = (int)round((microtime(true) - $t0) * 1000);
    if (!$home['ok']) { return $r; }

    $html = $home['body'];
    $r['bytes'] = strlen($html);

    preg_match('~<title[^>]*>(.*?)</title>~is', $html, $m);
    $r['title'] = isset($m[1]) ? trim(html_entity_decode(strip_tags($m[1]), ENT_QUOTES, 'UTF-8')) : '';
    $r['title_len'] = mb_strlen($r['title']);

    preg_match('~<meta[^>]+name=["\']description["\'][^>]+content=["\'](.*?)["\']~is', $html, $m);
    $r['desc'] = isset($m[1]) ? trim(html_entity_decode($m[1], ENT_QUOTES, 'UTF-8')) : '';
    $r['desc_len'] = mb_strlen($r['desc']);

    $r['h1'] = preg_match_all('~<h1[\s>]~i', $html);
    preg_match('~<h1[^>]*>(.*?)</h1>~is', $html, $m);
    $r['h1_text'] = isset($m[1]) ? trim(html_entity_decode(strip_tags($m[1]), ENT_QUOTES, 'UTF-8')) : '';

    $r['canonical'] = (bool)preg_match('~<link[^>]+rel=["\']canonical["\']~i', $html);
    $r['og']        = (bool)preg_match('~<meta[^>]+property=["\']og:(title|image)["\']~i', $html);
    $r['og_image']  = (bool)preg_match('~<meta[^>]+property=["\']og:image["\']~i', $html);
    $r['viewport']  = (bool)preg_match('~<meta[^>]+name=["\']viewport["\']~i', $html);

    /* Structured data: which @types are declared.
       @type legitimately takes two shapes — "@type": "Organization" and
       "@type": ["ProfessionalService","Organization"] — and reading only the
       first is how a scan tells a correctly-marked-up site that it has no
       Organization node. It is a valid multi-type node, not an edge case, and
       it is what schema.org recommends for a business that is also a service. */
    $types = [];
    if (preg_match_all('~<script[^>]+application/ld\+json[^>]*>(.*?)</script>~is', $html, $mm)) {
        foreach ($mm[1] as $blob) {
            if (preg_match_all('~"@type"\s*:\s*("[^"]+"|\[[^\]]*\])~', $blob, $tt)) {
                foreach ($tt[1] as $raw) {
                    if (str_starts_with($raw, '[')) {
                        if (preg_match_all('~"([^"]+)"~', $raw, $inner)) {
                            foreach ($inner[1] as $t) { $types[trim($t)] = true; }
                        }
                    } else {
                        $types[trim($raw, '"')] = true;
                    }
                }
            }
        }
    }
    $r['schema_types'] = array_keys($types);
    $r['schema']       = (bool)$types;

    // Answer shape: word count, opening paragraph, outline, tables, numbers.
    $r += rm_text_metrics($html);

    /* Response headers. x-robots-tag is the one that matters most and the one
       nobody checks, because it does not appear in the page source at all. */
    $hd = $home['headers'] ?? [];
    $r['server']        = (string)($hd['server'] ?? '');
    $r['encoding']      = (string)($hd['content-encoding'] ?? '');
    $r['hsts']          = isset($hd['strict-transport-security']);
    $r['last_modified'] = (string)($hd['last-modified'] ?? '');
    $r['x_robots']      = (string)($hd['x-robots-tag'] ?? '');

    // noindex, from either source. Either one removes the page from the index.
    preg_match('~<meta[^>]+name=["\']robots["\'][^>]+content=["\']([^"\']*)~i', $html, $m);
    $r['meta_robots'] = isset($m[1]) ? strtolower(trim($m[1])) : '';
    $r['noindex'] = str_contains($r['meta_robots'], 'noindex')
                 || str_contains(strtolower($r['x_robots']), 'noindex');

    /* sameAs is the corroboration hook: it is how a model ties this site to the
       LinkedIn, Crunchbase or directory profile that says the same thing. */
    $r['sameas'] = 0; $r['sameas_hosts'] = [];
    if (preg_match_all('~"sameAs"\s*:\s*(\[[^\]]*\]|"[^"]*")~i', $html, $sm)) {
        foreach ($sm[1] as $blob) {
            if (preg_match_all('~https?://([a-z0-9.\-]+)~i', $blob, $hh)) {
                foreach ($hh[1] as $host) {
                    $host = strtolower(preg_replace('~^www\.~', '', $host) ?? $host);
                    $r['sameas_hosts'][$host] = true;
                }
            }
        }
    }
    $r['sameas_hosts'] = array_slice(array_keys($r['sameas_hosts']), 0, 8);
    $r['sameas'] = count($r['sameas_hosts']);
    $r['schema_ids']    = (bool)preg_match('~"@id"\s*:~', $html);
    $r['date_modified'] = (bool)preg_match('~"dateModified"\s*:~i', $html);
    $r['faq_q']         = preg_match_all('~"@type"\s*:\s*(?:"Question"|\[[^\]]*"Question")~i', $html);

    // Internal link volume, and the pages worth a second look.
    $host = (string)parse_url($origin, PHP_URL_HOST);
    $r['int_links'] = 0; $r['ext_links'] = 0;
    $candidates = [];
    if (preg_match_all('~<a\s[^>]*href=["\']([^"\'#]+)["\']~i', $html, $lm)) {
        foreach ($lm[1] as $href) {
            if (preg_match('~^(mailto:|tel:|javascript:)~i', $href)) { continue; }
            $abs = null;
            if (str_starts_with($href, '/')) { $abs = $origin . $href; }
            elseif (preg_match('~^https?://~i', $href)) {
                $h = strtolower((string)parse_url($href, PHP_URL_HOST));
                if ($h === $host || $h === 'www.' . $host || 'www.' . $h === $host) { $abs = $href; }
                else { $r['ext_links']++; continue; }
            } else { continue; }
            $r['int_links']++;
            $path = (string)parse_url($abs, PHP_URL_PATH);
            // Skip assets, and skip the homepage itself — it is already scanned.
            if ($path === '' || $path === '/' ) { continue; }
            if (preg_match('~\.(jpe?g|png|webp|gif|svg|pdf|zip|css|js|ico|woff2?|mp4)$~i', $path)) { continue; }
            $candidates[$abs] = true;
        }
    }

    /* Two internal pages, scanned lightly. One page tells you about one page;
       three tell you whether the pattern is the site. Templated titles and a
       200-word body repeated across a site is a different diagnosis from one
       thin homepage, and it changes what the plan says. */
    $r['pages'] = [];
    foreach (array_slice(array_keys($candidates), 0, 2) as $u) {
        if (!rm_budget_left($t0)) { break; }
        $pg = rm_fetch($u, 200000);
        if (!$pg['ok']) {
            $r['pages'][] = ['url' => $u, 'status' => $pg['status'], 'ok' => false];
            continue;
        }
        $pm = rm_text_metrics($pg['body']);
        preg_match('~<title[^>]*>(.*?)</title>~is', $pg['body'], $tm);
        $ptitle = isset($tm[1]) ? trim(html_entity_decode(strip_tags($tm[1]), ENT_QUOTES, 'UTF-8')) : '';
        preg_match('~<meta[^>]+name=["\']description["\'][^>]+content=["\'](.*?)["\']~is', $pg['body'], $dm);
        $r['pages'][] = [
            'url'    => $pg['url'],
            'ok'     => true,
            'status' => $pg['status'],
            'ms'     => $pg['ms'],
            'title'  => $ptitle,
            'title_len' => mb_strlen($ptitle),
            'desc_len'  => isset($dm[1]) ? mb_strlen(trim($dm[1])) : 0,
            'h1'     => preg_match_all('~<h1[\s>]~i', $pg['body']),
            'words'  => $pm['words'],
            'first_para_words' => $pm['first_para_words'],
            'schema' => (bool)preg_match('~application/ld\+json~i', $pg['body']),
        ];
    }

    // robots.txt — the single highest-yield check in the whole scan
    $rob = rm_budget_left($t0) ? rm_fetch($origin . '/robots.txt', 60000) : ['ok'=>false,'body'=>'','status'=>0,'url'=>'','ms'=>0];
    $r['robots'] = $rob['ok'];
    $r['blocked'] = [];
    if ($rob['ok']) {
        $lines = preg_split('~\R~', strtolower($rob['body'])) ?: [];
        $cur = [];
        foreach ($lines as $ln) {
            $ln = trim($ln);
            if (str_starts_with($ln, 'user-agent:')) {
                $ua = trim(substr($ln, 11));
                $cur = ($ua === '') ? $cur : [$ua];
            } elseif (str_starts_with($ln, 'disallow:') && $cur) {
                $path = trim(substr($ln, 9));
                if ($path === '/' ) {
                    foreach (RM_AGENTS as $a) {
                        if (in_array(strtolower($a), $cur, true) || in_array('*', $cur, true)) { $r['blocked'][$a] = true; }
                    }
                }
            } elseif ($ln === '') { $cur = []; }
        }
    }
    $r['blocked'] = array_keys($r['blocked']);

    $llms = rm_budget_left($t0) ? rm_fetch($origin . '/llms.txt', 40000) : ['ok'=>false,'body'=>'','status'=>0,'url'=>'','ms'=>0];
    /* A missing llms.txt and a soft-404 HTML page served in its place are the
       same thing in practice, and the second is more common than the first. */
    $r['llms'] = $llms['ok'] && !str_contains(strtolower(substr($llms['body'], 0, 200)), '<html');
    $r['llms_urls'] = $r['llms'] ? preg_match_all('~https?://~', $llms['body']) : 0;

    /* Sitemap size is the cheapest read there is on how much of the site is
       actually offered up for indexing. An index file that points at other
       sitemaps counts its children, not its URLs, so both are reported. */
    $r['sitemap'] = false; $r['sitemap_urls'] = 0; $r['sitemap_index'] = false;
    if (rm_budget_left($t0)) {
        $sm = rm_fetch($origin . '/sitemap.xml', 300000);
        if ($sm['ok'] && str_contains(strtolower(substr($sm['body'], 0, 400)), '<')) {
            $r['sitemap'] = true;
            $r['sitemap_index'] = (bool)preg_match('~<sitemapindex~i', $sm['body']);
            $r['sitemap_urls']  = preg_match_all('~<loc>~i', $sm['body']);
            // 300KB is the read cap, so a large sitemap is a floor not a count.
            $r['sitemap_capped'] = strlen($sm['body']) >= 299000;
        }
    }

    $r['requests'] = 3 + count($r['pages']) + ($r['sitemap'] ? 1 : 0);
    $r['scan_ms']  = (int)round((microtime(true) - $t0) * 1000);

    return $r;
}

/* ══ Findings ═════════════════════════════════════════════════════════════ */

function rm_findings(array $s, array $a): array {
    $f = [];
    $add = function (string $sev, string $t, string $d, string $fix) use (&$f) {
        $f[] = ['sev' => $sev, 'title' => $t, 'detail' => $d, 'fix' => $fix];
    };

    if (!($s['reachable'] ?? false)) {
        $add('major', 'I could not read your site automatically',
            'The check timed out or was refused, which usually means a bot rule, a firewall or a country block rather than anything wrong with the site. Worth knowing: the assistants use crawlers too, and they get refused the same way.',
            'Send me the URL in a reply and I will look manually. If it is a bot rule, that alone may be the finding.');
        return $f;
    }

    /* Two findings that outrank everything else, because they do not degrade
       visibility — they remove the page entirely. Both are invisible in a
       browser, which is why they survive for years on otherwise careful sites. */
    if ($s['noindex'] ?? false) {
        $src = ($s['x_robots'] ?? '') !== '' && str_contains(strtolower((string)$s['x_robots']), 'noindex')
            ? 'an x-robots-tag HTTP header (' . $s['x_robots'] . ')'
            : 'a meta robots tag (' . ($s['meta_robots'] ?: 'noindex') . ')';
        $add('critical', 'Your homepage is set to noindex',
            'The page carries ' . $src . ', which asks every search engine to drop it from the index. '
            . 'It looks completely normal in a browser — this is the single most expensive thing that can be '
            . 'wrong with a site, and it is almost always left over from a staging environment or a plugin default.',
            'Remove the noindex directive today, then request re-indexing in Google Search Console. Nothing else on '
            . 'this list is worth doing until this is gone.');
    }

    if ($s['app_shell'] ?? false) {
        $add('critical', 'Your homepage text only appears after JavaScript runs',
            'The HTML that arrives holds roughly ' . (int)($s['words'] ?? 0) . ' readable words and a mount point '
            . 'for a JavaScript app; the text ratio is ' . (float)($s['text_ratio'] ?? 0) . '% against a healthy '
            . '5–25%. Google renders JavaScript. The assistant crawlers largely do not — so the page is retrievable '
            . 'in theory and blank in practice.',
            'Server-render the page, or pre-render it at build time. If neither is realistic, publish the key '
            . 'answers as static pages alongside the app — that alone is usually enough to get cited.');
    }

    if ($s['blocked'] ?? []) {
        $add('critical', 'Your robots.txt blocks ' . count($s['blocked']) . ' AI crawler(s)',
            'Blocked: ' . implode(', ', $s['blocked']) . '. These are the agents that fetch pages to answer questions. While they are disallowed, no amount of content or schema work can get you cited — the page is never read.',
            'Allow at minimum GPTBot, OAI-SearchBot, ChatGPT-User and PerplexityBot. This is usually a one-line change and it is the highest-value fix on this list by a wide margin.');
    } elseif (!($s['robots'] ?? false)) {
        $add('minor', 'No robots.txt found',
            'Not harmful in itself — everything is allowed by default. But it means nothing is stated explicitly, so a future CDN or plugin default can start blocking AI agents without anyone noticing.',
            'Publish a robots.txt that names the AI agents you allow. It makes the policy deliberate instead of accidental.');
    } else {
        $add('ok', 'AI crawlers are not blocked in robots.txt',
            'GPTBot, OAI-SearchBot, PerplexityBot and the rest can reach your pages. That is the precondition for everything else, and a surprising number of sites fail it.',
            'Re-check after any CDN, host or security-plugin change — this is the setting most likely to regress silently.');
    }

    if (!($s['schema'] ?? false)) {
        $add('critical', 'No structured data on the homepage',
            'There is no JSON-LD, so nothing on the page states in machine-readable form what the business is, what it sells or where it operates. Models fall back to inferring it from prose, which is where miscategorisation starts.',
            'Add Organization (or LocalBusiness) and Service or Product schema, with the same category wording you use on the page and on your third-party profiles.');
    } else {
        $has = array_map('strtolower', $s['schema_types']);
        $core = array_intersect(['organization', 'localbusiness', 'professionalservice', 'corporation'], $has);
        if (!$core && in_array('person', $has, true)) {
            /* A one-person practice marking itself up as a Person is doing
               something reasonable, not something wrong — but it answers "who
               is this?" and leaves "what is this business?" unanswered, and
               the second is the question a buying prompt asks. */
            $add('major', 'You are marked up as a person, but not as a business',
                'Found: ' . implode(', ', array_slice($s['schema_types'], 0, 8)) . '. There is a Person node and no '
                . 'Organization-type node, so the markup says who you are without stating what the business is, what '
                . 'it sells or where it operates. A buying prompt asks the second question.',
                'Keep the Person node and add an Organization or ProfessionalService node beside it, with a stable '
                . '@id, the same category wording you use on the page, and founder pointing back at the Person.');
        } elseif (!$core) {
            $add('major', 'Structured data exists, but nothing identifies the business',
                'Found: ' . implode(', ', array_slice($s['schema_types'], 0, 8)) . '. None of it is an Organization-type node, so the markup describes pages rather than the entity behind them.',
                'Add an Organization or LocalBusiness node with a stable @id, and reference it as publisher from your page-level nodes.');
        } else {
            $add('ok', 'Business-level structured data is present',
                'Found: ' . implode(', ', array_slice($s['schema_types'], 0, 8)) . '. Good starting position.',
                'Next step is consistency: the category wording in your schema must match your homepage and your third-party profiles word for word.');
        }
        if (!array_intersect(['faqpage', 'question'], $has)) {
            $add('minor', 'No FAQ schema',
                'FAQ markup is one of the few remaining formats that both earns an expandable result in Google and gives an assistant a clean question-to-answer pair to lift.',
                'Mark up the questions you already answer on the site. Do not invent new ones — the schema must match visible text.');
        }
    }

    $t = (int)($s['title_len'] ?? 0);
    if ($t === 0) {
        $add('critical', 'The homepage has no title tag', 'The title is the strongest single statement of what a page is, for search engines and retrievers alike.', 'Write one of 50–60 characters that names what you do, not just the brand.');
    } elseif ($t > 65) {
        $add('minor', 'Homepage title is ' . $t . ' characters', 'It will be truncated in results, and the part that gets cut is usually the part that differentiates you.', 'Trim to 50–60 characters, with the specific claim first and the brand last.');
    } elseif ($t < 25) {
        $add('minor', 'Homepage title is only ' . $t . ' characters', 'Almost certainly just the brand name. That tells a model nothing about what you do.', 'Extend to 50–60 characters: what you do, for whom, then the brand.');
    }

    $d = (int)($s['desc_len'] ?? 0);
    if ($d === 0) {
        $add('major', 'No meta description on the homepage', 'Search engines will assemble one from whatever text they find, and assistants lose an easy summary of the page.', 'Write 140–155 characters that state the offer plainly, with a number in it if you have one.');
    } elseif ($d > 160) {
        $add('minor', 'Meta description is ' . $d . ' characters', 'It will be cut mid-sentence in results.', 'Trim to 150 or under, front-loading the claim.');
    }

    $h1 = (int)($s['h1'] ?? 0);
    if ($h1 === 0) {
        $add('major', 'No H1 on the homepage', 'The document outline has no top-level heading, which makes passage extraction less reliable and weakens the page for classic search too.', 'Add exactly one H1 that states the offer.');
    } elseif ($h1 > 1) {
        $add('minor', $h1 . ' H1 headings on the homepage', 'Multiple H1s flatten the outline, so a retriever cannot tell which claim is the primary one.', 'Keep one H1; demote the rest to H2.');
    }

    if (!($s['llms'] ?? false)) {
        $add('minor', 'No llms.txt',
            'Support is inconsistent and it is not a ranking factor, so this is genuinely low priority — but it takes an hour and costs nothing.',
            'Publish a plain-text index of your best pages at /llms.txt. Do it after the items above, not before.');
    }

    if (!($s['https'] ?? true)) {
        $add('critical', 'The site is not served over HTTPS', 'Browsers flag it, search engines discount it, and some crawlers will not fetch it at all.', 'Enable TLS. It is free on every mainstream host.');
    }
    if (!($s['og_image'] ?? true)) {
        $add('minor', 'No Open Graph image', 'Every share on LinkedIn, Slack or iMessage renders as a bare link, which measurably reduces clicks.', 'Add a purpose-built 1200×630 og:image.');
    }
    if ((int)($s['words'] ?? 0) < 300) {
        $add('major', 'The homepage has roughly ' . (int)$s['words'] . ' words of readable text',
            'There is very little for a retriever to lift. Pages that get quoted tend to make a specific, self-contained claim in prose — not only in headings and images.',
            'Add 300–600 words that answer the question a buyer actually asks, with the direct answer in the first 100 words.');
    }
    if ((int)($s['ms'] ?? 0) > 2500) {
        $add('minor', 'The homepage took ' . (int)$s['ms'] . 'ms to respond', 'Slow responses reduce crawl frequency, and crawl frequency is how quickly any of this work gets noticed.', 'Look at server response time before front-end optimisation; this is a backend number.');
    }

    /* ── Corroboration, which is where most of the movement lives ─────────── */
    $sa = (int)($s['sameas'] ?? 0);
    if ($sa === 0 && ($s['schema'] ?? false)) {
        $add('major', 'Nothing links your schema to any outside profile',
            'There are no sameAs links, so your markup asserts who you are without pointing at a single '
            . 'independent source that agrees. Corroboration is the mechanism that turns an assertion into a fact '
            . 'a model will repeat: in the Ahrefs data, 94% of an established brand’s new AI mentions came from '
            . 'third-party pages and only 6% from its own.',
            'Add sameAs links to your LinkedIn company page, Crunchbase, and the two or three directories that '
            . 'already rank for your brand name — then make sure the category wording on those profiles matches '
            . 'your site word for word.');
    } elseif ($sa > 0 && $sa < 3) {
        $add('minor', 'Only ' . $sa . ' sameAs link' . ($sa === 1 ? '' : 's') . ' in your structured data',
            'Found: ' . implode(', ', $s['sameas_hosts'] ?? []) . '. Three or more independent profiles saying the '
            . 'same thing about you is where corroboration starts to hold.',
            'Add the profiles you already own — LinkedIn, Crunchbase, industry directories — and reconcile the '
            . 'category wording across all of them before adding more.');
    }

    /* ── The opening paragraph, which is what actually gets lifted ────────── */
    $fp = (int)($s['first_para_words'] ?? 0);
    if ($fp === 0 && (int)($s['words'] ?? 0) > 120) {
        $add('major', 'The homepage has no substantial opening paragraph',
            'The text is carried by headings, buttons and fragments rather than prose. Extractive retrieval needs a '
            . 'self-contained sentence or two it can quote; there is nothing here of that shape.',
            'Write one opening paragraph of 40–90 words that answers, in plain sentences, the question a buyer '
            . 'would type. Put it above the fold, in a <p> tag, not in an image or a heading.');
    } elseif ($fp > 0 && $fp < 25) {
        $add('minor', 'Your opening paragraph is ' . $fp . ' words',
            'That is a strapline, not an answer. Pages that get quoted tend to open with 40–90 words that stand '
            . 'alone — readable with no other context on the page.',
            'Expand the opening to 40–90 words and make the first sentence the direct answer, with the category '
            . 'term and your differentiator in the same sentence.');
    } elseif ($fp > 130) {
        $add('minor', 'Your opening paragraph runs to ' . $fp . ' words',
            'The answer is in there, but a model has to choose which part to lift, and a long paragraph gets cut '
            . 'wherever the token budget lands rather than where the meaning ends.',
            'Split it. First paragraph: the direct answer in 40–90 words. Everything qualifying it goes in the '
            . 'second.');
    }

    if ((float)($s['digits_per_100w'] ?? 0) < 1.0 && (int)($s['words'] ?? 0) > 250) {
        $add('minor', 'Almost no numbers in your homepage copy',
            'About ' . (float)($s['digits_per_100w'] ?? 0) . ' digits per 100 words. Assistants repeat specifics — '
            . 'prices, timeframes, volumes, percentages — because a specific claim is checkable and a vague one is '
            . 'not. Copy made only of adjectives gives a model nothing worth quoting.',
            'Put three real numbers on the page: what it costs, how long it takes, and one result with its '
            . 'measurement window attached.');
    }

    if ((int)($s['avg_sentence'] ?? 0) > 30) {
        $add('minor', 'Your sentences average ' . (int)$s['avg_sentence'] . ' words',
            'Long sentences get truncated mid-claim when a model summarises, and the half that carries the point is '
            . 'usually the half that gets dropped. 15–25 words is the range that survives.',
            'Split the longest third. One claim per sentence.');
    }

    /* ── Outline and format ───────────────────────────────────────────────── */
    if ((int)($s['q_headings'] ?? 0) === 0 && (int)($s['h2'] ?? 0) > 0) {
        $add('minor', 'No headings phrased as questions',
            'You have ' . (int)($s['h2'] ?? 0) . ' H2s, none of which is a question. Question-shaped headings match '
            . 'the shape of what people actually type, and the paragraph directly beneath one is the passage a '
            . 'retriever reaches for first.',
            'Rewrite three or four headings as the questions your buyers ask, and answer each in the 40–80 words '
            . 'underneath.');
    }
    if ((int)($s['tables'] ?? 0) === 0 && (int)($s['words'] ?? 0) > 400) {
        $add('minor', 'No comparison table on the homepage',
            'Tables are lifted disproportionately often because they are unambiguous — rows and columns survive '
            . 'summarising in a way prose does not.',
            'Add one honest comparison table: you against the two alternatives a buyer is actually weighing, '
            . 'including the rows where you are not the answer.');
    }

    /* ── Indexable surface ────────────────────────────────────────────────── */
    if (!($s['sitemap'] ?? false)) {
        $add('minor', 'No sitemap.xml',
            'Nothing is telling search engines the full list of pages worth reading, so discovery depends entirely '
            . 'on internal links. Your homepage carries ' . (int)($s['int_links'] ?? 0) . ' internal links.',
            'Publish a sitemap.xml listing every page you want indexed, with a real lastmod, and reference it from '
            . 'robots.txt.');
    } elseif ((int)($s['sitemap_urls'] ?? 0) > 0 && (int)($s['sitemap_urls'] ?? 0) < 5 && !($s['sitemap_index'] ?? false)) {
        $add('minor', 'Your sitemap lists only ' . (int)$s['sitemap_urls'] . ' URL(s)',
            'A small indexable surface means few chances to be the page that answers a given question. The sites '
            . 'that get cited across a prompt set tend to have one page per question, not one page for everything.',
            'Build out the specific pages: pricing, comparisons, definitions, and the two or three questions you '
            . 'answer on every sales call.');
    }

    /* ── Whether the homepage is representative ───────────────────────────── */
    $pages = array_values(array_filter($s['pages'] ?? [], fn($x) => $x['ok'] ?? false));
    if ($pages) {
        $thin = array_values(array_filter($pages, fn($x) => (int)$x['words'] < 250));
        $dupT = array_values(array_filter($pages, fn($x) => trim((string)$x['title']) !== ''
                                                       && trim((string)$x['title']) === trim((string)($s['title'] ?? ''))));
        $noD  = array_values(array_filter($pages, fn($x) => (int)$x['desc_len'] === 0));
        if (count($thin) === count($pages) && (int)($s['words'] ?? 0) < 600) {
            $add('major', 'The thinness is site-wide, not just the homepage',
                'I also read ' . count($pages) . ' of your internal pages: '
                . implode(', ', array_map(fn($x) => (int)$x['words'] . ' words', $pages))
                . '. That is a template problem rather than one page needing a rewrite, and it changes the order of '
                . 'the work — there is no point optimising a page type that has nothing on it.',
                'Pick the three pages closest to a buying decision and take each to 600+ words with a direct answer '
                . 'up top. Fix the template after, not before.');
        }
        if ($dupT) {
            $add('major', count($dupT) . ' internal page(s) share the homepage title',
                'Duplicate titles mean search engines and retrievers cannot tell your pages apart, and the wrong one '
                . 'gets shown for a query the other page answers.',
                'Give every page a unique title of 50–60 characters that names what that page specifically answers.');
        }
        if ($noD) {
            $add('minor', count($noD) . ' internal page(s) have no meta description',
                'The snippet gets assembled from whatever text is nearest the top, which is usually navigation.',
                'Write 140–155 characters per page, stating what the page answers.');
        }
    }

    if (($s['encoding'] ?? '') === '' && (int)($s['html_bytes'] ?? 0) > 60000) {
        $add('minor', 'Your homepage is served uncompressed',
            (int)round((int)($s['html_bytes'] ?? 0) / 1024) . 'KB of HTML with no content-encoding header. '
            . 'Compression typically cuts that by 70% and is a switch, not a project.',
            'Enable gzip or brotli at the server or CDN.');
    }

    $order = ['critical' => 0, 'major' => 1, 'minor' => 2, 'ok' => 3];
    usort($f, fn($x, $y) => $order[$x['sev']] <=> $order[$y['sev']]);
    return $f;
}

/* ══ The 90-day sequence, shaped by what they told us ═════════════════════ */

function rm_plan(array $f, array $a): array {
    $focus  = strtolower($a['focus'] ?? '');
    $budget = strtolower($a['budget'] ?? '');
    $crit   = array_values(array_filter($f, fn($x) => $x['sev'] === 'critical'));
    $lean   = str_contains($budget, 'under $5') || str_contains($budget, 'not sure');

    $p = [];
    /* "Nothing critical showed up" is true when the scan ran and found nothing.
       When the scan could not read the site at all it is not true, it is just
       silence — and reporting silence as a clean bill of health is the kind of
       thing that gets an audit rightly distrusted. */
    $unread = (bool)array_filter($f, fn($x) => str_contains($x['title'], 'could not read'));
    $p[] = ['Weeks 1–2', $unread ? 'Find out why the site refused the check' : 'Fix what is blocking retrieval',
        $unread
            ? 'The automated read was refused, so treat this plan as the shape of the work rather than a diagnosis of your site — I have not seen inside it yet. Step one is finding out what did the refusing: a WAF rule, a country block or a bot filter. Whatever it is, the assistants\' crawlers are hitting the same wall, and until that is known nothing else can be ranked honestly.'
            : ($crit
                ? 'You have ' . count($crit) . ' critical item(s) above. Nothing else on this list matters until they are done, because they stop your pages from being read or understood at all. None of them is a big job — the robots and schema fixes are usually an afternoon.'
                : 'Nothing critical showed up in the automated pass, which puts you ahead of most sites I scan. Weeks 1–2 go to the baseline instead: a prompt set and a current reading of where you stand.')];
    $p[] = ['Weeks 2–3', 'Build the prompt set and take a baseline',
        'Write 150–400 real buyer questions, weighted by the revenue behind each, and score them across ChatGPT, Perplexity, Gemini and Google AI Overviews. Record two numbers per prompt: whether you were cited, and whether you were actually recommended. Without this you cannot tell month three from month one.'];
    $p[] = ['Weeks 3–5', 'Reconcile the entity',
        'One name, one category, one claim — identical on your site, in your schema, and on every third-party profile that ranks for your brand. This is consistently the cheapest movement available and it usually shows inside three weeks with no new content written.'];
    $p[] = ['Weeks 4–8', 'Rewrite the pages that already get retrieved',
        'Direct answer in the first 100 words, the differentiator in the same paragraph as the category term, real numbers, and a comparison table. The paragraph rule matters more than it sounds: when the claim and the category sit apart, a model takes the category from you and the recommendation from whoever else is on the page.'];
    $p[] = ['Weeks 6–12', 'Earn corroboration',
        $lean
            ? 'On a lean budget this is where to spend the effort you have. In the Ahrefs data, 94% of an established brand’s new mentions came from third-party pages and only 6% from its own — so getting named accurately on roundups and review platforms outperforms publishing more of your own content.'
            : 'Placement on the roundups, comparison pages and review platforms the models already retrieve from. 94% of an established brand’s new AI mentions came from third-party pages in the Ahrefs study, which is why this runs in parallel with the rewrites rather than after them.'];

    if (str_contains($focus, 'email') || str_contains($focus, 'outbound')) {
        $p[] = ['Weeks 6–12', 'Rebuild the channel that converts it',
            'You flagged email, so this moves up rather than sitting at the end. Deliverability audit first — there is no point sequencing anything that lands in spam — then the flows that actually carry revenue: welcome, abandonment, replenishment and win-back, or the outbound rebuild if that is the leakier side.'];
    } else {
        $p[] = ['Weeks 8–12', 'Catch it with email',
            'AI-referred traffic is high-intent and low-volume; it converts at roughly 4.4× ordinary organic and it leaks badly without a sequence behind it. This is last in the order and first in the return.'];
    }
    $p[] = ['Month 3', 'First real readout',
        'Citation share and recommendation rate per prompt, rankings, sessions and revenue, side by side with the week-two baseline. Then decide what quarter two is for — on evidence rather than on vibes.'];
    return $p;
}

/* ══ Rendering ════════════════════════════════════════════════════════════ */

function rm_headline(array $f): string {
    foreach (['critical', 'major'] as $sev) {
        foreach ($f as $x) { if ($x['sev'] === $sev) { return $x['title']; } }
    }
    return 'nothing critical found';
}

function rm_label(string $sev): string {
    return ['critical' => 'Fix first', 'major' => 'Important',
            'minor' => 'Worth doing', 'ok' => 'Already good'][$sev] ?? $sev;
}

function rm_email_text(string $name, array $fields, array $s, array $f, array $plan): string {
    $first = trim(explode(' ', $name)[0]) ?: 'there';
    $site = $fields['Website'] !== '—' ? $fields['Website'] : 'your setup';
    $sc = rm_score($s);
    $req = (int)($s['requests'] ?? 1);
    $o = "Hi {$first},\n\n";
    $o .= ($s['reachable'] ?? false)
        ? wordwrap("I had a look at {$site} — the homepage, up to two of your internal pages, "
            . "robots.txt, llms.txt and sitemap.xml. {$req} requests, a few seconds, and between them "
            . "they answer most of what decides whether an assistant can find you at all.", 78) . "\n\n"
        : wordwrap("I tried to read {$site} and the server would not let me — so what follows is the "
            . "shape of the work rather than a reading of your site. I have not seen inside it. That "
            . "refusal is itself worth knowing about, and it is the first item below.", 78) . "\n\n";

    if (($s['reachable'] ?? false)) {
        $o .= "RETRIEVAL READINESS: " . $sc['score'] . "/100 — " . strtoupper($sc['band']) . "\n";
        $o .= str_repeat('-', 62) . "\n";
        foreach ($sc['parts'] as $pt) {
            $o .= '  ' . str_pad($pt[0], 22) . str_pad($pt[1] . '/' . $pt[2], 8) . $pt[3] . "\n";
        }
        $o .= "\n" . wordwrap('The weighting is deliberate: being crawlable and being identifiable are '
            . 'worth more than every cosmetic tag combined, because a site with immaculate meta tags that '
            . 'blocks GPTBot is invisible and a plain one that does not is not.', 78) . "\n\n";
    }
    $o .= wordwrap("Below is what came back, worst first, and then the order I would actually "
        . "do it in. Be honest about the limits: this is a machine reading a handful of pages. It "
        . "cannot tell you who is being recommended instead of you — that needs 150 to 400 of your "
        . "buyer questions run across four engines. But every number here was measured on your site "
        . "just now, and the first item is usually a job for a Tuesday afternoon.", 78) . "\n\n";

    $o .= str_repeat('=', 62) . "\nWHAT CAME BACK\n" . str_repeat('=', 62) . "\n\n";
    $n = 0;
    foreach ($f as $x) {
        $n++;
        $o .= $n . '. [' . strtoupper(rm_label($x['sev'])) . "] " . $x['title'] . "\n\n";
        $o .= '   ' . wordwrap($x['detail'], 74, "\n   ") . "\n\n";
        $o .= "   What to do: " . wordwrap($x['fix'], 74, "\n   ") . "\n\n";
    }

    $o .= str_repeat('=', 62) . "\nTHE ORDER I WOULD DO IT IN\n" . str_repeat('=', 62) . "\n\n";
    foreach ($plan as $p) {
        $o .= $p[0] . ' — ' . $p[1] . "\n";
        $o .= '   ' . wordwrap($p[2], 74, "\n   ") . "\n\n";
    }

    $o .= str_repeat('=', 62) . "\nWHAT WAS MEASURED\n" . str_repeat('=', 62) . "\n\n";
    $o .= '  ' . str_pad('', 22) . str_pad('yours', 26) . "healthy range\n";
    $o .= '  ' . str_repeat('-', 58) . "\n";
    foreach (rm_scan_rows($s) as $r) {
        $o .= '  ' . str_pad(mb_substr($r[0], 0, 21), 22) . str_pad(mb_substr($r[1], 0, 25), 26) . ($r[2] ?? '') . "\n";
    }

    $pr = rm_page_rows($s);
    if ($pr) {
        $o .= "\n" . str_repeat('=', 62) . "\nTHE INTERNAL PAGES I READ\n" . str_repeat('=', 62) . "\n\n";
        $o .= wordwrap('One page tells you about one page. These tell you whether the pattern is '
            . 'the site — which changes whether the fix is a rewrite or a template.', 78) . "\n\n";
        foreach ($pr as $r) {
            $o .= '  ' . str_pad($r[0], 36) . implode(' · ', array_slice($r, 1)) . "\n";
        }
    }

    $o .= "\n" . str_repeat('=', 62) . "\nIF YOU WANT THE REAL ONE\n" . str_repeat('=', 62) . "\n\n";
    $o .= wordwrap('This read a handful of pages and knows nothing about your market. '
        . 'The Visibility Audit reads 150 to 400 of your buyer '
        . 'questions across ChatGPT, Perplexity, Gemini and Google AI Overviews, records whether '
        . 'you were cited and — separately — whether you were actually recommended, maps every '
        . 'place your own sources disagree about what you are, and hands back a ranked fix list '
        . 'with a revenue number against each item.', 78) . "\n\n";
    $o .= wordwrap('$4,500, three weeks, credited against the first month if you carry on. Reply '
        . 'to this email and I will scope it — or reply with a question and I will just answer it. '
        . 'I read these myself.', 78) . "\n\n";
    $o .= "— Syed Abdul\n"
        . "  Founder, syed.ai\n"
        . "  Celebration, Florida · Abu Dhabi · Lahore\n"
        . "  https://www.linkedin.com/in/syed\n\n"
        . wordwrap('You are getting this because you asked for it on syed.ai. It is a one-off — '
        . 'there is no sequence behind it and I will not email you again unless you write back.', 78) . "\n";
    return $o;
}

/**
 * The measurement table.
 *
 * Every row carries a benchmark, because a number on its own is not a finding.
 * "412 words" means nothing to the person reading it; "412 words — cited pages
 * run 600+" is something they can act on this afternoon. Benchmarks are stated
 * as the working ranges I use, not as laws.
 *
 * @return array<int,array{0:string,1:string,2:string}>  label, measured, benchmark
 */
function rm_scan_rows(array $s): array {
    if (!($s['reachable'] ?? false)) {
        return [['Site', 'could not be reached automatically', 'a crawler refused is a crawler refused']];
    }
    $yn  = fn($b) => $b ? 'yes' : 'no';
    $ms  = (int)($s['ms'] ?? 0);
    $rows = [
        ['Checked',            (string)($s['final'] ?? '—'), ''],
        ['Response',           (string)($s['status'] ?? '—') . ' in ' . $ms . 'ms', 'under 1,500ms'],
        ['HTTPS',              $yn($s['https'] ?? false), 'required'],
        ['Compression',        ($s['encoding'] ?? '') !== '' ? (string)$s['encoding'] : 'none', 'gzip or brotli'],
        ['HTML size',          (int)round((int)($s['html_bytes'] ?? 0) / 1024) . 'KB', ''],
        ['Indexable',          ($s['noindex'] ?? false) ? 'NO — noindex is set' : 'yes', 'yes'],
        ['x-robots-tag',       ($s['x_robots'] ?? '') !== '' ? (string)$s['x_robots'] : 'not set', 'absent, or index'],

        ['Title',              ($s['title_len'] ?? 0) . ' chars', '25–65'],
        ['Meta description',   ($s['desc_len'] ?? 0) . ' chars', '110–165'],
        ['Canonical',          $yn($s['canonical'] ?? false), 'yes'],
        ['Open Graph image',   $yn($s['og_image'] ?? false), 'yes'],

        ['H1 count',           (string)($s['h1'] ?? 0), 'exactly 1'],
        ['H2 / H3 count',      (int)($s['h2'] ?? 0) . ' / ' . (int)($s['h3'] ?? 0), '3+ H2'],
        ['Question headings',  (string)(int)($s['q_headings'] ?? 0), '3+'],
        ['Tables',             (string)(int)($s['tables'] ?? 0), '1+'],

        ['Readable words',     (string)(int)($s['words'] ?? 0), '600+ on cited pages'],
        ['Opening paragraph',  (int)($s['first_para_words'] ?? 0) . ' words', '40–90'],
        ['Text-to-markup',     (float)($s['text_ratio'] ?? 0) . '%', '5–25%'],
        ['Numbers in copy',    (float)($s['digits_per_100w'] ?? 0) . ' per 100 words', '1.5+'],
        ['Avg sentence',       (int)($s['avg_sentence'] ?? 0) . ' words', '15–25'],
        ['Newest year in copy', (int)($s['year'] ?? 0) > 0 ? (string)(int)$s['year'] : 'none found', 'the current year'],

        ['Structured data',    ($s['schema_types'] ?? []) ? implode(', ', array_slice($s['schema_types'], 0, 6)) : 'none found',
                               'Organization + Service'],
        ['sameAs links',       (int)($s['sameas'] ?? 0) > 0
                                   ? (int)$s['sameas'] . ' (' . implode(', ', array_slice($s['sameas_hosts'] ?? [], 0, 4)) . ')'
                                   : 'none', '3+'],
        ['FAQ questions marked up', (string)(int)($s['faq_q'] ?? 0), '5+'],
        ['dateModified',       $yn($s['date_modified'] ?? false), 'yes'],

        ['robots.txt',         $yn($s['robots'] ?? false), 'present'],
        ['AI crawlers blocked', ($s['blocked'] ?? []) ? implode(', ', $s['blocked']) : 'none', 'none'],
        ['sitemap.xml',        ($s['sitemap'] ?? false)
                                   ? (($s['sitemap_index'] ?? false) ? 'index of ' : '')
                                     . (int)($s['sitemap_urls'] ?? 0) . ' URLs'
                                     . (($s['sitemap_capped'] ?? false) ? '+ (read capped)' : '')
                                   : 'not found', 'one URL per question you answer'],
        ['llms.txt',           ($s['llms'] ?? false) ? 'yes, ' . (int)($s['llms_urls'] ?? 0) . ' URLs' : 'no', 'optional'],
        ['Internal links',     (string)(int)($s['int_links'] ?? 0), ''],
        ['Pages read',         (string)(int)($s['requests'] ?? 0) . ' requests in ' . (int)($s['scan_ms'] ?? 0) . 'ms', ''],
    ];
    return $rows;
}

/**
 * The per-page table, present only when internal pages were actually read.
 * @return array<int,array<int,string>>
 */
function rm_page_rows(array $s): array {
    $out = [];
    foreach (($s['pages'] ?? []) as $pg) {
        $path = (string)parse_url((string)($pg['url'] ?? ''), PHP_URL_PATH);
        if ($path === '') { $path = '/'; }
        if (!($pg['ok'] ?? false)) {
            $out[] = [$path, 'HTTP ' . (int)($pg['status'] ?? 0), '—', '—', '—'];
            continue;
        }
        $out[] = [
            mb_strlen($path) > 34 ? mb_substr($path, 0, 33) . '…' : $path,
            (int)$pg['words'] . ' words',
            (int)$pg['first_para_words'] . 'w opening',
            (int)$pg['title_len'] . '/' . (int)$pg['desc_len'] . ' title/desc',
            ($pg['schema'] ? 'schema' : 'no schema'),
        ];
    }
    return $out;
}

function rm_email_html(string $name, array $fields, array $s, array $f, array $plan): string {
    $e = fn($v) => htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8');
    $first = $e(trim(explode(' ', $name)[0]) ?: 'there');
    $site  = $e($fields['Website'] !== '—' ? $fields['Website'] : 'your setup');
    $col   = ['critical' => '#D06A60', 'major' => '#CFAF67', 'minor' => '#948D7B', 'ok' => '#7DAE8A'];

    $h  = '<!doctype html><html><head><meta charset="utf-8">'
        . '<meta name="viewport" content="width=device-width,initial-scale=1"></head>'
        . '<body style="margin:0;padding:0;background:#060504;">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#060504;padding:28px 12px;">'
        . '<tr><td align="center"><table role="presentation" width="640" cellpadding="0" cellspacing="0" '
        . 'style="width:100%;max-width:640px;background:#0E0C09;border:1px solid #443C2E;">';

    // header
    $h .= '<tr><td style="padding:26px 28px;border-bottom:1px solid #272219;">'
        . '<div style="font:600 20px/1 -apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;color:#F7F5F0;">'
        . 'syed<span style="color:#CFAF67;font-weight:400;">.ai</span></div>'
        . '<div style="margin-top:7px;font:500 10px/1 -apple-system,sans-serif;letter-spacing:2.4px;'
        . 'text-transform:uppercase;color:#948D7B;">Your AI visibility roadmap</div></td></tr>';

    // intro
    $h .= '<tr><td style="padding:26px 28px;font:400 15px/1.65 -apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;color:#C9C3B6;">'
        . '<p style="margin:0 0 15px;">Hi ' . $first . ',</p>'
        . (($s['reachable'] ?? false)
            ? '<p style="margin:0 0 15px;">I had a look at <strong style="color:#F7F5F0;">' . $site . '</strong> — '
              . 'the homepage, up to two of your internal pages, robots.txt, llms.txt and sitemap.xml. '
              . $e((int)($s['requests'] ?? 1)) . ' requests, a few seconds, and between them they answer most of '
              . 'what decides whether an assistant can find you at all.</p>'
              . '<p style="margin:0 0 15px;">Below is what came back, worst first, then the order I would '
              . 'actually do it in, then every number I measured with the range I would want it in.</p>'
            : '<p style="margin:0 0 15px;">I tried to read <strong style="color:#F7F5F0;">' . $site . '</strong> '
              . 'and the server would not let me — so what follows is the shape of the work rather than a reading '
              . 'of your site. I have not seen inside it.</p>'
              . '<p style="margin:0 0 15px;">That refusal is itself worth knowing about, and it is the first item '
              . 'below. The assistants\' crawlers hit the same wall.</p>')
        . '<p style="margin:0;padding:13px 15px;background:#191510;border-left:2px solid #8A6A30;'
        . 'color:#948D7B;font-size:13px;line-height:1.6;">Being straight about the limits: this is a machine '
        . 'reading a handful of pages. It cannot tell you who is being recommended instead of you — that needs '
        . '150–400 of your buyer questions run across four engines. But every number below was measured on '
        . 'your site just now, and the first item is usually a job for a Tuesday afternoon.</p>'
        . '</td></tr>';

    // score card
    $sc = rm_score($s);
    if ($s['reachable'] ?? false) {
        $bandCol = $sc['score'] >= 80 ? '#7DAE8A' : ($sc['score'] >= 60 ? '#CFAF67' : ($sc['score'] >= 40 ? '#C98F5A' : '#D06A60'));
        $h .= '<tr><td style="padding:0 28px 8px;">'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
            . 'style="background:#191510;border:1px solid #443C2E;"><tr>'
            . '<td style="padding:20px 22px;" width="34%" valign="middle" align="center">'
            . '<div style="font:600 40px/1 -apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;color:' . $bandCol . ';">'
            . $e($sc['score']) . '<span style="font-size:17px;color:#6E6959;">/100</span></div>'
            . '<div style="margin-top:8px;font:600 9.5px/1 -apple-system,sans-serif;letter-spacing:1.8px;'
            . 'text-transform:uppercase;color:' . $bandCol . ';">' . $e($sc['band']) . '</div>'
            . '<div style="margin-top:6px;font:400 10px/1.4 -apple-system,sans-serif;color:#6E6959;">Retrieval readiness</div>'
            . '</td>'
            . '<td style="padding:18px 22px 18px 0;" valign="middle">'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
            . 'style="font:400 12px/1.45 -apple-system,sans-serif;">';
        foreach ($sc['parts'] as $pt) {
            $pct = $pt[2] > 0 ? (int)round($pt[1] / $pt[2] * 100) : 0;
            $barC = $pct >= 80 ? '#7DAE8A' : ($pct >= 50 ? '#CFAF67' : '#D06A60');
            $h .= '<tr><td style="padding:3px 0;color:#C9C3B6;width:47%;">' . $e($pt[0]) . '</td>'
                . '<td style="padding:3px 0;width:34%;">'
                . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#272219;"><tr>'
                . '<td style="height:5px;background:' . $barC . ';width:' . $pct . '%;font-size:0;line-height:0;">&nbsp;</td>'
                . '<td style="height:5px;font-size:0;line-height:0;">&nbsp;</td></tr></table></td>'
                . '<td style="padding:3px 0 3px 9px;color:#948D7B;text-align:right;white-space:nowrap;">'
                . $e($pt[1] . '/' . $pt[2]) . '</td></tr>';
        }
        $h .= '</table></td></tr>'
            . '<tr><td colspan="2" style="padding:0 22px 18px;font:400 11.5px/1.6 -apple-system,sans-serif;color:#6E6959;">'
            . 'Weighted on purpose: being crawlable and being identifiable are worth more than every cosmetic tag '
            . 'combined, because a site with immaculate meta tags that blocks GPTBot is invisible, and a plain one '
            . 'that does not is not.</td></tr>'
            . '</table></td></tr>';
    }

    // findings
    $h .= '<tr><td style="padding:0 28px;"><div style="height:1px;background:#272219;"></div></td></tr>'
        . '<tr><td style="padding:24px 28px 6px;font:600 10px/1 -apple-system,sans-serif;letter-spacing:2.2px;'
        . 'text-transform:uppercase;color:#CFAF67;">What came back</td></tr>';
    foreach ($f as $x) {
        $c = $col[$x['sev']] ?? '#948D7B';
        $h .= '<tr><td style="padding:16px 28px;">'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'
            . '<td style="border-left:3px solid ' . $c . ';padding:2px 0 2px 14px;">'
            . '<div style="font:600 9px/1 -apple-system,sans-serif;letter-spacing:1.8px;text-transform:uppercase;color:' . $c . ';">'
            . $e(rm_label($x['sev'])) . '</div>'
            . '<div style="margin-top:7px;font:500 16px/1.4 -apple-system,sans-serif;color:#F7F5F0;">' . $e($x['title']) . '</div>'
            . '<div style="margin-top:8px;font:400 14px/1.6 -apple-system,sans-serif;color:#C9C3B6;">' . $e($x['detail']) . '</div>'
            . '<div style="margin-top:9px;font:400 13px/1.6 -apple-system,sans-serif;color:#948D7B;">'
            . '<strong style="color:#C9C3B6;font-weight:500;">What to do:</strong> ' . $e($x['fix']) . '</div>'
            . '</td></tr></table></td></tr>';
    }

    // plan
    $h .= '<tr><td style="padding:14px 28px 0;"><div style="height:1px;background:#272219;"></div></td></tr>'
        . '<tr><td style="padding:24px 28px 6px;font:600 10px/1 -apple-system,sans-serif;letter-spacing:2.2px;'
        . 'text-transform:uppercase;color:#CFAF67;">The order I would do it in</td></tr>';
    foreach ($plan as $p) {
        $h .= '<tr><td style="padding:14px 28px;">'
            . '<div style="font:600 10px/1 -apple-system,sans-serif;letter-spacing:1.8px;text-transform:uppercase;color:#8A6A30;">'
            . $e($p[0]) . '</div>'
            . '<div style="margin-top:7px;font:500 15px/1.4 -apple-system,sans-serif;color:#F7F5F0;">' . $e($p[1]) . '</div>'
            . '<div style="margin-top:7px;font:400 14px/1.6 -apple-system,sans-serif;color:#C9C3B6;">' . $e($p[2]) . '</div>'
            . '</td></tr>';
    }

    // what was checked
    $h .= '<tr><td style="padding:14px 28px 0;"><div style="height:1px;background:#272219;"></div></td></tr>'
        . '<tr><td style="padding:24px 28px 6px;font:600 10px/1 -apple-system,sans-serif;letter-spacing:2.2px;'
        . 'text-transform:uppercase;color:#CFAF67;">What was measured</td></tr>'
        . '<tr><td style="padding:6px 28px 22px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        . 'style="font:400 12.5px/1.5 -apple-system,sans-serif;">'
        . '<tr><td style="padding:0 0 8px;color:#6E6959;font-size:10px;letter-spacing:1.4px;text-transform:uppercase;">Signal</td>'
        . '<td style="padding:0 0 8px;color:#6E6959;font-size:10px;letter-spacing:1.4px;text-transform:uppercase;text-align:right;">Yours</td>'
        . '<td style="padding:0 0 8px 12px;color:#6E6959;font-size:10px;letter-spacing:1.4px;text-transform:uppercase;text-align:right;">Healthy</td></tr>';
    foreach (rm_scan_rows($s) as $r) {
        $h .= '<tr><td style="padding:7px 0;border-bottom:1px solid #191510;color:#948D7B;width:38%;">' . $e($r[0]) . '</td>'
            . '<td style="padding:7px 0;border-bottom:1px solid #191510;color:#C9C3B6;text-align:right;">' . $e($r[1]) . '</td>'
            . '<td style="padding:7px 0 7px 12px;border-bottom:1px solid #191510;color:#6E6959;text-align:right;width:28%;">'
            . $e($r[2] ?? '') . '</td></tr>';
    }
    $h .= '</table></td></tr>';

    // the internal pages, when any were read
    $pr = rm_page_rows($s);
    if ($pr) {
        $h .= '<tr><td style="padding:0 28px 6px;font:600 10px/1 -apple-system,sans-serif;letter-spacing:2.2px;'
            . 'text-transform:uppercase;color:#CFAF67;">The internal pages I read</td></tr>'
            . '<tr><td style="padding:6px 28px 4px;font:400 12.5px/1.6 -apple-system,sans-serif;color:#948D7B;">'
            . 'One page tells you about one page. These tell you whether the pattern is the site — which decides '
            . 'whether the fix is a rewrite or a template.</td></tr>'
            . '<tr><td style="padding:8px 28px 22px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
            . 'style="font:400 12px/1.5 -apple-system,sans-serif;">';
        foreach ($pr as $r) {
            $h .= '<tr><td style="padding:7px 0;border-bottom:1px solid #191510;color:#C9C3B6;width:40%;">' . $e($r[0]) . '</td>'
                . '<td style="padding:7px 0;border-bottom:1px solid #191510;color:#948D7B;text-align:right;">'
                . $e(implode(' · ', array_slice($r, 1))) . '</td></tr>';
        }
        $h .= '</table></td></tr>';
    }

    // CTA + sign-off
    $h .= '<tr><td style="padding:6px 28px 26px;">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#191510;border:1px solid #443C2E;">'
        . '<tr><td style="height:2px;background:linear-gradient(90deg,#8A6A30,#EBD59F,#8A6A30);font-size:0;line-height:0;">&nbsp;</td></tr>'
        . '<tr><td style="padding:22px;font:400 14px/1.65 -apple-system,sans-serif;color:#C9C3B6;">'
        . '<div style="font:500 17px/1.35 -apple-system,sans-serif;color:#F7F5F0;margin-bottom:10px;">If you want the real one</div>'
        . '<p style="margin:0 0 12px;">This read a handful of pages and knows nothing about your market. '
        . 'The Visibility Audit reads 150–400 of your buyer '
        . 'questions across ChatGPT, Perplexity, Gemini and Google AI Overviews, records whether you were cited '
        . 'and — separately — whether you were actually <em style="font-style:normal;color:#F7F5F0;">recommended</em>, '
        . 'maps every place your own sources disagree about what you are, and hands back a ranked fix list with a '
        . 'revenue number against each item.</p>'
        . '<p style="margin:0;color:#948D7B;font-size:13px;">$4,500 · three weeks · credited against the first month '
        . 'if you carry on. Reply to this email and I will scope it — or reply with a question and I will just '
        . 'answer it. I read these myself.</p>'
        . '</td></tr></table></td></tr>';

    $h .= '<tr><td style="padding:22px 28px;border-top:1px solid #272219;'
        . 'font:400 12px/1.7 -apple-system,sans-serif;color:#948D7B;">'
        . '<div style="color:#C9C3B6;font-weight:500;">Syed Abdul</div>'
        . 'Founder, syed.ai<br>Celebration, Florida · Abu Dhabi · Lahore<br>'
        . '<a href="https://www.linkedin.com/in/syed" style="color:#CFAF67;text-decoration:none;">linkedin.com/in/syed</a>'
        . '<div style="margin-top:14px;padding-top:12px;border-top:1px solid #191510;color:#6E6959;font-size:11.5px;line-height:1.6;">'
        . 'You are getting this because you asked for it on syed.ai. It is a one-off — there is no sequence '
        . 'behind it, and I will not email you again unless you write back.</div>'
        . '</td></tr>';

    $h .= '</table></td></tr></table></body></html>';
    return $h;
}

/* ══ Newsletter welcome ═══════════════════════════════════════════════════
   Someone who just handed over their address should hear back within seconds,
   and the first thing they read sets what they expect for the next 52 weeks.
   One email, no sequence behind it.                                         */

/* ══ Confirmation request ═════════════════════════════════════════════════
   One job: get a click. So it carries one link, no navigation, no pitch and no
   second call to action — everything else on the page is a way to not click.
   It also says plainly what happens if they ignore it, because a confirmation
   email that reads like a threat gets deleted.                              */

function rm_confirm_text(string $name, string $link): string {
    $first = trim(explode(' ', trim($name))[0]);
    $hi = $first !== '' ? "Hi {$first}," : 'Hello,';
    $o  = $hi . "\n\n";
    $o .= wordwrap('One click and you are on The Answer Layer — a Tuesday email about what is '
        . 'actually working in AI search, with the evidence attached.', 74) . "\n\n";
    $o .= "Confirm here:\n" . $link . "\n\n";
    $o .= wordwrap('I ask for the click because it is the only way to know an address is real and '
        . 'belongs to the person who typed it. Ignore this and nothing happens — no reminders, '
        . 'and the pending signup expires on its own.', 74) . "\n\n";
    $o .= wordwrap('What arrives if you do confirm: one issue a Tuesday, roughly 700 words, every '
        . 'number with its sample size and a link to the source. One-click unsubscribe at the '
        . 'bottom of every one.', 74) . "\n\n";
    $o .= "— Syed Abdul\n  syed.ai\n";
    return $o;
}

function rm_confirm_html(string $name, string $link): string {
    $e = fn($v) => htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8');
    $first = trim(explode(' ', trim($name))[0]);
    $hi = $first !== '' ? 'Hi ' . $e($first) . ',' : 'Hello,';
    $l = $e($link);

    return '<!doctype html><html><head><meta charset="utf-8">'
      . '<meta name="viewport" content="width=device-width,initial-scale=1"></head>'
      . '<body style="margin:0;padding:0;background:#060504;">'
      . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
      . 'style="background:#060504;padding:28px 12px;"><tr><td align="center">'
      . '<table role="presentation" width="560" cellpadding="0" cellspacing="0" '
      . 'style="width:100%;max-width:560px;background:#0E0C09;border:1px solid #443C2E;">'

      . '<tr><td style="padding:26px 28px 20px;border-bottom:1px solid #272219;">'
      . '<div style="font:600 19px/1 -apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;color:#F7F5F0;">'
      . 'syed<span style="color:#CFAF67;font-weight:400;">.ai</span></div>'
      . '<div style="margin-top:7px;font:500 10px/1 -apple-system,sans-serif;letter-spacing:2.4px;'
      . 'text-transform:uppercase;color:#948D7B;">The Answer Layer</div></td></tr>'

      . '<tr><td style="padding:26px 28px 8px;font:400 15px/1.65 -apple-system,BlinkMacSystemFont,'
      . '\'Segoe UI\',Roboto,sans-serif;color:#C9C3B6;">'
      . '<p style="margin:0 0 15px;">' . $hi . '</p>'
      . '<p style="margin:0 0 22px;">One click and you are on <strong style="color:#F7F5F0;font-weight:500;">'
      . 'The Answer Layer</strong> — a Tuesday email about what is actually working in AI search, '
      . 'with the evidence attached.</p></td></tr>'

      . '<tr><td style="padding:0 28px 24px;" align="center">'
      . '<table role="presentation" cellpadding="0" cellspacing="0"><tr>'
      . '<td style="background:#CFAF67;"><a href="' . $l . '" '
      . 'style="display:inline-block;padding:16px 34px;color:#0A0806;text-decoration:none;'
      . 'font:600 11px/1 -apple-system,sans-serif;letter-spacing:.16em;text-transform:uppercase;">'
      . 'Confirm my email</a></td></tr></table></td></tr>'

      . '<tr><td style="padding:0 28px 22px;font:400 12.5px/1.6 -apple-system,sans-serif;color:#6E6959;">'
      . 'If the button does not work, paste this into your browser:<br>'
      . '<a href="' . $l . '" style="color:#8A6A30;word-break:break-all;">' . $l . '</a></td></tr>'

      . '<tr><td style="padding:0 28px 26px;">'
      . '<div style="padding:15px 17px;background:#191510;border-left:2px solid #8A6A30;'
      . 'font:400 13.5px/1.62 -apple-system,sans-serif;color:#948D7B;">'
      . 'I ask for the click because it is the only way to know an address is real and belongs to '
      . 'the person who typed it. Ignore this and nothing happens — no reminders, and the pending '
      . 'signup expires on its own.</div></td></tr>'

      . '<tr><td style="padding:0 28px 26px;font:400 13.5px/1.65 -apple-system,sans-serif;color:#948D7B;">'
      . '<strong style="color:#C9C3B6;font-weight:500;">What arrives if you confirm:</strong> one issue '
      . 'a Tuesday, roughly 700 words, every number with its sample size and a link to the source. '
      . 'One-click unsubscribe at the bottom of every one.</td></tr>'

      . '<tr><td style="padding:20px 28px;border-top:1px solid #272219;'
      . 'font:400 12px/1.7 -apple-system,sans-serif;color:#6E6959;">'
      . '<span style="color:#C9C3B6;font-weight:500;">Syed Abdul</span><br>syed.ai &middot; '
      . 'Celebration &middot; Abu Dhabi &middot; Lahore<br>'
      . 'You are getting this one email because that address was entered on syed.ai. '
      . 'If it was not you, ignore it and nothing further will arrive.'
      . '</td></tr></table></td></tr></table></body></html>';
}

function rm_welcome_text(string $site): string {
    $o  = "You're in.\n\n";
    $o .= wordwrap('The Answer Layer lands on Tuesdays. One brand, twenty buyer questions, four '
        . 'answer engines, and the honest reason the assistants name it or walk straight past it. '
        . 'No theory, no predictions about where search is heading — just what four machines '
        . 'actually said that week, and what I would change on Monday.', 78) . "\n\n";
    $o .= "What it is not: a drip sequence, a webinar funnel, or a second email on Thursday.\n"
        . "One email a week. Leave in one click. The list is never rented, sold or shared.\n\n";
    if ($site !== '') {
        $o .= wordwrap("You put {$site} in the box, so it is in the teardown queue. If it gets "
            . 'picked you will read the findings the same morning everyone else does — no preview, '
            . 'no right of reply. That is the deal, and it is the only reason these are worth '
            . 'reading.', 78) . "\n\n";
    }
    $o .= "Two things worth doing before Tuesday\n" . str_repeat('-', 40) . "\n\n";
    $o .= "1. Open your robots.txt — yoursite.com/robots.txt — and look for GPTBot,\n"
        . "   OAI-SearchBot or PerplexityBot under a Disallow. If they are there, nothing\n"
        . "   else you do about AI search matters until that line goes. It is the most\n"
        . "   common finding in every audit I run and it takes ten minutes.\n\n";
    $o .= "2. Ask ChatGPT the question your best customer would ask before they had heard\n"
        . "   of you. Not your brand name — the category. See who it names. That answer is\n"
        . "   your actual starting position, and it is usually a surprise.\n\n";
    $o .= wordwrap('If you want a machine to do the first one for you, the site will read your '
        . 'homepage, robots.txt and llms.txt and email you a ranked fix list. Free, no call: '
        . 'https://syed.ai/#contact', 78) . "\n\n";
    $o .= "Reply to this any time. It reaches me, and I answer.\n\n";
    $o .= "— Syed Abdul\n  Founder, syed.ai\n  Celebration, Florida · Abu Dhabi · Lahore\n"
        . "  https://www.linkedin.com/in/syed\n";
    return $o;
}

function rm_welcome_html(string $site): string {
    $e = fn($v) => htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8');
    $F = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

    $h  = '<!doctype html><html><head><meta charset="utf-8">'
        . '<meta name="viewport" content="width=device-width,initial-scale=1"></head>'
        . '<body style="margin:0;padding:0;background:#060504;">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#060504;padding:28px 12px;">'
        . '<tr><td align="center"><table role="presentation" width="600" cellpadding="0" cellspacing="0" '
        . 'style="width:100%;max-width:600px;background:#0E0C09;border:1px solid #443C2E;">'
        . '<tr><td style="height:3px;background:linear-gradient(90deg,#8A6A30,#CFAF67 36%,#EBD59F 50%,#CFAF67 64%,#8A6A30);font-size:0;line-height:0;">&nbsp;</td></tr>';

    $h .= '<tr><td style="padding:30px 30px 6px;">'
        . '<div style="font:600 20px/1 ' . $F . ';color:#F7F5F0;">syed<span style="color:#CFAF67;font-weight:400;">.ai</span></div>'
        . '<div style="margin-top:8px;font:500 10px/1 ' . $F . ';letter-spacing:2.6px;text-transform:uppercase;color:#948D7B;">The Answer Layer</div>'
        . '</td></tr>';

    $h .= '<tr><td style="padding:26px 30px 0;">'
        . '<div style="font:500 34px/1.15 Didot,\'Bodoni MT\',Georgia,serif;color:#F7F5F0;letter-spacing:0.5px;">You&rsquo;re in.</div>'
        . '</td></tr>';

    $h .= '<tr><td style="padding:18px 30px 0;font:400 15px/1.68 ' . $F . ';color:#C9C3B6;">'
        . '<p style="margin:0 0 15px;">It lands on Tuesdays. One brand, twenty buyer questions, four answer '
        . 'engines, and the honest reason the assistants name it or walk straight past it.</p>'
        . '<p style="margin:0 0 15px;">No theory. No predictions about where search is heading. Just what four '
        . 'machines actually said that week, and what I would change on Monday.</p>'
        . '<p style="margin:0;color:#948D7B;font-size:13.5px;">What it is not: a drip sequence, a webinar funnel, '
        . 'or a second email on Thursday. One a week. Leave in one click. The list is never rented, sold or shared.</p>'
        . '</td></tr>';

    if ($site !== '') {
        $h .= '<tr><td style="padding:20px 30px 0;">'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">'
            . '<tr><td style="border-left:2px solid #CFAF67;padding:4px 0 4px 15px;font:400 14px/1.6 ' . $F . ';color:#C9C3B6;">'
            . 'You put <strong style="color:#F7F5F0;">' . $e($site) . '</strong> in the box, so it is in the teardown '
            . 'queue. If it gets picked you read the findings the same morning everyone else does &mdash; no preview, '
            . 'no right of reply. That is the deal, and it is the only reason these are worth reading.'
            . '</td></tr></table></td></tr>';
    }

    $h .= '<tr><td style="padding:28px 30px 0;">'
        . '<div style="font:600 10px/1 ' . $F . ';letter-spacing:2.2px;text-transform:uppercase;color:#CFAF67;">'
        . 'Two things worth doing before Tuesday</div></td></tr>';

    $steps = [
        ['01', 'Check your own front door',
         'Open <span style="color:#C9C3B6;">yoursite.com/robots.txt</span> and look for GPTBot, OAI-SearchBot or '
         . 'PerplexityBot under a Disallow. If they are there, nothing else you do about AI search matters until '
         . 'that line goes. It is the most common finding in every audit I run, and it takes ten minutes.'],
        ['02', 'Ask the question your buyer would ask',
         'Not your brand name &mdash; the category. Put it to ChatGPT the way someone who had never heard of you '
         . 'would, and see who it names. That answer is your actual starting position, and it is usually a surprise.'],
    ];
    foreach ($steps as $st) {
        $h .= '<tr><td style="padding:16px 30px 0;">'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'
            . '<td width="40" valign="top" style="font:500 17px/1.3 Didot,\'Bodoni MT\',Georgia,serif;color:#8A6A30;">' . $st[0] . '</td>'
            . '<td valign="top">'
            . '<div style="font:500 15px/1.4 ' . $F . ';color:#F7F5F0;">' . $st[1] . '</div>'
            . '<div style="margin-top:6px;font:400 14px/1.6 ' . $F . ';color:#948D7B;">' . $st[2] . '</div>'
            . '</td></tr></table></td></tr>';
    }

    $h .= '<tr><td style="padding:26px 30px 0;">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#191510;border:1px solid #272219;">'
        . '<tr><td style="padding:18px 20px;font:400 14px/1.6 ' . $F . ';color:#C9C3B6;">'
        . 'Want a machine to do the first one for you? The site will read your homepage, robots.txt and llms.txt '
        . 'and email you a ranked fix list. Free, and no call attached.<br>'
        . '<a href="https://syed.ai/#contact" style="display:inline-block;margin-top:12px;padding:11px 20px;'
        . 'border:1px solid #CFAF67;color:#CFAF67;text-decoration:none;font:600 10.5px/1 ' . $F . ';'
        . 'letter-spacing:2px;text-transform:uppercase;">Get the free read</a>'
        . '</td></tr></table></td></tr>';

    $h .= '<tr><td style="padding:26px 30px;font:400 14px/1.65 ' . $F . ';color:#C9C3B6;">'
        . 'Reply to this any time. It reaches me, and I answer.</td></tr>';

    $h .= '<tr><td style="padding:20px 30px 26px;border-top:1px solid #272219;font:400 12px/1.7 ' . $F . ';color:#948D7B;">'
        . '<div style="color:#C9C3B6;font-weight:500;">Syed Abdul</div>'
        . 'Founder, syed.ai<br>Celebration, Florida &middot; Abu Dhabi &middot; Lahore<br>'
        . '<a href="https://www.linkedin.com/in/syed" style="color:#CFAF67;text-decoration:none;">linkedin.com/in/syed</a>'
        . '</td></tr>';

    $h .= '</table></td></tr></table></body></html>';
    return $h;
}
