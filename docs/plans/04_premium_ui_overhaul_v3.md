# NEXX Premium UI Overhaul — 3-Part Implementation Plan (v3)

> **Decisions confirmed**: Dual theme (dark + light) · All 47 panels · Tailwind v4 adaptation · 5 backend gaps included
> Broken into **3 executable parts** that can each be completed as a focused sprint.

---

## Tailwind v3 → v4 Difference (Quick Reference)

The original spec code examples use **Tailwind v3** patterns. Our project uses **Tailwind v4**. Here's what changes:

| Concept | TW v3 (spec examples) | TW v4 (our project) |
|---|---|---|
| **Config file** | `tailwind.config.js` (JavaScript) | No config file — CSS-first via `@theme inline` blocks in `globals.css` |
| **Color registration** | `theme.extend.colors` in JS config | `--color-*` custom properties inside `@theme inline {}` |
| **Using a color** | `bg-blue-50` (built-in palette) | Same classes work, but custom colors like `bg-surface-card` need `--color-surface-card` defined in `@theme inline` |
| **Plugin loading** | `require()` in config JS | `@plugin "@tailwindcss/typography"` in CSS |
| **Dark mode** | `darkMode: 'class'` in config JS | `@variant dark (&:where(.dark, .dark *))` — or use CSS `:root` / `.dark` custom properties (our approach) |
| **Arbitrary values** | `bg-[#1E293B]` | Same — works in both |
| **Font families** | `fontFamily` in config JS | `--font-sans`, `--font-serif` in `@theme inline` (already done ✓) |

**Our approach for dual theme**: We'll use CSS custom properties in `:root` (light) and `:root.dark` / `@media (prefers-color-scheme: dark)` blocks. Components reference `var(--surface-card)` etc. No Tailwind dark: prefix needed — the variables themselves change.

---

## Current Backend Gaps to Integrate

These 5 items from the previous implementation are woven into the 3 parts below:

| # | Gap | Severity | Part |
|---|-----|----------|------|
| 1 | **Server-side streaming** — chat route returns full JSON, not streamed | HIGH | Part 1 |
| 2 | **Custom chunking** — `parser.ts` has logic, `fileSearch.ts` doesn't pass `chunk_size` | MEDIUM | Part 2 |
| 3 | **Per-subsystem evals** — single generic eval, no separate sets per subsystem | LOW | Part 3 |
| 4 | **Vector store metadata filters** — no `caseId`/`docType`/`jurisdiction` filters on queries | MEDIUM | Part 2 |
| 5 | **Standalone `vector-store/route.ts`** — upload route handles creation inline | MEDIUM | Part 2 |

---

# PART 1 — Foundation + Core Rendering

> **Goal**: Transform the chat from a markdown blob into structured, adaptive intelligence cards with dual-theme support and real streaming.
> **~25 files** · Biggest visual impact · No backend dependencies except streaming

---

## P1.1 [MODIFY] `src/app/globals.css` — Premium Token System + Dual Theme

### New CSS Custom Properties

Add a full dual-theme token system. Current dark-only `:root` becomes the dark theme; add light equivalents:

```css
/* ── Premium Surface Tokens ── */
:root {
  /* Light theme defaults */
  --surface-elevated: #F1F5F9;
  --surface-card: #FFFFFF;
  --border-subtle: rgba(15, 23, 42, 0.1);
  --accent-icy: #0EA5E9;
  --accent-platinum: #334155;
  --warning-muted: #D97706;
  --success-soft: #34D399;
  --critical-access: #DC2626;
  --support-violet: #8B5CF6;
  
  /* Text */
  --text-heading: #0F172A;
  --text-body: #334155;
  --text-muted: #64748B;
  --text-on-dark: #FFFFFF;
}

:root.dark {
  /* Dark theme (current Galaxy theme) */
  --surface-elevated: #0F172A;
  --surface-card: #1E293B;
  --border-subtle: rgba(148, 163, 184, 0.2);
  --accent-icy: #38BDF8;
  --accent-platinum: #E2E8F0;
  --warning-muted: #D97706;
  --success-soft: #34D399;
  --critical-access: #F59E0B;
  --support-violet: #A78BFA;
  
  --text-heading: #F8FAFC;
  --text-body: #CBD5E1;
  --text-muted: #64748B;
  --text-on-dark: #FFFFFF;
}
```

### Typography Hierarchy Classes

```css
/* Headlines */
.text-headline { font-weight: 600; letter-spacing: -0.02em; }

/* Panel eyebrow labels */
.text-eyebrow { font-size: 0.75rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text-muted); }

/* Body */
.text-body { font-size: 0.875rem; line-height: 1.625; color: var(--text-body); }

/* Metadata */
.text-meta { font-size: 0.75rem; color: var(--text-muted); }

/* Work-product / court-ready blocks */
.text-work-product { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 0.875rem; }
```

### Register in `@theme inline`

```css
@theme inline {
  /* ... existing tokens ... */
  --color-surface-elevated: var(--surface-elevated);
  --color-surface-card: var(--surface-card);
  --color-accent-icy: var(--accent-icy);
  --color-accent-platinum: var(--accent-platinum);
  --color-warning-muted: var(--warning-muted);
  --color-success-soft: var(--success-soft);
  --color-critical-access: var(--critical-access);
  --color-support-violet: var(--support-violet);
}
```

---

## P1.2 [NEW] `src/lib/ui-intelligence/types.ts` — Complete Type System

All types for the adaptive intelligence system:

| Type | Fields |
|---|---|
| `ResponseIntent` | `'support' \| 'analysis' \| 'strategy' \| 'drafting' \| 'incident' \| 'procedure' \| 'evidence' \| 'mixed'` |
| `PanelType` | 47 string literals (full list below) |
| `SaveType` | 12 classifications: `case_note` → `question_to_verify` |
| `ActionType` | 12 actions: `copy` → `create_draft` |
| `SaveSuggestion` | `{ type: SaveType; label: string; recommended?: boolean; reason?: string }` |
| `PanelData` | `{ type: PanelType; title: string; content: string \| string[]; tone?: PanelTone; collapsible?: boolean }` |
| `PanelTone` | `'neutral' \| 'info' \| 'success' \| 'warning' \| 'support'` |
| `ResponsePresentation` | `{ intent: ResponseIntent; panelOrder: PanelType[]; allowedActions: ActionType[]; recommendedActions: ActionType[]; saveSuggestions: SaveSuggestion[]; eligibility: EligibilityFlags }` |
| `EligibilityFlags` | `{ timelineEligible: boolean; incidentEligible: boolean; exhibitEligible: boolean; draftEligible: boolean; templateEligible: boolean }` |
| `AssistantResponseViewModel` | `{ responseId: string; caseId?: string; presentation: ResponsePresentation; panels: PanelData[] }` |
| `CaseContextChip` | `{ label: string; tone?: PanelTone }` |
| `PinnedItem` | `{ id: string; title: string; type: PinnableClass; content: string; createdAt: number }` |
| `PinnableClass` | `'key_fact' \| 'strategy_point' \| 'good_faith_point' \| ... \| 'timeline_anchor'` (9 types) |
| `AnalysisStep` | `{ id: string; label: string; status: 'complete' \| 'active' \| 'upcoming' }` |
| `RiskSubtype` | `'compliance' \| 'tone' \| 'credibility' \| 'documentation' \| 'reasonableness' \| 'bad_faith_appearance'` |
| `StrengthSubtype` | `'flexibility' \| 'cooperation' \| 'child_centered' \| 'documented_effort' \| 'reasonable_alternative' \| 'order_awareness'` |

### Full 47 Panel Types

**Foundational (7):** `overview`, `key_takeaway`, `what_this_means`, `why_it_matters`, `strongest_framing`, `weakest_point`, `what_to_watch`

**Strategic (9):** `judge_lens`, `risk_concern`, `strength_highlight`, `good_faith_positioning`, `cooperation_signal`, `reasonableness_check`, `credibility_impact`, `bad_faith_risk`, `strategic_reframe`

**Action-Oriented (6):** `best_next_steps`, `options_paths`, `follow_up_questions`, `gather_this_next`, `do_now_vs_later`, `decision_guide`

**Drafting (6):** `suggested_reply`, `court_ready_version`, `alternate_version`, `why_this_wording_works`, `tone_adjustment`, `more_neutral_version`

**Evidence/Record (6):** `timeline_candidate`, `incident_summary`, `documentation_gap`, `exhibit_note`, `proof_strength`, `fact_vs_feeling`

**Process/Procedure (5):** `procedure_notes`, `local_context`, `what_to_verify`, `deadline_watch`, `filing_considerations`

**Reflective/Support (5):** `emotional_insight`, `validation_support`, `gentle_reframe`, `pattern_detected`, `relationship_dynamic`

**Memory/Organization (3):** `pinworthy_points`, `save_to_case_suggestions`, `related_case_context`, `linked_history`

---

## P1.3 [NEW] `src/lib/ui-intelligence/panel-library.ts`

- `PANEL_TITLES: Record<PanelType, string>` — human-readable titles for all 47 panels
- `PANEL_TONES: Record<PanelType, PanelTone>` — tone assignment per panel
- `getPanelTitle(type: PanelType): string`
- `getPanelTone(type: PanelType): PanelTone`

Tone assignments:
| Panels | Tone |
|---|---|
| Overview, Key Takeaway, Best Next Steps, Options | `neutral` |
| Judge Lens, What This Means, Procedure, Local Context | `info` |
| Strength, Good Faith, Cooperation, Reasonableness | `success` |
| Risk, Bad Faith, Weakest Point, Documentation Gap | `warning` |
| Emotional Insight, Validation Support, Gentle Reframe | `support` |

---

## P1.4 [NEW] `src/lib/ui-intelligence/presentation-rules.ts`

`buildPresentation(intent: ResponseIntent): ResponsePresentation`

Returns different panel orders + actions per intent. **8 mappings** (see sentence audit §5C for full table).

Key design rule: "Do not show every action on every response."

---

## P1.5 [NEW] `src/lib/ui-intelligence/action-routing.ts`

- `ACTION_LABELS: Record<ActionType, string>`
- `ACTION_ICONS: Record<ActionType, string>` (Phosphor icon names)
- `getActionTier(action: ActionType): 'universal' | 'medium' | 'higher'`
- 3-tier visibility logic per §1.7

---

## P1.6 [NEW] `src/lib/ui-intelligence/mock-data.ts`

Test data for development — mock `AssistantResponseViewModel` objects for each of the 8 intents.

---

## P1.7 [NEW] `src/components/chat/PanelRenderer.tsx`

Replace flat markdown with card-based panels:
- Rounded card (`rounded-2xl`) with tone-based border/background colors
- String content → `<p>`, array content → `<ol>`
- Collapsible via `<details>`/`<summary>` or Framer Motion `AnimatePresence`
- Dual-theme aware via CSS variables

---

## P1.8 [NEW] `src/components/chat/ContextualActionBar.tsx`

Action bar inside every assistant response:
- Shows only tier-appropriate actions
- Recommended actions get accent styling (`var(--accent-icy)`)
- Dispatches `ActionType` via callback prop
- Responsive: icon-only on mobile, icon+label on desktop

---

## P1.9 [NEW] `src/components/chat/AssistantMessageCard.tsx`

Replaces assistant branch of `MessageBubble.tsx`:
- Premium wrapper card (`rounded-3xl border`)
- "Assistant Response" eyebrow label
- Stacks `PanelRenderer` components with Framer Motion stagger reveal
- Reveal order: Overview → sections → action bar → work-product block
- Includes `ContextualActionBar` at bottom
- Falls back to markdown rendering for non-structured responses

---

## P1.10 [NEW] `src/components/chat/CaseContextBar.tsx`

Persistent bar at top of chat:
- Chips from case graph / court settings
- Tone-colored badges: jurisdiction (info), case type (neutral), flags (warning/success)
- Dual-theme styling

---

## P1.11 [NEW] `src/components/chat/AnalysisStatusStrip.tsx`

"Thinking structure" indicator during generation:
- Steps: "Analyzing case context" → "Reviewing evidence patterns" → "Applying judge lens" → "Structuring response"
- Dot colors: green (complete), blue (active), gray (upcoming)
- Framer Motion transitions

---

## P1.12 [NEW] `src/components/chat/PatternChips.tsx`

Subtle intelligence chips above/inside response:
- "Pattern: delay tactic", "Pattern: control dispute", "Pattern: documentation gap", etc.
- 6 pattern types
- Pill styling with muted tones

---

## P1.13 [NEW] `src/components/chat/LocalProcedureBadge.tsx`

Badge when response includes court/county/state procedure:
- "Texas procedure applied", "Fort Bend context", "District-specific formatting note"
- Small, high-trust indicator

---

## P1.14 [MODIFY] `src/components/chat/ChatInput.tsx` — Premium Composer

1. **Quick action chips above input**: "Analyze a Thread", "Draft Court Language", "Build Timeline", "Judge Lens", "Local Procedure", "Summarize Evidence", "Find Weak Points"
2. **Reduce visual weight**: Lower height, refined border/glow
3. **Better placeholder**: "Ask for strategy, drafting, procedure, timeline help, or judge-oriented framing..."
4. **Refined send button**: Premium accent, not oversized
5. **Structured mode toggles**: Strategy / Judge Lens / Drafting / Timeline / Procedure (persistent selectors, distinct from chips)
6. **"Upload thread" + "Upload order"** as distinct chips

---

## P1.15 [MODIFY] `src/components/chat/MessageBubble.tsx`

Wire `AssistantMessageCard` for structured responses. Keep markdown fallback for non-structured messages.

---

## P1.16 [MODIFY] `src/app/(app)/chat/[id]/page.tsx`

- Add `CaseContextBar` at top
- Add `AnalysisStatusStrip` during streaming
- Wire streaming state management
- Pass action handlers down to `AssistantMessageCard`

---

## P1.17 [NEW] `src/lib/ui-intelligence/dual-output.ts`

Guidance vs Work Product zone logic:
- `isWorkProduct(panel: PanelData): boolean`
- `splitGuidanceAndWorkProduct(panels: PanelData[]): { guidance: PanelData[]; workProduct: PanelData[] }`
- Work product panels: `court_ready_version`, `suggested_reply`, `alternate_version`, `more_neutral_version`, `exhibit_note`, `timeline_candidate`

---

## P1.18 🔧 Server-Side Streaming (Backend Gap #1)

**Current**: `POST /api/chat` returns full JSON after all processing completes.
**Target**: SSE stream that sends draft tokens live, then final structured JSON.

Changes to `src/app/api/chat/route.ts`:
1. Switch from `responses.create()` to `responses.create({ stream: true })`
2. Pipe `response_text.delta` events to client via `ReadableStream` + `TextEncoder`
3. After stream completes, run recovery/validation/suppression on accumulated text
4. Send `[[NEXX_FINAL_REWRITE_START]]` + polished JSON + `[[NEXX_FINAL_REWRITE_END]]`
5. Client `streamRenderer.ts` already handles these markers ✓

This is the **only material gap blocking UX**.

---

## P1.19 Premium Microinteractions

In `AssistantMessageCard.tsx` and `PanelRenderer.tsx`:

**A. Stagger reveal** (Framer Motion):
- Overview first → sections fade/slide → action bar → work-product block
- `staggerChildren: 0.08`, `initial: { opacity: 0, y: 8 }`

**B. Hover depth** on actionable panels:
- `transition: border-color 0.15s, box-shadow 0.15s`
- Subtle border shift + soft shadow on hover

**C. Copy/save success feedback**: Subtle toast + small animation

---

## P1 File Summary (~25 files)

| Directory | New Files |
|---|---|
| `src/lib/ui-intelligence/` | `types.ts`, `panel-library.ts`, `presentation-rules.ts`, `action-routing.ts`, `mock-data.ts`, `dual-output.ts` |
| `src/components/chat/` | `PanelRenderer.tsx`, `ContextualActionBar.tsx`, `AssistantMessageCard.tsx`, `CaseContextBar.tsx`, `AnalysisStatusStrip.tsx`, `PatternChips.tsx`, `LocalProcedureBadge.tsx` |

| File | Modifications |
|---|---|
| `globals.css` | Dual-theme tokens, typography classes, `@theme inline` updates |
| `ChatInput.tsx` | Quick chips, mode toggles, weight reduction, placeholder |
| `MessageBubble.tsx` | Wire AssistantMessageCard |
| `page.tsx` | CaseContextBar, AnalysisStatusStrip, streaming |
| `route.ts` (chat) | Server-side streaming |

---

# PART 2 — Actions, Integration, Workspace

> **Goal**: Wire all actions (save, pin, convert, timeline, incident, draft, exhibit) with real persistence, modals, toast feedback, right rail, and the 3-zone workspace shell.
> **~25 files** · Turns passive reading into active case-building

---

## P2.1 [NEW] `src/components/chat/SaveToCaseModal.tsx`

1. User clicks "Save to Case"
2. Modal shows suggested save types with explanations
3. Recommended option highlighted (accent border)
4. User selects → server action saves → toast confirms
5. Optional "Pin this too?" prompt

---

## P2.2 [NEW] `src/components/chat/PinToWorkspaceModal.tsx`

1. User clicks "Pin"
2. Modal with editable title + content
3. Confirm → item instantly appears in right rail (optimistic)
4. Persists to case pins backend

---

## P2.3 [NEW] `src/components/chat/PinnedItemsRail.tsx`

Right rail component:
- Always-visible mini version
- Each item: title, type badge, content preview, unpin action
- 9 pinnable classes: `key_fact`, `strategy_point`, `good_faith_point`, `strength_highlight`, `risk_concern`, `hearing_prep_point`, `draft_snippet`, `question_to_verify`, `timeline_anchor`
- Draggable order (future)

---

## P2.4 [NEW] `src/components/feedback/ToastProvider.tsx`

Premium toast system with destination hints:
- "Saved as Strategy Point → View in Key Points"
- "Pinned to Workspace → View Pin"
- "Timeline Candidate Created → Open Timeline"
- "Incident Summary Created → Open Incident Reports"
- "Draft Created → Open Drafts"
- "Exhibit Note Saved to DocuVault → Open DocuVault"

---

## P2.5 [NEW] `src/components/chat/WorkspaceShell.tsx`

3-zone desktop layout:
- **Left**: existing Sidebar
- **Center**: main conversation (narrower reading column)
- **Right**: 320px rail with rotating modules

Right rail modules:
- Current Case · Open Issues · Next Hearing · Pending Approvals
- Saved Drafts · Related Documents · Key Timeline Entries
- Pinned Strategy Points · Template Suggestions · Recent Raw Access Logs

---

## P2.6 [NEW] `src/components/chat/WorkspaceClient.tsx`

Client orchestrator:
- Handles all `ActionType` dispatch via `routeAction()`
- Manages modal state (save, pin)
- Calls real server actions
- Shows success/error toasts with destination links
- Updates pinned items optimistically

---

## P2.7 [NEW] Raw / Masked Access Indicator

`src/components/chat/AccessIndicator.tsx`:
- "Masked review" · "Elevated raw access" · "Approval required" · "Access expires in 22 min"
- Uses `--critical-access` token

---

## P2.8 [NEW] "Convert This Into..." Actions

Inside panels, let user transform sections into:
- Exhibit summary · Incident narrative · Affidavit language
- Motion paragraph · Hearing outline · Timeline item

---

## P2.9 [NEW] Integration Layer Files

| File | Purpose |
|---|---|
| `src/lib/integration/types.ts` | Integration metadata types |
| `src/lib/integration/route-created-item.ts` | Route items to correct destination |
| `src/lib/integration/create-from-chat.ts` | Create items from chat context |
| `src/lib/docuvault/types.ts` | `DocuVaultItemType`, `DocuVaultItem` |
| `src/lib/docuvault/create-docuvault-item.ts` | Creation helper with integration metadata |
| `src/lib/incidents/types.ts` | Incident types |
| `src/lib/incidents/create-incident-report.ts` | Status: `candidate` \| `confirmed` |
| `src/lib/timeline/create-linked-timeline-item.ts` | Candidate status + optional eventDate |

---

## P2.10 [NEW] Server Actions (6 files)

| File | Purpose |
|---|---|
| `src/lib/actions/save-response-to-case.ts` | Save response item to case memory |
| `src/lib/actions/pin-response-item.ts` | Pin response item to workspace |
| `src/lib/actions/create-timeline-candidate.ts` | Create timeline candidate |
| `src/lib/actions/create-incident-summary.ts` | Create incident + optional linked timeline |
| `src/lib/actions/create-draft-from-response.ts` | Create draft + optional DocuVault copy |
| `src/lib/actions/create-exhibit-note.ts` | Create exhibit note + optional DocuVault artifact |

Each follows 7-step pattern:
1. Auth check (`getServerSession`)
2. Permission check (`requirePermission`)
3. Input validation (`requireNonEmptyText`, `requireReasonableLength`)
4. Create primary record
5. Create linked records (secondary destinations)
6. Audit logging (`logActionAudit`)
7. Revalidate affected paths

---

## P2.11 [NEW] Backend Endpoints

| Endpoint | Purpose |
|---|---|
| `POST /api/case-memory/save` | Save classified items |
| `POST /api/pins/create` | Create pin |
| `POST /api/timeline/create-candidate` | Create timeline candidate |
| `POST /api/incidents/create-summary` | Create incident summary |
| `POST /api/docuvault/create-draft` | Create draft in DocuVault |
| `POST /api/docuvault/create-exhibit-note` | Create exhibit note |
| `POST /api/templates/insert-snippet` | Insert snippet into template |

---

## P2.12 [MODIFY] `src/app/layout.tsx`

Wrap with `ToastProvider`.

---

## P2.13 [MODIFY] `src/components/Sidebar.tsx`

Add case workspace navigation: Overview, Key Points, Timeline, Incident Reports, Drafts, Documents (DocuVault), Pinned Items.

---

## P2.14 🔧 Backend Gap #4 — Vector Store Metadata Filters

**Current**: `searchVectorStore()` accepts `filter` param but the chat route's `file_search` tool doesn't pass filters.

**Fix** in `src/app/api/chat/route.ts`:
- When building the `file_search` tool config, include `filters` with `caseId`, `docType`, and `jurisdiction` from the conversation's case graph
- Update `uploadToVectorStore()` to always attach metadata: `{ caseId, docType, jurisdiction }`

---

## P2.15 🔧 Backend Gap #5 — Standalone Vector Store Route

**Current**: Vector store creation is inline in `/api/upload/route.ts`.

**Fix**: Create `src/app/api/vector-store/route.ts`:
- `POST` — Create vector store (with name, optional caseId linking)
- `DELETE` — Delete vector store (with cleanup)
- `GET` — Get vector store status
- Refactor `/api/upload/route.ts` to call this route internally

---

## P2.16 🔧 Backend Gap #2 — Custom Chunking

**Current**: `parser.ts` has `chunkLegalText()` but `fileSearch.ts` doesn't pass `chunk_size`.

**Fix** in `fileSearch.ts`:
- Add `chunkingStrategy` param to `uploadToVectorStore()`
- Pass `chunking_strategy: { type: 'static', static: { max_chunk_size_tokens: 800, chunk_overlap_tokens: 200 } }` when creating vector store files
- Legal documents benefit from smaller chunks (~800 tokens) vs default (4096)

---

## P2 File Summary (~25 files)

| Directory | New Files |
|---|---|
| `src/components/chat/` | `SaveToCaseModal.tsx`, `PinToWorkspaceModal.tsx`, `PinnedItemsRail.tsx`, `WorkspaceShell.tsx`, `WorkspaceClient.tsx`, `AccessIndicator.tsx` |
| `src/components/feedback/` | `ToastProvider.tsx` |
| `src/lib/integration/` | `types.ts`, `route-created-item.ts`, `create-from-chat.ts` |
| `src/lib/docuvault/` | `types.ts`, `create-docuvault-item.ts` |
| `src/lib/incidents/` | `types.ts`, `create-incident-report.ts` |
| `src/lib/timeline/` | `create-linked-timeline-item.ts` |
| `src/lib/actions/` | 6 server action files |
| `src/app/api/` | `vector-store/route.ts`, `case-memory/route.ts`, `pins/route.ts`, `timeline/route.ts`, `incidents/route.ts`, `docuvault/create-draft/route.ts`, `docuvault/create-exhibit-note/route.ts`, `templates/insert-snippet/route.ts` |

| File | Modifications |
|---|---|
| `layout.tsx` | Wrap ToastProvider |
| `Sidebar.tsx` | Case workspace navigation |
| `chat/route.ts` | Vector store filter passthrough |
| `upload/route.ts` | Refactor to use standalone vector-store route |
| `fileSearch.ts` | Custom chunk_size param |

---

# PART 3 — Destination Pages, Templates, Intelligence

> **Goal**: Build the connected case workspace with destination pages, template intelligence, panel analytics, self-review, and per-subsystem evals.
> **~20 files** · Completes the full product vision

---

## P3.1 [NEW] Shared Case Components

| Component | File | Purpose |
|---|---|---|
| `CasePageLayout` | `src/components/case/CasePageLayout.tsx` | `<CasePageLayout title="Key Points">{children}</CasePageLayout>` |
| `ItemCard` | `src/components/case/ItemCard.tsx` | Standard card for items across all destination pages |
| `EmptyState` | `src/components/case/EmptyState.tsx` | "No items yet" / "Create from chat or add manually" |
| `FilterTabs` | `src/components/case/FilterTabs.tsx` | All / Strategy / Risks / Good Faith / etc. |
| `SourceBadge` | `src/components/case/SourceBadge.tsx` | "Created from Chat" indicator |
| `InlineLinkingModal` | `src/components/case/InlineLinkingModal.tsx` | "Link to timeline" picker |

---

## P3.2 [NEW] Case Dashboard — `src/app/cases/[caseId]/overview/page.tsx`

Quick snapshot:
- Next hearing (if available)
- Recent activity
- Pinned items (top 3-5)
- Recent timeline events
- Recent drafts
- Alerts / risks

---

## P3.3 [NEW] Key Points — `src/app/cases/[caseId]/key-points/page.tsx`

Strategy memory page:
- Filter tabs: All / Strategy / Good Faith / Risks / Strengths / Questions
- Per-item: "Created from Chat" badge, quick actions on hover (pin, link, convert)
- Inline linking: "Link to timeline" → modal picker
- Smart suggestions: "This looks like a timeline event — add it?"

---

## P3.4 [NEW] Timeline — `src/app/cases/[caseId]/timeline/page.tsx`

Chronological view:
- Filters: All / Candidates / Confirmed
- Tags: incident, communication, medical, school

---

## P3.5 [NEW] Drafts — `src/app/cases/[caseId]/drafts/page.tsx`

Draft management page.

---

## P3.6 [MODIFY] DocuVault + Incident Reports Pages

Enhance existing pages with integration metadata, SourceBadge, and linked-item displays.

---

## P3.7 [NEW] `src/lib/ui-intelligence/panel-audit.ts`

Panel analytics:
- `PanelUsageEvent`: shown, expanded, copied, saved, pinned, converted, dismissed
- `buildPanelRecommendations()`: scores panels by value
  - Formula: `saved×3 + pinned×4 + copied×2 − dismissed×2`
  - Recommends: promote, demote, test_variant, merge, retire

---

## P3.8 [NEW] `src/lib/ui-intelligence/ui-audit.ts`

Self-audit system:
- `UiLibraryAudit`: findings with severity, area, summary, recommendation
- `buildUiLibraryAudit()` checks:
  - Are we overusing `best_next_steps`?
  - Are we underusing `good_faith_positioning` in co-parenting disputes?
  - Are users saving `strength_highlight` more than `risk_concern`?
  - Are timeline actions shown when not used?
  - Are users often requesting softer tone after `court_ready_version`?
  - Are support-mode responses being over-structured?

---

## P3.9 [NEW] Response Quality Feedback Loop

Track user interaction patterns:
- User copied section → "This user benefits from stronger drafting panels"
- User saved as strategy → feed back to panel selection
- User pinned → indicates high-value content
- User ignored actions → reduce action density
- User asked follow-up → response missed something
- User requested "make softer" → adjust tone defaults

---

## P3.10 Template System

### `src/lib/ui-intelligence/template-context.ts`

```typescript
type TemplateContext = {
  state: string;
  county?: string;
  courtName?: string;
  caseType: string;
  caseOpen: boolean;
  married: boolean;
  childrenInvolved: boolean;
  partyRole: 'petitioner' | 'respondent';
  represented: boolean;
  causeNumber?: string;
  partyNames: {
    petitioner?: string;
    respondent?: string;
    childrenInitials?: string[];
  };
};
```

### Template Page UI Features

- Compatibility indicator
- Missing facts checklist
- Live title preview + live caption preview
- Section toggles + "Why this section is included"
- "Required by your court/state?" notes
- Auto-format preview + court-ready export preview
- Compare version
- Save to DocuVault
- **"Duplicate and adapt from existing filing"** (premium feature)

### Template Decision Logic

Example: Motion for Temporary Orders. System checks case subtype, children, relief type, court requirements, caption rules → dynamically selects title, caption, sections, notice language.

---

## P3.11 🔧 Backend Gap #3 — Per-Subsystem Evals

**Current**: Single `evaluateResponse()` in `eval.ts` with 6 generic dimensions.

**Fix**: Create `src/lib/nexx/eval/` directory:
- `eval/router-eval.ts` — Does the router pick the correct mode?
- `eval/drafting-eval.ts` — Is the draft court-ready? Does it avoid filler?
- `eval/analysis-eval.ts` — Does the analysis include risk + strength + judge lens?
- `eval/support-eval.ts` — Is the support response warm without over-structuring?
- `eval/procedure-eval.ts` — Does it cite correct jurisdiction?
- `eval/index.ts` — Unified runner that calls all subsystem evals

---

## P3.12 [NEW] Preprocessing Splitter (future-ready)

`src/lib/ui-intelligence/preprocessing-splitter.ts`:
- Placeholder for future response preprocessing that detects intent from AI output
- Maps AI-generated sections to panel types

---

## P3 File Summary (~20 files)

| Directory | New Files |
|---|---|
| `src/components/case/` | `CasePageLayout.tsx`, `ItemCard.tsx`, `EmptyState.tsx`, `FilterTabs.tsx`, `SourceBadge.tsx`, `InlineLinkingModal.tsx` |
| `src/app/cases/[caseId]/` | `overview/page.tsx`, `key-points/page.tsx`, `timeline/page.tsx`, `drafts/page.tsx` |
| `src/lib/ui-intelligence/` | `panel-audit.ts`, `ui-audit.ts`, `template-context.ts`, `preprocessing-splitter.ts` |
| `src/lib/nexx/eval/` | `router-eval.ts`, `drafting-eval.ts`, `analysis-eval.ts`, `support-eval.ts`, `procedure-eval.ts`, `index.ts` |

---

## Dev Team Design Rules

### DO:
- Render only panels relevant to the response
- Balance risks with strengths
- Surface good-faith actions as usable strategic assets
- Default to safer save classes
- Pin the most reusable ideas
- Let the system learn which panels users actually use

### DO NOT:
- Show every action on every response
- Force every answer into legal-analysis format
- Overuse timeline or exhibit conversion
- Over-privilege risk panels and ignore strengths
- Turn emotional support moments into workflow clutter

---

## Grand Total

| Part | New Files | Modified Files | Backend Gaps |
|---|---|---|---|
| **Part 1** | ~19 | ~5 | #1 (streaming) |
| **Part 2** | ~22 | ~5 | #2 (chunking), #4 (filters), #5 (vector-store route) |
| **Part 3** | ~16 | ~2 | #3 (per-subsystem evals) |
| **Total** | **~57** | **~12** | **All 5** |

---

## Verification Plan

### Per-Part Checks

| Part | Verification |
|---|---|
| Part 1 | `npm run build` passes · Chat renders structured cards · Mock data renders all 47 panel types · Dual theme toggles correctly · Streaming works end-to-end |
| Part 2 | All 7 server actions work · Save/pin/convert flows complete · Toasts show with destination links · WorkspaceShell 3-zone layout works · Vector store route standalone · Metadata filters pass through |
| Part 3 | All 4 destination pages render · Template context populates correctly · Panel-audit tracks usage · Per-subsystem evals run · Empty states show correctly |

### Browser Tests
- Visual regression on structured cards (dark + light theme)
- Action flow: Save to Case → toast → navigate to Key Points → item visible
- Streaming: message streams live draft → final rewrite swaps in
