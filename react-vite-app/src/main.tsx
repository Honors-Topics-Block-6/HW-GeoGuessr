import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './contexts/AuthContext'
import './index.css'
import App from './App'
import { ErrorBoundary } from './ErrorBoundary'
import MigrationBanner from './components/MigrationBanner/MigrationBanner'

const BASE_H = 900;

function ScaledAppWrapper({ children }: { children: React.ReactNode }) {
  const getValues = () => {
    const scale = window.innerHeight / BASE_H;
    const canvasWidth = Math.round(window.innerWidth / scale);
    return { scale, canvasWidth };
  };

  const [{ scale, canvasWidth }, setValues] = useState(getValues);

  useEffect(() => {
    const onResize = () => setValues(getValues());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    // Warm the map image cache so the first game render is faster.
    const mapPreload = new Image();
    mapPreload.src = '/FINAL_MAP.png';
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: 'var(--hw-page-bg)' }}>
      <div style={{
        width: canvasWidth,
        height: BASE_H,
        transform: `scale(${scale})`,
        transformOrigin: '0 0',
        overflow: 'hidden',
      }}>
        {children}
      </div>
    </div>
  );
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found. Ensure there is a <div id="root"></div> in index.html.');
}

createRoot(rootElement).render(
  <StrictMode>
    <ScaledAppWrapper>
      <MigrationBanner />
      <ErrorBoundary>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ErrorBoundary>
    </ScaledAppWrapper>
  </StrictMode>,
)
