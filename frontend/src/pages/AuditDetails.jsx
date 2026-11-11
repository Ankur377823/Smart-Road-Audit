import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { generateAuditChecklist, getAudit, getAuditChecklist, getAuditSegments, getSegment } from "../services/api";
import AppShell from "../components/layout/AppShell";
import PotholeReportCard from "../components/pothole/PotholeReportCard";
import { Badge, EmptyState, Notice, PageHeader, RiskBadge, Section, SkeletonPage, StatCard, StatusBadge } from "../components/common/ui";
import { IconChevronDown } from "../components/common/Icons";
import { formatDate, formatRadius, formatScore } from "../utils/format";

const RISK_LEVELS = ["low", "medium", "high", "critical"];
const RISK_BAR = { low: "bg-emerald-500", medium: "bg-amber-500", high: "bg-orange-500", critical: "bg-red-500" };
const CHECKLIST_TONE = { pass: "green", fail: "red", flagged: "orange", review: "blue" };
const IRC_86_SOURCE = "https://law.resource.org/pub/in/bis/irc/irc.gov.in.086.2018.pdf";

// IRC:86-2018 design speed (km/h) by road class and terrain, and the minimum curve radius (m) for each speed.
// Mirrors backend/app/services/risk_scoring.py so the breakdown adds up to the stored score.
const DESIGN_SPEEDS = {
  arterial: { plain: 60, rolling: 50, mountainous: 40, steep: 40 },
  collector: { plain: 40, rolling: 40, mountainous: 30, steep: 30 },
  local: { plain: 30, rolling: 30, mountainous: 20, steep: 20 },
};
const MINIMUM_RADII = { 20: 15, 30: 30, 40: 60, 50: 90, 60: 130 };
const MAX_GRADIENT_PERCENT = 4;

function terrainGroup(terrainClass) {
  if (terrainClass === "plain" || terrainClass === "rolling") return "Plain / rolling";
  if (terrainClass === "mountainous" || terrainClass === "steep") return "Mountainous / steep";
  return "Unavailable";
}

function terrainHint(audit) {
  if (!audit.terrain_class) return "Not enough elevation data to classify";
  const parts = [`IRC class: ${audit.terrain_class}`];
  const profile = Number(audit.terrain_profile_length_m);
  if (audit.terrain_profile_length_m != null && Number.isFinite(profile)) {
    parts.push(`${Math.round(profile)} m profile${profile < 1000 ? " (under 1 km)" : ""}`);
  }
  const slope = Number(audit.terrain_cross_slope_percent);
  if (audit.terrain_cross_slope_percent != null && Number.isFinite(slope)) parts.push(`${slope}% cross slope`);
  return parts.join(" · ");
}

const toNumber = (value) => (value == null ? NaN : Number(value));

function getRiskContributions(segment) {
  const gradient = toNumber(segment.gradient);
  const curveRadius = toNumber(segment.curve_radius);
  const operatingSpeed = toNumber(segment.operating_speed);
  const traffic = segment.traffic_level?.toLowerCase();
  const pedestrian = segment.pedestrian_activity?.toLowerCase();
  const designSpeed = DESIGN_SPEEDS[segment.road_class]?.[segment.terrain_class];
  const minimumRadius = MINIMUM_RADII[designSpeed];

  const gradientPoints =
    Number.isFinite(gradient) && segment.terrain_class && Math.abs(gradient) > MAX_GRADIENT_PERCENT ? 20 : 0;

  const curvePoints =
    Number.isFinite(curveRadius) && curveRadius > 0 && minimumRadius !== undefined && curveRadius < minimumRadius ? 20 : 0;

  let speedPoints = 0;
  if (Number.isFinite(operatingSpeed) && operatingSpeed >= 0 && designSpeed !== undefined && operatingSpeed > designSpeed) {
    speedPoints = operatingSpeed <= designSpeed * 1.15 ? 8 : operatingSpeed <= designSpeed * 1.3 ? 14 : 20;
  }

  const curveDetail = Number.isFinite(curveRadius)
    ? `${curveRadius} m radius${minimumRadius ? `, minimum ${minimumRadius} m` : ""}`
    : segment.curve_radius_status === "not_defined"
      ? "no curve detected"
      : "not enough geometry";

  const trafficDetail = segment.traffic_level
    ? `${segment.traffic_level}${
        segment.traffic_delay_percent == null ? "" : `, +${Number(segment.traffic_delay_percent).toFixed(1)}% route delay`
      }`
    : "no route traffic data, not scored";

  const pedestrianDetail = segment.pedestrian_activity
    ? `${segment.pedestrian_activity}, ${segment.pedestrian_place_count ?? 0} activity places nearby`
    : "no complete Places data, not scored";

  return [
    {
      label: "Gradient",
      value: gradientPoints,
      detail: Number.isFinite(gradient) ? `${gradient}%` : "not available",
    },
    { label: "Curve sharpness", value: curvePoints, detail: curveDetail },
    {
      label: "Operating speed",
      value: speedPoints,
      detail: Number.isFinite(operatingSpeed)
        ? `${operatingSpeed} km/h${designSpeed ? `, design ${designSpeed} km/h` : ""}`
        : "not available",
    },
    { label: "Estimated congestion", value: traffic === "medium" ? 10 : traffic === "high" ? 20 : 0, detail: trafficDetail },
    {
      label: "Pedestrian activity",
      value: pedestrian === "medium" ? 8 : pedestrian === "high" ? 20 : 0,
      detail: pedestrianDetail,
    },
  ].map((factor) => ({ ...factor, maximum: 20 }));
}

function Disclosure({ summary, children, className = "", onToggle }) {
  return (
    <details className={`group ${className}`} onToggle={onToggle}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
        {summary}
        <IconChevronDown className="size-5 shrink-0 text-slate-400 transition group-open:rotate-180" />
      </summary>
      {children}
    </details>
  );
}

function Subsections({ segmentId }) {
  const [details, setDetails] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getSegment(segmentId)
      .then((data) => !cancelled && setDetails(data))
      .catch((err) => !cancelled && setError(err.message || "Unable to load the sections."));
    return () => {
      cancelled = true;
    };
  }, [segmentId]);

  if (error) return <p className="border-t border-slate-200 pt-3 text-sm text-red-600">{error}</p>;
  if (!details) return <p className="border-t border-slate-200 pt-3 text-sm text-slate-500">Loading sections…</p>;

  const sections = details.subsegments || [];
  if (sections.length < 2) return null;

  return (
    <div className="border-t border-slate-200 pt-3">
      <p className="text-sm font-medium text-slate-700">
        {sections.length} section{sections.length === 1 ? "" : "s"} over {Number(details.length_m).toFixed(0)} m
      </p>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => (
          <li
            key={section.subsection_number}
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <span className="text-slate-700">
              Section {section.subsection_number}
              <span className="ml-1.5 text-slate-500">{Number(section.length_m).toFixed(0)} m</span>
            </span>
            <span className="font-medium tabular-nums text-slate-900">
              {typeof section.risk_score === "number" ? section.risk_score.toFixed(1) : "–"}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-slate-500">Sections share the segment's score until section-level measurements are available.</p>
    </div>
  );
}

function SegmentRow({ segment }) {
  const [opened, setOpened] = useState(false);
  const contributions = getRiskContributions(segment);
  const total = contributions.reduce((sum, factor) => sum + factor.value, 0);
  const score = typeof segment.risk_score === "number" ? Math.round(segment.risk_score) : total;
  const bar = RISK_BAR[segment.risk_level?.toLowerCase()] || "bg-slate-400";

  return (
    <li>
      <Disclosure
        className="px-4 py-3.5 sm:px-6"
        onToggle={(event) => event.currentTarget.open && setOpened(true)}
        summary={
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-slate-900">
                {segment.segment_code}
                <span className="ml-2 font-normal text-slate-500">{segment.road_name || "Unnamed road"}</span>
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {segment.length_m ? `${Number(segment.length_m).toFixed(0)} m` : "–"}
                <span className="capitalize"> · {segment.road_class}</span>
                {segment.terrain_class && ` · ${terrainGroup(segment.terrain_class).toLowerCase()}`}
                {typeof segment.max_speed === "number" && ` · max ${Number(segment.max_speed).toFixed(0)} km/h`}
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
              <div className="flex items-start justify-between gap-3 text-sm">
                <span className="text-slate-700">
                  {factor.label} <span className="text-xs text-slate-500">({factor.detail})</span>
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
          {/* The segment list doesn't carry the section count, so sections load when a segment is first opened */}
          {opened && <Subsections segmentId={segment.id} />}
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
  const [generating, setGenerating] = useState(false);
  const [checklistError, setChecklistError] = useState("");

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

  async function handleGenerateChecklist() {
    setGenerating(true);
    setChecklistError("");
    try {
      await generateAuditChecklist(auditId);
      setChecklist((await getAuditChecklist(auditId)) || []);
    } catch (err) {
      setChecklistError(err.message || "Unable to generate the checklist.");
    } finally {
      setGenerating(false);
    }
  }

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
    const stats = { pass: 0, flagged: 0, review: 0, pending: 0, siteVisit: 0 };
    checklist.forEach((item) => {
      const status = item.status?.toLowerCase();
      if (status === "pass") stats.pass += 1;
      else if (status === "flagged" || status === "fail") stats.flagged += 1;
      else if (status === "review") stats.review += 1;
      else stats.pending += 1;
      if (item.field_verification_required) stats.siteVisit += 1;
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

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard label="Audit radius" value={formatRadius(audit.radius_m)} />
        <StatCard label="Road class" value={<span className="capitalize">{audit.road_class}</span>} />
        <StatCard label="Segments" value={segments.length} />
        <StatCard label="Compliance" value={formatScore(audit.compliance_score)} />
        <div className="col-span-2 lg:col-span-1">
          <StatCard label="Terrain (automatic)" value={terrainGroup(audit.terrain_class)} hint={terrainHint(audit)} />
        </div>
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
        <PotholeReportCard
          auditId={auditId}
          auditTitle={`Audit #${audit.id} · ${audit.location_name || "Road audit"}`}
          roadClass={audit.road_class}
          surveyLengthM={segments.reduce((sum, segment) => sum + (Number(segment.length_m) || 0), 0)}
          onOpenScanner={(id) => navigate(`/scanner?auditId=${id || auditId}`)}
        />
      </div>

      <Section className="mb-6" title="Road segments" description="Open a segment to see how its risk score is built up.">
        <Disclosure
          className="border-b border-slate-200 bg-slate-50/60 px-4 sm:px-6"
          summary={<span className="block py-3 text-sm font-medium text-slate-700">How the risk score is calculated</span>}
        >
          <div className="space-y-2 pb-4 text-sm leading-6 text-slate-600">
            <p>
              Five factors can each add up to 20 points on a 0–100 scale. Gradient adds risk above {MAX_GRADIENT_PERCENT}%.
              Curve sharpness adds risk when the radius is below the IRC:86-2018 minimum for the design speed, and operating
              speed is compared with that design speed (road class and terrain). Estimated congestion compares Google Routes
              travel time with and without traffic: under 100% extra delay is low, 100–500% medium, 500% or more high.
              Pedestrian activity is estimated from nearby activity places.
            </p>
            <p>
              Scores read as 0–24 low, 25–49 medium, 50–74 high and 75–100 critical. It is a screening index for comparing
              segments, not a crash probability. Terrain is classified automatically from elevation along the road, missing
              data is not scored, and max speed is shown for reference only.
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
        description="Checked separately for each segment. Missing measurements stay pending."
        actions={
          <>
            {checklist.length > 0 && (
              <>
                <Badge tone="green">{checklistStats.pass} pass</Badge>
                <Badge tone="orange">{checklistStats.flagged} flagged</Badge>
                {checklistStats.review > 0 && <Badge tone="blue">{checklistStats.review} review</Badge>}
                <Badge tone="amber">{checklistStats.pending} pending</Badge>
              </>
            )}
            <button
              type="button"
              onClick={handleGenerateChecklist}
              disabled={generating || segments.length === 0}
              aria-busy={generating}
              title={segments.length === 0 ? "The audit has no road segments yet" : undefined}
              className="btn btn-secondary"
            >
              {generating ? "Generating…" : checklist.length ? "Regenerate checklist" : "Generate checklist"}
            </button>
          </>
        }
      >
        <p className="border-b border-slate-200 bg-slate-50/60 px-4 py-3 text-xs leading-5 text-slate-500 sm:px-6">
          Gradient, design speed and minimum radius limits come from IRC:86-2018 (Clause 9.2, Tables 3.1 and 8.2, 7%
          superelevation). Speed bands, congestion and pedestrian classes are project screening rules, so this checklist is
          not a full compliance certificate.{" "}
          <a href={IRC_86_SOURCE} target="_blank" rel="noreferrer" className="font-medium text-blue-700 underline">
            IRC:86-2018 source
          </a>
        </p>

        {checklistError && <Notice tone="error" className="m-4 sm:mx-6">{checklistError}</Notice>}

        {checklist.length === 0 ? (
          <EmptyState
            title="No checklist items"
            description={
              segments.length
                ? "Generate the checklist from this audit's road segments."
                : "The checklist needs road segments, and this audit has none yet."
            }
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {checklist.map((item) => {
              const status = item.status?.toLowerCase() || "pending";
              return (
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
                    <Badge tone={CHECKLIST_TONE[status] || "amber"}>{status}</Badge>
                    {item.field_verification_required && <Badge tone="blue">Site visit</Badge>}
                  </div>
                </li>
              );
            })}
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
