# Executive chat incident response

## First response

1. Stop cohort expansion.
2. Capture the conversation ID, turn ID, release git SHA, rollout version/modes, publication receipt, and redacted decision trace.
3. If a hard-stop invariant is implicated, emergency-disable only the affected family; use global off for cross-scope leakage, unauthorized repair, or an unknown failure boundary.
4. Preserve messages, documents, evidence, control state, durable-review nodes, and audit records.
5. Do not repeatedly retry a user-visible generation or exhaustive-review node beyond its stored budget.

## Triage order

- Foreground: Did the latest turn classify as social, future-upload intent, continuation, correction, or new task?
- Activation: Was document work explicitly/currently activated, carried by a valid pending action, or correctly abstained?
- Scope: Were every selected document and evidence generation authorized, production-eligible, and current?
- Capability: Did the exact document-version ledger support the claim?
- Publication: Which semantic, evidence, genericity, continuity, or capability rule passed/failed?
- Repair: Was prior behavior actually inspected, which derived state changed, and did the attempt terminate within budget?
- Durable work: Which verified node was last saved, what failed, and can the job resume without discarding verified work?
- Release: Do web/backend manifests and the persisted turn rollout snapshot match the incident artifact?

For an interrupted provider stream, inspect `chatGenerationAttempts` in attempt-number order. Confirm the first attempt was bounded, whether a provider response ID was captured, whether recovery used `continue` or `compact`, and whether the final attempt recorded a terminal event. An iterator ending without `response.completed`, `response.incomplete`, or `response.failed` is `provider_stream_interrupted`; it is not an unknown terminal failure. Never discard a saved response ID or rerun the original full evidence packet repeatedly.

## Communication and recovery

Tell the user specifically what is known, what is being rechecked, and what action is safe next. Do not use an invented analysis, claim to have inspected evidence without a receipt, or hide a recoverable error behind a generic fallback.

Recovery requires a regression test for the exact sequence, a compatible artifact pair, isolated preview proof, production smoke, and an empty hard-stop dashboard. Resume at the prior safe cohort; never jump directly back to 100%.
