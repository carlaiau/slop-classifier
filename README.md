# JEV typicality research

A local research harness and paste-and-scroll reader for testing JEV as a detector of AI-generated or AI-revised prose. Inspired by the reading experience in `../read-with-jev`; that project is unchanged.

**This is tested research software, not a validated detector.** The default reader uses conspicuously labeled simulated scores. No paid inference or participant study has been performed. See [research/status.json](research/status.json) for the current evidence inventory.

## Start

Requires Node.js 24+, npm, and Python 3 for the CSV adapter.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:3102. Paste text or use the sample, review the sentence/request estimate, and start reading. Scores appear near the viewport after a 50 ms pause. The threshold control reuses existing scores; the map navigates sentences and distinguishes unscored, pending, scored, insufficient, and failed states. Settings and the map become keyboard-accessible drawers on mobile.

No account or key is required for the simulated reader. Text is transient in the local browser/server; it is not put in browser storage or written to application logs. Sessions expire after 30 minutes. Clearing the text discards the session. Research dataset/prediction artifacts are a separate, intentionally persistent offline workflow under ignored `data/`.

## Research workflow

1. Read [the protocol](docs/protocol.md) and [upstream audit](research/upstream-audit.md).
2. Fetch pinned CSV shards and import original sentence labels with exact offset checks.
3. Audit source grouping, duplicate leakage, provenance, and official partitions; freeze the sample manifest.
4. Compare direct sentence, preceding-context, prefix-word, and combined scoring against matched baselines on development only.
5. Fit calibration and thresholds on calibration data; freeze model, scoring identity and runtime before test access.
6. Run the locked test once, with explicit caps; evaluate clustered intervals, subgroup gates and failed/abstained cases.
7. Profile real live latency in researcher-only mode, then create a pilot release only if all technical gates pass.
8. Conduct the counterbalanced 12-person study using provenance-backed passages.

[Exact commands and artifact contracts](docs/research-workflow.md) · [Scoring specification](docs/scoring.md) · [Reader study](docs/reader-study.md)

## Checks

```sh
npm test                 # core logic and real local HTTP API
npm run check            # syntax checks for all JS sources
npm run research:smoke   # synthetic local TF-IDF → calibration → freeze → evaluation
npm run test:browser     # installed Google Chrome; simulated scores only
python3 -m unittest discover -s tests -p '*_test.py'
```

The smoke report is explicitly `synthetic-only` and cannot unlock the pilot. Browser tests cover viewport scheduling, threshold reuse, stale-request cancellation, keyboard navigation, mobile drawers, exact text rendering, errors and retries. No build step or framework is required: native ESM runs on the server and browser. Public assets are served from an explicit allow-list; research files and keys are never served.

## Live access and costs

Copy `.env.example` to `.env` only when ready for live research. `ENABLE_LIVE=research` requires a real frozen specification and displays **Live research · pilot not approved**. `ENABLE_LIVE=1` requires a passing pilot-release artifact. Both require a server-only key, today's `PRICE_VERIFIED_DATE`, and explicit dollar/request/token caps. Nothing in installation, tests, or the default reader initiates paid inference.

The single local process owns an exclusive persistent budget lock. It reserves up to 64,000 input tokens before each SDK call; successful validated usage reconciles the reservation, while failures keep it charged. SDK retries are disabled. A missing/corrupt ledger, occupied lock, invalid model version, or exhausted cap stops inference. A crash leaves its lock behind; inspect pending usage with the provider before manually removing a stale lock. Do not delete the ledger to reset spending.

The cap is US$25 for this study at the recorded price, not an authorization to spend. Additional providers must share the overall study allowance; their jobs are exported rather than executed by this harness. Real provider retention is separate from the app's transient storage policy. Do not claim zero provider retention from the absence of app persistence.

## Boundaries

- Local prototype only: no authentication or distributed budget store, no public deployment.
- English only. Short units abstain. Quotations and lists are reported in challenge audits rather than silently treated as human.
- Sentence-only reader. Word-level scores remain a research feature until localization and reader-understanding evidence justify displaying them.
- The independent transfer corpus, verified external checkpoints, paid runs and human participants still need to be supplied. Their absence is recorded, not replaced with synthetic success numbers.
- Use `gh` from the terminal for GitHub interactions. Pinned dependency versions and lockfile are committed project inputs.
