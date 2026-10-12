import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { getAudit, getAuditChecklist, getAuditSegments } from "../services/api";
import AppShell from "../components/layout/AppShell";
import PotholeReportCard from "../components/pothole/PotholeReportCard";
import { Badge, EmptyState, Notice, PageHeader, RiskBadge, Section, SkeletonPage, StatCard, StatusBadge } from "../components/common/ui";
import { IconChevronDown } from "../components/common/Icons";
import { formatDate, formatRadius, formatScore } from "../utils/format";

const RISK_LEVELS = ["low", "medium", "high", "critical"];
const RISK_BAR = { low: "bg-emerald-500", medium: "bg-amber-500", high: "bg-orange-500", critical: "bg-red-500" };

function getRiskContributions(segment) {
  const gradient = Number(segment.gradient);
  const curveRadius = Number(segment.curve_radius);
  const operatingSpeed = Number(segment.operating_speed);
  const traffic = segment.traffic_level?.toLowerCase();
  const pedestrian = segment.pedestrian_activity?.toLowerCase();

  let gradientPoints = 0;
  if (Number.isFinite(gradient)) {
    const value = Math.abs(gradient);
    gradientPoints = value < 3 ? 0 : value < 5 ? 10 : value < 8 ? 18 : 25;
  }

  let curvePoints = 0;
  if (Number.isFinite(curveRadius) && curveRadius > 0) {
    curvePoints = curveRadius >= 500 ? 0 : curveRadius >= 250 ? 8 : curveRadius >= 100 ? 15 : 20;
  }

  let speedPoints = 0;
  if (Number.isFinite(operatingSpeed) && operatingSpeed >= 0) {
    speedPoints = operatingSpeed <= 30 ? 0 : operatingSpeed <= 50 ? 8 : operatingSpeed <= 70 ? 14 : 20;
  }

  return [
    { label: "Gradient", value: gradientPoints, maximum: 25, detail: Number.isFinite(gradient) ? `${gradient}%` : "Not available" },
    { label: "Curve sharpness", value: curvePoints, maximum: 20, detail: Number.isFinite(curveRadius) ? `${curveRadius} m radius` : "Not available" },
    { label: "Operating speed", value: speedPoints, maximum: 20, detail: Number.isFinite(operatingSpeed) ? `${operatingSpeed} km/h` : "Not available" },
    { label: "Traffic level", value: traffic === "medium" ? 10 : traffic === "high" ? 20 : 0, maximum: 20, detail: segment.traffic_level || "Not available" },
    { label: "Pedestrian activity", value: pedestrian === "medium" ? 8 : pedestrian === "high" ? 15 : 0, maximum: 15, detail: segment.pedestrian_activity || "Not available" },
  ];
}

function Disclosure({ summary, children, className = "" }) {
  return (
    <details className={`group ${className}`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
        {summary}
        <IconChevronDown className="size-5 shrink-0 text-slate-400 transition group-open:rotate-180" />
      </summary>
      {children}
    </details>
  );
}

function SegmentRow({ segment }) {
  const contributions = getRiskContributions(segment);
  const total = contributions.reduce((sum, factor) => sum + factor.value, 0);
  const score = typeof segment.risk_score === "number" ? Math.round(segment.risk_score) : total;
  const bar = RISK_BAR[segment.risk_level?.toLowerCase()] || "bg-slate-400";

  return (
    <li>
      <Disclosure
        className="px-4 py-3.5 sm:px-6"
        summary={
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-slate-900">
                {segment.segment_code}
                <span className="ml-2 font-normal text-slate-500">{segment.road_name || "Unnamed road"}</span>
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {segment.length_m ? `${Number(segment.length_m).toFixed(0)} m` : "–"}
                {typeof segment.max_speed === "number" && ` · max ${Number(segment.max_speed).toFixed(0)} km/h`}
                {segment.traffic_level && ` · ${segment.traffic_level.toLowerCase()} traffic`}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-sm font-semibold tabular-nums text-slate-900">{score}</span>
              <RiskBadge level={segment.risk_level} />
            </div>
          </div>
        }
      >
        <div className="mt-4 space-y-3 rounded-lg bg-slate-50 p-4">
          {contributions.map((factor) => (
            <div key={factor.label}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-slate-700">
                  {factor.label} <span className="text-xs capitalize text-slate-500">({factor.detail})</span>
                </span>
                <span className="font-medium tabular-nums text-slate-900">
                  {factor.value}/{factor.maximum}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div className={`h-full rounded-full ${bar}`} style={{ width: `${(factor.value / factor.maximum) * 100}%` }} />
              </div>
            </div>
          ))}
          <p className="border-t border-slate-200 pt-3 text-xs text-slate-500">
            {contributions.map((factor) => factor.value).join(" + ")} = {total} points
          </p>
        </div>
      </Disclosure>
    </li>
  );
}

function AuditDetails() {
  const { auditId } = useParams();
  const navigate = useNavigate();

  const [audit, setAudit] = useState(null);
  const [segments, setSegments] = useState([]);
  const [checklist, setChecklist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!auditId) return;
    setLoading(true);
    setError("");
    Promise.all([getAudit(auditId), getAuditSegments(auditId), getAuditChecklist(auditId)])
      .then(([auditData, segmentData, checklistData]) => {
        setAudit(auditData);
        setSegments(segmentData || []);
        setChecklist(checklistData || []);
      })
      .catch((err) => setError(err.message || "Unable to load audit details."))
      .finally(() => setLoading(false));
  }, [auditId]);

  const riskDistribution = useMemo(() => {
    const distribution = Object.fromEntries(RISK_LEVELS.map((level) => [level, 0]));
    segments.forEach((segment) => {
      const level = segment.risk_level?.toLowerCase();
      if (level in distribution) distribution[level] += 1;
    });
    return distribution;
  }, [segments]);

  const averageRisk = useMemo(() => {
    const scores = segments.map((segment) => segment.risk_score).filter((score) => typeof score === "number");
    return scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;
  }, [segments]);

  const checklistStats = useMemo(() => {
    const stats = { pass: 0, fail: 0, pending: 0 };
    checklist.forEach((item) => {
      const status = item.status?.toLowerCase();
      if (status === "pass") stats.pass += 1;
      else if (status === "fail") stats.fail += 1;
      else stats.pending += 1;
    });
    return stats;
  }, [checklist]);

  const backToAudits = () => navigate("/audits");

  if (loading) {
    return (
      <AppShell>
        <SkeletonPage />
      </AppShell>
    );
  }

  if (error || !audit) {
    return (
      <AppShell>
        <PageHeader title="Audit not available" onBack={backToAudits} backLabel="All audits" />
        <Notice tone="error">{error || "This audit could not be found."}</Notice>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title={audit.location_name || "Unnamed audit"}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={audit.status} />
            <span className="text-slate-500">Audit #{audit.id}</span>
            {audit.location_address && <span className="text-slate-500">· {audit.location_address}</span>}
          </span>
        }
        onBack={backToAudits}
        backLabel="All audits"
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Audit radius" value={formatRadius(audit.radius_m)} />
        <StatCard label="Road class" value={<span className="capitalize">{audit.road_class}</span>} />
        <StatCard label="Segments" value={segments.length} />
        <StatCard label="Compliance" value={formatScore(audit.compliance_score)} />
      </div>

      <section className="card mb-6 p-4 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-8">
          <div className="shrink-0">
            <p className="text-sm text-slate-500">Average segment risk</p>
            <p className="mt-1 text-4xl font-bold tracking-tight text-slate-900">
              {averageRisk !== null ? averageRisk.toFixed(1) : "–"}
              {averageRisk !== null && <span className="ml-1 text-base font-medium text-slate-400">/ 100</span>}
            </p>
          </div>
          <div className="grid flex-1 grid-cols-4 gap-2">
            {RISK_LEVELS.map((level) => (
              <div key={level} className="rounded-lg bg-slate-50 p-3 text-center">
                <p className="text-xl font-bold text-slate-900">{riskDistribution[level]}</p>
                <p className="mt-0.5 flex items-center justify-center gap-1.5 text-xs capitalize text-slate-500">
                  <span className={`size-2 shrink-0 rounded-full ${RISK_BAR[level]}`} />
                  {level}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="mb-6">
        <PotholeReportCard auditId={auditId} onOpenScanner={(id) => navigate(`/scanner?auditId=${id || auditId}`)} />
      </div>

      <Section className="mb-6" title="Road segments" description="Tap a segment to see how its risk score is built up.">
        <Disclosure
          className="border-b border-slate-200 bg-slate-50/60 px-4 py-3 sm:px-6"
          summary={<span className="text-sm font-medium text-slate-700">How the risk score is calculated</span>}
        >
          <div className="mt-3 space-y-2 pb-1 text-sm leading-6 text-slate-600">
            <p>
              Each factor adds risk points on a 0–100 scale: gradient (25), curve sharpness (20), operating speed (20),
              traffic (20) and pedestrian activity (15). Scores read as 0–24 low, 25–49 medium, 50–74 high, 75–100 critical.
            </p>
            <p>
              It is a screening index for comparing segments, not a crash probability. Road class is the category chosen
              when the audit was created, operating speed is an estimate, and max speed is shown for reference only.
            </p>
          </div>
        </Disclosure>

        {segments.length === 0 ? (
          <EmptyState title="No segments yet" description="Road segmentation has not produced any results for this audit." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {segments.map((segment) => (
              <SegmentRow key={segment.id} segment={segment} />
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="IRC audit checklist"
        description="Automated screening and items that need a site visit."
        actions={
          checklist.length > 0 && (
            <>
              <Badge tone="green">{checklistStats.pass} pass</Badge>
              <Badge tone="red">{checklistStats.fail} fail</Badge>
              <Badge tone="amber">{checklistStats.pending} pending</Badge>
            </>
          )
        }
      >
        {checklist.length === 0 ? (
          <EmptyState title="No checklist items" description="Checklist generation has not completed for this audit." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {checklist.map((item) => (
              <li key={item.id} className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6 sm:px-6">
                <div className="min-w-0">
                  <p className="text-xs text-slate-500">
                    {item.code && <span className="mr-2 font-semibold text-slate-700">{item.code}</span>}
                    <span className="capitalize">{item.category}</span>
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{item.question}</p>
                  {item.reason && <p className="mt-1 text-sm text-slate-500">{item.reason}</p>}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Badge tone={item.status === "pass" ? "green" : item.status === "fail" ? "red" : "amber"}>
                    {item.status || "pending"}
                  </Badge>
                  {item.field_verification_required && <Badge tone="blue">Site visit</Badge>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <p className="mt-6 text-xs text-slate-400">
        Created {formatDate(audit.created_at, { withTime: true })} · Updated {formatDate(audit.updated_at, { withTime: true })}
      </p>
    </AppShell>
  );
}

export default AuditDetails;
