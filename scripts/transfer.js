import { parseArgs } from 'node:util';
import { readJson, writeJson, digest, invariant } from '../src/io.js';
const { values: args } = parseArgs({ options: { input: { type: 'string' }, out: { type: 'string' } } });
const docs = await readJson(args.input);
invariant(docs.length === 100, 'Independent transfer requires 100 human documents');
invariant(new Set(docs.map(d => d.id)).size === 100, 'Duplicate transfer IDs');
const counts = {};
for (const d of docs) {
  invariant(d.text && d.provenance?.uri && d.provenance?.humanEvidence && d.provenance?.permission && d.topicBrief && d.authorId, 'Missing human provenance, permission, author identity or topic brief');
  invariant(['articles', 'essays', 'informational'].includes(d.genre), 'Unknown transfer genre');
  counts[d.genre] = (counts[d.genre] ?? 0) + 1;
  invariant(d.topicBrief !== d.text && !d.topicBrief.includes(d.text.slice(0, 120)), 'Topic brief must not copy the human document');
}
invariant(Object.values(counts).every(n => n >= 33 && n <= 34), 'Balance genres 34/33/33');
const prompts = docs.flatMap(d => ['gpt-5.4-nano', 'qwen3-8b'].map(generator => ({
  id: `${d.id}:${generator}`, sourceId: d.id, generator, topicBrief: d.topicBrief,
  prompt: `Write an English ${d.genre === 'articles' ? 'article' : d.genre === 'essays' ? 'essay' : 'informational passage'} on this topic: ${d.topicBrief}. Aim for ${Math.round(d.text.split(/\s+/).length / 50) * 50} words.`,
  settings: { temperature: 0.7, maxOutputTokens: 2048 }, status: 'not-generated'
})));
await writeJson(args.out, { kind: 'independent-transfer-generation-manifest', humanDigest: digest(docs), counts, prompts, execution: 'No provider calls made. Pin exact resolved generator versions, pricing and generation budget before execution; retain all failures.' }, true);
