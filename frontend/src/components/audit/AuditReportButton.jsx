import { useState } from "react";

import { IconFileText } from "../common/Icons";
import { openAuditReportById } from "../../utils/auditReport";
import { openReportWindow } from "../../utils/potholeReport";

/**
 * "PDF report" button for an audit in a list; loads the audit's data and opens its report.
 */
function AuditReportButton({ auditId, className = "btn btn-primary px-3 py-2" }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleClick = async (event) => {
    // Rows in the lists are links or clickable; keep the click on the button
    event.preventDefault();
    event.stopPropagation();
    // Opened inside the click so mobile browsers don't block the new tab
    const target = openReportWindow("Generating audit report…");
    setBusy(true);
    setError("");
    try {
      await openAuditReportById(auditId, target);
    } catch (err) {
      target?.close();
      setError(err.message || "Could not create the report.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button type="button" onClick={handleClick} disabled={busy} className={className}>
        <IconFileText className="size-4" />
        {busy ? "Creating PDF…" : "PDF report"}
      </button>
      {error && <span className="max-w-56 text-right text-xs text-red-600">{error}</span>}
    </span>
  );
}

export default AuditReportButton;
