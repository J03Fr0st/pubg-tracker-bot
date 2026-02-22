# Build stage
FROM node:20-slim AS builder

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Copy prisma schema before npm ci so postinstall (prisma generate) can find it
COPY prisma ./prisma

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript code
RUN npm run build

# Production stage
FROM node:20-slim

# Create app directory
WORKDIR /usr/src/app

# Create a non-root user
RUN apt-get update && apt-get install -y --no-install-recommends dumb-init && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    groupadd -r nodejs && \
    useradd -r -g nodejs -s /bin/bash -d /home/nodejs nodejs && \
    mkdir -p /home/nodejs && \
    chown -R nodejs:nodejs /home/nodejs

# Set default environment variables
ENV NODE_ENV=production \
    PUBG_API_URL="https://api.pubg.com/shards/" \
    DEFAULT_SHARD="steam"

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production --ignore-scripts

# Copy built files from builder stage
COPY --from=builder /usr/src/app/dist ./dist

# Copy prisma schema and migrations for migrate deploy
COPY --from=builder /usr/src/app/prisma ./prisma

# Copy generated prisma client from builder (output path matches schema.prisma: ../src/generated/prisma)
COPY --from=builder /usr/src/app/src/generated ./src/generated

# Copy prisma CLI from builder for migrate deploy
COPY --from=builder /usr/src/app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /usr/src/app/node_modules/@prisma ./node_modules/@prisma

# Set user
USER nodejs

# Health check - simply check if the process is running
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD ps aux | grep "node" | grep -v grep || exit 1

# Use dumb-init as entrypoint to handle signals properly
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Run migrations then start the bot
CMD npx prisma migrate deploy && node dist/index.js
