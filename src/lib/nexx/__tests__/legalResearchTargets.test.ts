import { describe, expect, it } from 'vitest';
import { buildOfficialLegalResearchTargets, shouldUseOfficialLegalResearch } from '../legalResearchTargets';
import { classifyMessage } from '../router';
import { buildContextPrompt } from '../prompts/contextPrompt';

describe('official legal research targets', () => {
  it('routes court-ready drafting through web search and local research', () => {
    const result = classifyMessage('Draft a motion to enforce my possession order for Fort Bend County');

    expect(result.mode).toBe('court_ready_drafting');
    expect(result.toolPlan.useWebSearch).toBe(true);
    expect(result.toolPlan.useLocalCourtRetriever).toBe(true);
  });

  it('keeps ordinary order and notice questions in document-analysis mode', () => {
    const result = classifyMessage('What does the order say about notice?');

    expect(result.mode).toBe('document_analysis');
  });

  it('builds state and county official-source targets from saved location', () => {
    const targets = buildOfficialLegalResearchTargets({
      state: 'Texas',
      county: 'Fort Bend',
      courtName: '387th District Court',
      routeMode: 'court_ready_drafting',
      message: 'Draft a motion to enforce the order',
    });

    expect(targets.map((target) => target.kind)).toEqual([
      'state_statutes',
      'state_court_rules',
      'county_clerk',
      'local_rules',
      'court_forms',
      'court_specific',
    ]);
    expect(targets.some((target) => target.query.includes('Fort Bend County Texas official district clerk'))).toBe(true);
    expect(targets.some((target) => target.preferredDomains.includes('txcourts.gov'))).toBe(true);
  });

  it('does not add research targets for ordinary adaptive chat', () => {
    expect(shouldUseOfficialLegalResearch('adaptive_chat', 'thank you')).toBe(false);
  });

  it('renders account court context and official targets without internal ids', () => {
    const prompt = buildContextPrompt({
      accountCourtContext: {
        state: 'Texas',
        county: 'Fort Bend',
        courtName: '387th District Court',
        causeNumber: '24-DCV-0000',
        petitionerLegalName: 'Monica Example',
        respondentLegalName: 'Other Parent',
        petitionerRole: 'petitioner',
        children: [{ name: 'Child Example', age: 9 }],
        activeCaseTitle: 'Custody enforcement',
      },
      officialResearchTargets: buildOfficialLegalResearchTargets({
        state: 'Texas',
        county: 'Fort Bend',
        routeMode: 'local_procedure',
        message: 'How do I file this?',
      }),
    });

    expect(prompt).toContain('Account and Case Court Context');
    expect(prompt).toContain('Jurisdiction: Fort Bend County, Texas');
    expect(prompt).toContain('Official Legal Research Targets');
    expect(prompt).toContain('Fort Bend County clerk or district clerk');
    expect(prompt).toContain('Children: C. (age 9)');
    expect(prompt).not.toContain('Child Example');
    expect(prompt).not.toContain('userId');
    expect(prompt).not.toContain('_id');
  });
});
