import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ObviousFeedback } from 'obvious-feedback-sdk'

function App() {
  const [status, setStatus] = useState('Initializing...')

  useEffect(() => {
    try {
      const widget = ObviousFeedback.init({
        publicKey: 'fsk_pub_test',
        apiBaseUrl: 'http://localhost:4444',
        theme: 'light',
      })
      setStatus('SDK initialized successfully.')
      return () => widget.destroy()
    } catch (error) {
      setStatus(`SDK init failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }, [])

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', margin: 40 }}>
      <h1>React Vite Fixture</h1>
      <p>This page loads the SDK via ESM import in a React app.</p>
      <div id="status" style={{ marginTop: 16, padding: 12, background: '#f5f5f5', borderRadius: 8, fontSize: 14 }}>
        {status}
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
