# Executive chat rollout controls

## Authority and priority

The active Convex rollout configuration is authoritative. Selection is stable by user ID and cohort salt. Priority is global emergency off, explicit denylist, explicit allowlist, percentage cohort, then default mode. The browser cannot choose or override its cohort.

Every accepted turn persists the rollout configuration version, effective feature modes, and selection reason. Workers use that immutable turn snapshot so configuration changes cannot alter an in-flight answer.

Synthetic robot traffic is an isolated enforcement cohort used for preview and production smoke. Its records are marked QA/synthetic at creation and excluded from ordinary user reads.

## Configuration lifecycle

1. Propose a new monotonically versioned configuration with an idempotency key, stable salt, release contract, reason, and change ticket.
2. Review the exact modes, default, percentage, allowlists, denylists, activation time, and expiry.
3. Obtain approval from an identity different from the creator.
4. Confirm the exact release pair passed production smoke within 24 hours.
5. Activate. Activation atomically supersedes the previous active configuration.
6. Record a dashboard snapshot immediately and after every cohort change.

Never edit an active configuration in place. Propose a new version even for a percentage-only change, so every cohort transition is auditable and reversible.

Start from `config/executive-chat-rollout-template.json`, save a release-specific copy outside source control, and run `npm run manage:executive-chat-rollout -- propose <file>`. Approval, activation, and disable use the returned config ID plus `EXEC_CHAT_OPERATOR` and `EXEC_CHAT_CHANGE_REASON`. Creator and approver must be different identities. Do not place the shared release secret or production target lists in a committed file.

## Ramp

- Shadow: foreground intent, document activation, and publication only; self-correction remains off.
- Internal allowlist: enforce all approved feature families for named users; observe for at least 24 hours.
- 5%: hold for at least 24 hours.
- 25%: hold for at least 48 hours.
- 50%: hold for at least 72 hours.
- 100%: observe for seven days before declaring complete.

Advance one family at a time: foreground/activation, publication, self-correction, then durable-review resume for older eligible jobs. A percentage increase requires empty hard-stop codes and accepted soft metrics for every relevant segment.

## Emergency disable

Use the server-side emergency-disable mutation first when Convex is healthy. If database control is unavailable, set `EXEC_CHAT_EMERGENCY_OFF=1` and redeploy. Narrow variables can force document activation, publication v2, self-correction, or understanding resume off. Emergency variables may disable behavior; they are not a substitute for an approved enablement configuration.

After disabling, stop expansion and new repair/reprocess work, preserve control state and verified durable nodes, capture the affected release/config versions, and follow the incident runbook.
