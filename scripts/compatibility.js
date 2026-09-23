// Small, non-evaluative paid check of the exact shared scorer and provider contract.
import { openBudget } from '../src/budget.js';
import { createProvider, scoreSentence, MODEL } from '../src/scoring.js';
import { writeJson, invariant } from '../src/io.js';
import { access } from 'node:fs/promises';
const date = new Date().toISOString().slice(0, 10);
invariant(process.env.PRICE_VERIFIED_DATE === date, 'Verify provider price today');
const out = 'data/feasibility/provider-compatibility.json';
try { await access(out); throw new Error('Compatibility artifact already exists; inspect it before rerunning'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const budget = await openBudget('data/budget.json', { usd: 25, requests: 10000, tokens: 10000000 });
const initial = budget.snapshot(), checks = [];
try {
  const provider = await createProvider(budget);
  const text = 'The afternoon train arrived at the station while several passengers waited beside the ticket office.';
  for (const method of ['sentence', 'prefix-mean', 'combined']) {
    const started = performance.now();
    try {
      const result = await scoreSentence({ id: 'compatibility-only', text, start: 0, end: text.length, preceding: '' }, { method, provider });
      checks.push({ method, status: result.status, model: result.model, elapsedMs: performance.now() - started, scoringVersion: result.scoringVersion });
    } catch (error) {
      checks.push({ method, status: 'failed', elapsedMs: performance.now() - started, errorType: error.name, httpStatus: error.status ?? null });
      break;
    }
  }
  const current = budget.snapshot();
  const report = { date, purpose: 'API compatibility only; authored fixture has no provenance label and scores are not reported as detection evidence', requestedModel: MODEL, checks,
    requests: current.requests - initial.requests, reservedOrSettledTokens: current.tokens - initial.tokens, reservedOrSettledUsd: current.usd - initial.usd, pendingReservations: Object.keys(current.pending).length };
  await writeJson(out, report, true); console.log(JSON.stringify(report, null, 2));
} finally { await budget.close(); }
