/**
 * Signal Rules — Deterministic keyword/phrase detection + scoring weights.
 *
 * This is the core scoring engine. It operates on individual sentences
 * and uses pattern matching (regex + keyword lists) to produce weighted
 * scores across all 11 content types.
 *
 * NO LLM calls. Pure deterministic rules.
 *
 * Scoring Priority:
 * Tier 1: Explicit user tags (highest weight)
 * Tier 2: Source-type defaults
 * Tier 3: Language patterns (this file)
 * Tier 4: Linked context (evidence/timeline)
 * Tier 5: LLM disambiguation (future, low-confidence only)
 */

import type { SentenceType, ExtractedSignals } from '../types/classification';
import { SENTENCE_TYPES, emptyScores } from '../types/classification';
import type { WorkspaceNodeType } from '../types/workspace';

// ---------------------------------------------------------------------------
// Signal Detection — Boolean flag computation
// ---------------------------------------------------------------------------

// Regex patterns for signal detection
const DATE_PATTERNS = [
    /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/,                       // MM/DD/YYYY
    /\b\d{4}-\d{2}-\d{2}\b/,                                 // ISO
    /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s*\d{4}\b/i,
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{1,2},?\s*\d{4}\b/i,
];

const TIME_PATTERNS = [
    /\b\d{1,2}:\d{2}\s*(?:AM|PM|a\.m\.|p\.m\.)\b/i,
    /\b\d{1,2}:\d{2}\b/,
];

const COURT_TERMS = [
    'court', 'judge', 'hearing', 'trial', 'motion', 'order', 'petition',
    'respondent', 'petitioner', 'movant', 'plaintiff', 'defendant',
    'filing', 'filings', 'docket', 'case number', 'cause number',
    'caption', 'certificate of service', 'notice', 'affidavit',
    'declaration', 'temporary restraining order', 'injunction',
    'discovery', 'deposition', 'subpoena', 'stipulation',
    'standing order', 'local rule', 'civil procedure',
];

const RELIEF_VERBS = [
    'requests', 'asks', 'seeks', 'moves', 'prays',
    'should order', 'respectfully requests', 'petitions',
    'requests that the court', 'moves this court',
];

const EMOTION_WORDS = [
    'feel', 'feeling', 'felt', 'overwhelmed', 'exhausted', 'frustrated',
    'angry', 'scared', 'anxious', 'worried', 'upset', 'stressed',
    'devastated', 'heartbroken', 'terrified', 'furious', 'helpless',
    'hopeless', 'desperate', 'hurt', 'painful', 'suffering', 'miserable',
    'depressed', 'afraid', 'panicked', 'humiliated', 'ashamed',
    'disgusted', 'resentful', 'bitter', 'outraged',
];

const REASONING_PHRASES = [
    'because', 'therefore', 'consequently', 'as a result',
    'demonstrates', 'indicates', 'shows that', 'establishes',
    'is consistent with', 'supports', 'suggests that',
    'accordingly', 'thus', 'hence', 'for this reason',
    'given that', 'in light of', 'due to',
];

const SPECULATION_PHRASES = [
    'probably', 'must have', 'obviously', 'clearly trying to',
    'I bet', 'I think he', 'I think she', 'I\'m sure',
    'no doubt', 'I know for a fact', 'trying to manipulate',
    'doing this on purpose', 'intentionally', 'deliberately',
    'to punish me', 'to control me', 'to hurt me',
];

const CHARACTER_JUDGMENTS = [
    'selfish', 'narcissist', 'narcissistic', 'controlling', 'manipulative',
    'abusive', 'toxic', 'crazy', 'unstable', 'unfit', 'liar',
    'irresponsible', 'negligent', 'pathetic', 'disgusting',
    'terrible', 'horrible', 'awful', 'ridiculous', 'absurd',
    'worthless', 'incompetent', 'delusional', 'psycho',
];

const SWEEPING_GENERALIZATIONS = [
    'always', 'never', 'every single time', 'constantly',
    'all the time', 'without fail', 'every time',
    'not once', 'not a single time',
];

const EVENT_VERBS = [
    'filed', 'sent', 'received', 'attended', 'called', 'posted',
    'texted', 'emailed', 'signed', 'submitted', 'served', 'notified',
    'enrolled', 'withdrew', 'transferred', 'moved', 'relocated',
    'scheduled', 'canceled', 'cancelled', 'denied', 'approved',
    'requested', 'agreed', 'refused', 'paid', 'delivered',
];

const CHRONOLOGICAL_LANGUAGE = [
    'later', 'after that', 'then', 'subsequently', 'the following',
    'the next day', 'days later', 'weeks later', 'months later',
    'prior to', 'before that', 'previously', 'at that time',
    'on or about', 'beginning in', 'starting from',
];

const BEST_INTEREST_FRAMING = [
    'best interest', 'best interests', 'child\'s welfare',
    'stability', 'continuity', 'routine', 'well-being',
    'adjustment', 'developmental', 'emotional needs',
    'in the interest of the child', 'prejudice', 'harm',
    'detriment', 'adverse', 'detrimental',
];

const STATUTE_PATTERNS = [
    /\b§\s*\d+/,                                    // § 153
    /\bsection\s+\d+/i,                             // Section 153
    /\b\d+\.\d+(?:\.\d+)?\b/,                       // 153.001
    /\bTex\.\s*Fam\.\s*Code/i,                      // Tex. Fam. Code
    /\bT\.?F\.?C\.?\s*§/i,                          // TFC §
    /\bRule\s+\d+/i,                                 // Rule 21
    /\bFed\.\s*R\.\s*Civ\.\s*P\./i,                 // Fed. R. Civ. P.
    /\b[A-Z][a-z]+\s+v\.\s+[A-Z][a-z]+/,           // Case citations
];

const SOURCE_REFERENCE_PHRASES = [
    'attached', 'see exhibit', 'see attached', 'shown in',
    'as evidenced by', 'the evidence shows', 'per the',
    'according to', 'documented in', 'referenced in',
    'screenshot', 'text message', 'email from', 'text from',
];

/**
 * Detect boolean signal flags from a sentence.
 */
export function computeSignals(sentence: string): ExtractedSignals {
    const lower = sentence.toLowerCase();

    return {
        hasDate: DATE_PATTERNS.some(p => p.test(sentence)),
        hasTime: TIME_PATTERNS.some(p => p.test(sentence)),
        hasNamedPerson: /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/.test(sentence),
        hasCourtTerm: COURT_TERMS.some(t => lower.includes(t)),
        hasReliefVerb: RELIEF_VERBS.some(v => lower.includes(v)),
        hasEmotionWord: EMOTION_WORDS.some(w => lower.includes(w)),
        hasReasoningPhrase: REASONING_PHRASES.some(p => lower.includes(p)),
        hasSourceReference: SOURCE_REFERENCE_PHRASES.some(p => lower.includes(p)),
        hasSpeculationLanguage: SPECULATION_PHRASES.some(p => lower.includes(p)),
        hasCharacterJudgment: CHARACTER_JUDGMENTS.some(j => lower.includes(j)),
        hasSweepingGeneralization: SWEEPING_GENERALIZATIONS.some(g => lower.includes(g)),
        hasEventVerb: EVENT_VERBS.some(v => lower.includes(v)),
        hasChronologicalLanguage: CHRONOLOGICAL_LANGUAGE.some(c => lower.includes(c)),
        hasBestInterestFraming: BEST_INTEREST_FRAMING.some(b => lower.includes(b)),
        hasStatuteOrRule: STATUTE_PATTERNS.some(p => p.test(sentence)),
    };
}

// ---------------------------------------------------------------------------
// Source-Type Default Scoring (Tier 2)
// ---------------------------------------------------------------------------

/**
 * Source-type default weights per content type.
 *
 * These represent baseline scoring bias based on where the content came from.
 * A timeline_event source text is more likely to be a fact than a request.
 */
const SOURCE_TYPE_DEFAULTS: Partial<Record<WorkspaceNodeType, Partial<Record<SentenceType, number>>>> = {
    incident_report: { fact: 0.20, timeline_event: 0.15 },
    timeline_event: { timeline_event: 0.25, fact: 0.15 },
    key_fact: { fact: 0.20 },
    strategy_point: { argument: 0.15 },
    risk_concern: { risk: 0.20, issue: 0.10 },
    strength_highlight: { argument: 0.10, fact: 0.10 },
    draft_snippet: { argument: 0.10, request: 0.10 },
    hearing_prep: { procedure: 0.10, argument: 0.10 },
    exhibit_note: { evidence_reference: 0.20 },
    procedure_note: { procedure: 0.20 },
    detected_pattern: { fact: 0.10, argument: 0.10 },
    narrative_block: { argument: 0.10, fact: 0.10 },
    case_note: { fact: 0.05 },
    good_faith_point: { argument: 0.10, fact: 0.10 },
    question_to_verify: { risk: 0.10, issue: 0.10 },
    evidence_item: { evidence_reference: 0.25, fact: 0.10 },
    pinned_item: { fact: 0.05, argument: 0.05 },
    pattern_analysis: { argument: 0.15, fact: 0.10 },
};

// ---------------------------------------------------------------------------
// Score Computation — The main scoring function
// ---------------------------------------------------------------------------

/**
 * Compute content scores for a sentence using the full scoring pipeline.
 *
 * Scoring priority:
 * 1. User tags (Tier 1) — highest weight
 * 2. Source-type defaults (Tier 2) — baseline bias
 * 3. Language patterns (Tier 3) — keyword/phrase matching
 * 4. Linked context (Tier 4) — applied externally at node level
 *
 * All scores are additive and capped at 1.0.
 */
export function computeScores(
    sentence: string,
    signals: ExtractedSignals,
    sourceType: WorkspaceNodeType,
    userTags?: string[],
): Record<SentenceType, number> {
    const scores = emptyScores();

    // ── Tier 1: User Tags ──
    if (userTags?.length) {
        for (const tag of userTags) {
            const normalized = tag.toLowerCase().replace(/[-\s]/g, '_') as SentenceType;
            if (SENTENCE_TYPES.includes(normalized)) {
                scores[normalized] = Math.min(1, (scores[normalized] ?? 0) + 0.30);
            }
        }
    }

    // ── Tier 2: Source-Type Defaults ──
    const defaults = SOURCE_TYPE_DEFAULTS[sourceType];
    if (defaults) {
        for (const [key, value] of Object.entries(defaults)) {
            scores[key as SentenceType] += value;
        }
    }

    // ── Tier 3: Language Pattern Scoring ──

    // >> FACT scoring
    if (signals.hasDate) scores.fact += 0.20;
    if (signals.hasTime) scores.fact += 0.10;
    if (signals.hasNamedPerson) scores.fact += 0.10;
    if (signals.hasEventVerb && !signals.hasEmotionWord) scores.fact += 0.15; // neutral past-tense
    if (signals.hasEventVerb) scores.fact += 0.20; // concrete event/action
    if (signals.hasSourceReference) scores.fact += 0.15; // linked evidence

    // >> ARGUMENT scoring
    if (signals.hasReasoningPhrase) scores.argument += 0.20;
    if (signals.hasBestInterestFraming) scores.argument += 0.20;
    if (signals.hasSourceReference) scores.argument += 0.15; // linked evidence
    if (signals.hasReasoningPhrase && signals.hasDate) scores.argument += 0.20; // connects fact to consequence

    // >> REQUEST scoring
    if (signals.hasReliefVerb) scores.request += 0.35;
    // Imperative court relief phrasing
    const lower = sentence.toLowerCase();
    if (/\bshould\s+(order|grant|deny|modify|enforce)\b/i.test(lower)) scores.request += 0.25;
    if (/\b(?:custody|visitation|possession|child support|spousal|attorney.?s?\s*fees)\b/i.test(lower)) {
        scores.request += 0.20; // specific relief mentioned
    }

    // >> EMOTION scoring
    if (signals.hasEmotionWord) scores.emotion += 0.30;
    if (/\b(?:so|very|extremely|incredibly|absolutely)\s+\w+/i.test(lower)) scores.emotion += 0.20; // emotional adverbs
    if (/[!]{2,}|[A-Z]{5,}/.test(sentence)) scores.emotion += 0.10; // high-intensity punctuation/caps

    // >> OPINION scoring
    if (signals.hasCharacterJudgment) scores.opinion += 0.30;
    if (signals.hasSweepingGeneralization) scores.opinion += 0.20;
    if (signals.hasSpeculationLanguage) scores.opinion += 0.25; // unsupported motive claims

    // >> PROCEDURE scoring
    if (signals.hasStatuteOrRule) scores.procedure += 0.30;
    if (signals.hasCourtTerm) scores.procedure += 0.25;
    if (/\b(?:served|notice|hearing|filing|scheduled|docketed)\b/i.test(lower)) {
        scores.procedure += 0.25;
    }

    // >> EVIDENCE_REFERENCE scoring
    if (/\b(?:exhibit|document|message|screenshot|attachment|recording)\b/i.test(lower)) {
        scores.evidence_reference += 0.20;
    }
    if (signals.hasSourceReference) scores.evidence_reference += 0.20;
    if (/\b(?:attached|see\s+(?:exhibit|attached)|shown\s+in)\b/i.test(lower)) {
        scores.evidence_reference += 0.15;
    }

    // >> TIMELINE_EVENT scoring
    if (signals.hasDate) scores.timeline_event += 0.25;
    if (signals.hasEventVerb) scores.timeline_event += 0.20;
    if (signals.hasChronologicalLanguage) scores.timeline_event += 0.15;

    // >> ISSUE scoring (light — mostly tagged via issue tagger)
    if (signals.hasBestInterestFraming) scores.issue += 0.15;
    if (/\b(?:dispute|conflict|disagreement|violation|noncompliance)\b/i.test(lower)) {
        scores.issue += 0.15;
    }

    // >> RISK scoring
    if (/\b(?:risk|danger|concern|gap|missing|incomplete|contradicts?)\b/i.test(lower)) {
        scores.risk += 0.20;
    }

    // ── Penalty Rules ──
    // Emotion in fact context → penalize fact
    if (signals.hasEmotionWord && scores.fact > 0.3) scores.fact -= 0.15;
    // Speculation → penalize fact
    if (signals.hasSpeculationLanguage) scores.fact -= 0.20;
    // Opinion adjectives → penalize fact
    if (signals.hasCharacterJudgment) scores.fact -= 0.15;
    // Pure emotion, no factual anchor → penalize argument
    if (signals.hasEmotionWord && !signals.hasDate && !signals.hasEventVerb) {
        scores.argument -= 0.20;
    }
    // Pure insult/opinion → penalize argument
    if (signals.hasCharacterJudgment && !signals.hasReasoningPhrase) {
        scores.argument -= 0.25;
    }
    // Strong neutral structure → penalize emotion
    if (signals.hasDate && signals.hasEventVerb && !signals.hasEmotionWord) {
        scores.emotion -= 0.15;
    }
    // Cited evidence → penalize opinion
    if (signals.hasSourceReference) scores.opinion -= 0.15;

    // ── Clamp all scores to [0, 1] ──
    for (const t of SENTENCE_TYPES) {
        scores[t] = Math.max(0, Math.min(1, scores[t]));
    }

    return scores;
}
