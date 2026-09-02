import type { LegalInterpretationAnswer } from './legalInterpretationSchema';
import { buildLegalQuestionContract, type LegalQuestionContract } from './questionContract';
import { responsePlanFromLegalInterpretation } from './responsePlan';
import type { NexxAssistantResponse } from '../../types';
import type { CapabilityDecision } from '../capabilities/types';
import type { PendingOption, QuestionKind, TurnExecutionPlan } from '../orchestration/types';

export type CanonicalLegalAnswerPlan = {
  version: 1;
  issueId: string | null;
  question: LegalQuestionContract;
  conclusion: {
    disposition: 'yes' | 'no' | 'qualified' | 'explanation' | 'cannot_determine';
    proposition: string;
    sourceIds: string[];
  };
  reasons: Array<{
    proposition: string;
    sourceIds: string[];
    purpose: 'operative_rule' | 'scope_translation' | 'interaction' | 'counterargument' | 'limitation';
  }>;
  practicalOutcome: { proposition: string; start: string | null; end: string | null } | null;
  nextAction: string | null;
  communicationDraft: { tone: 'neutral' | 'firm'; text: string } | null;
  materialLimitation: string | null;
};

function dispositionFor(answer: LegalInterpretationAnswer): CanonicalLegalAnswerPlan['conclusion']['disposition'] {
  if (answer.userFacingCertainty === 'insufficient_text') return 'cannot_determine';
  if (/^\s*no\b/i.test(answer.directAnswer)) return 'no';
  if (/^\s*yes\b/i.test(answer.directAnswer)) return 'yes';
  if (answer.userFacingCertainty === 'ambiguous') return 'qualified';
  return 'explanation';
}

export function canonicalAnswerPlanFromLegalInterpretation(
  answer: LegalInterpretationAnswer,
  userMessage: string,
  issueId: string | null = null
): CanonicalLegalAnswerPlan {
  const legacy = responsePlanFromLegalInterpretation(answer, userMessage);
  return {
    version: 1,
    issueId,
    question: buildLegalQuestionContract(userMessage),
    conclusion: {
      disposition: dispositionFor(answer),
      proposition: legacy.directAnswer,
      sourceIds: Array.from(new Set(answer.controllingClauses.flatMap((clause) => clause.sourceIds))),
    },
    reasons: legacy.explanationSteps.map((step, index) => ({
      proposition: step.point,
      sourceIds: step.sourceIds,
      purpose: index === 0 ? 'scope_translation' as const : 'interaction' as const,
    })),
    practicalOutcome: legacy.practicalOutcome ? {
      proposition: legacy.practicalOutcome,
      start: answer.practicalMeaning.startTime ?? null,
      end: answer.practicalMeaning.endTime ?? null,
    } : null,
    nextAction: legacy.nextAction ?? null,
    communicationDraft: legacy.communicationDraft ? {
      tone: answer.draftMessage?.tone === 'firm' || answer.draftMessage?.tone === 'court_ready' ? 'firm' : 'neutral',
      text: legacy.communicationDraft.text,
    } : null,
    materialLimitation: legacy.materialLimitation ?? null,
  };
}

export type CanonicalAnswerProposition = {
  propositionId: string;
  text: string;
  kind: 'document_fact' | 'legal_inference' | 'general_guidance' | 'limitation';
  evidenceIds: string[];
  confidence: 'high' | 'medium' | 'low';
};

export type CanonicalAnswerPlanV2 = {
  schemaVersion: 2;
  planId: string;
  taskId: string;
  questionKind: QuestionKind;
  directAnswer: string;
  answerStatus: 'supported' | 'supported_scoped' | 'needs_clarification' | 'limited';
  propositions: CanonicalAnswerProposition[];
  controllingClauses: Array<{ label: string; sourceIds: string[] }>;
  interactingClauses: Array<{ label: string; sourceIds: string[] }>;
  scopeDisclosure?: string;
  requiredTerms: string[];
  prohibitedClaims: string[];
  allowedNextActions: string[];
  pendingOptions?: PendingOption[];
};

function compactProposition(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, 4_000);
}

function responseDirectAnswer(response: NexxAssistantResponse) {
  return compactProposition(
    response.legalInterpretation?.directAnswer ??
    response.documentAnswer?.answer ??
    response.message
  );
}

export function buildCanonicalAnswerPlanV2(args: {
  executionPlan: TurnExecutionPlan;
  response: NexxAssistantResponse;
  evidenceIds: string[];
  capabilityDecision: CapabilityDecision;
  pendingOptions?: PendingOption[];
  sourceEvidenceMap?: Record<string, string>;
}): CanonicalAnswerPlanV2 {
  const directAnswer = responseDirectAnswer(args.response);
  const legal = args.response.legalInterpretation;
  const evidenceIds = Array.from(new Set(args.evidenceIds));
  const propositions: CanonicalAnswerProposition[] = [];
  if (directAnswer) {
    propositions.push({
      propositionId: 'direct_answer',
      text: directAnswer,
      kind: evidenceIds.length > 0 ? 'document_fact' : 'general_guidance',
      evidenceIds,
      confidence: args.capabilityDecision.supportLevel === 'complete' ? 'high' : args.capabilityDecision.supportLevel === 'scoped' ? 'medium' : 'low',
    });
  }
  for (const [index, clause] of (legal?.controllingClauses ?? []).entries()) {
    const text = compactProposition(clause.quote || clause.label);
    if (!text) continue;
    const clauseEvidenceIds = clause.sourceIds.map((sourceId) =>
      args.sourceEvidenceMap?.[sourceId] ?? sourceId
    );
    propositions.push({
      propositionId: `controlling_${index + 1}`,
      text,
      kind: 'document_fact',
      evidenceIds: clauseEvidenceIds.length > 0 ? clauseEvidenceIds : evidenceIds,
      confidence: 'high',
    });
  }
  for (const [index, limitation] of args.capabilityDecision.userSafeLimitations.entries()) {
    propositions.push({
      propositionId: `limitation_${index + 1}`,
      text: limitation.text,
      kind: 'limitation',
      evidenceIds: [],
      confidence: 'high',
    });
  }
  const answerStatus: CanonicalAnswerPlanV2['answerStatus'] = args.executionPlan.responseAct === 'clarify'
    ? 'needs_clarification'
    : !args.capabilityDecision.allowed
      ? 'limited'
      : args.capabilityDecision.supportLevel === 'complete'
        ? 'supported'
        : 'supported_scoped';
  return {
    schemaVersion: 2,
    planId: args.executionPlan.planId,
    taskId: args.executionPlan.taskId,
    questionKind: args.executionPlan.questionKind,
    directAnswer,
    answerStatus,
    propositions,
    controllingClauses: (legal?.controllingClauses ?? []).map((clause) => ({
      label: clause.label,
      sourceIds: clause.sourceIds.map((sourceId) => args.sourceEvidenceMap?.[sourceId] ?? sourceId),
    })),
    interactingClauses: (legal?.interactingClauses ?? []).map((clause) => ({
      label: clause.label,
      sourceIds: clause.sourceIds.map((sourceId) => args.sourceEvidenceMap?.[sourceId] ?? sourceId),
    })),
    scopeDisclosure: args.capabilityDecision.supportLevel === 'scoped'
      ? args.capabilityDecision.userSafeLimitations.find((item) => item.code === 'full_review_not_ready' || item.code === 'document_coverage_incomplete')?.text
      : undefined,
    requiredTerms: [],
    prohibitedClaims: args.capabilityDecision.prohibitedClaims,
    allowedNextActions: args.capabilityDecision.alternateOperations,
    pendingOptions: args.pendingOptions,
  };
}

export function verifyCanonicalAnswerPlanV2(args: {
  plan: CanonicalAnswerPlanV2;
  authorizedEvidenceIds: string[];
}) {
  const errors: string[] = [];
  const allowed = new Set(args.authorizedEvidenceIds);
  if (!args.plan.planId || !args.plan.taskId) errors.push('canonical_plan_linkage_missing');
  if (!args.plan.directAnswer && !['needs_clarification', 'limited'].includes(args.plan.answerStatus)) errors.push('canonical_direct_answer_missing');
  for (const proposition of args.plan.propositions) {
    if (!proposition.text.trim()) errors.push(`canonical_proposition_empty:${proposition.propositionId}`);
    if (proposition.kind === 'document_fact' && proposition.evidenceIds.length === 0) {
      errors.push(`canonical_document_evidence_missing:${proposition.propositionId}`);
    }
    for (const evidenceId of proposition.evidenceIds) {
      if (!allowed.has(evidenceId)) errors.push(`canonical_evidence_unauthorized:${proposition.propositionId}:${evidenceId}`);
    }
  }
  return { passed: errors.length === 0, errors };
}
