/**
 * Court Pipeline Golden Acceptance Tests (1–37)
 *
 * Pure-logic tests covering the full court document validation spec.
 * No React, no Convex, no network — only shared library functions.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { detectCourtDocumentIssues, ISSUE_TO_MODE, MODE_PRIORITY, FORBIDDEN_VISIBLE_TEXT } from '../courtDocumentIssues';
import type { CourtDocumentIssue } from '../courtDocumentIssues';
import { resolveCourtIdentity, isValidDocumentKind } from '../resolveCourtIdentity';
import type { CourtIdentity } from '../resolveCourtIdentity';
import { storeCourtHandoff, consumeCourtHandoff } from '../courtHandoff';

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function makeIdentity(overrides: Partial<CourtIdentity> = {}): CourtIdentity {
  return resolveCourtIdentity({
    patch: {
      resolvedTitle: 'Motion for Temporary Orders',
      documentKind: 'motion',
      causeNumber: '2024-12345-F',
      state: 'Texas',
      county: 'Harris',
      courtName: 'District Court',
      judicialDistrict: '387th Judicial District',
      filingPartyLegalName: 'Jane Doe',
      filingPartyRole: 'petitioner',
      opposingPartyLegalName: 'John Doe',
      isProSe: true,
      ...overrides,
    },
  });
}

function detect(identity: Partial<CourtIdentity>, texts: string[] = ['COMES NOW Jane Doe, Petitioner, appearing pro se']): CourtDocumentIssue[] {
  return detectCourtDocumentIssues(
    identity,
    { documentType: identity.documentKind ?? 'motion', exportPath: 'court_document' },
    texts,
  );
}

function hasIssue(issues: CourtDocumentIssue[], id: string): boolean {
  return issues.some(i => i.id === id);
}

function hasBlocker(issues: CourtDocumentIssue[], id: string): boolean {
  return issues.some(i => i.id === id && i.severity === 'blocker');
}

function canProceed(issues: CourtDocumentIssue[]): boolean {
  return !issues.some(i => i.severity === 'blocker');
}

// Mock sessionStorage for Node environment
const mockStorage: Record<string, string> = {};
const mockSessionStorage = {
  getItem: (key: string) => mockStorage[key] ?? null,
  setItem: (key: string, value: string) => { mockStorage[key] = value; },
  removeItem: (key: string) => { delete mockStorage[key]; },
};

if (typeof globalThis.sessionStorage === 'undefined') {
  Object.defineProperty(globalThis, 'sessionStorage', { value: mockSessionStorage, writable: true });
}

// ═══════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════

describe('Court Pipeline Golden Acceptance Tests', () => {
  beforeEach(() => {
    // Clear mock storage between tests
    Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
  });
  // ── Title (1–2) ──
  describe('Title', () => {
    it('1. generic title triggers blocker', () => {
      const id = makeIdentity({ resolvedTitle: 'Court Filing Document' });
      const issues = detect(id);
      expect(hasIssue(issues, 'generic_title_detected')).toBe(true);
      expect(canProceed(issues)).toBe(false);
    });

    it('2. preserves amendment level in title', () => {
      const id = makeIdentity({ resolvedTitle: 'Second Amended Motion for Temporary Orders', documentKind: 'second_amended_motion' });
      const issues = detect(id);
      expect(hasIssue(issues, 'generic_title_detected')).toBe(false);
      expect(hasIssue(issues, 'missing_document_title')).toBe(false);
    });
  });

  // ── Caption (3–7) ──
  describe('Caption', () => {
    it('3. missing cause number triggers blocker', () => {
      const id = makeIdentity({ causeNumber: '' });
      const issues = detect(id);
      expect(hasBlocker(issues, 'missing_cause_number')).toBe(true);
      expect(canProceed(issues)).toBe(false);
    });

    it('4. SAPCR wrong caption format detected', () => {
      const id = makeIdentity({
        caseTitleFormat: 'name_v_name',
        childrenNames: ['J.D.'],
      });
      const issues = detect(id);
      expect(hasIssue(issues, 'wrong_caption_format')).toBe(true);
    });

    it('5. missing child name in SAPCR triggers issue', () => {
      const id = makeIdentity({
        caseTitleFormat: 'in_interest_of',
        childrenNames: [],
      });
      const issues = detect(id);
      expect(hasIssue(issues, 'missing_sapcr_child_name')).toBe(true);
    });

    it('6. missing judicial district triggers issue', () => {
      const id = makeIdentity({ judicialDistrict: '' });
      const issues = detect(id);
      expect(hasIssue(issues, 'missing_judicial_district')).toBe(true);
    });

    it('7. missing county/state triggers blocker', () => {
      const id = makeIdentity({ county: '', state: '' });
      const issues = detect(id);
      expect(hasBlocker(issues, 'missing_county_or_state')).toBe(true);
      expect(canProceed(issues)).toBe(false);
    });
  });

  // ── Intro (8–11) ──
  describe('Intro', () => {
    it('8. missing motion intro detected when no COMES NOW', () => {
      const id = makeIdentity({ documentKind: 'motion' });
      const issues = detect(id, ['Some unrelated text about the case.']);
      expect(hasIssue(issues, 'missing_motion_intro')).toBe(true);
    });

    it('9. COMES NOW with full name passes intro check', () => {
      const id = makeIdentity({ documentKind: 'motion' });
      const issues = detect(id, ['COMES NOW Jane Doe, Petitioner, appearing pro se, and files this motion.']);
      expect(hasIssue(issues, 'missing_motion_intro')).toBe(false);
    });

    it('10. pro se: "appearing pro se" expected only when isProSe', () => {
      const id = makeIdentity({ isProSe: true });
      const issues = detect(id, ['COMES NOW Jane Doe, Petitioner, and respectfully shows the Court']);
      // Missing "appearing pro se" when isProSe = true should not necessarily block,
      // but "pro se language with counsel" should not fire
      expect(hasIssue(issues, 'pro_se_language_with_counsel')).toBe(false);
    });

    it('11. represented party: no "appearing pro se" expected', () => {
      const id = makeIdentity({ isProSe: false });
      const issues = detect(id, ['COMES NOW Jane Doe, by and through her attorney of record, appearing pro se']);
      expect(hasIssue(issues, 'pro_se_language_with_counsel')).toBe(true);
    });
  });

  // ── Structure (12–13) ──
  describe('Structure', () => {
    it('12. ISSUE_TO_MODE maps malformed_section_headings to missing_structure', () => {
      expect(ISSUE_TO_MODE.malformed_section_headings).toBe('missing_structure');
    });

    it('13. numbered_paragraph_structure_missing maps to missing_structure', () => {
      expect(ISSUE_TO_MODE.numbered_paragraph_structure_missing).toBe('missing_structure');
    });
  });

  // ── Dedup (14) ──
  describe('Dedup', () => {
    it('14. duplicate section content maps to duplicate_content_repair mode', () => {
      expect(ISSUE_TO_MODE.duplicate_section_content).toBe('duplicate_content_repair');
    });
  });

  // ── Prayer/Certificate (15–17) ──
  describe('Prayer & Certificate', () => {
    it('15. missing prayer detected for motion kind', () => {
      const id = makeIdentity({ documentKind: 'motion' });
      const issues = detect(id, ['COMES NOW Jane Doe, appearing pro se. Some factual allegations.']);
      expect(hasIssue(issues, 'missing_prayer')).toBe(true);
    });

    it('16. missing certificate detected for motion kind', () => {
      const id = makeIdentity({ documentKind: 'motion' });
      const issues = detect(id, ['COMES NOW Jane Doe, appearing pro se. PRAYER section. WHEREFORE']);
      expect(hasIssue(issues, 'missing_certificate')).toBe(true);
    });

    it('17. certificate maps to court_certificate_repair mode', () => {
      expect(ISSUE_TO_MODE.missing_certificate).toBe('court_certificate_repair');
    });
  });

  // ── Signature (18–22) ──
  describe('Signature', () => {
    it('18. signature issues map to court_signature_repair', () => {
      expect(ISSUE_TO_MODE.missing_signature_block).toBe('court_signature_repair');
      expect(ISSUE_TO_MODE.missing_attorney_signature).toBe('court_signature_repair');
    });

    it('19. pro se missing signature detected', () => {
      const id = makeIdentity({ isProSe: true });
      const issues = detect(id, ['COMES NOW Jane Doe, appearing pro se.']);
      expect(hasIssue(issues, 'missing_signature_block')).toBe(true);
    });

    it('20. pro se with "Attorney for" language flagged', () => {
      const id = makeIdentity({ isProSe: true });
      const issues = detect(id, ['COMES NOW Jane Doe, appearing pro se. Attorney for Petitioner']);
      expect(hasIssue(issues, 'attorney_language_in_pro_se')).toBe(true);
    });

    it('21. represented party with "Pro Se" language flagged', () => {
      const id = makeIdentity({ isProSe: false });
      const issues = detect(id, ['COMES NOW Jane Doe, by and through counsel. Pro Se designation']);
      expect(hasIssue(issues, 'pro_se_language_with_counsel')).toBe(true);
    });

    it('22. missing attorney signature for represented party', () => {
      const id = makeIdentity({ isProSe: false });
      const issues = detect(id, ['COMES NOW Jane Doe, by and through counsel.']);
      expect(hasIssue(issues, 'missing_attorney_signature')).toBe(true);
    });
  });

  // ── Safety (23–24) ──
  describe('Safety', () => {
    it('23. placeholder text blocks export', () => {
      const id = makeIdentity();
      const issues = detect(id, ['COMES NOW Jane Doe, appearing pro se. [CHILD NAME] is involved.']);
      expect(hasBlocker(issues, 'placeholder_text_detected')).toBe(true);
      expect(canProceed(issues)).toBe(false);
    });

    it('24. internal metadata leak detected', () => {
      const id = makeIdentity();
      const issues = detect(id, ['COMES NOW Jane Doe. The nodeId classifiedNodes exportRelevance was leaked.']);
      expect(hasIssue(issues, 'internal_metadata_leak_detected')).toBe(true);
    });
  });

  // ── Filename (25) ──
  describe('Filename', () => {
    it('25. resolvedTitle is used for identity', () => {
      const identity = resolveCourtIdentity({
        patch: { resolvedTitle: 'Motion to Compel Discovery' },
      });
      expect(identity.resolvedTitle).toBe('Motion to Compel Discovery');
    });
  });

  // ── Deprecated renderer (26) ──
  describe('Deprecated renderer', () => {
    it('26. ISSUE_TO_MODE covers all issue IDs', () => {
      // Ensure every issue ID has a mode mapping
      const allIds = Object.keys(ISSUE_TO_MODE);
      expect(allIds.length).toBeGreaterThanOrEqual(23);
      allIds.forEach(id => {
        expect(MODE_PRIORITY).toContain(ISSUE_TO_MODE[id as keyof typeof ISSUE_TO_MODE]);
      });
    });
  });

  // ── State management (27–30) ──
  describe('State management', () => {
    it('27. issues with blockers signal showCourtClarification', () => {
      const id = makeIdentity({ resolvedTitle: '' });
      const issues = detect(id);
      const hasBlockers = issues.some(i => i.severity === 'blocker');
      expect(hasBlockers).toBe(true);
    });

    it('28. MODE_PRIORITY orders caption before title', () => {
      const captionIdx = MODE_PRIORITY.indexOf('court_caption_repair');
      const titleIdx = MODE_PRIORITY.indexOf('court_title_repair');
      expect(captionIdx).toBeLessThan(titleIdx);
    });

    it('29. clean identity produces no blockers', () => {
      const id = makeIdentity();
      const issues = detect(id, [
        'COMES NOW Jane Doe, Petitioner, appearing pro se, and files this motion.',
        'PRAYER: WHEREFORE, Petitioner prays the Court grant relief.',
        'CERTIFICATE OF SERVICE: I certify that a copy was served.',
        'Respectfully submitted, _____________________ Jane Doe, Pro Se',
      ]);
      expect(canProceed(issues)).toBe(true);
    });

    it('30. modal stays open metaphor: blockers remain after partial patch', () => {
      // Missing title AND missing cause number
      const id = makeIdentity({ resolvedTitle: '', causeNumber: '' });
      const issues = detect(id);
      expect(canProceed(issues)).toBe(false);
      // "Fix" just the title — blockers should remain for cause number
      const patched = makeIdentity({ resolvedTitle: 'Motion to Modify', causeNumber: '' });
      const remaining = detect(patched);
      expect(canProceed(remaining)).toBe(false);
      expect(hasBlocker(remaining, 'missing_cause_number')).toBe(true);
    });
  });

  // ── NEXchat handoff (31) ──
  describe('NEXchat handoff', () => {
    it('31. handoff payload round-trips through sessionStorage', () => {
      const payload = {
        source: 'clarification_modal' as const,
        intent: 'fix_court_issues' as const,
        caseId: 'test-case-123',
        exportPath: 'court_document' as const,
        courtIdentity: { state: 'Texas', county: 'Harris' },
        issues: [{ id: 'missing_cause_number' as const, severity: 'blocker' }],
        draftText: 'Draft text here',
        requestedOutcome: 'Fix missing cause number',
        timestamp: Date.now(),
        schemaVersion: 1 as const,
      };
      storeCourtHandoff(payload);
      const consumed = consumeCourtHandoff();
      expect(consumed).not.toBeNull();
      expect(consumed!.caseId).toBe('test-case-123');
      expect(consumed!.issues[0].id).toBe('missing_cause_number');
      // Cleared after consume
      const second = consumeCourtHandoff();
      expect(second).toBeNull();
    });
  });

  // ── AI failure (32) ──
  describe('AI failure', () => {
    it('32. malformed output with placeholder triggers clarification', () => {
      const id = makeIdentity();
      const issues = detect(id, ['COMES NOW [FILING PARTY NAME], appearing pro se']);
      expect(hasBlocker(issues, 'placeholder_text_detected')).toBe(true);
    });
  });

  // ── Custom caption (33) ──
  describe('Custom caption', () => {
    it('33. missing cause/court/county together trigger multiple blockers', () => {
      const id = makeIdentity({ causeNumber: '', courtName: '', county: '', state: '' });
      const issues = detect(id);
      expect(hasBlocker(issues, 'missing_cause_number')).toBe(true);
      expect(hasBlocker(issues, 'missing_county_or_state')).toBe(true);
      expect(canProceed(issues)).toBe(false);
    });
  });

  // ── Race guard (34) ──
  describe('Race guard', () => {
    it('34. pre-SSE re-check: same identity produces same issues', () => {
      const id = makeIdentity({ causeNumber: '' });
      const first = detect(id);
      const second = detect(id);
      expect(first.map(i => i.id)).toEqual(second.map(i => i.id));
    });
  });

  // ── Idempotent (35) ──
  describe('Idempotent', () => {
    it('35. same patch twice produces identical identity', () => {
      const patch = { state: 'Texas', county: 'Harris', causeNumber: '2024-123' };
      const first = resolveCourtIdentity({ patch });
      const second = resolveCourtIdentity({ patch });
      expect(first.state).toBe(second.state);
      expect(first.county).toBe(second.county);
      expect(first.causeNumber).toBe(second.causeNumber);
    });
  });

  // ── Per-field merge (36) ──
  describe('Per-field merge', () => {
    it('36. empty string treated as missing', () => {
      const identity = resolveCourtIdentity({
        patch: { county: '' },
        courtSettings: { state: 'Texas', county: 'Harris' },
      });
      // courtSettings.county wins because patch.county is empty
      expect(identity.county).toBe('Harris');
    });
  });

  // ── Pre-PDF freeze (37) ──
  describe('Pre-PDF freeze', () => {
    it('37. post-adaptation check catches issues in adapted content', () => {
      const id = makeIdentity();
      // Simulate adapted content that introduced a placeholder
      const issues = detect(id, ['COMES NOW Jane Doe. The court_document type was [COURT NAME]']);
      expect(hasBlocker(issues, 'placeholder_text_detected')).toBe(true);
    });
  });

  // ── FORBIDDEN_VISIBLE_TEXT shared constant ──
  describe('Shared constants', () => {
    it('FORBIDDEN_VISIBLE_TEXT includes standard placeholders', () => {
      expect(FORBIDDEN_VISIBLE_TEXT).toContain('[CHILD NAME]');
      expect(FORBIDDEN_VISIBLE_TEXT).toContain('[COURT NAME]');
      expect(FORBIDDEN_VISIBLE_TEXT).toContain('[CAUSE NUMBER]');
    });

    it('isValidDocumentKind validates known kinds', () => {
      expect(isValidDocumentKind('motion')).toBe(true);
      expect(isValidDocumentKind('amended_motion')).toBe(true);
      expect(isValidDocumentKind('garbage')).toBe(false);
      expect(isValidDocumentKind('')).toBe(false);
      expect(isValidDocumentKind(null)).toBe(false);
    });
  });
});
