export type DocumentSourceGrant = {
  uploadedFileId: string;
  subjectId: string;
  chatAllowed: boolean;
  revokedAt?: number;
  expiresAt?: number;
};

export function canAccessDocumentSource(args: {
  uploadedFileId: string;
  ownerClerkUserId: string;
  viewerClerkUserId: string;
  grants: DocumentSourceGrant[];
  now: number;
}) {
  if (args.ownerClerkUserId === args.viewerClerkUserId) return true;
  return args.grants.some((grant) =>
    grant.uploadedFileId === args.uploadedFileId &&
    grant.subjectId === args.viewerClerkUserId &&
    grant.chatAllowed &&
    grant.revokedAt === undefined &&
    (grant.expiresAt === undefined || grant.expiresAt > args.now)
  );
}
