# Upstream audit — 23 September 2026

Verified the dataset card and one **dev** shard (`news_gpt-5.4-nano.csv`) for schema and exact alignment feasibility. No test text was opened and no inference was performed. Inspection of development examples for schema is logged here; they are not prompt-tuning examples.

- Dataset revision: `4fb59011bcab8c62863b7083fe0f0a3345555558`.
- Upstream code revision: `739d647bab87c7d3c7a86d3df6c008945af5c4a2`.
- Card: https://huggingface.co/datasets/OpAI-Bench1/OpAI-Bench/blob/4fb59011bcab8c62863b7083fe0f0a3345555558/README.md
- `record_id` identifies a versioned row; `domain:id` identifies the original source. `document_hash_id` is an alternative salted source key. Never group on record ID.
- Released split files: train, dev, test. Qwen3-8B occurs in test files only. Map train → research development, dev → calibration, test → locked test.
- `sentences` and `sentence_labels` are serialized lists. Binary sentence labels describe revision provenance. The adapter requires exact alignment to `text` and converts Python code-point offsets to browser UTF-16 offsets.
- Author IDs are absent from the inspected schema. Author-disjoint generalization cannot be claimed.
- The card reports **289,037 main rows** (202,430 train; 43,821 dev; 42,786 test), while the repository/paper summary reports 279,794 versioned samples. Use pinned downloaded counts and retain the discrepancy.
- The card declares Apache-2.0 and points to Croissant metadata for original-source provenance. Dataset licensing is not a blanket claim about every original source. Do not redistribute raw text in this repository.

Full cross-shard source/duplicate/offset checks remain required before any empirical run. `data:import` quarantines source-shards with malformed labels or alignment failures; `research prepare` excludes each quarantined source across all generators. The audit is not yet a full-corpus approval.

Provider snapshot: https://docs.typesafe.ai/models lists `jev-1.13.0`, $0.042 per million input tokens, free output, 64k total context and 32k state + longest question. Reverify on the execution date. Paid execution requires an explicit fresh price-verification date; a model mismatch fails the run.


## Full-corpus execution update — 23 September 2026

All 40 pinned main shards were downloaded (4,281,041,198 bytes), checksum-recorded, and mechanically audited. The actual pinned release contains **281,180 versioned rows**, not either earlier paper/card count, and **5,427,726 aligned sentence records**. Keep the earlier discrepancy as an audit trail; use these observed counts.

The initial exact-string adapter rejected 5,689 source-shards, largely because annotations flattened whitespace in abstracts and some other prose. A tested whitespace-only mapper now requires every non-whitespace character to match, preserves original source text and UTF-16 offsets, and retains `annotationText` plus `whitespaceMapped`. After re-audit, all rows align; no labels or sentence boundaries were guessed. The initial audit remains under `data/imported/source-audit-exact-v1.*`.

Five cross-partition exact duplicate clusters (11 source IDs) and seven detected cross-partition near-duplicate pairs were quarantined on both sides. Together these exclude 25 source IDs. Thirteen additional within-partition duplicates were excluded. No source was reassigned across official partitions. The final full-corpus audit, exclusions, hashes, and deterministic selection are recorded in `data/prepared/manifest.json` and `data/imported/leakage-quarantine.json`.

Selected source counts meet all quotas: 100 development, 200 calibration, 400 test, equally allocated across four domains. They yield 38,576 / 66,019 / 139,370 sentence examples respectively. Only 23 selected test sources contain Qwen3-8B examples; subgroup evidence will therefore be much smaller than the overall test set. This is a coverage observation, not a detector result. Test text was processed by automated alignment/leakage code; no test predictions, performance metrics, or manual test-text inspection occurred.

Pinned Croissant metadata identifies the original source collections: Automated Essay Scoring 2 (Kaggle), XSum, GovReport, and an arXiv-abstract corpus (Kaggle). It supplies collection-level rather than per-document licensing/author records. Apache-2.0 is the release declaration; original-source terms and absent author identities remain unresolved limitations. Raw text is kept in ignored local data and is not redistributed.

JEV compatibility checks succeeded with the actual returned `jev-1.13.0`. Pricing was rechecked against https://docs.typesafe.ai/models on the execution date: $0.042/M input tokens, outputs free. Usage, failures and reservations are retained in `data/budget.json`. No external detector baseline or transfer-generation provider has been executed.


### Prospective held-out coverage correction

Before any held-out inference, the 400-source test selection was stratified to retain all 153 eligible Qwen3-8B sources, then hash-fill to 100 sources per domain. The final selection contains 290,152 sentences (38,576 development; 66,019 calibration; 185,557 test). The original 23-Qwen-source selection remains archived; feasibility runs retain its manifest identity. Development and calibration source IDs did not change. This improves the possibility of estimating held-out FPR but does not guarantee a gate pass, and changes the overall test generator mixture.
