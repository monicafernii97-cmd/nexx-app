import type { RouteMode } from '../types';

export type OfficialResearchTargetKind =
  | 'state_statutes'
  | 'state_court_rules'
  | 'county_clerk'
  | 'local_rules'
  | 'court_forms'
  | 'court_specific';

export interface OfficialLegalResearchTarget {
  kind: OfficialResearchTargetKind;
  title: string;
  query: string;
  preferredDomains: string[];
}

const STATE_OFFICIAL_DOMAINS: Record<string, string[]> = {
  texas: [
    'txcourts.gov',
    'statutes.capitol.texas.gov',
    'texaslawhelp.org',
    'texasattorneygeneral.gov',
  ],
};

const OFFICIAL_DOMAIN_FALLBACKS = ['.gov', '.us', 'official court website'];

function cleanText(value?: string | null) {
  return value?.replace(/\s+/g, ' ').trim() || undefined;
}

function domainHintsForState(state?: string) {
  const normalized = cleanText(state)?.toLowerCase();
  return normalized ? (STATE_OFFICIAL_DOMAINS[normalized] ?? OFFICIAL_DOMAIN_FALLBACKS) : OFFICIAL_DOMAIN_FALLBACKS;
}

export function shouldUseOfficialLegalResearch(routeMode: RouteMode, message: string) {
  if (routeMode === 'local_procedure' || routeMode === 'direct_legal_answer' || routeMode === 'court_ready_drafting') {
    return true;
  }

  return /\b(file|filing|clerk|court rule|local rule|standing order|statute|code|deadline|form|service|caption|draft|motion|petition|order|certificate)\b/i.test(message);
}

export function buildOfficialLegalResearchTargets(args: {
  state?: string;
  county?: string;
  city?: string;
  courtName?: string;
  routeMode: RouteMode;
  message: string;
}) {
  if (!shouldUseOfficialLegalResearch(args.routeMode, args.message)) return [];

  const state = cleanText(args.state);
  const county = cleanText(args.county);
  const city = cleanText(args.city);
  const courtName = cleanText(args.courtName);
  const domains = domainHintsForState(state);
  const targets: OfficialLegalResearchTarget[] = [];

  if (state) {
    targets.push({
      kind: 'state_statutes',
      title: `${state} family law statutes`,
      query: `${state} official family code custody child support possession enforcement statute`,
      preferredDomains: domains,
    });
    targets.push({
      kind: 'state_court_rules',
      title: `${state} court rules and self-help`,
      query: `${state} official court rules family law filing forms service deadlines`,
      preferredDomains: domains,
    });
  }

  if (state && county) {
    targets.push({
      kind: 'county_clerk',
      title: `${county} County clerk or district clerk`,
      query: `${county} County ${state} official district clerk family court filing forms fees service`,
      preferredDomains: ['.gov', ...domains],
    });
    targets.push({
      kind: 'local_rules',
      title: `${county} County local rules and standing orders`,
      query: `${county} County ${state} official family court local rules standing orders filing requirements`,
      preferredDomains: ['.gov', ...domains],
    });
    targets.push({
      kind: 'court_forms',
      title: `${county} County family court forms`,
      query: `${county} County ${state} official family court forms motion petition order certificate of service`,
      preferredDomains: ['.gov', ...domains],
    });
  }

  if (state && county && courtName) {
    targets.push({
      kind: 'court_specific',
      title: courtName,
      query: `${courtName} ${county} County ${state} official local rules docket procedures family court`,
      preferredDomains: ['.gov', ...domains],
    });
  } else if (state && county && city) {
    targets.push({
      kind: 'court_specific',
      title: `${city} court procedure`,
      query: `${city} ${county} County ${state} official family court procedure`,
      preferredDomains: ['.gov', ...domains],
    });
  }

  if (targets.length === 0) {
    targets.push({
      kind: 'state_court_rules',
      title: 'Official court rules to verify',
      query: 'official state court family law rules filing procedure forms service deadlines',
      preferredDomains: OFFICIAL_DOMAIN_FALLBACKS,
    });
  }

  const seen = new Set<string>();
  return targets.filter((target) => {
    const key = `${target.kind}:${target.query.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 6);
}
