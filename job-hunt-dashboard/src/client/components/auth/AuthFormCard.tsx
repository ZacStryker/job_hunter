import { cn } from '@/lib/utils'

export function AuthFormCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className={cn('w-full max-w-sm rounded-lg border border-zinc-800 bg-zinc-900 p-8', className)}>
        {children}
      </div>
    </div>
  )
}
