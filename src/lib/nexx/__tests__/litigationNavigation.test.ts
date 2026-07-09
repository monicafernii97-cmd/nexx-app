import { describe, expect, it } from 'vitest';
import { buildLitigationNavigationResponse, renderLitigationNavigationMarkdown } from '../legal-engine/litigationNavigationRenderer';
import { verifyLitigationNavigationResponse } from '../legal-engine/litigationNavigationVerifier';
import { classifyMessage } from '../router';

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
    expect(text).toMatch(/Neutral draft/i);
    expect(text).toMatch(/Document this neutrally/i);
    expect(text).toMatch(/Pro se \/ attorney strategy/i);
    expect(text).toMatch(/Cost and resources/i);
    expect(text).toMatch(/Judge-ready explanation/i);
    expect(text).toMatch(/county and state/i);
    expect(text).not.toMatch(BACKEND_LANGUAGE);
  });

  it('drafts a short neutral co-parent response without turning the answer into a legal memo', () => {
    const message = 'What should I respond?';
    const route = classifyMessage(message, "Prior issue: Father's Day possession dispute under a court order.", 'possession_access_schedule', true);
    const { text } = rendered(message, route.mode);

    expect(route.mode).toBe('co_parent_response');
    expect(text).toMatch(/Neutral draft/i);
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
    expect(text).toMatch(/Judge-ready explanation/i);
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
    expect(text).toMatch(/Neutral draft|Firmer version/i);
    expect(text).toMatch(/Document this neutrally/i);
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
});
