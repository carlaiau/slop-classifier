// Small, matched development comparison. It cannot open or validate held-out data.
import { readJson, readJsonl, writeJson, digest, invariant } from '../src/io.js';
import { scoreBatch, createProvider, scoringIdentity } from '../src/scoring.js';
import { openBudget } from '../src/budget.js';
import { metrics } from '../src/metrics.js';
import { fitLogistic, fitTfidf, predict, vectorize } from '../src/learning.js';
import { access } from 'node:fs/promises';
const out = 'data/feasibility/development-comparison.json';
try { await access(out); throw new Error('Comparison already exists; inspect before rerunning'); } catch(e) { if(e.code!=='ENOENT') throw e; }
invariant(process.env.PRICE_VERIFIED_DATE === new Date().toISOString().slice(0,10), 'Verify provider pricing today');
const plan = await readJson('data/feasibility/comparison-plan.json');
const rows = await readJsonl('data/feasibility/comparison-examples.jsonl');
invariant(rows.every(r=>r.split==='development') && rows.length===plan.rows && new Set(rows.map(r=>r.sourceId)).size===4, 'Declared four-source development subset required');
await writeJson('data/feasibility/comparison-started.json', { planDigest:digest(plan), exampleDigest:digest(rows), startedAt:new Date().toISOString() }, true);
const budget = await openBudget('data/budget.json',{usd:25,requests:10000,tokens:10000000});
const runs=[]; let aborted=false;
try {
  const provider=await createProvider(budget);
  for(const method of plan.methods) {
    const before=budget.snapshot(), began=performance.now(), results=[];
    for(let i=0;i<rows.length;i+=24) {
      const jobs=[];
      for(let j=i;j<Math.min(i+24,rows.length);j+=8) {
        const batch=rows.slice(j,j+8);
        jobs.push((async()=>{try {
          const predictions=await scoreBatch(batch,{method,provider});
          return predictions.map((p,k)=>({...batch[k],...p}));
        } catch(error) {aborted=true;return batch.map(r=>({...r,status:'failed',raw:null,errorType:error.name,httpStatus:error.status??null}));}})());
      }
      results.push(...(await Promise.all(jobs)).flat());
      if(aborted) break;
    }
    const after=budget.snapshot();
    const run={method,split:'development',feasibilityOnly:true,complete:results.length===rows.length&&!aborted,manifestDigest:plan.manifestDigest,
      scoringVersion:scoringIdentity(method),runtime:plan.runtime,results,requests:after.requests-before.requests,inputTokens:after.tokens-before.tokens,reservedOrSettledUsd:after.usd-before.usd,wallMs:performance.now()-began};
    await writeJson(`data/feasibility/runs/${method}.json`,run,true);runs.push(run);
    console.log(JSON.stringify({method,complete:run.complete,examples:results.length,requests:run.requests,tokens:run.inputTokens,usd:run.reservedOrSettledUsd}));
    if(aborted) break;
  }
} finally {await budget.close();}
const summaries=[];
function summarize(method,predictions,note) {
  const m=metrics(predictions.map(r=>({...r,calibrated:r.raw})),0.5);
  summaries.push({method,n:m.n,scored:m.scored,coverage:m.coverage,auroc:m.auroc,auprc:m.auprc,note});
}
for(const run of runs) if(run.method!=='combined') summarize(run.method,run.results,'Uncalibrated raw-score ranking on four development sources; not a validated operating point');
const prefix=runs.find(r=>r.method==='prefix-mean');
if(prefix?.complete) summarize('prefix-upper',prefix.results.map(r=>{const v=(r.words??[]).map(w=>w.raw).sort((a,b)=>b-a).slice(0,Math.max(1,Math.ceil((r.words??[]).length/4)));return {...r,raw:v.length?v.reduce((a,b)=>a+b,0)/v.length:null};}),'Derived upper-quartile aggregate from exactly the same prefix-word judgments; no extra provider calls');
if(!aborted) for(const method of ['prior','tfidf','combined']) {
  const input=method==='combined'?runs.find(r=>r.method==='combined').results:rows;
  const predictions=[];
  for(const id of plan.sourceIds) {
    const train=input.filter(r=>r.sourceId!==id),test=input.filter(r=>r.sourceId===id);
    let score;
    if(method==='prior'){const p=train.reduce((s,r)=>s+r.label,0)/train.length;score=()=>p;}
    else if(method==='tfidf'){const model=fitTfidf(train);score=r=>predict(model.classifier,vectorize(model,r.text));}
    else {const usable=train.filter(r=>r.features);const model=fitLogistic(usable.map(r=>r.features),usable.map(r=>r.label));score=r=>r.features?predict(model,r.features):null;}
    predictions.push(...test.map(r=>{const raw=score(r);return {...r,raw,status:raw===null?'insufficient':'scored'};}));
  }
  summarize(method,predictions,'Leave-one-source-out on four development sources; each fold also holds out a domain. Exploratory and highly uncertain.');
}
await writeJson(out,{purpose:plan.purpose,feasibilityOnly:true,complete:!aborted,sourceCount:4,examples:rows.length,generator:'gpt-5.4-nano',planDigest:digest(plan),summaries,
  paid: runs.map(({method,requests,inputTokens,reservedOrSettledUsd,wallMs})=>({method,requests,inputTokens,reservedOrSettledUsd,wallMs})),
  limitations:['No calibration/test results opened','Four sources cannot establish detector performance or select the final method','Matched GenAI-Sentence, Gemini and Fast-DetectGPT runs remain unavailable','Full 100-source comparisons remain required; token/request feasibility must be resolved first']},true);
console.log(JSON.stringify({out,complete:!aborted,summaries},null,2));
