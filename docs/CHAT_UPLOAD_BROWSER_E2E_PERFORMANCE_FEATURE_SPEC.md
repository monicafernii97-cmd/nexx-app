# NEXX Chat Upload Browser E2E, Security, and Performance Assurance

**Document status:** Implementation-ready feature specification  
**Owner:** NEXX Engineering  
**Primary surface:** Chat file upload and document-ingestion workflow  
**Target environments:** Pull-request preview, staging, and production  
**Recommended framework:** Playwright  
**Last updated:** August 30, 2026

## 1. Executive summary

NEXX needs a real browser-based testing layer that exercises the chat upload feature the way a signed-in user does. Existing unit, integration, and backend canary tests verify important parts of the system, but they do not prove that a user can open NEXX, select a file, upload it through the production browser path, see accurate progress and recovery states, and use the completed document in chat.

This feature adds that missing layer while preserving high platform performance and strong security boundaries. It uses synthetic accounts and synthetic documents only. It separates safe production checks from controlled failure testing so routine verification cannot disrupt customer traffic or create unsafe production data.

The final assurance model has five complementary layers:

1. **Per-PR preview smoke:** catches broken UI, selectors, validation, and integration before merge.
2. **Post-production-deploy smoke:** confirms each live release can complete a real signed-in upload.
3. **Daily production journey:** checks the full browser-to-storage-to-processing path on the live domain.
4. **Weekly expanded UX and security suite:** covers supported formats, large files, retry behavior, isolation, cleanup, accessibility, and performance budgets.
5. **Monthly staging resilience suite:** safely injects network interruption, response loss, slow connections, and partial chunk failures.

The existing 10-minute backend upload canary remains in place. It validates storage and route health without a browser; the new browser robot validates the actual customer experience.

## 2. Problem statement

The upload system can be healthy at the API or storage layer while still being unusable in the browser. Examples include:

- The upload button does not open the file selector.
- Authentication state is missing or stale.
- Cross-origin browser policy blocks the request.
- Progress appears frozen even though bytes are moving.
- The UI offers a retry too early or never enables it.
- The direct route fails but the fallback route is not reached.
- Processing finishes in the backend but the UI never reaches a usable state.
- A document is labeled ready even though complete retrieval is unavailable.
- The attachment appears ready but is not actually included in the next chat request.
- A regression affects only production configuration and cannot be reproduced by mocked tests.

The current test suite largely mocks the browser upload transport. The backend canary directly checks storage and security behavior but does not click through the product. The result is a gap between “the components passed” and “a customer can successfully use the feature.”

## 3. Goals

### 3.1 Primary goals

- Prove that a signed-in synthetic user can upload a supported file through the real NEXX chat UI.
- Prove that the uploaded file is processed and becomes safely usable in chat.
- Detect production-only browser, authentication, CORS, routing, storage, processing, and UI-state failures.
- Measure and enforce performance budgets for feedback, upload, recovery, processing, and end-to-end readiness.
- Verify that direct-upload failure recovers through the resumable fallback path.
- Verify that interrupted resumable uploads continue without resending completed chunks.
- Verify that incomplete large legal documents are not presented as fully usable.
- Verify user-to-user upload isolation and rejection of unauthenticated or unauthorized access.
- Ensure test files, chats, upload objects, and diagnostic records are cleaned up automatically.
- Provide actionable alerts and artifacts that identify the failing phase without exposing sensitive information.

### 3.2 User-experience goals

- A user receives immediate, accurate feedback after selecting a file.
- The user can distinguish uploading, processing, ready, retrying, cooling down, blocked, and failed states.
- Retry guidance explains the next useful action in plain language.
- A recoverable network failure does not force a full-file restart when resumable upload is active.
- A successful upload never silently disappears from the composer.
- A document is never represented as safe for legal analysis unless complete retrieval requirements are satisfied.

### 3.3 Platform goals

- Browser verification adds minimal load and cost to production.
- Production checks remain lightweight, isolated, rate-limited, and non-destructive.
- Failure injection runs only in staging or an isolated preview deployment.
- PR feedback is fast enough to remain useful to engineers.
- Test failures identify the responsible layer: page, authentication, validation, direct upload, fallback upload, processing, document admission, or chat attachment.

## 4. Non-goals

- Replacing unit, component, API, or backend canary tests.
- Uploading real customer documents or reusing real customer accounts.
- Performing destructive network fault injection against production.
- Load-testing production with many concurrent large files.
- Testing every model response for exact wording.
- Treating nondeterministic AI prose as the primary upload success signal.
- Migrating storage to R2 or S3 as part of this feature.
- Rebuilding the upload architecture that is already live.

## 5. Current baseline

The browser assurance feature must build on, not duplicate, the current upload resilience implementation:

- Direct browser upload remains the preferred fast path.
- A secure Convex HTTP resumable fallback supports the full allowed upload size.
- Fallback uploads are chunked and can resume without retransmitting completed chunks.
- Storage attempts are bounded and use exponential delay/cooldown.
- Direct completion response loss can be reconciled using the durable upload session and file hash.
- Failure reasons distinguish blocked connections, interrupted transfers, and lost completion responses.
- Progress diagnostics are throttled.
- Duplicate prevention, one-time authorization, token hashing, exact size/type validation, expiration, and cleanup are enforced.
- Large or truncated legal documents cannot enter chat unless complete retrieval is available.
- A backend canary runs every 10 minutes and verifies route policy, authentication rejection, storage upload, readback/hash verification, deletion, and cleanup.
- Local HTTP integration tests exercise resumable interruption and response-loss recovery.

The missing capability is a real, authenticated browser journey across the deployed application.

## 6. Success measures

### 6.1 Reliability service levels

- **Production release smoke pass rate:** 100% before a deployment is considered verified.
- **Daily production journey success:** at least 99.5% over a rolling 30-day window, excluding confirmed third-party platform incidents.
- **Weekly expanded suite pass rate:** at least 99% over a rolling 12-week window.
- **Synthetic artifact cleanup:** 100% within two hours of a completed or abandoned test run.
- **Cross-user isolation:** zero unauthorized reads or mutations.
- **Incorrect ready state:** zero instances where an incomplete legal document is shown as fully available.

### 6.2 Performance budgets

Budgets use a controlled reference network unless the test explicitly measures another profile.

| Metric | Budget | Enforcement |
|---|---:|---|
| File-selection UI acknowledgement | p95 <= 250 ms | PR and weekly |
| Validation result for an accepted local file | p95 <= 500 ms | PR and weekly |
| First visible upload progress or active state | p95 <= 1 second | release, daily, weekly |
| 1 MiB file stored on normal broadband | p95 <= 10 seconds | daily and weekly |
| 1 MiB file ready for chat | p95 <= 30 seconds | daily and weekly |
| 10 MiB PDF ready for chat | p95 <= 90 seconds | weekly |
| 24-25 MiB supported file stored on 20 Mbps reference connection | <= 120 seconds | weekly/staging |
| Resumable retry retransmission | failed chunk only, plus <= 5% protocol overhead | staging |
| Composer remains interactive during upload | no task > 200 ms attributable to upload code | weekly |
| Browser memory growth after cleanup | <= 100 MiB above pre-upload baseline | weekly |
| PR browser suite duration | <= 8 minutes | CI |
| Release smoke duration | <= 5 minutes | deploy verification |
| Daily production suite duration | <= 10 minutes | scheduled workflow |
| Weekly expanded suite duration | <= 30 minutes | scheduled workflow |

The first two weeks after implementation are a calibration period. Failures are recorded and alerted but performance-only budgets are not merge-blocking until the reference runners and normal variance are confirmed. Functional and security failures are blocking immediately.

## 7. Test cadence and scope

| Lane | Environment | Frequency | Purpose | Maximum load |
|---|---|---|---|---:|
| PR smoke | Isolated preview | Every pull request affecting chat/upload/auth/shared UI | Prevent regression before merge | 1-2 small uploads |
| Release smoke | Production | After each production deployment | Prove the newly deployed customer path works | 1 small upload |
| Daily journey | Production | Once daily, recommended 5:30 AM America/Chicago | Detect configuration, auth, browser, and route drift | 1 small PDF and optional chat turn |
| Weekly expanded | Production plus staging | Weekly, recommended Sunday 4:00 AM America/Chicago | Validate formats, recovery, isolation, accessibility, and performance | At most 6 uploads in production; heavier cases in staging |
| Resilience suite | Staging | Monthly and before major upload releases | Inject interruption, response loss, throttling, and partial failure | Controlled; never customer-facing |
| Backend canary | Production backend | Existing 10-minute cadence | Detect route/storage health quickly | Existing 1 KiB synthetic payload |

Schedules must include random jitter of up to five minutes so all scheduled systems do not start at the exact same instant.

## 8. Environment policy

### 8.1 Pull-request preview

- Uses an isolated test backend or a dedicated non-production Convex deployment.
- Uses a synthetic test tenant and test-only cases.
- May intercept or simulate network failure.
- May run destructive cleanup against synthetic test objects.
- Must never receive production secrets that are not needed for preview testing.

### 8.2 Staging

- Closely mirrors production authentication, routing, storage limits, and processing behavior.
- Uses distinct storage and database resources from production.
- Is the only environment where destructive transport failure injection is scheduled.
- Contains no customer data.
- Supports test-only fault controls that are disabled at build and runtime in production.

### 8.3 Production

- Uses dedicated synthetic users, cases, chats, and documents.
- Runs only safe, low-volume journeys.
- Does not intercept live network traffic, kill servers, corrupt stored data, or modify customer resources.
- Uses normal public product routes and normal authentication.
- Cleans its own synthetic artifacts.
- Stops immediately if the run cannot prove that it is inside the dedicated synthetic tenant.

## 9. Browser framework decision

Use **Playwright** for the browser automation layer.

Reasons:

- First-class Chromium, WebKit, and Firefox support.
- Reliable file chooser and file input handling.
- Built-in tracing, screenshots, video, network events, and performance timing.
- Strong isolated browser-context support for testing two users.
- Route interception and browser-level failure simulation for staging tests.
- Parallel execution controls and mature GitHub Actions support.
- Stable support for authenticated storage-state fixtures.

Chromium is required in every lane. WebKit and Firefox run in the weekly suite for critical upload paths. Mobile Chromium viewport coverage runs weekly. Cross-browser tests are not required for every PR because they increase feedback time and cost.

## 10. Test identity and data design

### 10.1 Synthetic users

Create at least two dedicated accounts:

- `upload-robot-owner`: creates and uses upload objects.
- `upload-robot-outsider`: attempts cross-user access and must be rejected.

Each environment receives separate accounts. Production robot accounts must be visibly marked as synthetic in application metadata and must not have administrative privileges.

### 10.2 Authentication

- Authenticate through the real sign-in path during a controlled session-bootstrap job.
- Save short-lived Playwright storage state as an encrypted CI artifact or generate it per run.
- Prefer provider-supported test tokens or machine-safe login mechanisms over storing a long-lived password.
- Never print tokens, cookies, authorization headers, or session storage to logs.
- Rotate robot credentials at least every 90 days and immediately after suspected exposure.
- Fail closed if authentication lands in an unexpected organization, user, or environment.

### 10.3 Synthetic case and chat

- Each robot user has a dedicated synthetic case named with an unmistakable prefix such as `E2E Upload Robot`.
- Every test run creates a unique chat or upload run identifier: `e2e-upload-<environment>-<timestamp>-<random>`.
- Test chats must be hidden from customer-facing analytics or explicitly tagged `synthetic=true`.
- Product analytics, billing, and AI-cost dashboards must exclude or separately report synthetic activity.

### 10.4 Synthetic files

Files are generated during the test run from deterministic templates. They contain no personal, legal, medical, financial, or customer information.

Required fixtures:

| Fixture | Purpose |
|---|---|
| 20 KiB TXT | Fast PR validation and attachment flow |
| 250 KiB PDF | Daily production full browser journey |
| 1 MiB PDF | Release and performance smoke |
| 10 MiB multipage PDF | Weekly processing and retrieval coverage |
| 24-25 MiB supported file | Maximum-size performance and resumability |
| Unsupported executable/renamed binary | Validation rejection |
| Oversize file | Client and server size rejection |
| Corrupted PDF | Safe processing failure and user guidance |
| Long legal-style PDF with unique tokens near beginning, middle, and end | Full-document retrieval/admission verification |

Each valid document includes:

- Run identifier.
- File hash.
- Page or section numbers.
- Unique deterministic tokens at the beginning, middle, and end.
- A clear statement that the document is synthetic test data.

### 10.5 Cleanup ownership

- Every created record and object is tagged with the run identifier.
- Browser tests call cleanup in a `finally` block.
- A server-side sweeper removes remaining synthetic artifacts older than two hours.
- Cleanup must cover upload sessions, upload attempts, resumable chunks, storage objects, document records, vector/index records, messages, threads, and test diagnostics.
- Cleanup is idempotent and scoped to the synthetic user plus run identifier.
- Cleanup refuses broad or untagged deletion.

## 11. User journeys

### Journey A: Select, upload, process, and attach a small file

1. Sign in as the owner robot.
2. Open the synthetic case and a new chat.
3. Select `Attach a file`.
4. Choose the synthetic PDF through the browser file chooser.
5. Verify the filename and size appear.
6. Verify an active upload state appears within one second.
7. Observe monotonic progress; it must never decrease.
8. Verify the UI moves from uploading to processing to ready.
9. Verify the send action remains appropriately disabled until the attachment is safe to use.
10. Send a deterministic prompt asking for the synthetic run identifier or document title.
11. Verify a non-error assistant response is returned and the attachment is associated with the sent message.
12. Prefer a structured provenance or attachment-reference assertion over exact model wording.
13. Remove all synthetic artifacts.

### Journey B: Direct failure recovers through resumable fallback

1. Start an upload in preview or staging.
2. Abort the direct storage request after transfer begins.
3. Verify the UI does not create an unlimited retry loop.
4. Verify the resumable fallback route begins automatically when policy permits.
5. Verify progress remains understandable during the route change.
6. Verify the same upload session and client upload key are retained.
7. Verify the file becomes ready only once.
8. Verify there is one canonical attachment and no duplicate user-visible document.
9. Verify superseded storage objects are deleted.

### Journey C: Chunk interruption resumes efficiently

1. Upload the maximum-size synthetic fixture through the resumable route.
2. Interrupt one middle chunk once.
3. Verify exponential delay occurs before retry.
4. Verify the UI communicates retry/cooldown without appearing frozen.
5. Verify previously stored chunks are not resent.
6. Verify only the failed chunk is retransmitted within the overhead budget.
7. Verify the completed object hash equals the local file hash.
8. Verify the upload produces one ready attachment.

### Journey D: Completion response is lost

1. Allow the upload completion request to succeed on the server.
2. Drop or hide the successful response in staging.
3. Verify the browser reconciles against the durable upload session.
4. Verify the UI reaches ready without uploading the entire file again.
5. Verify no duplicate attachment or unresolved object remains.

### Journey E: Large legal document admission

1. Upload the long legal-style synthetic PDF.
2. Verify processing records whether full-document retrieval is available.
3. Query deterministic tokens from the beginning, middle, and end through the supported retrieval path.
4. If all required coverage exists, verify the document becomes usable.
5. If indexing/retrieval is deliberately failed, verify the UI blocks chat use and explains that complete document access is unavailable.
6. Verify no partial or misleading ready state is shown.

### Journey F: Unsupported, corrupt, and oversize files

For each invalid fixture:

1. Select the file through the UI.
2. Verify a specific, plain-language validation message.
3. Verify no storage URL or fallback ticket is created when the client can reject safely.
4. Verify server validation also rejects a bypassed invalid request.
5. Verify the send action remains blocked.
6. Verify removing or replacing the file restores a clean composer state.

### Journey G: Cross-user isolation

1. Owner robot uploads a valid document.
2. Capture only the test upload identifier; never expose authorization secrets.
3. Open a separate isolated browser context as the outsider robot.
4. Attempt to query, attach, mutate, complete, read, or delete the owner’s upload.
5. Verify every operation is denied without confirming sensitive metadata.
6. Return to the owner context and verify the upload remains intact.

### Journey H: Reload and navigation safety

1. Begin an upload and navigate within the application or reload at supported phases.
2. Verify the application either resumes/reconciles safely or clearly explains that the user must reselect the local file.
3. Verify it does not show a phantom ready attachment.
4. Verify abandoned resumable state is cleaned by the server-side sweeper.

### Journey I: User cancellation and replacement

1. Start an upload and cancel or remove it.
2. Verify active browser work is aborted when safe.
3. Verify the old file cannot later reappear as ready.
4. Select a replacement file.
5. Verify the replacement receives a new client upload key and completes normally.
6. Verify the abandoned file is removed by immediate or scheduled cleanup.

## 12. Functional requirements

### Browser and UI

- **E2E-UI-001:** The attachment control has a stable accessible name and a stable test identifier.
- **E2E-UI-002:** The hidden file input can be addressed without relying on CSS position or visible copy.
- **E2E-UI-003:** Selected file, progress, status, retry, cooldown, replace, remove, and send controls expose stable test identifiers.
- **E2E-UI-004:** Status changes are exposed through accessible live-region semantics where appropriate.
- **E2E-UI-005:** Progress is monotonic and clamped from 0 to 100.
- **E2E-UI-006:** The send action is blocked while the file is unsafe, processing, cooling down, or irrecoverably incomplete.
- **E2E-UI-007:** The user can remove or replace a failed file without refreshing the page.
- **E2E-UI-008:** Retry controls cannot exceed server or client storage-attempt policy.
- **E2E-UI-009:** UI copy names the next useful action and does not group every transport failure into one generic message.
- **E2E-UI-010:** Mobile viewport behavior keeps filename, status, retry, remove, and send controls usable without horizontal scrolling.

### Upload and recovery

- **E2E-UP-001:** Tests record direct, resumable, and reconciled transport outcomes without logging sensitive URLs or tokens.
- **E2E-UP-002:** The fallback journey preserves the durable upload session and prevents duplicate attachments.
- **E2E-UP-003:** Chunk retry resends only missing or failed chunks.
- **E2E-UP-004:** Retry delays match the configured exponential policy within reasonable timer tolerance.
- **E2E-UP-005:** The maximum storage-attempt ceiling is enforced across page actions and server calls.
- **E2E-UP-006:** Completion response loss is reconciled before another whole-file transfer is allowed.
- **E2E-UP-007:** Final object size and SHA-256 match the local fixture.
- **E2E-UP-008:** Each successful run produces exactly one canonical stored object and one canonical attachment.
- **E2E-UP-009:** Failed or replaced objects are removed or marked for bounded cleanup.

### Processing and chat admission

- **E2E-DOC-001:** Processing state is visible separately from byte upload state.
- **E2E-DOC-002:** A document is not sendable until required extraction and retrieval checks pass.
- **E2E-DOC-003:** A truncated legal document requires complete vector or document-memory retrieval before admission.
- **E2E-DOC-004:** Failure to establish complete retrieval produces a blocking, actionable message.
- **E2E-DOC-005:** Tests can verify beginning, middle, and end retrieval using deterministic fixture tokens.
- **E2E-DOC-006:** Chat attachment association is verified independently from model prose.

### Security

- **E2E-SEC-001:** Unauthenticated upload session, chunk, completion, status, and read requests are rejected.
- **E2E-SEC-002:** Disallowed origins fail CORS policy.
- **E2E-SEC-003:** One user cannot access another user’s upload session, chunks, object, document, or attachment.
- **E2E-SEC-004:** Expired, reused, malformed, or tampered tickets are rejected.
- **E2E-SEC-005:** Declared and actual size/type mismatches are rejected.
- **E2E-SEC-006:** Test logs, traces, screenshots, videos, and reports redact cookies, tokens, signed URLs, and authorization headers.
- **E2E-SEC-007:** Production fault controls do not exist or return unavailable regardless of caller privileges.
- **E2E-SEC-008:** Cleanup operations require both synthetic ownership and a valid run identifier.
- **E2E-SEC-009:** Robot accounts have the minimum permissions required for their journeys.

### Observability

- **E2E-OBS-001:** Every run has a unique non-sensitive run identifier propagated through browser, upload session, diagnostics, and cleanup.
- **E2E-OBS-002:** The result identifies the last successful phase and first failed phase.
- **E2E-OBS-003:** Reports include timings, bytes sent, retry count, transport path, browser, deployment identifier, and cleanup result.
- **E2E-OBS-004:** Success reports contain no screenshots or videos by default.
- **E2E-OBS-005:** Failure artifacts are retained for seven days and then deleted automatically.
- **E2E-OBS-006:** A second failed confirmation run creates one actionable alert, not repeated alerts for the same incident.

## 13. Stable testability contract

The browser suite must not depend on styling classes, generated DOM structure, exact marketing copy, or arbitrary timeouts.

Add stable identifiers such as:

- `chat-upload-input`
- `chat-upload-trigger`
- `chat-upload-file-name`
- `chat-upload-status`
- `chat-upload-progress`
- `chat-upload-retry`
- `chat-upload-remove`
- `chat-upload-replace`
- `chat-send`
- `chat-message-attachment`

Accessible roles and names remain the primary user-facing contract. Test identifiers are a secondary automation contract. Removing or renaming them is a breaking test change and must update the browser suite in the same pull request.

Tests use event-based waits:

- Wait for status or network response, not a fixed sleep.
- Poll durable upload state with a bounded timeout when browser state alone is insufficient.
- Use a maximum journey deadline so a hung test fails clearly.
- Capture the last known UI status and network phase on timeout.

## 14. Fault-injection design

Fault injection is enabled only in preview or staging.

### 14.1 Browser-controlled faults

Playwright route controls may:

- Abort the first direct upload request.
- Delay selected requests.
- Drop a completion response after the server has accepted it.
- Fail one selected chunk once.
- Return a simulated offline condition before any bytes are sent.
- Throttle through supported browser or test-proxy controls.

### 14.2 Server-supported staging faults

If browser interception cannot faithfully represent a condition, a staging-only fault header may be used. Requirements:

- Compiled or runtime-disabled in production.
- Requires a rotating staging test secret.
- Accepts only a small allowlist of named faults.
- Applies only to synthetic users and run identifiers.
- Emits an explicit `synthetic_fault=true` diagnostic.
- Cannot bypass authentication, authorization, validation, or cleanup.

Allowed named faults:

- `interrupt_direct_once`
- `interrupt_chunk_once:<index>`
- `lose_completion_response_once`
- `delay_processing_once:<bounded-ms>`
- `fail_indexing_once`

Arbitrary status codes, arbitrary delays, or arbitrary storage corruption are not permitted through a public test interface.

## 15. Performance measurement

### 15.1 Timing points

Capture these monotonic browser timestamps:

- File chooser selection returned.
- Validation completed.
- Upload state first rendered.
- First byte request started.
- First progress rendered.
- Direct failure detected, if any.
- Fallback started, if any.
- Last byte accepted.
- Storage confirmed or reconciled.
- Processing started.
- Processing completed.
- Attachment became sendable.
- Message sent.
- Assistant response started and completed for journeys that include chat.

### 15.2 Byte accounting

Record:

- Local file size.
- Bytes attempted through direct transport.
- Bytes sent through resumable chunks.
- Bytes retransmitted.
- Number and indexes of retried chunks.
- Total protocol overhead where observable.

The report must distinguish expected duplicated bytes caused by an abandoned direct path from unexpected retransmission inside the resumable path.

### 15.3 Browser responsiveness

Use PerformanceObserver or Playwright page evaluation to capture:

- Long tasks during hashing and upload preparation.
- Main-thread blocking attributed to client hashing or state updates.
- Memory before selection, at peak upload, after ready, and after cleanup where the browser exposes reliable measurements.
- Count of progress renders and diagnostic requests.

Progress UI should be smooth enough to reassure the user without generating excessive React renders or diagnostic writes. The test should flag more than one visible progress update per 250 ms or an excessive diagnostic count relative to configured throttling.

### 15.4 Network profiles

- **Normal:** CI runner default network; used for functional budgets.
- **Reference broadband:** 20 Mbps download, 10 Mbps upload, 40 ms latency; used for maximum-size timing.
- **Constrained:** 5 Mbps upload, 100 ms latency; used for UX behavior, not a strict production SLO.
- **Offline/blocked:** zero connectivity for a bounded phase; staging only.

## 16. Test suite composition

### 16.1 PR smoke suite

Runs when relevant files change, including chat UI, upload client/config/errors, upload backend, HTTP routes, auth middleware, document processing, schema, or shared dependencies.

Required cases:

- Accepted small TXT or PDF can be selected and reaches ready in preview.
- Unsupported file is rejected with useful copy.
- Remove/replace returns the composer to a valid state.
- Stable upload controls meet basic accessibility expectations.

The workflow may skip when no relevant code changed, but a label or manual dispatch must allow forcing it.

### 16.2 Release smoke suite

Required cases:

- Production home and chat load successfully.
- Robot authentication is valid.
- A 1 MiB PDF uploads through the real browser path.
- Upload reaches ready and can be attached to a message.
- Synthetic artifacts are removed.

This suite runs against the immutable production deployment URL and then verifies the public domain points to the expected deployment.

### 16.3 Daily production suite

Required cases:

- Real sign-in or validated short-lived session.
- 250 KiB PDF upload.
- Processing and attachment readiness.
- One deterministic attachment association check.
- Cleanup verification.

The full AI response may be tested daily only if cost and determinism remain acceptable. Otherwise, perform one real attachment-assisted chat turn weekly and use deterministic attachment metadata verification daily.

### 16.4 Weekly expanded suite

Production-safe cases:

- TXT and PDF happy paths.
- Chrome desktop and mobile viewport.
- Firefox and WebKit critical path.
- Cross-user isolation.
- Invalid/oversize/corrupt file validation.
- Accessibility scan of upload composer states.
- Cleanup audit.
- Performance measurements for small and medium fixtures.
- Long legal-style document retrieval tokens when production cost is bounded.

Staging-only cases:

- Maximum-size file.
- Direct-route interruption and fallback.
- Failed chunk retry.
- Response-loss reconciliation.
- Processing/indexing failure.
- Constrained network profile.

### 16.5 Monthly resilience suite

- All staging fault scenarios.
- Repeated runs for flake detection.
- Maximum-size performance.
- Browser reload/navigation safety.
- Expired/reused/tampered ticket rejection.
- Stale synthetic artifact sweeper verification.
- One controlled outage drill proving alert routing and runbook accuracy.

## 17. AI-response testing policy

Upload reliability must not be judged solely by exact AI wording.

Use three assertion levels:

1. **Deterministic attachment assertion:** the sent message references the expected attachment/document identifier.
2. **Retrieval assertion:** a controlled retrieval endpoint or structured diagnostic confirms that the expected beginning, middle, or end token was retrieved.
3. **Semantic response assertion:** when a real chat response is part of the test, assert that it is successful, grounded in the attachment, and contains a required synthetic token or fact. Do not compare complete prose.

Real model calls are limited to the release, daily, or weekly lane as configured. Preview tests may use the normal non-production model configuration or stop after deterministic attachment admission to control cost and flakiness.

## 18. CI/CD workflow design

### 18.1 Proposed scripts

Add package scripts:

```json
{
  "test:e2e:upload:pr": "playwright test --project=upload-pr",
  "test:e2e:upload:release": "playwright test --project=upload-release",
  "test:e2e:upload:daily": "playwright test --project=upload-production",
  "test:e2e:upload:weekly": "playwright test --project=upload-weekly",
  "test:e2e:upload:resilience": "playwright test --project=upload-resilience"
}
```

### 18.2 Proposed workflow files

- `.github/workflows/chat-upload-e2e-preview.yml`
- `.github/workflows/chat-upload-e2e-release.yml`
- `.github/workflows/chat-upload-e2e-scheduled.yml`
- `.github/workflows/chat-upload-resilience-staging.yml`

### 18.3 Workflow controls

- Pin third-party actions to full commit SHAs.
- Use least-privilege GitHub permissions.
- Use environment-scoped secrets and required reviewers for production secret changes.
- Set workflow concurrency by environment and lane.
- Cancel superseded PR runs.
- Do not cancel an active release verification after public deployment without recording the result.
- Apply hard job timeouts.
- Retry a failed scheduled journey once after two minutes to distinguish a transient runner issue from an incident.
- Never hide the original failure when a confirmation retry succeeds; report it as degraded/transient.

### 18.4 Merge and release gates

- PR smoke is a required check for upload-relevant changes after a two-week stabilization period.
- Functional, security, or cleanup failures block merge immediately once the suite is stable.
- Performance regression beyond budget blocks merge after calibration unless an approved waiver documents the reason and follow-up.
- Release smoke failure marks the deployment unverified and triggers rollback or manual incident review according to the deployment runbook.
- Daily and weekly production failures do not automatically mutate production; they alert and start investigation.

## 19. Secrets and configuration

Recommended environment-scoped secrets:

- `E2E_BASE_URL`
- `E2E_OWNER_AUTH_SECRET` or provider-supported test token secret
- `E2E_OUTSIDER_AUTH_SECRET`
- `E2E_SYNTHETIC_CASE_ID`
- `E2E_CLEANUP_SECRET`
- `E2E_ALERT_WEBHOOK_URL`
- `E2E_STAGING_FAULT_SECRET` — staging only

Rules:

- Production and staging credentials are distinct.
- Preview workflows cannot read production robot credentials.
- No secret is exposed through `NEXT_PUBLIC_*` variables.
- Reports include secret-name presence checks but never values.
- Browser traces redact authentication headers, cookies, upload tickets, signed URLs, email addresses, and internal storage identifiers when not necessary for debugging.

## 20. Reporting and alerting

### 20.1 Result schema

Each run records:

- Run identifier.
- Lane and environment.
- Git commit and deployment identifier.
- Browser and viewport.
- Fixture name, declared size, and local hash.
- Transport path used.
- Timings for each phase.
- Retry and chunk counts.
- Functional assertions.
- Security assertions.
- Cleanup status.
- Final status: `passed`, `degraded`, `failed`, or `cleanup_failed`.
- Sanitized failure code and last successful phase.

### 20.2 Alert thresholds

| Condition | Severity | Action |
|---|---|---|
| Release smoke functional failure | Critical | Mark release unverified; page/on-call notification; consider rollback |
| Cross-user access succeeds | Critical security | Stop suite; alert security and engineering immediately |
| Daily journey fails twice | High | Open upload incident and notify engineering |
| Backend canary unhealthy plus browser failure | Critical | Treat as confirmed customer-path outage |
| Browser failure but backend canary healthy | High | Investigate UI/auth/CORS/deployment layer |
| Performance budget exceeded three consecutive runs | Medium | Create performance regression work item |
| Cleanup fails | High | Run scoped sweeper and alert before artifacts accumulate |
| One transient daily failure followed by pass | Low/degraded | Record trend; no page unless repeated |

Alerts must link to the failed run, sanitized trace, deployment, runbook, and last successful run. Alert deduplication uses the environment plus first failed phase plus deployment identifier.

## 21. Artifact policy

- Successful runs retain only structured metrics for 30 days.
- Failed runs may retain a sanitized trace, screenshot, video, and network summary for seven days.
- Raw request bodies and uploaded document bytes are not retained as CI artifacts.
- Synthetic fixture source templates may remain in the repository.
- Failure screenshots should obscure account email and any unexpected non-synthetic case names.
- If the test ever detects customer data in the synthetic account, it stops, suppresses artifacts, and raises a security alert.

## 22. Accessibility coverage

The weekly suite verifies:

- Attachment, retry, remove, replace, and send controls have accessible names.
- Keyboard-only users can open the picker, remove/replace a file, retry when allowed, and send after readiness.
- Focus moves predictably after validation failure and does not become trapped.
- Status changes are announced without excessive repetition.
- Progress and error information is not communicated by color alone.
- Mobile and zoomed layouts preserve operability.
- Disabled and cooldown states expose understandable reasons.

## 23. Production safety and load controls

- Only one production browser upload suite runs at a time.
- Production scheduled tests use a per-account and per-environment lock.
- Default production files remain 1 MiB or smaller.
- Weekly production upload volume is capped; larger and repeated tests run in staging.
- The robot stops after the first systemic failure instead of repeatedly minting sessions or retrying.
- AI calls have a monthly synthetic cost budget and a hard alert threshold.
- The suite respects normal product rate limits and does not receive a blanket bypass unless the bypass itself is narrowly scoped to the synthetic account.
- Test traffic includes a non-sensitive synthetic marker for observability filtering, not a security bypass.

## 24. Implementation layout

Recommended repository structure:

```text
e2e/
  fixtures/
    auth.ts
    files.ts
    syntheticCase.ts
    cleanup.ts
    metrics.ts
  upload/
    upload-pr.spec.ts
    upload-release.spec.ts
    upload-production.spec.ts
    upload-security.spec.ts
    upload-resilience.spec.ts
    upload-performance.spec.ts
  support/
    redact.ts
    report.ts
    faultControl.ts
playwright.config.ts
scripts/
  generate-upload-fixtures.mjs
  cleanup-e2e-upload-run.mjs
.github/workflows/
  chat-upload-e2e-preview.yml
  chat-upload-e2e-release.yml
  chat-upload-e2e-scheduled.yml
  chat-upload-resilience-staging.yml
```

Likely product changes:

- Add stable identifiers and accessible status semantics in `src/components/chat/ChatInput.tsx`.
- Add sanitized transport observability hooks in `src/lib/chat/uploadClient.ts`.
- Add synthetic run tagging and scoped cleanup functions in the Convex upload/document layer.
- Add a staging-only named fault interface if browser interception is insufficient.
- Add a durable browser-run result table only if GitHub Actions plus existing diagnostics cannot support required trending.

## 25. Data model option

Prefer existing upload diagnostics plus CI reports at first. If durable in-product trending is needed, add a small table such as `chatUploadE2eRuns` with:

- `runId`
- `environment`
- `lane`
- `deploymentId`
- `commitSha`
- `browser`
- `status`
- `phase`
- `transport`
- `fileSizeBucket`
- `durationMs`
- `retryCount`
- `cleanupStatus`
- `errorCode`
- `createdAt`

Do not store filenames containing user-entered values, file contents, raw URLs, tokens, cookies, chat prose, or customer identifiers.

## 26. Rollout plan

### Phase 0: Testability and safety prerequisites

- Add Playwright and pinned browser installation.
- Add stable selectors/accessibility hooks.
- Create environment-specific synthetic accounts and cases.
- Implement run tagging and scoped cleanup.
- Implement log/trace redaction.
- Generate deterministic fixtures.

Exit criteria:

- Synthetic identity is isolated.
- Cleanup is proven idempotent.
- No secrets appear in a deliberately failed trace.

### Phase 1: Preview smoke

- Implement small-file happy path, invalid file, and remove/replace.
- Run on upload-relevant pull requests.
- Observe for two weeks without making it a required gate.
- Fix test flakes and establish baseline timing.

Exit criteria:

- Less than 1% test-caused flake rate across at least 50 runs.
- Median runtime under five minutes.
- No leaked synthetic artifacts.

### Phase 2: Release and daily production checks

- Add production robot account.
- Add post-deployment smoke.
- Add daily lightweight journey.
- Connect alerts and runbook.

Exit criteria:

- Ten consecutive successful production runs.
- A staged failure reaches the correct alert destination.
- Cleanup completes in every run.

### Phase 3: Weekly security and cross-browser coverage

- Add outsider account isolation tests.
- Add Firefox, WebKit, mobile viewport, accessibility, and long-document coverage.
- Add performance report and trend storage.

Exit criteria:

- Security tests fail closed.
- Performance baseline is approved.
- Weekly runtime stays within 30 minutes.

### Phase 4: Staging resilience and fault injection

- Add direct interruption, chunk failure, response loss, constrained network, and indexing failure.
- Add maximum-size upload and byte-retransmission measurement.
- Prove production build has no active fault controls.

Exit criteria:

- All named recovery journeys pass.
- Maximum attempt and cooldown behavior match policy.
- Resumable retransmission remains inside budget.

### Phase 5: Enforcement and optimization

- Make stable PR checks required.
- Enforce performance budgets after calibration.
- Tune file sizes, cadence, and browser matrix based on signal and cost.
- Review metrics and alert noise quarterly.

## 27. Rollback plan

The browser assurance feature must not require product rollback when the testing infrastructure itself fails.

- Workflow-only regressions are disabled by reverting or pausing the affected workflow.
- Stable selector changes are reverted without changing upload behavior.
- Staging fault controls can be disabled centrally and are absent from production.
- Synthetic robot credentials can be revoked independently.
- If release smoke reveals a true product regression, use the existing deployment rollback process; do not bypass the failed check merely because the backend canary is healthy.
- Pausing a noisy scheduled suite does not pause the 10-minute backend canary.

## 28. Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| Robot test becomes flaky | Engineers ignore failures | Event-based waits, limited retries, flake tracking, two-week calibration |
| Production test creates clutter | Synthetic chats/files accumulate | Run tags, `finally` cleanup, two-hour server sweeper |
| Credentials leak through traces | Account compromise | Redaction, short-lived auth, minimal permissions, restricted artifact access |
| AI wording causes false failures | Noisy alerts | Assert attachment/retrieval structure; semantic rather than exact prose |
| Tests add production load | User performance degrades | Small daily fixture, serialized production runs, strict volume cap |
| Fault injection reaches production | Customer disruption | Staging-only build/runtime gate and synthetic-user requirement |
| Test tenant accidentally sees customer data | Privacy incident | Dedicated tenant, stop-and-suppress policy, cross-tenant checks |
| Preview environment differs too much | False confidence | Release and daily production journeys complement preview tests |
| Performance differs by CI runner | Unstable budgets | Reference network/profile, calibration, trend-based enforcement |
| Cleanup deletes the wrong data | Data loss | Synthetic owner + run ID requirement; refusal of broad deletion |

## 29. Operational runbook

When a browser test fails:

1. Confirm environment, deployment identifier, browser, and synthetic account.
2. Check whether the 10-minute backend canary is healthy.
3. Identify the first failed phase from the structured result.
4. If page/auth failed, inspect deployment, auth provider, middleware, and environment configuration.
5. If direct upload failed but fallback passed, classify as degraded and inspect the direct storage path.
6. If both upload paths failed, treat as a customer-impacting upload incident.
7. If storage succeeded but processing failed, inspect document processor, indexing, worker, and retrieval health.
8. If ready state was incorrect, treat as a high-severity legal-document integrity issue.
9. Verify cleanup. If cleanup failed, run the scoped cleanup command with the run identifier.
10. Reproduce in staging using the same fixture and browser profile.
11. Record whether the problem was product, environment, third party, or test infrastructure.
12. Close the alert only after one confirmation run succeeds and cleanup is verified.

## 30. Definition of done

This feature is complete only when all of the following are true:

- Playwright is installed and configured for preview, staging, and production projects.
- Dedicated owner and outsider robot identities exist in every required environment.
- Synthetic fixtures are deterministic and contain no real user data.
- Stable upload UI selectors and accessibility semantics are present.
- PR, release, daily, weekly, and monthly workflows are implemented with the specified scope.
- Production tests exercise the real public browser path and real authentication.
- Staging tests prove direct failure fallback, chunk resume, and response-loss reconciliation.
- Long-document admission is tested using beginning, middle, and end tokens.
- Cross-user isolation and unauthenticated rejection pass.
- Test logs and artifacts pass a secret/privacy review.
- All created synthetic artifacts are cleaned immediately or by the two-hour sweeper.
- Alerts are routed, deduplicated, and linked to a usable runbook.
- Functional and security checks are stable enough to act as gates.
- Performance budgets are measured, calibrated, and enforced.
- Existing unit, integration, build, lint, and backend canary checks continue to pass.
- Production contains no enabled fault-injection interface.

## 31. Final product standard

The chat upload feature should be considered fully monitored only when both of these independent signals are healthy:

1. **Backend health:** the existing 10-minute canary proves storage, route policy, verification, and cleanup.
2. **Customer-path health:** the signed-in browser robot proves a real user can select, upload, process, attach, and safely use a document.

Neither signal replaces the other. Together they provide fast outage detection, realistic user-experience verification, security regression coverage, and measurable performance protection without exposing customer data or creating meaningful production load.
