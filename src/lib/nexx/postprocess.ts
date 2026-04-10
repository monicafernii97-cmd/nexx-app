/**
 * Post-processing for NEXX responses.
 * 
 * polishLegalResponse() — for the message field
 * polishCourtDraft() — for court-ready draft artifacts
 * injectConfidenceWarning() — adds evidence warnings based on LegalConfidence
 */

import type { LegalConfidence } from '../types';

// ---------------------------------------------------------------------------
// polishLegalResponse — clean up the message field
// ---------------------------------------------------------------------------

export function polishLegalResponse(text: string): string {
  let result = text;

  // Remove generic filler phrases
  const fillerPatterns = [
    /^(Great question!?\s*)/i,
    /^(That's a (really |very )?(good|great|excellent|important) (question|point)[.!]?\s*)/i,
    /^(I'd be happy to help[.!]?\s*)/i,
    /^(Absolutely[.!]?\s*)/i,
    /^(Of course[.!]?\s*)/i,
    /^(Sure thing[.!]?\s*)/i,
    /^(I understand[.!]?\s*)/i,
  ];
  for (const pattern of fillerPatterns) {
    result = result.replace(pattern, '');
  }

  // Remove repeated disclaimers (keep only the first one)
  const disclaimerPattern = /I am not a lawyer and this is not legal advice[.]?\s*/gi;
  let disclaimerCount = 0;
  result = result.replace(disclaimerPattern, () => {
    disclaimerCount++;
    return disclaimerCount === 1 ? '' : ''; // Remove all — the system prompt handles this
  });

  // Normalize excessive whitespace
  result = result.replace(/\n{3,}/g, '\n\n');

  // Split paragraphs longer than ~500 chars at sentence boundaries
  result = result.replace(/(\S{500,})/g, (match) => {
    return match.replace(/\. /g, '.\n\n');
  });

  // Normalize heading levels (ensure consistent markdown)
  result = result.replace(/^(#{4,})\s/gm, '### ');

  // Trim
  result = result.trim();

  return result;
}

// ---------------------------------------------------------------------------
// polishCourtDraft — clean up court-ready draft text
// ---------------------------------------------------------------------------

export function polishCourtDraft(text: string): string {
  let result = text;

  // Strip conversational phrasing from drafts
  const conversationalPatterns = [
    /here'?s?\s*(a |the )?(draft|version|text)\s*(for you|below)?[.:]\s*/gi,
    /I'?ve\s*(put together|drafted|prepared|written)\s*/gi,
    /you\s*(can|may|might)\s*(want to\s*)?/gi,
  ];
  for (const pattern of conversationalPatterns) {
    result = result.replace(pattern, '');
  }

  // Convert bullet lists to numbered lists in legal drafting
  let itemNum = 1;
  result = result.replace(/^[\s]*[-•]\s/gm, () => `${itemNum++}. `);

  // Remove hedging language in court drafts
  result = result.replace(/\b(perhaps|maybe|it seems like|it appears that|somewhat|kind of|sort of)\b/gi, '');

  // Ensure WHEREFORE language for prayers/relief sections
  if (result.toLowerCase().includes('prayer') || result.toLowerCase().includes('relief')) {
    if (!result.includes('WHEREFORE')) {
      result = result.replace(
        /(prayer for relief|relief requested)/i,
        '$1\n\nWHEREFORE,'
      );
    }
  }

  // Clean up double spaces from replacements
  result = result.replace(/\s{2,}/g, ' ').replace(/\n\s+\n/g, '\n\n');

  return result.trim();
}

// ---------------------------------------------------------------------------
// injectConfidenceWarning — append evidence warnings
// ---------------------------------------------------------------------------

export function injectConfidenceWarning(
  message: string,
  confidence: LegalConfidence | null
): string {
  if (!confidence) return message;

  if (confidence.confidence === 'low') {
    return `${message}\n\n---\n⚠️ **Limited Evidence**: This response has limited supporting evidence. ${confidence.missingSupport?.length ? `Consider gathering: ${confidence.missingSupport.join(', ')}.` : ''} Verify this information with a licensed attorney in your jurisdiction.`;
  }

  if (confidence.confidence === 'moderate') {
    return `${message}\n\n---\n📋 **Note**: This guidance is based on general legal principles. Verify jurisdiction-specific details with your attorney.`;
  }

  // High confidence — no injection needed
  return message;
}
