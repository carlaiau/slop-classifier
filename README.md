# JEV typicality research

A local research harness and paste-and-scroll reader for testing JEV as a detector of AI-generated or AI-revised prose. Inspired by the reading experience in `../read-with-jev`; that project is unchanged.

**This is tested research software, not a validated detector.** The default reader uses conspicuously labeled simulated scores. Paid feasibility checks have begun under the cumulative US$25 cap. The participant study is out of scope by user instruction. See the [expanded development report](research/expanded-development-report.md) and [evidence inventory](research/status.json).

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
7. Profile real live latency in researcher-only mode and report technical gates.
8. Produce a technical decision report. The reader study and participant release are out of scope.

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

For the deliberately exploratory **prefix-mean** reader, run `ENABLE_LIVE=explore-prefix PRICE_VERIFIED_DATE=YYYY-MM-DD PORT=3103 npm run dev` after verifying today's provider price. Open `http://127.0.0.1:3103`. This local mode uses live JEV word judgments, averages content-word scores for each sentence, and displays the **raw** aggregate with a draggable 0.20–0.60 cutoff (initially 0.38). It needs `TYPESAFE_API_KEY` and the existing cumulative budget caps in `.env`, but no frozen detector or participant release. The slider reuses scores and does not call JEV. The range is for inspecting behavior, not a validated detection threshold; changing it cannot improve score ranking. The model sees only sentences scheduled near the viewport. Session text and score cache are transient; the provider's own handling is separate.

The single local process owns an exclusive persistent budget lock. It reserves up to 64,000 input tokens before each SDK call; successful validated usage reconciles the reservation, while failures keep it charged. SDK retries are disabled. A missing/corrupt ledger, occupied lock, invalid model version, or exhausted cap stops inference. A crash leaves its lock behind; inspect pending usage with the provider before manually removing a stale lock. Do not delete the ledger to reset spending.

The cap is US$25 for this study at the recorded price. The user authorized beginning capped research on 23 September 2026; installation and default UI use still never trigger spending. Additional providers must share the overall study allowance; their jobs are exported rather than executed by this harness. Real provider retention is separate from the app's transient storage policy. Do not claim zero provider retention from the absence of app persistence.

## Boundaries

- Local prototype only: no authentication or distributed budget store, no public deployment.
- English only. Short units abstain. Quotations and lists are reported in challenge audits rather than silently treated as human.
- Sentence-only reader. Word-level scores remain a research feature until localization and reader-understanding evidence justify displaying them.
- The independent transfer corpus, external checkpoint verification, and full matched evaluations still need to be completed. Human participants are outside the current scope. Their absence is recorded, not replaced with synthetic success numbers.
- Use `gh` from the terminal for GitHub interactions. Pinned dependency versions and lockfile are committed project inputs.
