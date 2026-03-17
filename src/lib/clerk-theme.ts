import { dark } from '@clerk/themes';

/** NEXX-branded Clerk theme configuration with luxury dark mode styling. */
export const nexxClerkAppearance = {
    baseTheme: dark,
    variables: {
        colorPrimary: '#123D7E',
        colorBackground: '#0A1E54',
        colorInputBackground: '#FFF9F0',
        colorInputText: '#0A1E54',
        colorText: '#F7F2EB',
        colorTextSecondary: '#D0E3FF',
        borderRadius: '12px',
        fontFamily: 'Inter, sans-serif',
    },
    elements: {
        card: {
            background: '#0A1E54',
            border: '1px solid rgba(208, 227, 255, 0.15)',
            borderRadius: '16px',
            boxShadow: '0 16px 64px rgba(0, 0, 0, 0.4)',
        },
        headerTitle: {
            color: '#F7F2EB',
            fontFamily: "'Playfair Display', serif",
        },
        headerSubtitle: {
            color: '#D0E3FF',
        },
        socialButtonsBlockButton: {
            border: '1px solid rgba(208, 227, 255, 0.15)',
            background: '#FFF9F0',
            color: '#0A1E54',
        },
        socialButtonsBlockButtonText: {
            color: '#0A1E54',
        },
        formFieldLabel: {
            color: '#D0E3FF',
            textTransform: 'uppercase' as const,
            fontSize: '11px',
            letterSpacing: '0.1em',
            fontWeight: '600',
        },
        formFieldInput: {
            background: '#FFF9F0',
            border: '1px solid rgba(10, 30, 84, 0.12)',
            color: '#0A1E54',
        },
        formButtonPrimary: {
            background: 'linear-gradient(135deg, #FFF9F0, #D0E3FF)',
            color: '#0A1E54',
            fontWeight: '600',
            letterSpacing: '0.05em',
        },
        footerActionLink: {
            color: '#D0E3FF',
        },
        dividerLine: {
            background: 'rgba(208, 227, 255, 0.15)',
        },
        dividerText: {
            color: '#D0E3FF',
        },
    },
} as const;
