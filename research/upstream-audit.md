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
