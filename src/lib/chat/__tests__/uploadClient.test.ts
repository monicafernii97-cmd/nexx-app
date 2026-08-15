import { beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadFileForConversation, type ChatComposerFileState } from '../uploadClient';
import { CHAT_UPLOAD_CONFIG } from '../uploadShared';

function makeFile(name = 'order.pdf', size = 5) {
  return new File(['x'.repeat(size)], name, { type: 'application/pdf' });
}

function installSuccessfulXhr(storageId = 'storage-1') {
  const instances: Array<{ url?: string; requestBody?: unknown }> = [];

  class MockXMLHttpRequest {
    status = 200;
    responseText = JSON.stringify({ storageId });
    upload = {} as XMLHttpRequestUpload;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    ontimeout: (() => void) | null = null;
    url?: string;
    requestBody?: unknown;

    constructor() {
      instances.push(this);
    }

    open(_method: string, url: string) {
      this.url = url;
    }

    setRequestHeader() {}

    send(body: unknown) {
      this.requestBody = body;
      queueMicrotask(() => this.onload?.());
    }
  }

  vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest);
  return instances;
}

function installTimeoutXhr() {
  class MockXMLHttpRequest {
    status = 0;
    statusText = '';
    readyState = 0;
    responseText = '';
    timeout = 0;
    upload = {} as XMLHttpRequestUpload;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    ontimeout: (() => void) | null = null;
    onreadystatechange: (() => void) | null = null;

    open() {}

    setRequestHeader() {}

    send() {
      queueMicrotask(() => this.ontimeout?.());
    }
  }

  vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest);
}

function installSequencedXhr(
  behaviors: Array<'blocked' | 'success' | 'response_lost'>,
  storageId = 'storage-fallback',
) {
  const instances: Array<{
    url?: string;
    headers: Record<string, string>;
  }> = [];

  class MockXMLHttpRequest {
    status = 0;
    statusText = '';
    readyState = 4;
    responseText = '';
    timeout = 0;
    upload = {} as XMLHttpRequestUpload & {
      onprogress?: (event: { lengthComputable: boolean; loaded: number; total: number }) => void;
    };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    ontimeout: (() => void) | null = null;
    onreadystatechange: (() => void) | null = null;
    url?: string;
    headers: Record<string, string> = {};

    constructor() {
      instances.push(this);
    }

    open(_method: string, url: string) {
      this.url = url;
    }

    setRequestHeader(name: string, value: string) {
      this.headers[name] = value;
    }

    send(body: unknown) {
      const behavior = behaviors.shift();
      const size = body instanceof File ? body.size : 0;
      queueMicrotask(() => {
        if (behavior === 'success') {
          this.status = 200;
          this.responseText = JSON.stringify({ storageId });
          this.upload.onprogress?.({ lengthComputable: true, loaded: size, total: size });
          this.onload?.();
          return;
        }
        if (behavior === 'response_lost') {
          this.upload.onprogress?.({ lengthComputable: true, loaded: size, total: size });
        }
        this.onerror?.();
      });
    }
  }

  vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest);
  return instances;
}

function makeConvexClient(readyStatus: 'ready' | 'partial' = 'ready') {
  const mutation = vi.fn(async (_ref: unknown, args: Record<string, unknown>) => {
    if ('filename' in args) {
      return {
        uploadSessionId: 'session-1',
        uploadAttemptId: 'attempt-1',
        attemptNo: 1,
        uploadUrl: 'https://convex-upload.test/file',
        uploadUrlExpiresAt: Date.now() + 60_000,
        status: 'awaiting_storage_upload',
        filename: args.filename,
        mimeType: args.mimeType,
        byteSize: args.byteSize,
        retryable: true,
        processingAttempt: 0,
      };
    }

    return {
      uploadSessionId: args.uploadSessionId,
      status: 'processing_queued',
    };
  }) as ReturnType<typeof vi.fn>;

  const query = vi.fn(async () => ({
    uploadSessionId: 'session-1',
    uploadedFileId: 'uploaded-1',
    storageId: 'storage-1',
    status: readyStatus,
    filename: 'order.pdf',
    mimeType: 'application/pdf',
    byteSize: 5,
    processingAttempt: 1,
    retryable: false,
    extractionPreview: 'Readable court order text.',
    extractionCharCount: 27,
    chatContextCharCount: 27,
    contextTruncated: false,
    extractionMethod: 'text',
  })) as ReturnType<typeof vi.fn>;

  return { mutation, query };
}

describe('uploadClient direct storage flow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uploads directly to Convex storage and returns an attachment ref', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const xhrInstances = installSuccessfulXhr();
    const convex = makeConvexClient();
    const onProgress = vi.fn();
    const onStatus = vi.fn();

    const upload = await uploadFileForConversation({
      convex: convex as never,
      file: makeFile(),
      conversationId: 'conversation-1',
      intent: 'court_order',
      clientUploadKey: 'client-upload-1',
      onProgress,
      onStatus,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(xhrInstances[0]?.url).toBe('https://convex-upload.test/file');
    expect(xhrInstances[0]?.requestBody).toBeInstanceOf(File);
    expect(convex.mutation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      filename: 'order.pdf',
      clientUploadKey: 'client-upload-1',
    }));
    expect(convex.mutation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      uploadSessionId: 'session-1',
      uploadAttemptId: 'attempt-1',
      storageId: 'storage-1',
    }));
    expect(convex.query).toHaveBeenCalledTimes(1);
    expect(upload).toMatchObject({
      ok: true,
      uploadSessionId: 'session-1',
      uploadedFileId: 'uploaded-1',
      storageId: 'storage-1',
      status: 'ready',
      attachmentRef: {
        uploadedFileId: 'uploaded-1',
        uploadSessionId: 'session-1',
        storageId: 'storage-1',
        filename: 'order.pdf',
        status: 'ready',
      },
    });
    expect(onProgress).toHaveBeenCalledWith(100);
    expect(onStatus).toHaveBeenCalledWith('uploading_to_storage');
  });

  it('reuses stored files on processing retry instead of uploading again', async () => {
    const xhrInstances = installSuccessfulXhr();
    const convex = makeConvexClient('partial');
    convex.query
      .mockResolvedValueOnce({
        uploadSessionId: 'session-1',
        storageId: 'storage-1',
        status: 'failed_processing',
        filename: 'order.pdf',
        mimeType: 'application/pdf',
        byteSize: 5,
        processingAttempt: 1,
        retryable: true,
      })
      .mockResolvedValueOnce({
        uploadSessionId: 'session-1',
        uploadedFileId: 'uploaded-1',
        storageId: 'storage-1',
        status: 'partial',
        filename: 'order.pdf',
        mimeType: 'application/pdf',
        byteSize: 5,
        processingAttempt: 2,
        retryable: false,
      });
    const existingSession: ChatComposerFileState = {
      file: makeFile(),
      intent: 'attachment',
      clientUploadKey: 'client-upload-1',
      clientTurnId: 'client-turn-1',
      uploadSessionId: 'session-1',
      storageId: 'storage-1',
      status: 'failed_processing',
      retryable: true,
    };

    const upload = await uploadFileForConversation({
      convex: convex as never,
      file: makeFile(),
      conversationId: 'conversation-1',
      intent: 'attachment',
      clientUploadKey: 'client-upload-1',
      existingSession,
    });

    expect(xhrInstances).toHaveLength(0);
    expect(convex.mutation).toHaveBeenCalledTimes(1);
    expect(upload.status).toBe('partial');
    expect(upload.attachmentRef.status).toBe('partial');
  });

  it('retries partial sessions with indexing errors without uploading again', async () => {
    const xhrInstances = installSuccessfulXhr();
    const convex = makeConvexClient('ready');
    convex.query
      .mockResolvedValueOnce({
        uploadSessionId: 'session-1',
        uploadedFileId: 'uploaded-1',
        storageId: 'storage-1',
        status: 'partial',
        filename: 'order.pdf',
        mimeType: 'application/pdf',
        byteSize: 5,
        processingAttempt: 1,
        retryable: false,
        indexingError: "400 Unknown parameter: 'metadata'.",
      })
      .mockResolvedValueOnce({
        uploadSessionId: 'session-1',
        uploadedFileId: 'uploaded-1',
        storageId: 'storage-1',
        status: 'ready',
        filename: 'order.pdf',
        mimeType: 'application/pdf',
        byteSize: 5,
        processingAttempt: 2,
        retryable: false,
      });

    const upload = await uploadFileForConversation({
      convex: convex as never,
      file: makeFile(),
      conversationId: 'conversation-1',
      intent: 'attachment',
      clientUploadKey: 'client-upload-1',
      existingSession: {
        file: makeFile(),
        intent: 'attachment',
        clientUploadKey: 'client-upload-1',
        clientTurnId: 'client-turn-1',
        uploadSessionId: 'session-1',
        storageId: 'storage-1',
        uploadedFileId: 'uploaded-1',
        status: 'partial',
        error: "400 Unknown parameter: 'metadata'.",
        retryable: false,
      },
    });

    expect(xhrInstances).toHaveLength(0);
    expect(convex.mutation).toHaveBeenCalledTimes(1);
    expect(convex.mutation).toHaveBeenCalledWith(expect.anything(), {
      uploadSessionId: 'session-1',
    });
    expect(upload.status).toBe('ready');
  });

  it('mints a fresh upload URL when retrying a failed storage upload', async () => {
    const xhrInstances = installSuccessfulXhr();
    const convex = makeConvexClient();
    convex.query.mockResolvedValueOnce({
      uploadSessionId: 'session-1',
      status: 'failed_storage_upload',
      filename: 'order.pdf',
      mimeType: 'application/pdf',
      byteSize: 5,
      processingAttempt: 0,
      retryable: true,
    });
    convex.mutation.mockImplementation(async (_ref: unknown, args: Record<string, unknown>) => {
      if ('filename' in args) {
        return {
          uploadSessionId: 'session-1',
          uploadAttemptId: 'attempt-2',
          attemptNo: 2,
          uploadUrl: 'https://convex-upload.test/fresh-file',
          uploadUrlExpiresAt: Date.now() + 60_000,
          status: 'awaiting_storage_upload',
          filename: args.filename,
          mimeType: args.mimeType,
          byteSize: args.byteSize,
          retryable: true,
          processingAttempt: 0,
        };
      }
      return { uploadSessionId: args.uploadSessionId, status: 'processing_queued' };
    });

    await uploadFileForConversation({
      convex: convex as never,
      file: makeFile(),
      conversationId: 'conversation-1',
      intent: 'attachment',
      clientUploadKey: 'client-upload-1',
      existingSession: {
        file: makeFile(),
        intent: 'attachment',
        clientUploadKey: 'client-upload-1',
        clientTurnId: 'client-turn-1',
        uploadSessionId: 'session-1',
        status: 'failed_storage_upload',
        retryable: true,
      },
    });

    expect(xhrInstances[0]?.url).toBe('https://convex-upload.test/fresh-file');
    expect(convex.mutation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      filename: 'order.pdf',
      clientUploadKey: 'client-upload-1',
    }));
  });

  it('classifies storage upload timeout separately from generic network failure', async () => {
    installTimeoutXhr();
    const convex = makeConvexClient();
    const largeFile = makeFile();
    Object.defineProperty(largeFile, 'size', {
      configurable: true,
      value: CHAT_UPLOAD_CONFIG.fallbackUploadMaxBytes + 1,
    });

    await expect(uploadFileForConversation({
      convex: convex as never,
      file: largeFile,
      conversationId: 'conversation-1',
      intent: 'court_order',
      clientUploadKey: 'client-upload-1',
    })).rejects.toThrow('The file did not finish uploading within the storage time limit.');

    expect(convex.mutation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      eventType: 'storage_post_failed',
      diagnostics: expect.objectContaining({
        failureKind: 'timeout',
      }),
    }));
  });

  it('automatically uses the authenticated fallback route after a blocked direct upload', async () => {
    vi.useFakeTimers();
    try {
      const xhrInstances = installSequencedXhr(['blocked', 'success']);
      const convex = makeConvexClient();
      convex.mutation.mockImplementation(async (_ref: unknown, args: Record<string, unknown>) => {
        if ('filename' in args) {
          return {
            uploadSessionId: 'session-1',
            uploadAttemptId: 'attempt-1',
            attemptNo: 1,
            uploadUrl: 'https://convex-upload.test/direct',
            status: 'awaiting_storage_upload',
            filename: args.filename,
            mimeType: args.mimeType,
            byteSize: args.byteSize,
            retryable: true,
            processingAttempt: 0,
          };
        }
        if ('tokenHash' in args) {
          return {
            alreadyStored: false,
            uploadSessionId: 'session-1',
            uploadAttemptId: 'attempt-2',
            attemptNo: 2,
            fallbackUploadUrl: 'https://deployment.convex.site/chat-upload-fallback?uploadSessionId=session-1&uploadAttemptId=attempt-2',
            expiresAt: Date.now() + 60_000,
          };
        }
        return { uploadSessionId: args.uploadSessionId, status: 'processing_queued' };
      });

      const uploadPromise = uploadFileForConversation({
        convex: convex as never,
        file: makeFile(),
        conversationId: 'conversation-1',
        intent: 'court_order',
        clientUploadKey: 'client-upload-1',
      });
      await vi.runAllTimersAsync();
      const upload = await uploadPromise;

      expect(xhrInstances).toHaveLength(2);
      expect(xhrInstances[0]?.url).toContain('/direct');
      expect(xhrInstances[1]?.url).toContain('/chat-upload-fallback');
      expect(xhrInstances[1]?.headers.Authorization).toMatch(/^Bearer [a-f0-9]{64}$/);
      expect(convex.mutation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        uploadSessionId: 'session-1',
        uploadAttemptId: 'attempt-2',
        storageId: 'storage-fallback',
      }));
      expect(upload.status).toBe('ready');
    } finally {
      vi.useRealTimers();
    }
  });

  it('reconciles a completed fallback upload when its HTTP response is lost', async () => {
    vi.useFakeTimers();
    try {
      installSequencedXhr(['blocked', 'response_lost']);
      const convex = makeConvexClient();
      convex.mutation.mockImplementation(async (_ref: unknown, args: Record<string, unknown>) => {
        if ('filename' in args) {
          return {
            uploadSessionId: 'session-1',
            uploadAttemptId: 'attempt-1',
            attemptNo: 1,
            uploadUrl: 'https://convex-upload.test/direct',
            status: 'awaiting_storage_upload',
            filename: args.filename,
            mimeType: args.mimeType,
            byteSize: args.byteSize,
            retryable: true,
            processingAttempt: 0,
          };
        }
        if ('tokenHash' in args) {
          return {
            alreadyStored: false,
            uploadSessionId: 'session-1',
            uploadAttemptId: 'attempt-2',
            attemptNo: 2,
            fallbackUploadUrl: 'https://deployment.convex.site/chat-upload-fallback?uploadSessionId=session-1&uploadAttemptId=attempt-2',
            expiresAt: Date.now() + 60_000,
          };
        }
        return { uploadSessionId: args.uploadSessionId, status: 'processing_queued' };
      });

      const uploadPromise = uploadFileForConversation({
        convex: convex as never,
        file: makeFile(),
        conversationId: 'conversation-1',
        intent: 'court_order',
        clientUploadKey: 'client-upload-1',
      });
      await vi.runAllTimersAsync();
      const upload = await uploadPromise;

      expect(convex.query).toHaveBeenCalledTimes(2);
      expect(upload).toMatchObject({ storageId: 'storage-1', status: 'ready' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('normalizes resumed Convex sessions that use existing storage field names', async () => {
    const xhrInstances = installSuccessfulXhr();
    const mutation = vi.fn(async () => ({
      uploadSessionId: 'session-1',
      existingStorageId: 'storage-1',
      existingUploadedFileId: 'uploaded-1',
      status: 'ready',
      filename: 'order.pdf',
      mimeType: 'application/pdf',
      byteSize: 5,
      processingAttempt: 1,
      retryable: false,
    }));
    const query = vi.fn(async () => ({
      uploadSessionId: 'session-1',
      existingStorageId: 'storage-1',
      existingUploadedFileId: 'uploaded-1',
      status: 'ready',
      filename: 'order.pdf',
      mimeType: 'application/pdf',
      byteSize: 5,
      processingAttempt: 1,
      retryable: false,
    }));

    const upload = await uploadFileForConversation({
      convex: { mutation, query } as never,
      file: makeFile(),
      conversationId: 'conversation-1',
      intent: 'attachment',
      clientUploadKey: 'client-upload-1',
    });

    expect(xhrInstances).toHaveLength(0);
    expect(mutation).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(1);
    expect(upload).toMatchObject({
      uploadedFileId: 'uploaded-1',
      storageId: 'storage-1',
      attachmentRef: {
        uploadedFileId: 'uploaded-1',
        storageId: 'storage-1',
      },
    });
  });

  it('throws a clear error when processing finishes with empty extraction', async () => {
    installSuccessfulXhr();
    const convex = makeConvexClient();
    convex.query.mockResolvedValueOnce({
      uploadSessionId: 'session-1',
      storageId: 'storage-1',
      status: 'failed_empty_extraction',
      filename: 'order.pdf',
      mimeType: 'application/pdf',
      byteSize: 5,
      errorMessage: 'NEXX could not read any text from this file.',
      retryable: false,
    });

    await expect(uploadFileForConversation({
      convex: convex as never,
      file: makeFile(),
      conversationId: 'conversation-1',
      intent: 'court_order',
      clientUploadKey: 'client-upload-1',
    })).rejects.toThrow('NEXX could not read any text from this file.');
  });
});
