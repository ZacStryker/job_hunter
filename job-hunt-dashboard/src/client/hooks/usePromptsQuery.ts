import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { promptSchema } from '@shared/schemas'
import type { Prompt } from '@shared/schemas'

export async function fetchPrompts(): Promise<Prompt[]> {
  const res = await fetch('/api/prompts')
  if (!res.ok) throw new Error('Failed to fetch prompts')
  return z.array(promptSchema).parse(await res.json())
}

export function usePromptsQuery() {
  return useQuery({
    queryKey: ['prompts'],
    queryFn: fetchPrompts,
  })
}
