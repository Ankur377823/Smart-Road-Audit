import { Navigate, Route, Routes } from "react-router-dom";

import RequireAuth from "./components/layout/RequireAuth";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import CreateAudit from "./pages/CreateAudit";
import AuditDetails from "./pages/AuditDetails";
import AuditHistory from "./pages/AuditHistory";
import PotholeScanPage from "./pages/PotholeScanPage";

const protect = (element) => <RequireAuth>{element}</RequireAuth>;

function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />

      {/* Signed-in pages */}
      <Route path="/dashboard" element={protect(<Dashboard />)} />
      <Route path="/audits" element={protect(<AuditHistory />)} />
      <Route path="/audits/create" element={protect(<CreateAudit />)} />
      <Route path="/audits/:auditId" element={protect(<AuditDetails />)} />
      <Route path="/scanner" element={protect(<PotholeScanPage />)} />
      <Route path="/potholes/scan" element={<Navigate to="/scanner" replace />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
