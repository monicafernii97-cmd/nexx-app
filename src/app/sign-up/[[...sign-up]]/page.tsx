'use client';

import { SignUp } from '@clerk/nextjs';
import { nexxClerkAppearance } from '@/lib/clerk-theme';
import { AuthPageLayout } from '@/components/auth-layout';

export default function SignUpPage() {
    return (
        <AuthPageLayout subtitle="Begin Your Journey">
            <SignUp appearance={nexxClerkAppearance} />
        </AuthPageLayout>
    );
}
