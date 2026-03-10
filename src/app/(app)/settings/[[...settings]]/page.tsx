'use client';

import { UserProfile } from '@clerk/nextjs';
import { nexxClerkAppearance } from '@/lib/clerk-theme';

export default function SettingsPage() {
    return (
        <div className="max-w-4xl mx-auto">
            <h1
                className="text-headline text-3xl mb-2"
                style={{ color: '#F5EFE0' }}
            >
                Settings
            </h1>
            <p className="text-sm mb-8" style={{ color: '#8A7A60' }}>
                Manage your account, security, and preferences.
            </p>

            <div className="rounded-2xl overflow-hidden" style={{
                border: '1px solid rgba(197, 139, 7, 0.12)',
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
                                borderRight: '1px solid rgba(197, 139, 7, 0.1)',
                            },
                            navbarButton: {
                                color: '#B8A88A',
                            },
                            navbarButtonIcon: {
                                color: '#8A7A60',
                            },
                        },
                    }}
                />
            </div>
        </div>
    );
}
