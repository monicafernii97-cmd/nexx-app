/**
 * Document Drafter — AI-assisted drafting layer for DocuVault.
 * 
 * Takes a template + case facts + court formatting rules and produces
 * a TemplateDraftPlan with fact validation and draft content.
 */

import { openai } from '../openaiConversation';
import { TEMPLATE_DRAFT_PLAN_SCHEMA, DOCUMENT_DRAFT_SCHEMA } from './schemas';
import type { TemplateDraftPlan } from '../types';


/**
 * Generate a draft plan for a template.
 * Identifies required facts, optional facts, and gaps.
 */
export async function generateDraftPlan(args: {
  templateId: string;
  templateName: string;
  templateSections: string[];
  caseGraph?: Record<string, unknown>;
  userContext?: Record<string, unknown>;
}): Promise<TemplateDraftPlan> {
  const contextInfo = args.caseGraph
    ? `\nCase graph:\n${JSON.stringify(args.caseGraph, null, 2)}`
    : '';
  const userContextInfo = args.userContext
    ? `\nUser context:\n${JSON.stringify(args.userContext, null, 2)}`
    : '';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (openai.responses as any).create({
    model: 'gpt-5.4',
    input: [
      {
        role: 'developer',
        content: `You are a legal document fact validator. Given a document template and available case data:

1. List the REQUIRED facts needed to fill this template (things that MUST be present)
2. List OPTIONAL facts that would strengthen the document
3. Identify MISSING facts — required facts that are NOT available in the case data

Template: ${args.templateName}
Sections: ${args.templateSections.join(', ')}
${contextInfo}
${userContextInfo}`,
      },
      {
        role: 'user',
        content: `Generate a draft plan for template "${args.templateId}".`,
      },
    ],
    text: { format: TEMPLATE_DRAFT_PLAN_SCHEMA },
  });

  const text = response.output_text || '';
  try {
    return JSON.parse(text) as TemplateDraftPlan;
  } catch {
    return {
      templateId: args.templateId,
      requiredFacts: [],
      optionalFacts: [],
      missingFacts: ['Unable to generate draft plan'],
    };
  }
}

/**
 * Generate draft content for template sections.
 * Returns structured content ready for the template renderer.
 */
export async function generateDraftContent(args: {
  templateId: string;
  templateName: string;
  sections: string[];
  caseGraph?: Record<string, unknown>;
  courtRules?: Record<string, unknown>;
  /** Optional AbortSignal for timeout/cancellation support. */
  signal?: AbortSignal;
}): Promise<Array<{ sectionId: string; heading: string; body: string; numberedItems?: string[] }>> {
  const contextParts: string[] = [];
  if (args.caseGraph) contextParts.push(`Case data:\n${JSON.stringify(args.caseGraph, null, 2)}`);
  if (args.courtRules) contextParts.push(`Court rules:\n${JSON.stringify(args.courtRules, null, 2)}`);

  const requestOptions: Record<string, unknown> = {
    model: 'gpt-5.4',
    input: [
      {
        role: 'developer',
        content: `You are a legal document drafter. Generate court-ready content for a "${args.templateName}" document.

Rules:
- Use formal legal language appropriate for court filings
- Include WHEREFORE paragraphs where appropriate
- Number all prayer items
- Use neutral, factual language
- Never fabricate facts — only use provided case data
- If a fact is needed but not available, insert [FACT NEEDED: description]

Sections to draft: ${args.sections.join(', ')}
${contextParts.join('\n\n')}`,
      },
      {
        role: 'user',
        content: `Draft content for "${args.templateId}".`,
      },
    ],
    text: { format: DOCUMENT_DRAFT_SCHEMA },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (openai.responses as any).create(
    requestOptions,
    args.signal ? { signal: args.signal } : undefined,
  );

  const text = response.output_text || '';
  try {
    const parsed = JSON.parse(text);
    return parsed.sections || [];
  } catch {
    return [];
  }
}
