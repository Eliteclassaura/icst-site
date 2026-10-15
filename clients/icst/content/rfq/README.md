# ICST quote-form copy (needed)

The native quote form and chat read their wording from this folder (`apps/h2o/src/rfq-native/registry.ts`):

- `icst-native-rfq-copy-r1.tsv`: the copy table (keys, wording, per-purpose questions).
- `form-notice-source.md`: the form's privacy/notice text.

Both must be written and approved for ICST (OGCS / owner). The default client's files are NOT carried and must not be copied here: they name another company, phone, address and legal text. Until both exist the form cannot render (the registry fails loudly rather than showing someone else's wording).
