import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../scripts/research.js';
import { fixtureRows } from './fixtures.js';
import { prepare } from '../src/dataset.js';
import { writeJson, writeJsonl } from '../src/io.js';

test('harness refuses test access without freeze and rejects dataset mutation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jev-research-'));
  try {
    const { examples, manifest } = prepare(fixtureRows());
    await writeJsonl(join(dir, 'rows.jsonl'), examples); await writeJson(join(dir, 'manifest.json'), manifest);
    const args = ['--data', join(dir, 'rows.jsonl'), '--manifest', join(dir, 'manifest.json')];
    await assert.rejects(main(['run', ...args, '--split', 'test']), /requires --freeze/);
    examples[0].label = 1; await writeJsonl(join(dir, 'rows.jsonl'), examples);
    await assert.rejects(main(['run', ...args]), /differs/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
