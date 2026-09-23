import { open, unlink, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { readJson, writeJson, invariant } from './io.js';

/** Single-process, durable ledger. Exclusive lifetime lock rejects all other owners.
 * A crash leaves a lock for explicit operator reconciliation; never fail open. */
export async function openBudget(path, limits) {
  for (const k of ['usd', 'requests', 'tokens']) invariant(Number.isFinite(limits[k]) && limits[k] > 0, `Explicit positive ${k} budget required`);
  invariant(limits.usd <= 25, 'This protocol caps total inference at US$25');
  await mkdir(dirname(path), { recursive: true });
  const lock = await open(`${path}.lock`, 'wx', 0o600);
  let state;
  try {
    try { state = await readJson(path); } catch (e) { if (e.code !== 'ENOENT') throw e; state = { version: 1, requests: 0, tokens: 0, usd: 0, next: 0, pending: {} }; }
    invariant(state.version === 1 && ['requests', 'tokens', 'usd', 'next'].every(k => Number.isFinite(state[k]) && state[k] >= 0) && state.pending && typeof state.pending === 'object', 'Corrupt budget ledger');
  } catch (e) { await lock.close(); await unlink(`${path}.lock`); throw e; }
  let queue = Promise.resolve(), broken = false;
  const transaction = fn => {
    const promise = queue.then(async () => { invariant(!broken, 'Budget persistence failed; inference disabled'); return fn(); });
    queue = promise.catch(() => {}); return promise;
  };
  const persist = async next => { try { await writeJson(path, next); state = next; } catch (e) { broken = true; throw e; } };
  return {
    reserve: () => transaction(async () => {
      const tokens = 64000, usd = tokens * 0.042 / 1e6;
      invariant(state.requests + 1 <= limits.requests && state.tokens + tokens <= limits.tokens && state.usd + usd <= limits.usd, 'Research budget exhausted');
      const id = String(state.next);
      await persist({ ...state, next: state.next + 1, requests: state.requests + 1, tokens: state.tokens + tokens, usd: state.usd + usd, pending: { ...state.pending, [id]: tokens } }); return id;
    }),
    settle: (id, tokens) => transaction(async () => {
      invariant(state.pending[id] === 64000 && Number.isInteger(tokens) && tokens >= 0 && tokens <= 64000, 'Invalid budget settlement');
      const pending = { ...state.pending }; delete pending[id];
      await persist({ ...state, pending, tokens: state.tokens - 64000 + tokens, usd: state.usd - (64000 - tokens) * 0.042 / 1e6 });
    }),
    snapshot: () => structuredClone(state),
    close: async () => { await queue; await lock.close(); await unlink(`${path}.lock`); }
  };
}
