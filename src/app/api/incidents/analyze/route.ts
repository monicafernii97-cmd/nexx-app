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

        // Fetch NEX Profile for personalized behavioral tracking (non-blocking)
        try {
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
        } catch (profileErr) {
            // NEX profile enrichment is optional — continue without it
            console.warn('Could not fetch NEX profile for enrichment:', profileErr);
        }

        const completion = await getOpenAI().chat.completions.create({
            model: 'gpt-4o',
            messages: [
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

You must generate FOUR outputs:

1. **Court-Ready Summary** — A neutral, fact-based, chronological account suitable for submission as a court exhibit. Requirements:
   - Write in third person using "the reporting party" and "the other party" (or "the father"/"the mother" when contextually appropriate)
   - State ONLY what happened: dates, times, locations, direct quotes, observable actions
   - Do NOT interpret behavior, assign motives, or draw conclusions
   - Do NOT use terms like "manipulation," "gaslighting," "coercive control," or "narcissistic" in this section
   - Include all contextual details (location, witnesses, children present) as factual observations
   - Keep it concise — 1-3 paragraphs maximum
   - This should read like a professional paralegal's factual summary, not an argument

2. **Behavioral Analysis** (For User's Personal Awareness ONLY — NOT for Court) — Provide educational insight on what patterns the described behavior *may* be consistent with. Requirements:
   - Use careful, measured language: "This behavior may be consistent with..." or "This pattern could suggest..."
   - NEVER state definitively — always use hedging language
   - Reference behavioral frameworks only as educational context, not as diagnoses
   - Explain WHY the behavior matters in a custody/family law context, but frame it as general awareness
   - Be thorough but responsible — elaborate on what the user should understand about the dynamics
   - End with: "⚠️ This analysis is for your personal awareness only. Do not include behavioral interpretations in court filings, as they may undermine your credibility. Use only the Court-Ready Summary for legal proceedings."

3. **Strategic Response** — Provide 2-3 actionable recommendations for how to respond or document going forward. Requirements:
   - Focus on what the user can control: documentation, communication strategy, boundaries
   - Suggest neutral, professional communication language when applicable
   - NEVER suggest assuming or accusing the other party of specific intent
   - Frame as protective documentation strategy, not as adversarial tactics

4. **Pattern Tags** — Return a comma-separated list of behavioral pattern tags that CLEARLY apply. Requirements:
   - Use ONLY from this exact set: ${Array.from(ALLOWED_TAGS).join(', ')}
   - Apply tags CONSERVATIVELY — only when behavior is clearly and unmistakably present
   - It is perfectly acceptable to return fewer tags or even no tags if the incident does not clearly fit
   - Do NOT tag based on assumptions or the user's characterization alone — base tags on the observable facts described
   - Compare against the [User's Recognized NEX Patterns] if provided, but do not auto-assign tags just because a pattern profile exists

Format your response EXACTLY as follows:
---COURT_SUMMARY---
[Court-ready summary here]
---BEHAVIORAL_ANALYSIS---
[Behavioral analysis here — must end with the disclaimer]
---STRATEGIC_RESPONSE---
[Strategic recommendations here]
---PATTERN_TAGS---
[comma-separated tags here, or "none" if no clear patterns detected]`,
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
        const message =
            error instanceof Error && error.message.includes('OPENAI_API_KEY')
                ? 'AI service is not configured. Please contact support.'
                : error instanceof Error && (error.message.includes('429') || error.message.includes('Rate limit'))
                    ? 'Too many requests. Please wait a moment and try again.'
                    : 'Failed to analyze incident. Please try again.';
        return Response.json(
            { error: message },
            { status: 500 }
        );
    }
}
