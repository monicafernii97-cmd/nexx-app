#!/usr/bin/env node

const url = process.env.DOCUMENT_WORKER_URL ?? process.argv[2];

if (!url) {
  console.error('Usage: DOCUMENT_WORKER_URL=https://worker.example.com node scripts/check-document-worker.mjs');
  process.exit(2);
}

const healthUrl = new URL('/health', url.replace(/\/+$/, '/'));
const response = await fetch(healthUrl, {
  signal: AbortSignal.timeout(10_000),
});

const body = await response.text();
if (!response.ok) {
  console.error(`Document worker health check failed with status ${response.status}: ${body}`);
  process.exit(1);
}

console.log(body);
