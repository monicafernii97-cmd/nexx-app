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
            style={{ background: '#FFF9F0' }}
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
                        style={{ color: '#123D7E' }}
                    >
                        <span className="shimmer">NEXX</span>
                    </h1>
                    <p className="text-sm tracking-[0.2em] uppercase" style={{ color: '#5D82BB' }}>
                        {subtitle}
                    </p>
                </div>
                {children}
            </div>
        </div>
    );
}
