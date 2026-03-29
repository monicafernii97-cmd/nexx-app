import { dark } from '@clerk/themes';
import type { UserProfile } from '@clerk/nextjs';
import type { ComponentProps } from 'react';

/** Appearance type derived from Clerk's UserProfile component props. */
type Appearance = NonNullable<ComponentProps<typeof UserProfile>['appearance']>;

/** NEXX-branded Clerk theme configuration with Galaxy luxury dark mode styling. */
export const nexxClerkAppearance = {
    baseTheme: dark,
    variables: {
        colorPrimary: '#60A5FA',          /* neon-blue for primary actions */
        colorBackground: 'transparent',   /* enforce true transparency for parent glass wrappers */
        colorInputBackground: 'rgba(255, 255, 255, 0.05)', /* true glass inputs */
        colorInputText: '#FFFFFF',        /* pure-white */
        colorForeground: '#FFFFFF',       /* primary text — pure-white for high legibility */
        colorMutedForeground: 'rgba(255, 255, 255, 0.75)', /* secondary text */
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
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        },
        otpCodeFieldInput: {
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
            fontWeight: '600',
            fontSize: '24px',
            color: '#FFFFFF',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            background: 'rgba(255, 255, 255, 0.05)',
        },
        otpCodeField: {
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        },
        pageScrollBox: {
            background: 'transparent',
        },
        pageHeaderTitle: {
            color: '#FFFFFF',
            fontFamily: 'Playfair Display, Georgia, serif',
            fontWeight: '700',
        },
        pageHeaderSubtitle: {
            color: '#FFFFFF',
            fontWeight: '600',
        },
        profileSectionTitle: {
            color: '#FFFFFF',
        },
        profileSectionContent: {
            color: '#FFFFFF',
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
} as const satisfies Appearance;

/**
 * Settings-page-specific Clerk appearance.
 * Extends nexxClerkAppearance with transparent backgrounds and extra element
 * overrides needed for the embedded UserProfile on a glassmorphic container.
 * This is the single source of truth for all settings page theming.
 */
export const settingsClerkAppearance = {
    ...nexxClerkAppearance,
    elements: {
        ...nexxClerkAppearance.elements,
        rootBox: { width: '100%' },
        cardBox: { width: '100%', boxShadow: 'none', background: 'transparent' },
        card: { ...nexxClerkAppearance.elements.card, background: 'transparent' },
        scrollBox: { background: 'transparent' },
        navbar: {
            borderRight: '1px solid rgba(255,255,255,0.1)',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.05))',
        },
        // Extra elements that the shared theme doesn't need (UserProfile-specific)
        page: { color: '#FFFFFF' },
        pageHeader: { color: '#FFFFFF' },
        profileSection: { color: '#FFFFFF' },
        profileSectionSubtitle: { color: 'rgba(255,255,255,0.75)' },
        userPreview: { color: '#FFFFFF' },
        userPreviewTextContainer: { color: '#FFFFFF' },
        accordionContent: { color: '#FFFFFF' },
        tagPillContainer: { color: '#FFFFFF', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' },
        menuItem: { color: '#FFFFFF' },
        menuList: { background: 'rgba(10,17,40,0.95)', border: '1px solid rgba(255,255,255,0.15)' },
        footerActionText: { color: 'rgba(255,255,255,0.6)' },
        tableHead: { color: 'rgba(255,255,255,0.6)' },
        formFieldSuccessText: { color: '#10B981' },
        formFieldErrorText: { color: '#F43F5E' },
        formButtonReset: { color: '#60A5FA' },
        alertText: { color: '#FFFFFF' },
    },
} as const satisfies Appearance;
