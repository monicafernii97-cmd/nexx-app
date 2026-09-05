# Durable full-document review repair

Use this procedure only for a specifically identified failed or dead-letter review run. It creates a new durable-review run and preserves the failed run as historical evidence.

## Preconditions

- The exact uploaded-file ID and failed run ID have been independently identified.
- The file is genuine production data, not quarantined or deleted.
- The failed run still points to the file's active memory generation.
- The complete source-unit manifest has one contiguous, readable row for every expected page.
- A stable operator ID, a different approver ID, and a change ticket are available.

Set the production Convex URL and `VERIFICATION_SECRET` without printing either value. Use one unique operation ID for the whole sequence.

## Inspect

Set `DURABLE_REVIEW_SOURCE_RUN_ID`, `DURABLE_REVIEW_UPLOADED_FILE_ID`, `DURABLE_REVIEW_EXPECTED_UNITS`, and `EXEC_CHAT_OPERATOR`, then run:

```text
npm run manage:durable-review-repair -- inspect <operation-id>
```

Inspection is idempotent. It fails closed if run, file, generation, manifest, unit count, active pointer, or canonical chunk sequence does not match. Review the returned immutable `beforeJson` facts before authorizing.

## Authorize

Set `EXEC_CHAT_APPROVER`, `EXEC_CHAT_CHANGE_TICKET`, and a specific `EXEC_CHAT_CHANGE_REASON`, then run:

```text
npm run manage:durable-review-repair -- authorize <operation-id>
```

The approver must differ from the recorded operator. Reusing an operation ID with different identities or scope is rejected.

## Apply

Set `EXEC_CHAT_OPERATOR` to the original operator and set `DURABLE_REVIEW_CONFIRMATION` to `AUTHORIZE_DURABLE_REVIEW_RESTART`, then run:

```text
npm run manage:durable-review-repair -- apply <operation-id>
```

Apply rechecks all approved facts atomically, creates one `dur_v2` replacement run, changes only the file's active review pointers/status, and schedules the durable worker. Repeating apply returns the same replacement run.

## Observe and verify

Use `status` while the run is active. Use `verify` after it reports ready:

```text
npm run manage:durable-review-repair -- status <operation-id>
npm run manage:durable-review-repair -- verify <operation-id>
```

Verification remains incomplete until all of these are true: the replacement is ready and `dur_v2`; the file points to that run and its verified record; the record covers every canonical chunk; and the source-unit receipt equals the exact expected count. For the reported signed order, the only acceptable receipt is 46/46 pages.

Do not call the exhaustive-review feature operational from a queued, mapping, reducing, failed, or merely extracted state.
