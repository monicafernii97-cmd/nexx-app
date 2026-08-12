export type MessagePageStatus = 'LoadingFirstPage' | 'CanLoadMore' | 'LoadingMore' | 'Exhausted';

/** Keep history reachable even when a raw page contains only hidden rows. */
export function shouldShowLoadEarlier(status: MessagePageStatus) {
    return status === 'CanLoadMore' || status === 'LoadingMore';
}
