import { seeded } from './io.js';
export const quantile = (values, q) => {
  if (!values.length) return null;
  const a = [...values].sort((a, b) => a - b); return a[Math.max(0, Math.ceil(q * a.length) - 1)];
};
const div = (a, b) => b ? a / b : null;
export function metrics(rows, threshold) {
  const valid = rows.filter(r => r.status === 'scored' && Number.isFinite(r.calibrated));
  const positive = r => r.status === 'scored' && r.calibrated >= threshold;
  const tp = rows.filter(r => r.label === 1 && positive(r)).length;
  const fp = rows.filter(r => r.label === 0 && positive(r)).length;
  const p = rows.filter(r => r.label === 1).length, n = rows.length - p;
  const ordered = [...valid].sort((a, b) => b.calibrated - a.calibrated);
  const vp = valid.filter(r => r.label === 1).length, vn = valid.length - vp;
  let seenP = 0, seenN = 0, aucArea = 0, ap = 0;
  for (let i = 0; i < ordered.length;) {
    let j = i; while (j < ordered.length && ordered[j].calibrated === ordered[i].calibrated) j++;
    const dp = ordered.slice(i, j).filter(r => r.label === 1).length, dn = j - i - dp;
    aucArea += dn * (seenP + dp / 2); seenP += dp; seenN += dn;
    ap += (vp ? dp / vp : 0) * seenP / (seenP + seenN); i = j;
  }
  // Quantile bins keep identical scores together, including constant baselines.
  const ascending = [...valid].sort((a, b) => a.calibrated - b.calibrated);
  const bins = []; let cursor = 0;
  while (cursor < ascending.length) {
    let end = Math.min(ascending.length, cursor + Math.ceil(ascending.length / 10));
    while (end < ascending.length && ascending[end].calibrated === ascending[end - 1].calibrated) end++;
    const bin = ascending.slice(cursor, end);
    bins.push({ n: bin.length, score: bin.reduce((s, r) => s + r.calibrated, 0) / bin.length, rate: bin.reduce((s, r) => s + r.label, 0) / bin.length }); cursor = end;
  }
  return { n: rows.length, scored: valid.length, positive: p, negative: n, tp, fp,
    failed: rows.filter(r => r.status === 'failed').length,
    abstained: rows.length - valid.length, coverage: div(valid.length, rows.length),
    fpr: div(fp, n), recall: div(tp, p), precision: div(tp, tp + fp), f1: div(2 * tp, p + tp + fp),
    answeredRecall: div(tp, vp), answeredFpr: div(fp, vn),
    auroc: div(aucArea, vp * vn), auprc: vp ? ap : null,
    brier: div(valid.reduce((s, r) => s + (r.calibrated - r.label) ** 2, 0), valid.length),
    ece: valid.length ? bins.reduce((s, b) => s + b.n * Math.abs(b.score - b.rate), 0) / valid.length : null,
    reliability: bins };
}
export function clusteredReport(rows, threshold, replicates = 1000, seed = 23092026) {
  const groups = new Map();
  for (const r of rows) { const group = groups.get(r.sourceId) ?? []; group.push(r); groups.set(r.sourceId, group); }
  const keys = [...groups.keys()], rng = seeded(seed), distributions = { fpr: [], recall: [], ece: [], f1: [] };
  for (let i = 0; i < replicates && keys.length >= 2; i++) {
    const sample = keys.flatMap(() => groups.get(keys[Math.floor(rng() * keys.length)]));
    const m = metrics(sample, threshold);
    for (const k of Object.keys(distributions)) if (m[k] !== null) distributions[k].push(m[k]);
  }
  const summary = metrics(rows, threshold);
  const intervals = Object.fromEntries(Object.entries(distributions).map(([k, v]) => [k, { low: quantile(v, 0.025), high: quantile(v, 0.975), replicates: v.length }]));
  const negativeSources = new Set(rows.filter(r => r.label === 0).map(r => r.sourceId)).size;
  const positiveSources = new Set(rows.filter(r => r.label === 1).map(r => r.sourceId)).size;
  // Pure percentile bootstrap degenerates to [0,0] after zero errors. Do not
  // certify safety from that: widen using a source-count boundary safeguard.
  if (summary.fpr === 0 && negativeSources >= 2) intervals.fpr.high = Math.max(intervals.fpr.high ?? 0, 1 - 0.025 ** (1 / negativeSources));
  if (summary.recall === 1 && positiveSources >= 2) intervals.recall.low = Math.min(intervals.recall.low ?? 1, 0.025 ** (1 / positiveSources));
  return { ...summary, sources: keys.length, negativeSources, positiveSources, intervals };
}
export function gate(report, key, bound, direction) {
  const v = report[key], ci = report.intervals?.[key];
  if (v == null || ci?.low == null || ci?.high == null) return 'inconclusive';
  if (direction === 'max') return ci.high <= bound ? 'pass' : ci.low > bound ? 'fail' : 'inconclusive';
  return ci.low >= bound ? 'pass' : ci.high < bound ? 'fail' : 'inconclusive';
}
export function evaluate(rows, threshold, replicates = 1000) {
  const canonical = canonicalHumanSeeds(rows);
  const groups = { overall: canonical, humanOnly: canonical.filter(r => r.version === 'v0'), heldOut: rows.filter(r => r.generator === 'qwen3-8b'), v4: rows.filter(r => r.version === 'v4') };
  for (const key of ['domain', 'generator', 'version', 'lengthBand']) for (const value of new Set(rows.map(r => r[key]).filter(Boolean))) groups[`${key}:${value}`] = rows.filter(r => r[key] === value);
  const reports = Object.fromEntries(Object.entries(groups).map(([k, rs]) => [k, clusteredReport(rs, threshold, replicates)]));
  const gates = {};
  for (const group of ['overall', 'heldOut', 'v4']) for (const [metric, bound, dir] of [['fpr', 0.05, 'max'], ['recall', 0.5, 'min']]) gates[`${group}.${metric}`] = gate(reports[group], metric, bound, dir);
  gates['humanOnly.fpr'] = gate(reports.humanOnly, 'fpr', 0.05, 'max');
  gates['overall.ece'] = gate(reports.overall, 'ece', 0.05, 'max');
  const decision = Object.values(gates).includes('fail') ? 'fail' : Object.values(gates).every(v => v === 'pass') ? 'pass' : 'inconclusive';
  return { reports, gates, decision, threshold, uncertainty: '95% source-document clustered percentile bootstrap, widened at zero-FPR/perfect-recall boundaries using source counts; not an independence claim about sentences' };
}

export function canonicalHumanSeeds(rows) {
  const seen = new Set();
  return rows.filter(r => {
    if (r.version !== 'v0') return true;
    const key = `${r.sourceId}:${r.start}:${r.end}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}
