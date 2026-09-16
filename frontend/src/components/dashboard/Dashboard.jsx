import AuditDetail from './AuditDetail'

function Dashboard({ audits, form, result, auditDetail, error, loading, onLogout, onChange, onSubmit, onNewAudit }) {
  const completedAudits = audits.filter((audit) => audit.status === 'completed').length
  const averageCompliance = audits.length ? Math.round(audits.reduce((total, audit) => total + audit.compliance_score, 0) / audits.length) : '—'

  return (
    <main className="dashboard-shell min-h-screen text-slate-100">
      <aside className="dashboard-sidebar">
        <button onClick={onNewAudit} className="brand-mark text-left"><span className="brand-dot" /><span>SmartRoad <b>Audit</b></span></button>
        <div className="sidebar-section"><p className="sidebar-label">Workspace</p><button className="sidebar-link active"><span>◈</span> Overview</button><button onClick={onNewAudit} className="sidebar-link"><span>＋</span> New audit</button><button onClick={() => document.getElementById('audit-history')?.scrollIntoView({ behavior: 'smooth' })} className="sidebar-link"><span>▤</span> Audit history</button></div>
        <div className="sidebar-footer"><div className="user-chip"><span className="avatar">AD</span><span><b>Admin user</b><small>Workspace owner</small></span></div><button onClick={onLogout} className="logout-button">Sign out ↗</button></div>
      </aside>

      <div className="dashboard-content">
        <header className="dashboard-header"><div><p className="eyebrow">Wednesday, September 16, 2026</p><h1>Good morning, admin.</h1></div><button onClick={onNewAudit} className="primary-button">+ New audit</button></header>
        <section className="dashboard-intro"><div><p className="eyebrow">Workspace overview</p><h2>Know the road<br /><em>before you move.</em></h2></div><p>Monitor your latest safety audits and make the next decision with confidence.</p></section>
        <section className="metrics-row"><div><span className="metric-icon blue">◈</span><p>Total audits</p><strong>{audits.length}</strong><small>Saved assessments</small></div><div><span className="metric-icon green">✓</span><p>Completed</p><strong>{completedAudits}</strong><small>Ready for review</small></div><div><span className="metric-icon amber">!</span><p>Avg. compliance</p><strong>{averageCompliance}<small className="percent">%</small></strong><small>Across all audits</small></div></section>

        <div className="grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
          <form id="create-audit" onSubmit={onSubmit} className="dashboard-panel"><h2 className="text-xl font-semibold text-white">Create audit</h2><div className="mt-6 grid gap-5 md:grid-cols-2">
            <label className="block text-sm text-slate-300">Center latitude<input name="center_lat" type="number" step="0.0001" value={form.center_lat} onChange={onChange} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none ring-0 placeholder:text-slate-500 focus:border-sky-500" /></label>
            <label className="block text-sm text-slate-300">Center longitude<input name="center_lng" type="number" step="0.0001" value={form.center_lng} onChange={onChange} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none placeholder:text-slate-500 focus:border-sky-500" /></label>
            <label className="block text-sm text-slate-300">Radius (m)<input name="radius_m" type="number" min="100" max="10000" value={form.radius_m} onChange={onChange} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none placeholder:text-slate-500 focus:border-sky-500" /></label>
            <label className="block text-sm text-slate-300">Road class<select name="road_class" value={form.road_class} onChange={onChange} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-500"><option value="local">Local</option><option value="collector">Collector</option><option value="arterial">Arterial</option></select></label>
          </div><button type="submit" disabled={loading} className="mt-6 inline-flex items-center justify-center rounded-xl bg-sky-500 px-5 py-3 font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60">{loading ? 'Running audit...' : 'Run audit'}</button></form>

          <aside className="dashboard-panel"><h2 className="text-xl font-semibold text-white">Result</h2>{error && <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>}{result ? <div className="mt-4 space-y-4"><div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4"><p className="text-sm text-slate-400">Audit ID</p><p className="mt-2 break-all text-sm font-medium text-sky-300">{result.id}</p></div><div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4"><p className="text-sm text-slate-400">Status</p><p className="mt-2 text-lg font-semibold text-emerald-300">{result.status}</p></div><div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4"><p className="text-sm text-slate-400">Compliance score</p><p className="mt-2 text-2xl font-bold text-white">{result.compliance_score}</p></div></div> : <p className="mt-4 text-sm text-slate-400">Submit a location to generate a road audit.</p>}</aside>
        </div>

        <section id="audit-history" className="dashboard-panel mt-8"><div className="flex items-end justify-between gap-4"><div><p className="eyebrow">Workspace activity</p><h2 className="mt-2 text-2xl font-semibold text-white">Recent audits</h2></div><span className="text-sm text-slate-500">{audits.length} total</span></div>{audits.length ? <div className="mt-5 overflow-x-auto"><table className="audit-table"><thead><tr><th>Audit ID</th><th>Status</th><th>Compliance</th><th>Segments</th><th>Checklist</th></tr></thead><tbody>{audits.map((audit) => <tr key={audit.id}><td className="font-mono text-xs text-sky-300">{audit.id.slice(0, 12)}...</td><td><span className="status-pill">{audit.status}</span></td><td className="font-semibold text-white">{audit.compliance_score}%</td><td>{audit.segment_count}</td><td>{audit.checklist_count}</td></tr>)}</tbody></table></div> : <p className="mt-5 text-sm text-slate-400">Your completed audits will appear here.</p>}</section>
        <AuditDetail auditDetail={auditDetail} />
      </div>
    </main>
  )
}

export default Dashboard
