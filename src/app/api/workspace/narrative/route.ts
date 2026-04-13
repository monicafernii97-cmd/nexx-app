/**
 * Narrative Synthesis API — POST /api/workspace/narrative
 *
 * Generates a structured "Story of the Case" narrative by combining
 * incidents, timeline, case memory, pins, and detected patterns.
 *
 * Results are stored in caseMemory as type: 'narrative_synthesis'.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOpenAIClient } from '@/lib/openaiConversation';
import { getAuthenticatedConvexClient } from '@/lib/convexServer';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { CASE_NARRATIVE_SCHEMA } from '@/lib/nexx/schemas';
import { buildNarrativePrompt } from '@/lib/nexx/prompts/narrativePrompt';
import { PRIMARY_MODEL } from '@/lib/tiers';
import type { CaseNarrative } from '@/lib/workspace-types';
import { createHash } from 'crypto';

/**
 * Derive a stable idempotency key from case context.
 * Same caseId + type + calendar day → same key, so retries within a day dedupe.
 */
function stableRequestId(caseId: string, type: string): string {
    const dayKey = new Date().toISOString().slice(0, 10);
    return createHash('sha256').update(`${caseId}:${type}:${dayKey}`).digest('hex').slice(0, 32);
}

export const maxDuration = 60;

/** Serialize an array of Convex documents into a readable string. */
function serializeForPrompt(items: unknown[], label: string): string {
    if (!items || items.length === 0) return `No ${label} documented.`;
    return JSON.stringify(items, null, 2);
}

/**
 * POST /api/workspace/narrative — Generate a case narrative.
 *
 * Request body: { caseId: string }
 * Returns: CaseNarrative
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
        const [incidents, timeline, caseMemory, pins] = await Promise.all([
            convex.query(api.incidents.list, {}),
            convex.query(api.timelineCandidates.listByUser, {}),
            convex.query(api.caseMemory.listByUser, {}),
            convex.query(api.casePins.listByUser, {}),
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
        const caseScopedPins = (pins ?? []).filter(
            (p: { caseId?: Id<'cases'> }) => !p.caseId || p.caseId === caseId,
        );

        // Find existing pattern analysis (most recent)
        const patternAnalysis = caseScopedMemory
            .filter((m: { type: string }) => m.type === 'pattern_analysis')
            .sort((a: { _creationTime: number }, b: { _creationTime: number }) =>
                b._creationTime - a._creationTime,
            )[0];

        const caseContext = {
            caseGraphSummary: 'Derive case context from the incidents, timeline, and case memory below.',
            incidents: serializeForPrompt(caseScopedIncidents, 'incidents'),
            timeline: serializeForPrompt(caseScopedTimeline, 'timeline events'),
            caseMemory: serializeForPrompt(
                caseScopedMemory.filter((m: { type: string }) =>
                    m.type !== 'pattern_analysis' && m.type !== 'narrative_synthesis',
                ),
                'case memory items',
            ),
            pins: serializeForPrompt(caseScopedPins, 'pinned items'),
            patterns: (() => {
                const raw = (patternAnalysis as { content?: string } | undefined)?.content;
                if (!raw) return 'No patterns analyzed yet.';
                try {
                    const parsed = JSON.parse(raw) as { patterns?: unknown[] };
                    return serializeForPrompt(parsed.patterns ?? [], 'supported patterns');
                } catch {
                    return 'No patterns analyzed yet.';
                }
            })(),
        };

        // Call GPT for narrative synthesis
        const client = getOpenAIClient();
        const response = await client.responses.create({
            model: PRIMARY_MODEL,
            instructions: buildNarrativePrompt(caseContext),
            input: 'Generate a comprehensive case narrative from the provided case data.',
            text: { format: CASE_NARRATIVE_SCHEMA },
        });

        const narrative: CaseNarrative = JSON.parse(response.output_text);

        // Store in caseMemory with a stable requestId so client
        // retries on the same day don't create duplicate rows.
        const requestId = stableRequestId(caseId, 'narrative_synthesis');
        await convex.mutation(api.caseMemory.save, {
            caseId,
            type: 'narrative_synthesis',
            content: JSON.stringify(narrative),
            title: narrative.title || `Case Narrative — ${new Date().toLocaleDateString()}`,
            requestId,
        });

        return NextResponse.json(narrative);
    } catch (err) {
        console.error('[narrative] Error:', err);
        return NextResponse.json(
            { error: 'Narrative synthesis failed', detail: err instanceof Error ? err.message : 'Unknown error' },
            { status: 500 },
        );
    }
}
