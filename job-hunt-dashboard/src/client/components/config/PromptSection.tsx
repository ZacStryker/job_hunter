import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { usePromptMutation } from '@/hooks/usePromptMutation'
import { usePromptResetMutation } from '@/hooks/usePromptResetMutation'
import type { Prompt, PromptFlow } from '@shared/schemas'

const FLOW_LABELS: Record<PromptFlow, string> = {
  analysis: 'Analyze Jobs',
  cover_letter: 'Generate Cover Letter',
  resume: 'Generate Resume',
}

const SYSTEM_PROMPT_PLACEHOLDERS: Record<PromptFlow, string | null> = {
  analysis: null,
  cover_letter: '{{CANDIDATE_PROFILE}}',
  resume: '{{CANDIDATE_PROFILE}}',
}

const USER_MESSAGE_PLACEHOLDERS: Record<PromptFlow, string> = {
  analysis: '{{CANDIDATE_NAME}}, {{CANDIDATE_PROFILE_JSON}}, {{JOB_LISTING_JSON}}',
  cover_letter: '{{JOB_DETAILS}}',
  resume: '{{JOB_DETAILS}}',
}

export function PromptSection({ prompt }: { prompt: Prompt }) {
  const [isEditing, setIsEditing] = useState(false)
  const [draftSystem, setDraftSystem] = useState('')
  const [draftUser, setDraftUser] = useState('')
  const saveMutation = usePromptMutation()
  const resetMutation = usePromptResetMutation()
  const flow = prompt.flow

  function handleEdit() {
    setDraftSystem(prompt.systemPrompt ?? '')
    setDraftUser(prompt.userMessage)
    setIsEditing(true)
  }

  function handleCancel() {
    saveMutation.reset()
    setIsEditing(false)
  }

  function handleSave() {
    saveMutation.mutate(
      { flow, input: { systemPrompt: prompt.systemPrompt !== null ? draftSystem : null, userMessage: draftUser } },
      { onSuccess: () => setIsEditing(false) }
    )
  }

  function handleReset() {
    resetMutation.mutate(flow)
  }

  const isBusy = saveMutation.isPending || resetMutation.isPending

  return (
    <section className="border border-zinc-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-zinc-100">{FLOW_LABELS[flow]}</h2>
          {prompt.isCustom && (
            <span className="text-xs bg-zinc-700 text-zinc-300 px-2 py-0.5 rounded">Edited</span>
          )}
        </div>
        <div className="flex gap-2">
          {prompt.isCustom && !isEditing && (
            <Button variant="ghost" size="sm" onClick={handleReset} disabled={isBusy}>
              {resetMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reset to defaults'}
            </Button>
          )}
          {!isEditing && (
            <Button variant="outline" size="sm" onClick={handleEdit}>Edit</Button>
          )}
          {isEditing && (
            <>
              <Button variant="outline" size="sm" onClick={handleCancel} disabled={isBusy}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={isBusy}>
                {saveMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Save'}
              </Button>
            </>
          )}
        </div>
      </div>

      {saveMutation.isError && (
        <p className="text-sm text-red-400 mb-3">Failed to save: {saveMutation.error?.message}</p>
      )}

      <div className="space-y-4">
        {prompt.systemPrompt !== null && (
          <div>
            <label className="block text-xs text-zinc-400 mb-1">
              System Prompt
              {SYSTEM_PROMPT_PLACEHOLDERS[flow] && (
                <span className="ml-2 text-zinc-500">Placeholders: {SYSTEM_PROMPT_PLACEHOLDERS[flow]}</span>
              )}
            </label>
            {isEditing ? (
              <Textarea
                value={draftSystem}
                onChange={(e) => setDraftSystem(e.target.value)}
                rows={8}
                className="bg-zinc-900 border-zinc-700 font-mono text-sm"
              />
            ) : (
              <pre className="whitespace-pre-wrap text-sm text-zinc-100 font-mono bg-zinc-900 border border-zinc-800 rounded p-3">
                {prompt.systemPrompt}
              </pre>
            )}
          </div>
        )}
        <div>
          <label className="block text-xs text-zinc-400 mb-1">
            User Message
            <span className="ml-2 text-zinc-500">Placeholders: {USER_MESSAGE_PLACEHOLDERS[flow]}</span>
          </label>
          {isEditing ? (
            <Textarea
              value={draftUser}
              onChange={(e) => setDraftUser(e.target.value)}
              rows={10}
              className="bg-zinc-900 border-zinc-700 font-mono text-sm"
            />
          ) : (
            <pre className="whitespace-pre-wrap text-sm text-zinc-100 font-mono bg-zinc-900 border border-zinc-800 rounded p-3">
              {prompt.userMessage}
            </pre>
          )}
        </div>
      </div>
    </section>
  )
}
