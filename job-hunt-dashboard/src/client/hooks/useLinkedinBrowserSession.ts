import { useState, useRef, useEffect, useCallback } from 'react'
import { apiFetch } from '@/lib/api'

export type SessionStatus = 'idle' | 'loading' | 'active' | 'captured' | 'timeout' | 'error'

export type FrameCallback = (frame: ArrayBuffer) => void

export interface LinkedInBrowserSession {
  status: SessionStatus
  error: string | null
  startSession: () => void
  sendClick: (x: number, y: number) => void
  sendKey: (key: string) => void
  sendCancel: () => void
  onFrameRef: React.MutableRefObject<FrameCallback | null>
}

export function useLinkedinBrowserSession(): LinkedInBrowserSession {
  const [status, setStatus] = useState<SessionStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const onFrameRef = useRef<FrameCallback | null>(null)
  // Tracks terminal states synchronously to avoid races with React batching
  const terminalRef = useRef(false)

  const cleanup = useCallback((sendCancel = false) => {
    const ws = wsRef.current
    if (!ws) return
    if (sendCancel && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'cancel' }))
    }
    ws.close()
    wsRef.current = null
  }, [])

  const startSession = useCallback(async () => {
    // Close any existing connection before starting a new one (P6)
    cleanup()
    terminalRef.current = false
    setStatus('loading')
    setError(null)

    try {
      const res = await apiFetch('/api/onboarding/linkedin/browser', { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const { sessionId } = await res.json() as { sessionId: string }

      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${proto}//${window.location.host}/api/onboarding/linkedin/browser/${sessionId}/ws`
      const ws = new WebSocket(wsUrl)
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          setStatus('active')
          onFrameRef.current?.(event.data)
        } else {
          try {
            const msg = JSON.parse(event.data as string) as { type: string; message?: string }
            if (msg.type === 'captured') {
              terminalRef.current = true
              setStatus('captured')
            } else if (msg.type === 'timeout') {
              terminalRef.current = true
              setStatus('timeout')
              setError('Session timed out — please try again')
            } else if (msg.type === 'error') {
              setStatus('error')
              setError(msg.message ?? 'An error occurred')
            }
          } catch { }
        }
      }

      ws.onerror = () => {
        if (terminalRef.current) return
        setError('Connection error — please try again')
        setStatus('error')
      }

      ws.onclose = () => {
        setStatus((prev) => {
          // Don't overwrite terminal states or deliberate cancels (idle)
          if (terminalRef.current || prev === 'idle' || prev === 'error') return prev
          setError('Connection closed unexpectedly')
          return 'error'
        })
      }
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Failed to start session')
    }
  }, [cleanup])

  const sendClick = useCallback((x: number, y: number) => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'click', x, y }))
    }
  }, [])

  const sendKey = useCallback((key: string) => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'keydown', key }))
    }
  }, [])

  const sendCancel = useCallback(() => {
    cleanup(true)
    setStatus('idle')
    setError(null)
  }, [cleanup])

  useEffect(() => {
    return () => {
      cleanup(true)
    }
  }, [cleanup])

  return { status, error, startSession, sendClick, sendKey, sendCancel, onFrameRef }
}
