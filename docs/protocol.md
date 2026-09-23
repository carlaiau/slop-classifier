# Frozen research protocol v1

## Questions and hypotheses

The primary question is whether a JEV detector gives general readers a useful English sentence signal within a one-second p95 uncached reading interaction. Detection, system latency and reader understanding are independent outcomes. A good result on one cannot compensate for failure on another. The PDF motivates the product; it does not validate the method.

H1: direct JEV sentence judgments retain useful recall at a 5% false-positive operating point. H2: prefix-word judgments or a fitted combination improve detection enough to justify added cost. H3: the viewport reader delivers the chosen method fast enough. H4: readers can inspect highlights without treating them as authorship proof.

`research/protocol.json` is the machine-readable protocol. Archive its hash with every frozen specification before test inference. This repository records a prospective protocol; it is not a claim of registration with an external registry.

## Data and leakage

Pin the dataset and code revisions in the protocol. Source identity is `domain:id`, never `record_id`. Keep all versions and generators for a source together. Map official train → development (100 sources), dev → calibration (200), test → locked evaluation (400), selecting equal quotas from abstracts, essays, news and reports with a deterministic hash order. Shortfalls stay in the manifest. Qwen3-8B remains test-only. The importer retains original sentence labels and validates exact source slicing. Bad alignment quarantines the entire source across generators; retain exclusions in the report.

Audit normalized human-source hashes, 5-word-shingle Jaccard similarity ≥0.85, author IDs where available, official split conflicts, unknown labels, malformed lists and duplicate example IDs. Cross-partition leakage is a hard failure. Within-partition duplicates retain one source. Author IDs are absent from the observed release; report that limitation. Canonicalize duplicate human v0 examples in aggregate metrics and calibration; per-generator slices retain their provenance.

Benchmarks use original gold units. The reader segmenter has its own version. Before a participant release, replay aligned examples through the operational segmentation pipeline and record parity: gold-unit evaluation alone does not validate changed boundaries. Boundary discrepancies require a separately frozen operational evaluation, not silent label remapping.

The independent transfer corpus has 100 provenance-backed human sources across articles/essays/informational prose (34/33/33). Prepare topic briefs without copying the source sentences, then generate matched texts using fixed exact model versions for GPT-5.4-nano and Qwen3-8B. Retain provider, version, prompt, settings, date, usage, source permissions, and failed generations. Precheck overlap with benchmark sources/authors. Generated, AI-revised and human-post-edited texts remain distinct conditions. Gutenberg is a historical stress test only.

## Methods and selection

The implemented methods are `sentence`, `sentence-context`, `prefix-mean`, `prefix-upper`, and `combined`. Prompts start at revision zero; permit at most two development-only revisions per approach, recording each change before rerunning. Model weights are never fine-tuned. Fit the six-feature regularized logistic combination only on development data. Keep all model-produced features separate from gold labels.

Use source-grouped five-fold development comparisons to select method/prompt/context; report prompt-search exposure. Each fold fits its combination/classifier on the other sources. Compare global calibration first; a genre-specific alternative is permitted only after grouped development evidence improves both calibration and false positives. The implemented default remains global, with no genre inference in the reader.

Choose among qualifying development configurations by recall, then latency and cost. Keep sentence-only when within 0.02 recall of the best complex candidate. Fit the final downstream model on all development sources. Fit a logistic calibration map on calibration only, using logit-transformed raw scores. Choose the lowest observed calibrated-score threshold whose calibration FPR is ≤0.05; an abstain-all threshold above one is valid evidence of failure, not silently replaced by 0.5. Do not advertise this fitted operating point as validated until locked evaluation passes.

Class-prior and TF-IDF logistic baselines run locally. GenAI-Sentence, Gemini 3 Flash direct/low, and Fast-DetectGPT sentence adaptation use matched external jobs with mandatory configuration/hardware/training-exposure metadata. The published GenAI checkpoint loader must be corrected/audited before comparison. Native Fast-DetectGPT document results remain separate. No unavailable baseline is presumed beaten.

## Evaluation and decision gates

Freeze dataset/protocol hashes, method, prompt/segmenter/filter/ICU version, model, downstream model, calibration, threshold, and runtime. Opening test records the frozen identity and run path; a changed JEV specification cannot reuse the same held-out manifest. Existing cache results can resume that exact run. A failed or incomplete run cannot produce a completed evaluation.

Report precision, recall, F1, FPR, AUROC, average precision/AUPRC, Brier score, equal-frequency ECE (up to ten bins; preserve score ties), reliability bins, coverage, abstentions and failures. AUROC/AUPRC/Brier/ECE are answered-only and labeled that way; overall recall counts abstained positives as misses. Bootstrap source documents 1,000 times with a fixed seed, retaining all related rows. Widen zero-error/perfect-recall endpoints with a source-count safeguard; do not infer a true zero FPR from a degenerate bootstrap.

Require FPR ≤0.05 and recall ≥0.50 for overall, held-out-generator and v4 slices; human-only FPR ≤0.05; ECE ≤0.05. Apply confidence bounds: crossing a target is inconclusive, not a pass. Inspect domains, generators, versions, lengths, formulaic prose, quotation/list fragments, human post-editing, multilingual writers' English where provenance exists, and adversarial text. Subgroup insufficiency stays explicit.

Latency requires ≥100 uncached viewport observations at the chosen configuration, p95 first scored sentence ≤1,000 ms from eligibility (including debounce/network/queue/render), complete viewport records, and no unreported failures. Report cold-first requests, warm misses and cache hits separately; also record API time, queue delay, viewport completion, wasted work after scroll, requests and input cost per 1,000 words. Profile batches 1/4/8 × concurrency 1/3/6 on development text before freezing runtime. A UI cache hit never stands in for inference latency.

## Pilot and stopping

Only real complete technical reports can issue a pilot release. The twelve-reader study is counterbalanced and formative. Require ≥10/12 to understand both that unhighlighted text is not verified human and that a highlight is not proof. Review every induced confident mistake before expanding. Negative and inconclusive outcomes remain publishable research results. Post-test changes require fresh evaluation sources; do not tune on the locked test and call the next run independent.
