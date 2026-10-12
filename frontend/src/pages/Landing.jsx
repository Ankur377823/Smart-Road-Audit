import { Link } from "react-router-dom";

import { BrandMark } from "../components/layout/Navbar";
import { isSignedIn, loginPath } from "../services/session";
import { IconArrowRight, IconCheck, IconRoad, IconScan, IconShield } from "../components/common/Icons";

const FEATURES = [
  {
    icon: IconRoad,
    title: "Risk screening",
    description: "Split a road network into segments and score each one on gradient, curves, speed, traffic and pedestrians.",
  },
  {
    icon: IconScan,
    title: "Pothole detection",
    description: "Scan the road with a phone camera. Potholes are detected on the device, geotagged and sized.",
  },
  {
    icon: IconShield,
    title: "IRC checklist",
    description: "Get an audit checklist that flags what passes, what fails and what needs a site visit.",
  },
];

function Landing() {
  // Signed-in visitors go straight to the page; everyone else signs in first and is then sent on
  const entry = (path) => (isSignedIn() ? path : loginPath(path));

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <BrandMark to="/" />
        <Link to={entry("/dashboard")} className="text-sm font-semibold text-slate-700 hover:text-slate-900">
          {isSignedIn() ? "Open dashboard" : "Sign in"}
        </Link>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-6 sm:pt-20 lg:pb-24">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold text-blue-600">Road safety audit platform</p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
              Find road safety risks before they become accidents.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
              SmartRoad Audit combines segment risk scoring, on-device pothole detection and IRC checklists in one
              workspace for road safety teams.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to={entry("/dashboard")} className="btn btn-primary px-6 py-3 text-base">
                Get started
                <IconArrowRight className="size-4" />
              </Link>
              <Link to={entry("/scanner")} className="btn btn-secondary px-6 py-3 text-base">
                Try the pothole scanner
              </Link>
            </div>
            <ul className="mt-8 flex flex-col gap-2 text-sm text-slate-600 sm:flex-row sm:gap-6">
              {["Works on any phone browser", "No app install", "Geotagged evidence"].map((point) => (
                <li key={point} className="flex items-center gap-2">
                  <IconCheck className="size-4 text-emerald-600" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-t border-slate-200 bg-slate-50">
          <div className="mx-auto grid max-w-6xl gap-4 px-4 py-12 sm:grid-cols-3 sm:px-6 sm:py-16">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <div key={title} className="card p-5">
                <span className="flex size-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <Icon className="size-5" />
                </span>
                <h2 className="mt-4 font-semibold text-slate-900">{title}</h2>
                <p className="mt-1.5 text-sm leading-6 text-slate-600">{description}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200">
        <p className="mx-auto max-w-6xl px-4 py-6 text-xs text-slate-500 sm:px-6">
          SmartRoad Audit · Screening results support, but do not replace, a professional road safety audit.
        </p>
      </footer>
    </div>
  );
}

export default Landing;
