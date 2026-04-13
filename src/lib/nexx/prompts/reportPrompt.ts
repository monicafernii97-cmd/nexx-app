/**
 * Report Generation Prompt — Formatted case report output.
 *
 * Generates structured reports in configurable formats:
 * - summary: Concise executive overview
 * - court_document: Attorney-ready formal language
 * - both: Combined report with both sections
 *
 * Tone options: neutral_concise | detailed_organized | attorney_ready
 * Pattern handling: include_supported | exclude
 */

import type { OutputType, ToneType, PatternHandling } from '@/components/workspace/GenerateReportModal';

/**
 * Build the report generation developer prompt.
 * @param config - Report configuration from GenerateReportModal
 * @param caseContext - Serialized case data for report generation
 * @returns Developer prompt string for GPT structured output
 */
export function buildReportPrompt(
    config: {
        outputType: OutputType;
        tone: ToneType;
        patternHandling: PatternHandling;
    },
    caseContext: {
        caseGraphSummary: string;
        narrative: string;
        patterns: string;
        timeline: string;
        keyPoints: string;
    },
): string {
    const toneInstructions: Record<ToneType, string> = {
        neutral_concise: 'Write in a neutral, professional tone. Be concise — every sentence should add value. Avoid filler.',
        detailed_organized: 'Write in a detailed, well-organized style with clear section breaks and thorough coverage. Use sub-headings freely.',
        attorney_ready: 'Write in formal legal language suitable for attorney review. Use precise legal terminology. Structure as a legal memorandum.',
    };

    const outputInstructions: Record<OutputType, string> = {
        summary: `Generate a concise executive summary report. Include:
- Case overview (1-2 paragraphs)
- Key facts (bulleted list)
- Timeline highlights
- Recommendations for next steps`,
        court_document: `Generate a court-ready document format. Include:
- Caption/heading
- Statement of facts (chronological)
- Analysis of key issues
- Conclusion and requested relief
- Use formal legal document structure`,
        both: `Generate a comprehensive report with two major sections:
PART 1 — EXECUTIVE SUMMARY: concise overview, key facts, and recommendations.
PART 2 — COURT DOCUMENT DRAFT: formal statement of facts, analysis, and conclusion.`,
    };

    const patternInstructions = config.patternHandling === 'include_supported'
        ? 'Include supported patterns in the report. Present them as "documented behavioral patterns" with evidence citations.'
        : 'Do NOT include pattern analysis in the report. Focus only on individual facts and timeline.';

    return `You are a legal report generator for NEXX, a family law case management system.

Your task: Generate a structured case report based on the user's configuration.

## REPORT CONFIGURATION

**Output Type**: ${config.outputType}
**Tone**: ${config.tone}
**Pattern Handling**: ${config.patternHandling}

## INSTRUCTIONS

### Tone
${toneInstructions[config.tone]}

### Output Format
${outputInstructions[config.outputType]}

### Pattern Inclusion
${patternInstructions}

## CRITICAL RULES

1. **No speculation** — Only include documented facts with sources.
2. **No character attacks** — Describe behavior, not personality.
3. **Balanced presentation** — Present the user's position strongly but fairly.
4. **Date anchoring** — Every factual claim must have a date or date range.
5. **Actionable recommendations** — Include specific next steps the user should take.

## CASE DATA

### Case Overview
${caseContext.caseGraphSummary}

### Narrative Summary
${caseContext.narrative}

### Patterns
${caseContext.patterns}

### Timeline
${caseContext.timeline}

### Key Points
${caseContext.keyPoints}

## OUTPUT FORMAT

Return a JSON object matching the case_report schema with:
- title: Report title
- generatedAt: ISO timestamp of generation
- sections: Array of { heading, body } sections
- summary: One-paragraph executive summary
- recommendations: Array of actionable next steps`;
}
