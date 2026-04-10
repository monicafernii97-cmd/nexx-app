import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { openai } from '@/lib/openaiConversation';
import { INCIDENT_ANALYSIS_SCHEMA } from '@/lib/nexx/schemas';
import { INCIDENT_CATEGORIES } from '@/lib/constants';
import { getAuthenticatedConvexClient } from '@/lib/convexServer';
import { api } from '@convex/_generated/api';

const MAX_NARRATIVE_LENGTH = 5000;

// Strict allowlist for pattern tags based on official categories
const ALLOWED_TAGS = new Set<string>(INCIDENT_CATEGORIES.map(c => c.value));

/**
 * Format a YYYY-MM-DD date string without timezone shift.
 * new Date('2024-01-15') parses as UTC midnight; formatting in a behind-UTC
 * timezone would display Jan 14. We avoid this by constructing the date
 * explicitly in UTC and formatting with timeZone: 'UTC'.
 */
function formatDateSafe(dateStr: string): string {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const [year, month, day] = parts.map(Number);
    return new Intl.DateTimeFormat('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** Analyze an incident narrative via OpenAI, returning court summary, behavioral analysis, strategic response, and pattern tags. */
export async function POST(req: NextRequest) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { narrative, category, date, time, severity, location, witnesses, childrenInvolved } = await req.json();

        if (!narrative || typeof narrative !== 'string') {
            return Response.json({ error: 'Narrative is required' }, { status: 400 });
        }
        if (narrative.length > MAX_NARRATIVE_LENGTH) {
            return Response.json({ error: 'Narrative too long (max 5000 chars)' }, { status: 400 });
        }

        const formattedDate = date ? formatDateSafe(date) : 'the reported date';

        // Build contextual details for the AI
        const contextLines: string[] = [];
        contextLines.push(`**Date:** ${formattedDate}`);
        contextLines.push(`**Time:** ${time || 'Not specified'}`);
        contextLines.push(`**Category:** ${category || 'General'}`);
        if (severity) contextLines.push(`**Severity:** ${severity === 3 ? 'High' : severity === 2 ? 'Medium' : 'Low'}`);
        if (location) contextLines.push(`**Location:** ${String(location).slice(0, 200)}`);
        if (childrenInvolved) contextLines.push(`**Children were present or involved:** Yes`);
        if (witnesses && Array.isArray(witnesses) && witnesses.length > 0) {
            contextLines.push(`**Witnesses:** ${witnesses.slice(0, 10).map((w: string) => String(w).slice(0, 100)).join(', ')}`);
        } else if (witnesses && typeof witnesses === 'string' && witnesses.trim()) {
            contextLines.push(`**Witnesses:** ${witnesses.slice(0, 500)}`);
        }

        // Fetch NEX Profile for personalized behavioral tracking (best-effort, 2s timeout)
        try {
            const convex = await getAuthenticatedConvexClient();
            const nexProfile = await Promise.race([
                convex.query(api.nexProfiles.getByUser),
                new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
            ]);

            // Sanitize profile values: truncate, strip control chars / code fences / section markers, filter non-strings
            const sanitize = (arr: string[] | undefined, maxItems = 10, maxLen = 100) =>
                arr
                    ?.filter((s): s is string => typeof s === 'string')
                    .slice(0, maxItems)
                    .map(s =>
                        s.slice(0, maxLen)
                            .replace(/[\x00-\x1f\x7f]/g, ' ')       // strip all control chars
                            .replace(/```+/g, '')                     // strip code fences
                            .replace(/---[A-Z_-]+---/g, '')          // strip section markers
                            .trim()
                    )
                    .filter(Boolean) ?? [];

            if (nexProfile) {
                contextLines.push(`\n**[User's Recognized NEX Patterns]**`);
                const behaviors = sanitize(nexProfile.behaviors);
                if (behaviors.length) {
                    contextLines.push(`- **Known Behaviors:** ${behaviors.join(', ')}`);
                }
                const tactics = sanitize(nexProfile.manipulationTactics);
                if (tactics.length) {
                    contextLines.push(`- **Known Manipulation Tactics:** ${tactics.join(', ')}`);
                }
                const triggers = sanitize(nexProfile.triggerPatterns);
                if (triggers.length) {
                    contextLines.push(`- **Known Trigger Patterns:** ${triggers.join(', ')}`);
                }
            }
        } catch (profileErr) {
            // NEX profile enrichment is optional — continue without it
            console.warn('Could not fetch NEX profile for enrichment:', profileErr);
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const response = await (openai.responses as any).create({
            model: 'gpt-5.4',
            input: [
                {
                    role: 'system',
                    content: `You are a professional legal documentation specialist preparing exhibits for family court. You must be NEUTRAL, FACTUAL, and PRECISE. You are NOT an advocate — you are a documentation professional who lets the facts speak for themselves.

## CRITICAL GUIDELINES
- NEVER assume the other party's intent, mental state, or motivations
- NEVER use accusatory, inflammatory, or emotionally charged language
- NEVER make clinical diagnoses or label someone with a personality disorder
- NEVER claim a court order was violated (you have no access to court orders)
- Use OBSERVATIONAL language: "The other party stated..." not "The other party manipulated..."
- Flag behavioral patterns ONLY when they are clearly and obviously present in the narrative — do NOT force tags
- Write as if a judge will read every word — maintain the standard of credibility expected in court
- NEVER fabricate, invent, or guess legal citations, statute numbers, court rules, dates, or facts not explicitly present in the user's narrative
- Only reference information the user has provided — do NOT add details, embellish events, or assume facts not stated

Generate a structured analysis with:
- courtSummary: A neutral, fact-based, chronological account (1-3 paragraphs)
- behavioralAnalysis: Educational behavioral pattern insight (NOT for court)
- strategicResponse: 2-3 actionable recommendations
- tags: Behavioral pattern tags from: ${Array.from(ALLOWED_TAGS).join(', ')}
- timelineEvent: Structured event data (date, time, location, childImpact, evidenceType)
- evidenceStrength: "weak", "moderate", or "strong"
- missingEvidence: What additional documentation would strengthen the record`,
                },
                {
                    role: 'user',
                    content: `Please analyze the following incident:\n\n${contextLines.join('\n')}\n\n**Narrative:**\n${narrative}`,
                },
            ],
            text: { format: INCIDENT_ANALYSIS_SCHEMA },
            temperature: 0.4,
        });

        const responseText = response.output_text || '';

        try {
            const parsed = JSON.parse(responseText);

            // Validate and filter tags against allowlist
            const validatedTags = (parsed.tags || [])
                .map((t: string) => t.trim().toLowerCase().replace(/\s+/g, '_'))
                .filter((t: string) => ALLOWED_TAGS.has(t));

            return Response.json({
                courtSummary: parsed.courtSummary || '',
                behavioralAnalysis: parsed.behavioralAnalysis || '',
                strategicResponse: parsed.strategicResponse || '',
                tags: [...new Set(validatedTags)],
                timelineEvent: parsed.timelineEvent || null,
                evidenceStrength: parsed.evidenceStrength || 'moderate',
                missingEvidence: parsed.missingEvidence || [],
            });
        } catch {
            // Fallback: return raw text as court summary
            return Response.json({
                courtSummary: responseText,
                behavioralAnalysis: '',
                strategicResponse: '',
                tags: [],
                timelineEvent: null,
                evidenceStrength: 'moderate',
                missingEvidence: [],
            });
        }
    } catch (error) {
        console.error('Incident analysis error:', error);
        const isRateLimited =
            typeof error === 'object' &&
            error !== null &&
            'status' in error &&
            (error as { status: number }).status === 429;
        const message =
            error instanceof Error && error.message.includes('OPENAI_API_KEY')
                ? 'AI service is not configured. Please contact support.'
                : isRateLimited
                    ? 'Too many requests. Please wait a moment and try again.'
                    : 'Failed to analyze incident. Please try again.';
        return Response.json(
            { error: message },
            { status: isRateLimited ? 429 : 500 }
        );
    }
}
