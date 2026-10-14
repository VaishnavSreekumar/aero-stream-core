# ==========================================
# Stage 1: Dependency Builder
# ==========================================
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install build essentials for native binary bindings if needed
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY backend/package*.json ./
RUN npm ci --omit=dev

# ==========================================
# Stage 2: Production Runtime
# ==========================================
FROM node:20-bookworm-slim AS runner

WORKDIR /app

# Install Python 3 for the AI compliance microservice bridge
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=4000

# Copy node modules from builder
COPY --from=builder /app/node_modules ./node_modules
COPY backend/package.json ./package.json

# Copy backend source, analytics engine, and aws mock
COPY backend/src ./src
COPY analytics /analytics
COPY aws-mock /aws-mock

EXPOSE 4000

HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:4000/api/v1/telemetry/health || exit 1

CMD ["node", "src/server.js"]
