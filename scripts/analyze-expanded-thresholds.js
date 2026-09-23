// No API calls. Development-only grouped threshold study for the four requested methods.
import { readJson, writeJson, digest, invariant } from '../src/io.js';
import { fitCalibration, calibrate, selectThreshold } from '../src/learning.js';
import { metrics, clusteredReport } from '../src/metrics.js';
const dir = 'data/expanded-development-v1';
const plan = await readJson(`${dir}/plan.json`);
const base = Object.fromEntries(await Promise.all(['sentence', 'sentence-context', 'prefix-mean'].map(async m => [m, await readJson(`${dir}/${m}.json`)])));
const expected = digest(base.sentence.results.map(r => r.id).sort());
invariant(Object.values(base).every(r => r.complete && r.results.length === plan.examples && digest(r.results.map(x => x.id).sort()) === expected && r.planDigest === digest(plan)), 'Complete matched development runs required');
const upper = r => {
  if (r.status !== 'scored') return { ...r, raw: null };
  const v = (r.words ?? []).map(w => w.raw).sort((a,b) => b-a);
  invariant(v.length && v.every(Number.isFinite), 'Prefix word signals missing');
  const top = v.slice(0, Math.ceil(v.length/4));
  return { ...r, raw: top.reduce((a,b) => a+b,0)/top.length };
};
const methods = { sentence: base.sentence.results, 'sentence-context': base['sentence-context'].results,
  'prefix-mean': base['prefix-mean'].results, 'prefix-upper': base['prefix-mean'].results.map(upper) };
const fold = new Map();
for (const domain of ['abstracts','essays','news','reports']) {
  const ids=plan.sourceIds.filter(id=>id.startsWith(`${domain}:`));
  invariant(ids.length===3,'Three independent sources per domain required');
  ids.forEach((id,i)=>fold.set(id,i));
}
const output=[];
for (const [method,rows] of Object.entries(methods)) {
  const raw=metrics(rows.map(r=>({...r,calibrated:r.raw})),0.5);
  const fivePercentRaw=selectThreshold(rows.map(r=>({...r,calibrated:r.raw})),0.05);
  const rawAtFive=metrics(rows.map(r=>({...r,calibrated:r.raw})),fivePercentRaw);
  const folds=[], held=[];
  for (let i=0;i<3;i++) {
    const train=rows.filter(r=>fold.get(r.sourceId)!==i),test=rows.filter(r=>fold.get(r.sourceId)===i);
    invariant(new Set(train.map(r=>r.sourceId)).size===8 && new Set(test.map(r=>r.sourceId)).size===4,'Grouped fold failed');
    const calibration=fitCalibration(train), threshold=selectThreshold(train.map(r=>({...r,calibrated:r.status==='scored'?calibrate(r.raw,calibration):null})),0.05);
    const predictions=test.map(r=>({...r,calibrated:r.status==='scored'?calibrate(r.raw,calibration):null, fold:i, threshold}));
    const m=metrics(predictions,threshold);
    held.push(...predictions);
    folds.push({fold:i,trainSources:8,testSources:4,threshold,calibrationSlope:calibration.weights[0],fpr:m.fpr,recall:m.recall,coverage:m.coverage});
  }
  const pooledProb=metrics(held,0.5);
  const decisions=held.map(r=>({...r,calibrated:r.calibrated===null?null:Number(r.calibrated>=r.threshold)}));
  const point=clusteredReport(decisions,0.5,1000);
  const humanOnly=metrics(decisions.filter(r=>r.version==='v0'),0.5);
  output.push({method,sourceCount:12,examples:rows.length,rawAuroc:raw.auroc,rawAuprc:raw.auprc,coverage:raw.coverage,
    rawFivePercentIllustration:{threshold:fivePercentRaw,fpr:rawAtFive.fpr,recall:rawAtFive.recall,precision:rawAtFive.precision},
    developmentOnlyThreeFold:{folds,pooled:{fpr:point.fpr,humanOnlyFpr:humanOnly.fpr,humanOnlySentences:humanOnly.n,recall:point.recall,precision:point.precision,coverage:point.coverage,
      fpr95:point.intervals.fpr,recall95:point.intervals.recall,ece:pooledProb.ece,brier:pooledProb.brier,auroc:pooledProb.auroc}}});
}
const result={kind:'expanded-development-threshold-analysis',providerCalls:0,sourceCount:12,examples:plan.examples,folds:3,
  design:'Four held-out development sources per fold, one per domain; calibration map and 5% FPR threshold fit only on the other eight development sources. The official 200-source calibration partition is untouched.',
  methods:output,limits:'Illustrative development threshold study. Twelve sources and one benchmark generator cannot validate any 5% FPR or 50% recall target. Frozen method, official calibration and locked test remain pending.'};
await writeJson(`${dir}/threshold-analysis.json`,result,true);
console.log(JSON.stringify({providerCalls:0,sourceCount:12,methods:output.map(x=>({method:x.method,rawAuroc:x.rawAuroc,rawAt5:x.rawFivePercentIllustration,grouped:x.developmentOnlyThreeFold.pooled}))},null,2));
