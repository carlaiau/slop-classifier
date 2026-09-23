import { parseArgs } from 'node:util';
import { readJson, writeJson, invariant, digest } from '../src/io.js';

const { positionals, values: args } = parseArgs({ allowPositionals: true, options: { passages: { type: 'string' }, responses: { type: 'string' }, release: { type: 'string' }, out: { type: 'string' } } });
const command = positionals[0];
invariant(args.out, '--out is required');
if (command === 'assign') {
  const release = await readJson(args.release);
  invariant(release.kind === 'pilot-release' && release.technicalGates === 'pass' && !release.synthetic, 'Participant assignments require a real passing technical release');
  const passages = await readJson(args.passages);
  invariant(passages.length >= 12 && passages.every(p => p.id && p.pair && p.provenance && ['human', 'generated', 'mixed'].includes(p.authorship) && Array.isArray(p.sentences) && p.sentences.every(s => s.id && [0, 1].includes(s.label))), 'Provide 12 provenance-backed, sentence-labeled matched passages');
  const pairs = [...new Set(passages.map(p => p.pair))].sort();
  invariant(pairs.length === 6 && pairs.every(pair => passages.filter(p => p.pair === pair).length === 2), 'Exactly six matched pairs required');
  invariant(passages.some(p => p.detectorError === true), 'Include deliberately selected detector errors');
  const assignments = Array.from({ length: 12 }, (_, participant) => ({ participantId: `P${String(participant + 1).padStart(2, '0')}`, tasks: pairs.map((pair, i) => {
    const pairPassages = passages.filter(p => p.pair === pair).sort((a, b) => a.id.localeCompare(b.id));
    return { passageId: pairPassages[(participant + i) % 2].id, condition: (Math.floor(participant / 2) + i) % 2 ? 'highlighted' : 'plain', position: i + 1 };
  }).sort((a, b) => ((a.position - 1 + participant) % 6) - ((b.position - 1 + participant) % 6)).map((t, i) => ({ ...t, position: i + 1 })) }));
  await writeJson(args.out, { releaseDigest: digest(release), passagesDigest: digest(passages), assignments, results: 'not-collected' }, true);
} else if (command === 'summarize') {
  const study = await readJson(args.responses);
  invariant(study.length === 12 && new Set(study.map(r => r.participantId)).size === 12, 'Exactly 12 distinct completed participants required');
  invariant(study.every(r => typeof r.unhighlightedNotVerified === 'boolean' && typeof r.highlightNotProof === 'boolean' && Array.isArray(r.tasks) && r.tasks.length === 6), 'Incomplete comprehension/tasks');
  const passes = study.filter(r => r.unhighlightedNotVerified && r.highlightNotProof).length;
  const conditions = {};
  for (const condition of ['plain', 'highlighted']) {
    const tasks = study.flatMap(p => p.tasks.filter(t => t.condition === condition));
    invariant(tasks.length === 36 && tasks.every(t => Number.isFinite(t.elapsedMs) && t.elapsedMs >= 0 && typeof t.comprehensionCorrect === 'boolean' && Array.isArray(t.judgments) && t.judgments.every(j => [0, 1].includes(j.gold) && [0, 1].includes(j.predicted) && Number.isFinite(j.confidence) && j.confidence >= 0 && j.confidence <= 1)), 'Invalid task measurements');
    const judgments = tasks.flatMap(t => t.judgments);
    conditions[condition] = { tasks: tasks.length, meanTaskMs: tasks.reduce((s, t) => s + t.elapsedMs, 0) / tasks.length,
      comprehension: tasks.filter(t => t.comprehensionCorrect).length / tasks.length,
      localizationAccuracy: judgments.length ? judgments.filter(j => j.gold === j.predicted).length / judgments.length : null,
      confidentFalseAccusations: judgments.filter(j => j.gold === 0 && j.predicted === 1 && j.confidence >= 0.8).length };
  }
  await writeJson(args.out, { participants: 12, comprehensionPasses: passes, comprehensionGate: passes >= 10 ? 'pass' : 'fail', conditions,
    decision: passes >= 10 && conditions.highlighted.confidentFalseAccusations === 0 ? 'formative-comprehension-pass' : 'review-required',
    limitation: 'Formative, counterbalanced usability evidence; not a powered efficacy claim. Inspect every confident mistake before expansion.' }, true);
} else throw new Error('Use assign or summarize');
