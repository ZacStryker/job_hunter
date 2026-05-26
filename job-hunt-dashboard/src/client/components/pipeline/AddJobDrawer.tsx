import { useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../ui/sheet'
import { Button } from '../ui/button'
import { useAddJobMutation } from '../../hooks/useAddJobMutation'

interface AddJobDrawerProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export function AddJobDrawer({ open, onClose, onSuccess }: AddJobDrawerProps) {
  const [company, setCompany] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [location, setLocation] = useState('')
  const [url, setUrl] = useState('')
  const [description, setDescription] = useState('')
  const mutation = useAddJobMutation()

  const isValid = company.trim().length > 0 && jobTitle.trim().length > 0 && (url.trim().length > 0 || description.trim().length > 0)

  function handleSubmit() {
    mutation.mutate(
      {
        company: company.trim(),
        jobTitle: jobTitle.trim(),
        location: location.trim() || null,
        sourceUrl: url.trim() || null,
        description: description.trim() || null,
      },
      {
        onSuccess: () => {
          setCompany('')
          setJobTitle('')
          setLocation('')
          setUrl('')
          setDescription('')
          onSuccess()
          onClose()
        },
      }
    )
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Add Job</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 mt-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">Company *</span>
            <input
              className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 text-sm"
              value={company}
              onChange={e => setCompany(e.target.value)}
              placeholder="Acme Corp"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">Job Title *</span>
            <input
              className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 text-sm"
              value={jobTitle}
              onChange={e => setJobTitle(e.target.value)}
              placeholder="Senior Software Engineer"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">Location</span>
            <input
              className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 text-sm"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="Remote (optional)"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">URL (optional if description provided)</span>
            <input
              className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 text-sm"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://..."
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">Job Description (optional if URL provided)</span>
            <textarea
              className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 text-sm resize-none"
              rows={6}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Paste the job description here…"
            />
          </label>

          {mutation.isError && (
            <p className="text-xs text-red-400">{mutation.error?.message ?? 'Failed to add job'}</p>
          )}

          <Button
            onClick={handleSubmit}
            disabled={!isValid || mutation.isPending}
            className="mt-2"
          >
            {mutation.isPending ? 'Adding…' : 'Add'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
