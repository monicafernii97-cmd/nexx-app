'use client';

import { createContext, useContext, ReactNode, useState, useCallback } from 'react';
import { useUser as useClerkUser } from '@clerk/nextjs';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { useEffect, useRef } from 'react';

interface UserContextType {
    userId: Id<'users'> | null;
    isLoading: boolean;
    error: string | null;
    clerkUser: ReturnType<typeof useClerkUser>['user'];
}

const UserContext = createContext<UserContextType>({
    userId: null,
    isLoading: true,
    error: null,
    clerkUser: null,
});

/** Hook providing the current user's Convex ID, loading state, and Clerk user object. */
export function useUser() {
    return useContext(UserContext);
}

/** Syncs Clerk authentication with Convex and exposes user state to the component tree. */
export function UserProvider({ children }: { children: ReactNode }) {
    const { user: clerkUser, isLoaded: clerkLoaded } = useClerkUser();
    const ensureUser = useMutation(api.users.ensureFromClerk);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncError, setSyncError] = useState<string | null>(null);
    const prevClerkId = useRef<string | undefined>(undefined);
    const hasSynced = useRef(false);
    const syncAttempt = useRef(0);

    // Auth-derived query: no args, server derives clerkId from auth context
    const currentUser = useQuery(
        api.users.me,
        clerkUser?.id ? {} : 'skip'
    );

    const clerkId = clerkUser?.id;
    const clerkName = clerkUser?.firstName || clerkUser?.fullName || 'User';
    const clerkEmail = clerkUser?.primaryEmailAddress?.emailAddress;

    // On Clerk login, ensure our Convex user record exists.
    // Uses an attempt counter so stale completions from a previous identity
    // cannot corrupt state for the current user.
    const syncUser = useCallback(async () => {
        if (!clerkId) return;
        const attempt = ++syncAttempt.current;
        setIsSyncing(true);
        setSyncError(null);
        try {
            await ensureUser({
                clerkId,
                name: clerkName,
                email: clerkEmail,
            });
            if (syncAttempt.current === attempt) {
                hasSynced.current = true;
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.error('Failed to sync user to Convex:', err);
            if (syncAttempt.current === attempt) {
                setSyncError(message);
            }
            throw err; // Re-throw so the effect's .catch() keeps hasSynced false
        } finally {
            if (syncAttempt.current === attempt) {
                setIsSyncing(false);
            }
        }
    }, [clerkId, clerkName, clerkEmail, ensureUser]);

    useEffect(() => {
        if (!clerkLoaded) return;

        if (!clerkUser) {
            setSyncError(null);
            setIsSyncing(false);
            prevClerkId.current = undefined;
            return;
        }

        // Only reset hasSynced when the user identity actually changes
        if (clerkUser.id !== prevClerkId.current) {
            hasSynced.current = false;
            prevClerkId.current = clerkUser.id;
            // Plan selection now happens inside onboarding (not via sessionStorage
            // from the landing page), so clear any stale values on identity change
            // to prevent them leaking across different users or sessions.
            if (typeof window !== 'undefined') {
                sessionStorage.removeItem('selectedPlan');
            }
        }

        // Skip if already synced for this identity
        if (hasSynced.current) return;

        // syncUser manages hasSynced and state gating via attempt counter
        syncUser().catch(() => {
            // Leave hasSynced false so future effect runs can retry
        });
    }, [clerkLoaded, clerkUser, syncUser]);

    const userId = currentUser?._id ?? null;
    // Stay loading until Clerk loads, sync settles, AND Convex query resolves
    const isLoading = !clerkLoaded || isSyncing || (clerkUser !== null && currentUser === undefined);

    return (
        <UserContext.Provider value={{ userId, isLoading, error: syncError, clerkUser: clerkUser ?? null }}>
            {children}
        </UserContext.Provider>
    );
}
