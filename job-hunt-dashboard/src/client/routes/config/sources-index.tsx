import { Link } from '@tanstack/react-router'
import { useSearchConfigsQuery } from '@/hooks/useSearchConfigsQuery'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { CircleHelp } from 'lucide-react'

export function ConfigSourcesIndexRoute() {
  const { data: searchConfigs = [] } = useSearchConfigsQuery()

  const searchesConfigured = searchConfigs.length > 0

  return (
    <TooltipProvider>
      <div className="p-6">
        <h1 className="text-xl font-semibold text-zinc-100 mb-6">Sources</h1>
        <div className="grid grid-cols-2 gap-4">
          <Link to="/config/sources/searches" className="border border-zinc-800 rounded-lg p-4 block hover:border-zinc-700 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-zinc-200">Searches</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="What is this?"
                      onClick={e => { e.preventDefault(); e.stopPropagation() }}
                      className="text-zinc-600 hover:text-zinc-400 transition-colors"
                    >
                      <CircleHelp className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-xs">
                    Job title and location targets that drive automated LinkedIn job discovery runs.
                  </TooltipContent>
                </Tooltip>
              </div>
              {searchesConfigured
                ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900 text-emerald-400">Configured</span>
                : <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">Incomplete</span>
              }
            </div>
          </Link>
          <Link to="/config/sources/blacklist" className="border border-zinc-800 rounded-lg p-4 block hover:border-zinc-700 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-zinc-200">Blacklist</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="What is this?"
                      onClick={e => { e.preventDefault(); e.stopPropagation() }}
                      className="text-zinc-600 hover:text-zinc-400 transition-colors"
                    >
                      <CircleHelp className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-xs">
                    Companies blocked from appearing in discovery results.
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </TooltipProvider>
  )
}
