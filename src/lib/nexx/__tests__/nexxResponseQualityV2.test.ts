import { describe, expect, it } from 'vitest';
import { buildContextualDocumentFollowUpMessage } from '../followUpContext';
import { detectDocumentReference } from '../documentReferenceDetection';
import { classifyFollowUpIntent } from '../router';
import { resolveContinuity } from '../legal-engine/continuityResolver';
import { verifyAnswerResponsiveness } from '../legal-engine/answerResponsivenessVerifier';
import { buildActiveLegalIssueSnapshot, summarizeActiveLegalIssue } from '../legal-engine/activeIssueContract';

const activeQuestion = "Does Father's Day start Thursday because Friday is Juneteenth, or Friday under the Father's Day provision?";

describe('NEXX response quality v2', () => {
  it.each([
    'What if he fights back?',
    'What if she keeps saying the federal holiday rule means Thursday?',
    'But what if he says the order states something different?',
    'What if the other parent argues Juneteenth changes it?',
    'Are you sure that does not move it to Thursday?',
    'What is he leaving out?',
    'So does that change the Friday start?',
    'What should I say?',
    'How do I respond if he insists?',
    'But the other clause says federal holiday.',
    'What if they claim the Friday holiday controls?',
    'She keeps arguing it begins Thursday.',
    'He says the summer holiday language overrides it.',
    'What if he claims that paragraph applies?',
    'Does his argument change the result?',
    'What if the co-parent says something different?',
    'But does the general provision win?',
    'What do I say if she fights back?',
    'What if he keeps saying it starts Thursday?',
    'So Friday still controls?',
    'He will say Juneteenth makes it Thursday.',
    'Okay, but the order literally says Friday holidays begin Thursday.',
    'Does his interpretation change your answer?',
    'But HE says the federal-holiday paragraph gives him Thursday!',
    'what if he fights me on this',
    'The other parent says the other provision controls?',
    'Are you certain the Friday language still applies?',
    'He says Friday-holiday means Thurs., what then?',
    'What if speech to text wrote federal holliday but he means Juneteenth?',
    'But she insists the general weekend rule changes Father’s Day.',
  ])('preserves the active legal issue for adversarial follow-up: %s', (followUp) => {
    const contextual = buildContextualDocumentFollowUpMessage(
      followUp,
      [{ role: 'user', content: activeQuestion, status: 'committed' }],
      'order_interpretation'
    );
    expect(contextual).toContain("Father's Day");
    expect(resolveContinuity({
      message: followUp,
      activeMode: 'order_interpretation',
      hasActiveDocumentContext: true,
      activeIssueText: activeQuestion,
    }).kind).not.toBe('new_issue');
  });

  it('isolates an explicit new filing issue', () => {
    const message = 'What is the deadline in a new motion?';
    expect(classifyFollowUpIntent(message)).toBe('new_issue');
    expect(buildContextualDocumentFollowUpMessage(
      message,
      [{ role: 'user', content: activeQuestion, status: 'committed' }],
      'order_interpretation'
    )).toBe(message);
  });

  it('persists a compact issue snapshot without raw document text', () => {
    const snapshot = buildActiveLegalIssueSnapshot({
      userQuestion: activeQuestion,
      controllingConclusion: "No. Father's Day possession begins Friday, not Thursday.",
      routeMode: 'order_interpretation',
      uploadedFileIds: ['order-1'],
    });
    expect(snapshot.label).toBe("Father's Day possession schedule");
    expect(snapshot.sourceAnchors).toEqual([{ uploadedFileId: 'order-1' }]);
    expect(summarizeActiveLegalIssue(snapshot)).toContain('Verified working conclusion');
  });

  it('rejects the vague production-incident answer and accepts a concrete answer', () => {
    expect(verifyAnswerResponsiveness({
      userMessage: activeQuestion,
      directAnswer: 'The provision written specifically for this event applies, while the general rule remains in effect for situations within its own scope.',
    }).passed).toBe(false);
    expect(verifyAnswerResponsiveness({
      userMessage: activeQuestion,
      directAnswer: "No. Father's Day possession begins Friday, not Thursday; the Juneteenth weekend-extension rule does not change that separate schedule.",
      practicalMeaning: 'Follow the Friday start stated in the order.',
    }).passed).toBe(true);
  });

  it('recognizes the federal-holiday clause as part of the document question', () => {
    const detection = detectDocumentReference('What if he says the court order states something different about the federal holiday on Friday during summer and means it starts Thursday?');
    expect(detection.referencesDocument).toBe(true);
    expect(detection.referenceType).toBe('clause_conflict_interpretation');
    expect(detection.requestedTerms).toContain('federal holiday');
  });

  it('keeps deterministic contract work bounded under sustained evaluation', () => {
    const started = performance.now();
    for (let index = 0; index < 1_000; index += 1) {
      const message = index % 2 === 0 ? 'What if he keeps saying it starts Thursday?' : activeQuestion;
      resolveContinuity({
        message,
        activeMode: 'order_interpretation',
        hasActiveDocumentContext: true,
        activeIssueText: activeQuestion,
      });
      verifyAnswerResponsiveness({
        userMessage: activeQuestion,
        directAnswer: "No. Father's Day possession begins Friday, not Thursday.",
        practicalMeaning: 'Use the Friday start.',
      });
    }
    expect(performance.now() - started).toBeLessThan(1_000);
  });
});
