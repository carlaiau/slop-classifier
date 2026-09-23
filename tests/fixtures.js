import { digest } from '../src/io.js';
export function fixtureRows() {
  const rows = [];
  for (const split of ['train', 'dev', 'test']) for (const domain of ['news','essays','reports','abstracts']) for (let n = 0; n < 3; n++) {
    const sourceId = `${domain}:${split}:${n}`, sourceHash = digest(sourceId);
    const seed = Array.from({ length: 12 }, (_, i) => `word${digest(`${sourceId}:${i}`).slice(0, 8)}`).join(' ');
    for (const [version, label] of [['v0', 0], ['v4', 1]]) {
      const text = `${seed} ${label ? 'Moreover systematic comprehensive structured conclusion' : 'Yesterday walked muddy boots broken handle'}.`;
      rows.push({ id: `${sourceId}:${version}`, recordId: `${sourceId}:${version}`, sourceId, sourceHash, officialSplit: split, domain, generator: split === 'test' ? 'qwen3-8b' : 'gpt-5.4-nano', version,
        text, preceding: '', start: 0, end: text.length, label, provenance: 'synthetic-software-fixture', synthetic: true, lengthBand: 'medium' });
    }
  }
  return rows;
}
