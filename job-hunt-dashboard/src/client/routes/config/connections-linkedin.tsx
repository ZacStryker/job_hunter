import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useQueryClient } from '@tanstack/react-query'
import { useLinkedinBrowserSession } from '@/hooks/useLinkedinBrowserSession'
import { LinkedInBrowserModal } from '@/components/linkedin/LinkedInBrowserModal'
import { useOnboardingStatusQuery } from '@/hooks/useOnboardingStatusQuery'

export function ConnectionsLinkedinRoute() {
  const { data: status } = useOnboardingStatusQuery()
  const queryClient = useQueryClient()

  const { status: sessionStatus, error, startSession, sendClick, sendKey, sendCancel, onFrameRef } = useLinkedinBrowserSession()
  const [modalOpen, setModalOpen] = useState(false)

  const isLinkedinConnected = status?.hasLinkedinAuth ?? false

  useEffect(() => {
    if (sessionStatus === 'captured' && modalOpen) {
      setModalOpen(false)
      toast.success('LinkedIn connected')
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] })
      queryClient.invalidateQueries({ queryKey: ['setup-status'] })
    } else if ((sessionStatus === 'timeout' || sessionStatus === 'error') && modalOpen) {
      setModalOpen(false)
    }
  }, [sessionStatus, modalOpen, queryClient])

  function handleConnect() {
    startSession()
    setModalOpen(true)
  }

  function handleModalClose() {
    setModalOpen(false)
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-zinc-100 mb-6">LinkedIn</h1>
      <ul className="space-y-3">
        <li className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm text-zinc-300">LinkedIn</span>
            <span className={`text-xs ${isLinkedinConnected ? 'text-emerald-500' : 'text-zinc-500'}`}>
              {isLinkedinConnected ? 'Connected' : 'Not connected'}
            </span>
          </div>
          <Button size="sm" disabled={modalOpen} onClick={handleConnect}>
            Connect LinkedIn
          </Button>
        </li>
      </ul>

      {(sessionStatus === 'error' || sessionStatus === 'timeout') && error && (
        <Alert variant="destructive" className="mt-3">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <LinkedInBrowserModal
        open={modalOpen}
        onClose={handleModalClose}
        status={sessionStatus}
        sendClick={sendClick}
        sendKey={sendKey}
        sendCancel={sendCancel}
        onFrameRef={onFrameRef}
      />
    </div>
  )
}
