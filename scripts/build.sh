#!/bin/sh
# Sync Vercel env vars to the TARGET Convex deployment before building.
#
# When `npx convex deploy --cmd 'sh scripts/build.sh'` runs, Convex sets
# NEXT_PUBLIC_CONVEX_URL to the target deployment (e.g. https://moonlit-elk-797.convex.cloud).
# We use --url to set the env var on THAT specific deployment.

if [ -n "$CLERK_ISSUER_URL" ] && [ -n "$NEXT_PUBLIC_CONVEX_URL" ]; then
    echo "Setting CLERK_ISSUER_URL on $NEXT_PUBLIC_CONVEX_URL..."
    npx convex env set CLERK_ISSUER_URL "$CLERK_ISSUER_URL" --url "$NEXT_PUBLIC_CONVEX_URL" 2>&1 || echo "Warning: failed to set env var (may already exist)"
fi

# Run the actual build
npm run build
