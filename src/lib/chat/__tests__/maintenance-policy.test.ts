import { describe, expect, it } from 'vitest';
import {
    CHAT_JOB_LEASE_MINUTES,
    CHAT_RECOVERY_MAX_AFTER_EXPIRY_MINUTES,
    CHAT_RECOVERY_SWEEP_MINUTES,
} from '../maintenance-policy';

describe('chat maintenance policy', () => {
    it('keeps lease recovery within the documented seven-minute acquisition SLA', () => {
        expect(CHAT_RECOVERY_SWEEP_MINUTES).toBe(5);
        expect(CHAT_JOB_LEASE_MINUTES + CHAT_RECOVERY_MAX_AFTER_EXPIRY_MINUTES).toBeLessThanOrEqual(7);
    });

    it('reduces the safety sweep from 1,440 to 288 maximum invocations per day', () => {
        expect((24 * 60) / CHAT_RECOVERY_SWEEP_MINUTES).toBe(288);
    });
});
