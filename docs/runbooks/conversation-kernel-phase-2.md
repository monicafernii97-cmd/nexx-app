# Conversational kernel Phase 2 operations

## What is authoritative

For each accepted turn, Convex stores the release SHA, rollout version, kernel/context/task/tool/model/verifier versions, the foreground goal, model attempts, tool receipts, evidence IDs, task transitions, publication envelope, and final outcome receipt. `routeMode` is retained only for compatibility analytics when `route_mode_diagnostic_only_v2` is enforced.

`convex/chatWorker.ts` is intentionally only the Convex action-registration boundary. Durable job execution lives in `convex/chatGenerationRuntime.ts`, while conversational decisions remain delegated to the independently tested kernel, context, task, capability/tool, model-budget, outcome-verification, and receipt modules. The architecture contract test prevents provider, routing, or generation logic from moving back into the worker entry point.

Production application errors are retained in Convex operational records rather than inferred from a temporary Vercel log window. The primary records are `chatTurns`, `chatGenerationJobs`, `chatGenerationAttempts`, `turnReceipts`, `toolCallReceipts`, `modelEscalationReceipts`, `responsePublicationAudits`, `conversationRepairAudits`, `chatQualityCanaryRuns`, and `executiveChatOperationalSnapshots`. Vercel runtime logs remain a secondary diagnostic source.

## Release checks

1. Confirm the web and Convex release manifests identify the same Git SHA and compatible contract versions.
2. Run deterministic tests, the 226-case conversation corpus, the semantic canary, preview provider tests, and the signed-in browser sequence.
3. Confirm the current-release health slice has no hard-stop codes. Do not use a legacy rolling-window warning as proof that the new cohort failed.
4. Confirm actual usage coverage is at least 99%, Sol turn rate is at most 5%, unnecessary tools are at most 2%, and known fallback publications are zero.
5. Advance with a new immutable rollout configuration. Never edit an active configuration.

## Hard-stop response

For unauthorized evidence, a false tool/action claim, a known canned fallback, a publication without an envelope, QA/production leakage, duplicated publication, or repeated canary failure:

1. Stop cohort advancement.
2. Disable the narrowest responsible Phase 2 flag through the active server-side rollout control.
3. Preserve receipts and task/document state.
4. Capture the release SHA, rollout version, turn ID, sanitized failure code, and affected boundary.
5. Re-run the frozen incident and signed-in production sequences after the fix.
6. Reactivate only through a new approved configuration.

## Soft-stop response

Pause advancement when fallback rate exceeds 1%, repair exhaustion exceeds 0.5%, unnecessary tool use exceeds 2%, Sol exceeds 5%, current-release usage completeness falls below 99%, latency materially regresses, or cost exceeds the approved envelope. Diagnose by release and model segment before changing policy.

## Rollback rehearsal

Disable `model_policy_v2` independently first when the defect is model selection or cost. Disable `tool_broker_v2` for tool-boundary defects. Disable the kernel only when current-goal interpretation itself is defective. A rollback must keep the mediation-follow-up prohibition and may not restore weak-pronoun document activation or the removed generic order-language fallback.

After any rollback, verify one ordinary follow-up, one topic switch, one explicit document read, one task resume, one correction, and one signed-in full-document sequence. The new additive records remain in place and old records remain readable.
