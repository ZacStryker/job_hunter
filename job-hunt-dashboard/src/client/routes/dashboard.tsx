import { useState } from 'react'
import {
  ResponsiveContainer,
  Cell,
  BarChart,
  Bar,
  AreaChart,
  Area,
  LabelList,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import type { Stats, StatsPeriod } from '@shared/schemas'
import { STATS_PERIODS } from '@shared/schemas'
import { useStatsQuery, type ArchivedFilter, type AppliedFilter } from '../hooks/useStatsQuery'
import { SCORE_COLORS } from '../utils/scoreColors'

const PERIOD_LABELS: Record<StatsPeriod, string> = {
  '24h': '24h',
  '7d': '7 days',
  '30d': '30 days',
  all: 'All time',
}

const DARK_GRID = '#3f3f46'
const DARK_TICK = '#a1a1aa'
const TOOLTIP_STYLE = { background: '#18181b', border: '1px solid #3f3f46', color: '#f4f4f5', borderRadius: 4, padding: '8px 12px' }

const WORKFLOW_FILL: Record<string, string> = {
  Discovery: '#60a5fa',
  Analysis: '#4ade80',
  'Cover Letter': '#facc15',
  Resume: '#a78bfa',
}

const ACTIVITY_PREVIEW_COUNT = 10

type TooltipPayloadItem = { name: string; value: number; color: string }

function FilteredTooltip({ active, payload, label }: {
  active?: boolean
  payload?: TooltipPayloadItem[]
  label?: string
}): React.JSX.Element | null {
  if (!active || !payload?.length) return null
  const filtered = payload.filter(p => p.value != null && !Number.isNaN(p.value) && p.value !== 0)
  if (!filtered.length) return null
  return (
    <div style={TOOLTIP_STYLE}>
      {label && <p style={{ color: '#f4f4f5', marginBottom: 4, fontSize: 12 }}>{label}</p>}
      {filtered.map(p => (
        <p key={String(p.name ?? '')} style={{ color: p.color ?? '#f4f4f5', margin: '2px 0', fontSize: 12 }}>
          {p.name}: {Number.isInteger(p.value) ? p.value : (p.value as number).toFixed(2)}
        </p>
      ))}
    </div>
  )
}

type LabelContentProps = { x?: number; y?: number; width?: number; height?: number; value?: number }

function LabelInsideTop({ x = 0, y = 0, width = 0, value = 0 }: LabelContentProps): React.JSX.Element {
  if (!value) return <></>
  return <text x={x + width / 2} y={y - 4} fill="#e4e4e7" textAnchor="middle" fontSize={12} fontWeight={600}>{value}</text>
}

function LabelInsideDecimalTop({ x = 0, y = 0, width = 0, value = 0 }: LabelContentProps): React.JSX.Element {
  if (!value) return <></>
  return <text x={x + width / 2} y={y - 4} fill="#e4e4e7" textAnchor="middle" fontSize={12} fontWeight={600}>{(value as number).toFixed(1)}</text>
}

const AXIS_PROPS = {
  tick: { fill: DARK_TICK },
  axisLine: { stroke: DARK_GRID },
  tickLine: false as const,
  allowDecimals: false,
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatShortDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
}

function NoData() {
  return (
    <div className="flex items-center justify-center h-[160px] text-sm text-zinc-500">
      No data for this period
    </div>
  )
}

type ActivityEvent = Stats['recentActivity'][number]

function activityLabel(event: ActivityEvent): string {
  switch (event.type) {
    case 'applied': return `Applied to ${event.jobTitle}`
    case 'status_change': return `Status → ${event.status ?? ''}`.trimEnd()
    case 'resume': return 'Resume generated'
    case 'cover_letter': return 'Cover letter generated'
  }
}

function KpiTile({ icon, label, value, subtext }: { icon: string; label: string; value: string; subtext?: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-zinc-400">
        <span aria-hidden>{icon}</span>
        <span>{label}</span>
      </div>
      <div className="mt-2 text-3xl font-semibold text-zinc-100 tabular-nums">{value}</div>
      {subtext && <div className="mt-1 text-xs text-zinc-500">{subtext}</div>}
    </div>
  )
}

function KpiRow({ kpis }: { kpis: Stats['kpis'] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiTile
        icon="⏱"
        label="Hours saved"
        value={kpis.hoursSaved.toFixed(1)}
        subtext={kpis.hoursSaved === 0 ? 'Automation starts saving on your first run' : undefined}
      />
      <KpiTile icon="🎯" label="Strong matches" value={String(kpis.strongMatches)} subtext="fit score ≥ 80" />
      <KpiTile
        icon="🚀"
        label="Applications sent"
        value={String(kpis.applicationsSent)}
        subtext={kpis.applicationsSent === 0 ? 'Your next application starts here' : undefined}
      />
      <KpiTile
        icon="🔥"
        label="In play right now"
        value={String(kpis.inPlay)}
        subtext={kpis.inPlay === 0 ? 'Apply to get the ball rolling' : undefined}
      />
    </div>
  )
}

function RecentActivityFeed({ events }: { events: Stats['recentActivity'] }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? events : events.slice(0, ACTIVITY_PREVIEW_COUNT)
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">Recent Activity</h2>
      {events.length === 0 ? <NoData /> : (
        <>
          <ul className="divide-y divide-zinc-800">
            {visible.map((event, i) => (
              <li key={i} className="flex items-baseline gap-3 py-2 text-sm">
                <span className="text-xs text-zinc-500 w-14 shrink-0 tabular-nums">{formatShortDate(event.timestamp)}</span>
                <span className="text-zinc-200">{activityLabel(event)}</span>
                <span className="text-zinc-500 ml-auto truncate">{event.company}</span>
              </li>
            ))}
          </ul>
          {events.length > ACTIVITY_PREVIEW_COUNT && (
            <button
              onClick={() => setExpanded(s => !s)}
              className="mt-3 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              {expanded ? 'Show less' : `Show more (${events.length - ACTIVITY_PREVIEW_COUNT})`}
            </button>
          )}
        </>
      )}
    </div>
  )
}

function JobsByFitScore({ data }: { data: Stats['jobsByFitScore'] }) {
  const empty = data.every(d => d.count === 0)
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-2">
      <div className="text-sm font-medium text-zinc-400 mb-1.5">Jobs by Fit Score</div>
      {empty ? <NoData /> : (
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data} margin={{ top: 18, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid stroke={DARK_GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="fitRange" {...AXIS_PROPS} fontSize={11} />
            <YAxis {...AXIS_PROPS} />
            <Tooltip content={<FilteredTooltip />} />
            <Bar dataKey="count" name="Jobs">
              {data.map((d, i) => <Cell key={d.fitRange} fill={SCORE_COLORS[i] ?? '#60a5fa'} />)}
              <LabelList dataKey="count" content={LabelInsideTop as (props: object) => React.JSX.Element} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

function TimeSavedByWorkflow({ data }: { data: Stats['timeSavedByWorkflow'] }) {
  const empty = data.every(d => d.hours === 0)
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-2">
      <div className="text-sm font-medium text-zinc-400 mb-1.5">Time Saved by Workflow</div>
      {empty ? <NoData /> : (
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data} margin={{ top: 18, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid stroke={DARK_GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="workflow" {...AXIS_PROPS} fontSize={11} />
            <YAxis {...AXIS_PROPS} unit="h" allowDecimals />
            <Tooltip content={<FilteredTooltip />} />
            <Bar dataKey="hours" name="Hours">
              {data.map((d) => <Cell key={d.workflow} fill={WORKFLOW_FILL[d.workflow] ?? '#60a5fa'} />)}
              <LabelList dataKey="hours" content={LabelInsideDecimalTop as (props: object) => React.JSX.Element} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

const COST_WORKFLOWS = ['Discovery', 'Analysis', 'Cover Letter', 'Resume'] as const

function WorkflowCostOverTime({ data }: { data: Stats['workflowCostOverTime'] }) {
  const empty = data.every(d => d.Discovery === 0 && d.Analysis === 0 && d['Cover Letter'] === 0 && d.Resume === 0)
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-2">
      <div className="text-sm font-medium text-zinc-400 mb-1.5">Workflow Cost Over Time</div>
      {empty ? <NoData /> : (
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={data} margin={{ top: 18, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid stroke={DARK_GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" {...AXIS_PROPS} fontSize={11} tickFormatter={formatShortDate} />
            <YAxis {...AXIS_PROPS} unit="$" allowDecimals />
            <Tooltip content={<FilteredTooltip />} />
            {COST_WORKFLOWS.map(wf => (
              <Area key={wf} type="monotone" dataKey={wf} stackId="1" stroke={WORKFLOW_FILL[wf]} fill={WORKFLOW_FILL[wf]} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

export function DashboardRoute() {
  const [period, setPeriod] = useState<StatsPeriod>('all')
  const [archivedFilter, setArchivedFilter] = useState<ArchivedFilter>('active')
  const [appliedFilter, setAppliedFilter] = useState<AppliedFilter>('all')
  const { data, isPending, isError, error } = useStatsQuery(period, archivedFilter, appliedFilter)

  const filterBar = (
    <div className="flex items-center gap-1">
      {STATS_PERIODS.map((p) => (
        <button
          key={p}
          onClick={() => setPeriod(p)}
          className={[
            'px-2.5 py-1 text-xs rounded transition-colors',
            period === p ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800',
          ].join(' ')}
        >
          {PERIOD_LABELS[p]}
        </button>
      ))}
      <div className="w-px h-4 bg-zinc-700 mx-1.5" />
      {(['active', 'archived', 'all'] as ArchivedFilter[]).map((f) => (
        <button
          key={f}
          onClick={() => setArchivedFilter(f)}
          className={[
            'px-2.5 py-1 text-xs rounded transition-colors',
            archivedFilter === f ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800',
          ].join(' ')}
        >
          {f.charAt(0).toUpperCase() + f.slice(1)}
        </button>
      ))}
      <div className="w-px h-4 bg-zinc-700 mx-1.5" />
      {(['unapplied', 'applied', 'all'] as AppliedFilter[]).map((f) => (
        <button
          key={f}
          onClick={() => setAppliedFilter(f)}
          className={[
            'px-2.5 py-1 text-xs rounded transition-colors',
            appliedFilter === f ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800',
          ].join(' ')}
        >
          {f.charAt(0).toUpperCase() + f.slice(1)}
        </button>
      ))}
    </div>
  )

  return (
    <div className="p-4 space-y-6 max-w-5xl mx-auto">
      {filterBar}

      {isPending && <div className="flex items-center justify-center py-16 text-sm text-zinc-400">Loading…</div>}
      {isError && <div className="text-sm text-red-400">{error instanceof Error ? error.message : 'Error loading stats'}</div>}

      {data && data.totalJobs === 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-8 text-center text-zinc-400">
          No jobs scraped yet — start a Discovery run to populate your dashboard.
        </div>
      )}

      {data && data.totalJobs > 0 && (
        <div className="space-y-4">
          <KpiRow kpis={data.kpis} />
          <RecentActivityFeed events={data.recentActivity} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <JobsByFitScore data={data.jobsByFitScore} />
            <TimeSavedByWorkflow data={data.timeSavedByWorkflow} />
          </div>
          <WorkflowCostOverTime data={data.workflowCostOverTime} />
        </div>
      )}
    </div>
  )
}
