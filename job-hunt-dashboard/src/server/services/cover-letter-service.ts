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
    job_description: job.jobDescription,
    source: '',
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

  const data = await response.json() as { cover_letter?: string }
  const coverLetter = data.cover_letter
  if (!coverLetter) {
    throw new Error('n8n response missing cover_letter field')
  }
  return coverLetter
}
