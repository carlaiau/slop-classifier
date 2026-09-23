import test from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../src/server.js';

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
