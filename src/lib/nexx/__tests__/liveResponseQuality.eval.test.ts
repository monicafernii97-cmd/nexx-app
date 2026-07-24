import { describe, expect, it } from 'vitest';
import { getOpenAIClient } from '../../openaiConversation';
import { buildContextPrompt } from '../prompts/contextPrompt';
import { buildDeveloperBehaviorPrompt } from '../prompts/developerPrompt';
import { buildSystemPolicyPrompt } from '../prompts/systemPrompt';

const runLiveEval = process.env.RUN_LIVE_CHAT_EVAL === '1' && Boolean(process.env.OPENAI_API_KEY);

async function generateLiveAnswer(args: {
  mode: Parameters<typeof buildDeveloperBehaviorPrompt>[0];
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}) {
  const client = getOpenAIClient();
  // The live eval intentionally exercises the same system/developer/context
  // layers and natural-text transport used by relational chat routes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (client.responses as any).create({
    model: 'gpt-5.4',
    reasoning: { effort: 'high' },
    text: { format: { type: 'text' }, verbosity: 'high' },
    input: [
      { role: 'system', content: buildSystemPolicyPrompt() },
      { role: 'developer', content: buildDeveloperBehaviorPrompt(args.mode) },
      {
        role: 'developer',
        content: buildContextPrompt({
          userProfile: {
            userName: 'Monica',
            state: 'Texas',
            custodyType: 'joint',
            hasAttorney: false,
          },
          styleProfile: {
            tonePreference: 'strategic',
            prefersDetailedResponses: true,
          },
        }),
      },
      {
        role: 'developer',
        content: 'Return only the natural user-facing answer in Markdown. Do not return JSON or backend metadata.',
      },
      ...args.messages,
    ],
  });

  return String(response.output_text ?? '');
}

describe.skipIf(!runLiveEval)('live relational response quality evaluation', () => {
  it('produces a nuanced two-sided review instead of unrelated order/deadline output', async () => {
    const answer = await generateLiveAnswer({
      mode: 'pattern_analysis',
      messages: [{
        role: 'user',
        content: `
Monica and Giovanni use AppClose. Giovanni repeatedly says the court order supersedes an
informal call agreement, documents missed calls, questions medical scheduling, and raises
concerns about a haircut, the child's name, homework, and activities. Monica explains the
child's school, therapy, homework, church schedule, and family routine; she eventually says
she will comply pending a modification, but later accuses him of control and of making their
daughter cry. Both parents quote what the child has said.

Please review this thread transparently. Explain the big picture, what helps and hurts Monica,
how Giovanni's conduct reads, what a judge may reasonably focus on, whether the thread supports
parallel parenting, and the practical communication changes Monica should make. Be candid,
balanced without pretending both conduct is identical, and detailed enough to use.
        `.trim(),
      }],
    });

    expect(answer.length).toBeGreaterThan(1_200);
    expect(answer).toMatch(/big picture|overall|zoomed out/i);
    expect(answer).toMatch(/helps|strength/i);
    expect(answer).toMatch(/hurts|risk|weak/i);
    expect(answer).toMatch(/parallel parenting|structured communication|clear boundaries/i);
    expect(answer).not.toMatch(/Deadline Check|medical marijuana card|airline tickets/i);
    expect(answer).not.toContain('This order contains the following relevant provisions.');
  }, 240_000);

  it('respects iterative drafting boundaries and does not reopen routine contact', async () => {
    const answer = await generateLiveAnswer({
      mode: 'co_parent_response',
      messages: [
        {
          role: 'user',
          content: 'The other parent reported that our daughter pushed another child, was not honest about it, and called herself stupid and a terrible kid. He said he addressed it and told me in case I wanted to talk to her. Should I respond?',
        },
        {
          role: 'assistant',
          content: 'A brief acknowledgment is useful. I can draft one that confirms you addressed the behavior and emotional concern.',
        },
        {
          role: 'user',
          content: 'I already spoke with her after she came back Monday. I want to parallel parent, and I do not want to say "keep me informed" or remind him what he should share. Give me the final natural message only.',
        },
      ],
    });

    expect(answer).toMatch(/spoke with|talked with/i);
    expect(answer).toMatch(/good kid|not (?:stupid|a terrible kid)|positive choices|negative things she said|negative self-talk|reassured/i);
    expect(answer).not.toMatch(/keep me informed|continue to share|please share|for future matters/i);
    expect(answer).not.toMatch(/judge-approved|bulletproof|judges love/i);
  }, 120_000);

  it('distinguishes records access from shared portal credentials', async () => {
    const answer = await generateLiveAnswer({
      mode: 'direct_legal_answer',
      messages: [{
        role: 'user',
        content: 'In Texas, my daughter\'s other parent can access her medical records. The provider only gives one portal login, and mine also contains my records and my other children\'s records. Does his right to our daughter\'s records mean I must give him my shared login? What is the safest cooperative response?',
      }],
    });

    expect(answer).toMatch(/does not automatically mean|not the same as|separate/i);
    expect(answer).toMatch(/provider|records department|directly/i);
    expect(answer).toMatch(/login|credentials/i);
    expect(answer).not.toMatch(/sharing (?:the )?password (?:is|would be) a HIPAA violation/i);
  }, 120_000);
});
