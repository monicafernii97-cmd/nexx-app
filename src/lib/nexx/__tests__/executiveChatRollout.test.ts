import { describe, expect, it } from 'vitest';
import { EXECUTIVE_CHAT_ROLLOUT_FEATURES, resolveExecutiveChatRollout, stableRolloutBucket, type ExecutiveChatRolloutConfigSnapshot } from '../orchestration/rollout';
import { featureFlagsForRollout } from '../orchestration/featureFlags';

const featureModes = Object.fromEntries(EXECUTIVE_CHAT_ROLLOUT_FEATURES.map((feature) => [feature, 'enforce'])) as ExecutiveChatRolloutConfigSnapshot['featureModes'];
const base: ExecutiveChatRolloutConfigSnapshot = {
  version: 7,
  environment: 'production',
  featureModes,
  defaultMode: 'off',
  cohortPercentage: 0,
  allowlistedUserIds: [], allowlistedOrgIds: [], allowlistedCaseIds: [], allowlistedConversationIds: [],
  denylistedUserIds: [], denylistedOrgIds: [], denylistedCaseIds: [], denylistedConversationIds: [],
  cohortSalt: 'release-7', activationStartsAt: 1, emergencyDisabled: false,
};

describe('executive chat rollout selection', () => {
  it('is stable for the same subject and salt', () => {
    expect(stableRolloutBucket('user:release')).toBe(stableRolloutBucket('user:release'));
  });

  it('prioritizes emergency off, denylist, allowlist, then cohort', () => {
    const subject = { userId: 'user-1' };
    expect(resolveExecutiveChatRollout({ config: { ...base, allowlistedUserIds: ['user-1'] }, subject, now: 2, globalEmergencyOff: true }).selectionReason).toBe('emergency_off');
    expect(resolveExecutiveChatRollout({ config: { ...base, allowlistedUserIds: ['user-1'], denylistedUserIds: ['user-1'] }, subject, now: 2 }).selectionReason).toBe('denylist');
    expect(resolveExecutiveChatRollout({ config: { ...base, allowlistedUserIds: ['user-1'] }, subject, now: 2 }).selectionReason).toBe('allowlist');
    expect(resolveExecutiveChatRollout({ config: { ...base, cohortPercentage: 100 }, subject, now: 2 }).selectionReason).toBe('cohort');
  });

  it('uses the default mode outside the cohort and disables expired configs', () => {
    const subject = { userId: 'user-2' };
    expect(resolveExecutiveChatRollout({ config: { ...base, defaultMode: 'shadow' }, subject, now: 2 }).modes.publication_v2).toBe('shadow');
    expect(resolveExecutiveChatRollout({ config: { ...base, expiresAt: 2 }, subject, now: 2 }).modes.publication_v2).toBe('off');
  });

  it('lets emergency environment controls disable but never force rollout enablement', () => {
    const selected = resolveExecutiveChatRollout({ config: { ...base, cohortPercentage: 100 }, subject: { userId: 'user-3' }, now: 2 });
    expect(featureFlagsForRollout(selected, {}).publicationGateV2).toBe(true);
    expect(featureFlagsForRollout(selected, { EXEC_CHAT_PUBLICATION_V2: 'off' }).publicationGateV2).toBe(false);
    expect(featureFlagsForRollout(selected, { EXEC_CHAT_EMERGENCY_OFF: 'true' }).documentActivationV2).toBe(false);
    const unselected = resolveExecutiveChatRollout({ config: base, subject: { userId: 'user-3' }, now: 2 });
    expect(featureFlagsForRollout(unselected, { EXEC_CHAT_PUBLICATION_V2: 'on' }).publicationGateV2).toBe(false);
  });
});
