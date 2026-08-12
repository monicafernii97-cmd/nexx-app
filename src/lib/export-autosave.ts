export interface ExportCheckpointInput {
    exportPath: string;
    sectionOverrides: unknown[];
    itemOverrides: unknown[];
    exportRequestJson: string;
    assemblyResultJson?: string;
    reviewItemsJson?: string;
}
/** Deterministic non-cryptographic fingerprint used only to suppress duplicate writes. */
export function checkpointFingerprint(input: ExportCheckpointInput) {
    const value = JSON.stringify(input);
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `v1-${(hash >>> 0).toString(16).padStart(8, '0')}-${value.length}`;
}
