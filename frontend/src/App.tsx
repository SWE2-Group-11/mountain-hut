import { useEffect, useState } from 'react'
import './App.css'

type BackendStatus = 'checking' | 'online' | 'offline'

// Placeholder landing page: checks that the backend answers through the /api proxy
function App() {
  const [status, setStatus] = useState<BackendStatus>('checking')

  useEffect(() => {
    // Any JSON answer (even an error) means the request reached the backend
    fetch('/api/v1/session/current', { credentials: 'include' })
      .then((res) => {
        const isJson = res.headers.get('content-type')?.includes('application/json')
        setStatus(isJson ? 'online' : 'offline')
      })
      .catch(() => setStatus('offline'))
  }, [])

  const badge = {
    checking: 'bg-gray-100 text-gray-700',
    online: 'bg-green-100 text-green-800',
    offline: 'bg-red-100 text-red-800',
  }[status]

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
      <h1>Mountain Hut</h1>
      <p>Work in progress: the application is coming soon.</p>
      <span className={`rounded-full px-4 py-1 text-sm font-medium ${badge}`}>
        Backend: {status}
      </span>
    </main>
  )
}

export default App
