import type { LegalDocumentAnswer } from '../legalDocumentAnswer';
import type { LegalInterpretationAnswer } from './legalInterpretationSchema';
import type { LitigationNavigationResponse } from './litigationNavigationSchema';
import type { LocalLegalResourceLookup } from './resourceLookupSchema';

export type LegalBasis = {
  basisType:
    | 'signed_order'
    | 'later_modification'
    | 'statute'
    | 'state_rule'
    | 'local_rule'
    | 'official_form_instruction'
    | 'general_practice'
    | 'reasoned_interpretation';
  proposition: string;
  jurisdiction: string | null;
  citation: string | null;
  effectiveDate: string | null;
  sourceIds: string[];
};

function compact(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

export function buildLegalBasisList(args: {
  documentAnswer?: LegalDocumentAnswer | null;
  legalInterpretation?: LegalInterpretationAnswer | null;
  litigationNavigation?: LitigationNavigationResponse | null;
  localResourceLookup?: LocalLegalResourceLookup | null;
  jurisdiction?: string | null;
}): LegalBasis[] {
  const bases: LegalBasis[] = [];

  if (args.legalInterpretation) {
    for (const clause of args.legalInterpretation.controllingClauses) {
      bases.push({
        basisType: 'signed_order',
        proposition: clause.label || args.legalInterpretation.directAnswer,
        jurisdiction: args.jurisdiction ?? null,
        citation: clause.pageStart ? `p. ${clause.pageStart}` : null,
        effectiveDate: null,
        sourceIds: clause.sourceIds,
      });
    }
    for (const priority of args.legalInterpretation.priorityLanguage) {
      bases.push({
        basisType: priority.signal === 'later_modification' ? 'later_modification' : 'reasoned_interpretation',
        proposition: priority.explanation,
        jurisdiction: args.jurisdiction ?? null,
        citation: null,
        effectiveDate: null,
        sourceIds: priority.sourceIds,
      });
    }
  }

  if (args.documentAnswer) {
    for (const claim of args.documentAnswer.claims.slice(0, 8)) {
      bases.push({
        basisType: claim.claimType === 'procedural' ? 'general_practice' : 'reasoned_interpretation',
        proposition: claim.claim,
        jurisdiction: args.jurisdiction ?? null,
        citation: null,
        effectiveDate: null,
        sourceIds: claim.sourceIds,
      });
    }
  }

  if (args.litigationNavigation?.courtPosture.candidateResponsePaths.length) {
    for (const path of args.litigationNavigation.courtPosture.candidateResponsePaths) {
      bases.push({
        basisType: path.localAuthoritySourceIds.length > 0 ? 'local_rule' : 'general_practice',
        proposition: `${path.candidate}: ${path.reason}`,
        jurisdiction: args.jurisdiction ?? null,
        citation: null,
        effectiveDate: null,
        sourceIds: path.localAuthoritySourceIds,
      });
    }
  }

  if (args.localResourceLookup) {
    for (const source of args.localResourceLookup.feeSources) {
      bases.push({
        basisType: source.sourceType === 'official_court' ? 'state_rule' : 'local_rule',
        proposition: source.summary,
        jurisdiction: compact([
          args.localResourceLookup.jurisdiction.county,
          args.localResourceLookup.jurisdiction.state,
        ]).join(', ') || null,
        citation: source.title,
        effectiveDate: source.retrievedAt,
        sourceIds: [source.sourceId],
      });
    }
  }

  return bases.slice(0, 16);
}
