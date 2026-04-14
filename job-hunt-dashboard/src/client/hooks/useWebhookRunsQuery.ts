import { useQuery } from '@tanstack/react-query'
import type { WebhookRun } from '@shared/schemas'

export function useWebhookRunsQuery() {
  return useQuery<WebhookRun[]>({
    queryKey: ['webhook-runs'],
    queryFn: async () => {
      const res = await fetch('/api/webhook-runs')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.json() as { runs: WebhookRun[] }
      return body.runs
    },
    refetchInterval: 15_000,
  })
}
