import { describe, expect, it } from 'vitest';
import { shouldShowLoadEarlier } from '../message-pagination';

describe('message pagination', () => {
    it('keeps the load control visible when a filtered page hydrates to zero rows', () => {
        expect(shouldShowLoadEarlier('CanLoadMore')).toBe(true);
    });

    it('hides the control only after history is exhausted', () => {
        expect(shouldShowLoadEarlier('Exhausted')).toBe(false);
    });
});
