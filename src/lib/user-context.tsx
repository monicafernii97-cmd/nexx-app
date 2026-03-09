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

export function useUser() {
    return useContext(UserContext);
}

export function UserProvider({ children }: { children: ReactNode }) {
    const { user: clerkUser, isLoaded: clerkLoaded } = useClerkUser();
    const ensureUser = useMutation(api.users.ensureFromClerk);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncError, setSyncError] = useState<string | null>(null);
    const hasSynced = useRef(false);

    // Auth-derived query: no args, server derives clerkId from auth context
    const currentUser = useQuery(
        api.users.me,
        clerkUser?.id ? {} : 'skip'
    );

    // On Clerk login, ensure our Convex user record exists
    const syncUser = useCallback(async () => {
        if (!clerkUser) return;
        setIsSyncing(true);
        setSyncError(null);
        try {
            await ensureUser({
                clerkId: clerkUser.id,
                name: clerkUser.firstName || clerkUser.fullName || 'User',
                email: clerkUser.primaryEmailAddress?.emailAddress,
            });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.error('Failed to sync user to Convex:', err);
            setSyncError(message);
        } finally {
            setIsSyncing(false);
        }
    }, [clerkUser, ensureUser]);

    useEffect(() => {
        if (clerkLoaded && clerkUser && !hasSynced.current) {
            hasSynced.current = true;
            syncUser();
        }
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
