# Part 4: The "Insights & Readiness" Workspace

## 🎯 Vision: Control → Truth → Guidance
Upgrade the Workspace from a "Storage Locker" (data collection) into a "Strategic Command Center." The layout mirrors how a human thinks: **What happened → When → Is there a pattern → What does it all mean?**

- **Left (Control)**: 280px Sidebar. Predictable nav, case switching, and the "Generate Report" action trigger.
- **Center (Truth)**: Flexible column (max-width 760px for text). The heart of the product: Facts → Timeline → Patterns → Narrative.
- **Right (Guidance)**: 360px Insights Rail. Prevents overwhelm by showing readiness gaps and next steps.

---

## 🧱 Component Specs (The NEXX Executive System)

To ensure a premium, "attorney-ready" feel, we will implement these standard tokens:
- **Card Radius**: 18px–22px
- **Card Padding**: 20px–28px
- **Shadows**: Ultra-soft, almost flat (minimalist glassmorphism)
- **Spacing**: 24px between sections, 16px between cards
- **Typography**: 
  - H1 (Workspace title): 28px
  - Section Headers: 18px semibold
  - Body: 14px–15px
  - Metadata: 12px muted

---

## Proposed Changes

### 1. Multi-Case Architecture (The Foundation)
We will introduce a "Case" as a first-class citizen. Even for users with one case, this provides the structure for multi-case support later.

#### [NEW] `convex/cases.ts`
- Table `cases`: `userId`, `title`, `description`, `status`.
- Mutation `getOrCreateDefault`: Ensures every user has at least one "My Case" default. **Race-safe**: Uses a uniqueness constraint on `(userId, isDefault)` and wraps create in a conflict-safe upsert pattern to prevent duplicate defaults under concurrent requests.
- Mutation `create`: For adding new cases.

#### [MODIFY] `convex/schema.ts`
- Add `caseId: v.id('cases')` to:
  - `casePins`
  - `caseMemory`
  - `timelineCandidates`
  - `incidents`
  - `documents`
- Add index `by_caseId` to all the above.

> [!WARNING]
> **Migration**: Existing rows lack `caseId`. A backfill migration step must run *before* any query filters by `caseId`. The sequence is: (1) deploy schema with optional `caseId`, (2) run backfill mutation assigning existing rows to the user's default case, (3) deploy queries that filter by `caseId`.

#### [MODIFY] `src/lib/workspace-context.tsx`
- Add `activeCaseId` and `setActiveCaseId` to context.
- Update all queries to depend on `activeCaseId`.

---

### 2. Premium Layout & Switcher
Implementing the 3-column "Executive" layout.

#### [NEW] `src/components/layout/TopNav.tsx`
- **72px height** glassmorphic bar.
- **Architectural Placement**: Spans only the center and right columns. The Sidebar remains full-height on the left.
- Case Switcher: Dropdown showing the active case name + "+ Add Case".
- Global search, notifications, and profile.

#### [MODIFY] `src/app/(app)/layout.tsx`
- Integrate `TopNav` inside the main content wrapper.
- Update the main grid to the 3-column spec (Sidebar 280px full-height | Main Flexible | Rail 360px).

---

### 3. The "Insights Rail" (Outcome-Oriented)
Replacing the collection-focused "Pinned/Points" rail with an audit-focused tool.

#### [MODIFY] `src/components/workspace/GlobalWorkspaceRail.tsx`
- **Section 1: Report Readiness**: Stats showing coverage (Facts: Strong, Timeline: Partial).
- **Section 2: Sources**: Health meter (e.g., "24 linked sources, 2 missing dates").
- **Section 3: Suggested Actions**: Contextual CTAs (e.g., "Review Conflict", "Add Dates").

---

### 4. Advanced Intelligence: Narrative & Patterns
This is the "Brain" of the workspace.

#### [NEW] `src/components/workspace/NarrativeBlock.tsx`
- Displays the AI-generated "Story of the Case".
- **Visuals**: Premium typography with a 320px max-height cap and a bottom gradient fade.
- **CTA**: "Expand Full Summary" and "Send to DocuVault".

#### [NEW] `src/components/workspace/PatternsBlock.tsx`
- **"Earned Patterns" Only**: If no patterns meet the 3-event threshold, show: *"No patterns detected. We only show patterns when behavior is repeated and clearly supported."*
- **Confidence Labels**: Use "Supported" or "Clearly Supported" instead of AI confidence scores.
- **Constraints**: 3+ events, 2+ dates, all source-backed, neutral behavior labels only.

#### [NEW] `src/lib/nexx/premiumAnalytics.ts`
- Handles the pattern detection logic and confidence scoring (0-10 scale).
- Implements the "Safe Pattern Detection" prompt rules.

---

### 5. The "Bridge" to DocuVault
Connecting the workspace intelligence to legal output.

#### [MODIFY] `src/components/Sidebar.tsx`
- Add full-width **"Generate Report"** primary button.

#### [NEW] `src/components/workspace/GenerateReportModal.tsx`
- The 2-step flow:
  1. Build Summary (Personal PDF).
  2. Convert to Court Document (Redirect to DocuVault).

#### [MODIFY] `src/app/(app)/docuvault/page.tsx`
- **Magic Moment Banner**: Show at top — *"Your case data has been organized and pre-filled. Review and edit before exporting."*
- Accept `caseId` from workspace. Pre-populated data is stored server-side in a short-lived session record (Convex `reportSessions` table with 15-min TTL) and referenced by a session token — *not* passed via URL params or client-visible transport, to avoid exposing sensitive case data.

---

## Verification Plan

### Automated Tests
- `npx tsc --noEmit` — ensure type safety for new `caseId` fields.
- `npx eslint` — clean build.

### Manual Verification
- **Multi-case**: Switch cases and verify data filter updates.
- **Pattern Detection**: Manually add 3 events of the same type and verify the pattern appears with "Clearly Supported" badge.
- **Report Flow**: Click "Generate Report", see the modal, and verify the redirect to DocuVault preserves the data.
