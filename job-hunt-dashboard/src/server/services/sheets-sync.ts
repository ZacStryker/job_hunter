import { getAccessToken } from './oauth-client'
import type { JobInput } from '../../shared/schemas'

interface DetailRow {
  dateScraped: string | null
  jobDescription: string | null
  roleFit: string | null
  requirementsMet: string | null
  requirementsMissed: string | null
  redFlags: string | null
}

export async function fetchJobsFromSheets(): Promise<JobInput[]> {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID!
  const token = await getAccessToken()

  const [sheet1Res, detailsRes] = await Promise.all([
    fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/JobDetails`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  ])

  if (!sheet1Res.ok) {
    const text = await sheet1Res.text()
    throw new Error(`Sheets API error ${sheet1Res.status}: ${text}`)
  }
  if (!detailsRes.ok) {
    const text = await detailsRes.text()
    throw new Error(`Sheets API error (JobDetails) ${detailsRes.status}: ${text}`)
  }

  const sheet1Data = (await sheet1Res.json()) as { values?: string[][] }
  const detailsData = (await detailsRes.json()) as { values?: string[][] }

  if (!sheet1Data.values || sheet1Data.values.length < 2) {
    return []
  }

  const [headers, ...rows] = sheet1Data.values
  const detailMap = buildDetailMap(detailsData.values ?? [])

  return rows
    .map((row) => mapRow(headers, row, detailMap))
    .filter((r): r is JobInput => r !== null)
}

function buildDetailMap(values: string[][]): Map<string, DetailRow> {
  const map = new Map<string, DetailRow>()
  if (values.length < 2) return map

  const [headers, ...rows] = values

  const getCol = (row: string[], col: string): string | null => {
    const idx = headers.indexOf(col)
    if (idx < 0) return null
    const val = row[idx]
    return val !== undefined && val !== '' ? val : null
  }

  for (const row of rows) {
    const id = getCol(row, 'job_id')
    if (!id) continue
    map.set(id, {
      dateScraped: getCol(row, 'date_scraped'),
      jobDescription: getCol(row, 'description'),
      roleFit: getCol(row, 'role_fit'),
      requirementsMet: getCol(row, 'requirements_met'),
      requirementsMissed: getCol(row, 'requirements_missed'),
      redFlags: getCol(row, 'red_flags'),
    })
  }

  return map
}

function mapRow(headers: string[], row: string[], detailMap: Map<string, DetailRow>): JobInput | null {
  const get = (col: string): string | null => {
    const idx = headers.indexOf(col)
    if (idx < 0) return null
    const val = row[idx]
    return val !== undefined && val !== '' ? val : null
  }

  const company = get('company')
  const jobTitle = get('title')
  if (!company || !jobTitle) return null

  const fitScoreRaw = get('score')
  const fitScoreParsed = fitScoreRaw !== null ? parseInt(fitScoreRaw, 10) : null
  const fitScore = fitScoreParsed !== null && !isNaN(fitScoreParsed) ? fitScoreParsed : null

  const rec = get('recommended_action')
  const recommendation =
    rec === 'apply' || rec === 'investigate' || rec === 'skip' ? rec : null

  const jobId = get('job_id')
  const detail = jobId ? detailMap.get(jobId) : undefined

  return {
    company,
    jobTitle,
    fitScore,
    recommendation,
    roleFit: detail?.roleFit ?? null,
    requirementsMet: detail?.requirementsMet ?? null,
    requirementsMissed: detail?.requirementsMissed ?? null,
    redFlags: detail?.redFlags ?? null,
    jobDescription: detail?.jobDescription ?? null,
    sourceUrl: get('url'),
    dateScraped: detail?.dateScraped ?? null,
  }
}
