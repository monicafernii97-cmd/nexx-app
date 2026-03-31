/**
 * Tour utilities — side-effect-free module that can be imported
 * without pulling in the driver.js bundle.
 */

export const TOUR_STORAGE_KEY = 'nexx-tour-seen';
export const TOUR_PENDING_KEY = 'nexx-tour-pending';
export const RESTART_EVENT = 'restart-nexx-tour';

/**
 * Restart the onboarding tour from anywhere in the app.
 *
 * If the user is NOT on /dashboard, sets a pending flag and navigates there.
 * If the user IS on /dashboard, fires the restart event directly so the
 * OnboardingTour component can re-show the welcome dialog.
 */
export function restartTour() {
    localStorage.removeItem(TOUR_STORAGE_KEY);

    // Check if we're on dashboard — if not, navigate there first
    if (window.location.pathname !== '/dashboard') {
        localStorage.setItem(TOUR_PENDING_KEY, 'true');
        window.location.href = '/dashboard';
    } else {
        window.dispatchEvent(new CustomEvent(RESTART_EVENT));
    }
}
