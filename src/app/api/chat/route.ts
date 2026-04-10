import { NextRequest, after } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { openai, ensureOpenAIConversation } from '@/lib/openaiConversation';
import { classifyMessage } from '@/lib/nexx/router';
import { buildSystemPolicyPrompt } from '@/lib/nexx/prompts/systemPrompt';
import { buildDeveloperBehaviorPrompt } from '@/lib/nexx/prompts/developerPrompt';
import { buildFeatureToolPrompt } from '@/lib/nexx/prompts/featurePrompt';
import { buildArtifactPrompt } from '@/lib/nexx/prompts/artifactPrompt';
import { buildContextPrompt, type ContextPacket } from '@/lib/nexx/prompts/contextPrompt';
import { NEXX_RESPONSE_SCHEMA } from '@/lib/nexx/schemas';
import { recoverStructuredOutput } from '@/lib/nexx/recovery/recoverStructuredOutput';
import { suppressWeakArtifacts } from '@/lib/nexx/recovery/suppressWeakArtifacts';
import { extractOutputText } from '@/lib/nexx/validation/nexxArtifacts';
import { polishLegalResponse, injectConfidenceWarning } from '@/lib/nexx/postprocess';
import { createEmptyTrace, finalizeTrace, serializeTrace } from '@/lib/nexx/debug/buildTrace';
import { assessConfidence } from '@/lib/nexx/confidenceLayer';
import { NEXX_FUNCTION_TOOLS, executeFunctionTool } from '@/lib/nexx/functionTools';
import { persistAfterResponse } from '@/lib/nexx/persistAfterResponse';
import { checkRateLimit } from '@/lib/rateLimit';
import { getModelForRoute, getDailyLimit, type SubscriptionTier } from '@/lib/tiers';
import { getAuthenticatedConvexClient } from '@/lib/convexServer';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import type { NexxAssistantResponse, LocalCourtSource } from '@/lib/types';
import type { CaseGraph } from '@/lib/nexx/caseGraph';

const MAX_MESSAGE_LENGTH = 100_000;

/**
 * Vercel Pro: 300s timeout for AI responses.
 * Non-streaming structured output requires the full response before
 * parsing/recovery/validation can run.
 */
export const maxDuration = 300;

/**
 * NEXX Chat API Route — Full rewrite for Responses API
 * 
 * 18-step flow:
 * 1.  Parse body
 * 2.  Load conversation from Convex
 * 3.  ensureOpenAIConversation
 * 4.  Save openaiConversationId to Convex if first time
 * 5.  Create debug trace
 * 6.  Build context prompt
 * 7.  Build tools array
 * 8.  Call responses.create()
 * 9.  Process function calls (loop)
 * 10. Extract rawText
 * 11. Run recovery pipeline
 * 12. Run confidence assessment
 * 13. Save user message to Convex
 * 14. Save assistant message to Convex
 * 15. Save openaiLastResponseId
 * 16. Save debug trace
 * 17. persistAfterResponse (async)
 * 18. Return response
 */
export async function POST(req: NextRequest) {
  // ── Step 0: Auth guard ──
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    // ── Step 1: Parse body ──
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const {
      message,
      conversationId,
      userContext,
    } = body as {
      message?: string;
      conversationId?: string;
      userContext?: Record<string, unknown>;
    };

    if (!message || typeof message !== 'string' || message.length > MAX_MESSAGE_LENGTH) {
      return Response.json({ error: 'Invalid message' }, { status: 400 });
    }

    if (!conversationId) {
      return Response.json({ error: 'conversationId is required' }, { status: 400 });
    }

    // ── Fetch user record + tier ──
    const convex = await getAuthenticatedConvexClient();
    const validTiers: SubscriptionTier[] = ['free', 'pro', 'premium', 'executive'];
    let userTier: SubscriptionTier = 'free';
    let convexUserId: Id<'users'> | undefined;

    try {
      const userRecord = await convex.query(api.users.getByClerkId, { clerkId: clerkUserId });
      if (userRecord) {
        convexUserId = userRecord._id;
        if (userRecord.subscriptionTier && validTiers.includes(userRecord.subscriptionTier as SubscriptionTier)) {
          userTier = userRecord.subscriptionTier as SubscriptionTier;
        }
      }
    } catch (err) {
      console.warn('[Chat] Failed to fetch user tier:', err);
    }

    // ── Router: classify the turn ──
    const routerResult = classifyMessage(message);
    const { mode: routeMode, toolPlan, temperature } = routerResult;

    // ── Rate limit check (model-aware via router) ──
    const model = getModelForRoute(userTier, routeMode === 'judge_lens_strategy' ? 'judge_sim' : 'chat');
    const dailyCap = getDailyLimit(userTier, model);
    if (dailyCap !== -1) {
      const rateLimitKey = model.includes('pro') ? 'chat_message_5_4_pro' as const : 'chat_message_5_4' as const;
      const rl = checkRateLimit(clerkUserId, rateLimitKey, dailyCap);
      if (!rl.allowed) {
        return Response.json(
          { error: 'Daily message limit reached. Please upgrade your plan or try again tomorrow.' },
          { status: 429 }
        );
      }
    }

    // ── Step 2: Load conversation from Convex ──
    const typedConversationId = conversationId as Id<'conversations'>;
    let existingOpenAIConversationId: string | undefined;
    let existingVectorStoreId: string | undefined;

    try {
      const conversation = await convex.query(api.conversations.get, { id: typedConversationId });
      if (!conversation) {
        return Response.json({ error: 'Conversation not found' }, { status: 404 });
      }
      // Verify ownership: conversation must belong to the authenticated user
      if (convexUserId && conversation.userId !== convexUserId) {
        return Response.json({ error: 'Unauthorized access to conversation' }, { status: 403 });
      }
      existingOpenAIConversationId = conversation.openaiConversationId ?? undefined;
      existingVectorStoreId = conversation.vectorStoreId ?? undefined;
    } catch {
      // Conversation may not exist yet — continue
    }

    // ── Step 3: Ensure OpenAI conversation ──
    const openaiConversationId = await ensureOpenAIConversation(existingOpenAIConversationId);

    // ── Step 4: Save openaiConversationId to Convex if first time ──
    if (!existingOpenAIConversationId) {
      try {
        await convex.mutation(api.conversations.setOpenAIConversationState, {
          conversationId: typedConversationId,
          openaiConversationId,
        });
      } catch (err) {
        console.warn('[Chat] Failed to save conversation state:', err);
      }
    }

    // ── Step 5: Create debug trace ──
    const trace = createEmptyTrace({
      route: '/api/chat',
      routeMode,
      model,
      temperature,
      conversationId,
      userId: clerkUserId,
      userMessage: message.slice(0, 500),
    });

    // ── Step 6: Build context prompt ──
    const contextPacket: ContextPacket = {};

    // Populate from userContext if available
    if (userContext) {
      contextPacket.userProfile = {
        userName: userContext.userName as string | undefined,
        state: userContext.state as string | undefined,
        county: userContext.county as string | undefined,
        custodyType: userContext.custodyType as string | undefined,
        hasAttorney: userContext.hasAttorney as boolean | undefined,
        children: userContext.children as { name: string; age: number }[] | undefined,
      };

      // NEX profile
      if (userContext.nexNickname || userContext.nexManipulationTactics) {
        contextPacket.nexProfile = {
          nickname: userContext.nexNickname as string | undefined,
          communicationStyle: userContext.nexCommunicationStyle as string | undefined,
          manipulationTactics: userContext.nexManipulationTactics as string[] | undefined,
          triggerPatterns: userContext.nexTriggerPatterns as string[] | undefined,
          detectedPatterns: userContext.nexDetectedPatterns as string[] | undefined,
        };
      }
    }

    // Load conversation summary + case graph from Convex
    let existingCaseGraph: CaseGraph | undefined;
    const retrievedSources: LocalCourtSource[] = [];
    try {
      const [summaryDoc, caseGraphDoc] = await Promise.all([
        convex.query(api.conversationSummaries.getByConversation, { conversationId: typedConversationId }),
        convexUserId ? convex.query(api.caseGraphs.getByUser, { userId: convexUserId }) : null,
      ]);

      if (summaryDoc) {
        try {
          contextPacket.conversationSummary = JSON.parse(summaryDoc.summary);
        } catch { /* invalid JSON — skip */ }
      }

      if (caseGraphDoc) {
        try {
          existingCaseGraph = JSON.parse(caseGraphDoc.graphJson);
          contextPacket.caseGraph = existingCaseGraph;
        } catch { /* invalid JSON — skip */ }
      }
    } catch {
      // Non-fatal — continue without context
    }

    // ── Step 7: Build tools array ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools: any[] = [...NEXX_FUNCTION_TOOLS];

    if (toolPlan.useFileSearch && existingVectorStoreId) {
      tools.push({
        type: 'file_search',
        vector_store_ids: [existingVectorStoreId],
      });
    }

    if (toolPlan.useWebSearch) {
      tools.push({ type: 'web_search_preview' });
    }

    // ── Step 8: Call responses.create() ──
    const systemPrompt = buildSystemPolicyPrompt();
    const developerPrompt = buildDeveloperBehaviorPrompt(routeMode);
    const featurePrompt = buildFeatureToolPrompt(toolPlan);
    const artifactPrompt = buildArtifactPrompt();
    const contextPrompt = buildContextPrompt(contextPacket);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let response: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      response = await (openai.responses as any).create({
        model,
        reasoning: { effort: 'medium' },
        temperature,
        conversation: openaiConversationId,
        input: [
          { role: 'system', content: systemPrompt },
          { role: 'developer', content: developerPrompt },
          { role: 'developer', content: featurePrompt },
          { role: 'developer', content: artifactPrompt },
          { role: 'developer', content: contextPrompt },
          { role: 'user', content: message },
        ],
        tools: tools.length > 0 ? tools : undefined,
        text: { format: NEXX_RESPONSE_SCHEMA },
      });
    } catch (error) {
      console.error('[Chat] responses.create failed:', error);
      return Response.json({ error: 'Failed to generate response' }, { status: 500 });
    }

    // ── Step 9: Process function calls (loop) ──
    const MAX_FUNCTION_CALL_ROUNDS = 5;
    let rounds = 0;

    while (rounds < MAX_FUNCTION_CALL_ROUNDS) {
      // Check if response contains function_call outputs
      const functionCalls = response.output?.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (item: any) => item.type === 'function_call'
      ) || [];

      if (functionCalls.length === 0) break;

      // Execute each function call
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const functionOutputs: any[] = [];
      for (const fc of functionCalls) {
        if (!convexUserId) {
          functionOutputs.push({
            type: 'function_call_output',
            call_id: fc.call_id,
            output: JSON.stringify({ success: false, error: 'User context unavailable for tool execution.' }),
          });
          continue;
        }

        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(fc.arguments || '{}');
        } catch { /* use empty args */ }

        const result = await executeFunctionTool(
          fc.name,
          parsedArgs,
          { convex, userId: convexUserId, conversationId: typedConversationId }
        );

        functionOutputs.push({
          type: 'function_call_output',
          call_id: fc.call_id,
          output: JSON.stringify(result),
        });

        // Record tool run
        try {
          await convex.mutation(api.toolRuns.create, {
            conversationId: typedConversationId,
            toolType: fc.name,
            inputJson: JSON.stringify(parsedArgs),
            outputJson: JSON.stringify(result),
          });
        } catch { /* non-fatal */ }
      }

      // Re-call with function outputs
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      response = await (openai.responses as any).create({
        model,
        conversation: openaiConversationId,
        input: functionOutputs,
        tools: tools.length > 0 ? tools : undefined,
        text: { format: NEXX_RESPONSE_SCHEMA },
      });

      rounds++;
    }

    // ── Step 10: Extract rawText ──
    const rawText = extractOutputText(response);

    trace.generation = {
      rawResponseText: rawText.slice(0, 5000),
      parseSuccess: false,
    };

    // ── Step 11: Recovery pipeline ──
    const recoveryResult = await recoverStructuredOutput(rawText, {
      systemPrompt,
      developerPrompt: [developerPrompt, featurePrompt, artifactPrompt, contextPrompt].join('\n\n'),
      userPayload: { message },
      model,
    });

    let parsedResponse: NexxAssistantResponse = recoveryResult.data;
    trace.generation.parseSuccess = recoveryResult.stage !== 'fallback';
    trace.recovery = {
      used: recoveryResult.stage !== 'initial_parse',
      stage: recoveryResult.stage,
    };

    // Suppress weak artifacts
    parsedResponse = suppressWeakArtifacts(parsedResponse);

    // Polish message
    parsedResponse.message = polishLegalResponse(parsedResponse.message);

    // ── Step 12: Confidence assessment ──
    try {
      const confidence = await assessConfidence(parsedResponse, retrievedSources, existingCaseGraph);
      parsedResponse.artifacts.confidence = confidence;
      parsedResponse.message = injectConfidenceWarning(parsedResponse.message, confidence);
    } catch (err) {
      console.warn('[Chat] Confidence assessment failed:', err);
    }

    // Record trace artifacts
    trace.artifacts = {
      draftReady: parsedResponse.artifacts.draftReady,
      timelineReady: parsedResponse.artifacts.timelineReady,
      exhibitReady: parsedResponse.artifacts.exhibitReady,
      judgeSimulation: parsedResponse.artifacts.judgeSimulation,
      oppositionSimulation: parsedResponse.artifacts.oppositionSimulation,
      confidence: parsedResponse.artifacts.confidence,
    };

    // ── Step 13: Save user message to Convex ──
    try {
      await convex.mutation(api.messages.createMessage, {
        conversationId: typedConversationId,
        role: 'user',
        content: message,
        mode: routeMode,
      });
    } catch (err) {
      console.warn('[Chat] Failed to save user message:', err);
    }

    // ── Step 14: Save assistant message to Convex ──
    try {
      await convex.mutation(api.messages.createMessage, {
        conversationId: typedConversationId,
        role: 'assistant',
        content: parsedResponse.message,
        mode: routeMode,
        artifactsJson: JSON.stringify(parsedResponse.artifacts),
      });
    } catch (err) {
      console.warn('[Chat] Failed to save assistant message:', err);
    }

    // ── Step 15: Save openaiLastResponseId ──
    const responseId = response?.id;
    if (responseId) {
      try {
        await convex.mutation(api.conversations.setLastResponseId, {
          conversationId: typedConversationId,
          openaiLastResponseId: responseId,
        });
      } catch { /* non-fatal */ }
    }

    // ── Step 16: Save debug trace ──
    const finalTrace = finalizeTrace(trace, true, startTime);

    // Capture token usage if available
    if (response?.usage) {
      finalTrace.performance = {
        ...finalTrace.performance,
        latencyMs: finalTrace.performance?.latencyMs ?? 0,
        tokenUsage: {
          promptTokens: response.usage.input_tokens ?? 0,
          completionTokens: response.usage.output_tokens ?? 0,
          totalTokens: (response.usage.input_tokens ?? 0) + (response.usage.output_tokens ?? 0),
        },
      };
    }

    try {
      await convex.mutation(api.debugTraces.create, {
        traceId: finalTrace.traceId,
        route: '/api/chat',
        routeMode,
        userId: clerkUserId,
        conversationId: typedConversationId,
        debugJson: serializeTrace(finalTrace),
      });
    } catch { /* non-fatal */ }

    // ── Step 17: persistAfterResponse (via Next.js after() hook) ──
    // Load all messages for summary compaction
    try {
      const allMessages = await convex.query(api.messages.list, { conversationId: typedConversationId });
      const messageArray = allMessages.map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      }));

      // Use after() for reliable execution even after response is sent
      after(async () => {
        try {
          await persistAfterResponse({
            conversationId,
            messages: messageArray,
            messageCount: messageArray.length,
            existingSummary: contextPacket.conversationSummary,
            existingCaseGraph,
            saveSummary: async (summary, turnCount) => {
              await convex.mutation(api.conversationSummaries.upsert, {
                conversationId: typedConversationId,
                summary: JSON.stringify(summary),
                turnCount,
              });
            },
            saveCaseGraph: async (graphJson) => {
              if (convexUserId) {
                await convex.mutation(api.caseGraphs.upsert, {
                  userId: convexUserId,
                  graphJson,
                });
              }
            },
          });
        } catch (err) {
          console.warn('[Chat] persistAfterResponse error:', err);
        }
      });
    } catch { /* non-fatal */ }

    // ── Step 18: Return response ──
    return Response.json({
      ok: true,
      response: parsedResponse,
      openaiConversationId,
      routeMode,
    });

  } catch (error) {
    console.error('[Chat] API error:', error);
    return Response.json(
      { error: 'Failed to generate response' },
      { status: 500 }
    );
  }
}
