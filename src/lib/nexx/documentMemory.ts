import { detectDocumentReference } from './documentReferenceDetection';

/** Return true when a later chat turn likely needs a stored uploaded document reloaded. */
export function messageReferencesStoredDocument(message: string): boolean {
  return detectDocumentReference(message).referencesDocument;
}
