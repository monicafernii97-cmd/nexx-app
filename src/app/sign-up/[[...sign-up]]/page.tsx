import { SignUp } from '@clerk/nextjs';
import { dark } from '@clerk/themes';

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
                <SignUp
                    appearance={{
                        baseTheme: dark,
                        variables: {
                            colorPrimary: '#C58B07',
                            colorBackground: '#1A1008',
                            colorInputBackground: '#211607',
                            colorInputText: '#F5EFE0',
                            colorText: '#F5EFE0',
                            colorTextSecondary: '#8A7A60',
                            borderRadius: '12px',
                            fontFamily: 'Inter, sans-serif',
                        },
                        elements: {
                            card: {
                                background: '#1A1008',
                                border: '1px solid rgba(197, 139, 7, 0.15)',
                                borderRadius: '16px',
                                boxShadow: '0 16px 64px rgba(0, 0, 0, 0.4)',
                            },
                            headerTitle: {
                                color: '#F5EFE0',
                                fontFamily: "'Playfair Display', serif",
                            },
                            headerSubtitle: {
                                color: '#8A7A60',
                            },
                            socialButtonsBlockButton: {
                                border: '1px solid rgba(197, 139, 7, 0.15)',
                                background: '#211607',
                                color: '#F5EFE0',
                            },
                            socialButtonsBlockButtonText: {
                                color: '#D4C9B0',
                            },
                            formFieldLabel: {
                                color: '#92783A',
                                textTransform: 'uppercase' as const,
                                fontSize: '11px',
                                letterSpacing: '0.1em',
                                fontWeight: '600',
                            },
                            formFieldInput: {
                                background: '#211607',
                                border: '1px solid rgba(197, 139, 7, 0.15)',
                                color: '#F5EFE0',
                            },
                            formButtonPrimary: {
                                background: 'linear-gradient(135deg, #C58B07, #E5B84A)',
                                color: '#0E0804',
                                fontWeight: '600',
                                letterSpacing: '0.05em',
                            },
                            footerActionLink: {
                                color: '#C58B07',
                            },
                            dividerLine: {
                                background: 'rgba(197, 139, 7, 0.15)',
                            },
                            dividerText: {
                                color: '#8A7A60',
                            },
                        },
                    }}
                />
            </div>
        </div>
    );
}
