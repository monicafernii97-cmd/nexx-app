import { dark } from '@clerk/themes';

/** NEXX-branded Clerk theme configuration with Galaxy luxury dark mode styling. */
export const nexxClerkAppearance = {
    baseTheme: dark,
    variables: {
        colorPrimary: '#1E3A8A',          /* galaxy-blue */
        colorBackground: '#020617',       /* universe-dark */
        colorInputBackground: 'rgba(10, 17, 40, 0.4)', /* translucent universe blue */
        colorInputText: '#FFFFFF',        /* pure-white */
        colorText: '#FFFFFF',             /* pure-white for high legibility */
        colorTextSecondary: '#E2E8F0',    /* metallic-silver */
        borderRadius: '12px',
        fontFamily: 'Inter, system-ui, sans-serif', /* robust sans-serif instead of skinny */
        colorSuccess: '#10B981',
        colorDanger: '#F43F5E',
        colorWarning: '#F59E0B',
    },
    elements: {
        card: {
            background: 'linear-gradient(135deg, rgba(10, 17, 40, 0.9), rgba(2, 6, 23, 0.95))',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderTop: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '20px',
            boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.8), inset 0 1px 0 0 rgba(255, 255, 255, 0.05)',
        },
        headerTitle: {
            color: '#FFFFFF',
            fontFamily: 'Outfit, system-ui, sans-serif',
            fontWeight: '700',
            letterSpacing: '-0.02em',
        },
        headerSubtitle: {
            color: '#E2E8F0',
            fontWeight: '500',
        },
        socialButtonsBlockButton: {
            border: '1px solid rgba(255, 255, 255, 0.15)',
            background: 'rgba(255, 255, 255, 0.05)',
            color: '#FFFFFF',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        },
        socialButtonsBlockButtonText: {
            color: '#FFFFFF',
            fontWeight: '600',
        },
        formFieldLabel: {
            color: '#E2E8F0',
            textTransform: 'uppercase' as const,
            fontSize: '11px',
            letterSpacing: '0.05em',
            fontWeight: '700',
        },
        formFieldInput: {
            background: 'rgba(10, 17, 40, 0.5)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            color: '#FFFFFF',
            boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.2)',
        },
        formButtonPrimary: {
            background: 'linear-gradient(135deg, #1E3A8A, #0A1128)',
            color: '#FFFFFF',
            fontWeight: '700',
            letterSpacing: '0.04em',
            textTransform: 'uppercase' as const,
            boxShadow: '0 8px 20px rgba(0, 0, 0, 0.4)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderTop: '1px solid rgba(255, 255, 255, 0.3)',
        },
        footerActionLink: {
            color: '#E2E8F0',
            fontWeight: '600',
        },
        dividerLine: {
            background: 'rgba(255, 255, 255, 0.1)',
        },
        dividerText: {
            color: '#94A3B8',
            fontWeight: '600',
        },
        profileSectionTitleText: {
            color: '#FFFFFF',
            fontWeight: '700',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            paddingBottom: '8px',
        },
        profileSectionPrimaryButton: {
            color: '#E2E8F0',
        },
        accordionTriggerButton: {
            color: '#FFFFFF',
        },
    },
} as const;
