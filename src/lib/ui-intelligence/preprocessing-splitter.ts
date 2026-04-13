/**
 * Preprocessing Splitter — Detects intent from AI output and maps to panel types.
 *
 * When a structured response isn't available (e.g., older messages or fallback
 * rendering), this module attempts to detect sections in markdown output and
 * map them to the panel type system for consistent rendering.
 *
 * Phase 1: Heading-based detection (current).
 * Phase 2: LLM-based intent classification (future).
 */

import type { PanelType, PanelData } from './types';

// ---------------------------------------------------------------------------
// Heading → Panel Type mapping
// ---------------------------------------------------------------------------

const HEADING_MAP: Record<string, PanelType> = {
    // Overview / Summary
    'overview': 'overview',
    'summary': 'overview',
    'key takeaway': 'key_takeaway',
    'key takeaways': 'key_takeaway',

    // Strategic
    'judge lens': 'judge_lens',
    "judge's perspective": 'judge_lens',
    "how a judge sees this": 'judge_lens',
    'risk': 'risk_concern',
    'risks': 'risk_concern',
    'risk concern': 'risk_concern',
    'strength': 'strength_highlight',
    'strengths': 'strength_highlight',
    'good faith': 'good_faith_positioning',
    'good-faith': 'good_faith_positioning',
    'strategic reframe': 'strategic_reframe',

    // What this means
    'what this means': 'what_this_means',
    'why it matters': 'why_it_matters',
    'what to watch': 'what_to_watch',

    // Actions
    'next steps': 'best_next_steps',
    'best next steps': 'best_next_steps',
    'recommended actions': 'best_next_steps',
    'options': 'options_paths',
    'follow up': 'follow_up_questions',
    'follow-up': 'follow_up_questions',
    'gather this next': 'gather_this_next',

    // Drafting
    'court-ready version': 'court_ready_version',
    'court ready version': 'court_ready_version',
    'suggested reply': 'suggested_reply',
    'draft': 'suggested_reply',
    'more neutral version': 'more_neutral_version',

    // Evidence
    'timeline': 'timeline_candidate',
    'timeline event': 'timeline_candidate',
    'incident': 'incident_summary',
    'documentation gap': 'documentation_gap',
    'evidence': 'proof_strength',

    // Procedure
    'procedure': 'procedure_notes',
    'local context': 'local_context',
    'filing': 'filing_considerations',
    'deadline': 'deadline_watch',

    // Support
    'emotional': 'emotional_insight',
    'validation': 'validation_support',
    'pattern': 'pattern_detected',
};

// ---------------------------------------------------------------------------
// Splitter
// ---------------------------------------------------------------------------

/**
 * Split markdown text into PanelData[] by detecting headings.
 * Falls back to a single 'overview' panel if no headings found.
 */
export function splitIntoPanels(markdownText: string): PanelData[] {
    if (!markdownText?.trim()) {
        return [{
            type: 'overview',
            title: 'Response',
            content: '',
        }];
    }

    // Match markdown headings (## or ###)
    const headingRegex = /^#{2,3}\s+(.+)$/gm;
    const sections: Array<{ heading: string; startIndex: number }> = [];

    let match: RegExpExecArray | null;
    while ((match = headingRegex.exec(markdownText)) !== null) {
        sections.push({
            heading: match[1].trim(),
            startIndex: match.index,
        });
    }

    // No headings → single overview panel
    if (sections.length === 0) {
        return [{
            type: 'overview',
            title: 'Response',
            content: markdownText.trim(),
        }];
    }

    // Extract content between headings
    const panels: PanelData[] = [];

    // Content before first heading → overview
    const preamble = markdownText.slice(0, sections[0].startIndex).trim();
    if (preamble) {
        panels.push({
            type: 'overview',
            title: 'Overview',
            content: preamble,
        });
    }

    for (let i = 0; i < sections.length; i++) {
        const { heading, startIndex } = sections[i];
        const endIndex = i + 1 < sections.length
            ? sections[i + 1].startIndex
            : markdownText.length;

        // Content after the heading line
        const headingLine = markdownText.slice(startIndex).split('\n')[0];
        const content = markdownText
            .slice(startIndex + headingLine.length, endIndex)
            .trim();

        if (!content) continue;

        // Map heading to panel type
        const normalizedHeading = heading.toLowerCase().replace(/[^a-z\s-]/g, '').trim();
        const panelType = HEADING_MAP[normalizedHeading] ?? detectPanelType(normalizedHeading);

        panels.push({
            type: panelType,
            title: heading,
            content,
        });
    }

    // M2: Fallback — if all sections had empty content, don't drop the markdown
    if (panels.length === 0) {
        return [{
            type: 'overview',
            title: 'Response',
            content: markdownText.trim(),
        }];
    }

    return panels;
}

/**
 * Fuzzy-match a heading to a panel type by checking if any key
 * appears as a substring in the heading.
 */
function detectPanelType(heading: string): PanelType {
    for (const [key, type] of Object.entries(HEADING_MAP)) {
        if (heading.includes(key)) return type;
    }
    return 'what_this_means'; // Default for unrecognized headings
}
