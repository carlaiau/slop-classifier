# Reproducing the research

Current scope: data preparation, detection comparisons, live latency, and independent transfer. Participant studies and participant release are excluded. Release commands below document the existing mechanism only; they are not part of the active workflow.

Run commands from the project root. Artifacts under `data/` are ignored and may contain licensed or sensitive research text. Commit only protocols, code, metadata summaries and permitted metrics.

## 1. Fetch, import, audit

```sh
# Dry run lists all 40 pinned shards; --execute downloads public data, no inference.
python3 scripts/fetch_opai.py --all
python3 scripts/fetch_opai.py --all --execute
# Validate every row, retain compact source units for leakage checks.
python3 scripts/import_opai.py --input data/raw/default/*/*.csv --audit-only --out data/imported/source-audit.jsonl
# Quarantine cross-partition duplicate sources; select 100/200/400 and expand only those.
node --max-old-space-size=4096 scripts/prepare-corpus.js
# Before test inference, retain all eligible held-out-generator sources within the 400-source quota.
node scripts/stratify-heldout.js
```

Run this in a fresh data workspace; outputs are not overwritten. If sentence expansion completed but finalization was interrupted, `prepare-corpus.js --finish-existing-selection` resumes from the existing selection and verified shard metadata. Audit-only source units cannot be sent to benchmark scoring. The original single-shard import/prepare commands remain useful for fixtures, but full-corpus preparation must use the complete source audit.

The importer checks pinned revision and SHA-256, parses lists without `eval`, aligns each sentence with an explicit whitespace-only mapping, and preserves released annotation text, original text and offsets. Non-whitespace mismatches quarantine whole sources. Preparation excludes all detected cross-partition duplicate sources rather than moving examples between partitions; within-partition duplicates retain one identity. Author IDs are unavailable. Review source licensing and audit exclusions before interpreting the sample as ready for a complete empirical study.

The current selection and feasibility results are summarized in [the execution report](../research/first-execution-report.md). Calibration and test performance remain unopened.

## 2. Development and matched baselines

```sh
npm run research -- fit-baseline --method prior --out data/prior.json
npm run research -- fit-baseline --method tfidf --out data/tfidf.json
npm run research -- run --method sentence --split development
```

The last command is a **dry run**, printing requests, estimated input tokens/dollars and maximum reservations. It needs no key. Actual JEV execution requires all caps and today's verified price date:

```sh
npm run research -- run --method sentence --split development --out data/runs/sentence-dev.json \
  --execute --budget-usd 25 --max-requests 10000 --max-tokens 10000000 --price-verified YYYY-MM-DD
```

Set `TYPESAFE_API_KEY` in a local `.env`. Use `--cache-only` instead of `--execute` to prohibit network calls. All JEV runs share `data/budget.json`; limits are cumulative, not per invocation. Retry failures at the same output path. Do not run different owners concurrently. The declared token ceiling, not a rough cost estimate, controls calls.

Repeat development runs for sentence-context, prefix-mean, prefix-upper and combined. The combined run initially extracts six features:

```sh
npm run research -- fit-combined --run data/runs/combined-dev.json --out data/combined.json
```

Fit/compare prompts and methods on source-grouped development folds; reserve calibration for the final map/threshold. Record every prompt revision (maximum two). No genre baseline is enabled by default.

```sh
node scripts/compare.js data/runs/sentence-dev.json data/runs/combined-dev.json --out data/method-comparison.json
```

The comparison refits combined/TF-IDF models within each source-grouped fold and reports held-fold operating points. It does not use calibration/test labels to select a method.

External baseline exchange preserves matched examples:

```sh
npm run research -- export-baseline --method genai-sentence --split development --out data/jobs/genai-dev.json
npm run research -- import-baseline --split development --predictions data/external/genai-dev.json \
  --metadata data/external/genai-metadata.json --out data/runs/genai-dev.json
```

An external result has `{method, split, manifestDigest, results:[{id,status,raw}]}`. Scored `raw` values must be finite [0,1] oriented toward AI; document the underlying meaning (coverage vs probability). Failed results have status failed, not a fabricated zero. Exact example coverage is mandatory. Metadata must contain `hardware`, `configuration`, `trainingExposure`, and the pinned `codeRevision`; also retain checkpoint and adapter patch hashes, score orientation, latency, provider usage and cost. Use the same immutable metadata across splits. Before using GenAI-Sentence, resolve the checkpoint-loading issue in `research/baselines.json`. GPU dependencies, checkpoints and other provider calls are not silently installed/executed by this app.

## 3. Calibrate, freeze, evaluate

```sh
# Local baseline example; no provider cost.
npm run research -- run --method tfidf --model data/tfidf.json --split calibration --execute --out data/runs/tfidf-cal.json
npm run research -- calibrate --run data/runs/tfidf-cal.json --out data/tfidf-calibration.json
npm run research -- freeze --calibration data/tfidf-calibration.json --batch 4 --concurrency 3 --out data/tfidf-freeze.json
npm run research -- run --split test --freeze data/tfidf-freeze.json --open-test --execute --out data/runs/tfidf-test.json
npm run research -- evaluate --split test --freeze data/tfidf-freeze.json --open-test --run data/runs/tfidf-test.json --out data/tfidf-report.json
npm run research -- report --report data/tfidf-report.json --out data/tfidf-report.md
```

For JEV, produce a calibration run with the chosen method (and `--model data/combined.json` when applicable), explicit paid-run caps, and then the same calibrate/freeze/evaluate sequence. Baseline exports for test require `--freeze` and `--open-test`; import the external predictions at the frozen test output path. A test-opening receipt prevents a changed JEV method/specification from reusing this manifest. Partial or failed runs do not generate completed reports. Resolve errors or report incompleteness without calling it a negative prediction.

The JSON report includes subgroup metrics, reliability bins, clustered intervals and pass/fail/inconclusive gates. The Markdown report is an accessible summary. Synthetic results are permanently marked synthetic-only. `npm run research:smoke` exercises this entire sequence without any provider calls.

To render a standalone scientific reliability diagram, install the optional pinned plotting dependency in a local virtual environment and run:

```sh
python3 -m venv data/plot-venv
data/plot-venv/bin/pip install -r requirements-plot.txt
data/plot-venv/bin/python scripts/plot_report.py --report data/jev-report.json --out data/reliability.png
```

## 4. Operational parity and live timing

Before a reader pilot, verify that the production segmenter produces the benchmark target text/offsets or conduct a separately frozen evaluation on operational units with audited gold alignment. Gold-unit metrics cannot substitute for this check. Record the outcome alongside the report.

```sh
npm run research -- parity --split test --freeze data/jev-freeze.json --open-test --out data/jev-parity.json
```

The exact-parity check reconstructs source whitespace and offsets from imported gaps. It blocks release on changed sentence boundaries. If boundaries differ, the result is a research blocker requiring an explicitly designed operational-unit gold adapter and fresh evaluation, not automatic relabeling.

For researcher-only instrumentation, set a real JEV frozen specification and explicit live configuration:

```sh
ENABLE_LIVE=research RELEASE_FILE=data/jev-freeze.json PRICE_VERIFIED_DATE=YYYY-MM-DD npm run dev
```

The key and caps are read from `.env`. This mode says live research / pilot not approved, and is not for participants. Override `RESEARCH_BATCH` with 1/4/8 and `RESEARCH_CONCURRENCY` with 1/3/6 to profile the nine combinations on development text. Export session timings from the settings panel; no text or scores enter that file. Record host/browser/network and cold starts in the measurement notes. Choose the lowest-cost qualifying runtime, then freeze those exact values before test opening.

Collect ≥100 uncached viewport observations at the frozen runtime. Merge runs without deleting failed or unfinished observations. Report p50/p95 first-sentence and completion latency, API time, queue time, failed batches and wasted work. Server-first requests are separately tagged. Reconcile paid tokens from the budget/provider with total words analyzed; UI session exports alone do not measure provider token cost.

```sh
node scripts/latency.js data/timings/session-*.json --out data/latency.json
```

```sh
npm run research -- release --freeze data/jev-freeze.json --report data/jev-report.json \
  --latency data/latency.json --parity data/jev-parity.json --out data/pilot-release.json
```

Release refuses synthetic, incomplete, failing/inconclusive detection, mismatched runtime and insufficient/failed latency samples. The operational parity check and baseline/transfer reviews must also be complete before participant use. `ENABLE_LIVE=1 RELEASE_FILE=data/pilot-release.json` opens the limited pilot only after those prerequisites. Do not expose the local server publicly.

## 5. Independent transfer (reader study excluded)

`node scripts/transfer.js --input data/transfer-human.json --out data/transfer-generation.json` validates 100 human provenance records and produces 200 topic-only generation jobs. It performs no generation. Each input has `id`, `authorId`, `genre`, `text`, `topicBrief`, and `provenance:{uri,humanEvidence,permission}`. Verify author/source independence before generating; store outputs and generation logs as a separate evaluation corpus. Provider generation costs must fit the shared study allowance.

The user excluded the reader study on 23 September 2026 before benchmark inference. Do not execute study tooling or participant release commands in this work. Existing study documentation is historical scaffolding; no reader-understanding claim is supported.
