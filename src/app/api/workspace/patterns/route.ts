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
import { PRIMARY_MODEL } from '@/lib/tiers';
import { stableRequestId, serializeForPrompt } from '@/lib/workspace-utils';

export const maxDuration = 60;

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

        // Load case data in parallel
        const [incidents, timeline, caseMemory] = await Promise.all([
            convex.query(api.incidents.list, {}),
            convex.query(api.timelineCandidates.listByUser, {}),
            convex.query(api.caseMemory.listByUser, {}),
        ]);

        // ── Case-scoped filtering ──
        // caseMemory, timelineCandidates, and casePins have optional caseId → filter by it.
        // incidents schema lacks caseId today; filter applied for forward-compatibility
        // so it activates automatically once Sprint 5 adds the field.
        const caseScopedMemory = (caseMemory ?? []).filter(
            (m: { caseId?: Id<'cases'> }) => !m.caseId || m.caseId === caseId,
        );
        const caseScopedTimeline = (timeline ?? []).filter(
            (t: { caseId?: Id<'cases'> }) => !t.caseId || t.caseId === caseId,
        );
        const caseScopedIncidents = (incidents ?? []).filter(
            (i) => !(i as Record<string, unknown>).caseId || (i as Record<string, unknown>).caseId === caseId,
        );

        // Exclude prior AI-generated artifacts so synthetic output
        // doesn't become evidence for subsequent runs.
        const primaryCaseMemory = caseScopedMemory.filter(
            (m: { type?: string }) =>
                m.type !== 'pattern_analysis' && m.type !== 'narrative_synthesis',
        );

        // Build serialized context for the prompt
        const caseContext = {
            incidents: serializeForPrompt(caseScopedIncidents, 'incidents'),
            timeline: serializeForPrompt(caseScopedTimeline, 'timeline events'),
            caseMemory: serializeForPrompt(primaryCaseMemory, 'case memory items'),
            caseGraphSummary: 'Case graph not yet loaded — provide context from incidents and timeline.',
        };

        // Check minimum data threshold (primary evidence only)
        const totalEvents =
            caseScopedIncidents.length +
            caseScopedTimeline.length +
            primaryCaseMemory.length;
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

        // Build a lookup of all known source IDs from loaded records
        // so we can validate GPT's source references against real data.
        const knownSourceIds = new Set<string>([
            ...caseScopedIncidents.map((i: { _id: string }) => i._id),
            ...caseScopedTimeline.map((t: { _id: string }) => t._id),
            ...primaryCaseMemory.map((m: { _id: string }) => m._id),
        ]);

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

                // Validate source-backing by cross-referencing against
                // actual loaded records (not just schema presence).
                const allSourceBacked = p.supportingEvents.every(
                    (e: PatternEvent) => e.sourceId != null && knownSourceIds.has(e.sourceId),
                );

                const scoring = scorePattern({
                    eventCount: p.supportingEvents.length,
                    distinctDates,
                    allSourceBacked,
                    behavioralSimilarity: p.behavioralSimilarity,
                    observability: p.observability,
                });

                return {
                    title: p.title,
                    summary: p.summary,
                    supportingEvents: p.supportingEvents,
                    confidence: scoring.confidence,
                    score: scoring.score,
                    category: (() => {
                        if ((BEHAVIOR_CATEGORIES as readonly string[]).includes(p.category)) {
                            return p.category as BehaviorCategory;
                        }
                        console.warn(`[patterns] Unrecognized category "${p.category}", defaulting to missed_or_delayed_calls`);
                        return 'missed_or_delayed_calls' as BehaviorCategory;
                    })(),
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

        // Store results in caseMemory with a stable requestId so client
        // retries on the same day don't create duplicate rows.
        const requestId = stableRequestId(caseId, 'pattern_analysis');
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
