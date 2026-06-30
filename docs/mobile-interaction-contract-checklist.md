# Nexproof Mobile Interaction Contract Checklist

This checklist breaks the Mobile Interaction Contract v1.0 into PR-sized implementation steps. A phase is complete only after code review, automated checks, and GitHub review have no unresolved critical or major actionable items.

## Phase 0 - Audit and Plan

- [x] Read the full mobile interaction contract.
- [x] Compare the contract against the current repo routes and components.
- [x] Confirm current app is desktop-first and lacks the `/case/[caseId]/*` mobile route family.
- [x] Confirm existing report flow uses `/api/workspace/report` but does not yet return the contract `reportDraftId` handoff.
- [x] Confirm reusable focus trap exists at `src/hooks/useFocusTrap.ts`.
- [ ] Track each implementation phase through PR, review, merge, and deployment.

## Phase 1 - Mobile Foundation PR

- [x] Add global mobile viewport support with `viewport-fit=cover`.
- [x] Add global horizontal overflow protection.
- [x] Add reduced-motion scroll behavior support.
- [x] Add mobile report and draft contracts.
- [x] Add shared mobile entity types for facts, timeline events, and patterns.
- [x] Add body scroll locking hook for overlays.
- [x] Add local persistence hook for interrupted mobile flows.
- [x] Add accessible mobile top bar.
- [x] Add accessible mobile drawer.
- [x] Add accessible bottom sheet.
- [x] Add accessible full-screen dialog/editor shell.
- [x] Add reusable bottom action bar.
- [x] Add mobile empty, error, skeleton, and filter chip components.
- [x] Run typecheck/build.
- [ ] Run CodeRabbit CLI review on the PR diff.
- [ ] Open ready-for-review GitHub PR.
- [ ] Address actionable GitHub/CodeRabbit feedback.
- [ ] Merge PR to `main`.

## Phase 2 - Workspace Mobile Route PR

- [ ] Add `/case/[caseId]/workspace`.
- [ ] Implement mobile workspace single-column shell.
- [ ] Implement sticky workspace top bar with case selector and overflow.
- [ ] Implement case snapshot card.
- [ ] Implement key facts carousel with horizontal snap scrolling.
- [ ] Implement key facts empty state.
- [ ] Implement `/case/[caseId]/facts` full list route.
- [ ] Implement timeline snapshot with 3-5 events.
- [ ] Implement `/case/[caseId]/timeline` with filter chips and event details.
- [ ] Implement observed patterns with calm support labels only.
- [ ] Implement case summary preview with gradient fade.
- [ ] Implement full summary route/screen.
- [ ] Implement sticky Generate Report CTA.
- [ ] Verify 320px to 430px layout behavior.
- [ ] Run typecheck/build and review loop.
- [ ] Merge PR to `main`.

## Phase 3 - Generate Report Mobile Flow PR

- [ ] Implement Generate Report bottom sheet.
- [ ] Add semantic radio groups for output, tone, and pattern handling.
- [ ] Default output to `both`.
- [ ] Default tone to `neutral`.
- [ ] Default patterns to `include_supported_only`.
- [ ] Add idle/building/success/error state machine.
- [ ] Prevent duplicate submissions.
- [ ] Preserve selections on failure.
- [ ] Add retry behavior.
- [ ] Add mobile payload builder with `source: "workspace_mobile"`.
- [ ] Update backend/report adapter to return or map a stable `reportDraftId`.
- [ ] Route on success to `/case/[caseId]/docuvault?source=workspace&prefill=1&draftId=...`.
- [ ] Add analytics events without sensitive text.
- [ ] Run typecheck/build and review loop.
- [ ] Merge PR to `main`.

## Phase 4 - DocuVault Mobile Handoff PR

- [ ] Add `/case/[caseId]/docuvault`.
- [ ] Implement sticky DocuVault top bar.
- [ ] Implement prefill confirmation banner.
- [ ] Implement document type card.
- [ ] Implement source-backed reassurance note.
- [ ] Implement document outline sections: Overview, Key Facts, Timeline Summary, Observed Patterns, Open Questions, Source Notes.
- [ ] Add calm Ready/Review/Empty status badges.
- [ ] Add sticky Preview PDF / Export bar.
- [ ] Add full-screen section editor.
- [ ] Protect unsaved edits with confirmation.
- [ ] Preserve local unsaved text and offer restore.
- [ ] Run typecheck/build and review loop.
- [ ] Merge PR to `main`.

## Phase 5 - Preview and Export PR

- [ ] Add `/case/[caseId]/docuvault/preview`.
- [ ] Lazy-load PDF preview surface.
- [ ] Add preview loading state.
- [ ] Add preview error/retry state.
- [ ] Add empty draft state.
- [ ] Keep back navigation returning to DocuVault.
- [ ] Add export bottom sheet.
- [ ] Add export loading/success/error/retry states.
- [ ] Preserve draft on export failure.
- [ ] Run typecheck/build and review loop.
- [ ] Merge PR to `main`.

## Phase 6 - Utility Mobile Screens PR

- [ ] Add `/case/[caseId]/evidence`.
- [ ] Add evidence filters, cards, and Add Evidence bottom sheet.
- [ ] Add `/case/[caseId]/messages`.
- [ ] Add message search, filters, cards, and detail view.
- [ ] Add `/case/[caseId]/reports`.
- [ ] Add report list, resume draft, retry failed, view/download exported actions.
- [ ] Add `/case/[caseId]/settings`.
- [ ] Add grouped settings rows with 48px targets.
- [ ] Run typecheck/build and review loop.
- [ ] Merge PR to `main`.

## Phase 7 - State, Offline, QA, and Performance PR

- [ ] Preserve workspace scroll position.
- [ ] Preserve selected report options.
- [ ] Preserve report build progress.
- [ ] Preserve current DocuVault draft.
- [ ] Preserve active filters.
- [ ] Preserve last opened case.
- [ ] Preserve PDF preview return location.
- [ ] Add offline state copy and behavior.
- [ ] Disable export when network is required and offline.
- [ ] Add sync restored copy.
- [ ] Add mobile analytics quality events.
- [ ] Ensure no sensitive case text enters analytics.
- [ ] Add responsive tests or visual QA scripts for 320, 360, 375, 390, 414, 430, and landscape.
- [ ] Add accessibility tests for dialogs, focus trap, names, and keyboard navigation.
- [ ] Add no-horizontal-overflow checks.
- [ ] Confirm workspace avoids hidden desktop rendering on mobile.
- [ ] Run typecheck/build/test and review loop.
- [ ] Merge PR to `main`.

## Final Acceptance

- [ ] Full mobile flow works: Workspace -> Generate Report -> DocuVault -> Edit -> Preview -> Export.
- [ ] No horizontal page overflow exists at supported widths.
- [ ] All tap targets are at least 44px.
- [ ] Sticky bottom bars respect safe areas.
- [ ] Final content is not hidden behind sticky actions.
- [ ] Mobile is single-column and calm.
- [ ] No desktop right rail appears on mobile workspace.
- [ ] Loading, empty, error, retry, and offline states exist where applicable.
- [ ] Dialogs, drawers, sheets, and editors are accessible.
- [ ] User edits are protected from accidental loss.
- [ ] Report generation returns or uses a saved draft id.
- [ ] DocuVault handoff is continuous.
- [ ] PDF preview and export have complete failure handling.
- [ ] Production deployment is live.
