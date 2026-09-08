import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const operations = fs.readFileSync('convex/executiveChatOperations.ts', 'utf8');
const turns = fs.readFileSync('convex/chatTurns.ts', 'utf8');
const schema = fs.readFileSync('convex/schema.ts', 'utf8');

test('release health is scoped to the active rollout cohort and real production traffic', () => {
  assert.match(schema, /chatTurns:[\s\S]*dataProvenance: v\.optional\(dataProvenanceValidator\)/);
  assert.match(turns, /dataProvenance: conversation\.dataProvenance \?\? 'production'/);
  assert.match(operations, /turn\.rolloutConfigVersion === activeRolloutConfigVersion/);
  assert.match(operations, /contexts: productionOrchestration\.map\(toMetricContext\)/);
  assert.match(operations, /syntheticQaMetrics: syntheticDetailedMetrics/);
});

test('release gates cover the prohibited Phase 2 outcomes', () => {
  for (const code of [
    'qa_production_isolation_violation',
    'task_idempotency_violation',
    'publication_idempotency_violation',
    'unauthorized_evidence_published',
    'zero_document_analysis_published',
    'false_tool_or_action_claim_published',
    'material_side_effect_without_confirmation',
  ]) assert.match(operations, new RegExp(code));

  for (const code of [
    'document_activation_false_positive_above_0_5_percent',
    'background_task_resume_below_98_percent',
    'successful_turn_cost_savings_below_50_percent',
    'p95_latency_regression_above_20_percent',
  ]) assert.match(operations, new RegExp(code));
});
