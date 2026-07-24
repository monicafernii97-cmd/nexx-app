import type { DocumentReferenceDetection } from './documentReferenceDetection';
import type {
  LegalDocumentAnswerVerification,
  LegalDocumentSourcePacket,
} from './legalDocumentAnswer';

const GROUNDING_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'have',
  'i', 'in', 'is', 'it', 'my', 'of', 'on', 'or', 'our', 'that', 'the', 'this',
  'to', 'was', 'we', 'were', 'with', 'you', 'your', 'according', 'also',
  'clarity', 'court', 'exact', 'language', 'order', 'says', 'states', 'under',
]);

function normalizedGroundingWords(value: string) {
  return value
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function candidateGroundingPhrases(value: string) {
  const words = normalizedGroundingWords(value);
  const phrases: string[] = [];

  for (const size of [8, 7, 6, 5, 4]) {
    for (let index = 0; index + size <= words.length; index += 1) {
      const window = words.slice(index, index + size);
      const meaningfulCount = window.filter((word) =>
        word.length > 2 && !GROUNDING_STOP_WORDS.has(word)
      ).length;
      if (meaningfulCount >= 3) phrases.push(window.join(' '));
    }
  }

  return phrases;
}

function materialOrderPropositions(value: string) {
  return value
    .split(/(?<=[.!?])\s+|\r?\n+/)
    .flatMap((sentence) =>
      sentence.split(
        /\s+(?:and|but)\s+(?=(?:(?:i|you|he|she|they|father|mother|parent|the\s+parties)\s+)?(?:shall|must|may|can|cannot|is|are|has|have|do|does)\b)/i,
      )
    )
    .map((sentence) => sentence.replace(/^[>\s"'“”*-]+|[>"'“”\s]+$/g, '').trim())
    .filter((sentence) => sentence.length > 0)
    .filter((sentence) =>
      /\b(?:shall|must|may|cannot|can\s+not|required|prohibited|entitled|allowed|not\s+allowed|no\s+right|right\s+to|exclusive\s+(?:right|authority)|sole\s+(?:right|authority))\b/i.test(sentence) ||
      /\b(?:has|have|retains?|exercises?|do(?:es)?\s+not\s+have)\s+(?:the\s+|a\s+)?(?:right|authority|access)\b/i.test(sentence) ||
      /\b(?:cannot|can\s+not|may\s+not|do(?:es)?\s+not)\b.{0,40}\b(?:access|attend|obtain|receive|review|decide|withhold|deny)\b/i.test(sentence) ||
      /\b(?:order|decree|parenting\s+plan)\b.{0,120}\b(?:say|state|provide|require|allow|give|grant|prohibit|entitle)\w*\b/i.test(sentence)
    );
}

function meaningfulGroundingWords(value: string) {
  return normalizedGroundingWords(value)
    .filter((word) => word.length > 2 && !GROUNDING_STOP_WORDS.has(word));
}

type LegalModality = 'mandatory' | 'permitted' | 'prohibited' | 'exclusive' | 'none';

function legalModality(value: string): LegalModality {
  if (
    /\b(?:shall\s+not|must\s+not|may\s+not|cannot|can\s+not|not\s+allowed|no\s+right|do(?:es)?\s+not\s+have|prohibited)\b/i.test(value)
  ) {
    return 'prohibited';
  }
  if (/\b(?:exclusive|sole)\s+(?:right|authority)\b/i.test(value)) return 'exclusive';
  if (/\b(?:shall|must|required)\b/i.test(value)) return 'mandatory';
  if (/\b(?:may|can|allowed|entitled|right\s+to)\b/i.test(value)) return 'permitted';
  return 'none';
}

function sourceClauses(value: string) {
  return value
    .split(/(?<=[.!?;])\s+|\r?\n+/)
    .flatMap((sentence) =>
      sentence.split(
        /\s+(?:and|but)\s+(?=(?:(?:father|mother|parent|the\s+parties|he|she|they)\s+)?(?:shall|must|may|can|cannot|is|are|has|have|do|does)\b)/i,
      )
    )
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function propositionSupport(
  proposition: string,
  sourcePackets: LegalDocumentSourcePacket[],
) {
  const propositionWords = meaningfulGroundingWords(proposition);
  if (propositionWords.length < 3) return null;
  const phrases = candidateGroundingPhrases(proposition);

  for (const source of sourcePackets) {
    const normalizedSource = normalizedGroundingWords(source.text).join(' ');
    const sourceWords = new Set(meaningfulGroundingWords(source.text));
    const matchedPhrase = phrases.find((phrase) => normalizedSource.includes(phrase));
    const supportedWords = propositionWords.filter((word) => sourceWords.has(word));
    const coverage = supportedWords.length / propositionWords.length;
    const matchingSourceSegment = sourceClauses(source.text)
      .find((segment) =>
        normalizedGroundingWords(segment).join(' ').includes(matchedPhrase ?? '\u0000')
      ) ?? source.text;
    const propositionModality = legalModality(proposition);
    const sourceModality = legalModality(matchingSourceSegment);
    const modalityMatches =
      propositionModality === 'none' ||
      propositionModality === sourceModality;
    if (matchedPhrase && coverage >= 0.72 && modalityMatches) {
      return { source, matchedPhrase };
    }
  }

  return null;
}

/**
 * Natural co-parent drafts stay as provider prose, but an exact-order request
 * still receives an independent grounding check. This verifier never rewrites
 * the response; callers can retry generation if no source-supported phrase is
 * present.
 */
export function verifyPlainTextDocumentGrounding(args: {
  message: string;
  sourcePackets: LegalDocumentSourcePacket[];
  documentReference: DocumentReferenceDetection;
}): LegalDocumentAnswerVerification {
  const requiresExactGrounding = args.documentReference.requiresExactText;

  if (!requiresExactGrounding) {
    return {
      passed: true,
      errors: [],
      verifiedCitations: [],
    };
  }

  if (args.sourcePackets.length === 0) {
    return {
      passed: false,
      errors: ['The requested exact document language was not available for verification.'],
      verifiedCitations: [],
    };
  }

  const propositions = materialOrderPropositions(args.message);
  if (propositions.length === 0) {
    return {
      passed: false,
      errors: ['The natural draft did not include verifiable exact document language.'],
      verifiedCitations: [],
    };
  }

  const verifiedCitations: LegalDocumentAnswerVerification['verifiedCitations'] = [];
  const unsupported: string[] = [];

  for (const proposition of propositions) {
    const support = propositionSupport(proposition, args.sourcePackets);
    if (!support) {
      unsupported.push(proposition);
      continue;
    }
    verifiedCitations.push({
      sourceId: support.source.sourceId,
      chunkId: support.source.chunkId,
      quotedText: support.matchedPhrase,
      citationVerifierStatus: 'verified',
    });
  }

  return unsupported.length === 0
    ? {
        passed: true,
        errors: [],
        verifiedCitations,
      }
    : {
        passed: false,
        errors: unsupported.map((proposition) =>
          `Unsupported exact-order proposition: ${proposition.slice(0, 240)}`
        ),
        verifiedCitations,
      };
}
