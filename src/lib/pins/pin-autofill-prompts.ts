/**
 * Pin Autofill Prompt Pack
 *
 * System prompt, per-type transformation instructions,
 * user prompt builder, and JSON schema for structured output.
 *
 * This module contains NO runtime dependencies — it is pure data
 * and string assembly so it can be tested independently.
 */

import type { PinnableType } from '@/lib/integration/types';
import type { PinAutofillInput } from './types';

// ═══════════════════════════════════════════════════════════════
// System Prompt
// ═══════════════════════════════════════════════════════════════

export const PIN_AUTOFILL_SYSTEM_PROMPT = `You are a pin autofill formatter for a legal/case-prep workspace.

Your job is to convert raw selected assistant text into a concise, structured, pin-ready result.

You must:
- distill long explanations into a clean, useful statement
- match the requested pin type exactly
- preserve factual meaning
- preserve dates, names, and key event details when present
- avoid repetition, filler, hedging, and conversational phrasing
- avoid inventing or assuming facts not present in the source text
- prefer concrete specifics over vague summaries
- produce text that is immediately useful in a workspace

Output style rules:
- Title must be short, scannable, and meaningful on its own
- Content must be concise and polished
- No markdown
- No bullet points
- No prefacing language like "Here is a revised version"
- No quotation marks unless required by the source
- Tone should be neutral, factual, professional, and clear

Title guidance:
- make the title useful in a pin list by itself
- avoid generic titles like "Important Point" or "Risk Issue"
- summarize the core issue in a compact phrase

If the selected text does not support a strong factual statement, preserve caution and phrase it narrowly.
If a fact should be verified before being relied on, reflect that in the wording when appropriate.

If the source text is too vague, incomplete, or speculative to support a strong clean statement:
- set confidence to "low"
- keep the wording narrow
- avoid overclaiming
- for question_to_verify, prefer a verification question instead of a statement

Return valid JSON only.`;

// ═══════════════════════════════════════════════════════════════
// Per-Type Instructions
// ═══════════════════════════════════════════════════════════════

export const PIN_TYPE_INSTRUCTIONS: Record<PinnableType, string> = {
  key_fact: `For key_fact:
- extract the single most important factual statement from the source
- keep it concrete, specific, and verifiable
- do not add interpretation or argument
- preserve dates, names, and event details when present`,

  strategy_point: `For strategy_point:
- convert the source into a tactical recommendation, next-step, or best argument framing
- make it action-oriented
- focus on what should be argued, requested, emphasized, clarified, opposed, or preserved
- do not write background history unless necessary
- do not sound emotional or speculative`,

  good_faith_point: `For good_faith_point:
- convert the source into a concise statement showing reasonableness, cooperation, flexibility, or constructive effort
- highlight attempts to resolve issues appropriately
- sound calm, fair, and credible
- avoid sounding self-congratulatory`,

  strength_highlight: `For strength_highlight:
- convert the source into the strongest favorable takeaway
- highlight a persuasive fact, consistent pattern, evidentiary advantage, or credibility point
- keep it concrete and persuasive without overstating`,

  risk_concern: `For risk_concern:
- convert the source into a concise statement of vulnerability, ambiguity, inconsistency, missing support, or litigation risk
- keep the wording grounded and sober
- do not exaggerate
- if the issue depends on missing proof, say so clearly`,

  hearing_prep_point: `For hearing_prep_point:
- convert the source into a courtroom-ready oral argument point
- keep it short, punchy, and judge-facing
- write it in a way the user could realistically say out loud at a hearing`,

  draft_snippet: `For draft_snippet:
- convert the source into polished draft language suitable for insertion into a filing, declaration, affidavit, motion, or court draft
- maintain a neutral-professional legal tone
- produce one or two clean sentences, or a short paragraph if needed
- avoid casual phrasing and rhetorical flourish`,

  question_to_verify: `For question_to_verify:
- convert the source into a precise verification question
- focus on a fact, date, document, message, or legal issue that should be confirmed before relying on the point
- do not phrase it as an argument
- phrasing should begin like "Verify whether...", "Confirm whether...", "Is there evidence that...", or "Do the records show..."`,

  timeline_anchor: `For timeline_anchor:
- convert the source into a timeline-ready date/event entry
- prefer exact date if clearly present
- if no exact date is present, use the most precise supported time reference available
- content should ideally follow this format: [Date] — [Event summary]
- keep it concise and chronologically useful`,
};

// ═══════════════════════════════════════════════════════════════
// User Prompt Builder
// ═══════════════════════════════════════════════════════════════

/** Assemble the full user prompt for the pin autofill call. */
export function buildPinAutofillUserPrompt(input: PinAutofillInput): string {
  const instructions = PIN_TYPE_INSTRUCTIONS[input.pinType];

  return `Pin type: ${input.pinType}

Raw selected text:
${input.rawSourceText}

Optional surrounding context:
${input.surroundingContext ?? 'None'}

${instructions}

Additional constraints:
- Title: 4 to 10 words preferred
- Content: 1 to 3 sentences preferred
- Content should usually stay under 450 characters unless draft_snippet genuinely requires more
- Do not copy the raw source text unless it is already concise and clean
- Rewrite for clarity
- Do not hallucinate missing facts, dates, or legal conclusions
- If source text is ambiguous, preserve that ambiguity rather than filling gaps

Return JSON with exactly this shape:
{
  "title": "string",
  "content": "string",
  "pinType": "${input.pinType}",
  "confidence": "low | medium | high",
  "detectedDate": "string or null"
}`;
}

// ═══════════════════════════════════════════════════════════════
// JSON Schema (for structured output validation)
// ═══════════════════════════════════════════════════════════════

export const PIN_AUTOFILL_JSON_SCHEMA = {
  name: 'pin_autofill_result',
  strict: true,
  schema: {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      title: { type: 'string' as const },
      content: { type: 'string' as const },
      pinType: {
        type: 'string' as const,
        enum: [
          'key_fact',
          'strategy_point',
          'good_faith_point',
          'strength_highlight',
          'risk_concern',
          'hearing_prep_point',
          'draft_snippet',
          'question_to_verify',
          'timeline_anchor',
        ],
      },
      confidence: {
        type: 'string' as const,
        enum: ['low', 'medium', 'high'],
      },
      detectedDate: {
        type: ['string', 'null'] as const,
      },
    },
    required: ['title', 'content', 'pinType', 'confidence', 'detectedDate'] as const,
  },
} as const;
