/**
 * Review Hub Page — Server page wrapper that forces dynamic rendering.
 *
 * The actual UI lives in ReviewHubContent (a client component) which
 * requires ExportProvider context and cannot be statically prerendered.
 */

import ReviewHubContent from './ReviewHubContent';

// Prevent Next.js from attempting static prerendering
export const dynamic = 'force-dynamic';

/** Review Hub page — delegates to the client ReviewHubContent component. */
export default function ReviewHubPage() {
    return <ReviewHubContent />;
}
