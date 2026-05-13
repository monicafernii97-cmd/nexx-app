import { auth } from '@clerk/nextjs/server';
import { getOpenAI } from '@/lib/openai';
import {
  DEFAULT_TTS_MODEL,
  contentTypeForTTSFormat,
  normalizeTTSFormat,
  normalizeTTSSpeed,
  normalizeVoiceName,
  validateTTSText,
  type TTSRequest,
} from '@/lib/voice';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Generate spoken audio for client playback without exposing the OpenAI API key. */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }

  let body: TTSRequest;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  let text: string;
  try {
    text = validateTTSText(body.text);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Invalid text' }, { status: 400 });
  }

  const format = normalizeTTSFormat(body.format);
  const voice = normalizeVoiceName(body.voice);
  const speed = normalizeTTSSpeed(body.speed);

  try {
    const audio = await getOpenAI().audio.speech.create({
      model: DEFAULT_TTS_MODEL,
      input: text,
      voice,
      response_format: format,
      speed,
      instructions: 'Read in a calm, steady, trauma-informed tone suitable for private review.',
    });

    return new Response(audio.body, {
      headers: {
        'Content-Type': contentTypeForTTSFormat(format),
        'Cache-Control': 'no-store',
        'X-Voice': voice,
      },
    });
  } catch (error) {
    console.error('[TTS] Speech generation failed:', error);
    return Response.json({ error: 'Failed to generate speech' }, { status: 500 });
  }
}
