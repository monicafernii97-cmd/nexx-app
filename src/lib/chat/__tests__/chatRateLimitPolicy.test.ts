import { describe, expect, it } from 'vitest';
import { isUploadE2ERobotEmail } from '../../../../convex/lib/chatRateLimitPolicy';

describe('upload E2E robot identity policy', () => {
  it.each([
    'upload-robot-owner+preview@nexproof.io',
    'upload-robot-outsider+preview@nexproof.io',
    'upload-robot-owner+production@nexproof.io',
    'upload-robot-outsider+production@nexproof.io',
  ])('accepts an exact company-controlled robot identity: %s', (email) => {
    expect(isUploadE2ERobotEmail(email)).toBe(true);
  });

  it.each([
    'upload-robot-owner+preview@example.com',
    'upload-robot-owner@nexproof.io',
    'someone+e2e@nexproof.io',
    'upload-robot-owner+staging@nexproof.io',
  ])('rejects lookalike or unapproved identities: %s', (email) => {
    expect(isUploadE2ERobotEmail(email)).toBe(false);
  });
});
