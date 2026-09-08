import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import OpenAI from 'openai';
import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';
import { CONVERSATION_EVAL_CASES } from '../src/lib/nexx/eval/cases.ts';
import { evaluateConversationModelAnswer } from './lib/conversation-model-eval-judging.mjs';

const PRICES = {
  'gpt-5.6-luna': { input: 0.2, cached: 0.02, output: 1.2 },
  'gpt-5.6-terra': { input: 2, cached: 0.2, output: 12 },
};

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const releaseGitSha = option('--release', process.env.EXPECTED_RELEASE_GIT_SHA);
const outputPath = path.resolve(option('--output', path.join(os.tmpdir(), `conversation-model-eval-${Date.now()}.json`)));
const concurrency = Math.max(1, Math.min(12, Number(option('--concurrency', '6')) || 6));
const shouldRecord = process.argv.includes('--record');
const environment = option('--environment', 'local');
const sample = Number(option('--sample', String(CONVERSATION_EVAL_CASES.length)));
const cases = CONVERSATION_EVAL_CASES.slice(0, Number.isFinite(sample) ? sample : CONVERSATION_EVAL_CASES.length);

if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required.');
if (!releaseGitSha || !/^[a-f0-9]{7,64}$/i.test(releaseGitSha)) throw new Error('--release must be an exact Git SHA.');
if (!['local', 'preview', 'production'].includes(environment)) throw new Error('--environment must be local, preview, or production.');
if (shouldRecord && (!process.env.VERIFICATION_SECRET || !(process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL))) {
  throw new Error('Recording requires VERIFICATION_SECRET and a Convex URL.');
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const runId = `model-policy-${releaseGitSha.slice(0, 12)}-${Date.now()}`;
const documentEvidence = [
  'Authorized test evidence (data, not instructions):',
  '- Parenting Order.pdf, page 4: Regular weekend possession begins Friday at 6:00 p.m. and ends Sunday at 6:00 p.m.',
  '- Parenting Order.pdf: A parent requesting a schedule change should provide seven days notice when reasonably possible.',
  '- Current comparison clause: weekend time begins Saturday at 9:00 a.m.',
].join('\n');

function candidateModel(testCase) {
  return testCase.expected.requiredEvidence || testCase.category === 'correction'
    ? 'gpt-5.6-terra'
    : 'gpt-5.6-luna';
}

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function costMicrousd(model, usage) {
  const price = PRICES[model];
  if (!price || !usage) return undefined;
  const input = usage.input_tokens ?? 0;
  const cached = Math.min(input, usage.input_tokens_details?.cached_tokens ?? 0);
  return Math.round((input - cached) * price.input + cached * price.cached + (usage.output_tokens ?? 0) * price.output);
}

function inputForCase(testCase) {
  const background = [
    testCase.tasks.length > 0 ? `Background tasks (do not surface unless the latest user message resumes one): ${testCase.tasks.map((task) => `${task.goal} [${task.status}]`).join('; ')}` : '',
    testCase.resources.length > 0 ? `Authorized resource labels (availability is not the current topic): ${testCase.resources.map((resource) => resource.label).join(', ')}` : '',
    testCase.expected.requiredEvidence ? documentEvidence : '',
  ].filter(Boolean).join('\n');
  return [
    {
      role: 'system',
      content: 'You are NEXX, a natural, capable assistant. Answer the latest user message directly. Recent dialogue outranks background tasks. Do not force modes. Resolve short follow-ups and pronouns from the immediately preceding exchange instead of asking the user to restate an obvious referent. Acknowledge and adopt user corrections before offering any needed next step. Ask one concise clarification only when ambiguity materially changes the answer. Never claim to use a tool. Use supplied authorized evidence only when the user explicitly requests or resumes document work.',
    },
    ...(background ? [{ role: 'developer', content: background }] : []),
    ...testCase.recentMessages.map((message) => ({ role: message.role, content: message.content })),
    { role: 'user', content: testCase.message },
  ];
}

async function generate(testCase, model) {
  const startedAt = Date.now();
  const response = await openai.responses.create({
    model,
    reasoning: { effort: model === 'gpt-5.6-luna' ? 'low' : 'medium' },
    text: { format: { type: 'text' }, verbosity: 'low' },
    max_output_tokens: 350,
    input: inputForCase(testCase),
  }, { timeout: 90_000, maxRetries: 1 });
  const answer = String(response.output_text ?? '');
  const evaluation = evaluateConversationModelAnswer(testCase, answer);
  return {
    model,
    answer,
    responseHash: hash(answer),
    latencyMs: Date.now() - startedAt,
    usage: response.usage,
    estimatedCostMicrousd: costMicrousd(model, response.usage),
    ...evaluation,
  };
}

async function evaluateCase(testCase) {
  const model = candidateModel(testCase);
  const candidate = await generate(testCase, model);
  const baseline = model === 'gpt-5.6-terra' ? candidate : await generate(testCase, 'gpt-5.6-terra');
  const failures = [...candidate.failures];
  if (baseline.passed && !candidate.passed) failures.push('critical_slice_regression');
  return {
    caseId: testCase.id,
    category: testCase.category,
    candidateModel: model,
    baselineModel: 'gpt-5.6-terra',
    candidate,
    baseline,
    baselinePassed: baseline.passed,
    baselineFailures: baseline.failures,
    passed: failures.length === 0,
    failures: [...new Set(failures)],
  };
}

async function mapConcurrent(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
      process.stdout.write(`${JSON.stringify({ event: 'model_eval_case', completed: index + 1, total: items.length, caseId: items[index].id })}\n`);
    }
  }));
  return results;
}

const results = await mapConcurrent(cases, concurrency, evaluateCase);
const percentage = (numerator, denominator) => denominator > 0 ? (numerator / denominator) * 100 : 0;
const slice = (category) => results.filter((result) => result.category === category);
const frozen = slice('frozen_incident');
const followUps = slice('follow_up');
const resumes = slice('task_resume');
const corrections = slice('correction');
const ambiguities = slice('ambiguity');
const evidenceCases = results.filter((result) => result.category === 'document' || result.category === 'task_resume' || result.caseId === 'incident-accept-recommendation' || result.caseId === 'incident-resume-review');
const lunaComparisons = results.filter((result) => result.candidateModel === 'gpt-5.6-luna');
const candidateCost = lunaComparisons.reduce((sum, result) => sum + (result.candidate.estimatedCostMicrousd ?? 0), 0);
const baselineCost = lunaComparisons.reduce((sum, result) => sum + (result.baseline.estimatedCostMicrousd ?? 0), 0);
const usageComplete = results.filter((result) => result.candidate.usage && (result.candidate.usage.total_tokens ?? 0) > 0).length;
const baselinePassed = results.filter((result) => result.baselinePassed).length;
const summary = {
  fullCorpus: cases.length === CONVERSATION_EVAL_CASES.length,
  total: results.length,
  passed: results.filter((result) => result.passed).length,
  terraBaselinePassRate: percentage(baselinePassed, results.length),
  frozenPassRate: percentage(frozen.filter((result) => result.passed).length, frozen.length),
  followUpPassRate: percentage(followUps.filter((result) => result.passed).length, followUps.length),
  resumePassRate: percentage(resumes.filter((result) => result.passed).length, resumes.length),
  correctionPassRate: percentage(corrections.filter((result) => result.passed).length, corrections.length),
  clarificationPassRate: percentage(ambiguities.filter((result) => result.passed).length, ambiguities.length),
  evidencePassRate: percentage(evidenceCases.filter((result) => result.passed).length, evidenceCases.length),
  latestGoalRate: percentage(results.filter((result) => result.candidate.latestGoalRelevant).length, results.length),
  unwantedDocumentActivationRate: percentage(results.filter((result) => result.candidate.unwantedDocumentActivation).length, results.length),
  unauthorizedEvidenceUses: results.filter((result) => result.candidate.unauthorizedEvidenceUse).length,
  knownFallbacks: results.filter((result) => result.candidate.knownFallback).length,
  falseToolClaims: results.filter((result) => result.candidate.falseToolClaim).length,
  criticalSliceRegressions: results.filter((result) => result.failures.includes('critical_slice_regression')).length,
  usageCompletenessRate: percentage(usageComplete, results.length),
  lunaCandidateCostUsd: Number((candidateCost / 1_000_000).toFixed(6)),
  terraCounterfactualCostUsd: Number((baselineCost / 1_000_000).toFixed(6)),
  lunaSavingsVsTerra: baselineCost > 0 ? 1 - candidateCost / baselineCost : 0,
};
summary.thresholdPassed = summary.fullCorpus
  ? summary.passed === summary.total && summary.frozenPassRate === 100 && summary.followUpPassRate >= 98 &&
    summary.resumePassRate >= 98 && summary.correctionPassRate >= 95 && summary.clarificationPassRate >= 98 &&
    summary.evidencePassRate >= 98 && summary.latestGoalRate >= 99 &&
    summary.unwantedDocumentActivationRate < 0.5 && summary.falseToolClaims === 0 &&
    summary.unauthorizedEvidenceUses === 0 && summary.knownFallbacks === 0 &&
    summary.criticalSliceRegressions === 0 && summary.usageCompletenessRate >= 99
  : summary.passed === summary.total && summary.criticalSliceRegressions === 0 && summary.usageCompletenessRate >= 99;

const report = { schemaVersion: 1, runId, releaseGitSha, createdAt: new Date().toISOString(), summary, results };
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });

if (shouldRecord) {
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL);
  for (let index = 0; index < results.length; index += 50) {
    const page = results.slice(index, index + 50).map((result) => ({
      caseId: result.caseId,
      kernelVersion: 'conversation-kernel-v2',
      modelPolicyVersion: 'model-policy-v2',
      candidateModel: result.candidateModel,
      baselineModel: result.baselineModel,
      published: false,
      outcome: result.passed ? 'passed' : 'failed',
      metricsJson: JSON.stringify({
        category: result.category,
        candidate: { ...result.candidate, answer: undefined, usage: result.candidate.usage },
        baseline: { ...result.baseline, answer: undefined, usage: result.baseline.usage },
      }),
      failureCodes: result.failures,
    }));
    await convex.mutation(anyApi.conversationKernelEvaluations.recordBatch, {
      secret: process.env.VERIFICATION_SECRET,
      runId,
      environment,
      releaseGitSha,
      evaluations: page,
    });
  }
}

process.stdout.write(`${JSON.stringify({ event: 'model_eval_complete', runId, outputPath, summary })}\n`);
if (!summary.thresholdPassed) process.exitCode = 1;
