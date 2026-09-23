import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { digest, readJsonl, writeJsonl } from '../src/io.js';

test('streamed array digest preserves existing frozen JSON hashes', () => {
  const rows = [{ text: 'Unicode 🦊\nline', n: 0 }, { nested: [null, true, 1.5], missing: undefined }];
  assert.equal(digest(rows), createHash('sha256').update(JSON.stringify(rows)).digest('hex'));
  assert.equal(digest([]), createHash('sha256').update('[]').digest('hex'));
});
test('streamed JSONL round-trips and fails on missing or malformed data', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jev-jsonl-'));
  try {
    const path=join(dir,'rows.jsonl'), rows=[{text:'🦊\noriginal'}, {id:2}];
    await writeJsonl(path,rows); assert.deepEqual(await readJsonl(path),rows);
    await writeFile(path,'{"id":1}\n\nmalformed\n');
    await assert.rejects(readJsonl(path), /Invalid JSONL line 3/);
    await assert.rejects(readJsonl(join(dir,'missing.jsonl')), {code:'ENOENT'});
  } finally {await rm(dir,{recursive:true,force:true});}
});
