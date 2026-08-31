import { describe, expect, it } from 'vitest';
import { isAllowedNexxBrowserOrigin } from '../../../../convex/lib/browserOrigins';

describe('browser upload origin policy', () => {
  it('allows production and exact NEXX Vercel preview origins', () => {
    expect(isAllowedNexxBrowserOrigin({ origin: 'https://nexproof.io', nodeEnv: 'production' })).toBe(true);
    expect(isAllowedNexxBrowserOrigin({
      origin: 'https://nexx-n9a6g0e8d-monicafernii97-cmds-projects.vercel.app',
      nodeEnv: 'production',
    })).toBe(true);
  });

  it('rejects lookalike and unrelated Vercel origins', () => {
    for (const origin of [
      'https://nexx-attacker.vercel.app',
      'https://nexx-safe-monicafernii97-cmds-projects.vercel.app.attacker.test',
      'http://nexx-safe-monicafernii97-cmds-projects.vercel.app',
      'https://nexx-safe-other-team.vercel.app',
    ]) {
      expect(isAllowedNexxBrowserOrigin({ origin, nodeEnv: 'production' })).toBe(false);
    }
  });

  it('allows configured origins and limits localhost to non-production', () => {
    expect(isAllowedNexxBrowserOrigin({
      origin: 'https://staging.nexproof.test',
      configuredOrigins: 'https://staging.nexproof.test',
      nodeEnv: 'production',
    })).toBe(true);
    expect(isAllowedNexxBrowserOrigin({ origin: 'http://127.0.0.1:3000', nodeEnv: 'development' })).toBe(true);
    expect(isAllowedNexxBrowserOrigin({ origin: 'http://127.0.0.1:3000', nodeEnv: 'production' })).toBe(false);
  });
});
