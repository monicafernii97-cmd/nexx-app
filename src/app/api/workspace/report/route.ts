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
import { serializeForPrompt } from '@/lib/workspace-utils';
import type {
    BuildReportPayload,
    PatternHandling as MobilePatternHandling,
    ReportOutputType,
    ReportTone,
} from '@/lib/mobile/reportTypes';

export const maxDuration = 60;

type ReportSource = 'workspace_mobile' | 'workspace_desktop';

type WorkspaceReport = {
    title?: string;
    generatedAt?: string;
    summary?: string;
    sections?: Array<{ heading?: string; body?: string }>;
    recommendations?: string[];
    [key: string]: unknown;
};

type ReportConfig = {
    caseId: Id<'cases'>;
    outputType: OutputType;
    tone: ToneType;
    patternHandling: PatternHandling;
    source: ReportSource;
    mobilePayload?: BuildReportPayload;
};

/** Convert a generated workspace report into durable draft text. */
function formatWorkspaceReport(report: WorkspaceReport): string {
    const sections = report.sections
        ?.map((section) => {
            const heading = section.heading?.trim();
            const body = section.body?.trim();
            if (!heading && !body) return null;
            return [heading, body].filter(Boolean).join('\n');
        })
        .filter(Boolean) ?? [];
    const recommendations = report.recommendations?.filter(Boolean) ?? [];

    return [
        report.summary?.trim() && `Summary\n${report.summary.trim()}`,
        ...sections,
        recommendations.length > 0 &&
            `Recommendations\n${recommendations.map((item, index) => `${index + 1}. ${item}`).join('\n')}`,
    ].filter(Boolean).join('\n\n');
}

/** Create an idempotency-safe operation id from report content and options. */
function createStableReportOperationId(...parts: string[]) {
    const input = parts.join('\u001f');
    let hash = 5381;
    for (let index = 0; index < input.length; index += 1) {
        hash = ((hash << 5) + hash) ^ input.charCodeAt(index);
    }
    return `${parts[0]}-${(hash >>> 0).toString(36)}`;
}

/** Normalize desktop and mobile output type names into the shared API enum. */
function normalizeOutputType(value: unknown, defaultValue: OutputType): OutputType | null {
    const mobileMap: Record<ReportOutputType, OutputType> = {
        summary_pdf: 'summary',
        court_document: 'court_document',
        both: 'both',
    };
    if (value === 'summary' || value === 'court_document' || value === 'both') return value;
    if (typeof value === 'string' && value in mobileMap) {
        return mobileMap[value as ReportOutputType];
    }
    return value === undefined || value === null ? defaultValue : null;
}

/** Normalize desktop and mobile tone names into the shared API enum. */
function normalizeTone(value: unknown, defaultValue: ToneType): ToneType | null {
    const mobileMap: Record<ReportTone, ToneType> = {
        neutral: 'neutral_concise',
        detailed: 'detailed_organized',
        attorney_ready: 'attorney_ready',
    };
    if (value === 'neutral_concise' || value === 'detailed_organized' || value === 'attorney_ready') return value;
    if (typeof value === 'string' && value in mobileMap) {
        return mobileMap[value as ReportTone];
    }
    return value === undefined || value === null ? defaultValue : null;
}

/** Normalize desktop and mobile pattern handling names into the shared API enum. */
function normalizePatternHandling(value: unknown, defaultValue: PatternHandling): PatternHandling | null {
    const mobileMap: Record<MobilePatternHandling, PatternHandling> = {
        include_supported_only: 'include_supported',
        exclude_patterns: 'exclude',
    };
    if (value === 'include_supported' || value === 'exclude') return value;
    if (typeof value === 'string' && value in mobileMap) {
        return mobileMap[value as MobilePatternHandling];
    }
    return value === undefined || value === null ? defaultValue : null;
}

/** Convert normalized API output type back into the mobile contract enum. */
function toMobileOutputType(outputType: OutputType): ReportOutputType {
    if (outputType === 'summary') return 'summary_pdf';
    return outputType;
}

/** Convert normalized API tone back into the mobile contract enum. */
function toMobileTone(tone: ToneType): ReportTone {
    if (tone === 'neutral_concise') return 'neutral';
    if (tone === 'detailed_organized') return 'detailed';
    return 'attorney_ready';
}

/** Convert normalized API pattern handling back into the mobile contract enum. */
function toMobilePatternHandling(patternHandling: PatternHandling): MobilePatternHandling {
    if (patternHandling === 'include_supported') return 'include_supported_only';
    return 'exclude_patterns';
}

/** Validate report configuration from request body. */
function validateConfig(body: Record<string, unknown>): {
    valid: boolean;
    error?: string;
    config?: ReportConfig;
} {
    if (!body.caseId || typeof body.caseId !== 'string') {
        return { valid: false, error: 'caseId is required' };
    }

    const source: ReportSource = body.source === 'workspace_mobile' ? 'workspace_mobile' : 'workspace_desktop';
    const defaultOutputType: OutputType = source === 'workspace_mobile' ? 'both' : 'summary';
    const defaultTone: ToneType = source === 'workspace_mobile' ? 'neutral_concise' : 'attorney_ready';
    const defaultPatternHandling: PatternHandling = 'include_supported';

    const validOutputTypes: OutputType[] = ['summary', 'court_document', 'both'];
    const validTones: ToneType[] = ['neutral_concise', 'detailed_organized', 'attorney_ready'];
    const validPatternHandling: PatternHandling[] = ['include_supported', 'exclude'];

    const outputType = normalizeOutputType(body.outputType, defaultOutputType);
    const tone = normalizeTone(body.tone, defaultTone);
    const patternHandling = normalizePatternHandling(body.patternHandling, defaultPatternHandling);

    if (!outputType || !validOutputTypes.includes(outputType)) {
        return { valid: false, error: `Invalid outputType. Must be one of: ${validOutputTypes.join(', ')}` };
    }
    if (!tone || !validTones.includes(tone)) {
        return { valid: false, error: `Invalid tone. Must be one of: ${validTones.join(', ')}` };
    }
    if (!patternHandling || !validPatternHandling.includes(patternHandling)) {
        return { valid: false, error: `Invalid patternHandling. Must be one of: ${validPatternHandling.join(', ')}` };
    }

    const mobilePayload: BuildReportPayload | undefined = source === 'workspace_mobile'
        ? {
            caseId: body.caseId,
            outputType: toMobileOutputType(outputType),
            tone: toMobileTone(tone),
            patternHandling: toMobilePatternHandling(patternHandling),
            source: 'workspace_mobile',
            clientBuildId: typeof body.clientBuildId === 'string' ? body.clientBuildId : undefined,
        }
        : undefined;

    return {
        valid: true,
        config: {
            caseId: body.caseId as Id<'cases'>,
            outputType,
            tone,
            patternHandling,
            source,
            mobilePayload,
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

    let config: ReportConfig;
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

        // Load case data in parallel — pass caseId for scoped queries
        const [timeline, caseMemory, detectedPatterns] = await Promise.all([
            convex.query(api.timelineCandidates.listByUser, {}),
            convex.query(api.caseMemory.listByUser, {}),
            convex.query(api.detectedPatterns.listByCase, { caseId: config.caseId }),
        ]);

        // ── Case-scoped filtering ──
        const caseScopedMemory = (caseMemory ?? []).filter(
            (m: { caseId?: Id<'cases'> }) => !m.caseId || m.caseId === config.caseId,
        );
        const caseScopedTimeline = (timeline ?? []).filter(
            (t: { caseId?: Id<'cases'> }) => !t.caseId || t.caseId === config.caseId,
        );

        // Find most recent narrative
        const narrativeItem = caseScopedMemory
            .filter((m: { type: string }) => m.type === 'narrative_synthesis')
            .sort((a: { _creationTime: number }, b: { _creationTime: number }) =>
                b._creationTime - a._creationTime,
            )[0];

        // Key points are non-meta caseMemory items
        const keyPoints = caseScopedMemory.filter(
            (m: { type: string }) => !['pattern_analysis', 'narrative_synthesis'].includes(m.type),
        );

        // Build pattern context from dedicated detectedPatterns table
        let patternsContext: string;
        if (config.patternHandling !== 'include_supported') {
            patternsContext = 'Pattern analysis excluded per user configuration.';
        } else if (detectedPatterns && detectedPatterns.length > 0) {
            patternsContext = serializeForPrompt(
                detectedPatterns.map((p: { title: string; summary: string; category: string; eventCount: number; confidence: string }) => ({
                    title: p.title,
                    summary: p.summary,
                    category: p.category,
                    eventCount: p.eventCount,
                    confidence: p.confidence,
                })),
                'supported patterns',
            );
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

        let report: WorkspaceReport;
        try {
            report = JSON.parse(response.output_text);
        } catch {
            console.error('[report] Failed to parse model output:', response.output_text.slice(0, 200));
            return NextResponse.json(
                { error: 'Report generation failed', detail: 'Model returned invalid JSON' },
                { status: 500 },
            );
        }

        // Server-stamp generatedAt (don't rely on model for timestamps)
        const createdAt = new Date().toISOString();
        report.generatedAt = createdAt;

        let reportDraftId: string | undefined;
        if (config.source === 'workspace_mobile') {
            const title = report.title?.trim() || 'Case Workspace Report';
            const content = formatWorkspaceReport(report);
            if (!content.trim()) {
                return NextResponse.json(
                    { error: 'Report generation failed', detail: 'Generated report was empty' },
                    { status: 500 },
                );
            }
            const reportOperationId = createStableReportOperationId(
                String(config.caseId),
                config.outputType,
                config.tone,
                config.patternHandling,
                config.mobilePayload?.clientBuildId ?? 'missing-client-build-id',
            );
            const savedId = await convex.mutation(api.caseMemory.save, {
                caseId: config.caseId,
                type: config.outputType === 'summary' ? 'draft_snippet' : 'exhibit_note',
                title,
                content,
                metadataJson: JSON.stringify({
                    source: 'workspace_mobile_report',
                    artifactType: config.outputType,
                    mobilePayload: config.mobilePayload,
                    createdAt,
                }),
                requestId: `mobile-workspace-report-${reportOperationId}`,
            });
            reportDraftId = String(savedId);
        }

        return NextResponse.json({
            ...report,
            ...(reportDraftId ? { reportDraftId } : {}),
            caseId: String(config.caseId),
            status: 'ready',
            createdAt,
        });
    } catch (err) {
        console.error('[report] Error:', err);
        return NextResponse.json(
            { error: 'Report generation failed', detail: err instanceof Error ? err.message : 'Unknown error' },
            { status: 500 },
        );
    }
}
