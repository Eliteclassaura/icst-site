#!/usr/bin/env python3
"""ICST copy swap (applier for DD's ICST-SLOTMAP-1 recipe). Dry run by default; --apply writes the fork's page files.

  python3 tools/client-kit/bin/copy_swap.py --spec ICST_SLOTMAP_1.json --docs <approved_copy_docs dir> [--pages <fork pages dir>]
                                             [--out <report dir>] [--only slug ...] [--apply]

What it does, per page of the recipe:
  1. Refuses to run if a doc's sha256 differs from the recipe's doc_sha256 (the recipe is stale: re-run the generator).
  2. Reads each source line, cleans it (trim, collapse spaces, leading "* ", numbering prefixes), and runs the guard (copy_guard.py).
  3. Builds the layout in the recipe's TARGET order: "keep" keeps the fork block, "edit" starts from the fork block, "replace" and "new"
     start from an empty block of the target type. Blocks the recipe does not list are dropped.
  4. Sets top-level title and description from the Meta lines; never appends a suffix.
  5. Writes <out>/<page>.json and a field report (<out>/swap_report.tsv). With --apply, copies the new files into --pages, all or none.
  6. Reports any synthetic word left in the new page (the page must be 0 before the swap is accepted).
Unsupported field patterns or ops (for example "cross" and the "rows[...]" data-table forms) are REFUSED for that page and listed; they need a manual edit.
"""
import argparse
import copy
import glob
import hashlib
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import copy_guard  # noqa: E402

KEEP = object()
DELETE = object()


class Unsupported(Exception):
    pass


NUMBERING = re.compile(r'^(?:Step\s+\d+\s+—\s+|Service\s+\d+\s+—\s+|\d{1,2}\s+—\s+|\d{1,2}\.\s+)')


def clean(line, strip_re=None):
    s = line.replace('\t', ' ').strip()
    if strip_re:
        s = re.sub(strip_re, '', s, count=1)
    s = re.sub(r' {2,}', ' ', s).strip()
    if s.startswith('* '):
        s = s[2:]
    s = NUMBERING.sub('', s).strip()
    return s


class Docs:
    def __init__(self, folder, spec_pages):
        self.folder = folder
        self.lines = {}
        self.sha = {}
        for p in spec_pages:
            k = p['doc']
            if k in self.lines:
                continue
            matches = glob.glob(os.path.join(folder, k + '_*.txt'))
            if len(matches) != 1:
                raise SystemExit(f'doc {k}: expected one file, found {len(matches)} in {folder}')
            raw = open(matches[0], 'rb').read()
            self.sha[k] = hashlib.sha256(raw).hexdigest()
            self.lines[k] = raw.decode('utf-8-sig').split('\n')

    def get(self, doc, n):
        return self.lines[doc][n - 1]


def op_value(docs, field, findings, where):
    op = field['op']
    if op == 'literal':
        v = field.get('value')
        if v == 'delete the field':
            return DELETE
        if v in ('true', 'false'):
            return v == 'true'
        return v
    if op == 'keep':
        return KEEP
    if op == 'cross':
        raise Unsupported('cross-page recipe (manual)')
    doc = field.get('doc')
    nums = field.get('lines') or []
    raw = [docs.get(doc, n) for n in nums]
    strip_re = field.get('strip')
    texts = []
    for n, r in zip(nums, raw):
        c = clean(r, strip_re)
        texts.append(c)
        copy_guard.check(f'{where} doc{doc} L{n}', c, findings)
    if op == 'line':
        return texts[0] if len(texts) == 1 else texts
    if op == 'join':
        return ' '.join(t for t in texts if t)
    if op == 'lines':
        return [t for t in texts if t]
    if op == 'colon':
        items = []
        for t in texts:
            title, _, text = t.partition(':')
            items.append({'title': clean(title), 'text': text.strip()})
        return items
    if op == 'figtext':
        items = []
        for t in texts:
            title, _, text = t.partition(' ')
            items.append({'title': title, 'text': text.strip()})
        return items
    if op == 'pairs':
        items = []
        i = 0
        while i < len(texts):
            title = texts[i]
            text = texts[i + 1] if i + 1 < len(texts) else ''
            i += 2
            if i < len(texts) and texts[i].startswith('View'):
                i += 1
            items.append({'title': title, 'text': text})
        return items
    if op == 'qa':
        items = []
        for i in range(0, len(texts) - 1, 2):
            items.append({'question': texts[i], 'answer': texts[i + 1]})
        return items
    raise Unsupported(f'unknown op {op}')


def set_field(block, key, value):
    """Put a value at a recipe field key. Only the key forms the recipe uses are accepted; anything else is refused."""
    k = re.sub(r'\s*\(.*\)\s*$', '', key).strip()
    if value is KEEP:
        return
    if value is DELETE:
        if k in block:
            del block[k]
        return
    if k in ('title', 'lede', 'eyebrow', 'text', 'ordered', 'layout', 'variant', 'caption', 'rowHeader'):
        block[k] = value
        return
    m = re.fullmatch(r'cta\.(primary|secondary)\.(label|href)', k)
    if m:
        cta = block.setdefault('cta', {})
        cta.setdefault(m.group(1), {})[m.group(2)] = value
        return
    m = re.fullmatch(r'(?:s|sections\[)(\d+)\]?\.(heading|paragraphs|bullets)', k)
    if m:
        secs = block.setdefault('sections', [])
        while len(secs) <= int(m.group(1)):
            secs.append({'heading': '', 'paragraphs': []})
        if m.group(2) == 'paragraphs' and isinstance(value, str):
            value = [value]
        secs[int(m.group(1))][m.group(2)] = value
        return
    m = re.fullmatch(r'(?:s|sections\[)(\d+)\]?\.paragraphs\[(\d+)\]', k)
    if m:
        secs = block.setdefault('sections', [])
        while len(secs) <= int(m.group(1)):
            secs.append({'heading': '', 'paragraphs': []})
        paras = secs[int(m.group(1))].setdefault('paragraphs', [])
        while len(paras) <= int(m.group(2)):
            paras.append('')
        paras[int(m.group(2))] = value
        return
    if re.fullmatch(r'items(\[.*\])?', k):
        block['items'] = value
        return
    if re.fullmatch(r'columns(\[.*\])?', k):
        block['columns'] = value
        return
    if k == 'links':
        block['links'] = value
        return
    raise Unsupported(f'field key not supported by the applier: {key!r}')


def build_page(spec_page, fork_doc, docs, findings):
    """Return (new_doc, field_log, refusals) for one page. Refusals are collected per field; the page is not written if any."""
    where = spec_page['slug']
    new = copy.deepcopy(fork_doc)
    log = []
    refusals = []
    # top-level meta
    for key in ('title', 'description'):
        f = spec_page['meta'].get(key)
        if f is None:
            continue
        try:
            v = op_value(docs, f, findings, f'{where} meta.{key}')
            new[key] = v
            log.append((where, 'meta', key, 'set'))
        except Unsupported as e:
            refusals.append((where, 'meta', key, str(e)))
    layout = []
    for b in sorted(spec_page['layout'], key=lambda x: x['target_position']):
        src = b['from_fork_layout_index']
        action = b['action']
        bt = b['block']
        if isinstance(src, int):
            base = copy.deepcopy(fork_doc['layout'][src]) if action.startswith(('edit', 'keep')) else {}
        else:
            base = {}
        base['blockType'] = bt
        if action.startswith('keep'):
            layout.append(base)
            log.append((where, f'layout[{b["target_position"]}]', bt, 'keep'))
            continue
        if action.startswith('replace sections'):
            base['sections'] = []
        for key, field in b['fields'].items():
            try:
                v = op_value(docs, field, findings, f'{where} {bt} {key}')
                set_field(base, key, v)
                log.append((where, f'layout[{b["target_position"]}] {bt}', key, 'set' if v is not KEEP else 'keep'))
            except Unsupported as e:
                refusals.append((where, f'layout[{b["target_position"]}] {bt}', key, str(e)))
        layout.append(base)
    new['layout'] = layout
    return new, log, refusals


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--spec', required=True)
    ap.add_argument('--docs', required=True)
    ap.add_argument('--pages', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'clients', 'icst', 'content', 'pages'))
    ap.add_argument('--out', default='copy_swap_out')
    ap.add_argument('--only', action='append', default=[])
    ap.add_argument('--apply', action='store_true')
    ap.add_argument('--allow-stale', action='store_true', help='skip the doc sha check (not for a real swap)')
    args = ap.parse_args(argv)
    spec = json.load(open(args.spec, encoding='utf-8'))
    pages = [p for p in spec['pages'] if not args.only or p['slug'] in args.only]
    docs = Docs(args.docs, pages)
    stale = [p['slug'] for p in pages if docs.sha.get(p['doc']) != p.get('doc_sha256')]
    if stale and not args.allow_stale:
        print('STALE RECIPE: doc sha changed for', ', '.join(sorted(set(stale))), '- re-run slotmap_gen.py, then run again.')
        return 3
    os.makedirs(args.out, exist_ok=True)
    findings = []
    report = ['page\tsection\tfield\taction']
    results = {}
    all_refusals = []
    for p in pages:
        fork_file = os.path.join(args.pages, os.path.basename(p['fork_file']))
        fork_doc = json.load(open(fork_file, encoding='utf-8'))
        try:
            new, log, refusals = build_page(p, fork_doc, docs, findings)
        except copy_guard.GuardRefusal as e:
            all_refusals.append((p['slug'], 'guard', '', str(e)))
            continue
        report += ['\t'.join(map(str, row)) for row in log]
        all_refusals += refusals
        leftover = len(re.findall(r'synthetic', json.dumps(new, ensure_ascii=False), re.I))
        results[p['slug']] = (fork_file, new, leftover)
        with open(os.path.join(args.out, os.path.basename(fork_file)), 'w', encoding='utf-8') as fh:
            fh.write(json.dumps(new, ensure_ascii=False, indent=2) + '\n')
    report += ['FINDING\t' + '\t'.join(f) for f in findings]
    report += ['REFUSED\t' + '\t'.join(r) for r in all_refusals]
    open(os.path.join(args.out, 'swap_report.tsv'), 'w', encoding='utf-8').write('\n'.join(report) + '\n')
    refused_pages = {r[0] for r in all_refusals}
    # a page with a guard REFUSE finding is never written, in report mode too (report only logs it on the way)
    refused_pages |= {p['slug'] for p in pages for f in findings if f[0] == 'REFUSE' and f[1].startswith(p['slug'])}
    refuse_count = sum(1 for f in findings if f[0] == 'REFUSE')
    print(f'pages built {len(results)} of {len(pages)}; refused fields {len(all_refusals)}; guard refusals {refuse_count}; mode {copy_guard.mode()}')
    for slug, (_, _, left) in sorted(results.items()):
        print(f'  {slug}: synthetic words left {left}')
    if args.apply:
        bad = [s for s in refused_pages] + [s for s, (_, _, left) in results.items() if left]
        if bad or len(results) != len(pages):
            print('APPLY REFUSED (all or none): pages with refusals or synthetic words:', sorted(set(bad)))
            return 4
        for slug, (fork_file, new, _) in results.items():
            with open(fork_file, 'w', encoding='utf-8') as fh:
                fh.write(json.dumps(new, ensure_ascii=False, indent=2) + '\n')
        print('APPLIED', len(results), 'page(s)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
