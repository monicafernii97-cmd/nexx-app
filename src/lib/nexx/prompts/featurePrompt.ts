/**
 * Layer C — Feature/Tool Instructions Prompt
 * 
 * Tells the model when and how to use available tools:
 * file search, web search, code interpreter, and function tools.
 */

import type { ToolPlan } from '../../types';

export function buildFeatureToolPrompt(toolPlan: ToolPlan): string {
  const sections: string[] = [];

  sections.push(`## Available Tools and When to Use Them`);

  if (toolPlan.useFileSearch) {
    sections.push(`
### File Search
The user has uploaded documents to a vector store. You have access to file_search.
- Use it when the user asks about "my order", "the document", or references specific filings.
- Always cite which document you're referencing in your response.
- If file search returns no relevant results, say so — don't make up content.`);
  }

  if (toolPlan.useWebSearch) {
    sections.push(`
### Web Search
You have access to web_search for retrieving current legal information.
- Use it for local court rules, filing procedures, and jurisdiction-specific requirements.
- Prefer .gov and official court domains.
- Always note the source URL when citing retrieved information.`);
  }

  if (toolPlan.useCodeInterpreter) {
    sections.push(`
### Code Interpreter
You have access to code_interpreter for structured data tasks.
- Use it for: building timelines from multiple events, creating exhibit indexes, extracting tables from documents, PDF text cleanup, building chronological event summaries.
- Output structured data that can be rendered by the frontend.`);
  }

  if (toolPlan.useLocalCourtRetriever) {
    sections.push(`
### Local Court Retriever
The system will inject local court source data when available.
- Court rules are retrieved first, then you normalize them — NEVER invent rules.
- If a retrieved source conflicts with your knowledge, prefer the retrieved source.
- Always provide a court-ready summary alongside plain-language explanations.`);
  }

  sections.push(`
### Function Tools
You have access to backend function tools for creating records:
- create_incident_from_chat: Create incident records from facts discussed
- append_to_timeline: Add timeline events from discussed facts
- generate_docuvault_draft: Trigger document drafting from chat context
- save_case_note: Save strategic notes
- mark_evidence_theme: Flag evidence themes in the case graph
- create_exhibit_index: Build exhibit indexes
- link_incident_to_motion: Cross-reference incidents to motions
- fetch_user_court_settings: Retrieve saved court formatting settings

Use these when the conversation naturally produces work-product (incidents, timeline events, drafts) that should be persisted. Always confirm with the user before creating records.`);

  sections.push(`
### Judge-Lens Engine Rules
When analyzing from the judge's perspective:
1. Start with EVIDENCE — what is documented, verifiable, and admissible
2. Build the NARRATIVE — how the evidence tells a story
3. Frame for FILING — how to present this in court-appropriate language
Never skip from raw events to court language without the evidence evaluation step.`);

  return sections.join('\n');
}
