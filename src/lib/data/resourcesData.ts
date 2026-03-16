/**
 * Static resource registry for the NEXX Resources Hub.
 *
 * Organized by state → county with curated attorneys, therapists,
 * court info, legal aid, and nonprofits. Texas is the initial dataset.
 * National fallback resources cover users in uncurated states.
 */

// ═══════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════

/** A single resource entry (attorney, org, link, etc.) */
export interface ResourceEntry {
    name: string;
    description?: string;
    url?: string;
    phone?: string;
    address?: string;
    tags: string[];
}

/** County-level curated resources */
export interface CountyResources {
    courtClerk: ResourceEntry;
    courtsWebsite: ResourceEntry;
    familyDivision?: ResourceEntry;
    rulesAndProcedures?: ResourceEntry;
    attorneys: ResourceEntry[];
    therapists: ResourceEntry[];
    legalAid: ResourceEntry[];
    nonprofits: ResourceEntry[];
}

/** State-level resources + county map */
export interface StateResources {
    stateFamilyCode: ResourceEntry;
    statewideLegalAid: ResourceEntry[];
    counties: Record<string, CountyResources>;
}

// ═══════════════════════════════════════════
//  National Fallback Resources
// ═══════════════════════════════════════════

export const NATIONAL_ATTORNEY_DIRECTORIES: ResourceEntry[] = [
    {
        name: 'ABA Lawyer Referral Directory',
        description: 'Find a local lawyer through the American Bar Association\'s referral service.',
        url: 'https://www.americanbar.org/groups/lawyer_referral/',
        tags: ['attorney', 'directory', 'national'],
    },
    {
        name: 'AVVO — Find a Lawyer',
        description: 'Search attorney profiles, reviews, and ratings by practice area and location.',
        url: 'https://www.avvo.com/find-a-lawyer',
        tags: ['attorney', 'directory', 'national'],
    },
    {
        name: 'Martindale-Hubbell',
        description: 'Research attorneys and law firms with peer-reviewed ratings.',
        url: 'https://www.martindale.com/',
        tags: ['attorney', 'directory', 'national'],
    },
];

export const NATIONAL_THERAPIST_DIRECTORIES: ResourceEntry[] = [
    {
        name: 'Psychology Today — Find a Therapist',
        description: 'Search therapists by specialty including narcissistic abuse, trauma, and family issues.',
        url: 'https://www.psychologytoday.com/us/therapists',
        tags: ['therapist', 'directory', 'national'],
    },
    {
        name: 'Open Path Collective',
        description: 'Affordable therapy sessions ($30–$80) with licensed therapists.',
        url: 'https://openpathcollective.org/',
        tags: ['therapist', 'affordable', 'national'],
    },
    {
        name: 'BetterHelp',
        description: 'Online counseling with licensed therapists — convenient and private.',
        url: 'https://www.betterhelp.com/',
        tags: ['therapist', 'online', 'national'],
    },
];

export const CRISIS_RESOURCES: ResourceEntry[] = [
    {
        name: 'National Domestic Violence Hotline',
        description: '24/7 confidential support for domestic violence survivors.',
        url: 'https://www.thehotline.org/',
        phone: '1-800-799-7233',
        tags: ['crisis', 'dv', 'national'],
    },
    {
        name: 'SAMHSA National Helpline',
        description: 'Free mental health & substance abuse treatment referrals, 24/7.',
        url: 'https://www.samhsa.gov/find-help/national-helpline',
        phone: '1-800-662-4357',
        tags: ['crisis', 'mental-health', 'national'],
    },
    {
        name: '988 Suicide & Crisis Lifeline',
        description: 'Call or text 988 for immediate emotional support.',
        url: 'https://988lifeline.org/',
        phone: '988',
        tags: ['crisis', 'national'],
    },
    {
        name: 'Crisis Text Line',
        description: 'Text HOME to 741741 for free, 24/7 crisis counseling.',
        url: 'https://www.crisistextline.org/',
        phone: 'Text HOME to 741741',
        tags: ['crisis', 'national'],
    },
];

// ═══════════════════════════════════════════
//  Texas — State Resources
// ═══════════════════════════════════════════

const TEXAS: StateResources = {
    stateFamilyCode: {
        name: 'Texas Family Code',
        description: 'Full text of the Texas Family Code — custody, support, property, protective orders.',
        url: 'https://statutes.capitol.texas.gov/Docs/FA/htm/FA.1.htm',
        tags: ['law', 'family-code', 'state'],
    },
    statewideLegalAid: [
        {
            name: 'TexasLawHelp.org',
            description: 'Free legal information, forms, and resources for low-income Texans.',
            url: 'https://texaslawhelp.org/',
            tags: ['legal-aid', 'free', 'statewide'],
        },
        {
            name: 'Texas RioGrande Legal Aid',
            description: 'Free civil legal services for low-income residents across Texas.',
            url: 'https://www.trla.org/',
            phone: '1-888-988-9996',
            tags: ['legal-aid', 'free', 'statewide'],
        },
        {
            name: 'Lone Star Legal Aid',
            description: 'Free legal aid for residents in the eastern and Gulf Coast regions of Texas.',
            url: 'https://www.lonestarlegal.org/',
            phone: '1-800-733-8394',
            tags: ['legal-aid', 'free', 'statewide'],
        },
        {
            name: 'State Bar of Texas — Lawyer Referral Service',
            description: 'A referral service connecting you with attorneys in your area for a small consultation fee.',
            url: 'https://www.texasbar.com/AM/Template.cfm?Section=Lawyer_Referral_Service',
            phone: '1-800-252-9690',
            tags: ['attorney', 'referral', 'statewide'],
        },
    ],
    counties: {
        // ─── Harris County (Houston) ───
        Harris: {
            courtClerk: {
                name: 'Harris County District Clerk',
                description: 'File court documents, check case status, and obtain copies of records.',
                url: 'https://www.hcdistrictclerk.com/',
                phone: '(713) 755-6405',
                address: '201 Caroline St, Houston, TX 77002',
                tags: ['clerk', 'court'],
            },
            courtsWebsite: {
                name: 'Harris County District Courts',
                description: 'Harris County civil and family district courts information.',
                url: 'https://www.justex.net/',
                tags: ['court', 'website'],
            },
            familyDivision: {
                name: 'Harris County Family Law Center',
                description: 'Family law courts handling custody, divorce, and protective orders.',
                url: 'https://www.justex.net/courts/family/',
                address: '1115 Congress Ave, Houston, TX 77002',
                tags: ['court', 'family'],
            },
            rulesAndProcedures: {
                name: 'Harris County Local Rules',
                description: 'Local rules and procedures for Harris County courts.',
                url: 'https://www.justex.net/courts/family/family-law-local-rules/',
                tags: ['rules', 'procedures'],
            },
            attorneys: [
                {
                    name: 'Houston Volunteer Lawyers',
                    description: 'Pro bono legal services for low-income Houston residents — family law included.',
                    url: 'https://www.makejusticehappen.org/',
                    phone: '(713) 228-0732',
                    tags: ['attorney', 'pro-bono', 'family-law'],
                },
            ],
            therapists: [
                {
                    name: 'The Montrose Center',
                    description: 'Counseling services including trauma, abuse recovery, and family therapy.',
                    url: 'https://montrosecenter.org/',
                    phone: '(713) 529-0037',
                    tags: ['therapist', 'trauma', 'counseling'],
                },
            ],
            legalAid: [
                {
                    name: 'Houston Legal Aid Center',
                    description: 'Free legal consultations and family law assistance for qualifying residents.',
                    url: 'https://www.houstonlegalaid.org/',
                    tags: ['legal-aid', 'free'],
                },
            ],
            nonprofits: [
                {
                    name: 'Houston Area Women\'s Center',
                    description: 'Shelter, counseling, and legal advocacy for domestic violence survivors.',
                    url: 'https://hawc.org/',
                    phone: '(713) 528-2121',
                    tags: ['nonprofit', 'dv', 'shelter'],
                },
                {
                    name: 'Aid to Victims of Domestic Abuse (AVDA)',
                    description: 'Emergency shelter, legal advocacy, and counseling in the Houston area.',
                    url: 'https://www.avda.org/',
                    phone: '(713) 224-9911',
                    tags: ['nonprofit', 'dv', 'legal-advocacy'],
                },
            ],
        },

        // ─── Dallas County ───
        Dallas: {
            courtClerk: {
                name: 'Dallas County District Clerk',
                description: 'File court documents, search case records, and access court services.',
                url: 'https://www.dallascounty.org/department/distclerk/',
                phone: '(214) 653-7301',
                address: '600 Commerce St, Dallas, TX 75202',
                tags: ['clerk', 'court'],
            },
            courtsWebsite: {
                name: 'Dallas County Courts',
                description: 'Dallas County civil and family courts directory.',
                url: 'https://www.dallascounty.org/department/courts/',
                tags: ['court', 'website'],
            },
            familyDivision: {
                name: 'Dallas County Family Courts',
                description: 'Family law courts for custody, divorce, and child support matters.',
                url: 'https://www.dallascounty.org/department/courts/family-district-courts.php',
                address: '600 Commerce St, Dallas, TX 75202',
                tags: ['court', 'family'],
            },
            rulesAndProcedures: {
                name: 'Dallas County Local Rules',
                description: 'Local rules and standing orders for Dallas County family courts.',
                url: 'https://www.dallascounty.org/department/courts/local-rules.php',
                tags: ['rules', 'procedures'],
            },
            attorneys: [
                {
                    name: 'Dallas Volunteer Attorney Program',
                    description: 'Free legal help for low-income Dallas County residents in family law cases.',
                    url: 'https://www.dallasvolunteerattorneyprogram.org/',
                    phone: '(214) 748-1234',
                    tags: ['attorney', 'pro-bono', 'family-law'],
                },
            ],
            therapists: [
                {
                    name: 'Family Counseling Associates of Dallas',
                    description: 'Licensed therapists specializing in family conflict, trauma, and NPD-related issues.',
                    url: 'https://www.psychologytoday.com/us/therapists/tx/dallas',
                    tags: ['therapist', 'family', 'npd'],
                },
            ],
            legalAid: [
                {
                    name: 'Legal Aid of NorthWest Texas',
                    description: 'Free legal services for residents in Dallas and surrounding counties.',
                    url: 'https://www.lanwt.org/',
                    phone: '(214) 748-1234',
                    tags: ['legal-aid', 'free'],
                },
            ],
            nonprofits: [
                {
                    name: 'Genesis Women\'s Shelter & Support',
                    description: 'Emergency shelter, counseling, and legal services for DV survivors in Dallas.',
                    url: 'https://www.genesisshelter.org/',
                    phone: '(214) 946-4357',
                    tags: ['nonprofit', 'dv', 'shelter'],
                },
            ],
        },

        // ─── Bexar County (San Antonio) ───
        Bexar: {
            courtClerk: {
                name: 'Bexar County District Clerk',
                description: 'File documents, check case status, and obtain court records.',
                url: 'https://www.bexar.org/1596/District-Clerk',
                phone: '(210) 335-2113',
                address: '100 Dolorosa, San Antonio, TX 78205',
                tags: ['clerk', 'court'],
            },
            courtsWebsite: {
                name: 'Bexar County Courts',
                description: 'Bexar County civil and family courts information and resources.',
                url: 'https://www.bexar.org/2851/Courts',
                tags: ['court', 'website'],
            },
            familyDivision: {
                name: 'Bexar County Family Courts',
                description: 'Family courts handling custody, divorce, and child protection cases.',
                url: 'https://www.bexar.org/2851/Courts',
                tags: ['court', 'family'],
            },
            attorneys: [
                {
                    name: 'San Antonio Legal Services Association',
                    description: 'Free legal assistance for low-income individuals in Bexar County.',
                    url: 'https://www.salsa-tx.org/',
                    tags: ['attorney', 'pro-bono', 'family-law'],
                },
            ],
            therapists: [
                {
                    name: 'Family Service Association of San Antonio',
                    description: 'Counseling, therapy, and support services for families in crisis.',
                    url: 'https://family-service.org/',
                    phone: '(210) 299-2400',
                    tags: ['therapist', 'family', 'counseling'],
                },
            ],
            legalAid: [
                {
                    name: 'Texas RioGrande Legal Aid — San Antonio',
                    description: 'Free civil legal services for Bexar County residents.',
                    url: 'https://www.trla.org/',
                    phone: '(210) 212-3600',
                    tags: ['legal-aid', 'free'],
                },
            ],
            nonprofits: [
                {
                    name: 'Battered Women & Children\'s Shelter (Family Violence Prevention Services)',
                    description: 'Emergency shelter and support for domestic violence survivors in San Antonio.',
                    url: 'https://www.fvps.org/',
                    phone: '(210) 733-8810',
                    tags: ['nonprofit', 'dv', 'shelter'],
                },
            ],
        },

        // ─── Travis County (Austin) ───
        Travis: {
            courtClerk: {
                name: 'Travis County District Clerk',
                description: 'File court documents, search records, and access court services.',
                url: 'https://www.traviscountytx.gov/district-clerk',
                phone: '(512) 854-9457',
                address: '1000 Guadalupe St, Austin, TX 78701',
                tags: ['clerk', 'court'],
            },
            courtsWebsite: {
                name: 'Travis County Courts',
                description: 'Travis County civil and family courts resources.',
                url: 'https://www.traviscountytx.gov/courts',
                tags: ['court', 'website'],
            },
            familyDivision: {
                name: 'Travis County Family Courts',
                description: 'Family district courts for custody, divorce, and protective order cases.',
                url: 'https://www.traviscountytx.gov/courts/district',
                tags: ['court', 'family'],
            },
            rulesAndProcedures: {
                name: 'Travis County Local Rules — Family Courts',
                description: 'Standing orders and local rules for Travis County family law cases.',
                url: 'https://www.traviscountytx.gov/courts/district/local-rules',
                tags: ['rules', 'procedures'],
            },
            attorneys: [
                {
                    name: 'Volunteer Legal Services of Central Texas',
                    description: 'Pro bono legal services including family law for Travis County residents.',
                    url: 'https://www.vlsoct.org/',
                    phone: '(512) 476-5550',
                    tags: ['attorney', 'pro-bono', 'family-law'],
                },
            ],
            therapists: [
                {
                    name: 'Austin Travis County Integral Care',
                    description: 'Mental health and crisis services including trauma counseling.',
                    url: 'https://integralcare.org/',
                    phone: '(512) 472-4357',
                    tags: ['therapist', 'trauma', 'counseling'],
                },
            ],
            legalAid: [
                {
                    name: 'Texas Legal Services Center',
                    description: 'Statewide legal aid operating out of Austin — family law expertise.',
                    url: 'https://www.tlsc.org/',
                    phone: '(512) 477-6000',
                    tags: ['legal-aid', 'free'],
                },
            ],
            nonprofits: [
                {
                    name: 'SafePlace (SAFE Alliance)',
                    description: 'Shelter, counseling, and advocacy for survivors of DV and sexual assault in Austin.',
                    url: 'https://www.safeaustin.org/',
                    phone: '(512) 267-7233',
                    tags: ['nonprofit', 'dv', 'shelter'],
                },
            ],
        },

        // ─── Tarrant County (Fort Worth) ───
        Tarrant: {
            courtClerk: {
                name: 'Tarrant County District Clerk',
                description: 'File documents, check case status, and access court records.',
                url: 'https://www.tarrantcounty.com/en/district-clerk.html',
                phone: '(817) 884-1240',
                address: '100 W. Weatherford St, Fort Worth, TX 76196',
                tags: ['clerk', 'court'],
            },
            courtsWebsite: {
                name: 'Tarrant County Courts',
                description: 'Tarrant County courts directory and resources.',
                url: 'https://www.tarrantcounty.com/en/courts.html',
                tags: ['court', 'website'],
            },
            familyDivision: {
                name: 'Tarrant County Family Courts',
                description: 'Family law courts handling custody, divorce, and child protection matters.',
                url: 'https://www.tarrantcounty.com/en/courts/district-courts.html',
                tags: ['court', 'family'],
            },
            attorneys: [
                {
                    name: 'Legal Aid of NorthWest Texas — Tarrant County',
                    description: 'Free legal services for qualifying Tarrant County residents.',
                    url: 'https://www.lanwt.org/',
                    phone: '(817) 336-3943',
                    tags: ['attorney', 'pro-bono', 'family-law'],
                },
            ],
            therapists: [
                {
                    name: 'MHMR of Tarrant County',
                    description: 'Mental health services including trauma therapy and family counseling.',
                    url: 'https://www.mhmrtc.org/',
                    phone: '(817) 335-3022',
                    tags: ['therapist', 'trauma', 'counseling'],
                },
            ],
            legalAid: [
                {
                    name: 'Tarrant County Bar Association — Lawyer Referral',
                    description: 'Connect with local Tarrant County attorneys for family law consultations.',
                    url: 'https://www.tarrantbar.org/',
                    phone: '(817) 336-4101',
                    tags: ['legal-aid', 'referral'],
                },
            ],
            nonprofits: [
                {
                    name: 'SafeHaven of Tarrant County',
                    description: 'Emergency shelter, counseling, and legal advocacy for DV survivors.',
                    url: 'https://www.safehaventc.org/',
                    phone: '(817) 535-6462',
                    tags: ['nonprofit', 'dv', 'shelter'],
                },
            ],
        },
    },
};

// ═══════════════════════════════════════════
//  State Registry
// ═══════════════════════════════════════════

const STATE_REGISTRY: Record<string, StateResources> = {
    Texas: TEXAS,
};

// ═══════════════════════════════════════════
//  Lookup Helpers
// ═══════════════════════════════════════════

/** Look up state-level resources. Returns null if the state is not curated. */
export function getStateResources(state: string): StateResources | null {
    return STATE_REGISTRY[state] ?? null;
}

/** Look up county-level resources within a state. Returns null if not curated. */
export function getCountyResources(state: string, county: string): CountyResources | null {
    const stateData = STATE_REGISTRY[state];
    if (!stateData) return null;
    // Try exact match first, then strip " County" suffix if present
    const clean = county.replace(/\s+County$/i, '');
    return stateData.counties[clean] ?? stateData.counties[county] ?? null;
}

/** Check whether a state has curated data. */
export function isStateCurated(state: string): boolean {
    return state in STATE_REGISTRY;
}

/** Get all curated state names. */
export function getCuratedStates(): string[] {
    return Object.keys(STATE_REGISTRY);
}
