/**
 * Shared types for the NEXX application
 */

/** Context about the user and their NEX passed from the chat UI to the API route */
export interface UserContext {
    userName?: string;
    state?: string;
    county?: string;
    custodyType?: string;
    nexBehaviors?: string[];
    tonePreference?: string;
    emotionalState?: string;
    childrenNames?: string[];
    childrenAges?: number[];
    courtCaseNumber?: string;
    hasAttorney?: boolean;
    hasTherapist?: boolean;
    nexNickname?: string;
    nexCommunicationStyle?: string;
    nexManipulationTactics?: string[];
    nexTriggerPatterns?: string[];
    nexAiInsights?: string;
    nexDangerLevel?: number;
    nexDetectedPatterns?: string[];
    /** When true, full PII (children names, case numbers) is included in the prompt for drafting flows */
    isDraftingMode?: boolean;
}

/** A single legal statute search result from Tavily */
export interface LegalSearchResult {
    title: string;
    url: string;
    snippet: string;
}

/** Extended context passed to buildSystemPrompt — composes UserContext with server-side fields */
export interface BuildSystemPromptContext extends UserContext {
    conversationMode?: string;
    legalContext?: LegalSearchResult[];
}
