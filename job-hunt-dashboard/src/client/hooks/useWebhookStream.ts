import { useState, useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../lib/api'

export interface WebhookStreamState {
  isPending: boolean
  statusMessage: string | null
  isSuccess: boolean
  isError: boolean
  error: string | null
  trigger: () => void
  reset: () => void
}

export function useWebhookStream(url: string): WebhookStreamState {
  const queryClient = useQueryClient()
  const [isPending, setIsPending] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)
  const [isError, setIsError] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const trigger = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsPending(true)
    setIsSuccess(false)
    setIsError(false)
    setError(null)
    setStatusMessage(null)

    let gotDone = false
    let encounteredError = false
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
    const _streamStart = Date.now()
    console.log(`[discovery-stream] trigger → POST ${url}`)

    try {
      const response = await apiFetch(url, { method: 'POST', signal: controller.signal })
      console.log(`[discovery-stream] HTTP ${response.status} (${Date.now() - _streamStart}ms)`)

      if (!response.ok) {
        let message = `HTTP ${response.status}`
        try {
          const body = await response.json() as { error?: string }
          if (body.error) message = body.error
        } catch {
          // non-JSON body
        }
        setIsPending(false)
        setIsError(true)
        setError(message)
        queryClient.invalidateQueries({ queryKey: ['webhook-runs'] })
        return
      }

      if (!response.body) {
        setIsPending(false)
        setIsError(true)
        setError('Response has no body')
        queryClient.invalidateQueries({ queryKey: ['webhook-runs'] })
        return
      }

      reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          let ev: Record<string, unknown>
          try {
            ev = JSON.parse(line) as Record<string, unknown>
          } catch {
            continue
          }
          console.log(`[discovery-stream] event @${Date.now() - _streamStart}ms:`, ev)
          if (typeof ev.status === 'string') {
            setStatusMessage(ev.status)
          } else if (ev.jobsReady === true) {
            queryClient.invalidateQueries({ queryKey: ['jobs'] })
          } else if (ev.done === true) {
            gotDone = true
            const summary = buildDoneSummary(ev)
            setStatusMessage(summary)
            setIsPending(false)
            setIsSuccess(true)
            queryClient.invalidateQueries({ queryKey: ['jobs'] })
            queryClient.invalidateQueries({ queryKey: ['webhook-runs'] })
          } else if (typeof ev.error === 'string') {
            encounteredError = true
            setIsPending(false)
            setIsError(true)
            setError(ev.error)
            queryClient.invalidateQueries({ queryKey: ['webhook-runs'] })
          }
        }
      }

      // flush remaining buffer
      const remaining = buf + decoder.decode()
      if (remaining.trim()) {
        try {
          const ev = JSON.parse(remaining) as Record<string, unknown>
          if (ev.jobsReady === true) {
            queryClient.invalidateQueries({ queryKey: ['jobs'] })
          } else if (ev.done === true) {
            gotDone = true
            const summary = buildDoneSummary(ev)
            setStatusMessage(summary)
            setIsPending(false)
            setIsSuccess(true)
            queryClient.invalidateQueries({ queryKey: ['jobs'] })
            queryClient.invalidateQueries({ queryKey: ['webhook-runs'] })
          } else if (typeof ev.error === 'string') {
            encounteredError = true
            setIsPending(false)
            setIsError(true)
            setError(ev.error)
            queryClient.invalidateQueries({ queryKey: ['webhook-runs'] })
          }
        } catch {
          // partial/malformed trailing line — fall through to unexpectedEnd check
        }
      }

      if (!gotDone && !encounteredError) {
        console.warn(`[discovery-stream] stream closed without done/error after ${Date.now() - _streamStart}ms`)
        setIsPending(false)
        setIsError(true)
        setError('Stream ended unexpectedly')
        queryClient.invalidateQueries({ queryKey: ['webhook-runs'] })
      } else {
        console.log(`[discovery-stream] stream complete — gotDone=${gotDone} encounteredError=${encounteredError} total=${Date.now() - _streamStart}ms`)
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      console.error(`[discovery-stream] caught error after ${Date.now() - _streamStart}ms:`, err)
      setIsPending(false)
      setIsError(true)
      setError(err instanceof Error ? err.message : String(err))
      queryClient.invalidateQueries({ queryKey: ['webhook-runs'] })
    } finally {
      reader?.cancel().catch(() => {})
    }
  }, [url, queryClient])

  const reset = useCallback(() => {
    setIsSuccess(false)
    setIsError(false)
    setError(null)
    setStatusMessage(null)
  }, [])

  return { isPending, statusMessage, isSuccess, isError, error, trigger, reset }
}

function buildDoneSummary(ev: Record<string, unknown>): string {
  if (typeof ev.inserted === 'number') {
    return `Done — ${ev.inserted} new job${ev.inserted === 1 ? '' : 's'} inserted`
  }
  if (typeof ev.processed === 'number' && typeof ev.matched === 'number' && typeof ev.archived === 'number') {
    const base = `${ev.processed} analyzed, ${ev.matched} matched, ${ev.archived} archived`
    return typeof ev.failed === 'number' && ev.failed > 0 ? `${base} (${ev.failed} failed)` : base
  }
  if (typeof ev.processed === 'number' && typeof ev.failed === 'number') {
    return `Done — ${ev.processed} analyzed, ${ev.failed} failed`
  }
  return 'Done'
}
