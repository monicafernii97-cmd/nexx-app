FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends libreoffice-writer default-jre-headless curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package.json
RUN npm install --omit=dev

COPY src ./src

ENV NODE_ENV=production
ENV PORT=8080

USER node

EXPOSE 8080
CMD ["npm", "start"]
