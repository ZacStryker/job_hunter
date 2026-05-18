import { useQuery } from '@tanstack/react-query'
import type { WebhookRun } from '@shared/schemas'

export async function fetchWebhookRuns(): Promise<WebhookRun[]> {
  const res = await fetch('/api/webhook-runs')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = await res.json() as { runs: WebhookRun[] }
  return body.runs ?? []
}

export function useWebhookRunsQuery() {
  return useQuery<WebhookRun[]>({
    queryKey: ['webhook-runs'],
    queryFn: fetchWebhookRuns,
    refetchInterval: 15_000,
  })
}
