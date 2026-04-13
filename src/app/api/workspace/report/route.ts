/**
 * Report Generation API — POST /api/workspace/report
 *
 * Generates a formatted case report with configurable output type,
 * tone, and pattern handling. Aggregates narrative, patterns,
 * timeline, and key points into a structured document.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOpenAIClient } from '@/lib/openaiConversation';
import { getAuthenticatedConvexClient } from '@/lib/convexServer';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { CASE_REPORT_SCHEMA } from '@/lib/nexx/schemas';
import { buildReportPrompt } from '@/lib/nexx/prompts/reportPrompt';
import { PRIMARY_MODEL } from '@/lib/tiers';
import type { OutputType, ToneType, PatternHandling } from '@/lib/workspace-types';

export const maxDuration = 60;

/** Serialize an array of Convex documents into a readable string. */
function serializeForPrompt(items: unknown[], label: string): string {
    if (!items || items.length === 0) return `No ${label} documented.`;
    return JSON.stringify(items, null, 2);
}

/** Validate report configuration from request body. */
function validateConfig(body: Record<string, unknown>): {
    valid: boolean;
    error?: string;
    config?: { caseId: Id<'cases'>; outputType: OutputType; tone: ToneType; patternHandling: PatternHandling };
} {
    if (!body.caseId || typeof body.caseId !== 'string') {
        return { valid: false, error: 'caseId is required' };
    }

    const validOutputTypes: OutputType[] = ['summary', 'court_document', 'both'];
    const validTones: ToneType[] = ['neutral_concise', 'detailed_organized', 'attorney_ready'];
    const validPatternHandling: PatternHandling[] = ['include_supported', 'exclude'];

    const outputType = (body.outputType as OutputType) ?? 'summary';
    const tone = (body.tone as ToneType) ?? 'neutral_concise';
    const patternHandling = (body.patternHandling as PatternHandling) ?? 'include_supported';

    if (!validOutputTypes.includes(outputType)) {
        return { valid: false, error: `Invalid outputType. Must be one of: ${validOutputTypes.join(', ')}` };
    }
    if (!validTones.includes(tone)) {
        return { valid: false, error: `Invalid tone. Must be one of: ${validTones.join(', ')}` };
    }
    if (!validPatternHandling.includes(patternHandling)) {
        return { valid: false, error: `Invalid patternHandling. Must be one of: ${validPatternHandling.join(', ')}` };
    }

    return {
        valid: true,
        config: {
            caseId: body.caseId as Id<'cases'>,
            outputType,
            tone,
            patternHandling,
        },
    };
}

/**
 * POST /api/workspace/report — Generate a case report.
 *
 * Request body: { caseId, outputType?, tone?, patternHandling? }
 * Returns: { title, generatedAt, sections, summary, recommendations }
 */
export async function POST(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let config: NonNullable<ReturnType<typeof validateConfig>['config']>;
    try {
        const body = await req.json();
        const validation = validateConfig(body);
        if (!validation.valid || !validation.config) {
            return NextResponse.json({ error: validation.error }, { status: 400 });
        }
        config = validation.config;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    try {
        const convex = await getAuthenticatedConvexClient();

        // Load case data in parallel
        // TODO (Sprint 5): Replace with case-scoped queries once caseId is on timeline.
        const [timeline, caseMemory] = await Promise.all([
            convex.query(api.timelineCandidates.listByUser, {}),
            convex.query(api.caseMemory.listByUser, {}),
        ]);

        // Best-effort case filtering
        const caseScopedMemory = (caseMemory ?? []).filter(
            (m: { caseId?: Id<'cases'> }) => !m.caseId || m.caseId === config.caseId,
        );
        // TODO (Sprint 5): Filter timeline by caseId once schema supports it.
        const caseScopedTimeline = timeline ?? [];

        // Find most recent narrative and pattern analysis
        const narrativeItem = caseScopedMemory
            .filter((m: { type: string }) => m.type === 'narrative_synthesis')
            .sort((a: { _creationTime: number }, b: { _creationTime: number }) =>
                b._creationTime - a._creationTime,
            )[0];

        const patternItem = caseScopedMemory
            .filter((m: { type: string }) => m.type === 'pattern_analysis')
            .sort((a: { _creationTime: number }, b: { _creationTime: number }) =>
                b._creationTime - a._creationTime,
            )[0];

        // Key points are non-meta caseMemory items
        const keyPoints = caseScopedMemory.filter(
            (m: { type: string }) => !['pattern_analysis', 'narrative_synthesis'].includes(m.type),
        );

        // Build pattern context — differentiate 'excluded' from 'not available'
        let patternsContext: string;
        if (config.patternHandling !== 'include_supported') {
            patternsContext = 'Pattern analysis excluded per user configuration.';
        } else if (patternItem) {
            patternsContext = (patternItem as { content?: string }).content ?? 'No patterns analyzed.';
        } else {
            patternsContext = 'No pattern analysis available. Run pattern detection first for best results.';
        }

        const caseContext = {
            caseGraphSummary: 'Derive case context from the narrative and key points below.',
            narrative: narrativeItem
                ? (narrativeItem as { content?: string }).content ?? 'No narrative generated yet.'
                : 'No narrative generated yet. Generate a case narrative first for best results.',
            patterns: patternsContext,
            timeline: serializeForPrompt(caseScopedTimeline, 'timeline events'),
            keyPoints: serializeForPrompt(keyPoints, 'key points'),
        };

        // Call GPT for report generation
        const client = getOpenAIClient();
        const response = await client.responses.create({
            model: PRIMARY_MODEL,
            instructions: buildReportPrompt(
                { outputType: config.outputType, tone: config.tone, patternHandling: config.patternHandling },
                caseContext,
            ),
            input: `Generate a ${config.outputType} report with ${config.tone} tone.`,
            text: { format: CASE_REPORT_SCHEMA },
        });

        const report = JSON.parse(response.output_text);

        // Server-stamp generatedAt (don't rely on model for timestamps)
        report.generatedAt = new Date().toISOString();

        return NextResponse.json(report);
    } catch (err) {
        console.error('[report] Error:', err);
        return NextResponse.json(
            { error: 'Report generation failed', detail: err instanceof Error ? err.message : 'Unknown error' },
            { status: 500 },
        );
    }
}
