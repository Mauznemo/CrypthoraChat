# Use Node.js 20 alpine for smaller image size
FROM node:22-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# generate svelte-kit files
RUN npx svelte-kit sync

# Build the application
ENV DATABASE_URL="postgresql://placeholder"
ENV PUBLIC_VAPID_KEY="placeholder"
RUN npx prisma generate
RUN npm run build

# Production stage
FROM node:22-alpine AS runner

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 sveltekit

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder --chown=sveltekit:nodejs /app/build ./build
COPY --from=builder --chown=sveltekit:nodejs /app/package.json ./package.json
COPY --from=builder --chown=sveltekit:nodejs /app/server ./server
COPY --from=builder --chown=sveltekit:nodejs /app/src/lib/server ./src/lib/server
COPY --from=builder --chown=sveltekit:nodejs /app/src/lib/db.ts ./src/lib/db.ts
COPY --from=builder --chown=sveltekit:nodejs /app/src/lib/utils/auth.ts ./src/lib/utils/auth.ts
COPY --from=builder --chown=sveltekit:nodejs /app/src/generated/prisma ./src/generated/prisma
COPY --from=builder --chown=sveltekit:nodejs /app/prisma ./prisma

# Create uploads directory with proper permissions
RUN mkdir -p /uploads && chown -R sveltekit:nodejs /uploads

# Switch to non-root user
USER sveltekit

# Expose port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Add curl for healthcheck
USER root
RUN apk add --no-cache curl
USER sveltekit

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]