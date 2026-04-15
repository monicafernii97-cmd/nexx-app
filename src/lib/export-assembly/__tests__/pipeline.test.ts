/**
 * E2E Pipeline Test — Full export assembly pipeline test.
 *
 * Tests the deterministic pipeline: WorkspaceNode[] → classify → map → review → validate.
 * Does NOT call GPT — only tests the keyword-based classification and mapping.
 */

import { describe, it, expect } from 'vitest';
import { runAssembly } from '@/lib/export-assembly/orchestrator';
import type { ExportRequest } from '@/lib/export-assembly/types/exports';
import type { WorkspaceNode } from '@/lib/export-assembly/types/workspace';
import type { PipelineStatus } from '@/lib/export-assembly/orchestrator';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Minimal workspace nodes covering multiple content types. */
const FIXTURE_NODES: WorkspaceNode[] = [
    {
        id: 'node-fact-1',
        type: 'key_fact',
        title: 'Custody Facts',
        text: 'On January 15, 2025, the respondent failed to pick up the children from school at the agreed time of 3:30 PM.',
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        id: 'node-emotion-1',
        type: 'case_note',
        title: 'Personal Feelings',
        text: 'I am devastated and terrified that my children are not safe. I feel completely helpless and angry about the situation.',
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        id: 'node-evidence-1',
        type: 'evidence_item',
        title: 'Text Messages',
        text: 'See attached text messages from January 15-17, 2025 documenting the respondent\'s failure to communicate regarding the children\'s schedule.',
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        id: 'node-request-1',
        type: 'strategy_point',
        title: 'Relief Sought',
        text: 'The Court should grant petitioner sole managing conservatorship and order respondent to pay child support.',
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
];

const FIXTURE_REQUEST: ExportRequest = {
    path: 'court_document',
    structureSource: 'court_prompt_profile',
    selectedNodeIds: ['node-fact-1', 'node-emotion-1', 'node-evidence-1', 'node-request-1'],
    selectedEvidenceIds: [],
    selectedTimelineIds: [],
    config: {
        documentType: 'motion',
        jurisdictionId: 'TX-FortBend',
        partyRole: 'petitioner',
        tone: 'neutral',
        includeCaption: true,
        includeLegalStandard: true,
        includePrayer: true,
        includeCertificateOfService: true,
        includeProposedOrder: false,
        outputFormat: 'pdf',
    },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Export Assembly Pipeline', () => {
    it('runs assembly and produces review items', () => {
        const phases: PipelineStatus[] = [];

        const result = runAssembly(
            FIXTURE_REQUEST,
            FIXTURE_NODES,
            [], // No timeline events
            (status) => phases.push(status),
        );

        // Assembly should return structured output
        expect(result).toBeDefined();
        expect(result.assembly).toBeDefined();
        expect(result.reviewItems).toBeDefined();
        expect(result.meta).toBeDefined();

        // Should have review items (one per input node)
        expect(result.reviewItems.length).toBe(FIXTURE_NODES.length);

        // Each review item should have required fields
        for (const item of result.reviewItems) {
            expect(item.nodeId).toBeDefined();
            expect(item.originalText).toBeDefined();
            expect(item.dominantType).toBeDefined();
            expect(item.confidence).toBeGreaterThanOrEqual(0);
            expect(item.confidence).toBeLessThanOrEqual(1);
            expect(item.suggestedSections).toBeInstanceOf(Array);
            expect(typeof item.includedInExport).toBe('boolean');
        }

        // Pipeline should have emitted progress events
        expect(phases.length).toBeGreaterThanOrEqual(1);
    });

    it('classifies emotional content correctly', () => {
        const result = runAssembly(
            FIXTURE_REQUEST,
            FIXTURE_NODES,
            [],
        );

        // The emotion-heavy node should be classified
        const emotionItem = result.reviewItems.find(i => i.nodeId === 'node-emotion-1');
        expect(emotionItem).toBeDefined();
        // It should be classified as emotion or have emotion-adjacent type
        expect(['emotion', 'opinion', 'fact']).toContain(emotionItem!.dominantType);
    });

    it('includes evidence reference nodes', () => {
        const result = runAssembly(
            FIXTURE_REQUEST,
            FIXTURE_NODES,
            [],
        );

        const evidenceItem = result.reviewItems.find(i => i.nodeId === 'node-evidence-1');
        // Evidence items are present in review items for user review,
        // but may default to excluded from direct text export (they're referenced via exhibit labels)
        expect(evidenceItem).toBeDefined();
    });

    it('assigns suggested sections to review items', () => {
        const result = runAssembly(
            FIXTURE_REQUEST,
            FIXTURE_NODES,
            [],
        );

        // At least some items should have suggested sections
        const itemsWithSections = result.reviewItems.filter(
            i => i.suggestedSections.length > 0,
        );
        expect(itemsWithSections.length).toBeGreaterThanOrEqual(1);
    });

    it('produces assembly metadata', () => {
        const result = runAssembly(
            FIXTURE_REQUEST,
            FIXTURE_NODES,
            [],
        );

        expect(result.meta).toBeDefined();
        expect(result.meta.totalNodes).toBe(FIXTURE_NODES.length);
    });

    it('handles empty workspace gracefully', () => {
        const result = runAssembly(
            FIXTURE_REQUEST,
            [], // No nodes
            [], // No events
        );

        expect(result).toBeDefined();
        expect(result.reviewItems).toHaveLength(0);
        expect(result.meta.totalNodes).toBe(0);
    });
});
