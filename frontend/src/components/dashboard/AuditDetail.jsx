function AuditDetail({ auditDetail }) {
  if (!auditDetail) return null

  return (
    <section className="mt-8 space-y-8">
      <div className="dashboard-panel">
        <div className="flex items-center justify-between gap-4">
          <div><p className="text-sm text-slate-400">Audit summary</p><h2 className="mt-2 text-2xl font-bold text-white">{auditDetail.road_class}</h2></div>
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-300">{auditDetail.status}</span>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4"><p className="text-sm text-slate-400">Compliance</p><p className="mt-2 text-2xl font-bold text-white">{auditDetail.compliance_score}</p></div>
          <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4"><p className="text-sm text-slate-400">Radius</p><p className="mt-2 text-lg font-semibold text-white">{auditDetail.radius_m} m</p></div>
          <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4"><p className="text-sm text-slate-400">Center</p><p className="mt-2 text-lg font-semibold text-white">{auditDetail.center_lat}, {auditDetail.center_lng}</p></div>
          <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4"><p className="text-sm text-slate-400">Created</p><p className="mt-2 text-sm font-medium text-slate-200">{new Date(auditDetail.created_at).toLocaleString()}</p></div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="dashboard-panel"><h3 className="text-xl font-semibold text-white">Checklist</h3><div className="mt-4 space-y-3">{auditDetail.checklist.map((item, index) => <div key={`${item.section}-${index}`} className="rounded-xl border border-slate-700 bg-slate-950/60 p-4"><div className="flex items-center justify-between gap-3"><p className="font-medium text-sky-300">{item.item}</p><span className="rounded-full border border-slate-600 bg-slate-800 px-2 py-1 text-[10px] uppercase tracking-wide text-slate-200">{item.status}</span></div><p className="mt-2 text-xs uppercase tracking-wide text-slate-400">{item.section}</p><p className="mt-2 text-sm text-slate-300">{item.evidence}</p></div>)}</div></div>
        <div className="dashboard-panel"><h3 className="text-xl font-semibold text-white">Segments</h3><div className="mt-4 space-y-3">{auditDetail.segments.map((segment, index) => <div key={segment.id} className="rounded-xl border border-slate-700 bg-slate-950/60 p-4"><div className="flex items-center justify-between gap-3"><p className="font-medium text-white">{segment.name}</p><span className="rounded-full border border-slate-600 bg-slate-800 px-2 py-1 text-[10px] uppercase tracking-wide text-slate-200">{segment.risk_level}</span></div><div className="mt-2 grid grid-cols-2 gap-2 text-sm text-slate-300"><p>Length: {segment.length_m} m</p><p>Risk score: {segment.risk_score}</p></div><div className="mt-3"><p className="text-xs uppercase tracking-wide text-slate-400">Flags</p><div className="mt-2 flex flex-wrap gap-2">{segment.risk_flags.length ? segment.risk_flags.map((flag) => <span key={`${segment.id}-${flag}`} className="rounded-full bg-sky-500/10 px-2 py-1 text-xs text-sky-300">{flag}</span>) : <span className="text-xs text-emerald-300">No risk flags</span>}</div></div>{index === 0 && <p className="mt-3 text-xs text-slate-400">Geometry source: {segment.source}</p>}</div>)}</div></div>
      </div>
    </section>
  )
}

export default AuditDetail
