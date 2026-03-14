import { dark } from '@clerk/themes';

export const nexxClerkAppearance = {
    baseTheme: dark,
    variables: {
        colorPrimary: '#123D7E',
        colorBackground: '#0A1E54',
        colorInputBackground: '#1D2D44',
        colorInputText: '#FFFAF3',
        colorText: '#FFFAF3',
        colorTextSecondary: '#C7D0E5',
        borderRadius: '12px',
        fontFamily: 'Inter, sans-serif',
    },
    elements: {
        card: {
            background: '#0A1E54',
            border: '1px solid rgba(199, 208, 229, 0.15)',
            borderRadius: '16px',
            boxShadow: '0 16px 64px rgba(0, 0, 0, 0.4)',
        },
        headerTitle: {
            color: '#FFFAF3',
            fontFamily: "'Playfair Display', serif",
        },
        headerSubtitle: {
            color: '#C7D0E5',
        },
        socialButtonsBlockButton: {
            border: '1px solid rgba(199, 208, 229, 0.15)',
            background: '#1D2D44',
            color: '#FFFAF3',
        },
        socialButtonsBlockButtonText: {
            color: '#FFFAF3',
        },
        formFieldLabel: {
            color: '#C7D0E5',
            textTransform: 'uppercase' as const,
            fontSize: '11px',
            letterSpacing: '0.1em',
            fontWeight: '600',
        },
        formFieldInput: {
            background: '#1D2D44',
            border: '1px solid rgba(199, 208, 229, 0.15)',
            color: '#FFFAF3',
        },
        formButtonPrimary: {
            background: 'linear-gradient(135deg, #E8DDD3, #C7D0E5)',
            color: '#0A1E54',
            fontWeight: '600',
            letterSpacing: '0.05em',
        },
        footerActionLink: {
            color: '#C7D0E5',
        },
        dividerLine: {
            background: 'rgba(199, 208, 229, 0.15)',
        },
        dividerText: {
            color: '#C7D0E5',
        },
    },
} as const;
