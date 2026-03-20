/** NEXX-branded Clerk theme configuration with Ethereal luxury light mode styling. */
export const nexxClerkAppearance = {
    variables: {
        colorPrimary: '#8a7a60',          // champagne
        colorBackground: 'transparent',
        colorInputBackground: '#ffffff',
        colorInputText: '#0a1e54',        // sapphire-dark
        colorText: '#0a1e54',             // sapphire-dark
        colorTextSecondary: '#4a6094',    // sapphire-base
        borderRadius: '12px',
        fontFamily: 'Inter, sans-serif',
        colorSuccess: '#10b981',
        colorDanger: '#ef4444',
        colorWarning: '#f59e0b',
    },
    elements: {
        card: {
            background: 'transparent',
            border: 'none',
            borderRadius: '16px',
            boxShadow: 'none',
        },
        headerTitle: {
            color: '#0a1e54',             // sapphire-dark
            fontFamily: "'Playfair Display', serif",
            fontWeight: '600',
        },
        headerSubtitle: {
            color: '#4a6094',             // sapphire-base
        },
        socialButtonsBlockButton: {
            border: '1px solid #d0e3ff',  // cloud-light
            background: '#ffffff',
            color: '#0a1e54',             // sapphire-dark
            boxShadow: '0 1px 2px rgba(10, 30, 84, 0.05)',
        },
        socialButtonsBlockButtonText: {
            color: '#0a1e54',             // sapphire-dark
            fontWeight: '600',
        },
        formFieldLabel: {
            color: '#4a6094',             // sapphire-base
            textTransform: 'uppercase' as const,
            fontSize: '11px',
            letterSpacing: '0.1em',
            fontWeight: '600',
        },
        formFieldInput: {
            background: '#ffffff',
            border: '1px solid #d0e3ff',  // cloud-light
            color: '#0a1e54',             // sapphire-dark
            boxShadow: 'inset 0 1px 3px rgba(10, 30, 84, 0.02)',
        },
        formButtonPrimary: {
            background: 'linear-gradient(135deg, #0a1e54, #123d7e)',
            color: '#ffffff',
            fontWeight: '600',
            letterSpacing: '0.05em',
            boxShadow: '0 4px 12px rgba(10, 30, 84, 0.15)',
            border: 'none',
        },
        footerActionLink: {
            color: '#123d7e',             // sapphire-light mapping approx
            fontWeight: '600',
        },
        dividerLine: {
            background: '#d0e3ff',        // cloud-light
        },
        dividerText: {
            color: '#4a6094',             // sapphire-base
        },
        profileSectionTitleText: {
            color: '#0a1e54',             // sapphire-dark
            fontWeight: '600',
            borderBottom: '1px solid #d0e3ff',
            paddingBottom: '8px',
        },
        profileSectionPrimaryButton: {
            color: '#123d7e',
        },
        accordionTriggerButton: {
            color: '#0a1e54',
        },
    },
} as const;
