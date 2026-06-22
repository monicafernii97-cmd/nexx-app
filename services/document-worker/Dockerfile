FROM node:22-bookworm-slim

ARG TIKA_VERSION=3.3.1

RUN apt-get update \
  && apt-get install -y --no-install-recommends libreoffice-writer default-jre-headless curl ca-certificates dumb-init \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL \
  "https://downloads.apache.org/tika/${TIKA_VERSION}/tika-server-standard-${TIKA_VERSION}.jar" \
  -o /opt/tika-server-standard.jar \
  && curl -fsSL \
  "https://downloads.apache.org/tika/${TIKA_VERSION}/tika-server-standard-${TIKA_VERSION}.jar.sha512" \
  -o /opt/tika-server-standard.jar.sha512 \
  && cd /opt \
  && echo "$(cat tika-server-standard.jar.sha512)  tika-server-standard.jar" | sha512sum -c - \
  && rm tika-server-standard.jar.sha512

WORKDIR /app

COPY package.json package.json
RUN npm install --omit=dev

COPY src ./src
COPY start.sh start.sh
RUN chmod +x start.sh

ENV NODE_ENV=production
ENV PORT=8080
ENV TIKA_SERVER_URL=http://127.0.0.1:9998

USER node

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD curl -fsS http://127.0.0.1:${PORT}/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["./start.sh"]
