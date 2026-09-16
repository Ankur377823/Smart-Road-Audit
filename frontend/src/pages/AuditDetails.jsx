import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  getAudit,
  getAuditChecklist,
  getAuditSegments,
} from "../services/api";

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

        const [
          auditData,
          segmentData,
          checklistData,
        ] = await Promise.all([
          getAudit(auditId),
          getAuditSegments(auditId),
          getAuditChecklist(auditId),
        ]);

        setAudit(auditData);
        setSegments(segmentData || []);
        setChecklist(checklistData || []);
      } catch (err) {
        setError(
          err.message ||
            "Unable to load audit details."
        );
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
      const level =
        segment.risk_level?.toLowerCase();

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
      .filter(
        (score) =>
          typeof score === "number"
      );

    if (scores.length === 0) {
      return null;
    }

    return (
      scores.reduce(
        (total, score) => total + score,
        0
      ) / scores.length
    );
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
      const itemStatus =
        item.status?.toLowerCase();

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

  // ==========================================================
  // FORMAT DATE
  // ==========================================================

  function formatDate(date) {
    if (!date) {
      return "-";
    }

    return new Date(date).toLocaleString(
      "en-IN",
      {
        dateStyle: "medium",
        timeStyle: "short",
      }
    );
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

            <p className="mt-2 text-sm text-red-700">
              {error}
            </p>

            <button
              type="button"
              onClick={() =>
                navigate("/dashboard")
              }
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
    <div className="min-h-screen bg-slate-50 px-6 py-8">

      <div className="mx-auto max-w-7xl">

        {/* ==================================================
            HEADER
        ================================================== */}

        <div className="mb-8">

          <button
            type="button"
            onClick={() =>
              navigate("/dashboard")
            }
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
                    audit.status
                  )}`}
                >
                  {audit.status}
                </span>

              </div>

              <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                {audit.location_name ||
                  "Unnamed Audit"}
              </h1>

              <p className="mt-2 max-w-3xl text-slate-600">
                {audit.location_address ||
                  "No address available"}
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

            <p className="text-sm text-slate-500">
              Audit Radius
            </p>

            <p className="mt-2 text-2xl font-bold text-slate-900">
              {audit.radius_m >= 1000
                ? `${audit.radius_m / 1000} km`
                : `${audit.radius_m} m`}
            </p>

          </div>

          {/* ROAD CLASS */}

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

            <p className="text-sm text-slate-500">
              Road Class
            </p>

            <p className="mt-2 text-2xl font-bold capitalize text-slate-900">
              {audit.road_class}
            </p>

          </div>

          {/* SEGMENTS */}

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

            <p className="text-sm text-slate-500">
              Segments
            </p>

            <p className="mt-2 text-2xl font-bold text-slate-900">
              {segments.length}
            </p>

          </div>

          {/* COMPLIANCE */}

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

            <p className="text-sm text-slate-500">
              Compliance Score
            </p>

            <p className="mt-2 text-2xl font-bold text-slate-900">
              {audit.compliance_score !==
                null &&
              audit.compliance_score !==
                undefined
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
                {averageRisk !== null
                  ? averageRisk.toFixed(1)
                  : "--"}
              </span>

              {averageRisk !== null && (
                <span className="mb-2 text-sm text-slate-500">
                  / 100
                </span>
              )}

            </div>

            <p className="mt-4 text-sm text-slate-500">
              Calculated from available segment
              risk scores.
            </p>

          </div>

          {/* RISK DISTRIBUTION */}

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">

            <p className="text-sm font-medium text-slate-500">
              Risk Distribution
            </p>

            <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">

              {Object.entries(
                riskDistribution
              ).map(([level, count]) => (
                <div
                  key={level}
                  className="rounded-xl bg-slate-50 p-4"
                >

                  <p className="text-sm capitalize text-slate-500">
                    {level}
                  </p>

                  <p className="mt-2 text-2xl font-bold text-slate-900">
                    {count}
                  </p>

                </div>
              ))}

            </div>

          </div>

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
                Road segmentation has not produced
                any results yet.
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

                  {segments.map(
                    (segment) => (

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
                            {segment.road_name ||
                              "Unnamed road"}
                          </p>

                          <p className="mt-1 text-xs capitalize text-slate-400">
                            {segment.road_class}
                          </p>

                        </td>

                        {/* LENGTH */}

                        <td className="px-6 py-4 text-sm text-slate-700">
                          {segment.length_m
                            ? `${Number(
                                segment.length_m
                              ).toFixed(0)} m`
                            : "-"}
                        </td>

                        {/* TRAFFIC */}

                        <td className="px-6 py-4 text-sm capitalize text-slate-700">
                          {segment.traffic_level ||
                            "-"}
                        </td>

                        {/* PEDESTRIAN */}

                        <td className="px-6 py-4 text-sm capitalize text-slate-700">
                          {segment.pedestrian_activity ||
                            "-"}
                        </td>

                        {/* RISK */}

                        <td className="px-6 py-4">

                          <div className="flex items-center gap-2">

                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getRiskClass(
                                segment.risk_level
                              )}`}
                            >
                              {segment.risk_level ||
                                "Pending"}
                            </span>

                            {typeof segment.risk_score ===
                              "number" && (
                              <span className="text-xs text-slate-400">
                                {segment.risk_score.toFixed(
                                  1
                                )}
                              </span>
                            )}

                          </div>

                        </td>

                      </tr>

                    )
                  )}

                </tbody>

              </table>

            </div>

          )}

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
                  Automated screening and field
                  verification requirements.
                </p>

              </div>

              <div className="flex flex-wrap gap-2">

                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                  Total:{" "}
                  {checklistStats.total}
                </span>

                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                  Pass:{" "}
                  {checklistStats.pass}
                </span>

                <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
                  Fail:{" "}
                  {checklistStats.fail}
                </span>

                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                  Pending:{" "}
                  {checklistStats.pending}
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

              {checklist.map(
                (item) => (

                  <div
                    key={item.id}
                    className="p-5"
                  >

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
                            item.status ===
                            "pass"
                              ? "bg-emerald-50 text-emerald-700"
                              : item.status ===
                                "fail"
                              ? "bg-red-50 text-red-700"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {item.status ||
                            "pending"}
                        </span>

                        {item.field_verification_required && (
                          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                            Field Verification
                          </span>
                        )}

                      </div>

                    </div>

                  </div>

                )
              )}

            </div>

          )}

        </div>

        {/* ==================================================
            AUDIT META
        ================================================== */}

        <div className="mt-6 flex flex-col gap-1 text-xs text-slate-400 md:flex-row md:justify-between">

          <span>
            Created:{" "}
            {formatDate(audit.created_at)}
          </span>

          <span>
            Updated:{" "}
            {formatDate(audit.updated_at)}
          </span>

        </div>

      </div>

    </div>
  );
}

export default AuditDetails;