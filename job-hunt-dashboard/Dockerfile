# ── Stage 1: builder ────────────────────────────────────────────────
FROM oven/bun:1.3 AS builder
WORKDIR /app

# Install main app deps (layer cached until package files change)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Install scraper Node.js deps (separate cache layer)
COPY scraper/package.json scraper/package-lock.json ./scraper/
RUN cd scraper && bun install --production

# Build frontend
COPY . .
ENV NODE_ENV=production
RUN bun run build

# ── Stage 2: production ─────────────────────────────────────────────
FROM oven/bun:1.3
WORKDIR /app

# Copy production artifacts from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src
COPY --from=builder /app/scraper ./scraper
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/bun.lock ./bun.lock

# Install curl for health check
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Install production dependencies only (no devDependencies)
RUN bun install --production --frozen-lockfile

ENV NODE_ENV=production

# Install Playwright browsers + system packages
# Main app: chromium (PDF generation) + firefox (shared with scraper)
# Scraper: firefox only — all scrapers migrated to Firefox in story 31.5
# bunx finds playwright in node_modules; --with-deps installs apt packages
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN bunx playwright install --with-deps chromium firefox
RUN cd scraper && bunx playwright install --with-deps firefox

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
