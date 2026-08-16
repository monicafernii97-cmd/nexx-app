import { afterEach, describe, expect, it, vi } from 'vitest';
import { getChatUploadAccept, validateChatUploadFile } from '../uploadConfig';

function fileMetadata(name: string, type: string, size = 1024) {
  return { name, type, size };
}

describe('chat upload config', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps legacy DOC disabled by default', () => {
    expect(getChatUploadAccept()).toContain('.pdf,.docx,.txt,.pptx,.xlsx');
    expect(validateChatUploadFile(fileMetadata('order.doc', 'application/msword'))).toContain('Legacy .doc support');
  });

  it('allows legacy DOC only behind the public rollout flag', () => {
    vi.stubEnv('NEXT_PUBLIC_ENABLE_LEGACY_DOC_EXTRACTION', 'true');

    expect(getChatUploadAccept()).toContain('.pdf,.docx,.doc,.txt,.pptx');
    expect(validateChatUploadFile(fileMetadata('order.doc', 'application/msword'))).toBeNull();
  });

  it('allows capability-gated document, image, spreadsheet, presentation, and email formats', () => {
    expect(validateChatUploadFile(fileMetadata('scan.png', 'image/png'))).toBeNull();
    expect(validateChatUploadFile(fileMetadata('hearing.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'))).toBeNull();
    expect(validateChatUploadFile(fileMetadata('ledger.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))).toBeNull();
    expect(validateChatUploadFile(fileMetadata('messages.eml', 'message/rfc822'))).toBeNull();
    expect(validateChatUploadFile(fileMetadata('records.csv', 'text/csv'))).toBeNull();
  });

  it('allows standard files when browsers report generic MIME', () => {
    expect(validateChatUploadFile(fileMetadata('order.pdf', 'application/octet-stream'))).toBeNull();
    expect(validateChatUploadFile(fileMetadata('order.docx', ''))).toBeNull();
    expect(validateChatUploadFile(fileMetadata('notes.txt', 'application/octet-stream'))).toBeNull();
  });

  it('still rejects explicit MIME and extension mismatches', () => {
    expect(validateChatUploadFile(fileMetadata('renamed.pdf', 'text/plain'))).toContain('Unsupported file type');
  });
});
