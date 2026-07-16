import { describe, expect, it } from 'vitest';
import { extractCourtFilingFromSources } from '../legal-engine/courtFilingExtractor';
import { buildLitigationNavigationResponse, mergeCourtFilingIntoLitigationNavigation, renderLitigationNavigationMarkdown } from '../legal-engine/litigationNavigationRenderer';
import { verifyRenderedOutput } from '../legal-engine/renderedOutputVerifier';
import { classifyMessage } from '../router';
import type { LegalDocumentSourcePacket } from '../legalDocumentAnswer';
import type { RouteMode } from '../../types';

function runScenario(message: string, options: {
  context?: string;
  activeMode?: RouteMode;
  hasActiveDocumentContext?: boolean;
  courtPackets?: LegalDocumentSourcePacket[];
} = {}) {
  const route = classifyMessage(
    message,
    options.context,
    options.activeMode,
    options.hasActiveDocumentContext
  );
  const extraction = options.courtPackets ? extractCourtFilingFromSources(options.courtPackets) : null;
  const response = mergeCourtFilingIntoLitigationNavigation(
    buildLitigationNavigationResponse({
      message,
      routeMode: route.mode,
      recentContext: options.context,
      courtFiling: extraction,
    }),
    extraction
  );
  const text = renderLitigationNavigationMarkdown(response, {
    routeMode: route.mode,
    userMessage: message,
  });
  return {
    route,
    text,
    verification: verifyRenderedOutput({
      rendered: text,
      userMessage: message,
      routeMode: route.mode,
    }),
  };
}

describe('live-style legal agent scenarios', () => {
  it('routes vague active order follow-up into legal interpretation', () => {
    const route = classifyMessage(
      'Can he do that?',
      "Prior issue: Father's Day possession dispute under uploaded order.",
      'possession_access_schedule',
      true
    );

    expect(['possession_access_schedule', 'order_interpretation']).toContain(route.mode);
    expect(route.legalIntent).toBe('direct_order_interpretation');
  });

  it('keeps co-parent response prompts draft-focused', () => {
    const result = runScenario('What should I respond?', {
      context: 'Other parent is demanding Thursday possession under a disputed Father’s Day order issue.',
      activeMode: 'possession_access_schedule',
      hasActiveDocumentContext: true,
    });

    expect(result.route.mode).toBe('co_parent_response');
    expect(result.text).toMatch(/Neutral draft|You can say|Co-parent response/i);
    expect(result.text).not.toMatch(/Pro se \/ attorney strategy|Cost and resources/i);
    expect(result.verification.passed, result.verification.errors.join('; ')).toBe(true);
  });

  it('handles packed emotional court messages across every major track', () => {
    const result = runScenario('He is taking me to court. He lied in the motion. Three weeks ago he refused the exchange. He sent me three texts today. I am overwhelmed. What do I say? I do not have money for an attorney. Can I do this myself? How much will it cost? How do I explain myself to the judge?');

    expect(['packed_case_intake', 'litigation_navigation']).toContain(result.route.mode);
    expect(result.text).toMatch(/I hear you|organize/i);
    expect(result.text).toMatch(/service date|deadline|hearing/i);
    expect(result.text).toMatch(/Co-parent response/i);
    expect(result.text).toMatch(/Document this neutrally/i);
    expect(result.text).toMatch(/Pro se \/ attorney strategy/i);
    expect(result.text).toMatch(/Cost and resources/i);
    expect(result.text).toMatch(/Judge-ready explanation/i);
    expect(result.text).toMatch(/county and state/i);
    expect(result.verification.passed, result.verification.errors.join('; ')).toBe(true);
  });

  it('keeps cost/resource questions source-safe', () => {
    const result = runScenario('How much will it cost if I file this myself or hire an attorney?');

    expect(result.route.mode).toBe('attorney_resource_guidance');
    expect(result.text).toMatch(/Pro se cost categories/i);
    expect(result.text).toMatch(/Attorney cost categories/i);
    expect(result.text).not.toMatch(/\$\s?\d+|\b\d{2,}\s*dollars\b/i);
    expect(result.verification.passed, result.verification.errors.join('; ')).toBe(true);
  });

  it('turns judge explanation requests into a court-ready structure', () => {
    const result = runScenario('How do I explain this to the judge?');

    expect(result.route.mode).toBe('court_narrative_builder');
    expect(result.text).toMatch(/current order/i);
    expect(result.text).toMatch(/facts in date order/i);
    expect(result.text).toMatch(/Sample opening/i);
    expect(result.verification.passed).toBe(true);
  });

  it('uses uploaded court filing extraction for response planning', () => {
    const courtPackets: LegalDocumentSourcePacket[] = [
      {
        sourceId: 'src_001',
        fileId: 'file_1',
        fileName: 'petition.pdf',
        chunkId: 'chunk_1',
        blockIds: [],
        pageStart: 1,
        pageEnd: 1,
        text: 'Petition to Modify Parent-Child Relationship. Petitioner asks the Court to modify conservatorship and child support. Petitioner alleges Respondent denied possession on May 3, 2026.',
      },
      {
        sourceId: 'src_002',
        fileId: 'file_1',
        fileName: 'petition.pdf',
        chunkId: 'chunk_2',
        blockIds: [],
        pageStart: 3,
        pageEnd: 3,
        text: 'Notice of hearing. The hearing is on August 5, 2026 at 10:00 a.m. Certificate of service included.',
      },
    ];
    const result = runScenario('What do I need to file next?', { courtPackets });

    expect(result.route.mode).toBe('court_response_planning');
    expect(result.text).toMatch(/uploaded filing appears to be|filing appears to request/i);
    expect(result.text).toMatch(/service date|hearing date|deadline/i);
    expect(result.text).toMatch(/response|answer|file/i);
    expect(result.verification.passed).toBe(true);
  });
});
