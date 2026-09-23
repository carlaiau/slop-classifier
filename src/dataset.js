import { digest, invariant } from './io.js';

const mapping = { train: 'development', dev: 'calibration', test: 'test' };
const domains = ['abstracts', 'essays', 'news', 'reports'];
const normalize = text => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const shingles = text => { const t = normalize(text).split(' '); return new Set(t.length < 5 ? [t.join(' ')] : t.slice(0, -4).map((_, i) => t.slice(i, i + 5).join(' '))); };
export function auditDataset(rows, quarantined = []) {
  invariant(rows.length > 0, 'Empty dataset');
  const ids = new Set(), sources = new Map(), authors = new Map(), hashes = new Map();
  const exclude = new Set(quarantined), issues = [];
  for (const r of rows) {
    invariant(typeof r.id === 'string' && !ids.has(r.id), 'Missing or duplicate example ID'); ids.add(r.id);
    invariant(typeof r.sourceId === 'string' && typeof r.sourceHash === 'string' && r.sourceHash.length === 64 && typeof r.provenance === 'string' && r.provenance, 'Missing provenance/source identity');
    invariant(mapping[r.officialSplit] && domains.includes(r.domain), 'Unknown split/domain');
    invariant(r.label === 0 || r.label === 1, 'Gold labels must be binary');
    invariant(typeof r.text === 'string' && typeof r.preceding === 'string' && Number.isInteger(r.start) && r.start >= 0 && r.end - r.start === r.text.length, 'Invalid UTF-16 offsets');
    invariant(r.version !== 'v0' || r.label === 0, 'Human-only row has positive label');
    invariant(r.generator !== 'qwen3-8b' || r.officialSplit === 'test', 'Held-out generator leaked');
    const source = sources.get(r.sourceId) ?? { id: r.sourceId, split: mapping[r.officialSplit], domain: r.domain, hash: r.sourceHash, seed: new Map() };
    invariant(source.split === mapping[r.officialSplit] && source.domain === r.domain && source.hash === r.sourceHash, 'Source crosses splits/domains or has inconsistent seed');
    if (r.version === 'v0') source.seed.set(r.start, r.text);
    sources.set(r.sourceId, source);
    if (r.authorId) { invariant(!authors.has(r.authorId) || authors.get(r.authorId) === source.split, 'Author crosses partitions'); authors.set(r.authorId, source.split); }
    if (hashes.has(r.sourceHash) && hashes.get(r.sourceHash).split !== source.split) throw new Error('Duplicate human source crosses partitions');
    hashes.set(r.sourceHash, source);
  }
  // Exact duplicate sources inside a split retain one source identity, never double weight.
  const sorted = [...sources.values()].sort((a, b) => a.id.localeCompare(b.id));
  const hashOwner = new Map();
  for (const s of sorted) {
    invariant(s.seed.size > 0, 'Source missing human seed');
    if (hashOwner.has(s.hash)) { exclude.add(s.id); issues.push({ kind: 'duplicate-source', source: s.id, retained: hashOwner.get(s.hash) }); }
    else hashOwner.set(s.hash, s.id);
  }
  // Shared shingle index enumerates every pair that could have nonzero Jaccard similarity.
  const index = new Map(), sets = new Map();
  for (const s of sorted) {
    if (exclude.has(s.id)) continue;
    const set = shingles([...s.seed].sort((a, b) => a[0] - b[0]).map(([, t]) => t).join(' '));
    const candidates = new Set(); for (const sh of set) for (const id of index.get(sh) ?? []) candidates.add(id);
    for (const id of candidates) {
      const other = sets.get(id); let intersection = 0;
      for (const sh of set) if (other.has(sh)) intersection++;
      const similarity = intersection / (set.size + other.size - intersection);
      if (similarity >= 0.85) {
        invariant(sources.get(id).split === s.split, `Near-duplicate sources cross partitions: ${id}, ${s.id}`);
        exclude.add(s.id); issues.push({ kind: 'near-duplicate', source: s.id, retained: id, similarity }); break;
      }
    }
    if (!exclude.has(s.id)) { sets.set(s.id, set); for (const sh of set) { const v = index.get(sh) ?? []; v.push(s.id); index.set(sh, v); } }
  }
  return { sources: sorted.filter(s => !exclude.has(s.id)).map(({ seed, ...s }) => s), excluded: [...exclude], issues, examples: rows.length,
    authorGrouping: authors.size ? 'available IDs checked; missing IDs remain unverified' : 'unavailable', synthetic: rows.some(r => r.synthetic) };
}
export function prepare(rows, sizes = { development: 100, calibration: 200, test: 400 }, quarantined = []) {
  const audit = auditDataset(rows, quarantined), selected = new Map(), counts = {};
  for (const [split, size] of Object.entries(sizes)) for (const domain of domains) {
    const eligible = audit.sources.filter(s => s.split === split && s.domain === domain).sort((a, b) => digest(`23092026:${a.id}`).localeCompare(digest(`23092026:${b.id}`)));
    const sample = eligible.slice(0, Math.floor(size / domains.length));
    sample.forEach(s => selected.set(s.id, split)); counts[`${split}:${domain}`] = { requested: Math.floor(size / domains.length), available: eligible.length, selected: sample.length };
  }
  const examples = rows.filter(r => selected.has(r.sourceId)).map(r => ({ ...r, split: selected.get(r.sourceId) }));
  // Deduplicate identical v0 examples across generators without changing mixed-row provenance.
  // Keep per-generator records for subgroup metrics, but weight overall analysis via canonical v0 below in CLI.
  const manifest = { version: 1, seed: 23092026, ids: [...selected].sort(), counts, audit, dataDigest: digest(examples), exampleIdsDigest: digest(examples.map(r => r.id).sort()), createdAt: new Date().toISOString() };
  return { examples, manifest };
}
