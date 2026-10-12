import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import AppShell from "../components/layout/AppShell";
import PotholeScanner from "../components/pothole/PotholeScanner";
import { SkeletonPage } from "../components/common/ui";
import { getAudits } from "../services/api";

function PotholeScanPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialAuditId = searchParams.get("auditId");

  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAudits()
      .then((data) => setAudits(data || []))
      .catch(() => setAudits([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell>
      {loading ? (
        <SkeletonPage />
      ) : (
        <PotholeScanner
          audits={audits}
          currentAuditId={initialAuditId}
          onSaved={(auditId) => navigate(auditId ? `/audits/${auditId}` : "/audits")}
        />
      )}
    </AppShell>
  );
}

export default PotholeScanPage;
