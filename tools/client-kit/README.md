# client-kit (KIT-0)

Manifest, no-client-strings lint and `create-site` for the client factory. Plain erasable TypeScript, no dependencies, run with `node` (type stripping; Node 22.18+/24). It is not a workspace package (no `package.json`), so it changes no lockfile. Add `--disable-warning=MODULE_TYPELESS_PACKAGE_JSON` to quiet Node's module-type notice.

```
K="node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tools/client-kit/bin"
$K/validate.ts <slug>                                   # clients/<slug>/manifest.json, fail closed
$K/create-site.ts --slug s --name "Name" --domain d.tld # copy clients/_template, validate, write a starter blocklist
$K/lint.ts ratchet src check                            # layer 1: per-file hit counts may only fall
$K/lint.ts scan <dir> --client <slug> --scope output    # layer 2/3: compiled output, rendered pages, email, seed dumps
$K/lint.ts rows <rows.json> --client <slug> --scope seed
node --test tools/client-kit/test/*.test.ts             # focused tests
```

- `clients/<slug>/manifest.json`: everything a client can be (schema v1, `src/manifest.ts`). Secrets are references only.
- `clients/<slug>/blocklist.json`: strings that BELONG to that client and must not appear in any other client's output. The lint for client T uses every other client's blocklist minus T's `review.allowedOverlap` (value or group), so a legitimately shared string is an owner-decided exception per pair, never code.
- Entry kinds: `text` (case/whitespace-insensitive), `word` (boundaries), `domain` (host and subdomains), `email`, `phone` (digits with any separators). Scopes: `source`, `output`, `seed`, `render`.
- Ratchet baselines: `ratchet-baseline.src.json` and `ratchet-baseline.tests.json`. `lint.ts ratchet <set> update` only ever lowers a number.
- `clients/h2o/manifest.json` is the regression manifest reproduced from the code at 1.3a (values provisional until M12 proves a zero-diff render and email snapshot). `clients/example-industrial` is the synthetic client; `clients/_template` is what `create-site` copies.
