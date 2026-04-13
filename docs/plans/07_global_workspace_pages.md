# Part 3 — Global Case Workspace & Destination Pages

> **Branch**: `feature/global-workspace-refactor`  
> **Scope**: ~15 files  
> **Estimated lines**: ~1,100

---

## Goal

Transform the "Pinned Items" rail into a **Global Workspace Rail** that is visible across the entire platform (including Dashboard, Incident Reports, etc.). This ensures the user's "Persistent Context" (Key Facts, Strategy, Risks) is always one click away.

---

## Architecture

### 1. Global State Management
We will create a `WorkspaceProvider` in `(app)/layout.tsx` to fetch:
- `casePins.listByUser`
- `caseMemory.listByUser` (filtered/segmented into Key Points)
- `timelineCandidates.listByUser` (for quick-add counts)

### 2. Layout Structure
The `AppShellLayout` will be updated to a 3-column paradigm:
1. **Left**: Global Sidebar (Nav)
2. **Center**: Main Page Content (Liquid width)
3. **Right**: Workspace Rail (Persistent Reference)

---

## Proposed Changes

### Global UI

#### [MODIFY] `src/app/(app)/layout.tsx`
- Wrap children in `WorkspaceProvider`.
- Integrate `GlobalWorkspaceRail` alongside `Sidebar` and `main` content.

#### [NEW] `src/components/workspace/WorkspaceProvider.tsx`
- Context provider using Convex queries for `casePins` and `caseMemory`.
- Exposes `pins`, `memory`, `itemCounts`, and management mutations (`removePin`, `removeMemory`).

#### [NEW] `src/components/workspace/GlobalWorkspaceRail.tsx` (Expanded from PinnedItemsRail)
- **Persistent Visibility**: Visible on all `(app)` pages.
- **Tabbed Interface**:
    - **📌 Pinned**: Quick-access items for current focus.
    - **🔑 Key Points**: Rollup of facts, strategy, and risks.
- **Micro-Actions**: View details, unpin, remove.
- **Mobile Behavior**: Collapses to a slim icon bar on the right edge.

---

### Shared Detail Pages
Even with the global rail, full-page views are needed for bulk management, search, and deep analysis.

#### [NEW] `src/app/(app)/chat/overview/page.tsx`
- Bento rollup of case progress.

#### [NEW] `src/app/(app)/chat/key-points/page.tsx`
- Full-screen management of `caseMemory` with 12-type filtering.

#### [NEW] `src/app/(app)/chat/pinned/page.tsx`
- Management of all pinned fragments.

#### [NEW] `src/app/(app)/chat/timeline/page.tsx`
- Chronological event explorer.

---

## User Review Required

> [!IMPORTANT]
> **Persistent Real Estate**: Making the rail "always visible" reduces the center content width by 320px on desktop. We will ensure the center column is responsive and uses `max-w-5xl` for optimal reading.
> [!TIP]
> **Visibility Toggle**: We will include a "Collapse" button on the rail (to a 40px icon bar) so users can reclaim full-screen width when needed.

---

## Verification Plan

### Automated Tests
- `npm run build`: Verify all pages generate routes successfully.
- `npx tsc`: Ensure global context types flow correctly to components.

### Manual Verification
1. **Global Persistence**: Verify the rail stays populated while navigating from Dashboard -> Chat -> Incident Report.
2. **Interaction**: Pin an item in Chat and verify it appears in the rail *and* the Dashboard view immediately.
3. **Responsive**: Check collapse/expand behavior on small vs large screens.
4. **Accessibility**: Verify keyboard navigation (Tab/Shift+Tab, Enter/Space to toggle collapse), visible focus ring on collapse/expand controls, `aria-expanded` state updates, and that pinned items are reachable via keyboard and announced by screen readers.
