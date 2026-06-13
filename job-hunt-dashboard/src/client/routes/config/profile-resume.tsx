import { useState } from 'react'
import { ChevronDown, ChevronUp, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { useProfileQuery } from '@/hooks/useProfileQuery'
import { useProfileMutation } from '@/hooks/useProfileMutation'
import type { z } from 'zod'
import type { ProfileData, jobEntrySchema, educationEntrySchema, degreeEntrySchema, projectEntrySchema, certEntrySchema } from '@shared/schemas'

type JobEntry = z.infer<typeof jobEntrySchema>
type EducationEntry = z.infer<typeof educationEntrySchema>
type DegreeEntry = z.infer<typeof degreeEntrySchema>
type ProjectEntry = z.infer<typeof projectEntrySchema>
type CertEntry = z.infer<typeof certEntrySchema>

function formatJobDate(yyyyMm: string | null | undefined, isCurrent: boolean): string {
  if (isCurrent) return 'Present'
  if (!yyyyMm) return '?'
  const parts = yyyyMm.split('-')
  if (parts.length < 2) return yyyyMm
  return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1)
    .toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

const EXPERIENCE_SECTIONS = [
  { key: 'jobs', label: 'Jobs', addLabel: 'Add Job' },
  { key: 'education', label: 'Education', addLabel: 'Add Education' },
  { key: 'projects', label: 'Projects', addLabel: 'Add Project' },
  { key: 'certifications', label: 'Certifications', addLabel: 'Add Certification' },
  { key: 'licences', label: 'Licenses', addLabel: 'Add License' },
  { key: 'awards', label: 'Awards', addLabel: 'Add Award' },
] as const

export function ProfileResumeRoute() {
  const { data: profileData } = useProfileQuery()

  if (!profileData) {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  return <ProfileResumeForm profileData={profileData} />
}

function ProfileResumeForm({ profileData }: { profileData: ProfileData }) {
  const [fullName, setFullName] = useState(profileData.personal.fullName)
  const [email, setEmail] = useState(profileData.personal.email)
  const [phone, setPhone] = useState(profileData.personal.phone ?? '')
  const [location, setLocation] = useState(profileData.personal.location ?? '')
  const [summary, setSummary] = useState(profileData.personal.summary ?? '')
  const [skills, setSkills] = useState(profileData.personal.skills ?? '')
  const [websites, setWebsites] = useState(profileData.personal.websites)

  const [showAddWebsite, setShowAddWebsite] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newUrl, setNewUrl] = useState('')

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      EXPERIENCE_SECTIONS.map(({ key }) => [key, profileData.experience[key].length > 0])
    )
  )

  const [editingSection, setEditingSection] = useState<'personal' | 'summary' | 'skills' | null>(null)
  const personalEditing = editingSection === 'personal'
  const summaryEditing = editingSection === 'summary'
  const skillsEditing = editingSection === 'skills'

  const [showAddJob, setShowAddJob] = useState(false)
  const [expandedJobIdx, setExpandedJobIdx] = useState<number | null>(null)
  const [jobEditingIdx, setJobEditingIdx] = useState<number | null>(null)

  const [showAddEdu, setShowAddEdu] = useState(false)
  const [expandedEduIdx, setExpandedEduIdx] = useState<number | null>(null)
  const [editingEduIdx, setEditingEduIdx] = useState<number | null>(null)

  const [showAddProject, setShowAddProject] = useState(false)
  const [expandedProjectIdx, setExpandedProjectIdx] = useState<number | null>(null)
  const [editingProjectIdx, setEditingProjectIdx] = useState<number | null>(null)

  const [showAddCert, setShowAddCert] = useState(false)
  const [expandedCertIdx, setExpandedCertIdx] = useState<number | null>(null)
  const [editingCertIdx, setEditingCertIdx] = useState<number | null>(null)

  const [showAddLicence, setShowAddLicence] = useState(false)
  const [expandedLicenceIdx, setExpandedLicenceIdx] = useState<number | null>(null)
  const [editingLicenceIdx, setEditingLicenceIdx] = useState<number | null>(null)

  const [showAddAward, setShowAddAward] = useState(false)
  const [expandedAwardIdx, setExpandedAwardIdx] = useState<number | null>(null)
  const [editingAwardIdx, setEditingAwardIdx] = useState<number | null>(null)

  const { data: liveProfile } = useProfileQuery()
  const mutation = useProfileMutation()

  function getExperience() {
    return (liveProfile ?? profileData).experience
  }

  function buildPersonal(updatedWebsites = websites) {
    return {
      fullName,
      email,
      phone: phone || null,
      location: location || null,
      summary: summary || null,
      skills: skills || null,
      websites: updatedWebsites,
    }
  }

  function handleSavePersonal() {
    if (!fullName.trim()) { toast.error('Full name is required'); return }
    if (!email.trim()) { toast.error('Email is required'); return }
    mutation.mutate(
      { personal: buildPersonal(), experience: getExperience() },
      {
        onSuccess: () => { toast.success('Personal info saved'); setEditingSection(null) },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleCancelPersonal() {
    const p = (liveProfile ?? profileData).personal
    setFullName(p.fullName)
    setEmail(p.email)
    setPhone(p.phone ?? '')
    setLocation(p.location ?? '')
    setEditingSection(null)
  }

  function handleSaveSummary() {
    mutation.mutate(
      { personal: buildPersonal(), experience: getExperience() },
      {
        onSuccess: () => { toast.success('Summary saved'); setEditingSection(null) },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleCancelSummary() {
    setSummary((liveProfile ?? profileData).personal.summary ?? '')
    setEditingSection(null)
  }

  function handleSaveSkills() {
    mutation.mutate(
      { personal: buildPersonal(), experience: getExperience() },
      {
        onSuccess: () => { toast.success('Skills saved'); setEditingSection(null) },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleCancelSkills() {
    setSkills((liveProfile ?? profileData).personal.skills ?? '')
    setEditingSection(null)
  }

  function handleDeleteWebsite(idx: number) {
    const previous = websites
    const updated = websites.filter((_, i) => i !== idx)
    setWebsites(updated)
    mutation.mutate(
      { personal: buildPersonal(updated), experience: getExperience() },
      {
        onSuccess: () => toast.success('Website removed'),
        onError: (err) => { setWebsites(previous); toast.error(err.message) },
      }
    )
  }

  function handleAddWebsite() {
    const previous = websites
    const updated = [...websites, { label: newLabel.trim(), url: newUrl.trim() }]
    setWebsites(updated)
    mutation.mutate(
      { personal: buildPersonal(updated), experience: getExperience() },
      {
        onSuccess: () => {
          toast.success('Website added')
          setNewLabel('')
          setNewUrl('')
          setShowAddWebsite(false)
        },
        onError: (err) => { setWebsites(previous); toast.error(err.message) },
      }
    )
  }

  function handleAddJob(entry: JobEntry) {
    const exp = getExperience()
    const updated = { ...exp, jobs: [...exp.jobs, entry] }
    mutation.mutate(
      { personal: buildPersonal(), experience: updated },
      {
        onSuccess: () => { toast.success('Job added'); setShowAddJob(false) },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleSaveJobEntry(idx: number, entry: JobEntry) {
    const exp = getExperience()
    const updated = { ...exp, jobs: exp.jobs.map((j, i) => i === idx ? entry : j) }
    mutation.mutate(
      { personal: buildPersonal(), experience: updated },
      {
        onSuccess: () => { toast.success('Job updated'); setJobEditingIdx(null) },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleDeleteJob(idx: number) {
    const exp = getExperience()
    const job = exp.jobs[idx]
    if (!job) return
    if (job.bullets.length >= 2 && !window.confirm('Remove this job entry?')) return
    if (expandedJobIdx === idx) setExpandedJobIdx(null)
    if (jobEditingIdx === idx) setJobEditingIdx(null)
    const updated = { ...exp, jobs: exp.jobs.filter((_, i) => i !== idx) }
    mutation.mutate(
      { personal: buildPersonal(), experience: updated },
      {
        onSuccess: () => toast.success('Job removed'),
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleAddEducation(entry: EducationEntry) {
    const exp = getExperience()
    const updated = { ...exp, education: [...exp.education, entry] }
    mutation.mutate(
      { personal: buildPersonal(), experience: updated },
      {
        onSuccess: () => { toast.success('Education added'); setShowAddEdu(false) },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleSaveEduEntry(idx: number, entry: EducationEntry) {
    const exp = getExperience()
    const updated = { ...exp, education: exp.education.map((e, i) => i === idx ? entry : e) }
    mutation.mutate(
      { personal: buildPersonal(), experience: updated },
      {
        onSuccess: () => { toast.success('Education updated'); setEditingEduIdx(null) },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleDeleteEducation(idx: number) {
    const exp = getExperience()
    if (expandedEduIdx === idx) setExpandedEduIdx(null)
    else if (expandedEduIdx !== null && expandedEduIdx > idx) setExpandedEduIdx(expandedEduIdx - 1)
    if (editingEduIdx === idx) setEditingEduIdx(null)
    else if (editingEduIdx !== null && editingEduIdx > idx) setEditingEduIdx(editingEduIdx - 1)
    const updated = { ...exp, education: exp.education.filter((_, i) => i !== idx) }
    mutation.mutate(
      { personal: buildPersonal(), experience: updated },
      {
        onSuccess: () => toast.success('Education removed'),
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleAddProject(entry: ProjectEntry) {
    const exp = getExperience()
    const updated = { ...exp, projects: [...exp.projects, entry] }
    mutation.mutate(
      { personal: buildPersonal(), experience: updated },
      {
        onSuccess: () => { toast.success('Project added'); setShowAddProject(false) },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleSaveProjectEntry(idx: number, entry: ProjectEntry) {
    const exp = getExperience()
    const updated = { ...exp, projects: exp.projects.map((p, i) => i === idx ? entry : p) }
    mutation.mutate(
      { personal: buildPersonal(), experience: updated },
      {
        onSuccess: () => { toast.success('Project updated'); setEditingProjectIdx(null) },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleDeleteProject(idx: number) {
    const exp = getExperience()
    if (expandedProjectIdx === idx) setExpandedProjectIdx(null)
    else if (expandedProjectIdx !== null && expandedProjectIdx > idx) setExpandedProjectIdx(expandedProjectIdx - 1)
    if (editingProjectIdx === idx) setEditingProjectIdx(null)
    else if (editingProjectIdx !== null && editingProjectIdx > idx) setEditingProjectIdx(editingProjectIdx - 1)
    const updated = { ...exp, projects: exp.projects.filter((_, i) => i !== idx) }
    mutation.mutate(
      { personal: buildPersonal(), experience: updated },
      {
        onSuccess: () => toast.success('Project removed'),
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleAddCert(entry: CertEntry) {
    const exp = getExperience()
    const updated = { ...exp, certifications: [...exp.certifications, entry] }
    mutation.mutate(
      { personal: buildPersonal(), experience: updated },
      {
        onSuccess: () => { toast.success('Certification added'); setShowAddCert(false) },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleSaveCertEntry(idx: number, entry: CertEntry) {
    const exp = getExperience()
    const updated = { ...exp, certifications: exp.certifications.map((c, i) => i === idx ? entry : c) }
    mutation.mutate(
      { personal: buildPersonal(), experience: updated },
      {
        onSuccess: () => { toast.success('Certification updated'); setEditingCertIdx(null) },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleDeleteCert(idx: number) {
    const exp = getExperience()
    if (expandedCertIdx === idx) setExpandedCertIdx(null)
    else if (expandedCertIdx !== null && expandedCertIdx > idx) setExpandedCertIdx(expandedCertIdx - 1)
    if (editingCertIdx === idx) setEditingCertIdx(null)
    else if (editingCertIdx !== null && editingCertIdx > idx) setEditingCertIdx(editingCertIdx - 1)
    const updated = { ...exp, certifications: exp.certifications.filter((_, i) => i !== idx) }
    mutation.mutate(
      { personal: buildPersonal(), experience: updated },
      {
        onSuccess: () => toast.success('Certification removed'),
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleAddLicence(entry: CertEntry) {
    const exp = getExperience()
    const updated = { ...exp, licences: [...exp.licences, entry] }
    mutation.mutate(
      { personal: buildPersonal(), experience: updated },
      {
        onSuccess: () => { toast.success('License added'); setShowAddLicence(false) },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleSaveLicenceEntry(idx: number, entry: CertEntry) {
    const exp = getExperience()
    const updated = { ...exp, licences: exp.licences.map((l, i) => i === idx ? entry : l) }
    mutation.mutate(
      { personal: buildPersonal(), experience: updated },
      {
        onSuccess: () => { toast.success('License updated'); setEditingLicenceIdx(null) },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleDeleteLicence(idx: number) {
    const exp = getExperience()
    if (expandedLicenceIdx === idx) setExpandedLicenceIdx(null)
    else if (expandedLicenceIdx !== null && expandedLicenceIdx > idx) setExpandedLicenceIdx(expandedLicenceIdx - 1)
    if (editingLicenceIdx === idx) setEditingLicenceIdx(null)
    else if (editingLicenceIdx !== null && editingLicenceIdx > idx) setEditingLicenceIdx(editingLicenceIdx - 1)
    const updated = { ...exp, licences: exp.licences.filter((_, i) => i !== idx) }
    mutation.mutate(
      { personal: buildPersonal(), experience: updated },
      {
        onSuccess: () => toast.success('License removed'),
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleAddAward(entry: CertEntry) {
    const exp = getExperience()
    const updated = { ...exp, awards: [...exp.awards, entry] }
    mutation.mutate(
      { personal: buildPersonal(), experience: updated },
      {
        onSuccess: () => { toast.success('Award added'); setShowAddAward(false) },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleSaveAwardEntry(idx: number, entry: CertEntry) {
    const exp = getExperience()
    const updated = { ...exp, awards: exp.awards.map((a, i) => i === idx ? entry : a) }
    mutation.mutate(
      { personal: buildPersonal(), experience: updated },
      {
        onSuccess: () => { toast.success('Award updated'); setEditingAwardIdx(null) },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleDeleteAward(idx: number) {
    const exp = getExperience()
    if (expandedAwardIdx === idx) setExpandedAwardIdx(null)
    else if (expandedAwardIdx !== null && expandedAwardIdx > idx) setExpandedAwardIdx(expandedAwardIdx - 1)
    if (editingAwardIdx === idx) setEditingAwardIdx(null)
    else if (editingAwardIdx !== null && editingAwardIdx > idx) setEditingAwardIdx(editingAwardIdx - 1)
    const updated = { ...exp, awards: exp.awards.filter((_, i) => i !== idx) }
    mutation.mutate(
      { personal: buildPersonal(), experience: updated },
      {
        onSuccess: () => toast.success('Award removed'),
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function toggleSection(key: string) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const liveExp = (liveProfile ?? profileData).experience

  const sortedJobs = [...liveExp.jobs]
    .map((job, originalIdx) => ({ job, originalIdx }))
    .sort((a, b) => {
      if (a.job.current && !b.job.current) return -1
      if (!a.job.current && b.job.current) return 1
      const aEnd = a.job.current ? a.job.startDate : (a.job.endDate ?? '')
      const bEnd = b.job.current ? b.job.startDate : (b.job.endDate ?? '')
      return bEnd.localeCompare(aEnd)
    })

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Personal section */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-medium text-zinc-200">Personal</span>
          {personalEditing ? (
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSavePersonal} disabled={mutation.isPending}>
                {mutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Save'}
              </Button>
              <Button size="sm" variant="ghost" onClick={handleCancelPersonal}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setEditingSection('personal')}>
              Edit
            </Button>
          )}
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Full Name</label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                readOnly={!personalEditing}
                className={personalEditing ? 'bg-zinc-900 border-zinc-700' : 'bg-transparent border-zinc-800 cursor-default'}
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Email</label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                readOnly={!personalEditing}
                className={personalEditing ? 'bg-zinc-900 border-zinc-700' : 'bg-transparent border-zinc-800 cursor-default'}
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Phone</label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                readOnly={!personalEditing}
                className={personalEditing ? 'bg-zinc-900 border-zinc-700' : 'bg-transparent border-zinc-800 cursor-default'}
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Location</label>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                readOnly={!personalEditing}
                className={personalEditing ? 'bg-zinc-900 border-zinc-700' : 'bg-transparent border-zinc-800 cursor-default'}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-2">Websites</label>
            {websites.length > 0 && (
              <div className="space-y-2 mb-2">
                {websites.map((site, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-sm text-zinc-300 flex-1 min-w-0">
                      <span className="font-medium">{site.label}</span>
                      <span className="text-zinc-500 mx-1">—</span>
                      <span className="text-zinc-400">{site.url}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteWebsite(idx)}
                      disabled={mutation.isPending}
                      className="text-zinc-500 hover:text-red-400 transition-colors shrink-0 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {showAddWebsite && (
              <div className="flex items-center gap-2 mb-2">
                <Input
                  placeholder="Label"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  className="bg-zinc-900 border-zinc-700 flex-1"
                />
                <Input
                  placeholder="URL"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  className="bg-zinc-900 border-zinc-700 flex-1"
                />
                <Button
                  size="sm"
                  onClick={handleAddWebsite}
                  disabled={mutation.isPending || !newLabel.trim() || !newUrl.trim()}
                >
                  Add
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowAddWebsite(false)
                    setNewLabel('')
                    setNewUrl('')
                  }}
                >
                  Cancel
                </Button>
              </div>
            )}

            {!showAddWebsite && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowAddWebsite(true)}
                disabled={mutation.isPending}
              >
                Add Website
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Summary section */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-medium text-zinc-200">Summary</span>
          {summaryEditing ? (
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSaveSummary} disabled={mutation.isPending}>
                {mutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Save'}
              </Button>
              <Button size="sm" variant="ghost" onClick={handleCancelSummary}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setEditingSection('summary')}>
              Edit
            </Button>
          )}
        </div>
        <Textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={4}
          readOnly={!summaryEditing}
          className={summaryEditing ? 'bg-zinc-900 border-zinc-700' : 'bg-transparent border-zinc-800 cursor-default resize-none'}
        />
      </div>

      {/* Skills section */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-medium text-zinc-200">Skills</span>
          {skillsEditing ? (
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSaveSkills} disabled={mutation.isPending}>
                {mutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Save'}
              </Button>
              <Button size="sm" variant="ghost" onClick={handleCancelSkills}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setEditingSection('skills')}>
              Edit
            </Button>
          )}
        </div>
        <Textarea
          value={skills}
          onChange={(e) => setSkills(e.target.value)}
          rows={3}
          readOnly={!skillsEditing}
          placeholder={skillsEditing ? 'e.g. TypeScript, Go, Python, React, PostgreSQL, Docker, Kubernetes' : ''}
          className={skillsEditing ? 'bg-zinc-900 border-zinc-700' : 'bg-transparent border-zinc-800 cursor-default resize-none'}
        />
      </div>

      {/* Experience sections */}
      {EXPERIENCE_SECTIONS.map(({ key, label, addLabel }) => {
        const isOpen = openSections[key]
        const count = liveExp[key as keyof typeof liveExp].length

        return (
          <div key={key} className="bg-zinc-900 border border-zinc-800 rounded-lg">
            <div className="flex items-center justify-between px-4 py-3">
              <button
                type="button"
                className="flex items-center gap-2 flex-1 text-left"
                onClick={() => toggleSection(key)}
              >
                <span className="text-sm font-medium text-zinc-200">{label}</span>
                <span className="text-xs text-zinc-500">({count})</span>
                {isOpen
                  ? <ChevronUp className="h-4 w-4 text-zinc-400" />
                  : <ChevronDown className="h-4 w-4 text-zinc-400" />
                }
              </button>
              {key === 'jobs' ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => setShowAddJob(true)} disabled={mutation.isPending}>
                    {addLabel}
                  </Button>
                  <AddJobSheet open={showAddJob} onClose={() => setShowAddJob(false)} onSave={handleAddJob} />
                </>
              ) : key === 'education' ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => setShowAddEdu(true)} disabled={mutation.isPending}>
                    {addLabel}
                  </Button>
                  <AddEducationSheet open={showAddEdu} onClose={() => setShowAddEdu(false)} onSave={handleAddEducation} />
                </>
              ) : key === 'projects' ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => setShowAddProject(true)} disabled={mutation.isPending}>
                    {addLabel}
                  </Button>
                  <AddProjectSheet open={showAddProject} onClose={() => setShowAddProject(false)} onSave={handleAddProject} />
                </>
              ) : key === 'certifications' ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => setShowAddCert(true)} disabled={mutation.isPending}>
                    {addLabel}
                  </Button>
                  <AddCertSheet open={showAddCert} onClose={() => setShowAddCert(false)} onSave={handleAddCert} sectionTitle="Add Certification" />
                </>
              ) : key === 'licences' ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => setShowAddLicence(true)} disabled={mutation.isPending}>
                    {addLabel}
                  </Button>
                  <AddCertSheet open={showAddLicence} onClose={() => setShowAddLicence(false)} onSave={handleAddLicence} sectionTitle="Add License" />
                </>
              ) : (
                <>
                  <Button size="sm" variant="outline" onClick={() => setShowAddAward(true)} disabled={mutation.isPending}>
                    {addLabel}
                  </Button>
                  <AddCertSheet open={showAddAward} onClose={() => setShowAddAward(false)} onSave={handleAddAward} sectionTitle="Add Award" />
                </>
              )}
            </div>
            <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
              <div className="overflow-hidden">
                <div className="px-4 pb-4 border-t border-zinc-800">
                  {key === 'jobs' ? (
                    <>
                      {liveExp.jobs.length === 0 && (
                        <p className="text-sm text-zinc-400 my-3">No entries yet.</p>
                      )}
                      {sortedJobs.length > 0 && (
                        <div className="grid grid-cols-[2fr_2fr_auto] gap-4 pt-3 pb-1 mb-1 border-b border-zinc-700">
                          <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Title</span>
                          <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Company</span>
                          <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Dates</span>
                        </div>
                      )}
                      {sortedJobs.map(({ job, originalIdx }) => (
                        <JobEntryRow
                          key={`job-${originalIdx}-${jobEditingIdx === originalIdx ? 'editing' : 'view'}`}
                          job={job}
                          isExpanded={expandedJobIdx === originalIdx}
                          isEditing={jobEditingIdx === originalIdx}
                          onToggleExpand={() => {
                            if (expandedJobIdx === originalIdx) {
                              if (jobEditingIdx === originalIdx) return
                              setExpandedJobIdx(null)
                            } else {
                              setExpandedJobIdx(originalIdx)
                              setJobEditingIdx(null)
                            }
                          }}
                          onStartEdit={() => setJobEditingIdx(originalIdx)}
                          onSave={(updated) => handleSaveJobEntry(originalIdx, updated)}
                          onCancel={() => setJobEditingIdx(null)}
                          onDelete={() => handleDeleteJob(originalIdx)}
                          disabled={mutation.isPending}
                        />
                      ))}
                    </>
                  ) : key === 'education' ? (
                    <>
                      {liveExp.education.length === 0 && (
                        <p className="text-sm text-zinc-400 my-3">No entries yet.</p>
                      )}
                      {liveExp.education.map((edu, idx) => (
                        <EduEntryRow
                          key={editingEduIdx === idx ? `edit-${idx}` : `view-${idx}`}
                          edu={edu}
                          isExpanded={expandedEduIdx === idx}
                          isEditing={editingEduIdx === idx}
                          onToggleExpand={() => {
                            if (expandedEduIdx === idx) {
                              if (editingEduIdx === idx) return
                              setExpandedEduIdx(null)
                            } else {
                              setExpandedEduIdx(idx)
                              setEditingEduIdx(null)
                            }
                          }}
                          onStartEdit={() => setEditingEduIdx(idx)}
                          onSave={(updated) => handleSaveEduEntry(idx, updated)}
                          onCancel={() => setEditingEduIdx(null)}
                          onDelete={() => handleDeleteEducation(idx)}
                          disabled={mutation.isPending}
                        />
                      ))}
                    </>
                  ) : key === 'projects' ? (
                    <>
                      {liveExp.projects.length === 0 && <p className="text-sm text-zinc-400 my-3">No entries yet.</p>}
                      {liveExp.projects.map((project, idx) => (
                        <ProjectEntryRow
                          key={editingProjectIdx === idx ? `edit-${idx}` : `view-${idx}`}
                          project={project}
                          isExpanded={expandedProjectIdx === idx}
                          isEditing={editingProjectIdx === idx}
                          onToggleExpand={() => {
                            if (expandedProjectIdx === idx) {
                              if (editingProjectIdx === idx) return
                              setExpandedProjectIdx(null)
                            } else {
                              setExpandedProjectIdx(idx)
                              setEditingProjectIdx(null)
                            }
                          }}
                          onStartEdit={() => setEditingProjectIdx(idx)}
                          onSave={(updated) => handleSaveProjectEntry(idx, updated)}
                          onCancel={() => setEditingProjectIdx(null)}
                          onDelete={() => handleDeleteProject(idx)}
                          disabled={mutation.isPending}
                        />
                      ))}
                    </>
                  ) : key === 'certifications' ? (
                    <>
                      {liveExp.certifications.length === 0 && <p className="text-sm text-zinc-400 my-3">No entries yet.</p>}
                      {liveExp.certifications.map((cert, idx) => (
                        <CertEntryRow
                          key={editingCertIdx === idx ? `edit-${idx}` : `view-${idx}`}
                          entry={cert}
                          isExpanded={expandedCertIdx === idx}
                          isEditing={editingCertIdx === idx}
                          onToggleExpand={() => {
                            if (expandedCertIdx === idx) {
                              if (editingCertIdx === idx) return
                              setExpandedCertIdx(null)
                            } else {
                              setExpandedCertIdx(idx)
                              setEditingCertIdx(null)
                            }
                          }}
                          onStartEdit={() => setEditingCertIdx(idx)}
                          onSave={(updated) => handleSaveCertEntry(idx, updated)}
                          onCancel={() => setEditingCertIdx(null)}
                          onDelete={() => handleDeleteCert(idx)}
                          disabled={mutation.isPending}
                        />
                      ))}
                    </>
                  ) : key === 'licences' ? (
                    <>
                      {liveExp.licences.length === 0 && <p className="text-sm text-zinc-400 my-3">No entries yet.</p>}
                      {liveExp.licences.map((licence, idx) => (
                        <CertEntryRow
                          key={editingLicenceIdx === idx ? `edit-${idx}` : `view-${idx}`}
                          entry={licence}
                          isExpanded={expandedLicenceIdx === idx}
                          isEditing={editingLicenceIdx === idx}
                          onToggleExpand={() => {
                            if (expandedLicenceIdx === idx) {
                              if (editingLicenceIdx === idx) return
                              setExpandedLicenceIdx(null)
                            } else {
                              setExpandedLicenceIdx(idx)
                              setEditingLicenceIdx(null)
                            }
                          }}
                          onStartEdit={() => setEditingLicenceIdx(idx)}
                          onSave={(updated) => handleSaveLicenceEntry(idx, updated)}
                          onCancel={() => setEditingLicenceIdx(null)}
                          onDelete={() => handleDeleteLicence(idx)}
                          disabled={mutation.isPending}
                        />
                      ))}
                    </>
                  ) : (
                    <>
                      {liveExp.awards.length === 0 && <p className="text-sm text-zinc-400 my-3">No entries yet.</p>}
                      {liveExp.awards.map((award, idx) => (
                        <CertEntryRow
                          key={editingAwardIdx === idx ? `edit-${idx}` : `view-${idx}`}
                          entry={award}
                          isExpanded={expandedAwardIdx === idx}
                          isEditing={editingAwardIdx === idx}
                          onToggleExpand={() => {
                            if (expandedAwardIdx === idx) {
                              if (editingAwardIdx === idx) return
                              setExpandedAwardIdx(null)
                            } else {
                              setExpandedAwardIdx(idx)
                              setEditingAwardIdx(null)
                            }
                          }}
                          onStartEdit={() => setEditingAwardIdx(idx)}
                          onSave={(updated) => handleSaveAwardEntry(idx, updated)}
                          onCancel={() => setEditingAwardIdx(null)}
                          onDelete={() => handleDeleteAward(idx)}
                          disabled={mutation.isPending}
                        />
                      ))}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function AddJobSheet({ open, onClose, onSave }: {
  open: boolean
  onClose: () => void
  onSave: (entry: JobEntry) => void
}) {
  const [title, setTitle] = useState('')
  const [company, setCompany] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [current, setCurrent] = useState(false)
  const [employmentType, setEmploymentType] = useState('')
  const [bullets, setBullets] = useState([''])
  const [errors, setErrors] = useState<string[]>([])

  function reset() {
    setTitle(''); setCompany(''); setStartDate(''); setEndDate('')
    setCurrent(false); setEmploymentType(''); setBullets(['']); setErrors([])
  }

  function handleClose() {
    reset()
    onClose()
  }

  function handleSave() {
    const errs: string[] = []
    if (!title.trim()) errs.push('Title is required')
    if (!company.trim()) errs.push('Company is required')
    if (!startDate.trim()) errs.push('Start Date is required')
    if (errs.length) { setErrors(errs); return }
    onSave({
      title: title.trim(),
      company: company.trim(),
      startDate: startDate.trim(),
      endDate: current ? null : (endDate.trim() || null),
      current,
      employmentType: employmentType.trim() || undefined,
      bullets: bullets.map(b => b.trim()).filter(Boolean),
    })
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Add Job</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 mt-4">
          {errors.length > 0 && (
            <div className="text-xs text-red-400 space-y-1">
              {errors.map((e, i) => <p key={i}>{e}</p>)}
            </div>
          )}
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Title *</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="bg-zinc-900 border-zinc-700" />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Company *</label>
            <Input value={company} onChange={(e) => setCompany(e.target.value)} className="bg-zinc-900 border-zinc-700" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Start Date * (YYYY-MM)</label>
              <Input value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-zinc-900 border-zinc-700" placeholder="YYYY-MM" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">End Date (YYYY-MM)</label>
              <Input value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-zinc-900 border-zinc-700" placeholder="YYYY-MM" disabled={current} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={current}
              onCheckedChange={(checked) => {
                setCurrent(checked)
                if (checked) setEndDate('')
              }}
            />
            <label className="text-xs text-zinc-400">Currently employed here</label>
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Employment Type</label>
            <Input value={employmentType} onChange={(e) => setEmploymentType(e.target.value)} className="bg-zinc-900 border-zinc-700" placeholder="e.g. Full-time" />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Bullets</label>
            <div className="space-y-2">
              {bullets.map((bullet, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={bullet}
                    onChange={(e) => setBullets(bullets.map((b, j) => j === i ? e.target.value : b))}
                    className="bg-zinc-900 border-zinc-700 flex-1"
                    placeholder="Accomplishment or responsibility"
                  />
                  <button
                    type="button"
                    onClick={() => setBullets(bullets.filter((_, j) => j !== i))}
                    disabled={bullets.length <= 1}
                    className="text-zinc-500 hover:text-red-400 disabled:opacity-30 shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => setBullets([...bullets, ''])}>
              Add Bullet
            </Button>
          </div>
          <div className="flex gap-2 mt-2">
            <Button onClick={handleSave}>Save Job</Button>
            <Button variant="ghost" onClick={handleClose}>Cancel</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function JobEntryRow({ job, isExpanded, isEditing, onToggleExpand, onStartEdit, onSave, onCancel, onDelete, disabled }: {
  job: JobEntry
  isExpanded: boolean
  isEditing: boolean
  onToggleExpand: () => void
  onStartEdit: () => void
  onSave: (entry: JobEntry) => void
  onCancel: () => void
  onDelete: () => void
  disabled: boolean
}) {
  const [title, setTitle] = useState(job.title)
  const [company, setCompany] = useState(job.company)
  const [startDate, setStartDate] = useState(job.startDate)
  const [endDate, setEndDate] = useState(job.endDate ?? '')
  const [current, setCurrent] = useState(job.current)
  const [employmentType, setEmploymentType] = useState(job.employmentType ?? '')
  const [bullets, setBullets] = useState(job.bullets.length > 0 ? [...job.bullets] : [''])
  const [errors, setErrors] = useState<string[]>([])

  const startFormatted = formatJobDate(job.startDate, false)
  const endFormatted = formatJobDate(job.endDate, job.current)
  const dateRange = `${startFormatted} – ${endFormatted}`

  function handleSave() {
    const errs: string[] = []
    if (!title.trim()) errs.push('Title is required')
    if (!company.trim()) errs.push('Company is required')
    if (!startDate.trim()) errs.push('Start Date is required')
    if (errs.length) { setErrors(errs); return }
    onSave({
      title: title.trim(),
      company: company.trim(),
      startDate: startDate.trim(),
      endDate: current ? null : (endDate.trim() || null),
      current,
      employmentType: employmentType.trim() || undefined,
      bullets: bullets.map(b => b.trim()).filter(Boolean),
    })
  }

  function handleCancel() {
    setTitle(job.title)
    setCompany(job.company)
    setStartDate(job.startDate)
    setEndDate(job.endDate ?? '')
    setCurrent(job.current)
    setEmploymentType(job.employmentType ?? '')
    setBullets(job.bullets.length > 0 ? [...job.bullets] : [''])
    setErrors([])
    onCancel()
  }

  return (
    <div className="border-b border-zinc-800 last:border-0">
      <button
        type="button"
        className="w-full grid grid-cols-[2fr_2fr_auto] gap-4 py-2 text-left hover:bg-zinc-800/30 rounded transition-colors disabled:opacity-50"
        onClick={onToggleExpand}
        disabled={disabled}
      >
        <span className="text-sm text-zinc-200 truncate">{job.title}</span>
        <span className="text-sm text-zinc-400 truncate">{job.company}</span>
        <span className="text-sm text-zinc-500 whitespace-nowrap">{dateRange}</span>
      </button>

      <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          {!isEditing ? (
            <div className="pb-3 pt-1 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Title</label>
                  <Input value={job.title} readOnly className="bg-transparent border-zinc-800 cursor-default" />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Company</label>
                  <Input value={job.company} readOnly className="bg-transparent border-zinc-800 cursor-default" />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Start Date</label>
                  <Input value={startFormatted} readOnly className="bg-transparent border-zinc-800 cursor-default" />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">End Date</label>
                  <Input value={endFormatted} readOnly className="bg-transparent border-zinc-800 cursor-default" />
                </div>
              </div>
              {job.employmentType && (
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Employment Type</label>
                  <Input value={job.employmentType} readOnly className="bg-transparent border-zinc-800 cursor-default" />
                </div>
              )}
              {job.bullets.length > 0 && (
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Bullets</label>
                  <ul className="space-y-1 mt-1">
                    {job.bullets.map((b, i) => (
                      <li key={i} className="text-sm text-zinc-300">• {b}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-zinc-800">
                <Button size="sm" variant="outline" onClick={onStartEdit} disabled={disabled}>Edit</Button>
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={disabled}
                  className="text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="pb-3 pt-1 space-y-3">
              {errors.length > 0 && (
                <div className="text-xs text-red-400 space-y-1">
                  {errors.map((e, i) => <p key={i}>{e}</p>)}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Title *</label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} className="bg-zinc-900 border-zinc-700" />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Company *</label>
                  <Input value={company} onChange={(e) => setCompany(e.target.value)} className="bg-zinc-900 border-zinc-700" />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Start Date * (YYYY-MM)</label>
                  <Input value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-zinc-900 border-zinc-700" placeholder="YYYY-MM" />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">End Date (YYYY-MM)</label>
                  <Input value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-zinc-900 border-zinc-700" placeholder="YYYY-MM" disabled={current} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={current} onCheckedChange={(checked) => { setCurrent(checked); if (checked) setEndDate('') }} />
                <label className="text-xs text-zinc-400">Currently employed here</label>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Employment Type</label>
                <Input value={employmentType} onChange={(e) => setEmploymentType(e.target.value)} className="bg-zinc-900 border-zinc-700" placeholder="e.g. Full-time" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Bullets</label>
                <div className="space-y-2">
                  {bullets.map((bullet, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={bullet}
                        onChange={(e) => setBullets(bullets.map((b, j) => j === i ? e.target.value : b))}
                        className="bg-zinc-900 border-zinc-700 flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => setBullets(bullets.filter((_, j) => j !== i))}
                        disabled={bullets.length <= 1}
                        className="text-zinc-500 hover:text-red-400 disabled:opacity-30 shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <Button size="sm" variant="outline" className="mt-2" onClick={() => setBullets([...bullets, ''])}>
                  Add Bullet
                </Button>
              </div>
              <div className="flex gap-2 pt-1 border-t border-zinc-800">
                <Button size="sm" onClick={handleSave} disabled={disabled}>Save</Button>
                <Button size="sm" variant="ghost" onClick={handleCancel}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function AddEducationSheet({ open, onClose, onSave }: {
  open: boolean
  onClose: () => void
  onSave: (entry: EducationEntry) => void
}) {
  const [name, setName] = useState('')
  const [school, setSchool] = useState('')
  const [current, setCurrent] = useState(false)
  const [degrees, setDegrees] = useState<DegreeEntry[]>([])
  const [errors, setErrors] = useState<string[]>([])

  function reset() {
    setName(''); setSchool(''); setCurrent(false); setDegrees([]); setErrors([])
  }

  function handleClose() {
    reset()
    onClose()
  }

  function handleSave() {
    const errs: string[] = []
    if (!name.trim()) errs.push('Program Name is required')
    if (!school.trim()) errs.push('School is required')
    if (errs.length) { setErrors(errs); return }
    onSave({
      name: name.trim(),
      school: school.trim(),
      current,
      degrees: degrees.map(d => ({
        degreeType: d.degreeType.trim(),
        degreeSubject: d.degreeSubject.trim(),
        graduationDate: current ? null : (d.graduationDate?.trim() || null),
      })),
    })
  }

  function updateDegree(idx: number, patch: Partial<DegreeEntry>) {
    setDegrees(degrees.map((d, i) => i === idx ? { ...d, ...patch } : d))
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Add Education</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 mt-4">
          {errors.length > 0 && (
            <div className="text-xs text-red-400 space-y-1">
              {errors.map((e, i) => <p key={i}>{e}</p>)}
            </div>
          )}
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Program Name *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-zinc-900 border-zinc-700" placeholder="e.g. B.Sc. Computer Science" />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">School *</label>
            <Input value={school} onChange={(e) => setSchool(e.target.value)} className="bg-zinc-900 border-zinc-700" />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={current} onCheckedChange={(checked) => setCurrent(checked)} />
            <label className="text-xs text-zinc-400">Currently enrolled</label>
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-2">Degrees</label>
            <div className="space-y-3">
              {degrees.map((degree, i) => (
                <div key={i} className="flex flex-col gap-2 p-3 border border-zinc-800 rounded">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Degree Type</label>
                      <Input
                        value={degree.degreeType}
                        onChange={(e) => updateDegree(i, { degreeType: e.target.value })}
                        className="bg-zinc-900 border-zinc-700"
                        placeholder="e.g. Bachelor of Science"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Degree Subject</label>
                      <Input
                        value={degree.degreeSubject}
                        onChange={(e) => updateDegree(i, { degreeSubject: e.target.value })}
                        className="bg-zinc-900 border-zinc-700"
                        placeholder="e.g. Computer Science"
                      />
                    </div>
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="block text-xs text-zinc-400 mb-1">Graduation Date (YYYY-MM)</label>
                      <Input
                        value={degree.graduationDate ?? ''}
                        onChange={(e) => updateDegree(i, { graduationDate: e.target.value || null })}
                        className="bg-zinc-900 border-zinc-700"
                        placeholder="YYYY-MM"
                        disabled={current}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setDegrees(degrees.filter((_, j) => j !== i))}
                      className="text-zinc-500 hover:text-red-400 shrink-0 pb-1"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => setDegrees([...degrees, { degreeType: '', degreeSubject: '', graduationDate: null }])}
            >
              Add Degree
            </Button>
          </div>
          <div className="flex gap-2 mt-2">
            <Button onClick={handleSave}>Save Education</Button>
            <Button variant="ghost" onClick={handleClose}>Cancel</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function EduEntryRow({ edu, isExpanded, isEditing, onToggleExpand, onStartEdit, onSave, onCancel, onDelete, disabled }: {
  edu: EducationEntry
  isExpanded: boolean
  isEditing: boolean
  onToggleExpand: () => void
  onStartEdit: () => void
  onSave: (entry: EducationEntry) => void
  onCancel: () => void
  onDelete: () => void
  disabled: boolean
}) {
  const [name, setName] = useState(edu.name)
  const [school, setSchool] = useState(edu.school)
  const [current, setCurrent] = useState(edu.current)
  const [degrees, setDegrees] = useState<DegreeEntry[]>([...edu.degrees])
  const [errors, setErrors] = useState<string[]>([])

  const degCount = edu.degrees.length
  const summary = `${edu.school} — ${edu.name} (${degCount} degree${degCount !== 1 ? 's' : ''})`

  function handleCancel() {
    setName(edu.name)
    setSchool(edu.school)
    setCurrent(edu.current)
    setDegrees([...edu.degrees])
    setErrors([])
    onCancel()
  }

  function handleSave() {
    const errs: string[] = []
    if (!name.trim()) errs.push('Program Name is required')
    if (!school.trim()) errs.push('School is required')
    if (errs.length) { setErrors(errs); return }
    onSave({
      name: name.trim(),
      school: school.trim(),
      current,
      degrees: degrees.map(d => ({
        degreeType: d.degreeType.trim(),
        degreeSubject: d.degreeSubject.trim(),
        graduationDate: current ? null : (d.graduationDate?.trim() || null),
      })),
    })
  }

  function updateDegree(idx: number, patch: Partial<DegreeEntry>) {
    setDegrees(degrees.map((d, i) => i === idx ? { ...d, ...patch } : d))
  }

  return (
    <div className="border-b border-zinc-800 last:border-0">
      <button
        type="button"
        className="w-full flex items-center gap-2 py-2 text-left hover:bg-zinc-800/30 rounded transition-colors disabled:opacity-50"
        onClick={onToggleExpand}
        disabled={disabled}
      >
        <span className="flex-1 text-sm text-zinc-200 truncate">{summary}</span>
        <ChevronDown className={`h-4 w-4 text-zinc-400 shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
      </button>

      <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          {!isEditing ? (
            <div className="pb-3 pt-1 space-y-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Program Name</label>
                <Input value={edu.name} readOnly className="bg-transparent border-zinc-800 cursor-default" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">School</label>
                <Input value={edu.school} readOnly className="bg-transparent border-zinc-800 cursor-default" />
              </div>
              {edu.degrees.length > 0 && (
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Degrees</label>
                  <ul className="space-y-1 mt-1">
                    {edu.degrees.map((d, i) => (
                      <li key={i} className="text-sm text-zinc-300">
                        • {d.degreeType} in {d.degreeSubject}{d.graduationDate ? ` — ${d.graduationDate}` : edu.current ? ' — Present' : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-zinc-800">
                <Button size="sm" variant="outline" onClick={onStartEdit} disabled={disabled}>Edit</Button>
                <button type="button" onClick={onDelete} disabled={disabled} className="text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-50">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="pb-3 pt-1 space-y-3">
              {errors.length > 0 && (
                <div className="text-xs text-red-400 space-y-1">
                  {errors.map((e, i) => <p key={i}>{e}</p>)}
                </div>
              )}
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Program Name *</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-zinc-900 border-zinc-700" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">School *</label>
                <Input value={school} onChange={(e) => setSchool(e.target.value)} className="bg-zinc-900 border-zinc-700" />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={current} onCheckedChange={(checked) => setCurrent(checked)} />
                <label className="text-xs text-zinc-400">Currently enrolled</label>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-2">Degrees</label>
                <div className="space-y-3">
                  {degrees.map((degree, i) => (
                    <div key={i} className="flex flex-col gap-2 p-3 border border-zinc-800 rounded">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs text-zinc-400 mb-1">Degree Type</label>
                          <Input
                            value={degree.degreeType}
                            onChange={(e) => updateDegree(i, { degreeType: e.target.value })}
                            className="bg-zinc-900 border-zinc-700"
                            placeholder="e.g. Bachelor of Science"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-zinc-400 mb-1">Degree Subject</label>
                          <Input
                            value={degree.degreeSubject}
                            onChange={(e) => updateDegree(i, { degreeSubject: e.target.value })}
                            className="bg-zinc-900 border-zinc-700"
                            placeholder="e.g. Computer Science"
                          />
                        </div>
                      </div>
                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <label className="block text-xs text-zinc-400 mb-1">Graduation Date (YYYY-MM)</label>
                          <Input
                            value={degree.graduationDate ?? ''}
                            onChange={(e) => updateDegree(i, { graduationDate: e.target.value || null })}
                            className="bg-zinc-900 border-zinc-700"
                            placeholder="YYYY-MM"
                            disabled={current}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setDegrees(degrees.filter((_, j) => j !== i))}
                          className="text-zinc-500 hover:text-red-400 shrink-0 pb-1"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() => setDegrees([...degrees, { degreeType: '', degreeSubject: '', graduationDate: null }])}
                >
                  Add Degree
                </Button>
              </div>
              <div className="flex gap-2 pt-1 border-t border-zinc-800">
                <Button size="sm" onClick={handleSave} disabled={disabled}>Save</Button>
                <Button size="sm" variant="ghost" onClick={handleCancel}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function AddProjectSheet({ open, onClose, onSave }: {
  open: boolean
  onClose: () => void
  onSave: (entry: ProjectEntry) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [url, setUrl] = useState('')
  const [errors, setErrors] = useState<string[]>([])

  function reset() {
    setName(''); setDescription(''); setUrl(''); setErrors([])
  }

  function handleClose() {
    reset()
    onClose()
  }

  function handleSave() {
    const errs: string[] = []
    if (!name.trim()) errs.push('Name is required')
    if (!description.trim()) errs.push('Description is required')
    if (errs.length) { setErrors(errs); return }
    onSave({ name: name.trim(), description: description.trim(), url: url.trim() || null })
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Add Project</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 mt-4">
          {errors.length > 0 && (
            <div className="text-xs text-red-400 space-y-1">
              {errors.map((e, i) => <p key={i}>{e}</p>)}
            </div>
          )}
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Name *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-zinc-900 border-zinc-700" />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Description *</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="bg-zinc-900 border-zinc-700" />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Project URL</label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… (optional)" className="bg-zinc-900 border-zinc-700" />
          </div>
          <div className="flex gap-2 mt-2">
            <Button onClick={handleSave}>Save Project</Button>
            <Button variant="ghost" onClick={handleClose}>Cancel</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function AddCertSheet({ open, onClose, onSave, sectionTitle }: {
  open: boolean
  onClose: () => void
  onSave: (entry: CertEntry) => void
  sectionTitle: string
}) {
  const [name, setName] = useState('')
  const [issuer, setIssuer] = useState('')
  const [year, setYear] = useState('')
  const [errors, setErrors] = useState<string[]>([])

  function reset() {
    setName(''); setIssuer(''); setYear(''); setErrors([])
  }

  function handleClose() {
    reset()
    onClose()
  }

  function handleSave() {
    const errs: string[] = []
    if (!name.trim()) errs.push('Name is required')
    if (!issuer.trim()) errs.push('Issuer is required')
    if (!year.trim()) errs.push('Year is required')
    if (year.trim() && !/^\d{4}$/.test(year.trim())) errs.push('Year must be 4 digits (YYYY)')
    if (errs.length) { setErrors(errs); return }
    onSave({ name: name.trim(), issuer: issuer.trim(), year: year.trim() })
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{sectionTitle}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 mt-4">
          {errors.length > 0 && (
            <div className="text-xs text-red-400 space-y-1">
              {errors.map((e, i) => <p key={i}>{e}</p>)}
            </div>
          )}
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Name *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-zinc-900 border-zinc-700" />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Issuer *</label>
            <Input value={issuer} onChange={(e) => setIssuer(e.target.value)} className="bg-zinc-900 border-zinc-700" />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Year * (YYYY)</label>
            <Input value={year} onChange={(e) => setYear(e.target.value)} className="bg-zinc-900 border-zinc-700" placeholder="YYYY" maxLength={4} />
          </div>
          <div className="flex gap-2 mt-2">
            <Button onClick={handleSave}>Save</Button>
            <Button variant="ghost" onClick={handleClose}>Cancel</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function ProjectEntryRow({ project, isExpanded, isEditing, onToggleExpand, onStartEdit, onSave, onCancel, onDelete, disabled }: {
  project: ProjectEntry
  isExpanded: boolean
  isEditing: boolean
  onToggleExpand: () => void
  onStartEdit: () => void
  onSave: (entry: ProjectEntry) => void
  onCancel: () => void
  onDelete: () => void
  disabled: boolean
}) {
  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description)
  const [url, setUrl] = useState(project.url ?? '')
  const [errors, setErrors] = useState<string[]>([])

  function handleCancel() {
    setName(project.name)
    setDescription(project.description)
    setUrl(project.url ?? '')
    setErrors([])
    onCancel()
  }

  function handleSave() {
    const errs: string[] = []
    if (!name.trim()) errs.push('Name is required')
    if (!description.trim()) errs.push('Description is required')
    if (errs.length) { setErrors(errs); return }
    onSave({ name: name.trim(), description: description.trim(), url: url.trim() || null })
  }

  return (
    <div className="border-b border-zinc-800 last:border-0">
      <button
        type="button"
        className="w-full flex items-center gap-2 py-2 text-left hover:bg-zinc-800/30 rounded transition-colors disabled:opacity-50"
        onClick={onToggleExpand}
        disabled={disabled}
      >
        <span className="flex-1 text-sm text-zinc-200 truncate">{project.name}</span>
        <ChevronDown className={`h-4 w-4 text-zinc-400 shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
      </button>

      <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          {!isEditing ? (
            <div className="pb-3 pt-1 space-y-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Name</label>
                <Input value={project.name} readOnly className="bg-transparent border-zinc-800 cursor-default" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Description</label>
                <Textarea value={project.description} readOnly rows={3} className="bg-transparent border-zinc-800 cursor-default resize-none" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Project URL</label>
                <Input value={project.url ?? ''} readOnly placeholder="—" className="bg-transparent border-zinc-800 cursor-default" />
              </div>
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-zinc-800">
                <Button size="sm" variant="outline" onClick={onStartEdit} disabled={disabled}>Edit</Button>
                <button type="button" onClick={onDelete} disabled={disabled} className="text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-50">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="pb-3 pt-1 space-y-3">
              {errors.length > 0 && (
                <div className="text-xs text-red-400 space-y-1">
                  {errors.map((e, i) => <p key={i}>{e}</p>)}
                </div>
              )}
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Name *</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-zinc-900 border-zinc-700" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Description *</label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="bg-zinc-900 border-zinc-700" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Project URL</label>
                <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… (optional)" className="bg-zinc-900 border-zinc-700" />
              </div>
              <div className="flex gap-2 pt-1 border-t border-zinc-800">
                <Button size="sm" onClick={handleSave} disabled={disabled}>Save</Button>
                <Button size="sm" variant="ghost" onClick={handleCancel}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function CertEntryRow({ entry, isExpanded, isEditing, onToggleExpand, onStartEdit, onSave, onCancel, onDelete, disabled }: {
  entry: CertEntry
  isExpanded: boolean
  isEditing: boolean
  onToggleExpand: () => void
  onStartEdit: () => void
  onSave: (entry: CertEntry) => void
  onCancel: () => void
  onDelete: () => void
  disabled: boolean
}) {
  const [name, setName] = useState(entry.name)
  const [issuer, setIssuer] = useState(entry.issuer)
  const [year, setYear] = useState(entry.year)
  const [errors, setErrors] = useState<string[]>([])

  const summary = `${entry.name} — ${entry.issuer} (${entry.year})`

  function handleCancel() {
    setName(entry.name)
    setIssuer(entry.issuer)
    setYear(entry.year)
    setErrors([])
    onCancel()
  }

  function handleSave() {
    const errs: string[] = []
    if (!name.trim()) errs.push('Name is required')
    if (!issuer.trim()) errs.push('Issuer is required')
    if (!year.trim()) errs.push('Year is required')
    if (year.trim() && !/^\d{4}$/.test(year.trim())) errs.push('Year must be 4 digits (YYYY)')
    if (errs.length) { setErrors(errs); return }
    onSave({ name: name.trim(), issuer: issuer.trim(), year: year.trim() })
  }

  return (
    <div className="border-b border-zinc-800 last:border-0">
      <button
        type="button"
        className="w-full flex items-center gap-2 py-2 text-left hover:bg-zinc-800/30 rounded transition-colors disabled:opacity-50"
        onClick={onToggleExpand}
        disabled={disabled}
      >
        <span className="flex-1 text-sm text-zinc-200 truncate">{summary}</span>
        <ChevronDown className={`h-4 w-4 text-zinc-400 shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
      </button>

      <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          {!isEditing ? (
            <div className="pb-3 pt-1 space-y-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Name</label>
                <Input value={entry.name} readOnly className="bg-transparent border-zinc-800 cursor-default" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Issuer</label>
                <Input value={entry.issuer} readOnly className="bg-transparent border-zinc-800 cursor-default" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Year</label>
                <Input value={entry.year} readOnly className="bg-transparent border-zinc-800 cursor-default" />
              </div>
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-zinc-800">
                <Button size="sm" variant="outline" onClick={onStartEdit} disabled={disabled}>Edit</Button>
                <button type="button" onClick={onDelete} disabled={disabled} className="text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-50">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="pb-3 pt-1 space-y-3">
              {errors.length > 0 && (
                <div className="text-xs text-red-400 space-y-1">
                  {errors.map((e, i) => <p key={i}>{e}</p>)}
                </div>
              )}
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Name *</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-zinc-900 border-zinc-700" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Issuer *</label>
                <Input value={issuer} onChange={(e) => setIssuer(e.target.value)} className="bg-zinc-900 border-zinc-700" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Year * (YYYY)</label>
                <Input value={year} onChange={(e) => setYear(e.target.value)} className="bg-zinc-900 border-zinc-700" placeholder="YYYY" maxLength={4} />
              </div>
              <div className="flex gap-2 pt-1 border-t border-zinc-800">
                <Button size="sm" onClick={handleSave} disabled={disabled}>Save</Button>
                <Button size="sm" variant="ghost" onClick={handleCancel}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
