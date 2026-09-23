# Expanded development threshold comparison — 23 September 2026

This is a second, larger **development** experiment. It does not open the official calibration or locked test partitions. No combined method was run. Three development sources from each of four domains were selected by a fixed source-ID hash, yielding 12 sources and 3,438 sentence examples from the GPT-5.4-nano trajectories. Scores for the original four sources (585 examples) were reused after exact example/content and scoring-version checks. Prefix-upper comes from the very same prefix-word Noul answers as prefix-mean.

A Noul score is the probability of a yes answer to its question, not the next-word probability or an authorship probability. The direct and word methods ask different questions. Their raw cutoffs are therefore not interchangeable.

## Thresholds on the same development examples

The first comparison selects a raw cutoff on **all 12 sources** to yield at most 5% observed human-label false positives. It shows the tradeoff and is optimistic because cutoff selection and assessment use the same labels. Abstained AI-positive sentences count as missed detections.

| Method | Raw score cutoff | Observed FPR | AI-edited recall | Raw AUROC |
|---|---:|---:|---:|---:|
| sentence | 0.570 | 4.7% | 3.8% | 0.540 |
| sentence-context | 0.600 | 4.8% | 3.6% | 0.547 |
| prefix-mean | 0.379 | 4.9% | 7.7% | 0.558 |
| prefix-upper | 0.470 | 4.9% | 6.1% | 0.555 |

Prefix-mean has slightly better raw ranking and recall at this local cutoff, but all four approaches fall far below the proposed 50% recall target. AUROC of roughly 0.54–0.56 shows substantial overlap between classes; a threshold cannot change that ranking.

## Source-grouped development calibration

For each of three folds, one source per domain was held out. A logistic map and the ≤5% FPR threshold were fitted on the other eight sources, then applied to the four unseen development sources. The rows below pool those held-out decisions. This is an internal development check, **not** the planned calibration on 200 separate sources.

| Method | Held-source FPR | Human-only FPR | AI-edited recall | Coverage | 95% source-cluster FPR interval |
|---|---:|---:|---:|---:|---:|
| sentence | 11.7% | 11.5% | 7.0% | 84.2% | 2.2–18.5% |
| sentence-context | 10.7% | 8.9% | 6.1% | 84.2% | 1.6–17.1% |
| prefix-mean | 3.7% | 3.7% | 4.0% | 84.2% | 0.7–10.8% |
| prefix-upper | 5.8% | 6.8% | 4.1% | 84.2% | 1.5–11.3% |

Coverage is 84.2% across the matched sample because 542 of 3,438 sentences are too short to score; abstained positives remain misses. The human-only slice contains 382 sentences, so its percentage is especially unstable. Some held-out folds exceeded the FPR target even when their training folds met it. In one fold the fitted calibration slope reversed sign for every method, another sign of unstable score ordering. Detailed fold thresholds, slopes, Brier scores, ECE and clustered intervals are in the ignored local `data/expanded-development-v1/threshold-analysis.json`.

Prefix-mean retained the lowest pooled FPR (3.7%) but only 4.0% recall. Prefix-upper reached 4.1% recall with 5.8% FPR. Neither gives credible evidence of a useful operating point yet. With only 12 independent source clusters, intervals are wide; these development observations cannot validate or conclusively reject performance on the full corpus or future generators.

## Calls, budget and next research step

The extension made 1,242 new provider calls and used 5,326,533 new input tokens, approximately US$0.224 at the verified rate. Reused scores required no new calls. Prefix-upper and all threshold sweeps/calibration calculations required no new calls. The durable ledger now records 1,951 total requests, 8,171,276 total input tokens and US$0.343 estimated usage, with 0 pending reservations. The US$25 ceiling and request/token limits remain active.

The result supports further **development diagnosis**, especially prompt wording, domain differences, short-sentence abstention and source effects, before reserving calibration or opening test results. The remaining 10-million-token cap is about 1,828,724 tokens; it cannot support a full 100-source prefix comparison as currently configured. Full development execution needs a separately recorded batching/cap allocation within the same dollar ceiling. The independent transfer candidates still require provenance checks and generated counterparts. The reader study remains excluded.

## Reproduction

`node --max-old-space-size=4096 scripts/expanded-development.js` prints the fixed plan without inference. The `--execute --price-verified YYYY-MM-DD` form resumes only identical runs under the durable budget ledger. `node scripts/analyze-expanded-thresholds.js` recomputes this threshold report from saved predictions with zero API calls. Pinned raw text and prediction artifacts stay in ignored `data/`.

## 10% false-positive sensitivity scenario

At the user’s request, thresholds were recalculated from saved scores with **zero API calls**. The 5% preregistered gate remains unchanged; these are development sensitivity figures.

| Method | Raw cutoff for ≤10% FPR on same examples | Same-example recall | Held-source FPR after training at 10% | Held-source recall |
|---|---:|---:|---:|---:|
| sentence | 0.520 | 9.1% | 15.6% | 11.1% |
| sentence-context | 0.560 | 7.8% | 15.8% | 10.3% |
| prefix-mean | 0.356 | 14.2% | 10.0% | 9.1% |
| prefix-upper | 0.442 | 12.8% | 14.0% | 9.6% |

The same-example cutoff is optimistic. In three source-grouped development folds, the cutoff was fitted on eight sources and applied to four other sources; actual FPR can exceed the training target. Prefix-mean is closest to 10% held-source FPR but still detects only 9.1% of AI-edited sentences. Raising the limit changes classification counts but cannot improve score ranking or AUROC. Official calibration and locked evaluation remain unopened.

## 20% false-positive sensitivity scenario

The same saved scores were re-thresholded at the user’s request. **Zero API calls** were made; the prospective 5% protocol gate is unchanged.

| Method | Same-example raw cutoff for ≤20% FPR | Same-example recall | Held-source FPR after training at 20% | Held-source recall |
|---|---:|---:|---:|---:|
| sentence | 0.460 | 22.0% | 29.7% | 25.4% |
| sentence-context | 0.500 | 21.7% | 24.8% | 20.4% |
| prefix-mean | 0.332 | 27.5% | 27.8% | 22.2% |
| prefix-upper | 0.407 | 27.1% | 25.9% | 21.5% |

The source-grouped calibration uses eight development sources to choose each cutoff and evaluates four other development sources. Thus a 20% training target produced about 25–30% observed FPR on the held-out development sources. Prefix-mean detected 22.2% of AI-edited sentences at 27.8% FPR, far below the 50% recall target and far above the original 5% false-positive target. This is a small development sensitivity study, not an independent estimate. Reproduce from saved scores with `node scripts/threshold-scenario.js --target 0.20 --out <new-file>`.
