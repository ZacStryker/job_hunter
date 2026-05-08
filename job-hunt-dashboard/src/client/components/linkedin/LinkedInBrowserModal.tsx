import { useRef, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { SessionStatus, FrameCallback } from '@/hooks/useLinkedinBrowserSession'

interface Props {
  open: boolean
  onClose: () => void
  status: SessionStatus
  sendClick: (x: number, y: number) => void
  sendKey: (key: string) => void
  sendCancel: () => void
  onFrameRef: React.MutableRefObject<FrameCallback | null>
}

export function LinkedInBrowserModal({ open, onClose, status, sendClick, sendKey, sendCancel, onFrameRef }: Props) {
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

  // Auto-focus canvas when active so keydown events work without requiring a click first (P4)
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
    const x = (e.nativeEvent.offsetX / canvas.clientWidth) * 960
    const y = (e.nativeEvent.offsetY / canvas.clientHeight) * 1200
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
          <DialogTitle>Connect to LinkedIn</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-center" style={{ minHeight: 600 }}>
          {status === 'loading' && (
            <div className="flex flex-col items-center gap-3 text-zinc-400">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="text-sm">Opening LinkedIn...</span>
            </div>
          )}
          {status === 'active' && (
            <canvas
              ref={canvasRef}
              width={480}
              height={600}
              tabIndex={0}
              style={{ width: 480, height: 600, display: 'block' }}
              onMouseDown={handleMouseDown}
              onKeyDown={handleKeyDown}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
