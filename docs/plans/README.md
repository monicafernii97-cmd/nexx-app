# NEXX Overhaul Plans — Master Index

> All plans from April 9–13, 2026 organized chronologically.  
> Open any file below to read the full plan, then check off what's done.

---

## 📋 The 10 Plans (in execution order)

### 1. [Responses API Initial](./01_responses_api_initial.md) — 361 lines
**Date**: Apr 9  
**What it covers**: The first pass at migrating from `chat.completions` to `responses.create`. Initial schema, router concept, prompt stack design.  
**Status**: ✅ Superseded by #2

---

### 2. [Architecture Overhaul (Final)](./02_architecture_overhaul_final.md) — 1,394 lines ⭐
**Date**: Apr 10  
**What it covers**: The **master plan**. Everything:
- Responses API + Conversations API migration
- 5-layer prompt stack (system → developer → feature → artifact → context)
- Router with 9 modes + ToolPlan
- 15 structured output JSON schemas
- Recovery pipeline (parse → recover → validate → suppress)
- 8 function tools (model-callable backend actions)
- Judge simulation + Opposition simulation
- Retrieval ranker + Confidence layer
- Court rule provenance
- 7 new Convex tables
- 41 new files, 18 modified files
- Full file inventory with line numbers

**Status**: ✅ ~97% complete (41/41 files exist, 16/18 mods done)

---

### 3. [Remaining Architecture](./03_remaining_architecture.md) — 201 lines
**Date**: Apr 10  
**What it covers**: Gap-fill after the main architecture plan. Items that were identified as missing during implementation.  
**Status**: ✅ Merged into #2

---

### 4. [Premium UI Overhaul v3](./04_premium_ui_overhaul_v3.md) — 791 lines ⭐
**Date**: Apr 10  
**What it covers**: The **UI transformation plan**. Three parts:
- **Part 1** (~25 files): Panel system (47 panels), AssistantMessageCard, CaseContextBar, AnalysisStatusStrip, PatternChips, ChatInput upgrade, globals.css tokens, streaming
- **Part 2** (~25 files): SaveToCaseModal, PinToWorkspaceModal, WorkspaceShell, server actions, "Convert This Into" actions, vector store route
- **Part 3** (~20 files): Destination pages, template logic, panel-audit, ui-audit, per-subsystem evals

**Status**: ⚠️ ~61% complete (Part 1: 90%, Part 2: 60%, Part 3: 40%)

---

### 5. [Wave 3: Wiring + Backend Gaps](./05_wave3_wiring_backend_gaps.md) — 88 lines
**Date**: Apr 12  
**What it covers**: Bridging the UI overhaul to backend — WorkspaceClient routing, Convex mutations for workspace actions, toast wiring.  
**Status**: ✅ Complete

---

### 6. [Case Workspace Pages](./06_case_workspace_pages.md) — 136 lines
**Date**: Apr 12  
**What it covers**: Destination pages — Overview, Key Points, Timeline, Pinned Items. Shared components (ItemCard, EmptyState, FilterTabs).  
**Status**: ✅ Complete (pages at `/chat/overview`, `/chat/key-points`, etc.)

---

### 7. [Global Workspace & Destination Pages](./07_global_workspace_pages.md) — 89 lines
**Date**: Apr 12  
**What it covers**: GlobalWorkspaceRail sidebar, always-visible workspace intelligence.  
**Status**: ✅ Complete

---

### 8. [DocuVault Integration](./08_docuvault_integration.md) — 90 lines
**Date**: Apr 12  
**What it covers**: Connecting workspace actions to DocuVault — draft creation from chat, exhibit note linking.  
**Status**: ⚠️ Partial (UI shell exists, AI drafter not wired to generate route)

---

### 9. [Insights & Readiness Workspace](./09_insights_readiness.md) — 122 lines ⭐
**Date**: Apr 12  
**What it covers**: The "Insights" tab — PatternsBlock, NarrativeBlock, GenerateReportModal, Premium Analytics.  
**Status**: ⚠️ Partial (UI components exist, server-side AI endpoints not built)

---

### 10. [AI Narrative Synthesis](./10_narrative_synthesis.md) — 60 lines
**Date**: Apr 12  
**What it covers**: Server-side narrative generation — POST `/api/workspace/narrative`, CASE_NARRATIVE_SCHEMA, restraint rules.  
**Status**: ❌ Not started

---

## 📊 Audit Documents

These cross-reference the plans against the actual code:

| File | What it checks |
|------|---------------|
| [AUDIT: Sentence-by-Sentence](./AUDIT_sentence_by_sentence.md) | Every sentence from the original UI overhaul message → does the plan cover it? (347/347 = 100%) |
| [AUDIT: Architecture Final](./AUDIT_architecture_final.md) | All 22 sections of architecture plan → are they in the plan? (220+/220+ = 100%) |
| [AUDIT: Gap Analysis](./AUDIT_gap_analysis.md) | 22 gaps + 4 partial items found between message and plan |

---

## 🔢 Quick Stats

| Metric | Count |
|--------|-------|
| Total plans | 10 |
| Total lines across all plans | ~3,400 |
| New files planned | ~70 (arch + UI combined) |
| New files built | ~60 |
| Convex tables added | 7 → now 22 total |
| Structured output schemas | 15 |
| Function tools | 8 |
| Panel types | 47 |

---

## ✅ What to check off yourself

Open each plan marked with ⭐ (2, 4, 9) and look at the file lists and feature descriptions. The major remaining work lives in:

1. **Plan #4 (UI Overhaul)** — Part 2 & Part 3 gaps
2. **Plan #9 (Insights)** — Server-side AI endpoints  
3. **Plan #10 (Narrative)** — Entire plan not started
