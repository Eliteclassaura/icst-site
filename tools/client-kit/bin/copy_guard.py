#!/usr/bin/env python3
"""ICST_COPY_GUARD: the pre-swap guard for conformed copy (DD ICST-SLOTMAP-1, owner rulings 23 Oct 2026).

Refuses (enforce) or reports (report) a source string that carries:
  - a typed phone number (260 6598, +66, 661 7723);
  - the brand "ICS" as a standalone word ("ICS Thailand", "ICS");
  - "free" in any case (the rule is "free" on paid services; the guard is strict on the word);
  - HVAC or air-conditioning wording;
  - an em dash.
Logged, NOT blocked (owner ruling 23 Oct: claims in the OGCS register ship as written, and authority words (authorized, OEM, genuine)
are kept and recorded as "third-party relationship"):
  - claim words (percentages, certification names, geography, superlatives), and authority words.
Warned, not blocked: an en dash (not in the owner's list; reviewed by DD and OGCS).

Mode: ICST_COPY_GUARD=report (default) prints every finding and lets the swap continue; ICST_COPY_GUARD=enforce raises GuardRefusal.
"""
import os
import re
import sys

REFUSE = [
    (re.compile(r'260.?6598|\+66|661.?7723'), 'typed phone number (phones come from the manifest)'),
    (re.compile(r'\bICS\b'), 'brand "ICS" (the brand is ICST)'),
    (re.compile(r'\bfree\b', re.I), '"free" (paid services)'),
    (re.compile(r'hvac|air.?conditioning', re.I), 'HVAC or air-conditioning wording'),
    (re.compile('—'), 'em dash'),
]
WARN = [
    (re.compile('–'), 'en dash (reviewed by DD and OGCS)'),
]
LOG = [
    (re.compile(r'\d+\s?%'), 'claim: percentage'),
    (re.compile(r'certified|\bISO\b|ASHRAE|\bCTI\b', re.I), 'claim: certification or standard'),
    (re.compile(r'authori[sz]ed|\bOEM\b|\bgenuine\b|\boriginal\b', re.I), 'authority word (third-party relationship)'),
    (re.compile(r'middle east|\busa\b|asia', re.I), 'claim: geography'),
    (re.compile(r'\bleading\b|\bpreferred\b|decades|years of|guarantee|virtually|measurable', re.I), 'claim: superlative or outcome'),
]


class GuardRefusal(Exception):
    pass


def mode():
    m = os.environ.get('ICST_COPY_GUARD', 'report')
    if m not in ('report', 'enforce'):
        raise ValueError('ICST_COPY_GUARD must be report or enforce')
    return m


def scan(text):
    """Return (refusals, warnings, logged) as lists of reasons for one source string."""
    refusals = [why for pat, why in REFUSE if pat.search(text)]
    warnings = [why for pat, why in WARN if pat.search(text)]
    logged = [why for pat, why in LOG if pat.search(text)]
    return refusals, warnings, logged


def check(where, text, findings, m=None):
    """Record the findings for one source string and enforce if the mode says so."""
    m = m or mode()
    refusals, warnings, logged = scan(text)
    for why in refusals:
        findings.append(('REFUSE', where, why, text[:120]))
    for why in warnings:
        findings.append(('WARN', where, why, text[:120]))
    for why in logged:
        findings.append(('LOG', where, why, text[:120]))
    if refusals and m == 'enforce':
        raise GuardRefusal(f'{where}: ' + '; '.join(refusals))
    return refusals


if __name__ == '__main__':
    findings = []
    text = sys.stdin.read()
    for line in text.splitlines():
        check('stdin', line, findings, m='report')
    for f in findings:
        print('\t'.join(f))
    sys.exit(1 if any(f[0] == 'REFUSE' for f in findings) else 0)
