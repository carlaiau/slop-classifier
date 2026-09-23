// Researcher-only measurements through the real browser/server/scorer, before calibration.
import { chromium } from '@playwright/test';
import { cpus, platform, release as osRelease } from 'node:os';
import { buildServer } from '../src/server.js';
import { openBudget } from '../src/budget.js';
import { createProvider, scoringIdentity } from '../src/scoring.js';
import { readJsonl, readJson, writeJson, digest, invariant } from '../src/io.js';
import { quantile } from '../src/metrics.js';
import { access } from 'node:fs/promises';
import { parseArgs } from 'node:util';
invariant(process.env.PRICE_VERIFIED_DATE === new Date().toISOString().slice(0, 10), 'Verify provider price today');
const { values } = parseArgs({ options: { out: { type: 'string' } } });
const out = values.out ?? 'data/feasibility/live-latency-grid.json';
try { await access(out); throw new Error('Existing latency artifact; do not overwrite observations'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const seeds = await readJsonl('data/imported/source-audit.jsonl');
const passages = ['abstracts', 'essays', 'news', 'reports'].map(domain => seeds.filter(r => r.officialSplit === 'train' && r.domain === domain && r.text.length <= 50000).sort((a,b) => digest(a.sourceId).localeCompare(digest(b.sourceId)))[0]);
invariant(passages.every(Boolean), 'Four development-domain passages required');
const budget = await openBudget('data/budget.json', { usd: 25, requests: 10000, tokens: 10000000 });
const before = budget.snapshot(), sessions = [], errors = [];
let browser, server;
try {
  const provider = await createProvider(budget);
  browser = await chromium.launch({ channel: 'chrome' });
  for (const batch of [1,4,8]) for (const concurrency of [1,3,6]) {
    const spec = { method: 'sentence', calibration: null, threshold: 0.65, scoringVersion: scoringIdentity('sentence'), runtime: { batch, concurrency } };
    server = buildServer({ release: spec, provider, researchOnly: true });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    for (let i=0; i<3; i++) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', acceptDownloads: true });
      try {
        await page.goto(base);
        await page.locator('#paste').fill(passages[i].text);
        await page.getByRole('button', { name: 'Prepare reading' }).click();
        await page.getByRole('button', { name: 'Start reading', exact: true }).click();
        await page.waitForFunction(() => {
          const eligible = [...document.querySelectorAll('.sentence')].filter(el => { const r=el.getBoundingClientRect(); return r.bottom >= -160 && r.top <= innerHeight+160; });
          return eligible.length > 0 && eligible.every(el => ['scored','insufficient','failed'].includes(el.dataset.status));
        }, undefined, { timeout: 20000 });
        await page.waitForTimeout(250);
      } catch (error) { errors.push({ batch, concurrency, repetition: i, errorType: error.name }); }
      if (await page.locator('#export').isVisible()) {
        const downloadPromise = page.waitForEvent('download'); await page.locator('#export').click();
        const download = await downloadPromise;
        const path = `${out.replace(/\.json$/, '')}-sessions/b${batch}-c${concurrency}-${i}.json`;
        await download.saveAs(path);
        sessions.push({ ...(await readJson(path)), sourceId: passages[i].sourceId, feasibilityOnly: true });
      }
      await page.close();
    }
    await new Promise(resolve => server.close(resolve)); server = null;
    console.log(JSON.stringify({ completedRuntime: spec.runtime, sessions: sessions.length }));
  }
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  const after = budget.snapshot(); await budget.close();
  const summary = [];
  for (const batch of [1,4,8]) for (const concurrency of [1,3,6]) {
    const obs = sessions.filter(s => s.runtime.batch === batch && s.runtime.concurrency === concurrency).flatMap(s => s.observations);
    const completed = obs.filter(o => Number.isFinite(o.firstSentenceMs));
    summary.push({ batch, concurrency, observations: obs.length, incomplete: obs.filter(o => o.completeMs === null).length,
      p50FirstSentenceMs: quantile(completed.map(o => o.firstSentenceMs), .5), p95FirstSentenceMs: quantile(completed.map(o => o.firstSentenceMs), .95), failedBatches: obs.flatMap(o=>o.batches).filter(b=>b.failed).length });
  }
  await writeJson(out, { purpose: 'Exploratory live runtime grid; three observations per configuration, not the >=100-observation locked latency gate', feasibilityOnly: true, calibrated: false, method: 'sentence',
    environment: { os: platform(), osRelease: osRelease(), cpu: cpus()[0]?.model, browser: browser?.version(), viewport: '1440x1000', location: 'User host; Pacific/Auckland timezone', network: 'Current host connection; not controlled' },
    summary, sessions, errors, requests: after.requests-before.requests, reservedOrSettledTokens: after.tokens-before.tokens, reservedOrSettledUsd: after.usd-before.usd }, true);
  await browser?.close();
}
