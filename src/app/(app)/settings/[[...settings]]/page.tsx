'use client';

import { UserProfile } from '@clerk/nextjs';
import { nexxClerkAppearance } from '@/lib/clerk-theme';

export default function SettingsPage() {
    return (
        <div className="max-w-4xl mx-auto">
            <h1
                className="text-headline text-3xl mb-2"
                style={{ color: '#F7F2EB' }}
            >
                Settings
            </h1>
            <p className="text-sm mb-8" style={{ color: '#FFF9F0' }}>
                Manage your account, security, and preferences.
            </p>

            <div className="rounded-2xl overflow-hidden" style={{
                border: '1px solid rgba(208, 227, 255, 0.12)',
            }}>
                <UserProfile
                    appearance={{
                        ...nexxClerkAppearance,
                        elements: {
                            ...nexxClerkAppearance.elements,
                            rootBox: {
                                width: '100%',
                            },
                            cardBox: {
                                width: '100%',
                                boxShadow: 'none',
                            },
                            navbar: {
                                borderRight: '1px solid rgba(208, 227, 255, 0.1)',
                            },
                            navbarButton: {
                                color: '#D0E3FF',
                            },
                            navbarButtonIcon: {
                                color: '#FFF9F0',
                            },
                        },
                    }}
                />
            </div>
        </div>
    );
}
