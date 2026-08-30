import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sha256Blob, uploadResumableFile } from '../uploadClient';

async function readRequest(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function respondJson(response: ServerResponse, body: Record<string, unknown>) {
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

describe('resumable upload real HTTP transport', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('retries only the interrupted chunk and reconciles a lost completion response', async () => {
    const uploadedChunks = new Map<number, Buffer>();
    const chunkRequests = new Map<number, number>();
    const authorizationHeaders: string[] = [];
    let completionRequests = 0;
    let completedStorageId: string | undefined;

    const server = createServer(async (request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      authorizationHeaders.push(request.headers.authorization ?? '');
      if (url.pathname === '/chunk') {
        const chunkIndex = Number(url.searchParams.get('chunkIndex'));
        const requestCount = (chunkRequests.get(chunkIndex) ?? 0) + 1;
        chunkRequests.set(chunkIndex, requestCount);
        const body = await readRequest(request);
        if (chunkIndex === 1 && requestCount === 1) {
          response.destroy();
          return;
        }
        uploadedChunks.set(chunkIndex, body);
        respondJson(response, { stored: true, chunkIndex });
        return;
      }
      if (url.pathname === '/complete') {
        completionRequests += 1;
        completedStorageId = 'storage-reconciled';
        response.destroy();
        return;
      }
      response.writeHead(404).end();
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Test server address was unavailable.');
      const baseUrl = `http://127.0.0.1:${address.port}`;
      const file = new File(['0123456789'], 'large-order.pdf', { type: 'application/pdf' });
      const fileSha256 = await sha256Blob(file);
      const query = vi.fn(async (_ref: unknown, args: Record<string, unknown>) => {
        if ('resumableUploadId' in args) return { storedChunkIndexes: [], status: 'issued' };
        return {
          uploadSessionId: 'session-1',
          storageId: completedStorageId,
          status: completedStorageId ? 'stored' : 'awaiting_storage_upload',
        };
      });
      const mutation = vi.fn(async () => ({ failed: true }));

      const storageId = await uploadResumableFile({
        convex: { query, mutation } as never,
        file,
        fileSha256,
        ticket: {
          alreadyStored: false,
          uploadSessionId: 'session-1',
          uploadAttemptId: 'attempt-2',
          attemptNo: 2,
          resumableUploadId: 'resumable-1',
          chunkBytes: 4,
          chunkCount: 3,
          chunkUploadUrl: `${baseUrl}/chunk`,
          completeUrl: `${baseUrl}/complete`,
          expiresAt: Date.now() + 60_000,
        },
        bearerToken: 'a'.repeat(64),
      });

      expect(storageId).toBe('storage-reconciled');
      expect(chunkRequests).toEqual(new Map([[0, 1], [1, 2], [2, 1]]));
      expect(Buffer.concat([...uploadedChunks.entries()].sort(([a], [b]) => a - b).map(([, value]) => value)).toString())
        .toBe('0123456789');
      expect(completionRequests).toBe(1);
      expect(authorizationHeaders).toHaveLength(5);
      expect(authorizationHeaders.every((value) => value === `Bearer ${'a'.repeat(64)}`)).toBe(true);
      expect(mutation).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 15_000);
});
