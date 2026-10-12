import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { getAudits } from "../services/api";
import AppShell from "../components/layout/AppShell";
import { EmptyState, Notice, PageHeader, Section, SkeletonPage, StatusBadge } from "../components/common/ui";
import { IconChevronRight, IconPlus } from "../components/common/Icons";
import { formatDate, formatRadius, formatScore } from "../utils/format";

function AuditHistory() {
  const navigate = useNavigate();

  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getAudits()
      .then((data) => setAudits(data || []))
      .catch((err) => setError(err.message || "Unable to load audits."))
      .finally(() => setLoading(false));
  }, []);

  const newAuditButton = (
    <button type="button" onClick={() => navigate("/audits/create")} className="btn btn-primary">
      <IconPlus className="size-4" />
      New audit
    </button>
  );

  return (
    <AppShell>
      {loading ? (
        <SkeletonPage />
      ) : (
        <>
          <PageHeader title="Audits" description="All road safety audits, newest first." actions={newAuditButton} />

          {error ? (
            <Notice tone="error">
              {error}{" "}
              <button type="button" onClick={() => window.location.reload()} className="font-semibold underline">
                Try again
              </button>
            </Notice>
          ) : (
            <Section title={`${audits.length} ${audits.length === 1 ? "audit" : "audits"}`}>
              {audits.length === 0 ? (
                <EmptyState
                  title="No audits yet"
                  description="Create your first road safety audit to start analysing road conditions."
                  action={newAuditButton}
                />
              ) : (
                <>
                  {/* Phones: stacked list */}
                  <ul className="divide-y divide-slate-100 md:hidden">
                    {audits.map((audit) => (
                      <li key={audit.id}>
                        <Link to={`/audits/${audit.id}`} className="flex items-center gap-3 px-4 py-4 active:bg-slate-50">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-slate-900">{audit.location_name || "Unnamed audit"}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              #{audit.id} · <span className="capitalize">{audit.road_class}</span> ·{" "}
                              {formatRadius(audit.radius_m)} · {formatDate(audit.created_at)}
                            </p>
                            <div className="mt-2 flex items-center gap-2">
                              <StatusBadge status={audit.status} />
                              <span className="text-xs text-slate-500">Compliance {formatScore(audit.compliance_score)}</span>
                            </div>
                          </div>
                          <IconChevronRight className="size-5 shrink-0 text-slate-400" />
                        </Link>
                      </li>
                    ))}
                  </ul>

                  {/* Tablet and up: table */}
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-6 py-3">Location</th>
                          <th className="px-6 py-3">Road class</th>
                          <th className="px-6 py-3">Radius</th>
                          <th className="px-6 py-3">Status</th>
                          <th className="px-6 py-3">Compliance</th>
                          <th className="px-6 py-3">Created</th>
                          <th className="px-6 py-3"><span className="sr-only">Open</span></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {audits.map((audit) => (
                          <tr
                            key={audit.id}
                            onClick={() => navigate(`/audits/${audit.id}`)}
                            className="cursor-pointer transition hover:bg-slate-50"
                          >
                            <td className="max-w-xs px-6 py-4">
                              <p className="truncate font-medium text-slate-900">{audit.location_name || "Unnamed audit"}</p>
                              <p className="text-xs text-slate-500">#{audit.id}</p>
                            </td>
                            <td className="px-6 py-4 capitalize text-slate-700">{audit.road_class}</td>
                            <td className="px-6 py-4 text-slate-700">{formatRadius(audit.radius_m)}</td>
                            <td className="px-6 py-4"><StatusBadge status={audit.status} /></td>
                            <td className="px-6 py-4 font-medium text-slate-900">{formatScore(audit.compliance_score)}</td>
                            <td className="whitespace-nowrap px-6 py-4 text-slate-500">{formatDate(audit.created_at, { withTime: true })}</td>
                            <td className="px-6 py-4 text-right">
                              <Link
                                to={`/audits/${audit.id}`}
                                onClick={(event) => event.stopPropagation()}
                                className="font-semibold text-blue-600 hover:text-blue-700"
                              >
                                View
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Section>
          )}
        </>
      )}
    </AppShell>
  );
}

export default AuditHistory;
