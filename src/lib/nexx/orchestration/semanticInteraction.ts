import type {
  ConversationControlSnapshot,
  InteractionIntent,
  InteractionResolution,
  PendingOption,
  RecommendationReceipt,
} from './types';
import { isAwaitingUploadTurn } from './documentActivation';

const ACCEPT = /^(?:yes|yeah|yep|yup|ok(?:ay)?|sure|alright|right|sounds? good|that sounds? good|that works|please|please do(?: so| that)?|do (?:it|that)|go ahead|go with (?:it|that)|let'?s do (?:it|that)|proceed|use that|choose that)(?:\s+(?:please|now|then|for me))?[.! ]*$/i;
const ACCEPT_RECOMMENDATION = /\b(?:use|follow|take|accept|choose|go with)\s+(?:your|the)\s+(?:recommendation|recommended|suggestion|suggested|choice|option)\b|^(?:what|whichever|the one)\s+you\s+(?:recommend|recommended|suggest|suggested|think(?: is)? best)[.! ]*$/i;
const REJECT = /^(?:no|nope|not that|not that one|the other one|don'?t do that|do not do that|skip that|something else)(?:[.! ]*)$/i;
const CANCEL = /^(?:stop|cancel|never\s*mind|nevermind|forget it|don'?t|do not)[.! ]*$/i;
const DEFER = /\b(?:later|not yet|hold off|wait for now|i(?:'|’)ll decide|let me decide)\b/i;
const OPTION_QUESTION = /^(?:which|which one|which is (?:better|best)|what(?:'s| is) the difference|why (?:that|this) one|what do you recommend|which do you recommend)[?!. ]*$/i;
const MODIFIER = /\b(?:but|only|except|instead|focus on|start with|after i|after we)\b/i;
const NEGATION = /\b(?:not|don'?t|do not|except|instead of|other|else)\b/i;
const SOCIAL = /^(?:hi|hello|hey|thanks|thank you|got it|k|lol|👍|👌|🙏)[!. ]*$/iu;
const OPAQUE_TERM = /^[A-Z][A-Z0-9._-]{1,20}[?!.]?$/;
const QUOTED_OR_REPORTED = /\b(?:you said|you told me|earlier you|previously|yesterday|last time)\b/i;
const ORDINALS: Record<string, number> = {
  first: 0, '1': 0, '1st': 0, one: 0,
  second: 1, '2': 1, '2nd': 1, two: 1,
  third: 2, '3': 2, '3rd': 2, three: 2,
  last: -1,
};

function normalize(value: string) {
  return value.normalize('NFKC')
    .toLowerCase()
    .replace(/[“”‘’]/g, "'")
    .replace(/[^\p{L}\p{N}'._-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const SEMANTIC_ACTION_WORDS = new Set(['do', 'proceed', 'continue', 'follow', 'take', 'use', 'choose', 'select', 'accept', 'approve']);
const SEMANTIC_ASSENT_WORDS = new Set(['yes', 'yeah', 'okay', 'sure', 'fine', 'good', 'happy', 'agree']);
const SEMANTIC_REFERENCE_WORDS = new Set(['it', 'that', 'this', 'one', 'route', 'option', 'choice', 'recommendation', 'suggestion', 'advice', 'judgment', 'lead']);
const SEMANTIC_USER_WORDS = new Set(['your', 'you', 'recommended', 'suggested', 'favor', 'best', 'prefer']);
const COMMON_TOKEN_NORMALIZATION: Record<string, string> = {
  yea: 'yeah',
  yep: 'yes',
  yup: 'yes',
  ok: 'okay',
  taht: 'that',
  tht: 'that',
  pls: 'please',
  plz: 'please',
  recomendation: 'recommendation',
  recommedation: 'recommendation',
  procede: 'proceed',
};

function canonicalTokens(value: string) {
  return normalize(value).split(' ').filter(Boolean).map((token) => COMMON_TOKEN_NORMALIZATION[token] ?? token);
}

/**
 * Meaning-level acceptance signal for short conversational replies. This is
 * deliberately constrained by current executable state and negative guards;
 * it is not a command detector operating on free-standing text.
 */
function semanticAcceptance(message: string) {
  if (message.includes('?') || NEGATION.test(message) || REJECT.test(message) || CANCEL.test(message) || DEFER.test(message)) {
    return false;
  }
  const tokens = canonicalTokens(message);
  if (tokens.length === 0 || tokens.length > 14) return false;
  const hasAction = tokens.some((token) => SEMANTIC_ACTION_WORDS.has(token));
  const hasAssent = tokens.some((token) => SEMANTIC_ASSENT_WORDS.has(token));
  const hasReference = tokens.some((token) => SEMANTIC_REFERENCE_WORDS.has(token));
  const hasUserReference = tokens.some((token) => SEMANTIC_USER_WORDS.has(token));
  const politeAction = tokens.includes('please') && hasAction;
  return (hasAction && (hasReference || hasUserReference)) ||
    (hasAssent && hasReference) ||
    (hasAction && hasAssent) ||
    (politeAction && tokens.length <= 6);
}

function fingerprint(value: unknown) {
  const serialized = JSON.stringify(value);
  let hash = 2166136261;
  for (const character of serialized) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function liveOptions(control: ConversationControlSnapshot | undefined, now: number) {
  if (!control) return [];
  return control.pendingOptions.filter((option) =>
    option.cancelledAt === undefined &&
    option.consumedAt === undefined &&
    option.expiresAfterFocusRevision >= control.focusRevision &&
    (option.expiresAt === undefined || option.expiresAt > now)
  );
}

function liveRecommendation(
  control: ConversationControlSnapshot | undefined,
  options: PendingOption[],
  now: number,
): RecommendationReceipt | undefined {
  const recommendation = control?.activeRecommendation;
  if (!recommendation) return undefined;
  if (recommendation.focusRevision !== control?.focusRevision) return undefined;
  if (recommendation.expiresAt !== undefined && recommendation.expiresAt <= now) return undefined;
  if (!options.some((option) => option.optionId === recommendation.recommendedOptionId)) return undefined;
  return recommendation;
}

function explicitOption(message: string, options: PendingOption[]) {
  const normalized = normalize(message);
  const ordinal = normalized.match(/\b(first|1|1st|one|second|2|2nd|two|third|3|3rd|three|last)(?:\s+one|\s+option|\s+choice)?\b/);
  if (ordinal) {
    const index = ORDINALS[ordinal[1]];
    const option = index === -1 ? options.at(-1) : options[index];
    return option ? { option, source: 'ordinal' as const } : undefined;
  }
  const matches = options.filter((option) => [option.label, ...option.aliases]
    .map(normalize)
    .filter((alias) => alias.length >= 3)
    .some((alias) => normalized === alias || normalized.includes(alias)));
  return matches.length === 1 ? { option: matches[0], source: 'alias' as const } : undefined;
}

function result(args: {
  message: string;
  control?: ConversationControlSnapshot;
  intent: InteractionIntent;
  decision: InteractionResolution['decision'];
  options: PendingOption[];
  selected?: PendingOption;
  recommendation?: RecommendationReceipt;
  confidence: number;
  reasonCodes: string[];
}): InteractionResolution {
  const candidateOptionIds = args.options.map((option) => option.optionId);
  return {
    resolutionId: `ires_${fingerprint({
      message: normalize(args.message),
      focusRevision: args.control?.focusRevision,
      intent: args.intent,
      decision: args.decision,
      candidateOptionIds,
      selectedOptionId: args.selected?.optionId,
    })}`,
    decision: args.decision,
    intent: args.intent,
    candidateOptionIds,
    selectedOptionId: args.selected?.optionId,
    recommendationId: args.recommendation?.recommendationId,
    taskId: args.selected?.targetTaskId,
    operation: args.selected?.operation,
    documentIds: args.selected?.documentIds ?? [],
    evidenceGenerationIds: args.selected?.evidenceGenerationIds ?? [],
    confidence: args.confidence,
    reasonCodes: args.reasonCodes,
  };
}

/**
 * Resolve the newest utterance against current executable interaction state.
 * Lexical matches are signals only: the result can execute only an existing
 * option, and downstream authorization still rechecks every bound resource.
 */
export function resolveSemanticInteraction(args: {
  message: string;
  controlState?: ConversationControlSnapshot;
  now?: number;
}): InteractionResolution | undefined {
  const now = args.now ?? Date.now();
  const options = liveOptions(args.controlState, now);
  const recommendation = liveRecommendation(args.controlState, options, now);
  const rawOptions = args.controlState?.pendingOptions ?? [];
  if (options.length === 0 && !args.controlState?.lastAssistantOffer) {
    if (rawOptions.length > 0 && (ACCEPT.test(args.message) || ACCEPT_RECOMMENDATION.test(args.message))) {
      return result({ message: args.message, control: args.controlState, intent: 'uncertain', decision: 'clarify', options: rawOptions, confidence: 0.4, reasonCodes: ['stale_pending_interaction'] });
    }
    return undefined;
  }

  const message = args.message.trim();
  const normalized = normalize(message);
  if (SOCIAL.test(message) || OPAQUE_TERM.test(message)) return undefined;
  if (QUOTED_OR_REPORTED.test(message) && !ACCEPT.test(message)) return undefined;
  if (isAwaitingUploadTurn(message)) {
    return result({ message, control: args.controlState, intent: 'defer_action', decision: 'defer', options, confidence: 1, reasonCodes: ['awaiting_future_upload'] });
  }
  if (CANCEL.test(message)) {
    return result({ message, control: args.controlState, intent: 'cancel_action', decision: 'cancel', options, confidence: 1, reasonCodes: ['explicit_cancel'] });
  }
  if (DEFER.test(message)) {
    return result({ message, control: args.controlState, intent: 'defer_action', decision: 'defer', options, confidence: 0.96, reasonCodes: ['explicit_defer'] });
  }
  if (OPTION_QUESTION.test(message)) {
    return result({ message, control: args.controlState, intent: 'ask_about_options', decision: 'clarify', options, recommendation, confidence: 0.98, reasonCodes: ['option_question'] });
  }

  const selectedMatch = explicitOption(message, options);
  const selected = selectedMatch?.option;
  if (selected && NEGATION.test(message)) {
    return result({ message, control: args.controlState, intent: selected.optionId === recommendation?.recommendedOptionId ? 'reject_recommendation' : 'reject_option', decision: 'rejected', options, selected, recommendation, confidence: 0.94, reasonCodes: ['explicit_option_negation'] });
  }
  if (ACCEPT_RECOMMENDATION.test(message) && recommendation && selectedMatch?.source !== 'alias') {
    const recommended = options.find((option) => option.optionId === recommendation.recommendedOptionId);
    if (recommended) {
      return result({ message, control: args.controlState, intent: MODIFIER.test(message) ? 'modify_option' : 'accept_recommendation', decision: 'execute', options, selected: recommended, recommendation, confidence: 0.99, reasonCodes: ['explicit_recommendation_acceptance'] });
    }
  }
  if (selected) {
    const intent = selected.action === 'confirm_action'
      ? 'accept_offer'
      : MODIFIER.test(message)
        ? 'modify_option'
        : 'select_option';
    return result({ message, control: args.controlState, intent, decision: 'execute', options, selected, recommendation, confidence: 0.96, reasonCodes: ['explicit_option_reference'] });
  }
  if (REJECT.test(message)) {
    return result({ message, control: args.controlState, intent: recommendation ? 'reject_recommendation' : 'reject_option', decision: 'rejected', options, recommendation, confidence: 0.9, reasonCodes: ['generic_rejection'] });
  }

  const meaningLevelAcceptance = semanticAcceptance(message);
  const genericAcceptance = ACCEPT.test(message) || ACCEPT_RECOMMENDATION.test(message) || meaningLevelAcceptance;
  if (genericAcceptance && recommendation) {
    const recommended = options.find((option) => option.optionId === recommendation.recommendedOptionId);
    if (recommended) {
      return result({
        message,
        control: args.controlState,
        intent: MODIFIER.test(message) ? 'modify_option' : 'accept_recommendation',
        decision: 'execute',
        options,
        selected: recommended,
        recommendation,
        confidence: ACCEPT_RECOMMENDATION.test(message) ? 0.99 : meaningLevelAcceptance ? 0.9 : 0.94,
        reasonCodes: [ACCEPT_RECOMMENDATION.test(message)
          ? 'explicit_recommendation_acceptance'
          : meaningLevelAcceptance
            ? 'semantic_acceptance_unique_recommendation'
            : 'generic_acceptance_unique_recommendation'],
      });
    }
  }
  if (genericAcceptance && options.length === 1) {
    return result({ message, control: args.controlState, intent: 'accept_offer', decision: 'execute', options, selected: options[0], confidence: 0.94, reasonCodes: ['generic_acceptance_single_option'] });
  }
  if (genericAcceptance && options.length > 1) {
    return result({ message, control: args.controlState, intent: 'uncertain', decision: 'clarify', options, confidence: 0.55, reasonCodes: ['generic_acceptance_multiple_options_without_recommendation'] });
  }

  if (args.controlState?.pendingAct === 'select' && normalized.split(' ').length <= 5) {
    return result({ message, control: args.controlState, intent: 'uncertain', decision: 'clarify', options, recommendation, confidence: 0.45, reasonCodes: ['unresolved_pending_interaction'] });
  }
  return undefined;
}

export function recommendationForOption(args: {
  option: PendingOption;
  options: PendingOption[];
  focusRevision: number;
  sourceTurnId?: string;
  sourceMessageId?: string;
  now?: number;
  basisCodes?: string[];
}): RecommendationReceipt {
  const now = args.now ?? Date.now();
  const interactionId = args.option.interactionId ?? `interaction_${fingerprint(args.options.map((option) => option.optionId))}`;
  return {
    schemaVersion: 1,
    recommendationId: `rec_${fingerprint({ interactionId, optionId: args.option.optionId, focusRevision: args.focusRevision })}`,
    interactionId,
    recommendedOptionId: args.option.optionId,
    alternativeOptionIds: args.options.filter((option) => option.optionId !== args.option.optionId).map((option) => option.optionId),
    targetTaskId: args.option.targetTaskId,
    sourceTurnId: args.sourceTurnId,
    sourceMessageId: args.sourceMessageId,
    focusRevision: args.focusRevision,
    basisCodes: args.basisCodes ?? ['assistant_explicit_recommendation'],
    capabilitySnapshotHash: args.option.capabilitySnapshotHash,
    authorizationScopeHash: args.option.authorizationScopeHash,
    createdAt: now,
    expiresAt: args.option.expiresAt,
  };
}
