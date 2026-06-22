FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends libreoffice-writer default-jre-headless curl ca-certificates dumb-init \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package.json
RUN npm install --omit=dev

COPY src ./src

ENV NODE_ENV=production
ENV PORT=8080

USER node

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD curl -fsS http://127.0.0.1:${PORT}/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "start"]
