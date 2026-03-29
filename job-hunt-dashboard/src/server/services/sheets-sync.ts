import { getAccessToken } from './oauth-client'
import type { JobInput } from '../../shared/schemas'

export async function fetchJobsFromSheets(): Promise<JobInput[]> {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID!
  const token = await getAccessToken()

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Sheets API error ${res.status}: ${text}`)
  }

  const data = (await res.json()) as { values?: string[][] }

  if (!data.values || data.values.length < 2) {
    return []
  }

  const [headers, ...rows] = data.values

  return rows
    .map((row) => mapRow(headers, row))
    .filter((r): r is JobInput => r !== null)
}

function mapRow(headers: string[], row: string[]): JobInput | null {
  const get = (col: string): string | null => {
    const idx = headers.indexOf(col)
    if (idx < 0) return null
    const val = row[idx]
    return val !== undefined && val !== '' ? val : null
  }

  const company = get('company')
  const jobTitle = get('job_title')
  if (!company || !jobTitle) return null

  const fitScoreRaw = get('fit_score')
  const fitScoreParsed = fitScoreRaw !== null ? parseInt(fitScoreRaw, 10) : null
  const fitScore = fitScoreParsed !== null && !isNaN(fitScoreParsed) ? fitScoreParsed : null

  const rec = get('recommendation')
  const recommendation =
    rec === 'apply' || rec === 'investigate' || rec === 'skip' ? rec : null

  return {
    company,
    jobTitle,
    fitScore,
    recommendation,
    roleFit: get('role_fit'),
    requirementsMet: get('requirements_met'),
    requirementsMissed: get('requirements_missed'),
    redFlags: get('red_flags'),
    jobDescription: get('job_description'),
    sourceUrl: get('source_url'),
    dateScraped: get('date_scraped'),
  }
}
