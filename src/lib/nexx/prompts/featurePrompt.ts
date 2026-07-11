/**
 * Layer C - Feature/tool instructions prompt.
 *
 * This prompt must describe only capabilities that are actually callable in the
 * provider request or deterministically injected by the worker.
 */

import type { ToolPlan } from '../../types';

export type ActualToolCapabilities = {
  fileSearch: boolean;
  webSearch: boolean;
  codeInterpreter: boolean;
  createIncident: boolean;
  appendTimeline: boolean;
  generateDraft: boolean;
  saveCaseNote: boolean;
  markEvidenceTheme: boolean;
  createExhibitIndex: boolean;
  linkIncidentToMotion: boolean;
  localCourtRetriever: boolean;
};

export function actualToolCapabilitiesFromPlan(
  toolPlan: ToolPlan,
  options: {
    hasVectorStore?: boolean;
    localCourtSourcesInjected?: boolean;
  } = {}
): ActualToolCapabilities {
  return {
    fileSearch: Boolean(toolPlan.useFileSearch && options.hasVectorStore),
    webSearch: Boolean(toolPlan.useWebSearch),
    codeInterpreter: false,
    createIncident: false,
    appendTimeline: false,
    generateDraft: false,
    saveCaseNote: false,
    markEvidenceTheme: false,
    createExhibitIndex: false,
    linkIncidentToMotion: false,
    localCourtRetriever: Boolean(toolPlan.useLocalCourtRetriever && options.localCourtSourcesInjected),
  };
}

export function buildFeatureToolPrompt(
  toolPlan: ToolPlan,
  capabilities: ActualToolCapabilities = actualToolCapabilitiesFromPlan(toolPlan)
): string {
  const sections: string[] = ['## Available Tools and When to Use Them'];

  if (capabilities.fileSearch) {
    sections.push(`
### File Search
The user has uploaded documents to a vector store. You have access to file_search.
- Use it when the user asks about "my order", "the document", or references specific filings.
- Uploaded documents may include an extracted companion text file. Prefer that companion text when available because it is normalized for retrieval.
- If the user's message includes an "Extracted text preview", analyze that text directly and use file_search to fill gaps beyond the preview.
- Always cite which document you're referencing in your response.
- If file search returns no relevant results, say so in plain language. Do not make up content.`);
  }

  if (capabilities.webSearch) {
    sections.push(`
### Web Search
You have access to web_search for retrieving current legal information.
- Use it for local court rules, filing procedures, statutes, filing forms, service requirements, and jurisdiction-specific drafting requirements.
- Prefer official state judiciary, statute, court, county clerk, district clerk, and court self-help domains before blogs or private legal marketing pages.
- Use the Official Legal Research Targets in the context packet when they are present.
- Separate uploaded-document facts from external law/procedure sources.
- Cite official source URLs for legal/procedure statements that are not directly from the uploaded document.`);
  }

  if (capabilities.codeInterpreter) {
    sections.push(`
### Code Interpreter
You have access to code_interpreter for structured data tasks.
- Use it for building timelines from multiple events, creating exhibit indexes, extracting tables from documents, PDF text cleanup, and chronological event summaries.
- Output structured data that can be rendered by the frontend.`);
  }

  if (capabilities.localCourtRetriever) {
    sections.push(`
### Local Court Source Data
The system has injected local court source data for this turn.
- Court rules are retrieved first, then normalized. Never invent rules.
- If a retrieved source conflicts with your knowledge, prefer the retrieved source.
- Always provide a court-ready summary alongside plain-language explanations.
- When drafting, use saved court settings for caption/court/party details if present, and ask only for fields that are truly missing.`);
  }

  const hasRecordCreationTool = capabilities.createIncident ||
    capabilities.appendTimeline ||
    capabilities.generateDraft ||
    capabilities.saveCaseNote ||
    capabilities.markEvidenceTheme ||
    capabilities.createExhibitIndex ||
    capabilities.linkIncidentToMotion;

  if (hasRecordCreationTool) {
    sections.push(`
### Backend Function Tools
Only say that an incident, timeline entry, draft, case note, evidence theme, exhibit index, or link was saved after the corresponding backend tool succeeds.`);
  } else {
    sections.push(`
### Tool Capability Boundary
No backend record-creation tools are available in this provider call.
- Do not say you saved a case note, created an incident, appended a timeline event, created a draft record, marked an evidence theme, created an exhibit index, or linked an incident to a motion.
- You may offer text the user can review or copy, and you may suggest the next action, but do not claim the action already happened.`);
  }

  sections.push(`
### Judge-Lens Engine Rules
When analyzing from the judge's perspective:
1. Start with evidence: what is documented, verifiable, and admissible.
2. Build the narrative: how the evidence tells a story.
3. Frame for filing: how to present this in court-appropriate language.
Never skip from raw events to court language without the evidence evaluation step.`);

  return sections.join('\n');
}
