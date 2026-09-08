# Executive chat hardening status

This is the authoritative index for plans 14–18. The individual plans remain as incident evidence and detailed design records; this document records their relationship, delivered state, remaining rollout gates, and the evidence required to close Phase 2.

Production release identity is authoritative only when read from the active server rollout configuration and the compatible web/Convex release manifests. A Git SHA written in this document is historical evidence, not permission to promote a cohort.

## Plan index

| Plan | Purpose | State | Durable outcome |
|---|---|---|---|
| 14 — production reconciliation | Reconcile the original production incident and establish a clean release baseline. | Superseded by the later hardening releases. | Production identity, deployment, and alert reconciliation became explicit release gates. |
| 15 — executive chat hardening | Define state, evidence, publication, retry, cost, and observability invariants. | Implemented; retained as the full control specification. | Transactional turn admission, receipt-backed publication, release compatibility, and cohort-aware health. |
| 16 — incident remediation | Remove the order-language fallback and document-state failures seen in production. | Implemented and regression-locked. | Ordinary questions cannot inherit a document limitation; failed/partial work has truthful recovery behavior. |
| 17 — semantic acceptance | Preserve valid provider prose and make recommendation acceptance/resumption semantic. | Implemented and regression-locked. | Natural answers are not rewritten into route shells; terse acceptance, correction, and resumption are receipt-aware. |
| 18 — conversational kernel Phase 2 | Replace foreground modes with a conversational kernel, task ledger, explicit resource authorization, model policy, and verifier. | Code complete; controlled production rollout in progress. | Conversation-first runtime, thin worker, bounded Luna → Terra → Sol policy, tool/evidence receipts, frozen evaluation corpus, and release-specific operations gates. |

## Delivered architecture

- The current user message and recent dialogue define the foreground goal.
- Background tasks remain resumable but cannot silently become the current topic.
- `routeMode` is retained only as compatibility and diagnostic telemetry when Phase 2 is enforced.
- Documents are admitted through the server-built authorized resource inventory. Selected document evidence receives a tool receipt before it can support publication.
- The generation worker is a thin registration layer; runtime behavior is delegated to separately tested conversation, tool, response, model, cost, and persistence modules.
- Natural provider prose is preserved unless a concrete authorization, evidence, safety, interaction, or capability check fails.
- Model attempts, escalations, tool access, evidence, task transitions, validation, publication, usage provenance, cost, release, and rollout configuration are recorded.
- Release health separates the exact release/cohort from legacy attempts and rolling-window history.

## Evaluation and release evidence

- The deterministic conversation corpus contains at least 200 multi-turn/state-transition cases and includes every frozen production incident in Plan 18.
- The provider-in-loop model-policy gate evaluates the selected low-cost model against Terra, records sanitized aggregate results, and blocks on frozen incidents, critical regressions, unauthorized evidence, unwanted document activation, false tool claims, known fallbacks, and incomplete usage.
- Preview and production release assurance exercise the signed-in browser path from composer through persistence and rendered response.
- Daily semantic canaries and release-specific health checks are retained in Convex operational records and backed by deduplicated GitHub alerts.
- The staging resilience workflow runs weekly and covers provider-stream, tool authorization, publication verification, durable-task recovery, idempotency, and upload interruption behavior.

Historical implementation evidence:

- Phase 2 architecture: PR #280.
- Thin worker integration: PR #281.
- Cohort-aware observability: PR #282.
- Provider model-policy gate: PR #283.
- Semantic evaluator correction: PR #284.
- First exact-release provider evaluation: 226/226 selected-policy cases passed, with 100% frozen incidents and no critical regression.

## Controlled rollout checklist

The following gates are cumulative. A cohort is not successful when it has no real production turns.

- [x] Code, schema, compatibility, unit, integration, provider, preview-browser, and production release-assurance gates pass.
- [x] Internal/owner-only configuration activated with all Phase 2 controls enforced.
- [ ] Owner-only hold completes for at least 24 hours with real traffic and no hard or soft release-cohort stop.
- [ ] 5% cohort remains healthy for at least 24 hours.
- [ ] 25% cohort remains healthy for at least 48 hours.
- [ ] 50% cohort remains healthy for at least 72 hours.
- [ ] Flag-first rollback rehearsal completes against a declared compatible release, without data loss or reactivating the known semantic defects.
- [ ] 100% cohort remains inside every hard and soft threshold for seven stable days.
- [ ] Final completion audit confirms every Plan 18 definition-of-done item and archives obsolete compatibility material only after its rollback/retention window closes.

Before every cohort change, operators must obtain a fresh exact-release model-policy evaluation, signed-in assurance within its allowed window, a fresh semantic canary, compatible web/Convex manifests, and a release health snapshot with a non-zero real-turn denominator. The stable rollout salt must not change during the ramp.

## Repository and operational cleanup

- Resolved issue #277 is closed and superseded by the successful release assurance.
- Merged Phase 1 and Phase 2 branches/worktrees that were proven clean and represented in `main` were removed.
- Historical branches/worktrees with uncertain or unique changes remain preserved for individual reconciliation.
- Generated Convex API types and the line-ending-only Vitest status were reconciled in the clean release worktree.
- GitHub Actions use current Node-compatible pinned action versions.
- Production application errors are retained in the operational records listed in `docs/runbooks/conversation-kernel-phase-2.md`; transient Vercel logs are secondary evidence.
- Plans 14–18 are consolidated by this index without deleting their incident evidence.

## Closure rule

Do not call Phase 2 complete merely because code is merged or synthetic checks are green. Completion requires the full controlled ramp, real production denominators, seven stable days at 100%, a successful rollback rehearsal, and a final requirement-by-requirement audit.
