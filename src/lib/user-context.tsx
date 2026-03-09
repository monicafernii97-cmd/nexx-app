'use client';

import { createContext, useContext, ReactNode, useState } from 'react';
import { useUser as useClerkUser } from '@clerk/nextjs';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { useEffect } from 'react';

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
    const [syncError, setSyncError] = useState<string | null>(null);
    const currentUser = useQuery(
        api.users.getByClerkId,
        clerkUser?.id ? { clerkId: clerkUser.id } : 'skip'
    );

    // On Clerk login, ensure our Convex user record exists
    useEffect(() => {
        if (clerkLoaded && clerkUser) {
            ensureUser({
                clerkId: clerkUser.id,
                name: clerkUser.firstName || clerkUser.fullName || 'User',
                email: clerkUser.primaryEmailAddress?.emailAddress,
            }).catch((err) => {
                console.error('Failed to sync user to Convex:', err);
                setSyncError(err?.message ?? String(err));
            });
        }
    }, [clerkLoaded, clerkUser, ensureUser]);

    const userId = currentUser?._id ?? null;
    const isLoading = !clerkLoaded || (clerkUser !== null && currentUser === undefined);

    return (
        <UserContext.Provider value={{ userId, isLoading, error: syncError, clerkUser: clerkUser ?? null }}>
            {children}
        </UserContext.Provider>
    );
}
