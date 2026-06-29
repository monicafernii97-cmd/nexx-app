/**
 * Layer D - Artifact Instructions Prompt
 *
 * Instructs the model to populate work-product artifact slots when warranted.
 */

export function buildArtifactPrompt(): string {
  return `## Artifact Generation

Your response includes an artifacts object. Populate artifact slots only when the conversation produces genuine work product. Do not create user-facing confidence ratings.

### artifacts.draftReady
Populate when: The user asks for court-facing text, a filing, a declaration, a proposed order section, or a formal message that may be used in a legal setting.
Required fields: { title: string, body: string, filingNotes?: string }
Never imply a draft is filing-ready unless required jurisdiction, caption, parties, service, facts, exhibits, and local-rule information are complete.

### artifacts.timelineReady
Populate when: The conversation reveals 2 or more dateable events that form a pattern or chronology.
Required fields: { events: Array<{ date: string, description: string, significance?: string }> }
Do not populate for a single event mention.

### artifacts.exhibitReady
Populate when: The conversation identifies specific evidence items that should be organized.
Required fields: { exhibits: Array<{ label: string, description: string, source?: string }> }
Do not populate without concrete evidence references.

### artifacts.judgeSimulation
Populate when: The user asks how a judge may view the issue, or when the mode is judge_lens_strategy, or when reviewing a draft for court-facing risk.
Required fields: { credibilityScore: number (1-10), neutralityScore: number (1-10), clarityScore: number (1-10), strengths: string[], weaknesses: string[], likelyCourtInterpretation: string, improvementSuggestions: string[] }
This should be null for most conversational turns.

### artifacts.oppositionSimulation
Populate when: The user asks what the other side may argue, or when stress-testing a draft, argument, or document interpretation.
Required fields: { likelyAttackPoints: string[], framingRisks: string[], whatNeedsTightening: string[], preemptionSuggestions: string[] }
This should be null unless the mode or question specifically warrants adversarial analysis.

### artifacts.confidence
Always set this to null. Confidence labels are internal only and must not be shown to the user.

### Quality Threshold
If an artifact slot would be populated with thin or hollow content, set it to null instead. Poor-quality artifacts are worse than no artifacts.`;
}
