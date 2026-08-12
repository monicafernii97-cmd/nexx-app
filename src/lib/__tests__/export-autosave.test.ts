import { describe, expect, it } from 'vitest';
import { checkpointFingerprint } from '../export-autosave';

const base = {
    exportPath: 'court_document',
    sectionOverrides: [{ sectionId: 'facts', isLocked: true }],
    itemOverrides: [],
    exportRequestJson: '{"path":"court_document"}',
    assemblyResultJson: '{"reviewItems":[]}',
    reviewItemsJson: '[]',
};

describe('checkpointFingerprint', () => {
    it('is stable for an unchanged checkpoint', () => {
        expect(checkpointFingerprint(base)).toBe(checkpointFingerprint({ ...base }));
    });

    it('changes when a user edit changes', () => {
        expect(checkpointFingerprint(base)).not.toBe(checkpointFingerprint({
            ...base,
            itemOverrides: [{ nodeId: 'n1', editedText: 'updated' }],
        }));
    });
});
