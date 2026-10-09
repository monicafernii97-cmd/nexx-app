# Convex upload canary cost controls

## Post-transfer quality monitoring controls

Nexx now belongs to Convex team `monica-estimon-39537` under
`louiemaehr@gmail.com`. Its production deployment remains `blessed-rabbit-457`;
the hostname guard, backend URL, and deployment keys do not need replacement
solely because of this team transfer.

The executive chat quality canary also defaults to production only. Preview
validation uses its independent `CHAT_QUALITY_CANARY_ENABLED=true` and
`CHAT_QUALITY_CANARY_PREVIEW_UNTIL` ISO timestamp (at most 24 hours ahead).
Both the run and audit handlers enforce expiry, including schedules registered
before the window ends. `CHAT_QUALITY_CANARY_ENABLED=false` stops quality probes
without changing upload monitoring. Production's existing ten-minute quality
probe and five-minute audit are preserved, including all ten invariants.

The scheduled production rollout snapshot now runs only on the verified
production deployment. Previously preview deployments ran the same broad health
queries and stored snapshots labeled `production`. Explicit secret-protected
preview release audits remain available through `auditForRelease`; customer
chat, recovery and cleanup are unchanged. Production snapshots remain enabled
even if either synthetic canary stop switch is set.

Existing previews need this code deployed before these new quality/snapshot
controls apply. Do not claim that old preview schedules changed from a main
deployment alone. Verify production upload success/cleanup, preview schedules,
and Vercel's Convex deploy step after release. The operator's old personal CLI
login can lose project access after transfer even while preserved CI deploy
keys continue working; do not replace keys or change production URLs to work
around a personal account permission failure.

## Upload monitoring controls

The September audit recorded about 220,000 `advanceCanaryRun` calls and 73,000
upload-canary audit calls across preview activity. Current main registers the same
ten-minute synthetic upload run and five-minute audit on every deployment, with
canaries enabled unless explicitly disabled. A successful run previously made six
progress mutations. This establishes a plausible source of multiplied preview
activity; it does not prove an exact deployment-by-deployment historical count.

Production remains enabled by default for the verified `blessed-rabbit-457`
Convex site/cloud hostname. `CHAT_UPLOAD_CANARY_ENABLED=false` remains its stop
switch. The hostname matches the existing repository production-environment
guard; update both mappings as part of any separately planned account migration.

Development and preview deployments default to disabled. An intentional preview
test requires both `CHAT_UPLOAD_CANARY_ENABLED=true` and
`CHAT_UPLOAD_CANARY_PREVIEW_UNTIL` containing an absolute ISO timestamp no more
than 24 hours ahead. These are Convex server environment settings, not
`NEXT_PUBLIC_` variables. Both cron registration and handlers check the policy.
Deploy after setting the window so its cron registration is included. At expiry,
handlers stop substantive work even before the next deployment removes the cron.

Existing abandoned previews do not automatically receive a new source release.
Inventory them first and set their existing `CHAT_UPLOAD_CANARY_ENABLED=false`
switch, or redeploy this policy to the explicitly selected preview. Do not infer
that merging this PR updates every old preview deployment.

Runs record their deployment URL and a two-minute deadline. Progress is monotonic
through a finite phase sequence; duplicate phases do not write, completed runs
cannot be overwritten, and the action stops if progress is refused. Network
requests share a two-minute abort deadline. Run admission allows at most one
start per normal ten-minute interval, including after a completed run. No retry
or self-rescheduling loop is introduced. Storage cleanup remains in both success
and failure paths, and retention preserves the ownership ledger for unresolved
objects and running probes.

Customer upload processing, interrupted-upload recovery, fallback tickets,
resumable-upload cleanup, document processing and production monitoring schedules
are unchanged by this upload-canary control. Check their own useful-work volume
before changing them.

Release evidence must include production canary health after deployment, actual
preview invocation counts, and the exact older preview deployments disabled.
Passing local mocks is not live provider verification. Roll back the source or
restore an explicit preview test window if the synthetic test is needed; do not
enable unlimited testing across abandoned previews.
