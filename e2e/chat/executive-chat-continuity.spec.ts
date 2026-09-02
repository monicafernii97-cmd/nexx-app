import { expect, test } from '@playwright/test';
import { beginSyntheticRun, finishSyntheticRun } from '../support/lifecycle';
import { ensureUploadFixtures } from '../support/files';
import { uploadAndSend } from '../support/upload-journey';

async function sendAndWait(page: import('@playwright/test').Page, text: string) {
  const assistants = page.getByTestId('chat-message-assistant');
  const before = await assistants.count();
  await page.getByTestId('chat-composer').fill(text);
  await page.getByTestId('chat-send').click();
  await expect(assistants).toHaveCount(before + 1, { timeout: 4 * 60 * 1000 });
  const answer = assistants.last();
  await expect(answer).toHaveAttribute('data-message-streaming', 'false', { timeout: 4 * 60 * 1000 });
  await expect(answer).not.toHaveAttribute('data-message-status', 'degraded');
  return answer;
}

test('uploaded document focus survives “which” then “please do so”', async ({ page }, testInfo) => {
  const environment = await beginSyntheticRun(page, testInfo);
  const fixture = ensureUploadFixtures(environment.runId, 'release').fixtures['release-1m'];
  try {
    await uploadAndSend({
      page, testInfo, runId: environment.runId, filePath: fixture.path, byteSize: fixture.byteSize,
      prompt: 'Analyze this file. If more than one review depth is possible, offer the choices.',
    });
    await sendAndWait(page, 'which');
    const finalAnswer = await sendAndWait(page, 'please do so');
    await expect(finalAnswer).not.toContainText(/(?:cannot|can't|do not) (?:read|access|see).*(?:file|document|pdf)/i);
    await expect(page.getByTestId('chat-message-attachment').filter({ hasText: fixture.path.split(/[\\/]/).pop()! })).toBeVisible();
  } finally {
    await finishSyntheticRun(page, testInfo, environment.runId);
  }
});

