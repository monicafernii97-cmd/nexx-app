/**
 * extractCourtMetadataFromText.ts
 *
 * Regex-based extraction of court metadata from pasted document text.
 * Priority Level 1 in the resolution chain — values extracted here
 * control the current document over saved settings.
 *
 * Each extracted field includes a confidence level so the modal can
 * decide how to render it:
 *   - high   → confirmation chip ("Harris County ✓")
 *   - medium → suggestion radio with alternatives
 *   - low    → suggestion only, never auto-applied
 */

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

/** A single extracted field value with confidence metadata. */
export type ExtractedField = {
  value: string;
  confidence: 'high' | 'medium' | 'low';
};

/** All court metadata that can be extracted from pasted text. */
export type ExtractedCourtMetadata = {
  causeNumber?: ExtractedField;
  judicialDistrict?: ExtractedField;
  county?: ExtractedField;
  state?: ExtractedField;
  courtName?: ExtractedField;
  petitionerName?: ExtractedField;
  respondentName?: ExtractedField;
  documentTitle?: ExtractedField;
  documentSubtitle?: ExtractedField;
  filingPartyRole?: ExtractedField;
  /** Child name(s) extracted from "In the Interest of" captions. */
  childrenNames?: ExtractedField;
  /** Caption format: 'in_interest_of' or 'name_v_name'. */
  caseTitleFormat?: ExtractedField;
};

// ═══════════════════════════════════════════════════════════════
// Known values for validation
// ═══════════════════════════════════════════════════════════════

const US_STATES = new Set([
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado',
  'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho',
  'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana',
  'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota',
  'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada',
  'New Hampshire', 'New Jersey', 'New Mexico', 'New York',
  'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon',
  'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
  'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington',
  'West Virginia', 'Wisconsin', 'Wyoming',
]);

/** Uppercase state name → canonical form. */
const STATE_LOOKUP = new Map<string, string>();
for (const s of US_STATES) STATE_LOOKUP.set(s.toUpperCase(), s);

// ═══════════════════════════════════════════════════════════════
// Extraction patterns
// ═══════════════════════════════════════════════════════════════

/**
 * Extract cause/case number from caption text.
 * Matches: CAUSE NO. 2024-12345-F, Case No. DC-24-12345, No. 2024-CV-1234
 */
function extractCauseNumber(text: string): ExtractedField | undefined {
  // Pattern: "CAUSE NO." or "Case No." or "No." followed by alphanumeric case ID
  const match = text.match(
    /(?:CAUSE\s+NO\.?|Case\s+No\.?|Cause\s+Number|CASE\s+NO\.?|No\.)\s*:?\s*([A-Z0-9][\w\-./]+)/i,
  );
  if (match?.[1]) {
    const val = match[1].trim();
    // High confidence if it looks like a real case number (has digits + separator)
    const hasStructure = /\d.*[-/.]/.test(val) || /^\d{4,}/.test(val);
    return { value: val, confidence: hasStructure ? 'high' : 'medium' };
  }
  return undefined;
}

/**
 * Extract judicial district from caption text.
 * Matches: 387th Judicial District, 255th District Court, 45th Judicial District Court
 */
function extractJudicialDistrict(text: string): ExtractedField | undefined {
  const match = text.match(
    /(\d+(?:st|nd|rd|th))\s+(?:JUDICIAL\s+)?DISTRICT(?:\s+COURT)?/i,
  );
  if (match?.[1]) {
    return {
      value: `${match[1]} Judicial District`,
      confidence: 'high',
    };
  }
  return undefined;
}

/**
 * Extract county name from caption text.
 * Matches: "IN HARRIS COUNTY", "HARRIS COUNTY, TEXAS", "COUNTY OF HARRIS"
 */
function extractCounty(text: string): ExtractedField | undefined {
  // Process line-by-line to avoid cross-line false matches
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();

    // Pattern 1: "[NAME] COUNTY" on the same line (e.g., "HARRIS COUNTY, TEXAS")
    const match1 = trimmed.match(
      /^(?:IN\s+)?([A-Z][A-Z ]+?)\s+COUNTY\b/i,
    );
    if (match1?.[1]) {
      const county = match1[1].trim().replace(/\s+/g, ' ');
      // Filter out false positives
      if (county.length >= 3 && !/^(?:THE|DISTRICT|COURT|JUDICIAL|IN)$/i.test(county)) {
        return { value: county, confidence: 'high' };
      }
    }

    // Pattern 2: "COUNTY OF [NAME]" on the same line
    const match2 = trimmed.match(/COUNTY\s+OF\s+([A-Z][A-Z ]+?)(?:\s*,|$)/i);
    if (match2?.[1]) {
      const county = match2[1].trim();
      if (county.length >= 3) {
        return { value: county, confidence: 'high' };
      }
    }
  }

  return undefined;
}

/**
 * Extract state from caption text.
 * Matches state names following county or "STATE OF" patterns.
 */
function extractState(text: string): ExtractedField | undefined {
  // Pattern 1: "COUNTY, TEXAS" or "COUNTY, STATE"
  const match1 = text.match(/COUNTY\s*,\s*([A-Z][A-Za-z\s]+?)(?:\s*\n|\s*$)/im);
  if (match1?.[1]) {
    const candidate = match1[1].trim();
    const canonical = STATE_LOOKUP.get(candidate.toUpperCase());
    if (canonical) return { value: canonical, confidence: 'high' };
  }

  // Pattern 2: "STATE OF TEXAS"
  const match2 = text.match(/STATE\s+OF\s+([A-Z][A-Za-z\s]+?)(?:\s*\n|\s*$)/im);
  if (match2?.[1]) {
    const candidate = match2[1].trim();
    const canonical = STATE_LOOKUP.get(candidate.toUpperCase());
    if (canonical) return { value: canonical, confidence: 'high' };
  }

  // Pattern 3: Inline mention — just "Texas" or known state name
  for (const [upper, canonical] of STATE_LOOKUP) {
    if (text.toUpperCase().includes(upper)) {
      return { value: canonical, confidence: 'medium' };
    }
  }

  return undefined;
}

/**
 * Extract court name from caption text.
 * Matches: "DISTRICT COURT", "FAMILY COURT", "COUNTY COURT AT LAW NO. 3"
 */
function extractCourtName(text: string): ExtractedField | undefined {
  const match = text.match(
    /(?:IN\s+THE\s+)?(\d+(?:st|nd|rd|th)\s+)?(?:JUDICIAL\s+)?(DISTRICT\s+COURT|FAMILY\s+COURT|COUNTY\s+COURT(?:\s+AT\s+LAW)?(?:\s+NO\.?\s*\d+)?)/i,
  );
  if (match) {
    // Build full court name including ordinal if present
    const ordinal = match[1]?.trim() ?? '';
    const courtType = match[2]?.trim() ?? '';
    const fullName = ordinal ? `${ordinal} ${courtType}` : courtType;
    if (fullName.length >= 5) {
      return { value: fullName, confidence: 'high' };
    }
  }
  return undefined;
}

/**
 * Extract party names and roles from caption text.
 * Handles: "JANE DOE, Petitioner" / "v." / "In the Interest of CHILD"
 */
function extractParties(text: string): {
  petitionerName?: ExtractedField;
  respondentName?: ExtractedField;
  filingPartyRole?: ExtractedField;
} {
  const result: ReturnType<typeof extractParties> = {};

  // Pattern 1: "NAME, Petitioner" ... "v." ... "NAME, Respondent"
  // Allow mixed-case names (e.g., "Jane Doe, Petitioner")
  const petMatch = text.match(
    /([A-Z][A-Za-z\s.'-]+?)\s*,\s*(?:Petitioner|PETITIONER)/i,
  );
  if (petMatch?.[1]) {
    result.petitionerName = {
      value: petMatch[1].trim(),
      confidence: 'high',
    };
  }

  const resMatch = text.match(
    /([A-Z][A-Za-z\s.'-]+?)\s*,\s*(?:Respondent|RESPONDENT)/i,
  );
  if (resMatch?.[1]) {
    result.respondentName = {
      value: resMatch[1].trim(),
      confidence: 'high',
    };
  }

  // Pattern 2: "appearing pro se" → filing party role detection
  if (/Petitioner.*(?:pro\s+se|appearing\s+in\s+pro)/i.test(text)) {
    result.filingPartyRole = { value: 'petitioner', confidence: 'high' };
  } else if (/Respondent.*(?:pro\s+se|appearing\s+in\s+pro)/i.test(text)) {
    result.filingPartyRole = { value: 'respondent', confidence: 'high' };
  } else if (/COMES\s+NOW\s+.+?,\s*Petitioner/i.test(text)) {
    result.filingPartyRole = { value: 'petitioner', confidence: 'medium' };
  } else if (/COMES\s+NOW\s+.+?,\s*Respondent/i.test(text)) {
    result.filingPartyRole = { value: 'respondent', confidence: 'medium' };
  }

  return result;
}

/**
 * Extract document title and optional subtitle from pasted text.
 *
 * Legal titles can take many forms:
 *   - "MOTION FOR TEMPORARY ORDERS"
 *   - "PETITIONER'S SECOND AMENDED MOTION FOR TEMPORARY ORDERS"
 *   - "RESPONDENT'S ORIGINAL ANSWER"
 *   - "AMENDED PETITION TO MODIFY"
 *
 * Subtitles appear as parenthetical lines immediately after the title:
 *   "(Pending Final Hearing on Petition to Modify Parent–Child Relationship)"
 */
function extractDocumentTitle(text: string): { title?: ExtractedField; subtitle?: ExtractedField } {
  const rawLines = text.split('\n');
  // Track original line index so subtitle check uses true adjacency
  const nonBlank = rawLines
    .map((line, index) => ({ line: line.trim(), index }))
    .filter(entry => entry.line.length > 0);

  // Core document type keywords that indicate a legal filing title
  const TITLE_KEYWORDS = /\b(?:MOTION|PETITION|ORDER|AFFIDAVIT|RESPONSE|APPLICATION|ANSWER|DECREE|JUDGMENT|BRIEF|MEMORANDUM|COMPLAINT|COUNTERCLAIM|COUNTER-?PETITION|CROSS-?CLAIM|OBJECTION|DECLARATION|STIPULATION|AGREEMENT|NOTICE|SUBPOENA|WRIT|PLEA|DEMURRER|REPORT|CERTIFICATE|ENTRY|PLEA|FINDING|RECOMMENDATION|RULING|MANDATE|INJUNCTION|PLEA\s+IN\s+ABATEMENT|SPECIAL\s+EXCEPTION)\b/i;

  // Search within first 25 non-blank lines (captions can be long)
  for (let i = 0; i < Math.min(nonBlank.length, 25); i++) {
    const { line, index: rawIndex } = nonBlank[i];

    // Skip lines that are clearly not titles
    if (line.startsWith('CAUSE') || line.startsWith('NO.') || line.startsWith('§')) continue;
    if (/^IN\s+THE\s+(?:INTEREST|MATTER|DISTRICT|CIRCUIT|COUNTY|SUPERIOR)/i.test(line)) continue;
    if (/^(?:TO\s+THE\s+HONORABLE|COMES\s+NOW)/i.test(line)) continue;

    // Check if this line contains a core title keyword
    if (TITLE_KEYWORDS.test(line) && line.length >= 10) {
      const title: ExtractedField = { value: line, confidence: 'high' };
      let subtitle: ExtractedField | undefined;

      // Check the actual next non-blank line — must be adjacent in the raw text
      // (within 2 lines to allow a single blank line between title and subtitle)
      const nextEntry = nonBlank[i + 1];
      if (nextEntry && (nextEntry.index - rawIndex) <= 2) {
        const nextLine = nextEntry.line;
        if (/^\(.*\)$/.test(nextLine) && nextLine.length >= 5) {
          subtitle = { value: nextLine.slice(1, -1).trim(), confidence: 'high' };
        }
      }

      return { title, subtitle };
    }
  }

  return {};
}

// ═══════════════════════════════════════════════════════════════
// Main extractor
// ═══════════════════════════════════════════════════════════════

/**
 * Extract court metadata from pasted document text.
 *
 * Returns a structured object with confidence-tagged values.
 * The resolver uses `.value` for the priority chain, and the
 * full `{ value, confidence }` object is passed to the modal
 * for rendering decisions.
 *
 * @param text - Combined text from all review items
 * @returns Extracted metadata with confidence levels
 */
export function extractCourtMetadataFromText(
  text: string,
): ExtractedCourtMetadata {
  const result: ExtractedCourtMetadata = {};

  result.causeNumber = extractCauseNumber(text);
  result.judicialDistrict = extractJudicialDistrict(text);
  result.county = extractCounty(text);
  result.state = extractState(text);
  result.courtName = extractCourtName(text);
  const titleInfo = extractDocumentTitle(text);
  result.documentTitle = titleInfo.title;
  result.documentSubtitle = titleInfo.subtitle;

  const parties = extractParties(text);
  result.petitionerName = parties.petitionerName;
  result.respondentName = parties.respondentName;
  result.filingPartyRole = parties.filingPartyRole;

  // ── SAPCR / "In the Interest of" extraction ──
  const interestMatch = text.match(
    /IN\s+THE\s+INTEREST\s+OF\s+(?:§\s*)?([A-Z][A-Za-z\s.'-]+?)(?:\s*,\s*§|\s*§|\s*,?\s*(?:A\s+CHILD|A\s+MINOR|CHILDREN|MINOR\s+CHILD))/i,
  );
  if (interestMatch?.[1]) {
    const childName = interestMatch[1].trim();
    result.childrenNames = { value: childName, confidence: 'high' };
    result.caseTitleFormat = { value: 'in_interest_of', confidence: 'high' };
  } else if (/IN\s+THE\s+INTEREST\s+OF/i.test(text)) {
    // Detected the pattern but couldn't parse the name cleanly
    result.caseTitleFormat = { value: 'in_interest_of', confidence: 'medium' };
  } else if (/\bv\.?\s+/i.test(text) && result.petitionerName && result.respondentName) {
    result.caseTitleFormat = { value: 'name_v_name', confidence: 'medium' };
  }

  return result;
}
