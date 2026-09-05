# Executive chat production state repair

Production repair is a separate, approval-gated operation. A chat request, fixture name, audit result, or successful deployment does not authorize mutation.

## Safe sequence

1. Run the cursor-based read-only audit for an exact conversation or case.
2. Classify legacy candidates from stored evidence. Filename alone is never enough.
3. Review every target ID and reference category. Leave genuine production documents unselected.
4. Obtain explicit approval naming the repair run and exact uploaded-file IDs.
5. Authorize the repair with operator identity, approval ID, reason, and timestamp.
6. Create immutable snapshots before any quarantine or derived-state change.
7. Apply small batches. Stop on conflicts or any count outside the approved report.
8. Verify that synthetic references are absent from selection, memory, tasks, plans, retrieval, citations, and active control while genuine attachment history remains.
9. Repeat verification and rerun the repair idempotently; the second run must produce zero changes.

## Linked derived-state repair

Quarantining an upload does not prove that every future-facing reference was removed. After the quarantine run is verified, create a separate linked derived-state repair run. The linked run must:

1. Name the verified parent repair, the exact affected conversation, one canonical production document, and every genuine duplicate to collapse.
2. Prove duplicates with a stored exact document fingerprint. A filename, page count, or visual similarity is not sufficient.
3. Audit all conversations in the same owner/case graph for the parent run's quarantined IDs. If another conversation still contains a reference, stop and scope an additional repair instead of reporting success.
4. Require the independent confirmation phrase `AUTHORIZE_DERIVED_STATE_REPAIR` and the same operator/approval ledger used by other production repairs.
5. Snapshot only derived records. Preserve upload rows, message attachments, source text, court-document content, and the parent repair snapshots.
6. Replace the active set with the canonical document, remove quarantined and exact-duplicate IDs from tasks/plans/anchors, and clear pending options or assistant offers that contain a removed ID.
7. Apply, verify, and run a second idempotence pass before enabling a live test.

Use the read-only `productionStateRepair:inspectDerivedStateGraph` operation before creating a linked repair. It returns the exact affected conversation IDs, titles, reference categories, and quarantined IDs so an outside-scope finding can be adjudicated without weakening the apply-time guard. A failed `startDerivedStateAudit` call rolls back completely and does not create a repair run.

Runtime conversation loading also filters quarantined, deleted, QA-only, out-of-owner, out-of-case, and exact-duplicate document IDs before planning. This is a containment layer, not a substitute for the auditable repair.

The system may quarantine confirmed QA/synthetic records and rebuild derived references. It may not delete source evidence, rewrite a user message, modify court-document content, or classify an unknown production document as synthetic.

## Restore

Restore only from the snapshot for the specified repair run. Automatic restore must refuse a field changed by a later legitimate event. Escalate every conflict for manual adjudication. Do not restore a suspected synthetic record into production-visible memory merely to make counts match.

Retain snapshots through the seven-day rollout observation window and the normal incident-retention period.

## Reported case boundary

The four `Signed Final Order 2-25-22.pdf` records in the reported conversation are genuine duplicate uploads and are not repair targets. The six separately adjudicated synthetic fixture uploads are candidate targets only. Quarantine remains prohibited until the user/operator explicitly approves those six exact IDs.
