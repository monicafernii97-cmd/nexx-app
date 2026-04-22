/**
 * Exhibit Cover Drafting Regression Tests
 *
 * Locks down:
 * - Input extraction from ExhibitMappedSections
 * - Prompt structure and jurisdiction embedding
 * - Response parsing (valid JSON, malformed, edge cases)
 * - Fallback deterministic output (never empty)
 * - Draft application to mapped sections
 */

import { describe, it, expect } from 'vitest';
import { buildExhibitCoverDraftInputs } from '../exhibits/buildExhibitCoverDraftInputs';
import { applyExhibitCoverDrafts } from '../exhibits/applyExhibitCoverDrafts';
import { parseExhibitCoverDraftResponse } from '../exhibits/parseExhibitCoverDraftResponse';
import { buildJurisdictionAwareExhibitPrompt } from '../exhibits/buildJurisdictionAwareExhibitPrompt';
import { buildFallbackSummaryLines } from '../exhibits/generateExhibitCoverDraft';
import type { ExhibitMappedSections } from '@/lib/export-assembly/types/exports';

// ═══════════════════════════════════════════════════════════════
// Fixtures
// ═══════════════════════════════════════════════════════════════

function buildTestMappedSections(): ExhibitMappedSections {
  return {
    generatedAt: '2026-04-21T00:00:00Z',
    packetTitle: 'Respondent\'s Exhibit Packet',
    indexEntries: [
      {
        label: 'A',
        title: 'AppClose Messages – March 2026',
        date: 'March 1–March 12, 2026',
        source: 'Text Messages',
        summary: 'Messages regarding scheduling and child-related matters.',
        relevance: 'scheduling and child-related coordination',
        linkedEvidenceId: 'ev-001',
        linkedNodeIds: ['n-001', 'n-002'],
        issueTags: ['custody', 'communication'],
      },
      {
        label: 'B',
        title: 'Medical Records – Dr. Smith',
        date: 'January 2026',
        source: 'Medical Records',
        summary: 'Treatment records for the minor child.',
        relevance: 'child health and welfare',
        linkedEvidenceId: 'ev-002',
        linkedNodeIds: ['n-003'],
        issueTags: ['health'],
      },
    ],
    groupedExhibits: [],
    coverSheetSummaries: [
      {
        label: 'A',
        heading: 'EXHIBIT A',
        summary: 'Old summary line.',
        supportingIssues: ['custody'],
      },
      {
        label: 'B',
        heading: 'EXHIBIT B',
        summary: 'Old summary for B.',
        supportingIssues: ['health'],
      },
    ],
    supportingNodeIds: ['n-001', 'n-002', 'n-003'],
  };
}

// ═══════════════════════════════════════════════════════════════
// buildExhibitCoverDraftInputs
// ═══════════════════════════════════════════════════════════════

describe('buildExhibitCoverDraftInputs', () => {
  it('extracts one input per cover sheet summary', () => {
    const mapped = buildTestMappedSections();
    const inputs = buildExhibitCoverDraftInputs(mapped);

    expect(inputs.length).toBe(2);
  });

  it('populates label, title, and documentType from index entries', () => {
    const mapped = buildTestMappedSections();
    const inputs = buildExhibitCoverDraftInputs(mapped);

    expect(inputs[0].label).toBe('A');
    expect(inputs[0].title).toBe('AppClose Messages – March 2026');
    expect(inputs[0].documentType).toBe('Text Messages');
    expect(inputs[0].dateRange).toBe('March 1–March 12, 2026');
  });

  it('includes jurisdiction context when provided', () => {
    const mapped = buildTestMappedSections();
    const inputs = buildExhibitCoverDraftInputs(mapped, {
      state: 'Texas',
      county: 'Fort Bend',
      courtName: '387th Judicial District Court',
    });

    expect(inputs[0].jurisdiction?.state).toBe('Texas');
    expect(inputs[0].jurisdiction?.county).toBe('Fort Bend');
    expect(inputs[0].jurisdiction?.courtName).toBe('387th Judicial District Court');
  });

  it('includes issue tags as indexContext', () => {
    const mapped = buildTestMappedSections();
    const inputs = buildExhibitCoverDraftInputs(mapped);

    expect(inputs[0].indexContext).toContain('custody');
    expect(inputs[0].indexContext).toContain('communication');
  });

  it('returns empty array when no cover sheet summaries exist', () => {
    const mapped = buildTestMappedSections();
    mapped.coverSheetSummaries = [];
    const inputs = buildExhibitCoverDraftInputs(mapped);

    expect(inputs).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════
// parseExhibitCoverDraftResponse
// ═══════════════════════════════════════════════════════════════

describe('parseExhibitCoverDraftResponse', () => {
  it('parses valid JSON with 3 summary lines', () => {
    const raw = JSON.stringify({
      label: 'A',
      title: 'AppClose Messages',
      summaryLines: [
        'This exhibit contains text messages dated March 2026.',
        'The messages relate to scheduling and parenting time.',
        'Communications are referenced in timeline entries.',
      ],
    });

    const result = parseExhibitCoverDraftResponse(raw);

    expect(result.summaryLines.length).toBe(3);
    expect(result.label).toBe('A');
    expect(result.title).toBe('AppClose Messages');
  });

  it('caps summary lines at 4', () => {
    const raw = JSON.stringify({
      summaryLines: ['Line 1.', 'Line 2.', 'Line 3.', 'Line 4.', 'Line 5.'],
    });

    const result = parseExhibitCoverDraftResponse(raw);

    expect(result.summaryLines.length).toBe(4);
  });

  it('enforces minimum 2 lines — returns empty on 1 line', () => {
    const raw = JSON.stringify({
      summaryLines: ['Only one line.'],
    });

    const result = parseExhibitCoverDraftResponse(raw);

    expect(result.summaryLines).toEqual([]);
  });

  it('enforces period at end of each line', () => {
    const raw = JSON.stringify({
      summaryLines: [
        'This line has no period',
        'This one does.',
      ],
    });

    const result = parseExhibitCoverDraftResponse(raw);

    expect(result.summaryLines[0]).toBe('This line has no period.');
    expect(result.summaryLines[1]).toBe('This one does.');
  });

  it('filters empty strings and trims whitespace', () => {
    const raw = JSON.stringify({
      summaryLines: ['  Valid line.  ', '', '   ', 'Another valid line.'],
    });

    const result = parseExhibitCoverDraftResponse(raw);

    expect(result.summaryLines).toEqual(['Valid line.', 'Another valid line.']);
  });

  it('returns empty summaryLines on malformed JSON', () => {
    const result = parseExhibitCoverDraftResponse('not json {{{');

    expect(result.summaryLines).toEqual([]);
  });

  it('returns empty summaryLines when summaryLines is not an array', () => {
    const raw = JSON.stringify({ summaryLines: 'not an array' });

    const result = parseExhibitCoverDraftResponse(raw);

    expect(result.summaryLines).toEqual([]);
  });

  it('returns empty summaryLines on null response', () => {
    const result = parseExhibitCoverDraftResponse('null');

    expect(result.summaryLines).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════
// buildJurisdictionAwareExhibitPrompt
// ═══════════════════════════════════════════════════════════════

describe('buildJurisdictionAwareExhibitPrompt', () => {
  it('includes exhibit label in user input', () => {
    const { userInput } = buildJurisdictionAwareExhibitPrompt({
      label: 'A',
      title: 'Test Exhibit',
    });

    expect(userInput).toContain('Exhibit A');
  });

  it('includes jurisdiction context in user input', () => {
    const { userInput } = buildJurisdictionAwareExhibitPrompt({
      label: 'A',
      jurisdiction: {
        state: 'Texas',
        county: 'Fort Bend',
        courtName: '387th Judicial District Court',
      },
    });

    expect(userInput).toContain('State: Texas');
    expect(userInput).toContain('County: Fort Bend');
    expect(userInput).toContain('Court: 387th Judicial District Court');
  });

  it('uses defaults for missing jurisdiction fields', () => {
    const { userInput } = buildJurisdictionAwareExhibitPrompt({
      label: 'A',
    });

    expect(userInput).toContain('State: Unknown State');
    expect(userInput).toContain('County: Unknown County');
  });

  it('includes document type and date range when provided', () => {
    const { userInput } = buildJurisdictionAwareExhibitPrompt({
      label: 'A',
      documentType: 'Text Messages',
      dateRange: 'March 1–12, 2026',
    });

    expect(userInput).toContain('Document Type: Text Messages');
    expect(userInput).toContain('Date Range: March 1–12, 2026');
  });

  it('system instructions contain court-safe rules', () => {
    const { instructions } = buildJurisdictionAwareExhibitPrompt({
      label: 'A',
    });

    expect(instructions).toContain('Do NOT include opinions');
    expect(instructions).toContain('court-safe language');
    expect(instructions).toContain('valid JSON only');
  });

  it('requests JSON output shape in user input', () => {
    const { userInput } = buildJurisdictionAwareExhibitPrompt({
      label: 'A',
    });

    expect(userInput).toContain('"summaryLines"');
    expect(userInput).toContain('"label"');
    expect(userInput).toContain('"title"');
  });
});

// ═══════════════════════════════════════════════════════════════
// buildFallbackSummaryLines
// ═══════════════════════════════════════════════════════════════

describe('buildFallbackSummaryLines', () => {
  it('always returns at least 2 lines', () => {
    const lines = buildFallbackSummaryLines({ label: 'A' });

    expect(lines.length).toBeGreaterThanOrEqual(2);
  });

  it('returns at most 3 lines', () => {
    const lines = buildFallbackSummaryLines({
      label: 'A',
      title: 'Test',
      documentType: 'Records',
      dateRange: 'January 2026',
      description: 'Related to custody issues',
    });

    expect(lines.length).toBeLessThanOrEqual(3);
  });

  it('includes document type and date range when available', () => {
    const lines = buildFallbackSummaryLines({
      label: 'A',
      documentType: 'Text Messages',
      dateRange: 'March 2026',
    });

    expect(lines[0]).toContain('text messages');
    expect(lines[0]).toContain('March 2026');
  });

  it('includes title in quotes when available', () => {
    const lines = buildFallbackSummaryLines({
      label: 'A',
      title: 'AppClose Messages',
      documentType: 'Text Messages',
      dateRange: 'March 2026',
    });

    const titleLine = lines.find((l) => l.includes('"AppClose Messages"'));
    expect(titleLine).toBeDefined();
  });

  it('all lines end with a period', () => {
    const lines = buildFallbackSummaryLines({
      label: 'A',
      title: 'Test',
      documentType: 'Records',
      dateRange: 'January 2026',
    });

    for (const line of lines) {
      expect(line).toMatch(/\.$/);
    }
  });

  it('uses generic fallback when no metadata provided', () => {
    const lines = buildFallbackSummaryLines({ label: 'A' });

    expect(lines.some((l) => l.includes('documents and records relevant'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// applyExhibitCoverDrafts
// ═══════════════════════════════════════════════════════════════

describe('applyExhibitCoverDrafts', () => {
  it('patches cover sheet heading and summary with AI draft', () => {
    const mapped = buildTestMappedSections();

    const patched = applyExhibitCoverDrafts(mapped, {
      A: {
        label: 'A',
        title: 'Text Message Exchange — March 2026',
        summaryLines: [
          'Messages exchanged between parties regarding scheduling.',
          'Communications dated March 1 through March 12, 2026.',
        ],
        source: 'ai_drafted',
      },
    });

    const cover = patched.coverSheetSummaries.find((c) => c.label === 'A');
    expect(cover?.heading).toBe('Text Message Exchange — March 2026');
    expect(cover?.summary).toContain('Messages exchanged');
    expect(cover?.summary).toContain('March 1 through March 12');
  });

  it('preserves unmatched cover sheets', () => {
    const mapped = buildTestMappedSections();

    const patched = applyExhibitCoverDrafts(mapped, {
      A: {
        label: 'A',
        title: 'Updated',
        summaryLines: ['Line 1.', 'Line 2.'],
        source: 'ai_drafted',
      },
    });

    const coverB = patched.coverSheetSummaries.find((c) => c.label === 'B');
    expect(coverB?.heading).toBe('EXHIBIT B');
    expect(coverB?.summary).toBe('Old summary for B.');
  });

  it('does not mutate the original mapped sections', () => {
    const mapped = buildTestMappedSections();
    const originalHeading = mapped.coverSheetSummaries[0].heading;

    applyExhibitCoverDrafts(mapped, {
      A: {
        label: 'A',
        title: 'Changed Title',
        summaryLines: ['New line.', 'Another line.'],
        source: 'ai_drafted',
      },
    });

    expect(mapped.coverSheetSummaries[0].heading).toBe(originalHeading);
  });

  it('skips drafts with empty summaryLines', () => {
    const mapped = buildTestMappedSections();

    const patched = applyExhibitCoverDrafts(mapped, {
      A: {
        label: 'A',
        title: 'Should not apply',
        summaryLines: [],
        source: 'raw_fallback_no_ai',
      },
    });

    const cover = patched.coverSheetSummaries.find((c) => c.label === 'A');
    expect(cover?.heading).toBe('EXHIBIT A');
  });
});
