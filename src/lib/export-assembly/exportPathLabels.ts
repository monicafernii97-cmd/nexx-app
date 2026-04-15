/**
 * Export Path Labels — Shared UI label mapping for internal ExportPath values.
 *
 * Internal engine values remain unchanged:
 *   'case_summary' | 'court_document' | 'exhibit_document'
 *
 * These maps provide user-facing labels and descriptions for the UI.
 */

import type { ExportPath } from '@/lib/export-assembly/types/exports';

/** User-facing labels keyed by internal ExportPath. */
export const EXPORT_PATH_LABELS: Record<ExportPath, string> = {
    court_document: 'Court Document',
    case_summary: 'Summary Report',
    exhibit_document: 'Exhibit Packet',
};

/** User-facing descriptions keyed by internal ExportPath. */
export const EXPORT_PATH_DESCRIPTIONS: Record<ExportPath, string> = {
    court_document:
        'Formal, court-structured filing with caption, sections, and signature formatting.',
    case_summary:
        'Clean structured summary of case facts, incidents, findings, and chronology.',
    exhibit_document:
        'Indexed evidence packet with exhibit cover pages, references, and supporting materials.',
};

/** All export paths in display order. */
export const EXPORT_PATHS: ExportPath[] = [
    'court_document',
    'case_summary',
    'exhibit_document',
];
