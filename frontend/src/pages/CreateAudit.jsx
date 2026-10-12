import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { createAudit, processAudit } from "../services/api";
import AppShell from "../components/layout/AppShell";
import LocationPicker from "../components/audit/LocationPicker";
import { Notice, PageHeader } from "../components/common/ui";
import { IconCheck } from "../components/common/Icons";
import { formatRadius } from "../utils/format";

const ROAD_CLASSES = [
  { value: "local", label: "Local", description: "Residential roads" },
  { value: "collector", label: "Collector", description: "Connecting roads" },
  { value: "arterial", label: "Arterial", description: "Major traffic roads" },
];

function CreateAudit() {
  const navigate = useNavigate();

  const [selectedLocation, setSelectedLocation] = useState(null);
  const [radius, setRadius] = useState(100);
  const [roadClass, setRoadClass] = useState("collector");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  function handleLocationSelect(location) {
    setSelectedLocation(location);
    setError("");
  }

  async function handleCreateAudit(event) {
    event.preventDefault();
    setError("");

    if (!selectedLocation) {
      setError("Select a point on the road first.");
      return;
    }

    try {
      setCreating(true);

      const audit = await createAudit({
        location_name: selectedLocation.name || "Selected road point",
        location_address:
          selectedLocation.address || `${selectedLocation.latitude}, ${selectedLocation.longitude}`,
        center_lat: Number(selectedLocation.latitude),
        center_lng: Number(selectedLocation.longitude),
        radius_m: Number(radius),
        road_class: roadClass,
      });

      await processAudit(audit.id);
      navigate(`/audits/${audit.id}`);
    } catch (err) {
      console.error("Audit creation failed:", err);
      setError(err.message || "Something went wrong while creating the audit.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="New audit"
        description="Pick a road location and set the area to analyse."
        onBack={() => navigate("/audits")}
        backLabel="All audits"
      />

      <form onSubmit={handleCreateAudit} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="card min-w-0 p-4 sm:p-5">
          <h2 className="mb-4 text-base font-semibold text-slate-900">Location</h2>
          <LocationPicker selectedLocation={selectedLocation} onLocationSelect={handleLocationSelect} />
        </section>

        <aside className="card h-fit p-4 sm:p-5 lg:sticky lg:top-24">
          <h2 className="text-base font-semibold text-slate-900">Settings</h2>

          <div className="mt-5">
            <div className="flex items-center justify-between">
              <label htmlFor="radius" className="field-label">Audit radius</label>
              <span className="text-sm font-semibold text-slate-900">{formatRadius(radius)}</span>
            </div>
            <input
              id="radius"
              type="range"
              min="100"
              max="10000"
              step="100"
              value={radius}
              onChange={(event) => setRadius(Number(event.target.value))}
              className="mt-3 w-full accent-slate-900"
            />
            <div className="mt-1 flex justify-between text-xs text-slate-400">
              <span>100 m</span>
              <span>10 km</span>
            </div>
          </div>

          <fieldset className="mt-6">
            <legend className="field-label">Road class</legend>
            <p className="mt-1 text-xs text-slate-500">Used by the screening model; not detected automatically.</p>
            <div className="mt-3 space-y-2">
              {ROAD_CLASSES.map((option) => {
                const active = roadClass === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setRoadClass(option.value)}
                    aria-pressed={active}
                    className={`flex w-full items-center justify-between rounded-lg border px-3.5 py-3 text-left transition ${
                      active ? "border-slate-900 bg-slate-50 ring-1 ring-slate-900" : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <span>
                      <span className="block text-sm font-medium text-slate-900">{option.label}</span>
                      <span className="block text-xs text-slate-500">{option.description}</span>
                    </span>
                    {active && <IconCheck className="size-4 text-slate-900" />}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {error && <Notice tone="error" className="mt-5">{error}</Notice>}

          <button type="submit" disabled={creating || !selectedLocation} className="btn btn-primary mt-6 w-full py-3">
            {creating ? "Running analysis…" : "Start audit"}
          </button>
          <p className="mt-2 text-center text-xs text-slate-500">
            {selectedLocation
              ? "Road, terrain, traffic and location data will be analysed."
              : "Select a road point on the map to continue."}
          </p>
        </aside>
      </form>
    </AppShell>
  );
}

export default CreateAudit;
