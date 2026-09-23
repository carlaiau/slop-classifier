import { invariant } from './io.js';

export const sigmoid = n => 1 / (1 + Math.exp(-Math.max(-35, Math.min(35, n))));
export const logit = n => Math.log(Math.max(1e-6, Math.min(1 - 1e-6, n)) / (1 - Math.max(1e-6, Math.min(1 - 1e-6, n))));
export function fitLogistic(x, y, { steps = 500, lambda = 0.01, rate = 0.3 } = {}) {
  invariant(x.length === y.length && x.length > 1 && new Set(y).size === 2, 'Fitting requires both classes');
  invariant(x.every(row => row.length === x[0].length && row.every(Number.isFinite)), 'Invalid feature matrix');
  const weights = Array(x[0].length).fill(0); let intercept = 0;
  for (let step = 0; step < steps; step++) {
    const grad = weights.map(w => lambda * w); let bias = 0;
    for (let i = 0; i < x.length; i++) {
      const error = sigmoid(intercept + x[i].reduce((sum, v, j) => sum + v * weights[j], 0)) - y[i];
      bias += error / x.length;
      x[i].forEach((v, j) => { grad[j] += error * v / x.length; });
    }
    weights.forEach((_, j) => { weights[j] -= rate * grad[j]; }); intercept -= rate * bias;
  }
  return { weights, intercept, lambda, steps };
}
export const predict = (model, x) => {
  invariant(x.length === model.weights.length && x.every(Number.isFinite), 'Feature shape mismatch');
  return sigmoid(model.intercept + x.reduce((s, v, i) => s + v * model.weights[i], 0));
};
export const calibrate = (raw, map) => map ? predict(map, [logit(raw)]) : null;
export function fitCalibration(rows) {
  const valid = rows.filter(r => r.status === 'scored');
  return fitLogistic(valid.map(r => [logit(r.raw)]), valid.map(r => r.label), { lambda: 0.001, rate: 0.05, steps: 1200 });
}
export function selectThreshold(rows, maxFpr = 0.05) {
  invariant(rows.some(r => r.label === 0) && rows.some(r => r.label === 1), 'Threshold selection requires both classes');
  // >1 is a legitimate abstain-all operating point; never silently use 0.5.
  const candidates = [...new Set([1.000001, ...rows.filter(r => r.status === 'scored').map(r => r.calibrated)])].sort((a, b) => a - b);
  return candidates.find(t => rows.filter(r => r.label === 0 && r.status === 'scored' && r.calibrated >= t).length / rows.filter(r => r.label === 0).length <= maxFpr);
}
const tokens = text => text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
export function fitTfidf(rows, maxFeatures = 1500) {
  invariant(rows.every(r => r.split === 'development'), 'TF-IDF must fit on development only');
  const df = new Map();
  for (const r of rows) for (const t of new Set(tokens(r.text))) df.set(t, (df.get(t) ?? 0) + 1);
  const vocabulary = [...df].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, maxFeatures).map(([t]) => t);
  const model = { vocabulary, idf: vocabulary.map(t => Math.log((1 + rows.length) / (1 + df.get(t))) + 1) };
  return { ...model, classifier: fitLogistic(rows.map(r => vectorize(model, r.text)), rows.map(r => r.label)) };
}
export function vectorize(model, text) {
  const counts = new Map(); for (const t of tokens(text)) counts.set(t, (counts.get(t) ?? 0) + 1);
  const x = model.vocabulary.map((t, i) => (counts.has(t) ? 1 + Math.log(counts.get(t)) : 0) * model.idf[i]);
  const norm = Math.sqrt(x.reduce((s, v) => s + v * v, 0)) || 1;
  return x.map(v => v / norm);
}
