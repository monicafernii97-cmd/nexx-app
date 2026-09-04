import type { Doc } from '../_generated/dataModel';
import { isUploadE2ERobotEmail } from './chatRateLimitPolicy';

export type DataProvenance = 'production' | 'qa' | 'synthetic';

const SYNTHETIC_UPLOAD_PREFIX = /^nexx-e2e-(e2e-(?:pr|release|daily|weekly|resilience)-[a-z0-9-]{8,72})--/i;

export function qaRunIdFromFilename(filename: string) {
  return SYNTHETIC_UPLOAD_PREFIX.exec(filename.trim())?.[1];
}

export function classifyCreationProvenance(args: {
  email?: string;
  filename?: string;
  registeredQaRunId?: string;
}) {
  const filenameRunId = args.filename ? qaRunIdFromFilename(args.filename) : undefined;
  const robot = isUploadE2ERobotEmail(args.email);
  if (filenameRunId && args.registeredQaRunId === filenameRunId && robot) {
    return { dataProvenance: 'synthetic' as const, qaRunId: filenameRunId };
  }
  if (robot) return { dataProvenance: 'qa' as const };
  return { dataProvenance: 'production' as const };
}

export function isProductionEligibleDocument(
  file: Pick<Doc<'uploadedFiles'>, 'dataProvenance' | 'status' | 'deletedAt'>,
) {
  return (file.dataProvenance === undefined || file.dataProvenance === 'production') &&
    !file.deletedAt && file.status !== 'deleted' && file.status !== 'quarantined';
}

export function isDocumentEligibleForChat(
  file: Pick<Doc<'uploadedFiles'>, 'dataProvenance' | 'status' | 'deletedAt'>,
  allowQa: boolean,
) {
  if (file.deletedAt || file.status === 'deleted' || file.status === 'quarantined') return false;
  return allowQa || file.dataProvenance === undefined || file.dataProvenance === 'production';
}

export function isQaOrSyntheticDocument(
  file: Pick<Doc<'uploadedFiles'>, 'dataProvenance'>,
) {
  return file.dataProvenance === 'qa' || file.dataProvenance === 'synthetic';
}
