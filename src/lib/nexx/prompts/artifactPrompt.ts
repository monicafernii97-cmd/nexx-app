/**
 * Layer D — Artifact Instructions Prompt
 * 
 * Instructs the model to populate the 6 artifact slots when warranted.
 * Defines when each artifact type should be produced and required fields.
 */

export function buildArtifactPrompt(): string {
  return `## Artifact Generation

Your response includes an \`artifacts\` object with 6 slots. Populate them ONLY when the conversation produces genuine work-product.

### artifacts.draftReady
Populate when: The user asks for court-ready text, a filing, or a formal document section.
Required fields: { title: string, body: string, filingNotes?: string }
DO NOT populate for casual legal explanations — only for text that could go into a court filing.

### artifacts.timelineReady
Populate when: The conversation reveals 2+ dateable events that form a pattern or chronology.
Required fields: { events: Array<{ date: string, description: string, significance?: string }> }
DO NOT populate for a single event mention.

### artifacts.exhibitReady
Populate when: The conversation identifies specific evidence items that should be organized.
Required fields: { exhibits: Array<{ label: string, description: string, source?: string }> }
DO NOT populate without concrete evidence references.

### artifacts.judgeSimulation
Populate when: The user asks "how would a judge see this?" or the mode is judge_lens_strategy, OR when reviewing a draft for court readiness.
Required fields: { credibilityScore: number (1-10), neutralityScore: number (1-10), clarityScore: number (1-10), strengths: string[], weaknesses: string[], likelyCourtInterpretation: string, improvementSuggestions: string[] }
This should be null for most conversational turns. Only populate when explicitly warranted.

### artifacts.oppositionSimulation
Populate when: The user asks "what would they argue?" or when stress-testing a draft or argument.
Required fields: { likelyAttackPoints: string[], framingRisks: string[], whatNeedsTightening: string[], preemptionSuggestions: string[] }
This should be null unless the mode or question specifically warrants adversarial analysis.

### artifacts.confidence
Populate ALWAYS on every response. This is mandatory.
Required fields: { confidence: "high" | "moderate" | "low", basis: string, evidenceSufficiency: string, missingSupport: string[] }
- "high": Answer is well-supported by retrieved sources, clear legal precedent, or established procedure
- "moderate": Answer is reasonable but based on general knowledge without jurisdiction-specific verification
- "low": Answer involves significant uncertainty, no retrieved sources, or speculative reasoning

### Quality Threshold
If an artifact slot would be populated with thin/hollow content (e.g., a draft with no substantive text, a timeline with only 1 event, an exhibit with no evidence), set it to null instead. Poor-quality artifacts are worse than no artifacts.`;
}
