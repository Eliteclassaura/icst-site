<?php
/**
 * syed.ai — the subscriber store
 * ---------------------------------------------------------------------------
 * An append-only event log, one JSON object per line, kept ABOVE the web root
 * next to the mail config. There is no table to migrate and no database
 * extension to depend on, which matters on shared hosting.
 *
 * Why append-only rather than a row you edit in place:
 *
 *   • A crash mid-write cannot corrupt what is already there. The worst case
 *     is one truncated final line, and the reader skips lines that will not
 *     parse rather than dying on them.
 *   • Consent gets an audit trail for free. "When did this person agree, from
 *     what address, with what user agent" is exactly what you need if anyone
 *     ever asks, and a mutable row throws that away on every update.
 *   • Two concurrent signups cannot lose each other. An exclusive-locked
 *     append is atomic; a read-modify-write is not.
 *
 * Current state is the newest event per dedupe key. subs_all() does that fold.
 *
 * Everything is shaped for a Payload CMS import: camelCase keys, ISO-8601 UTC
 * timestamps, a stable external id, and a schemaVersion so a future migration
 * knows what it is reading. See _private/payload/Subscribers.ts.
 */

declare(strict_types=1);

if (!defined('SYEDAI_ENDPOINT')) { http_response_code(404); exit; }

const SUBS_SCHEMA = 1;

/** Valid states. A subscriber only ever moves forward through these. */
const SUBS_STATES = ['pending', 'confirmed', 'unsubscribed', 'bounced'];

function subs_file(array $cfg): string {
    if (!empty($cfg['subscribers_file'])) { return (string)$cfg['subscribers_file']; }
    // Default: beside the config, which is already above the web root.
    return dirname(__DIR__) . '/subscribers.jsonl';
}

/**
 * A sortable, collision-resistant id. Time prefix first so a plain sort is
 * chronological, which makes the log readable by eye and imports predictable.
 */
function subs_id(): string {
    return 'sub_' . base_convert((string)time(), 10, 36) . '_' . bin2hex(random_bytes(6));
}

function subs_now(): string {
    return gmdate('c');
}

/**
 * Append one event. Returns false only if the write itself failed, which the
 * caller must treat as "the subscriber was not recorded".
 */
function subs_append(array $cfg, array $event): bool {
    $line = json_encode($event, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($line === false) { return false; }
    $f = subs_file($cfg);
    $ok = @file_put_contents($f, $line . "\n", FILE_APPEND | LOCK_EX);
    if ($ok !== false) { @chmod($f, 0640); }
    return $ok !== false;
}

/**
 * Every event, oldest first. A line that will not parse is skipped rather than
 * fatal — one bad line must never take the whole list down.
 * @return array<int,array<string,mixed>>
 */
function subs_events(array $cfg): array {
    $f = subs_file($cfg);
    if (!is_readable($f)) { return []; }
    $out = [];
    $h = @fopen($f, 'rb');
    if (!$h) { return []; }
    while (($line = fgets($h)) !== false) {
        $line = trim($line);
        if ($line === '') { continue; }
        $rec = json_decode($line, true);
        if (is_array($rec) && !empty($rec['email'])) { $out[] = $rec; }
    }
    fclose($h);
    return $out;
}

/**
 * Current state per subscriber: the newest event for each dedupe key, with the
 * ORIGINAL signup time and id preserved rather than overwritten by the latest
 * event. Losing the signup date on confirmation would be the obvious bug here.
 * @return array<string,array<string,mixed>>  keyed by dedupe key
 */
function subs_all(array $cfg): array {
    $state = [];
    foreach (subs_events($cfg) as $e) {
        $k = (string)($e['dedupeKey'] ?? strtolower((string)$e['email']));
        $step = ['status' => $e['status'] ?? '?', 'at' => $e['at'] ?? null];

        if (!isset($state[$k])) {
            $e['history'] = [$step];
            $state[$k] = $e;
            continue;
        }

        $prev = $state[$k];
        $merged = array_merge($prev, $e);          // newest event wins on mutable fields
        // Identity and origin are sticky: a confirmation must not overwrite the
        // date someone signed up, or the id a future CRM import will match on.
        $merged['id']       = $prev['id']       ?? ($e['id'] ?? null);
        $merged['signupAt'] = $prev['signupAt'] ?? ($e['signupAt'] ?? null);
        $merged['history']  = array_merge((array)($prev['history'] ?? []), [$step]);
        $state[$k] = $merged;
    }
    return $state;
}

/** Current state for one address, or null. */
function subs_find(array $cfg, string $email): ?array {
    $key = ec_dedupe_key($email);
    return subs_all($cfg)[$key] ?? null;
}

function subs_counts(array $cfg): array {
    $c = array_fill_keys(SUBS_STATES, 0);
    foreach (subs_all($cfg) as $s) {
        $st = (string)($s['status'] ?? 'pending');
        if (isset($c[$st])) { $c[$st]++; }
    }
    return $c;
}

/**
 * The token in a confirm or unsubscribe link.
 *
 * HMAC over the key, the action and the config secret. No token is stored, so
 * there is nothing to steal from the file, and a link cannot be reused for the
 * other action. Truncated to 32 hex characters — 128 bits, which is far past
 * what an unguessable link needs.
 */
function subs_token(array $cfg, string $email, string $action): string {
    $secret = (string)($cfg['token_secret'] ?? '');
    if ($secret === '') {
        // Fall back to something server-specific rather than an empty key.
        $secret = (string)($cfg['smtp_pass'] ?? '') . ($cfg['to_email'] ?? '') . __DIR__;
    }
    return substr(hash_hmac('sha256', ec_dedupe_key($email) . '|' . $action, $secret), 0, 32);
}

function subs_verify(array $cfg, string $email, string $action, string $token): bool {
    return hash_equals(subs_token($cfg, $email, $action), strtolower(trim($token)));
}

/**
 * Record a state change. Carries the previous record's id and signup time
 * forward so the fold in subs_all() has them even if it only reads one line.
 */
function subs_transition(array $cfg, string $email, string $status, array $extra = []): bool {
    if (!in_array($status, SUBS_STATES, true)) { return false; }
    $prev = subs_find($cfg, $email);
    $event = [
        'schemaVersion' => SUBS_SCHEMA,
        'id'            => $prev['id'] ?? subs_id(),
        'email'         => $prev['email'] ?? $email,
        'dedupeKey'     => ec_dedupe_key($email),
        'status'        => $status,
        'at'            => subs_now(),
        'signupAt'      => $prev['signupAt'] ?? subs_now(),
    ] + $extra;
    return subs_append($cfg, $event);
}

/**
 * A new signup. Returns [state, record] where state is one of:
 *   new        — recorded as pending, send the confirmation email
 *   pending    — already awaiting confirmation, resend it
 *   confirmed  — already on the list, send nothing
 *   returning  — previously unsubscribed, recorded as pending again
 *   failed     — the write did not happen
 */
function subs_signup(array $cfg, string $email, string $name, array $meta): array {
    $prev = subs_find($cfg, $email);
    $now  = subs_now();

    if ($prev && ($prev['status'] ?? '') === 'confirmed') {
        return ['confirmed', $prev];
    }

    $state = $prev === null ? 'new'
           : (($prev['status'] ?? '') === 'unsubscribed' ? 'returning' : 'pending');

    $event = [
        'schemaVersion' => SUBS_SCHEMA,
        'id'            => $prev['id'] ?? subs_id(),
        'email'         => $email,
        'dedupeKey'     => ec_dedupe_key($email),
        'name'          => $name,
        'status'        => 'pending',
        'at'            => $now,
        'signupAt'      => $prev['signupAt'] ?? $now,
        'confirmedAt'   => null,
        'unsubscribedAt'=> null,
        'tags'          => ['answer-layer'],
        'consent'       => [
            'method'    => 'double-opt-in',
            'requested' => $now,
            'ip'        => $meta['ip'] ?? '',
            'userAgent' => mb_substr((string)($meta['ua'] ?? ''), 0, 300),
        ],
        'source'        => $meta['source'] ?? 'newsletter',
        'sourcePage'    => $meta['page'] ?? '',
        'meta'          => [
            'referrer' => $meta['referrer'] ?? '',
            'campaign' => $meta['campaign'] ?? '',
            'timezone' => $meta['tz'] ?? '',
            'screen'   => $meta['screen'] ?? '',
            'language' => $meta['lang'] ?? '',
            'roleAddress' => (bool)($meta['role'] ?? false),
        ],
    ];

    return subs_append($cfg, $event) ? [$state, $event] : ['failed', null];
}

/* ══ Export ═══════════════════════════════════════════════════════════════
   Two shapes. CSV for a spreadsheet; JSON for the Payload import. Both read
   the folded current state, so an unsubscribed address exports as
   unsubscribed rather than appearing twice.                                */

function subs_export_csv(array $cfg): string {
    $rows = subs_all($cfg);
    $h = fopen('php://temp', 'r+');
    fputcsv($h, ['id','email','name','status','signupAt','confirmedAt','unsubscribedAt',
                 'source','sourcePage','tags','ip','userAgent','referrer','campaign','timezone']);
    foreach ($rows as $s) {
        fputcsv($h, [
            $s['id'] ?? '', $s['email'] ?? '', $s['name'] ?? '', $s['status'] ?? '',
            $s['signupAt'] ?? '', $s['confirmedAt'] ?? '', $s['unsubscribedAt'] ?? '',
            $s['source'] ?? '', $s['sourcePage'] ?? '',
            implode('|', (array)($s['tags'] ?? [])),
            $s['consent']['ip'] ?? '', $s['consent']['userAgent'] ?? '',
            $s['meta']['referrer'] ?? '', $s['meta']['campaign'] ?? '', $s['meta']['timezone'] ?? '',
        ]);
    }
    rewind($h);
    $csv = (string)stream_get_contents($h);
    fclose($h);
    return $csv;
}

/**
 * Payload-shaped export. One JSON array of documents whose field names match
 * the collection in _private/payload/Subscribers.ts, so the import is a read
 * and a create loop with no transformation in between.
 */
function subs_export_payload(array $cfg): string {
    $docs = [];
    foreach (subs_all($cfg) as $s) {
        $docs[] = [
            'externalId'     => $s['id'] ?? null,
            'email'          => $s['email'] ?? null,
            'name'           => $s['name'] ?? '',
            'status'         => $s['status'] ?? 'pending',
            'signupAt'       => $s['signupAt'] ?? null,
            'confirmedAt'    => $s['confirmedAt'] ?? null,
            'unsubscribedAt' => $s['unsubscribedAt'] ?? null,
            'source'         => $s['source'] ?? 'newsletter',
            'sourcePage'     => $s['sourcePage'] ?? '',
            'tags'           => array_values(array_map(
                                    fn($t) => ['tag' => $t], (array)($s['tags'] ?? []))),
            'consent'        => [
                'method'     => $s['consent']['method']    ?? 'double-opt-in',
                'requestedAt'=> $s['consent']['requested'] ?? null,
                'ip'         => $s['consent']['ip']        ?? '',
                'userAgent'  => $s['consent']['userAgent'] ?? '',
            ],
            'meta'           => $s['meta'] ?? new stdClass(),
            'history'        => array_values((array)($s['history'] ?? [])),
            'schemaVersion'  => (int)($s['schemaVersion'] ?? SUBS_SCHEMA),
        ];
    }
    return json_encode([
        'collection' => 'subscribers',
        'exportedAt' => subs_now(),
        'count'      => count($docs),
        'docs'       => $docs,
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
