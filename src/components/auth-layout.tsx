'use client';

import { ReactNode } from 'react';

/** Shared layout for auth pages (sign-in, sign-up) with ambient glow background and NEXX branding. */
export function AuthPageLayout({
    children,
    subtitle,
}: {
    children: ReactNode;
    subtitle: string;
}) {
    return (
        <div
            className="min-h-screen flex items-center justify-center relative overflow-hidden"
            style={{ background: 'var(--universe-dark)' }}
        >
            {/* Background ambient glow */}
            <div className="absolute inset-0 pointer-events-none">
                <div
                    className="absolute w-96 h-96 rounded-full blur-3xl opacity-30"
                    style={{
                        background: 'radial-gradient(circle, var(--galaxy-blue) 0%, transparent 70%)',
                        top: '10%',
                        left: '20%',
                    }}
                />
                <div
                    className="absolute w-96 h-96 rounded-full blur-3xl opacity-20"
                    style={{
                        background: 'radial-gradient(circle, var(--galaxy-purple, #4C1D95) 0%, transparent 70%)',
                        bottom: '10%',
                        right: '20%',
                    }}
                />
            </div>

            <div className="relative z-10">
                <div className="text-center mb-8">
                    <h1
                        className="font-serif text-5xl font-black tracking-tight mb-2 uppercase select-none"
                        style={{
                            background: 'linear-gradient(135deg, #FFFFFF 0%, #E2E8F0 25%, #94A3B8 50%, #1E3A8A 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            color: 'transparent',
                            textShadow: '0px 2px 10px rgba(255,255,255,0.1)',
                        }}
                    >
                        NEXX
                    </h1>
                    <p className="text-[13px] font-bold tracking-[0.25em] uppercase text-[var(--metallic-dark)]">
                        {subtitle}
                    </p>
                </div>
                {children}
            </div>
        </div>
    );
}
