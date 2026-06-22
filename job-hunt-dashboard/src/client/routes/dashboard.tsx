import { useState } from 'react'
import {
  ResponsiveContainer,
  Cell,
  BarChart,
  Bar,
  LabelList,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import type { Stats, StatsPeriod } from '@shared/schemas'
import { STATS_PERIODS } from '@shared/schemas'
import { useStatsQuery, type ArchivedFilter } from '../hooks/useStatsQuery'

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
            <Bar dataKey="count" name="Jobs" fill="#60a5fa">
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

function ActivityHeatmap({ data }: { data: Stats['activityHeatmap'] }) {
  const countByDate = new Map(data.map(d => [d.date, d.count]))
  const cells: { date: string; count: number }[] = []
  for (let i = 89; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10)
    cells.push({ date: d, count: countByDate.get(d) ?? 0 })
  }
  const cellColor = (c: number) => c === 0 ? '#27272a' : c === 1 ? '#14532d' : c <= 3 ? '#15803d' : '#22c55e'
  const cols = Math.ceil(cells.length / 7)
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-2">
      <div className="text-sm font-medium text-zinc-400 mb-1.5">Activity (last 90 days)</div>
      <div className="flex gap-[3px] overflow-x-auto py-2">
        {Array.from({ length: cols }, (_, col) => (
          <div key={col} className="flex flex-col gap-[3px]">
            {cells.slice(col * 7, col * 7 + 7).map(cell => (
              <div
                key={cell.date}
                title={`${cell.date}: ${cell.count} ${cell.count === 1 ? 'activity' : 'activities'}`}
                className="w-3 h-3 rounded-sm shrink-0"
                style={{ background: cellColor(cell.count) }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function DashboardRoute() {
  const [period, setPeriod] = useState<StatsPeriod>('all')
  const [archivedFilter, setArchivedFilter] = useState<ArchivedFilter>('active')
  const { data, isPending, isError, error } = useStatsQuery(period, archivedFilter)

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
          <RecentActivityFeed events={data.recentActivity} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <JobsByFitScore data={data.jobsByFitScore} />
            <TimeSavedByWorkflow data={data.timeSavedByWorkflow} />
          </div>
          <ActivityHeatmap data={data.activityHeatmap} />
        </div>
      )}
    </div>
  )
}
