import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import Navbar from "../components/layout/Navbar";
import PotholeScanner from "../components/pothole/PotholeScanner";
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

  const handleSaved = (auditId) => {
    if (auditId) {
      navigate(`/audits/${auditId}`);
    } else {
      navigate("/audits");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {loading ? (
          <div className="flex h-64 items-center justify-center text-sm text-slate-400">
            Loading audits workspace...
          </div>
        ) : (
          <PotholeScanner
            audits={audits}
            currentAuditId={initialAuditId}
            onSaved={handleSaved}
            onBack={() => navigate("/dashboard")}
          />
        )}
      </main>
    </div>
  );
}

export default PotholeScanPage;
