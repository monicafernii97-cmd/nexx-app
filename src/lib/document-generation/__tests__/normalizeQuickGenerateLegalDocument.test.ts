/**
 * Tests for the Quick Generate legal document normalizer.
 *
 * Covers all 7 test cases from the implementation spec:
 * 1. Full legal motion paste
 * 2. Already normalized content
 * 3. Unstructured pasted text
 * 4. Roman numeral sections only
 * 5. Subsection with numbered list
 * 6. Prayer detected without PRAYER heading
 * 7. Shell metadata override
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeQuickGenerateLegalDocument,
  cleanLegalPasteText,
  parseLegalText,
  mapParsedBodyBlocksToSections,
} from '../normalizeQuickGenerateLegalDocument';
import { validateGeneratedSections } from '../validateGeneratedSections';


// ── Test fixtures ──

const FULL_MOTION = `CAUSE NO. 20-DCV-271717

IN THE INTEREST OF §                      IN THE DISTRICT COURT
§
AMELIA SOFIA FERNANDEZ PUGLIESE, §      387TH JUDICIAL DISTRICT
§
A CHILD §                                  FORT BEND COUNTY, TEXAS

⸻

PETITIONER'S SECOND AMENDED MOTION FOR TEMPORARY ORDERS

(Pending Final Hearing on Petition to Modify Parent–Child Relationship)

TO THE HONORABLE JUDGE OF SAID COURT:

COMES NOW Monica Fernandez, Petitioner, appearing pro se, and files this Second Amended Motion for Temporary Orders pursuant to Chapter 105 of the Texas Family Code, and respectfully shows the Court as follows:

⸻

I. BACKGROUND
1. A Final Order was signed on or about February 25, 2022.
2. That Order provided for electronic communication on Mondays and Wednesdays from 6:00 p.m. to 6:45 p.m.
3. On or about November 21, 2022, the parties entered into a documented written agreement.

⸻

II. IMMEDIATE NEED FOR TEMPORARY RELIEF
4. The child's routine has been structured around the reduced-call agreement since November 2022.
5. Temporary orders are necessary to preserve the long-standing status quo.

⸻

III. REQUESTED TEMPORARY ORDERS

Petitioner respectfully requests that the Court temporarily adopt the communication structure.

⸻

A. Electronic Communication
1. The parent not in possession shall have reasonable electronic communication.
2. Reasonable communication shall consist of one (1) scheduled electronic communication per week.
3. Communication shall not interfere with school, therapy, extracurricular activities.

⸻

B. Structured Written Co-Parent Communication
1. Routine co-parent communication shall occur through the designated co-parenting application.
2. Each parent shall act in good faith.

⸻

VII. BEST INTEREST OF THE CHILD

The requested temporary relief:
• Preserves a three-year established communication structure;
• Protects the child's academic and therapeutic stability;
• Reduces midweek disruption.

⸻

PRAYER

WHEREFORE, PREMISES CONSIDERED, Petitioner respectfully requests that the Court enter temporary orders providing that, until further order of the Court:
1. The modified electronic communication schedule is temporarily adopted;
2. International travel notice and passport procedures are clarified;
3. Petitioner be granted such other and further relief.

Respectfully submitted,

⸻

Monica Fernandez
Petitioner, Pro Se`;


// ═══════════════════════════════════════════════════════════════
// Test 1: Full legal motion paste
// ═══════════════════════════════════════════════════════════════

describe('normalizeQuickGenerateLegalDocument', () => {
  it('Test 1: Full legal motion — extracts shell + body + prayer', () => {
    const result = normalizeQuickGenerateLegalDocument([
      { heading: 'Content', paragraphs: [FULL_MOTION] },
    ]);

    expect(result.normalizationMode).toBe('quick_generate_parsed');

    // Shell metadata
    expect(result.causeNumber).toBe('20-DCV-271717');
    expect(result.title).toBe("PETITIONER'S SECOND AMENDED MOTION FOR TEMPORARY ORDERS");
    expect(result.signatureName).toBe('Monica Fernandez');
    expect(result.signatureRole).toBe('Petitioner, Pro Se');

    // Sections present
    const types = result.sections.map(s => s.sectionType);
    expect(types).toContain('introduction');
    expect(types).toContain('body_sections');
    expect(types).toContain('body_numbered');
    expect(types).toContain('prayer_for_relief');

    // Introduction content
    const intro = result.sections.find(s => s.sectionType === 'introduction');
    expect(intro?.content).toMatch(/COMES NOW Monica Fernandez/);

    // Prayer content
    const prayer = result.sections.find(s => s.sectionType === 'prayer_for_relief');
    expect(prayer?.content).toMatch(/WHEREFORE/);

    // Body has multiple sections
    expect(result.sections.length).toBeGreaterThanOrEqual(5);
  });

  // ═══════════════════════════════════════════════════════════════
  // Test 2: Already normalized content
  // ═══════════════════════════════════════════════════════════════

  it('Test 2: Already normalized — passes through', () => {
    const existing = [
      { sectionType: 'body_sections' as const, content: 'Some content', heading: 'I. Section' },
      { sectionType: 'prayer_for_relief' as const, content: 'WHEREFORE...' },
    ];

    const result = normalizeQuickGenerateLegalDocument(existing);

    expect(result.normalizationMode).toBe('already_normalized');
    expect(result.sections).toEqual(existing);
  });

  // ═══════════════════════════════════════════════════════════════
  // Test 3: Unstructured pasted text
  // ═══════════════════════════════════════════════════════════════

  it('Test 3: Unstructured text — produces fallback body', () => {
    const result = normalizeQuickGenerateLegalDocument([
      { heading: 'Content', paragraphs: ['This is just random text about my case. I need help with custody.'] },
    ]);

    expect(result.sections.length).toBeGreaterThanOrEqual(1);

    const validated = validateGeneratedSections(
      result.sections,
      'This is just random text about my case. I need help with custody.',
    );
    expect(validated.length).toBeGreaterThanOrEqual(1);
    expect(validated[0].content).toContain('random text');
  });

  // ═══════════════════════════════════════════════════════════════
  // Test 4: Roman numeral sections only
  // ═══════════════════════════════════════════════════════════════

  it('Test 4: Roman numeral sections → body_sections per heading', () => {
    const text = `I. BACKGROUND

Some background text here.

II. ARGUMENT

The argument goes here.

III. CONCLUSION

The conclusion text.`;

    const result = normalizeQuickGenerateLegalDocument([
      { heading: 'Content', paragraphs: [text] },
    ]);

    const bodySections = result.sections.filter(s => s.sectionType === 'body_sections');
    expect(bodySections.length).toBeGreaterThanOrEqual(3);
    expect(bodySections[0].heading).toMatch(/I\. BACKGROUND/);
    expect(bodySections[1].heading).toMatch(/II\. ARGUMENT/);
  });

  // ═══════════════════════════════════════════════════════════════
  // Test 5: Subsection with numbered list
  // ═══════════════════════════════════════════════════════════════

  it('Test 5: Numbered list → body_numbered with items', () => {
    const text = `I. REQUESTS

1. Grant sole managing conservatorship.
2. Order child support per guidelines.
3. Award attorney fees.`;

    const result = normalizeQuickGenerateLegalDocument([
      { heading: 'Content', paragraphs: [text] },
    ]);

    const numbered = result.sections.find(s => s.sectionType === 'body_numbered');
    expect(numbered).toBeDefined();
    expect(numbered!.numberedItems).toHaveLength(3);
    expect(numbered!.numberedItems![0]).toMatch(/sole managing/);
  });

  // ═══════════════════════════════════════════════════════════════
  // Test 6: Prayer detected via WHEREFORE (no PRAYER heading)
  // ═══════════════════════════════════════════════════════════════

  it('Test 6: WHEREFORE without PRAYER heading → prayer_for_relief', () => {
    const text = `I. BACKGROUND

Some facts.

WHEREFORE, PREMISES CONSIDERED, Petitioner respectfully requests relief.

Respectfully submitted,

Jane Doe`;

    const result = normalizeQuickGenerateLegalDocument([
      { heading: 'Content', paragraphs: [text] },
    ]);

    const prayer = result.sections.find(s => s.sectionType === 'prayer_for_relief');
    expect(prayer).toBeDefined();
    expect(prayer!.content).toMatch(/WHEREFORE/);
  });

  // ═══════════════════════════════════════════════════════════════
  // Test 7: Shell metadata overrides placeholders
  // ═══════════════════════════════════════════════════════════════

  it('Test 7: Shell metadata extracted from pasted text', () => {
    const text = `CAUSE NO. 22-FAM-12345

IN THE INTEREST OF §  IN THE DISTRICT COURT
§
JOHN DOE, § 387TH JUDICIAL DISTRICT
§
A CHILD § FORT BEND COUNTY, TEXAS

MOTION TO MODIFY PARENT-CHILD RELATIONSHIP

TO THE HONORABLE JUDGE OF SAID COURT:

COMES NOW Jane Doe and files this motion.

I. BACKGROUND

Background content.

Respectfully submitted,

Jane Doe
Petitioner, Pro Se`;

    const result = normalizeQuickGenerateLegalDocument([
      { heading: 'Content', paragraphs: [text] },
    ]);

    expect(result.causeNumber).toBe('22-FAM-12345');
    expect(result.signatureName).toBe('Jane Doe');
    expect(result.signatureRole).toBe('Petitioner, Pro Se');

    // § splitting populates caption metadata
    expect(result.caseStyleLeft).toBeDefined();
    expect(result.caseStyleLeft!.some(l => l.includes('INTEREST'))).toBe(true);
    expect(result.courtLabel).toMatch(/DISTRICT COURT/i);
  });
});


// ═══════════════════════════════════════════════════════════════
// Validator tests
// ═══════════════════════════════════════════════════════════════

describe('validateGeneratedSections', () => {
  it('strips invalid sectionTypes', () => {
    const sections = [
      { sectionType: 'bogus' as never, content: 'test' },
      { sectionType: 'body_sections' as const, content: 'valid' },
    ];
    const result = validateGeneratedSections(sections);
    expect(result).toHaveLength(1);
    expect(result[0].sectionType).toBe('body_sections');
  });

  it('returns fallback when all sections are empty', () => {
    const result = validateGeneratedSections([], 'Fallback text');
    expect(result).toHaveLength(1);
    expect(result[0].sectionType).toBe('body_sections');
    expect(result[0].content).toBe('Fallback text');
  });

  it('strips body_numbered with no items', () => {
    const sections = [
      { sectionType: 'body_numbered' as const, content: '', numberedItems: [] },
    ];
    const result = validateGeneratedSections(sections, 'fallback');
    expect(result[0].content).toBe('fallback');
  });

  it('trims whitespace-only fallback to placeholder', () => {
    const result = validateGeneratedSections([], '   \n  ');
    expect(result[0].content).toBe('[No content provided]');
  });
});


// ═══════════════════════════════════════════════════════════════
// Parser unit tests
// ═══════════════════════════════════════════════════════════════

describe('cleanLegalPasteText', () => {
  it('removes separator lines', () => {
    const cleaned = cleanLegalPasteText('line one\n⸻\nline two');
    expect(cleaned).toBe('line one\nline two');
  });

  it('collapses excessive blank lines', () => {
    const cleaned = cleanLegalPasteText('a\n\n\n\n\n\nb');
    expect(cleaned).toBe('a\n\n\nb');
  });
});

describe('parseLegalText + mapParsedBodyBlocksToSections', () => {
  it('parses cause number', () => {
    const parsed = parseLegalText('CAUSE NO. 20-DCV-271717\n\nI. Section\n\nContent');
    expect(parsed.causeNumber).toBe('20-DCV-271717');
  });

  it('maps introduction + body + prayer', () => {
    const text = cleanLegalPasteText(`TO THE HONORABLE JUDGE OF SAID COURT:

COMES NOW Petitioner and respectfully shows the Court:

I. BACKGROUND

Background text.

PRAYER

WHEREFORE, Petitioner requests relief.

Respectfully submitted,

Test Name`);

    const parsed = parseLegalText(text);
    const sections = mapParsedBodyBlocksToSections(parsed);

    expect(parsed.introduction).toMatch(/COMES NOW/);
    expect(sections.some(s => s.sectionType === 'introduction')).toBe(true);
    expect(sections.some(s => s.sectionType === 'prayer_for_relief')).toBe(true);
    expect(parsed.signatureName).toBe('Test Name');
  });
});
