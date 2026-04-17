import { useMutation, useQueryClient } from '@tanstack/react-query'

export function useGenerateResume(jobId: number) {
  const queryClient = useQueryClient()

  return useMutation<void, Error>({
    mutationFn: async () => {
      if (!jobId) throw new Error('No job selected')
      const res = await fetch(`/api/jobs/${jobId}/generate-resume`, { method: 'POST' })
      if (!res.ok) {
        let message = `HTTP ${res.status}`
        try {
          const body = await res.json() as { error: string }
          if (body.error) message = body.error
        } catch {
          // non-JSON body
        }
        throw new Error(message)
      }
      const blob = await res.blob()
      const contentDisposition = res.headers.get('content-disposition') ?? ''
      const match = contentDisposition.match(/filename="([^"]+)"/)
      const filename = match?.[1] ?? 'resume.pdf'
      // Re-wrap as octet-stream so Firefox treats it as a file save rather
      // than intercepting it with the built-in PDF viewer.
      const url = URL.createObjectURL(new Blob([blob], { type: 'application/octet-stream' }))
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      // Use dispatchEvent instead of .click() — Firefox requires this when the
      // download is triggered outside of an active user gesture (FileSaver.js pattern).
      a.dispatchEvent(new MouseEvent('click', { bubbles: false, cancelable: false, view: window }))
      document.body.removeChild(a)
      // 40s gives Firefox time to read the object URL before it's revoked.
      setTimeout(() => URL.revokeObjectURL(url), 40_000)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-runs'] })
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })
}
