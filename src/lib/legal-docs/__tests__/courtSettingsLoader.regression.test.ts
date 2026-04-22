/**
 * Court Settings Loader Regression Tests
 *
 * Verifies the merge precedence of `loadCourtSettingsForPipeline()`:
 *   1. documentOverride (highest priority)
 *   2. Convex saved settings (case-level → user-level)
 *   3. payloadFallback
 *   4. Empty fallback → resolver uses default profile
 *
 * Prevents: settings precedence drift, Convex unavailability
 * silently breaking the pipeline, document overrides being ignored.
 */

import { describe, it, expect } from 'vitest';
import { loadCourtSettingsForPipeline } from '../jurisdiction/loadCourtSettings';

describe('loadCourtSettingsForPipeline — merge precedence', () => {
  it('returns Convex settings when available', async () => {
    const result = await loadCourtSettingsForPipeline({
      convexQuery: async () => ({
        state: 'Texas',
        county: 'Fort Bend',
        courtName: '387th District Court',
      }),
    });

    expect(result.jurisdiction?.state).toBe('Texas');
    expect(result.jurisdiction?.county).toBe('Fort Bend');
    expect(result.jurisdiction?.courtName).toBe('387th District Court');
  });

  it('falls back to payload when Convex returns null', async () => {
    const result = await loadCourtSettingsForPipeline({
      convexQuery: async () => null,
      payloadFallback: {
        state: 'Florida',
        county: 'Miami-Dade',
      },
    });

    expect(result.jurisdiction?.state).toBe('Florida');
    expect(result.jurisdiction?.county).toBe('Miami-Dade');
  });

  it('returns empty settings when nothing is available', async () => {
    const result = await loadCourtSettingsForPipeline({
      convexQuery: async () => null,
    });

    // Should not throw — returns empty/default settings
    expect(result).toBeDefined();
  });

  it('document override takes highest priority', async () => {
    const result = await loadCourtSettingsForPipeline({
      convexQuery: async () => ({
        state: 'Texas',
        county: 'Fort Bend',
      }),
      payloadFallback: {
        state: 'Florida',
        county: 'Broward',
      },
      documentOverride: {
        jurisdiction: {
          state: 'California',
          county: 'Los Angeles',
        },
      },
    });

    // Document override wins
    expect(result.jurisdiction?.state).toBe('California');
    expect(result.jurisdiction?.county).toBe('Los Angeles');
  });

  it('Convex settings override payload fallback', async () => {
    const result = await loadCourtSettingsForPipeline({
      convexQuery: async () => ({
        state: 'Texas',
        county: 'Harris',
        courtName: 'County Civil Court',
      }),
      payloadFallback: {
        state: 'Florida',
        county: 'Broward',
      },
    });

    // Convex wins over payload
    expect(result.jurisdiction?.state).toBe('Texas');
    expect(result.jurisdiction?.county).toBe('Harris');
  });

  it('handles nested jurisdiction shape in payload fallback', async () => {
    const result = await loadCourtSettingsForPipeline({
      convexQuery: async () => null,
      payloadFallback: {
        jurisdiction: {
          state: 'California',
          county: 'San Francisco',
          courtName: 'Superior Court',
          district: 'Northern District',
        },
      },
    });

    // The loader normalizes nested shapes
    expect(result.jurisdiction?.state).toBeTruthy();
  });

  it('formatting overrides from document level are preserved', async () => {
    const result = await loadCourtSettingsForPipeline({
      convexQuery: async () => ({
        state: 'Texas',
        county: 'Fort Bend',
      }),
      documentOverride: {
        formatting: {
          pageSize: 'LEGAL',
          defaultFont: 'Courier New',
        },
      },
    });

    expect(result.formatting?.pageSize).toBe('LEGAL');
    expect(result.formatting?.defaultFont).toBe('Courier New');
  });
});
