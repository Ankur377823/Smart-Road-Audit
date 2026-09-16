import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { getAudits } from "../services/api";
import Navbar from "../components/layout/Navbar";

function Dashboard() {
  const navigate = useNavigate();

  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ==========================================================
  // LOAD AUDITS
  // ==========================================================

  useEffect(() => {
    async function loadAudits() {
      try {
        setLoading(true);
        setError("");

        const data = await getAudits();

        setAudits(data || []);
      } catch (err) {
        setError(
          err.message ||
            "Unable to load dashboard data."
        );
      } finally {
        setLoading(false);
      }
    }

    loadAudits();
  }, []);

  // ==========================================================
  // DASHBOARD STATISTICS
  // ==========================================================

  const statistics = useMemo(() => {
    const total = audits.length;

    const ready = audits.filter(
      (audit) =>
        audit.status?.toLowerCase() === "ready"
    ).length;

    const processing = audits.filter(
      (audit) =>
        audit.status?.toLowerCase() ===
        "processing"
    ).length;

    const failed = audits.filter(
      (audit) =>
        audit.status?.toLowerCase() === "failed"
    ).length;

    const scored = audits.filter(
      (audit) =>
        typeof audit.compliance_score ===
        "number"
    );

    const averageCompliance =
      scored.length > 0
        ? scored.reduce(
            (total, audit) =>
              total + audit.compliance_score,
            0
          ) / scored.length
        : null;

    return {
      total,
      ready,
      processing,
      failed,
      averageCompliance,
    };
  }, [audits]);

  // ==========================================================
  // HELPERS
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

  function formatDate(date) {
    if (!date) {
      return "-";
    }

    return new Date(date).toLocaleDateString(
      "en-IN",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }
    );
  }

  // ==========================================================
  // LOADING STATE
  // ==========================================================

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar />

        <div className="px-6 py-8">
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
      </div>
    );
  }

  // ==========================================================
  // MAIN UI
  // ==========================================================

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ====================================================
          NAVBAR
      ==================================================== */}

      <Navbar />

      <main className="px-6 py-8">

        <div className="mx-auto max-w-7xl">

          {/* ==================================================
              HEADER
          ================================================== */}

          <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">

            <div>

              <p className="mb-2 text-sm font-medium uppercase tracking-wider text-blue-600">
                SmartRoad Audit
              </p>

              <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                Road Safety Dashboard
              </h1>

              <p className="mt-2 text-slate-600">
                Monitor road audits, risk analysis,
                compliance, and field verification.
              </p>

            </div>

            <div className="flex flex-wrap gap-3">

              <button
                type="button"
                onClick={() =>
                  navigate("/scanner")
                }
                className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-5 py-3 text-sm font-semibold text-sky-700 transition hover:bg-sky-500/20"
              >
                Scan Potholes
              </button>

              <button
                type="button"
                onClick={() =>
                  navigate("/audits")
                }
                className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Audit History
              </button>

              <button
                type="button"
                onClick={() =>
                  navigate("/audits/create")
                }
                className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                + New Audit
              </button>

            </div>

          </div>

          {/* ==================================================
              ERROR
          ================================================== */}

          {error && (
            <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* ==================================================
              STATISTICS
          ================================================== */}

          <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">

            {/* TOTAL */}

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

              <p className="text-sm font-medium text-slate-500">
                Total Audits
              </p>

              <p className="mt-3 text-3xl font-bold text-slate-900">
                {statistics.total}
              </p>

              <p className="mt-2 text-xs text-slate-400">
                All created road audits
              </p>

            </div>

            {/* COMPLETED */}

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

              <p className="text-sm font-medium text-slate-500">
                Completed
              </p>

              <p className="mt-3 text-3xl font-bold text-emerald-600">
                {statistics.ready}
              </p>

              <p className="mt-2 text-xs text-slate-400">
                Ready for review
              </p>

            </div>

            {/* PROCESSING */}

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

              <p className="text-sm font-medium text-slate-500">
                Processing
              </p>

              <p className="mt-3 text-3xl font-bold text-blue-600">
                {statistics.processing}
              </p>

              <p className="mt-2 text-xs text-slate-400">
                Currently being analyzed
              </p>

            </div>

            {/* COMPLIANCE */}

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

              <p className="text-sm font-medium text-slate-500">
                Avg. Compliance
              </p>

              <p className="mt-3 text-3xl font-bold text-slate-900">
                {statistics.averageCompliance !==
                null
                  ? statistics.averageCompliance.toFixed(
                      1
                    )
                  : "--"}
              </p>

              <p className="mt-2 text-xs text-slate-400">
                Based on scored audits
              </p>

            </div>

          </div>

          {/* ==================================================
              QUICK ACTIONS
          ================================================== */}

          <div className="mb-8 grid gap-5 md:grid-cols-3">

            {/* CREATE AUDIT */}

            <button
              type="button"
              onClick={() =>
                navigate("/audits/create")
              }
              className="group rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
            >

              <div className="flex size-11 items-center justify-center rounded-xl bg-blue-50 text-xl text-blue-600">
                +
              </div>

              <h2 className="mt-5 font-semibold text-slate-900">
                Create Audit
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Select a location, define the audit
                radius, and start a new road safety
                analysis.
              </p>

              <span className="mt-4 inline-block text-sm font-semibold text-blue-600">
                Start audit →
              </span>

            </button>

            {/* HISTORY */}

            <button
              type="button"
              onClick={() =>
                navigate("/audits")
              }
              className="group rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
            >

              <div className="flex size-11 items-center justify-center rounded-xl bg-slate-100 text-xl">
                ≡
              </div>

              <h2 className="mt-5 font-semibold text-slate-900">
                Audit History
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Review previously created audits and
                open their detailed analysis.
              </p>

              <span className="mt-4 inline-block text-sm font-semibold text-slate-700">
                View history →
              </span>

            </button>

            {/* FIELD AUDIT */}

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

              <div className="flex size-11 items-center justify-center rounded-xl bg-amber-50 text-xl text-amber-600">
                !
              </div>

              <h2 className="mt-5 font-semibold text-slate-900">
                Field Verification
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Automated analysis identifies locations
                that may require physical field
                verification.
              </p>

              <span className="mt-4 inline-block text-sm font-semibold text-amber-600">
                Review flagged areas
              </span>

            </div>

          </div>

          {/* ==================================================
              RECENT AUDITS
          ================================================== */}

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

            <div className="flex flex-col justify-between gap-3 border-b border-slate-200 px-6 py-5 md:flex-row md:items-center">

              <div>

                <h2 className="text-lg font-semibold text-slate-900">
                  Recent Audits
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Your latest road safety audits.
                </p>

              </div>

              {audits.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    navigate("/audits")
                  }
                  className="text-sm font-semibold text-blue-600 hover:text-blue-700"
                >
                  View all →
                </button>
              )}

            </div>

            {/* =================================================
                EMPTY STATE
            ================================================= */}

            {audits.length === 0 ? (

              <div className="p-10 text-center">

                <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-slate-100 text-2xl text-slate-400">
                  +
                </div>

                <h3 className="mt-4 font-semibold text-slate-900">
                  No audits created yet
                </h3>

                <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
                  Start your first road safety audit
                  to see results and insights here.
                </p>

                <button
                  type="button"
                  onClick={() =>
                    navigate("/audits/create")
                  }
                  className="mt-5 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Create Audit
                </button>

              </div>

            ) : (

              /* =================================================
                 RECENT AUDIT LIST
              ================================================= */

              <div className="divide-y divide-slate-100">

                {audits
                  .slice(0, 5)
                  .map((audit) => (

                    <button
                      key={audit.id}
                      type="button"
                      onClick={() =>
                        navigate(
                          `/audits/${audit.id}`
                        )
                      }
                      className="flex w-full flex-col gap-4 px-6 py-5 text-left transition hover:bg-slate-50 md:flex-row md:items-center md:justify-between"
                    >

                      {/* LOCATION */}

                      <div className="min-w-0">

                        <div className="flex items-center gap-3">

                          <h3 className="truncate font-semibold text-slate-900">
                            {audit.location_name ||
                              "Unnamed Audit"}
                          </h3>

                          <span
                            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${getStatusClass(
                              audit.status
                            )}`}
                          >
                            {audit.status}
                          </span>

                        </div>

                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">

                          <span>
                            Audit #{audit.id}
                          </span>

                          <span className="capitalize">
                            {audit.road_class}
                          </span>

                          <span>
                            {audit.radius_m >=
                            1000
                              ? `${audit.radius_m / 1000} km`
                              : `${audit.radius_m} m`}
                          </span>

                          <span>
                            {formatDate(
                              audit.created_at
                            )}
                          </span>

                        </div>

                      </div>

                      {/* COMPLIANCE */}

                      <div className="flex items-center gap-6">

                        <div className="text-left md:text-right">

                          <p className="text-xs text-slate-400">
                            Compliance
                          </p>

                          <p className="mt-1 font-semibold text-slate-900">

                            {audit.compliance_score !==
                              null &&
                            audit.compliance_score !==
                              undefined
                              ? `${audit.compliance_score}/100`
                              : "Pending"}

                          </p>

                        </div>

                        <span className="text-lg text-slate-300">
                          →
                        </span>

                      </div>

                    </button>

                  ))}

              </div>

            )}

          </div>

        </div>

      </main>

    </div>
  );
}

export default Dashboard;