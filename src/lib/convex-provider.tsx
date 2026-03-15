'use client';

import { ConvexProviderWithClerk } from 'convex/react-clerk';
import { ConvexReactClient } from 'convex/react';
import { ClerkProvider, useAuth } from '@clerk/nextjs';
import { ReactNode } from 'react';

const convex = new ConvexReactClient(
    process.env.NEXT_PUBLIC_CONVEX_URL!
);

/** Wraps the app in Clerk + Convex providers for auth-aware real-time data access. */
export function ConvexClientProvider({ children }: { children: ReactNode }) {
    return (
        <ClerkProvider afterSignOutUrl="/">
            <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
                {children}
            </ConvexProviderWithClerk>
        </ClerkProvider>
    );
}
