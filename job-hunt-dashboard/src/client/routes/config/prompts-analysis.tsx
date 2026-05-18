import { usePromptsQuery } from '@/hooks/usePromptsQuery'
import { PromptSection } from '@/components/config/PromptSection'

export function PromptsAnalysisRoute() {
  const { data: prompts = [] } = usePromptsQuery()
  const prompt = prompts.find(p => p.flow === 'analysis')

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-zinc-100 mb-6">Analysis</h1>
      {prompt && <PromptSection prompt={prompt} />}
    </div>
  )
}
