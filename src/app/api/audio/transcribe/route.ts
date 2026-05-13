import { auth } from '@clerk/nextjs/server';
import { getOpenAI } from '@/lib/openai';
import { DEFAULT_TRANSCRIPTION_MODEL, validateTranscriptionFile } from '@/lib/voice';

export const runtime = 'nodejs';
export const maxDuration = 120;

/** Transcribe longer user-uploaded recordings with OpenAI speech-to-text. */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: 'Invalid multipart form data' }, { status: 400 });
  }

  const fileEntry = formData.get('file');
  const promptEntry = formData.get('prompt');
  const languageEntry = formData.get('language');

  if (!(fileEntry instanceof File)) {
    return Response.json({ error: 'No audio file provided' }, { status: 400 });
  }

  const validationError = validateTranscriptionFile(fileEntry);
  if (validationError) {
    return Response.json({ error: validationError }, { status: 400 });
  }

  try {
    const transcription = await getOpenAI().audio.transcriptions.create({
      file: fileEntry,
      model: DEFAULT_TRANSCRIPTION_MODEL,
      prompt: typeof promptEntry === 'string' && promptEntry.trim() ? promptEntry.trim().slice(0, 1000) : undefined,
      language: typeof languageEntry === 'string' && languageEntry.trim() ? languageEntry.trim().slice(0, 12) : undefined,
    });

    return Response.json({
      text: transcription.text,
      filename: fileEntry.name,
      mimeType: fileEntry.type,
      durationSeconds:
        transcription.usage?.type === 'duration'
          ? transcription.usage.seconds
          : undefined,
    });
  } catch (error) {
    console.error('[AudioTranscribe] Transcription failed:', error);
    return Response.json({ error: 'Failed to transcribe audio' }, { status: 500 });
  }
}
