#!/usr/bin/env python3
"""Rendered-HTML identity for a Next streaming page.

Raw bytes of a Payload-mode page differ on every request (per-request CSP nonce; React streams the metadata
and flight chunks in a nondeterministic order). The rendered page is the same when: the nonce is removed,
<script> bodies (the flight data) are dropped, the <head> elements are compared as a sorted multiset, and the
<body> markup is compared in order. Prints one sha256 per file of that canonical form.
"""
import hashlib, re, sys
for path in sys.argv[1:]:
    t = open(path, encoding='utf-8').read()
    m = re.search(r'nonce="([^"]*)"', t)
    if m: t = t.replace(m.group(1), 'NONCE')
    t = re.sub(r'<script\b[^>]*>.*?</script>', '<script/>', t, flags=re.S)
    head = re.search(r'<head>(.*?)</head>', t, flags=re.S)
    body = re.search(r'<body\b.*?</body>', t, flags=re.S)
    head_tags = sorted(re.findall(r'<[^>]+>(?:[^<]*</(?:title|style)>)?', head.group(1))) if head else []
    canon = '\n'.join(head_tags) + '\n----\n' + (body.group(0) if body else '')
    print(hashlib.sha256(canon.encode()).hexdigest(), path)
