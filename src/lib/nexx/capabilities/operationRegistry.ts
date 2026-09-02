import type { CapabilityOperation } from './types';

export type OperationRequirement = {
  operation: CapabilityOperation;
  minimum: string[];
  strongerClaims: string[];
};

export const OPERATION_REQUIREMENTS: Record<CapabilityOperation, OperationRequirement> = {
  identify_file: { operation: 'identify_file', minimum: ['authorized_metadata'], strongerClaims: [] },
  quote_requested_page: { operation: 'quote_requested_page', minimum: ['requested_page_text', 'citation_anchor'], strongerClaims: ['ocr_confidence_disclosed'] },
  answer_focused_question: { operation: 'answer_focused_question', minimum: ['relevant_text_or_chunks', 'citation_anchor'], strongerClaims: ['coverage_scope_disclosed'] },
  scoped_summary: { operation: 'scoped_summary', minimum: ['selected_scope_text'], strongerClaims: ['scope_named'] },
  search_document: { operation: 'search_document', minimum: ['searchable_text_or_chunks'], strongerClaims: ['search_scope_disclosed'] },
  exhaustive_review: { operation: 'exhaustive_review', minimum: ['complete_coverage', 'ready_understanding_record'], strongerClaims: ['source_unit_accounting'] },
  compare_documents: { operation: 'compare_documents', minimum: ['scoped_capability_each_file'], strongerClaims: ['unavailable_portions_distinguished'] },
  draft_from_order: { operation: 'draft_from_order', minimum: ['supported_controlling_proposition', 'citation_anchor'], strongerClaims: ['unsupported_obligations_prohibited'] },
};

