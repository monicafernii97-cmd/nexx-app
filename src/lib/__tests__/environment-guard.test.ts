import { describe, expect, it } from 'vitest';
import { assertSafeConvexEnvironment } from '../../../scripts/check-convex-env.mjs';

describe('Convex environment guard', () => {
    it('rejects the production hostname during local development', () => {
        expect(() => assertSafeConvexEnvironment({
            NEXT_PUBLIC_CONVEX_URL: 'https://blessed-rabbit-457.convex.cloud',
        }, 'development')).toThrow(/production Convex deployment/);
    });

    it('rejects the production deployment name in previews', () => {
        expect(() => assertSafeConvexEnvironment({
            CONVEX_DEPLOYMENT: 'prod:blessed-rabbit-457',
        }, 'preview')).toThrow(/production Convex deployment/);
    });

    it('allows a development deployment locally', () => {
        expect(() => assertSafeConvexEnvironment({
            NEXT_PUBLIC_CONVEX_URL: 'https://avid-bobcat-637.convex.cloud',
            CONVEX_DEPLOYMENT: 'dev:avid-bobcat-637',
        }, 'development')).not.toThrow();
    });

    it('rejects a malformed Convex URL', () => {
        expect(() => assertSafeConvexEnvironment({
            NEXT_PUBLIC_CONVEX_URL: 'not-a-url',
        }, 'development')).toThrow(/valid URL/);
    });

    it('allows a staging deployment in Vercel Preview', () => {
        expect(() => assertSafeConvexEnvironment({
            NEXT_PUBLIC_CONVEX_URL: 'https://staging-example.convex.cloud',
            CONVEX_DEPLOYMENT: 'dev:staging-example',
        }, 'preview')).not.toThrow();
    });

    it('allows the production deployment only for production builds', () => {
        expect(() => assertSafeConvexEnvironment({
            CONVEX_DEPLOYMENT: 'prod:blessed-rabbit-457',
        }, 'production')).not.toThrow();
    });
});
