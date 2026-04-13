/**
 * Pattern Detection API — POST /api/workspace/patterns
 *
 * Analyzes case data (incidents, timeline, caseMemory) to detect
 * evidence-based behavioral patterns using GPT structured output.
 *
 * Results are scored locally using premiumAnalytics.scorePattern()
 * and stored in caseMemory as type: 'pattern_analysis'.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOpenAIClient } from '@/lib/openaiConversation';
import { getAuthenticatedConvexClient } from '@/lib/convexServer';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { PATTERN_DETECTION_SCHEMA } from '@/lib/nexx/schemas';
import { buildPatternPrompt } from '@/lib/nexx/prompts/patternPrompt';
import { scorePattern, countDistinctDates, BEHAVIOR_CATEGORIES } from '@/lib/nexx/premiumAnalytics';
import type { DetectedPattern, PatternEvent, BehaviorCategory } from '@/lib/nexx/premiumAnalytics';
import { randomUUID } from 'crypto';
import { PRIMARY_MODEL } from '@/lib/tiers';

export const maxDuration = 60;

/** Serialize an array of Convex documents into a readable string for the prompt. */
function serializeForPrompt(items: unknown[], label: string): string {
    if (!items || items.length === 0) return `No ${label} documented.`;
    return JSON.stringify(items, null, 2);
}

/**
 * POST /api/workspace/patterns — Run pattern detection on a case.
 *
 * Request body: { caseId: string }
 * Returns: { patterns: DetectedPattern[], suppressedCandidates: SuppressedCandidate[] }
 */
export async function POST(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let caseId: Id<'cases'>;
    try {
        const body = await req.json();
        if (!body.caseId || typeof body.caseId !== 'string') {
            return NextResponse.json({ error: 'caseId is required' }, { status: 400 });
        }
        caseId = body.caseId as Id<'cases'>;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    try {
        const convex = await getAuthenticatedConvexClient();

        // Load all case data in parallel
        // TODO (Sprint 5): Replace with case-scoped queries once caseId is on incidents/timeline.
        const [incidents, timeline, caseMemory] = await Promise.all([
            convex.query(api.incidents.list, {}),
            convex.query(api.timelineCandidates.listByUser, {}),
            convex.query(api.caseMemory.listByUser, {}),
        ]);

        // Best-effort case filtering where caseId field is available
        const caseScopedMemory = (caseMemory ?? []).filter(
            (m: { caseId?: Id<'cases'> }) => !m.caseId || m.caseId === caseId,
        );
        // TODO (Sprint 5): Filter incidents/timeline by caseId once schema supports it.
        const caseScopedIncidents = incidents ?? [];
        const caseScopedTimeline = timeline ?? [];

        // Build serialized context for the prompt
        const caseContext = {
            incidents: serializeForPrompt(caseScopedIncidents, 'incidents'),
            timeline: serializeForPrompt(caseScopedTimeline, 'timeline events'),
            caseMemory: serializeForPrompt(caseScopedMemory, 'case memory items'),
            caseGraphSummary: 'Case graph not yet loaded — provide context from incidents and timeline.',
        };

        // Check minimum data threshold
        const totalEvents = caseScopedIncidents.length + caseScopedTimeline.length + caseScopedMemory.length;
        if (totalEvents < 3) {
            return NextResponse.json({
                patterns: [],
                suppressedCandidates: [{
                    reason: `Only ${totalEvents} events documented. Pattern detection requires at least 3 events across multiple dates.`,
                    eventCount: totalEvents,
                    category: 'insufficient_data',
                }],
                message: 'Insufficient data for pattern detection. Add more incidents or timeline events.',
            });
        }

        // Call GPT for pattern detection
        const client = getOpenAIClient();
        const response = await client.responses.create({
            model: PRIMARY_MODEL,
            instructions: buildPatternPrompt(caseContext),
            input: 'Analyze the case data provided in the instructions and detect behavioral patterns.',
            text: { format: PATTERN_DETECTION_SCHEMA },
        });

        // Parse structured output
        const outputText = response.output_text;
        const rawResult = JSON.parse(outputText);

        // Score each pattern locally using our scoring system
        const scoredPatterns: DetectedPattern[] = rawResult.patterns
            .map((p: {
                title: string;
                summary: string;
                category: string;
                supportingEvents: PatternEvent[];
                behavioralSimilarity: 'weak' | 'moderate' | 'strong';
                observability: 'interpretive' | 'mostly_observable' | 'clearly_observable';
            }) => {
                const distinctDates = countDistinctDates(p.supportingEvents);
                const scoring = scorePattern({
                    eventCount: p.supportingEvents.length,
                    distinctDates,
                    allSourceBacked: p.supportingEvents.every(e => e.sourceType !== undefined),
                    behavioralSimilarity: p.behavioralSimilarity,
                    observability: p.observability,
                });

                return {
                    title: p.title,
                    summary: p.summary,
                    supportingEvents: p.supportingEvents,
                    confidence: scoring.confidence,
                    score: scoring.score,
                    category: (BEHAVIOR_CATEGORIES as readonly string[]).includes(p.category)
                        ? (p.category as BehaviorCategory)
                        : ('missed_or_delayed_calls' as BehaviorCategory),
                    _eligible: scoring.eligibleToShow,
                };
            })
            .filter((p: DetectedPattern & { _eligible: boolean }) => p._eligible)
            .map((p: DetectedPattern & { _eligible: boolean }): DetectedPattern => ({
                title: p.title,
                summary: p.summary,
                supportingEvents: p.supportingEvents,
                confidence: p.confidence,
                score: p.score,
                category: p.category,
            }));

        // Store results in caseMemory (with requestId for idempotency)
        const requestId = randomUUID();
        await convex.mutation(api.caseMemory.save, {
            caseId,
            type: 'pattern_analysis',
            content: JSON.stringify({
                patterns: scoredPatterns,
                suppressedCandidates: rawResult.suppressedCandidates,
                generatedAt: new Date().toISOString(),
            }),
            title: `Pattern Analysis — ${new Date().toLocaleDateString()}`,
            requestId,
        });

        return NextResponse.json({
            patterns: scoredPatterns,
            suppressedCandidates: rawResult.suppressedCandidates,
        });
    } catch (err) {
        console.error('[patterns] Error:', err);
        return NextResponse.json(
            { error: 'Pattern detection failed', detail: err instanceof Error ? err.message : 'Unknown error' },
            { status: 500 },
        );
    }
}
