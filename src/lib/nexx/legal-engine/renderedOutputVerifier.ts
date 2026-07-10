import type { RouteMode } from '../../types';

export type RenderedOutputVerification = {
  passed: boolean;
  errors: string[];
  checks: {
    noBackendLanguage: boolean;
    noOcrRetrievalVerifierLanguage: boolean;
    noInflammatoryLabels: boolean;
    noInventedDollarAmounts: boolean;
    noDuplicateSections: boolean;
    includesDirectAnswerWhenNeeded: boolean;
    includesDraftWhenUserAskedWhatToSay: boolean;
    includesDeadlineCheckWhenCourtFiled: boolean;
    lengthAppropriateForPrompt: boolean;
  };
};

const BACKEND_LANGUAGE_PATTERN =
  /\b(sourceId|chunkId|source packet|backend|model-generated claim|documentAnswer|legalInterpretation|raw JSON|metadataJson|providerResponseId)\b/i;

const OCR_RETRIEVAL_VERIFIER_PATTERN =
  /\b(OCR|retrieval|verifier|citation verifier|extraction warnings?|extracted order text|extracted text|confidence(?: labels?)?)\b/i;

const INFLAMMATORY_LABEL_PATTERN =
  /\b(narcissist|gaslighting|gaslit|crazy|psycho|abusive|abuser|monster)\b/i;

const DOLLAR_PATTERN = /\$\s?\d[\d,]*(?:\.\d{2})?|\b\d{2,}\s*dollars\b/i;

function duplicateHeadingCount(message: string) {
  const headings = message
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^(\*\*[^*]+\*\*|Next steps:|Neutral draft:|Firmer version:)/i.test(line))
    .map((line) => line.toLowerCase());
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

export function verifyRenderedOutput(args: {
  rendered: string;
  userMessage: string;
  routeMode?: RouteMode;
  exactFeesSourceBacked?: boolean;
}): RenderedOutputVerification {
  const rendered = args.rendered.trim();
  const simplePrompt = args.userMessage.length < 90 && !courtFiledSignal(args.userMessage, args.routeMode);
  const checks: RenderedOutputVerification['checks'] = {
    noBackendLanguage: !BACKEND_LANGUAGE_PATTERN.test(rendered),
    noOcrRetrievalVerifierLanguage: !OCR_RETRIEVAL_VERIFIER_PATTERN.test(rendered),
    noInflammatoryLabels: !INFLAMMATORY_LABEL_PATTERN.test(rendered),
    noInventedDollarAmounts: args.exactFeesSourceBacked === true || !DOLLAR_PATTERN.test(rendered),
    noDuplicateSections: duplicateHeadingCount(rendered) === 0,
    includesDirectAnswerWhenNeeded: !needsDirectAnswerFirst(args.userMessage, args.routeMode) ||
      /\b(no|yes|probably|my read|based on|usually)\b/i.test(rendered.slice(0, 240)),
    includesDraftWhenUserAskedWhatToSay: !asksWhatToSay(args.userMessage) ||
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

export function repairRenderedOutput(rendered: string) {
  const lines = rendered.split('\n');
  const filtered = lines.filter((line) =>
    !BACKEND_LANGUAGE_PATTERN.test(line) &&
    !OCR_RETRIEVAL_VERIFIER_PATTERN.test(line)
  );
  const seenHeadings = new Set<string>();
  const repaired: string[] = [];
  for (const line of filtered) {
    const heading = line.match(/^(\*\*[^*]+\*\*|Next steps:|Neutral draft:|Firmer version:)/i)?.[1]?.toLowerCase();
    if (heading) {
      if (seenHeadings.has(heading)) continue;
      seenHeadings.add(heading);
    }
    repaired.push(line);
  }
  return repaired.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
