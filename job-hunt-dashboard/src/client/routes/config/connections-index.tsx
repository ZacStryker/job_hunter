import { Link } from '@tanstack/react-router'
import { useFeatureSettingsQuery } from '@/hooks/useFeatureSettingsQuery'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { CircleHelp } from 'lucide-react'

export function ConfigConnectionsIndexRoute() {
  const { data: featureSettings } = useFeatureSettingsQuery()

  const emailFeatures = !!featureSettings?.emailFeatures

  return (
    <TooltipProvider>
      <div className="p-6">
        <h1 className="text-xl font-semibold text-zinc-100 mb-6">Connections</h1>
        <div className="grid grid-cols-2 gap-4">
          <Link to="/config/connections/linkedin" className="border border-zinc-800 rounded-lg p-4 block hover:border-zinc-700 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-zinc-200">LinkedIn</span>
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
                    Your LinkedIn session authentication that allows the scraper to discover job listings.
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </Link>

          {emailFeatures && (
            <Link to="/config/connections/inbox" className="border border-zinc-800 rounded-lg p-4 block hover:border-zinc-700 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-zinc-200">Inbox</span>
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
                      IMAP credentials and folder rules for automatic email-based application status tracking.
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </Link>
          )}

          <Link to="/config/connections/api-key" className="border border-zinc-800 rounded-lg p-4 block hover:border-zinc-700 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-zinc-200">API Key</span>
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
                    Your Anthropic API key, required to enable all AI analysis and generation features.
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
