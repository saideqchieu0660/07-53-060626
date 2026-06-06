import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';
import { SoundProvider } from './components/SoundProvider';
import { registerServiceWorker } from './lib/serviceWorkerRegistration';

// Register service worker for offline caching and fallback
registerServiceWorker();

// Handle dynamic import failures globally (Auto-reload on new production deployments)
const handleChunkError = (message: string) => {
  if (
    message?.includes("Failed to fetch dynamically imported module") ||
    message?.includes("Loading chunk failed") ||
    message?.includes("Importing a module script failed") ||
    message?.includes("dynamically imported module")
  ) {
    const lastReloadTime = sessionStorage.getItem("chunk_reload_time");
    const now = Date.now();
    // Only reload once every 10 seconds to prevent infinite loops when network is genuinely down
    if (!lastReloadTime || now - parseInt(lastReloadTime, 10) > 10000) {
      sessionStorage.setItem("chunk_reload_time", now.toString());
      console.warn("Chunk load error detected, triggering hard reload to fetch new assets...");
      window.location.reload();
    }
  }
};

window.addEventListener("error", (e) => {
  if (e.message) {
    handleChunkError(e.message);
  }
});

window.addEventListener("unhandledrejection", (e) => {
  if (e.reason && e.reason.message) {
    handleChunkError(e.reason.message);
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SoundProvider>
        <App />
      </SoundProvider>
    </BrowserRouter>
  </StrictMode>,
);
