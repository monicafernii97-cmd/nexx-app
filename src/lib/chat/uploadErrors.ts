import { getChatUploadExtension } from './uploadConfig';

export type StorageUploadFailureKind =
  | 'offline'
  | 'timeout'
  | 'aborted'
  | 'network_or_cors'
  | 'http_error'
  | 'bad_response'
  | 'unknown';

export type UploadDiagnostics = {
  sessionId: string;
  attemptId: string;
  clientUploadKey: string;
  clientTurnId: string;
  fileSize: number;
  fileType: string;
  fileExtension: string;
  uploadUrlHost: string;
  uploadUrlProtocol: string;
  elapsedMs: number;
  readyState: number;
  status: number;
  statusText: string;
  loadedBytes: number;
  totalBytes: number;
  progressEvents: number;
  lastProgressElapsedMs: number | null;
  onlineAtStart: boolean;
  onlineAtEnd: boolean;
  visibilityState: DocumentVisibilityState;
  effectiveType?: string;
  saveData?: boolean;
  eventType: 'load' | 'error' | 'timeout' | 'abort';
};

export class StorageUploadError extends Error {
  readonly kind: StorageUploadFailureKind;
  readonly diagnostics: UploadDiagnostics;
  readonly retryable: boolean;

  constructor(args: {
    kind: StorageUploadFailureKind;
    message: string;
    diagnostics: UploadDiagnostics;
    retryable: boolean;
  }) {
    super(args.message);
    this.name = 'StorageUploadError';
    this.kind = args.kind;
    this.diagnostics = args.diagnostics;
    this.retryable = args.retryable;
  }
}

export function getStorageUploadUserMessage(kind: StorageUploadFailureKind) {
  switch (kind) {
    case 'offline':
      return 'You appear to be offline. Reconnect and retry the upload.';
    case 'timeout':
      return 'The file did not finish uploading within the storage time limit. Try again on a stronger connection or use a smaller file.';
    case 'aborted':
      return 'The upload was interrupted before it finished. Retry the upload.';
    case 'network_or_cors':
      return 'The browser could not complete the direct storage upload. This can happen with VPNs, privacy extensions, corporate networks, or blocked storage domains.';
    case 'http_error':
      return 'Storage rejected the upload. Retry once; if it continues, report this upload diagnostic.';
    case 'bad_response':
      return 'Storage responded unexpectedly after upload. Retry once.';
    default:
      return 'Upload failed unexpectedly. Retry the upload.';
  }
}

type NavigatorWithConnection = Navigator & {
  connection?: {
    effectiveType?: string;
    saveData?: boolean;
  };
};

export type StorageUploadProgress = {
  loadedBytes: number;
  totalBytes: number;
  percent: number;
};

export type StorageUploadDiagnosticEvent = {
  type: 'storage_post_started' | 'storage_post_progress' | 'storage_post_failed' | 'storage_post_succeeded';
  diagnostics: UploadDiagnostics;
  failureKind?: StorageUploadFailureKind;
  failureMessageSafe?: string;
};

export type StorageUploadResult = {
  storageId: string;
  diagnostics: UploadDiagnostics;
};

export function postFileToStorageWithDiagnostics(args: {
  uploadUrl: string;
  file: File;
  sessionId: string;
  attemptId: string;
  clientUploadKey: string;
  clientTurnId: string;
  timeoutMs?: number;
  onProgress?: (progress: StorageUploadProgress) => void;
  onDiagnosticEvent?: (event: StorageUploadDiagnosticEvent) => void;
}): Promise<StorageUploadResult> {
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const uploadUrl = new URL(args.uploadUrl);
  const nav = typeof navigator !== 'undefined' ? navigator as NavigatorWithConnection : undefined;
  const onlineAtStart = nav?.onLine ?? true;
  const connection = nav?.connection;
  let loadedBytes = 0;
  let totalBytes = args.file.size;
  let progressEvents = 0;
  let lastProgressElapsedMs: number | null = null;
  let settled = false;

  const buildDiagnostics = (
    eventType: UploadDiagnostics['eventType'],
    xhr: XMLHttpRequest,
  ): UploadDiagnostics => ({
    sessionId: args.sessionId,
    attemptId: args.attemptId,
    clientUploadKey: args.clientUploadKey,
    clientTurnId: args.clientTurnId,
    fileSize: args.file.size,
    fileType: args.file.type || 'application/octet-stream',
    fileExtension: getChatUploadExtension(args.file.name),
    uploadUrlHost: uploadUrl.host,
    uploadUrlProtocol: uploadUrl.protocol,
    elapsedMs: Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt),
    readyState: xhr.readyState,
    status: xhr.status,
    statusText: xhr.statusText,
    loadedBytes,
    totalBytes,
    progressEvents,
    lastProgressElapsedMs,
    onlineAtStart,
    onlineAtEnd: nav?.onLine ?? true,
    visibilityState: typeof document !== 'undefined' ? document.visibilityState : 'visible',
    effectiveType: connection?.effectiveType,
    saveData: connection?.saveData,
    eventType,
  });

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    const rejectOnce = (
      kind: StorageUploadFailureKind,
      message: string,
      eventType: UploadDiagnostics['eventType'],
      retryable: boolean,
    ) => {
      if (settled) return;
      settled = true;
      const diagnostics = buildDiagnostics(eventType, xhr);
      args.onDiagnosticEvent?.({
        type: 'storage_post_failed',
        diagnostics,
        failureKind: kind,
        failureMessageSafe: message,
      });
      reject(new StorageUploadError({
        kind,
        message,
        diagnostics,
        retryable,
      }));
    };

    xhr.timeout = args.timeoutMs ?? 135_000;
    xhr.responseType = 'text';
    xhr.withCredentials = false;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        loadedBytes = event.loaded;
        totalBytes = event.total;
      } else {
        loadedBytes = event.loaded;
      }
      progressEvents += 1;
      lastProgressElapsedMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt);
      const percent = totalBytes > 0
        ? Math.min(99, Math.round((loadedBytes / totalBytes) * 100))
        : 0;
      args.onProgress?.({ loadedBytes, totalBytes, percent });
      args.onDiagnosticEvent?.({
        type: 'storage_post_progress',
        diagnostics: buildDiagnostics('load', xhr),
      });
    };
    xhr.onload = () => {
      if (settled) return;
      const diagnostics = buildDiagnostics('load', xhr);
      if (xhr.status < 200 || xhr.status >= 300) {
        settled = true;
        args.onDiagnosticEvent?.({
          type: 'storage_post_failed',
          diagnostics,
          failureKind: 'http_error',
          failureMessageSafe: `Storage upload failed with HTTP ${xhr.status}.`,
        });
        reject(new StorageUploadError({
          kind: 'http_error',
          message: `Storage upload failed with HTTP ${xhr.status}.`,
          diagnostics,
          retryable: xhr.status >= 500 || xhr.status === 408 || xhr.status === 429,
        }));
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(xhr.responseText);
      } catch {
        settled = true;
        args.onDiagnosticEvent?.({
          type: 'storage_post_failed',
          diagnostics,
          failureKind: 'bad_response',
          failureMessageSafe: 'Storage upload completed but returned an invalid response.',
        });
        reject(new StorageUploadError({
          kind: 'bad_response',
          message: 'Storage upload completed but returned an invalid response.',
          diagnostics,
          retryable: true,
        }));
        return;
      }

      const storageId =
        parsed &&
        typeof parsed === 'object' &&
        'storageId' in parsed &&
        typeof (parsed as { storageId: unknown }).storageId === 'string'
          ? (parsed as { storageId: string }).storageId
          : null;
      if (!storageId) {
        settled = true;
        args.onDiagnosticEvent?.({
          type: 'storage_post_failed',
          diagnostics,
          failureKind: 'bad_response',
          failureMessageSafe: 'Storage upload completed but did not return a storageId.',
        });
        reject(new StorageUploadError({
          kind: 'bad_response',
          message: 'Storage upload completed but did not return a storageId.',
          diagnostics,
          retryable: true,
        }));
        return;
      }

      settled = true;
      args.onDiagnosticEvent?.({ type: 'storage_post_succeeded', diagnostics });
      resolve({ storageId, diagnostics });
    };
    xhr.onerror = () => {
      const kind: StorageUploadFailureKind = nav?.onLine === false ? 'offline' : 'network_or_cors';
      rejectOnce(
        kind,
        getStorageUploadUserMessage(kind),
        'error',
        true,
      );
    };
    xhr.ontimeout = () => {
      rejectOnce('timeout', getStorageUploadUserMessage('timeout'), 'timeout', true);
    };
    xhr.onabort = () => {
      rejectOnce('aborted', getStorageUploadUserMessage('aborted'), 'abort', true);
    };

    args.onDiagnosticEvent?.({
      type: 'storage_post_started',
      diagnostics: buildDiagnostics('load', xhr),
    });
    xhr.open('POST', args.uploadUrl, true);
    xhr.setRequestHeader('Content-Type', args.file.type || 'application/octet-stream');
    xhr.send(args.file);
  });
}
