import test from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../src/server.js';
import { scoringIdentity } from '../src/scoring.js';

test('local API requires same-origin session, retains score-only cache, rejects bad offsets/IDs', async () => {
  const server = buildServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`; let cookie = '';
  const post = (path, data, extra = {}) => fetch(`${origin}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: cookie, ...extra }, body: JSON.stringify(data) });
  try {
    assert.equal((await post('/api/session', {}, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await post('/api/plan', { text: 'Hello' })).status, 401);
    const session = await post('/api/session', {}); cookie = session.headers.get('set-cookie').split(';')[0];
    const text = 'A long sentence gives this software test enough words to analyze safely.';
    const plan = await (await post('/api/plan', { text })).json(); assert.equal(plan.sentences.length, 1);
    assert.equal((await post('/api/score', { text, ids: ['missing'] })).status, 400);
    assert.equal((await post('/api/score', { text, ids: ['s0', 's0'] })).status, 400);
    const first = await (await post('/api/score', { text, ids: ['s0'] })).json(); assert.equal(first.results[0].cached, false); assert.equal(first.mode, 'demo'); assert.equal(first.results[0].calibrated, null);
    const second = await (await post('/api/score', { text, ids: ['s0'] })).json(); assert.equal(second.results[0].cached, true); assert.equal(second.apiMs, 0);
    await post('/api/clear', {}); assert.equal((await post('/api/score', { text, ids: ['s0'] })).status, 401);
  } finally { await new Promise(r => server.close(r)); }
});

test('local prefix exploration exposes raw word mean, caches it, and does not claim validation', async () => {
  let calls = 0;
  const provider = async request => {
    calls++;
    return { model: 'jev-1.13.0', usage: { input_tokens: 100 }, answers: Object.fromEntries(Object.keys(request.questions).map(id => [id, { type: 'noul', noul: id.endsWith('w0') ? 0.20 : 0.40 }])) };
  };
  const release = { method: 'prefix-mean', threshold: 0.38, calibration: null, scoringVersion: scoringIdentity('prefix-mean'), runtime: { batch: 4, concurrency: 3 } };
  const server = buildServer({ release, provider, researchOnly: true, exploratory: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`; let cookie = '';
  const post = (path, data) => fetch(`${origin}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: cookie }, body: JSON.stringify(data) });
  try {
    const config = await (await fetch(`${origin}/api/config`)).json();
    assert.equal(config.method, 'prefix-mean'); assert.equal(config.scoreKind, 'raw-prefix-mean'); assert.equal(config.validated, false);
    assert.equal(config.threshold, 0.38);
    const session = await post('/api/session', {}); cookie = session.headers.get('set-cookie').split(';')[0];
    const text = 'Several curious neighbors gathered around the old table to compare their carefully written notes.';
    const plan = await (await post('/api/plan', { text })).json();
    const first = await (await post('/api/score', { text, ids: [plan.sentences[0].id] })).json();
    assert.equal(first.results[0].status, 'scored'); assert.equal(first.results[0].calibrated, null);
    assert.ok(first.results[0].raw >= 0.20 && first.results[0].raw <= 0.40);
    assert.ok(first.results[0].words.length > 1);
    const before = calls;
    const second = await (await post('/api/score', { text, ids: [plan.sentences[0].id] })).json();
    assert.equal(second.results[0].cached, true); assert.equal(calls, before);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
