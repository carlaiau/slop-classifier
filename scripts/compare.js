import { parseArgs } from 'node:util';
import { readJson, writeJson, digest, invariant } from '../src/io.js';
import { fitLogistic, fitTfidf, vectorize, predict, fitCalibration, calibrate, selectThreshold } from '../src/learning.js';
import { metrics, canonicalHumanSeeds } from '../src/metrics.js';
const { values, positionals: paths } = parseArgs({ allowPositionals: true, options: { out: { type: 'string' } } });
invariant(paths.length >= 2 && values.out, 'Pass at least two development run paths and --out');
const runs = await Promise.all(paths.map(readJson));
invariant(runs.every(r => r.split === 'development' && r.complete && !r.results.some(p => p.status === 'failed')), 'Complete failure-free development runs only');
invariant(runs.every(r => r.manifestDigest === runs[0].manifestDigest && digest(r.results.map(x => x.id).sort()) === digest(runs[0].results.map(x => x.id).sort())), 'Method comparison must use identical development examples');
const summaries = [];
for (const run of runs) {
  const rows = canonicalHumanSeeds(run.results), predictions = [];
  const fold = id => Number.parseInt(digest(`fold:${id}`).slice(0, 8), 16) % 5;
  for (let k = 0; k < 5; k++) {
    const train = rows.filter(r => fold(r.sourceId) !== k), test = rows.filter(r => fold(r.sourceId) === k);
    invariant(train.length && test.length, 'Too few source groups for five folds');
    let classify = r => r.raw;
    if (run.method === 'combined') {
      const usable = train.filter(r => r.features);
      const model = fitLogistic(usable.map(r => r.features), usable.map(r => r.label)); classify = r => r.features ? predict(model, r.features) : null;
    } else if (run.method === 'tfidf') {
      const model = fitTfidf(train); classify = r => predict(model.classifier, vectorize(model, r.text));
    } else if (run.method === 'prior') {
      const prior = train.reduce((sum, r) => sum + r.label, 0) / train.length; classify = () => prior;
    }
    const raw = records => records.map(r => ({ ...r, raw: classify(r), status: r.status === 'features' ? 'scored' : r.status }));
    const training = raw(train), calibration = fitCalibration(training);
    const threshold = selectThreshold(training.map(r => ({ ...r, calibrated: r.status === 'scored' ? calibrate(r.raw, calibration) : null })));
    predictions.push(...raw(test).map(r => ({ ...r, calibrated: r.status === 'scored' ? calibrate(r.raw, calibration) : null, fold: k, threshold })));
  }
  // Each held-out fold uses its own training-only threshold; map decisions to
  // 0/1 for operating-point metrics and retain probability metrics separately.
  const point = metrics(predictions.map(r => ({ ...r, calibrated: r.calibrated === null ? null : Number(r.calibrated >= r.threshold) })), 0.5);
  const probabilistic = metrics(predictions, 0.5);
  summaries.push({ method: run.method, runDigest: digest(run), fpr: point.fpr, recall: point.recall, precision: point.precision, f1: point.f1, ece: probabilistic.ece, brier: probabilistic.brier, auroc: probabilistic.auroc, coverage: point.coverage });
}
const qualifying = summaries.filter(s => s.fpr !== null && s.fpr <= 0.05 && s.recall >= 0.5).sort((a, b) => b.recall - a.recall || a.method.localeCompare(b.method));
let recommended = qualifying[0] ?? null;
if (recommended) recommended = qualifying.find(s => ['sentence', 'sentence-context'].includes(s.method) && s.recall >= recommended.recall - 0.02) ?? recommended;
await writeJson(values.out, { kind: 'development-method-comparison', manifestDigest: runs[0].manifestDigest, folds: 5, sourceGrouped: true, summaries, recommended: recommended?.method ?? null,
  decision: recommended ? 'candidate-for-calibration' : 'continue-development-or-stop',
  caveat: 'Development-only model selection, not independent accuracy. Runtime/cost must break remaining ties before freezing. Combined and TF-IDF models are refitted inside each fold.' }, true);
