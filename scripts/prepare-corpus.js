// Full-corpus audit first; expand sentence records only for the selected sources.
import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { prepare } from '../src/dataset.js';
import { readJson, readJsonl, writeJson, digest, invariant } from '../src/io.js';
const sourcePath = 'data/imported/source-audit.jsonl';
const audit = await readJson('data/imported/source-audit.audit.json');
invariant(audit.auditOnly && audit.shards.length === 40, 'All 40 pinned shards must be audited first');
const seeds = await readJsonl(sourcePath);
invariant(seeds.every(r => r.auditOnly), 'Compact source units expected');
const quarantined = new Set(audit.quarantinedSourceShards.map(r => r.sourceId)), leakage = [];
const hashes = new Map();
for (const row of seeds) { const cluster = hashes.get(row.sourceHash) ?? new Map(); cluster.set(row.sourceId, row.officialSplit); hashes.set(row.sourceHash, cluster); }
for (const [hash, sources] of hashes) if (new Set(sources.values()).size > 1) {
  const sourceIds = [...sources.keys()]; sourceIds.forEach(id => quarantined.add(id)); leakage.push({ kind: 'cross-partition-exact', hash, sourceIds });
}
let manifest = process.argv.includes('--finish-existing-selection') ? await readJson('data/selection/manifest.json') : null;
if (!manifest) {
while (!manifest) {
  try { ({ manifest } = prepare(seeds.filter(r => !quarantined.has(r.sourceId)), undefined, [...quarantined])); }
  catch (error) {
    if (!error.sourceIds) throw error;
    error.sourceIds.forEach(id => quarantined.add(id));
    leakage.push({ kind: 'cross-partition-near', sourceIds: error.sourceIds, similarity: error.similarity });
    console.log(JSON.stringify({ quarantinedCrossPartitionPair: true, similarity: error.similarity }));
  }
}
manifest.audit.crossPartitionQuarantine = leakage;
await writeJson('data/imported/leakage-quarantine.json', { policy: 'Exclude every detected cross-partition duplicate source before deterministic sampling; never move partitions', leakage, excludedSourceIds: [...quarantined] }, true);
await writeJson('data/selection/manifest.json', manifest, true);
}
const inputs = [];
for (const split of ['train', 'dev', 'test']) for (const name of (await readdir(`data/raw/default/${split}`)).sort()) if (name.endsWith('.csv')) inputs.push(`data/raw/default/${split}/${name}`);
if (!process.argv.includes('--finish-existing-selection')) {
  const imported = spawnSync('python3', ['scripts/import_opai.py', '--input', ...inputs, '--source-manifest', 'data/selection/manifest.json', '--out', 'data/imported/selected.jsonl'], { stdio: 'inherit' });
  invariant(imported.status === 0, 'Selected source expansion failed');
}
const selectionAudit = await readJson('data/imported/selected.audit.json');
invariant(selectionAudit.quarantinedSourceShards.length === 0, 'Selected expansion found a new quarantine');
invariant(digest(selectionAudit.shards.map(s=>s.sha256).sort()) === digest(audit.shards.map(s=>s.sha256).sort()), 'Expansion and full audit shards differ');
const mapping = new Map(manifest.ids);
const rows = (await readJsonl('data/imported/selected.jsonl')).map(r => ({ ...r, split: mapping.get(r.sourceId) }));
invariant(rows.every(r => r.split && !r.auditOnly), 'Unexpected selected source');
invariant(new Set(rows.map(r => r.id)).size === rows.length, 'Duplicate example IDs');
manifest.dataDigest = digest(rows); manifest.exampleIdsDigest = digest(rows.map(r => r.id).sort());
manifest.importAuditDigest = digest(audit); manifest.selectionAuditDigest = digest(selectionAudit);
manifest.audit.examples = rows.length; manifest.audit.sourceAuditUnits = seeds.length;
const { writeJsonl } = await import('../src/io.js');
await writeJsonl('data/prepared/examples.jsonl', rows);
await writeJson('data/prepared/manifest.json', manifest, true);
console.log(JSON.stringify({ sources: manifest.ids.length, examples: rows.length, counts: manifest.counts }, null, 2));
