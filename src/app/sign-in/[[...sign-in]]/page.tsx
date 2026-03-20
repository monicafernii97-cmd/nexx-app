'use client';

import { SignIn } from '@clerk/nextjs';
import { nexxClerkAppearance } from '@/lib/clerk-theme';

/** Branded sign-in page with clean neutral background and Clerk SignIn component. */
export default function SignInPage() {
    return (
        <div
            className="min-h-[100dvh] flex items-center justify-center relative overflow-hidden"
            style={{ background: 'var(--zinc-950)' }}
        >
            {/* Subtle ambient glow */}
            <div className="absolute inset-0 pointer-events-none">
                <div
                    className="absolute w-[500px] h-[500px] rounded-full blur-[120px]"
                    style={{
                        background: 'radial-gradient(circle, rgba(5, 150, 105, 0.06) 0%, transparent 70%)',
                        top: '10%',
                        left: '20%',
                    }}
                />
                <div
                    className="absolute w-[400px] h-[400px] rounded-full blur-[100px]"
                    style={{
                        background: 'radial-gradient(circle, rgba(63, 63, 70, 0.2) 0%, transparent 70%)',
                        bottom: '10%',
                        right: '20%',
                    }}
                />
            </div>

            <div className="relative z-10">
                <div className="text-center mb-8">
                    <div
                        className="w-11 h-11 rounded-xl mx-auto mb-4 flex items-center justify-center"
                        style={{
                            background: 'var(--emerald-600)',
                            boxShadow: '0 4px 16px rgba(5, 150, 105, 0.25)',
                        }}
                    >
                        <span className="text-base font-bold text-white">N</span>
                    </div>
                    <h1
                        className="text-headline text-3xl mb-2"
                        style={{ color: 'var(--zinc-100)' }}
                    >
                        NEXX
                    </h1>
                    <p className="text-xs tracking-[0.15em] uppercase font-medium" style={{ color: 'var(--zinc-500)' }}>
                        Your Sanctuary Awaits
                    </p>
                </div>
                <SignIn appearance={nexxClerkAppearance} />
            </div>
        </div>
    );
}
