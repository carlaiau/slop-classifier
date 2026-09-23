import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';

export const digest = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
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
  return (await readFile(path, 'utf8')).split('\n').filter(Boolean).map((line, i) => {
    try { return JSON.parse(line); } catch { throw new Error(`Invalid JSONL line ${i + 1}`); }
  });
}
export async function writeJsonl(path, rows) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, rows.map(r => JSON.stringify(r)).join('\n') + '\n', { mode: 0o600 });
}
export function invariant(condition, message) { if (!condition) throw new Error(message); }
export function seeded(seed = 23092026) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
