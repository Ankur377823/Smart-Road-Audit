import { Navigate, Route, Routes } from "react-router-dom";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import CreateAudit from "./pages/CreateAudit";
import AuditDetails from "./pages/AuditDetails";
import AuditHistory from "./pages/AuditHistory";

function App() {
  return (
    <Routes>
      {/* ==================================================
          LANDING
      ================================================== */}

      <Route
        path="/"
        element={<Landing />}
      />

      {/* ==================================================
          LOGIN
      ================================================== */}

      <Route
        path="/login"
        element={<Login />}
      />

      {/* ==================================================
          DASHBOARD
      ================================================== */}

      <Route
        path="/dashboard"
        element={<Dashboard />}
      />

      {/* ==================================================
          CREATE AUDIT
      ================================================== */}

      <Route
        path="/audits/create"
        element={<CreateAudit />}
      />

      {/* ==================================================
          AUDIT HISTORY
      ================================================== */}

      <Route
        path="/audits"
        element={<AuditHistory />}
      />

      {/* ==================================================
          AUDIT DETAILS
      ================================================== */}

      <Route
        path="/audits/:auditId"
        element={<AuditDetails />}
      />

      {/* ==================================================
          FALLBACK
      ================================================== */}

      <Route
        path="*"
        element={
          <Navigate
            to="/"
            replace
          />
        }
      />
    </Routes>
  );
}

export default App;