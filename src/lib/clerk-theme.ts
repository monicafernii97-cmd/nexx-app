import { dark } from '@clerk/themes';

export const nexxClerkAppearance = {
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
} as const;
