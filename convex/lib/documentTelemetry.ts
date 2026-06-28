const DEFAULT_MAX_METADATA_KEYS = 24;
const DEFAULT_MAX_STRING_LENGTH = 240;
const MISTRAL_OCR_4_COST_PER_PAGE_USD = 4 / 1000;
const MISTRAL_OCR_4_ANNOTATED_COST_PER_PAGE_USD = 5 / 1000;
const LOW_CONFIDENCE_THRESHOLD = 0.85;

export type TelemetryScalar = string | number | boolean | null;

export type SanitizedAuditMetadata = Record<string, TelemetryScalar>;

export type ProviderUsageLike = {
  provider: string;
  endpoint: string;
  status: 'started' | 'succeeded' | 'failed' | string;
  inputTokens?: number;
  outputTokens?: number;
  pagesProcessed?: number;
  bytesProcessed?: number;
  estimatedCostUsd?: number;
};

const SENSITIVE_KEY_PATTERN =
  /(api.?key|authorization|bearer|token|secret|password|signed.?url|download.?url|upload.?url|storage.?key|document.?url|file.?url|base64|raw.?bytes|provider.?response|response.?body)/i;

const DOCUMENT_CONTENT_KEY_PATTERN =
  /(raw.?text|document.?text|extracted.?text|full.?text|chat.?context.?text|canonical.?text|native.?text|ocr.?markdown|chunk.?text|search.?text|source.?text|quoted.?text|prompt|body|content|html|markdown)/i;

const SENSITIVE_VALUE_PATTERN =
  /(data:application\/pdf;base64|bearer\s+[a-z0-9._-]+|gho_[a-z0-9_]+|sk-[a-z0-9_-]+|api[_-]?key|x-amz-signature|signature=|token=|signed[_-]?url|storage\.googleapis\.com|blob\.vercel-storage\.com|ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions|it\s+is\s+ordered|court\s+order\s+(?:says|states)|respondent\s+shall|petitioner\s+shall)/i;

export function sanitizeTelemetryString(value: string, maxLength = DEFAULT_MAX_STRING_LENGTH) {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, maxLength)
    .trim();
}

export function isSensitiveTelemetryKey(key: string) {
  return SENSITIVE_KEY_PATTERN.test(key) || DOCUMENT_CONTENT_KEY_PATTERN.test(key);
}

export function isSensitiveTelemetryValue(value: string) {
  return SENSITIVE_VALUE_PATTERN.test(value);
}

function sanitizeMetadataValue(raw: unknown): TelemetryScalar {
  if (typeof raw === 'string') return sanitizeTelemetryString(raw);
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'boolean' || raw === null) return raw;
  if (Array.isArray(raw)) {
    return sanitizeTelemetryString(
      raw
        .slice(0, 12)
        .map((value) => {
          if (typeof value === 'string') return value;
          if (typeof value === 'number' || typeof value === 'boolean' || value === null) return String(value);
          return '[object]';
        })
        .join(', ')
    );
  }
  if (raw === undefined) return null;
  return sanitizeTelemetryString('[object]');
}

export function sanitizeAuditMetadata(
  value: unknown,
  options: {
    maxKeys?: number;
    redactMarker?: string;
  } = {}
): SanitizedAuditMetadata | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;

  const maxKeys = options.maxKeys ?? DEFAULT_MAX_METADATA_KEYS;
  const redactMarker = options.redactMarker ?? '[redacted]';
  const clean: SanitizedAuditMetadata = {};
  const redactedKeys: string[] = [];

  for (const [key, raw] of Object.entries(value).slice(0, maxKeys)) {
    const safeKey = sanitizeTelemetryString(key, 64);
    if (!safeKey) continue;

    const containsSensitiveValue =
      typeof raw === 'string'
        ? isSensitiveTelemetryValue(raw)
        : Array.isArray(raw) && raw.some((value) => typeof value === 'string' && isSensitiveTelemetryValue(value));

    if (isSensitiveTelemetryKey(safeKey) || containsSensitiveValue) {
      clean[safeKey] = redactMarker;
      redactedKeys.push(safeKey);
      continue;
    }

    clean[safeKey] = sanitizeMetadataValue(raw);
  }

  if (redactedKeys.length > 0) {
    clean._redactedKeys = redactedKeys.join(',');
  }

  return Object.keys(clean).length > 0 ? clean : undefined;
}

export function estimateMistralOcrCostUsd(args: {
  pagesProcessed: number;
  annotatedPages?: boolean;
}) {
  if (!Number.isFinite(args.pagesProcessed) || args.pagesProcessed <= 0) return 0;
  const rate = args.annotatedPages
    ? MISTRAL_OCR_4_ANNOTATED_COST_PER_PAGE_USD
    : MISTRAL_OCR_4_COST_PER_PAGE_USD;
  return Number((args.pagesProcessed * rate).toFixed(6));
}

export function requiresZdrForClassification(classification?: string) {
  return classification === 'sensitive' ||
    classification === 'sealed' ||
    classification === 'privileged' ||
    classification === 'attorney_client' ||
    classification === 'restricted';
}

export function shouldFlagLowConfidenceOcr(args: {
  extractor?: string;
  minConfidence?: number;
  warnings?: string[];
}) {
  const usedOcr = args.extractor === 'mistral_ocr_4' ||
    (args.warnings ?? []).some((warning) => /ocr/i.test(warning));
  if (!usedOcr) return false;
  if (args.minConfidence !== undefined && args.minConfidence < LOW_CONFIDENCE_THRESHOLD) return true;
  return (args.warnings ?? []).some((warning) => /LOW_CONFIDENCE/i.test(warning));
}

export function severityForConfidence(minConfidence?: number) {
  if (minConfidence === undefined) return 'medium' as const;
  if (minConfidence < 0.7) return 'high' as const;
  if (minConfidence < LOW_CONFIDENCE_THRESHOLD) return 'medium' as const;
  return 'low' as const;
}

export function normalizeReviewFlagMessage(message: string) {
  return sanitizeTelemetryString(message, 320) || 'Document review flag requires attention.';
}

export function summarizeProviderUsageEvents(events: ProviderUsageLike[]) {
  const totals = {
    events: 0,
    succeeded: 0,
    failed: 0,
    started: 0,
    pagesProcessed: 0,
    bytesProcessed: 0,
    inputTokens: 0,
    outputTokens: 0,
    estimatedCostUsd: 0,
  };
  const byProvider: Record<string, typeof totals> = Object.create(null);
  const byEndpoint: Record<string, typeof totals> = Object.create(null);

  const emptyBucket = () => ({
    events: 0,
    succeeded: 0,
    failed: 0,
    started: 0,
    pagesProcessed: 0,
    bytesProcessed: 0,
    inputTokens: 0,
    outputTokens: 0,
    estimatedCostUsd: 0,
  });

  for (const event of events) {
    const providerKey = event.provider || 'unknown';
    const endpointKey = event.endpoint || 'unknown';
    byProvider[providerKey] ??= emptyBucket();
    byEndpoint[endpointKey] ??= emptyBucket();

    for (const bucket of [totals, byProvider[providerKey], byEndpoint[endpointKey]]) {
      bucket.events += 1;
      if (event.status === 'succeeded') bucket.succeeded += 1;
      else if (event.status === 'failed') bucket.failed += 1;
      else if (event.status === 'started') bucket.started += 1;
      bucket.pagesProcessed += Math.max(0, event.pagesProcessed ?? 0);
      bucket.bytesProcessed += Math.max(0, event.bytesProcessed ?? 0);
      bucket.inputTokens += Math.max(0, event.inputTokens ?? 0);
      bucket.outputTokens += Math.max(0, event.outputTokens ?? 0);
      bucket.estimatedCostUsd += Math.max(0, event.estimatedCostUsd ?? 0);
    }
  }

  const roundCost = (bucket: typeof totals) => ({
    ...bucket,
    estimatedCostUsd: Number(bucket.estimatedCostUsd.toFixed(6)),
  });

  return {
    totals: roundCost(totals),
    byProvider: Object.fromEntries(Object.entries(byProvider).map(([key, bucket]) => [key, roundCost(bucket)])),
    byEndpoint: Object.fromEntries(Object.entries(byEndpoint).map(([key, bucket]) => [key, roundCost(bucket)])),
  };
}
