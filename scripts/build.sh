#!/bin/sh
# Sync Vercel env vars to Convex before deploying
# This ensures preview deployments get required auth config

if [ -n "$CLERK_ISSUER_URL" ]; then
    echo "Setting CLERK_ISSUER_URL on Convex deployment..."
    npx convex env set CLERK_ISSUER_URL "$CLERK_ISSUER_URL" 2>/dev/null || true
fi

# Run the actual build
npm run build
