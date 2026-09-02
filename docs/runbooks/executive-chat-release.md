# Executive chat release and rollback

## Release contract

The Vercel build deploys Convex from the same checkout before building Next.js. Its `postbuild` publishes the Convex release manifest with the Vercel commit SHA. After Vercel reports a successful production deployment, the production assurance workflow reads the protected web manifest, registers it, and compares both runtime manifests. A missing manifest, different commit, incompatible schema, or different control/capability/validator/prompt-policy version fails the release job.

Required protected environment values:

- `VERIFICATION_SECRET` in both Vercel and Convex, with the same value.
- `NEXT_PUBLIC_CONVEX_URL` in the GitHub `Production` environment.
- Existing browser-test identity and Clerk values used by the production assurance lane.

Manifest endpoints and mutations never return credentials or document content. Rotate `VERIFICATION_SECRET` if it appears in logs or is otherwise exposed.

## Rollout order

1. Deploy additive schema and code with semantic arbitration disabled.
2. Verify the protected web manifest and Convex compatibility query are green.
3. Run the synthetic `Analyze file → which → please do so` browser journey.
4. Enable shadow understanding and inspect redacted decision timelines.
5. Enable control state for internal/synthetic traffic, then stable conversation cohorts at 5%, 25%, 50%, and 100%.
6. Keep the capability ledger and publication gate enabled wherever control state is authoritative.

## Automatic pause conditions

Pause rollout for any cross-scope reference, false unreadability publication, publication without an envelope, manifest mismatch, two consecutive canary failures, repair exhaustion above 2%, or added p95 latency above 300 ms for 15 minutes.

## Rollback

Set the affected `EXEC_CHAT_*` flag to `off` and redeploy. Schema additions and audit records remain. Never delete control state during rollback. The publication gate is a safety boundary: if its surrounding orchestration is disabled, responses must still use validated publication or a fixed recovery notice; do not restore an arbitrary-content completion path.

After rollback, confirm:

1. The production canary is stable or deliberately paused.
2. No active manifest claims incompatible web/backend versions.
3. Existing conversations and uploaded documents remain available.
4. Redacted decision timelines contain no raw document text or credentials.

