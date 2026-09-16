import { useState } from "react";
import { useNavigate } from "react-router-dom";

function Login() {
  const navigate = useNavigate();

  const [loginForm, setLoginForm] = useState({
    email: "",
    password: "",
  });

  const [loginError, setLoginError] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  function handleChange(field, value) {
    setLoginForm((previous) => ({
      ...previous,
      [field]: value,
    }));

    setLoginError("");
  }

  function handleSubmit(event) {
    event.preventDefault();

    setLoginError("");
    setLoading(true);

    // Demo authentication
    if (
      loginForm.email ===
        "admin@smartroad.local" &&
      loginForm.password === "smartroad123"
    ) {
      navigate("/dashboard");
      return;
    }

    setLoginError(
      "Invalid email or password. Please use the demo credentials."
    );

    setLoading(false);
  }

  function handleBack() {
    navigate("/");
  }

  return (
    <main className="login-page min-h-screen px-6 py-8 text-slate-100">

      {/* =====================================================
          BRAND
      ===================================================== */}

      <button
        type="button"
        onClick={handleBack}
        className="brand-mark text-left"
        aria-label="Back to SmartRoad home"
      >
        <span className="brand-dot" />

        <span>
          SmartRoad{" "}
          <b>Audit</b>
        </span>
      </button>

      {/* =====================================================
          LOGIN CONTENT
      ===================================================== */}

      <div className="mx-auto grid min-h-[calc(100vh-100px)] max-w-5xl items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]">

        {/* ===================================================
            LEFT CONTENT
        =================================================== */}

        <div className="hidden lg:block">

          <p className="eyebrow">
            Your road safety command center
          </p>

          <h1 className="login-heading">
            Good decisions
            <br />
            <em>start here.</em>
          </h1>

          <p className="max-w-md text-lg leading-8 text-slate-400">
            Sign in to create audits, review risk
            segments, and keep your work moving in
            one focused place.
          </p>

        </div>

        {/* ===================================================
            LOGIN CARD
        =================================================== */}

        <form
          onSubmit={handleSubmit}
          className="login-card animate-rise"
        >

          <div className="mb-10">

            <p className="eyebrow">
              Welcome back
            </p>

            <h2>
              Sign in to workspace
            </h2>

            <p>
              Use your SmartRoad account to continue.
            </p>

          </div>

          {/* =================================================
              EMAIL
          ================================================= */}

          <label>
            Email address

            <input
              type="email"
              required
              value={loginForm.email}
              onChange={(event) =>
                handleChange(
                  "email",
                  event.target.value
                )
              }
              placeholder="you@company.com"
              autoComplete="email"
            />
          </label>

          {/* =================================================
              PASSWORD
          ================================================= */}

          <label className="mt-5">
            Password

            <input
              type="password"
              required
              value={loginForm.password}
              onChange={(event) =>
                handleChange(
                  "password",
                  event.target.value
                )
              }
              placeholder="Enter your password"
              autoComplete="current-password"
            />
          </label>

          {/* =================================================
              ERROR
          ================================================= */}

          {loginError && (
            <p
              className="login-error"
              role="alert"
            >
              {loginError}
            </p>
          )}

          {/* =================================================
              SUBMIT
          ================================================= */}

          <button
            type="submit"
            disabled={loading}
            className="primary-button mt-7 w-full justify-center disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading
              ? "Entering workspace..."
              : "Enter workspace"}

            {!loading && (
              <span>→</span>
            )}
          </button>

          {/* =================================================
              DEMO ACCESS
          ================================================= */}

          <div className="demo-note">
            <span>Demo access</span>

            <br />

            admin@smartroad.local

            <br />

            smartroad123
          </div>

        </form>

      </div>
    </main>
  );
}

export default Login;