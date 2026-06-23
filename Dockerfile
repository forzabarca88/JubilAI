# ──────────────────────────────────────────────────────────────
# Stage 1: Install production dependencies
# ──────────────────────────────────────────────────────────────
FROM node:24-alpine AS builder

WORKDIR /app

# Copy dependency manifests first (leveraged across builds)
COPY package.json package-lock.json ./

# Install production-only dependencies (no devDependencies)
RUN npm ci --omit=dev

# ──────────────────────────────────────────────────────────────
# Stage 2: Runtime image
# ──────────────────────────────────────────────────────────────
FROM node:24-alpine

# Metadata
LABEL org.opencontainers.image.title="LLM Debate Arena"
LABEL org.opencontainers.image.description="Two LLM models debate, a third judges"
LABEL org.opencontainers.image.version="1.0.0"

# Runtime environment
ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

# Copy production node_modules from builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy application source
COPY package.json ./
COPY server.js ./
COPY src/ ./src/
COPY public/ ./public/

# Run as non-root user (security best practice)
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3000

# Health check — verifies the Express server responds
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["node", "server.js"]
