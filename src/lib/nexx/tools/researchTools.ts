import type { AuthorizedTool, ToolExecutionResult } from './contracts';

export type CurrentAuthoritySearchArgs = {
  query: string;
  jurisdiction?: string;
};

export function createCurrentAuthoritySearchTool(
  search: (args: CurrentAuthoritySearchArgs) => Promise<ToolExecutionResult<{ results: Array<{ title: string; url: string; excerpt: string }> }>>,
): AuthorizedTool<CurrentAuthoritySearchArgs, { results: Array<{ title: string; url: string; excerpt: string }> }> {
  return {
    name: 'search_current_authority',
    description: 'Search current official legal or court sources when up-to-date authority is needed.',
    sideEffect: 'none',
    requiresConfirmation: false,
    validateArgs(value) {
      const args = value as Partial<CurrentAuthoritySearchArgs> | null;
      if (!args || typeof args.query !== 'string' || !args.query.trim()) throw new Error('invalid_research_query');
      if (args.jurisdiction !== undefined && typeof args.jurisdiction !== 'string') throw new Error('invalid_jurisdiction');
      return { query: args.query.trim().slice(0, 2_000), jurisdiction: args.jurisdiction?.trim().slice(0, 200) };
    },
    resourceIds: () => [],
    execute: (args) => search(args),
  };
}

export function createVerifiedCurrentLawTool(
  search: (args: CurrentAuthoritySearchArgs) => Promise<ToolExecutionResult<{ results: Array<{ title: string; url: string; excerpt: string }> }>>,
) {
  return { ...createCurrentAuthoritySearchTool(search), name: 'verify_current_law' };
}

export function createLocalProcedureLookupTool(
  search: (args: CurrentAuthoritySearchArgs) => Promise<ToolExecutionResult<{ results: Array<{ title: string; url: string; excerpt: string }> }>>,
) {
  return {
    ...createCurrentAuthoritySearchTool(search),
    name: 'lookup_local_procedure',
    description: 'Look up current official local court procedure for a stated jurisdiction.',
    validateArgs(value: unknown) {
      const args = createCurrentAuthoritySearchTool(search).validateArgs(value);
      if (!args.jurisdiction) throw new Error('jurisdiction_required');
      return args;
    },
  };
}
