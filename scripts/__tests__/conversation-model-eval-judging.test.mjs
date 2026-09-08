import assert from 'node:assert/strict';
import test from 'node:test';
import { CONVERSATION_EVAL_CASES } from '../../src/lib/nexx/eval/cases.ts';
import { evaluateConversationModelAnswer } from '../lib/conversation-model-eval-judging.mjs';

const byId = (id) => CONVERSATION_EVAL_CASES.find((testCase) => testCase.id === id);

test('accepts natural concise and contextual answers', () => {
  assert.equal(evaluateConversationModelAnswer(byId('incident-mediation-follow-up'), 'A mediation session is a guided discussion with a neutral mediator.').passed, true);
  assert.equal(evaluateConversationModelAnswer(byId('topic-switch-2'), '48').passed, true);
  assert.equal(evaluateConversationModelAnswer(byId('follow-up-6'), 'A budget can be a table of planned income and actual spending.').passed, true);
});

test('does not confuse ordinary legal filing language with a background document activation', () => {
  const result = evaluateConversationModelAnswer(byId('follow-up-5'), 'File a notice of appeal, submit arguments, and wait for the higher court decision.');
  assert.equal(result.passed, true);
  assert.equal(result.unwantedDocumentActivation, false);
});

test('accepts a short disambiguation between authorized document labels', () => {
  const result = evaluateConversationModelAnswer(byId('ambiguity-1'), 'Which document: Parenting Order.pdf or Motion.pdf?');
  assert.equal(result.passed, true);
  assert.equal(result.clarificationAppropriate, true);
});

test('rejects background-document hijacks and unauthorized evidence leakage', () => {
  const hijack = evaluateConversationModelAnswer(byId('incident-mediation-follow-up'), 'The Parenting Order says the schedule begins Friday at 6:00.');
  assert.equal(hijack.unwantedDocumentActivation, true);
  assert.equal(hijack.unauthorizedEvidenceUse, true);

  const unknownResource = evaluateConversationModelAnswer(byId('incident-mediation-follow-up'), 'Motion.pdf contains the answer.');
  assert.equal(unknownResource.unauthorizedEvidenceUse, true);
});
