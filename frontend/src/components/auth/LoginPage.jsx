function LoginPage({ loginForm, loginError, onChange, onSubmit, onBack }) {
  return (
    <main className="login-page min-h-screen px-6 py-8 text-slate-100">
      <button onClick={onBack} className="brand-mark text-left"><span className="brand-dot" /><span>SmartRoad <b>Audit</b></span></button>
      <div className="mx-auto grid min-h-[calc(100vh-100px)] max-w-5xl items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="hidden lg:block">
          <p className="eyebrow">Your road safety command center</p>
          <h1 className="login-heading">Good decisions<br /><em>start here.</em></h1>
          <p className="max-w-md text-lg leading-8 text-slate-400">Sign in to create audits, review risk segments, and keep your work moving in one focused place.</p>
        </div>
        <form onSubmit={onSubmit} className="login-card animate-rise">
          <div className="mb-10"><p className="eyebrow">Welcome back</p><h2>Sign in to workspace</h2><p>Use your SmartRoad account to continue.</p></div>
          <label>Email address<input type="email" required value={loginForm.email} onChange={(event) => onChange('email', event.target.value)} placeholder="you@company.com" /></label>
          <label className="mt-5">Password<input type="password" required value={loginForm.password} onChange={(event) => onChange('password', event.target.value)} placeholder="Enter your password" /></label>
          {loginError && <p className="login-error">{loginError}</p>}
          <button type="submit" className="primary-button mt-7 w-full justify-center">Enter workspace <span>→</span></button>
          <div className="demo-note"><span>Demo access</span><br />admin@smartroad.local<br />smartroad123</div>
        </form>
      </div>
    </main>
  )
}

export default LoginPage
