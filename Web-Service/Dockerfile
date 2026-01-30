# ============================================================================
# HandPose Platform - Single Container Deployment
# Frontend (React) + Backend (Node.js) + Database (SQLite)
# ============================================================================

# Stage 1: Build Frontend
FROM node:18-alpine AS frontend-builder

WORKDIR /build/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# Stage 2: Build Backend
FROM node:18-alpine AS backend-builder

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl openssl-dev

WORKDIR /build/backend

COPY backend-node/package*.json ./
COPY backend-node/prisma ./prisma/

RUN npm ci
COPY backend-node/ ./
RUN npx prisma generate && npm run build

# Stage 3: Production Runtime
FROM node:18-alpine

# Install runtime dependencies including OpenSSL for Prisma
RUN apk add --no-cache curl tini sqlite openssl openssl-dev

WORKDIR /app

# Copy backend
COPY --from=backend-builder /build/backend/package*.json ./
COPY --from=backend-builder /build/backend/node_modules ./node_modules
COPY --from=backend-builder /build/backend/dist ./dist
COPY --from=backend-builder /build/backend/prisma ./prisma

# Copy frontend build
COPY --from=frontend-builder /build/frontend/dist ./public

# Copy entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Create necessary directories
RUN mkdir -p /app/data /app/uploads && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app /usr/local/bin/docker-entrypoint.sh

USER nodejs

EXPOSE 5000

ENV NODE_ENV=production \
    PORT=5000 \
    HOST=0.0.0.0 \
    DATABASE_URL=file:/app/data/handpose.db

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:5000/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
