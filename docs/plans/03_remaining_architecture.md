# Remaining Implementation Plan — Completing the Architecture

> **Goal:** Close all gaps identified in the walkthrough audit
> **Starting from:** `main` @ `a262268` (PR #43 merged)
> **Branch:** `feat/complete-architecture-gaps`

---

## Workstream Overview

| # | Workstream | Files Touched | Estimated Scope | Priority |
|---|-----------|---------------|-----------------|----------|
| **WS-1** | Frontend Artifact Rendering | 3 files | ~400 lines | 🔴 P0 |
| **WS-2** | Phase 2 Streaming Hybrid | 3 files | ~250 lines | 🟡 P2 |
| **WS-3** | Structured Output Migration | 3 files | ~300 lines | 🟠 P1 |
| **WS-4** | DocuVault AI Drafting Wire | 1 file | ~30 lines | 🟠 P1 |
| **WS-5** | Infrastructure Gaps | 2 files | ~40 lines | 🟠 P1 |

> [!IMPORTANT]
> **WS-1 (Frontend) should ship first** — without it, users can't see the structured responses the engine already produces. Everything else can layer on top.

> [!WARNING]
> **WS-2 (Streaming) has a design constraint.** The structured JSON response with artifacts requires the full response before recovery/validation/suppression can run. Phase 2 streaming uses a **hybrid approach**: the model streams a draft (natural prose), then the server runs recovery on the completed response and sends the polished final as a replacement. The client shows the draft in a temporary bubble, then swaps to the polished final. This means streaming only applies to the `message` field — artifacts are always delivered after full response.

---

## WS-1: Frontend Artifact Rendering

### [MODIFY] `src/components/chat/MessageBubble.tsx`

**Current:** Renders `content` as raw markdown via `ReactMarkdown`.

**Change:** Accept an optional `artifactsJson` prop. When present, parse and render artifact panels below the message:

- **`artifacts.confidence`** → Confidence badge (high=green, moderate=amber, low=red) with tooltip showing `basis` and `missingSupport`
- **`artifacts.draftReady`** → Collapsible "Court-Ready Draft" panel with copy button + download action
- **`artifacts.timelineReady`** → Visual timeline card with events
- **`artifacts.exhibitReady`** → Exhibit index card with labels
- **`artifacts.judgeSimulation`** → Judge perspective scorecard (credibility/neutrality/clarity scores + strengths/weaknesses)
- **`artifacts.oppositionSimulation`** → Opposition analysis panel (attack points + preemption suggestions)

Each artifact renders as a collapsible card below the main message, with a subtle icon + label header.

### [MODIFY] `src/components/Sidebar.tsx`

**Current:** Shows conversation title + mode badge.

**Change:** Import `ROUTE_MODE_LABELS` from `constants.ts`, render a small colored badge showing the last active `routeMode` on each conversation row.

### [MODIFY] `src/app/(app)/chat/[id]/page.tsx`

**Current:** `streamAIResponse` reads raw text stream → persists as content string. No file upload handling. No `conversationId` passed to chat API.

**Changes:**
1. Pass `conversationId` to the chat API call
2. Handle file attachment from `ChatInput` — upload via `/api/upload` before sending message, pass `vectorStoreId` to chat API
3. Pass `artifactsJson` from persisted messages to `MessageBubble`
4. Read the chat API response as JSON (non-streaming Phase 1) instead of stream reader

---

## WS-2: Phase 2 Streaming Hybrid

### [MODIFY] `src/lib/nexx/streamRenderer.ts`

**Add:**
- `createStreamAccumulator()` → manages `StreamState { liveText, finalText, isFinal, artifacts }`
- `pushChunk(chunk)` → detects `[[NEXX_FINAL_REWRITE_START]]` / `[[NEXX_FINAL_REWRITE_END]]` markers
- `getRenderableText()` → returns final polished text when available, live draft otherwise

### [NEW] `src/hooks/useNexxStream.ts`

- React hook wrapping stream accumulator in React state
- Returns `{ text, artifacts, isFinal, isStreaming }`
- Used by chat page to bind streaming state to MessageBubble

### [MODIFY] `src/app/api/chat/route.ts`

**Add streaming path:**
- When `stream: true` in request body, use `responses.create` with streaming
- Stream each chunk as SSE or raw text
- After completion, run recovery/validation/suppression on full response
- Send `[[NEXX_FINAL_REWRITE_START]]` + polished JSON + `[[NEXX_FINAL_REWRITE_END]]` markers
- Non-streaming path (current) remains as fallback

> [!IMPORTANT]
> **Dependency:** WS-2 depends on WS-1 being complete, since the streaming swap targets the same artifact rendering UI.

---

## WS-3: Structured Output Migration

### [MODIFY] `src/app/api/resources/lookup/route.ts`

**Before:** `openai.chat.completions.create` + `response_format: { type: 'json_object' }` + 6 sanitizer functions (130 lines)

**After:** `openai.responses.create` + `text.format: { type: 'json_schema', schema: ResourcesSchema }` from `schemas.ts`

**Keep:** `safeUrl()` (security), `validateResourceUrls()` (runtime health), `TRUSTED_EFILING_HOSTS` (security whitelist)
**Remove:** `sanitizeResource()`, `sanitizeResourceNoAddr()`, `sanitizeFamilyDivision()`, `sanitizeEFilingPortal()`, `sanitizeArray()`, `str()` — schema guarantees valid shapes.

### [MODIFY] `src/lib/legal/courtRulesLookup.ts`

**Before:** `openai.chat.completions.create` + `json_object` + manual `validateCourtFormattingRules()` whitelist

**After:** `openai.responses.create` + `CourtFormattingRulesSchema` from `schemas.ts`

**Remove:** `KNOWN_RULES_FIELDS` dictionary, `validateCourtFormattingRules()` function — schema guarantees valid types.

### [MODIFY] `src/lib/legal/complianceChecker.ts`

**Before:** `openai.chat.completions.create` + Vision + `json_object` + manual validation

**After:** `openai.responses.create` + Vision input + `ComplianceReportSchema` from `schemas.ts`

**Remove:** Manual `if (!result.overallStatus || !Array.isArray(result.checks))` — schema validation.

---

## WS-4: DocuVault AI Drafting Wire

### [MODIFY] `src/app/api/documents/generate/route.ts`

**Change:** Before step 5 (Render HTML), add:

```typescript
// If bodyContent is empty, use AI drafter to generate content
if (!body.bodyContent || body.bodyContent.length === 0) {
  const { draftDocumentContent } = await import('@/lib/nexx/documentDrafter');
  const draftedSections = await draftDocumentContent(template, caseGraph, rules);
  body.bodyContent = draftedSections;
}
```

The `documentDrafter.ts` module already exists and is complete. This just wires it into the route.

---

## WS-5: Infrastructure Gaps

### [MODIFY] `convex/crons.ts` (already exists — add toolRuns cron)

Register the `toolRuns.deleteExpired` cron:

```typescript
import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();

crons.daily(
  'clean up expired tool runs',
  { hourUTC: 6, minuteUTC: 0 },
  internal.toolRuns.deleteExpired,
);

export default crons;
```

### [MODIFY] `src/lib/nexx/functionTools.ts`

Wire `handleCreateIncident` to persist to the `incidents` table via Convex mutation when the user confirms.

---

## Execution Order

```
WS-1 (Frontend)  →  WS-4 (DocuVault)  →  WS-5 (Infra)  →  WS-3 (Structured Outputs)  →  WS-2 (Streaming)
     P0                   P1                  P1                    P1                         P2
```

WS-1 first because it unblocks user visibility of everything the engine already produces.
WS-2 last because it depends on WS-1 and is the most complex.

---

## Verification Plan

### After WS-1
- Send a chat message → verify artifact panels render below the message
- Verify confidence badge appears with correct color
- Verify collapsible draft panel has copy button
- Verify Sidebar shows route mode badge

### After WS-2
- Send a message → see live draft streaming in bubble
- When complete, draft swaps to polished final with artifacts

### After WS-3
- Resource lookup → verify structured JSON, no sanitizer functions called
- Court rules → verify schema-validated response
- Compliance check → verify schema-validated response

### After WS-4
- Generate document with empty bodyContent → verify AI drafts sections
- Verify PDF renders with AI-generated content

### After WS-5
- Verify `toolRuns.deleteExpired` cron appears in Convex dashboard
- Verify incident creation from function tools persists to `incidents` table
