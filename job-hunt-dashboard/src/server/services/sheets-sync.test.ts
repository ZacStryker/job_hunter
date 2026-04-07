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

const MAIN_HEADERS = ['job_id', 'company', 'title', 'score', 'recommended_action', 'url']
const DETAIL_HEADERS = ['job_id', 'date_scraped', 'description', 'role_fit', 'requirements_met', 'requirements_missed', 'red_flags']

function mockSheets(mainValues: string[][], detailValues: string[][]) {
  mockFetch.mockImplementation((url: string) => {
    const body = (url as string).includes('JobDetails')
      ? { values: detailValues }
      : { values: mainValues }
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
  })
}

test('valid spreadsheet response → returns correctly mapped JobInput[]', async () => {
  const mainValues = [
    MAIN_HEADERS,
    ['J1', 'Acme Corp', 'Backend Engineer', '82', 'apply', 'https://example.com'],
    ['J2', 'Beta Inc', 'Frontend Dev', '70', 'investigate', 'https://beta.com'],
  ]
  const detailValues = [
    DETAIL_HEADERS,
    ['J1', '2026-03-01', 'Job desc', 'Strong fit', 'TypeScript', 'None', ''],
    ['J2', '2026-03-02', 'Desc', 'Good', 'React', 'Go', 'Culture risk'],
  ]

  mockSheets(mainValues, detailValues)

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
  mockSheets([MAIN_HEADERS], [DETAIL_HEADERS])

  const jobs = await fetchJobsFromSheets()
  expect(jobs).toEqual([])
})

test('rows missing company or title → filtered out of result', async () => {
  const mainValues = [
    MAIN_HEADERS,
    ['J1', '', 'Backend Engineer', '82', 'apply', ''],    // missing company
    ['J2', 'Acme Corp', '', '82', 'apply', ''],           // missing title
    ['J3', 'Good Corp', 'Eng', '75', 'skip', ''],         // valid
  ]
  mockSheets(mainValues, [DETAIL_HEADERS])

  const jobs = await fetchJobsFromSheets()
  expect(jobs).toHaveLength(1)
  expect(jobs[0].company).toBe('Good Corp')
})

test('score string "85" → parsed to integer 85', async () => {
  const mainValues = [
    MAIN_HEADERS,
    ['J1', 'TechCo', 'SWE', '85', 'apply', ''],
  ]
  mockSheets(mainValues, [DETAIL_HEADERS])

  const jobs = await fetchJobsFromSheets()
  expect(jobs[0].fitScore).toBe(85)
  expect(typeof jobs[0].fitScore).toBe('number')
})

test('job with no matching detail row → detail fields are null', async () => {
  const mainValues = [
    MAIN_HEADERS,
    ['J1', 'TechCo', 'SWE', '85', 'apply', 'https://example.com'],
  ]
  mockSheets(mainValues, [DETAIL_HEADERS])

  const jobs = await fetchJobsFromSheets()
  expect(jobs[0].roleFit).toBeNull()
  expect(jobs[0].dateScraped).toBeNull()
  expect(jobs[0].jobDescription).toBeNull()
})
