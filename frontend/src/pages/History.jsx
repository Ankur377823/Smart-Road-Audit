import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { getAudits } from "../services/api";
import { attachScanSession, deleteScanSession, getScanSession, listScanSessions } from "../services/potholeApi";
import { openPotholeReport, openReportWindow, preloadReportLibrary } from "../utils/potholeReport";
import { recordToReport } from "../components/pothole/PotholeReportCard";
import { defaultCategoryForRoadClass, DEFAULT_CARRIAGEWAY_WIDTH_M } from "../ml/pothole/irc82";
import AppShell from "../components/layout/AppShell";
import { Badge, EmptyState, Notice, PageHeader, SkeletonPage, StatusBadge } from "../components/common/ui";
import { IconChevronRight, IconFileText, IconRoad, IconScan, IconTrash } from "../components/common/Icons";
import { formatDate, formatRadius, parseApiDate } from "../utils/format";

const TABS = [
  { id: "all", label: "All" },
  { id: "audits", label: "Audits" },
  { id: "scans", label: "Pothole scans" },
];

function formatDistance(meters) {
  if (!meters) return null;
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function scanTitle(scan) {
  return scan.title || `Pothole scan #${scan.id}`;
}

function AuditRow({ audit }) {
  return (
    <li>
      <Link to={`/audits/${audit.id}`} className="flex items-center gap-3 px-4 py-4 transition hover:bg-slate-50 sm:gap-4 sm:px-6">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
          <IconRoad className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate font-medium text-slate-900">{audit.location_name || `Audit #${audit.id}`}</span>
            <StatusBadge status={audit.status} />
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Road safety audit #{audit.id} · <span className="capitalize">{audit.road_class}</span> ·{" "}
            {formatRadius(audit.radius_m)} · {formatDate(audit.created_at, { withTime: true })}
          </p>
        </div>
        <span className="hidden text-sm font-medium text-slate-600 sm:inline">Open audit</span>
        <IconChevronRight className="size-5 shrink-0 text-slate-400" />
      </Link>
    </li>
  );
}

function ScanRow({ scan, audits, onChanged, onDeleted }) {
  const [mode, setMode] = useState(null); // null | 'attach' | 'delete'
  const [auditChoice, setAuditChoice] = useState(scan.audit_id ? String(scan.audit_id) : "");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const handleReport = async () => {
    const target = openReportWindow();
    setBusy("report");
    setError("");
    try {
      const detail = await getScanSession(scan.id);
      const potholes = detail.detections || [];
      const audit = audits.find((a) => a.id === detail.audit_id);
      const distance = formatDistance(detail.distance_m);
      await openPotholeReport({
        title: audit ? `Audit #${audit.id} · ${audit.location_name || "Road audit"}` : scanTitle(detail),
        subtitle: `Scan on ${formatDate(detail.started_at || detail.created_at, { withTime: true })} · ${
          distance ? `${distance} surveyed (GPS)` : "surveyed distance not recorded"
        }`,
        potholes: potholes.map((item, index) => ({ ...recordToReport(item), number: index + 1 })),
        survey: detail.distance_m
          ? {
              lengthM: detail.distance_m,
              widthM: DEFAULT_CARRIAGEWAY_WIDTH_M,
              category: defaultCategoryForRoadClass(audit?.road_class),
            }
          : null,
        target,
      });
    } catch (err) {
      target?.close();
      setError(err.message || "Could not create the report.");
    } finally {
      setBusy("");
    }
  };

  const handleAttach = async () => {
    setBusy("attach");
    setError("");
    try {
      const updated = await attachScanSession(scan.id, auditChoice || null);
      onChanged(updated);
      setMode(null);
    } catch (err) {
      setError(err.message || "Could not update the scan.");
    } finally {
      setBusy("");
    }
  };

  const handleDelete = async () => {
    setBusy("delete");
    setError("");
    try {
      await deleteScanSession(scan.id);
      onDeleted(scan.id);
    } catch (err) {
      setError(err.message || "Could not delete the scan.");
      setBusy("");
    }
  };

  const distance = formatDistance(scan.distance_m);

  return (
    <li className="px-4 py-4 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        <div className="flex min-w-0 flex-1 gap-3 sm:gap-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <IconScan className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-slate-900">{scanTitle(scan)}</p>
            <p className="mt-1 text-xs text-slate-500">
              {formatDate(scan.started_at || scan.created_at, { withTime: true })}
              {distance && ` · ${distance} surveyed`}
              {" · "}
              {scan.total_potholes} pothole{scan.total_potholes === 1 ? "" : "s"}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {scan.severe_count > 0 && <Badge tone="red">{scan.severe_count} large</Badge>}
              {scan.moderate_count > 0 && <Badge tone="amber">{scan.moderate_count} medium</Badge>}
              {scan.minor_count > 0 && <Badge tone="blue">{scan.minor_count} small</Badge>}
              {scan.essential_count > 0 && <Badge tone="orange">{scan.essential_count} essential repair</Badge>}
              {scan.audit_id ? (
                <Link
                  to={`/audits/${scan.audit_id}`}
                  className="-my-2 inline-flex items-center py-2 text-xs font-medium text-blue-600 hover:text-blue-700"
                >
                  In Audit #{scan.audit_id}
                  {scan.audit_name ? ` · ${scan.audit_name}` : ""}
                </Link>
              ) : (
                <span className="text-xs text-slate-500">Not in an audit</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          <button
            type="button"
            onClick={handleReport}
            disabled={busy === "report" || scan.total_potholes === 0}
            className="btn btn-primary px-3 py-2"
          >
            <IconFileText className="size-4" />
            {busy === "report" ? "Creating PDF…" : "PDF report"}
          </button>
          <button
            type="button"
            onClick={() => setMode(mode === "attach" ? null : "attach")}
            aria-expanded={mode === "attach"}
            className="btn btn-secondary px-3 py-2"
          >
            {scan.audit_id ? "Change audit" : "Add to audit"}
          </button>
          <button
            type="button"
            onClick={() => setMode(mode === "delete" ? null : "delete")}
            aria-expanded={mode === "delete"}
            aria-label="Delete scan"
            title="Delete scan"
            className="btn btn-danger px-3 py-2"
          >
            <IconTrash className="size-4" />
          </button>
        </div>
      </div>

      {mode === "attach" && (
        <div className="mt-3 flex flex-col gap-2 rounded-lg bg-slate-50 p-3 sm:flex-row sm:items-center">
          <label htmlFor={`attach-${scan.id}`} className="text-sm text-slate-700 sm:shrink-0">
            Audit
          </label>
          <select
            id={`attach-${scan.id}`}
            value={auditChoice}
            onChange={(event) => setAuditChoice(event.target.value)}
            className="input py-2 sm:max-w-sm"
          >
            <option value="">Not in an audit</option>
            {audits.map((audit) => (
              <option key={audit.id} value={audit.id}>
                #{audit.id} · {audit.location_name || "Road audit"}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAttach}
              disabled={busy === "attach" || auditChoice === String(scan.audit_id ?? "")}
              className="btn btn-primary px-3 py-2"
            >
              {busy === "attach" ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => setMode(null)} className="btn btn-secondary px-3 py-2">
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === "delete" && (
        <div className="mt-3 flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-red-800">
            Delete this scan and its {scan.total_potholes} pothole{scan.total_potholes === 1 ? "" : "s"}
            {scan.audit_id ? `, including from Audit #${scan.audit_id}` : ""}? This cannot be undone.
          </p>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={handleDelete} disabled={busy === "delete"} className="btn btn-danger px-3 py-2">
              {busy === "delete" ? "Deleting…" : "Delete scan"}
            </button>
            <button type="button" onClick={() => setMode(null)} className="btn btn-secondary px-3 py-2">
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <Notice tone="error" className="mt-3">{error}</Notice>}
    </li>
  );
}

function History() {
  const [audits, setAudits] = useState([]);
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("all");

  useEffect(() => {
    preloadReportLibrary().catch(() => {});
    Promise.all([getAudits(), listScanSessions()])
      .then(([auditData, scanData]) => {
        setAudits(auditData || []);
        setScans(scanData || []);
      })
      .catch((err) => setError(err.message || "Unable to load history."))
      .finally(() => setLoading(false));
  }, []);

  const entries = useMemo(() => {
    const auditEntries = audits.map((audit) => ({ type: "audit", key: `a-${audit.id}`, at: audit.created_at, audit }));
    const scanEntries = scans.map((scan) => ({
      type: "scan",
      key: `s-${scan.id}`,
      at: scan.started_at || scan.created_at,
      scan,
    }));
    const list = tab === "audits" ? auditEntries : tab === "scans" ? scanEntries : [...auditEntries, ...scanEntries];
    return list.sort((a, b) => parseApiDate(b.at) - parseApiDate(a.at));
  }, [audits, scans, tab]);

  const counts = { all: audits.length + scans.length, audits: audits.length, scans: scans.length };

  if (loading) {
    return (
      <AppShell>
        <SkeletonPage />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader title="History" description="Every audit and pothole scan you have saved, newest first." />

      {error && <Notice tone="error" className="mb-6">{error}</Notice>}

      <div role="tablist" aria-label="History filter" className="mb-4 inline-flex rounded-lg border border-slate-200 bg-white p-1">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`rounded-md px-3 py-2 text-sm font-medium transition ${
              tab === item.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            {item.label}
            <span className={`ml-1.5 tabular-nums ${tab === item.id ? "text-white/70" : "text-slate-400"}`}>{counts[item.id]}</span>
          </button>
        ))}
      </div>

      <section className="card overflow-hidden">
        {entries.length === 0 ? (
          <EmptyState
            title={tab === "audits" ? "No audits yet" : tab === "scans" ? "No pothole scans yet" : "Nothing saved yet"}
            description={
              tab === "audits"
                ? "Audits you create appear here."
                : "Scans are saved here automatically when you stop the pothole scanner. Audits you create appear here too."
            }
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {tab !== "scans" && (
                  <Link to="/audits/create" className="btn btn-primary">
                    New audit
                  </Link>
                )}
                {tab !== "audits" && (
                  <Link to="/scanner" className="btn btn-secondary">
                    Open pothole scanner
                  </Link>
                )}
              </div>
            }
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {entries.map((entry) =>
              entry.type === "audit" ? (
                <AuditRow key={entry.key} audit={entry.audit} />
              ) : (
                <ScanRow
                  key={entry.key}
                  scan={entry.scan}
                  audits={audits}
                  onChanged={(updated) => setScans((list) => list.map((s) => (s.id === updated.id ? updated : s)))}
                  onDeleted={(id) => setScans((list) => list.filter((s) => s.id !== id))}
                />
              )
            )}
          </ul>
        )}
      </section>
    </AppShell>
  );
}

export default History;
