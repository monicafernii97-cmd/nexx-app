#!/bin/sh
set -eu

if [ "${VERCEL_ENV:-}" = "preview" ]; then
  if [ -z "${VERCEL_GIT_COMMIT_REF:-}" ]; then
    echo "VERCEL_GIT_COMMIT_REF is required for an isolated Convex preview deployment." >&2
    exit 1
  fi

  exec npx convex deploy \
    --preview-create "$VERCEL_GIT_COMMIT_REF" \
    --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL \
    --cmd "npm run build"
fi

exec npx convex deploy \
  --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL \
  --cmd "npm run build"
