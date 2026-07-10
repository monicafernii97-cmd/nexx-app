/**
 * All structured output JSON schemas in one place.
 * These are passed via `text.format` in `responses.create`.
 * 
 * 18 schemas total — covering chat, incidents, court rules, resources,
 * compliance, memory, drafting, simulations, retrieval, confidence,
 * patterns, narrative, and reports.
 */

const nullableString = { type: ['string', 'null'] } as const;

const stringArray = {
  type: 'array',
  items: { type: 'string' },
} as const;

const draftReadySchema = {
  type: ['object', 'null'],
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    body: { type: 'string' },
    filingNotes: nullableString,
  },
  required: ['title', 'body', 'filingNotes'],
} as const;

const timelineReadySchema = {
  type: ['object', 'null'],
  additionalProperties: false,
  properties: {
    events: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          date: { type: 'string' },
          description: { type: 'string' },
          significance: nullableString,
        },
        required: ['date', 'description', 'significance'],
      },
    },
  },
  required: ['events'],
} as const;

const exhibitReadySchema = {
  type: ['object', 'null'],
  additionalProperties: false,
  properties: {
    exhibits: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          label: { type: 'string' },
          description: { type: 'string' },
          source: nullableString,
        },
        required: ['label', 'description', 'source'],
      },
    },
  },
  required: ['exhibits'],
} as const;

const judgeSimulationObjectSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    credibilityScore: { type: 'number' },
    neutralityScore: { type: 'number' },
    clarityScore: { type: 'number' },
    strengths: stringArray,
    weaknesses: stringArray,
    likelyCourtInterpretation: { type: 'string' },
    improvementSuggestions: stringArray,
  },
  required: [
    'credibilityScore',
    'neutralityScore',
    'clarityScore',
    'strengths',
    'weaknesses',
    'likelyCourtInterpretation',
    'improvementSuggestions',
  ],
} as const;

const judgeSimulationSchema = {
  ...judgeSimulationObjectSchema,
  type: ['object', 'null'],
} as const;

const oppositionSimulationObjectSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    likelyAttackPoints: stringArray,
    framingRisks: stringArray,
    whatNeedsTightening: stringArray,
    preemptionSuggestions: stringArray,
  },
  required: ['likelyAttackPoints', 'framingRisks', 'whatNeedsTightening', 'preemptionSuggestions'],
} as const;

const oppositionSimulationSchema = {
  ...oppositionSimulationObjectSchema,
  type: ['object', 'null'],
} as const;

const confidenceObjectSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    confidence: { type: 'string', enum: ['high', 'moderate', 'low'] },
    basis: { type: 'string' },
    evidenceSufficiency: { type: 'string' },
    missingSupport: stringArray,
  },
  required: ['confidence', 'basis', 'evidenceSufficiency', 'missingSupport'],
} as const;

const confidenceSchema = {
  ...confidenceObjectSchema,
  type: ['object', 'null'],
} as const;

const legalDocumentAnswerSchema = {
  type: ['object', 'null'],
  additionalProperties: false,
  properties: {
    answerType: {
      type: 'string',
      enum: [
        'direct_quote',
        'summary',
        'comparison',
        'interpretation',
        'timeline',
        'metadata',
        'not_found',
        'needs_review',
      ],
    },
    answer: { type: 'string' },
    claims: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          claim: { type: 'string' },
          claimType: {
            type: 'string',
            enum: ['document_fact', 'quote', 'summary', 'comparison', 'interpretation', 'procedural'],
          },
          sourceIds: { type: 'array', items: { type: 'string' } },
        },
        required: ['claim', 'claimType', 'sourceIds'],
      },
    },
    citations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          sourceId: { type: 'string' },
          pageStart: { type: ['number', 'null'] },
          pageEnd: { type: ['number', 'null'] },
          supports: { type: ['string', 'null'] },
          confidence: { type: ['string', 'null'], enum: ['high', 'medium', 'low', null] },
        },
        required: [
          'sourceId',
          'pageStart',
          'pageEnd',
          'supports',
          'confidence',
        ],
      },
    },
    warnings: { type: 'array', items: { type: 'string' } },
    unsupportedClaims: { type: 'array', items: { type: 'string' } },
    notFoundReason: { type: ['string', 'null'] },
  },
  required: ['answerType', 'answer', 'claims', 'citations', 'warnings', 'unsupportedClaims', 'notFoundReason'],
} as const;

const legalInterpretationClauseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    label: { type: 'string' },
    quote: { type: 'string' },
    sourceIds: { type: 'array', items: { type: 'string' } },
    pageStart: { type: ['number', 'null'] },
    pageEnd: { type: ['number', 'null'] },
  },
  required: ['label', 'quote', 'sourceIds', 'pageStart', 'pageEnd'],
} as const;

const legalInterpretationCompetingClauseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    label: { type: 'string' },
    quote: { type: 'string' },
    sourceIds: { type: 'array', items: { type: 'string' } },
    whyItDoesOrDoesNotControl: { type: 'string' },
  },
  required: ['label', 'quote', 'sourceIds', 'whyItDoesOrDoesNotControl'],
} as const;

const legalInterpretationPriorityLanguageSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    signal: {
      type: 'string',
      enum: [
        'except_as_otherwise_provided',
        'notwithstanding',
        'specific_over_general',
        'later_modification',
        'other',
      ],
    },
    explanation: { type: 'string' },
    sourceIds: { type: 'array', items: { type: 'string' } },
  },
  required: ['signal', 'explanation', 'sourceIds'],
} as const;

const legalInterpretationSchema = {
  type: ['object', 'null'],
  additionalProperties: false,
  properties: {
    answerType: { type: 'string', enum: ['order_interpretation'] },
    directAnswer: { type: 'string' },
    userFacingCertainty: {
      type: 'string',
      enum: ['clear', 'best_reading', 'ambiguous', 'insufficient_text'],
    },
    controllingClauses: {
      type: 'array',
      items: legalInterpretationClauseSchema,
    },
    competingClauses: {
      type: 'array',
      items: legalInterpretationCompetingClauseSchema,
    },
    priorityLanguage: {
      type: 'array',
      items: legalInterpretationPriorityLanguageSchema,
    },
    interpretation: {
      type: 'object',
      additionalProperties: false,
      properties: {
        plainEnglish: { type: 'string' },
        legalReading: { type: 'string' },
        opposingArgument: { type: ['string', 'null'] },
        responseToOpposingArgument: { type: ['string', 'null'] },
      },
      required: ['plainEnglish', 'legalReading', 'opposingArgument', 'responseToOpposingArgument'],
    },
    practicalMeaning: {
      type: 'object',
      additionalProperties: false,
      properties: {
        result: { type: 'string' },
        startTime: { type: ['string', 'null'] },
        endTime: { type: ['string', 'null'] },
        whatUserShouldDo: { type: ['string', 'null'] },
      },
      required: ['result', 'startTime', 'endTime', 'whatUserShouldDo'],
    },
    draftMessage: {
      type: ['object', 'null'],
      additionalProperties: false,
      properties: {
        tone: { type: 'string', enum: ['neutral', 'firm', 'court_ready'] },
        text: { type: 'string' },
      },
      required: ['tone', 'text'],
    },
    caveats: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'answerType',
    'directAnswer',
    'userFacingCertainty',
    'controllingClauses',
    'competingClauses',
    'priorityLanguage',
    'interpretation',
    'practicalMeaning',
    'draftMessage',
    'caveats',
  ],
} as const;

const litigationNavigationIssueSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    issue: { type: 'string' },
    priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'later'] },
    whatItMeans: { type: 'string' },
    nextStep: { type: 'string' },
  },
  required: ['issue', 'priority', 'whatItMeans', 'nextStep'],
} as const;

const stringArraySchema = { type: 'array', items: { type: 'string' } } as const;

const localLegalResourceLookupSchema = {
  type: ['object', 'null'],
  additionalProperties: false,
  properties: {
    jurisdiction: {
      type: 'object',
      additionalProperties: false,
      properties: {
        state: nullableString,
        county: nullableString,
        courtName: nullableString,
      },
      required: ['state', 'county', 'courtName'],
    },
    feeSources: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          sourceId: { type: 'string' },
          title: { type: 'string' },
          sourceType: {
            type: 'string',
            enum: ['official_court', 'district_clerk', 'efiling', 'legal_aid', 'bar_referral', 'law_library', 'other'],
          },
          summary: { type: 'string' },
          url: nullableString,
          retrievedAt: { type: 'string' },
        },
        required: ['sourceId', 'title', 'sourceType', 'summary', 'url', 'retrievedAt'],
      },
    },
    resources: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          type: {
            type: 'string',
            enum: [
              'legal_aid',
              'lawyer_referral',
              'limited_scope',
              'district_clerk',
              'official_fee_schedule',
              'bar_referral',
              'court_forms',
              'fee_waiver',
              'law_library',
              'self_help',
              'efiling',
            ],
          },
          summary: { type: 'string' },
          url: nullableString,
          retrievedAt: { type: 'string' },
        },
        required: ['name', 'type', 'summary', 'url', 'retrievedAt'],
      },
    },
    exactFeeFindings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          feeType: { type: 'string' },
          amount: { type: 'string' },
          sourceId: { type: 'string' },
          sourceTitle: { type: 'string' },
          retrievedAt: { type: 'string' },
        },
        required: ['feeType', 'amount', 'sourceId', 'sourceTitle', 'retrievedAt'],
      },
    },
    warnings: stringArraySchema,
  },
  required: ['jurisdiction', 'feeSources', 'resources', 'exactFeeFindings', 'warnings'],
} as const;

const proSeDraftingReadinessSchema = {
  type: ['object', 'null'],
  additionalProperties: false,
  properties: {
    requestedDocument: {
      type: 'string',
      enum: ['answer', 'response_to_motion', 'declaration', 'fee_waiver', 'exhibit_list', 'hearing_outline', 'co_parent_message', 'timeline'],
    },
    readinessStage: {
      type: 'string',
      enum: ['working_draft', 'missing_case_facts', 'structurally_complete', 'local_rules_verified', 'ready_for_final_filing_review'],
    },
    isFilingReady: { type: 'boolean' },
    confirmedFacts: stringArraySchema,
    missingFacts: stringArraySchema,
    notApplicableFacts: stringArraySchema,
    draftingNote: { type: 'string' },
  },
  required: ['requestedDocument', 'readinessStage', 'isFilingReady', 'confirmedFacts', 'missingFacts', 'notApplicableFacts', 'draftingNote'],
} as const;

const orderAuthorityStatusSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: {
      type: 'string',
      enum: ['signed_and_entered', 'signed_not_confirmed_entered', 'temporary_active', 'temporary_expired', 'proposed_unsigned', 'superseded', 'unknown'],
    },
    signedDate: nullableString,
    filedDate: nullableString,
    supersededBy: nullableString,
    enforceabilityConfirmed: { type: 'boolean' },
    sourceIds: stringArraySchema,
  },
  required: ['status', 'signedDate', 'filedDate', 'supersededBy', 'enforceabilityConfirmed', 'sourceIds'],
} as const;

const orderVersionSchema = {
  type: ['object', 'null'],
  additionalProperties: false,
  properties: {
    activeOrderFileId: nullableString,
    activeOrderFileName: nullableString,
    authorityStatus: orderAuthorityStatusSchema,
    candidateCount: { type: 'number' },
    needsUserSelection: { type: 'boolean' },
  },
  required: ['activeOrderFileId', 'activeOrderFileName', 'authorityStatus', 'candidateCount', 'needsUserSelection'],
} as const;

const legalBasisSchema = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    properties: {
      basisType: {
        type: 'string',
        enum: ['signed_order', 'later_modification', 'statute', 'state_rule', 'local_rule', 'official_form_instruction', 'general_practice', 'reasoned_interpretation'],
      },
      proposition: { type: 'string' },
      jurisdiction: nullableString,
      citation: nullableString,
      effectiveDate: nullableString,
      sourceIds: stringArraySchema,
    },
    required: ['basisType', 'proposition', 'jurisdiction', 'citation', 'effectiveDate', 'sourceIds'],
  },
} as const;

const deadlineAnalysisSchema = {
  type: ['object', 'null'],
  additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['not_applicable', 'needs_inputs', 'express_date_only', 'calculation_ready', 'calculated'] },
    trigger: nullableString,
    serviceMethod: nullableString,
    governingRule: nullableString,
    jurisdiction: nullableString,
    timezone: nullableString,
    calendarTreatment: nullableString,
    calendarDate: nullableString,
    sourcedDates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          label: { type: 'string' },
          value: { type: 'string' },
          sourceIds: stringArraySchema,
          pageStart: { type: ['number', 'null'] },
          pageEnd: { type: ['number', 'null'] },
        },
        required: ['label', 'value', 'sourceIds', 'pageStart', 'pageEnd'],
      },
    },
    missingInputs: stringArraySchema,
    explanation: { type: 'string' },
  },
  required: ['status', 'trigger', 'serviceMethod', 'governingRule', 'jurisdiction', 'timezone', 'calendarTreatment', 'calendarDate', 'sourcedDates', 'missingInputs', 'explanation'],
} as const;

const litigationNavigationSchema = {
  type: ['object', 'null'],
  additionalProperties: false,
  properties: {
    answerType: { type: 'string', enum: ['litigation_navigation'] },
    supportiveSummary: { type: 'string' },
    immediatePriority: {
      type: 'object',
      additionalProperties: false,
      properties: {
        priority: { type: 'string' },
        whyItMatters: { type: 'string' },
        whatToDoNow: { type: 'string' },
      },
      required: ['priority', 'whyItMatters', 'whatToDoNow'],
    },
    issueBreakdown: {
      type: 'array',
      items: litigationNavigationIssueSchema,
    },
    courtPosture: {
      type: 'object',
      additionalProperties: false,
      properties: {
        whatWeKnow: stringArraySchema,
        whatWeNeed: stringArraySchema,
        possibleFilingOrResponse: {
          type: 'string',
          enum: [
            'answer',
            'response_to_motion',
            'counterpetition',
            'declaration',
            'motion_to_modify',
            'motion_to_enforce',
            'temporary_orders_response',
            'unknown',
          ],
        },
        deadlineNote: { type: ['string', 'null'] },
        hearingNote: { type: ['string', 'null'] },
      },
      required: ['whatWeKnow', 'whatWeNeed', 'possibleFilingOrResponse', 'deadlineNote', 'hearingNote'],
    },
    coParentResponse: {
      type: 'object',
      additionalProperties: false,
      properties: {
        needed: { type: 'boolean' },
        strategy: { type: 'string' },
        neutralDraft: { type: ['string', 'null'] },
        firmerDraft: { type: ['string', 'null'] },
        whatNotToSay: stringArraySchema,
      },
      required: ['needed', 'strategy', 'neutralDraft', 'firmerDraft', 'whatNotToSay'],
    },
    evidencePlan: {
      type: 'object',
      additionalProperties: false,
      properties: {
        timelineItems: stringArraySchema,
        evidenceToSave: stringArraySchema,
        neutralFraming: stringArraySchema,
        exhibitIdeas: stringArraySchema,
      },
      required: ['timelineItems', 'evidenceToSave', 'neutralFraming', 'exhibitIdeas'],
    },
    proSeAssessment: {
      type: 'object',
      additionalProperties: false,
      properties: {
        possibleProSe: { type: 'boolean' },
        practicalRead: { type: 'string' },
        tasksLikelyDoableProSe: stringArraySchema,
        tasksHigherRiskWithoutAttorney: stringArraySchema,
        limitedScopeHelpRecommendedFor: stringArraySchema,
      },
      required: [
        'possibleProSe',
        'practicalRead',
        'tasksLikelyDoableProSe',
        'tasksHigherRiskWithoutAttorney',
        'limitedScopeHelpRecommendedFor',
      ],
    },
    costOverview: {
      type: 'object',
      additionalProperties: false,
      properties: {
        proSeCostCategories: stringArraySchema,
        attorneyCostCategories: stringArraySchema,
        exactCostsRequireLocalLookup: { type: 'boolean' },
        costExplanation: { type: 'string' },
      },
      required: ['proSeCostCategories', 'attorneyCostCategories', 'exactCostsRequireLocalLookup', 'costExplanation'],
    },
    resourcePlan: {
      type: 'object',
      additionalProperties: false,
      properties: {
        stateNeeded: { type: 'boolean' },
        countyNeeded: { type: 'boolean' },
        resourceTypesToFind: stringArraySchema,
        suggestedSearchTargets: stringArraySchema,
      },
      required: ['stateNeeded', 'countyNeeded', 'resourceTypesToFind', 'suggestedSearchTargets'],
    },
    judgeExplanation: {
      type: 'object',
      additionalProperties: false,
      properties: {
        simpleTheory: { type: 'string' },
        judgeReadyStructure: stringArraySchema,
        sampleOpening: { type: ['string', 'null'] },
      },
      required: ['simpleTheory', 'judgeReadyStructure', 'sampleOpening'],
    },
    filingPlan: {
      type: 'object',
      additionalProperties: false,
      properties: {
        likelyNextDocument: { type: ['string', 'null'] },
        filingReadinessChecklist: stringArraySchema,
        nextInfoNeededBeforeDrafting: stringArraySchema,
      },
      required: ['likelyNextDocument', 'filingReadinessChecklist', 'nextInfoNeededBeforeDrafting'],
    },
    nextSteps: stringArraySchema,
  },
  required: [
    'answerType',
    'supportiveSummary',
    'immediatePriority',
    'issueBreakdown',
    'courtPosture',
    'coParentResponse',
    'evidencePlan',
    'proSeAssessment',
    'costOverview',
    'resourcePlan',
    'judgeExplanation',
    'filingPlan',
    'nextSteps',
  ],
} as const;

// ---------------------------------------------------------------------------
// 1. Chat Response Schema (nexx_assistant_response)
// ---------------------------------------------------------------------------

export const NEXX_RESPONSE_SCHEMA = {
  type: 'json_schema' as const,
  name: 'nexx_assistant_response',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      message: { type: 'string' },
      artifacts: {
        type: 'object',
        additionalProperties: false,
        properties: {
          draftReady: draftReadySchema,
          timelineReady: timelineReadySchema,
          exhibitReady: exhibitReadySchema,
          judgeSimulation: judgeSimulationSchema,
          oppositionSimulation: oppositionSimulationSchema,
          confidence: confidenceSchema,
        },
        required: ['draftReady', 'timelineReady', 'exhibitReady',
                   'judgeSimulation', 'oppositionSimulation', 'confidence'],
      },
      documentAnswer: legalDocumentAnswerSchema,
      legalInterpretation: legalInterpretationSchema,
      litigationNavigation: litigationNavigationSchema,
      localResourceLookup: localLegalResourceLookupSchema,
      proSeDraftingReadiness: proSeDraftingReadinessSchema,
      orderVersion: orderVersionSchema,
      legalBasis: legalBasisSchema,
      deadlineAnalysis: deadlineAnalysisSchema,
    },
    required: [
      'message',
      'artifacts',
      'documentAnswer',
      'legalInterpretation',
      'litigationNavigation',
      'localResourceLookup',
      'proSeDraftingReadiness',
      'orderVersion',
      'legalBasis',
      'deadlineAnalysis',
    ],
  },
};

// ---------------------------------------------------------------------------
// 2. Incident Analysis Schema
// ---------------------------------------------------------------------------

export const INCIDENT_ANALYSIS_SCHEMA = {
  type: 'json_schema' as const,
  name: 'incident_analysis',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      courtSummary: { type: 'string' },
      behavioralAnalysis: { type: 'string' },
      strategicResponse: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
      timelineEvent: {
        type: 'object',
        additionalProperties: false,
        properties: {
          date: { type: ['string', 'null'] },
          time: { type: ['string', 'null'] },
          location: { type: ['string', 'null'] },
          childImpact: { type: ['string', 'null'] },
          evidenceType: { type: 'array', items: { type: 'string' } },
        },
        required: ['date', 'time', 'location', 'childImpact', 'evidenceType'],
      },
      evidenceStrength: { type: 'string', enum: ['weak', 'moderate', 'strong'] },
      missingEvidence: { type: 'array', items: { type: 'string' } },
    },
    required: ['courtSummary', 'behavioralAnalysis', 'strategicResponse', 'tags',
               'timelineEvent', 'evidenceStrength', 'missingEvidence'],
  },
};

// ---------------------------------------------------------------------------
// 3. Court Formatting Rules Schema
// ---------------------------------------------------------------------------

export const COURT_FORMATTING_RULES_SCHEMA = {
  type: 'json_schema' as const,
  name: 'court_formatting_rules',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      fontFamily: { type: 'string' },
      fontSize: { type: 'string' },
      lineSpacing: { type: 'string' },
      marginTop: { type: 'string' },
      marginBottom: { type: 'string' },
      marginLeft: { type: 'string' },
      marginRight: { type: 'string' },
      pageNumbering: { type: 'string' },
      captionFormat: { type: 'string' },
      signatureBlock: { type: 'string' },
      filingDeadlineDays: { type: ['number', 'null'] },
      eFilingRequired: { type: 'boolean' },
      localNotes: { type: ['string', 'null'] },
    },
    required: ['fontFamily', 'fontSize', 'lineSpacing', 'marginTop', 'marginBottom',
               'marginLeft', 'marginRight', 'pageNumbering', 'captionFormat',
               'signatureBlock', 'eFilingRequired'],
  },
};

// ---------------------------------------------------------------------------
// 4. Resources Schema
// ---------------------------------------------------------------------------

export const RESOURCES_SCHEMA = {
  type: 'json_schema' as const,
  name: 'resources_lookup',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      familyDivision: { type: ['object', 'null'] },
      legalAid: { type: 'array', items: { type: 'object' } },
      mediation: { type: 'array', items: { type: 'object' } },
      shelters: { type: 'array', items: { type: 'object' } },
      nonprofits: { type: 'array', items: { type: 'object' } },
      caseSearch: { type: ['object', 'null'] },
      eFilingPortal: { type: ['object', 'null'] },
    },
    required: ['legalAid', 'mediation', 'shelters', 'nonprofits'],
  },
};

// ---------------------------------------------------------------------------
// 5. Compliance Report Schema
// ---------------------------------------------------------------------------

export const COMPLIANCE_REPORT_SCHEMA = {
  type: 'json_schema' as const,
  name: 'compliance_report',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      overallStatus: { type: 'string', enum: ['pass', 'warning', 'fail'] },
      checks: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            rule: { type: 'string' },
            status: { type: 'string', enum: ['pass', 'warning', 'fail'] },
            detail: { type: 'string' },
            fix: { type: ['string', 'null'] },
          },
          required: ['rule', 'status', 'detail'],
        },
      },
      suggestions: { type: 'array', items: { type: 'string' } },
    },
    required: ['overallStatus', 'checks', 'suggestions'],
  },
};

// ---------------------------------------------------------------------------
// 6. Conversation Summary Schema (memory compaction)
// ---------------------------------------------------------------------------

export const CONVERSATION_SUMMARY_SCHEMA = {
  type: 'json_schema' as const,
  name: 'conversation_summary',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      decisions: { type: 'array', items: { type: 'string' } },
      keyFacts: { type: 'array', items: { type: 'string' } },
      dates: { type: 'array', items: { type: 'string' } },
      goals: { type: 'array', items: { type: 'string' } },
      unresolvedQuestions: { type: 'array', items: { type: 'string' } },
    },
    required: ['decisions', 'keyFacts', 'dates', 'goals', 'unresolvedQuestions'],
  },
};

// ---------------------------------------------------------------------------
// 7. Case Graph Update Schema
// ---------------------------------------------------------------------------

export const CASE_GRAPH_UPDATE_SCHEMA = {
  type: 'json_schema' as const,
  name: 'case_graph_update',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      jurisdiction: { type: ['object', 'null'] },
      parties: { type: ['object', 'null'] },
      children: { type: ['array', 'null'] },
      custodyStructure: { type: ['object', 'null'] },
      currentOrders: { type: ['array', 'null'] },
      openIssues: { type: ['array', 'null'] },
      timeline: { type: ['array', 'null'] },
      evidenceThemes: { type: ['array', 'null'] },
      communicationPatterns: { type: ['array', 'null'] },
      proceduralState: { type: ['object', 'null'] },
    },
    required: [],
  },
};

// ---------------------------------------------------------------------------
// 8. Document Draft Schema
// ---------------------------------------------------------------------------

export const DOCUMENT_DRAFT_SCHEMA = {
  type: 'json_schema' as const,
  name: 'document_draft',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      sections: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sectionId: { type: 'string' },
            heading: { type: 'string' },
            body: { type: 'string' },
            numberedItems: { type: ['array', 'null'], items: { type: 'string' } },
          },
          required: ['sectionId', 'heading', 'body'],
        },
      },
    },
    required: ['sections'],
  },
};

// ---------------------------------------------------------------------------
// 9. Parsed Legal Document Schema
// ---------------------------------------------------------------------------

export const PARSED_LEGAL_DOCUMENT_SCHEMA = {
  type: 'json_schema' as const,
  name: 'parsed_legal_document',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: { type: ['string', 'null'] },
      docType: { type: ['string', 'null'] },
      signedDate: { type: ['string', 'null'] },
      keyClauses: { type: ['array', 'null'], items: { type: 'string' } },
      deadlines: { type: ['array', 'null'], items: { type: 'string' } },
      obligations: { type: ['array', 'null'], items: { type: 'string' } },
      custodyTerms: { type: ['array', 'null'], items: { type: 'string' } },
      communicationTerms: { type: ['array', 'null'], items: { type: 'string' } },
    },
    required: [],
  },
};

// ---------------------------------------------------------------------------
// 10. Judge Simulation Schema
// ---------------------------------------------------------------------------

export const JUDGE_SIMULATION_SCHEMA = {
  type: 'json_schema' as const,
  name: 'judge_simulation',
  schema: judgeSimulationObjectSchema,
};

// ---------------------------------------------------------------------------
// 11. Opposition Simulation Schema
// ---------------------------------------------------------------------------

export const OPPOSITION_SIMULATION_SCHEMA = {
  type: 'json_schema' as const,
  name: 'opposition_simulation',
  schema: oppositionSimulationObjectSchema,
};

// ---------------------------------------------------------------------------
// 12. Evidence Packet Schema (retrieval ranker output)
// ---------------------------------------------------------------------------

export const EVIDENCE_PACKET_SCHEMA = {
  type: 'json_schema' as const,
  name: 'evidence_packet',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      keyPassages: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sourceTitle: { type: 'string' },
            excerpt: { type: 'string' },
            reasonRelevant: { type: 'string' },
          },
          required: ['sourceTitle', 'excerpt', 'reasonRelevant'],
        },
      },
      unresolvedGaps: { type: 'array', items: { type: 'string' } },
    },
    required: ['keyPassages', 'unresolvedGaps'],
  },
};

// ---------------------------------------------------------------------------
// 13. Legal Confidence Schema
// ---------------------------------------------------------------------------

export const LEGAL_CONFIDENCE_SCHEMA = {
  type: 'json_schema' as const,
  name: 'legal_confidence',
  schema: confidenceObjectSchema,
};

// ---------------------------------------------------------------------------
// 14. Court Rule Provenance Schema
// ---------------------------------------------------------------------------

export const COURT_RULE_PROVENANCE_SCHEMA = {
  type: 'json_schema' as const,
  name: 'court_rule_provenance',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      field: { type: 'string' },
      value: { type: 'string' },
      sourceUrl: { type: 'string' },
      sourceSnippet: { type: 'string' },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    },
    required: ['field', 'value', 'sourceUrl', 'sourceSnippet', 'confidence'],
  },
};

// ---------------------------------------------------------------------------
// 15. Template Draft Plan Schema
// ---------------------------------------------------------------------------

export const TEMPLATE_DRAFT_PLAN_SCHEMA = {
  type: 'json_schema' as const,
  name: 'template_draft_plan',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      templateId: { type: 'string' },
      requiredFacts: { type: 'array', items: { type: 'string' } },
      optionalFacts: { type: 'array', items: { type: 'string' } },
      missingFacts: { type: 'array', items: { type: 'string' } },
    },
    required: ['templateId', 'requiredFacts', 'optionalFacts', 'missingFacts'],
  },
};

// ---------------------------------------------------------------------------
// 16. Pattern Detection Schema (workspace patterns API)
// ---------------------------------------------------------------------------

export const PATTERN_DETECTION_SCHEMA = {
  type: 'json_schema' as const,
  name: 'pattern_detection',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      patterns: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            title: { type: 'string' },
            summary: { type: 'string' },
            category: { type: 'string' },
            supportingEvents: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  date: { type: 'string' },
                  description: { type: 'string' },
                  sourceType: { type: 'string', enum: ['message', 'timeline', 'pin', 'incident'] },
                  sourceId: { type: ['string', 'null'] },
                },
                required: ['date', 'description', 'sourceType'],
              },
            },
            behavioralSimilarity: { type: 'string', enum: ['weak', 'moderate', 'strong'] },
            observability: { type: 'string', enum: ['interpretive', 'mostly_observable', 'clearly_observable'] },
          },
          required: ['title', 'summary', 'category', 'supportingEvents', 'behavioralSimilarity', 'observability'],
        },
      },
      suppressedCandidates: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            reason: { type: 'string' },
            eventCount: { type: 'number' },
            category: { type: 'string' },
          },
          required: ['reason', 'eventCount', 'category'],
        },
      },
    },
    required: ['patterns', 'suppressedCandidates'],
  },
};

// ---------------------------------------------------------------------------
// 17. Case Narrative Schema (workspace narrative API)
// ---------------------------------------------------------------------------

export const CASE_NARRATIVE_SCHEMA = {
  type: 'json_schema' as const,
  name: 'case_narrative',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: { type: 'string' },
      overview: { type: 'string' },
      keyFactsSummary: { type: 'array', items: { type: 'string' } },
      timelineSummary: { type: 'array', items: { type: 'string' } },
      supportedPatternsSummary: { type: 'array', items: { type: 'string' } },
      openQuestions: { type: 'array', items: { type: 'string' } },
      narrative: { type: 'string' },
    },
    required: ['title', 'overview', 'keyFactsSummary', 'timelineSummary',
               'supportedPatternsSummary', 'openQuestions', 'narrative'],
  },
};

// ---------------------------------------------------------------------------
// 18. Case Report Schema (workspace report API)
// ---------------------------------------------------------------------------

export const CASE_REPORT_SCHEMA = {
  type: 'json_schema' as const,
  name: 'case_report',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: { type: 'string' },
      sections: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            heading: { type: 'string' },
            body: { type: 'string' },
          },
          required: ['heading', 'body'],
        },
      },
      summary: { type: 'string' },
      recommendations: { type: 'array', items: { type: 'string' } },
    },
    required: ['title', 'sections', 'summary', 'recommendations'],
  },
};
