import { test, expect, mock, beforeEach } from 'bun:test'

mock.module('./oauth-client', () => ({
  getAccessToken: () => Promise.resolve('mock-access-token'),
}))

let mockFetch: ReturnType<typeof mock>

beforeEach(() => {
  mockFetch = mock(() => Promise.resolve(new Response('', { status: 200 })))
  global.fetch = mockFetch as unknown as typeof fetch
})

const { fetchJobsFromSheets } = await import('./sheets-sync')

const HEADERS = [
  'company',
  'job_title',
  'fit_score',
  'recommendation',
  'role_fit',
  'requirements_met',
  'requirements_missed',
  'red_flags',
  'job_description',
  'source_url',
  'date_scraped',
]

test('valid spreadsheet response → returns correctly mapped JobInput[]', async () => {
  const values = [
    HEADERS,
    ['Acme Corp', 'Backend Engineer', '82', 'apply', 'Strong fit', 'TypeScript', 'None', '', 'Job desc', 'https://example.com', '2026-03-01'],
    ['Beta Inc', 'Frontend Dev', '70', 'investigate', 'Good', 'React', 'Go', 'Culture risk', 'Desc', 'https://beta.com', '2026-03-02'],
  ]

  mockFetch.mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify({ values }), { status: 200 }))
  )

  const jobs = await fetchJobsFromSheets()
  expect(jobs).toHaveLength(2)

  expect(jobs[0]).toEqual({
    company: 'Acme Corp',
    jobTitle: 'Backend Engineer',
    fitScore: 82,
    recommendation: 'apply',
    roleFit: 'Strong fit',
    requirementsMet: 'TypeScript',
    requirementsMissed: 'None',
    redFlags: null,
    jobDescription: 'Job desc',
    sourceUrl: 'https://example.com',
    dateScraped: '2026-03-01',
  })

  expect(jobs[1].company).toBe('Beta Inc')
  expect(jobs[1].fitScore).toBe(70)
  expect(jobs[1].recommendation).toBe('investigate')
})

test('Sheets API returns non-2xx → throws with descriptive message including status code', async () => {
  mockFetch.mockImplementation(() =>
    Promise.resolve(new Response('Forbidden', { status: 403 }))
  )

  await expect(fetchJobsFromSheets()).rejects.toThrow('Sheets API error 403')
})

test('empty spreadsheet (0 data rows) → returns []', async () => {
  const values = [HEADERS] // only headers, no data rows

  mockFetch.mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify({ values }), { status: 200 }))
  )

  const jobs = await fetchJobsFromSheets()
  expect(jobs).toEqual([])
})

test('rows missing company or job_title → filtered out of result', async () => {
  const values = [
    HEADERS,
    ['', 'Backend Engineer', '82', 'apply', '', '', '', '', '', '', ''],   // missing company
    ['Acme Corp', '', '82', 'apply', '', '', '', '', '', '', ''],           // missing job_title
    ['Good Corp', 'Eng', '75', 'skip', '', '', '', '', '', '', ''],         // valid
  ]

  mockFetch.mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify({ values }), { status: 200 }))
  )

  const jobs = await fetchJobsFromSheets()
  expect(jobs).toHaveLength(1)
  expect(jobs[0].company).toBe('Good Corp')
})

test('fit_score string "85" → parsed to integer 85', async () => {
  const values = [
    HEADERS,
    ['TechCo', 'SWE', '85', 'apply', '', '', '', '', '', '', ''],
  ]

  mockFetch.mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify({ values }), { status: 200 }))
  )

  const jobs = await fetchJobsFromSheets()
  expect(jobs[0].fitScore).toBe(85)
  expect(typeof jobs[0].fitScore).toBe('number')
})
