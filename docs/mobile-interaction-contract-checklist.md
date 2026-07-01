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
- [x] Open ready-for-review GitHub PR.
- [x] Address actionable GitHub/CodeRabbit feedback.
- [x] Merge PR to `main`.

## Phase 2 - Workspace Mobile Route PR

- [x] Add `/case/[caseId]/workspace`.
- [x] Implement mobile workspace single-column shell.
- [x] Implement sticky workspace top bar with case selector and overflow.
- [x] Implement case snapshot card.
- [x] Implement key facts carousel with horizontal snap scrolling.
- [x] Implement key facts empty state.
- [x] Implement `/case/[caseId]/facts` full list route.
- [x] Implement timeline snapshot with 3-5 events.
- [x] Implement `/case/[caseId]/timeline` with filter chips and event details.
- [x] Implement observed patterns with calm support labels only.
- [x] Implement case summary preview with gradient fade.
- [x] Implement full summary route/screen.
- [x] Implement sticky Generate Report CTA.
- [ ] Verify 320px to 430px layout behavior.
- [x] Run typecheck/build and review loop.
- [x] Merge PR to `main`.

## Phase 3 - Generate Report Mobile Flow PR

- [x] Implement Generate Report bottom sheet.
- [x] Add semantic radio groups for output, tone, and pattern handling.
- [x] Default output to `both`.
- [x] Default tone to `neutral`.
- [x] Default patterns to `include_supported_only`.
- [x] Add idle/building/success/error state machine.
- [x] Prevent duplicate submissions.
- [x] Preserve selections on failure.
- [x] Add retry behavior.
- [x] Add mobile payload builder with `source: "workspace_mobile"`.
- [x] Update backend/report adapter to return or map a stable `reportDraftId`.
- [x] Route on success to `/case/[caseId]/docuvault?source=workspace&prefill=1&draftId=...`.
- [x] Add analytics events without sensitive text.
- [x] Run typecheck/build and review loop.
- [x] Merge PR to `main`.

## Phase 4 - DocuVault Mobile Handoff PR

- [x] Add `/case/[caseId]/docuvault`.
- [x] Implement sticky DocuVault top bar.
- [x] Implement prefill confirmation banner.
- [x] Implement document type card.
- [x] Implement source-backed reassurance note.
- [x] Implement document outline sections: Overview, Key Facts, Timeline Summary, Observed Patterns, Open Questions, Source Notes.
- [x] Add calm Ready/Review/Empty status badges.
- [x] Add sticky Preview PDF / Export bar.
- [x] Add full-screen section editor.
- [x] Protect unsaved edits with confirmation.
- [x] Preserve local unsaved text and offer restore.
- [x] Run typecheck/build and review loop.
- [x] Merge PR to `main`.

## Phase 5 - Preview and Export PR

- [x] Add `/case/[caseId]/docuvault/preview`.
- [x] Lazy-load PDF preview surface.
- [x] Add preview loading state.
- [x] Add preview error/retry state.
- [x] Add empty draft state.
- [x] Keep back navigation returning to DocuVault.
- [x] Add export bottom sheet.
- [x] Add export loading/success/error/retry states.
- [x] Preserve draft on export failure.
- [x] Run typecheck/build and review loop.
- [x] Merge PR to `main`.

## Phase 6 - Utility Mobile Screens PR

- [x] Add `/case/[caseId]/evidence`.
- [x] Add evidence filters, cards, and Add Evidence bottom sheet.
- [x] Add `/case/[caseId]/messages`.
- [x] Add message search, filters, cards, and detail view.
- [x] Add `/case/[caseId]/reports`.
- [x] Add report list, resume draft, retry failed, view/download exported actions.
- [x] Add `/case/[caseId]/settings`.
- [x] Add grouped settings rows with 48px targets.
- [x] Run typecheck/build and review loop.
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
