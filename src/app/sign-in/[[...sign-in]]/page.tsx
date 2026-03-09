'use client';

import { SignIn } from '@clerk/nextjs';
import { nexxClerkAppearance } from '@/lib/clerk-theme';
import { AuthPageLayout } from '@/components/auth-layout';

export default function SignInPage() {
    return (
        <AuthPageLayout subtitle="Your Sanctuary Awaits">
            <SignIn appearance={nexxClerkAppearance} />
        </AuthPageLayout>
    );
}
