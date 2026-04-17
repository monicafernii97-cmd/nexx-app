/**
 * AI Compliance Checker
 *
 * After a PDF is generated, this module converts each page to an image
 * and uses GPT-4o Vision to verify the document meets court formatting rules.
 *
 * Flow: PDF buffer → page images → GPT-4o Vision analysis → ComplianceReport
 */

import type { CourtFormattingRules, ComplianceReport, ComplianceCheck } from './types';
import type { CountyOverrides } from './courtRules';

/**
 * Check a generated PDF for compliance with court formatting rules.
 *
 * @param pdfBase64 - The generated PDF as a base64 string
 * @param rules - The court formatting rules to check against
 * @param countyInfo - Optional county-specific requirements
 * @returns A structured compliance report
 */
export async function checkDocumentCompliance(
  pdfBase64: string,
  rules: CourtFormattingRules,
  countyInfo?: CountyOverrides | null,
  /** Caller must confirm user has consented to sending the document to OpenAI for analysis. */
  userConsent = false
): Promise<ComplianceReport> {
  // Privacy gate: do not send PII-bearing documents to third-party APIs without consent
  if (!userConsent) {
    return {
      overallStatus: 'warning',
      checks: [
        {
          rule: 'Privacy',
          status: 'warning',
          detail: 'User has not consented to AI-based compliance analysis',
          fix: 'Enable the compliance check consent toggle before running this check',
        },
      ],
      suggestions: ['AI compliance checking requires explicit user consent before document data is transmitted.'],
    };
  }
  try {
    const { default: OpenAI } = await import('openai');
    const { COMPLIANCE_REPORT_SCHEMA } = await import('../nexx/schemas');

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Build the compliance rules checklist for the prompt
    const rulesChecklist = buildRulesChecklist(rules, countyInfo);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (openai.responses as any).create({
      model: 'gpt-4o',
      temperature: 0.1,
      input: [
        {
          role: 'developer',
          content: `You are a legal document formatting compliance checker. You analyze legal documents and verify they meet specific court formatting requirements.`,
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_file',
              filename: 'document.pdf',
              file_data: `data:application/pdf;base64,${pdfBase64}`,
            },
            {
              type: 'input_text',
              text: `Analyze this legal document and verify it meets ALL of the following court formatting requirements. For each rule, determine if the document passes, has a warning, or fails.

${rulesChecklist}

Be thorough but practical. Minor deviations that don't affect court acceptance should be "warning" not "fail". Missing required sections should be "fail".`,
            },
          ],
        },
      ],
      text: { format: COMPLIANCE_REPORT_SCHEMA },
    });

    const content = response.output_text;
    if (!content) {
      return {
        overallStatus: 'warning',
        checks: [
          {
            rule: 'AI Analysis',
            status: 'warning',
            detail: 'Unable to complete automated compliance check',
            fix: 'Manual review recommended',
          },
        ],
        suggestions: ['AI compliance check could not complete. Please review the document manually.'],
      };
    }

    // Schema guarantees valid structure — no manual validation needed
    return JSON.parse(content) as ComplianceReport;
  } catch (error) {
    // Graceful fallback for any error: network, auth, rate-limit, parse, etc.
    console.error('[Compliance Check Error]', error instanceof Error ? error.message : error);
    return {
      overallStatus: 'warning',
      checks: [
        {
          rule: 'AI Analysis',
          status: 'warning',
          detail: 'Compliance check encountered an error',
          fix: 'Manual review recommended',
        },
      ],
      suggestions: ['Automated compliance check failed. Please review the document manually.'],
    };
  }
}


/**
 * Build a detailed rules checklist string for the GPT-4o prompt.
 */
function buildRulesChecklist(
  rules: CourtFormattingRules,
  countyInfo?: CountyOverrides | null
): string {
  const checks: string[] = [];

  // Font
  checks.push(`FONT: Must be ${rules.fontFamily}, ${rules.fontSize}pt (including footnotes at ${rules.footnoteFontSize}pt)`);

  // Margins
  checks.push(`MARGINS: Top ≥ ${rules.marginTop}in, Bottom ≥ ${rules.marginBottom}in, Left ≥ ${rules.marginLeft}in, Right ≥ ${rules.marginRight}in`);

  // Page size
  checks.push(`PAGE SIZE: ${rules.paperWidth}" × ${rules.paperHeight}" (US Letter)`);

  // Line spacing
  const spacingLabel = rules.lineSpacing === 2 ? 'double' : rules.lineSpacing === 1.5 ? '1.5' : 'single';
  checks.push(`LINE SPACING: ${spacingLabel}-spaced body text`);

  // Alignment
  checks.push(`ALIGNMENT: Body text should be ${rules.bodyAlignment}-aligned`);

  // Caption
  if (rules.captionStyle === 'section-symbol') {
    checks.push(`CAPTION: Must use § column separator format (Texas style)`);
  } else {
    checks.push(`CAPTION: Must use standard versus (v.) format`);
  }

  // Page numbers
  if (rules.pageNumbering) {
    checks.push(`PAGE NUMBERS: Required, position: ${rules.pageNumberPosition}`);
  }

  // Required sections
  if (rules.requiresCertificateOfService) {
    checks.push(`CERTIFICATE OF SERVICE: Required — must be present`);
  }
  if (rules.requiresSignatureBlock) {
    checks.push(`SIGNATURE BLOCK: Required — must include name, role, and contact info`);
  }
  if (rules.requiresVerification) {
    checks.push(`VERIFICATION: Required — must include verification statement`);
  }

  // Section headings
  if (rules.sectionHeadingStyle === 'bold-caps') {
    checks.push(`SECTION HEADINGS: Should be Bold ALL CAPS with Roman numerals`);
  } else {
    checks.push(`SECTION HEADINGS: Should be Bold Title Case with Roman numerals`);
  }

  // Document title
  checks.push(`DOCUMENT TITLE: Must be Bold, ALL CAPS, centered, between horizontal rules`);

  // Court address
  checks.push(`COURT ADDRESS: "TO THE HONORABLE JUDGE OF SAID COURT:" must be present`);

  // County-specific
  if (countyInfo) {
    if (countyInfo.requiredForms.length > 0) {
      checks.push(`REQUIRED FORMS: ${countyInfo.requiredForms.join('; ')}`);
    }
    for (const note of countyInfo.localNotes) {
      checks.push(`LOCAL RULE: ${note}`);
    }
  }

  // State-specific notes
  for (const note of (rules.notes ?? [])) {
    checks.push(`STATE RULE: ${note}`);
  }

  return checks.map((c, i) => `${i + 1}. ${c}`).join('\n');
}


/**
 * Quick compliance pre-check (without AI — just structural validation).
 * Use this for instant feedback before the slower GPT-4o Vision check.
 */
export function quickComplianceCheck(
  html: string,
  rules: CourtFormattingRules
): ComplianceCheck[] {
  const checks: ComplianceCheck[] = [];

  // Use class-attribute regex to match actual HTML elements, not CSS selectors
  // or serialized data that might coincidentally contain the class name.
  const hasClass = (cls: string) => new RegExp(`class="[^"]*\\b${cls}\\b[^"]*"`, 'i').test(html);

  // Check for caption
  if (!hasClass('caption-block') && !hasClass('caption-versus')) {
    checks.push({
      rule: 'Caption',
      status: 'fail',
      detail: 'Document caption is missing',
      fix: 'Add a caption block with cause number, party names, and court information',
    });
  } else {
    checks.push({ rule: 'Caption', status: 'pass', detail: 'Caption block present' });
  }

  // Check for title
  if (!hasClass('document-title')) {
    checks.push({
      rule: 'Document Title',
      status: 'fail',
      detail: 'Document title is missing',
      fix: 'Add a centered, bold, ALL CAPS document title',
    });
  } else {
    checks.push({ rule: 'Document Title', status: 'pass', detail: 'Document title present' });
  }

  // Check for signature block
  if (rules.requiresSignatureBlock && !hasClass('signature-block')) {
    checks.push({
      rule: 'Signature Block',
      status: 'fail',
      detail: 'Signature block is missing',
      fix: 'Add a signature block with name, role, and contact information',
    });
  } else if (rules.requiresSignatureBlock) {
    checks.push({ rule: 'Signature Block', status: 'pass', detail: 'Signature block present' });
  }

  // Check for certificate of service
  if (rules.requiresCertificateOfService && !hasClass('certificate-of-service')) {
    checks.push({
      rule: 'Certificate of Service',
      status: 'fail',
      detail: 'Certificate of service is missing',
      fix: 'Add a Certificate of Service certifying proper service',
    });
  } else if (rules.requiresCertificateOfService) {
    checks.push({ rule: 'Certificate of Service', status: 'pass', detail: 'Certificate of service present' });
  }

  // Check for court address
  if (!hasClass('court-address')) {
    checks.push({
      rule: 'Court Address',
      status: 'warning',
      detail: '"TO THE HONORABLE JUDGE" line may be missing',
      fix: 'Add "TO THE HONORABLE JUDGE OF SAID COURT:" before the introduction',
    });
  } else {
    checks.push({ rule: 'Court Address', status: 'pass', detail: 'Court address present' });
  }

  return checks;
}
