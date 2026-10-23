"""Tests for the ICST copy swap (copy_guard.py, copy_swap.py). Run: python3 -m unittest tools/client-kit/test/copy_swap_test.py"""
import copy
import json
import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'bin'))
import copy_guard  # noqa: E402
import copy_swap  # noqa: E402


class Guard(unittest.TestCase):
    def test_refuses_the_owner_list(self):
        for text in ['Call +66 2 260 6598', 'Contact Us: +662–661–7723', 'ICS Thailand offers', 'Free quote', 'HVAC systems',
                     'air conditioning units', 'cooling — towers']:
            self.assertTrue(copy_guard.scan(text)[0], text)

    def test_free_as_a_word_is_refused_but_compounds_are_not(self):
        self.assertTrue(copy_guard.scan('Get a Free quote')[0])
        self.assertEqual(copy_guard.scan('Virtually maintenance-free')[0], [])

    def test_claims_and_authority_words_are_logged_not_refused(self):
        for text in ['Reduce energy costs by 30%', 'authorized supplier of OEM parts', 'genuine spare parts', 'Middle East projects',
                     'Certified towers', 'ICST Thailand']:
            refusals, _, logged = copy_guard.scan(text)
            self.assertEqual(refusals, [], text)
            self.assertTrue(logged or 'ICST' in text, text)

    def test_en_dash_is_a_warning(self):
        refusals, warnings, _ = copy_guard.scan('2026–2027')
        self.assertEqual(refusals, [])
        self.assertTrue(warnings)

    def test_enforce_raises_and_report_does_not(self):
        findings = []
        old = os.environ.get('ICST_COPY_GUARD')
        try:
            os.environ['ICST_COPY_GUARD'] = 'report'
            copy_guard.check('x', 'Free', findings)
            os.environ['ICST_COPY_GUARD'] = 'enforce'
            with self.assertRaises(copy_guard.GuardRefusal):
                copy_guard.check('x', 'Free', findings)
        finally:
            if old is None:
                os.environ.pop('ICST_COPY_GUARD', None)
            else:
                os.environ['ICST_COPY_GUARD'] = old


class Clean(unittest.TestCase):
    def test_strips_bullets_numbering_and_spaces_keeps_curly_apostrophes(self):
        self.assertEqual(copy_swap.clean('  *  Let’s   go  '), 'Let’s go')
        self.assertEqual(copy_swap.clean('01. Title here'), 'Title here')
        self.assertEqual(copy_swap.clean('Step 01 — Survey'), 'Survey'.replace('—', '') or 'Survey')


class Ops(unittest.TestCase):
    class D:
        def __init__(self, lines):
            self.lines = {'01': lines}

        def get(self, doc, n):
            return self.lines[doc][n - 1]

    def docs(self):
        return self.D(['Title A', 'Text A', 'View more', 'Title B', 'Text B', '', 'Q one?', 'A one.', 'Plate: Thin metal'])

    def test_pairs_skip_view_lines(self):
        f = {'op': 'pairs', 'doc': '01', 'lines': [1, 2, 3, 4, 5]}
        self.assertEqual(copy_swap.op_value(self.docs(), f, [], 'x'), [{'title': 'Title A', 'text': 'Text A'}, {'title': 'Title B', 'text': 'Text B'}])

    def test_qa_and_colon(self):
        self.assertEqual(copy_swap.op_value(self.docs(), {'op': 'qa', 'doc': '01', 'lines': [7, 8]}, [], 'x'), [{'question': 'Q one?', 'answer': 'A one.'}])
        self.assertEqual(copy_swap.op_value(self.docs(), {'op': 'colon', 'doc': '01', 'lines': [9]}, [], 'x'), [{'title': 'Plate', 'text': 'Thin metal'}])

    def test_lines_skip_blank_and_join(self):
        self.assertEqual(copy_swap.op_value(self.docs(), {'op': 'lines', 'doc': '01', 'lines': [4, 5, 6]}, [], 'x'), ['Title B', 'Text B'])
        self.assertEqual(copy_swap.op_value(self.docs(), {'op': 'join', 'doc': '01', 'lines': [1, 2]}, [], 'x'), 'Title A Text A')

    def test_literals(self):
        self.assertIs(copy_swap.op_value(self.docs(), {'op': 'literal', 'value': 'true'}, [], 'x'), True)
        self.assertIs(copy_swap.op_value(self.docs(), {'op': 'literal', 'value': 'delete the field'}, [], 'x'), copy_swap.DELETE)


class Fields(unittest.TestCase):
    def test_set_field_forms(self):
        b = {'blockType': 'articleBody', 'sections': []}
        copy_swap.set_field(b, 's0.heading', 'H')
        copy_swap.set_field(b, 's0.paragraphs', 'one line')
        copy_swap.set_field(b, 's0.paragraphs[1]', 'second')
        self.assertEqual(b['sections'][0], {'heading': 'H', 'paragraphs': ['one line', 'second']})
        c = {'blockType': 'cta'}
        copy_swap.set_field(c, 'cta.primary.label', 'Request a quote')
        copy_swap.set_field(c, 'cta.primary.href', '/contact-us/')
        self.assertEqual(c['cta'], {'primary': {'label': 'Request a quote', 'href': '/contact-us/'}})
        copy_swap.set_field(c, 'text', copy_swap.DELETE)

    def test_unsupported_key_is_refused(self):
        with self.assertRaises(copy_swap.Unsupported):
            copy_swap.set_field({}, 'rows[0..3] (label = the left cell)', [])


class Stale(unittest.TestCase):
    def test_stale_recipe_stops_before_building(self):
        with tempfile.TemporaryDirectory() as tmp:
            docs = os.path.join(tmp, 'docs')
            os.makedirs(docs)
            open(os.path.join(docs, '01_Test.txt'), 'w', encoding='utf-8').write('line one\n')
            spec = {'pages': [{'slug': 'home', 'doc': '01', 'doc_sha256': 'not-the-hash', 'fork_file': 'x.json', 'meta': {}, 'layout': []}]}
            specfile = os.path.join(tmp, 'spec.json')
            json.dump(spec, open(specfile, 'w'))
            self.assertEqual(copy_swap.main(['--spec', specfile, '--docs', docs, '--out', os.path.join(tmp, 'o')]), 3)


if __name__ == '__main__':
    unittest.main()
