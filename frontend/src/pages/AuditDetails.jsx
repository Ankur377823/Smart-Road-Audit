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
const CHECKLIST_TONE = { pass: "green", fail: "red", flagged: "red", review: "blue" };
const IRC_86_SOURCE = "https://law.resource.org/pub/in/bis/irc/irc.gov.in.086.2018.pdf";

// ----------------------------------------------------------------------------
// Road-safety screening logic (team feature, kept as written in team/main so
// the numbers match the backend's risk_scoring.py). Pothole logic lives in
// components/pothole and is not touched here.
// ----------------------------------------------------------------------------

function getTerrainGroup(terrainClass) {
  if (terrainClass === "plain" || terrainClass === "rolling") {
    return "Plain / rolling";
  }
  if (terrainClass === "mountainous" || terrainClass === "steep") {
    return "Mountainous / steep";
  }
  return "Unavailable";
}

function getRiskContributions(segment) {
  const gradient = segment.gradient == null ? NaN : Number(segment.gradient);
  const curveRadius = segment.curve_radius == null ? NaN : Number(segment.curve_radius);
  const operatingSpeed = segment.operating_speed == null ? NaN : Number(segment.operating_speed);
  const traffic = segment.traffic_level?.toLowerCase();
  const pedestrian = segment.pedestrian_activity?.toLowerCase();
  const designSpeeds = {
    arterial: { plain: 60, rolling: 50, mountainous: 40, steep: 40 },
    collector: { plain: 40, rolling: 40, mountainous: 30, steep: 30 },
    local: { plain: 30, rolling: 30, mountainous: 20, steep: 20 },
  };
  const minimumRadii = { 20: 15, 30: 30, 40: 60, 50: 90, 60: 130 };
  const designSpeed = designSpeeds[segment.road_class]?.[segment.terrain_class];
  const minimumRadius = minimumRadii[designSpeed];

  let gradientContribution = 0;
  if (Number.isFinite(gradient) && segment.terrain_class) {
    const value = Math.abs(gradient);
    gradientContribution = value <= 4 ? 0 : 20;
  }

  let curveContribution = 0;
  if (Number.isFinite(curveRadius) && curveRadius > 0) {
    curveContribution = minimumRadius === undefined || curveRadius >= minimumRadius ? 0 : 20;
  }

  let speedContribution = 0;
  if (Number.isFinite(operatingSpeed) && operatingSpeed >= 0) {
    speedContribution =
      designSpeed === undefined
        ? 0
        : operatingSpeed <= designSpeed
          ? 0
          : operatingSpeed <= designSpeed * 1.15
            ? 8
            : operatingSpeed <= designSpeed * 1.3
              ? 14
              : 20;
  }

  return [
    {
      label: "Gradient",
      value: gradientContribution,
      maximum: 20,
      detail: Number.isFinite(gradient) ? `${gradient}%` : "Not available",
    },
    {
      label: "Curve sharpness",
      value: curveContribution,
      maximum: 20,
      detail: Number.isFinite(curveRadius)
        ? `${curveRadius} m radius`
        : segment.curve_radius_status === "not_defined"
          ? "Not defined (no curve detected)"
          : "Unavailable (insufficient geometry)",
    },
    {
      label: "Operating speed",
      value: speedContribution,
      maximum: 20,
      detail: Number.isFinite(operatingSpeed) ? `${operatingSpeed} km/h` : "Not available",
    },
    {
      label: "Estimated congestion",
      value: traffic === "medium" ? 10 : traffic === "high" ? 20 : 0,
      maximum: 20,
      detail: segment.traffic_level
        ? `${segment.traffic_level} · ${
            segment.traffic_delay_percent == null
              ? "delay % unavailable"
              : `+${Number(segment.traffic_delay_percent).toFixed(1)}% route delay`
          } · project threshold`
        : "Unknown; route traffic data unavailable (not scored)",
    },
    {
      label: "Pedestrian activity",
      value: pedestrian === "medium" ? 8 : pedestrian === "high" ? 20 : 0,
      maximum: 20,
      detail: segment.pedestrian_activity
        ? String(segment.pedestrian_activity) +
          " nearby-place proxy (" +
          String(segment.pedestrian_place_count ?? 0) +
          " activity places)"
        : "Unknown; no complete Places data (not scored)",
    },
  ];
}

function terrainProfileText(audit) {
  return audit.terrain_profile_length_m != null
    ? `Road profile: ${Math.round(audit.terrain_profile_length_m)} m${
        audit.terrain_profile_length_m < 1000 ? " (less than 1 km sample)" : ""
      }`
    : "Road profile geometry unavailable";
}

function terrainSlopeText(audit) {
  return audit.terrain_cross_slope_percent != null && Number.isFinite(Number(audit.terrain_cross_slope_percent))
    ? `${audit.terrain_cross_slope_percent}% cross slope`
    : audit.terrain_profile_length_m != null
      ? "Elevation samples unavailable"
      : "Terrain could not be classified";
}

// ----------------------------------------------------------------------------
// Presentation (the app's own design system)
// ----------------------------------------------------------------------------

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

function FactorList({ contributions }) {
  return (
    <div className="space-y-3">
      {contributions.map((factor) => (
        <div key={factor.label}>
          <div className="flex items-start justify-between gap-3 text-sm">
            <span className="text-slate-700">
              {factor.label} <span className="text-xs text-slate-500">({factor.detail})</span>
            </span>
            <span className="shrink-0 font-medium tabular-nums text-slate-900">
              {factor.value} / {factor.maximum}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-slate-700" style={{ width: `${(factor.value / factor.maximum) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Subsections({ segment }) {
  const [details, setDetails] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getSegment(segment.id)
      .then((data) => !cancelled && setDetails(data))
      .catch((err) => !cancelled && setError(err.message || "Unable to load segment subsections."));
    return () => {
      cancelled = true;
    };
  }, [segment.id]);

  if (error) return <Notice tone="error">{error}</Notice>;
  if (!details) return <p className="text-sm text-slate-500">Loading subsections…</p>;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-slate-900">
          {segment.segment_code} - {Number(details.length_m).toFixed(0)} m road segment, divided into{" "}
          {details.subsection_count} subsection(s)
        </p>
        <p className="text-xs text-slate-500">
          Parent segment average score:{" "}
          {typeof details.risk_score === "number" ? details.risk_score.toFixed(1) : "Pending"}/100
        </p>
      </div>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {(details.subsegments || []).map((subsection) => (
          <li
            key={subsection.subsection_number}
            className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900">
                {segment.segment_code} - Section {subsection.subsection_number}
              </p>
              <p className="text-xs text-slate-500">Length: {Number(subsection.length_m).toFixed(1)} m</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-semibold tabular-nums text-slate-900">
                {typeof subsection.risk_score === "number" ? subsection.risk_score.toFixed(1) : "–"}
                <span className="text-xs font-normal text-slate-400">/100</span>
              </p>
              <p className="text-xs capitalize text-slate-500">{subsection.risk_level || "Pending"}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-slate-500">
        Factor measurements and scores, including gradient, are inherited from the selected parent segment. Separate
        measurements for each subsection are not available yet.
      </p>
    </div>
  );
}

function SegmentRow({ segment }) {
  const [opened, setOpened] = useState(false);
  const contributions = getRiskContributions(segment);
  const calculatedTotal = contributions.reduce((total, factor) => total + factor.value, 0);

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
                {segment.length_m ? `${Number(segment.length_m).toFixed(0)} m` : "-"}
                <span className="capitalize"> · {segment.road_class}</span> · {getTerrainGroup(segment.terrain_class)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {typeof segment.risk_score === "number" && (
                <span className="text-sm font-semibold tabular-nums text-slate-900">{segment.risk_score.toFixed(1)}</span>
              )}
              <RiskBadge level={segment.risk_level} />
            </div>
          </div>
        }
      >
        <div className="mt-4 space-y-4 rounded-lg bg-slate-50 p-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-slate-500">Max speed (report data only)</dt>
              <dd className="mt-0.5 font-medium text-slate-900">
                {typeof segment.max_speed === "number" ? `${Number(segment.max_speed).toFixed(0)} km/h` : "-"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Estimated congestion</dt>
              <dd className="mt-0.5 font-medium capitalize text-slate-900">{segment.traffic_level || "Unknown"}</dd>
              {segment.traffic_level && (
                <dd className="text-xs text-slate-500">
                  {segment.traffic_delay_percent == null
                    ? "Route delay unavailable"
                    : `+${Number(segment.traffic_delay_percent).toFixed(1)}% route delay`}
                  {segment.traffic_source === "google_routes_congestion_proxy" && " · Google Routes proxy"}
                </dd>
              )}
            </div>
            <div>
              <dt className="text-xs text-slate-500">Pedestrian</dt>
              <dd className="mt-0.5 font-medium capitalize text-slate-900">{segment.pedestrian_activity || "Unknown"}</dd>
              {segment.pedestrian_activity_source === "nearby_places_proxy" && (
                <dd className="text-xs text-slate-500">
                  Places proxy · {segment.pedestrian_place_count ?? 0} nearby activity places
                </dd>
              )}
            </div>
          </dl>

          <div className="border-t border-slate-200 pt-4">
            <FactorList contributions={contributions} />
            <p className="mt-3 text-xs text-slate-500">
              {contributions.map((factor) => factor.value).join(" + ")} = {calculatedTotal} points
            </p>
          </div>

          {opened && (
            <div className="border-t border-slate-200 pt-4">
              <Subsections segment={segment} />
            </div>
          )}
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
  const [generatingChecklist, setGeneratingChecklist] = useState(false);
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
    try {
      setGeneratingChecklist(true);
      setChecklistError("");
      await generateAuditChecklist(auditId);
      const items = await getAuditChecklist(auditId);
      setChecklist(items || []);
    } catch (err) {
      setChecklistError(err.message || "Unable to generate the checklist.");
    } finally {
      setGeneratingChecklist(false);
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
    const stats = { total: checklist.length, pass: 0, fail: 0, review: 0, flagged: 0, pending: 0, fieldVerification: 0 };
    checklist.forEach((item) => {
      const itemStatus = item.status?.toLowerCase();
      if (itemStatus === "pass") stats.pass += 1;
      else if (itemStatus === "fail") stats.fail += 1;
      else if (itemStatus === "review") stats.review += 1;
      else if (itemStatus === "flagged") stats.flagged += 1;
      else stats.pending += 1;
      if (item.field_verification_required) stats.fieldVerification += 1;
    });
    return stats;
  }, [checklist]);

  const segmentCodes = useMemo(
    () => Object.fromEntries(segments.map((segment) => [String(segment.id), segment.segment_code])),
    [segments]
  );

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
        <StatCard label="Compliance score" value={formatScore(audit.compliance_score)} />
        <div className="col-span-2 lg:col-span-1">
          <StatCard
            label="Auto-classified terrain"
            value={getTerrainGroup(audit.terrain_class)}
            hint={
              <>
                <span className="block">IRC terrain class: {audit.terrain_class || "unavailable"}</span>
                <span className="block">{terrainProfileText(audit)}</span>
                <span className="block">{terrainSlopeText(audit)}</span>
              </>
            }
          />
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

      <Section
        className="mb-6"
        title="Road segments"
        description="Each segment is one main road segment in this audit. Open it to see its risk breakdown and shorter subsections (at most 10)."
      >
        <Disclosure
          className="border-b border-slate-200 bg-slate-50/60 px-4 sm:px-6"
          summary={<span className="block py-3 text-sm font-medium text-slate-700">How the risk score is calculated</span>}
        >
          <div className="space-y-3 pb-4 text-sm leading-6 text-slate-600">
            <p>
              Raw measurements are converted into risk points using screening rules. Risk points have no physical unit;
              they show relative concern on a 0-100 scale.
            </p>
            <p>
              Terrain is estimated automatically using the longest suitable road profile available, up to 1 km; shorter
              profiles are labeled in the terrain card. Cross-slope transects are evaluated from a 1 km minimum width up to
              5 km. These sampling lengths are implementation choices, not IRC-prescribed intervals. Terrain and road class
              are stored separately. Operating speed is derived from route data when available; it is not a legal speed
              limit.
            </p>
            <p>Max speed is shown as report data only. It is not included in the risk-score calculation.</p>
            <p>
              Estimated congestion compares Google Routes traffic-aware travel time with static route duration. It is a
              route-level congestion proxy, not a vehicle count or traffic volume. Low is under 100% extra delay, medium is
              100% to under 500%, and high is 500% or more; these are project screening thresholds, not IRC limits. The
              route classification is carried to its steps and derived segments.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">The formula</p>
                <p className="mt-1 font-medium text-slate-900">risk score = factor points added together</p>
                <p className="mt-1">
                  Example: a gradient above 4% or a curve radius below its IRC:86 design minimum adds geometry risk. Speed
                  is compared with the IRC:86 design speed for the selected road class and detected terrain. Estimated
                  congestion and pedestrian points remain application screening scores.
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">How to interpret it</p>
                <p className="mt-1 font-medium text-slate-900">0-24 Low · 25-49 Medium · 50-74 High · 75-100 Critical</p>
                <p className="mt-1">
                  The score compares segments consistently. It is a deterministic demo index, not a measured crash
                  probability or sensor reading.
                </p>
              </div>
            </div>
          </div>
        </Disclosure>

        {segments.length === 0 ? (
          <EmptyState title="No segments available" description="Road segmentation has not produced any results yet." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {segments.map((segment) => (
              <SegmentRow key={segment.id} segment={segment} />
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Urban road-safety screening checklist"
        description="Checks are evaluated separately for each segment, so repeated questions refer to different road sections. Missing measurements remain pending."
        actions={
          <button
            type="button"
            onClick={handleGenerateChecklist}
            disabled={generatingChecklist || segments.length === 0}
            aria-busy={generatingChecklist}
            className="btn btn-secondary"
          >
            {generatingChecklist ? "Generating…" : checklist.length ? "Regenerate checklist" : "Generate checklist"}
          </button>
        }
      >
        <div className="space-y-3 border-b border-slate-200 bg-slate-50/60 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap gap-2">
            <Badge>Total: {checklistStats.total}</Badge>
            <Badge tone="green">Pass: {checklistStats.pass}</Badge>
            <Badge tone="red">Fail: {checklistStats.fail}</Badge>
            <Badge tone="red">Flagged: {checklistStats.flagged}</Badge>
            <Badge tone="blue">Review: {checklistStats.review}</Badge>
            <Badge tone="amber">Pending: {checklistStats.pending}</Badge>
          </div>
          <p className="text-xs leading-5 text-slate-500">
            <span className="font-semibold text-slate-700">Basis:</span> Gradient, design-speed and minimum-radius reference
            values are drawn from IRC:86-2018 Clause 9.2, Table 3.1, and Table 8.2 using its 7% superelevation column.
            Automated operating-speed bands, congestion and pedestrian-proxy classes, risk points, and the field-review
            prompt are project screening rules; they are not all prescribed by IRC and this checklist is not a full
            compliance certification.{" "}
            <a href={IRC_86_SOURCE} target="_blank" rel="noreferrer" className="font-medium text-blue-700 underline">
              IRC:86-2018 source
            </a>
          </p>
        </div>

        {checklistError && <Notice tone="error" className="mx-4 mt-4 sm:mx-6">{checklistError}</Notice>}

        {checklist.length === 0 ? (
          <EmptyState
            title="No checklist items available"
            description="Use Generate checklist to create screening checks from the saved road segments."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {checklist.map((item) => {
              const status = item.status?.toLowerCase() || "pending";
              return (
                <li key={item.id} className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6 sm:px-6">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                      <span className="font-semibold text-slate-700">
                        {segmentCodes[String(item.segment_id)] || (item.segment_id ? "Segment" : "Audit-wide")}
                      </span>
                      {item.code && <span className="font-medium text-slate-600">{item.code}</span>}
                      <span className="capitalize">{item.category}</span>
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-900">{item.question}</p>
                    {item.reason && <p className="mt-1 text-sm text-slate-500">{item.reason}</p>}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Badge tone={CHECKLIST_TONE[status] || "amber"}>{status}</Badge>
                    {item.field_verification_required && <Badge tone="blue">Field verification</Badge>}
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
