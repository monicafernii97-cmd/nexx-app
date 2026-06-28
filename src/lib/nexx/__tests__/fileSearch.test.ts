import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toVectorStoreFileAttributes, uploadToVectorStore } from '../fileSearch';

const { createFileMock, attachFileMock, deleteFileMock, deleteVectorStoreMock, searchVectorStoreMock } = vi.hoisted(() => ({
  createFileMock: vi.fn(),
  attachFileMock: vi.fn(),
  deleteFileMock: vi.fn(),
  deleteVectorStoreMock: vi.fn(),
  searchVectorStoreMock: vi.fn(),
}));

vi.mock('../../openaiConversation', () => ({
  getOpenAIClient: () => ({
    files: {
      create: createFileMock,
      delete: deleteFileMock,
    },
    vectorStores: {
      files: {
        createAndPoll: attachFileMock,
      },
    },
  }),
  openai: {
    vectorStores: {
      del: deleteVectorStoreMock,
      search: searchVectorStoreMock,
    },
  },
}));

describe('fileSearch vector store uploads', () => {
  beforeEach(() => {
    createFileMock.mockReset();
    attachFileMock.mockReset();
    createFileMock.mockResolvedValue({ id: 'file_123' });
    attachFileMock.mockResolvedValue({ id: 'vsf_123', status: 'completed' });
  });

  it('maps upload metadata to vector-store file attributes', async () => {
    await uploadToVectorStore(
      'vs_123',
      new File(['hello'], 'order.pdf', { type: 'application/pdf' }),
      {
        source: 'user_upload',
        conversationId: 'conversation_123',
        originalFilename: 'Signed Final Order 2-25-22.pdf',
      },
    );

    expect(attachFileMock).toHaveBeenCalledWith(
      'vs_123',
      expect.objectContaining({
        file_id: 'file_123',
        attributes: {
          source: 'user_upload',
          conversationId: 'conversation_123',
          originalFilename: 'Signed Final Order 2-25-22.pdf',
        },
        chunking_strategy: expect.any(Object),
      }),
      { timeout: 45_000 },
    );
    expect(attachFileMock.mock.calls[0]?.[1]).not.toHaveProperty('metadata');
  });

  it('drops non-primitive filter values before sending attributes', () => {
    expect(toVectorStoreFileAttributes({
      source: 'user_upload',
      dateRange: { start: '2026-01-01', end: '2026-06-01' },
    })).toEqual({
      source: 'user_upload',
    });
  });
});
