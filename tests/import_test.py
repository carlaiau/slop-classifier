import importlib.util, json, pathlib, unittest
spec = importlib.util.spec_from_file_location('importer', pathlib.Path(__file__).parents[1] / 'scripts' / 'import_opai.py')
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)

class ImportTest(unittest.TestCase):
    def row(self):
        text = 'A fox 🦊 crossed the road.\n\nThe driver waited for it to reach the trees.'
        sentences = ['A fox 🦊 crossed the road.', 'The driver waited for it to reach the trees.']
        return {'version': 'v0', 'domain': 'news', 'id': 'source', 'text': text, 'subset': 'main', 'split': 'train', 'generator': 'gpt-5.4-nano', 'record_id': 'r0', 'sentences': json.dumps(sentences), 'sentence_labels': '[0, 0]', 'edit_operation': 'none'}
    def test_offsets_and_gaps(self):
        rows = module.convert([self.row()], 'pinned-source')
        self.assertEqual(rows[0]['end'], len(rows[0]['text']) + 1)
        self.assertEqual(rows[1]['gapBefore'], '\n\n')
        self.assertEqual(''.join(r['gapBefore'] + r['text'] + r['trailing'] for r in rows), self.row()['text'])
    def test_does_not_guess_labels_or_alignment(self):
        row = self.row(); row['sentence_labels'] = '[1, 0]'
        with self.assertRaises(ValueError): module.convert([row], 'pinned-source')
        row = self.row(); row['sentences'] = '["wrong"]'; row['sentence_labels'] = '[0]'
        with self.assertRaises(ValueError): module.convert([row], 'pinned-source')
    def test_no_eval(self):
        with self.assertRaises((ValueError, SyntaxError)): module.parse_list('__import__("os").getcwd()')

if __name__ == '__main__': unittest.main()
