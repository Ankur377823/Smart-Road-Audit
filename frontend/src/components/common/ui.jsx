import { IconArrowLeft } from './Icons'

/** Page title block with optional back link and actions (actions stack under the title on phones). */
export function PageHeader({ title, description, actions, onBack, backLabel = 'Back' }) {
  return (
    <div className="mb-6 sm:mb-8">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-900"
        >
          <IconArrowLeft className="size-4" />
          {backLabel}
        </button>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
          {description && <p className="mt-1.5 text-sm text-slate-600 sm:text-base">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  )
}

const TONES = {
  neutral: 'bg-slate-100 text-slate-700',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  orange: 'bg-orange-50 text-orange-700 ring-orange-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
}

export function Badge({ tone = 'neutral', children, className = '' }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ring-1 ring-inset ring-slate-500/10 ${TONES[tone]} ${className}`}>
      {children}
    </span>
  )
}

const STATUS_TONE = { ready: 'green', completed: 'green', processing: 'blue', failed: 'red' }

export function StatusBadge({ status }) {
  const key = status?.toLowerCase()
  return <Badge tone={STATUS_TONE[key] || 'amber'}>{status || 'pending'}</Badge>
}

const RISK_TONE = { low: 'green', medium: 'amber', high: 'orange', critical: 'red' }

export function RiskBadge({ level }) {
  return <Badge tone={RISK_TONE[level?.toLowerCase()] || 'neutral'}>{level || 'Pending'}</Badge>
}

export function StatCard({ label, value, hint, valueClassName = 'text-slate-900' }) {
  return (
    <div className="card p-4 sm:p-5">
      <p className="text-xs font-medium text-slate-500 sm:text-sm">{label}</p>
      <p className={`mt-1.5 text-2xl font-bold tracking-tight sm:text-3xl ${valueClassName}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  )
}

export function EmptyState({ title, description, action }) {
  return (
    <div className="px-6 py-12 text-center">
      <h3 className="font-semibold text-slate-900">{title}</h3>
      {description && <p className="mx-auto mt-1.5 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

const NOTICE_TONES = {
  info: 'border-slate-200 bg-slate-50 text-slate-700',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  error: 'border-red-200 bg-red-50 text-red-700',
}

export function Notice({ tone = 'info', children, className = '' }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-4 py-3 text-sm ${NOTICE_TONES[tone]} ${className}`}>
      {children}
    </div>
  )
}

/** Card section with a header row. */
export function Section({ title, description, actions, children, className = '' }) {
  return (
    <section className={`card overflow-hidden ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-slate-200 px-4 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  )
}

export function SkeletonPage() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="h-8 w-56 animate-pulse rounded bg-slate-200" />
      <div className="mt-3 h-4 w-72 max-w-full animate-pulse rounded bg-slate-200" />
      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-200/70" />
        ))}
      </div>
      <div className="mt-6 h-64 animate-pulse rounded-xl bg-slate-200/70" />
    </div>
  )
}
