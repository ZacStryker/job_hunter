import { useQuery } from '@tanstack/react-query'

// The resume template is not reachable from the client any other way: resume_templates/ sits outside
// public/, vite.config.ts sets no publicDir, and only /api and /auth are proxied. The server hands us
// the SAME bytes it renders the PDF from, so the preview cannot drift from the artifact.
export async function fetchResumeTemplate(): Promise<string> {
  const res = await fetch('/api/resume-template')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

export function useResumeTemplateQuery(enabled = true) {
  return useQuery({
    queryKey: ['resume-template'],
    queryFn: fetchResumeTemplate,
    // The template does not change at runtime, so fetch it once. This is what makes the live preview
    // free: after the first load, typing costs zero network requests.
    staleTime: Infinity,
    gcTime: Infinity,
    enabled,
  })
}
