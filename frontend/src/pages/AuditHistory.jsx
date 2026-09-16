import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { getAudits } from "../services/api";

function AuditHistory() {
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
            "Unable to load audit history."
        );
      } finally {
        setLoading(false);
      }
    }

    loadAudits();
  }, []);

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
  // LOADING
  // ==========================================================

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 px-6 py-8">
        <div className="mx-auto max-w-7xl">

          <div className="mb-8">
            <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />

            <div className="mt-3 h-9 w-64 animate-pulse rounded bg-slate-200" />

            <div className="mt-3 h-4 w-96 animate-pulse rounded bg-slate-200" />
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="h-14 animate-pulse bg-slate-100" />

            {[1, 2, 3, 4, 5].map((item) => (
              <div
                key={item}
                className="h-20 animate-pulse border-t border-slate-100 bg-white"
              />
            ))}
          </div>

        </div>
      </div>
    );
  }

  // ==========================================================
  // ERROR
  // ==========================================================

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 px-6 py-8">
        <div className="mx-auto max-w-3xl">

          <div className="rounded-2xl border border-red-200 bg-red-50 p-6">

            <h1 className="text-lg font-semibold text-red-900">
              Unable to load audit history
            </h1>

            <p className="mt-2 text-sm text-red-700">
              {error}
            </p>

            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              Try Again
            </button>

          </div>

        </div>
      </div>
    );
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

        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">

          <div>

            <p className="mb-2 text-sm font-medium uppercase tracking-wider text-blue-600">
              SmartRoad Audit
            </p>

            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Audit History
            </h1>

            <p className="mt-2 text-slate-600">
              View and manage previously created road
              safety audits.
            </p>

          </div>

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

        {/* ==================================================
            EMPTY STATE
        ================================================== */}

        {audits.length === 0 ? (

          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">

            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-slate-100 text-2xl">
              +
            </div>

            <h2 className="mt-5 text-lg font-semibold text-slate-900">
              No audits yet
            </h2>

            <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
              Create your first road safety audit to
              start analyzing road conditions and
              identifying potential risk areas.
            </p>

            <button
              type="button"
              onClick={() =>
                navigate("/audits/create")
              }
              className="mt-6 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Create First Audit
            </button>

          </div>

        ) : (

          /* =================================================
             AUDIT TABLE
          ================================================= */

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

            {/* TABLE HEADER */}

            <div className="border-b border-slate-200 px-6 py-5">

              <div className="flex items-center justify-between">

                <div>

                  <h2 className="text-lg font-semibold text-slate-900">
                    Previous Audits
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    {audits.length}{" "}
                    {audits.length === 1
                      ? "audit"
                      : "audits"}{" "}
                    found
                  </p>

                </div>

              </div>

            </div>

            <div className="overflow-x-auto">

              <table className="w-full min-w-850">

                <thead>

                  <tr className="border-b border-slate-200 bg-slate-50 text-left">

                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Location
                    </th>

                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Road Class
                    </th>

                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Radius
                    </th>

                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Status
                    </th>

                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Compliance
                    </th>

                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Created
                    </th>

                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Action
                    </th>

                  </tr>

                </thead>

                <tbody>

                  {audits.map((audit) => (

                    <tr
                      key={audit.id}
                      className="border-b border-slate-100 transition last:border-0 hover:bg-slate-50"
                    >

                      {/* LOCATION */}

                      <td className="px-6 py-5">

                        <div className="max-w-70">

                          <p className="truncate font-semibold text-slate-900">
                            {audit.location_name ||
                              "Unnamed Audit"}
                          </p>

                          <p className="mt-1 truncate text-xs text-slate-500">
                            Audit #{audit.id}
                          </p>

                        </div>

                      </td>

                      {/* ROAD CLASS */}

                      <td className="px-6 py-5">

                        <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold capitalize text-slate-700">
                          {audit.road_class}
                        </span>

                      </td>

                      {/* RADIUS */}

                      <td className="px-6 py-5 text-sm text-slate-700">

                        {audit.radius_m >= 1000
                          ? `${audit.radius_m / 1000} km`
                          : `${audit.radius_m} m`}

                      </td>

                      {/* STATUS */}

                      <td className="px-6 py-5">

                        <span
                          className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${getStatusClass(
                            audit.status
                          )}`}
                        >
                          {audit.status}
                        </span>

                      </td>

                      {/* COMPLIANCE */}

                      <td className="px-6 py-5">

                        {audit.compliance_score !==
                          null &&
                        audit.compliance_score !==
                          undefined ? (

                          <span className="font-semibold text-slate-900">
                            {audit.compliance_score}
                            <span className="ml-1 text-xs font-normal text-slate-400">
                              /100
                            </span>
                          </span>

                        ) : (

                          <span className="text-sm text-slate-400">
                            Pending
                          </span>

                        )}

                      </td>

                      {/* CREATED */}

                      <td className="px-6 py-5 text-sm text-slate-500">

                        {formatDate(
                          audit.created_at
                        )}

                      </td>

                      {/* ACTION */}

                      <td className="px-6 py-5">

                        <button
                          type="button"
                          onClick={() =>
                            navigate(
                              `/audits/${audit.id}`
                            )
                          }
                          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
                        >
                          View
                        </button>

                      </td>

                    </tr>

                  ))}

                </tbody>

              </table>

            </div>

          </div>

        )}

      </div>

    </div>
  );
}

export default AuditHistory;