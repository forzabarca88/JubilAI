# ──────────────────────────────────────────────────────────────
# Stage 1: Build TypeScript sources
# ──────────────────────────────────────────────────────────────
FROM node:24.16.0-alpine AS builder
WORKDIR /app

# Copy dependency manifests first (layer caching)
COPY package.json package-lock.json ./

# Install ALL dependencies (devDependencies needed for tsc + esbuild)
RUN npm ci

# Copy source required for the build
COPY tsconfig.json tsconfig.server.json tsconfig.client.json ./
COPY shared/ ./shared/
COPY server/ ./server/
COPY client/ ./client/
COPY scripts/ ./scripts/
COPY config.json ./

# Run the full build: tsc (server), esbuild (client bundle + tts worker)
RUN npm run build

# ──────────────────────────────────────────────────────────────
# Stage 2: Production runtime
# ──────────────────────────────────────────────────────────────
FROM node:24.16.0-alpine

LABEL org.opencontainers.image.title="JubilAI"
LABEL org.opencontainers.image.description="Two LLM models debate, a third judges"
LABEL org.opencontainers.image.version="1.0.0"

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

# Copy production-only node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy build output, public assets, config, and package.json
COPY package.json ./
COPY config.json ./
COPY --from=builder /app/dist ./dist
COPY public/ ./public/

# Non-root user (security best practice)
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["node", "dist/server/server/index.js"]
