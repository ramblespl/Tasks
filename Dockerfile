# Multi-stage production build for Zadania application

# ---------------------------------------------------
# Stage 1: Build the frontend assets
# ---------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies
COPY package*.json ./
RUN npm ci

# Copy application source code and configuration
COPY . .

# Build the production bundle with Vite and PWA assets
RUN npm run build

# ---------------------------------------------------
# Stage 2: Production runtime environment
# ---------------------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy server entrypoint and compiled production distribution
COPY server.js ./
COPY --from=builder /app/dist ./dist

# Security: Use non-root node user provided by the alpine image
USER node

# Expose port (Cloud Run, Docker, Kubernetes)
EXPOSE 3000

# Health check against server.js /health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/health || exit 1

# Start production server
CMD ["node", "server.js"]
