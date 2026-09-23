// Recompute a development-only FPR sensitivity scenario from saved scores; no API calls.
import { parseArgs } from 'node:util';
import { readJson, writeJson, invariant } from '../src/io.js';
import { fitCalibration, calibrate, selectThreshold } from '../src/learning.js';
import { metrics } from '../src/metrics.js';

const { values } = parseArgs({ options: { target: { type: 'string' }, out: { type: 'string' } } });
const target = Number(values.target);
invariant(Number.isFinite(target) && target > 0 && target < 1, 'Pass --target between 0 and 1');
const root = 'data/expanded-development-v1';
const plan = await readJson(`${root}/plan.json`);
const runs = Object.fromEntries(await Promise.all(['sentence', 'sentence-context', 'prefix-mean'].map(async method => [method, await readJson(`${root}/${method}.json`)])));
invariant(Object.values(runs).every(r => r.complete && r.results.length === plan.examples), 'Complete saved development scores required');
const upper = r => {
  if (r.status !== 'scored') return { ...r, raw: null };
  const values = (r.words ?? []).map(w => w.raw).sort((a, b) => b - a);
  invariant(values.length && values.every(Number.isFinite), 'Missing prefix word scores');
  const top = values.slice(0, Math.ceil(values.length / 4));
  return { ...r, raw: top.reduce((a, b) => a + b, 0) / top.length };
};
const methods = { sentence: runs.sentence.results, 'sentence-context': runs['sentence-context'].results,
  'prefix-mean': runs['prefix-mean'].results, 'prefix-upper': runs['prefix-mean'].results.map(upper) };
const folds = new Map();
for (const domain of ['abstracts', 'essays', 'news', 'reports']) {
  const ids = plan.sourceIds.filter(id => id.startsWith(`${domain}:`));
  invariant(ids.length === 3, 'Three sources per domain required');
  ids.forEach((id, i) => folds.set(id, i));
}
const comparison = [];
for (const [method, rows] of Object.entries(methods)) {
  const raw = rows.map(r => ({ ...r, calibrated: r.raw }));
  const cutoff = selectThreshold(raw, target), same = metrics(raw, cutoff);
  const decisions = [], foldResults = [];
  for (let fold = 0; fold < 3; fold++) {
    const train = rows.filter(r => folds.get(r.sourceId) !== fold);
    const test = rows.filter(r => folds.get(r.sourceId) === fold);
    invariant(new Set(train.map(r => r.sourceId)).size === 8 && new Set(test.map(r => r.sourceId)).size === 4, 'Source-grouped fold failed');
    const map = fitCalibration(train);
    const training = train.map(r => ({ ...r, calibrated: r.status === 'scored' ? calibrate(r.raw, map) : null }));
    const threshold = selectThreshold(training, target);
    const held = test.map(r => ({ ...r, calibrated: r.status === 'scored' ? calibrate(r.raw, map) : null }));
    const measured = metrics(held, threshold);
    foldResults.push({ fold, threshold, fpr: measured.fpr, recall: measured.recall, coverage: measured.coverage });
    decisions.push(...held.map(r => ({ ...r, calibrated: r.calibrated === null ? null : Number(r.calibrated >= threshold) })));
  }
  const grouped = metrics(decisions, 0.5);
  const human = metrics(decisions.filter(r => r.version === 'v0'), 0.5);
  comparison.push({ method,
    sameExamples: { rawThreshold: cutoff, fpr: same.fpr, recall: same.recall, precision: same.precision },
    heldSources: { fpr: grouped.fpr, humanOnlyFpr: human.fpr, recall: grouped.recall, precision: grouped.precision, coverage: grouped.coverage, folds: foldResults } });
}
const report = { kind: 'development-threshold-scenario', targetTrainingFpr: target, sourceCount: 12,
  examples: plan.examples, providerCalls: 0, comparison,
  caveat: 'Development-only sensitivity analysis. Each cutoff is fitted on eight sources and evaluated on four unseen development sources. Actual FPR can exceed the target. Official calibration/test remain unopened.' };
const out = values.out ?? `${root}/threshold-scenario-${Math.round(target * 100)}.json`;
await writeJson(out, report, true);
console.log(JSON.stringify({ targetTrainingFpr: target, providerCalls: 0,
  comparison: comparison.map(r => ({ method: r.method, rawThreshold: r.sameExamples.rawThreshold,
    sameExamples: { fpr: r.sameExamples.fpr, recall: r.sameExamples.recall },
    heldSources: { fpr: r.heldSources.fpr, recall: r.heldSources.recall, humanOnlyFpr: r.heldSources.humanOnlyFpr } })) }, null, 2));
