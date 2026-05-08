# Epic 32: Webhook Run Recording Hotfix

Webhook-triggered discovery runs are recorded correctly in the database. The schema drift that caused `SQLiteError: table webhook_runs has no column named input_tokens` is resolved and the startup migration runner is verified to catch future drift.

**FRs covered:** FR5 (webhook_runs schema drift fix)
**NFRs addressed:** NFR4 (idempotent migration, no data loss)
**Source:** Scraper Bot Detection & Reliability Investigation Report, 2026-05-08
**Priority:** LOW risk classification, but currently broken in production — fix immediately
**Files affected:** Production DB migration, startup migration runner, `webhook_runs` schema

---

## Story 32.1: Apply webhook_runs input_tokens Migration & Harden Startup Runner

As an operator monitoring webhook-triggered discovery runs,
I want webhook runs recorded successfully in the database,
So that I can audit and track all runs triggered by the n8n webhook.

**Acceptance Criteria:**

**Given** the production DB is missing the input_tokens column in webhook_runs
**When** the migration is applied
**Then** the column exists and INSERT statements for run recording succeed

**Given** a webhook-triggered discovery run completes
**When** run recording executes
**Then** no SQLiteError is thrown and the run is persisted to webhook_runs with all expected fields

**Given** the application starts
**When** the startup migration runner executes
**Then** all pending migrations — including this one — are applied and logged as "Migrations complete"

**Given** the migration file is present in the deployed Docker image
**When** verified post-deploy
**Then** the startup log confirms all migrations ran

**Given** the migration is applied to a DB that already has the column (e.g., a fresh install from schema)
**When** the runner processes it
**Then** no error is thrown — migration is idempotent

> **Dev note:** The migration for `input_tokens` exists in the schema but was not applied to the production DB (schema drift from Epic 20 or later). First: verify the migration file is present in the deployed Docker image (`docker exec` + check migration files). Apply the migration manually if needed, then investigate why the startup runner didn't catch it — check whether the migration file was added after the last image build, or if the runner has a bug. Fix the runner so future schema drift is caught automatically on boot.

---
