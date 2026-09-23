# First research execution — 23 September 2026

JEV is fast enough to continue investigating, but the first small development comparison shows weak detection separation. This is a feasibility report, not a validated detector or a locked accuracy–latency result. The reader study and participant release are excluded by user instruction.

## Data preparation

- Downloaded and checksum-audited all 40 pinned main shards: 4.28 GB, 281,180 versioned rows, 5,427,726 aligned sentences.
- Preserved original sentence labels and text. Added explicit whitespace-only alignment for annotations that flatten line breaks; retained annotation text and original offsets. All rows now align.
- Excluded 25 source IDs involved in cross-partition duplication and 13 within-partition duplicates; did not move any source across official partitions.
- Selected 700 sources with equal domain quotas: 100 development, 200 calibration, 400 test. The final selection contains **290,152 sentence examples**: 38,576 / 66,019 / 185,557 respectively.
- Before test inference, revised test sampling to include all 153 eligible Qwen sources (37 abstracts, 45 essays, 37 news, 34 reports), then fill remaining domain quotas deterministically. Ordinary sampling included only 23, too few to meet the specified FPR uncertainty gate even with no observed false positives. This changes the test mixture; report generator-specific results and do not treat the combined mixture as population prevalence.
- Original unstratified selection remains under `data/preparation-v1-unstratified/`. Development and calibration source IDs are unchanged. Feasibility runs refer to that original manifest; do not silently relabel them as final-manifest runs.
- No calibration/test detector results were opened. Automated preparation necessarily processed test text for alignment and duplicates; there was no manual test-text inspection or model scoring.

Author IDs are absent. Source collections are identified, but collection-specific licensing and individual provenance remain limitations. The pinned dataset release declares Apache-2.0; that does not establish every original source’s terms. See [the upstream audit](upstream-audit.md).

## Paid development feasibility

Selected one development source per domain by deterministic hash, using GPT-5.4-nano revision trajectories only: **585 sentence examples**, of which 554 received JEV scores and 31 abstained as too short. Four source clusters are far too few for a performance claim. No prompts were revised and no final method was selected.

| Method | AUROC | Scored examples |
|---|---:|---:|
| sentence | 0.482 | 554 |
| sentence-context | 0.493 | 554 |
| prefix-mean | 0.534 | 554 |
| prefix-upper | 0.528 | 554 |
| prior | 0.491 | 585 |
| tfidf | 0.415 | 585 |
| combined | 0.488 | 554 |

AUROC measures ranking, not percentage accuracy; 0.5 represents chance ranking. Direct and prefix rows use raw, uncalibrated scores. Prefix-upper reuses the exact prefix-word judgments. Prior, TF-IDF and combined results use leave-one-source-out fitting; each fold also holds out a domain. Coverage differs for the local baselines. These are exploratory results with very high cluster-level uncertainty, not the preregistered five-fold full-development comparison or held-out estimates. No operating-point recall/FPR claim is made.

The prefix mean result (0.534) is weak evidence of separation. The combined model (0.488) does not justify extra complexity on this sample. This argues for testing the mechanism carefully before spending on a locked evaluation; it does not establish universal failure.

## Real browser latency

Used installed Chrome on the user’s host with a 1440×1000 viewport, the actual local server and JEV provider, and fresh uncached sessions. The direct sentence method was uncalibrated; runtime observations are exploratory, not a final frozen configuration. Three development passages were repeated across nine configurations.

| Batch | Concurrency | Observations | p50 first sentence (ms) | Observed p95 (ms) |
|---:|---:|---:|---:|---:|
| 1 | 1 | 3 | 383 | 383 |
| 1 | 3 | 3 | 334 | 384 |
| 1 | 6 | 3 | 333 | 350 |
| 4 | 1 | 3 | 366 | 417 |
| 4 | 3 | 3 | 349 | 366 |
| 4 | 6 | 3 | 333 | 350 |
| 8 | 1 | 3 | 333 | 383 |
| 8 | 3 | 3 | 333 | 383 |
| 8 | 6 | 3 | 333 | 383 |

All 27 corrected observations completed without failed batches. Eligibility-to-render timing includes the scheduling pause, networking and rendering. With only three observations per configuration, p95 is effectively the maximum; it cannot establish the ≥100-observation locked latency gate. Cold-first requests, warm misses, queue/API timing and viewport completion remain in the session exports. This sweep does not cover mobile networks, sustained load or rapid-scroll waste.

The original sweep exported several sessions during an inter-batch scheduling gap. Its incomplete observations remain in `data/feasibility/live-latency-grid.json`; the corrected capture is `live-latency-grid-v2.json`. No observations were deleted to improve a gate.

## Transfer and external baselines

Assembled **100 public-source candidates**: 34 ProPublica articles, 33 Public Domain Review essays, and 33 GOV.UK informational items. Dated indexes guide provenance review; an old publication date does not prove the current text is unchanged. All candidates remain explicitly unverified, with no gold human label and no eligibility for evaluation. The list is in `data/transfer/candidates.json`.

Next checks are archived-text provenance, bylines/institutional attribution, item-specific reuse conditions, continuous-prose extraction, source/author overlap, and topic-only briefs. Three publisher families are not representative of all English writing. Modern essays about historical subjects are not Gutenberg historical-text controls.

No generated transfer counterparts were produced. OpenAI/Gemini credentials are absent from the configured environment; exact Qwen generation access is not configured. GenAI-Sentence checkpoint validation, Gemini configuration and Fast-DetectGPT runtime remain unresolved. Missing baselines are not counted as beaten.

## Cost and remaining execution constraints

The durable ledger records **709 provider calls**, **2,844,743 input tokens**, **US$0.119479** at the verified input rate, and **zero unsettled reservations**. This is usage-derived cost, not a provider billing statement. The cumulative ceiling remains US$25. [Provider model/pricing documentation](https://docs.typesafe.ai/models).

The full 100-source development set is much larger than the feasibility sample. Byte-based dry-run estimates are:

| Method | Estimated input tokens | Estimated USD |
|---|---:|---:|
| sentence | 7,365,778 | 0.31 |
| sentence-context | 9,469,379 | 0.40 |
| prefix-mean | 101,712,184 | 4.27 |
| combined | 123,147,756 | 5.17 |

Reusing prefix judgments for the upper aggregate puts these four development passes near **US$10.15** by rough estimation. These are not guaranteed charges. The current full benchmark CLI uses one request per sentence and would exceed its 10,000-request cap; prefix/combined passes also exceed the 10-million-token cap. Larger runs must use bounded batching and a recorded request/token allocation while preserving the US$25 dollar cap. Full prefix/combined calibration and testing could exhaust the remaining budget, especially after adding external baselines and transfer generation. Do not merely remove caps or spend the full allowance on development.

## Next research decision

Continue development before opening calibration or test results. Verify request-state placement and sensitivity to known textual differences, use the allowed bounded prompt revisions, and expand matched comparisons across the full development sample once execution caps and method allocation are settled. Proceed to calibration and a single locked evaluation only for a method with credible development evidence. Keep the transfer review independent of detector scores. Reader recruitment, study assignments and participant release remain out of scope.

## Verification

14 Node tests and 4 Python importer tests passed; JavaScript syntax checks and the synthetic end-to-end pipeline passed. Live calls validated the returned pinned model. Test artifacts remain distinct from research evidence. Raw corpus text, predictions and credentials are not committed.

## Cached threshold sweep

Computed after the user asked about threshold changes, using existing direct-sentence Noul outputs. Zero additional API calls. These are raw, uncalibrated scores on the same four development sources. Abstained positives remain missed detections.

| Raw threshold | AI-edited recall | Human-label false-positive rate |
|---:|---:|---:|
| 0.30 | 92.4% | 95.7% |
| 0.40 | 56.1% | 58.5% |
| 0.50 | 18.5% | 27.7% |
| 0.60 | 4.0% | 9.6% |
| 0.65 | 0.7% | 2.8% |
| 0.70 | 0.0% | 0.7% |
| 0.80 | 0.0% | 0.0% |
| 0.90 | 0.0% | 0.0% |

Changing the display threshold changes operating-point decisions but leaves scores, ranking and AUROC unchanged. It requires no provider calls. Final threshold selection belongs on calibration data; later exploratory sweeps of test results must not be presented as prospective validation.
