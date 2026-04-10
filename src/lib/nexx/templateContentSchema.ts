/**
 * Template Content Schema — defines the AI-generated content structure
 * that flows into the template renderer.
 */

export interface TemplateContentSection {
  sectionId: string;
  heading: string;
  body: string;
  numberedItems?: string[];
  isCourtReady: boolean;
}

export interface TemplateContent {
  templateId: string;
  sections: TemplateContentSection[];
  generatedAt: string;
  model: string;
}

/**
 * Validate that AI-generated content covers all required template sections.
 */
export function validateTemplateContent(
  content: TemplateContent,
  requiredSectionIds: string[]
): { valid: boolean; missingSections: string[] } {
  const generatedIds = new Set(content.sections.map((s) => s.sectionId));
  const missing = requiredSectionIds.filter((id) => !generatedIds.has(id));

  return {
    valid: missing.length === 0,
    missingSections: missing,
  };
}
