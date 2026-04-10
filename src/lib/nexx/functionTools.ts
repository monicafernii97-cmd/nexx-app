/**
 * Function Tools — 8 model-callable backend actions.
 * 
 * These are registered as `type: "function"` tools in responses.create().
 * When the model returns a function_call output, the chat route executes
 * the corresponding handler and feeds the result back.
 */

import type { ConvexHttpClient } from 'convex/browser';
import type { Id } from '../../../convex/_generated/dataModel';

// ---------------------------------------------------------------------------
// Tool Definitions (passed to responses.create as tools array)
// ---------------------------------------------------------------------------

export const NEXX_FUNCTION_TOOLS = [
  {
    type: 'function' as const,
    name: 'create_incident_from_chat',
    description: 'Create a new incident record from facts discussed in chat. Use when the user describes a specific incident with dates and details.',
    parameters: {
      type: 'object',
      properties: {
        narrative: { type: 'string', description: 'The incident narrative' },
        category: { type: 'string', description: 'Incident category (emotional_abuse, financial_abuse, parental_alienation, harassment, threats, manipulation, neglect, other)' },
        date: { type: 'string', description: 'Date of the incident (ISO 8601)' },
      },
      required: ['narrative', 'category'],
    },
  },
  {
    type: 'function' as const,
    name: 'append_to_timeline',
    description: 'Add a timeline event from discussed facts. Use when the conversation reveals a dateable event.',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Event date (ISO 8601)' },
        description: { type: 'string', description: 'Event description' },
        significance: { type: 'string', description: 'Legal significance of this event' },
      },
      required: ['date', 'description'],
    },
  },
  {
    type: 'function' as const,
    name: 'generate_docuvault_draft',
    description: 'Trigger document drafting from chat context. Use when the user asks to create a formal document.',
    parameters: {
      type: 'object',
      properties: {
        templateId: { type: 'string', description: 'Template identifier (e.g., motion_modify_custody, declaration)' },
        facts: { type: 'object', description: 'Key facts to include in the draft' },
      },
      required: ['templateId'],
    },
  },
  {
    type: 'function' as const,
    name: 'save_case_note',
    description: 'Save a strategic note. Use when the user or NEXX identifies an important strategic insight.',
    parameters: {
      type: 'object',
      properties: {
        note: { type: 'string', description: 'The strategic note' },
        category: { type: 'string', description: 'Note category (strategy, evidence, procedure, follow_up)' },
      },
      required: ['note'],
    },
  },
  {
    type: 'function' as const,
    name: 'mark_evidence_theme',
    description: 'Flag an evidence theme in the case graph. Use when a pattern of behavior is identified.',
    parameters: {
      type: 'object',
      properties: {
        theme: { type: 'string', description: 'The evidence theme (e.g., communication_obstruction, schedule_interference)' },
        strongPoints: { type: 'array', items: { type: 'string' }, description: 'Strong evidence points' },
        weakPoints: { type: 'array', items: { type: 'string' }, description: 'Weak points or gaps' },
      },
      required: ['theme', 'strongPoints'],
    },
  },
  {
    type: 'function' as const,
    name: 'create_exhibit_index',
    description: 'Build an exhibit index from evidence items. Use when organizing multiple pieces of evidence.',
    parameters: {
      type: 'object',
      properties: {
        exhibits: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              description: { type: 'string' },
              source: { type: 'string' },
            },
            required: ['label', 'description'],
          },
        },
      },
      required: ['exhibits'],
    },
  },
  {
    type: 'function' as const,
    name: 'link_incident_to_motion',
    description: 'Cross-reference an incident to a motion. Use when connecting documented incidents to legal filings.',
    parameters: {
      type: 'object',
      properties: {
        incidentSummary: { type: 'string', description: 'Summary of the incident' },
        motionType: { type: 'string', description: 'Type of motion this supports' },
        relevance: { type: 'string', description: 'How this incident supports the motion' },
      },
      required: ['incidentSummary', 'motionType', 'relevance'],
    },
  },
  {
    type: 'function' as const,
    name: 'fetch_user_court_settings',
    description: 'Retrieve the user\'s saved court formatting settings. Use when the user asks about their court rules or when preparing a filing.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

// ---------------------------------------------------------------------------
// Handler Registry — maps tool names to execution functions
// ---------------------------------------------------------------------------

export type FunctionToolResult = {
  success: boolean;
  data?: unknown;
  error?: string;
};

/**
 * Execute a function tool call. Called from the chat route's function-call loop.
 */
export async function executeFunctionTool(
  toolName: string,
  args: Record<string, unknown>,
  context: {
    convex: ConvexHttpClient;
    userId: Id<'users'>;
    conversationId: Id<'conversations'>;
  }
): Promise<FunctionToolResult> {
  try {
    switch (toolName) {
      case 'create_incident_from_chat': {
        if (!args.narrative || typeof args.narrative !== 'string') {
          return { success: false, error: 'Missing required field: narrative' };
        }
        if (!args.category || typeof args.category !== 'string') {
          return { success: false, error: 'Missing required field: category' };
        }
        return await handleCreateIncident(args, context);
      }
      case 'append_to_timeline': {
        if (!args.date || typeof args.date !== 'string') {
          return { success: false, error: 'Missing required field: date' };
        }
        if (!args.description || typeof args.description !== 'string') {
          return { success: false, error: 'Missing required field: description' };
        }
        return handleAppendTimeline(args);
      }
      case 'generate_docuvault_draft': {
        if (!args.templateId || typeof args.templateId !== 'string') {
          return { success: false, error: 'Missing required field: templateId' };
        }
        return handleGenerateDraft(args);
      }
      case 'save_case_note': {
        if (!args.note || typeof args.note !== 'string') {
          return { success: false, error: 'Missing required field: note' };
        }
        return {
          success: false,
          data: { note: args.note, status: 'pending', requires_confirmation: true },
          error: 'Action staged but not yet executed. User must confirm in the Incident Log to save.',
        };
      }
      case 'mark_evidence_theme': {
        if (!args.theme || typeof args.theme !== 'string') {
          return { success: false, error: 'Missing required field: theme' };
        }
        if (!args.strongPoints || !Array.isArray(args.strongPoints)) {
          return { success: false, error: 'Missing required field: strongPoints (array)' };
        }
        return {
          success: false,
          data: { theme: args.theme, strongPoints: args.strongPoints, status: 'pending', requires_confirmation: true },
          error: 'Action staged but not yet executed. Theme will be saved to case graph when user confirms.',
        };
      }
      case 'create_exhibit_index': {
        if (!args.exhibits || !Array.isArray(args.exhibits)) {
          return { success: false, error: 'Missing required field: exhibits (array)' };
        }
        // Validate each exhibit item has required shape
        for (let i = 0; i < (args.exhibits as unknown[]).length; i++) {
          const item = (args.exhibits as Record<string, unknown>[])[i];
          if (!item || typeof item !== 'object') {
            return { success: false, error: `exhibits[${i}] must be an object` };
          }
          if (!item.label || typeof item.label !== 'string') {
            return { success: false, error: `exhibits[${i}] missing required field: label` };
          }
          if (!item.description || typeof item.description !== 'string') {
            return { success: false, error: `exhibits[${i}] missing required field: description` };
          }
        }
        return {
          success: false,
          data: { exhibits: args.exhibits, status: 'pending', requires_confirmation: true },
          error: 'Action staged but not yet executed. Exhibit index will be created when user confirms.',
        };
      }
      case 'link_incident_to_motion': {
        if (!args.incidentSummary || typeof args.incidentSummary !== 'string') {
          return { success: false, error: 'Missing required field: incidentSummary' };
        }
        if (!args.motionType || typeof args.motionType !== 'string') {
          return { success: false, error: 'Missing required field: motionType' };
        }
        if (!args.relevance || typeof args.relevance !== 'string') {
          return { success: false, error: 'Missing required field: relevance' };
        }
        return {
          success: false,
          data: { status: 'pending', requires_confirmation: true, incident: args.incidentSummary, motion: args.motionType, relevance: args.relevance },
          error: 'Action staged but not yet executed. Cross-reference will be saved when user confirms.',
        };
      }
      case 'fetch_user_court_settings':
        return handleFetchCourtSettings();
      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ---------------------------------------------------------------------------
// Individual handlers
// ---------------------------------------------------------------------------

async function handleCreateIncident(
  args: Record<string, unknown>,
  _context: { convex: ConvexHttpClient; userId: Id<'users'> }
): Promise<FunctionToolResult> {
  // The actual mutation is auth-guarded (uses getAuthenticatedUser internally),
  // so we can't call it from an HttpClient without Clerk token. Instead, return
  // the structured incident data for the chat page to persist client-side.
  const validCategories = [
    'emotional_abuse', 'financial_abuse', 'parental_alienation',
    'custody_violation', 'harassment', 'threats', 'manipulation', 'neglect', 'other',
  ] as const;
  const rawCategory = String(args.category || 'other');
  const category = validCategories.includes(rawCategory as typeof validCategories[number])
    ? rawCategory
    : 'other';

  return {
    success: true,
    data: {
      incident: {
        narrative: String(args.narrative || ''),
        category,
        date: args.date ? String(args.date) : new Date().toISOString().split('T')[0],
        time: '00:00',
        severity: 1,
      },
      note: 'Incident data extracted. User can review and confirm in Incident Log.',
    },
  };
}

function handleAppendTimeline(
  args: Record<string, unknown>,
): FunctionToolResult {
  // Timeline events are staged — merged into case graph on next update cycle.
  // The handler does NOT persist anything; it returns structured data for the model.
  return {
    success: false,
    data: {
      event: {
        date: args.date,
        description: args.description,
        significance: args.significance,
      },
    },
    error: 'Timeline event staged but not yet persisted. It will be merged into the case graph on the next summary compaction cycle.',
  };
}

function handleGenerateDraft(
  args: Record<string, unknown>,
): FunctionToolResult {
  // Draft generation is not yet implemented server-side.
  // Returns structured data so the model can inform the user.
  return {
    success: false,
    data: {
      templateId: args.templateId,
    },
    error: 'Draft generation is not yet automated. The user can create this document manually in DocuVault using the template.',
  };
}

function handleFetchCourtSettings(): FunctionToolResult {
  // Court settings retrieval is not yet implemented server-side.
  return {
    success: false,
    data: {},
    error: 'Court settings retrieval is not yet automated. The user can configure court rules in Settings > Court Rules.',
  };
}
