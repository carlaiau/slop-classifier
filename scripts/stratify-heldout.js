// Prospective correction based only on generator coverage, never detector outcomes.
import { readdir, mkdir, rename } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { readJson, readJsonl, writeJson, digest, invariant } from '../src/io.js';
const old = await readJson('data/prepared/manifest.json');
invariant(!(await readdir('data/prepared')).some(name=>name.includes('test-opened')), 'Cannot resample after test opening');
const seeds = await readJsonl('data/imported/source-audit.jsonl');
const audit = await readJson('data/imported/source-audit.audit.json');
invariant(old.importAuditDigest === digest(audit), 'Full source audit changed');
const qwen = new Set(seeds.filter(r=>r.generator==='qwen3-8b').map(r=>r.sourceId));
const manifest = structuredClone(old); manifest.ids = old.ids.filter(([,split])=>split!=='test');
const coverage = {};
for (const domain of ['abstracts','essays','news','reports']) {
  const eligible=old.audit.sources.filter(s=>s.split==='test'&&s.domain===domain);
  const mandatory=eligible.filter(s=>qwen.has(s.id));
  invariant(mandatory.length<=100, 'Qwen stratum exceeds domain quota; revise protocol explicitly');
  const remaining=eligible.filter(s=>!qwen.has(s.id)).sort((a,b)=>digest(`23092026:${a.id}`).localeCompare(digest(`23092026:${b.id}`)));
  const chosen=[...mandatory,...remaining.slice(0,100-mandatory.length)];
  invariant(chosen.length===100, 'Test domain shortfall');
  manifest.ids.push(...chosen.map(s=>[s.id,'test'])); coverage[domain]=mandatory.length;
}
manifest.ids.sort(); manifest.version=2; manifest.createdAt=new Date().toISOString();
manifest.testSampling={policy:'Include all eligible Qwen3-8B sources, then deterministic hash fill within each official test domain to 100 sources',qwenSourcesByDomain:coverage,reason:'Avoid an a-priori impossible held-out FPR interval gate from only 23 randomly selected source clusters',beforeTestInference:true,previousManifestDigest:digest(old)};
const archive='data/preparation-v1-unstratified'; await mkdir(archive,{recursive:false});
for(const name of ['prepared','selection']) await rename(`data/${name}`,`${archive}/${name}`);
for(const name of ['selected.jsonl','selected.audit.json']) await rename(`data/imported/${name}`,`${archive}/${name}`);
await writeJson('data/selection/manifest.json',manifest,true);
const inputs=[];
for(const split of ['train','dev','test'])for(const name of(await readdir(`data/raw/default/${split}`)).sort())if(name.endsWith('.csv'))inputs.push(`data/raw/default/${split}/${name}`);
const expanded=spawnSync('python3',['scripts/import_opai.py','--input',...inputs,'--source-manifest','data/selection/manifest.json','--out','data/imported/selected.jsonl'],{stdio:'inherit'});
invariant(expanded.status===0,'Expansion failed; retain archived selection');
const finalized=spawnSync(process.execPath,['--max-old-space-size=4096','scripts/prepare-corpus.js','--finish-existing-selection'],{stdio:'inherit'});
invariant(finalized.status===0,'Finalize the existing selection before inference');
console.log(JSON.stringify({heldOutStratification:coverage,developmentUnchanged:true,calibrationUnchanged:true}));
