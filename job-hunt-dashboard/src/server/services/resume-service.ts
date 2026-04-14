import type { Job } from '../../shared/schemas'

export async function callResumeWebhook(job: Job): Promise<void> {
  const webhookUrl = process.env.N8N_RESUME_WEBHOOK_URL
  if (!webhookUrl) {
    throw new Error('N8N_RESUME_WEBHOOK_URL not configured')
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (process.env.N8N_WEBHOOK_SECRET) {
    headers['Authorization'] = `Bearer ${process.env.N8N_WEBHOOK_SECRET}`
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      company: job.company,
      job_title: job.jobTitle,
      location: job.location ?? '',
      job_description: job.jobDescription,
      job_url: job.sourceUrl ?? '',
      notes: '',
    }),
    signal: AbortSignal.timeout(120_000),
  })

  if (!response.ok) {
    throw new Error(`n8n resume webhook returned ${response.status}`)
  }
}
