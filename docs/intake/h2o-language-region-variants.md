# H2O intake — historical and current language / region variants

> Added by ADR-029 (2026-09-06). These questions must be answered **before** the H2O migration runs, not during it. The Factory cannot render hreflang yet; H2O's isolated staging delivery project proves that implementation, and the importer must still detect variants and refuse to flatten them (A23, R60). **Do not assume H2O is monolingual.**

## Why this is asked up front

A migration that discovers language variants halfway through has already lost the chance to record what existed. Language and region signals are the kind of SEO equity that disappears silently: a page at `/de/kuehlturm-reparatur/` with no target locale simply becomes a 404, and no current gate can see it. The freeze/discovery step is the only moment both the OLD and the NEW site can be observed as they actually are.

## Questions for the owner

**Current state**

1. Does either site (OLD or NEW) serve content in more than one language today? Which languages, and at which URLs?
2. Are there region-specific variants in the same language (for example `en-GB` vs `en-US`, or a Gulf-region English)? Region-only variants are as easy to lose as language ones.
3. Which URL pattern is in use — subdirectories (`/de/`), subdomains (`de.`), separate ccTLDs, query parameters, or cookie/geo-IP switching without distinct URLs? (The last one has no URLs to preserve and changes the migration entirely.)
4. Is there an existing hreflang implementation? Where does it come from — Yoast/Rank Math, WPML/Polylang, a theme, or hand-written tags?
5. Which language is the default, and is there an `x-default` today?

**History (equally important)**

6. Were there language or region variants **in the past** that have since been removed? What URLs did they use, and were they redirected or left to 404?
7. Has the URL pattern for languages ever changed (for example subdomains → subdirectories)? Old patterns may still hold backlinks and appear in GSC.
8. Are there translated PDFs, datasheets or catalogues linked from either site? These carry equity and are easy to miss in a page-level inventory.

**Operational**

9. Who produces and approves translations, and is any of it machine-translated today?
10. Are Google Search Console properties set up per language/region variant, or only for the primary domain? (Evidence coverage depends on this.)
11. Is there international targeting configured in GSC (legacy geo-targeting), and for which properties?
12. Which locales are in scope for the **new** site, and which existing ones are being deliberately retired? A retired locale needs a redirect decision, not silence.

## What the freeze/discovery step must capture regardless of the answers

- Per-URL `lang` attribute, hreflang tags (including `x-default`) and their reciprocity, from both OLD and NEW — the `SCHEMA_HREFLANG_BASELINE.json` the pilot plan already expects.
- Language-variant URLs found in sitemaps, internal links and GSC that are **not** in the page inventory.
- WordPress side: which translation plugin (if any) is active, its tables, per-language permalink structures, and `wp_options` language settings — named in the import manifest even when the count is zero, so "no variants" is a recorded finding rather than an assumption.

## Handling rules

Answers to questions 1–8 go into the H2O discovery outputs and the content-verification ledger as owner-verified facts. Nothing here justifies reading customer, comment or user-email data (the importer's table guards still apply). If any answer reveals variants the Factory cannot yet represent, the migration stops at that point per ADR-029 §4 — the H2O staging project proves the implementation, and Release 4 reconciles it.
