import { describe, expect, it } from 'vitest';
import { extractCourtFilingFromSources } from '../legal-engine/courtFilingExtractor';
import { buildLitigationNavigationResponse, mergeCourtFilingIntoLitigationNavigation, renderLitigationNavigationMarkdown } from '../legal-engine/litigationNavigationRenderer';
import { verifyLitigationNavigationResponse } from '../legal-engine/litigationNavigationVerifier';
import { composeLegalResponse } from '../legal-engine/responseComposer';
import { verifyRenderedOutput } from '../legal-engine/renderedOutputVerifier';
import { classifyMessage } from '../router';
import type { LegalDocumentSourcePacket } from '../legalDocumentAnswer';

const BACKEND_LANGUAGE = /\b(OCR|retrieval|verifier|sourceId|chunkId|source packet|confidence label|backend|extracted text|extracted order text)\b/i;

function rendered(message: string, routeMode = classifyMessage(message).mode) {
  const response = buildLitigationNavigationResponse({
    message,
    routeMode,
    recentContext: "Prior issue: Father's Day possession dispute under a court order.",
  });
  return {
    response,
    text: renderLitigationNavigationMarkdown(response, {
      routeMode,
      userMessage: message,
    }),
  };
}

describe('litigation navigation and client-care layer', () => {
  it('routes packed emotional court messages and addresses every major track', () => {
    const message = 'He is taking me to court. He lied in the motion. Three weeks ago he refused the exchange. He sent me three texts today. I am overwhelmed. What do I say? I do not have money for an attorney. Can I do this myself? How much will it cost? How do I explain myself to the judge?';
    const route = classifyMessage(message);
    const { response, text } = rendered(message, route.mode);
    const verification = verifyLitigationNavigationResponse(response, { userMessage: message });

    expect(['packed_case_intake', 'litigation_navigation']).toContain(route.mode);
    expect(verification.passed).toBe(true);
    expect(text).toMatch(/I hear you|organize/i);
    expect(text).toMatch(/court deadline|served|hearing/i);
    expect(text).toMatch(/Co-parent response/i);
    expect(text).toMatch(/You can say|Neutral draft/i);
    expect(text).toMatch(/Document this neutrally/i);
    expect(text).toMatch(/Pro se \/ attorney strategy/i);
    expect(text).toMatch(/Cost and resources/i);
    expect(text).toMatch(/current order/i);
    expect(text).toMatch(/county and state/i);
    expect(text).not.toMatch(BACKEND_LANGUAGE);
  });

  it('drafts a short neutral co-parent response without turning the answer into a legal memo', () => {
    const message = 'What should I respond?';
    const route = classifyMessage(message, "Prior issue: Father's Day possession dispute under a court order.", 'possession_access_schedule', true);
    const { text } = rendered(message, route.mode);

    expect(route.mode).toBe('co_parent_response');
    expect(text).toMatch(/You can say|Neutral draft/i);
    expect(text).toMatch(/Based on the order|current court order/i);
    expect(text).toMatch(/Do not respond to every accusation|Do not send a long emotional explanation/i);
    expect(text).not.toMatch(/Pro se \/ attorney strategy/i);
    expect(text).not.toMatch(/Cost and resources/i);
    expect(text).not.toMatch(BACKEND_LANGUAGE);
  });

  it('gives practical pro se guidance when the user cannot afford an attorney', () => {
    const message = 'I do not have money for an attorney. Can I do this myself?';
    const route = classifyMessage(message);
    const { text } = rendered(message, route.mode);

    expect(route.mode).toBe('pro_se_guidance');
    expect(text).toMatch(/Possibly, yes|handle parts of this pro se/i);
    expect(text).toMatch(/Higher-risk without attorney help/i);
    expect(text).toMatch(/Limited-scope help/i);
    expect(text).toMatch(/county and state/i);
    expect(text).not.toMatch(BACKEND_LANGUAGE);
  });

  it('converts judge-explanation questions into a judge-ready structure', () => {
    const message = 'How do I explain this to the judge?';
    const route = classifyMessage(message);
    const { text } = rendered(message, route.mode);

    expect(route.mode).toBe('court_narrative_builder');
    expect(text).toMatch(/judge-ready version|current order/i);
    expect(text).toMatch(/current order/i);
    expect(text).toMatch(/facts in date order/i);
    expect(text).toMatch(/proof/i);
    expect(text).toMatch(/Sample opening/i);
    expect(text).not.toMatch(BACKEND_LANGUAGE);
  });

  it('answers cost questions with categories, not invented exact prices', () => {
    const message = 'How much will it cost if I file this myself or hire an attorney?';
    const route = classifyMessage(message);
    const { text } = rendered(message, route.mode);

    expect(route.mode).toBe('attorney_resource_guidance');
    expect(text).toMatch(/Pro se cost categories/i);
    expect(text).toMatch(/Attorney cost categories/i);
    expect(text).toMatch(/county and state/i);
    expect(text).not.toMatch(/\$\s?\d+|\b\d{2,}\s*dollars\b/i);
    expect(text).not.toMatch(BACKEND_LANGUAGE);
  });

  it('handles pressure without inflammatory labels and gives a court-safe response', () => {
    const message = 'He keeps calling me controlling and saying I am withholding. I want to tell him off.';
    const route = classifyMessage(message);
    const { text } = rendered(message, route.mode);

    expect(route.mode).toBe('supportive_strategy');
    expect(text).toMatch(/not to match the pressure|stay calm/i);
    expect(text).toMatch(/You can say|Firmer version/i);
    expect(text).toMatch(/Save this for your record|Document this neutrally/i);
    expect(text).not.toMatch(/\b(narcissist|gaslighting|abusive|crazy)\b/i);
    expect(text).not.toMatch(BACKEND_LANGUAGE);
  });

  it('gives neutral documentation guidance when the user asks whether to document it', () => {
    const message = 'Should I document this?';
    const route = classifyMessage(message);
    const { text } = rendered(message, route.mode);

    expect(route.mode).toBe('documentation_strategy');
    expect(text).toMatch(/Document this neutrally/i);
    expect(text).toMatch(/Save:/i);
    expect(text).toMatch(/Use dates, facts, and order language/i);
    expect(text).not.toMatch(BACKEND_LANGUAGE);
  });

  it('extracts uploaded court filing posture and enriches litigation navigation', () => {
    const packets: LegalDocumentSourcePacket[] = [
      {
        sourceId: 'src_001',
        fileId: 'file_1',
        fileName: 'motion.pdf',
        chunkId: 'chunk_1',
        blockIds: [],
        pageStart: 1,
        pageEnd: 1,
        text: 'Motion to Enforce Possession. Petitioner asks the Court to hold Respondent in contempt and order makeup possession and attorney fees. Petitioner alleges Respondent refused the exchange on June 1, 2026.',
      },
      {
        sourceId: 'src_002',
        fileId: 'file_1',
        fileName: 'motion.pdf',
        chunkId: 'chunk_2',
        blockIds: [],
        pageStart: 2,
        pageEnd: 2,
        text: 'Notice of hearing. The hearing is on July 15, 2026 at 9:00 a.m. Certificate of service states the motion was served by email.',
      },
    ];
    const extraction = extractCourtFilingFromSources(packets);
    expect(extraction?.documentType).toBe('enforcement');
    expect(extraction?.reliefRequested.join(' ')).toMatch(/contempt|makeup possession|attorney fees/i);
    expect(extraction?.allegations[0]?.sourceIds).toEqual(['src_001']);
    expect(extraction?.deadlinesOrHearings.some((item) => item.type === 'hearing')).toBe(true);

    const message = 'I uploaded his motion. What do I need to file next?';
    const route = classifyMessage(message);
    const response = mergeCourtFilingIntoLitigationNavigation(
      buildLitigationNavigationResponse({
        message,
        routeMode: 'court_response_planning',
        courtFiling: extraction,
      }),
      extraction
    );
    const text = renderLitigationNavigationMarkdown(response, {
      routeMode: 'court_response_planning',
      userMessage: message,
    });

    expect(route.mode).toBe('court_response_planning');
    expect(text).toMatch(/uploaded filing appears to be an? enforcement|filing appears to request/i);
    expect(text).toMatch(/service date|hearing date|deadline/i);
    expect(text).toMatch(/response|file/i);
    expect(text).not.toMatch(BACKEND_LANGUAGE);
  });

  it('composes grounded legal answers with navigation without duplicate sections', () => {
    const composed = composeLegalResponse({
      existingMessage: 'No — not based on the order language we have been discussing. The specific Father’s Day provision controls.',
      litigationMarkdown: [
        '**Co-parent response**',
        'Keep it short and order-based.',
        'Neutral draft:',
        '',
        '"Based on the order, Father’s Day possession begins Friday at 6:00 p.m."',
        '',
        'Next steps:',
        '1. Send one calm response.',
        '2. Save the thread.',
        '',
        'Next steps:',
        '1. Duplicate section.',
      ].join('\n'),
      routeMode: 'co_parent_response',
      userMessage: 'What should I say back?',
      hasDocumentAnswer: true,
      hasLegalInterpretation: true,
    });

    expect((composed.match(/Next steps:/g) ?? []).length).toBe(1);
    expect((composed.match(/Neutral draft:/g) ?? []).length).toBe(1);
    expect(composed).toMatch(/Neutral draft/i);
  });

  it('verifies rendered output for backend leaks, duplicate sections, and invented dollars', () => {
    const good = verifyRenderedOutput({
      rendered: 'No — based on the order. You can say:\n"Based on the order, I will follow the exchange time."\n\nNext steps:\n1. Save the thread.',
      userMessage: 'Can he do that?',
      routeMode: 'co_parent_response',
    });
    expect(good.passed).toBe(true);

    const bad = verifyRenderedOutput({
      rendered: 'The citation verifier checked sourceId src_001.\n\nCost is $350.\n\nNext steps:\n1. Save it.\n\nNext steps:\n1. File.',
      userMessage: 'How much will it cost?',
      routeMode: 'attorney_resource_guidance',
    });
    expect(bad.passed).toBe(false);
    expect(bad.errors).toEqual(expect.arrayContaining([
      'noBackendLanguage',
      'noOcrRetrievalVerifierLanguage',
      'noInventedDollarAmounts',
      'noDuplicateSections',
    ]));
  });
});
