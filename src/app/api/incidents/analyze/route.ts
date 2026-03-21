import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOpenAI } from '@/lib/openai';
import { INCIDENT_CATEGORIES } from '@/lib/constants';
import { getAuthenticatedConvexClient } from '@/lib/convexServer';
import { api } from '../../../../../convex/_generated/api';

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

        // Fetch NEX Profile for personalized behavioral tracking
        const convex = await getAuthenticatedConvexClient();
        const nexProfile = await convex.query(api.nexProfiles.getByUser);

        if (nexProfile) {
            contextLines.push(`\n**[User's Recognized NEX Patterns]**`);
            if (nexProfile.behaviors?.length) {
                contextLines.push(`- **Known Behaviors:** ${nexProfile.behaviors.join(', ')}`);
            }
            if (nexProfile.manipulationTactics?.length) {
                contextLines.push(`- **Known Manipulation Tactics:** ${nexProfile.manipulationTactics.join(', ')}`);
            }
            if (nexProfile.triggerPatterns?.length) {
                contextLines.push(`- **Known Trigger Patterns:** ${nexProfile.triggerPatterns.join(', ')}`);
            }
        }

        const completion = await getOpenAI().chat.completions.create({
            model: 'gpt-4o',
            messages: [
                {
                    role: 'system',
                    content: `You are a legal documentation specialist for a family law support platform. Your task is to analyze incident narratives involving narcissistic ex-partners (NEX) and generate FOUR outputs:

1. **Court-Ready Summary** — A neutral, fact-based, chronological summary suitable for presentation in family court. Remove all emotional language. Use precise dates, times, and descriptions. Write in third person. This should read like a professional legal document. Include all contextual details provided (location, witnesses, children involved).

2. **NPD Behavioral Analysis** — Identify the specific narcissistic personality patterns present in this incident. Reference established frameworks (coercive control, DARVO, gaslighting, triangulation, etc.). Explain WHY the behavior is significant in a custody/family law context.

3. **Strategic Response Suggestion** — Provide 2-3 actionable recommendations for how the user should respond or document this going forward. Include specific language they could use if a response is needed.

4. **Pattern Tags** — Return a comma-separated list of behavioral/legal pattern tags that apply to this incident. Use ONLY from this exact set: ${Array.from(ALLOWED_TAGS).join(', ')}. Compare the incident against the [User's Recognized NEX Patterns] detailed above to detect known themes. Return only tags that clearly apply to the reported behavior.

Format your response EXACTLY as follows:
---COURT_SUMMARY---
[Court-ready summary here]
---BEHAVIORAL_ANALYSIS---
[NPD behavior analysis here]
---STRATEGIC_RESPONSE---
[Strategic recommendations here]
---PATTERN_TAGS---
[comma-separated tags here]`,
                },
                {
                    role: 'user',
                    content: `Please analyze the following incident:\n\n${contextLines.join('\n')}\n\n**Narrative:**\n${narrative}`,
                },
            ],
            temperature: 0.4,
            max_tokens: 2500,
        });

        const responseText = completion.choices[0]?.message?.content || '';

        // Parse the structured response
        const courtSummaryMatch = responseText.match(
            /---COURT_SUMMARY---\s*([\s\S]*?)(?=---BEHAVIORAL_ANALYSIS---|$)/
        );
        const behavioralAnalysisMatch = responseText.match(
            /---BEHAVIORAL_ANALYSIS---\s*([\s\S]*?)(?=---STRATEGIC_RESPONSE---|$)/
        );
        const strategicResponseMatch = responseText.match(
            /---STRATEGIC_RESPONSE---\s*([\s\S]*?)(?=---PATTERN_TAGS---|$)/
        );
        const patternTagsMatch = responseText.match(
            /---PATTERN_TAGS---\s*([\s\S]*?)$/
        );

        // Parse and validate pattern tags against the strict allowlist
        const rawTags = patternTagsMatch?.[1]?.trim() || '';
        const tags = [...new Set(
            rawTags
                .split(/[,\n]/)
                .map((t) => t.trim().toLowerCase().replace(/\s+/g, '_'))
                .filter((t) => ALLOWED_TAGS.has(t))
        )];

        return Response.json({
            courtSummary: courtSummaryMatch?.[1]?.trim() || responseText,
            behavioralAnalysis: behavioralAnalysisMatch?.[1]?.trim() || '',
            strategicResponse: strategicResponseMatch?.[1]?.trim() || '',
            tags,
            raw: responseText,
        });
    } catch (error) {
        console.error('Incident analysis error:', error);
        return Response.json(
            { error: 'Failed to analyze incident' },
            { status: 500 }
        );
    }
}
