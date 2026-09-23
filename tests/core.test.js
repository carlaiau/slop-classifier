import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { segment, prefix } from '../src/text.js';
import { prepare, auditDataset } from '../src/dataset.js';
import { makeQuestions, scoreSentence, scoreBatch, scoringIdentity, validateResponse } from '../src/scoring.js';
import { fitLogistic, predict, fitCalibration, calibrate, selectThreshold } from '../src/learning.js';
import { metrics, clusteredReport, gate } from '../src/metrics.js';
import { openBudget } from '../src/budget.js';
import { fixtureRows } from './fixtures.js';
import { readJson } from '../src/io.js';

test('segmentation keeps exact offsets, Unicode, honorifics and paragraph breaks', () => {
  const text = 'Dr. Morris met A. Smith. “A fox 🦊 arrived,” she said.\n\nA second paragraph\nwraps without changing its source.';
  const sentences = segment(text);
  assert.equal(sentences.length, 3);
  assert.equal(sentences.map(s => s.text).join(''), text);
  for (const s of sentences) assert.equal(text.slice(s.start, s.end), s.text);
  assert.ok(sentences[0].text.startsWith('Dr. Morris met A. Smith.'));
  assert.equal(prefix(Array.from({ length: 40 }, (_, i) => `w${i}`).join(' ')).split(' ').length, 30);
});
test('prefix questions isolate future words and changing prompts/calibration changes identity', () => {
  const sentence = { id: 'x', start: 0, end: 47, text: 'People enjoy quiet mornings before busy afternoons.', preceding: 'Earlier context.' };
  const { questions, units } = makeQuestions(sentence, 'prefix-mean');
  assert.equal(questions.w0.instructions.evidence.target, 'People');
  assert.ok(!JSON.stringify(questions.w0).includes('afternoons'));
  assert.equal(units[0].start, 0);
  assert.notEqual(scoringIdentity('sentence'), scoringIdentity('sentence-context'));
});
const mockProvider = async request => ({ model: 'jev-1.13.0', usage: { input_tokens: 200 }, answers: Object.fromEntries(Object.keys(request.questions).map(id => [id, { type: 'noul', noul: 0.7 }])) });
test('same shared scoring pipeline handles batches and does not invent calibrated confidence', async () => {
  const s = segment('This is a sufficiently long sentence for a meaningful software test.')[0];
  const r = await scoreSentence(s, { method: 'sentence', provider: mockProvider });
  assert.equal(r.raw, 0.7); assert.equal(r.calibrated, null);
  let calls = 0;
  const batched = await scoreBatch([s, { ...s, id: 'second' }], { method: 'sentence', provider: async req => { calls++; return mockProvider(req); } });
  assert.equal(calls, 1); assert.equal(batched[1].raw, r.raw);
  const insufficient = await scoreSentence({ ...s, text: 'A fragment.' }, { provider: () => { throw Error('Should not call'); } });
  assert.equal(insufficient.status, 'insufficient');
});
test('model drift, missing answers and nonfinite values fail rather than become negatives', () => {
  assert.throws(() => validateResponse({ model: 'jev-latest' }, { x: {} }), /version/);
  assert.throws(() => validateResponse({ model: 'jev-1.13.0', answers: { x: { type: 'noul', noul: NaN } } }, { x: {} }), /answer/);
});
test('adversarial text stays structured evidence and cannot mutate request questions', async () => {
  const fixture = await readJson('research/adversarial.json');
  for (const entry of fixture.cases) {
    const s = { id: entry.id, start: 0, end: entry.text.length, text: entry.text, preceding: '' };
    const request = makeQuestions(s, 'sentence');
    assert.deepEqual(Object.keys(request.questions), ['direct']);
    assert.equal(request.questions.direct.instructions.evidence.target, entry.text);
  }
});
test('splits are deterministic, balanced and reject source, author and duplicate leakage', () => {
  const rows = fixtureRows(), a = prepare(rows), b = prepare([...rows].reverse());
  assert.deepEqual(a.manifest.ids, b.manifest.ids);
  assert.equal(a.manifest.ids.length, 36);
  const leaked = [...rows, { ...rows[0], id: 'leak', officialSplit: 'test' }];
  assert.throws(() => auditDataset(leaked), /crosses/);
  const authors = structuredClone(rows); authors[0].authorId = 'same'; authors.find(r => r.officialSplit === 'test').authorId = 'same';
  assert.throws(() => auditDataset(authors), /Author/);
  const dup = structuredClone(rows); dup.find(r => r.officialSplit === 'test').sourceHash = rows[0].sourceHash;
  assert.throws(() => auditDataset(dup), /Duplicate|inconsistent/);
});
test('metrics count abstained positives as misses, score ties fairly and keep failures explicit', () => {
  const rows = [ { sourceId: 'a', label: 1, status: 'scored', calibrated: 0.8 }, { sourceId: 'b', label: 0, status: 'scored', calibrated: 0.2 }, { sourceId: 'c', label: 1, status: 'insufficient', calibrated: null } ];
  const m = metrics(rows, 0.5); assert.equal(m.recall, 0.5); assert.equal(m.answeredRecall, 1); assert.equal(m.auroc, 1); assert.equal(m.auprc, 1); assert.equal(m.coverage, 2 / 3);
  const tied = metrics(rows.slice(0, 2).map(r => ({ ...r, calibrated: 0.5 })), 0.5);
  assert.equal(tied.auroc, 0.5); assert.equal(tied.auprc, 0.5); assert.equal(tied.ece, 0);
  const report = clusteredReport(rows, 0.5, 50);
  assert.equal(report.sources, 3); assert.equal(gate(report, 'recall', 0.5, 'min'), 'inconclusive');
});
test('logistic fitting, calibration and thresholding use finite probabilities', () => {
  const x = [[0],[0.1],[0.9],[1]], y = [0,0,1,1];
  const model = fitLogistic(x, y); assert.ok(predict(model, [1]) > predict(model, [0]));
  const rows = x.map((v, i) => ({ status: 'scored', raw: v[0], label: y[i] }));
  const map = fitCalibration(rows); const scored = rows.map(r => ({ ...r, calibrated: calibrate(r.raw, map) }));
  const threshold = selectThreshold(scored); assert.ok(threshold > scored[1].calibrated); assert.ok(threshold <= scored[2].calibrated);
});
test('zero observed false positives do not imply a zero-width safety interval', () => {
  const rows = Array.from({ length: 8 }, (_, i) => ({ sourceId: String(i), label: 0, status: 'scored', calibrated: 0.1 }));
  const result = clusteredReport(rows, 0.8, 100);
  assert.ok(result.intervals.fpr.high > 0.05);
  assert.equal(gate(result, 'fpr', 0.05, 'max'), 'inconclusive');
});
test('durable budget serializes reservations, rejects a second owner and never refunds failed calls', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jev-budget-')), path = join(dir, 'budget.json');
  const limits = { usd: 25, requests: 2, tokens: 128000 };
  const budget = await openBudget(path, limits);
  try {
    await assert.rejects(openBudget(path, limits), /EEXIST/);
    const [a] = await Promise.all([budget.reserve(), budget.reserve()]);
    await assert.rejects(budget.reserve(), /exhausted/);
    await budget.settle(a, 100);
    assert.equal(budget.snapshot().tokens, 64100);
    await assert.rejects(budget.settle(a, 100), /Invalid/);
    assert.equal(JSON.parse(await readFile(path)).requests, 2);
  } finally { await budget.close(); await rm(dir, { recursive: true, force: true }); }
});
