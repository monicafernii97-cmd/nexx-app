/**
 * Shared list of upcoming features displayed on both the landing page
 * and the subscription management page. Single source of truth to
 * prevent content drift across pages.
 */
export const COMING_SOON_FEATURES = [
    'Voice-first AI conversations',
    'Court order upload & analysis',
    'Affidavit builder',
    'eFiling integration',
    'Attorney collaboration portal',
    'Therapist collaboration portal',
    'eSignature & notarization',
    'Court date countdown & prep coach',
    'Custody exchange logger',
    'Co-parent communication filter',
    'Mock trial prep integration',
] as const;
