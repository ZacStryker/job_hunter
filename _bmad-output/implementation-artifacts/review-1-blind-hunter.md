# Review 1 — Blind Hunter (diff only)

Run this in a fresh session (ideally a different LLM) with **no project access and no spec**.
Invoke the `bmad-review-adversarial-general` skill on the diff below. Paste findings back here.

You are reviewing a code change in isolation. You have ONLY the diff — no spec, no
surrounding code, no project context. Hunt adversarially for defects that are visible
from the diff alone: logic errors, inconsistent constants, broken mappings, type
mismatches, dead code, mislabeled values, off-by-one, missing cases. Report each finding
with file, line context, severity, and why it's a problem.

```diff
diff --git a/job-hunt-dashboard/src/client/components/detail/JobDrawer.tsx b/job-hunt-dashboard/src/client/components/detail/JobDrawer.tsx
@@
 import { useState, useEffect, useRef, Fragment } from 'react'
-import { ExternalLink, Archive, ArchiveRestore, Wand2, FileText, Download, CheckCircle, Circle, Pencil, Info, Ban } from 'lucide-react'
+import { ExternalLink, Archive, ArchiveRestore, Wand2, FileText, Download, Pencil, Info, Ban } from 'lucide-react'
 import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../ui/sheet'
+import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
 import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
@@
+const NO_STATUS = '__none__'
+const APPLIED = 'Applied'
+const STATUS_OPTIONS = [
+  { value: NO_STATUS, label: 'No Status' },
+  { value: APPLIED, label: 'Applied' },
+  { value: 'screening', label: 'Screening' },
+  { value: 'interview', label: 'Interview' },
+  { value: 'offer', label: 'Offer' },
+  { value: 'rejected', label: 'Rejected' },
+  { value: 'other', label: 'Other' },
+]
@@
-              <button
-                onClick={() => patchJob({ id: job.id, patch: { applied: !job.applied, statusOverride: null } })}
+              <Select
+                value={job.statusOverride ?? (job.applied ? APPLIED : NO_STATUS)}
+                onValueChange={(value) => {
+                  if (value === NO_STATUS) patchJob({ id: job.id, patch: { applied: false, statusOverride: null } })
+                  else if (value === APPLIED) patchJob({ id: job.id, patch: { applied: true, statusOverride: null } })
+                  else patchJob({ id: job.id, patch: { applied: true, statusOverride: value } })
+                }}
                 disabled={isPatching}
-                className={`...binary toggle classes...`}
-              >
-                {job.applied ? <><CheckCircle size={13} />Applied</> : <><Circle size={13} />Mark Applied</>}
-              </button>
+              >
+                <SelectTrigger className="h-auto w-[150px] gap-1.5 rounded-md border-zinc-700 bg-transparent px-3 py-1.5 text-sm text-zinc-300">
+                  <SelectValue />
+                </SelectTrigger>
+                <SelectContent className="border-zinc-800 bg-zinc-900 text-zinc-200">
+                  {STATUS_OPTIONS.map((opt) => (
+                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
+                  ))}
+                </SelectContent>
+              </Select>

diff --git a/job-hunt-dashboard/src/client/components/detail/StatusTimeline.tsx b/job-hunt-dashboard/src/client/components/detail/StatusTimeline.tsx
@@
 const STATUS_LABELS: Record<string, string> = {
   // Manual override values
-  phone_screen: 'Phone Screen',
+  screening: 'Screening',
   interview: 'Interview',
-  technical: 'Technical Round',
-  offer: 'Offer Received',
+  offer: 'Offer',
   rejected: 'Rejected',
-  withdrawn: 'Withdrawn',
-  ghosted: 'Ghosted',
+  other: 'Other',
   // Message types
   Submitted: 'Submitted',
   Rejected: 'Rejected',
   ...

diff --git a/job-hunt-dashboard/src/client/components/pipeline/PipelineTable.tsx b/job-hunt-dashboard/src/client/components/pipeline/PipelineTable.tsx
@@
 const STATUS_OPTIONS = [
   { value: NO_STATUS, label: 'No Status' },
   { value: APPLIED, label: 'Applied' },
-  { value: 'phone_screen', label: 'Phone Screen' },
+  { value: 'screening', label: 'Screening' },
   { value: 'interview', label: 'Interview' },
-  { value: 'technical', label: 'Technical Round' },
-  { value: 'offer', label: 'Offer Received' },
+  { value: 'offer', label: 'Offer' },
   { value: 'rejected', label: 'Rejected' },
-  { value: 'withdrawn', label: 'Withdrawn' },
-  { value: 'ghosted', label: 'Ghosted' },
+  { value: 'other', label: 'Other' },
 ]

diff --git a/job-hunt-dashboard/src/server/routes/api-jobs.ts b/job-hunt-dashboard/src/server/routes/api-jobs.ts
@@
-const STATUS_OVERRIDE_VALUES = ['phone_screen', 'interview', 'technical', 'offer', 'rejected', 'withdrawn', 'ghosted'] as const
+const STATUS_OVERRIDE_VALUES = ['screening', 'interview', 'offer', 'rejected', 'other'] as const

diff --git a/job-hunt-dashboard/src/server/routes/api-stats.ts b/job-hunt-dashboard/src/server/routes/api-stats.ts
@@
-const RESPONSE_STATUSES = ['Submitted', 'Screening', 'Interview', 'Offer', 'Rejected']
-const INTERVIEW_STATUSES = ['Interview', 'Offer']
+const RESPONSE_STATUSES = ['screening', 'interview', 'offer', 'rejected']
+const INTERVIEW_STATUSES = ['interview', 'offer']
@@
-  const offer = hasStatusData ? appliedJobs.filter(j => j.statusOverride === 'Offer').length : 0
+  const offer = hasStatusData ? appliedJobs.filter(j => j.statusOverride === 'offer').length : 0
@@
-      if (j.statusOverride !== null && j.statusOverride !== 'No Response') fitBuckets[idx].responded++
+      if (j.statusOverride !== null && RESPONSE_STATUSES.includes(j.statusOverride)) fitBuckets[idx].responded++

diff --git a/job-hunt-dashboard/src/server/routes/api-jobs.test.ts b/job-hunt-dashboard/src/server/routes/api-jobs.test.ts
@@  (4 fixtures: 'phone_screen' -> 'screening')

diff --git a/job-hunt-dashboard/src/server/routes/api-stats.test.ts b/job-hunt-dashboard/src/server/routes/api-stats.test.ts
@@  (funnel fixtures 'Submitted'/'Interview'/'Offer' -> 'screening'/'interview'/'offer'; hero clause 'Interview' -> 'interview')
```
