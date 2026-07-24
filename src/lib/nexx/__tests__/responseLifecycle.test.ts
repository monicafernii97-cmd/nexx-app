import { describe, expect, it } from 'vitest';
import type { RouteMode } from '../../types';
import {
  explicitlyRequestsStoredDocumentForTurn,
  isNaturalRelationalRoute,
  responseLifecyclePolicy,
  responseReasoningEffort,
  responseVerbosity,
  shouldApplyDeterministicLegalEnrichment,
  shouldApplyDeterministicLitigationRenderer,
  shouldApplyRenderedLegalVerifier,
  shouldForceStoredDocumentGrounding,
} from '../responseLifecycle';
import { preservePlainProviderProse } from '../responseTransport';

describe('response lifecycle policy', () => {
  it.each<RouteMode>([
    'co_parent_response',
    'supportive_strategy',
    'pattern_analysis',
    'judge_lens_strategy',
  ])('preserves natural provider prose for %s', (routeMode) => {
    const policy = responseLifecyclePolicy(routeMode);

    expect(isNaturalRelationalRoute(routeMode)).toBe(true);
    expect(policy.usePlainTextTransport).toBe(true);
    expect(policy.preserveProviderProse).toBe(true);
    expect(policy.applyDeterministicLitigationRenderer).toBe(false);
    expect(policy.applyDeterministicLegalEnrichment).toBe(false);
    expect(policy.applyRenderedLegalVerifier).toBe(false);
  });

  it('allows deterministic litigation rendering only for explicit procedural planning', () => {
    expect(shouldApplyDeterministicLitigationRenderer('litigation_navigation')).toBe(true);
    expect(shouldApplyDeterministicLitigationRenderer('court_response_planning')).toBe(true);
    expect(shouldApplyDeterministicLitigationRenderer('filing_walkthrough')).toBe(true);

    expect(shouldApplyDeterministicLitigationRenderer('co_parent_response')).toBe(false);
    expect(shouldApplyDeterministicLitigationRenderer('supportive_strategy')).toBe(false);
    expect(shouldApplyDeterministicLitigationRenderer('documentation_strategy')).toBe(false);
    expect(shouldApplyDeterministicLitigationRenderer('pattern_analysis')).toBe(false);
    expect(shouldApplyDeterministicLitigationRenderer('court_ready_drafting')).toBe(false);
  });

  it('gates deterministic legal enrichment and the legal rendered-output verifier', () => {
    for (const routeMode of [
      'co_parent_response',
      'supportive_strategy',
      'deescalation_response',
      'pattern_analysis',
    ] satisfies RouteMode[]) {
      expect(shouldApplyDeterministicLegalEnrichment(routeMode)).toBe(false);
      expect(shouldApplyRenderedLegalVerifier(routeMode)).toBe(false);
    }

    for (const routeMode of [
      'direct_legal_answer',
      'order_interpretation',
      'court_response_planning',
    ] satisfies RouteMode[]) {
      expect(shouldApplyDeterministicLegalEnrichment(routeMode)).toBe(true);
      expect(shouldApplyRenderedLegalVerifier(routeMode)).toBe(true);
    }
  });

  it('never blanket-downgrades conversational reasoning to low effort', () => {
    expect(responseReasoningEffort('adaptive_chat')).toBe('medium');
    expect(responseReasoningEffort('co_parent_response')).toBe('medium');
    expect(responseReasoningEffort('supportive_strategy')).toBe('medium');
    expect(responseReasoningEffort('pattern_analysis')).toBe('high');
    expect(responseReasoningEffort('supportive_strategy', { highComplexity: true })).toBe('high');
  });

  it('uses detailed verbosity for pattern and other high-complexity relational work', () => {
    expect(responseVerbosity('co_parent_response')).toBe('medium');
    expect(responseVerbosity('pattern_analysis')).toBe('high');
    expect(responseVerbosity('supportive_strategy', { highComplexity: true })).toBe('high');
  });

  it.each<RouteMode>([
    'co_parent_response',
    'supportive_strategy',
    'pattern_analysis',
  ])(
    'does not force an old stored order into %s from an incidental transcript mention',
    (routeMode) => {
      expect(shouldForceStoredDocumentGrounding({
        routeMode,
        hasStoredDocument: true,
        currentTurnReferencesDocument: true,
        currentTurnExplicitlyRequestsStoredDocument: false,
      })).toBe(false);
    },
  );

  it('grounds a relational answer when the current turn explicitly asks to use the stored order', () => {
    expect(shouldForceStoredDocumentGrounding({
      routeMode: 'co_parent_response',
      hasStoredDocument: true,
      currentTurnReferencesDocument: true,
      currentTurnExplicitlyRequestsStoredDocument: true,
    })).toBe(true);
  });

  it('recognizes a direct natural-drafting request that uses the user’s order', () => {
    expect(explicitlyRequestsStoredDocumentForTurn({
      message: 'Using the exact language on page 12 of my court order, draft a natural reply.',
      routeMode: 'co_parent_response',
    })).toBe(true);
  });

  it('does not treat a co-parent quote inside a pasted thread as the user requesting the stored order', () => {
    const message = [
      'Please review this AppClose thread transparently and explain the patterns from both sides.',
      '',
      '12/29/2025',
      'Giovanni on 12/29/2025 texted:',
      'The court order controls.',
      'Monica: Please read the court order. I will document what happened.',
      '',
      'Please give me a detailed, balanced assessment of this conversation.',
    ].join('\n').repeat(40);

    expect(explicitlyRequestsStoredDocumentForTurn({
      message,
      routeMode: 'pattern_analysis',
      detectedExplicitPriorUpload: true,
    })).toBe(false);
  });

  it('recognizes a top-level request to compare a long thread against an uploaded order', () => {
    const transcript = [
      '12/29/2025',
      'Father on 12/29/2025 texted: The court order controls.',
      'Mother: Please read the court order.',
    ].join('\n').repeat(40);
    const message = [
      'Please compare this thread against my uploaded court order and identify any conflicts.',
      '',
      transcript,
    ].join('\n');

    expect(explicitlyRequestsStoredDocumentForTurn({
      message,
      routeMode: 'pattern_analysis',
    })).toBe(true);
  });

  it.each([
    'Please use my uploaded court order to analyze this:\nFather: The order controls.\nMother: I disagree.',
    'Context:\nPlease compare this thread against my uploaded court order.\nFather: The order controls.',
    'Thread to review:\nUsing my saved court order, assess this exchange.\nParent One: Please read the order.',
    'Here is what I need:\nUse my uploaded court order to analyze this:\nFather: The order controls.',
    'Instructions:\nPlease compare this exchange against my saved court order.\nMother: I disagree.',
    'Instructions: Please use my uploaded court order to analyze this.\nFather: The order controls.',
  ])('preserves a legitimate instruction block before transcript speakers: %s', (message) => {
    expect(explicitlyRequestsStoredDocumentForTurn({
      message,
      routeMode: 'pattern_analysis',
    })).toBe(true);
  });

  it.each([
    [
      'a quoted request at the end of a long transcript',
      `${'Father: We disagree about the schedule.\nMother: Noted.\n'.repeat(60)}
Father: Please compare the uploaded court order to this message.`,
    ],
    [
      'a transcript that begins at the first character',
      `Father: Please review my uploaded court order and use it for this response.
Mother: I disagree with that interpretation.`,
    ],
    [
      'a short transcript with generic speaker labels',
      `Parent One: Please use my saved court order.
Parent Two: I do not agree.
What does this communication pattern show?`,
    ],
  ])('does not repin a stored order from %s', (_label, message) => {
    expect(explicitlyRequestsStoredDocumentForTurn({
      message,
      routeMode: 'pattern_analysis',
      detectedExplicitPriorUpload: true,
    })).toBe(false);
  });

  it('keeps grounded co-parent drafting on the natural prose lifecycle', () => {
    const policy = responseLifecyclePolicy('co_parent_response');

    expect(policy.usePlainTextTransport).toBe(true);
    expect(policy.preserveProviderProse).toBe(true);
    expect(policy.applyDeterministicLegalEnrichment).toBe(false);
    expect(policy.applyRenderedLegalVerifier).toBe(false);
  });

  it('grounds a genuine active-document interpretation follow-up', () => {
    expect(shouldForceStoredDocumentGrounding({
      routeMode: 'order_interpretation',
      hasStoredDocument: true,
      isActiveDocumentFollowUp: true,
    })).toBe(true);
  });

  it('wraps provider prose byte-for-byte without post-processing it', () => {
    const prose = '\nMonica, this is a nuanced situation.\n\n- First point\n- Second point\n';
    const response = preservePlainProviderProse(prose);

    expect(response.message).toBe(prose);
    expect(response.litigationNavigation).toBeNull();
    expect(response.legalInterpretation).toBeNull();
    expect(response.deadlineAnalysis).toBeNull();
  });
});
