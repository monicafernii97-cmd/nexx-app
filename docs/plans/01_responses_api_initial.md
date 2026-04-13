# NEXX Chat → Responses API Architecture Overhaul

Migrate NEXX from a single-prompt `chat.completions` design to a layered, tool-using, case-intelligent system built on the OpenAI **Responses API** with custom orchestration.

> [!IMPORTANT]
> This is a **major architectural change** across ~30 files. The branch `feat/responses-api-architecture` has been created from `main`. All existing features (DocuVault, incidents, resources, billing) remain untouched — only the chat intelligence pipeline changes.

## User Review Required

> [!WARNING]
> **Model Selection**: The plan uses `gpt-4o` as the primary model (your current model). Your design doc references `gpt-5.4` — which is the frontier model and significantly more expensive. For launch, I recommend starting with `gpt-4o` and adding a premium tier toggle for `gpt-5.4` later. Please confirm which model to target.

> [!IMPORTANT]
> **OpenAI SDK**: Your current SDK is `openai@6.27.0`, which supports `client.responses.create()`. The Responses API uses `input` instead of `messages`, supports `developer` role, and has built-in `file_search`, `web_search_preview`, and `code_interpreter` tools. I've verified this is available.

> [!WARNING]
> **Conversations API (OpenAI-side)**: OpenAI's durable server-side conversation state is a newer feature. For Phase 1, I recommend we manage conversation state ourselves in Convex (which we already do) and add OpenAI Conversations API integration in a later phase once the core architecture is solid. This avoids coupling to an API surface that may still be evolving.

---

## Proposed Changes

Changes are grouped into 4 phases matching your rollout priority. Phase 1 is the core migration; Phases 2-4 add intelligence layers.

---

### Phase 1A — Core: Responses API + Layered Prompts + Router + Post-Processing

This is the foundation. Replace the single `chat.completions.create` call + monolithic prompt with the Responses API, 4-layer prompt stack, turn router, and post-processing.

---

#### [NEW] [src/lib/nexx/router.ts](file:///Users/monicafernandez/Downloads/NEX/nexx-app/src/lib/nexx/router.ts)

Turn classifier that runs before every API call. Decides:
- **Response mode**: `direct_legal_answer` | `local_procedure` | `document_analysis` | `judge_lens_strategy` | `court_ready_drafting` | `pattern_analysis` | `support_grounding` | `safety_escalation`
- **Tool plan**: which tools to enable (`useFileSearch`, `useWebSearch`, `useCodeInterpreter`, `useLocalCourtRetriever`)

Uses regex-based heuristics for Phase 1 (fast, no API call). Can be upgraded to a lightweight LLM classifier later.

---

#### [NEW] [src/lib/nexx/responseModes.ts](file:///Users/monicafernandez/Downloads/NEX/nexx-app/src/lib/nexx/responseModes.ts)

Mode-specific output structure instructions injected into the developer prompt. Each mode has a defined answer skeleton:

| Mode | Default Sections |
|------|-----------------|
| `direct_legal_answer` | Overview → What This Means → What Matters Legally → Next Steps |
| `local_procedure` | Overview → Verified Process → What Happens Next → Documents Needed → Mistakes to Avoid |
| `document_analysis` | What This Says → What Matters → Risk/Leverage Points → Strategic Use → Next Steps |
| `judge_lens_strategy` | Overview → Judge's View → Strong Facts → Weak Spots → Neutral Framing → Next Steps → Court-Ready Version |
| `court_ready_drafting` | Purpose → Structure → Draft Text → Formatting Notes → Filing Notes |
| `pattern_analysis` | Overview → Pattern → Why It Matters → Evidence to Preserve → Neutral Presentation → Next Steps |
| `support_grounding` | What Matters Now → What Not to Do → 3 Actions → Grounded Perspective |
| `safety_escalation` | Immediate Priority → Immediate Steps → Emergency Options → Documentation → Next Steps |

---

#### [NEW] [src/lib/nexx/prompts/systemPrompt.ts](file:///Users/monicafernandez/Downloads/NEX/nexx-app/src/lib/nexx/prompts/systemPrompt.ts)

**Layer A — System policy.** Short, rigid, non-negotiable legal-safety shell. ~25 lines.
- No fabricated statutes/citations/deadlines
- Jurisdiction = unknown until retrieved
- Neutral court-credible language
- No diagnosis
- Option framing (not directives)
- Tool-use policy
- Legal document formatting hierarchy (ALL CAPS title, numbered sections, prayer, sig block, cert of service)

---

#### [NEW] [src/lib/nexx/prompts/developerPrompt.ts](file:///Users/monicafernandez/Downloads/NEX/nexx-app/src/lib/nexx/prompts/developerPrompt.ts)

**Layer B — Premium NEXX behavior.** The "judge/attorney/human" triple-lens. Includes:
- Answer-first rule
- Anti-generic rule
- Short paragraphs, prose > bullets
- Neutral non-accusatory framing
- Pattern > isolated incident
- Process-oriented (step-by-step, timeline, documents, mistakes)
- Dual output mode (plain + court-ready)
- Default answer shape (6 sections)
- Clarification policy
- Current response mode injection from `responseModes.ts`

---

#### [NEW] [src/lib/nexx/prompts/featurePrompt.ts](file:///Users/monicafernandez/Downloads/NEX/nexx-app/src/lib/nexx/prompts/featurePrompt.ts)

**Layer C — Tool/feature instructions.** When to use file search, legal retrieval, code interpreter. Judge-lens engine rules. Evidence → narrative → filing pipeline instructions.

---

#### [NEW] [src/lib/nexx/prompts/contextPrompt.ts](file:///Users/monicafernandez/Downloads/NEX/nexx-app/src/lib/nexx/prompts/contextPrompt.ts)

**Layer D — Dynamic context packet.** Built every turn from Convex data:
- User profile (state, county, attorney, tone, detail)
- Style preferences (judge-lens default, court-ready default)
- Case graph summary (JSON)
- Conversation summary
- Retrieved local sources
- Retrieved file context
- NEX behavioral profile (replaces current inline injection)

Replaces the current `buildSystemPrompt()` context-appending logic in [systemPrompt.ts](file:///Users/monicafernandez/Downloads/NEX/nexx-app/src/lib/systemPrompt.ts).

---

#### [NEW] [src/lib/nexx/postprocess.ts](file:///Users/monicafernandez/Downloads/NEX/nexx-app/src/lib/nexx/postprocess.ts)

Legal-specific post-processing:
- `polishLegalResponse()`: normalize whitespace, split long paragraphs, normalize headings, remove filler phrases, ensure "judge-lens" section if relevant, ensure "next steps" section, clean repeated disclaimers
- `polishCourtDraft()`: additionally strips conversational phrases, converts bullets → numbered lists, adds WHEREFORE language

---

#### [MODIFY] [route.ts (chat)](file:///Users/monicafernandez/Downloads/NEX/nexx-app/src/app/api/chat/route.ts)

**Major rewrite.** Current: `chat.completions.create` with one system prompt. New flow:

```
1. Auth + tier check (kept)
2. Rate limit (kept)  
3. Load user profile + NEX profile (moved here from client)
4. Load case graph + conversation summary (new)
5. Run router → mode + tool plan
6. Build 4-layer prompt stack
7. Call `openai.responses.create()` with streaming
8. Stream response to client
9. Capture final text
10. Run post-processor (new)
11. Send polished final version marker in stream
12. Background: update conversation summary + case graph
```

Key changes:
- `chat.completions.create` → `responses.create`
- `messages` array → `input` array with `system`, `developer`, `user` roles
- Temperature: `0.7` → mode-dependent (`0.25`–`0.5`)
- `max_tokens: 16384` → let Responses API manage
- Tavily search removed from this route (replaced by Layer D context injection + future legal retriever)
- Model: `gpt-4o` primary, `gpt-4o-mini` fallback (same as current, renamed to new constants)

---

#### [MODIFY] [tiers.ts](file:///Users/monicafernandez/Downloads/NEX/nexx-app/src/lib/tiers.ts)

Add mode-dependent temperature constants and update model references for Responses API compatibility.

---

#### [DELETE-CONTENT] [systemPrompt.ts](file:///Users/monicafernandez/Downloads/NEX/nexx-app/src/lib/systemPrompt.ts)

The monolithic `NEXX_SYSTEM_PROMPT` and `buildSystemPrompt()` are replaced by the 4-layer stack. This file will be kept but marked deprecated with a re-export pointing to the new location, so any other code referencing it doesn't break.

---

### Phase 1B — Memory: Case Graph + Conversation Summaries + Style Profiles

---

#### [NEW] [src/lib/nexx/caseGraph.ts](file:///Users/monicafernandez/Downloads/NEX/nexx-app/src/lib/nexx/caseGraph.ts)

TypeScript type definition for the `CaseGraph` structure:
- `jurisdiction` (state, county, court, masked case number)
- `parties` (user role, opposing party, attorney status)
- `children` (initials, age, schedule, routine)
- `custodyStructure` (legal type, possession pattern, communication terms)
- `currentOrders` (title, date, key terms, source file)
- `openIssues` (categorized with importance + user goal)
- `timeline` (date, event, significance, evidence refs)
- `evidenceThemes` (label, summary, supporting refs, weak points)
- `communicationPatterns` (label, summary, examples)
- `proceduralState` (pending filings, hearings, mediation, next decision)

---

#### [NEW] [src/lib/nexx/memory.ts](file:///Users/monicafernandez/Downloads/NEX/nexx-app/src/lib/nexx/memory.ts)

- `summarizeConversation()`: calls `gpt-4o-mini` with structured JSON output to compress conversation into `{establishedFacts, currentDisputes, knownOrderTerms, evidenceThemes, openLoops, userPreferences}`
- `updateCaseGraph()`: calls `gpt-4o-mini` to merge new turn data into the case graph
- `shouldCompact()`: trigger compaction every 6 turns
- `mergeCaseGraph()`: deterministic merge utility (dedup by key functions)

---

#### [NEW] [src/lib/nexx/streamRenderer.ts](file:///Users/monicafernandez/Downloads/NEX/nexx-app/src/lib/nexx/streamRenderer.ts)

Client-side stream accumulator:
- Buffers live text during streaming
- Detects `[[NEXX_FINAL_REWRITE_START]]` / `[[NEXX_FINAL_REWRITE_END]]` markers
- Swaps to polished final text when available
- `useNexxStream()` React hook

---

#### Convex Schema Additions

#### [MODIFY] [schema.ts](file:///Users/monicafernandez/Downloads/NEX/nexx-app/convex/schema.ts)

Add 3 new tables:

```typescript
// Conversation summaries (compacted memory)
conversationSummaries: defineTable({
    conversationId: v.id('conversations'),
    summary: v.string(),        // JSON of ConversationSummary
    updatedAt: v.number(),
}).index('by_conversationId', ['conversationId']),

// Case graphs (structured case intelligence)
caseGraphs: defineTable({
    userId: v.id('users'),
    conversationId: v.optional(v.id('conversations')),
    graphJson: v.string(),      // JSON of CaseGraph
    updatedAt: v.number(),
}).index('by_userId', ['userId'])
  .index('by_conversationId', ['conversationId']),

// Style adaptation profiles
userStyleProfiles: defineTable({
    userId: v.id('users'),
    prefersDetailedResponses: v.optional(v.boolean()),
    prefersJudgeLensByDefault: v.optional(v.boolean()),
    prefersCourtReadyLanguageByDefault: v.optional(v.boolean()),
    prefersStepByStepProcess: v.optional(v.boolean()),
    tonePreference: v.optional(v.union(
        v.literal('strategic'),
        v.literal('calm'),
        v.literal('warm'),
        v.literal('direct')
    )),
    updatedAt: v.number(),
}).index('by_userId', ['userId']),
```

---

#### [NEW] [convex/conversationSummaries.ts](file:///Users/monicafernandez/Downloads/NEX/nexx-app/convex/conversationSummaries.ts)

Mutations: `upsert`, Query: `getByConversation`

#### [NEW] [convex/caseGraphs.ts](file:///Users/monicafernandez/Downloads/NEX/nexx-app/convex/caseGraphs.ts)

Mutations: `upsert`, Query: `getByConversation`, `getByUser`

#### [NEW] [convex/userStyleProfiles.ts](file:///Users/monicafernandez/Downloads/NEX/nexx-app/convex/userStyleProfiles.ts)

Mutations: `upsert`, Query: `getByUser`

---

### Phase 2 — Retrieval: File Search + Legal Source Retriever

---

#### [NEW] [src/lib/nexx/legalRetriever.ts](file:///Users/monicafernandez/Downloads/NEX/nexx-app/src/lib/nexx/legalRetriever.ts)

Curated official-domain legal source retriever:
- `getApprovedDomains(state, county)`: returns allow-listed `.gov` / official court domains per state
- `retrieveLocalCourtSources()`: searches approved domains for current procedure
- Returns `LocalCourtSource[]` with title, url, sourceType, snippet, jurisdiction
- Phase 1: wraps your existing Tavily search with domain restrictions
- Phase 2: can be swapped for OpenAI web search tool or custom crawler

---

#### [NEW] [src/lib/nexx/fileSearch.ts](file:///Users/monicafernandez/Downloads/NEX/nexx-app/src/lib/nexx/fileSearch.ts)

Vector store search wrapper:
- `searchVectorStore()`: searches OpenAI vector stores for relevant file chunks
- Used when router detects file-related queries

---

#### [NEW] [src/lib/nexx/parser.ts](file:///Users/monicafernandez/Downloads/NEX/nexx-app/src/lib/nexx/parser.ts)

Document ingestion scaffold:
- `uploadFileToOpenAI()`: uploads file with `purpose: "assistants"`
- `createVectorStore()`: creates per-user/per-case vector store
- `addFileToVectorStore()`: indexes file
- `waitForVectorProcessing()`: polls until ready

---

#### [NEW] [src/app/api/upload/route.ts](file:///Users/monicafernandez/Downloads/NEX/nexx-app/src/app/api/upload/route.ts)

File upload endpoint: receives file → uploads to OpenAI → creates/updates vector store → returns IDs.

---

### Phase 3 — Frontend: Stream Rendering + Structured Display

---

#### [MODIFY] [ConversationPage (chat/[id])](file:///Users/monicafernandez/Downloads/NEX/nexx-app/src/app/%28app%29/chat/%5Bid%5D/page.tsx)

- Replace raw `streamingContent` accumulation with `useNexxStream()` hook
- Pass `vectorStoreId` if user has uploaded files
- Show polished final text via draft→final swap pattern

---

#### [MODIFY] [MessageBubble.tsx](file:///Users/monicafernandez/Downloads/NEX/nexx-app/src/components/chat/MessageBubble.tsx)

- Add section-aware rendering for structured responses
- Visual separation for "Court-Ready Wording" blocks
- Copy-section buttons for key sections

---

### Phase 4 — Tuning & Eval

---

#### [NEW] [src/lib/nexx/eval.ts](file:///Users/monicafernandez/Downloads/NEX/nexx-app/src/lib/nexx/eval.ts)

Eval framework:
- `NexxEval` type with scores for specificity, neutrality, legal usefulness, judge-lens quality, actionability, drafting cleanliness
- Eval prompt for internal QA
- Can be run against saved message pairs

---

## Open Questions

> [!IMPORTANT]
> **Model choice**: Should Phase 1 target `gpt-4o` (current, proven, cost-effective) or `gpt-5.4` (frontier, more expensive, potentially better at structured reasoning)? Recommend starting with `gpt-4o` and adding `gpt-5.4` as a premium option.

> [!IMPORTANT]
> **OpenAI Conversations API**: Should we integrate OpenAI's server-side conversation state now, or manage state entirely in Convex for Phase 1? Convex gives us more control and avoids vendor lock-in on a newer API surface.

> [!IMPORTANT]
> **File upload UI**: The current app doesn't have a file upload UI in chat. Phase 2 adds the API endpoint — should we also add a file attachment button to `ChatInput.tsx` in this PR, or defer the UI to a follow-up?

> [!IMPORTANT]
> **Tavily retention**: Currently Tavily searches `.gov` domains for statutes. The new `legalRetriever.ts` wraps this same logic with more structure. Should we keep Tavily as the search backend for Phase 1, or start building toward OpenAI's built-in `web_search_preview` tool?

---

## Verification Plan

### Automated Tests
- TypeScript compilation: `npx tsc --noEmit` (no type errors)
- Router unit tests: verify mode classification for 20+ sample messages
- Post-processor tests: verify filler removal, paragraph splitting, section injection
- Build verification: `npm run build` succeeds

### Manual Verification
1. **Chat flow**: Send a substantive legal question → verify 4-layer prompt stack produces better-structured output than current system
2. **Mode routing**: Test messages that should trigger each of the 8 modes → verify correct classification
3. **Post-processing**: Compare raw vs polished output → verify filler removal, structure enforcement
4. **Streaming**: Verify draft→final swap renders smoothly in the UI
5. **Fallback**: Verify `gpt-4o-mini` fallback still works when daily limit is reached
6. **Regression**: Existing features (DocuVault, incidents, resources, billing) are unaffected

### Production Smoke Test
- Deploy to Vercel preview branch
- Test 5 different question types across modes
- Verify no regressions in non-chat features
