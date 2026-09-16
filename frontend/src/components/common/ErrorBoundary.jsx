import React from 'react'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('CRITICAL REACT CRASH CAUGHT BY ERROR BOUNDARY:', error, errorInfo)
    this.setState({ error, errorInfo })
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
    if (this.props.onReset) {
      this.props.onReset()
    } else {
      window.location.reload()
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          backgroundColor: '#030712',
          color: '#f87171',
          padding: '2.5rem',
          fontFamily: 'monospace',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            maxWidth: '800px',
            width: '100%',
            backgroundColor: '#0f172a',
            border: '2px solid #ef4444',
            borderRadius: '12px',
            padding: '2rem',
            boxShadow: '0 25px 50px -12px rgba(239, 68, 68, 0.25)'
          }}>
            <h2 style={{ color: '#ef4444', fontSize: '1.5rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              ⚠️ Application Component Error
            </h2>
            <p style={{ color: '#e2e8f0', marginBottom: '1rem', fontSize: '0.9rem' }}>
              An error occurred during rendering:
            </p>
            <pre style={{
              backgroundColor: '#1e293b',
              padding: '1rem',
              borderRadius: '8px',
              color: '#fca5a5',
              overflowX: 'auto',
              fontSize: '0.85rem',
              marginBottom: '1rem'
            }}>
              {this.state.error?.toString() || 'Unknown error'}
            </pre>
            {this.state.errorInfo?.componentStack && (
              <pre style={{
                backgroundColor: '#1e293b',
                padding: '1rem',
                borderRadius: '8px',
                color: '#94a3b8',
                overflowX: 'auto',
                fontSize: '0.75rem',
                maxHeight: '200px',
                marginBottom: '1.5rem'
              }}>
                {this.state.errorInfo.componentStack}
              </pre>
            )}
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                onClick={this.handleReset}
                style={{
                  backgroundColor: '#38bdf8',
                  color: '#0f172a',
                  fontWeight: 'bold',
                  padding: '0.6rem 1.2rem',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                ↻ Reload & Recover
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
