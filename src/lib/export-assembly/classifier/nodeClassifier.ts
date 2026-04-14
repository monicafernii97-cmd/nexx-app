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
import { buildCourtSafeText } from '../transform/courtSafeRewriter';
import { buildSummarySafeText } from '../transform/summarySafeRewriter';

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
// Exhibit-Safe Text (unique to node classifier — not in rewriter modules)
// ---------------------------------------------------------------------------

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

    // 8. Transformed text variants — using canonical rewriter modules
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
