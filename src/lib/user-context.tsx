'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';

interface UserContextType {
    userId: Id<'users'> | null;
    isLoading: boolean;
}

const UserContext = createContext<UserContextType>({
    userId: null,
    isLoading: true,
});

export function useUser() {
    return useContext(UserContext);
}

export function UserProvider({ children }: { children: ReactNode }) {
    const [userId, setUserId] = useState<Id<'users'> | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const createUser = useMutation(api.users.createOrGet);

    useEffect(() => {
        const stored = localStorage.getItem('nexx_user_id');
        if (stored) {
            setUserId(stored as Id<'users'>);
            setIsLoading(false);
        } else {
            // Create a guest user on first visit
            createUser({ name: 'Guest' }).then((id) => {
                localStorage.setItem('nexx_user_id', id);
                setUserId(id);
                setIsLoading(false);
            });
        }
    }, [createUser]);

    return (
        <UserContext.Provider value={{ userId, isLoading }}>
            {children}
        </UserContext.Provider>
    );
}
