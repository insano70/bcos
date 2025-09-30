# Multi-stage build for BCOS Next.js application
# Build stage
FROM node:24-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm@9 && \
    pnpm install --frozen-lockfile --prod=false

# Copy source code
COPY . .

# Build the application
ARG NODE_ENV=production
ARG BUILD_VERSION=unknown
ENV NODE_ENV=${NODE_ENV}
ENV NEXT_TELEMETRY_DISABLED=1
ENV BUILD_VERSION=${BUILD_VERSION}
ENV SKIP_ENV_VALIDATION=true
# Minimal environment variables for build-time validation
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
ENV ANALYTICS_DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
ENV JWT_SECRET="dummy-jwt-secret-for-build-validation-only-not-used-in-production"
ENV JWT_REFRESH_SECRET="dummy-refresh-secret-for-build-validation-only-not-used"
ENV CSRF_SECRET="dummy-csrf-secret-for-build-validation"
ENV NEXT_PUBLIC_APP_URL="https://app.bendcare.com"

RUN pnpm build

# Production stage
FROM node:24-alpine AS runtime

# Security: Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S bcos -u 1001

# Install security updates and required packages
RUN apk update && \
    apk upgrade && \
    apk add --no-cache \
    dumb-init \
    curl \
    && rm -rf /var/cache/apk/*

WORKDIR /app

# Copy built application from builder stage
COPY --from=builder --chown=bcos:nodejs /app/next.config.js ./
COPY --from=builder --chown=bcos:nodejs /app/public ./public
COPY --from=builder --chown=bcos:nodejs /app/.next/standalone ./
COPY --from=builder --chown=bcos:nodejs /app/.next/static ./.next/static

# Copy runtime dependencies
COPY --from=builder --chown=bcos:nodejs /app/node_modules ./node_modules

# Copy migration files and scripts for database migrations
COPY --from=builder --chown=bcos:nodejs /app/lib/db/migrations ./lib/db/migrations
COPY --from=builder --chown=bcos:nodejs /app/scripts/run-migrations.ts ./scripts/run-migrations.ts
COPY --from=builder --chown=bcos:nodejs /app/drizzle.config.ts ./drizzle.config.ts

# Create writable directories for Next.js
RUN mkdir -p .next/cache && \
    chown -R bcos:nodejs .next/cache && \
    mkdir -p /tmp && \
    chown -R bcos:nodejs /tmp

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Security: Use non-root user
USER bcos

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# Use dumb-init as PID 1 for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "server.js"]

# Labels for metadata
LABEL maintainer="BCOS DevOps Team"
LABEL version=${BUILD_VERSION}
LABEL description="BCOS (BendCare OS) - Rheumatology practice management platform"
LABEL org.opencontainers.image.source="https://github.com/pstewart/bcos"
