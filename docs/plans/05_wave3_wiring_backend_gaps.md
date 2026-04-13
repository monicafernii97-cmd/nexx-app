# Part 2 — Wave 3: Wiring + Backend Gaps

> **Branch**: `feature/premium-ui-wave3`  
> **Scope**: 6 files (3 new + 3 modified)  
> **Estimated lines**: ~400

---

## Goal

Connect the existing action buttons to real Convex mutations, add workspace navigation to the sidebar, and close 2 backend gaps (custom chunking + metadata filters).

---

## Proposed Changes

### Component Wiring

#### [NEW] `src/components/chat/WorkspaceClient.tsx`
Client orchestrator that handles all `ActionType` dispatch:
- `routeAction(action, panelData)` — central dispatcher
- `copy` → clipboard API + toast
- `save_note`/`save_to_case`/`save_strategy`/`save_good_faith` → opens `SaveToCaseModal` pre-filled
- `pin` → opens `PinToWorkspaceModal` pre-filled
- `save_draft`/`create_draft` → calls `caseMemory.save` with type `draft_snippet` + toast with destination link
- `add_to_timeline` → calls `timelineCandidates.create` + toast
- `convert_to_incident`/`convert_to_exhibit`/`insert_into_template` → calls `caseMemory.save` with appropriate type + toast

Uses Convex `useMutation` hooks directly. Manages modal open/close state. Shows toasts via `useToast()`.

---

### Navigation

#### [MODIFY] `src/components/Sidebar.tsx`
Add a "Case Workspace" nav group with sub-items:
- **Key Points** → `/chat` (existing, but reframed)
- **Pinned Items** → (right rail focus, no separate page yet)
- **Timeline** → `/incident-report` (existing page, reframed)

> [!NOTE]
> We're linking to existing pages rather than creating new ones (those are Part 3). This makes the workspace discoverable now without needing new routes.

We'll add 3 new Phosphor imports: `PushPin`, `CalendarCheck`, `Notebook`.

---

### Backend Gap #2 — Custom Chunking

#### [MODIFY] `src/lib/nexx/fileSearch.ts`
Add `chunkingStrategy` parameter to `uploadToVectorStore()`:
- Accept optional `chunkSize` and `chunkOverlap` params
- Default to `800` tokens / `200` overlap for legal docs (vs OpenAI default of 4096)
- Pass as `chunking_strategy: { type: 'static', static: { max_chunk_size_tokens, chunk_overlap_tokens } }` to `vectorStores.files.createAndPoll()`

---

### Backend Gap #4 — Metadata Filters

#### [MODIFY] `src/app/api/chat/route.ts`
When building the `file_search` tool config for `responses.create()`:
- Extract `caseId`, `docType`, `jurisdiction` from conversation metadata
- Pass these as metadata filters to the file_search tool config
- This ensures vector search results are scoped to the relevant case

---

## Open Questions

None — all patterns established in previous waves.

---

## Verification Plan

### Automated Tests
```bash
npx tsc --noEmit          # Zero type errors
npx eslint src/ convex/   # Zero ESLint errors  
npm run build             # Clean production build
```

### Manual Verification
- Action buttons in chat dispatch correctly
- Save/Pin modals open pre-filled from action buttons
- Toasts show with correct destination links
- Sidebar shows workspace navigation group
- `fileSearch.ts` accepts chunking params
