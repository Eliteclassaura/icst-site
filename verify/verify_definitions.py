#!/usr/bin/env python3
"""
2A.1B — collection-definition preservation check (regression obligation I3).

Proves that every collection definition survived the boundary split byte-for-byte, by extracting each
top-level `const` declaration (with its doc comment) from the PRE-split files, then asserting each one
appears verbatim inside the POST-split files.

Usage, from the worktree root:

    python3 verify/verify_definitions.py pre    # BEFORE applying the increment  -> .2a1b-baseline.json
    python3 verify/verify_definitions.py post   # AFTER  applying the increment  -> PASS / FAIL

`pre` must run first, on the untouched checkout: it is the only moment the original files exist.
"""
import hashlib, json, os, re, sys

PRE = ['core', 'business', 'operations']
POST = ['factories', 'foundation', 'editorial', 'crm']
DIR = 'packages/agency-core/src/cms/collections'
BASELINE = '.2a1b-baseline.json'

LAYER = {}
for n in ['Users', 'Media', 'PAGE_TYPES', 'Pages', 'Locations', 'AuditLog', 'People', 'Citations']:
    LAYER[n] = 'foundation'
for n in ['Posts', 'Categories', 'Tags', 'Topics', 'Industries', 'Services', 'Offices', 'CaseStudies',
          'Ventures', 'Testimonials', 'FAQs', 'GlossaryTerms', 'EvidenceStats', 'CTAs', 'SimulatorPrompts',
          'ScorecardQuestions', 'ScorecardBands', 'RevenueModelPrograms', 'Notices', 'SchemaEntities',
          'SEOTemplates']:
    LAYER[n] = 'editorial'
for n in ['PrivateFiles', 'Redirects', 'Forms', 'SUBMISSION_STATUS', 'Submissions', 'Subscribers',
          'Companies', 'Contacts', 'Leads', 'Activities', 'Tasks', 'LeadScoreRules', 'Outbox', 'RateEvents']:
    LAYER[n] = 'crm'
for n in ['taxonomy', 'content']:
    LAYER[n] = 'factories'


def blocks(path):
    lines = open(path).read().split('\n')
    starts = [(i, m.group(1)) for i, l in enumerate(lines)
              for m in [re.match(r'^(?:export )?const (\w+)', l)] if m]
    lastimp = max(i for i, l in enumerate(lines) if l.startswith('import ') or l.startswith("} from '"))
    out = []
    for k, (i, name) in enumerate(starts):
        s = i
        j = i - 1
        while j > lastimp and (lines[j].strip().startswith(('*', '/**', '//')) or lines[j].rstrip().endswith('*/')):
            s = j
            if lines[j].strip().startswith('/**'):
                break
            j -= 1
        if k + 1 < len(starts):
            e = starts[k + 1][0] - 1
            while e > s and (lines[e].strip() == '' or lines[e].strip().startswith(('*', '/**'))
                             or lines[e].rstrip().endswith('*/')):
                e -= 1
        else:
            e = len(lines) - 1
            while e > s and lines[e].strip() == '':
                e -= 1
        out.append((name, '\n'.join(lines[s:e + 1])))
    return out


def main():
    mode = (sys.argv[1] if len(sys.argv) > 1 else '').lower()
    if mode == 'pre':
        data = {}
        for f in PRE:
            p = os.path.join(DIR, f + '.ts')
            if not os.path.exists(p):
                print(f'FAIL: {p} not found — run `pre` on the untouched checkout, before applying.')
                return 2
            for name, text in blocks(p):
                data[name] = text
        json.dump(data, open(BASELINE, 'w'))
        print(f'baseline written: {len(data)} definitions -> {BASELINE}')
        for name in sorted(data):
            print(f'  {name:<24} {hashlib.sha256(data[name].encode()).hexdigest()}')
        return 0

    if mode == 'post':
        if not os.path.exists(BASELINE):
            print(f'FAIL: {BASELINE} not found — run `pre` before applying the increment.')
            return 2
        data = json.load(open(BASELINE))
        for f in PRE:
            p = os.path.join(DIR, f + '.ts')
            if os.path.exists(p):
                print(f'FAIL: {p} still exists — the pre-split files must be removed by this increment.')
                return 1
        files = {}
        for f in POST:
            p = os.path.join(DIR, f + '.ts')
            if not os.path.exists(p):
                print(f'FAIL: {p} not found — the increment was not applied completely.')
                return 1
            files[f] = open(p).read()
        ok = bad = 0
        for name, text in sorted(data.items()):
            tgt = LAYER.get(name)
            if tgt is None:
                print(f'FAIL: {name} has no layer assignment — unexpected definition.')
                bad += 1
                continue
            if text in files[tgt]:
                ok += 1
            else:
                bad += 1
                print(f'FAIL: {name} is not verbatim in {tgt}.ts')
        print(f'\nI3 definition preservation: {ok}/{ok + bad} verbatim')
        return 0 if bad == 0 else 1

    print(__doc__)
    return 2


if __name__ == '__main__':
    sys.exit(main())
