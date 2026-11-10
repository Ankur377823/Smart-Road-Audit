import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  getAudit,
  getAuditChecklist,
  getAuditSegments,
  generateAuditChecklist,
  getSegment,
} from "../services/api";
import PotholeReportCard from "../components/pothole/PotholeReportCard";

function getTerrainGroup(terrainClass) {
  if (terrainClass === "plain" || terrainClass === "rolling") {
    return "Plain / rolling";
  }
  if (terrainClass === "mountainous" || terrainClass === "steep") {
    return "Mountainous / steep";
  }
  return "Unavailable";
}

function AuditDetails() {
  const { auditId } = useParams();
  const navigate = useNavigate();

  const [audit, setAudit] = useState(null);
  const [segments, setSegments] = useState([]);
  const [checklist, setChecklist] = useState([]);
  const [segmentDetails, setSegmentDetails] = useState({});
  const [expandedSegmentId, setExpandedSegmentId] = useState(null);
  const [loadingSegmentId, setLoadingSegmentId] = useState(null);
  const [selectedBreakdownSegmentId, setSelectedBreakdownSegmentId] = useState("");
  const [generatingChecklist, setGeneratingChecklist] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function toggleSegmentDetails(segment) {
    const segmentId = segment.id;
    if (expandedSegmentId === segmentId) {
      setExpandedSegmentId(null);
      return;
    }
    setExpandedSegmentId(segmentId);
    const cached = segmentDetails[segmentId];
    if (
      cached &&
      cached.audit_id === segment.audit_id &&
      Math.abs(Number(cached.length_m) - Number(segment.length_m)) < 0.01
    ) return;

    try {
      setLoadingSegmentId(segmentId);
      const details = await getSegment(segmentId);
      setSegmentDetails((current) => ({ ...current, [segmentId]: details }));
    } catch (err) {
      setError(err.message || "Unable to load segment subsections.");
    } finally {
      setLoadingSegmentId(null);
    }
  }

  async function handleGenerateChecklist() {
    try {
      setGeneratingChecklist(true);
      setError("");
      await generateAuditChecklist(auditId);
      const items = await getAuditChecklist(auditId);
      setChecklist(items || []);
    } catch (err) {
      setError(err.message || "Unable to generate the checklist.");
    } finally {
      setGeneratingChecklist(false);
    }
  }

  useEffect(() => {
    setSegmentDetails({});
    setExpandedSegmentId(null);
    setLoadingSegmentId(null);
    setSelectedBreakdownSegmentId("");
  }, [auditId]);

  useEffect(() => {
    const selected =
      segments.find(
        (segment) => String(segment.id) === selectedBreakdownSegmentId,
      ) || segments[0];
    if (!selected) return undefined;

    const cached = segmentDetails[selected.id];
    if (
      cached &&
      cached.audit_id === selected.audit_id &&
      Math.abs(Number(cached.length_m) - Number(selected.length_m)) < 0.01
    ) return undefined;

    let active = true;
    setLoadingSegmentId(selected.id);
    getSegment(selected.id)
      .then((details) => {
        if (active) {
          setSegmentDetails((current) => ({
            ...current,
            [selected.id]: details,
          }));
        }
      })
      .catch((err) => {
        if (active) setError(err.message || "Unable to load subsections.");
      })
      .finally(() => {
        if (active) setLoadingSegmentId(null);
      });

    return () => {
      active = false;
    };
  }, [segments, selectedBreakdownSegmentId, segmentDetails]);

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
        setSelectedBreakdownSegmentId(
          segmentData?.length ? String(segmentData[0].id) : "",
        );
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
      review: 0,
      flagged: 0,
      pending: 0,
      fieldVerification: 0,
    };

    checklist.forEach((item) => {
      const itemStatus = item.status?.toLowerCase();

      if (itemStatus === "pass") {
        stats.pass += 1;
      } else if (itemStatus === "fail") {
        stats.fail += 1;
      } else if (itemStatus === "review") {
        stats.review += 1;
      } else if (itemStatus === "flagged") {
        stats.flagged += 1;
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
      curveContribution =
        minimumRadius === undefined || curveRadius >= minimumRadius ? 0 : 20;
    }

    let speedContribution = 0;
    if (Number.isFinite(operatingSpeed) && operatingSpeed >= 0) {
      speedContribution = designSpeed === undefined
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
        detail: Number.isFinite(operatingSpeed)
          ? `${operatingSpeed} km/h`
          : "Not available",
      },
      {
        label: "Estimated congestion",
        value: traffic === "medium" ? 10 : traffic === "high" ? 20 : 0,
        maximum: 20,
        detail: segment.traffic_level
          ? `${segment.traffic_level} · ${segment.traffic_delay_percent == null ? "delay % unavailable" : `+${Number(segment.traffic_delay_percent).toFixed(1)}% route delay`} · project threshold`
          : "Unknown; route traffic data unavailable (not scored)",
      },
      {
        label: "Pedestrian activity",
        value: pedestrian === "medium" ? 8 : pedestrian === "high" ? 20 : 0,
        maximum: 20,
        detail: segment.pedestrian_activity
          ? String(segment.pedestrian_activity) + " nearby-place proxy (" + String(segment.pedestrian_place_count ?? 0) + " activity places)"
          : "Unknown; no complete Places data (not scored)",
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
    <div className="min-h-screen bg-slate-50 px-6 py-8">
      <div className="mx-auto max-w-7xl">
        {/* ==================================================
            HEADER
        ================================================== */}

        <div className="mb-8">
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="mb-5 inline-flex rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Back to Dashboard
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

        <div className="mb-6 grid gap-4 md:grid-cols-5">
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

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Auto-classified terrain</p>
            <p className="mt-2 text-2xl font-bold capitalize text-slate-900">
              {getTerrainGroup(audit.terrain_class)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              IRC terrain class: {audit.terrain_class || "unavailable"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {audit.terrain_profile_length_m != null
                ? `Road profile: ${Math.round(audit.terrain_profile_length_m)} m${audit.terrain_profile_length_m < 1000 ? " (less than 1 km sample)" : ""}`
                : "Road profile geometry unavailable"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {audit.terrain_cross_slope_percent != null && Number.isFinite(Number(audit.terrain_cross_slope_percent))
                ? `${audit.terrain_cross_slope_percent}% cross slope`
                : audit.terrain_profile_length_m != null
                  ? "Elevation samples unavailable"
                  : "Terrain could not be classified"}
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
            <div className="w-full overflow-hidden">
              <table className="w-full table-fixed">
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
                      Estimated congestion
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
                    <Fragment key={segment.id}>
                    <tr className="border-b border-slate-100 hover:bg-slate-50">
                      {/* SEGMENT */}

                      <td className="px-6 py-4">
                        <p className="font-semibold text-slate-900">
                          {segment.segment_code}
                        </p>
                        <button
                          type="button"
                          onClick={() => toggleSegmentDetails(segment)}
                          className="mt-1 text-xs font-medium text-sky-700 hover:text-sky-900"
                        >
                          {expandedSegmentId === segment.id
                            ? "Hide sections"
                            : "View sections"}
                        </button>
                      </td>

                      {/* ROAD */}

                      <td className="px-6 py-4">
                        <p className="max-w-55 truncate text-sm text-slate-700">
                          {segment.road_name || "Unnamed road"}
                        </p>

                        <p className="mt-1 text-xs text-slate-400">
                          {segment.road_class} · {getTerrainGroup(segment.terrain_class)}
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
                        <span>{segment.traffic_level || "Unknown"}</span>
                        {segment.traffic_level && (
                          <p className="mt-1 text-xs text-slate-400">
                            {segment.traffic_delay_percent == null
                              ? "Route delay unavailable"
                              : `+${Number(segment.traffic_delay_percent).toFixed(1)}% route delay`}
                            {segment.traffic_source === "google_routes_congestion_proxy" &&
                              " · Google Routes proxy"}
                          </p>
                        )}
                      </td>

                      {/* PEDESTRIAN */}

                      <td className="px-6 py-4 text-sm capitalize text-slate-700">
                        <span>{segment.pedestrian_activity || "Unknown"}</span>
                        {segment.pedestrian_activity_source === "nearby_places_proxy" && (
                          <p className="mt-1 text-xs text-slate-400">
                            Places proxy · {segment.pedestrian_place_count ?? 0} nearby activity places
                          </p>
                        )}
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
                    {expandedSegmentId === segment.id && (
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <td colSpan={7} className="px-6 py-4">
                          {loadingSegmentId === segment.id ? (
                            <p className="text-sm text-slate-500">Loading subsections...</p>
                          ) : segmentDetails[segment.id] ? (
                            <div>
                              <p className="mb-3 text-sm font-semibold text-slate-800">
                                {segmentDetails[segment.id].subsection_count} subsection(s) for {Number(segmentDetails[segment.id].length_m).toFixed(0)} m, maximum 10
                              </p>
                              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                {segmentDetails[segment.id].subsegments.map(
                                  (subsection) => (
                                    <div
                                      key={subsection.subsection_number}
                                      className="rounded-lg border border-slate-200 bg-white p-3"
                                    >
                                      <p className="text-sm font-medium text-slate-800">
                                        Section {subsection.subsection_number} - {Number(subsection.length_m).toFixed(1)} m
                                      </p>
                                      <p className="mt-1 text-xs text-slate-500">
                                        Risk: {typeof subsection.risk_score === "number" ? subsection.risk_score.toFixed(1) : "Pending"}
                                      </p>
                                    </div>
                                  ),
                                )}
                              </div>
                              <p className="mt-3 text-xs text-amber-700">
                                Subsection scores currently inherit the parent score because separate measurements are not available yet.
                              </p>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    )}
                    </Fragment>
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
              Main segment risk breakdown
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Each SEG card is one main road segment in this audit. A segment
              can be opened to view its shorter subsections; the subsection
              count depends on length and never exceeds 10.
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Raw measurements are converted into risk points using screening
              rules. Risk points have no physical unit; they show relative
              concern on a 0-100 scale.
            </p>
            <p className="mt-2 text-sm text-amber-700">
              Terrain is estimated automatically using the longest suitable
              road profile available, up to 1 km; shorter profiles are labeled
              in the terrain card. Cross-slope transects are evaluated from a
              1 km minimum width up to 5 km. These sampling lengths are
              implementation choices, not IRC-prescribed intervals. Terrain
              and road class are stored separately.
              Operating speed is derived from route data when available; it is
              not a legal speed limit.
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Max speed is shown as report data only. It is not included in the
              risk-score calculation.
            </p>
            <p className="mt-2 text-sm text-amber-700">
              Estimated congestion compares Google Routes traffic-aware travel
              time with static route duration. It is a route-level congestion
              proxy, not a vehicle count or traffic volume. Low is under 100%
              extra delay, medium is 100% to under 500%, and high is 500% or
              more; these are project screening thresholds, not IRC limits.
              The route classification is carried to its steps and derived
              segments.
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
                Example: a gradient above 4% or a curve radius below its
                IRC:86 design minimum adds geometry risk. Speed is compared
                with the IRC:86 design speed for the selected road class and
                detected terrain. Estimated congestion and pedestrian points
                remain application screening scores.
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

          {(() => {
            const selectedSegment =
              segments.find(
                (segment) => String(segment.id) === selectedBreakdownSegmentId,
              ) || segments[0];
            const details = selectedSegment
              ? segmentDetails[selectedSegment.id]
              : null;
            const contributions = selectedSegment
              ? getRiskContributions(selectedSegment)
              : [];
            const calculatedTotal = contributions.reduce(
              (total, factor) => total + factor.value,
              0,
            );

            return (
              <div className="p-6">
                <label className="mb-4 block max-w-xl">
                  <span className="mb-1 block text-sm font-medium text-slate-700">
                    Select a road segment to inspect
                  </span>
                  <select
                    value={selectedSegment ? String(selectedSegment.id) : ""}
                    onChange={(event) =>
                      setSelectedBreakdownSegmentId(event.target.value)
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
                  >
                    {segments.map((segment) => (
                      <option key={segment.id} value={String(segment.id)}>
                        {segment.segment_code} - {Number(segment.length_m).toFixed(0)} m - {segment.road_name || "Unnamed road"}
                      </option>
                    ))}
                  </select>
                  <span className="mt-2 block text-xs text-slate-500">
                    Choose one of the road segments above. Its shorter subsections will appear below.
                  </span>
                </label>

                {!selectedSegment ? (
                  <p className="text-sm text-slate-500">No road segments available.</p>
                ) : loadingSegmentId === selectedSegment.id && !details ? (
                  <p className="text-sm text-slate-500">Loading subsections...</p>
                ) : details ? (
                  <>
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800">
                        {selectedSegment.segment_code} - {Number(details.length_m).toFixed(0)} m road segment, divided into {details.subsection_count} subsection(s)
                      </p>
                      <p className="text-xs text-slate-500">
                        Parent segment average score: {typeof details.risk_score === "number" ? details.risk_score.toFixed(1) : "Pending"}/100
                      </p>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-2">
                      {details.subsegments.map((subsection) => (
                        <article
                          key={subsection.subsection_number}
                          className="rounded-xl border border-slate-200 bg-slate-50 p-5"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-semibold text-slate-900">
                                {selectedSegment.segment_code} - Section {subsection.subsection_number}
                              </p>
                              <p className="mt-1 text-sm text-slate-500">
                                Length: {Number(subsection.length_m).toFixed(1)} m
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-2xl font-bold text-slate-900">
                                {typeof subsection.risk_score === "number"
                                  ? subsection.risk_score.toFixed(1)
                                  : calculatedTotal}
                                <span className="text-sm font-medium text-slate-400">/100</span>
                              </p>
                              <span className={`text-xs font-semibold capitalize ${getRiskClass(subsection.risk_level).split(" ").pop()}`}>
                                {subsection.risk_level || "Pending"}
                              </span>
                            </div>
                          </div>
                          <div className="mt-4 space-y-2">
                            {contributions.map((factor) => (
                              <div key={factor.label} className="flex justify-between gap-3 text-xs text-slate-600">
                                <span>
                                  {factor.label}
                                  <span className="ml-1 text-slate-400">
                                    ({factor.detail})
                                  </span>
                                </span>
                                <span>{factor.value} / {factor.maximum}</span>
                              </div>
                            ))}
                          </div>
                        </article>
                      ))}
                    </div>
                    <p className="mt-3 text-xs text-amber-700">
                      Factor measurements and scores, including gradient, are
                      inherited from the selected parent segment. Separate
                      measurements for each subsection are not available yet.
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">Choose a segment to load its subsections.</p>
                )}
              </div>
            );
          })()}
        </div>

        {/* ==================================================
            CHECKLIST
        ================================================== */}

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-6">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Urban Road-Safety Screening Checklist
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Checks are evaluated separately for each segment, so repeated questions refer to different road sections. Missing measurements remain pending.
                </p>
                <p className="mt-2 max-w-5xl text-sm leading-6 text-slate-600">
                  <strong>Basis:</strong> Gradient, design-speed and minimum-radius
                  reference values are drawn from IRC:86-2018 Clause 9.2,
                  Table 3.1, and Table 8.2 using its 7% superelevation column.
                  Automated operating-speed bands, congestion
                  and pedestrian-proxy classes, risk points, and the field-review
                  prompt are project screening rules; they are not all prescribed
                  by IRC and this checklist is not a full compliance certification.{" "}
                  <a
                    href="https://law.resource.org/pub/in/bis/irc/irc.gov.in.086.2018.pdf"
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-sky-700 underline"
                  >
                    IRC:86-2018 source
                  </a>
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleGenerateChecklist}
                  disabled={generatingChecklist || segments.length === 0}
                  aria-busy={generatingChecklist}
                  className="inline-flex min-h-10 items-center justify-center rounded-lg border border-sky-800 bg-sky-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none"
                >
                  {generatingChecklist
                    ? "Generating..."
                    : checklist.length
                      ? "Regenerate checklist"
                      : "Generate checklist"}
                </button>

                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                  Total: {checklistStats.total}
                </span>

                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                  Pass: {checklistStats.pass}
                </span>

                <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
                  Fail: {checklistStats.fail}
                </span>

                <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-medium text-orange-700">
                  Flagged: {checklistStats.flagged}
                </span>

                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                  Review: {checklistStats.review}
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
                Use Generate checklist to create screening checks from the saved road segments.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {checklist.map((item) => {
                const linkedSegment = segments.find(
                  (segment) => String(segment.id) === String(item.segment_id),
                );
                return (
                  <div key={item.id} className="p-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="max-w-4xl">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700">
                          {linkedSegment?.segment_code || (item.segment_id
                            ? "Segment"
                            : "Audit-wide")}
                        </span>

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
                            : item.status === "fail" || item.status === "flagged"
                              ? "bg-red-50 text-red-700"
                              : item.status === "review"
                                ? "bg-blue-50 text-blue-700"
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
                );
              })}
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
