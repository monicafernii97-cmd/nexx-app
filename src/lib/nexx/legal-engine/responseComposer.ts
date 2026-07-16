import type { RouteMode } from '../../types';
import type { LitigationNavigationResponse } from './litigationNavigationSchema';
import { KNOWN_MARKDOWN_HEADING_PATTERN, markdownHeadingKey } from './markdownHeadings';
import { semanticallyEquivalentLegalText } from './semanticDedup';

export type ResponseCompositionInput = {
  existingMessage: string;
  litigationMarkdown: string;
  routeMode: RouteMode;
  userMessage: string;
  hasDocumentAnswer: boolean;
  hasLegalInterpretation: boolean;
  litigationNavigation?: LitigationNavigationResponse | null;
};

function sentenceLimit(text: string, maxSentences: number) {
  const parts = text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.slice(0, maxSentences).join(' ');
}

function extractFirstSection(markdown: string, heading: RegExp) {
  const lines = markdown.split('\n');
  const index = lines.findIndex((line) => heading.test(line));
  if (index < 0) return null;
  const next = lines.findIndex((line, lineIndex) =>
    lineIndex > index &&
    KNOWN_MARKDOWN_HEADING_PATTERN.test(line) &&
    !/^(Neutral draft:|Firmer version:|You can say:)/i.test(line)
  );
  return lines.slice(index, next > index ? next : undefined).join('\n').trim();
}

function extractNextSteps(markdown: string) {
  return extractFirstSection(markdown, /^Next steps:/i);
}

function removeDuplicateSections(markdown: string) {
  const seen = new Set<string>();
  const semanticSections: string[] = [];
  const sections = markdown.split(/\n{2,}/);
  return sections.filter((section) => {
    const heading = markdownHeadingKey(section);
    if (!heading) {
      const isDraft = /^(?:Neutral draft:|Firmer version:|You can say:|"|“)/i.test(section.trim());
      if (!isDraft && semanticSections.some((existing) => semanticallyEquivalentLegalText(existing, section))) {
        return false;
      }
      if (!isDraft) semanticSections.push(section);
      return true;
    }
    if (seen.has(heading)) return false;
    seen.add(heading);
    return true;
  }).join('\n\n');
}

export function composeLegalResponse(input: ResponseCompositionInput) {
  const existing = input.existingMessage.trim();
  const litigation = input.litigationMarkdown.trim();
  if (!existing) return removeDuplicateSections(litigation);
  if (!litigation) return removeDuplicateSections(existing);

  const asksDraft = /\b(what\s+(?:do|should)\s+i\s+(?:say|respond)|how\s+do\s+i\s+respond|draft|reply|text back|message him|message her)\b/i.test(input.userMessage);
  const asksCost = /\b(cost|how much|fee|retainer|legal aid|resources|attorney|lawyer)\b/i.test(input.userMessage);
  const asksPacked = input.routeMode === 'packed_case_intake' ||
    /\b(taking me to court|got served|lied in the motion|overwhelmed|can i do this myself|how much|judge)\b/i.test(input.userMessage);
  const asksDirectOrder = input.hasLegalInterpretation &&
    /\b(can|does|is|am i wrong|allowed|mean|means|father'?s day|possession|order)\b/i.test(input.userMessage) &&
    !asksPacked;

  if (asksDraft || input.routeMode === 'co_parent_response') {
    const coParent = extractFirstSection(litigation, /^\*\*Co-parent response\*\*/i);
    const documentation = extractFirstSection(litigation, /^\*\*Document this neutrally\*\*/i);
    const next = extractNextSteps(litigation);
    return removeDuplicateSections([coParent, existing, documentation, next].filter(Boolean).join('\n\n'));
  }

  if (asksDirectOrder) {
    const next = extractNextSteps(litigation);
    return removeDuplicateSections([existing, next].filter(Boolean).join('\n\n'));
  }

  if (asksCost || input.routeMode === 'pro_se_guidance' || input.routeMode === 'attorney_resource_guidance') {
    const proSe = extractFirstSection(litigation, /^\*\*Pro se \/ attorney strategy\*\*/i);
    const cost = extractFirstSection(litigation, /^\*\*Cost and resources\*\*/i);
    const next = extractNextSteps(litigation);
    return removeDuplicateSections([proSe, cost, next].filter(Boolean).join('\n\n'));
  }

  if (asksPacked || input.routeMode === 'litigation_navigation' || input.routeMode === 'court_response_planning') {
    const legalAnchor = input.hasLegalInterpretation
      ? `Legal anchor from the order: ${sentenceLimit(existing, 3)}`
      : null;
    return removeDuplicateSections([litigation, legalAnchor].filter(Boolean).join('\n\n'));
  }

  return removeDuplicateSections(`${existing}\n\n${litigation}`);
}
