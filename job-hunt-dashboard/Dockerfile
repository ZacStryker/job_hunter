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
FROM hitlobster-deps:latest
WORKDIR /app

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/bun.lock ./bun.lock

# Selective scraper copy — preserves /app/scraper/node_modules from base image
COPY --from=builder /app/scraper/src ./scraper/src
COPY --from=builder /app/scraper/package.json ./scraper/package.json
COPY --from=builder /app/scraper/package-lock.json ./scraper/package-lock.json

COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 3000

CMD ["/app/entrypoint.sh"]
