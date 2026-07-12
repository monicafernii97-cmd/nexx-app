import { FORBIDDEN_HEADINGS, INTERNAL_LANGUAGE } from '../../src/lib/nexx/__tests__/antiCautionGuardrails';

export { FORBIDDEN_HEADINGS, INTERNAL_LANGUAGE };

export type AntiCautionBrowserScenario = {
  id: string;
  fixture: string;
  prompt: string;
  required: RegExp[];
  forbidden?: RegExp[];
};

export const antiCautionBrowserScenarios: AntiCautionBrowserScenario[] = [
  {
    id: 'clear-order-direct-interpretation',
    fixture: 'qa/fixtures/anti-caution/clear-order.pdf',
    prompt: "Under this order, does Father's Day possession start Thursday because Friday is a holiday, or does it start Friday?",
    required: [/Father'?s Day possession starts Friday/i, /Friday at 6:00 p\.m\./i, /Monday at 8:00 a\.m\./i],
  },
  {
    id: 'partial-relevant-readable',
    fixture: 'qa/fixtures/anti-caution/partial-relevant-readable.pdf',
    prompt: "Under this order, does Father's Day possession start Thursday because Friday is a holiday, or does it start Friday?",
    required: [/Father'?s Day possession starts Friday/i, /Friday at 6:00 p\.m\./i],
    forbidden: [/text may be incomplete|cannot safely answer|document contains/i],
  },
  {
    id: 'irrelevant-page-unreadable',
    fixture: 'qa/fixtures/anti-caution/irrelevant-page-unreadable.pdf',
    prompt: "Under this order, does Father's Day possession start Thursday because Friday is a holiday, or does it start Friday?",
    required: [/Father'?s Day possession starts Friday/i, /specific/i],
    forbidden: [/unreadable|degraded|page 4|property section/i],
  },
  {
    id: 'controlling-language-unreadable',
    fixture: 'qa/fixtures/anti-caution/controlling-language-unreadable.pdf',
    prompt: "What time does Father's Day possession begin under this order?",
    required: [/cannot verify|can't confirm|unclear|clearer copy/i, /Monday at 8:00 a\.m\./i],
    forbidden: [/starts Friday|starts Thursday/i],
  },
  {
    id: 'no-fathers-day-clause',
    fixture: 'qa/fixtures/anti-caution/no-fathers-day-clause.pdf',
    prompt: "What does this order say about when Father's Day possession begins?",
    required: [/do not see|no separate Father'?s Day/i, /general.*weekend/i],
    forbidden: [/Friday at 6:00 p\.m\.|Monday at 8:00 a\.m\.|unreadable/i],
  },
];

export type AntiCautionBrowserDriver = {
  signIn(): Promise<void>;
  createConversation(): Promise<void>;
  uploadFixture(path: string): Promise<void>;
  sendPrompt(prompt: string): Promise<void>;
  waitForFinalAnswer(): Promise<string>;
  assertSourcePanelDefaultClean(): Promise<void>;
  openSourcesAndReturnText(): Promise<string>;
  screenshot(path: string): Promise<void>;
  trace(path: string): Promise<void>;
};

export async function runAntiCautionDocumentBehaviorSpec(driver: AntiCautionBrowserDriver) {
  await driver.signIn();

  for (const scenario of antiCautionBrowserScenarios) {
    await driver.createConversation();
    await driver.uploadFixture(scenario.fixture);
    await driver.sendPrompt(scenario.prompt);
    let primaryError: unknown;
    try {
      const answerText = await driver.waitForFinalAnswer();

      if (INTERNAL_LANGUAGE.test(answerText)) {
        throw new Error(`${scenario.id}: internal language leaked in answer`);
      }
      if (FORBIDDEN_HEADINGS.test(answerText)) {
        throw new Error(`${scenario.id}: forbidden caution/source heading appeared`);
      }
      for (const pattern of scenario.required) {
        if (!pattern.test(answerText)) throw new Error(`${scenario.id}: missing required pattern ${pattern}`);
      }
      for (const pattern of scenario.forbidden ?? []) {
        if (pattern.test(answerText)) throw new Error(`${scenario.id}: matched forbidden pattern ${pattern}`);
      }

      await driver.assertSourcePanelDefaultClean();
      const sourceText = await driver.openSourcesAndReturnText();
      if (INTERNAL_LANGUAGE.test(sourceText) || FORBIDDEN_HEADINGS.test(sourceText)) {
        throw new Error(`${scenario.id}: internal source-panel language leaked`);
      }
    } catch (error) {
      primaryError = error;
    } finally {
      try {
        await driver.screenshot(`qa/reports/screenshots/${scenario.id}.png`);
        await driver.trace(`qa/reports/traces/${scenario.id}.zip`);
      } catch (diagnosticError) {
        if (!primaryError) primaryError = diagnosticError;
      }
    }

    if (primaryError) throw primaryError;
  }
}
