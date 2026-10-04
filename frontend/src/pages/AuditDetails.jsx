import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { getAudit, getAuditChecklist, getAuditSegments } from "../services/api";
import PotholeReportCard from "../components/pothole/PotholeReportCard";

function AuditDetails() {
  const { auditId } = useParams();
  const navigate = useNavigate();

  const [audit, setAudit] = useState(null);
  const [segments, setSegments] = useState([]);
  const [checklist, setChecklist] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ==========================================================
  // LOAD AUDIT DATA
  // ==========================================================

  useEffect(() => {
    async function loadAuditDetails() {
      try {
        setLoading(true);
        setError("");

        const [auditData, segmentData, checklistData] = await Promise.all([
          getAudit(auditId),
          getAuditSegments(auditId),
          getAuditChecklist(auditId),
        ]);

        setAudit(auditData);
        setSegments(segmentData || []);
        setChecklist(checklistData || []);
      } catch (err) {
        setError(err.message || "Unable to load audit details.");
      } finally {
        setLoading(false);
      }
    }

    if (auditId) {
      loadAuditDetails();
    }
  }, [auditId]);

  // ==========================================================
  // RISK DISTRIBUTION
  // ==========================================================

  const riskDistribution = useMemo(() => {
    const distribution = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    segments.forEach((segment) => {
      const level = segment.risk_level?.toLowerCase();

      if (level in distribution) {
        distribution[level] += 1;
      }
    });

    return distribution;
  }, [segments]);

  // ==========================================================
  // AVERAGE RISK
  // ==========================================================

  const averageRisk = useMemo(() => {
    const scores = segments
      .map((segment) => segment.risk_score)
      .filter((score) => typeof score === "number");

    if (scores.length === 0) {
      return null;
    }

    return scores.reduce((total, score) => total + score, 0) / scores.length;
  }, [segments]);

  // ==========================================================
  // CHECKLIST STATISTICS
  // ==========================================================

  const checklistStats = useMemo(() => {
    const stats = {
      total: checklist.length,
      pass: 0,
      fail: 0,
      pending: 0,
      fieldVerification: 0,
    };

    checklist.forEach((item) => {
      const itemStatus = item.status?.toLowerCase();

      if (itemStatus === "pass") {
        stats.pass += 1;
      } else if (itemStatus === "fail") {
        stats.fail += 1;
      } else {
        stats.pending += 1;
      }

      if (item.field_verification_required) {
        stats.fieldVerification += 1;
      }
    });

    return stats;
  }, [checklist]);

  // ==========================================================
  // STATUS STYLE
  // ==========================================================

  function getStatusClass(status) {
    switch (status?.toLowerCase()) {
      case "ready":
        return "bg-emerald-50 text-emerald-700";

      case "processing":
        return "bg-blue-50 text-blue-700";

      case "failed":
        return "bg-red-50 text-red-700";

      default:
        return "bg-amber-50 text-amber-700";
    }
  }

  // ==========================================================
  // RISK STYLE
  // ==========================================================

  function getRiskClass(level) {
    switch (level?.toLowerCase()) {
      case "low":
        return "bg-emerald-50 text-emerald-700";

      case "medium":
        return "bg-amber-50 text-amber-700";

      case "high":
        return "bg-orange-50 text-orange-700";

      case "critical":
        return "bg-red-50 text-red-700";

      default:
        return "bg-slate-100 text-slate-600";
    }
  }

  function getRiskContributions(segment) {
    const gradient = Number(segment.gradient);
    const curveRadius = Number(segment.curve_radius);
    const operatingSpeed = Number(segment.operating_speed);
    const traffic = segment.traffic_level?.toLowerCase();
    const pedestrian = segment.pedestrian_activity?.toLowerCase();

    let gradientContribution = 0;
    if (Number.isFinite(gradient)) {
      const value = Math.abs(gradient);
      gradientContribution =
        value < 3 ? 0 : value < 5 ? 10 : value < 8 ? 18 : 25;
    }

    let curveContribution = 0;
    if (Number.isFinite(curveRadius) && curveRadius > 0) {
      curveContribution =
        curveRadius >= 500
          ? 0
          : curveRadius >= 250
            ? 8
            : curveRadius >= 100
              ? 15
              : 20;
    }

    let speedContribution = 0;
    if (Number.isFinite(operatingSpeed) && operatingSpeed >= 0) {
      speedContribution =
        operatingSpeed <= 30
          ? 0
          : operatingSpeed <= 50
            ? 8
            : operatingSpeed <= 70
              ? 14
              : 20;
    }

    return [
      {
        label: "Gradient",
        value: gradientContribution,
        maximum: 25,
        detail: Number.isFinite(gradient) ? `${gradient}%` : "Not available",
      },
      {
        label: "Curve sharpness",
        value: curveContribution,
        maximum: 20,
        detail: Number.isFinite(curveRadius)
          ? `${curveRadius} m radius`
          : "Not available",
      },
      {
        label: "Operating speed",
        value: speedContribution,
        maximum: 20,
        detail: Number.isFinite(operatingSpeed)
          ? `${operatingSpeed} km/h`
          : "Not available",
      },
      {
        label: "Traffic level",
        value: traffic === "medium" ? 10 : traffic === "high" ? 20 : 0,
        maximum: 20,
        detail: segment.traffic_level || "Not available",
      },
      {
        label: "Pedestrian activity",
        value: pedestrian === "medium" ? 8 : pedestrian === "high" ? 15 : 0,
        maximum: 15,
        detail: segment.pedestrian_activity || "Not available",
      },
    ];
  }

  // ==========================================================
  // FORMAT DATE
  // ==========================================================

  function formatDate(date) {
    if (!date) {
      return "-";
    }

    return new Date(date).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  // ==========================================================
  // LOADING STATE
  // ==========================================================

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 px-6 py-10">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8">
            <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />

            <div className="mt-3 h-9 w-72 animate-pulse rounded bg-slate-200" />

            <div className="mt-3 h-4 w-96 animate-pulse rounded bg-slate-200" />
          </div>

          <div className="grid gap-5 md:grid-cols-4">
            {[1, 2, 3, 4].map((item) => (
              <div
                key={item}
                className="h-32 animate-pulse rounded-2xl bg-white"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ==========================================================
  // ERROR STATE
  // ==========================================================

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 px-6 py-10">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
            <h1 className="text-lg font-semibold text-red-900">
              Unable to load audit
            </h1>

            <p className="mt-2 text-sm text-red-700">{error}</p>

            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!audit) {
    return null;
  }

  // ==========================================================
  // MAIN UI
  // ==========================================================

  return (
    <div className="min-h-screen bg-slate-50 px-3 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        {/* ==================================================
            HEADER
        ================================================== */}

        <div className="mb-8">
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="mb-5 text-sm font-medium text-slate-500 transition hover:text-slate-900"
          >
            ← Back to Dashboard
          </button>

          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <div className="mb-2 flex items-center gap-3">
                <span className="text-sm font-medium uppercase tracking-wider text-blue-600">
                  Road Safety Audit
                </span>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClass(
                    audit.status,
                  )}`}
                >
                  {audit.status}
                </span>
              </div>

              <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                {audit.location_name || "Unnamed Audit"}
              </h1>

              <p className="mt-2 max-w-3xl text-slate-600">
                {audit.location_address || "No address available"}
              </p>
            </div>

            <div className="text-left md:text-right">
              <p className="text-xs uppercase tracking-wider text-slate-400">
                Audit ID
              </p>

              <p className="mt-1 text-lg font-semibold text-slate-900">
                #{audit.id}
              </p>
            </div>
          </div>
        </div>

        {/* ==================================================
            AUDIT INFORMATION
        ================================================== */}

        <div className="mb-6 grid gap-4 md:grid-cols-4">
          {/* RADIUS */}

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Audit Radius</p>

            <p className="mt-2 text-2xl font-bold text-slate-900">
              {audit.radius_m >= 1000
                ? `${audit.radius_m / 1000} km`
                : `${audit.radius_m} m`}
            </p>
          </div>

          {/* ROAD CLASS */}

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Road Class</p>

            <p className="mt-2 text-2xl font-bold capitalize text-slate-900">
              {audit.road_class}
            </p>
          </div>

          {/* SEGMENTS */}

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Segments</p>

            <p className="mt-2 text-2xl font-bold text-slate-900">
              {segments.length}
            </p>
          </div>

          {/* COMPLIANCE */}

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Compliance Score</p>

            <p className="mt-2 text-2xl font-bold text-slate-900">
              {audit.compliance_score !== null &&
              audit.compliance_score !== undefined
                ? `${audit.compliance_score}/100`
                : "Pending"}
            </p>
          </div>
        </div>

        {/* ==================================================
            RISK OVERVIEW
        ================================================== */}

        <div className="mb-6 grid gap-6 lg:grid-cols-3">
          {/* AVERAGE RISK */}

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-slate-500">
              Average Segment Risk
            </p>

            <div className="mt-5 flex items-end gap-2">
              <span className="text-5xl font-bold text-slate-900">
                {averageRisk !== null ? averageRisk.toFixed(1) : "--"}
              </span>

              {averageRisk !== null && (
                <span className="mb-2 text-sm text-slate-500">/ 100</span>
              )}
            </div>

            <p className="mt-4 text-sm text-slate-500">
              Calculated from available segment risk scores.
            </p>
          </div>

          {/* RISK DISTRIBUTION */}

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
            <p className="text-sm font-medium text-slate-500">
              Risk Distribution
            </p>

            <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
              {Object.entries(riskDistribution).map(([level, count]) => (
                <div key={level} className="rounded-xl bg-slate-50 p-4">
                  <p className="text-sm capitalize text-slate-500">{level}</p>

                  <p className="mt-2 text-2xl font-bold text-slate-900">
                    {count}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ==================================================
            POTHOLE & SURFACE DISTRESS SCREENING
        ================================================== */}

        <div className="mb-6">
          <PotholeReportCard
            auditId={auditId}
            onOpenScanner={(id) =>
              navigate(`/scanner?auditId=${id || auditId}`)
            }
          />
        </div>

        {/* ==================================================
            ROAD SEGMENTS
        ================================================== */}

        <div className="mb-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900">
              Road Segments
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Segments generated during the road analysis.
            </p>
          </div>

          {segments.length === 0 ? (
            <div className="p-8 text-center">
              <p className="font-medium text-slate-700">
                No segments available
              </p>

              <p className="mt-1 text-sm text-slate-500">
                Road segmentation has not produced any results yet.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-850">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left">
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Segment
                    </th>

                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Road
                    </th>

                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Length
                    </th>

                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Max speed
                    </th>

                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Traffic
                    </th>

                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Pedestrian
                    </th>

                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Risk
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {segments.map((segment) => (
                    <tr
                      key={segment.id}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                    >
                      {/* SEGMENT */}

                      <td className="px-6 py-4">
                        <p className="font-semibold text-slate-900">
                          {segment.segment_code}
                        </p>
                      </td>

                      {/* ROAD */}

                      <td className="px-6 py-4">
                        <p className="max-w-55 truncate text-sm text-slate-700">
                          {segment.road_name || "Unnamed road"}
                        </p>

                        <p className="mt-1 text-xs capitalize text-slate-400">
                          {segment.road_class}
                        </p>
                      </td>

                      {/* LENGTH */}

                      <td className="px-6 py-4 text-sm text-slate-700">
                        {segment.length_m
                          ? `${Number(segment.length_m).toFixed(0)} m`
                          : "-"}
                      </td>

                      {/* MAX SPEED: REPORT DATA ONLY */}

                      <td className="px-6 py-4 text-sm text-slate-700">
                        {typeof segment.max_speed === "number"
                          ? `${Number(segment.max_speed).toFixed(0)} km/h`
                          : "-"}
                      </td>

                      {/* TRAFFIC */}

                      <td className="px-6 py-4 text-sm capitalize text-slate-700">
                        {segment.traffic_level || "-"}
                      </td>

                      {/* PEDESTRIAN */}

                      <td className="px-6 py-4 text-sm capitalize text-slate-700">
                        {segment.pedestrian_activity || "-"}
                      </td>

                      {/* RISK */}

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getRiskClass(
                              segment.risk_level,
                            )}`}
                          >
                            {segment.risk_level || "Pending"}
                          </span>

                          {typeof segment.risk_score === "number" && (
                            <span className="text-xs text-slate-400">
                              {segment.risk_score.toFixed(1)}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ==================================================
            RISK SCORE BREAKDOWN
        ================================================== */}

        <div className="mb-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900">
              How the risk score is calculated
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Raw measurements are converted into risk points using screening
              rules. Risk points have no physical unit; they show relative
              concern on a 0-100 scale.
            </p>
            <p className="mt-2 text-sm text-amber-700">
              Road class is the category selected when this audit was created.
              The operating speed shown below is a deterministic demo estimate,
              not a measured speed limit.
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Max speed is shown as report data only. It is not included in the
              risk-score calculation.
            </p>
          </div>

          <div className="grid gap-4 border-b border-slate-200 p-6 md:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                The formula
              </p>
              <p className="mt-2 font-mono text-sm font-semibold text-slate-900">
                risk score = factor points added together
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Example: 1.5% gradient gives 0 points, 350 m curve radius gives
                8, 45 km/h gives 8, medium traffic gives 10, and medium
                pedestrian activity gives 8. Total: 34/100.
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                How to interpret it
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-slate-700">
                <span>0-24: Low</span>
                <span>25-49: Medium</span>
                <span>50-74: High</span>
                <span>75-100: Critical</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                The score compares segments consistently. It is a deterministic
                demo index, not a measured crash probability or sensor reading.
              </p>
            </div>
          </div>

          <div className="grid gap-4 p-6 lg:grid-cols-2">
            {segments.map((segment) => {
              const contributions = getRiskContributions(segment);
              const calculatedTotal = contributions.reduce(
                (total, factor) => total + factor.value,
                0,
              );

              return (
                <article
                  key={`breakdown-${segment.id}`}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {segment.segment_code}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {segment.road_name || "Unnamed road"}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Max speed:{" "}
                        {typeof segment.max_speed === "number"
                          ? `${Number(segment.max_speed).toFixed(0)} km/h`
                          : "Not available"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-slate-900">
                        {typeof segment.risk_score === "number"
                          ? segment.risk_score.toFixed(0)
                          : calculatedTotal}
                        <span className="text-sm font-medium text-slate-400">
                          /100
                        </span>
                      </p>
                      <span
                        className={`text-xs font-semibold capitalize ${getRiskClass(segment.risk_level).split(" ").pop()}`}
                      >
                        {segment.risk_level || "Pending"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-5 space-y-3">
                    {contributions.map((factor) => (
                      <div key={factor.label}>
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="font-medium text-slate-700">
                            {factor.label}
                          </span>
                          <span className="font-semibold text-slate-900">
                            {factor.value} risk points / {factor.maximum}
                          </span>
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full bg-amber-500"
                            style={{
                              width: `${(factor.value / factor.maximum) * 100}%`,
                            }}
                          />
                        </div>
                        <p className="mt-1 text-xs capitalize text-slate-500">
                          {factor.detail}
                        </p>
                      </div>
                    ))}
                  </div>

                  <p className="mt-5 border-t border-slate-200 pt-3 text-xs text-slate-500">
                    {contributions.map((factor) => factor.value).join(" + ")} ={" "}
                    {calculatedTotal} total contribution
                  </p>
                </article>
              );
            })}
          </div>
        </div>

        {/* ==================================================
            CHECKLIST
        ================================================== */}

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-6">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  IRC Audit Checklist
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Automated screening and field verification requirements.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                  Total: {checklistStats.total}
                </span>

                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                  Pass: {checklistStats.pass}
                </span>

                <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
                  Fail: {checklistStats.fail}
                </span>

                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                  Pending: {checklistStats.pending}
                </span>
              </div>
            </div>
          </div>

          {checklist.length === 0 ? (
            <div className="p-8 text-center">
              <p className="font-medium text-slate-700">
                No checklist items available
              </p>

              <p className="mt-1 text-sm text-slate-500">
                Checklist generation has not been completed.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {checklist.map((item) => (
                <div key={item.id} className="p-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="max-w-4xl">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        {item.code && (
                          <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                            {item.code}
                          </span>
                        )}

                        <span className="text-xs font-medium capitalize text-slate-400">
                          {item.category}
                        </span>
                      </div>

                      <p className="font-medium text-slate-800">
                        {item.question}
                      </p>

                      {item.reason && (
                        <p className="mt-2 text-sm text-slate-500">
                          {item.reason}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          item.status === "pass"
                            ? "bg-emerald-50 text-emerald-700"
                            : item.status === "fail"
                              ? "bg-red-50 text-red-700"
                              : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {item.status || "pending"}
                      </span>

                      {item.field_verification_required && (
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                          Field Verification
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ==================================================
            AUDIT META
        ================================================== */}

        <div className="mt-6 flex flex-col gap-1 text-xs text-slate-400 md:flex-row md:justify-between">
          <span>Created: {formatDate(audit.created_at)}</span>

          <span>Updated: {formatDate(audit.updated_at)}</span>
        </div>
      </div>
    </div>
  );
}

export default AuditDetails;
