# Formative reader study

Status: not started. Twelve general readers, English prose, within-person comparison. This is a usability study, not a powered claim of improved detection.

## Entry and materials

Require a passing technical release, operational segmentation parity, independent transfer/false-positive review, and provenance-backed materials. Obtain the institution's applicable participant-research approval and informed consent before recruitment. Explain what data will be retained, how to withdraw, and that highlights may be wrong. Retain participant IDs rather than names in the research artifact. Do not ask participants to accuse real writers.

Prepare six matched pairs (12 passages), balanced across human, generated and mixed provenance. Pair by genre, length and difficulty. Each passage has `id`, `pair`, `provenance`, `authorship`, sentence gold labels, a reading-comprehension question, and `detectorError` for deliberately selected mistakes. Verify matching without optimizing for the detector's success. Include conventional human prose and a confident false positive.

```sh
node scripts/study.js assign --release data/pilot-release.json --passages data/study-passages.json --out data/study-assignments.json
```

Each reader sees one member of each pair, three plain and three highlighted. Passage member and condition are crossed across the twelve readers. The assignment script rotates presentation order across participants to avoid a shared fatigue sequence; never show a reader the same passage twice.

## Procedure and record

1. Obtain consent and give the same short orientation to all readers. Demonstrate on a passage outside the study set.
2. Present assigned passages. Plain condition has no model output; highlighted condition uses frozen outputs, default threshold and the research reader. Record threshold movements as exploratory behavior.
3. Ask readers to mark suspected AI-involved sentences, state confidence (0–1), answer one comprehension question, and explain their reasoning. Measure task time. Do not reveal provenance until the end.
4. Ask: “Does unhighlighted text mean it was verified human?” and “Does a highlight prove AI authorship?” Record whether both limitations are understood.
5. Debrief with true provenance and selected detector mistakes. Inspect cases where a highlight increased confidence in a false accusation.

Response JSON is an array of 12 records:

```json
{
  "participantId": "P01",
  "unhighlightedNotVerified": true,
  "highlightNotProof": true,
  "tasks": [
    {
      "passageId": "passage-id",
      "condition": "plain",
      "elapsedMs": 45000,
      "comprehensionCorrect": true,
      "judgments": [{ "sentenceId": "s0", "gold": 0, "predicted": 1, "confidence": 0.8 }]
    }
  ]
}
```

The example illustrates shape only, not collected data; a complete participant has six tasks. Score against original provenance, never predictions or reader opinions. Keep consent/withdrawal records separately from task data.

```sh
node scripts/study.js summarize --responses data/study-responses.json --out data/study-report.json
```

The report includes condition-level localization accuracy, comprehension, task time, confident false accusations (confidence ≥0.8), and the ≥10/12 interpretation gate. Pair participant-level outcomes in the narrative report; twelve readers do not justify population efficacy or subgroup claims. A numerical comprehension pass does not override an unresolved confident false accusation. Include the failure cases and resulting design changes in the final recommendation.
