import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));

vi.mock('@clerk/nextjs/server', () => ({ auth: authMock }));

import { GET } from '../route';

const context = { params: Promise.resolve({ uploadedFileId: 'file_123' }) };

describe('authenticated document source proxy', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    authMock.mockReset();
    process.env.NEXT_PUBLIC_CONVEX_URL = 'https://example.convex.cloud';
  });

  it('rejects unauthenticated source access before querying storage metadata', async () => {
    authMock.mockResolvedValue({ userId: null, getToken: vi.fn() });
    const response = await GET(new Request('https://nexproof.io/api/documents/source/file_123'), context);
    expect(response.status).toBe(401);
  });

  it('does not distinguish missing files from files the caller cannot access', async () => {
    authMock.mockResolvedValue({ userId: 'user_123', getToken: vi.fn(async () => 'jwt-token') });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Source document not found', { status: 404 }));
    const response = await GET(new Request('https://nexproof.io/api/documents/source/file_123'), context);
    expect(response.status).toBe(404);
  });

  it('proxies authorized bytes with private inline headers and never exposes the storage URL', async () => {
    authMock.mockResolvedValue({ userId: 'user_123', getToken: vi.fn(async () => 'jwt-token') });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('PDFDATA', {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': '7',
        'Content-Disposition': 'inline; filename="Signed Final Order.pdf"',
      },
    }));

    const response = await GET(new Request('https://nexproof.io/api/documents/source/file_123'), context);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('private');
    expect(response.headers.get('content-disposition')).toContain('inline');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    const body = await response.text();
    expect(body).toBe('PDFDATA');
    expect(body).not.toContain('storage.example');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.convex.site/document-source?uploadedFileId=file_123',
      expect.objectContaining({ headers: { Authorization: 'Bearer jwt-token' } }),
    );
  });
});
