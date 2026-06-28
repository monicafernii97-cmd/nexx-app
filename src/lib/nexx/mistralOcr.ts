import type { ExtractionErrorCode } from './documentTypeDetection';

const DEFAULT_MISTRAL_OCR_MODEL = 'mistral-ocr-4-0';
const DEFAULT_MISTRAL_OCR_ENDPOINT = 'https://api.mistral.ai/v1/ocr';
const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_MAX_FILE_MB = 100;
const MISTRAL_OCR_4_COST_PER_PAGE_USD = 4 / 1000;
const LOW_CONFIDENCE_THRESHOLD = 0.85;

export type MistralOcrConfig = {
  enabled: boolean;
  apiKey?: string;
  model: string;
  endpoint: string;
  timeoutMs: number;
  maxBytes: number;
  legalHighQualityProcessing: boolean;
};

export type MistralOcrExtractionResult = {
  text?: string;
  error?: string;
  errorCode?: ExtractionErrorCode;
  method?: string;
  ocrAttempted?: boolean;
  pagesOcrProcessed?: number;
  pagesTotal?: number;
  warnings?: string[];
  ocrProvider?: 'mistral';
  ocrModel?: string;
  ocrRequestMode?: 'base64_stateless';
  ocrAverageConfidence?: number;
  ocrMinConfidence?: number;
  ocrUsagePages?: number;
  ocrUsageBytes?: number;
  estimatedOcrCostUsd?: number;
  ocrBlocksDetected?: number;
  ocrTablesDetected?: number;
  ocrProviderRequestId?: string;
};

type MistralOcrPage = {
  index?: number;
  markdown?: string;
  text?: string;
  header?: string | null;
  footer?: string | null;
  confidence_scores?: {
    average_page_confidence_score?: number;
    minimum_page_confidence_score?: number;
  } | null;
  blocks?: unknown[] | null;
  tables?: unknown[] | null;
};

type MistralOcrResponse = {
  pages?: MistralOcrPage[];
  model?: string;
  usage_info?: {
    pages_processed?: number;
    doc_size_bytes?: number;
  };
};

function parsePositiveInt(raw: string | undefined, fallback: number) {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePositiveFloat(raw: string | undefined, fallback: number) {
  if (!raw) return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeText(text: string) {
  return text.replace(/\u0000/g, '').replace(/\r\n/g, '\n').trim();
}

function confidenceNumbers(pages: MistralOcrPage[]) {
  const averages = pages
    .map((page) => page.confidence_scores?.average_page_confidence_score)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const minimums = pages
    .map((page) => page.confidence_scores?.minimum_page_confidence_score)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  return {
    average: averages.length > 0
      ? averages.reduce((sum, value) => sum + value, 0) / averages.length
      : undefined,
    minimum: minimums.length > 0
      ? Math.min(...minimums)
      : undefined,
  };
}

function getProviderRequestId(response: Response) {
  return (
    response.headers.get('x-request-id') ??
    response.headers.get('x-mistral-request-id') ??
    response.headers.get('request-id') ??
    undefined
  );
}

function countPageItems<T extends 'blocks' | 'tables'>(pages: MistralOcrPage[], field: T) {
  return pages.reduce((sum, page) => sum + (Array.isArray(page[field]) ? page[field].length : 0), 0);
}

function buildPageText(page: MistralOcrPage) {
  const pageNumber = typeof page.index === 'number' ? page.index : undefined;
  const content = normalizeText(page.markdown ?? page.text ?? '');
  const header = normalizeText(page.header ?? '');
  const footer = normalizeText(page.footer ?? '');
  const segments = [
    pageNumber !== undefined ? `[Page ${pageNumber}]` : undefined,
    header ? `[Header]\n${header}` : undefined,
    content,
    footer ? `[Footer]\n${footer}` : undefined,
  ].filter(Boolean);
  return segments.join('\n\n');
}

export function getMistralOcrConfig(env: NodeJS.ProcessEnv = process.env): MistralOcrConfig {
  const maxFileMb = parsePositiveFloat(env.MISTRAL_OCR_MAX_FILE_MB, DEFAULT_MAX_FILE_MB);
  const apiKey = env.MISTRAL_API_KEY?.trim();
  const model = env.MISTRAL_OCR_MODEL?.trim() || DEFAULT_MISTRAL_OCR_MODEL;
  const endpoint = env.MISTRAL_OCR_ENDPOINT?.trim() || DEFAULT_MISTRAL_OCR_ENDPOINT;
  return {
    enabled: env.MISTRAL_OCR_ENABLED === 'true',
    apiKey: apiKey || undefined,
    model,
    endpoint: endpoint.replace(/\/+$/, ''),
    timeoutMs: parsePositiveInt(env.MISTRAL_OCR_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    maxBytes: Math.round(maxFileMb * 1024 * 1024),
    legalHighQualityProcessing: env.LEGAL_HIGH_QUALITY_PROCESSING === 'true',
  };
}

export function isMistralOcrConfigured(config = getMistralOcrConfig()) {
  return config.enabled && Boolean(config.apiKey);
}

export function shouldTryMistralOcrForPdf(args: {
  nativeTextLength?: number;
  nativeSucceeded?: boolean;
  parserFailed?: boolean;
  config?: MistralOcrConfig;
}) {
  const config = args.config ?? getMistralOcrConfig();
  if (!isMistralOcrConfigured(config)) return false;
  if (args.parserFailed) return true;
  if ((args.nativeTextLength ?? 0) < 80) return true;
  return Boolean(args.nativeSucceeded && config.legalHighQualityProcessing);
}

export async function extractPdfTextWithMistralOcr(args: {
  buffer: Buffer;
  filename?: string;
  mimeType?: string;
  config?: MistralOcrConfig;
}): Promise<MistralOcrExtractionResult> {
  const config = args.config ?? getMistralOcrConfig();
  if (!config.enabled) {
    return {
      error: 'Mistral OCR 4 is disabled.',
      errorCode: 'WORKER_UNAVAILABLE',
      ocrAttempted: false,
      warnings: ['MISTRAL_OCR_DISABLED'],
    };
  }
  if (!config.apiKey) {
    return {
      error: 'Mistral OCR 4 is not configured.',
      errorCode: 'WORKER_UNAVAILABLE',
      ocrAttempted: false,
      warnings: ['MISTRAL_OCR_API_KEY_MISSING'],
    };
  }
  if (args.buffer.byteLength > config.maxBytes) {
    return {
      error: 'Mistral OCR 4 skipped this file because it exceeds the configured OCR file size limit.',
      errorCode: 'FILE_TOO_LARGE',
      ocrAttempted: false,
      warnings: ['MISTRAL_OCR_FILE_TOO_LARGE'],
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  const mimeType = args.mimeType || 'application/pdf';
  const startedAt = Date.now();

  try {
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        document: {
          type: 'document_url',
          document_url: `data:${mimeType};base64,${args.buffer.toString('base64')}`,
        },
        include_blocks: true,
        table_format: 'html',
        extract_header: true,
        extract_footer: true,
        confidence_scores_granularity: 'page',
      }),
      signal: controller.signal,
    });
    const providerRequestId = getProviderRequestId(response);

    if (!response.ok) {
      return {
        error: `Mistral OCR 4 failed with HTTP ${response.status}.`,
        errorCode: response.status >= 500 ? 'WORKER_UNAVAILABLE' : 'UNKNOWN_EXTRACTION_ERROR',
        method: 'mistral_ocr_4',
        ocrAttempted: true,
        ocrProvider: 'mistral',
        ocrModel: config.model,
        ocrRequestMode: 'base64_stateless',
        ocrProviderRequestId: providerRequestId,
        warnings: ['MISTRAL_OCR_PROVIDER_FAILED'],
      };
    }

    const json = await response.json() as MistralOcrResponse;
    const pages = Array.isArray(json.pages) ? json.pages : [];
    const rawProviderText = normalizeText(
      pages
        .map((page) => normalizeText(page.markdown ?? page.text ?? ''))
        .filter(Boolean)
        .join('\n\n')
    );
    const text = normalizeText(pages.map(buildPageText).filter(Boolean).join('\n\n'));
    const confidence = confidenceNumbers(pages);
    const usagePages = json.usage_info?.pages_processed ?? pages.length;
    const usageBytes = json.usage_info?.doc_size_bytes ?? args.buffer.byteLength;
    const blocksDetected = countPageItems(pages, 'blocks');
    const tablesDetected = countPageItems(pages, 'tables');
    const warnings: string[] = [];
    if (confidence.minimum !== undefined && confidence.minimum < LOW_CONFIDENCE_THRESHOLD) {
      warnings.push('MISTRAL_OCR_LOW_CONFIDENCE_PAGE');
    }
    if (blocksDetected === 0) warnings.push('MISTRAL_OCR_BLOCKS_NOT_RETURNED');

    if (!rawProviderText) {
      return {
        error: 'Mistral OCR 4 completed but did not return readable text.',
        errorCode: 'OCR_EMPTY',
        method: 'mistral_ocr_4',
        ocrAttempted: true,
        pagesOcrProcessed: usagePages,
        pagesTotal: pages.length,
        warnings: ['MISTRAL_OCR_EMPTY', ...warnings],
        ocrProvider: 'mistral',
        ocrModel: json.model ?? config.model,
        ocrRequestMode: 'base64_stateless',
        ocrAverageConfidence: confidence.average,
        ocrMinConfidence: confidence.minimum,
        ocrUsagePages: usagePages,
        ocrUsageBytes: usageBytes,
        estimatedOcrCostUsd: usagePages * MISTRAL_OCR_4_COST_PER_PAGE_USD,
        ocrBlocksDetected: blocksDetected,
        ocrTablesDetected: tablesDetected,
        ocrProviderRequestId: providerRequestId,
      };
    }

    return {
      text,
      method: 'mistral_ocr_4',
      ocrAttempted: true,
      pagesOcrProcessed: usagePages,
      pagesTotal: pages.length,
      warnings,
      ocrProvider: 'mistral',
      ocrModel: json.model ?? config.model,
      ocrRequestMode: 'base64_stateless',
      ocrAverageConfidence: confidence.average,
      ocrMinConfidence: confidence.minimum,
      ocrUsagePages: usagePages,
      ocrUsageBytes: usageBytes,
      estimatedOcrCostUsd: usagePages * MISTRAL_OCR_4_COST_PER_PAGE_USD,
      ocrBlocksDetected: blocksDetected,
      ocrTablesDetected: tablesDetected,
      ocrProviderRequestId: providerRequestId,
    };
  } catch (error) {
    return {
      error: error instanceof DOMException && error.name === 'AbortError'
        ? 'Mistral OCR 4 timed out before processing finished.'
        : 'Mistral OCR 4 could not process this PDF.',
      errorCode: error instanceof DOMException && error.name === 'AbortError'
        ? 'CONVERSION_TIMEOUT'
        : 'WORKER_UNAVAILABLE',
      method: 'mistral_ocr_4',
      ocrAttempted: true,
      ocrProvider: 'mistral',
      ocrModel: config.model,
      ocrRequestMode: 'base64_stateless',
      ocrUsageBytes: args.buffer.byteLength,
      warnings: [
        error instanceof DOMException && error.name === 'AbortError'
          ? 'MISTRAL_OCR_TIMEOUT'
          : 'MISTRAL_OCR_REQUEST_FAILED',
      ],
    };
  } finally {
    clearTimeout(timeout);
    if (Date.now() - startedAt > config.timeoutMs) {
      // The elapsed timing is intentionally not logged here to avoid logging file metadata
      // from shared extraction callers. Convex records provider timing around the attempt.
    }
  }
}
