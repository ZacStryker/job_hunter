import { Link } from '@tanstack/react-router'
import { usePromptsQuery } from '@/hooks/usePromptsQuery'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { CircleHelp } from 'lucide-react'

export function ConfigPromptsIndexRoute() {
  const { data: prompts = [] } = usePromptsQuery()

  const analysisEdited = prompts.find(p => p.flow === 'analysis')?.isCustom ?? false
  const coverLetterEdited = prompts.find(p => p.flow === 'cover_letter')?.isCustom ?? false
  const resumeEdited = prompts.find(p => p.flow === 'resume')?.isCustom ?? false

  return (
    <TooltipProvider>
      <div className="p-6">
        <h1 className="text-xl font-semibold text-zinc-100 mb-6">Prompts</h1>
        <div className="grid grid-cols-2 gap-4">
          <Link to="/config/prompts/analysis" className="border border-zinc-800 rounded-lg p-4 block hover:border-zinc-700 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-zinc-200">Analyze Jobs</span>
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
                    The prompt used to score and evaluate incoming job listings against your candidate profile.
                  </TooltipContent>
                </Tooltip>
              </div>
              {analysisEdited
                ? <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-300">Edited</span>
                : <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">Default</span>
              }
            </div>
          </Link>
          <Link to="/config/prompts/cover-letter" className="border border-zinc-800 rounded-lg p-4 block hover:border-zinc-700 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-zinc-200">Generate Cover Letter</span>
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
                    The prompt template for generating personalized cover letters tailored to each job.
                  </TooltipContent>
                </Tooltip>
              </div>
              {coverLetterEdited
                ? <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-300">Edited</span>
                : <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">Default</span>
              }
            </div>
          </Link>
          <Link to="/config/prompts/resume" className="border border-zinc-800 rounded-lg p-4 block hover:border-zinc-700 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-zinc-200">Generate Resume</span>
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
                    The prompt used to adapt your resume content to match a specific job description.
                  </TooltipContent>
                </Tooltip>
              </div>
              {resumeEdited
                ? <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-300">Edited</span>
                : <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">Default</span>
              }
            </div>
          </Link>
        </div>
      </div>
    </TooltipProvider>
  )
}
