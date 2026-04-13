# AI Narrative Synthesis Implementation Plan

This phase connects the **"Generate Summary"** button to a high-end AI synthesis engine. It transforms your fragmented facts, pins, and timeline events into a coherent, professional case story while maintaining strict legal restraint.

## User Review Required

> [!IMPORTANT]
> **Manual vs. Automatic Updates**: I propose that Narrative Generation remains a **manual trigger** (the user clicks a button). This ensures the AI has a "complete" set of facts before synthesizing a story, which reduces costs and increases coherence.
>
> **The "Restraint" Rule**: The AI will be strictly forbidden from using adjectives like "aggressive," "unstable," or "bad mother." It must instead point to evidence, e.g., *"Medical records confirm X happened on Y date."*

## Proposed Changes

### 1. Database & Schemas

#### [MODIFY] [schemas.ts](file:///Users/monicafernandez/Downloads/NEX/nexx-app/src/lib/nexx/schemas.ts)
- Add `CASE_NARRATIVE_SCHEMA` to enforce the structured JSON output from OpenAI.
- Fields: `title`, `overview`, `keyFactsSummary[]`, `timelineSummary[]`, `supportedPatternsSummary[]`, `openQuestions[]`, `narrative`.

### 2. Prompt Engineering

#### [NEW] [narrativePrompt.ts](file:///Users/monicafernandez/Downloads/NEX/nexx-app/src/lib/nexx/prompts/narrativePrompt.ts)
- Implement the **"Story of the Case" developer prompt**.
- Rules: No character judgment, chronological focus, evidence-linking requirements.

### 3. Backend API

#### [NEW] [route.ts](file:///Users/monicafernandez/Downloads/NEX/nexx-app/src/app/api/workspace/narrative/route.ts)
- A Next.js POST route that:
    1.  Receives `caseId`.
    2.  Fetches `casePins`, `caseMemory`, and `timelineCandidates` for that case ID via Convex.
    3.  Calls OpenAI with the structured schema.
    4.  Saves the result to the `cases` table in Convex for persistence.

### 4. UI Integration

#### [MODIFY] [page.tsx](file:///Users/monicafernandez/Downloads/NEX/nexx-app/src/app/(app)/chat/overview/page.tsx)
- Trigger the API call when "Generate Summary" (in NarrativeBlock) or "Build Report" (in Modal) is clicked.
- Add loading states to the `NarrativeBlock`.
- Update the `isGenerating` prop.

---

## Open Questions

- **PERSISTENCE**: Should we save only the *latest* narrative, or maintain a history of all generated narratives for a case? (Proposed: Latest only to keep the interface clean/fast).

---

## Verification Plan

### Automated Tests
- `npx tsc --noEmit` to ensure JSON schema and Typescript interfaces match.
- Postman/Insomnia test of the `/api/workspace/narrative` route.

### Manual Verification
1.  Add 3 facts and 2 timeline events in the chat.
2.  Go to Workspace → Click "Generate Summary".
3.  Verify the narrative appears with the premium fade effect.
4.  Verify no "judgmental" language is present in the output.
