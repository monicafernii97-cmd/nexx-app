/**
 * Court Identity Resolution — resolveCourtIdentity.ts
 *
 * Resolves the full court identity from the priority chain:
 * 1. Explicit user confirmation (ClarificationModal patches)
 * 2. Legal Suite Court Settings  → api.courtSettings.get
 * 3. NEX Profile / Legal Identity → api.nexProfiles.getByUser
 * 4. Personal Profile             → api.users.me
 * 5. Jurisdiction profile defaults
 *
 * Invariant H2: Field resolution is per-field, not per-object.
 * For each field, the highest-priority non-null value wins.
 * Empty string "" and whitespace-only "   " are treated as null/missing.
 *
 * @module resolveCourtIdentity
 */

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type DocumentKind =
  | 'motion'
  | 'amended_motion'
  | 'second_amended_motion'
  | 'third_amended_motion'
  | 'response'
  | 'declaration'
  | 'notice'
  | 'proposed_order'
  | 'affidavit'
  | 'petition'
  | 'objection'
  | 'exhibit_packet';

export type NumberingMode =
  | 'continuous'
  | 'restart_by_section'
  | 'restart_by_subsection';

export type FieldResolutionSource =
  | 'reviewhub_edit'
  | 'court_settings'
  | 'nex_profile'
  | 'personal_profile'
  | 'ai_generated'
  | 'manual_user_input'
  | 'jurisdiction_default';

export type CourtIdentity = {
  /** Filing party (the user). */
  filingPartyLegalName: string;
  filingPartyRole: 'petitioner' | 'respondent';
  isProSe: boolean;

  /** Opposing party. */
  opposingPartyLegalName?: string;
  opposingPartyRole?: 'petitioner' | 'respondent';

  /**
   * Caption parties — ALWAYS actual legal roles, NOT filing-party-relative.
   * captionPetitionerName is the actual petitioner regardless of who files.
   * captionRespondentName is the actual respondent regardless of who files.
   */
  captionPetitionerName: string;
  captionRespondentName?: string;

  /** Children involved in the case. */
  children: { name: string; age: number }[];
  childrenNames: string[];

  /** Court information (separate fields — never conflate courtName and judicialDistrict). */
  courtName?: string;
  judicialDistrict?: string;
  county: string;
  state: string;
  causeNumber?: string;
  assignedJudge?: string;

  /** Caption format. */
  caseTitleFormat?:
    | 'name_v_name'
    | 'in_interest_of'
    | 'in_matter_of_marriage'
    | 'in_re_marriage'
    | 'custom';
  caseTitleCustom?: string;

  /** Classification (never conflated). */
  caseType: string;
  documentKind: DocumentKind;
  filingType?: string;
  amendmentLevel?:
    | 'first'
    | 'second'
    | 'third'
    | 'supplemental'
    | 'emergency'
    | 'verified';

  numberingMode: NumberingMode;

  /** Resolved document title — never generic. */
  resolvedTitle: string;
  resolvedSubtitle?: string;

  /** Audit trail: which source resolved each legally significant field. */
  fieldSources: Record<string, FieldResolutionSource>;

  /** Schema version for future migration safety. */
  schemaVersion: 1;
};

// ═══════════════════════════════════════════════════════════════
// Source Types
// ═══════════════════════════════════════════════════════════════

/** Shape of data from api.courtSettings.get */
export type CourtSettingsData = {
  state?: string;
  county?: string;
  courtName?: string;
  causeNumber?: string;
  assignedJudge?: string;
  judicialDistrict?: string;
  userLegalName?: string;
  userRole?: string;
  opposingPartyLegalName?: string;
  opposingPartyRole?: string;
  petitionerLegalName?: string;
  respondentLegalName?: string;
  children?: { fullName?: string; name?: string; age?: number }[];
  hasAttorney?: boolean;
  caseTitleFormat?: string;
  caseTitleCustom?: string;
  caseType?: string;
};

/** Shape of data from api.nexProfiles.getByUser */
export type NexProfileData = {
  fullName?: string;
  state?: string;
  county?: string;
  courtStatus?: string;
  hasAttorney?: boolean;
  children?: { name?: string; age?: number }[];
};

/** Shape of data from api.users.me */
export type UserProfileData = {
  fullName?: string;
  name?: string;
  state?: string;
  county?: string;
  hasAttorney?: boolean;
};

/** Explicit overrides from ClarificationModal / ReviewHub. */
export type CourtIdentityPatch = Partial<CourtIdentity>;

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

/**
 * Treat undefined, null, empty string, and whitespace-only as missing.
 * Invariant P3: Explicit Empty-vs-Missing Rule.
 */
function isPresent(value: string | null | undefined): value is string {
  return value != null && value.trim() !== '';
}

/**
 * Per-field resolver: returns the first non-empty value from the
 * priority chain, along with its source.
 */
function resolveField(
  ...sources: [string | null | undefined, FieldResolutionSource][]
): { value: string | undefined; source: FieldResolutionSource | undefined } {
  for (const [val, source] of sources) {
    if (isPresent(val)) return { value: val!.trim(), source };
  }
  return { value: undefined, source: undefined };
}

// ═══════════════════════════════════════════════════════════════
// Resolver
// ═══════════════════════════════════════════════════════════════

export type ResolveCourtIdentityInput = {
  patch?: CourtIdentityPatch;
  courtSettings?: CourtSettingsData | null;
  nexProfile?: NexProfileData | null;
  userProfile?: UserProfileData | null;
  draftTitle?: string;
  draftSubtitle?: string;
  draftDocumentKind?: DocumentKind;
  draftFilingType?: string;
  draftAmendmentLevel?: CourtIdentity['amendmentLevel'];
};

/**
 * Resolve full CourtIdentity from the priority chain.
 *
 * Rules:
 * - Per-field resolution (Invariant H2)
 * - captionPetitionerName = actual petitioner, never swapped
 * - caseType must not leak personal_injury into SAPCR filings
 * - fieldSources tracks where every resolved field came from
 */
export function resolveCourtIdentity(
  input: ResolveCourtIdentityInput,
): CourtIdentity {
  const { patch, courtSettings, nexProfile, userProfile } = input;
  const cs = courtSettings ?? {};
  const np = nexProfile ?? {};
  const up = userProfile ?? {};
  const fieldSources: Record<string, FieldResolutionSource> = {};

  // ── Filing party ───────────────────────────────────────────
  const nameResult = resolveField(
    [patch?.filingPartyLegalName, 'reviewhub_edit'],
    [cs.userLegalName, 'court_settings'],
    [np.fullName, 'nex_profile'],
    [up.fullName ?? up.name, 'personal_profile'],
  );
  const filingPartyLegalName = nameResult.value ?? '';
  if (nameResult.source) fieldSources['filingPartyLegalName'] = nameResult.source;

  const roleStr = patch?.filingPartyRole ?? cs.userRole ?? '';
  const filingPartyRole: 'petitioner' | 'respondent' =
    /respondent/i.test(roleStr) ? 'respondent' : 'petitioner';
  if (patch?.filingPartyRole) fieldSources['filingPartyRole'] = 'reviewhub_edit';
  else if (cs.userRole) fieldSources['filingPartyRole'] = 'court_settings';

  // ── Pro se ─────────────────────────────────────────────────
  const isProSe = patch?.isProSe ??
    !(cs.hasAttorney ?? np.hasAttorney ?? up.hasAttorney ?? false);
  if (patch?.isProSe != null) fieldSources['isProSe'] = 'reviewhub_edit';
  else if (cs.hasAttorney != null) fieldSources['isProSe'] = 'court_settings';
  else if (np.hasAttorney != null) fieldSources['isProSe'] = 'nex_profile';
  else if (up.hasAttorney != null) fieldSources['isProSe'] = 'personal_profile';

  // ── Opposing party ─────────────────────────────────────────
  const opposingResult = resolveField(
    [patch?.opposingPartyLegalName, 'reviewhub_edit'],
    [cs.opposingPartyLegalName, 'court_settings'],
  );
  if (opposingResult.source) fieldSources['opposingPartyLegalName'] = opposingResult.source;

  const opposingRoleStr = patch?.opposingPartyRole ?? cs.opposingPartyRole ?? '';
  const opposingPartyRole: 'petitioner' | 'respondent' | undefined =
    /petitioner/i.test(opposingRoleStr) ? 'petitioner' :
    /respondent/i.test(opposingRoleStr) ? 'respondent' : undefined;

  // ── Caption parties (ALWAYS actual roles) ──────────────────
  const captionPetResult = resolveField(
    [patch?.captionPetitionerName, 'reviewhub_edit'],
    [cs.petitionerLegalName, 'court_settings'],
  );
  // Fallback: map filing party to their actual caption role.
  // If user is petitioner → they are captionPetitioner.
  // If user is respondent → the opposing party is captionPetitioner.
  const captionPetitionerName = captionPetResult.value ??
    (filingPartyRole === 'petitioner' ? filingPartyLegalName : opposingResult.value ?? '');
  if (captionPetResult.source) fieldSources['captionPetitionerName'] = captionPetResult.source;

  const captionResResult = resolveField(
    [patch?.captionRespondentName, 'reviewhub_edit'],
    [cs.respondentLegalName, 'court_settings'],
  );
  // If user is respondent → they are captionRespondent.
  // If user is petitioner → the opposing party is captionRespondent.
  const captionRespondentName = captionResResult.value ??
    (filingPartyRole === 'respondent' ? filingPartyLegalName : opposingResult.value);
  if (captionResResult.source) fieldSources['captionRespondentName'] = captionResResult.source;

  // ── Children ───────────────────────────────────────────────
  const patchChildren = patch?.children ?? [];
  const csChildren = (cs.children ?? []).map(c => ({
    name: (c.fullName ?? c.name ?? '').trim(),
    age: c.age ?? 0,
  })).filter(c => c.name !== '');
  const npChildren = (np.children ?? []).map(c => ({
    name: (c.name ?? '').trim(),
    age: c.age ?? 0,
  })).filter(c => c.name !== '');

  const children = patchChildren.length > 0 ? patchChildren :
    csChildren.length > 0 ? csChildren :
    npChildren.length > 0 ? npChildren : [];
  const childrenNames = (patch?.childrenNames?.length ?? 0) > 0
    ? patch!.childrenNames!
    : children.map(c => c.name);

  if (patchChildren.length > 0) fieldSources['children'] = 'reviewhub_edit';
  else if (csChildren.length > 0) fieldSources['children'] = 'court_settings';
  else if (npChildren.length > 0) fieldSources['children'] = 'nex_profile';

  // ── Court ──────────────────────────────────────────────────
  const countyResult = resolveField(
    [patch?.county, 'reviewhub_edit'],
    [cs.county, 'court_settings'],
    [np.county, 'nex_profile'],
    [up.county, 'personal_profile'],
  );
  if (countyResult.source) fieldSources['county'] = countyResult.source;

  const stateResult = resolveField(
    [patch?.state, 'reviewhub_edit'],
    [cs.state, 'court_settings'],
    [np.state, 'nex_profile'],
    [up.state, 'personal_profile'],
  );
  if (stateResult.source) fieldSources['state'] = stateResult.source;

  const courtResult = resolveField(
    [patch?.courtName, 'reviewhub_edit'],
    [cs.courtName, 'court_settings'],
  );
  if (courtResult.source) fieldSources['courtName'] = courtResult.source;

  const districtResult = resolveField(
    [patch?.judicialDistrict, 'reviewhub_edit'],
    [cs.judicialDistrict, 'court_settings'],
  );
  if (districtResult.source) fieldSources['judicialDistrict'] = districtResult.source;

  const causeResult = resolveField(
    [patch?.causeNumber, 'reviewhub_edit'],
    [cs.causeNumber, 'court_settings'],
  );
  if (causeResult.source) fieldSources['causeNumber'] = causeResult.source;

  const judgeResult = resolveField(
    [patch?.assignedJudge, 'reviewhub_edit'],
    [cs.assignedJudge, 'court_settings'],
  );
  if (judgeResult.source) fieldSources['assignedJudge'] = judgeResult.source;

  // ── Case classification ────────────────────────────────────
  const rawCaseType = patch?.caseType ?? cs.caseType ?? '';
  // SAPCR guard: never let personal_injury leak into SAPCR filings
  const isSAPCR = /sapcr|parent.child|custody|modification/i.test(rawCaseType) ||
    childrenNames.length > 0;
  const caseType = isSAPCR && /personal_injury/i.test(rawCaseType)
    ? 'sapcr_modification'
    : rawCaseType || 'general';

  const caseTitleFormat = patch?.caseTitleFormat ??
    (cs.caseTitleFormat as CourtIdentity['caseTitleFormat']) ??
    (isSAPCR ? 'in_interest_of' : undefined);

  const caseTitleCustom = patch?.caseTitleCustom ?? cs.caseTitleCustom;

  // ── Document kind ──────────────────────────────────────────
  const documentKind = patch?.documentKind ?? input.draftDocumentKind ?? 'motion';
  const filingType = patch?.filingType ?? input.draftFilingType;
  const amendmentLevel = patch?.amendmentLevel ?? input.draftAmendmentLevel;

  // ── Numbering mode ─────────────────────────────────────────
  const numberingMode = patch?.numberingMode ?? 'continuous';

  // ── Title ──────────────────────────────────────────────────
  const titleResult = resolveField(
    [patch?.resolvedTitle, 'reviewhub_edit'],
    [input.draftTitle, 'ai_generated'],
  );
  if (titleResult.source) fieldSources['resolvedTitle'] = titleResult.source;

  const subtitleResult = resolveField(
    [patch?.resolvedSubtitle, 'reviewhub_edit'],
    [input.draftSubtitle, 'ai_generated'],
  );
  if (subtitleResult.source) fieldSources['resolvedSubtitle'] = subtitleResult.source;

  return {
    filingPartyLegalName,
    filingPartyRole,
    isProSe,
    opposingPartyLegalName: opposingResult.value,
    opposingPartyRole: opposingPartyRole,
    captionPetitionerName,
    captionRespondentName,
    children,
    childrenNames,
    courtName: courtResult.value,
    judicialDistrict: districtResult.value,
    county: countyResult.value ?? '',
    state: stateResult.value ?? '',
    causeNumber: causeResult.value,
    assignedJudge: judgeResult.value,
    caseTitleFormat,
    caseTitleCustom,
    caseType,
    documentKind,
    filingType,
    amendmentLevel,
    numberingMode,
    resolvedTitle: titleResult.value ?? '',
    resolvedSubtitle: subtitleResult.value,
    fieldSources,
    schemaVersion: 1,
  };
}
