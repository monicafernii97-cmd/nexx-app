'use client';

import { UserProvider } from '@/lib/user-context';
import { ReactNode } from 'react';

export default function OnboardingLayout({ children }: { children: ReactNode }) {
    return <UserProvider>{children}</UserProvider>;
}
