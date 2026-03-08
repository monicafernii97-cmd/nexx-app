export const NAV_ITEMS = [
    { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard' },
    { label: 'Chat', href: '/chat', icon: 'MessageCircle' },
    { label: 'DocuVault', href: '/docuvault', icon: 'Shield' },
    { label: 'Legal Suite', href: '/legal', icon: 'Scale' },
    { label: 'Resources', href: '/resources', icon: 'BookOpen' },
    { label: 'Settings', href: '/settings', icon: 'Settings' },
] as const;

export const INCIDENT_CATEGORIES = [
    { value: 'parental-alienation', label: 'Parental Alienation', color: '#C75A5A' },
    { value: 'court-order-violation', label: 'Court Order Violation', color: '#7C6FA0' },
    { value: 'financial-abuse', label: 'Financial Abuse', color: '#5A8EC9' },
    { value: 'harassment', label: 'Harassment', color: '#E5A84A' },
    { value: 'micromanagement', label: 'Micromanagement', color: '#5A9E6F' },
    { value: 'gaslighting', label: 'Gaslighting', color: '#C58B07' },
    { value: 'manipulation', label: 'Manipulation', color: '#92783A' },
    { value: 'false-accusations', label: 'False Accusations', color: '#C75A5A' },
    { value: 'stalking-monitoring', label: 'Stalking / Monitoring', color: '#7C6FA0' },
    { value: 'other', label: 'Other', color: '#8A7A60' },
] as const;

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
