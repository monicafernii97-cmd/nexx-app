import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { CHAT_UPLOAD_CONFIG } from './lib/chatUploadConfig';
import { validateFallbackPayload } from './lib/chatUploadFallbackPolicy';

const http = httpRouter();

function corsHeaders(request: Request) {
  const origin = request.headers.get('origin') ?? '*';
  return new Headers({
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '600',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  });
}

function jsonResponse(request: Request, body: Record<string, unknown>, status: number) {
  const headers = corsHeaders(request);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), { status, headers });
}

async function sha256Hex(value: string) {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

http.route({
  path: '/chat-upload-fallback',
  method: 'OPTIONS',
  handler: httpAction(async (_ctx, request) => new Response(null, {
    status: 204,
    headers: corsHeaders(request),
  })),
});

http.route({
  path: '/chat-upload-fallback',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const uploadSessionId = url.searchParams.get('uploadSessionId');
    const uploadAttemptId = url.searchParams.get('uploadAttemptId');
    const authorization = request.headers.get('authorization') ?? '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!uploadSessionId || !uploadAttemptId || token.length < 32) {
      return jsonResponse(request, { error: 'Invalid fallback upload request.' }, 401);
    }

    const contentLengthHeader = request.headers.get('content-length');
    const contentLength = contentLengthHeader ? Number(contentLengthHeader) : undefined;
    if (
      contentLength !== undefined &&
      (!Number.isFinite(contentLength) || contentLength <= 0 || contentLength > CHAT_UPLOAD_CONFIG.fallbackUploadMaxBytes)
    ) {
      return jsonResponse(request, { error: 'Fallback upload size is not allowed.' }, 413);
    }

    let ticketId: Id<'chatUploadFallbackTickets'> | undefined;
    let storedId: Id<'_storage'> | undefined;
    let attached = false;
    try {
      const tokenHash = await sha256Hex(token);
      const claim = await ctx.runMutation(internal.chatUploads.claimFallbackUploadTicket, {
        uploadSessionId: uploadSessionId as Id<'chatUploadSessions'>,
        uploadAttemptId: uploadAttemptId as Id<'chatUploadAttempts'>,
        tokenHash,
      });
      ticketId = claim.ticketId;

      const blob = await request.blob();
      const payloadValidation = validateFallbackPayload({
        actualByteSize: blob.size,
        actualMimeType: blob.type,
        expectedByteSize: claim.expectedByteSize,
        expectedMimeType: claim.expectedMimeType,
        maxByteSize: CHAT_UPLOAD_CONFIG.fallbackUploadMaxBytes,
      });
      if (!payloadValidation.ok) {
        await ctx.runMutation(internal.chatUploads.failFallbackUpload, {
          ticketId,
          failureCode: payloadValidation.failureCode,
        });
        const message = payloadValidation.failureCode === 'fallback_size_mismatch'
          ? 'Uploaded file size did not match the selected file.'
          : 'Uploaded file type did not match the selected file.';
        return jsonResponse(request, { error: message }, 400);
      }

      storedId = await ctx.storage.store(blob);
      await ctx.runMutation(internal.chatUploads.completeFallbackUpload, {
        ticketId,
        storageId: storedId,
      });
      attached = true;
      return jsonResponse(request, { storageId: storedId, transport: 'fallback' }, 200);
    } catch (error) {
      if (storedId && !attached) {
        try {
          await ctx.storage.delete(storedId);
        } catch {
          console.error(JSON.stringify({
            level: 'error',
            event: 'fallback_upload_cleanup_failed',
            uploadSessionId,
            uploadAttemptId,
          }));
        }
      }
      if (ticketId) {
        try {
          await ctx.runMutation(internal.chatUploads.failFallbackUpload, {
            ticketId,
            failureCode: 'fallback_transport_failed',
          });
        } catch {
          // The original failure remains the useful signal.
        }
      }
      console.warn(JSON.stringify({
        level: 'warn',
        event: 'fallback_upload_failed',
        uploadSessionId,
        uploadAttemptId,
        errorCode: error instanceof Error ? error.name : 'unknown',
      }));
      return jsonResponse(request, { error: 'The secure fallback upload did not finish.' }, 502);
    }
  }),
});

export default http;
