import { useState } from 'react'
import { Link, useNavigate, type LinkProps } from '@tanstack/react-router'
import { User, LogOut } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { useSessionQuery } from '@/hooks/useSessionQuery'
import { useProfileQuery } from '@/hooks/useProfileQuery'
import { queryClient } from '@/lib/query-client'

export function initials(name?: string | null, email?: string | null): string {
  const trimmed = name?.trim()
  if (trimmed) {
    const words = trimmed.split(/\s+/)
    return words.slice(0, 2).map((w) => [...w][0]!).join('').toUpperCase()
  }
  const trimmedEmail = email?.trim()
  if (trimmedEmail) return [...trimmedEmail][0]!.toUpperCase()
  return ''
}

export const JUMP_LINKS: { label: string; to: LinkProps['to'] }[] = [
  { label: 'Profile', to: '/config/profile' },
  { label: 'Sources', to: '/config/sources' },
  { label: 'Connections', to: '/config/connections' },
  { label: 'Prompts', to: '/config/prompts' },
  { label: 'Logs', to: '/config/system/logs' },
]

export function UserMenu() {
  const { data: session } = useSessionQuery()
  const { data: profile } = useProfileQuery()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  async function handleLogout() {
    try {
      await fetch('/auth/logout', { method: 'POST' })
    } catch {
      // sign out locally regardless of network/server error
    }
    queryClient.clear()
    await navigate({ to: '/login' })
  }

  const email = session?.email || profile?.personal.email
  const displayName = profile?.personal.fullName || email
  const glyph = initials(profile?.personal.fullName, email)

  const avatar = glyph ? (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-zinc-700 text-[10px] font-medium text-zinc-100">
      {glyph}
    </span>
  ) : (
    <User className="h-5 w-5" />
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          title="Account menu"
          className="shrink-0 text-zinc-500 hover:text-zinc-200 transition-colors"
        >
          {avatar}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            {avatar}
            <div className="min-w-0 flex-1">
              <p className="text-zinc-100 text-sm font-medium truncate">{displayName}</p>
              {email && <p className="text-zinc-400 text-xs truncate">{email}</p>}
            </div>
          </div>
          <ul className="flex flex-col">
            {JUMP_LINKS.map((item) => (
              <li key={item.label}>
                <Link
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className="block rounded px-2 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 transition-colors"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="border-t border-zinc-800 pt-2">
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              Log out
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
