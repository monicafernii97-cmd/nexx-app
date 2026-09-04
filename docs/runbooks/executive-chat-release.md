# Executive chat release

## Release contract

Node.js is pinned to 24.14.1 in the repository and CI, and Vercel must remain on Node.js 24.x. The Convex package is pinned in `package.json` and the Vercel CLI is pinned in deployment workflows. Do not approve a release with a changed lockfile unless CI, production build, and the browser matrix all pass on the pinned runtime.

The Vercel project build command is `sh vercel.sh`. That script deploys Convex from the same checkout and then builds the web application. `postbuild` is deliberately not a release-manifest publisher.

After Vercel reports a successful production deployment, the production assurance workflow:

1. checks the approved robot identity and production lane;
2. runs the durable upload smoke test;
3. runs the executive-chat critical browser matrix in isolated synthetic scope;
4. reads the protected web manifest from the deployed site;
5. atomically registers the exact web and Convex artifact identities;
6. records a successful smoke result for that release pair;
7. evaluates the hard-stop operations dashboard.

Rollout activation is refused unless the active web/backend manifests agree on git SHA and every contract version and a successful smoke record for that SHA is less than 24 hours old.

Required protected values are `VERIFICATION_SECRET`, the Clerk browser-test credentials, and the approved robot identity. `CONVEX_DEPLOYMENT` is recommended so the backend identity is a deployment name rather than its URL hostname. Never print or store these values in artifacts.

## Release procedure

Before merge:

- Confirm the branch is based on the current production/main SHA and has no unrelated user changes.
- Run tests, type checking, lint, production build, schema/code generation, and the preview browser matrix.
- Confirm the preview uses an isolated Convex deployment and robot account.
- Review the production pollution audit. Classification is not permission to quarantine.
- Confirm there is no active executive-chat release or repair run.

After merge:

- Wait for the Vercel production deployment and production assurance workflow.
- Record the web deployment ID, Convex deployment ID, git SHA, workflow run, and operations snapshot.
- Confirm the release pair is compatible and the hard-stop list is empty.
- Keep customer behavior off/shadow until the data-repair report and rollout configuration receive their separate approvals.

## Automatic no-go conditions

Do not activate or expand a cohort when any of these exists:

- web/backend manifest identity mismatch;
- published assistant response without a compatible publication envelope;
- repeated self-correction beyond its budget;
- two consecutive semantic-canary failures;
- QA/synthetic evidence in a production answer;
- cross-tenant evidence access;
- destructive or unauthorized repair;
- missing or stale production smoke evidence.

Pause expansion for fallback rate above 1%, repair exhaustion above 0.5%, publication rejection above 1% pending adjudication, document activation on a social turn, retrieval while awaiting a future upload, or durable-review completion below 99% after allowed retries.

## Artifact rollback

Use the previously recorded compatible web and Convex deployment IDs. Roll back both artifacts as a pair; do not point one runtime at an incompatible peer. Register the restored pair, rerun production smoke, and verify a fresh operations snapshot before reactivation. Additive schema and audit history stay in place for the full rollback window.
