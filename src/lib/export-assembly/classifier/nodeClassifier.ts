/**
 * Node Classifier — Aggregates sentence-level classifications into node-level.
 *
 * This is the main entry point for classifying a WorkspaceNode.
 * It orchestrates the full pipeline:
 *
 * 1. Split text into sentences → classify each (sentenceClassifier)
 * 2. Roll up sentence scores to node-level (scoreCalculator)
 * 3. Determine dominant type and confidence (scoreCalculator)
 * 4. Assign issue/pattern tags (issueTagger)
 * 5. Calculate export relevance (relevanceCalculator)
 * 6. Generate transformed text variants (court-safe, summary-safe, exhibit-safe)
 * 7. Suggest destination sections per export path (issueTagger)
 * 8. Populate provenance from source IDs
 */

import type { WorkspaceNode } from '../types/workspace';
import type {
    ClassifiedNode,
    SentenceClassification,
    ExtractedEntities,
} from '../types/classification';
import { emptyEntities } from '../types/classification';
import { classifyText } from './sentenceClassifier';
import { mergeEntities } from './entityExtractor';
import { aggregateContentScores, getDominantType, getConfidence } from '../tagging/scoreCalculator';
import { calculateExportRelevance } from '../tagging/relevanceCalculator';
import { assignIssueTags, assignPatternTags, suggestSections } from '../tagging/issueTagger';

// ---------------------------------------------------------------------------
// Text Cleaning
// ---------------------------------------------------------------------------

/**
 * Clean raw text for classification.
 * Trims whitespace, normalizes line breaks, removes excessive punctuation.
 */
function cleanText(text: string): string {
    return text
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

// ---------------------------------------------------------------------------
// Court-Safe Text Generation
// ---------------------------------------------------------------------------

/**
 * Build court-safe text from classified sentences.
 *
 * Rules:
 * - Include: fact, argument, request, procedure, evidence_reference, timeline_event
 * - Transform: emotion → stripped or impact phrasing
 * - Transform: opinion → stripped entirely
 * - Never let raw emotional text through
 */
function buildCourtSafeText(sentences: SentenceClassification[]): string {
    const courtSafe: string[] = [];

    for (const s of sentences) {
        switch (s.dominantType) {
            case 'fact':
            case 'argument':
            case 'request':
            case 'procedure':
            case 'evidence_reference':
            case 'timeline_event':
            case 'issue':
                courtSafe.push(s.sentence);
                break;

            case 'emotion':
                // Transform emotion to impact phrasing
                courtSafe.push(transformEmotionToImpact(s.sentence));
                break;

            case 'opinion':
                // Strip opinions from court output entirely
                // (unless there's a strong argument signal mixed in)
                if (s.scores.argument > 0.3) {
                    courtSafe.push(transformOpinionToObjective(s.sentence));
                }
                // else: silently excluded
                break;

            case 'risk':
                // Include risks as factual observations
                courtSafe.push(s.sentence);
                break;

            case 'unknown':
                // Include if it has enough fact signal
                if (s.scores.fact > 0.2) {
                    courtSafe.push(s.sentence);
                }
                break;
        }
    }

    return courtSafe.join(' ').trim();
}

/**
 * Build summary-safe text from classified sentences.
 *
 * Lighter transformation — keeps emotional context but compresses it.
 * All types included, emotion is softened.
 */
function buildSummarySafeText(sentences: SentenceClassification[]): string {
    return sentences
        .map(s => {
            if (s.dominantType === 'emotion') {
                return compressEmotion(s.sentence);
            }
            if (s.dominantType === 'opinion' && s.scores.argument < 0.2) {
                return compressOpinion(s.sentence);
            }
            return s.sentence;
        })
        .filter(Boolean)
        .join(' ')
        .trim();
}

/**
 * Build exhibit-summary-safe text from classified sentences.
 *
 * Only fact + evidence-reference + timeline sentences included.
 * Everything else stripped.
 */
function buildExhibitSummarySafeText(sentences: SentenceClassification[]): string {
    return sentences
        .filter(s =>
            s.dominantType === 'fact' ||
            s.dominantType === 'evidence_reference' ||
            s.dominantType === 'timeline_event',
        )
        .map(s => s.sentence)
        .join(' ')
        .trim();
}

// ---------------------------------------------------------------------------
// Basic Transformation Helpers
// ---------------------------------------------------------------------------

/**
 * Transform emotional language to impact phrasing.
 *
 * "I'm overwhelmed" → "This created recurring conflict"
 * "This is exhausting" → "This increased instability"
 * "This is so upsetting" → "This disrupted routine"
 */
function transformEmotionToImpact(sentence: string): string {
    const lower = sentence.toLowerCase();

    // Direct replacements for common emotional patterns
    const replacements: [RegExp, string][] = [
        [/\bi(?:'m| am)\s+(?:so\s+)?overwhelmed\b/gi, 'This created recurring conflict'],
        [/\bthis\s+is\s+(?:so\s+)?exhausting\b/gi, 'This increased instability'],
        [/\bthis\s+is\s+(?:so\s+)?upsetting\b/gi, 'This disrupted routine'],
        [/\bi(?:'m| am)\s+(?:so\s+)?frustrated\b/gi, 'This created ongoing difficulty'],
        [/\bi(?:'m| am)\s+(?:so\s+)?stressed\b/gi, 'This caused recurring disruption'],
        [/\bi\s+feel\s+(?:so\s+)?(?:helpless|hopeless)\b/gi, 'This limited effective co-parenting'],
        [/\bi\s+(?:can't|cannot)\s+(?:take|handle)\s+(?:this|it)\b/gi, 'This created an unsustainable situation'],
    ];

    let result = sentence;
    for (const [pattern, replacement] of replacements) {
        if (pattern.test(lower)) {
            result = sentence.replace(pattern, replacement);
            return result;
        }
    }

    // Fallback: if we can't specifically transform, strip the emotion
    // and keep any factual content in the sentence
    if (/\bi\s+feel\b/i.test(sentence)) {
        return ''; // pure feeling statement → strip
    }

    return sentence;
}

/**
 * Transform opinion language to objective phrasing.
 *
 * "He was controlling" → "Respondent insisted on requirements not expressly stated in the order"
 * "She was ridiculous" → "The position taken was inconsistent with the parties' prior practice"
 */
function transformOpinionToObjective(sentence: string): string {
    const replacements: [RegExp, string][] = [
        [/\b(?:he|she)\s+(?:is|was)\s+(?:so\s+)?controlling\b/gi,
            'The party insisted on requirements not expressly stated in the order'],
        [/\b(?:he|she)\s+(?:is|was)\s+(?:so\s+)?ridiculous\b/gi,
            'The position taken was inconsistent with the parties\' prior practice'],
        [/\b(?:he|she)\s+(?:is|was)\s+(?:so\s+)?manipulat(?:ive|ing)\b/gi,
            'The repeated demands had the effect of increasing conflict'],
        [/\b(?:he|she)\s+did\s+this\s+to\s+(?:manipulate|control|hurt|punish)\b/gi,
            'The repeated actions had the effect of increasing conflict and requiring repeated responses'],
        [/\b(?:he|she)\s+(?:is|was)\s+(?:a\s+)?(?:narcissist|abusive|toxic)\b/gi,
            'The conduct described was inconsistent with cooperative co-parenting'],
    ];

    for (const [pattern, replacement] of replacements) {
        if (pattern.test(sentence)) {
            return sentence.replace(pattern, replacement);
        }
    }

    return sentence;
}

/**
 * Compress emotional language for summary use.
 * Keeps context but softens intensity.
 */
function compressEmotion(sentence: string): string {
    return sentence
        .replace(/\b(?:so|very|extremely|incredibly|absolutely)\s+/gi, '')
        .replace(/[!]{2,}/g, '.')
        .replace(/\bI\s+feel\b/gi, 'There was')
        .trim();
}

/**
 * Compress opinion language for summary use.
 */
function compressOpinion(sentence: string): string {
    // Remove the harshest character judgments
    return sentence
        .replace(/\b(?:selfish|narcissist(?:ic)?|toxic|crazy|psycho|disgusting|pathetic)\b/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

// ---------------------------------------------------------------------------
// Entity Rollup
// ---------------------------------------------------------------------------

/**
 * Merge all sentence-level entities into a single node-level set.
 */
function rollUpEntities(sentences: SentenceClassification[]): ExtractedEntities {
    let merged = emptyEntities();
    for (const s of sentences) {
        merged = mergeEntities(merged, s.extractedEntities);
    }
    return merged;
}

// ---------------------------------------------------------------------------
// Main Classification Function
// ---------------------------------------------------------------------------

/**
 * Classify a single workspace node.
 *
 * Full pipeline:
 * 1. Clean text
 * 2. Split into sentences → classify each
 * 3. Aggregate sentence scores → node-level
 * 4. Determine dominant type + confidence
 * 5. Assign issue + pattern tags
 * 6. Calculate export relevance
 * 7. Generate transformed text variants
 * 8. Suggest destination sections
 * 9. Populate provenance
 */
export function classifyNode(node: WorkspaceNode): ClassifiedNode {
    const cleanedText = cleanText(node.text);

    // 1. Sentence-level classification
    const sentenceClassifications = classifyText(
        cleanedText,
        node.type,
        node.userTags,
    );

    // 2. Aggregate scores
    const scores = aggregateContentScores(sentenceClassifications);

    // 3. Dominant type + confidence
    const dominantType = getDominantType(scores);
    const confidence = getConfidence(scores);

    // 4. Entity rollup
    const extractedEntities = rollUpEntities(sentenceClassifications);

    // 5. Export relevance
    const exportRelevance = calculateExportRelevance(scores);

    // Build a partial ClassifiedNode for tag assignment
    const partialNode = {
        nodeId: node.id,
        nodeType: node.type,
        rawText: node.text,
        cleanedText,
        sentenceClassifications,
        scores,
        dominantType,
        confidence,
        tags: [],
        issueTags: [],
        patternTags: [],
        extractedEntities,
        exportRelevance,
        suggestedSections: { case_summary: [], court_document: [], exhibit_document: [] },
        transformedText: {},
        provenance: {
            sourceDocumentId: node.sourceDocumentId,
            sourceMessageId: node.sourceMessageId,
            sourceConversationId: node.sourceConversationId,
            linkedEvidenceIds: node.linkedEvidenceIds ?? [],
            linkedTimelineIds: node.linkedTimelineIds ?? [],
            originatingNodeId: node.id,
        },
    } as ClassifiedNode;

    // 6. Issue + pattern tags
    const issueTags = assignIssueTags(partialNode);
    const patternTags = assignPatternTags(partialNode);

    // 7. Section suggestions
    const hasLinkedEvidence = (node.linkedEvidenceIds?.length ?? 0) > 0;
    const suggestedSections = suggestSections(scores, hasLinkedEvidence);

    // 8. Transformed text variants
    const transformedText = {
        summarySafe: buildSummarySafeText(sentenceClassifications) || undefined,
        courtSafe: buildCourtSafeText(sentenceClassifications) || undefined,
        exhibitSummarySafe: buildExhibitSummarySafeText(sentenceClassifications) || undefined,
    };

    // 9. General tags from entities
    const tags: string[] = [];
    if (extractedEntities.courts.length > 0) tags.push('has_court_reference');
    if (extractedEntities.exhibits.length > 0) tags.push('has_exhibit_reference');
    if (extractedEntities.statutesOrRules.length > 0) tags.push('has_legal_citation');
    if (extractedEntities.dates.length > 0) tags.push('has_date');
    if (extractedEntities.people.length > 0) tags.push('has_named_person');
    if (node.pinned) tags.push('pinned');
    if (node.metadata?.confidential) tags.push('confidential');

    return {
        nodeId: node.id,
        nodeType: node.type,
        rawText: node.text,
        cleanedText,
        sentenceClassifications,
        scores,
        dominantType,
        confidence,
        tags,
        issueTags,
        patternTags,
        extractedEntities,
        exportRelevance,
        suggestedSections,
        transformedText,
        provenance: {
            sourceDocumentId: node.sourceDocumentId,
            sourceMessageId: node.sourceMessageId,
            sourceConversationId: node.sourceConversationId,
            linkedEvidenceIds: node.linkedEvidenceIds ?? [],
            linkedTimelineIds: node.linkedTimelineIds ?? [],
            originatingNodeId: node.id,
        },
    };
}

/**
 * Classify multiple workspace nodes.
 */
export function classifyNodes(nodes: WorkspaceNode[]): ClassifiedNode[] {
    return nodes.map(classifyNode);
}
