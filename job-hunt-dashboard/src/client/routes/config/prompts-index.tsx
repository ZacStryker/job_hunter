import { Link } from '@tanstack/react-router'
import { usePromptsQuery } from '@/hooks/usePromptsQuery'

export function ConfigPromptsIndexRoute() {
  const { data: prompts = [] } = usePromptsQuery()

  const analysisEdited = prompts.find(p => p.flow === 'analysis')?.isCustom ?? false
  const coverLetterEdited = prompts.find(p => p.flow === 'cover_letter')?.isCustom ?? false
  const resumeEdited = prompts.find(p => p.flow === 'resume')?.isCustom ?? false

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-zinc-100 mb-6">Prompts</h1>
      <div className="grid grid-cols-2 gap-4">
        <Link to="/config/prompts/analysis" className="border border-zinc-800 rounded-lg p-4 block hover:border-zinc-700 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-200">Analysis</span>
            {analysisEdited
              ? <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-300">Edited</span>
              : <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">Default</span>
            }
          </div>
        </Link>
        <Link to="/config/prompts/cover-letter" className="border border-zinc-800 rounded-lg p-4 block hover:border-zinc-700 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-200">Cover Letter</span>
            {coverLetterEdited
              ? <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-300">Edited</span>
              : <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">Default</span>
            }
          </div>
        </Link>
        <Link to="/config/prompts/resume" className="border border-zinc-800 rounded-lg p-4 block hover:border-zinc-700 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-200">Resume</span>
            {resumeEdited
              ? <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-300">Edited</span>
              : <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">Default</span>
            }
          </div>
        </Link>
      </div>
    </div>
  )
}
