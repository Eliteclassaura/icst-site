<?php
/**
 * syed.ai — the subscriber list, and the export that feeds a future CRM
 * ---------------------------------------------------------------------------
 * Key-gated, unlinked from anywhere, noindex. Set SUBS_KEY below before you
 * upload it; until you do, it refuses everything.
 *
 * This reads the append-only log above the web root and shows the folded
 * current state. It never writes to it — the only things that change a
 * subscriber's status are a signup (send.php) and a click (confirm.php).
 *
 * Two exports:
 *   ?key=…&export=csv      a spreadsheet
 *   ?key=…&export=payload  documents shaped for the Payload collection in
 *                          _private/payload/Subscribers.ts
 */

declare(strict_types=1);

const SUBS_KEY = '<legacy-admin-key-redacted>';

define('SYEDAI_ENDPOINT', true);
ini_set('display_errors', '0');

header('X-Robots-Tag: noindex, nofollow');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');

$given = (string)($_GET['key'] ?? '');
if (SUBS_KEY === 'CHANGE-ME-BEFORE-UPLOAD' || !hash_equals(SUBS_KEY, $given)) {
    http_response_code(403);
    header('Content-Type: text/html; charset=utf-8');
    exit('<p style="font:16px/1.6 sans-serif;padding:2rem;max-width:60ch">Set <code>SUBS_KEY</code> at '
       . 'the top of <code>subscribers.php</code> to something of your own, then open it as '
       . '<code>subscribers.php?key=YOUR-VALUE</code>.</p>');
}

function sb_config_paths(): array {
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
$cfgPath = '';
foreach (sb_config_paths() as $c) { if (is_readable($c)) { $cfgPath = $c; break; } }
if ($cfgPath === '') { http_response_code(500); exit('Config not found.'); }
$cfg = require $cfgPath;
if (!is_array($cfg)) { http_response_code(500); exit('Config malformed.'); }

require_once __DIR__ . '/email-check.php';
require_once __DIR__ . '/subs.php';

$file = subs_file($cfg);

/* ── exports ─────────────────────────────────────────────────────────── */
$export = (string)($_GET['export'] ?? '');
if ($export === 'csv') {
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="syedai-subscribers-' . gmdate('Y-m-d') . '.csv"');
    echo subs_export_csv($cfg);
    exit;
}
if ($export === 'payload') {
    header('Content-Type: application/json; charset=utf-8');
    header('Content-Disposition: attachment; filename="syedai-subscribers-payload-' . gmdate('Y-m-d') . '.json"');
    echo subs_export_payload($cfg);
    exit;
}

$all    = subs_all($cfg);
$counts = subs_counts($cfg);
$events = subs_events($cfg);
$total  = count($all);

// newest first for display
uasort($all, fn($a, $b) => strcmp((string)($b['at'] ?? ''), (string)($a['at'] ?? '')));

$e = fn($v) => htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8');
$k = rawurlencode(SUBS_KEY);

$confirmRate = $counts['confirmed'] + $counts['pending'] > 0
    ? round($counts['confirmed'] / ($counts['confirmed'] + $counts['pending']) * 100)
    : 0;
?><!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Subscribers — syed.ai</title>
<style>
  :root{--bg:#060504;--panel:#0E0C09;--sink:#0B0907;--ink:#F7F5F0;--ink2:#C9C3B6;
        --ink3:#948D7B;--ink4:#6E6959;--gold:#CFAF67;--dim:#8A6A30;--line:#241F17;
        --go:#7DAE8A;--hold:#CFAF67;--stop:#D06A60;
        --ui:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
        --mono:ui-monospace,SFMono-Regular,Menlo,monospace}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink2);font:400 15px/1.6 var(--ui)}
  .wrap{max-width:1120px;margin-inline:auto;padding:36px 24px 80px}
  h1{margin:0 0 6px;font:500 26px/1.2 var(--ui);color:var(--ink)}
  .sub{margin:0 0 28px;color:var(--ink4);font-size:13.5px}
  .sub code{font-family:var(--mono);font-size:12.5px;color:var(--dim)}
  .tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1px;
         background:var(--line);border:1px solid var(--line);margin-bottom:14px}
  .tile{background:var(--panel);padding:18px 20px}
  .tile b{display:block;font:600 30px/1 var(--ui);color:var(--ink);font-variant-numeric:tabular-nums}
  .tile span{display:block;margin-top:7px;font:600 9.5px/1 var(--ui);letter-spacing:.14em;
             text-transform:uppercase;color:var(--ink4)}
  .tile--go b{color:var(--go)} .tile--hold b{color:var(--hold)} .tile--stop b{color:var(--stop)}
  .bar{display:flex;gap:10px;flex-wrap:wrap;margin:22px 0 30px}
  .btn{font:600 10.5px/1 var(--ui);letter-spacing:.14em;text-transform:uppercase;
       padding:12px 18px;text-decoration:none;border:1px solid var(--line);color:var(--ink3)}
  .btn:hover{border-color:var(--dim);color:var(--gold)}
  .btn--solid{background:var(--gold);color:#0A0806;border-color:var(--gold)}
  .note{padding:16px 18px;background:#161209;border-left:2px solid var(--dim);
        font-size:13.5px;color:var(--ink3);margin-bottom:26px;max-width:76ch}
  .note strong{color:var(--ink)}
  .scroll{overflow-x:auto;border:1px solid var(--line)}
  table{width:100%;border-collapse:collapse;font:400 13.5px/1.5 var(--ui)}
  th{text-align:left;padding:11px 13px;background:var(--sink);border-bottom:1px solid var(--line);
     font:600 9.5px/1.3 var(--ui);letter-spacing:.12em;text-transform:uppercase;color:var(--ink4)}
  td{padding:11px 13px;border-bottom:1px solid var(--line);vertical-align:top}
  tr:last-child td{border-bottom:0}
  td.m{font-family:var(--mono);font-size:12px;color:var(--ink3);white-space:nowrap}
  .pill{display:inline-block;font:600 9px/1 var(--ui);letter-spacing:.1em;text-transform:uppercase;
        padding:5px 7px;white-space:nowrap}
  .p-confirmed{color:var(--go);border:1px solid rgba(125,174,138,.4)}
  .p-pending{color:var(--hold);border:1px solid rgba(207,175,103,.4)}
  .p-unsubscribed{color:var(--ink4);border:1px solid var(--line)}
  .p-bounced{color:var(--stop);border:1px solid rgba(208,106,96,.4)}
  .empty{padding:44px 20px;text-align:center;color:var(--ink4);background:var(--panel)}
</style></head><body><div class="wrap">

<h1>The Answer Layer — subscribers</h1>
<p class="sub">Append-only log at <code><?= $e($file) ?></code> · <?= count($events) ?> events · <?= $total ?> people</p>

<div class="tiles">
  <div class="tile tile--go"><b><?= $counts['confirmed'] ?></b><span>Confirmed</span></div>
  <div class="tile tile--hold"><b><?= $counts['pending'] ?></b><span>Awaiting click</span></div>
  <div class="tile"><b><?= $counts['unsubscribed'] ?></b><span>Unsubscribed</span></div>
  <div class="tile tile--stop"><b><?= $counts['bounced'] ?></b><span>Bounced</span></div>
  <div class="tile"><b><?= $confirmRate ?>%</b><span>Confirm rate</span></div>
</div>

<div class="bar">
  <a class="btn btn--solid" href="?key=<?= $k ?>&amp;export=payload">Export for Payload</a>
  <a class="btn" href="?key=<?= $k ?>&amp;export=csv">Export CSV</a>
  <a class="btn" href="?key=<?= $k ?>">Refresh</a>
</div>

<?php if ($counts['pending'] > 0 && $confirmRate < 60 && $counts['confirmed'] + $counts['pending'] >= 5): ?>
<div class="note"><strong>A confirm rate under 60% usually means delivery, not disinterest.</strong>
Check whether the confirmation email is landing in spam — send yourself a test signup and look.
A pending row is someone who wanted the newsletter and never got the chance to say so.</div>
<?php endif; ?>

<div class="note">
  <strong>Only confirmed addresses may be mailed.</strong> A pending row has not proved the mailbox
  exists, and an unsubscribed row has asked you to stop — mailing either one costs you the sending
  reputation this whole site depends on. The Payload export carries the status on every document so
  the rule survives the migration.
</div>

<div class="scroll">
<?php if (!$all): ?>
  <div class="empty">No signups yet. The log is created on the first one.</div>
<?php else: ?>
<table>
  <thead><tr>
    <th>Email</th><th>Name</th><th>Status</th><th>Signed up</th>
    <th>Confirmed</th><th>Source</th><th>Page</th>
  </tr></thead>
  <tbody>
  <?php foreach ($all as $s):
      $st = (string)($s['status'] ?? 'pending'); ?>
    <tr>
      <td><?= $e($s['email'] ?? '') ?><?= !empty($s['meta']['roleAddress']) ? ' <span class="pill p-pending">role</span>' : '' ?></td>
      <td><?= $e($s['name'] ?? '') ?: '<span style="color:#6E6959">—</span>' ?></td>
      <td><span class="pill p-<?= $e($st) ?>"><?= $e($st) ?></span></td>
      <td class="m"><?= $e(substr((string)($s['signupAt'] ?? ''), 0, 16)) ?></td>
      <td class="m"><?= $e(substr((string)($s['confirmedAt'] ?? ''), 0, 16)) ?: '—' ?></td>
      <td class="m"><?= $e($s['source'] ?? '') ?></td>
      <td class="m"><?= $e($s['sourcePage'] ?? '') ?: '—' ?></td>
    </tr>
  <?php endforeach; ?>
  </tbody>
</table>
<?php endif; ?>
</div>

<div class="note" style="margin-top:26px">
  <strong>When the CRM is ready:</strong> hit <em>Export for Payload</em>, and import the
  <code>docs</code> array into the <code>subscribers</code> collection defined in
  <code>_private/payload/Subscribers.ts</code>. Match on <code>externalId</code> so a re-run
  updates rather than duplicates. The log stays as the audit trail — do not delete it.
</div>

</div></body></html>
