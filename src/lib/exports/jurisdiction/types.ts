/**
 * Export Jurisdiction Profile Types
 *
 * ExportJurisdictionProfile is now a narrowed type from the shared
 * JurisdictionProfile. It guarantees court, exhibit, and summary
 * blocks are present — required by all export renderers.
 */

// Re-export the narrowed type from shared jurisdiction
export type { ExportJurisdictionProfile } from '@/lib/jurisdiction/types';

// Also re-export the base for resolver usage
export type { JurisdictionProfile } from '@/lib/jurisdiction/types';
