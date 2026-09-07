import { expect, test } from '@playwright/test';
import { beginSyntheticRun, finishSyntheticRun } from '../support/lifecycle';
import { ensureUploadFixtures } from '../support/files';
import { uploadAndSend } from '../support/upload-journey';
import { inspectSyntheticRunUpload, waitForSyntheticFullReviewReady } from '../support/convex';

async function sendAndWait(
  page: import('@playwright/test').Page,
  text: string,
  options: { inspectBeforeStatusAssertion?: boolean } = {},
) {
  const assistants = page.getByTestId('chat-message-assistant');
  const before = await assistants.count();
  await page.getByTestId('chat-composer').fill(text);
  await page.getByTestId('chat-send').click();
  await expect(assistants).toHaveCount(before + 1, { timeout: 4 * 60 * 1000 });
  const answer = assistants.last();
  await expect(answer).toHaveAttribute('data-message-streaming', 'false', { timeout: 4 * 60 * 1000 });
  if (!options.inspectBeforeStatusAssertion) {
    await expect(answer).not.toHaveAttribute('data-message-status', 'degraded');
  }
  const content = answer.getByTestId('assistant-message-content');
  await expect(content).toBeVisible();
  return content;
}

async function expectNoHistoricalDocumentWork(answer: import('@playwright/test').Locator) {
  await expect(answer).not.toContainText(/(?:reviewed|analy[sz](?:e|ed|ing)|extracted|read|checked|processed).{0,80}(?:existing|previous|prior|old|historical|saved|uploaded)?\s*(?:order|document|file|pdf)/i);
}

test('critical executive-chat sequence matrix preserves focus without unwanted document work', async ({ page }, testInfo) => {
  const environment = await beginSyntheticRun(page, testInfo);
  const fixture = ensureUploadFixtures(environment.runId, 'release').fixtures['release-1m'];
  try {
    await uploadAndSend({
      page, testInfo, runId: environment.runId, filePath: fixture.path, byteSize: fixture.byteSize,
      prompt: 'Analyze this file. If more than one review depth is possible, offer the choices.',
    });
    await sendAndWait(page, 'which');
    await waitForSyntheticFullReviewReady(page, environment.runId);
    const finalAnswer = await sendAndWait(page, 'please do so', { inspectBeforeStatusAssertion: true });
    await expect(finalAnswer).not.toContainText(/(?:cannot|can't|do not|don't|unable to).{0,140}(?:read|access|see|have).{0,140}(?:file|document|order|pdf|text)|(?:re[- ]?upload|upload again).{0,140}(?:file|document|order|pdf)/i);
    await expect(page.getByTestId('chat-message-attachment').filter({ hasText: fixture.path.split(/[\\/]/).pop()! })).toBeVisible();
    const inspected = await inspectSyntheticRunUpload(page, environment.runId);
    const acceptedTurn = inspected.semanticTurns.find((turn) => turn.message.toLowerCase() === 'please do so');
    console.log(JSON.stringify({ event: 'executive_chat_acceptance_inspection', turn: acceptedTurn }));
    await expect(page.getByTestId('chat-message-assistant').last()).not.toHaveAttribute('data-message-status', 'degraded');
    expect(acceptedTurn).toMatchObject({
      status: 'assistant_saved',
      speechAct: 'confirm',
      interactionIntent: 'accept_recommendation',
      interactionDecision: 'execute',
      analysisMode: 'full_document_review',
      publicationRejectionCodes: [],
      shadowRejectionCodes: [],
    });
    expect(acceptedTurn?.selectedOptionId).toBeTruthy();
    expect(acceptedTurn?.selectedDocumentIds).toHaveLength(1);
    expect(acceptedTurn?.selectedEvidenceGenerationIds.length).toBeGreaterThan(0);
    expect(acceptedTurn?.answerEvidenceDocumentCount).toBeGreaterThan(0);
    expect(acceptedTurn?.answerEvidenceChunkCount).toBeGreaterThan(0);

    const greeting = await sendAndWait(page, 'hey');
    await expect(greeting).toContainText(/\b(?:hey|hi|hello|good (?:morning|afternoon|evening))\b/i);
    await expect(greeting).not.toContainText(/(?:order|document|file|pdf).{0,50}(?:says|states|contains|requires|provides|shows|means)/i);

    const awaitingUpload = await sendAndWait(page, 'I will reupload the signed order');
    await expect(awaitingUpload).toContainText(/\b(?:upload|reupload|attach|send)\b/i);
    await expectNoHistoricalDocumentWork(awaitingUpload);

    const unknownTerm = await sendAndWait(page, 'ZQX?');
    await expect(unknownTerm).toContainText(/(?:what|mean|clarif|could you|tell me)/i);
    await expectNoHistoricalDocumentWork(unknownTerm);

    const switchedTopic = await sendAndWait(page, 'Switch topics: explain mediation in one sentence.');
    await expect(switchedTopic).toContainText(/mediat/i);
    await expect(switchedTopic).not.toContainText(/(?:the|your|this|that) (?:order|document|file|pdf) (?:says|states|contains|requires|provides|shows|means)/i);

    const naturalDefinition = await sendAndWait(page, 'What is mediation?');
    await expect(naturalDefinition).toContainText(/mediat/i);
    await expectNoHistoricalDocumentWork(naturalDefinition);

    const naturalFollowUp = await sendAndWait(page, 'What does it look like?');
    await expect(naturalFollowUp).toContainText(/(?:mediator|neutral|session|meeting|discussion|both parties)/i);
    await expect(naturalFollowUp).not.toContainText(/cannot verify a complete answer|order language available for this turn/i);
    await expectNoHistoricalDocumentWork(naturalFollowUp);

    const conciseAnswer = await sendAndWait(page, 'What is 9 + 6? Answer with only the number.');
    await expect(conciseAnswer).toHaveText(/^15(?:\.0+)?[.!]?$/);
    await expectNoHistoricalDocumentWork(conciseAnswer);

    const conciseFollowUp = await sendAndWait(page, 'Now add 4 to that result. Answer with only the number.');
    await expect(conciseFollowUp).toHaveText(/^19(?:\.0+)?[.!]?$/);
    await expectNoHistoricalDocumentWork(conciseFollowUp);
  } finally {
    await finishSyntheticRun(page, testInfo, environment.runId);
  }
});

