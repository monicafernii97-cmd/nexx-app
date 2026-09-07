import OpenAI from 'openai';

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error(JSON.stringify({ ok: false, error: 'OPENAI_API_KEY is not configured' }));
  process.exit(1);
}

const models = process.argv.slice(2);
const selected = models.length > 0
  ? models
  : ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol'];
const client = new OpenAI({ apiKey, timeout: 30_000, maxRetries: 0 });
let failed = false;

for (const model of selected) {
  try {
    const response = await client.responses.create({
      model,
      input: 'Reply with OK only.',
      reasoning: { effort: 'low' },
      max_output_tokens: 64,
    });
    console.log(JSON.stringify({
      model,
      ok: response.output_text.trim().toUpperCase() === 'OK',
      responseIdPresent: Boolean(response.id),
      usagePresent: Boolean(response.usage),
    }));
  } catch (error) {
    failed = true;
    console.error(JSON.stringify({
      model,
      ok: false,
      status: typeof error?.status === 'number' ? error.status : undefined,
      code: typeof error?.code === 'string' ? error.code : undefined,
      message: error instanceof Error ? error.message.slice(0, 300) : 'Unknown provider error',
    }));
  }
}

if (failed) process.exit(1);
