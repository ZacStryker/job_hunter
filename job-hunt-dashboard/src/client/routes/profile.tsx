import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useProfileQuery } from '@/hooks/useProfileQuery'
import { useProfileMutation } from '@/hooks/useProfileMutation'
import type { ProfileInput } from '@shared/schemas'

const EMPTY_DRAFT: ProfileInput = {
  name: '',
  email: '',
  phone: '',
  location: '',
  linkedinUrl: '',
  githubUrl: '',
  summary: '',
  experience: '',
  skills: '',
  education: '',
}

function nullToEmpty(value: string | null | undefined): string {
  return value ?? ''
}

export function ProfileRoute() {
  const { data, isLoading, isError } = useProfileQuery()
  const mutation = useProfileMutation()
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState<ProfileInput | null>(null)

  if (isLoading) return <div className="max-w-3xl mx-auto p-6 text-zinc-400">Loading…</div>
  if (isError) return <div className="max-w-3xl mx-auto p-6 text-red-400">Failed to load profile.</div>

  function handleEdit() {
    if (!data) return
    setDraft({
      name: nullToEmpty(data?.name),
      email: nullToEmpty(data?.email),
      phone: nullToEmpty(data?.phone),
      location: nullToEmpty(data?.location),
      linkedinUrl: nullToEmpty(data?.linkedinUrl),
      githubUrl: nullToEmpty(data?.githubUrl),
      summary: nullToEmpty(data?.summary),
      experience: nullToEmpty(data?.experience),
      skills: nullToEmpty(data?.skills),
      education: nullToEmpty(data?.education),
    })
    setIsEditing(true)
  }

  function handleCancel() {
    setDraft(null)
    setIsEditing(false)
  }

  function handleSave() {
    if (!draft) return
    const input: ProfileInput = {
      name: draft.name || null,
      email: draft.email || null,
      phone: draft.phone || null,
      location: draft.location || null,
      linkedinUrl: draft.linkedinUrl || null,
      githubUrl: draft.githubUrl || null,
      summary: draft.summary || null,
      experience: draft.experience || null,
      skills: draft.skills || null,
      education: draft.education || null,
    }
    mutation.mutate(input, {
      onSuccess: () => {
        setDraft(null)
        setIsEditing(false)
      },
    })
  }

  function setField(field: keyof ProfileInput, value: string) {
    setDraft((prev) => (prev ? { ...prev, [field]: value } : prev))
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-zinc-100">Profile</h1>
        {!isEditing && (
          <Button variant="outline" size="sm" onClick={handleEdit}>
            Edit
          </Button>
        )}
        {isEditing && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={mutation.isPending}>
              {mutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                'Save'
              )}
            </Button>
          </div>
        )}
      </div>

      {mutation.isError && (
        <p className="text-sm text-red-400 mt-2">
          Failed to save: {mutation.error?.message ?? 'Unknown error'}
        </p>
      )}

      <div className="space-y-6">
        {/* Short fields — 2-column grid */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Full Name</label>
            {isEditing && draft ? (
              <Input
                value={draft.name ?? ''}
                onChange={(e) => setField('name', e.target.value)}
                className="bg-zinc-900 border-zinc-700"
              />
            ) : (
              <p className="text-sm text-zinc-100">{data?.name ?? '—'}</p>
            )}
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">Email</label>
            {isEditing && draft ? (
              <Input
                value={draft.email ?? ''}
                onChange={(e) => setField('email', e.target.value)}
                className="bg-zinc-900 border-zinc-700"
              />
            ) : (
              <p className="text-sm text-zinc-100">{data?.email ?? '—'}</p>
            )}
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">Phone</label>
            {isEditing && draft ? (
              <Input
                value={draft.phone ?? ''}
                onChange={(e) => setField('phone', e.target.value)}
                className="bg-zinc-900 border-zinc-700"
              />
            ) : (
              <p className="text-sm text-zinc-100">{data?.phone ?? '—'}</p>
            )}
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">Location</label>
            {isEditing && draft ? (
              <Input
                value={draft.location ?? ''}
                onChange={(e) => setField('location', e.target.value)}
                className="bg-zinc-900 border-zinc-700"
              />
            ) : (
              <p className="text-sm text-zinc-100">{data?.location ?? '—'}</p>
            )}
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">LinkedIn URL</label>
            {isEditing && draft ? (
              <Input
                value={draft.linkedinUrl ?? ''}
                onChange={(e) => setField('linkedinUrl', e.target.value)}
                className="bg-zinc-900 border-zinc-700"
              />
            ) : (
              <p className="text-sm text-zinc-100">{data?.linkedinUrl ?? '—'}</p>
            )}
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">GitHub / Portfolio URL</label>
            {isEditing && draft ? (
              <Input
                value={draft.githubUrl ?? ''}
                onChange={(e) => setField('githubUrl', e.target.value)}
                className="bg-zinc-900 border-zinc-700"
              />
            ) : (
              <p className="text-sm text-zinc-100">{data?.githubUrl ?? '—'}</p>
            )}
          </div>
        </div>

        {/* Textarea fields — full width */}
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Summary</label>
          {isEditing && draft ? (
            <Textarea
              value={draft.summary ?? ''}
              onChange={(e) => setField('summary', e.target.value)}
              rows={4}
              className="bg-zinc-900 border-zinc-700"
            />
          ) : (
            <pre className="whitespace-pre-wrap text-sm text-zinc-100 font-sans">
              {data?.summary ?? '—'}
            </pre>
          )}
        </div>

        <div>
          <label className="block text-xs text-zinc-400 mb-1">Experience</label>
          {isEditing && draft ? (
            <Textarea
              value={draft.experience ?? ''}
              onChange={(e) => setField('experience', e.target.value)}
              rows={6}
              className="bg-zinc-900 border-zinc-700"
            />
          ) : (
            <pre className="whitespace-pre-wrap text-sm text-zinc-100 font-sans">
              {data?.experience ?? '—'}
            </pre>
          )}
        </div>

        <div>
          <label className="block text-xs text-zinc-400 mb-1">Skills</label>
          {isEditing && draft ? (
            <Textarea
              value={draft.skills ?? ''}
              onChange={(e) => setField('skills', e.target.value)}
              rows={3}
              className="bg-zinc-900 border-zinc-700"
            />
          ) : (
            <pre className="whitespace-pre-wrap text-sm text-zinc-100 font-sans">
              {data?.skills ?? '—'}
            </pre>
          )}
        </div>

        <div>
          <label className="block text-xs text-zinc-400 mb-1">Education</label>
          {isEditing && draft ? (
            <Textarea
              value={draft.education ?? ''}
              onChange={(e) => setField('education', e.target.value)}
              rows={3}
              className="bg-zinc-900 border-zinc-700"
            />
          ) : (
            <pre className="whitespace-pre-wrap text-sm text-zinc-100 font-sans">
              {data?.education ?? '—'}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}
