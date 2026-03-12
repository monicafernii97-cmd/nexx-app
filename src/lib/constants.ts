export const NAV_ITEMS = [
    { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard' },
    { label: 'Chat', href: '/chat', icon: 'MessageCircle' },
    { label: 'DocuVault', href: '/docuvault', icon: 'Landmark' },
    { label: 'Incident Report', href: '/incident-report', icon: 'ClipboardList' },
    { label: 'Legal Suite', href: '/court-settings', icon: 'Scale' },
    { label: 'Resources', href: '/resources', icon: 'BookOpen' },
    { label: 'Settings', href: '/settings', icon: 'Settings' },
] as const;

export const INCIDENT_CATEGORIES = [
    { value: 'emotional_abuse', label: 'Emotional Abuse', color: '#C75A5A' },
    { value: 'financial_abuse', label: 'Financial Abuse', color: '#5A8EC9' },
    { value: 'parental_alienation', label: 'Parental Alienation', color: '#7C6FA0' },
    { value: 'custody_violation', label: 'Custody Violation', color: '#E5A84A' },
    { value: 'harassment', label: 'Harassment', color: '#C58B07' },
    { value: 'threats', label: 'Threats', color: '#C75A5A' },
    { value: 'manipulation', label: 'Manipulation', color: '#92783A' },
    { value: 'neglect', label: 'Neglect', color: '#5A9E6F' },
    { value: 'other', label: 'Other', color: '#8A7A60' },
] as const;

export const MODE_LABELS: Record<string, { label: string; color: string }> = {
    therapeutic: { label: 'Therapeutic', color: '#5A9E6F' },
    legal: { label: 'Legal', color: '#5A8EC9' },
    strategic: { label: 'Strategic', color: '#E5A84A' },
    general: { label: 'General', color: '#C58B07' },
};

export const ONBOARDING_STEPS = [
    { id: 'welcome', title: 'Welcome', description: 'Welcome to NEXX' },
    { id: 'about-you', title: 'About You', description: 'Tell us about yourself' },
    { id: 'situation', title: 'Your Situation', description: 'Your custody & legal situation' },
    { id: 'your-nex', title: 'Your NEX', description: 'Describe what you\'re facing' },
    { id: 'goals', title: 'Your Goals', description: 'What you need help with' },
    { id: 'disclaimer', title: 'Legal Notice', description: 'Important information' },
] as const;

export const US_STATES = [
    'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
    'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
    'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan',
    'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire',
    'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
    'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
    'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia',
    'Wisconsin', 'Wyoming',
] as const;
