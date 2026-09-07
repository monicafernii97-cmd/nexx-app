import type { AuthorizedTool, ToolExecutionResult } from './contracts';

export type DocumentReadArgs = {
  documentId: string;
  query: string;
  pageStart?: number;
  pageEnd?: number;
};

export function createDocumentReadTool(
  read: (args: DocumentReadArgs) => Promise<ToolExecutionResult<{ excerpts: string[] }>>,
): AuthorizedTool<DocumentReadArgs, { excerpts: string[] }> {
  return {
    name: 'read_document_pages',
    description: 'Read relevant pages from one document that the server has authorized for this turn.',
    sideEffect: 'none',
    requiresConfirmation: false,
    validateArgs(value) {
      const args = value as Partial<DocumentReadArgs> | null;
      if (!args || typeof args.documentId !== 'string' || typeof args.query !== 'string') throw new Error('invalid_document_read_args');
      if (args.pageStart !== undefined && (!Number.isInteger(args.pageStart) || args.pageStart < 1)) throw new Error('invalid_page_start');
      if (args.pageEnd !== undefined && (!Number.isInteger(args.pageEnd) || args.pageEnd < (args.pageStart ?? 1))) throw new Error('invalid_page_end');
      return { documentId: args.documentId, query: args.query.slice(0, 2_000), pageStart: args.pageStart, pageEnd: args.pageEnd };
    },
    resourceIds: (args) => [args.documentId],
    execute: (args) => read(args),
  };
}

type DocumentLookupArgs = { query: string; documentIds?: string[] };
type DocumentMetadataArgs = { documentId: string };
type DocumentCompareArgs = { documentIds: string[]; query: string };

function documentIds(value: unknown, minimum: number, maximum: number) {
  if (!Array.isArray(value)) throw new Error('invalid_document_ids');
  const ids = Array.from(new Set(value.filter((id): id is string => typeof id === 'string' && id.length > 0)));
  if (ids.length < minimum || ids.length > maximum) throw new Error('invalid_document_ids');
  return ids;
}

export function createAuthorizedDocumentSearchTool(
  search: (args: DocumentLookupArgs) => Promise<ToolExecutionResult<{ matches: Array<{ documentId: string; evidenceIds: string[] }> }>>,
): AuthorizedTool<DocumentLookupArgs, { matches: Array<{ documentId: string; evidenceIds: string[] }> }> {
  return {
    name: 'search_authorized_documents', description: 'Search only documents authorized for this turn.', sideEffect: 'none', requiresConfirmation: false,
    validateArgs(value) {
      const args = value as Partial<DocumentLookupArgs> | null;
      if (!args || typeof args.query !== 'string' || !args.query.trim()) throw new Error('invalid_document_search_args');
      return { query: args.query.trim().slice(0, 2_000), documentIds: args.documentIds ? documentIds(args.documentIds, 1, 20) : undefined };
    },
    resourceIds: (args) => args.documentIds ?? [], execute: (args) => search(args),
  };
}

export function createDocumentMetadataTool(
  getMetadata: (args: DocumentMetadataArgs) => Promise<ToolExecutionResult<Record<string, unknown>>>,
): AuthorizedTool<DocumentMetadataArgs, Record<string, unknown>> {
  return {
    name: 'get_document_metadata', description: 'Read safe metadata for one authorized document.', sideEffect: 'none', requiresConfirmation: false,
    validateArgs(value) {
      const documentId = (value as Partial<DocumentMetadataArgs> | null)?.documentId;
      if (typeof documentId !== 'string' || !documentId) throw new Error('invalid_document_metadata_args');
      return { documentId };
    },
    resourceIds: (args) => [args.documentId], execute: (args) => getMetadata(args),
  };
}

export function createDocumentComparisonTool(
  compare: (args: DocumentCompareArgs) => Promise<ToolExecutionResult<{ differences: unknown[] }>>,
): AuthorizedTool<DocumentCompareArgs, { differences: unknown[] }> {
  return {
    name: 'compare_document_versions', description: 'Compare two or more authorized document versions.', sideEffect: 'none', requiresConfirmation: false,
    validateArgs(value) {
      const args = value as Partial<DocumentCompareArgs> | null;
      if (!args || typeof args.query !== 'string') throw new Error('invalid_document_compare_args');
      return { documentIds: documentIds(args.documentIds, 2, 5), query: args.query.trim().slice(0, 2_000) };
    },
    resourceIds: (args) => args.documentIds, execute: (args) => compare(args),
  };
}

export function createDocumentStatusTool(
  inspect: (args: DocumentMetadataArgs) => Promise<ToolExecutionResult<{ status: string }>>,
): AuthorizedTool<DocumentMetadataArgs, { status: string }> {
  return {
    name: 'inspect_document_processing_status', description: 'Inspect the real processing state of one authorized document.', sideEffect: 'none', requiresConfirmation: false,
    validateArgs(value) {
      const documentId = (value as Partial<DocumentMetadataArgs> | null)?.documentId;
      if (typeof documentId !== 'string' || !documentId) throw new Error('invalid_document_status_args');
      return { documentId };
    },
    resourceIds: (args) => [args.documentId], execute: (args) => inspect(args),
  };
}
