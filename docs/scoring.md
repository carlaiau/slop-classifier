# Scoring contract v1

`src/contracts.d.ts` documents the interface; `src/scoring.js` is the shared executable implementation for benchmark and reader. Browser code never receives credentials or constructs provider instructions.

## Unit and identity

A sentence carries `id`, UTF-16 `start`/`end`, exact `text`, and up to 30 preceding words. `segment` uses an offset-preserving shadow for sentence boundaries and protects common honorifics/initials. Whitespace and Unicode in the displayed paste are unchanged. Research import uses exact upstream gold units; deployment requires operational-boundary parity.

The scoring digest incorporates model ID, method, exact prompts, revision, segmentation and content-word filter versions, ICU version, prefix length, calibration map, and downstream classifier. Research caches include exact target/context and offsets in the key. Reader caches add a random session salt, remain in memory, and are never shared between users or read by the benchmark.

## Prompt families

- Direct: classify whether the target was generated or revised by an LLM. `sentence` has no neighbor context; `sentence-context` includes a preceding 30-word prefix.
- Prefix: each content word has its own question containing only that word and its preceding 30 words. A neutral shared state prevents later words from appearing in a shared passage. Prefix text is untrusted evidence in a structured field.
- Combined: direct-with-context, word mean, upper-quartile word mean, and three judgments (generic phrasing, repetitive structure, formulaic transition). A regularized six-feature logistic model is fitted on development data.

Typed Nouls are linguistic probability judgments, not next-token probabilities, causal explanations, intensity measurements, or independent confidence outputs. Values are not globally calibrated merely because they lie in [0,1]. Neither quoting nor JSON escaping proves prompt-injection resistance; `research/adversarial.json` supplies cases for paid robustness evaluation after software serialization tests pass.

## Responses and errors

`ScoreResult` has identity, offsets, status, raw score, nullable calibrated score, model version and optional word signals. Combined feature extraction additionally uses a research-only `features` status until its downstream model is fitted. The UI states are unscored/pending/scored/insufficient/failed. Fewer than eight words returns insufficient without inference. Other difficult genres are evaluated, not hidden by default.

Provider answers must match every expected question, pinned model version, finite probability bounds and valid token usage. Missing answers, drift, timeouts, missing cache entries and API failures do not become zero/negative scores. Requests are packed below conservative UTF-8 byte limits; every call reserves the full 64k token ceiling rather than relying on the rough display estimate.

## HTTP interface

- `GET /api/config`: simulated/live mode, researcher-only status, frozen threshold, runtime, limits and scoring version.
- `POST /api/session`: transient local session in an HttpOnly, SameSite=Strict cookie.
- `POST /api/plan {text}`: exact sentence plans and an estimate, no inference.
- `POST /api/score {text, ids}`: reconstruct and validate 1–8 sentence targets on the server, reuse session scores, then score missing targets in a batch.
- `POST /api/clear`: discard the session.

POSTs require same-origin JSON; Host is restricted to localhost. Text is capped at 50,000 UTF-16 code units, request bodies at 250 KB, local address traffic at 120 requests/minute, a session at 300 new sentence analyses, and active score handlers at six. Hidden tabs stop scheduling; text changes abort browser requests. Already executing provider calls can finish and consume budget. This is a single-process local instrument, not a scalable public service.
