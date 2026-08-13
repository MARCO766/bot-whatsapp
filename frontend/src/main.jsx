import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { SocketProvider } from './context/SocketProvider.jsx'
import { resolveApiUrl } from './flujos/apiBase'

const gateStyle = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 12,
  background: '#050816',
  color: '#94a3b8',
  fontFamily: 'Inter, Arial, sans-serif',
  fontWeight: 700,
  fontSize: 14,
  padding: 24,
  textAlign: 'center',
}

function AuthGate() {
  const [status, setStatus] = useState('loading')
  const [usuarioId, setUsuarioId] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const res = await fetch(resolveApiUrl('/api/inbox/session'), {
          credentials: 'include',
        })

        if (cancelled) return

        if (res.status === 401) {
          window.location.replace('/login')
          return
        }

        if (!res.ok) {
          setErrorMsg(
            `No se pudo verificar la sesión (HTTP ${res.status}). Intenta de nuevo.`
          )
          setStatus('error')
          return
        }

        const data = await res.json().catch(() => ({}))
        if (!data?.usuarioId) {
          window.location.replace('/login')
          return
        }

        setUsuarioId(data.usuarioId)
        setStatus('ok')
      } catch {
        if (cancelled) return
        setErrorMsg(
          'No hay conexión con el servidor. Revisa tu red e intenta de nuevo.'
        )
        setStatus('error')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  if (status === 'loading') {
    return <div style={gateStyle}>Cargando MacBot…</div>
  }

  if (status === 'error') {
    return (
      <div style={gateStyle}>
        <div>{errorMsg}</div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            marginTop: 8,
            height: 40,
            padding: '0 16px',
            borderRadius: 12,
            border: '1px solid rgba(148,163,184,.3)',
            background: 'rgba(255,255,255,.06)',
            color: '#e5e7eb',
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          Reintentar
        </button>
        <a href="/login" style={{ color: '#67e8f9', marginTop: 4 }}>
          Ir a iniciar sesión
        </a>
      </div>
    )
  }

  return (
    <SocketProvider initialUsuarioId={usuarioId}>
      <App />
    </SocketProvider>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthGate />
  </StrictMode>,
)
