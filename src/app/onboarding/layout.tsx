'use client';

import { UserProvider } from '@/lib/user-context';
import { ReactNode } from 'react';

/** Layout wrapper for onboarding pages, providing the UserProvider context. */
export default function OnboardingLayout({ children }: { children: ReactNode }) {
    return <UserProvider>{children}</UserProvider>;
}
