import type { RouteMode } from '../../types';
import { emptyLocalLegalResourceLookup, type LocalLegalResourceLookup } from './resourceLookupSchema';

type ResourceArgs = {
  message: string;
  routeMode?: RouteMode;
  state?: string | null;
  county?: string | null;
  courtName?: string | null;
};

const RESOURCE_ROUTE_MODES = new Set<RouteMode>([
  'attorney_resource_guidance',
  'pro_se_guidance',
  'court_response_planning',
  'filing_walkthrough',
  'court_ready_drafting',
  'litigation_navigation',
  'packed_case_intake',
]);

const TEXAS_COUNTY_CLERKS: Record<string, { title: string; url: string }> = {
  bexar: { title: 'Bexar County District Clerk', url: 'https://www.bexar.org/2986/District-Clerk' },
  collin: { title: 'Collin County District Clerk', url: 'https://www.collincountytx.gov/District-Clerk' },
  dallas: { title: 'Dallas County District Clerk', url: 'https://www.dallascounty.org/government/district-clerk/' },
  denton: { title: 'Denton County District Clerk', url: 'https://www.dentoncounty.gov/184/District-Clerk' },
  'fort bend': { title: 'Fort Bend County District Clerk', url: 'https://www.fortbendcountytx.gov/government/departments/county-services/district-clerk' },
  harris: { title: 'Harris County District Clerk', url: 'https://www.hcdistrictclerk.com/' },
  montgomery: { title: 'Montgomery County District Clerk', url: 'https://www.mctx.org/departments/departments_d_-_f/district_clerk/index.php' },
  tarrant: { title: 'Tarrant County District Clerk', url: 'https://www.tarrantcountytx.gov/en/district-clerk.html' },
  travis: { title: 'Travis County District Clerk', url: 'https://www.traviscountytx.gov/district-clerk' },
};

function normalized(value?: string | null) {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function stateKey(value?: string | null) {
  const state = normalized(value).toLowerCase();
  if (state === 'tx' || state === 'texas') return 'texas';
  return state;
}

function countyKey(value?: string | null) {
  return normalized(value).replace(/\s+county$/i, '').toLowerCase();
}

export function shouldBuildLocalResourceLookup(args: Pick<ResourceArgs, 'message' | 'routeMode'>) {
  return Boolean(
    (args.routeMode && RESOURCE_ROUTE_MODES.has(args.routeMode)) ||
    /\b(resource|legal aid|lawyer referral|limited[-\s]?scope|attorney|filing fee|fee waiver|e[-\s]?file|court forms?|law library|district clerk|county clerk)\b/i.test(args.message)
  );
}

function addTexasResources(lookup: LocalLegalResourceLookup, retrievedAt: string) {
  lookup.feeSources.push(
    {
      sourceId: 'tx_efile',
      title: 'eFileTexas',
      sourceType: 'efiling',
      summary: 'Official Texas e-filing portal for supported courts. Check the case county and court before relying on any listed filing step or fee.',
      url: 'https://www.efiletexas.gov/',
      retrievedAt,
    },
    {
      sourceId: 'tx_courts_self_help',
      title: 'Texas Courts Self-Help',
      sourceType: 'official_court',
      summary: 'Texas judiciary self-help starting point for court information and forms.',
      url: 'https://www.txcourts.gov/programs-services/self-help/',
      retrievedAt,
    }
  );

  lookup.resources.push(
    {
      name: 'eFileTexas',
      type: 'efiling',
      summary: 'Official e-filing portal. Use it to confirm whether your court accepts e-filing and to check filing steps before submission.',
      url: 'https://www.efiletexas.gov/',
      retrievedAt,
    },
    {
      name: 'Texas Courts Self-Help',
      type: 'self_help',
      summary: 'Official judiciary self-help page for Texas court users.',
      url: 'https://www.txcourts.gov/programs-services/self-help/',
      retrievedAt,
    },
    {
      name: 'TexasLawHelp Family, Divorce, and Children Forms',
      type: 'court_forms',
      summary: 'Texas family-law forms and guides maintained for self-represented litigants.',
      url: 'https://texaslawhelp.org/family-divorce-children',
      retrievedAt,
    },
    {
      name: 'TexasLawHelp Fee Waivers',
      type: 'fee_waiver',
      summary: 'Plain-language guidance about asking the court to waive court costs when a person cannot afford them.',
      url: 'https://texaslawhelp.org/article/court-fees-fee-waivers',
      retrievedAt,
    },
    {
      name: 'TexasLawHelp Legal Help Directory',
      type: 'legal_aid',
      summary: 'Directory for legal-aid and nonprofit help by Texas location and issue.',
      url: 'https://texaslawhelp.org/directory',
      retrievedAt,
    },
    {
      name: 'State Bar of Texas Lawyer Referral and Information Service',
      type: 'bar_referral',
      summary: 'State Bar referral path for users who need a lawyer or limited-scope consultation.',
      url: 'https://www.texasbar.com/AM/Template.cfm?Section=Lawyer_Referral_Service_LRIS_',
      retrievedAt,
    },
    {
      name: 'Texas State Law Library',
      type: 'law_library',
      summary: 'State law library resources for self-represented litigants and legal research.',
      url: 'https://www.sll.texas.gov/',
      retrievedAt,
    }
  );
}

function addCountyResource(lookup: LocalLegalResourceLookup, retrievedAt: string) {
  const state = stateKey(lookup.jurisdiction.state);
  const county = countyKey(lookup.jurisdiction.county);
  if (!county) return;

  const knownCounty = state === 'texas' ? TEXAS_COUNTY_CLERKS[county] : undefined;
  if (!knownCounty) return;

  lookup.resources.unshift({
    name: knownCounty.title,
    type: 'district_clerk',
    summary: 'Use the official district clerk or court website to confirm filing fees, local forms, accepted filing methods, and hearing settings.',
    url: knownCounty.url,
    retrievedAt,
  });

  lookup.feeSources.push({
    sourceId: `tx_${county.replace(/\s+/g, '_')}_district_clerk`,
    title: knownCounty.title,
    sourceType: 'district_clerk',
    summary: 'County district clerk site. Check its current fee schedule before relying on any amount.',
    url: knownCounty.url,
    retrievedAt,
  });
}

function addGenericResources(lookup: LocalLegalResourceLookup, retrievedAt: string) {
  lookup.resources.push(
    {
      name: 'LawHelp.org',
      type: 'legal_aid',
      summary: 'National directory for legal-aid and self-help resources by state.',
      url: 'https://www.lawhelp.org/',
      retrievedAt,
    },
    {
      name: 'National Center for State Courts State Court Websites',
      type: 'self_help',
      summary: 'Directory for locating official state judiciary websites when a state-specific source has not been verified.',
      url: 'https://www.ncsc.org/information-and-resources/state-court-websites',
      retrievedAt,
    }
  );
}

export function buildLocalLegalResourceLookup(args: ResourceArgs): LocalLegalResourceLookup | null {
  if (!shouldBuildLocalResourceLookup(args)) return null;
  const retrievedAt = new Date().toISOString();
  const lookup = emptyLocalLegalResourceLookup({
    state: normalized(args.state) || null,
    county: normalized(args.county) || null,
    courtName: normalized(args.courtName) || null,
  });

  if (stateKey(args.state) === 'texas') addTexasResources(lookup, retrievedAt);
  addCountyResource(lookup, retrievedAt);
  if (lookup.resources.length === 0) addGenericResources(lookup, retrievedAt);

  if (!lookup.jurisdiction.state) lookup.warnings.push('State is needed before local court procedure or fee sources can be verified.');
  if (!lookup.jurisdiction.county) lookup.warnings.push('County is needed before clerk, fee schedule, and local form resources can be narrowed.');

  return lookup;
}

export function renderLocalResourceLookupMarkdown(lookup: LocalLegalResourceLookup | null) {
  if (!lookup || lookup.resources.length === 0) return '';
  const resources = lookup.resources.slice(0, 8).map((resource) => {
    const suffix = resource.url ? `: ${resource.url}` : '';
    return `- ${resource.name}${suffix}`;
  });

  return [
    '**Official Resource Places To Check**',
    ...resources,
    lookup.exactFeeFindings.length === 0
      ? 'Do not rely on a filing-fee amount until it is confirmed on the official clerk, court, or e-filing source.'
      : '',
  ].filter(Boolean).join('\n');
}
