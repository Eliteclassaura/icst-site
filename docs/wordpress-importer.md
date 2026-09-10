# WordPress importer — architecture (Release 4; foundations in C6.5)

> Turns a WordPress site (SQL dump + `wp-content/uploads/`) plus an approved `page-decisions` run into a `site-blueprint.json` v2 that the seed applies. H2O Cooling is the first fixture **once its OLD/NEW archives, databases and SEO evidence are supplied**; nothing about H2O is invented before then. The pack's spec (`docs/inputs/ogcs-integration-pack-v1/04_FACTORY_CHANGE_SKETCHES/wordpress-import-spec.md`) is adopted with the amendments below.

## Where it sits

```
SQL dump + uploads ──► detect languages ──► parse ──► WpRecord[] ──► apply(decisions) ──► blueprint v2 + manifest ──► seed ──► parity gate
        │                      │                                        ▲
        │                      └── variants found but not representable → STOP, named reason (ADR-029 §4)
        └── security pass (owner: strip customer/comment tables; wp-config.sanitized.php)   page-decisions (OGCS, approved)
```

`tools/wordpress-import` (`@factory/wordpress-import`) depends on `@factory/seo-contracts` and `zod` only. It never touches Payload: its output is the blueprint, and the blueprint is the only content ingress (ADR-025). Every stage is a pure function over the previous stage's output, so each is testable against a fixture and re-runnable identically (golden test: same input → byte-identical blueprint).

## Stages

1. **Security pass (owner, before handoff).** `wp-config.php` is never read; the owner supplies `wp-config.sanitized.php` (only `DB_NAME`, `$table_prefix`). Customer, order and comment tables are stripped from the dump (`mysqldump --ignore-table=…`). The importer refuses to open a dump that still contains them (`tableAllowed`).
2. **language/region detection (ADR-029 §4, A23, R60).** Before anything is mapped: detect translation plugins and their tables (WPML `icl_translations`/`icl_languages`, Polylang term-taxonomy language/translation rows, TranslatePress, WooCommerce Multilingual), `wp_options` language settings, per-language permalink structures, and existing hreflang rows in `yoast_indexable` / Rank Math meta. The result is always written to the manifest — **including a zero count**, so "monolingual" is a recorded finding, never an assumption. If variants are found that the Factory cannot yet represent, the import **fails loudly** with the detected languages, their URL pattern and the reason; it never flattens a multilingual site into one language. Factory rendering support arrives by reconciliation at Release 4 (ADR-029 §3); this stage is independent of it and lands with parse.
3. **parse.** Reads only `posts`, `postmeta`, `terms*`, `options` (permalink structure, `siteurl`/`home`, `page_on_front`, SEO-plugin settings blobs), `redirection_*`, `yoast_indexable`. Never `users.user_email`/`user_pass` (author attribution is `display_name` only), never `comments`, never WooCommerce customer tables. `wp_options` rows whose name matches a secret pattern are **listed by name** in the manifest and never read. Output: `WpRecord[]` with resolved public URLs from the permalink structure.
4. **content → blocks.** Gutenberg / Classic / Elementor HTML → the same `Section` approach as `tools/legacy-extract/dom.ts`: headings and lists become `richText`, recognisable patterns become registry blocks (FAQ, steps, tables, CTAs), everything else lands in `richText` so no text is lost. **`stripEmails` runs on every fragment**: `mailto:` links become contact-form links, bare addresses become form links, each removal goes to the review queue (ADR-028 §10). Images: `_wp_attachment_image_alt` → `alt`; missing alt → review queue; every media row carries `rights: 'unknown'` until the owner marks it (R34 is a publish gate).
5. **SEO carry-over.** Yoast / Rank Math title, description, canonical, robots, focus keyword, OG → `seo.*`; schema blobs → `seo.schemaExtra` (carry, then generate — ADR-025); `hreflang` → captured in the manifest and the discovery baseline; **`seo.alternates` does not exist yet** — it arrives with the ADR-029 reconciliation at Release 4, so until then hreflang data is preserved as a reported finding, not written to a page.
6. **apply(decisions).** For every record, find its `page-decisions` row by source URL. `effectiveAction` (draft runs degrade PRUNE/REDIRECT/NOINDEX/CONSOLIDATE to REVIEW). PRUNE → not emitted; REDIRECT/CONSOLIDATE → `redirects[]` row (`status` seeds as `active`, `source: 'migration'`) and no page; NOINDEX → page with `seo.noindex` + `noindexReason`; REVIEW → page emitted as **draft** with `verification.status: 'unverified'`; PROTECT/IMPROVE/REWRITE/REPOSITION → page with `decision_ref` and `parity.accept` from the row. `pages[].migration` filled (source URL, ids, original title/description/H1/word count, content hash, `decisionsVersion = run_id`). Records with no decision → REVIEW.
7. **manifest.** Snapshot time, dump hash, counts (read / imported / pruned / redirected / review), `emailsRemoved`, **`languages` (detected variants, their URL pattern and per-language counts — zero is recorded explicitly)**, secret option names, `decisionsRunId`. Content modified after the snapshot is a **delta import** (R44).

## Rules the code enforces

- No email address in any emitted page, ALT, link or schema (`stripEmails`; the blueprint validator's email rule is the second line).
- No `wp_users` email/password, no comments, no WooCommerce customers — `tableAllowed` / `FORBIDDEN_COLUMNS`.
- No PRUNE without `prune_blocked=false` and `decisions_status=approved` (schema + `effectiveAction`).
- Every removed URL has a redirect or an explicit 410; the parity gate refuses missing PROTECT URLs (`protect_missing`).
- Deterministic: same dump + same decisions → byte-identical blueprint (golden test).
- **Never flatten a multilingual source.** Variants are detected and reported; an import that cannot represent them stops with a named reason (ADR-029 §4, A23, R60). The importer does not assume H2O — or any client — is monolingual.

## Fixture plan (no client data)

A synthetic WXR/SQL fixture generated by this project (A20): 10 posts, 3 pages, 2 products, Yoast meta, a menu, one `mailto:` in content, one Redirection row, one secret-looking option, **and a second fixture with a translation plugin's tables so the detection stage and the fail-loudly path are both tested** — plus a matching `page-decisions` fixture with one of each action. H2O becomes the second, real fixture when supplied; its dump goes through the security pass first and is never committed.

## What is built now (C6.5 prep)

`tools/wordpress-import`: package, pipeline types (`WpSource`, `WpRecord`, `LanguageDetection`, `ImportManifest`, `Importer`), `stripEmails`, `tableAllowed`, `FORBIDDEN_COLUMNS`, `SECRET_OPTION_PATTERNS`, `authorLabel`, tests. The detection, parse and apply stages follow in Release 4 against the synthetic fixtures; the Factory's own multilingual rendering arrives by reconciliation (ADR-029).
