import { describe, expect, it } from 'vitest';
import { checkpointFingerprint } from '../export-autosave';

const base = {
    exportPath: 'court_document',
    sectionOverrides: [{ sectionId: 'facts', isLocked: true }],
    itemOverrides: [],
    exportRequestJson: '{"path":"court_document"}',
    assemblyResultJson: '{"reviewItems":[]}',
    clearAssemblyResult: false,
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

    it('changes for a same-length edit', () => {
        const before = { ...base, itemOverrides: [{ nodeId: 'n1', editedText: 'abcd' }] };
        const after = { ...base, itemOverrides: [{ nodeId: 'n1', editedText: 'abce' }] };
        expect(checkpointFingerprint(before)).not.toBe(checkpointFingerprint(after));
    });

    it('changes when a section lock changes', () => {
        expect(checkpointFingerprint(base)).not.toBe(checkpointFingerprint({
            ...base,
            sectionOverrides: [{ sectionId: 'facts', isLocked: false }],
        }));
    });

    it('changes when the export path changes', () => {
        expect(checkpointFingerprint(base)).not.toBe(checkpointFingerprint({
            ...base,
            exportPath: 'case_summary',
        }));
    });

    it('treats an absent optional field and explicit undefined as identical', () => {
        const { assemblyResultJson, ...withoutAssembly } = base;
        void assemblyResultJson;
        expect(checkpointFingerprint({ ...withoutAssembly, assemblyResultJson: undefined }))
            .toBe(checkpointFingerprint(withoutAssembly));
    });

    it('fingerprints assembly removal and restoration without reviving cleared data', () => {
        const cleared = {
            ...base,
            assemblyResultJson: undefined,
            clearAssemblyResult: true,
        };
        const restored = {
            ...cleared,
            assemblyResultJson: base.assemblyResultJson,
            clearAssemblyResult: false,
        };

        expect(cleared.clearAssemblyResult).toBe(true);
        expect(checkpointFingerprint(cleared)).not.toBe(checkpointFingerprint(base));
        expect(checkpointFingerprint(restored)).toBe(checkpointFingerprint(base));
    });
});
