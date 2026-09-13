FROM node:22-bookworm-slim AS base

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl openssl \
  && rm -rf /var/lib/apt/lists/*

FROM base AS builder

WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
COPY public ./public
RUN npx prisma generate && npm run build

FROM base AS runtime

ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl --fail http://127.0.0.1:3000/api/health || exit 1

USER node
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
