import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { createAudit, processAudit } from "../services/api";

import Navbar from "../components/layout/Navbar";
import LocationPicker from "../components/audit/LocationPicker";

function CreateAudit() {
  const navigate = useNavigate();

  const [selectedLocation, setSelectedLocation] = useState(null);

  const [radius, setRadius] = useState(100);

  const [roadClass, setRoadClass] = useState("collector");

  const [creating, setCreating] = useState(false);

  const [error, setError] = useState("");

  /*
   * ==========================================================
   * LOCATION
   * ==========================================================
   */

  function handleLocationSelect(location) {
    setSelectedLocation(location);
    setError("");
  }

  /*
   * ==========================================================
   * CREATE + PROCESS AUDIT
   * ==========================================================
   */

  async function handleCreateAudit(event) {
    event.preventDefault();

    setError("");

    if (!selectedLocation) {
      setError("Please select a point on the road.");
      return;
    }

    try {
      setCreating(true);

      // 1. Create audit
      const audit = await createAudit({
        location_name: selectedLocation.name || "Selected Road Point",

        location_address:
          selectedLocation.address ||
          `${selectedLocation.latitude}, ${selectedLocation.longitude}`,

        center_lat: Number(selectedLocation.latitude),

        center_lng: Number(selectedLocation.longitude),

        radius_m: Number(radius),

        road_class: roadClass,
      });

      // 2. Process audit
      await processAudit(audit.id);

      // 3. Open audit
      navigate(`/audits/${audit.id}`);
    } catch (err) {
      console.error("Audit creation failed:", err);

      setError(err.message || "Something went wrong while creating the audit.");
    } finally {
      setCreating(false);
    }
  }

  /*
   * ==========================================================
   * UI
   * ==========================================================
   */

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />

      <main className="px-3 py-6 sm:px-5 sm:py-8 lg:px-8">
        <div className="mx-auto max-w-7xl">
          {/* Header */}
          <div className="mb-7">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span>SmartRoad Audit</span>
              <span>/</span>
              <span className="text-slate-700">New Audit</span>
            </div>

            <div className="mt-3">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                Create Audit
              </h1>

              <p className="mt-1 text-sm text-slate-500">
                Select a road location and configure the audit area.
              </p>
            </div>
          </div>

          {/* Main Layout */}
          <form
            onSubmit={handleCreateAudit}
            className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]"
          >
            {/* ==================================================
                LEFT — MAP
            ================================================== */}

            <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    Audit Location
                  </h2>

                  <p className="mt-1 text-xs text-slate-500">
                    Search or click directly on the road.
                  </p>
                </div>

                {selectedLocation && (
                  <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
                    Location selected
                  </span>
                )}
              </div>

              <LocationPicker
                selectedLocation={selectedLocation}
                onLocationSelect={handleLocationSelect}
              />
            </section>

            {/* ==================================================
                RIGHT — SETTINGS
            ================================================== */}

            <aside className="h-fit rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="text-sm font-semibold text-slate-900">
                  Audit Settings
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  Configure the analysis area.
                </p>
              </div>

              <div className="space-y-6 p-5">
                {/* ==================================================
                    SELECTED LOCATION
                ================================================== */}

                <div>
                  <label className="text-xs font-medium text-slate-500">
                    Location
                  </label>

                  {selectedLocation ? (
                    <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-start gap-3">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm">
                          📍
                        </div>

                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900">
                            {selectedLocation.name || "Selected Road Point"}
                          </p>

                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                            {selectedLocation.address}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex gap-2">
                        <span className="rounded-md bg-white px-2 py-1 text-[11px] text-slate-500">
                          {Number(selectedLocation.latitude).toFixed(5)}
                        </span>

                        <span className="rounded-md bg-white px-2 py-1 text-[11px] text-slate-500">
                          {Number(selectedLocation.longitude).toFixed(5)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
                      Select a point on the map
                    </div>
                  )}
                </div>

                {/* ==================================================
                    RADIUS
                ================================================== */}

                <div>
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="radius"
                      className="text-xs font-medium text-slate-500"
                    >
                      Audit Radius
                    </label>

                    <span className="text-sm font-semibold text-slate-900">
                      {radius >= 1000 ? `${radius / 1000} km` : `${radius} m`}
                    </span>
                  </div>

                  <input
                    id="radius"
                    type="range"
                    min="100"
                    max="10000"
                    step="100"
                    value={radius}
                    onChange={(event) => setRadius(Number(event.target.value))}
                    className="mt-4 w-full accent-slate-900"
                  />

                  <div className="mt-2 flex justify-between text-[11px] text-slate-400">
                    <span>100 m</span>
                    <span>10 km</span>
                  </div>
                </div>

                {/* ==================================================
                    ROAD CLASS
                ================================================== */}

                <div>
                  <label className="text-xs font-medium text-slate-500">
                    Road Class
                  </label>

                  <p className="mt-1 text-[11px] leading-4 text-slate-400">
                    This is the category used for the screening model. It is not
                    detected automatically from Google.
                  </p>

                  <div className="mt-2 space-y-2">
                    {/* Local */}
                    <button
                      type="button"
                      onClick={() => setRoadClass("local")}
                      className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-3 text-left transition ${
                        roadClass === "local"
                          ? "border-slate-900 bg-slate-50"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          Local
                        </p>

                        <p className="mt-0.5 text-[11px] text-slate-500">
                          Residential roads
                        </p>
                      </div>

                      {roadClass === "local" && (
                        <span className="text-sm text-slate-900">✓</span>
                      )}
                    </button>

                    {/* Collector */}
                    <button
                      type="button"
                      onClick={() => setRoadClass("collector")}
                      className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-3 text-left transition ${
                        roadClass === "collector"
                          ? "border-slate-900 bg-slate-50"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          Collector
                        </p>

                        <p className="mt-0.5 text-[11px] text-slate-500">
                          Connecting roads
                        </p>
                      </div>

                      {roadClass === "collector" && (
                        <span className="text-sm text-slate-900">✓</span>
                      )}
                    </button>

                    {/* Arterial */}
                    <button
                      type="button"
                      onClick={() => setRoadClass("arterial")}
                      className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-3 text-left transition ${
                        roadClass === "arterial"
                          ? "border-slate-900 bg-slate-50"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          Arterial
                        </p>

                        <p className="mt-0.5 text-[11px] text-slate-500">
                          Major traffic roads
                        </p>
                      </div>

                      {roadClass === "arterial" && (
                        <span className="text-sm text-slate-900">✓</span>
                      )}
                    </button>
                  </div>
                </div>

                {/* ==================================================
                    ERROR
                ================================================== */}

                {error && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-xs leading-5 text-red-700">
                    {error}
                  </div>
                )}

                {/* ==================================================
                    SUMMARY
                ================================================== */}

                <div className="rounded-xl bg-slate-50 p-3.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Radius</span>

                    <span className="font-medium text-slate-900">
                      {radius >= 1000 ? `${radius / 1000} km` : `${radius} m`}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="text-slate-500">Road class</span>

                    <span className="font-medium capitalize text-slate-900">
                      {roadClass}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="text-slate-500">Location</span>

                    <span
                      className={
                        selectedLocation
                          ? "font-medium text-green-600"
                          : "font-medium text-slate-400"
                      }
                    >
                      {selectedLocation ? "Selected" : "Required"}
                    </span>
                  </div>
                </div>

                {/* ==================================================
                    START AUDIT
                ================================================== */}

                <button
                  type="submit"
                  disabled={creating || !selectedLocation}
                  className="w-full rounded-xl bg-slate-900 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {creating ? "Processing Audit..." : "Start Audit"}
                </button>

                <p className="text-center text-[11px] leading-4 text-slate-400">
                  The selected area will be analyzed using road, terrain,
                  traffic and location data.
                </p>
              </div>
            </aside>
          </form>
        </div>
      </main>
    </div>
  );
}

export default CreateAudit;
