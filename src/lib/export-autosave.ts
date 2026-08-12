import type { ItemOverride, SectionOverride } from '@/lib/export-assembly/orchestrator';

export interface ExportCheckpointInput {
    exportPath: string;
    sectionOverrides: SectionOverride[];
    itemOverrides: ItemOverride[];
    exportRequestJson: string;
    assemblyResultJson?: string;
    reviewItemsJson?: string;
}
/** Deterministic non-cryptographic fingerprint used only to suppress duplicate writes. */
export function checkpointFingerprint(input: ExportCheckpointInput) {
    const value = JSON.stringify(input);
    let hash = 2166136261;
    let hash2 = 0x811c9dc5 ^ 0x5bf03635;
    for (let index = 0; index < value.length; index++) {
        const code = value.charCodeAt(index);
        hash ^= code;
        hash = Math.imul(hash, 16777619);
        hash2 = Math.imul(hash2 ^ code, 2246822519);
    }
    return `v1-${(hash >>> 0).toString(16).padStart(8, '0')}${(hash2 >>> 0).toString(16).padStart(8, '0')}-${value.length}`;
}
