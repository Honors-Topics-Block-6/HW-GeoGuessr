import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './contexts/AuthContext'
import './index.css'
import App from './App'
import { ErrorBoundary } from './ErrorBoundary'

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found. Ensure there is a <div id="root"></div> in index.html.');
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)
