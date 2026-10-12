import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { BrandMark } from "../components/layout/Navbar";
import { Notice } from "../components/common/ui";

const DEMO_EMAIL = "admin@smartroad.local";
const DEMO_PASSWORD = "smartroad123";

function Login() {
  const navigate = useNavigate();

  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");

  function handleChange(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }));
    setError("");
  }

  function handleSubmit(event) {
    event.preventDefault();

    // Demo authentication
    if (form.email.trim() === DEMO_EMAIL && form.password === DEMO_PASSWORD) {
      navigate("/dashboard");
      return;
    }
    setError("Incorrect email or password. Use the demo credentials below.");
  }

  function fillDemo() {
    setForm({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
    setError("");
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center px-4 sm:px-6">
        <BrandMark to="/" />
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:items-center sm:pt-0">
        <div className="w-full max-w-sm">
          <div className="card p-6 sm:p-8">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Sign in</h1>
            <p className="mt-1 text-sm text-slate-600">Welcome back. Sign in to your workspace.</p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label htmlFor="email" className="field-label">Email</label>
                <input
                  id="email"
                  type="email"
                  required
                  value={form.email}
                  onChange={(event) => handleChange("email", event.target.value)}
                  placeholder="you@company.com"
                  autoComplete="email"
                  inputMode="email"
                  className="input mt-1.5"
                />
              </div>

              <div>
                <label htmlFor="password" className="field-label">Password</label>
                <input
                  id="password"
                  type="password"
                  required
                  value={form.password}
                  onChange={(event) => handleChange("password", event.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  className="input mt-1.5"
                />
              </div>

              {error && <Notice tone="error">{error}</Notice>}

              <button type="submit" className="btn btn-primary w-full py-3">
                Sign in
              </button>
            </form>
          </div>

          <div className="mt-4 rounded-lg border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-600">
            <p className="font-medium text-slate-700">Demo account</p>
            <p className="mt-1 break-all font-mono text-xs">
              {DEMO_EMAIL} / {DEMO_PASSWORD}
            </p>
            <button type="button" onClick={fillDemo} className="mt-2 text-sm font-semibold text-blue-600 hover:text-blue-700">
              Fill in demo credentials
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

export default Login;
