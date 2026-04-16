'use client';

import { ReactNode } from 'react';
import { ExportProvider } from './context/ExportContext';

/**
 * DocuVault Layout — wraps all /docuvault routes in ExportProvider.
 *
 * This enables shared export context between:
 *   - /docuvault (main page — Quick Generate + Create Export)
 *   - /docuvault/review (Review Hub)
 *   - /docuvault/gallery (export history)
 *
 * The provider is passive by default:
 *   - no auto-start on mount
 *   - no eager fetches
 *   - no interference with Quick Generate
 */
export default function DocuVaultLayout({ children }: { children: ReactNode }) {
    return <ExportProvider>{children}</ExportProvider>;
}
