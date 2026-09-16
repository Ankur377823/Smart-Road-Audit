import { useEffect, useState } from 'react'
import Dashboard from './components/dashboard/Dashboard'
import LoginPage from './components/auth/LoginPage'
import TerminalLanding from './components/landing/TerminalLanding'
import { createAudit, getAudit, listAudits } from './services/auditApi'

const defaultForm = {
  center_lat: 12.9716,
  center_lng: 77.5946,
  radius_m: 1000,
  road_class: 'collector',
}

function App() {
  const [view, setView] = useState('hero')
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [loginError, setLoginError] = useState('')
  const [form, setForm] = useState(defaultForm)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [auditDetail, setAuditDetail] = useState(null)
  const [audits, setAudits] = useState([])

  useEffect(() => {
    if (view !== 'dashboard') return

    listAudits()
      .then((data) => setAudits(data))
      .catch(() => setAudits([]))
  }, [view, result])

  const handleLogin = (event) => {
    event.preventDefault()
    if (loginForm.email === 'admin@smartroad.local' && loginForm.password === 'smartroad123') {
      setLoginError('')
      setView('dashboard')
      return
    }
    setLoginError('Use the demo credentials shown below the form.')
  }

  const handleLogout = () => {
    setView('hero')
    setLoginForm({ email: '', password: '' })
    setResult(null)
    setAuditDetail(null)
  }

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((current) => ({
      ...current,
      [name]: name === 'radius_m' || name === 'center_lat' || name === 'center_lng' ? Number(value) : value,
    }))
  }

  const handleLoginChange = (field, value) => {
    setLoginForm((current) => ({ ...current, [field]: value }))
  }

  const loadAuditDetail = async (auditId) => {
    setAuditDetail(await getAudit(auditId))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    setResult(null)
    setAuditDetail(null)

    try {
      const data = await createAudit(form)
      setResult(data)
      await loadAuditDetail(data.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (view === 'hero') {
    return <TerminalLanding onOpenLogin={() => setView('login')} />
  }

  if (view === 'login') {
    return <LoginPage loginForm={loginForm} loginError={loginError} onChange={handleLoginChange} onSubmit={handleLogin} onBack={() => setView('hero')} />
  }

  return <Dashboard audits={audits} form={form} result={result} auditDetail={auditDetail} error={error} loading={loading} onLogout={handleLogout} onChange={handleChange} onSubmit={handleSubmit} onNewAudit={() => document.getElementById('create-audit')?.scrollIntoView({ behavior: 'smooth' })} />
}

export default App
