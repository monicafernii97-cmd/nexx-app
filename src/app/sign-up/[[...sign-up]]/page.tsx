'use client';

import { SignUp } from '@clerk/nextjs';
import { nexxClerkAppearance } from '@/lib/clerk-theme';

/** Branded sign-up page with ambient glow background and Clerk SignUp component. */
export default function SignUpPage() {
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
                        right: '20%',
                    }}
                />
                <div
                    className="absolute w-96 h-96 rounded-full blur-3xl"
                    style={{
                        background: 'radial-gradient(circle, rgba(208, 227, 255, 0.05) 0%, transparent 70%)',
                        bottom: '10%',
                        left: '20%',
                    }}
                />
            </div>

            <div className="relative z-10">
                <div className="text-center mb-10">
                    <h1
                        className="font-serif text-5xl font-bold italic tracking-wide mb-3"
                        style={{ color: '#F7F2EB' }}
                    >
                        <span className="shimmer">NEXX</span>
                    </h1>
                    <p className="text-base tracking-[0.2em] md:text-lg uppercase" style={{ color: '#D0E3FF' }}>
                        Begin Your Journey
                    </p>
                </div>
                <SignUp appearance={nexxClerkAppearance} />
            </div>
        </div>
    );
}
