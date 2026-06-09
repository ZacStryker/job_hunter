process.env.DB_PATH = ':memory:'

import { describe, test, expect, beforeAll, afterEach, mock } from 'bun:test'
import { Database } from 'bun:sqlite'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'

// Replace generate-pdf with real Playwright implementation + font-request blocking.
// Blocking Google Fonts prevents waitUntil:'networkidle' from hanging in environments
// without reliable external network access. Real Playwright still runs, real PDF is produced.
mock.module('./generate-pdf', () => ({
  generatePdf: async (html: string): Promise<Buffer> => {
    const { chromium } = await import('playwright')
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage()
      // Abort font HTTP requests; use domcontentloaded (not networkidle) to avoid
      // preconnect TCP connections from <link rel="preconnect"> hanging the test.
      await page.route('https://fonts.googleapis.com/**', route => route.abort())
      await page.route('https://fonts.gstatic.com/**', route => route.abort())
      await page.setContent(html, { waitUntil: 'domcontentloaded' })
      await page.waitForFunction(
        () => (window as unknown as { __paginationComplete?: boolean }).__paginationComplete === true,
        { timeout: 15_000 }
      )
      const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true })
      return Buffer.from(pdf)
    } finally {
      await browser.close()
    }
  }
}))

const { generateResume } = await import('../services/resume-service')
const { db: prodDb } = await import('../../db/client')
const prodSqlite = (prodDb as unknown as { $client: Database }).$client

const MOCK_JOB = {
  id: 1, company: 'Acme Corp', jobTitle: 'Senior Engineer',
  jobDescription: 'Build great things at scale.', location: 'Amsterdam',
  fitScore: null, recommendation: null, roleFit: null, requirementsMet: null,
  requirementsMissed: null, redFlags: null, sourceUrl: null, dateScraped: null,
  source: null, externalJobId: null, analysisStatus: null, salary: null,
  benefits: null, contactName: null, contactEmail: null, contactPhone: null,
  applied: false, status: null, statusOverride: null, coverLetterSentAt: null,
  dateApplied: null, archived: false,
} as import('../../shared/schemas').Job

const ONE_PAGE_FIXTURE = {
  first_name: 'Jane', last_name: 'Doe',
  title_01: 'Software Engineer', title_02: 'Platform Specialist',
  email: 'jane@example.com', website: 'https://jane.dev',
  linkedin: 'linkedin.com/in/janedoe', location: 'Amsterdam, NL',
  summary: 'Engineer with 5 years building distributed systems.',
  skill_groups: [{ label: 'Languages', skills: ['TypeScript', 'Python', 'Go'] }],
  education: [],
  projects: [],
  experience: [{
    company: 'Acme Corp', location: 'Amsterdam', dates: '2021–2024',
    role: 'Senior Engineer',
    bullets: [
      'Built event pipeline processing 5M events/day.',
      'Reduced API latency by 40% through query optimization.',
      'Mentored 3 junior engineers.',
    ],
  }],
}

const TWO_PAGE_FIXTURE = {
  first_name: 'Jane', last_name: 'Doe',
  title_01: 'Staff Software Engineer', title_02: 'Platform Specialist',
  email: 'jane@example.com', website: 'https://jane.dev',
  linkedin: 'linkedin.com/in/janedoe', location: 'Amsterdam, NL',
  summary: 'Engineer with 12 years building distributed systems at scale across fintech, adtech, and infrastructure. Proven track record of leading platform migrations, growing engineering teams, and delivering reliable systems at high throughput.',
  skill_groups: [
    { label: 'Languages', skills: ['TypeScript', 'Python', 'Go', 'Rust', 'Scala'] },
    { label: 'Infrastructure', skills: ['Kubernetes', 'Terraform', 'AWS', 'GCP', 'Docker'] },
    { label: 'Databases', skills: ['PostgreSQL', 'Redis', 'Cassandra', 'DynamoDB', 'ClickHouse'] },
    { label: 'Frameworks', skills: ['React', 'FastAPI', 'gRPC', 'Kafka', 'Airflow'] },
    { label: 'Practices', skills: ['TDD', 'DDD', 'Event Sourcing', 'CQRS', 'SRE'] },
  ],
  education: [{ school: 'TU Delft', degree: 'MSc Computer Science', year: '2012' }],
  projects: [
    { name: 'DistributedQ', desc: 'High-throughput message queue with exactly-once delivery guarantees processing 1M msgs/sec.', stack: 'Go · Kafka · Kubernetes' },
    { name: 'MLPipeline', desc: 'End-to-end ML training pipeline processing 50M samples daily with automated retraining.', stack: 'Python · Airflow · GCP' },
  ],
  experience: [
    { company: 'MegaCorp', location: 'Amsterdam', dates: '2022–2024', role: 'Staff Engineer', bullets: [
      'Led migration of monolith to microservices reducing deployment time from 45 minutes to under 3 minutes across 12 engineering teams.',
      'Designed event-driven architecture handling 500K events per second with p99 latency under 20ms using Kafka and Go consumers.',
      'Mentored 8 senior engineers through architecture review process, improving design quality score from 3.2 to 4.7 out of 5.',
      'Built internal developer platform adopted by 40 engineers cutting new-service bootstrap time from 2 days to 30 minutes.',
      'Drove platform SLA improvements reducing customer-reported incidents by 67% over 18 months.',
    ]},
    { company: 'FinTechCo', location: 'Amsterdam', dates: '2019–2022', role: 'Senior Engineer', bullets: [
      'Rebuilt payment processing pipeline handling EUR 2B monthly volume with zero-downtime migration over 6 months.',
      'Introduced Rust-based hot path reducing CPU usage 40% for real-time fraud detection at 10K transactions/sec.',
      'Designed multi-region active-active setup achieving 99.995% uptime across 3 AWS regions.',
      'Grew engineering team from 5 to 18 engineers through structured hiring and onboarding programs.',
      'Shipped GDPR compliance tooling covering 15M user records within regulatory deadline.',
    ]},
    { company: 'AdTechStartup', location: 'Berlin', dates: '2016–2019', role: 'Engineer', bullets: [
      'Built real-time bidding engine processing 1M requests/second with 8ms median end-to-end latency.',
      'Migrated data warehouse from Redshift to ClickHouse reducing query times 5x for 200TB dataset.',
      'Implemented A/B testing framework supporting 30 concurrent experiments with rigorous statistical analysis.',
      'Open-sourced internal observability library gaining 800 GitHub stars and adoption at 3 companies.',
      'Designed programmatic advertising pipeline serving 500M impressions/day across 12 DSPs.',
    ]},
    { company: 'StartupXYZ', location: 'Amsterdam', dates: '2013–2016', role: 'Junior Engineer', bullets: [
      'Built and maintained REST APIs serving 50K daily active users with 99.9% uptime.',
      'Reduced CI pipeline time from 25 minutes to 8 minutes through parallelization and intelligent caching.',
      'Contributed to open-source PostgreSQL extension for time-series data adopted by 500+ organizations.',
      'Implemented end-to-end test suite covering 85% of critical paths, reducing production incidents by 30%.',
      'Delivered real-time analytics dashboard processing 10M daily events with sub-second query response.',
    ]},
  ],
}

async function evaluatePageCount(injectedHtml: string): Promise<number> {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    // Abort font HTTP requests; use domcontentloaded (not networkidle) to avoid
    // preconnect TCP connections from <link rel="preconnect"> hanging the test.
    await page.route('https://fonts.googleapis.com/**', route => route.abort())
    await page.route('https://fonts.gstatic.com/**', route => route.abort())
    await page.setContent(injectedHtml, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(
      () => (window as unknown as { __paginationComplete?: boolean }).__paginationComplete === true,
      { timeout: 15_000 }
    )
    return await page.evaluate(
      () => (window as unknown as { __resumePageCount: number }).__resumePageCount
    )
  } finally {
    await browser.close()
  }
}

async function buildInjectedHtml(resumeData: object): Promise<string> {
  const templatePath = join(import.meta.dir, '../../../resume_templates/resume_template(1).html')
  const templateHtml = await readFile(templatePath, 'utf-8')
  return templateHtml.replace(
    /<script id="resume-data" type="application\/json">[\s\S]*?<\/script>/,
    `<script id="resume-data" type="application/json">\n${JSON.stringify(resumeData, null, 2)}\n</script>`
  )
}

let originalFetch: typeof globalThis.fetch

beforeAll(() => {
  originalFetch = globalThis.fetch
  prodSqlite.run(`CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    name TEXT, email TEXT, phone TEXT, location TEXT,
    linkedin_url TEXT, github_url TEXT, summary TEXT,
    experience TEXT, skills TEXT, education TEXT,
    UNIQUE(user_id)
  )`)
  prodSqlite.run(`CREATE TABLE IF NOT EXISTS prompts (
    flow TEXT PRIMARY KEY NOT NULL,
    system_prompt TEXT,
    user_message TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`)
  process.env.ANTHROPIC_API_KEY = 'test-key'
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('resume E2E — one-page layout', () => {
  test('full pipeline produces non-empty PDF Buffer', async () => {
    globalThis.fetch = mock(() => Promise.resolve(new Response(
      JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(ONE_PAGE_FIXTURE) }], usage: { input_tokens: 100, output_tokens: 200 } }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    ))) as unknown as typeof globalThis.fetch
    const result = await generateResume(MOCK_JOB)
    expect(result.pdf).toBeInstanceOf(Buffer)
    expect(result.pdf.length).toBeGreaterThan(0)
  }, 60_000)

  test('renders as a single page', async () => {
    const injectedHtml = await buildInjectedHtml(ONE_PAGE_FIXTURE)
    const pageCount = await evaluatePageCount(injectedHtml)
    expect(pageCount).toBe(1)
  }, 60_000)
})

describe('resume E2E — two-page layout', () => {
  test('full pipeline produces non-empty PDF Buffer', async () => {
    globalThis.fetch = mock(() => Promise.resolve(new Response(
      JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(TWO_PAGE_FIXTURE) }], usage: { input_tokens: 100, output_tokens: 200 } }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    ))) as unknown as typeof globalThis.fetch
    const result = await generateResume(MOCK_JOB)
    expect(result.pdf).toBeInstanceOf(Buffer)
    expect(result.pdf.length).toBeGreaterThan(0)
  }, 60_000)

  test('renders as two pages', async () => {
    const injectedHtml = await buildInjectedHtml(TWO_PAGE_FIXTURE)
    const pageCount = await evaluatePageCount(injectedHtml)
    expect(pageCount).toBe(2)
  }, 60_000)
})
