# Legacy DOC Worker Production Runbook

This runbook turns legacy `.doc` support from code-ready into production-ready.

## Implementation Checklist

- Build and smoke-test the worker image in CI.
- Publish the worker image to GHCR on `main`.
- Deploy the SHA-pinned worker image to a private container host.
- Configure a long random `DOCUMENT_WORKER_TOKEN` on the worker.
- Configure Convex with `DOCUMENT_WORKER_URL` and the same `DOCUMENT_WORKER_TOKEN`.
- Enable `ENABLE_LEGACY_DOC_EXTRACTION=true` in Convex only after health checks pass.
- Enable `NEXT_PUBLIC_ENABLE_LEGACY_DOC_EXTRACTION=true` in the app after Convex is configured.
- Upload a known-readable legacy `.doc` and confirm it reaches `ready` or `partial`.
- Upload corrupt/password/macro `.doc` fixtures and confirm they fail closed.
- Keep rollback ready: set both feature flags back to `false`.

## Required Runtime

The worker must run as a private container with:

- 1 conversion per container/process.
- At least 1 vCPU.
- At least 1.5 GB memory.
- Writable `/tmp`.
- Non-root user.
- Read-only root filesystem where the platform supports it.
- No public file browsing.
- HTTPS endpoint restricted by bearer token.

## Environment

Worker service:

```text
DOCUMENT_WORKER_TOKEN=<long random secret>
WORKER_VERSION=<git sha or release id>
PORT=8080
TIKA_SERVER_URL=<optional private Tika URL>
```

Convex deployment:

```bash
npx convex env set DOCUMENT_WORKER_URL https://<private-worker-host>
npx convex env set DOCUMENT_WORKER_TOKEN <same long random secret>
npx convex env set ENABLE_LEGACY_DOC_EXTRACTION true
```

Vercel app:

```text
NEXT_PUBLIC_ENABLE_LEGACY_DOC_EXTRACTION=true
```

Keep the Vercel flag disabled until the worker health check succeeds and Convex
has the worker URL/token.

## Health Verification

After deployment:

```bash
DOCUMENT_WORKER_URL=https://<private-worker-host> node scripts/check-document-worker.mjs
```

Expected response:

```json
{
  "ok": true,
  "workerVersion": "...",
  "libreOfficeVersion": "...",
  "tikaConfigured": false
}
```

If `ok` is false, do not enable `.doc` uploads.

## Production Smoke Tests

Run these before broad rollout:

- Valid Word 97 `.doc` with paragraphs: should process and attach.
- `.doc` with tables: should preserve readable table text.
- `.doc` with headers/footers: should include visible text.
- `.doc` with Unicode characters: should preserve names and accents.
- `.xls` renamed to `.doc`: should fail as `NOT_WORD_BINARY_DOC`.
- Macro `.doc`: should fail as `MACRO_ENABLED_UNSUPPORTED`.
- Password-protected `.doc`: should fail as `PASSWORD_PROTECTED`.
- Corrupt `.doc`: should fail clearly and never attach to chat.

## Rollback

Immediate rollback:

```bash
npx convex env set ENABLE_LEGACY_DOC_EXTRACTION false
```

Then disable the Vercel public flag:

```text
NEXT_PUBLIC_ENABLE_LEGACY_DOC_EXTRACTION=false
```

With either flag disabled, `.doc` files cannot enter the chat upload happy path.
