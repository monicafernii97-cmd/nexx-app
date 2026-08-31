import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { CHAT_UPLOAD_CONFIG } from './lib/chatUploadConfig';
import { validateFallbackPayload, validateResumableChunk } from './lib/chatUploadFallbackPolicy';
import { isAllowedNexxBrowserOrigin } from './lib/browserOrigins';

const http = httpRouter();

function isAllowedBrowserOrigin(origin: string | null) {
  return isAllowedNexxBrowserOrigin({
    origin,
    configuredOrigins: process.env.NEXX_APP_ORIGINS,
    nodeEnv: process.env.NODE_ENV,
  });
}

function corsHeaders(request: Request) {
  const origin = request.headers.get('origin');
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Chunk-SHA256',
    'Access-Control-Max-Age': '600',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  });
  if (origin && isAllowedBrowserOrigin(origin)) headers.set('Access-Control-Allow-Origin', origin);
  return headers;
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

async function readBlobOnceWithSha256(blob: Blob) {
  const bytes = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return {
    bytes,
    sha256: Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(''),
  };
}

function rejectDisallowedOrigin(request: Request) {
  return isAllowedBrowserOrigin(request.headers.get('origin'))
    ? null
    : jsonResponse(request, { error: 'Upload origin is not allowed.' }, 403);
}

http.route({
  path: '/chat-upload-fallback',
  method: 'OPTIONS',
  handler: httpAction(async (_ctx, request) => {
    const rejected = rejectDisallowedOrigin(request);
    return rejected ?? new Response(null, { status: 204, headers: corsHeaders(request) });
  }),
});

http.route({
  path: '/chat-upload-fallback',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const rejected = rejectDisallowedOrigin(request);
    if (rejected) return rejected;
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

for (const path of ['/chat-upload-resumable-chunk', '/chat-upload-resumable-complete'] as const) {
  http.route({
    path,
    method: 'OPTIONS',
    handler: httpAction(async (_ctx, request) => {
      const rejected = rejectDisallowedOrigin(request);
      return rejected ?? new Response(null, { status: 204, headers: corsHeaders(request) });
    }),
  });
}

http.route({
  path: '/chat-upload-resumable-chunk',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const rejected = rejectDisallowedOrigin(request);
    if (rejected) return rejected;
    const url = new URL(request.url);
    const uploadSessionId = url.searchParams.get('uploadSessionId');
    const resumableUploadId = url.searchParams.get('resumableUploadId');
    const chunkIndex = Number(url.searchParams.get('chunkIndex'));
    const authorization = request.headers.get('authorization') ?? '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!uploadSessionId || !resumableUploadId || !Number.isSafeInteger(chunkIndex) || chunkIndex < 0 || token.length < 32) {
      return jsonResponse(request, { error: 'Invalid resumable chunk request.' }, 401);
    }
    let storedId: Id<'_storage'> | undefined;
    let attached = false;
    try {
      const tokenHash = await sha256Hex(token);
      const claim = await ctx.runMutation(internal.chatUploads.claimResumableChunk, {
        uploadSessionId: uploadSessionId as Id<'chatUploadSessions'>,
        resumableUploadId: resumableUploadId as Id<'chatUploadResumableUploads'>,
        chunkIndex,
        tokenHash,
      });
      if ('alreadyCompleted' in claim && claim.alreadyCompleted) {
        return jsonResponse(request, { completed: true, storageId: claim.storageId }, 200);
      }
      if ('alreadyStored' in claim && claim.alreadyStored) {
        return jsonResponse(request, {
          stored: true, chunkIndex, sha256: claim.sha256, byteSize: claim.expectedByteSize,
        }, 200);
      }
      const contentLength = Number(request.headers.get('content-length'));
      if (
        request.headers.has('content-length') &&
        (!Number.isSafeInteger(contentLength) || contentLength !== claim.expectedByteSize)
      ) {
        return jsonResponse(request, { error: 'chunk_size_mismatch' }, 400);
      }
      const blob = await request.blob();
      const { bytes, sha256: actualSha256 } = await readBlobOnceWithSha256(blob);
      const expectedSha256 = request.headers.get('x-chunk-sha256')?.trim().toLowerCase();
      const validation = validateResumableChunk({
        fileByteSize: claim.fileByteSize,
        chunkBytes: claim.chunkBytes,
        chunkIndex,
        actualByteSize: blob.size,
        expectedSha256,
        actualSha256,
      });
      if (!validation.ok) {
        return jsonResponse(request, { error: validation.failureCode }, 400);
      }
      storedId = await ctx.storage.store(new Blob([bytes], { type: blob.type }));
      await ctx.runMutation(internal.chatUploads.completeResumableChunk, {
        resumableUploadId: resumableUploadId as Id<'chatUploadResumableUploads'>,
        chunkId: claim.chunkId,
        storageId: storedId,
        actualByteSize: blob.size,
        sha256: actualSha256,
      });
      attached = true;
      return jsonResponse(request, { stored: true, chunkIndex, sha256: actualSha256, byteSize: blob.size }, 200);
    } catch (error) {
      if (storedId && !attached) {
        try { await ctx.storage.delete(storedId); } catch { /* maintenance remains authoritative */ }
      }
      console.warn(JSON.stringify({
        level: 'warn', event: 'resumable_chunk_failed', resumableUploadId, chunkIndex,
        errorCode: error instanceof Error ? error.name : 'unknown',
      }));
      return jsonResponse(request, { error: 'The resumable chunk did not finish.' }, 502);
    }
  }),
});

http.route({
  path: '/chat-upload-resumable-complete',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const rejected = rejectDisallowedOrigin(request);
    if (rejected) return rejected;
    const url = new URL(request.url);
    const uploadSessionId = url.searchParams.get('uploadSessionId');
    const resumableUploadId = url.searchParams.get('resumableUploadId');
    const authorization = request.headers.get('authorization') ?? '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!uploadSessionId || !resumableUploadId || token.length < 32) {
      return jsonResponse(request, { error: 'Invalid resumable completion request.' }, 401);
    }
    try {
      const tokenHash = await sha256Hex(token);
      const result = await ctx.runAction(internal.chatUploadResumableAssembly.assemble, {
        uploadSessionId: uploadSessionId as Id<'chatUploadSessions'>,
        resumableUploadId: resumableUploadId as Id<'chatUploadResumableUploads'>,
        tokenHash,
        leaseId: crypto.randomUUID(),
      });
      return jsonResponse(request, { storageId: result.storageId, transport: 'resumable' }, 200);
    } catch (error) {
      console.warn(JSON.stringify({
        level: 'warn', event: 'resumable_assembly_failed', resumableUploadId,
        errorCode: error instanceof Error ? error.name : 'unknown',
      }));
      return jsonResponse(request, { error: 'The resumable upload could not be assembled.' }, 502);
    }
  }),
});

http.route({
  path: '/document-source',
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    const uploadedFileId = new URL(request.url).searchParams.get('uploadedFileId');
    if (!uploadedFileId || !(await ctx.auth.getUserIdentity())) {
      return new Response('Authentication required', { status: 401, headers: { 'Cache-Control': 'no-store' } });
    }
    try {
      const info = await ctx.runQuery(internal.uploadedFiles.getAuthorizedSourceFileInternal, {
        uploadedFileId: uploadedFileId as Id<'uploadedFiles'>,
      });
      if (!info) return new Response('Source document not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
      const upstream = await fetch(info.storageUrl, { cache: 'no-store' });
      if (!upstream.ok || !upstream.body) {
        return new Response('Source document could not be retrieved', { status: 502, headers: { 'Cache-Control': 'no-store' } });
      }
      return new Response(upstream.body, {
        headers: {
          'Content-Type': info.mimeType,
          ...(info.byteLength > 0 ? { 'Content-Length': String(info.byteLength) } : {}),
          'Content-Disposition': inlineContentDisposition(info.filename),
          'Cache-Control': 'private, no-store, max-age=0',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; sandbox",
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/invalid|validation|valid id/i.test(message)) {
        return new Response('Invalid source document id', { status: 400, headers: { 'Cache-Control': 'no-store' } });
      }
      console.error(JSON.stringify({ level: 'error', event: 'document_source_failed', uploadedFileId }));
      return new Response('Source document could not be retrieved', { status: 502, headers: { 'Cache-Control': 'no-store' } });
    }
  }),
});

function inlineContentDisposition(filename: string) {
  const fallback = filename.replace(/["\\\r\n]/g, '_');
  const encoded = encodeURIComponent(filename)
    .replace(/['()]/g, (value) => `%${value.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/\*/g, '%2A');
  return `inline; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export default http;
