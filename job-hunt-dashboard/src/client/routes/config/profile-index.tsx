import { Link } from '@tanstack/react-router'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { CircleHelp } from 'lucide-react'

export function ConfigProfileIndexRoute() {
  return (
    <TooltipProvider>
      <div className="p-6">
        <h1 className="text-xl font-semibold text-zinc-100 mb-6">Profile</h1>
        <div className="grid grid-cols-2 gap-6">
          <Link to="/config/profile/resume" className="border border-zinc-800 rounded-lg p-4 block hover:border-zinc-700 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-zinc-200">Candidate Info</span>
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
                    Your personal details and resume content used as context for all AI-generated documents.
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
