import { Link } from '@tanstack/react-router'
import { usePromptsQuery } from '@/hooks/usePromptsQuery'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { CircleHelp } from 'lucide-react'

export function ConfigOverviewRoute() {
  const { data: prompts = [] } = usePromptsQuery()

  const promptsEdited = prompts.some(p => p.isCustom)

  return (
    <TooltipProvider>
      <div className="p-6">
        <h1 className="text-xl font-semibold text-zinc-100 mb-6">Config</h1>
        <div className="grid grid-cols-2 gap-6">
          <Link to="/config/profile" className="border border-zinc-800 rounded-lg p-4 block hover:border-zinc-700 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-zinc-200">Profile</span>
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
                    Your name, contact details, and resume content used as context for all AI features.
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </Link>

          <Link to="/config/sources" className="border border-zinc-800 rounded-lg p-4 block hover:border-zinc-700 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-zinc-200">Sources</span>
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
                    Job search filters and blacklist that drive automated discovery.
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </Link>

          <Link to="/config/connections" className="border border-zinc-800 rounded-lg p-4 block hover:border-zinc-700 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-zinc-200">Connections</span>
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
                    LinkedIn, inbox, and Anthropic API key — your set-once external hookups.
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </Link>

          <Link to="/config/prompts" className="border border-zinc-800 rounded-lg p-4 block hover:border-zinc-700 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-zinc-200">Prompts</span>
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
                    System prompts that control how AI analyzes jobs, writes cover letters, and generates resumes.
                  </TooltipContent>
                </Tooltip>
              </div>
              {promptsEdited
                ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900 text-emerald-400">Edited</span>
                : <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">Default</span>
              }
            </div>
          </Link>

          <Link to="/config/system/logs" className="border border-zinc-800 rounded-lg p-4 block hover:border-zinc-700 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-zinc-200">Logs</span>
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
                    History of automation runs showing timing, token usage, and costs.
                  </TooltipContent>
                </Tooltip>
              </div>
              <span className="text-xs text-zinc-500">View logs →</span>
            </div>
          </Link>
        </div>
      </div>
    </TooltipProvider>
  )
}
