import { NextRequest } from 'next/server';
import { getOpenAI } from '@/lib/openai';

export async function POST(req: NextRequest) {
    try {
        const { narrative, category, date, time } = await req.json();

        if (!narrative) {
            return Response.json({ error: 'Narrative is required' }, { status: 400 });
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
                    content: `You are a legal documentation specialist for a family law support platform. Your task is to analyze incident narratives involving narcissistic ex-partners (NEX) and generate THREE outputs:

1. **Court-Ready Summary** — A neutral, fact-based, chronological summary suitable for presentation in family court. Remove all emotional language. Use precise dates, times, and descriptions. Write in third person. This should read like a professional legal document.

2. **NPD Behavioral Analysis** — Identify the specific narcissistic personality patterns present in this incident. Reference established frameworks (coercive control, DARVO, gaslighting, triangulation, etc.). Explain WHY the behavior is significant in a custody/family law context.

3. **Strategic Response Suggestion** — Provide 2-3 actionable recommendations for how the user should respond or document this going forward. Include specific language they could use if a response is needed.

Format your response EXACTLY as follows:
---COURT_SUMMARY---
[Court-ready summary here]
---BEHAVIORAL_ANALYSIS---
[NPD behavior analysis here]
---STRATEGIC_RESPONSE---
[Strategic recommendations here]`,
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
            max_tokens: 2000,
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
            /---STRATEGIC_RESPONSE---\s*([\s\S]*?)$/
        );

        return Response.json({
            courtSummary: courtSummaryMatch?.[1]?.trim() || responseText,
            behavioralAnalysis: behavioralAnalysisMatch?.[1]?.trim() || '',
            strategicResponse: strategicResponseMatch?.[1]?.trim() || '',
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
