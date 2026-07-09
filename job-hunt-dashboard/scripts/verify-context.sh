#!/usr/bin/env bash
# Asserts that every [P] and [!] rule in _bmad-output/project-context.md still matches
# the code. A rule that cannot be checked here is a rule maintained by faith.
#
# Exit 0 = the context file is honest. Exit 1 = a rule has drifted; fix the file.

cd "$(dirname "$0")/.."

fails=0

check() { # check <description> <command...>
  local desc="$1"; shift
  if "$@" >/dev/null 2>&1; then
    printf '  ok    %s\n' "$desc"
  else
    printf '  DRIFT %s\n' "$desc"
    fails=$((fails + 1))
  fi
}

refute() { # refute <description> <command...>  — passes when the command FAILS
  local desc="$1"; shift
  if "$@" >/dev/null 2>&1; then
    printf '  DRIFT %s\n' "$desc"
    fails=$((fails + 1))
  else
    printf '  ok    %s\n' "$desc"
  fi
}

echo "Invariants"
check "prod binds 0.0.0.0"                grep -q "'0.0.0.0'" src/index.ts
check "auth middleware sets userId"       grep -q "c.set('userId'" src/server/middleware/auth-middleware.ts
check "auth middleware sets sessionUserId" grep -q "c.set('sessionUserId'" src/server/middleware/auth-middleware.ts
check "admin check uses sessionUserId"    grep -q "c.get('sessionUserId')" src/server/middleware/admin-middleware.ts
check "CSRF enforced on mutations"        grep -q "x-csrf-token" src/server/middleware/auth-middleware.ts
check "client mutations go via apiFetch"  grep -q "x-csrf-token" src/client/lib/api.ts

echo "Main app"
check "jobs unique key includes userId"   grep -q "company_job_title_idx').on(table.company, table.jobTitle, table.userId" src/db/schema.ts
check "ingest upsert targets userId"      grep -q "target: \[jobs.company, jobs.jobTitle, jobs.userId\]" src/server/services/ingest-service.ts
check "error shape is { error }"          grep -q "c.json({ error:" src/server/middleware/error-handler.ts
# The line above also matches the HTTPException passthrough, so it cannot prove 500s are
# sanitized. Assert the sanitized literal separately.
check "500s are sanitized"               grep -q "error: 'Internal Server Error'" src/server/middleware/error-handler.ts
check "deliberate 4xx pass through"      grep -q "err instanceof HTTPException" src/server/middleware/error-handler.ts
check "drizzle uses bun-sqlite driver"    grep -q "drizzle-orm/bun-sqlite" src/db/client.ts
check "sqlite enables WAL"                grep -qi "journal_mode = WAL" src/db/client.ts
check "sqlite sets busy_timeout"          grep -qi "busy_timeout" src/db/client.ts
check "messages unique per user"          grep -q "messages_uid_user_id_idx').on(table.uid, table.userId" src/db/schema.ts
check "message-id unique per user"        grep -q "messages_message_id_user_id_idx').on(table.messageId, table.userId" src/db/schema.ts
refute "no @anthropic-ai/sdk dependency"  grep -q '"@anthropic-ai/sdk"' package.json
check "embeddings use @xenova"            grep -q "@xenova/transformers" src/server/services/embedding-service.ts
refute "no tailwind.config.js"            test -e tailwind.config.js
refute "no postcss.config.js"             test -e postcss.config.js

echo "Scraper"
check "scraper reached via SCRAPER_URL"   grep -q "SCRAPER_URL" src/server/services/scraper-process.ts
check "firefox pool size is 2"            grep -q "FIREFOX_POOL_SIZE = 2" scraper/src/browser/pool.js
check "deps image uses bun in scraper"    grep -q "cd scraper && bun install" Dockerfile.deps
refute "nothing runs npm ci"              grep -q "npm ci" Dockerfile Dockerfile.deps

echo "Playwright disambiguation"
check "patchright -> chromium (Indeed)"   grep -q "from 'patchright'" src/server/services/indeed-browser-service.ts
check "Indeed browser is headful"         grep -q "headless: false" src/server/services/indeed-browser-service.ts
check "LinkedIn firefox is headless"      grep -q "firefox.launch({ headless: true })" src/server/services/linkedin-browser-service.ts
check "PDF uses playwright chromium"      grep -q "import { chromium } from 'playwright'" src/server/services/generate-pdf.ts

echo "Deployment"
check "deps image built locally"          test -e scripts/build-deps.sh
check "required env vars enforced"        grep -q "REQUIRED_ENV_VARS" src/index.ts
check "ENCRYPTION_KEY hex-validated"      grep -q '0-9a-fA-F]{64}' src/index.ts
check "nginx upgrades websockets"         grep -q 'proxy_set_header      Upgrade' nginx/nginx.conf
check "ws location block exists"          grep -q 'browser/\[^/\]+/ws\$' nginx/nginx.conf
check "embedding model baked into image"  grep -q "EMBEDDING_CACHE_DIR" Dockerfile.deps
check "embedding cacheDir honoured"       grep -q "env.cacheDir" src/server/services/embedding-service.ts

echo "Verification claims"
# A bare .github/ (issue templates) is not CI — only a workflows dir is.
refute "still no CI"                      test -d ../.github/workflows
check  "test script exists"               grep -q '"test":' package.json
check  "typecheck script exists"          grep -q '"typecheck":' package.json
check  "scraper still has no tests"       test "$(find scraper/src -name '*.test.*' | wc -l)" -eq 0

echo
if [ "$fails" -eq 0 ]; then
  echo "project-context.md is consistent with the code."
else
  echo "$fails rule(s) drifted. Update _bmad-output/project-context.md."
  exit 1
fi
