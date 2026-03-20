import { dark } from '@clerk/themes';

/** NEXX-branded Clerk theme configuration with Galaxy luxury dark mode styling. */
export const nexxClerkAppearance = {
    baseTheme: dark,
    variables: {
        colorPrimary: '#60A5FA',          /* neon-blue for primary actions */
        colorBackground: 'transparent',   /* enforce true transparency for parent glass wrappers */
        colorInputBackground: 'rgba(255, 255, 255, 0.05)', /* true glass inputs */
        colorInputText: '#FFFFFF',        /* pure-white */
        colorText: '#FFFFFF',             /* pure-white for high legibility */
        colorTextSecondary: '#FFFFFF',    /* GUARANTEE pure white */
        borderRadius: '16px',
        fontFamily: 'Inter, system-ui, sans-serif', /* robust sans-serif instead of skinny */
        colorSuccess: '#10B981',
        colorDanger: '#F43F5E',
        colorWarning: '#F59E0B',
    },
    elements: {
        card: {
            background: 'linear-gradient(135deg, rgba(18, 61, 126, 0.45), rgba(10, 17, 40, 0.85))',
            backdropFilter: 'blur(24px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderTop: '1px solid rgba(255, 255, 255, 0.25)',
            borderRadius: '20px',
            boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.8), inset 0 1px 0 0 rgba(255, 255, 255, 0.15)',
        },
        headerTitle: {
            color: '#FFFFFF',
            fontFamily: 'Playfair Display, Georgia, serif',
            fontWeight: '700',
            letterSpacing: '-0.02em',
        },
        headerSubtitle: {
            color: '#FFFFFF',
            fontWeight: '600',
        },
        socialButtonsBlockButton: {
            border: '1px solid rgba(255, 255, 255, 0.2)',
            background: 'rgba(255, 255, 255, 0.05)',
            color: '#FFFFFF',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        },
        socialButtonsBlockButtonText: {
            color: '#FFFFFF',
            fontWeight: '600',
        },
        formFieldLabel: {
            color: '#FFFFFF',
            textTransform: 'uppercase' as const,
            fontSize: '11px',
            letterSpacing: '0.05em',
            fontWeight: '700',
        },
        formFieldInput: {
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            color: '#FFFFFF',
            boxShadow: 'inset 0 2px 4px rgba(255, 255, 255, 0.05)',
        },
        formButtonPrimary: {
            background: 'linear-gradient(135deg, #60A5FA, #2563EB)',
            color: '#FFFFFF',
            fontWeight: '700',
            letterSpacing: '0.04em',
            textTransform: 'uppercase' as const,
            boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.4), 0 8px 16px rgba(37, 99, 235, 0.4)',
            border: 'none',
        },
        footerActionLink: {
            color: '#60A5FA',
            fontWeight: '600',
        },
        dividerLine: {
            background: 'rgba(255, 255, 255, 0.1)',
        },
        dividerText: {
            color: '#FFFFFF',
            fontWeight: '600',
        },
        profileSectionTitleText: {
            color: '#FFFFFF',
            fontWeight: '800',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            paddingBottom: '8px',
        },
        profileSectionPrimaryButton: {
            color: '#60A5FA',
            fontWeight: '700',
        },
        accordionTriggerButton: {
            color: '#FFFFFF',
        },
        userPreviewMainIdentifier: {
            color: '#FFFFFF',
            fontWeight: '700',
        },
        userPreviewSecondaryIdentifier: {
            color: '#FFFFFF',
        },
        breadcrumbsItem: {
            color: '#FFFFFF',
            fontWeight: '600',
        },
        breadcrumbsItemDivider: {
            color: '#FFFFFF',
        },
        badge: {
            background: 'rgba(255,255,255,0.1)',
            color: '#FFFFFF',
            border: '1px solid rgba(255,255,255,0.2)',
        },
        menuButton: {
            color: '#FFFFFF',
        },
        navbarButton: {
            color: '#FFFFFF',
            fontWeight: '600',
        },
        navbarButtonIcon: {
            color: '#FFFFFF',
        },
        userButtonPopoverCard: {
            background: 'linear-gradient(135deg, #0A1128, #1E3A8A)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            boxShadow: '0 24px 48px rgba(0, 0, 0, 0.6), inset 0 1px 0 0 rgba(255, 255, 255, 0.15)',
        },
        userButtonPopoverActionButton: {
            color: '#FFFFFF',
        },
        userButtonPopoverActionButtonText: {
            color: '#FFFFFF',
            fontWeight: '600',
        },
        userButtonPopoverActionButtonIcon: {
            color: '#FFFFFF',
        },
        userButtonPopoverFooter: {
            background: 'rgba(255,255,255,0.05)',
        },
    },
} as const;
