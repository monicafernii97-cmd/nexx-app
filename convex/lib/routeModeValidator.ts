import { v } from 'convex/values';

export const routeModeValidator = v.union(
    v.literal('adaptive_chat'),
    v.literal('direct_legal_answer'),
    v.literal('local_procedure'),
    v.literal('document_analysis'),
    v.literal('order_interpretation'),
    v.literal('possession_access_schedule'),
    v.literal('party_message_draft'),
    v.literal('supportive_strategy'),
    v.literal('co_parent_response'),
    v.literal('documentation_strategy'),
    v.literal('deescalation_response'),
    v.literal('packed_case_intake'),
    v.literal('litigation_navigation'),
    v.literal('court_response_planning'),
    v.literal('pro_se_guidance'),
    v.literal('attorney_resource_guidance'),
    v.literal('court_narrative_builder'),
    v.literal('filing_walkthrough'),
    v.literal('judge_lens_strategy'),
    v.literal('court_ready_drafting'),
    v.literal('pattern_analysis'),
    v.literal('support_grounding'),
    v.literal('safety_escalation')
);
