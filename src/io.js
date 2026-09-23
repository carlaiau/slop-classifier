import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

export const digest = value => {
  const hash = createHash('sha256');
  if (Array.isArray(value)) {
    hash.update('['); value.forEach((row, i) => { if (i) hash.update(','); hash.update(JSON.stringify(row) ?? 'null'); }); hash.update(']');
  } else hash.update(typeof value === 'string' ? value : JSON.stringify(value));
  return hash.digest('hex');
};
export const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
export async function writeJson(path, value, exclusive = false) {
  await mkdir(dirname(path), { recursive: true });
  const body = JSON.stringify(value, null, 2) + '\n';
  if (exclusive) return writeFile(path, body, { flag: 'wx', mode: 0o600 });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, body, { mode: 0o600 });
  await rename(temp, path);
}
export async function readJsonl(path) {
  const rows = [], input = createReadStream(path, { encoding: 'utf8' });
  const lines = createInterface({ input, crlfDelay: Infinity }); let i = 0;
  // Forward stream errors to the iterator, including a missing file.
  input.on('error', error => lines.close());
  for await (const line of lines) { i++; if (!line) continue; try { rows.push(JSON.parse(line)); } catch { input.destroy(); throw new Error(`Invalid JSONL line ${i}`); } }
  if (input.errored) throw input.errored;
  return rows;
}
export async function writeJsonl(path, rows) {
  await mkdir(dirname(path), { recursive: true });
  const { open } = await import('node:fs/promises'); const file = await open(path, 'w', 0o600);
  try { for (let i=0; i<rows.length; i+=100) await file.write(rows.slice(i,i+100).map(r => JSON.stringify(r)).join('\n') + '\n'); }
  finally { await file.close(); }
}
export function invariant(condition, message) { if (!condition) throw new Error(message); }
export function seeded(seed = 23092026) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
