'use client';

import { SignUp } from '@clerk/nextjs';
import { nexxClerkAppearance } from '@/lib/clerk-theme';

export default function SignUpPage() {
    return (
        <div
            className="min-h-screen flex items-center justify-center relative overflow-hidden"
            style={{ background: '#0E0804' }}
        >
            {/* Background ambient glow */}
            <div className="absolute inset-0 pointer-events-none">
                <div
                    className="absolute w-96 h-96 rounded-full blur-3xl"
                    style={{
                        background: 'radial-gradient(circle, rgba(197, 139, 7, 0.08) 0%, transparent 70%)',
                        top: '10%',
                        right: '20%',
                    }}
                />
                <div
                    className="absolute w-96 h-96 rounded-full blur-3xl"
                    style={{
                        background: 'radial-gradient(circle, rgba(197, 139, 7, 0.05) 0%, transparent 70%)',
                        bottom: '10%',
                        left: '20%',
                    }}
                />
            </div>

            <div className="relative z-10">
                <div className="text-center mb-8">
                    <h1
                        className="font-serif text-4xl font-bold italic tracking-wide mb-2"
                        style={{ color: '#F5EFE0' }}
                    >
                        <span className="shimmer">NEXX</span>
                    </h1>
                    <p className="text-sm tracking-[0.2em] uppercase" style={{ color: '#92783A' }}>
                        Begin Your Journey
                    </p>
                </div>
                <SignUp appearance={nexxClerkAppearance} />
            </div>
        </div>
    );
}
