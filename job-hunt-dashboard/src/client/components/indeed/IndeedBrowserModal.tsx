import { useRef, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { SessionStatus, FrameCallback } from '@/hooks/useIndeedBrowserSession'

interface Props {
  open: boolean
  onClose: () => void
  status: SessionStatus
  saveSession: () => void
  sendClick: (x: number, y: number) => void
  sendKey: (key: string) => void
  sendCancel: () => void
  onFrameRef: React.MutableRefObject<FrameCallback | null>
}

export function IndeedBrowserModal({ open, onClose, status, saveSession, sendClick, sendKey, sendCancel, onFrameRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    onFrameRef.current = (buffer: ArrayBuffer) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      createImageBitmap(new Blob([buffer], { type: 'image/png' }))
        .then(bitmap => {
          ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
          bitmap.close()
        })
        .catch(() => { })
    }
    return () => {
      onFrameRef.current = null
    }
  }, [onFrameRef])

  useEffect(() => {
    if (status === 'active') {
      canvasRef.current?.focus()
    }
  }, [status])

  function handleOpenChange(open: boolean) {
    if (!open) {
      sendCancel()
      onClose()
    }
  }

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!
    if (!canvas.clientWidth || !canvas.clientHeight) return
    const x = (e.nativeEvent.offsetX / canvas.clientWidth) * 1280
    const y = (e.nativeEvent.offsetY / canvas.clientHeight) * 800
    sendClick(x, y)
    canvas.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLCanvasElement>) {
    sendKey(e.key)
    e.preventDefault()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[500px] p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle>Connect to Indeed</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-zinc-400 px-4 pb-2">Solve the Cloudflare challenge, then click Save Session.</p>
        <div className="flex items-center justify-center" style={{ minHeight: 360 }}>
          {status === 'loading' && (
            <div className="flex flex-col items-center gap-3 text-zinc-400">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="text-sm">Opening Indeed...</span>
            </div>
          )}
          {status === 'active' && (
            <div className="flex flex-col items-center gap-2">
              <canvas
                ref={canvasRef}
                width={480}
                height={300}
                tabIndex={0}
                style={{ width: 480, height: 300, display: 'block' }}
                onMouseDown={handleMouseDown}
                onKeyDown={handleKeyDown}
              />
              <Button size="sm" onClick={saveSession}>Save Session</Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
