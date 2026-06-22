# NEXX Document Worker

Private document extraction worker for legacy Microsoft Word `.doc` files.

The chat app should call this only from server-side orchestration. Browsers and
Vercel route handlers must not send raw document bytes through chat.

## Runtime

- Node 20+
- LibreOffice Writer
- Optional Apache Tika Server through `TIKA_SERVER_URL`
- Optional OCR is reserved for a later worker image

## Environment

- `DOCUMENT_WORKER_TOKEN`: required bearer token for `/v1/extract`
- `PORT`: defaults to `8080`
- `TIKA_SERVER_URL`: optional, for direct Tika fallback
- `WORKER_VERSION`: optional version label emitted in responses

## Endpoints

- `GET /health`
- `POST /v1/extract`

The worker accepts a signed source URL, validates that the file is a real
Microsoft Word binary/OLE2 document, rejects macro/encrypted files, converts it
with LibreOffice to DOCX, extracts text with Mammoth, and falls back to Tika
when configured.
