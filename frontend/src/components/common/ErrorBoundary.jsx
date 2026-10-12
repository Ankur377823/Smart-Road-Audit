import React from 'react'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Unhandled render error:', error, errorInfo)
  }

  handleReload = () => {
    this.setState({ error: null })
    if (this.props.onReset) this.props.onReset()
    else window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="card w-full max-w-md p-6 text-center sm:p-8">
          <h1 className="text-lg font-semibold text-slate-900">Something went wrong</h1>
          <p className="mt-2 text-sm text-slate-600">
            This page hit an unexpected error. Reloading usually fixes it.
          </p>
          <pre className="mt-4 max-h-32 overflow-auto rounded-lg bg-slate-100 p-3 text-left text-xs text-slate-600">
            {this.state.error.toString()}
          </pre>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button type="button" onClick={this.handleReload} className="btn btn-primary">
              Reload page
            </button>
            <a href="/dashboard" className="btn btn-secondary">
              Go to dashboard
            </a>
          </div>
        </div>
      </div>
    )
  }
}

export default ErrorBoundary
