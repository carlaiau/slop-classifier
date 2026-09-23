// Source-balanced development extension; official calibration and test remain sealed.
import { parseArgs } from 'node:util';
import { readJson, readJsonl, writeJson, writeJsonl, digest, invariant } from '../src/io.js';
import { estimate, scoreBatch, createProvider, scoringIdentity } from '../src/scoring.js';
import { openBudget } from '../src/budget.js';
import { access } from 'node:fs/promises';

const { values: args } = parseArgs({ options: { execute: { type: 'boolean' }, 'price-verified': { type: 'string' } } });
const outDir = 'data/expanded-development-v1';
const methods = ['sentence', 'sentence-context', 'prefix-mean'];
const old = await readJson('data/feasibility/comparison-plan.json');
const previous = Object.fromEntries(await Promise.all(methods.map(async m => [m, await readJson(`data/feasibility/runs/${m}.json`)])));
const manifest = await readJson('data/prepared/manifest.json');
const all = await readJsonl('data/prepared/examples.jsonl');
invariant(digest(all) === manifest.dataDigest, 'Prepared dataset changed');
const dev = all.filter(r => r.split === 'development' && r.generator === 'gpt-5.4-nano');
const sourceIds = ['abstracts', 'essays', 'news', 'reports'].flatMap(d =>
  [...new Set(dev.filter(r => r.domain === d).map(r => r.sourceId))]
    .sort((a, b) => digest(a).localeCompare(digest(b))).slice(0, 3));
invariant(sourceIds.length === 12 && old.sourceIds.every(id => sourceIds.includes(id)), 'Expected 12 sources including the original four');
const rows = dev.filter(r => sourceIds.includes(r.sourceId));
const key = r => digest({ id: r.id, sourceId: r.sourceId, text: r.text, preceding: r.preceding, start: r.start, end: r.end, label: r.label });
const oldIds = new Set(old.sourceIds);
for (const method of methods) {
  const prior = previous[method];
  invariant(prior.complete && prior.method === method && prior.results.length === old.rows && prior.results.every(r => oldIds.has(r.sourceId)), 'Incomplete original comparison');
  const current = new Map(rows.map(r => [r.id, r]));
  invariant(prior.results.every(r => current.has(r.id) && key(r) === key(current.get(r.id))), 'Prior scored rows differ from current development selection');
  invariant(prior.scoringVersion === scoringIdentity(method), 'Scoring version changed since original run');
}
const plan = { kind: 'expanded-development-v1', methodSet: methods, manifestDigest: digest(manifest), previousManifestDigest: old.manifestDigest,
  sourceIds, examples: rows.length, methods: Object.fromEntries(methods.map(m => [m, estimate(rows, m)])),
  reuse: Object.fromEntries(methods.map(m => [m, previous[m].results.length])),
  conditions: 'Three development sources per domain; GPT-5.4-nano only. No combined model. Prefix-upper is calculated from prefix-mean word signals. This is development evidence, not calibration or test validation.' };
if (!args.execute) { console.log(JSON.stringify({ dryRun: true, ...plan }, null, 2)); process.exit(0); }
invariant(args['price-verified'] === new Date().toISOString().slice(0, 10), 'Reverify provider price today');
await writeJson(`${outDir}/plan.json`, plan, true);
await writeJsonl(`${outDir}/examples.jsonl`, rows);
const budget = await openBudget('data/budget.json', { usd: 25, requests: 10000, tokens: 10000000 });
try {
  const provider = await createProvider(budget);
  for (const method of methods) {
    const before = budget.snapshot();
    const prior = new Map(previous[method].results.map(r => [r.id, r]));
    const path = `${outDir}/${method}.json`;
    let artifact;
    try { artifact = await readJson(path); invariant(artifact.scoringVersion === scoringIdentity(method) && artifact.planDigest === digest(plan), 'Run identity changed'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; artifact = { method, split: 'development', generator: 'gpt-5.4-nano', sourceCount: 12, planDigest: digest(plan), manifestDigest: digest(manifest), scoringVersion: scoringIdentity(method), runtime: { batch: 8, concurrency: 3 }, results: [...prior.values()].map(r => ({ ...r, reusedFromFourSourceRun: true })), attempts: [], complete: false }; }
    const have = new Map(artifact.results.filter(r => r.status !== 'failed').map(r => [r.id, r]));
    const missing = rows.filter(r => !have.has(r.id));
    const failures = [];
    for (let i = 0; i < missing.length; i += 24) {
      const jobs = [];
      for (let j = i; j < Math.min(i + 24, missing.length); j += 8) {
        const batch = missing.slice(j, j + 8);
        jobs.push((async () => {
          try { const predictions = await scoreBatch(batch, { method, provider }); return predictions.map((p, k) => ({ ...batch[k], ...p })); }
          catch (e) { failures.push({ errorType: e.name, httpStatus: e.status ?? null, batchIds: batch.map(r => r.id) }); return batch.map(r => ({ ...r, status: 'failed', raw: null, calibrated: null })); }
        })());
      }
      const batchResults = (await Promise.all(jobs)).flat();
      for (const r of batchResults) have.set(r.id, r);
      artifact.results = rows.filter(r => have.has(r.id)).map(r => have.get(r.id));
      artifact.attempts.push({ at: new Date().toISOString(), from: i, count: batchResults.length, failures: failures.length });
      artifact.complete = false; await writeJson(path, artifact);
      if (failures.length) break;
    }
    artifact.results = rows.filter(r => have.has(r.id)).map(r => have.get(r.id));
    artifact.complete = artifact.results.length === rows.length && !artifact.results.some(r => r.status === 'failed');
    artifact.failures = failures;
    const after = budget.snapshot();
    artifact.usage = { newRequests: after.requests - before.requests, newInputTokens: after.tokens - before.tokens, reservedOrSettledUsd: after.usd - before.usd };
    await writeJson(path, artifact);
    console.log(JSON.stringify({ method, complete: artifact.complete, examples: artifact.results.length, reused: prior.size, ...artifact.usage, failures: failures.length }));
    if (!artifact.complete) break;
  }
} finally { await budget.close(); }
