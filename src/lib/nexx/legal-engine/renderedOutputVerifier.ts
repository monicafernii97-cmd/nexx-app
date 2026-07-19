import type { RouteMode } from '../../types';
import { markdownHeadingKey } from './markdownHeadings';
import {
  normalizeLegalProposition,
  repeatedLegalPropositions,
  semanticallyEquivalentLegalText,
} from './semanticDedup';
import { containsUserFacingExtractionDebris } from './userFacingLegalText';

export type RenderedOutputVerification = {
  passed: boolean;
  errors: string[];
  checks: {
    noBackendLanguage: boolean;
    noOcrRetrievalVerifierLanguage: boolean;
    noInflammatoryLabels: boolean;
    noInventedDollarAmounts: boolean;
    noDuplicateSections: boolean;
    noSemanticRepetition: boolean;
    noExtractionDebris: boolean;
    endsCleanly: boolean;
    includesDirectAnswerWhenNeeded: boolean;
    includesDraftWhenUserAskedWhatToSay: boolean;
    includesDeadlineCheckWhenCourtFiled: boolean;
    lengthAppropriateForPrompt: boolean;
  };
};

const BACKEND_LANGUAGE_PATTERN =
  /\b(sourceId|chunkId|source packet|backend|model-generated claim|documentAnswer|legalInterpretation|raw JSON|metadataJson|providerResponseId|retrievalBuckets|retrievalReasons|filingRetrievalBuckets)\b/i;

const OCR_RETRIEVAL_VERIFIER_PATTERN =
  /\b(OCR|retrieval|verifier|citation verifier|extraction warnings?|extracted order text|extracted text|confidence labels?)\b/i;

const INFLAMMATORY_LABEL_PATTERN =
  /\b(narcissist|gaslighting|gaslit|crazy|psycho|monster)\b/i;

const DIAGNOSTIC_ABUSE_LABEL_PATTERN =
  /\b(?:he|she|they|you|the other parent)\s+(?:is|are|was|were)\s+(?:an?\s+)?(?:abuser|abusive)\b/i;

const DOLLAR_PATTERN = /\$\s?\d[\d,]*(?:\.\d{2})?|\b\d{2,}\s*dollars\b/i;

export type MoneyClaimType =
  | 'order_amount'
  | 'arrears_amount'
  | 'property_value'
  | 'official_filing_fee'
  | 'attorney_market_estimate'
  | 'unsupported_estimate';

function classifyMoneyClaim(line: string): MoneyClaimType {
  if (!DOLLAR_PATTERN.test(line)) return 'unsupported_estimate';
  if (/\[(?:p\.|pp\.)\s*\d+/i.test(line) && /\b(order|ordered|requires?|shall|support|arrears|reimburse|property|asset|debt)\b/i.test(line)) {
    if (/\barrears?\b/i.test(line)) return 'arrears_amount';
    if (/\bproperty|asset|debt|value\b/i.test(line)) return 'property_value';
    return 'order_amount';
  }
  if (/\bofficial\b/i.test(line) && /\b(filing fee|fee schedule|clerk|court)\b/i.test(line) && /\bhttps?:\/\/|\[[^\]]+\]/i.test(line)) {
    return 'official_filing_fee';
  }
  if (/\b(attorney|lawyer|retainer|hourly|market|range)\b/i.test(line) && /\b(estimate|range|varies|dated|source)\b/i.test(line)) {
    return 'attorney_market_estimate';
  }
  return 'unsupported_estimate';
}

function hasOnlyAllowedMoneyClaims(rendered: string) {
  const moneyLines = rendered.split('\n').filter((line) => DOLLAR_PATTERN.test(line));
  return moneyLines.every((line) => classifyMoneyClaim(line) !== 'unsupported_estimate');
}

function duplicateHeadingCount(message: string) {
  const headings = message
    .split('\n')
    .map((line) => line.trim())
    .map((line) => markdownHeadingKey(line))
    .filter((heading): heading is string => Boolean(heading));
  return headings.length - new Set(headings).size;
}

function asksWhatToSay(message: string) {
  return /\b(what\s+(?:do|should)\s+i\s+(?:say|respond)|how\s+do\s+i\s+respond|text back|message him|message her|reply back)\b/i.test(message);
}

function courtFiledSignal(message: string, routeMode?: RouteMode) {
  return routeMode === 'court_response_planning' ||
    routeMode === 'packed_case_intake' ||
    routeMode === 'litigation_navigation' ||
    /\b(taking me to court|got served|served|filed|motion|petition|hearing)\b/i.test(message);
}

function needsDirectAnswerFirst(message: string, routeMode?: RouteMode) {
  if (routeMode && [
    'packed_case_intake',
    'litigation_navigation',
    'court_response_planning',
    'filing_walkthrough',
    'pro_se_guidance',
    'attorney_resource_guidance',
    'court_narrative_builder',
  ].includes(routeMode)) {
    return false;
  }
  return message.length < 180 &&
    /\b(can|does|is|are|am i wrong|allowed)\b/i.test(message);
}

function startsWithDirectAnswer(rendered: string, canonicalDirectAnswer?: string | null) {
  const firstBlock = rendered.split(/\n{2,}/)[0]?.trim() ?? '';
  if (canonicalDirectAnswer?.trim()) {
    const canonical = normalizeLegalProposition(canonicalDirectAnswer);
    const opening = normalizeLegalProposition(firstBlock);
    return opening === canonical ||
      semanticallyEquivalentLegalText(firstBlock, canonicalDirectAnswer, 0.76);
  }
  return /^(?:\s|[*_>"'`-])*(?:no\b|yes\b|probably\b|my read\b|based on\b|usually\b|the order\b|(?:i\s+)?cannot verify\b|(?:i\s+)?can't verify\b|(?:i\s+)?cannot confirm\b|(?:i\s+)?can't confirm\b|i do not see\b|i don't see\b|not enough supported\b|not enough visible\b)/i.test(
    rendered
  ) || /^(?:\s|[*_>"'`-])*(?:the\s+[^.!?\n]{1,80}\s+(?:clause|provision)\s+controls\b|[^.!?\n]{1,100}\s+(?:possession\s+)?(?:begins|starts|ends|controls)\b)/i.test(rendered);
}

export function verifyRenderedOutput(args: {
  rendered: string;
  userMessage: string;
  routeMode?: RouteMode;
  exactFeesSourceBacked?: boolean;
  canonicalDirectAnswer?: string | null;
  draftRequired?: boolean;
}): RenderedOutputVerification {
  const rendered = args.rendered.trim();
  const simplePrompt = args.userMessage.length < 90 && !courtFiledSignal(args.userMessage, args.routeMode);
  const enforceSemanticDeduplication = Boolean(args.canonicalDirectAnswer?.trim()) ||
    args.routeMode === 'order_interpretation' ||
    args.routeMode === 'possession_access_schedule';
  const checks: RenderedOutputVerification['checks'] = {
    noBackendLanguage: !BACKEND_LANGUAGE_PATTERN.test(rendered),
    noOcrRetrievalVerifierLanguage: !OCR_RETRIEVAL_VERIFIER_PATTERN.test(rendered),
    noInflammatoryLabels: !INFLAMMATORY_LABEL_PATTERN.test(rendered) && !DIAGNOSTIC_ABUSE_LABEL_PATTERN.test(rendered),
    noInventedDollarAmounts: args.exactFeesSourceBacked === true || !DOLLAR_PATTERN.test(rendered) || hasOnlyAllowedMoneyClaims(rendered),
    noDuplicateSections: duplicateHeadingCount(rendered) === 0,
    noSemanticRepetition: !enforceSemanticDeduplication || repeatedLegalPropositions(rendered, 0.9).length === 0,
    noExtractionDebris: !containsUserFacingExtractionDebris(rendered),
    endsCleanly: rendered.length < 3_990 || /[.!?\]”)'`]$/.test(rendered),
    includesDirectAnswerWhenNeeded: !needsDirectAnswerFirst(args.userMessage, args.routeMode) ||
      startsWithDirectAnswer(rendered, args.canonicalDirectAnswer),
    includesDraftWhenUserAskedWhatToSay: !(args.draftRequired ?? asksWhatToSay(args.userMessage)) ||
      /\b(Neutral draft|Suggested response|You can say|Send this)\b/i.test(rendered),
    includesDeadlineCheckWhenCourtFiled: !courtFiledSignal(args.userMessage, args.routeMode) ||
      /\b(service date|served|deadline|hearing date|court date)\b/i.test(rendered),
    lengthAppropriateForPrompt: !simplePrompt || rendered.length < 3_500,
  };
  const errors = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);

  return {
    passed: errors.length === 0,
    errors,
    checks,
  };
}

function repairInflammatoryLabels(line: string) {
  if (DIAGNOSTIC_ABUSE_LABEL_PATTERN.test(line)) {
    return 'You described conduct that may be relevant to safety or family-violence concerns.';
  }
  return line;
}

export function repairRenderedOutput(rendered: string, injections?: {
  directAnswer?: string | null;
  draftText?: string | null;
  deadlineCheck?: string | null;
}) {
  const lines = rendered.split('\n');
  const filtered = lines
    .map(repairInflammatoryLabels)
    .filter((line) =>
      !BACKEND_LANGUAGE_PATTERN.test(line) &&
      !OCR_RETRIEVAL_VERIFIER_PATTERN.test(line) &&
      !containsUserFacingExtractionDebris(line) &&
      !INFLAMMATORY_LABEL_PATTERN.test(line) &&
      (!DOLLAR_PATTERN.test(line) || classifyMoneyClaim(line) !== 'unsupported_estimate')
    );
  const seenHeadings = new Set<string>();
  const repaired: string[] = [];
  for (const line of filtered) {
    const heading = markdownHeadingKey(line);
    if (heading) {
      if (seenHeadings.has(heading)) continue;
      seenHeadings.add(heading);
    }
    repaired.push(line);
  }
  const body = repaired.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const blocks = body.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const dedupedBlocks: string[] = [];
  for (const block of blocks) {
    const isHeading = Boolean(markdownHeadingKey(block));
    if (!isHeading && dedupedBlocks.some((existing) =>
      !markdownHeadingKey(existing) && semanticallyEquivalentLegalText(existing, block)
    )) continue;
    dedupedBlocks.push(block);
  }

  const directAnswer = injections?.directAnswer?.trim();
  if (directAnswer && !startsWithDirectAnswer(dedupedBlocks.join('\n\n'), directAnswer)) {
    dedupedBlocks.unshift(directAnswer);
  }
  const draftText = injections?.draftText?.trim();
  if (draftText && !dedupedBlocks.some((block) => block.includes(draftText))) {
    dedupedBlocks.push(`You can say:\n\n"${draftText}"`);
  }
  const deadlineCheck = injections?.deadlineCheck?.trim();
  if (deadlineCheck && !dedupedBlocks.some((block) => semanticallyEquivalentLegalText(block, deadlineCheck))) {
    dedupedBlocks.push(deadlineCheck);
  }

  return dedupedBlocks.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function truncateAtSentenceBoundary(value: string, maxLength: number) {
  const clean = value.trim();
  if (clean.length <= maxLength) return clean;
  const candidate = clean.slice(0, maxLength + 1);
  const boundary = Math.max(
    candidate.lastIndexOf('. '),
    candidate.lastIndexOf('? '),
    candidate.lastIndexOf('! '),
    candidate.lastIndexOf('\n\n')
  );
  if (boundary >= Math.floor(maxLength * 0.55)) return candidate.slice(0, boundary + 1).trim();
  const wordBoundary = candidate.lastIndexOf(' ');
  return `${candidate.slice(0, Math.max(0, wordBoundary)).trim()}…`;
}
