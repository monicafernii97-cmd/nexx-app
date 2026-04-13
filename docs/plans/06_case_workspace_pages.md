# Part 3 — Case Workspace Destination Pages

> **Branch**: `feature/case-workspace-pages`  
> **Scope**: ~12 files (8 new + 4 modified)  
> **Estimated lines**: ~900

---

## Goal

Build the 4 case workspace pages where saved/pinned items live. Users currently save content from chat but have nowhere to review it. These pages complete the loop.

---

## Architecture

```
/chat/key-points    → CaseMemory items (12 types, filterable)
/chat/pinned        → CasePins items (9 types, reorderable)
/chat/timeline      → TimelineCandidates (candidate/confirmed, chronological)
/chat/overview      → Dashboard rollup of all 3 collections + stats
```

All 4 pages live under the `(app)/chat/` route group to inherit the app shell layout (sidebar + toast). Each uses existing Convex queries — **no new backend changes**.

---

## Proposed Changes

### Shared Components

#### [NEW] `src/components/workspace/ItemCard.tsx`
Reusable card for displaying a saved/pinned item:
- Type badge (color-coded by save type or pin classification)
- Title + content preview (truncated, expandable)
- Timestamp
- Delete button (with confirmation)
- Uses existing design system (`glass-ethereal`, `card-premium` patterns from dashboard)

#### [NEW] `src/components/workspace/EmptyState.tsx`
Shared empty state for pages with no data:
- Icon + heading + description + CTA button
- Matches dashboard's "Pristine Record" pattern
- Props: `icon`, `title`, `description`, `actionLabel`, `actionHref`

#### [NEW] `src/components/workspace/FilterTabs.tsx`
Horizontal filter pill row:
- "All" + type-specific tabs
- Active state with accent underline
- Count badges per type
- Used on Key Points (12 types) and Timeline (candidate/confirmed)

---

### Pages

#### [NEW] `src/app/(app)/chat/overview/page.tsx`
Case workspace overview dashboard:
- Stats strip: total key points, pins, timeline events
- Recent items from each collection (3 per section)
- "View all →" links to respective pages
- Uses `PageContainer`, `PageHeader` with `Notebook` icon
- Queries: `caseMemory.listByUser`, `casePins.listByUser`, `timelineCandidates.listByUser`

#### [NEW] `src/app/(app)/chat/key-points/page.tsx`
Full list of case memory items:
- FilterTabs for 12 save types
- ItemCard grid (2 columns on desktop)
- Delete with ownership verification
- Search/filter by title
- Queries: `caseMemory.listByUser`, `caseMemory.listByType`
- Mutations: `caseMemory.remove`

#### [NEW] `src/app/(app)/chat/pinned/page.tsx`
Active pins from the workspace rail:
- ItemCard list (single column, emphasizes order)
- Type badge with 9 pin classifications
- Unpin button
- Queries: `casePins.listByUser`
- Mutations: `casePins.remove`

#### [NEW] `src/app/(app)/chat/timeline/page.tsx`
Timeline candidates (chronological view):
- FilterTabs: All / Candidates / Confirmed
- Vertical timeline layout with date markers
- "Confirm" button on candidate items
- Tags display
- Queries: `timelineCandidates.listByUser`, `timelineCandidates.listByStatus`
- Mutations: `timelineCandidates.confirm`, `timelineCandidates.remove`

---

### Navigation Update

#### [MODIFY] `src/components/Sidebar.tsx`
Add "Overview" sub-item to the Chat workspace group:
```
Chat
  ├── Overview      → /chat/overview
  ├── Key Points    → /chat/key-points
  ├── Pinned Items  → /chat/pinned
  └── Timeline      → /chat/timeline
```

> [!NOTE]
> The existing `isChildActive` logic in the sidebar already handles child route highlighting via `pathname.startsWith(child.href)`.

---

## Design Language

All pages will match the existing dashboard aesthetic:
- `PageContainer` + `PageHeader` wrapper
- `glass-ethereal` card backgrounds
- `card-premium` hover effects
- Framer Motion stagger animations
- Phosphor icons (duotone weight)
- Dark theme with `silk-bg` base

---

## Verification Plan

### Automated Tests
```bash
npx tsc --noEmit          # Zero type errors
npx eslint src/ convex/   # Zero ESLint errors
npm run build             # Clean production build (4 new routes appear)
```

### Manual Verification
- Navigate to each page via sidebar
- Verify correct items load per page
- Verify delete/unpin/confirm actions work
- Verify empty states show correctly for new users
- Verify filter tabs switch data correctly
