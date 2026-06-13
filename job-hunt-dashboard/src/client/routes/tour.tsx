import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { ScoreBadge } from '../components/pipeline/ScoreBadge'
import { ActionChip } from '../components/pipeline/ActionChip'

type Recommendation = 'apply' | 'investigate' | 'skip'

interface DemoJob {
  id: number
  company: string
  title: string
  score: number
  recommendation: Recommendation
  summary: string
  reqsMet: string[]
  reqsMissed: string[]
  redFlags: string[]
}

const DEMO_JOBS: DemoJob[] = [
  {
    id: 1,
    company: 'Stripe',
    title: 'Senior Software Engineer',
    score: 87,
    recommendation: 'apply',
    summary: 'Strong alignment with distributed-systems experience and TypeScript depth. Payment domain background is a direct advantage.',
    reqsMet: ['5+ yrs TypeScript', 'Distributed systems', 'Payment platforms'],
    reqsMissed: ['Go proficiency preferred'],
    redFlags: [],
  },
  {
    id: 2,
    company: 'Figma',
    title: 'Staff Engineer, Platform',
    score: 72,
    recommendation: 'investigate',
    summary: 'Solid backend and API design fit. Design tooling domain is new territory — worth exploring if adjacent skills transfer.',
    reqsMet: ['API design', 'High-scale systems'],
    reqsMissed: ['Graphics/rendering experience', 'C++ proficiency'],
    redFlags: [],
  },
  {
    id: 3,
    company: 'Datadog',
    title: 'Principal Engineer',
    score: 64,
    recommendation: 'investigate',
    summary: 'Observability platform experience is a gap but systems background transfers well. Verify seniority expectations match your target level.',
    reqsMet: ['Distributed systems', 'TypeScript/Go breadth'],
    reqsMissed: ['Observability tooling domain', '10+ yrs expected'],
    redFlags: ['Compensation range below stated target'],
  },
  {
    id: 4,
    company: 'Shopify',
    title: 'Senior Backend Developer',
    score: 81,
    recommendation: 'apply',
    summary: 'E-commerce infrastructure and Ruby/Rails stack is a good match. TypeScript usage is growing across the organisation.',
    reqsMet: ['Ruby on Rails', 'API design', 'High-traffic systems'],
    reqsMissed: ['GraphQL expert preferred'],
    redFlags: [],
  },
  {
    id: 5,
    company: 'Adobe',
    title: 'Software Engineer III',
    score: 41,
    recommendation: 'skip',
    summary: 'Role centres on Creative Cloud desktop integration with C++ and native platform APIs. Limited overlap with current skill set.',
    reqsMet: ['Software engineering fundamentals'],
    reqsMissed: ['C++ (required)', 'Native desktop APIs', 'Creative domain knowledge'],
    redFlags: ['Strong C++ requirement — non-negotiable per JD'],
  },
]

export function TourRoute() {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const selectedJob = DEMO_JOBS.find(j => j.id === selectedId) ?? null
  const lastJobRef = useRef<DemoJob | null>(null)
  if (selectedJob) lastJobRef.current = selectedJob
  const visibleJob = selectedJob ?? lastJobRef.current

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="text-sm font-bold tracking-widest">HITLOBSTER</span>
          <div className="flex items-center gap-4">
            <Link to="/login" className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors">
              Sign in
            </Link>
            <Button asChild size="sm">
              <Link to="/register">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="px-6 pt-20 pb-16 text-center">
        <div className="inline-flex flex-col items-center mb-8 rounded-2xl px-10 py-8" style={{ backgroundColor: '#18181B' }}>
          <img src="/hl-logo.png" alt="Hit Lobster" width="400" height="400" fetchPriority="high" className="w-[400px] h-[400px] object-contain" />
          <p className="text-xs text-zinc-500 leading-relaxed text-center">
            Human in the Loop Organized Business<br />Search, Track, &amp; Evaluation Resource
          </p>
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold leading-tight mb-4 max-w-2xl mx-auto">
          Discover smarter. Apply faster. Track everything.
        </h1>
        <p className="text-lg text-zinc-400 mb-10">
          AI-powered job search command center — from discovery to offer.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-10">
          <Button asChild size="lg">
            <Link to="/register">Get started</Link>
          </Button>
          <a
            href="#features"
            onClick={(e) => {
              e.preventDefault()
              const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
              document.getElementById('features')?.scrollIntoView({ behavior: mq.matches ? 'auto' : 'smooth' })
            }}
            className="inline-flex items-center justify-center h-11 rounded-md px-8 text-sm font-medium text-zinc-300 border border-zinc-700 hover:border-zinc-500 hover:text-zinc-100 transition-colors"
          >
            See how it works ↓
          </a>
        </div>

        <div className="max-w-6xl mx-auto text-left">
          <div className="mb-4 text-center">
            <span className="inline-block mb-2 px-3 py-1 rounded-full border border-zinc-700 text-xs text-zinc-400 uppercase tracking-wider">
              Interactive Demo
            </span>
            <p className="text-sm text-zinc-500">Click any row to open the AI analysis drawer.</p>
          </div>
          <div className="rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden">
            <div className="flex flex-col md:flex-row">
              <DemoTable
                jobs={DEMO_JOBS}
                selectedId={selectedId}
                onSelect={(id) => setSelectedId(prev => prev === id ? null : id)}
              />
              <div className={`transition-all duration-300 ease-in-out overflow-hidden shrink-0 border-zinc-800 md:border-l ${selectedId !== null ? 'max-h-[500px] md:max-h-none md:w-80 border-t md:border-t-0' : 'max-h-0 md:max-h-none md:w-0'}`}>
                <div className="w-full md:w-80 flex flex-col" style={{ minHeight: '100%' }}>
                  {visibleJob && (
                    <DemoDrawer job={visibleJob} onClose={() => setSelectedId(null)} />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="border-t border-zinc-800/50">
        <FeatureSection2 />
        <FeatureSection3 />
        <FeatureSection4 />
        <FeatureSection5 />
      </section>
      <FaqSection />
      <ClosingCta />
    </div>
  )
}

function FeatureSection2() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-20 flex flex-col md:flex-row-reverse gap-12 items-center">
      <div className="flex-1 space-y-4">
        <h2 className="text-3xl font-bold text-zinc-100">Separate the signal from the noise</h2>
        <p className="text-zinc-400 leading-relaxed">
          Configure job title and location search pairs once. HITLOBSTER scrapes matching listings from LinkedIn — then scores each one for semantic similarity to your resume profile before the full AI pipeline runs. Only the most relevant results make it through, so you spend your attention budget on real opportunities. More job boards are on the way.
        </p>
      </div>
      <FadeInView className="flex-1">
        <div className="rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl overflow-hidden text-left">
          <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-500 uppercase tracking-wide">
            Search Pairs
          </div>
          <div className="px-4 py-2.5 border-b border-zinc-800 flex gap-3 text-xs">
            <span className="text-zinc-300 flex-1">Senior Software Engineer</span>
            <span className="text-zinc-500">San Francisco, CA</span>
          </div>
          <div className="px-4 py-2.5 border-b border-zinc-800 flex gap-3 text-xs">
            <span className="text-zinc-300 flex-1">Staff Engineer</span>
            <span className="text-zinc-500">Remote, US</span>
          </div>
          <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-500 uppercase tracking-wide mt-2">
            Title Relevance
          </div>
          {[
            { company: 'Stripe', role: 'Senior SWE', rel: 94 },
            { company: 'Linear', role: 'Staff Eng.', rel: 88 },
            { company: 'Vercel', role: 'Platform Eng.', rel: 71 },
          ].map(({ company, role, rel }) => (
            <div key={company} className="px-4 py-2.5 border-b border-zinc-800/50 last:border-b-0 flex items-center gap-3 text-xs">
              <span className="flex-1 text-zinc-200">{company}</span>
              <span className="text-zinc-400">{role}</span>
              <span className="inline-flex items-center justify-center w-8 h-5 border rounded text-xs font-semibold border-violet-600 text-violet-400">
                {rel}
              </span>
            </div>
          ))}
        </div>
      </FadeInView>
    </div>
  )
}

function FeatureSection3() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-28 flex flex-col md:flex-row gap-12 items-center border-t border-zinc-800/40">
      <div className="flex-1 space-y-4">
        <h2 className="text-3xl font-bold text-zinc-100">Instant clarity on every listing</h2>
        <p className="text-zinc-400 leading-relaxed">
          Every job that clears the relevance threshold is analysed by Claude. The result is a Fit Score from 0 to 100, a one-paragraph role fit summary, a breakdown of Requirements Met and Missed against your profile, any Red Flags worth knowing about, and a Recommendation — Apply, Investigate, or Skip. Three tiers, colour-coded so you can triage a full day's listings in seconds.
        </p>
      </div>
      <FadeInView className="flex-1">
        <div className="space-y-4">
          <div className="flex gap-4 justify-center">
            {[{ score: 87, label: 'Strong fit' }, { score: 64, label: 'Partial fit' }, { score: 32, label: 'Low fit' }].map(({ score, label }) => (
              <div key={score} className="flex flex-col items-center gap-1.5">
                <ScoreBadge score={score} />
                <span className="text-xs text-zinc-500">{label}</span>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl overflow-hidden text-left">
            <div className="px-4 py-3 border-b border-zinc-800">
              <p className="text-xs text-zinc-500 uppercase tracking-wide mb-0.5">Stripe</p>
              <p className="text-sm font-semibold text-zinc-100 leading-snug">Senior Software Engineer</p>
              <div className="flex items-center gap-2 mt-2">
                <ScoreBadge score={87} />
                <ActionChip recommendation="apply" />
              </div>
            </div>
            <div className="px-4 py-3 space-y-3 text-xs">
              <div>
                <p className="text-zinc-500 uppercase tracking-wide mb-1">Role Fit</p>
                <p className="text-zinc-300 leading-relaxed">Strong alignment with distributed-systems experience and TypeScript depth. Payment domain background is a direct advantage.</p>
              </div>
              <div>
                <p className="text-zinc-500 uppercase tracking-wide mb-1">Requirements Met</p>
                <ul className="space-y-0.5">
                  {['5+ yrs TypeScript', 'Distributed systems', 'Payment platforms'].map(r => (
                    <li key={r} className="flex gap-1.5 text-zinc-300"><span className="text-emerald-500">✓</span>{r}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-zinc-500 uppercase tracking-wide mb-1">Requirements Missed</p>
                <ul className="space-y-0.5">
                  <li className="flex gap-1.5 text-zinc-400"><span className="text-amber-500">○</span>Go proficiency preferred</li>
                </ul>
              </div>
              <div>
                <p className="text-zinc-500 uppercase tracking-wide mb-1">Red Flags</p>
                <p className="text-zinc-500 italic">None identified</p>
              </div>
              <div>
                <p className="text-zinc-500 uppercase tracking-wide mb-1">Recommendation</p>
                <ActionChip recommendation="apply" />
              </div>
            </div>
          </div>
        </div>
      </FadeInView>
    </div>
  )
}

function FeatureSection4() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-20 flex flex-col md:flex-row-reverse gap-12 items-center border-t border-zinc-800/40">
      <div className="flex-1 space-y-4">
        <h2 className="text-3xl font-bold text-zinc-100">One click. Two documents. Zero boilerplate.</h2>
        <p className="text-zinc-400 leading-relaxed">
          From the Job Drawer, click once to generate a tailored resume and cover letter — each rewritten to match the specific job description. Your profile is the source of truth: all documents are generated from it on demand and stored against the job record so you can preview and download at any time. The resume uses a dynamic layout that expands or trims to the most relevant experience automatically.
        </p>
      </div>
      <FadeInView className="flex-1">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Cover Letter</p>
            <iframe
              src="/cover-letter-preview.pdf"
              className="w-full h-72 border border-zinc-700 rounded pointer-events-none"
              title="Cover letter preview"
              loading="lazy"
            >
              <a href="/cover-letter-preview.pdf" className="text-xs text-zinc-400 underline">View cover letter PDF</a>
            </iframe>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Resume</p>
            <iframe
              src="/resume-preview.pdf"
              className="w-full h-72 border border-zinc-700 rounded pointer-events-none"
              title="Resume preview"
              loading="lazy"
            >
              <a href="/resume-preview.pdf" className="text-xs text-zinc-400 underline">View resume PDF</a>
            </iframe>
          </div>
        </div>
      </FadeInView>
    </div>
  )
}

function FeatureSection5() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-20 flex flex-col md:flex-row gap-12 items-center border-t border-zinc-800/40">
      <div className="flex-1 space-y-4">
        <h2 className="text-3xl font-bold text-zinc-100">Every application, accounted for</h2>
        <p className="text-zinc-400 leading-relaxed">
          Mark a job as applied directly from the Job Drawer to move it into the Applications view. As you update statuses — Applied, Screening, Interview, Offer — each change is recorded in the drawer's status history. Gmail integration is on the roadmap, with plans to surface and map recruiter emails directly to jobs.
        </p>
      </div>
      <FadeInView className="flex-1">
        <div className="rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl overflow-hidden text-left">
          <div className="grid grid-cols-[1fr_1fr_auto] gap-x-3 px-4 py-2 border-b border-zinc-800 text-xs text-zinc-500 uppercase tracking-wide">
            <span>Company</span><span>Role</span><span>Status</span>
          </div>
          {[
            { company: 'Stripe', role: 'Senior SWE', status: 'Interview', color: 'bg-emerald-950 text-emerald-300' },
            { company: 'Linear', role: 'Staff Eng.', status: 'Screening', color: 'bg-blue-950 text-blue-300' },
            { company: 'Vercel', role: 'Platform Eng.', status: 'Applied', color: 'bg-zinc-800 text-zinc-300' },
          ].map(({ company, role, status, color }) => (
            <div key={company} className="grid grid-cols-[1fr_1fr_auto] gap-x-3 items-center px-4 py-2.5 border-b border-zinc-800/50 last:border-b-0 text-xs">
              <span className="text-zinc-200">{company}</span>
              <span className="text-zinc-400">{role}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>{status}</span>
            </div>
          ))}
          <div className="px-4 py-3 border-t border-zinc-800 space-y-2">
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Status History — Stripe</p>
            {[
              { label: 'Interview scheduled', date: 'Jun 10' },
              { label: 'Moved to screening', date: 'Jun 7' },
              { label: 'Applied', date: 'Jun 5' },
            ].map(({ label, date }) => (
              <div key={date} className="flex items-center gap-2 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 shrink-0"></span>
                <span className="text-zinc-300 flex-1">{label}</span>
                <span className="text-zinc-600">{date}</span>
              </div>
            ))}
          </div>
        </div>
      </FadeInView>
    </div>
  )
}

function FadeInView({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const mqlRef = useRef<MediaQueryList | null>(
    typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
  )
  const [prefersReduced, setPrefersReduced] = useState(() => mqlRef.current?.matches ?? false)
  const [inView, setInView] = useState(() => mqlRef.current?.matches ?? false)

  useEffect(() => {
    const mql = mqlRef.current
    if (!mql) return
    const handler = (e: MediaQueryListEvent) => {
      setPrefersReduced(e.matches)
      if (e.matches) setInView(true)
    }
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    if (prefersReduced) return
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          observer.disconnect()
        }
      },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [prefersReduced])

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'} ${className ?? ''}`}
    >
      {children}
    </div>
  )
}

interface DemoTableProps {
  jobs: DemoJob[]
  selectedId: number | null
  onSelect: (id: number) => void
}

function DemoTable({ jobs, selectedId, onSelect }: DemoTableProps) {
  return (
    <div className="flex-1 min-w-0">
      <div className="grid grid-cols-[1fr_1fr_48px_96px] gap-x-3 px-4 py-2.5 border-b border-zinc-800">
        <span className="text-xs text-zinc-500 uppercase tracking-wide">Company</span>
        <span className="text-xs text-zinc-500 uppercase tracking-wide">Role</span>
        <span className="text-xs text-zinc-500 uppercase tracking-wide text-center">Score</span>
        <span className="text-xs text-zinc-500 uppercase tracking-wide">Match</span>
      </div>
      {jobs.map(job => (
        <button
          key={job.id}
          onClick={() => onSelect(job.id)}
          className={`w-full text-left grid grid-cols-[1fr_1fr_48px_96px] gap-x-3 items-center px-4 py-3 border-b border-zinc-800/50 last:border-b-0 hover:bg-zinc-800/50 transition-colors ${
            job.id === selectedId ? 'bg-zinc-800 ring-1 ring-inset ring-blue-500/30' : ''
          }`}
        >
          <span className={`text-sm truncate ${job.id === selectedId ? 'text-zinc-100 font-medium' : 'text-zinc-300'}`}>
            {job.company}
          </span>
          <span className={`text-sm truncate ${job.id === selectedId ? 'text-zinc-200' : 'text-zinc-400'}`}>
            {job.title}
          </span>
          <span className="flex justify-center">
            <ScoreBadge score={job.score} />
          </span>
          <ActionChip recommendation={job.recommendation} />
        </button>
      ))}
    </div>
  )
}

interface DemoDrawerProps {
  job: DemoJob
  onClose: () => void
}

function DemoDrawer({ job, onClose }: DemoDrawerProps) {
  return (
    <>
      <div className="px-4 py-3 border-b border-zinc-800 shrink-0">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wide mb-0.5">{job.company}</p>
            <p className="text-sm font-semibold text-zinc-100 leading-snug">{job.title}</p>
            <div className="flex items-center gap-2 mt-2">
              <ScoreBadge score={job.score} />
              <ActionChip recommendation={job.recommendation} />
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors ml-2 shrink-0 text-base leading-none"
            aria-label="Close drawer"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="px-4 py-3 space-y-4 text-xs overflow-y-auto flex-1">
        <div>
          <p className="text-zinc-500 uppercase tracking-wide mb-1">Role Fit</p>
          <p className="text-zinc-300 leading-relaxed">{job.summary}</p>
        </div>
        <div>
          <p className="text-zinc-500 uppercase tracking-wide mb-1">Requirements Met</p>
          <ul className="space-y-0.5">
            {job.reqsMet.map(r => (
              <li key={r} className="flex gap-1.5 text-zinc-300">
                <span className="text-emerald-500 shrink-0">✓</span>{r}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-zinc-500 uppercase tracking-wide mb-1">Requirements Missed</p>
          <ul className="space-y-0.5">
            {job.reqsMissed.map(r => (
              <li key={r} className="flex gap-1.5 text-zinc-400">
                <span className="text-amber-500 shrink-0">○</span>{r}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-zinc-500 uppercase tracking-wide mb-1">Red Flags</p>
          {job.redFlags.length > 0 ? (
            <ul className="space-y-0.5">
              {job.redFlags.map(r => (
                <li key={r} className="flex gap-1.5 text-red-400">
                  <span className="shrink-0">✕</span>{r}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-zinc-500 italic">None identified</p>
          )}
        </div>
        <div>
          <p className="text-zinc-500 uppercase tracking-wide mb-1">Recommendation</p>
          <ActionChip recommendation={job.recommendation} />
        </div>
      </div>

      <div className="px-4 py-3 border-t border-zinc-800 shrink-0">
        <Link
          to="/register"
          className="block w-full text-center py-2 px-4 rounded bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 hover:bg-zinc-700 hover:text-zinc-100 transition-colors"
        >
          Analyse your own profile →
        </Link>
      </div>
    </>
  )
}

function FaqSection() {
  return (
    <section className="py-24 border-t border-zinc-800/50">
      <div className="max-w-3xl mx-auto px-6">
        <h2 id="faq-heading" className="text-3xl font-bold text-zinc-100 mb-10 text-center">
          Frequently asked questions
        </h2>
        <Accordion type="single" collapsible aria-labelledby="faq-heading" className="space-y-2">
          <AccordionItem value="security" className="border border-zinc-800 rounded-lg px-4">
            <AccordionTrigger className="text-zinc-100 hover:text-zinc-100 hover:no-underline py-4 text-sm font-medium text-left">
              How is my data secured?
            </AccordionTrigger>
            <AccordionContent className="text-zinc-400 text-sm pb-4 leading-relaxed">
              Your job data, resume profile, and API keys are stored in a database on HITLOBSTER's servers — your data is never shared or sold. API keys are encrypted at rest using AES-256-GCM before being written to the database. All traffic is served over HTTPS with Let's Encrypt certificates.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="api-key" className="border border-zinc-800 rounded-lg px-4">
            <AccordionTrigger className="text-zinc-100 hover:text-zinc-100 hover:no-underline py-4 text-sm font-medium text-left">
              Do I need my own Claude API key?
            </AccordionTrigger>
            <AccordionContent className="text-zinc-400 text-sm pb-4 leading-relaxed">
              Yes. HITLOBSTER uses your Anthropic API key to run the AI analysis pipeline — Fit Score, role fit summary, requirements breakdown, resume tailoring, and cover letter generation all call the Claude API on your behalf. Your key is stored encrypted on HITLOBSTER's servers and is never transmitted anywhere except directly to Anthropic. The cost of a typical job search run is a few cents per job analysed.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="job-boards" className="border border-zinc-800 rounded-lg px-4">
            <AccordionTrigger className="text-zinc-100 hover:text-zinc-100 hover:no-underline py-4 text-sm font-medium text-left">
              What job boards does it search?
            </AccordionTrigger>
            <AccordionContent className="text-zinc-400 text-sm pb-4 leading-relaxed">
              HITLOBSTER currently searches LinkedIn. You configure search pairs — a job title and a location — and the discovery pipeline scrapes matching listings on demand. Results are scored for semantic relevance to your resume profile before the full AI analysis runs. More job boards are planned.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="email-sync" className="border border-zinc-800 rounded-lg px-4">
            <AccordionTrigger className="text-zinc-100 hover:text-zinc-100 hover:no-underline py-4 text-sm font-medium text-left">
              How does email sync work?
            </AccordionTrigger>
            <AccordionContent className="text-zinc-400 text-sm pb-4 leading-relaxed">
              Gmail integration is on the roadmap. Once available, you'll be able to connect your Gmail account to surface recruiter outreach, application confirmations, and interview invites — and map them directly to jobs in the app. For now, you can manually update statuses and add notes from the Job Drawer, with each change recorded in the status history.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </section>
  )
}

function ClosingCta() {
  return (
    <section className="py-24 border-t border-zinc-800/50 text-center">
      <div className="max-w-2xl mx-auto px-6">
        <h2 className="text-3xl sm:text-4xl font-bold text-zinc-100 mb-4">
          Stop drowning in job boards.<br />Start making informed decisions.
        </h2>
        <p className="text-zinc-400 mb-10">
          Set up your profile once. Let HITLOBSTER do the searching, scoring, and sorting.
        </p>
        <Button asChild size="lg">
          <Link to="/register">Create your profile</Link>
        </Button>
      </div>
    </section>
  )
}
