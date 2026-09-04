import { stableCapabilityHash } from '../capabilities/documentCapabilityLedger';

export const PUBLICATION_VALIDATOR_VERSION = 'response-publication-v1';
export const PUBLICATION_VALIDATOR_V2_VERSION = 'response-publication-v2';
export type PublicationValidatorVersion =
  | typeof PUBLICATION_VALIDATOR_VERSION
  | typeof PUBLICATION_VALIDATOR_V2_VERSION;

export type PublicationCheckName =
  | 'responsiveness'
  | 'evidence'
  | 'capabilityClaims'
  | 'continuity'
  | 'contradictions'
  | 'safety'
  | 'internalPayload';

export type PublicationChecks = Record<PublicationCheckName, true>;

const validatedEnvelopeBrand: unique symbol = Symbol('validatedPublicationEnvelope');

export type ValidatedPublicationEnvelope = {
  readonly [validatedEnvelopeBrand]: true;
  schemaVersion: 1;
  envelopeId: string;
  turnId: string;
  planId: string;
  taskId: string;
  focusRevision: number;
  responseAct: 'answer' | 'clarify' | 'confirm' | 'correct' | 'status' | 'safe_limit';
  content: string;
  artifactsJson?: string;
  pendingOptionsJson?: string;
  assistantOfferJson?: string;
  decision: 'publish' | 'publish_scoped' | 'ask_clarification' | 'publish_limitation';
  checks: PublicationChecks;
  capabilitySnapshotHash: string;
  evidenceSetHash: string;
  canonicalPlanHash: string;
  validatorVersion: string;
  mintedAt: number;
};

export type PublicationCandidate = Omit<ValidatedPublicationEnvelope, typeof validatedEnvelopeBrand | 'schemaVersion' | 'envelopeId' | 'validatorVersion' | 'mintedAt' | 'checks'> & {
  checks: Record<PublicationCheckName, boolean>;
};

export function mintPublicationEnvelope(
  candidate: PublicationCandidate,
  options?: { validatorVersion?: PublicationValidatorVersion },
): ValidatedPublicationEnvelope {
  const failed = (Object.entries(candidate.checks) as Array<[PublicationCheckName, boolean]>)
    .filter(([, passed]) => passed !== true)
    .map(([name]) => name);
  if (failed.length > 0) throw new Error(`publication_checks_failed:${failed.join(',')}`);
  if (!candidate.content.trim()) throw new Error('publication_content_empty');
  const mintedAt = Date.now();
  const envelopeId = `env_${stableCapabilityHash({
    turnId: candidate.turnId,
    planId: candidate.planId,
    taskId: candidate.taskId,
    focusRevision: candidate.focusRevision,
    content: candidate.content,
    mintedAt,
  }).slice(4)}`;
  return {
    ...candidate,
    schemaVersion: 1,
    envelopeId,
    validatorVersion: options?.validatorVersion ?? PUBLICATION_VALIDATOR_VERSION,
    mintedAt,
    checks: candidate.checks as PublicationChecks,
    [validatedEnvelopeBrand]: true,
  };
}

export function serializePublicationEnvelope(
  envelope: ValidatedPublicationEnvelope,
): Omit<ValidatedPublicationEnvelope, typeof validatedEnvelopeBrand> {
  const serializable = { ...envelope };
  Reflect.deleteProperty(serializable, validatedEnvelopeBrand);
  return serializable;
}

export type PersistedPublicationEnvelope = ReturnType<typeof serializePublicationEnvelope>;

export function validatePersistedEnvelope(args: {
  envelope: PersistedPublicationEnvelope;
  turnId: string;
  planId: string;
  taskId: string;
  focusRevision: number;
  capabilitySnapshotHash: string;
  evidenceSetHash: string;
  expectedValidatorVersion?: PublicationValidatorVersion;
}) {
  const { envelope } = args;
  const errors: string[] = [];
  if (envelope.schemaVersion !== 1) errors.push('publication_schema_unsupported');
  if (envelope.validatorVersion !== (args.expectedValidatorVersion ?? PUBLICATION_VALIDATOR_VERSION)) {
    errors.push('publication_validator_incompatible');
  }
  if (envelope.turnId !== args.turnId) errors.push('publication_turn_mismatch');
  if (envelope.planId !== args.planId) errors.push('publication_plan_mismatch');
  if (envelope.taskId !== args.taskId) errors.push('publication_task_mismatch');
  if (envelope.focusRevision !== args.focusRevision) errors.push('publication_focus_stale');
  if (envelope.capabilitySnapshotHash !== args.capabilitySnapshotHash) errors.push('publication_capability_stale');
  if (envelope.evidenceSetHash !== args.evidenceSetHash) errors.push('publication_evidence_stale');
  if (!envelope.content.trim()) errors.push('publication_content_empty');
  if (Object.values(envelope.checks).some((value) => value !== true)) errors.push('publication_checks_failed');
  return { passed: errors.length === 0, errors };
}
