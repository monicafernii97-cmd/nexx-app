/**
 * All structured output JSON schemas in one place.
 * These are passed via `text.format` in `responses.create`.
 * 
 * 15 schemas total — covering chat, incidents, court rules, resources,
 * compliance, memory, drafting, simulations, retrieval, and confidence.
 */

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
          draftReady: { type: ['object', 'null'] },
          timelineReady: { type: ['object', 'null'] },
          exhibitReady: { type: ['object', 'null'] },
          judgeSimulation: { type: ['object', 'null'] },
          oppositionSimulation: { type: ['object', 'null'] },
          confidence: { type: ['object', 'null'] },
        },
        required: ['draftReady', 'timelineReady', 'exhibitReady',
                   'judgeSimulation', 'oppositionSimulation', 'confidence'],
      },
    },
    required: ['message', 'artifacts'],
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
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      credibilityScore: { type: 'number' },
      neutralityScore: { type: 'number' },
      clarityScore: { type: 'number' },
      strengths: { type: 'array', items: { type: 'string' } },
      weaknesses: { type: 'array', items: { type: 'string' } },
      likelyCourtInterpretation: { type: 'string' },
      improvementSuggestions: { type: 'array', items: { type: 'string' } },
    },
    required: ['credibilityScore', 'neutralityScore', 'clarityScore',
               'strengths', 'weaknesses', 'likelyCourtInterpretation', 'improvementSuggestions'],
  },
};

// ---------------------------------------------------------------------------
// 11. Opposition Simulation Schema
// ---------------------------------------------------------------------------

export const OPPOSITION_SIMULATION_SCHEMA = {
  type: 'json_schema' as const,
  name: 'opposition_simulation',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      likelyAttackPoints: { type: 'array', items: { type: 'string' } },
      framingRisks: { type: 'array', items: { type: 'string' } },
      whatNeedsTightening: { type: 'array', items: { type: 'string' } },
      preemptionSuggestions: { type: 'array', items: { type: 'string' } },
    },
    required: ['likelyAttackPoints', 'framingRisks', 'whatNeedsTightening', 'preemptionSuggestions'],
  },
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
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      confidence: { type: 'string', enum: ['high', 'moderate', 'low'] },
      basis: { type: 'string' },
      evidenceSufficiency: { type: 'string' },
      missingSupport: { type: 'array', items: { type: 'string' } },
    },
    required: ['confidence', 'basis', 'evidenceSufficiency', 'missingSupport'],
  },
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
