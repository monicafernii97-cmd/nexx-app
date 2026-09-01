# NEXX Chat Upload Browser E2E, Security, and Performance Assurance

**Document status:** Core browser assurance implemented in PR #242; Codex reporting and approval-control extension specified below
**Owner:** NEXX Engineering  
**Primary surface:** Chat file upload and document-ingestion workflow  
**Target environments:** Pull-request preview, staging, and production  
**Recommended framework:** Playwright  
**Last updated:** September 1, 2026

## 1. Executive summary

NEXX needs a real browser-based testing layer that exercises the chat upload feature the way a signed-in user does. Existing unit, integration, and backend canary tests verify important parts of the system, but they do not prove that a user can open NEXX, select a file, upload it through the production browser path, see accurate progress and recovery states, and use the completed document in chat.

This feature adds that missing layer while preserving high platform performance and strong security boundaries. It uses synthetic accounts and synthetic documents only. It separates safe production checks from controlled failure testing so routine verification cannot disrupt customer traffic or create unsafe production data.

The final assurance model has six complementary layers:

1. **Per-PR preview smoke:** catches broken UI, selectors, validation, and integration before merge.
2. **Post-production-deploy smoke:** confirms each live release can complete a real signed-in upload.
3. **Daily production journey:** checks the full browser-to-storage-to-processing path on the live domain.
4. **Weekly expanded UX and security suite:** covers supported formats, large files, retry behavior, isolation, cleanup, accessibility, and performance budgets.
5. **Monthly staging resilience suite:** safely injects network interruption, response loss, slow connections, and partial chunk failures.
6. **Codex operations layer:** delivers every scheduled report to one persistent Codex task, notifies the owner directly, creates a dedicated incident task for confirmed problems, and waits for explicit repair approval before changing code.

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

### 18.1 Implemented script baseline

The merged baseline provides these package scripts:

```json
{
  "test:e2e:upload:pr": "playwright test --project=upload-pr",
  "test:e2e:upload:release": "playwright test --project=upload-release",
  "test:e2e:upload:daily": "playwright test --project=upload-production",
  "test:e2e:upload:weekly": "playwright test --project=upload-weekly",
  "test:e2e:upload:resilience": "playwright test --project=upload-resilience"
}
```

### 18.2 Implemented workflow baseline

- `.github/workflows/chat-upload-e2e-preview.yml`
- `.github/workflows/chat-upload-e2e-release.yml`
- `.github/workflows/chat-upload-e2e-scheduled.yml`
- `.github/workflows/chat-upload-e2e-resilience.yml`

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

Implemented environment-scoped secrets and credentials:

- `E2E_OWNER_EMAIL` — exact-match synthetic owner identity.
- `E2E_OUTSIDER_EMAIL` — exact-match synthetic outsider identity for isolation checks.
- `CLERK_SECRET_KEY` — server-side test authentication setup.
- `CLERK_PUBLISHABLE_KEY` — matching Clerk application identity.
- `E2E_ALERT_WEBHOOK` — optional immediate failure notification destination.
- `VERCEL_TOKEN` — isolated resilience deployment only.
- `GITHUB_TOKEN` — GitHub-provided workflow token, restricted through workflow permissions.

`E2E_BASE_URL`, `E2E_LANE`, and `E2E_ALLOW_PRODUCTION` are explicit workflow configuration values rather than stored secrets.

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
  chat-upload-e2e-resilience.yml
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

## 32. Post-merge implementation status

### 32.1 PR #242 is the implementation baseline

GitHub pull request `#242`, **Add production browser assurance for chat uploads**, was merged into `main` on August 31, 2026 as merge commit `3617d22`. It implemented the core browser-assurance system described by this specification, including:

- Preview, release, daily, weekly, and resilience GitHub Actions workflows.
- Signed-in Playwright upload journeys and deterministic synthetic documents.
- Production-safe identity checks and staging-only fault injection.
- Sanitized structured result artifacts.
- Failure webhook delivery.
- Deduplicated GitHub failure issues.
- Resumable upload, security, retrieval, cleanup, and performance coverage.

The browser robot therefore exists in `main`. A local checkout that predates merge commit `3617d22` will not display those files until it is updated from `main`; absence from an older branch is not evidence that the merged robot is missing.

### 32.2 What PR #242 does not provide

PR #242 does not, by itself, provide the complete owner-facing operating experience required here. The following extension remains to be implemented and configured:

- One persistent Codex task where every daily report appears.
- A direct Codex desktop notification for each daily report and every action-required incident.
- Detection of a missing, late, cancelled, or infrastructure-failed GitHub run.
- A plain-language summary that translates GitHub and Playwright evidence for the owner.
- Creation of a dedicated Codex incident task for a confirmed or credible product problem.
- A hard approval gate that prevents Codex from editing code before the owner approves repair.
- A post-approval repair workflow with a branch, verification, reviewable pull request, and progress updates.
- Cross-links among the Codex daily report, Codex incident task, GitHub Actions run, GitHub issue, deployment, and repair pull request.

### 32.3 Operational readiness is separate from code merge

The feature is operational only when all required GitHub environments, secrets, robot users, alert destinations, and Codex automation are configured. A merged workflow with missing secrets can be present in `main` while scheduled checks skip or fail during setup.

The owner-facing daily report must explicitly state one of these readiness conditions:

- `OPERATING`: the scheduled run completed and all required reporting paths work.
- `DEGRADED`: the product check completed, but an alert, artifact, cleanup, or reporting path failed.
- `NOT_CONFIGURED`: one or more required secrets, identities, permissions, or automations are absent.
- `NO_RECENT_RUN`: the expected scheduled run did not start or cannot be found.

### 32.4 Existing schedule correction requirement

The merged scheduled workflow currently uses GitHub cron expressions `30 5 * * *` and `0 4 * * 0`. GitHub evaluates scheduled workflow cron expressions in UTC. Those expressions therefore do not represent 5:30 AM and 4:00 AM in `America/Chicago` throughout the year.

Implementation must preserve the local-time requirements in Section 7 by using GitHub Actions' timezone-aware schedule syntax. The required design is:

1. Keep the daily cron expression `30 5 * * *` and add `timezone: "America/Chicago"` to that schedule entry.
2. Keep the weekly cron expression `0 4 * * 0` and add `timezone: "America/Chicago"` to that schedule entry.
3. Apply zero to five minutes of jitter after GitHub selects the correct local-time occurrence.
4. Add a workflow syntax check confirming that both entries declare the IANA time zone.
5. Add an operational check around both Central Standard Time and Central Daylight Time dates.

The Codex reporting automation must use the same IANA time zone and must not rely on a fixed UTC offset.

## 33. Human-in-the-loop operating model

### 33.1 Required outcome

The system must behave like a careful monitoring teammate:

1. The browser robot runs independently in GitHub Actions.
2. A Codex automation checks the result after the expected completion window.
3. Codex posts a report to the persistent daily task and notifies the owner.
4. If the run is healthy, Codex records the result and takes no code action.
5. If the run is inconclusive, Codex performs bounded, non-repair diagnostics and reports what is missing.
6. If the run indicates a credible bug, Codex creates or updates a dedicated incident task.
7. Codex explains the evidence, likely customer impact, confidence, and proposed repair.
8. Codex enters `AWAITING_OWNER_APPROVAL` and stops before editing code.
9. Only after explicit approval may Codex create or edit repair code.
10. Merge, deployment, rollback, destructive data actions, and secret rotation remain separately controlled actions unless the owner explicitly authorizes them.

### 33.2 Separation of responsibilities

| Component | Responsibility | May edit product code? |
|---|---|---:|
| GitHub browser robot | Execute repeatable tests and produce sanitized evidence | No |
| GitHub alerting | Send webhook and create/update a deduplicated issue | No |
| Codex daily task | Collect, interpret, report, notify, correlate, and answer owner questions | No |
| Codex incident task before approval | Diagnose read-only, propose a repair, and wait | No |
| Codex incident task after approval | Implement the approved scope in an isolated branch/worktree and verify it | Yes |
| Owner | Approve repair, reject it, narrow scope, request more investigation, and approve merge/deploy | N/A |

### 33.3 Safety invariant

Finding a bug is not authorization to fix it. The system must preserve this invariant across retries, task restarts, context compaction, app restarts, and schedule reruns:

> No tracked source file may be changed for an incident until an approval record for that incident exists.

The approval record must identify the incident, approver, timestamp, approved scope, and any restrictions. General statements such as “keep monitoring,” “look into it,” or “tell me what happened” are not repair approval.

## 34. Codex task topology and conversation locations

### 34.1 Persistent daily task

Create one Codex project task with the exact title:

`Nexproof Daily System Check`

This is the owner’s permanent monitoring inbox and the primary place to talk with the system. Every scheduled run posts one complete report in this same task. Healthy, degraded, failed, missed, and configuration-error reports all appear here; healthy reports must not silently disappear.

The task must be associated with the saved Nexproof project and the canonical GitHub repository `monicafernii97-cmd/nexx-app`. It must not be tied to an obsolete feature branch. Read-only reporting should compare the latest completed workflow commit with the current `origin/main` head.

The owner can reply naturally in this task, including:

- “Explain what failed in plain language.”
- “Show me the evidence.”
- “Was any customer data affected?”
- “Run one confirmation check.”
- “Do not repair this yet.”
- “Create a repair plan only.”
- “Approve repair for incident NEXX-UPLOAD-2026-09-01-01.”
- “Close this as a transient infrastructure failure.”

### 34.2 Dedicated incident task

For each new confirmed or credible actionable failure, create one Codex task with this title format:

`Nexproof Repair Approval — <incident-id> — <short component>`

Example:

`Nexproof Repair Approval — NEXX-UPLOAD-2026-09-01-01 — upload readiness`

The incident task is the focused place for diagnosis, approval, implementation progress, verification evidence, and the repair pull request. The persistent daily task must link to it and retain a short status line until resolution.

Do not create duplicate incident tasks for the same unresolved signature. Update the existing task when the environment, first failed phase, deployment identifier, and primary failure code match.

### 34.3 Task ownership and lifecycle

- The daily task remains active indefinitely unless the owner pauses or retires monitoring.
- Incident tasks begin in `AWAITING_OWNER_APPROVAL`.
- A rejected incident becomes `REPAIR_DECLINED` while monitoring continues.
- An incident requiring more evidence becomes `INVESTIGATING_READ_ONLY`.
- An approved incident becomes `APPROVED_FOR_REPAIR` before any edit occurs.
- A completed repair becomes `PR_READY`, not `DEPLOYED`, unless deployment was separately authorized and verified.
- Resolved incident tasks may be archived only after the final daily task update links the resolution evidence.

### 34.4 Where the owner receives updates

The system must provide updates in these locations:

1. **Codex daily task:** authoritative owner-readable report history.
2. **Codex incident task:** focused discussion and approval for each actionable problem.
3. **Codex desktop notification:** direct notification that a report or approval request is ready.
4. **GitHub Actions run:** primary execution logs and sanitized artifact.
5. **GitHub issue:** deduplicated engineering backstop for failed scheduled workflows.
6. **Configured alert webhook:** secondary real-time channel when present.

Codex is the owner-facing source of truth. GitHub remains the engineering evidence source of truth.

## 35. Scheduling and delivery timing

### 35.1 Daily sequence

The target operating sequence in `America/Chicago` is:

| Time | Event |
|---|---|
| 5:30 AM plus up to five minutes jitter | GitHub daily browser journey starts |
| By 5:50 AM | Normal completion target, including retry and artifact upload |
| 6:00 AM | Codex daily heartbeat checks the expected run |
| 6:00–6:05 AM | Codex reads the run, sanitized result, GitHub issue state, and current `main` head |
| By 6:05 AM | Codex posts the complete daily report and sends a notification |
| Immediately after classification | If actionable, Codex creates or updates the incident task and requests approval |

### 35.2 Late or still-running jobs

If the expected GitHub run is still in progress at 6:00 AM, Codex may wait or recheck for up to 15 minutes. It must post a `LATE` report if the run remains incomplete after that window. A late run is a monitoring event even when the product has not yet been proven unhealthy.

Codex must not wait silently beyond the bounded window. The owner must receive an update stating what is late, when it started, and when the system will check again.

### 35.3 Missed-run watchdog

If no matching scheduled run exists for the expected local date:

- Classify the report as `NO_RECENT_RUN` and severity `HIGH`.
- Check whether GitHub Actions is disabled, the workflow file is missing from `main`, the schedule was skipped, or credentials prevented access.
- Create an incident task for the monitoring failure.
- Notify the owner.
- Do not claim that the product is healthy or unhealthy.
- Do not change workflow code until approval.

### 35.4 Weekly and monthly reporting

Weekly and monthly suites also post into the persistent daily task. They use report prefixes `WEEKLY ASSURANCE` and `MONTHLY RESILIENCE` and may create their own incident tasks. A daily report must not overwrite or hide a recent unresolved weekly or monthly incident.

## 36. Codex automation definition

### 36.1 Automation type

Use a Codex **heartbeat automation attached to the persistent daily task**. A heartbeat is required so all reports and follow-up conversation remain in one continuous task rather than producing disconnected scheduled jobs.

The automation must be active, use the local Nexproof project environment, use the owner’s configured Codex model unless explicitly changed, and keep normal notifications enabled. The local host, Codex app, repository access, GitHub authentication, and network connectivity are operational dependencies and must be checked during setup.

### 36.2 Required heartbeat prompt

The implementation prompt must preserve the following behavior, even if wording is adjusted for product constraints:

```text
Run the Nexproof daily system-check reporting workflow. Treat America/Chicago as the reporting time zone. Inspect the latest expected GitHub Actions run for “Chat Upload — Scheduled UX and Security Assurance” in monicafernii97-cmd/nexx-app, confirm that it ran against the expected origin/main commit, and read only sanitized artifacts and logs. Also inspect any matching open GitHub alert issue and the last successful run.

Post one complete plain-language report in this task on every run, including healthy runs. State whether the system is OPERATING, DEGRADED, NOT_CONFIGURED, or NO_RECENT_RUN; include lane, start and finish time in America/Chicago, commit, deployment or target URL, result counts, last successful phase, cleanup status, customer impact assessment, confidence, links, and recommended next action.

If there is a credible product bug, security failure, cleanup failure, missing scheduled run, or repeated infrastructure failure, create or update one dedicated Codex incident task named “Nexproof Repair Approval — <incident-id> — <short component>”. Notify the owner and link the incident task from this daily task.

Before approval, perform only bounded read-only diagnosis and safe confirmation checks. Do not edit tracked files, create a repair commit, push a branch, open a repair pull request, merge, deploy, roll back, rotate secrets, or modify production. In the incident task, explain the evidence, likely cause, affected users, proposed files or systems, verification plan, risks, and rollback plan, then set the state to AWAITING_OWNER_APPROVAL.

Begin code repair only after the owner explicitly approves the identified incident and scope. After approval, work in an isolated codex/ branch or worktree, provide progress updates, run proportionate tests, open a ready-for-review pull request to the repository default branch, and return the PR and verification evidence. Never merge or deploy unless separately authorized.
```

### 36.3 Report cursor and idempotency

The automation must persist a cursor containing:

- Last processed GitHub run ID.
- Last processed attempt number.
- Last reported commit SHA.
- Last successful run ID and timestamp.
- Open incident signatures and Codex task IDs.
- Last notification status.

If the same run is observed again without new evidence, update neither the report nor the notification. If a rerun produces a new attempt number or changed status, post a concise update linked to the original report.

## 37. Daily report contract

### 37.1 Required report header

Every report begins with one of these owner-readable outcomes:

- `✅ NEXXPROOF DAILY CHECK — HEALTHY`
- `⚠️ NEXXPROOF DAILY CHECK — DEGRADED`
- `🚨 NEXXPROOF DAILY CHECK — APPROVAL NEEDED`
- `❓ NEXXPROOF DAILY CHECK — NO RUN FOUND`
- `🔧 NEXXPROOF DAILY CHECK — NOT CONFIGURED`

Color or emoji must never be the only status indicator.

### 37.2 Required fields

Every report contains:

- Local reporting date and time in `America/Chicago`.
- Workflow lane: daily, weekly, monthly, release, or manual confirmation.
- GitHub run ID and attempt.
- Git commit tested and whether it matches the expected `origin/main` head.
- Target environment and public hostname.
- Overall workflow conclusion.
- Test totals: passed, failed, skipped, and retried.
- Browser and viewport where applicable.
- Upload transport used.
- Last successful phase.
- Sanitized failure code and failing assertion when applicable.
- Cleanup outcome.
- Whether synthetic artifacts remain.
- Whether any evidence suggests customer data exposure.
- Customer-impact assessment: none observed, possible, likely, or confirmed.
- Confidence: low, medium, or high, with a one-sentence reason.
- Comparison with the last successful run.
- Links to the Actions run, sanitized artifact, GitHub alert, incident task, relevant deployment, and runbook.
- One recommended next action.
- Approval state when an incident exists.

### 37.3 Healthy report behavior

A healthy report must be concise but complete. It confirms the customer path, cleanup, commit, and next scheduled check. It must not create an incident task.

### 37.4 Failed report behavior

A failed report must distinguish among:

- Confirmed product regression.
- Suspected product regression.
- Test flake.
- GitHub runner or dependency failure.
- Authentication or secret configuration failure.
- Monitoring system failure.
- Cleanup failure.
- Security isolation failure.

It must never label an infrastructure-only failure as a confirmed customer outage without corroborating evidence.

## 38. Direct notification contract

### 38.1 Primary notification

The owner must receive a Codex desktop/app notification after every completed daily report. Action-required notifications must identify:

- Nexproof.
- Severity.
- Short failure area.
- Whether repair approval is requested.
- The incident task title.

Example notification text:

`Nexproof needs your approval: the production upload reached processing but never became ready. Open NEXX-UPLOAD-2026-09-01-01 in Codex.`

### 38.2 Notification prerequisites

Setup must verify:

- Codex notifications are not muted for the automation.
- Windows permits notifications from Codex.
- The persistent daily task is visible and not archived.
- The local host is available for the scheduled heartbeat.
- GitHub authentication can read Actions runs, artifacts, issues, commits, and deployments.

If any prerequisite fails, report `NOT_CONFIGURED`; do not silently assume notifications are working.

### 38.3 Secondary alert paths

The existing `E2E_ALERT_WEBHOOK` remains the immediate GitHub-side failure path. GitHub issues remain the durable engineering backstop. The webhook may target a service such as email, Slack, Teams, or another owner-approved destination, but its destination must be documented during deployment.

The absence of a configured webhook must be visible in the Codex daily report. A skipped webhook is `DEGRADED` for alerting even if the browser test itself passes.

### 38.4 Notification deduplication

- One normal notification per completed scheduled report.
- One action-required notification when an incident first enters `AWAITING_OWNER_APPROVAL`.
- One reminder after 24 hours if a critical or high incident is still awaiting approval.
- No more than one reminder per 24 hours per incident.
- Immediate notification for new evidence that materially increases severity or confirms customer impact.
- A final notification when a repair PR is ready or an incident is resolved.

## 39. Incident classification and approval state machine

### 39.1 States

```text
DETECTED
  -> TRIAGING_READ_ONLY
  -> DISMISSED_TRANSIENT
  -> AWAITING_OWNER_APPROVAL
      -> REPAIR_DECLINED
      -> INVESTIGATE_MORE
      -> APPROVED_FOR_REPAIR
          -> REPAIR_IN_PROGRESS
          -> VERIFICATION_FAILED
          -> PR_READY
          -> RESOLVED
```

### 39.2 When to create an incident task

Create or update an incident task when any of the following is true:

- A daily customer journey fails after its configured test retry.
- A release smoke test fails.
- A security or cross-user isolation assertion fails once.
- Cleanup fails or synthetic artifacts remain beyond policy.
- The expected scheduled run is missing.
- Required secrets, robot identities, or permissions are missing.
- The same infrastructure failure occurs on two consecutive scheduled runs.
- A performance budget is exceeded for the configured consecutive-run threshold.
- The webhook or Codex reporting path repeatedly fails.

### 39.3 Valid approval

Approval must be explicit and incident-scoped. Valid examples include:

- `Approve repair for NEXX-UPLOAD-2026-09-01-01 as proposed.`
- `Approved, but only change the upload readiness logic and tests.`
- `Proceed with the repair; do not touch authentication.`

Invalid or insufficient examples include:

- `Okay.`
- `Look into it.`
- `What do you think?`
- `Can this be fixed?`
- `Keep me updated.`

When approval language is ambiguous, Codex must ask for explicit scope confirmation and remain in `AWAITING_OWNER_APPROVAL`.

### 39.4 Approval record

The incident task must record:

- Incident ID.
- Approving user.
- Approval timestamp in `America/Chicago` and UTC.
- Exact approved scope.
- Explicit exclusions.
- Planned branch name.
- Planned verification commands or suites.
- Whether PR creation is included.
- Whether merge or deployment is authorized; default is no.

## 40. Allowed actions before repair approval

Before approval, Codex may:

- Read GitHub Actions status, sanitized logs, and artifacts.
- Read source code, configuration, commit history, and diffs.
- Inspect open GitHub issues and recent deployment state.
- Compare failed and last-successful runs.
- Reproduce in a non-mutating local or isolated diagnostic environment.
- Run existing tests that do not modify tracked files or production.
- Dispatch at most one safe confirmation run when needed to classify a transient result.
- Verify that synthetic cleanup completed.
- Prepare a proposed repair plan, affected-file list, tests, risks, and rollback plan.
- Create or update the Codex incident task and GitHub alert.

Before approval, Codex must not:

- Edit tracked source, test, workflow, or configuration files.
- Create a repair commit or push a repair branch.
- Open a repair pull request.
- Change secrets, robot credentials, environment variables, domains, or permissions.
- Modify production or customer data.
- Merge, deploy, promote, or roll back a release.
- Close the GitHub alert as fixed.
- Suppress, weaken, skip, or delete the failing test merely to obtain a pass.

## 41. Repair workflow after approval

### 41.1 Preparation

After approval:

1. Re-read the approval scope and current incident evidence.
2. Fetch the latest repository default branch.
3. Confirm the failure still applies to the current head commit.
4. Create an isolated worktree and a branch prefixed `codex/`.
5. Post the branch and planned verification in the incident task.

### 41.2 Implementation

- Make the smallest safe change that resolves the approved root cause.
- Preserve unrelated owner changes.
- Add or update regression coverage that fails before the fix and passes afterward when practical.
- Do not broaden into unrelated refactors without new approval.
- Provide concise progress updates in the incident task during long work.

### 41.3 Verification

Verification is proportional to risk and includes, as applicable:

- Focused regression tests.
- TypeScript check.
- ESLint.
- Production build.
- Relevant Playwright project.
- Safe preview browser journey.
- Cleanup verification.
- Security isolation checks.
- Review of sanitized artifacts for secrets or customer information.

### 41.4 Pull request

When verification passes:

- Commit only the approved repair and its tests.
- Push the `codex/` branch.
- Open a ready-for-review pull request against the repository default branch.
- Link the incident, failed run, GitHub issue, verification evidence, and rollback notes.
- Allow CodeRabbit’s normal automatic review process to run; do not manually trigger it unless requested.
- Report the PR in both the incident task and persistent daily task.

Creating a PR does not authorize merge or deployment. Those remain owner-controlled unless separately approved.

### 41.5 Verification failure

If the repair does not verify:

- Stop before pushing a misleading or known-broken change.
- Report which check failed and whether the failure is related.
- Preserve evidence in the incident task.
- Return to `INVESTIGATE_MORE` or request revised scope.
- Do not weaken tests, bypass gates, or deploy an unverified repair.

## 42. Correlation, deduplication, and audit trail

### 42.1 Incident signature

The stable incident signature is:

`environment + lane + first-failed-phase + sanitized-failure-code + deployment-or-commit`

The signature is used to deduplicate GitHub issues, Codex incident tasks, and notifications.

### 42.2 Required cross-links

Each actionable incident must maintain links to:

- Persistent Codex daily report.
- Codex incident task.
- GitHub Actions run and attempt.
- Sanitized structured summary.
- GitHub alert issue.
- Tested commit and deployment.
- Last successful run.
- Repair branch and PR when created.
- Post-repair verification run.

### 42.3 Owner decision history

Do not erase prior decisions when an incident changes state. Record approvals, rejections, narrowed scope, reopened incidents, and superseding evidence as timestamped task updates.

## 43. Failure handling for the reporting layer

### 43.1 GitHub succeeds but Codex cannot report

The GitHub workflow remains authoritative. The GitHub issue and webhook provide fallback visibility for failures. On its next successful heartbeat, Codex posts a catch-up report clearly labeled `LATE DELIVERY` with the original run time.

### 43.2 Codex runs but GitHub cannot be reached

Codex posts `DEGRADED — GITHUB UNAVAILABLE`, includes the last known successful run, and does not infer current product health. It retries at the next configured interval without creating repeated incident tasks.

### 43.3 Artifact is missing

Codex uses workflow conclusion and sanitized job metadata but marks confidence low. If the workflow failed before reporter initialization, the absence of the artifact is expected evidence of a setup-stage failure. If the workflow passed without the required artifact, classify reporting as degraded and create an incident after two consecutive occurrences.

### 43.4 Task creation fails

Post the full approval request in the persistent daily task, notify the owner, and mark `INCIDENT_TASK_CREATION_FAILED`. Never begin repair merely because the dedicated task could not be created.

### 43.5 Notification delivery cannot be verified

The daily report must display `NOTIFICATION DELIVERY UNVERIFIED`. The report itself remains available in the persistent task, while GitHub issue and webhook routes remain active.

## 44. Security and privacy controls for Codex operations

- Codex reads only sanitized browser evidence by default.
- Authentication tokens, cookies, upload tickets, signed URLs, webhook URLs, and secret values must never be copied into a task message.
- Task messages must not include robot email addresses when a stable synthetic identity label is sufficient.
- Unexpected customer data causes immediate stop, artifact suppression, critical notification, and security incident creation.
- Codex must not download raw uploaded documents from production.
- GitHub authentication must use the least privilege needed to read Actions, artifacts, issues, commits, and deployments; write access is needed only for explicitly approved repair branches and PRs.
- Approval tasks must not include secrets in prompts, titles, summaries, or links.
- The reporting cursor stores identifiers and status only, not secret-bearing logs.
- Local diagnostic output containing unexpected sensitive information must not be pasted into Codex reports.

## 45. Implementation components for the Codex extension

### 45.1 Required setup actions

1. Confirm PR #242 files are present on `main`.
2. Verify GitHub scheduled workflows are enabled.
3. Configure and validate required Production and preview secrets.
4. Configure `E2E_ALERT_WEBHOOK` or explicitly document its deferred destination.
5. Correct the GitHub schedule to be `America/Chicago` and DST aware.
6. Create the persistent Codex project task `Nexproof Daily System Check`.
7. Attach the daily heartbeat automation to that task.
8. Keep normal Codex notifications enabled and verify Windows notification permissions.
9. Authenticate Codex’s local environment to read the Nexproof GitHub repository and Actions artifacts.
10. Run a manual healthy workflow and confirm a healthy report arrives.
11. Run a controlled, non-production failed workflow and confirm incident-task creation and notification.
12. Verify that no file changes occur before approval.
13. Approve a test incident in a safe branch and validate the full repair-to-PR path.

### 45.2 Optional repository helper

A small read-only reporting helper may be added under `scripts/` to normalize GitHub run metadata and the sanitized Playwright summary for Codex. If added, it must:

- Accept a run ID or discover the latest expected scheduled run.
- Output a versioned JSON schema.
- Never print secrets.
- Fail closed on unexpected artifact content.
- Include local-time conversion using `America/Chicago`.
- Distinguish no run, running, completed, cancelled, skipped, and inaccessible states.
- Remain read-only and usable without repository write permission.

### 45.3 Recommended machine-readable Codex report schema

```json
{
  "schemaVersion": 1,
  "reportType": "daily",
  "operatingState": "OPERATING",
  "severity": "none",
  "localDate": "2026-09-01",
  "timeZone": "America/Chicago",
  "workflowRunId": "123456789",
  "attempt": 1,
  "lane": "daily",
  "commit": "abcdef1",
  "matchesMain": true,
  "conclusion": "success",
  "cleanupStatus": "passed",
  "customerImpact": "none_observed",
  "confidence": "high",
  "incidentId": null,
  "approvalState": "not_required"
}
```

## 46. Rollout plan for the Codex extension

### Phase A: Reconcile and configure

- Update the working checkout from merged `main` without overwriting unrelated local work.
- Verify PR #242 files and GitHub environments.
- Correct the local-time schedule.
- Configure alerting and robot credentials.

Exit criteria:

- Manual daily and weekly dispatches start successfully.
- Sanitized summary artifacts are produced.
- GitHub failure issue and webhook paths are verified.

### Phase B: Daily task and healthy reporting

- Create the persistent Codex daily task.
- Attach the heartbeat automation.
- Implement run discovery, cursoring, and healthy reports.
- Enable direct Codex notifications.

Exit criteria:

- Seven consecutive daily runs produce exactly one report each.
- No report duplicates occur.
- A missed-run simulation produces `NO_RECENT_RUN`.

### Phase C: Incident and approval gate

- Implement incident signature and dedicated task creation.
- Implement approval state persistence.
- Enforce no-edit-before-approval behavior.
- Test rejection, narrowed approval, and ambiguous approval.

Exit criteria:

- Controlled failure creates exactly one incident task.
- Codex notifies the owner.
- Repository tracked files remain unchanged until explicit approval.
- Repeated evidence updates the same incident.

### Phase D: Approved repair workflow

- Implement isolated worktree/branch creation after approval.
- Implement verification and ready-for-review PR handoff.
- Link all evidence and owner decisions.

Exit criteria:

- A safe seeded defect completes the approved repair flow.
- The generated PR targets the default branch and is not a draft.
- Nothing is merged or deployed without separate authorization.

### Phase E: Reliability calibration

- Observe 30 days of daily reports.
- Measure notification delivery, late runs, false incidents, duplicate incidents, and approval-gate compliance.
- Tune thresholds without reducing functional or security coverage.

Exit criteria:

- 100% of scheduled dates have a report or explicit missed-run report.
- 100% of actionable incidents have an approval record before first tracked-file modification.
- 100% of repair PRs link to their incident and verification evidence.

## 47. Acceptance tests for owner-facing operations

### 47.1 Healthy day

- GitHub daily run passes.
- Codex posts one healthy report by the delivery target.
- Owner receives a Codex notification.
- No incident task is created.
- Report links resolve and cleanup is confirmed.

### 47.2 Confirmed product failure

- GitHub run fails after retry with a product assertion.
- GitHub issue is created or updated.
- Codex posts an approval-needed report.
- Owner receives a direct notification.
- Exactly one incident task is created.
- Codex performs read-only diagnosis and proposes a repair.
- No tracked file changes before approval.

### 47.3 Owner approves repair

- Approval is recorded with scope.
- Codex creates an isolated `codex/` branch or worktree.
- Repair and regression coverage are implemented.
- Verification evidence is posted.
- A ready-for-review PR targets the default branch.
- The system does not merge or deploy automatically.

### 47.4 Owner declines repair

- Incident becomes `REPAIR_DECLINED`.
- No repair branch or PR is created.
- Monitoring continues.
- A later materially different failure can create a new incident.

### 47.5 Ambiguous approval

- Owner replies with an ambiguous phrase such as “okay.”
- Codex asks for explicit incident-scoped approval.
- No tracked file is changed.

### 47.6 Missing GitHub run

- No expected scheduled run exists.
- Codex reports `NO_RECENT_RUN` instead of healthy or failed product status.
- Incident task and owner notification are created.
- Diagnosis distinguishes disabled schedule, access failure, and missing workflow.

### 47.7 Notification path failure

- Webhook is absent or fails.
- Codex report shows alerting degradation.
- GitHub issue and Codex notification continue when available.
- Product test result remains separately stated.

### 47.8 Duplicate failure

- The same incident signature recurs.
- Existing GitHub issue and Codex incident task are updated.
- No duplicate task is created.
- Notification frequency follows the deduplication policy.

### 47.9 Security failure

- Cross-user isolation test fails in a controlled non-production validation.
- Codex creates a critical incident and notifies immediately.
- Evidence is sanitized.
- No automatic repair, merge, deployment, or production mutation occurs.

### 47.10 Daylight-saving transition

- Tests simulate dates in CST and CDT.
- GitHub daily run starts once at 5:30 AM local on both dates.
- Codex report starts once at 6:00 AM local on both dates.
- No duplicate run or false missed-run report is produced during a DST transition.

## 48. Owner playbook

### 48.1 Normal daily use

Open `Nexproof Daily System Check` in Codex to see the latest result. No response is required for a healthy report.

### 48.2 When approval is requested

Open the linked incident task and choose one of four responses:

1. Approve the proposed repair.
2. Approve with a narrower scope or exclusions.
3. Ask for more read-only investigation.
4. Decline repair and continue monitoring.

### 48.3 If the owner replies in the daily task

Codex may accept an explicit incident-scoped approval in the daily task, but it must copy the approval record into the corresponding incident task before editing code. Ambiguous comments remain non-approval.

### 48.4 If the owner does not respond

The system continues monitoring and may send bounded reminders. It does not repair, merge, deploy, or close the incident on the owner’s behalf.

## 49. Owner-facing examples

### 49.1 Healthy report example

```text
✅ NEXXPROOF DAILY CHECK — HEALTHY

The production customer upload path passed today at 5:42 AM Central. The robot signed in, uploaded the synthetic PDF, waited for processing, attached it to chat, and removed all synthetic data.

Tested: main at abcdef1
Result: 5 passed, 0 failed, 0 skipped
Cleanup: passed
Customer impact: none observed
Confidence: high

Next check: tomorrow at 5:30 AM Central.
```

### 49.2 Approval-needed report example

```text
🚨 NEXXPROOF DAILY CHECK — APPROVAL NEEDED

The upload completed, but the document never became ready for chat in two attempts. The backend storage check remained healthy, so the evidence currently points to processing or browser readiness rather than a full storage outage.

Customer impact: possible — users may see completed uploads that remain unavailable
Confidence: medium
Cleanup: passed
Incident: NEXX-UPLOAD-2026-09-01-01
Repair status: waiting for your approval; no code has been changed

Open the linked incident task to review the evidence and proposed repair.
```

### 49.3 Incident approval request example

```text
I traced the failure to the readiness transition after document processing. I have not changed any code.

Proposed repair scope:
- readiness-state handling in the upload composer
- one regression test for the failed transition
- the focused production browser journey

Risks: a broad readiness change could enable send too early, so the repair will preserve the existing complete-document gate.

Reply “Approve repair for NEXX-UPLOAD-2026-09-01-01” to authorize this scope, or tell me what to narrow. Merge and deployment will still require separate authorization.
```

## 50. Expanded definition of done

The complete browser-assurance and owner-operations feature is done only when:

- PR #242 functionality is present on the repository default branch.
- Scheduled GitHub runs occur at the specified `America/Chicago` local times across DST changes.
- Required GitHub secrets, robot identities, environments, Actions permissions, and alert routes are configured.
- The persistent Codex task `Nexproof Daily System Check` exists.
- A heartbeat automation posts every expected report into that task.
- The owner receives direct Codex notifications.
- Missing or late runs are reported, not silently ignored.
- Healthy reports include cleanup and commit confirmation.
- Actionable failures create exactly one deduplicated incident task.
- Incident tasks contain evidence, impact, confidence, proposed repair, tests, risk, and rollback information.
- No tracked file is changed before explicit incident-scoped approval.
- Approved repairs use isolated `codex/` branches or worktrees.
- Repair PRs are ready for review, target the default branch, and include verification evidence.
- No repair PR is merged or deployed without separate authorization.
- GitHub, Codex, and webhook failures each have a visible fallback path.
- The owner can converse naturally in the daily task and incident tasks without needing to inspect raw CI logs.
- Audit history preserves every report, incident, approval decision, repair, and resolution link.

Until these owner-facing requirements are satisfied, the browser robot may be technically running, but the complete daily monitoring teammate described by this specification is not operationally complete.
