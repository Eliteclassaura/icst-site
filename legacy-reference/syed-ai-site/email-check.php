<?php
/**
 * syed.ai — email validity checking
 * ---------------------------------------------------------------------------
 * Four layers, cheapest first, no third-party service and no API key:
 *
 *   1. Syntax        — RFC-shaped, length-capped, no smuggled control bytes
 *   2. Domain        — the domain actually publishes somewhere to deliver mail
 *   3. Reputation    — disposable and throwaway providers
 *   4. Typo rescue   — "gmial.com" gets a suggestion rather than a rejection
 *
 * What none of these can do is prove the mailbox exists and belongs to the
 * person typing. Only a confirmation click does that, which is why the
 * newsletter is double opt-in — see subs.php. These four layers exist to stop
 * an address that is *obviously* wrong from ever reaching that stage, because
 * a bounce costs sending reputation and a typo costs a subscriber silently.
 */

declare(strict_types=1);

if (!defined('SYEDAI_ENDPOINT')) { http_response_code(404); exit; }

/** Providers whose whole purpose is a mailbox that stops existing. */
function ec_disposable(): array {
    static $d = [
        'mailinator.com','guerrillamail.com','guerrillamail.net','sharklasers.com',
        '10minutemail.com','10minutemail.net','tempmail.com','temp-mail.org',
        'throwawaymail.com','yopmail.com','yopmail.net','trashmail.com','trashmail.net',
        'getnada.com','nada.email','dispostable.com','maildrop.cc','mailnesia.com',
        'fakeinbox.com','spamgourmet.com','mytemp.email','tempr.email','discard.email',
        'grr.la','spam4.me','emailondeck.com','moakt.com','mohmal.com','burnermail.io',
        'inboxbear.com','tmpmail.org','mailcatch.com','anonbox.net','tempmailo.com',
    ];
    return $d;
}

/** The domains people actually mistype, and what they meant. */
function ec_common_domains(): array {
    static $d = [
        'gmail.com','googlemail.com','outlook.com','hotmail.com','hotmail.co.uk',
        'live.com','msn.com','yahoo.com','yahoo.co.uk','yahoo.co.in','ymail.com',
        'icloud.com','me.com','mac.com','aol.com','proton.me','protonmail.com',
        'zoho.com','gmx.com','gmx.de','mail.com','fastmail.com','hey.com',
        'comcast.net','verizon.net','att.net','sbcglobal.net','btinternet.com',
        'rediffmail.com','emirates.net.ae','eim.ae',
    ];
    return $d;
}

/** Mailbox names that are almost never a person. Flagged, never rejected. */
function ec_role_locals(): array {
    static $r = ['info','admin','administrator','sales','support','contact','hello',
                 'help','office','enquiries','inquiries','noreply','no-reply','donotreply',
                 'postmaster','webmaster','abuse','billing','accounts','marketing','team'];
    return $r;
}

/**
 * Damerau-Levenshtein: like levenshtein(), but a swap of two adjacent
 * characters costs 1 instead of 2.
 *
 * This matters more than it sounds. Transposition is the single most common
 * typing error — "gmial.com" for "gmail.com" — and plain Levenshtein scores it
 * as two edits, the same as two unrelated substitutions. Under a one-edit
 * threshold the most common typo of all is the one that slips through.
 */
function ec_distance(string $a, string $b): int {
    $la = strlen($a); $lb = strlen($b);
    if ($la === 0) { return $lb; }
    if ($lb === 0) { return $la; }
    $d = [];
    for ($i = 0; $i <= $la; $i++) { $d[$i] = [$i]; }
    for ($j = 0; $j <= $lb; $j++) { $d[0][$j] = $j; }
    for ($i = 1; $i <= $la; $i++) {
        for ($j = 1; $j <= $lb; $j++) {
            $cost = $a[$i - 1] === $b[$j - 1] ? 0 : 1;
            $d[$i][$j] = min(
                $d[$i - 1][$j] + 1,          // deletion
                $d[$i][$j - 1] + 1,          // insertion
                $d[$i - 1][$j - 1] + $cost   // substitution
            );
            if ($i > 1 && $j > 1
                && $a[$i - 1] === $b[$j - 2]
                && $a[$i - 2] === $b[$j - 1]) {
                $d[$i][$j] = min($d[$i][$j], $d[$i - 2][$j - 2] + 1);   // transposition
            }
        }
    }
    return $d[$la][$lb];
}

/**
 * Split an address without trusting it. Returns [local, domain] or null.
 * Only the LAST @ separates, because a quoted local part may contain one.
 */
function ec_split(string $email): ?array {
    $at = strrpos($email, '@');
    if ($at === false || $at === 0 || $at === strlen($email) - 1) { return null; }
    return [substr($email, 0, $at), strtolower(substr($email, $at + 1))];
}

/**
 * The key an address is deduplicated on — NOT the address that gets mailed.
 *
 * Domains are case-insensitive per RFC 1035, so those are lowercased. Local
 * parts are technically case-SENSITIVE, but no mainstream provider treats them
 * that way and someone who types Dana@ then dana@ is one person, so the key
 * lowercases both. Gmail additionally ignores dots and everything after a +,
 * so Gmail keys are folded that way too — which is what stops one person
 * subscribing eleven times with dana+1@, dana+2@ and so on.
 *
 * The original spelling is always what gets stored and mailed. This is only
 * ever an index.
 */
function ec_dedupe_key(string $email): string {
    $p = ec_split(trim($email));
    if ($p === null) { return strtolower(trim($email)); }
    [$local, $domain] = $p;
    $local = strtolower($local);
    if (in_array($domain, ['gmail.com', 'googlemail.com'], true)) {
        $local = str_replace('.', '', explode('+', $local)[0]);
        $domain = 'gmail.com';
    } else {
        $local = explode('+', $local)[0];
    }
    return $local . '@' . $domain;
}

/**
 * @param  string      $email
 * @param  bool        $checkDns   false in tests and where DNS is unavailable
 * @param  bool        $allowTypo  true once the sender has confirmed they meant it
 * @return array{ok:bool, verdict:string, reason:string, suggestion:?string, role:bool, domain:string}
 *         verdict: valid | syntax | domain | disposable | typo
 */
function ec_check(string $email, bool $checkDns = true, bool $allowTypo = false): array {
    $out = ['ok' => false, 'verdict' => 'syntax', 'reason' => '',
            'suggestion' => null, 'role' => false, 'domain' => ''];

    $email = trim($email);

    /* ── 1. Syntax ───────────────────────────────────────────────────── */
    if ($email === '') {
        $out['reason'] = 'No address given.';
        return $out;
    }
    if (strlen($email) > 254) {          // RFC 5321 path limit
        $out['reason'] = 'That address is longer than an address can be.';
        return $out;
    }
    if (preg_match('/[\x00-\x1F\x7F,;<>\s]/', $email)) {
        $out['reason'] = 'That address contains characters an address cannot contain.';
        return $out;
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $out['reason'] = 'That does not look like an email address.';
        return $out;
    }

    $parts = ec_split($email);
    if ($parts === null) {
        $out['reason'] = 'That does not look like an email address.';
        return $out;
    }
    [$local, $domain] = $parts;
    $out['domain'] = $domain;

    if (strlen($local) > 64) {           // RFC 5321 local-part limit
        $out['reason'] = 'The part before the @ is too long.';
        return $out;
    }
    // A domain must have a dot and a plausible TLD. filter_var accepts
    // "user@localhost", which is valid on a LAN and useless to a newsletter.
    if (!preg_match('/^(?=.{4,253}$)([a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/', $domain)) {
        $out['verdict'] = 'domain';
        $out['reason']  = 'That domain does not look like a real one.';
        return $out;
    }

    /* ── 2. Known domains, exact match, both directions ─────────────── */
    /* Order matters here, and getting it wrong is how a validator does damage.
       An earlier draft ran the typo rescue before this and duly offered to
       "correct" yopmail.com to hotmail.com — two substitutions apart, and both
       real domains. A domain that is *known*, whether known-good or known-bad,
       must never be second-guessed. */
    if (in_array($domain, ec_disposable(), true)) {
        $out['verdict'] = 'disposable';
        $out['reason']  = 'That is a disposable address. Use one you will still have on Tuesday.';
        return $out;
    }
    if (in_array($domain, ec_common_domains(), true)) {
        $out['ok']      = true;
        $out['verdict'] = 'valid';
        $out['role']    = in_array(strtolower(explode('+', $local)[0]), ec_role_locals(), true);
        return $out;
    }

    /* ── 3. Typo rescue ─────────────────────────────────────────────── */
    /* This runs BEFORE the DNS check, on purpose, and the reason is squatting.
       gmial.com, gmai.com and hotmial.com are all registered — typo domains of
       big providers are valuable precisely because people mistype them — so
       they resolve, publish MX, and sail through a deliverability test. Asking
       "can this receive mail?" first would therefore approve exactly the
       addresses this check exists to catch.
 
       It is a soft verdict. The caller may re-submit with $allowTypo to say
       "I meant it", because some people really do have an address at a domain
       one edit from gmail.com, and a validator that cannot be overridden ends
       up refusing real subscribers. */
    if (!$allowTypo) {
        foreach (ec_common_domains() as $known) {
            $dist  = ec_distance($domain, $known);
            // One edit on a short domain, two on a long one. Transposition
            // counts as one, so gmial.com is caught at distance 1.
            $allow = strlen($known) >= 11 ? 2 : 1;
            if ($dist > 0 && $dist <= $allow) {
                $out['verdict']    = 'typo';
                $out['suggestion'] = $local . '@' . $known;
                $out['reason']     = 'Did you mean ' . $local . '@' . $known . '?';
                return $out;
            }
        }
    }

    /* ── 4. Can the domain receive mail at all? ──────────────────────── */
    /* An MX record is the right question. Some smaller domains accept mail on
       their A record instead with no MX published, which is legal, so A or AAAA
       counts as a pass. DNS can also simply be unavailable, and a resolver
       problem on my server must never cost a real subscriber — so an
       inconclusive lookup is treated as deliverable. */
    if ($checkDns && function_exists('checkdnsrr')) {
        $deliverable = @checkdnsrr($domain, 'MX')
                    || @checkdnsrr($domain, 'A')
                    || @checkdnsrr($domain, 'AAAA');
        if (!$deliverable) {
            $out['verdict'] = 'domain';
            $out['reason']  = 'That domain is not set up to receive email.';
            return $out;
        }
    }

    $out['ok']      = true;
    $out['verdict'] = 'valid';
    $out['role']    = in_array(strtolower(explode('+', $local)[0]), ec_role_locals(), true);
    return $out;
}
