#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

echo "Building hitlobster-deps:latest — this takes ~10 min on first run..."
docker build -f Dockerfile.deps -t hitlobster-deps:latest .
echo ""
echo "Done. hitlobster-deps:latest is ready."
echo ""
echo "Rebuild this image when any of these change:"
echo "  package.json, bun.lock, scraper/package.json, scraper/package-lock.json, Playwright version"
