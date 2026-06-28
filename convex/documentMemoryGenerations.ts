import { internalMutation, type MutationCtx } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';

const MAX_BACKFILL_RECORDS = 5000;
const MAX_CLEANUP_RECORDS = 500;

const generationReasonValidator = v.union(
  v.literal('initial_upload'),
  v.literal('manual_reprocess'),
  v.literal('ocr_upgrade'),
  v.literal('chunking_upgrade'),
  v.literal('embedding_upgrade'),
  v.literal('migration'),
);

const extractionPlanValidator = v.object({
  nativeExtraction: v.boolean(),
  mistralOcr: v.boolean(),
  ocrModel: v.optional(v.string()),
  includeBlocks: v.optional(v.boolean()),
  tableFormat: v.optional(v.union(v.literal('html'), v.literal('markdown'))),
  confidenceGranularity: v.optional(v.union(v.literal('page'), v.literal('word'))),
});

const extractorValidator = v.union(
  v.literal('native_pdf'),
  v.literal('native_docx'),
  v.literal('native_txt'),
  v.literal('mistral_ocr_4'),
  v.literal('manual_upload'),
  v.literal('migration'),
);

const extractionAttemptStatusValidator = v.union(
  v.literal('started'),
  v.literal('succeeded'),
  v.literal('empty'),
  v.literal('failed'),
  v.literal('cancelled'),
);

function sourceHashForFile(file: {
  sha256Hash?: string;
  storageSha256?: string;
}) {
  return file.sha256Hash ?? file.storageSha256;
}

function canonicalSourceForLegacyFile(file: {
  ocrAttempted?: boolean;
  extractionMethod?: string;
}) {
  if (file.extractionMethod?.toLowerCase().includes('ocr') || file.ocrAttempted) {
    return 'ocr' as const;
  }
  return 'native' as const;
}

function legacyCitationLabel(filename: string, chunk: {
  chunkIndex: number;
  pageStart?: number;
  pageEnd?: number;
  sectionHeading?: string;
}) {
  const pageLabel = chunk.pageStart !== undefined && chunk.pageEnd !== undefined
    ? chunk.pageStart === chunk.pageEnd
      ? `p. ${chunk.pageStart}`
      : `pp. ${chunk.pageStart}-${chunk.pageEnd}`
    : 'stored text';
  return [
    filename,
    pageLabel,
    chunk.sectionHeading,
    `chunk ${chunk.chunkIndex + 1}`,
  ].filter(Boolean).join(', ');
}

function retrievalMetadataForLegacyText(text: string) {
  return {
    containsTable: /\|.+\||\t/.test(text),
    containsSignature: /\b(signature|signed|judge|notary)\b/i.test(text),
    containsDate: /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(text),
    containsDeadline: /\b(deadline|due|within|no later than|on or before|shall file|shall serve)\b/i.test(text),
    containsMoney: /\$\s?\d|\b(?:dollars|fees|payment|arrears|support)\b/i.test(text),
    containsPartyName: /\b(?:petitioner|respondent|father|mother|parent|plaintiff|defendant)\b/i.test(text),
    containsOrderLanguage: /\b(?:ordered|shall|must|restrained|granted|denied|injunction)\b/i.test(text),
  };
}

function assertPositiveInteger(name: string, value: number) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
}

function assertNonNegativeInteger(name: string, value: number) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
}

function assertOptionalConfidence(name: string, value?: number) {
  if (value === undefined) return;
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be between 0 and 1`);
  }
}

function boundedRecordLimit(name: string, value: number | undefined, fallback: number, max: number) {
  const resolved = value ?? fallback;
  assertPositiveInteger(name, resolved);
  if (resolved > max) {
    throw new Error(`${name} cannot exceed ${max}`);
  }
  return resolved;
}

function hasContiguousIntegerCoverage(values: number[], start: number, count: number) {
  if (values.length !== count) return false;
  const seen = new Set(values);
  if (seen.size !== count) return false;
  for (let offset = 0; offset < count; offset += 1) {
    if (!seen.has(start + offset)) return false;
  }
  return true;
}

function sanitizeAuditString(value: string) {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[<>]/g, '')
    .slice(0, 240)
    .trim();
}

function sanitizeAuditMetadata(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const clean: Record<string, string | number | boolean | null> = {};
  for (const [key, raw] of Object.entries(value).slice(0, 20)) {
    const safeKey = sanitizeAuditString(key).slice(0, 64);
    if (!safeKey) continue;
    if (typeof raw === 'string') {
      clean[safeKey] = sanitizeAuditString(raw);
    } else if (typeof raw === 'number' && Number.isFinite(raw)) {
      clean[safeKey] = raw;
    } else if (typeof raw === 'boolean' || raw === null) {
      clean[safeKey] = raw;
    } else if (raw !== undefined) {
      clean[safeKey] = sanitizeAuditString(String(raw));
    }
  }
  return clean;
}

async function insertAuditEvent(
  ctx: MutationCtx,
  args: {
    eventType:
      | 'generation_created'
      | 'generation_validated'
      | 'generation_activated'
      | 'generation_failed';
    uploadedFileId: Id<'uploadedFiles'>;
    memoryGenerationId: Id<'documentMemoryGenerations'>;
    clerkUserId: string;
    caseId?: Id<'cases'>;
    metadataRedacted?: unknown;
  },
) {
  await ctx.db.insert('auditEvents', {
    clerkUserId: args.clerkUserId,
    eventType: args.eventType,
    uploadedFileId: args.uploadedFileId,
    memoryGenerationId: args.memoryGenerationId,
    caseId: args.caseId,
    metadataRedacted: sanitizeAuditMetadata(args.metadataRedacted),
    createdAt: Date.now(),
  });
}

export const createGeneration = internalMutation({
  args: {
    uploadedFileId: v.id('uploadedFiles'),
    reason: generationReasonValidator,
    sourceFileHash: v.optional(v.string()),
    extractionPlan: extractionPlanValidator,
    pagesExpected: v.optional(v.number()),
    warnings: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const uploadedFile = await ctx.db.get(args.uploadedFileId);
    if (!uploadedFile) throw new Error('Uploaded file not found');
    if (args.pagesExpected !== undefined) {
      assertPositiveInteger('pagesExpected', args.pagesExpected);
    }

    const latest = await ctx.db
      .query('documentMemoryGenerations')
      .withIndex('by_file_generation', (q) => q.eq('uploadedFileId', args.uploadedFileId))
      .order('desc')
      .first();
    const generationNumber = (latest?.generationNumber ?? 0) + 1;
    const now = Date.now();
    const memoryGenerationId = await ctx.db.insert('documentMemoryGenerations', {
      orgId: uploadedFile.orgId,
      accountId: uploadedFile.accountId,
      matterId: uploadedFile.matterId,
      clerkUserId: uploadedFile.clerkUserId,
      conversationId: uploadedFile.conversationId,
      caseId: uploadedFile.caseId,
      uploadedFileId: args.uploadedFileId,
      generationNumber,
      status: 'building',
      sourceFileHash: args.sourceFileHash ?? sourceHashForFile(uploadedFile),
      reason: args.reason,
      extractionPlan: args.extractionPlan,
      counts: {
        pagesExpected: args.pagesExpected,
      },
      qualitySummary: {
        warnings: args.warnings ?? [],
      },
      validation: {
        passed: false,
        checks: [],
        failedChecks: [],
      },
      createdAt: now,
    });

    await ctx.db.patch(args.uploadedFileId, {
      latestGenerationNumber: generationNumber,
      updatedAt: now,
    });
    await insertAuditEvent(ctx, {
      eventType: 'generation_created',
      uploadedFileId: args.uploadedFileId,
      memoryGenerationId,
      clerkUserId: uploadedFile.clerkUserId,
      caseId: uploadedFile.caseId,
      metadataRedacted: { generationNumber, reason: args.reason },
    });

    return { memoryGenerationId, generationNumber };
  },
});

export const recordExtractionAttempt = internalMutation({
  args: {
    uploadedFileId: v.id('uploadedFiles'),
    memoryGenerationId: v.id('documentMemoryGenerations'),
    extractor: extractorValidator,
    extractorVersion: v.optional(v.string()),
    provider: v.optional(v.union(v.literal('internal'), v.literal('mistral'))),
    modelId: v.optional(v.string()),
    modelVersion: v.optional(v.string()),
    status: extractionAttemptStatusValidator,
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    pageCountAttempted: v.number(),
    pageCountSucceeded: v.number(),
    averageConfidence: v.optional(v.number()),
    minConfidence: v.optional(v.number()),
    warnings: v.optional(v.array(v.string())),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    providerRequestId: v.optional(v.string()),
    usagePages: v.optional(v.number()),
    usageBytes: v.optional(v.number()),
    estimatedCostUsd: v.optional(v.number()),
    requestConfigRedacted: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const uploadedFile = await ctx.db.get(args.uploadedFileId);
    if (!uploadedFile) throw new Error('Uploaded file not found');
    const generation = await ctx.db.get(args.memoryGenerationId);
    if (!generation || generation.uploadedFileId !== args.uploadedFileId) {
      throw new Error('Document memory generation not found for uploaded file');
    }

    assertNonNegativeInteger('pageCountAttempted', args.pageCountAttempted);
    assertNonNegativeInteger('pageCountSucceeded', args.pageCountSucceeded);
    if (args.pageCountSucceeded > args.pageCountAttempted) {
      throw new Error('pageCountSucceeded cannot exceed pageCountAttempted');
    }
    if (args.usagePages !== undefined) assertNonNegativeInteger('usagePages', args.usagePages);
    if (args.usageBytes !== undefined) assertNonNegativeInteger('usageBytes', args.usageBytes);
    if (args.estimatedCostUsd !== undefined && (!Number.isFinite(args.estimatedCostUsd) || args.estimatedCostUsd < 0)) {
      throw new Error('estimatedCostUsd must be non-negative');
    }
    assertOptionalConfidence('averageConfidence', args.averageConfidence);
    assertOptionalConfidence('minConfidence', args.minConfidence);

    return await ctx.db.insert('documentExtractionAttempts', {
      orgId: uploadedFile.orgId,
      accountId: uploadedFile.accountId,
      matterId: uploadedFile.matterId,
      clerkUserId: uploadedFile.clerkUserId,
      caseId: uploadedFile.caseId,
      uploadedFileId: args.uploadedFileId,
      memoryGenerationId: args.memoryGenerationId,
      extractor: args.extractor,
      extractorVersion: args.extractorVersion,
      provider: args.provider,
      modelId: args.modelId,
      modelVersion: args.modelVersion,
      status: args.status,
      startedAt: args.startedAt,
      finishedAt: args.finishedAt,
      pageCountAttempted: args.pageCountAttempted,
      pageCountSucceeded: args.pageCountSucceeded,
      averageConfidence: args.averageConfidence,
      minConfidence: args.minConfidence,
      warnings: args.warnings ?? [],
      errorCode: args.errorCode,
      errorMessage: args.errorMessage,
      providerRequestId: args.providerRequestId,
      usagePages: args.usagePages,
      usageBytes: args.usageBytes,
      estimatedCostUsd: args.estimatedCostUsd,
      requestConfigRedacted: args.requestConfigRedacted,
      createdAt: Date.now(),
    });
  },
});

export const failGeneration = internalMutation({
  args: {
    uploadedFileId: v.id('uploadedFiles'),
    memoryGenerationId: v.id('documentMemoryGenerations'),
    failedReason: v.string(),
    failedChecks: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const uploadedFile = await ctx.db.get(args.uploadedFileId);
    if (!uploadedFile) throw new Error('Uploaded file not found');
    const generation = await ctx.db.get(args.memoryGenerationId);
    if (!generation || generation.uploadedFileId !== args.uploadedFileId) {
      throw new Error('Document memory generation not found for uploaded file');
    }
    if (uploadedFile.activeMemoryGenerationId === args.memoryGenerationId || generation.status === 'active') {
      throw new Error('Cannot mark the active document memory generation as failed');
    }
    if (generation.status !== 'building' && generation.status !== 'validating') {
      return false;
    }

    const now = Date.now();
    const mergedFailedChecks = Array.from(new Set([
      ...generation.validation.failedChecks,
      ...(args.failedChecks ?? []),
    ]));
    await ctx.db.patch(args.memoryGenerationId, {
      status: 'failed',
      validation: {
        passed: false,
        checks: generation.validation.checks,
        failedChecks: mergedFailedChecks,
      },
      failedAt: now,
      failedReason: args.failedReason,
    });
    await insertAuditEvent(ctx, {
      eventType: 'generation_failed',
      uploadedFileId: args.uploadedFileId,
      memoryGenerationId: args.memoryGenerationId,
      clerkUserId: uploadedFile.clerkUserId,
      caseId: uploadedFile.caseId,
      metadataRedacted: {
        failedReason: args.failedReason,
        failedChecks: mergedFailedChecks,
      },
    });
    return true;
  },
});

export const validateAndActivateGeneration = internalMutation({
  args: {
    uploadedFileId: v.id('uploadedFiles'),
    memoryGenerationId: v.id('documentMemoryGenerations'),
    pageCount: v.number(),
    chunkCount: v.number(),
    chunkingVersion: v.string(),
    warnings: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const uploadedFile = await ctx.db.get(args.uploadedFileId);
    if (!uploadedFile) throw new Error('Uploaded file not found');
    const generation = await ctx.db.get(args.memoryGenerationId);
    if (!generation || generation.uploadedFileId !== args.uploadedFileId) {
      throw new Error('Document memory generation not found for uploaded file');
    }
    if (generation.status !== 'building' && generation.status !== 'validating') {
      throw new Error(`Document memory generation is not activatable from ${generation.status}`);
    }
    assertPositiveInteger('pageCount', args.pageCount);
    assertPositiveInteger('chunkCount', args.chunkCount);

    const checks: string[] = [];
    const failedChecks: string[] = [];
    const activeSourceHash = sourceHashForFile(uploadedFile);
    if (generation.sourceFileHash && activeSourceHash && generation.sourceFileHash !== activeSourceHash) {
      failedChecks.push('source_hash_match');
    } else {
      checks.push('source_hash_match');
    }

    const generationPages = await ctx.db
      .query('documentPages')
      .withIndex('by_generation_page', (q) => q.eq('memoryGenerationId', args.memoryGenerationId))
      .collect();
    const allPagesMatch = generationPages.every((page) =>
      page.uploadedFileId === args.uploadedFileId &&
      page.clerkUserId === uploadedFile.clerkUserId
    );
    const hasPageIndexCoverage = hasContiguousIntegerCoverage(
      generationPages.map((page) => page.pageNumber),
      1,
      args.pageCount,
    );
    if (generationPages.length === args.pageCount && allPagesMatch && hasPageIndexCoverage) {
      checks.push('page_coverage');
    } else {
      failedChecks.push('page_coverage');
    }

    const generationChunks = await ctx.db
      .query('documentChunks')
      .withIndex('by_generation_chunk', (q) => q.eq('memoryGenerationId', args.memoryGenerationId))
      .collect();
    const allChunksMatch = generationChunks.every((chunk) =>
      chunk.uploadedFileId === args.uploadedFileId &&
      chunk.clerkUserId === uploadedFile.clerkUserId
    );
    const hasChunkIndexCoverage = hasContiguousIntegerCoverage(
      generationChunks.map((chunk) => chunk.chunkIndex),
      0,
      args.chunkCount,
    );
    if (generationChunks.length === args.chunkCount && allChunksMatch && hasChunkIndexCoverage) {
      checks.push('chunk_integrity');
    } else {
      failedChecks.push('chunk_integrity');
    }

    if (allPagesMatch && allChunksMatch) {
      checks.push('tenant_integrity');
    } else {
      failedChecks.push('tenant_integrity');
    }

    const now = Date.now();
    if (failedChecks.length > 0) {
      await ctx.db.patch(args.memoryGenerationId, {
        status: 'failed',
        counts: {
          ...generation.counts,
          pagesStored: args.pageCount,
          chunksStored: args.chunkCount,
        },
        qualitySummary: {
          ...generation.qualitySummary,
          warnings: args.warnings ?? generation.qualitySummary.warnings,
        },
        validation: {
          passed: false,
          checks,
          failedChecks,
        },
        failedAt: now,
        failedReason: `Generation validation failed: ${failedChecks.join(', ')}`,
      });
      await insertAuditEvent(ctx, {
        eventType: 'generation_failed',
        uploadedFileId: args.uploadedFileId,
        memoryGenerationId: args.memoryGenerationId,
        clerkUserId: uploadedFile.clerkUserId,
        caseId: uploadedFile.caseId,
        metadataRedacted: { failedChecks },
      });
      return { activated: false, failedChecks };
    }

    await ctx.db.patch(args.memoryGenerationId, {
      status: 'validating',
      counts: {
        ...generation.counts,
        pagesStored: args.pageCount,
        chunksStored: args.chunkCount,
      },
      qualitySummary: {
        ...generation.qualitySummary,
        warnings: args.warnings ?? generation.qualitySummary.warnings,
      },
      validation: {
        passed: true,
        checks,
        failedChecks: [],
      },
    });
    await insertAuditEvent(ctx, {
      eventType: 'generation_validated',
      uploadedFileId: args.uploadedFileId,
      memoryGenerationId: args.memoryGenerationId,
      clerkUserId: uploadedFile.clerkUserId,
      caseId: uploadedFile.caseId,
      metadataRedacted: { checks },
    });

    const oldGenerationId = uploadedFile.activeMemoryGenerationId;
    if (uploadedFile.latestGenerationNumber !== undefined && uploadedFile.latestGenerationNumber !== generation.generationNumber) {
      await ctx.db.patch(args.memoryGenerationId, {
        status: 'failed',
        validation: {
          passed: false,
          checks,
          failedChecks: ['stale_generation'],
        },
        failedAt: now,
        failedReason: 'Generation activation was stale because a newer generation exists.',
      });
      await insertAuditEvent(ctx, {
        eventType: 'generation_failed',
        uploadedFileId: args.uploadedFileId,
        memoryGenerationId: args.memoryGenerationId,
        clerkUserId: uploadedFile.clerkUserId,
        caseId: uploadedFile.caseId,
        metadataRedacted: { failedChecks: 'stale_generation' },
      });
      return { activated: false, failedChecks: ['stale_generation'] };
    }
    await ctx.db.patch(args.memoryGenerationId, {
      status: 'active',
      activatedAt: now,
    });
    await ctx.db.patch(args.uploadedFileId, {
      activeMemoryGenerationId: args.memoryGenerationId,
      latestGenerationNumber: generation.generationNumber,
      pageCount: args.pageCount,
      chunkCount: args.chunkCount,
      chunkingVersion: args.chunkingVersion,
      memoryIndexedAt: now,
      updatedAt: now,
    });
    if (oldGenerationId && oldGenerationId !== args.memoryGenerationId) {
      await ctx.db.patch(oldGenerationId, {
        status: 'retired',
        retiredAt: now,
      });
    }
    await insertAuditEvent(ctx, {
      eventType: 'generation_activated',
      uploadedFileId: args.uploadedFileId,
      memoryGenerationId: args.memoryGenerationId,
      clerkUserId: uploadedFile.clerkUserId,
      caseId: uploadedFile.caseId,
      metadataRedacted: {
        generationNumber: generation.generationNumber,
        retiredGenerationId: oldGenerationId ? String(oldGenerationId) : undefined,
      },
    });

    return { activated: true, failedChecks: [] };
  },
});

export const backfillLegacyGeneration = internalMutation({
  args: {
    uploadedFileId: v.id('uploadedFiles'),
    chunkingVersion: v.optional(v.string()),
    maxRecords: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const uploadedFile = await ctx.db.get(args.uploadedFileId);
    if (!uploadedFile) throw new Error('Uploaded file not found');
    const existingActive = await ctx.db
      .query('documentMemoryGenerations')
      .withIndex('by_file_status', (q) =>
        q.eq('uploadedFileId', args.uploadedFileId).eq('status', 'active')
      )
      .first();
    if (uploadedFile.activeMemoryGenerationId) {
      return {
        status: 'already_active' as const,
        memoryGenerationId: uploadedFile.activeMemoryGenerationId,
      };
    }
    if (existingActive) {
      await ctx.db.patch(args.uploadedFileId, {
        activeMemoryGenerationId: existingActive._id,
        latestGenerationNumber: existingActive.generationNumber,
        updatedAt: Date.now(),
      });
      return {
        status: 'already_active' as const,
        memoryGenerationId: existingActive._id,
      };
    }

    const maxRecords = boundedRecordLimit('maxRecords', args.maxRecords, MAX_BACKFILL_RECORDS, MAX_BACKFILL_RECORDS);
    const pages = await ctx.db
      .query('documentPages')
      .withIndex('by_uploaded_file_page', (q) => q.eq('uploadedFileId', args.uploadedFileId))
      .take(maxRecords + 1);
    if (pages.length > maxRecords) {
      throw new Error(`Legacy document memory backfill exceeds ${maxRecords} records`);
    }
    const remainingRecords = maxRecords - pages.length;
    const chunks = await ctx.db
      .query('documentChunks')
      .withIndex('by_uploaded_file_chunk', (q) => q.eq('uploadedFileId', args.uploadedFileId))
      .take(remainingRecords + 1);

    if (pages.length === 0 || chunks.length === 0) {
      throw new Error('Legacy document memory does not have pages and chunks to backfill');
    }
    if (pages.length + chunks.length > maxRecords) {
      throw new Error(`Legacy document memory backfill exceeds ${maxRecords} records`);
    }

    const latest = await ctx.db
      .query('documentMemoryGenerations')
      .withIndex('by_file_generation', (q) => q.eq('uploadedFileId', args.uploadedFileId))
      .order('desc')
      .first();
    const generationNumber = (latest?.generationNumber ?? 0) + 1;
    const now = Date.now();
    const memoryGenerationId = await ctx.db.insert('documentMemoryGenerations', {
      orgId: uploadedFile.orgId,
      accountId: uploadedFile.accountId,
      matterId: uploadedFile.matterId,
      clerkUserId: uploadedFile.clerkUserId,
      conversationId: uploadedFile.conversationId,
      caseId: uploadedFile.caseId,
      uploadedFileId: args.uploadedFileId,
      generationNumber,
      status: 'building',
      sourceFileHash: sourceHashForFile(uploadedFile),
      reason: 'migration',
      extractionPlan: {
        nativeExtraction: true,
        mistralOcr: false,
        includeBlocks: false,
      },
      counts: {
        pagesExpected: pages.length,
        pagesStored: pages.length,
        chunksStored: chunks.length,
      },
      qualitySummary: {
        warnings: uploadedFile.extractionWarnings ?? [],
      },
      validation: {
        passed: false,
        checks: [],
        failedChecks: [],
      },
      createdAt: now,
    });

    const canonicalSource = canonicalSourceForLegacyFile(uploadedFile);
    for (const page of pages) {
      await ctx.db.patch(page._id, {
        memoryGenerationId,
        orgId: uploadedFile.orgId,
        accountId: uploadedFile.accountId,
        matterId: uploadedFile.matterId,
        sourcePageIndex: page.pageNumber - 1,
        nativeText: canonicalSource === 'native' ? page.text : page.nativeText,
        ocrMarkdown: canonicalSource === 'ocr' ? page.text : page.ocrMarkdown,
        canonicalText: page.canonicalText ?? page.text,
        canonicalSource: page.canonicalSource ?? canonicalSource,
      });
    }
    for (const chunk of chunks) {
      await ctx.db.patch(chunk._id, {
        memoryGenerationId,
        orgId: uploadedFile.orgId,
        accountId: uploadedFile.accountId,
        matterId: uploadedFile.matterId,
        chunkText: chunk.chunkText ?? chunk.text,
        normalizedText: chunk.normalizedText ?? chunk.text.replace(/\s+/g, ' ').trim(),
        searchText: chunk.searchText ?? [
          chunk.sectionHeading,
          chunk.text,
        ].filter(Boolean).join('\n\n'),
        citationLabel: chunk.citationLabel ?? legacyCitationLabel(uploadedFile.filename, chunk),
        retrievalMetadata: chunk.retrievalMetadata ?? retrievalMetadataForLegacyText(chunk.text),
      });
    }

    const checks = [
      'legacy_backfill',
      'page_coverage',
      'chunk_integrity',
      'tenant_integrity',
    ];
    await ctx.db.patch(memoryGenerationId, {
      status: 'active',
      validation: {
        passed: true,
        checks,
        failedChecks: [],
      },
      activatedAt: now,
    });
    await ctx.db.patch(args.uploadedFileId, {
      activeMemoryGenerationId: memoryGenerationId,
      latestGenerationNumber: generationNumber,
      pageCount: pages.length,
      chunkCount: chunks.length,
      chunkingVersion: args.chunkingVersion ?? uploadedFile.chunkingVersion ?? 'legacy-backfill-v1',
      memoryIndexedAt: now,
      updatedAt: now,
    });
    await insertAuditEvent(ctx, {
      eventType: 'generation_activated',
      uploadedFileId: args.uploadedFileId,
      memoryGenerationId,
      clerkUserId: uploadedFile.clerkUserId,
      caseId: uploadedFile.caseId,
      metadataRedacted: {
        generationNumber,
        reason: 'migration',
        pagesStored: pages.length,
        chunksStored: chunks.length,
      },
    });

    return {
      status: 'backfilled' as const,
      memoryGenerationId,
      pagesStored: pages.length,
      chunksStored: chunks.length,
    };
  },
});

export const cleanupRetiredGeneration = internalMutation({
  args: {
    uploadedFileId: v.id('uploadedFiles'),
    memoryGenerationId: v.id('documentMemoryGenerations'),
    maxRecords: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const uploadedFile = await ctx.db.get(args.uploadedFileId);
    if (!uploadedFile) throw new Error('Uploaded file not found');
    if (uploadedFile.activeMemoryGenerationId === args.memoryGenerationId) {
      throw new Error('Cannot clean up the active document memory generation');
    }
    const generation = await ctx.db.get(args.memoryGenerationId);
    if (!generation || generation.uploadedFileId !== args.uploadedFileId) {
      throw new Error('Document memory generation not found for uploaded file');
    }
    if (generation.status !== 'retired' && generation.status !== 'failed' && generation.status !== 'cancelled') {
      throw new Error(`Cannot clean up generation with status ${generation.status}`);
    }

    const maxRecords = boundedRecordLimit('maxRecords', args.maxRecords, 100, MAX_CLEANUP_RECORDS);
    const pages = await ctx.db
      .query('documentPages')
      .withIndex('by_generation_page', (q) => q.eq('memoryGenerationId', args.memoryGenerationId))
      .take(maxRecords);
    for (const page of pages) await ctx.db.delete(page._id);

    const remaining = Math.max(0, maxRecords - pages.length);
    const chunks = remaining > 0
      ? await ctx.db
        .query('documentChunks')
        .withIndex('by_generation_chunk', (q) => q.eq('memoryGenerationId', args.memoryGenerationId))
        .take(remaining)
      : [];
    for (const chunk of chunks) await ctx.db.delete(chunk._id);

    return {
      deletedPages: pages.length,
      deletedChunks: chunks.length,
      hasMore: pages.length + chunks.length >= maxRecords,
    };
  },
});
