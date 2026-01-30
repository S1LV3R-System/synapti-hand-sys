# ============================================================================
# HandPose Unified Architecture - Multi-Stage Production Dockerfile
# Builds BOTH frontend and backend in a single unified image
# ============================================================================

# ============================================================================
# Stage 1: Build Frontend (React + Vite)
# ============================================================================
FROM node:20-alpine AS frontend-builder

WORKDIR /frontend

# Copy frontend package files
COPY ../frontend/package*.json ./

# Install frontend dependencies
RUN npm ci

# Copy frontend source
COPY ../frontend/ ./

# Build frontend for production
RUN npm run build

# ============================================================================
# Stage 2: Build Backend (TypeScript → JavaScript)
# ============================================================================
FROM node:20-alpine AS backend-builder

WORKDIR /app

# Copy backend package files first (better caching)
COPY backend-node/package*.json ./
COPY backend-node/tsconfig.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Copy Prisma schema and generate client
COPY backend-node/prisma ./prisma
RUN npx prisma generate

# Copy backend source code
COPY backend-node/src ./src

# Build TypeScript to JavaScript
RUN npm run build

# ============================================================================
# Stage 3: Production Runtime (Minimal Image with Frontend + Backend)
# ============================================================================
FROM node:20-alpine

# Install security updates, OpenSSL (for Prisma), and essential tools
RUN apk update && apk upgrade && \
    apk add --no-cache tini curl openssl && \
    rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy package files and install PRODUCTION dependencies only
COPY backend-node/package*.json ./
RUN npm ci --only=production && \
    npm cache clean --force

# Copy Prisma schema and client
COPY --from=backend-builder /app/prisma ./prisma
COPY --from=backend-builder /app/node_modules/.prisma ./node_modules/.prisma

# Copy built JavaScript from backend builder
COPY --from=backend-builder /app/dist ./dist

# Copy built frontend from frontend builder
COPY --from=frontend-builder /frontend/dist ./public

# Change ownership to non-root user
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 5000

# Health check for container orchestration
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:5000/health || exit 1

# Use tini as init process (proper signal handling)
ENTRYPOINT ["/sbin/tini", "--"]

# Start production server
CMD ["node", "dist/index.js"]

# ============================================================================
# Build Instructions:
#
# Build unified image (frontend + backend):
#   docker build -t handpose-unified:latest .
#
# Run in production:
#   docker run -p 5000:5000 -e NODE_ENV=production handpose-unified:latest
#
# With Docker Compose:
#   docker-compose up -d --build
#
# Benefits:
#   - Single image contains both frontend and backend
#   - No need to mount frontend dist separately
#   - True unified deployment
#   - Optimized multi-stage build for minimal image size
# ============================================================================
