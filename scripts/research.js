import { parseArgs } from 'node:util';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readJson, readJsonl, writeJson, writeJsonl, digest, invariant } from '../src/io.js';
import { prepare } from '../src/dataset.js';
import { scoreSentence, createProvider, estimate, scoringIdentity, MODEL } from '../src/scoring.js';
import { openBudget } from '../src/budget.js';
import { fitLogistic, fitTfidf, vectorize, predict, fitCalibration, calibrate, selectThreshold } from '../src/learning.js';
import { evaluate, quantile, canonicalHumanSeeds } from '../src/metrics.js';
import { segment } from '../src/text.js';

const options = Object.fromEntries(['input','out','data','manifest','split','method','model','run','calibration','freeze','ledger','max-requests','max-tokens','budget-usd','price-verified','audit','predictions','metadata','latency','report','release','replicates','batch','concurrency','parity'].map(k => [k, { type: 'string' }]));
Object.assign(options, Object.fromEntries(['execute','cache-only','open-test'].map(k => [k, { type: 'boolean' }])));
const requireOption = (args, key) => { invariant(args[key], `--${key} is required`); return args[key]; };
const defaults = { data: 'data/prepared/examples.jsonl', manifest: 'data/prepared/manifest.json' };
async function loadData(args) {
  const rows = await readJsonl(args.data ?? defaults.data), manifest = await readJson(args.manifest ?? defaults.manifest);
  invariant(digest(rows) === manifest.dataDigest, 'Dataset differs from its frozen manifest');
  return { rows, manifest };
}
async function exclusiveJson(path, data) { await writeJson(path, data, true); }
export async function main(argv = process.argv.slice(2)) {
  const { values: a, positionals } = parseArgs({ args: argv, options, allowPositionals: true });
  const command = positionals[0];
  if (!command || command === 'help') {
    console.log(`Commands: prepare, fit-baseline, run, fit-combined, calibrate, freeze, evaluate, parity, export-baseline, import-baseline, release, report
All provider runs default to dry-run. See docs/research-workflow.md for exact commands.
No test access without a freeze plus --open-test; no paid access without --execute and explicit caps.`); return;
  }
  if (command === 'prepare') {
    const input = requireOption(a, 'input'), rows = await readJsonl(input);
    const audit = a.audit ? await readJson(a.audit) : null;
    invariant(rows.every(r => r.synthetic) || audit?.shards?.length, 'Real imports require --audit from data:import');
    const { examples, manifest } = prepare(rows, undefined, audit?.quarantinedSourceShards?.map(r => r.sourceId));
    manifest.importAuditDigest = audit ? digest(audit) : null;
    const out = a.out ?? 'data/prepared';
    await exclusiveJson(`${out}/manifest.json`, manifest); await writeJsonl(`${out}/examples.jsonl`, examples);
    console.log(JSON.stringify({ sources: manifest.ids.length, examples: examples.length, counts: manifest.counts, synthetic: manifest.audit.synthetic }, null, 2)); return;
  }
  if (command === 'report') {
    const report = await readJson(requireOption(a, 'report'));
    const body = [`# Detection evaluation`, '', `Decision: **${report.decision}**. ${report.synthetic ? 'SYNTHETIC SOFTWARE CHECK — not empirical evidence.' : 'See provenance and exclusions in the run manifest.'}`, '', '| Slice | Sources | FPR | Recall | ECE | Coverage |', '|---|---:|---:|---:|---:|---:|'];
    for (const [name, r] of Object.entries(report.reports)) body.push(`| ${name} | ${r.sources} | ${format(r.fpr)} | ${format(r.recall)} | ${format(r.ece)} | ${format(r.coverage)} |`);
    body.push('', '## Reliability diagram (equal-frequency bins; ties kept together)', '', '| Mean score | Observed AI rate | Count |', '|---:|---:|---:|');
    for (const b of report.reports.overall.reliability) body.push(`| ${format(b.score)} | ${format(b.rate)} | ${b.n} |`);
    body.push('', 'Intervals, abstentions, failed requests, and all gate decisions are retained in the JSON report. This is not evidence that a score is a universal authorship probability.', '');
    await writeFile(requireOption(a, 'out'), body.join('\n')); return;
  }
  if (command === 'release') {
    const frozen = await readJson(requireOption(a, 'freeze')), report = await readJson(requireOption(a, 'report')), latency = await readJson(requireOption(a, 'latency'));
    const parity = await readJson(requireOption(a, 'parity'));
    invariant(parity.freezeDigest === digest(frozen) && parity.split === 'test' && parity.mismatches.length === 0 && parity.records > 0, 'Exact operational segmentation parity required; mismatches need a fresh operational evaluation');
    invariant(report.freezeDigest === digest(frozen) && !report.synthetic && report.complete && report.decision === 'pass', 'A complete, real, passing locked evaluation is required');
    invariant(latency.scoringVersion === frozen.scoringVersion && latency.synthetic === false && Array.isArray(latency.observations), 'Real matching end-to-end latency observations required');
    const uncached = latency.observations.filter(r => r.cache === 'miss');
    invariant(digest(latency.runtime) === digest(frozen.runtime), 'Latency runtime differs from the frozen runtime');
    invariant(uncached.length >= 100 && uncached.every(r => Number.isFinite(r.firstSentenceMs) && r.firstSentenceMs >= 0), 'At least 100 uncached viewport observations required');
    invariant(uncached.every(r => r.completeMs !== null && r.batches.length > 0 && r.batches.every(b => !b.failed)), 'Incomplete or failed viewport observations prevent release');
    const p95 = quantile(uncached.map(r => r.firstSentenceMs), 0.95);
    invariant(p95 <= 1000, 'Latency gate failed');
    invariant(['sentence', 'sentence-context'].includes(frozen.method), 'Pilot supports sentence methods only until word localization and UI study pass');
    const release = { ...frozen, kind: 'pilot-release', reportDigest: digest(report), latencyDigest: digest(latency), firstSentenceP95Ms: p95, technicalGates: 'pass', pilotStatus: 'not-yet-conducted' };
    await exclusiveJson(requireOption(a, 'out'), release); return;
  }
  const { rows, manifest } = await loadData(a);
  const split = a.split ?? 'development';
  invariant(['development', 'calibration', 'test'].includes(split), 'Invalid split');
  const subset = rows.filter(r => r.split === split);
  invariant(subset.length, `No examples for ${split}`);
  if (command === 'fit-baseline') {
    invariant(split === 'development', 'Baselines fit on development only');
    const method = a.method ?? 'tfidf'; invariant(['prior', 'tfidf'].includes(method), 'Choose prior or tfidf');
    const training = canonicalHumanSeeds(subset);
    const model = method === 'tfidf' ? fitTfidf(training) : { prior: training.reduce((s, r) => s + r.label, 0) / training.length };
    await exclusiveJson(requireOption(a, 'out'), { method, model, manifestDigest: digest(manifest), trainingIds: digest(subset.map(r => r.id)), split }); return;
  }
  if (command === 'fit-combined') {
    const run = await readJson(requireOption(a, 'run'));
    invariant(run.split === 'development' && run.method === 'combined' && run.manifestDigest === digest(manifest) && run.complete, 'Complete development feature run required');
    const examples = run.results.filter(r => r.status === 'features');
    const model = fitLogistic(examples.map(r => r.features), examples.map(r => r.label));
    await exclusiveJson(requireOption(a, 'out'), { method: 'combined', model, manifestDigest: digest(manifest), trainingIds: digest(examples.map(r => r.id)), split: 'development' }); return;
  }
  if (command === 'calibrate') {
    const run = await readJson(requireOption(a, 'run'));
    invariant(run.split === 'calibration' && run.complete && run.manifestDigest === digest(manifest), 'Complete matching calibration run required');
    invariant(!run.results.some(r => r.status === 'failed' || r.status === 'features'), 'Resolve failures and fit the combined model before calibration');
    const calibrationRows = canonicalHumanSeeds(run.results);
    const calibration = fitCalibration(calibrationRows);
    const calibrated = calibrationRows.map(r => ({ ...r, calibrated: r.status === 'scored' ? calibrate(r.raw, calibration) : null }));
    const threshold = selectThreshold(calibrated);
    await exclusiveJson(requireOption(a, 'out'), { method: run.method, calibration, threshold, manifestDigest: digest(manifest), baseScoringVersion: run.scoringVersion, modelArtifact: run.modelArtifact, calibrationRunDigest: digest(run), fitSplit: 'calibration' }); return;
  }
  if (command === 'freeze') {
    const artifact = await readJson(requireOption(a, 'calibration'));
    invariant(artifact.manifestDigest === digest(manifest) && artifact.fitSplit === 'calibration', 'Mismatched calibration');
    const protocol = await readJson('research/protocol.json');
    const batch = Number(a.batch ?? 4), concurrency = Number(a.concurrency ?? 3);
    invariant([1, 4, 8].includes(batch) && [1, 3, 6].includes(concurrency), 'Invalid frozen runtime');
    const freeze = { kind: 'locked-specification', protocolDigest: digest(protocol), manifestDigest: digest(manifest), method: artifact.method, model: MODEL, calibration: artifact.calibration, threshold: artifact.threshold, modelArtifact: artifact.modelArtifact,
      scoringVersion: ['prior', 'tfidf'].includes(artifact.method) || artifact.method.startsWith('external:') ? artifact.baseScoringVersion : scoringIdentity(artifact.method, artifact.calibration, artifact.modelArtifact?.model ?? null),
      runtime: { batch, concurrency }, createdAt: new Date().toISOString(), synthetic: manifest.audit.synthetic };
    await exclusiveJson(requireOption(a, 'out'), freeze); return;
  }
  let frozen = a.freeze ? await readJson(a.freeze) : null;
  if (split === 'test') {
    invariant(frozen && a['open-test'], 'Test access requires --freeze and --open-test');
    invariant(frozen.manifestDigest === digest(manifest), 'Frozen dataset mismatch');
    invariant(frozen.protocolDigest === digest(await readJson('research/protocol.json')), 'Protocol changed after freeze');
    // One artifact path owns this evaluation. Retry only that exact path/specification.
    const family = ['sentence', 'sentence-context', 'prefix-mean', 'prefix-upper', 'combined'].includes(frozen.method) ? 'jev' : frozen.method;
    const receipt = `${a.manifest ?? defaults.manifest}.test-opened-${digest(family).slice(0, 16)}.json`;
    const declaration = { freezeDigest: digest(frozen), output: resolve(requireOption(a, 'out')) };
    if ((command === 'run' && (a.execute || a['cache-only'])) || command === 'import-baseline') {
      try { await exclusiveJson(receipt, declaration); } catch (e) { if (e.code !== 'EEXIST') throw e; invariant(digest(await readJson(receipt)) === digest(declaration), 'Locked test already opened to another output path'); }
    }
  }
  if (command === 'evaluate') {
    invariant(split === 'test' && frozen, 'Evaluation is locked-test only');
    const run = await readJson(requireOption(a, 'run'));
    invariant(run.complete && run.split === 'test' && run.freezeDigest === digest(frozen) && run.manifestDigest === digest(manifest), 'Complete matching test run required');
    invariant(run.results.length === subset.length && digest(run.results.map(r => r.id).sort()) === digest(subset.map(r => r.id).sort()), 'Evaluation sample mismatch');
    invariant(!run.results.some(r => r.status === 'failed' || r.status === 'features'), 'Partial/failed run cannot produce a completed evaluation');
    const report = evaluate(run.results, frozen.threshold, Number(a.replicates ?? 1000));
    report.complete = true; report.synthetic = manifest.audit.synthetic; report.freezeDigest = digest(frozen); report.runDigest = digest(run);
    report.attempts = { total: run.attempts?.length ?? run.results.length, failed: run.attempts?.filter(r => r.status === 'failed').length ?? 0 };
    // Mock fixtures never pass a release gate.
    if (report.synthetic) report.decision = 'synthetic-only';
    await exclusiveJson(requireOption(a, 'out'), report); console.log(JSON.stringify({ decision: report.decision, gates: report.gates }, null, 2)); return;
  }
  if (command === 'parity') {
    invariant(split === 'test' && frozen, 'Operational parity must use the locked test specification');
    const groups = new Map();
    for (const row of subset) { const group = groups.get(row.recordId) ?? []; group.push(row); groups.set(row.recordId, group); }
    const mismatches = [];
    for (const [recordId, units] of groups) {
      units.sort((x, y) => x.start - y.start);
      invariant(units.every(r => typeof r.gapBefore === 'string' && typeof r.trailing === 'string'), 'Reimport with gap-preserving importer to run parity');
      const text = units.map(r => r.gapBefore + r.text + r.trailing).join('');
      invariant(units.every(r => text.slice(r.start, r.end) === r.text), 'Operational replay reconstruction failed');
      const operational = segment(text);
      if (operational.length !== units.length || operational.some((s, i) => s.text.trim() !== units[i]?.text.trim())) mismatches.push({ recordId, goldUnits: units.length, operationalUnits: operational.length });
    }
    await exclusiveJson(requireOption(a, 'out'), { freezeDigest: digest(frozen), split, records: groups.size, mismatches, note: 'Whitespace-trimmed target parity; source offsets reconstructed and checked. Mismatches block participant release.' }); return;
  }
  if (command === 'export-baseline') {
    const method = requireOption(a, 'method');
    invariant(['genai-sentence', 'gemini-flash-direct-low', 'fast-detectgpt-sentence'].includes(method), 'Unknown external baseline');
    if (frozen) invariant(frozen.method === `external:${method}`, 'External method differs from freeze');
    const job = { kind: 'external-baseline-job', method, split, manifestDigest: digest(manifest), freezeDigest: frozen ? digest(frozen) : null,
      codeRevision: '739d647bab87c7d3c7a86d3df6c008945af5c4a2', context: 'target-sentence-only; adaptation for Fast-DetectGPT', examples: subset.map(({ id, sourceId, text }) => ({ id, sourceId, text })) };
    await exclusiveJson(requireOption(a, 'out'), job); return;
  }
  if (command === 'import-baseline') {
    const external = await readJson(requireOption(a, 'predictions')), metadata = await readJson(requireOption(a, 'metadata'));
    invariant(metadata.hardware && metadata.configuration && metadata.trainingExposure && metadata.codeRevision === '739d647bab87c7d3c7a86d3df6c008945af5c4a2', 'Baseline metadata incomplete');
    invariant(external.manifestDigest === digest(manifest) && external.split === split, 'Baseline manifest/split mismatch');
    const predictions = new Map(external.results.map(r => [r.id, r]));
    invariant(predictions.size === subset.length && external.results.length === subset.length && subset.every(r => predictions.has(r.id)), 'Predictions must cover the exact matched sample once');
    invariant(external.results.every(r => r.status === 'failed' || (r.status === 'scored' && Number.isFinite(r.raw) && r.raw >= 0 && r.raw <= 1)), 'Invalid external score; normalize orientation in audited adapter');
    const method = `external:${external.method}`, scoringVersion = digest({ method, metadata });
    if (frozen) invariant(frozen.method === method && frozen.scoringVersion === scoringVersion, 'Baseline configuration changed after freeze');
    const results = subset.map(r => { const p = predictions.get(r.id); return { ...r, ...p, calibrated: p.status === 'scored' ? calibrate(p.raw, frozen?.calibration) : null }; });
    await exclusiveJson(requireOption(a, 'out'), { complete: true, method, split, results, modelArtifact: { metadata }, scoringVersion, manifestDigest: digest(manifest), freezeDigest: frozen ? digest(frozen) : null }); return;
  }
  invariant(command === 'run', `Unknown command: ${command}`);
  const method = frozen?.method ?? a.method ?? 'sentence';
  let modelArtifact = frozen?.modelArtifact ?? (a.model ? await readJson(a.model) : null);
  if (modelArtifact?.manifestDigest) invariant(modelArtifact.manifestDigest === digest(manifest), 'Model trained on another dataset');
  const calibration = frozen?.calibration ?? null;
  const isLocal = ['prior', 'tfidf'].includes(method);
  const identity = isLocal ? digest(modelArtifact) : scoringIdentity(method, calibration, modelArtifact?.model ?? null);
  if (frozen && !isLocal) invariant(identity === frozen.scoringVersion, 'Scoring implementation differs from freeze');
  if (isLocal) invariant(modelArtifact?.method === method, 'Matching fitted baseline required');
  const plan = isLocal ? { requests: 0, sentences: subset.length } : estimate(subset, method);
  if (!a.execute && !a['cache-only']) { console.log(JSON.stringify({ dryRun: true, split, method, synthetic: manifest.audit.synthetic, ...plan }, null, 2)); return; }
  const out = requireOption(a, 'out');
  let run;
  try { run = await readJson(out); invariant(run.scoringVersion === identity && run.manifestDigest === digest(manifest) && run.split === split, 'Cannot resume a different run'); }
  catch (e) { if (e.code !== 'ENOENT') throw e; run = { namespace: 'benchmark-ai-typicality-v1', method, split, scoringVersion: identity, modelArtifact, manifestDigest: digest(manifest), freezeDigest: frozen ? digest(frozen) : null, synthetic: manifest.audit.synthetic, results: [], attempts: [], complete: false, createdAt: new Date().toISOString() }; }
  let budget, provider, initialBudget; let submittedWords = 0;
  const cacheRoot = 'data/cache/benchmark-ai-typicality-v1';
  try {
    if (!isLocal && a.execute && !a['cache-only']) {
      invariant(!manifest.audit.synthetic, 'Synthetic software fixtures must never call a paid provider');
      invariant(a['price-verified'] === new Date().toISOString().slice(0, 10), 'Reverify model pricing today and pass --price-verified YYYY-MM-DD');
      budget = await openBudget(a.ledger ?? 'data/budget.json', { usd: Number(requireOption(a, 'budget-usd')), requests: Number(requireOption(a, 'max-requests')), tokens: Number(requireOption(a, 'max-tokens')) });
      initialBudget = budget.snapshot();
      provider = await createProvider(budget);
    }
    const existing = new Map(run.results.filter(r => r.status !== 'failed').map(r => [r.id, r]));
    run.results = [];
    for (const r of subset) {
      if (existing.has(r.id)) { run.results.push(existing.get(r.id)); continue; }
      const key = digest({ identity, text: r.text, preceding: r.preceding, start: r.start, end: r.end });
      let prediction; const started = performance.now(); let cached = false;
      try {
        if (isLocal) prediction = { status: 'scored', raw: method === 'prior' ? modelArtifact.model.prior : predict(modelArtifact.model.classifier, vectorize(modelArtifact.model, r.text)) };
        else {
          try { const entry = await readJson(`${cacheRoot}/${key}.json`); invariant(entry.key === key && entry.scoringVersion === identity, 'Corrupt prediction cache'); prediction = entry.prediction; cached = true; }
          catch (e) { if (e.code !== 'ENOENT') throw e; invariant(provider, 'No cached prediction; network inference disabled'); prediction = await scoreSentence(r, { method, calibration, combined: modelArtifact?.model, provider }); if (['scored', 'features'].includes(prediction.status)) submittedWords += r.text.trim().split(/\s+/).length; await writeJson(`${cacheRoot}/${key}.json`, { key, scoringVersion: identity, prediction }); }
        }
        prediction = { ...prediction, calibrated: prediction.status === 'scored' ? calibrate(prediction.raw, calibration) : null };
      } catch (e) { prediction = { status: 'failed', raw: null, calibrated: null, reason: e.message.includes('budget') ? 'Budget exhausted or unavailable' : 'Inference/cache unavailable; inspect configuration and retry' }; }
      run.results.push({ ...r, ...prediction, id: r.id, cached, elapsedMs: performance.now() - started });
      run.attempts ??= []; run.attempts.push({ id: r.id, status: prediction.status, cached, elapsedMs: performance.now() - started, at: new Date().toISOString() });
      run.complete = false; if (run.results.length % 25 === 0 || prediction.status === 'failed') await writeJson(out, run);
      if (budget && prediction.status === 'failed') break; // No request storm after provider/budget failure.
    }
    run.complete = run.results.length === subset.length;
    run.budget = budget?.snapshot() ?? null;
    if (budget) {
      run.costHistory ??= [];
      const usd = run.budget.usd - initialBudget.usd;
      run.costHistory.push({ at: new Date().toISOString(), requests: run.budget.requests - initialBudget.requests, reservedOrSettledInputTokens: run.budget.tokens - initialBudget.tokens, reservedOrSettledUsd: usd, submittedWords, usdPer1000SuccessfulWords: submittedWords ? usd / submittedWords * 1000 : null, note: 'Failed calls retain full reservations; reconcile pending usage before interpreting this as final billed cost.' });
    }
    await writeJson(out, run);
    console.log(JSON.stringify({ complete: run.complete, examples: run.results.length, failures: run.results.filter(r => r.status === 'failed').length, out }, null, 2));
  } finally { await budget?.close(); }
}
const format = n => n == null ? 'N/A' : n.toFixed(3);
if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
