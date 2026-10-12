import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { getAudits } from "../services/api";
import AppShell from "../components/layout/AppShell";
import { EmptyState, Notice, PageHeader, Section, SkeletonPage, StatCard, StatusBadge } from "../components/common/ui";
import { IconChevronRight, IconPlus, IconScan } from "../components/common/Icons";
import { formatDate, formatRadius, formatScore } from "../utils/format";

function Dashboard() {
  const navigate = useNavigate();

  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getAudits()
      .then((data) => setAudits(data || []))
      .catch((err) => setError(err.message || "Unable to load dashboard data."))
      .finally(() => setLoading(false));
  }, []);

  const statistics = useMemo(() => {
    const byStatus = (status) => audits.filter((audit) => audit.status?.toLowerCase() === status).length;
    const scored = audits.filter((audit) => typeof audit.compliance_score === "number");

    return {
      total: audits.length,
      ready: byStatus("ready"),
      processing: byStatus("processing"),
      averageCompliance: scored.length
        ? scored.reduce((sum, audit) => sum + audit.compliance_score, 0) / scored.length
        : null,
    };
  }, [audits]);

  if (loading) {
    return (
      <AppShell>
        <SkeletonPage />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title="Dashboard"
        description="Road safety audits, risk analysis and pothole screening at a glance."
        actions={
          <button type="button" onClick={() => navigate("/audits/create")} className="btn btn-primary">
            <IconPlus className="size-4" />
            New audit
          </button>
        }
      />

      {error && <Notice tone="error" className="mb-6">{error}</Notice>}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Total audits" value={statistics.total} />
        <StatCard label="Ready for review" value={statistics.ready} valueClassName="text-emerald-600" />
        <StatCard label="Processing" value={statistics.processing} valueClassName="text-blue-600" />
        <StatCard
          label="Avg. compliance"
          value={statistics.averageCompliance !== null ? statistics.averageCompliance.toFixed(1) : "–"}
        />
      </div>

      <Link
        to="/scanner"
        className="card mb-6 flex items-center gap-4 p-4 transition hover:border-slate-300 hover:shadow-md sm:p-5"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <IconScan className="size-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-slate-900">Pothole scanner</span>
          <span className="block text-sm text-slate-500">
            Detect potholes live with your phone camera and add them to an audit.
          </span>
        </span>
        <IconChevronRight className="size-5 shrink-0 text-slate-400" />
      </Link>

      <Section
        title="Recent audits"
        actions={
          audits.length > 0 && (
            <Link to="/audits" className="text-sm font-semibold text-blue-600 hover:text-blue-700">
              View all
            </Link>
          )
        }
      >
        {audits.length === 0 ? (
          <EmptyState
            title="No audits yet"
            description="Create your first road safety audit to see results here."
            action={
              <button type="button" onClick={() => navigate("/audits/create")} className="btn btn-primary">
                Create audit
              </button>
            }
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {audits.slice(0, 5).map((audit) => (
              <li key={audit.id}>
                <Link
                  to={`/audits/${audit.id}`}
                  className="flex items-center gap-4 px-4 py-4 transition hover:bg-slate-50 sm:px-6"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium text-slate-900">{audit.location_name || "Unnamed audit"}</p>
                      <StatusBadge status={audit.status} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      #{audit.id} · <span className="capitalize">{audit.road_class}</span> · {formatRadius(audit.radius_m)} ·{" "}
                      {formatDate(audit.created_at)}
                    </p>
                  </div>
                  <div className="hidden text-right sm:block">
                    <p className="text-xs text-slate-500">Compliance</p>
                    <p className="text-sm font-semibold text-slate-900">{formatScore(audit.compliance_score)}</p>
                  </div>
                  <IconChevronRight className="size-5 shrink-0 text-slate-400" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </AppShell>
  );
}

export default Dashboard;
