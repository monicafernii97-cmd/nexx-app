import { dark } from '@clerk/themes';

export const nexxClerkAppearance = {
    baseTheme: dark,
    variables: {
        colorPrimary: '#0A1E54',
        colorBackground: '#D9CBC2',
        colorInputBackground: '#CFC7C8',
        colorInputText: '#0A1E54',
        colorText: '#0A1E54',
        colorTextSecondary: '#B39A84',
        borderRadius: '12px',
        fontFamily: 'Inter, sans-serif',
    },
    elements: {
        card: {
            background: '#D9CBC2',
            border: '1px solid rgba(10, 30, 84, 0.15)',
            borderRadius: '16px',
            boxShadow: '0 16px 64px rgba(0, 0, 0, 0.4)',
        },
        headerTitle: {
            color: '#0A1E54',
            fontFamily: "'Playfair Display', serif",
        },
        headerSubtitle: {
            color: '#B39A84',
        },
        socialButtonsBlockButton: {
            border: '1px solid rgba(10, 30, 84, 0.15)',
            background: '#CFC7C8',
            color: '#0A1E54',
        },
        socialButtonsBlockButtonText: {
            color: '#0A1E54',
        },
        formFieldLabel: {
            color: '#A0B1DD',
            textTransform: 'uppercase' as const,
            fontSize: '11px',
            letterSpacing: '0.1em',
            fontWeight: '600',
        },
        formFieldInput: {
            background: '#CFC7C8',
            border: '1px solid rgba(10, 30, 84, 0.15)',
            color: '#0A1E54',
        },
        formButtonPrimary: {
            background: 'linear-gradient(135deg, #0A1E54, #14518E)',
            color: '#D9CBC2',
            fontWeight: '600',
            letterSpacing: '0.05em',
        },
        footerActionLink: {
            color: '#0A1E54',
        },
        dividerLine: {
            background: 'rgba(10, 30, 84, 0.15)',
        },
        dividerText: {
            color: '#B39A84',
        },
    },
} as const;
