/**
 * User-facing copy for all court document validation issues.
 *
 * Tone rules:
 * - Use: "This needs one more court-filing detail."
 * - Not: "Your document is defective."
 * - Use: "may cause confusion, delay, or require correction"
 * - Not: "will be rejected"
 *
 * @module courtIssueCopy
 */

import type { CourtDocumentIssueId } from './courtDocumentIssues';

type IssueCopyEntry = {
  title: string;
  message: string;
  whyItMatters?: string;
};

/**
 * User-facing copy for each CourtDocumentIssueId.
 * ClarificationModal renders these values directly.
 */
export const COURT_ISSUE_COPY: Record<CourtDocumentIssueId, IssueCopyEntry> = {
  generic_title_detected: {
    title: 'This filing needs a specific court-document title.',
    message:
      'NEXX found a generic title like "Court Filing Document." Court filings need a specific title so the document is clear to the court.',
    whyItMatters:
      'A generic title may cause confusion, delay, or require correction when filed.',
  },

  missing_document_title: {
    title: 'This filing needs a document title.',
    message:
      'No title was found for this document. Court filings need a clear title like "Motion for Temporary Orders."',
    whyItMatters:
      'Without a title, the court clerk may not know how to file or docket this document.',
  },

  missing_subtitle_when_context_requires: {
    title: 'A subtitle would help clarify this filing.',
    message:
      'This document type usually includes a subtitle to provide additional context, such as "Pending Final Hearing on Petition to Modify Parent–Child Relationship."',
  },

  missing_sapcr_child_name: {
    title: "This SAPCR caption needs the child's name.",
    message:
      'Because this case uses an "In the Interest of" caption, the child\'s name or initials must appear in the case caption.',
    whyItMatters:
      'SAPCR filings identify the child in the case style. Missing this may cause confusion or require correction.',
  },

  wrong_caption_format: {
    title: 'This SAPCR caption needs to use "In the Interest of."',
    message:
      'This filing involves a parent–child case, but the caption uses a "Name v. Name" format. SAPCR cases typically use "In the Interest of [Child], A Child."',
    whyItMatters:
      'Using the wrong caption format may cause confusion, delay, or require correction.',
  },

  missing_cause_number: {
    title: 'This filing needs a cause number.',
    message:
      'Court filings include a cause number so the clerk can match the document to the correct case.',
    whyItMatters:
      'Without a cause number, the filing may not be docketed to the right case.',
  },

  missing_judicial_district: {
    title: 'This filing needs the judicial district.',
    message:
      'Texas district-court captions usually include the judicial district, such as "387th Judicial District."',
    whyItMatters:
      'The judicial district tells the clerk which court has jurisdiction.',
  },

  missing_court_name: {
    title: 'This filing needs the court name.',
    message:
      'Court filings include the court name (e.g., "District Court") in the caption.',
    whyItMatters:
      'Without the court name, the caption is incomplete.',
  },

  missing_county_or_state: {
    title: 'This filing needs the county and state.',
    message:
      'Court captions include the county and state where the case is filed.',
    whyItMatters:
      'Missing county or state may cause confusion about venue.',
  },

  missing_filing_party_role: {
    title: 'This filing needs the filing party and role.',
    message:
      'Court filings identify who is filing (e.g., "Petitioner" or "Respondent") and their full legal name.',
    whyItMatters:
      'The court needs to know who is filing this document.',
  },

  missing_opposing_party: {
    title: 'This filing is missing the opposing party.',
    message:
      'Court filings usually identify both parties. The opposing party name was not found.',
  },

  missing_motion_intro: {
    title: 'This motion needs an introductory paragraph.',
    message:
      'Motions typically begin with "TO THE HONORABLE JUDGE OF SAID COURT:" followed by a "COMES NOW" introduction identifying the filing party.',
    whyItMatters:
      'Without a proper introduction, the court may not know who is filing or what is being requested.',
  },

  missing_prayer: {
    title: 'This motion needs a Prayer section.',
    message:
      'A motion usually needs a Prayer section telling the Court exactly what relief is requested.',
    whyItMatters:
      'Without a prayer, the court may not know what specific orders to consider.',
  },

  missing_certificate: {
    title: 'This filing needs a Certificate of Service.',
    message:
      'Court filings generally need a Certificate of Service showing that the document was served on the other party.',
    whyItMatters:
      'Filing without a Certificate of Service may delay or require correction before the motion can be heard.',
  },

  duplicate_section_content: {
    title: 'NEXX found repeated content.',
    message:
      'The same section appears to be included more than once. This can make the filing look unpolished or confusing.',
  },

  malformed_section_headings: {
    title: 'Some section headings need adjustment.',
    message:
      'NEXX found headings that may not follow standard court-document formatting.',
  },

  numbered_paragraph_structure_missing: {
    title: 'This filing should use numbered paragraphs.',
    message:
      'Court motions typically number their factual allegations as individual paragraphs (1., 2., 3., etc.).',
  },

  internal_metadata_leak_detected: {
    title: 'Internal data was found in the document text.',
    message:
      'NEXX found internal processing data that should not appear in a court filing.',
    whyItMatters:
      'Internal metadata in a filed document looks unprofessional and may confuse the court.',
  },

  placeholder_text_detected: {
    title: 'This document contains placeholder text.',
    message:
      'NEXX found placeholder text like "[CHILD NAME]" or "undefined" that must be replaced before filing.',
    whyItMatters:
      'Placeholder text in a court filing may cause confusion, delay, or require correction.',
  },

  missing_signature_block: {
    title: 'This filing needs your signature block.',
    message:
      'Because you are filing pro se, the document needs a signature block with your full legal name and "Pro Se" designation.',
    whyItMatters:
      'Court filings must be signed by the filing party or their attorney.',
  },

  missing_attorney_signature: {
    title: 'This document needs an attorney signature block.',
    message:
      'This document appears to be filed with legal counsel, but no attorney signature block was found. You can proceed with a placeholder or add the attorney information.',
    whyItMatters:
      'Court filings typically require the attorney of record to sign.',
  },

  pro_se_language_with_counsel: {
    title: 'This represented filing contains pro se language.',
    message:
      'The document includes "Pro Se" or "appearing pro se," but your profile indicates you have legal counsel. This may cause confusion.',
    whyItMatters:
      'Representation status and signature language must match to avoid confusion.',
  },

  attorney_language_in_pro_se: {
    title: 'This pro se filing contains attorney language.',
    message:
      'The document includes "Attorney for" language, but your profile indicates you are filing pro se. This may cause confusion.',
    whyItMatters:
      'Representation status and signature language must match to avoid confusion.',
  },
};
