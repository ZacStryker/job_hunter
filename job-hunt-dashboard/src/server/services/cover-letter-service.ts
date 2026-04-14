import type { Job } from '../../shared/schemas'

export async function callN8nWebhook(job: Job): Promise<string> {
  const webhookUrl = process.env.N8N_WEBHOOK_URL
  if (!webhookUrl) {
    throw new Error('N8N_WEBHOOK_URL not configured')
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (process.env.N8N_WEBHOOK_SECRET) {
    headers['Authorization'] = `Bearer ${process.env.N8N_WEBHOOK_SECRET}`
  }

  const payload = {
    company: job.company,
    job_title: job.jobTitle,
    location: job.location ?? '',
    job_description: job.jobDescription,
    job_url: job.sourceUrl ?? '',
    notes: '',
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60_000),
  })

  if (!response.ok) {
    throw new Error(`n8n webhook returned ${response.status}`)
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const raw = await response.json()
    const data = (Array.isArray(raw) ? raw[0] : raw) as { cover_letter?: string }
    const coverLetter = data.cover_letter
    if (!coverLetter) {
      throw new Error('n8n response missing cover_letter field')
    }
    return coverLetter
  }
  const text = (await response.text()).trim()
  if (!text) {
    throw new Error('n8n returned empty cover letter')
  }
  return text
}
