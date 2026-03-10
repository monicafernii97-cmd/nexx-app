import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOpenAI } from '@/lib/openai';

const MAX_NARRATIVE_LENGTH = 5000;

export async function POST(req: NextRequest) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { narrative, category, date, time } = await req.json();

        if (!narrative || typeof narrative !== 'string') {
            return Response.json({ error: 'Narrative is required' }, { status: 400 });
        }
        if (narrative.length > MAX_NARRATIVE_LENGTH) {
            return Response.json({ error: 'Narrative too long (max 5000 chars)' }, { status: 400 });
        }

        const formattedDate = date
            ? new Date(date).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
            })
            : 'the reported date';

        const completion = await getOpenAI().chat.completions.create({
            model: 'gpt-4o',
            messages: [
                {
                    role: 'system',
                    content: `You are a legal documentation specialist for a family law support platform. Your task is to analyze incident narratives involving narcissistic ex-partners (NEX) and generate FOUR outputs:

1. **Court-Ready Summary** — A neutral, fact-based, chronological summary suitable for presentation in family court. Remove all emotional language. Use precise dates, times, and descriptions. Write in third person. This should read like a professional legal document.

2. **NPD Behavioral Analysis** — Identify the specific narcissistic personality patterns present in this incident. Reference established frameworks (coercive control, DARVO, gaslighting, triangulation, etc.). Explain WHY the behavior is significant in a custody/family law context.

3. **Strategic Response Suggestion** — Provide 2-3 actionable recommendations for how the user should respond or document this going forward. Include specific language they could use if a response is needed.

4. **Pattern Tags** — Return a comma-separated list of behavioral/legal pattern tags that apply to this incident. Use ONLY from this list: court_order_violation, inflexibility, gaslighting, love_bombing, devaluation, triangulation, financial_control, parental_alienation, harassment, intimidation, isolation, blame_shifting, false_accusations, micromanagement, boundary_violation, coercive_control, neglect, custody_interference, documentation_tampering, witness_manipulation. Only include tags that clearly apply.

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
                    content: `Please analyze the following incident:

**Date:** ${formattedDate}
**Time:** ${time || 'Not specified'}
**Category:** ${category || 'General'}

**Narrative:**
${narrative}`,
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

        // Parse pattern tags into clean array
        const rawTags = patternTagsMatch?.[1]?.trim() || '';
        const tags = rawTags
            .split(',')
            .map((t) => t.trim().toLowerCase().replace(/\s+/g, '_'))
            .filter((t) => t.length > 0);

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
