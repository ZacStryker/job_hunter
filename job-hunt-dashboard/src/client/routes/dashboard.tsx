import { useState } from 'react'
import {
  ResponsiveContainer,
  Cell,
  BarChart,
  Bar,
  LabelList,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import type { StatsPeriod } from '@shared/schemas'
import { STATS_PERIODS } from '@shared/schemas'
import { useStatsQuery, type ArchivedFilter } from '../hooks/useStatsQuery'

const PERIOD_LABELS: Record<StatsPeriod, string> = {
  '24h': '24h',
  '7d': '7 days',
  '30d': '30 days',
  all: 'All time',
}

const SOURCE_COLOR_MAP: Record<string, string> = {
  linkedin: '#60a5fa',
  indeed: '#4ade80',
  indeed_nl: '#a78bfa',
  arc: '#fb923c',
  manual: '#f472b6',
}

const REC_COLOR_MAP: Record<string, string> = {
  Apply: '#4ade80',
  Investigate: '#facc15',
}

const SCORE_COLORS = ['#ef4444', '#f87171', '#fb923c', '#fbbf24', '#facc15', '#a3e635', '#4ade80', '#34d399', '#22d3ee', '#60a5fa']

const STATUS_COLOR_MAP: Record<string, string> = {
  'No Response': '#a1a1aa',
  Submitted: '#60a5fa',
  Rejected: '#f87171',
  Screening: '#facc15',
  Interview: '#86efac',
  Offer: '#16a34a',
  Other: '#fb923c',
}

const WORKFLOW_COLOR_MAP: Record<string, string> = {
  Discovery: '#60a5fa',
  Analysis: '#4ade80',
  'Cover Letter': '#facc15',
  Resume: '#a78bfa',
}

const DARK_GRID = '#3f3f46'
const DARK_TICK = '#a1a1aa'
const TOOLTIP_STYLE = { background: '#18181b', border: '1px solid #3f3f46', color: '#f4f4f5', borderRadius: 4, padding: '8px 12px' }

type TooltipPayloadItem = { name: string; value: number; color: string }

function FilteredTooltip({ active, payload, label }: {
  active?: boolean
  payload?: TooltipPayloadItem[]
  label?: string
}): React.JSX.Element | null {
  if (!active || !payload?.length) return null
  const filtered = payload.filter(p => p.value != null && !Number.isNaN(p.value) && p.value !== 0)
  if (!filtered.length) return null
  const displayLabel = typeof label === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(label)
    ? formatPerDayDate(label)
    : label
  return (
    <div style={TOOLTIP_STYLE}>
      {displayLabel && <p style={{ color: '#f4f4f5', marginBottom: 4, fontSize: 12 }}>{displayLabel}</p>}
      {filtered.map(p => (
        <p key={String(p.name ?? '')} style={{ color: p.color ?? '#f4f4f5', margin: '2px 0', fontSize: 12 }}>
          {p.name}: {Number.isInteger(p.value) ? p.value : (p.value as number).toFixed(2)}
        </p>
      ))}
    </div>
  )
}

type LabelContentProps = { x?: number; y?: number; width?: number; height?: number; value?: number }

function LabelInsideTop({ x = 0, y = 0, width = 0, height = 0, value = 0 }: LabelContentProps): React.JSX.Element {
  if (!value || height < 30) return <></>
  return <text x={x + width / 2} y={y + 20} fill="#ffffff" textAnchor="middle" fontSize={13} fontWeight={600}>{value}</text>
}

function LabelInsideCostTop({ x = 0, y = 0, width = 0, height = 0, value = 0 }: LabelContentProps): React.JSX.Element {
  if (!value || height < 30) return <></>
  return <text x={x + width / 2} y={y + 20} fill="#ffffff" textAnchor="middle" fontSize={13} fontWeight={600}>{(value as number).toFixed(2)}</text>
}

const AXIS_PROPS = {
  tick: { fill: DARK_TICK },
  axisLine: { stroke: DARK_GRID },
  tickLine: false as const,
  allowDecimals: false,
}

function formatPerDayDate(d: unknown): string {
  if (typeof d !== 'string') return String(d)
  const parts = d.split('-')
  if (parts.length !== 3) return d
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const m = parseInt(parts[1], 10) - 1
  const day = parseInt(parts[2], 10)
  return (m >= 0 && m < 12) ? `${MONTHS[m]} ${day}` : d
}

function NoData() {
  return (
    <div className="flex items-center justify-center h-[120px] text-sm text-zinc-500">
      No data for this period
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-2">
      <div className="text-xs text-zinc-500 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-lg font-semibold text-zinc-100">{value}</div>
    </div>
  )
}

function ChartCard({
  title,
  children,
  tableHeaders,
  tableData,
}: {
  title: string
  children: React.ReactNode
  tableHeaders: string[]
  tableData: (string | number)[][]
}) {
  const [showTable, setShowTable] = useState(false)
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-2">
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-sm font-medium text-zinc-400">{title}</div>
        <button
          onClick={() => setShowTable((s) => !s)}
          className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-0.5 rounded hover:bg-zinc-800 transition-colors"
        >
          {showTable ? 'Chart' : 'Data'}
        </button>
      </div>
      {showTable ? (
        <div className="overflow-auto h-[120px]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-zinc-900">
              <tr className="border-b border-zinc-700">
                {tableHeaders.map((h) => (
                  <th key={h} className="text-left pb-2 pr-6 text-zinc-500 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableData.map((row, i) => (
                <tr key={i} className="border-b border-zinc-800">
                  {row.map((cell, j) => (
                    <td key={j} className="py-1.5 pr-6 text-zinc-300">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : children}
    </div>
  )
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

const APP_STATUS_KEYS = ['No Response', 'Submitted', 'Rejected', 'Screening', 'Interview', 'Offer', 'Other'] as const
const WORKFLOW_KEYS = ['Discovery', 'Analysis', 'Cover Letter', 'Resume'] as const

export function DashboardRoute() {
  const [period, setPeriod] = useState<StatsPeriod>('all')
  const [archivedFilter, setArchivedFilter] = useState<ArchivedFilter>('active')
  const { data, isPending, isError, error } = useStatsQuery(period, archivedFilter)

  return (
    <div className="p-2 space-y-4">
      {/* Filter bar: period + archivedFilter only */}
      <div className="flex items-center gap-1">
        {STATS_PERIODS.map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={[
              'px-2.5 py-1 text-xs rounded transition-colors',
              period === p
                ? 'bg-zinc-700 text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800',
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
              archivedFilter === f
                ? 'bg-zinc-700 text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800',
            ].join(' ')}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {isPending && (
        <div className="flex items-center justify-center py-16 text-sm text-zinc-400">Loading…</div>
      )}

      {isError && (
        <div className="text-sm text-red-400">{error instanceof Error ? error.message : 'Error loading stats'}</div>
      )}

      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">

          {/* ── Q01 Automations ── */}
          <section className="space-y-1.5 min-w-0">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Automations</h2>
            <div className="grid grid-cols-3 gap-2">
              <StatCard label="Workflow Runs" value={String(data.automation.totalRuns)} />
              <StatCard label="Tokens" value={formatTokens(data.automation.totalTokens)} />
              <StatCard label="Cost" value={`$${data.automation.totalCost.toFixed(2)}`} />
            </div>
            {data.automation.perDay.length > 0 && (
              <ChartCard
                title="Workflows per Day by Workflow Type"
                tableHeaders={['Date', 'Discovery', 'Analysis', 'Cover Letter', 'Resume']}
                tableData={data.automation.perDay.map(e => [e.date, e.Discovery, e.Analysis, e['Cover Letter'], e.Resume])}
              >
                <ResponsiveContainer width="100%" height={120}>
                  <AreaChart data={data.automation.perDay}>
                    <defs>
                      {WORKFLOW_KEYS.map(k => (
                        <linearGradient key={k} id={`gradAuto${k.replace(/ /g, '')}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={WORKFLOW_COLOR_MAP[k]} stopOpacity={0.6} />
                          <stop offset="95%" stopColor={WORKFLOW_COLOR_MAP[k]} stopOpacity={0.1} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={DARK_GRID} />
                    <XAxis dataKey="date" {...AXIS_PROPS} tickFormatter={formatPerDayDate} />
                    <YAxis {...AXIS_PROPS} />
                    <Tooltip content={<FilteredTooltip />} />
                    <Legend wrapperStyle={{ color: DARK_TICK, fontSize: 11 }} />
                    {WORKFLOW_KEYS.map(k => (
                      <Area key={k} type="monotone" dataKey={k} stackId="1" stroke={WORKFLOW_COLOR_MAP[k]} fill={`url(#gradAuto${k.replace(/ /g, '')})`} />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
            <ChartCard
              title="Cost Breakdown"
              tableHeaders={['Workflow', 'Cost ($)']}
              tableData={data.automation.costByWorkflow.map(e => [e.workflow, e.cost.toFixed(2)])}
            >
              {data.automation.costByWorkflow.every(e => e.cost === 0) ? <NoData /> : (
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={data.automation.costByWorkflow}>
                    <CartesianGrid strokeDasharray="3 3" stroke={DARK_GRID} />
                    <XAxis dataKey="workflow" {...AXIS_PROPS} />
                    <YAxis {...AXIS_PROPS} allowDecimals={true} />
                    <Tooltip content={<FilteredTooltip />} />
                    <Bar dataKey="cost">
                      {data.automation.costByWorkflow.map(entry => (
                        <Cell key={entry.workflow} fill={WORKFLOW_COLOR_MAP[entry.workflow] ?? '#a1a1aa'} />
                      ))}
                      <LabelList dataKey="cost" content={LabelInsideCostTop as (props: object) => React.JSX.Element} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </section>

          {/* ── Q02 Jobs ── */}
          <section className="space-y-1.5 min-w-0">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Jobs</h2>
            <div className="grid grid-cols-3 gap-2">
              <StatCard label="Jobs" value={String(data.jobs.total)} />
              <StatCard label="Companies" value={String(data.jobs.companies)} />
              <StatCard label="Sources" value={String(data.jobs.sources)} />
            </div>
            {data.jobs.perDay.length > 0 && (
              <ChartCard
                title="Jobs per Day by Source"
                tableHeaders={['Date', 'LinkedIn', 'Indeed', 'Indeed NL', 'Arc', 'Manual']}
                tableData={data.jobs.perDay.map(e => [e.date, e.linkedin, e.indeed, e.indeed_nl, e.arc, e.manual])}
              >
                <ResponsiveContainer width="100%" height={120}>
                  <AreaChart data={data.jobs.perDay}>
                    <defs>
                      <linearGradient id="gradJobsLinkedin" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={SOURCE_COLOR_MAP.linkedin} stopOpacity={0.6} />
                        <stop offset="95%" stopColor={SOURCE_COLOR_MAP.linkedin} stopOpacity={0.1} />
                      </linearGradient>
                      <linearGradient id="gradJobsIndeed" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={SOURCE_COLOR_MAP.indeed} stopOpacity={0.6} />
                        <stop offset="95%" stopColor={SOURCE_COLOR_MAP.indeed} stopOpacity={0.1} />
                      </linearGradient>
                      <linearGradient id="gradJobsIndeedNl" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={SOURCE_COLOR_MAP.indeed_nl} stopOpacity={0.6} />
                        <stop offset="95%" stopColor={SOURCE_COLOR_MAP.indeed_nl} stopOpacity={0.1} />
                      </linearGradient>
                      <linearGradient id="gradJobsArc" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={SOURCE_COLOR_MAP.arc} stopOpacity={0.6} />
                        <stop offset="95%" stopColor={SOURCE_COLOR_MAP.arc} stopOpacity={0.1} />
                      </linearGradient>
                      <linearGradient id="gradJobsManual" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={SOURCE_COLOR_MAP.manual} stopOpacity={0.6} />
                        <stop offset="95%" stopColor={SOURCE_COLOR_MAP.manual} stopOpacity={0.1} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={DARK_GRID} />
                    <XAxis dataKey="date" {...AXIS_PROPS} tickFormatter={formatPerDayDate} />
                    <YAxis {...AXIS_PROPS} />
                    <Tooltip content={<FilteredTooltip />} />
                    <Legend wrapperStyle={{ color: DARK_TICK, fontSize: 11 }} />
                    <Area type="monotone" dataKey="linkedin" stackId="1" stroke={SOURCE_COLOR_MAP.linkedin} fill="url(#gradJobsLinkedin)" />
                    <Area type="monotone" dataKey="indeed" stackId="1" stroke={SOURCE_COLOR_MAP.indeed} fill="url(#gradJobsIndeed)" />
                    <Area type="monotone" dataKey="indeed_nl" stackId="1" stroke={SOURCE_COLOR_MAP.indeed_nl} fill="url(#gradJobsIndeedNl)" />
                    <Area type="monotone" dataKey="arc" stackId="1" stroke={SOURCE_COLOR_MAP.arc} fill="url(#gradJobsArc)" />
                    <Area type="monotone" dataKey="manual" stackId="1" stroke={SOURCE_COLOR_MAP.manual} fill="url(#gradJobsManual)" />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
            {data.jobs.perDay.length > 0 && (
            <ChartCard
              title="Source Breakdown"
              tableHeaders={['Source', 'Count']}
              tableData={data.jobs.bySource.filter(e => e.value > 0).map(e => [e.name, e.value])}
            >
              {data.jobs.bySource.every(e => e.value === 0) ? <NoData /> : (
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={data.jobs.bySource.filter(e => e.value > 0)}>
                    <CartesianGrid strokeDasharray="3 3" stroke={DARK_GRID} />
                    <XAxis dataKey="name" {...AXIS_PROPS} />
                    <YAxis {...AXIS_PROPS} />
                    <Tooltip content={<FilteredTooltip />} />
                    <Bar dataKey="value">
                      {data.jobs.bySource.filter(e => e.value > 0).map(entry => (
                        <Cell key={entry.name} fill={SOURCE_COLOR_MAP[entry.name] ?? '#a1a1aa'} />
                      ))}
                      <LabelList dataKey="value" content={LabelInsideTop as (props: object) => React.JSX.Element} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
            )}
          </section>

          {/* ── Q03 Matches ── */}
          <section className="space-y-1.5 min-w-0">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Matches</h2>
            <div className="grid grid-cols-3 gap-2">
              <StatCard label="Matches" value={String(data.matches.total)} />
              <StatCard label="Investigate" value={String(data.matches.investigate)} />
              <StatCard label="Apply" value={String(data.matches.apply)} />
            </div>
            {data.matches.perDay.length > 0 && (
              <ChartCard
                title="Matches per Day by Recommendation"
                tableHeaders={['Date', 'Apply', 'Investigate']}
                tableData={data.matches.perDay.map(e => [e.date, e.apply, e.investigate])}
              >
                <ResponsiveContainer width="100%" height={120}>
                  <AreaChart data={data.matches.perDay}>
                    <defs>
                      <linearGradient id="gradMatchesApply" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={REC_COLOR_MAP.Apply} stopOpacity={0.6} />
                        <stop offset="95%" stopColor={REC_COLOR_MAP.Apply} stopOpacity={0.1} />
                      </linearGradient>
                      <linearGradient id="gradMatchesInvestigate" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={REC_COLOR_MAP.Investigate} stopOpacity={0.6} />
                        <stop offset="95%" stopColor={REC_COLOR_MAP.Investigate} stopOpacity={0.1} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={DARK_GRID} />
                    <XAxis dataKey="date" {...AXIS_PROPS} tickFormatter={formatPerDayDate} />
                    <YAxis {...AXIS_PROPS} />
                    <Tooltip content={<FilteredTooltip />} />
                    <Legend wrapperStyle={{ color: DARK_TICK, fontSize: 11 }} />
                    <Area type="monotone" dataKey="apply" stackId="1" stroke={REC_COLOR_MAP.Apply} fill="url(#gradMatchesApply)" />
                    <Area type="monotone" dataKey="investigate" stackId="1" stroke={REC_COLOR_MAP.Investigate} fill="url(#gradMatchesInvestigate)" />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
            <ChartCard
              title="Score Breakdown"
              tableHeaders={['Score', 'Count']}
              tableData={data.matches.byScore.map(e => [e.score, e.count])}
            >
              {data.matches.byScore.every(e => e.count === 0) ? <NoData /> : (
                <ResponsiveContainer width="100%" height={140} style={{ overflow: 'visible' }}>
                  <BarChart data={data.matches.byScore} style={{ overflow: 'visible' }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={DARK_GRID} />
                    <XAxis dataKey="score" {...AXIS_PROPS} angle={-35} textAnchor="end" interval={0} height={45} />
                    <YAxis {...AXIS_PROPS} />
                    <Tooltip content={<FilteredTooltip />} />
                    <Bar dataKey="count">
                      {data.matches.byScore.map((entry, i) => (
                        <Cell key={entry.score} fill={SCORE_COLORS[i] ?? '#a1a1aa'} />
                      ))}
                      <LabelList dataKey="count" content={LabelInsideTop as (props: object) => React.JSX.Element} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </section>

          {/* ── Q04 Applications ── */}
          <section className="space-y-1.5 min-w-0">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Applications</h2>
            <div className="grid grid-cols-3 gap-2">
              <StatCard label="Applications" value={String(data.applications.total)} />
              <StatCard label="Companies" value={String(data.applications.companies)} />
              <StatCard label="Responses" value={String(data.applications.responses)} />
            </div>
            {data.applications.perDay.length > 0 && (
              <ChartCard
                title="Applications per Day by Response Type"
                tableHeaders={['Date', 'No Response', 'Submitted', 'Rejected', 'Screening', 'Interview', 'Offer', 'Other']}
                tableData={data.applications.perDay.map(e => [e.date, e['No Response'], e.Submitted, e.Rejected, e.Screening, e.Interview, e.Offer, e.Other])}
              >
                <ResponsiveContainer width="100%" height={120}>
                  <AreaChart data={data.applications.perDay}>
                    <defs>
                      {APP_STATUS_KEYS.map(k => (
                        <linearGradient key={k} id={`gradApp${k.replace(/ /g, '')}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={STATUS_COLOR_MAP[k]} stopOpacity={0.6} />
                          <stop offset="95%" stopColor={STATUS_COLOR_MAP[k]} stopOpacity={0.1} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={DARK_GRID} />
                    <XAxis dataKey="date" {...AXIS_PROPS} tickFormatter={formatPerDayDate} />
                    <YAxis {...AXIS_PROPS} />
                    <Tooltip content={<FilteredTooltip />} />
                    <Legend wrapperStyle={{ color: DARK_TICK, fontSize: 11 }} />
                    {APP_STATUS_KEYS.map(k => (
                      <Area key={k} type="monotone" dataKey={k} stackId="1" stroke={STATUS_COLOR_MAP[k]} fill={`url(#gradApp${k.replace(/ /g, '')})`} />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
            <ChartCard
              title="Status Breakdown"
              tableHeaders={['Status', 'Count']}
              tableData={data.applications.byStatus.filter(e => e.status !== 'No Response').map(e => [e.status, e.count])}
            >
              {data.applications.byStatus.filter(e => e.status !== 'No Response').every(e => e.count === 0) ? <NoData /> : (
                <ResponsiveContainer width="100%" height={140} style={{ overflow: 'visible' }}>
                  <BarChart data={data.applications.byStatus.filter(e => e.status !== 'No Response')} style={{ overflow: 'visible' }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={DARK_GRID} />
                    <XAxis dataKey="status" {...AXIS_PROPS} angle={-35} textAnchor="end" interval={0} height={55} />
                    <YAxis {...AXIS_PROPS} />
                    <Tooltip content={<FilteredTooltip />} />
                    <Bar dataKey="count">
                      {data.applications.byStatus.filter(e => e.status !== 'No Response').map(entry => (
                        <Cell key={entry.status} fill={STATUS_COLOR_MAP[entry.status] ?? '#a1a1aa'} />
                      ))}
                      <LabelList dataKey="count" content={LabelInsideTop as (props: object) => React.JSX.Element} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </section>

        </div>
      )}
    </div>
  )
}
