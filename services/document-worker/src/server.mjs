import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { spawn } from 'node:child_process';
import http from 'node:http';
import mammoth from 'mammoth';

const PORT = Number(process.env.PORT || 8080);
const TOKEN = process.env.DOCUMENT_WORKER_TOKEN;
const WORKER_VERSION = process.env.WORKER_VERSION || 'nexx-doc-worker-0.1.0';
const TIKA_SERVER_URL = process.env.TIKA_SERVER_URL?.replace(/\/+$/, '');
const CFB_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const SOURCE_FETCH_TIMEOUT_MS = 30_000;
const TIKA_FETCH_TIMEOUT_MS = 45_000;
const MAX_JSON_BODY_BYTES = 64 * 1024;

function jsonResponse(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function failure(attachmentId, code, userMessage, internalSummary, metadata = {}) {
  return {
    status: 'failed',
    attachmentId,
    error: { code, userMessage, internalSummary },
    metadata: {
      workerVersion: WORKER_VERSION,
      libreOfficeVersion: metadata.libreOfficeVersion,
      tikaVersion: metadata.tikaVersion,
    },
  };
}

async function readJsonBody(req) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_JSON_BODY_BYTES) {
      throw new Error('REQUEST_BODY_TOO_LARGE');
    }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function readUtf16LeString(buffer, offset, byteLength) {
  const chars = [];
  const end = Math.min(buffer.length, offset + byteLength);
  for (let index = offset; index + 1 < end; index += 2) {
    const code = buffer[index] | (buffer[index + 1] << 8);
    if (code === 0) break;
    chars.push(code);
  }
  return String.fromCharCode(...chars);
}

function listOleStreams(buffer) {
  if (buffer.length < 512 || !buffer.subarray(0, 8).equals(CFB_MAGIC)) return null;
  const sectorShift = buffer.readUInt16LE(30);
  const sectorSize = 1 << sectorShift;
  const firstDirectorySector = buffer.readInt32LE(48);
  if (sectorSize < 512 || firstDirectorySector < 0) return null;
  const directoryOffset = (firstDirectorySector + 1) * sectorSize;
  if (directoryOffset < 0 || directoryOffset >= buffer.length) return null;

  const streams = [];
  const directoryEnd = Math.min(buffer.length, directoryOffset + sectorSize * 4);
  for (let offset = directoryOffset; offset + 128 <= directoryEnd; offset += 128) {
    const nameLength = buffer.readUInt16LE(offset + 64);
    if (nameLength < 2 || nameLength > 64) continue;
    const name = readUtf16LeString(buffer, offset, nameLength - 2);
    if (name) streams.push(name);
  }
  return streams;
}

function validateLegacyDoc(buffer) {
  const streams = listOleStreams(buffer);
  if (!streams) return { ok: false, code: 'NOT_WORD_BINARY_DOC' };
  const normalized = new Set(streams.map((stream) => stream.toLowerCase()));
  if (!normalized.has('worddocument') || (!normalized.has('0table') && !normalized.has('1table'))) {
    return { ok: false, code: 'NOT_WORD_BINARY_DOC' };
  }
  if (normalized.has('encryptedpackage') || normalized.has('encryptioninfo')) {
    return { ok: false, code: 'PASSWORD_PROTECTED' };
  }
  if (streams.some((stream) => {
    const lower = stream.toLowerCase();
    return lower.includes('vba') || lower.includes('macros') || lower === '_vba_project';
  })) {
    return { ok: false, code: 'MACRO_ENABLED_UNSUPPORTED' };
  }
  return { ok: true, warnings: ['LEGACY_DOC_REVIEW_RECOMMENDED'] };
}

function normalizeText(text) {
  return text
    .normalize('NFC')
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .trim();
}

function runCommand(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('CONVERSION_TIMEOUT'));
    }, options.timeoutMs);

    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({
          stdout: Buffer.concat(stdout).toString('utf8'),
          stderr: Buffer.concat(stderr).toString('utf8'),
        });
      } else {
        reject(new Error(`CONVERSION_FAILED:${Buffer.concat(stderr).toString('utf8').slice(0, 500)}`));
      }
    });
  });
}

async function getLibreOfficeVersion() {
  try {
    const result = await runCommand('soffice', ['--version'], {
      cwd: tmpdir(),
      env: process.env,
      timeoutMs: 5000,
    });
    return result.stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

async function convertDocToDocx(inputPath, outputDir, profileDir, timeoutMs) {
  await runCommand('soffice', [
    '--headless',
    '--nologo',
    '--nofirststartwizard',
    '--nodefault',
    '--norestore',
    '--nolockcheck',
    `-env:UserInstallation=file://${profileDir}`,
    '--convert-to',
    'docx',
    '--outdir',
    outputDir,
    inputPath,
  ], {
    cwd: outputDir,
    env: {
      ...process.env,
      HOME: profileDir,
    },
    timeoutMs,
  });

  return join(outputDir, `${basename(inputPath, '.doc')}.docx`);
}

async function extractWithTika(buffer) {
  if (!TIKA_SERVER_URL) return null;
  const response = await fetch(`${TIKA_SERVER_URL}/tika`, {
    method: 'PUT',
    headers: {
      Accept: 'text/plain',
      'Content-Type': 'application/msword',
    },
    body: buffer,
    signal: AbortSignal.timeout(TIKA_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) return null;
  return normalizeText(await response.text());
}

async function handleExtract(body) {
  const attachmentId = body?.attachmentId || 'unknown';
  const options = body?.options ?? {};
  if (!options.enableLegacyDoc) {
    return failure(attachmentId, 'UNSUPPORTED_FILE_TYPE', 'Legacy DOC extraction is not enabled.', 'enableLegacyDoc was false');
  }
  if (body?.source?.type !== 'signed_url' || !body.source.url) {
    return failure(attachmentId, 'UNKNOWN_EXTRACTION_ERROR', 'Document processing is temporarily unavailable. Please try again.', 'Missing signed source URL');
  }
  if (!Number.isFinite(options.maxSizeBytes) || options.maxSizeBytes <= 0) {
    return failure(attachmentId, 'UNKNOWN_EXTRACTION_ERROR', 'Document processing is temporarily unavailable. Please try again.', 'maxSizeBytes not provided');
  }
  if (body.sizeBytes > options.maxSizeBytes) {
    return failure(attachmentId, 'FILE_TOO_LARGE', 'File too large. Maximum size is 25MB.', 'sizeBytes exceeded maxSizeBytes');
  }

  const sourceResponse = await fetch(body.source.url, {
    signal: AbortSignal.timeout(SOURCE_FETCH_TIMEOUT_MS),
  });
  if (!sourceResponse.ok) {
    return failure(attachmentId, 'WORKER_UNAVAILABLE', 'Document processing is temporarily unavailable. Please try again.', `Source fetch failed ${sourceResponse.status}`);
  }

  const buffer = Buffer.from(await sourceResponse.arrayBuffer());
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  const preflight = validateLegacyDoc(buffer);
  if (!preflight.ok) {
    const messages = {
      NOT_WORD_BINARY_DOC: 'This .doc file is not a readable Microsoft Word binary document. Please re-save it as DOCX or PDF.',
      PASSWORD_PROTECTED: 'This document is password-protected. Please upload an unlocked copy.',
      MACRO_ENABLED_UNSUPPORTED: 'This Word file contains macros or active content, which NEXX does not process for safety. Please save a clean DOCX or PDF copy.',
    };
    return failure(attachmentId, preflight.code, messages[preflight.code], `Legacy DOC preflight failed: ${preflight.code}`);
  }

  const jobDir = await mkdtemp(join(tmpdir(), 'nexx-doc-job-'));
  const outDir = await mkdtemp(join(tmpdir(), 'nexx-doc-out-'));
  const profileDir = await mkdtemp(join(tmpdir(), 'nexx-lo-profile-'));
  const libreOfficeVersion = await getLibreOfficeVersion();

  try {
    const inputPath = join(jobDir, 'input.doc');
    await writeFile(inputPath, buffer);
    const convertedPath = await convertDocToDocx(inputPath, outDir, profileDir, options.timeoutMs ?? 60000);
    const converted = await readFile(convertedPath);
    const docxResult = await mammoth.extractRawText({ buffer: converted });
    let text = normalizeText(docxResult.value ?? '');
    let extractionMethod = 'doc_libreoffice_docx';
    const warnings = [...(preflight.warnings ?? [])];

    if (!text && TIKA_SERVER_URL) {
      const tikaText = await extractWithTika(buffer);
      if (tikaText) {
        text = tikaText;
        extractionMethod = 'doc_tika_direct';
      }
    }

    if (!text) {
      return failure(
        attachmentId,
        options.enableOcr ? 'OCR_EMPTY' : 'EXTRACTION_EMPTY',
        'NEXX could not find readable text in this document. Please upload a text-based DOCX/PDF or a clearer scan.',
        'LibreOffice/Tika extraction produced empty text',
        { libreOfficeVersion },
      );
    }

    return {
      status: 'succeeded',
      attachmentId,
      detectedType: 'doc',
      sha256,
      text,
      metadata: {
        charCount: text.length,
        wordCount: text.split(/\s+/).filter(Boolean).length,
        extractionMethod,
        hasOcr: false,
        warnings,
        workerVersion: WORKER_VERSION,
        libreOfficeVersion,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('CONVERSION_TIMEOUT')) {
      return failure(
        attachmentId,
        'CONVERSION_TIMEOUT',
        'This document took too long to convert. Please upload a smaller DOCX or PDF version.',
        'LibreOffice conversion timed out',
        { libreOfficeVersion },
      );
    }
    return failure(
      attachmentId,
      'CONVERSION_FAILED',
      'This document appears to be corrupt or unreadable. Please re-save it as DOCX or PDF and try again.',
      message.slice(0, 500),
      { libreOfficeVersion },
    );
  } finally {
    await Promise.all([
      rm(jobDir, { recursive: true, force: true }),
      rm(outDir, { recursive: true, force: true }),
      rm(profileDir, { recursive: true, force: true }),
    ]);
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      const libreOfficeVersion = await getLibreOfficeVersion();
      return jsonResponse(res, libreOfficeVersion ? 200 : 503, {
        ok: Boolean(libreOfficeVersion),
        workerVersion: WORKER_VERSION,
        libreOfficeVersion,
        tikaConfigured: Boolean(TIKA_SERVER_URL),
      });
    }
    if (req.method !== 'POST' || req.url !== '/v1/extract') {
      return jsonResponse(res, 404, { error: 'Not found' });
    }
    if (!TOKEN || req.headers.authorization !== `Bearer ${TOKEN}`) {
      return jsonResponse(res, 401, { error: 'Unauthorized' });
    }
    const body = await readJsonBody(req);
    const result = await handleExtract(body);
    return jsonResponse(res, result.status === 'succeeded' ? 200 : 422, result);
  } catch (error) {
    if (error instanceof Error && error.message === 'REQUEST_BODY_TOO_LARGE') {
      return jsonResponse(res, 413, {
        status: 'failed',
        attachmentId: 'unknown',
        error: {
          code: 'FILE_TOO_LARGE',
          userMessage: 'Document processing request was too large.',
          internalSummary: 'Worker JSON request body exceeded maximum size.',
        },
        metadata: { workerVersion: WORKER_VERSION },
      });
    }
    return jsonResponse(res, 500, {
      status: 'failed',
      attachmentId: 'unknown',
      error: {
        code: 'UNKNOWN_EXTRACTION_ERROR',
        userMessage: 'Document processing is temporarily unavailable. Please try again.',
        internalSummary: error instanceof Error ? error.message.slice(0, 500) : String(error),
      },
      metadata: { workerVersion: WORKER_VERSION },
    });
  }
});

server.listen(PORT, () => {
  console.info('[DocumentWorker] listening', { port: PORT, workerVersion: WORKER_VERSION });
});
