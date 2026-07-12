export type ClaimProvenance =
  | 'order_verified'
  | 'filing_verified'
  | 'external_authority_verified'
  | 'user_reported'
  | 'assistant_inference';

export type ClaimVerificationStatus =
  | 'verified'
  | 'reported'
  | 'best_reading'
  | 'unresolved';

export type ClaimSourceRef = {
  sourceId?: string;
  fileId?: string;
  fileName?: string;
  pageStart?: number | null;
  pageEnd?: number | null;
  title?: string;
  url?: string;
  jurisdiction?: string;
  retrievedAt?: string;
  effectiveDate?: string | null;
};

export type GroundedLegalClaim = {
  id: string;
  category:
    | 'order_term'
    | 'filing_type'
    | 'filing_allegation'
    | 'requested_relief'
    | 'party_identity'
    | 'hearing'
    | 'service'
    | 'deadline'
    | 'statutory_rule'
    | 'local_procedure'
    | 'court_fee'
    | 'attorney_cost_estimate'
    | 'user_fact'
    | 'interpretation';
  text: string;
  provenance: ClaimProvenance;
  verificationStatus: ClaimVerificationStatus;
  sources: ClaimSourceRef[];
};

export function hasDocumentSource(claim: Pick<GroundedLegalClaim, 'sources'>) {
  return claim.sources.some((source) => Boolean(source.sourceId || source.fileId));
}

export function validateGroundedLegalClaim(claim: GroundedLegalClaim) {
  if (!claim.text.trim()) return false;
  if (claim.provenance === 'order_verified' || claim.provenance === 'filing_verified') {
    return hasDocumentSource(claim);
  }
  if (claim.provenance === 'external_authority_verified') {
    return claim.sources.some((source) => Boolean(source.url || source.title));
  }
  return true;
}
