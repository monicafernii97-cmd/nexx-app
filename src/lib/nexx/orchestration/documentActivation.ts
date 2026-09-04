import type { DocumentReferenceDetection } from '../documentReferenceDetection';
import type { PendingAct, SpeechAct } from './types';

export type DocumentActivationSource =
  | 'none'
  | 'current_attachment'
  | 'explicit_reference'
  | 'pending_action'
  | 'correction';

export type DocumentActivationDecision = {
  active: boolean;
  preserveFocus: boolean;
  source: DocumentActivationSource;
  referenceStrength: 'none' | 'weak' | 'explicit' | 'carried';
  useCurrentAttachmentsOnly: boolean;
  reasonCodes: string[];
};

const FUTURE_UPLOAD_PATTERNS = [
  /\b(?:i(?:\s+will|['’]ll|\s+am\s+going\s+to|\s+plan\s+to|\s+intend\s+to)|we(?:\s+will|['’]ll|\s+are\s+going\s+to|\s+plan\s+to|\s+intend\s+to))\s+(?:re[-\s]?)?(?:upload|attach|send|provide)\b/i,
  /\b(?:let\s+me|i\s+need\s+to|i\s+want\s+to)\s+(?:re[-\s]?)?(?:upload|attach|send|provide)\b/i,
  /\b(?:wait|hold\s+on|one\s+moment)\b.{0,80}\b(?:upload|attach|send|provide)\b/i,
];

/** True only when the current turn promises a future upload instead of supplying one now. */
export function isAwaitingUploadTurn(message: string) {
  const normalized = message.normalize('NFKC').replace(/\s+/g, ' ').trim();
  return normalized.length > 0 && FUTURE_UPLOAD_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * Decide whether document evidence may participate in the current response.
 * Remembered documents remain available in conversation state even when this
 * returns inactive; memory is not implicit authorization to retrieve them.
 */
export function decideDocumentActivation(args: {
  message: string;
  speechAct: SpeechAct;
  requestedOperation?: string;
  detection: Pick<DocumentReferenceDetection, 'referencesDocument' | 'confidence'>;
  pendingAct?: PendingAct;
  hasCurrentAttachments: boolean;
  hasActiveDocumentContext: boolean;
  hasPendingDocumentAction: boolean;
}): DocumentActivationDecision {
  if (isAwaitingUploadTurn(args.message) || args.requestedOperation === 'await_upload') {
    return {
      active: false,
      preserveFocus: true,
      source: 'none',
      referenceStrength: 'none',
      useCurrentAttachmentsOnly: false,
      reasonCodes: ['awaiting_future_upload', 'historical_document_activation_suppressed'],
    };
  }

  if (args.hasCurrentAttachments) {
    return {
      active: true,
      preserveFocus: true,
      source: 'current_attachment',
      referenceStrength: 'explicit',
      useCurrentAttachmentsOnly: true,
      reasonCodes: ['current_turn_attachment', 'current_attachments_only'],
    };
  }

  if (args.speechAct === 'social') {
    return {
      active: false,
      preserveFocus: true,
      source: 'none',
      referenceStrength: 'none',
      useCurrentAttachmentsOnly: false,
      reasonCodes: ['social_turn', 'document_focus_retained_silently'],
    };
  }

  if (args.speechAct === 'cancel' || args.speechAct === 'switch_topic' || args.speechAct === 'unknown') {
    return {
      active: false,
      preserveFocus: args.speechAct !== 'switch_topic',
      source: 'none',
      referenceStrength: 'none',
      useCurrentAttachmentsOnly: false,
      reasonCodes: [`speech_act_${args.speechAct}`, 'document_activation_abstained'],
    };
  }

  if (args.detection.referencesDocument) {
    return {
      active: true,
      preserveFocus: true,
      source: args.hasCurrentAttachments ? 'current_attachment' : 'explicit_reference',
      referenceStrength: args.detection.confidence === 'high' ? 'explicit' : 'weak',
      useCurrentAttachmentsOnly: args.hasCurrentAttachments,
      reasonCodes: [
        args.hasCurrentAttachments ? 'current_attachment_reference' : 'meaningful_document_reference',
      ],
    };
  }

  const carriesPendingAction = args.hasActiveDocumentContext && args.hasPendingDocumentAction &&
    ['select', 'confirm', 'continue'].includes(args.speechAct);
  if (carriesPendingAction) {
    return {
      active: true,
      preserveFocus: true,
      source: 'pending_action',
      referenceStrength: 'carried',
      useCurrentAttachmentsOnly: false,
      reasonCodes: ['valid_pending_document_action'],
    };
  }

  if (args.hasActiveDocumentContext && ['correct', 'challenge', 'reassess'].includes(args.speechAct)) {
    return {
      active: true,
      preserveFocus: true,
      source: 'correction',
      referenceStrength: 'carried',
      useCurrentAttachmentsOnly: false,
      reasonCodes: ['document_answer_reassessment'],
    };
  }

  return {
    active: false,
    preserveFocus: true,
    source: 'none',
    referenceStrength: 'none',
    useCurrentAttachmentsOnly: false,
    reasonCodes: ['no_meaningful_document_reference', 'document_activation_abstained'],
  };
}
