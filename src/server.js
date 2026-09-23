import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { readJson, digest, invariant } from './io.js';
import { segment, insufficient } from './text.js';
import { scoreBatch, estimate, createProvider, scoringIdentity } from './scoring.js';
import { openBudget } from './budget.js';

const MAX_CHARS = 50000, SESSION_TTL = 30 * 60 * 1000;
const assets = { '/': ['public/index.html', 'text/html'], '/app.js': ['public/app.js', 'text/javascript'], '/style.css': ['public/style.css', 'text/css'] };
const token = () => randomBytes(32).toString('hex');
async function body(req) {
  let data = ''; for await (const chunk of req) { data += chunk; if (Buffer.byteLength(data) > 250000) throw new Error('Text exceeds the request limit'); }
  return JSON.parse(data);
}
function validateText(text) { invariant(typeof text === 'string' && text.trim() && text.length <= MAX_CHARS, `Paste between 1 and ${MAX_CHARS.toLocaleString()} characters`); }

export function buildServer({ release = null, provider = null, clock = Date.now, researchOnly = false, exploratory = false } = {}) {
  const sessions = new Map(), rate = new Map(); let active = 0, requestSequence = 0;
  const live = Boolean(release && provider), method = release?.method ?? 'sentence';
  const identity = live ? release.scoringVersion : 'simulated-ui-v1';
  const runtime = release?.runtime ?? { batch: 4, concurrency: 3 };
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const send = (code, data) => { if (!res.destroyed) { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); } };
    try {
      const expectedHost = `127.0.0.1:${server.address().port}`;
      if (req.headers.host !== expectedHost && req.headers.host !== `localhost:${server.address().port}`) return send(403, { error: 'Local access only' });
      const path = new URL(req.url, `http://${expectedHost}`).pathname;
      if (req.method === 'GET' && assets[path]) { const [file, type] = assets[path]; res.writeHead(200, { 'Content-Type': type }); res.end(await readFile(new URL(`../${file}`, import.meta.url))); return; }
      if (req.method === 'GET' && path === '/api/config') return send(200, { mode: live ? 'live' : 'demo', researchOnly, exploratory, method,
        scoreKind: exploratory ? 'raw-prefix-mean' : live ? 'calibrated' : 'simulated',
        maxChars: MAX_CHARS, scoringVersion: identity, threshold: release?.threshold ?? 0.65, runtime,
        validated: live && !researchOnly && !exploratory, sessionMinutes: 30 });
      if (req.method !== 'POST') return send(404, { error: 'Not found' });
      if (req.headers.origin !== `http://${req.headers.host}` || !req.headers['content-type']?.startsWith('application/json')) return send(403, { error: 'Same-origin JSON request required' });
      const now = clock(), ip = req.socket.remoteAddress;
      for (const [key, value] of sessions) if (value.expires < now) sessions.delete(key);
      for (const [key, value] of rate) if (value.reset < now) rate.delete(key);
      const bucket = rate.get(ip) ?? { n: 0, reset: now + 60000 };
      if (++bucket.n > 120) { res.setHeader('Retry-After', '60'); return send(429, { error: 'Request limit reached. Wait a minute and retry.' }); }
      rate.set(ip, bucket);
      if (path === '/api/session') {
        if (sessions.size >= 100) return send(503, { error: 'Session capacity reached' });
        const key = token(); sessions.set(key, { expires: now + SESSION_TTL, requests: 0, cache: new Map(), inflight: new Map(), salt: token() });
        res.setHeader('Set-Cookie', `jev_session=${key}; HttpOnly; SameSite=Strict; Path=/; Max-Age=1800`);
        return send(200, { ready: true });
      }
      const key = req.headers.cookie?.match(/(?:^|;\s*)jev_session=([a-f0-9]{64})(?:;|$)/)?.[1], session = sessions.get(key);
      if (!session) return send(401, { error: 'Session expired. Start a new reading session.' });
      if (path === '/api/clear') { sessions.delete(key); return send(200, { cleared: true }); }
      const input = await body(req); validateText(input.text);
      const sentences = segment(input.text);
      if (path === '/api/plan') return send(200, { sentences, estimate: estimate(sentences, method), mode: live ? 'live' : 'demo' });
      if (path !== '/api/score') return send(404, { error: 'Not found' });
      invariant(Array.isArray(input.ids) && input.ids.length > 0 && input.ids.length <= 8 && new Set(input.ids).size === input.ids.length, 'Invalid sentence batch');
      const targets = input.ids.map(id => sentences.find(s => s.id === id)); invariant(targets.every(Boolean), 'Unknown sentence ID');
      const cacheKeys = targets.map(s => digest({ salt: session.salt, identity, target: s.text, prefix: s.preceding, start: s.start, end: s.end }));
      const missing = targets.filter((_, i) => !session.cache.has(cacheKeys[i]));
      if (!missing.length) return send(200, { results: targets.map((s, i) => ({ ...session.cache.get(cacheKeys[i]), id: s.id, cached: true })), mode: live ? 'live' : 'demo', apiMs: 0 });
      // One global cap for the sole local process; budget lock prevents a second live owner.
      if (active >= 6) return send(429, { error: 'Analysis is busy. Retry the visible sentences.' });
      if (session.requests + missing.length > 300) return send(429, { error: 'This session has reached its 300-sentence analysis limit.' });
      if (cacheKeys.some(k => session.inflight.has(k))) return send(429, { error: 'These sentences are already being analyzed.' });
      const serverState = requestSequence++ === 0 ? 'cold-first-request' : 'warm';
      active++; session.requests += missing.length; cacheKeys.forEach(k => session.inflight.set(k, true));
      const began = performance.now();
      try {
        let results;
        if (live) results = await scoreBatch(missing, { method, calibration: release.calibration, provider });
        else {
          await new Promise(resolve => setTimeout(resolve, 160));
          results = missing.map(s => {
            const reason = insufficient(s.text), raw = Number.parseInt(createHash('sha256').update(s.id).digest('hex').slice(0, 4), 16) / 65535;
            return { id: s.id, start: s.start, end: s.end, status: reason ? 'insufficient' : 'scored', reason, raw: reason ? null : raw, calibrated: null, displayScore: reason ? null : raw, scoringVersion: identity, model: 'simulation' };
          });
        }
        for (const r of results) { const i = targets.findIndex(s => s.id === r.id); session.cache.set(cacheKeys[i], r); }
        return send(200, { results: targets.map((s, i) => ({ ...session.cache.get(cacheKeys[i]), id: s.id, cached: !missing.some(m => m.id === s.id) })), mode: live ? 'live' : 'demo', serverState, apiMs: performance.now() - began });
      } finally { active--; cacheKeys.forEach(k => session.inflight.delete(k)); }
    } catch (error) {
      const safe = ['Paste ', 'Text exceeds', 'Invalid sentence', 'Unknown sentence', 'Research budget', 'Budget persistence'].some(s => error.message.startsWith(s));
      send(400, { error: safe ? error.message : 'Analysis unavailable. Check the local configuration and retry.' });
    }
  });
  const prune = setInterval(() => { const now = clock(); for (const [id, session] of sessions) if (session.expires < now) sessions.delete(id); }, 30000);
  prune.unref(); server.on('close', () => clearInterval(prune));
  server.requestTimeout = 20000; server.headersTimeout = 10000;
  return server;
}
export async function start() {
  let budget, release = null, provider = null;
  const exploratory = process.env.ENABLE_LIVE === 'explore-prefix';
  const researchOnly = process.env.ENABLE_LIVE === 'research' || exploratory;
  if (process.env.ENABLE_LIVE === '1' || researchOnly) {
    if (exploratory) {
      release = { kind: 'local-exploration', method: 'prefix-mean', calibration: null,
        threshold: 0.38, scoringVersion: scoringIdentity('prefix-mean'), runtime: { batch: 4, concurrency: 3 }, synthetic: false };
    } else {
      release = await readJson(process.env.RELEASE_FILE ?? '');
      invariant(!release.synthetic && (researchOnly ? release.kind === 'locked-specification' : release.kind === 'pilot-release' && release.technicalGates === 'pass'), 'A real frozen specification (research) or passing pilot release is required');
      invariant(['sentence', 'sentence-context'].includes(release.method) && release.scoringVersion === scoringIdentity(release.method, release.calibration), 'Release scoring identity mismatch');
    }
    if (researchOnly && !exploratory) {
      const batch = Number(process.env.RESEARCH_BATCH ?? release.runtime.batch), concurrency = Number(process.env.RESEARCH_CONCURRENCY ?? release.runtime.concurrency);
      invariant([1, 4, 8].includes(batch) && [1, 3, 6].includes(concurrency), 'Unsupported profiling configuration');
      release = { ...release, runtime: { batch, concurrency } };
    }
    invariant(process.env.PRICE_VERIFIED_DATE === new Date().toISOString().slice(0, 10), 'Reverify provider price today and set PRICE_VERIFIED_DATE');
    budget = await openBudget('data/budget.json', { usd: Number(process.env.BUDGET_USD), requests: Number(process.env.MAX_REQUESTS), tokens: Number(process.env.MAX_INPUT_TOKENS) });
    try { provider = await createProvider(budget); } catch (e) { await budget.close(); throw e; }
  }
  const server = buildServer({ release, provider, researchOnly, exploratory }), port = Number(process.env.PORT ?? 3102);
  server.listen(port, '127.0.0.1', () => console.log(`Reader: http://127.0.0.1:${server.address().port} (${exploratory ? 'experimental live prefix-mean' : release ? researchOnly ? 'live research' : 'live pilot' : 'simulated scores; no inference'})`));
  const close = () => server.close(async () => { await budget?.close(); process.exit(0); });
  process.on('SIGINT', close); process.on('SIGTERM', close);
  server.on('error', async error => { console.error(error.message); await budget?.close(); process.exitCode = 1; });
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) start().catch(e => { console.error(e.message); process.exitCode = 1; });
