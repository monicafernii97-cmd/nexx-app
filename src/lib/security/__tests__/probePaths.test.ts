import { describe, expect, it } from 'vitest';
import { isProbePathname } from '@/lib/security/probePaths';

describe('probe path detection', () => {
  it.each([
    '/.env',
    '/.env.local',
    '/.env.production',
    '/api/.env',
    '/backend/.env',
    '/app/.env',
    '/.aws/credentials',
    '/credentials.json',
    '/service-account.json',
    '/firebase-service-account.json',
    '/wp-admin/install.php',
    '/wp-login.php',
    '/xmlrpc.php',
    '/phpinfo.php',
    '/server-status',
    '/test.php',
    '/backup.sql',
    '/private.key',
  ])('blocks scanner path %s', (pathname) => {
    expect(isProbePathname(pathname)).toBe(true);
  });

  it.each([
    '/',
    '/sign-in',
    '/sign-up',
    '/robots.txt',
    '/sitemap.xml',
    '/favicon.ico',
    '/_next/static/example.js',
    '/_next/image',
    '/.well-known/acme-challenge/test-token',
    '/.well-known/security.txt',
    '/dashboard',
    '/api/chat',
    '/api/documents/generate',
  ])('allows legitimate path %s', (pathname) => {
    expect(isProbePathname(pathname)).toBe(false);
  });
});
