'use client';

import { SignIn } from '@clerk/nextjs';
import { useSearchParams } from 'next/navigation';
import { nexxClerkAppearance } from '@/lib/clerk-theme';

/** Branded sign-in page with ambient glow background and Clerk SignIn component. */
export default function SignInPage() {
    const searchParams = useSearchParams();
    const plan = searchParams.get('plan');
    // Preserve the plan parameter when a sign-in user clicks "Sign up"
    const signUpRedirectUrl = plan ? `/onboarding?plan=${plan}` : '/onboarding';

    return (
        <div
            className="bg-[#0A1128] min-h-screen flex items-center justify-center relative overflow-hidden"
        >
            {/* Background ambient glow */}
            <div className="absolute inset-0 pointer-events-none">
                <div
                    className="absolute w-96 h-96 rounded-full blur-3xl"
                    style={{
                        background: 'radial-gradient(circle, rgba(208, 227, 255, 0.08) 0%, transparent 70%)',
                        top: '10%',
                        left: '20%',
                    }}
                />
                <div
                    className="absolute w-96 h-96 rounded-full blur-3xl"
                    style={{
                        background: 'radial-gradient(circle, rgba(208, 227, 255, 0.05) 0%, transparent 70%)',
                        bottom: '10%',
                        right: '20%',
                    }}
                />
            </div>

            <div className="relative z-10">
                <div className="text-center mb-8">
                    <h1
                        className="font-serif text-4xl font-bold italic tracking-wide mb-2"
                        style={{ color: '#F7F2EB' }}
                    >
                        <span className="shimmer">NEXX</span>
                    </h1>
                    <p className="text-sm tracking-[0.2em] uppercase" style={{ color: '#D0E3FF' }}>
                        Your Sanctuary Awaits
                    </p>
                </div>
                <SignIn
                    appearance={nexxClerkAppearance}
                    fallbackRedirectUrl="/"
                    signUpForceRedirectUrl={signUpRedirectUrl}
                />
            </div>
        </div>
    );
}
