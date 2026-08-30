# Chat Upload Final Hardening Specification

## 1. Purpose

This specification closes the remaining reliability gaps in NEXX chat attachments after PR #231. The target is a production upload system that remains usable when the direct Convex upload host is blocked or interrupted, does not restart a large file unnecessarily, can reconcile a lost completion response, never silently analyzes an incomplete legal document, and continuously proves that the production storage path still works.

The supported product limit remains 25 MiB. No upload body is relayed through a Vercel function.

## 2. Current-state gaps being closed

| ID | Gap | Required final state |
|---|---|---|
| G1 | The secure fallback stops at 19 MiB. | Every accepted chat file up to 25 MiB has a secondary transport. |
| G2 | Direct and fallback retries resend the whole file. | The secondary transport uploads independently retryable chunks and resumes completed chunks. |
| G3 | Retry delay is fixed and the ceiling is four attempts. | At most three top-level storage attempts, with exponential backoff and a separate bounded per-chunk retry policy. |
| G4 | A direct upload whose response is lost cannot identify its stored object. | The client supplies a content SHA-256 and the server reconciles a unique, recent, unclaimed storage object before sending another copy. |
| G5 | Cleanup cannot identify a lost-response direct orphan. | Durable attempt hash/time metadata allows a cleanup action to delete a unique unclaimed object after the reconciliation window. |
| G6 | Failure monitoring is passive. | A scheduled production canary performs a real upload/read/delete cycle and records a durable result; stale or failed canaries alert. |
| G7 | Tests mock the browser upload request. | Integration coverage uses real HTTP requests against a local transport server for chunk resume, interruption, response loss, and completion idempotency, in addition to unit tests. |
| G8 | No release gate proves the deployed canary is healthy. | Production verification reads the durable canary status after deployment and fails release verification if it is missing, stale, or failed. |

## 3. Architecture

### 3.1 Primary direct transport

The existing generated Convex upload URL remains the first transport because it is efficient and already supports the complete 25 MiB limit.

Before starting storage, the browser computes SHA-256 for the selected file. The hash is persisted on the user-owned upload session and attempt. If the direct request reports `response_lost`, the client asks the server to reconcile by:

1. checking recent `_storage` metadata created inside that attempt's issuance window;
2. matching exact SHA-256, byte size, and compatible content type;
3. excluding objects already owned by another upload session or uploaded-file record;
4. accepting only one unique candidate;
5. attaching it idempotently and scheduling processing.

An ambiguous match is never attached.

### 3.2 Resumable secondary transport

After a retryable direct failure that cannot be reconciled, the client automatically creates a resumable upload bound to the same user-owned session.

- Chunk size: 4 MiB.
- Maximum chunks at the product limit: 7.
- Each chunk is addressed by upload ID and zero-based index.
- Each request carries a short-lived bearer token; only its SHA-256 is persisted.
- The expected full-file hash, full-file size, MIME type, chunk count, and chunk size are immutable.
- Each chunk is validated for exact expected length and optional client-provided SHA-256.
- A completed chunk is idempotent. Re-sending the same chunk returns success without creating another stored object.
- Completion acquires a durable assembly lease, verifies all chunks, assembles in order, validates the final SHA-256 and size, stores the final object, attaches it to the session, schedules processing, and marks temporary chunks for the next bounded cleanup sweep.
- A lost completion response is reconciled by querying the upload session.

The route is on the deployment `.convex.site` host, which is distinct from generated direct-upload URLs. No individual request approaches the 20 MiB HTTP-action limit.

### 3.3 Retry policy

Top-level storage attempts are limited to three:

1. direct transport;
2. automatic resumable transport;
3. one explicit user retry when the session remains retryable.

Retry delays use `baseDelay * 2^(attemptNo - 1)`, capped at eight seconds. The server is authoritative for `nextStorageRetryAt`.

Each resumable chunk may be attempted up to three times: the first request is immediate, followed by retries after one and two seconds. Completed chunks are never retransmitted when the resumable session is resumed.

After the direct transport and resumable transport both return a connection-class failure, automatic transport switching stops. The user is told to change networks or disable a VPN/privacy extension before the final explicit retry.

### 3.4 Cleanup

A five-minute maintenance job:

- expires abandoned resumable uploads;
- releases expired assembly leases;
- deletes temporary chunk objects for completed, failed, or expired resumable uploads;
- deletes unique, unclaimed direct response-loss objects after the reconciliation window;
- never deletes a storage object referenced by an upload session, uploaded-file record, resumable final object, or message attachment.

Cleanup operations are idempotent and bounded per invocation.

### 3.5 Complete-document admission

The existing invariant remains mandatory: when direct chat context is truncated, the attachment cannot become usable unless complete-document retrieval exists. Processing retries reuse the stored original. Coverage manifests and verified document understanding remain authoritative for full-document readiness.

### 3.6 Production canary

Every ten minutes, an internal Convex action performs a real storage canary:

1. call the deployed resumable route with an approved browser preflight and verify its CORS response;
2. verify the same route rejects an unauthenticated upload;
3. generate a normal direct upload URL;
4. POST a deterministic, non-sensitive canary payload through that URL;
5. parse the returned storage ID;
6. read storage metadata and confirm size plus SHA-256;
7. read the object contents;
8. delete the object;
9. persist latency, phase, status, and safe error code in `chatUploadCanaryRuns`.

Canary records contain no user or document data. A separate audit emits a structured error when the latest canary failed or is older than 25 minutes.

The canary intentionally exercises the real deployed resumable route, its browser-origin policy, and the production storage service. Browser-specific VPN or extension failures remain observable through user-attempt diagnostics, while the canary distinguishes those failures from a platform-wide outage.

## 4. Security and privacy invariants

1. Every resumable upload is bound to one authenticated user's upload session.
2. Raw bearer tokens are never persisted or logged.
3. Tokens expire after ten minutes and cannot be reused for another session.
4. Filenames, document text, and tokens never appear in diagnostics or canary records.
5. Exact byte size, MIME type, chunk index, chunk size, and full-file hash are server validated.
6. Assembly refuses missing, duplicated, conflicting, or out-of-range chunks.
7. Storage attachment remains idempotent and rejects a different final object.
8. CORS permits only configured NEXX application origins; absent or unapproved browser origins are rejected.
9. Canary endpoints are not public and use no user identity.

## 5. User experience

- Progress is computed across all chunks and survives a resumed upload.
- During exponential cooldown the retry action is disabled and shows the remaining wait.
- `connection_blocked`, `connection_interrupted`, `response_lost`, `integrity_mismatch`, and `attempts_exhausted` produce different recovery messages.
- Typed text and the selected file remain in the composer after retryable failures.
- After terminal exhaustion, the user must reselect the file after changing networks.
- An uploaded but incompletely indexed legal document is never described as ready.

## 6. Data model

### Upload session additions

- `clientSha256`
- `responseLossReconciledAt`
- transport union extended with `resumable`

### Upload attempt additions

- `clientSha256`
- `reconciledStorageId`
- transport union extended with `resumable`

### `chatUploadResumableUploads`

Durable upload identity, owner, session, attempt, token hash, immutable file/chunk metadata, status, assembly lease, final storage ID, expiry, and timestamps.

### `chatUploadResumableChunks`

One row per upload/index containing expected and actual byte size, optional SHA-256, temporary storage ID, request count, status, and timestamps.

### `chatUploadCanaryRuns`

Canary start/completion time, status, phase, latency, byte size, expected/actual SHA-256, safe error code, and cleanup result.

## 7. Verification requirements

### Unit and policy tests

- exponential backoff and three-attempt ceiling;
- chunk boundaries for 1 byte, exactly 4 MiB, 19 MiB, and 25 MiB;
- token hashing and expiry;
- exact chunk size and index validation;
- idempotent chunk replay;
- assembly refuses missing/conflicting chunks;
- direct hash reconciliation accepts one unique candidate and rejects zero or multiple candidates;
- cleanup never deletes referenced storage;
- complete-document admission remains fail-safe.

### HTTP integration tests

Using a real local HTTP server and real request bodies:

- upload a multi-chunk large fixture;
- reset one chunk connection, resume, and confirm earlier chunks are not resent;
- complete the upload while dropping the completion response, then reconcile;
- retry the same chunk and completion request idempotently;
- reject an incorrect chunk hash or byte range.

### Repository gates

1. Focused upload and document-ingestion suites pass.
2. Full Vitest suite passes.
3. TypeScript passes.
4. ESLint has no errors.
5. Production build passes.
6. Convex development deploy/type generation passes.
7. Ready PR targets `main`.
8. Required CI passes and no actionable review comments remain.
9. PR merges to `main`.
10. Vercel production is `READY` for the merge commit.
11. Convex production function spec includes resumable, reconciliation, cleanup, and canary functions.
12. Production canary reports a fresh success.
13. Production endpoint checks confirm approved-origin CORS and unauthenticated rejection.

## 8. Rollout and rollback

Backend schema and endpoints are additive. Deploy Convex before the new client. The client automatically uses resumable fallback only after a direct failure.

Rollback disables resumable issuance with `CHAT_RESUMABLE_UPLOADS_ENABLED=false` while leaving additive tables intact. Direct upload and the earlier single-request fallback remain available during rollback. Canary execution can be disabled independently with `CHAT_UPLOAD_CANARY_ENABLED=false`.

## 9. Definition of done

This hardening is complete only when every verification requirement above has direct evidence, the merge is present on current `main`, the exact merged frontend is serving production, the Convex production backend exposes the new functions, and a post-deploy canary has completed successfully. Green mocked tests alone are not completion evidence.

## 10. Implementation map

| Finding | Implemented control | Primary implementation |
|---|---|---|
| Direct storage was the only full-size path | Full 25 MiB resumable secondary transport on the Convex HTTP-action host | `src/lib/chat/uploadClient.ts`, `convex/http.ts`, `convex/chatUploads.ts` |
| Whole-file retries | Four MiB independently resumable chunks with stored-index recovery | `uploadResumableFile`, `getResumableUploadStatus`, resumable chunk tables |
| Unlimited/immediate retry | Three top-level attempts, exponential server cooldown, three per-chunk attempts, disabled/counting-down Retry UI | `getStorageAttemptPolicy`, `ChatInput.tsx` |
| Direct completion response loss | Browser file SHA-256 plus unique recent unclaimed-object reconciliation | `reconcileDirectUpload`, `directStorageCandidates` |
| Direct orphan cleanup | Delayed bounded cleanup of uniquely identifiable unclaimed response-loss objects | `cleanupDirectResponseLossOrphans` cron |
| Resumable orphan/race risk | Expiry, assembly leases, lease release, active-lease cleanup exclusion, referenced-object checks | `cleanupResumableUploads`, `releaseResumableAssembly` |
| Generic status-zero reporting | Existing direct diagnostics retain blocked/interrupted/response-lost distinctions; resumable failures identify chunk vs completion stage | `uploadErrors.ts`, `recordUploadClientEvent`, resumable failure codes |
| Excess diagnostics writes | Existing throttling retained and stale-attempt events are prevented from mutating the active session | `createThrottledDiagnosticRecorder`, `eventBelongsToCurrentAttempt` |
| Partial legal documents admitted as usable | Existing complete-document retrieval admission invariant retained and regression-tested | `chatUploadProcessor.ts`, `chatUploadReadiness.ts` |
| No production canary | Scheduled browser-origin upload/CORS/read/hash/delete canary, fallback route CORS/auth checks, durable status, stalled-run recovery, retention, and unhealthy structured errors | `chatUploadCanary.ts`, `crons.ts` |
| Mock-only transport tests | Real local HTTP interruption/resume/response-loss test plus policy, client, and UI suites | `resumableUpload.integration.test.ts` and adjacent upload tests |

The earlier 19 MiB single-request fallback remains deployed only as a rollback-compatible legacy route. The production client no longer selects it; the resumable route is the normal secondary transport for every accepted size.
