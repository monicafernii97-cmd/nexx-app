export function hasCompleteDocumentRetrieval(args: {
  openaiFileId?: string;
  openaiTextFileId?: string;
  activeMemoryGenerationId?: string;
}) {
  return Boolean(
    args.openaiFileId ||
    args.openaiTextFileId ||
    args.activeMemoryGenerationId,
  );
}
