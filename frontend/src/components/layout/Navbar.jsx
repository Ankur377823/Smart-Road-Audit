import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { IconClose, IconLogout, IconMenu, IconPlus } from "../common/Icons";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", match: (path) => path === "/dashboard" },
  { to: "/audits", label: "Audits", match: (path) => path.startsWith("/audits") && path !== "/audits/create" },
  { to: "/scanner", label: "Pothole scanner", match: (path) => path === "/scanner" || path === "/potholes/scan" },
];

export function BrandMark({ to = "/dashboard" }) {
  return (
    <Link to={to} className="flex items-center gap-2.5" aria-label="SmartRoad Audit home">
      <span className="flex size-8 items-center justify-center rounded-lg bg-slate-900 text-xs font-bold tracking-tight text-white">
        SR
      </span>
      <span className="text-base font-semibold tracking-tight text-slate-900">
        SmartRoad <span className="font-normal text-slate-500">Audit</span>
      </span>
    </Link>
  );
}

function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile menu after navigating
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const linkProps = (item, base, active, idle) => {
    const isActive = item.match(location.pathname);
    return {
      to: item.to,
      "aria-current": isActive ? "page" : undefined,
      className: `${base} ${isActive ? active : idle}`,
    };
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:h-16 sm:px-6">
        <BrandMark />

        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              {...linkProps(
                item,
                "rounded-lg px-3 py-2 text-sm font-medium transition",
                "bg-slate-100 text-slate-900",
                "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <button type="button" onClick={() => navigate("/audits/create")} className="btn btn-primary">
            <IconPlus className="size-4" />
            New audit
          </button>
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            title="Sign out"
            aria-label="Sign out"
          >
            <IconLogout className="size-5" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          className="-mr-2 rounded-lg p-2 text-slate-700 transition hover:bg-slate-100 md:hidden"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
        >
          {menuOpen ? <IconClose className="size-6" /> : <IconMenu className="size-6" />}
        </button>
      </div>

      {menuOpen && (
        <nav id="mobile-menu" className="border-t border-slate-200 bg-white px-4 pb-4 pt-2 shadow-sm md:hidden" aria-label="Main">
          <div className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.to}
                {...linkProps(item, "rounded-lg px-3 py-3 text-base font-medium", "bg-slate-100 text-slate-900", "text-slate-700")}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-200 pt-3">
            <button type="button" onClick={() => navigate("/audits/create")} className="btn btn-primary">
              <IconPlus className="size-4" />
              New audit
            </button>
            <button type="button" onClick={() => navigate("/login")} className="btn btn-secondary">
              <IconLogout className="size-4" />
              Sign out
            </button>
          </div>
        </nav>
      )}
    </header>
  );
}

export default Navbar;
