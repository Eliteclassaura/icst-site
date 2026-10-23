#!/usr/bin/env python3
"""ICST placeholder strip (prepared 23 Oct 2026; NOT applied). For pages whose conformed copy is not ready by Mon 26 Oct 10:00 EDT.

Removes SYNTHETIC SECTIONS ONLY, and keeps the hero and the prose body:
  - a layout block other than `hero` or `articleBody` that contains placeholder text is removed whole;
  - inside an `articleBody` block, a section that contains placeholder text is removed; the other sections (prose) stay; an articleBody
    left with no sections is removed;
  - the `hero` block is never touched;
  - placeholder text outside the layout (page title, description, meta) is NOT changed: it is listed as MANUAL and needs a copy decision.

Usage (dry run is the default; nothing is written without --apply):
  python3 tools/client-kit/bin/strip-synthetic.py [--page NAME ...] [--report report.tsv] [--apply]
Output: one row per action (page, action, layout index, blockType, reason). Deterministic: sorted pages, stable JSON formatting.
The allowlist below is the same as the guard test (apps/h2o/src/client/__tests__/synthetic-guard.unit.test.ts): real copy, not placeholders.
"""
import argparse
import glob
import json
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'clients', 'icst', 'content', 'pages')
ALLOWLIST = ['What is the role of synthetic oil in gearbox maintenance?', 'Synthetic Oil Migration']
PATTERN = re.compile(r'synthetic', re.I)


def has_placeholder(node):
    if isinstance(node, dict):
        return any(has_placeholder(v) for v in node.values())
    if isinstance(node, list):
        return any(has_placeholder(v) for v in node)
    if isinstance(node, str):
        return bool(PATTERN.search(node)) and not any(a in node for a in ALLOWLIST)
    return False


def outside_layout(doc):
    out = []
    for k, v in doc.items():
        if k == 'layout':
            continue
        if has_placeholder(v):
            out.append(k)
    return out


def plan(name, doc):
    actions = []
    keep_layout = []
    for i, block in enumerate(doc.get('layout', [])):
        bt = block.get('blockType')
        if not has_placeholder(block):
            keep_layout.append(block)
            continue
        if bt == 'hero':
            actions.append((i, bt, 'KEEP', 'hero is never stripped; placeholder in hero must be fixed by copy'))
            keep_layout.append(block)
            continue
        if bt == 'articleBody':
            new_sections = []
            for j, sec in enumerate(block.get('sections', [])):
                if has_placeholder(sec):
                    actions.append((i, bt, f'REMOVE_SECTION[{j}]', 'section contains placeholder text; prose sections kept'))
                else:
                    new_sections.append(sec)
            if new_sections:
                nb = dict(block)
                nb['sections'] = new_sections
                keep_layout.append(nb)
            else:
                actions.append((i, bt, 'REMOVE_BLOCK', 'articleBody left with no prose sections'))
            continue
        actions.append((i, bt, 'REMOVE_BLOCK', 'non-prose block contains placeholder text'))
    manual = outside_layout(doc)
    return actions, keep_layout, manual


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--page', action='append', default=[])
    ap.add_argument('--report', default=None)
    ap.add_argument('--apply', action='store_true')
    args = ap.parse_args()
    rows = ['page\taction\tlayout_index\tblock_type\treason']
    touched = 0
    for path in sorted(glob.glob(os.path.join(ROOT, '*.json'))):
        name = os.path.basename(path)[:-5]
        if args.page and name not in args.page:
            continue
        doc = json.load(open(path, encoding='utf-8'))
        actions, keep_layout, manual = plan(name, doc)
        for m in manual:
            rows.append(f'{name}\tMANUAL\t-\t{m}\tplaceholder outside the layout: copy decision needed')
        if not actions:
            continue
        for i, bt, act, why in actions:
            rows.append(f'{name}\t{act}\t{i}\t{bt}\t{why}')
        if args.apply:
            doc['layout'] = keep_layout
            with open(path, 'w', encoding='utf-8') as fh:
                fh.write(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
            touched += 1
    text = '\n'.join(rows) + '\n'
    if args.report:
        open(args.report, 'w', encoding='utf-8').write(text)
    sys.stdout.write(text)
    sys.stderr.write(f"{'APPLIED' if args.apply else 'DRY RUN (nothing written)'}: {touched if args.apply else 0} page(s) changed\n")


if __name__ == '__main__':
    main()
