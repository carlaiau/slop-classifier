import { parseArgs } from 'node:util';
import { readJson, writeJson, invariant, digest } from '../src/io.js';
import { quantile } from '../src/metrics.js';
const { values, positionals } = parseArgs({ allowPositionals: true, options: { out: { type: 'string' } } });
invariant(positionals.length && values.out, 'Pass session timing JSON files and --out');
const sessions = await Promise.all(positionals.map(readJson));
invariant(sessions.every(s => s.schema === 'reader-timings-v1' && Array.isArray(s.observations)), 'Invalid session timing file');
invariant(sessions.every(s => s.scoringVersion === sessions[0].scoringVersion && digest(s.runtime) === digest(sessions[0].runtime)), 'Combine only matching scoring versions and runtimes');
const observations = sessions.flatMap(s => s.observations), batches = observations.flatMap(o => o.batches);
const summarize = obs => ({ n: obs.length, incomplete: obs.filter(o => o.firstSentenceMs === null || o.completeMs === null).length,
  firstSentenceP50Ms: quantile(obs.map(o => o.firstSentenceMs).filter(Number.isFinite), 0.5), firstSentenceP95Ms: quantile(obs.map(o => o.firstSentenceMs).filter(Number.isFinite), 0.95),
  viewportP95Ms: quantile(obs.map(o => o.completeMs).filter(Number.isFinite), 0.95) });
await writeJson(values.out, { schema: 'latency-report-v1', synthetic: sessions.some(s => s.synthetic), scoringVersion: sessions[0].scoringVersion, runtime: sessions[0].runtime, observations,
  all: summarize(observations), misses: summarize(observations.filter(o => o.cache === 'miss')), hits: summarize(observations.filter(o => o.cache === 'hit')),
  cold: summarize(observations.filter(o => o.batches.some(b => b.serverState === 'cold-first-request'))),
  warmMisses: summarize(observations.filter(o => o.cache === 'miss' && o.batches.every(b => b.serverState === 'warm'))),
  apiP95Ms: quantile(batches.map(b => b.apiMs).filter(Number.isFinite), 0.95), queueP95Ms: quantile(batches.map(b => b.queueMs).filter(Number.isFinite), 0.95),
  failedBatches: batches.filter(b => b.failed).length, wastedBatches: batches.filter(b => b.wasted).length,
  note: 'Incomplete viewports and failures are retained. Successful-only percentiles do not by themselves satisfy release gates. Reconcile token cost with the durable provider ledger.' }, true);
