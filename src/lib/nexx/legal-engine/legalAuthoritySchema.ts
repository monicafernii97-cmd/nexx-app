import type { LegalBasis } from './legalAuthority';
import type { LocalLegalResourceLookup } from './resourceLookupSchema';

export type LegalAuthoritySource = {
  id: string;
  title: string;
  url: string;
  sourceType:
    | 'statute'
    | 'court_rule'
    | 'official_court'
    | 'district_clerk'
    | 'official_form'
    | 'state_self_help'
    | 'legal_aid'
    | 'bar_referral'
    | 'secondary_authority';
  jurisdiction: string;
  retrievedAt: string;
  effectiveDate: string | null;
};

export type ExternalLegalClaim = {
  proposition: string;
  sourceIds: string[];
  authorityLevel: 'primary' | 'official_guidance' | 'secondary';
};

export type LegalAuthoritiesEnvelope = {
  sources: LegalAuthoritySource[];
  claims: ExternalLegalClaim[];
};

function authoritySourceType(sourceType: LocalLegalResourceLookup['feeSources'][number]['sourceType']): LegalAuthoritySource['sourceType'] {
  if (sourceType === 'official_court' || sourceType === 'efiling') return 'official_court';
  if (sourceType === 'district_clerk') return 'district_clerk';
  if (sourceType === 'legal_aid') return 'legal_aid';
  if (sourceType === 'bar_referral') return 'bar_referral';
  return 'secondary_authority';
}

function authorityLevel(sourceType: LegalAuthoritySource['sourceType']): ExternalLegalClaim['authorityLevel'] {
  if (sourceType === 'statute' || sourceType === 'court_rule') return 'primary';
  if (sourceType === 'official_court' || sourceType === 'district_clerk' || sourceType === 'official_form' || sourceType === 'state_self_help') {
    return 'official_guidance';
  }
  return 'secondary';
}

export function buildLegalAuthoritiesEnvelope(args: {
  localResourceLookup?: LocalLegalResourceLookup | null;
  legalBasis?: LegalBasis[];
}): LegalAuthoritiesEnvelope | null {
  const sources: LegalAuthoritySource[] = [];
  const claims: ExternalLegalClaim[] = [];
  const jurisdiction = [
    args.localResourceLookup?.jurisdiction.county,
    args.localResourceLookup?.jurisdiction.state,
  ].filter(Boolean).join(', ');

  for (const source of args.localResourceLookup?.feeSources ?? []) {
    if (!source.url) continue;
    const sourceType = authoritySourceType(source.sourceType);
    sources.push({
      id: source.sourceId,
      title: source.title,
      url: source.url,
      sourceType,
      jurisdiction,
      retrievedAt: source.retrievedAt,
      effectiveDate: null,
    });
    claims.push({
      proposition: source.summary,
      sourceIds: [source.sourceId],
      authorityLevel: authorityLevel(sourceType),
    });
  }

  const availableSourceIds = new Set(sources.map((source) => source.id));
  for (const basis of args.legalBasis ?? []) {
    if (!['statute', 'state_rule', 'local_rule', 'official_form_instruction'].includes(basis.basisType)) continue;
    if (basis.sourceIds.length === 0) continue;
    if (!basis.sourceIds.every((sourceId) => availableSourceIds.has(sourceId))) continue;
    claims.push({
      proposition: basis.proposition,
      sourceIds: basis.sourceIds,
      authorityLevel: basis.basisType === 'statute' || basis.basisType === 'state_rule'
        ? 'primary'
        : 'official_guidance',
    });
  }

  if (sources.length === 0 && claims.length === 0) return null;
  return {
    sources,
    claims,
  };
}
