import { auth } from '@clerk/nextjs/server';
import { getOpenAI } from '@/lib/openai';
import {
  DEFAULT_REALTIME_MODEL,
  buildRealtimeInstructions,
  isVoiceMode,
  type RealtimeSessionRequest,
} from '@/lib/voice';

export const runtime = 'nodejs';
export const maxDuration = 30;

/** Create a short-lived OpenAI Realtime client secret for browser WebRTC voice sessions. */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }

  let body: RealtimeSessionRequest;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const mode = isVoiceMode(body.mode) ? body.mode : 'chat';

  try {
    const openai = getOpenAI();
    const session = await openai.realtime.clientSecrets.create({
      expires_after: {
        anchor: 'created_at',
        seconds: 60,
      },
      session: {
        type: 'realtime',
        model: DEFAULT_REALTIME_MODEL,
        instructions: buildRealtimeInstructions(mode, body.instructions),
        output_modalities: ['audio'],
        audio: {
          input: {
            transcription: {
              model: 'gpt-4o-transcribe',
              language: 'en',
            },
            turn_detection: {
              type: 'semantic_vad',
              eagerness: 'auto',
              create_response: true,
              interrupt_response: true,
            },
          },
          output: {
            voice: 'marin',
          },
        },
      },
    });

    return Response.json({
      clientSecret: session.value,
      expiresAt: session.expires_at,
      model: session.session.type === 'realtime' ? (session.session.model ?? DEFAULT_REALTIME_MODEL) : DEFAULT_REALTIME_MODEL,
      mode,
    });
  } catch (error) {
    console.error('[RealtimeSession] Failed to create client secret:', error);
    return Response.json({ error: 'Failed to create realtime session' }, { status: 500 });
  }
}
