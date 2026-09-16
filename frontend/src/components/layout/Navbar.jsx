import { useNavigate } from "react-router-dom";

function Navbar() {
  const navigate = useNavigate();

  return (
    <nav className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">

      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">

        {/* ==================================================
            LOGO
        ================================================== */}

        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-3"
        >

          <div className="flex size-9 items-center justify-center rounded-xl bg-slate-900 text-sm font-bold text-white">
            SR
          </div>

          <div className="hidden text-left sm:block">

            <p className="text-sm font-bold tracking-tight text-slate-900">
              SmartRoad
            </p>

            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
              Audit System
            </p>

          </div>

        </button>

        {/* ==================================================
            NAVIGATION
        ================================================== */}

        <div className="hidden items-center gap-1 md:flex">

          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          >
            Dashboard
          </button>

          <button
            type="button"
            onClick={() => navigate("/audits")}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          >
            Audit History
          </button>

          <button
            type="button"
            onClick={() =>
              navigate("/audits/create")
            }
            className="ml-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            + New Audit
          </button>

        </div>

        {/* ==================================================
            USER AREA
        ================================================== */}

        <div className="flex items-center gap-3">

          <div className="hidden text-right sm:block">

            <p className="text-sm font-semibold text-slate-800">
              Audit User
            </p>

            <p className="text-xs text-slate-400">
              Road Safety Analyst
            </p>

          </div>

          <button
            type="button"
            onClick={() => navigate("/login")}
            className="flex size-9 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-blue-600 transition hover:bg-blue-100"
            title="Account"
          >
            U
          </button>

        </div>

      </div>

      {/* ==================================================
          MOBILE NAVIGATION
      ================================================== */}

      <div className="border-t border-slate-100 px-6 py-2 md:hidden">

        <div className="flex items-center gap-2 overflow-x-auto">

          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Dashboard
          </button>

          <button
            type="button"
            onClick={() => navigate("/audits")}
            className="shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            History
          </button>

          <button
            type="button"
            onClick={() =>
              navigate("/audits/create")
            }
            className="shrink-0 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
          >
            + New Audit
          </button>

        </div>

      </div>

    </nav>
  );
}

export default Navbar;