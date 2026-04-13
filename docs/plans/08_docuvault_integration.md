# Part 4: Workspace → DocuVault Integration

## Discovery Summary

**Key finding:** The backend is already fully wired. All three Convex modules (`casePins`, `caseMemory`, `timelineCandidates`) have complete CRUD operations, and the workspace context already calls them correctly. The DocuVault system also has a mature pipeline:

- 📄 **Template engine** (`templateCategories.ts`, `templateRenderer.ts`) — 50+ template definitions
- 🤖 **AI drafter** (`documentDrafter.ts`) — Generates section content from case context
- 📋 **Court rules** (`courtRules.ts`) — Jurisdiction-specific formatting with state/county granularity
- 🖨️ **PDF renderer** (`pdfRenderer.ts`) — Puppeteer-based HTML→PDF conversion
- ✅ **Compliance checker** (`/api/documents/check`) — Validates generated docs against rules

> [!IMPORTANT]
> The backend is **production-ready**. What's missing is the **bridge** between the Workspace UI and the DocuVault generator — users can't currently synthesize their workspace data into documents.

---

## Proposed Changes

### Workstream A — Case-Scoped Workspace (optional enhancement)

Currently, workspace queries filter by `userId` only. Since NEXX is a single-case-per-user platform today, this works. If multi-case support is needed later, queries would need a `caseId` field. **No change needed now.**

---

### Workstream B — "Generate Report" Export Flow

The core feature: let users send their accumulated workspace intelligence (pins, key points, timeline) into DocuVault to generate court-ready documents.

#### [NEW] `src/components/workspace/ExportToDocuVault.tsx`
- **"Generate Report" button** on Overview and Timeline pages
- Opens a slide-over modal with:
  - Template selector (pulls from existing `getTemplatesForTab()`)
  - Data preview: which pins/memory/timeline entries will be included
  - Court settings auto-populated from `userCourtSettings`
- On submit: navigates to `/docuvault?template={id}&source=workspace` with workspace data serialized as URL state or sessionStorage

#### [MODIFY] `src/app/(app)/docuvault/page.tsx`
- Read `?source=workspace` param
- When present, fetch workspace data and inject into the `DocumentGenerationRequest.bodyContent` as pre-populated sections
- Map workspace types to template sections:
  - `key_fact` / `strategy_point` → `body_sections` 
  - `timeline_candidate` (confirmed) → chronological narrative section
  - `risk_concern` → prayer for relief context
  - `strength_highlight` → introduction/summary

#### [NEW] `src/lib/workspace-to-document.ts`
- Utility to transform workspace data into `GeneratedSection[]` format
- `buildWorkspaceSections(pins, memory, timeline)` → ready for template rendering
- Handles deduplication (same item in both pins and memory)

---

### Workstream C — Workspace-Aware Template

#### [NEW] Template: "Case Summary Report"
- A new template in the template registry specifically designed for workspace synthesis
- Sections: Executive Summary, Key Facts, Strategic Analysis, Timeline of Events, Risk Assessment, Recommendations
- Each section maps directly to workspace data types
- NOT a court filing — a **strategic briefing document** for the user/attorney

---

## Open Questions

> [!IMPORTANT]
> **Q1: Is this a single-case-per-user platform?** The current schema has no `caseId` on pins/memory/timeline. If you plan to support multiple cases per user in the future, we should add `caseId` now. Otherwise the current userId scoping is fine.

> [!IMPORTANT]  
> **Q2: What document should workspace export produce?** Options:
> - **(a)** A **strategic briefing** (non-court document, internal summary)
> - **(b)** Feed workspace data into **existing court filing templates** (petition, motion, etc.)
> - **(c)** Both — briefing + pre-populate filings

> [!WARNING]
> **Q3: DocuVault page complexity.** The existing `/docuvault` page is a full document builder. Should the "Generate Report" flow:
> - **(a)** Navigate to the existing DocuVault page with data pre-filled?
> - **(b)** Have its own dedicated generation page (`/chat/overview/export`)?

## Verification Plan

### Automated Tests
- `npx tsc --noEmit` — zero errors
- `npx eslint` — zero warnings
- Test the export flow end-to-end via browser subagent

### Manual Verification
- Generate a report from workspace data
- Verify PDF output contains workspace content
- Confirm court settings pre-populate correctly
