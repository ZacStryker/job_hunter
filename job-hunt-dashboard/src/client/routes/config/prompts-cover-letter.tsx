import { usePromptsQuery } from '@/hooks/usePromptsQuery'
import { PromptSection } from '@/components/config/PromptSection'

export function PromptsCoverLetterRoute() {
  const { data: prompts = [] } = usePromptsQuery()
  const prompt = prompts.find(p => p.flow === 'cover_letter')

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-zinc-100 mb-6">Generate Cover Letter</h1>
      {prompt && <PromptSection prompt={prompt} />}
    </div>
  )
}
