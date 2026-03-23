import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { enforceQuarterHourInputs } from './utils/time';

enforceQuarterHourInputs();

// ─── PHASE 5: Global unhandled error detectors ────────────────────────────────
window.addEventListener('unhandledrejection', e => {
  console.error('[UNHANDLED PROMISE]', e.reason);
});
window.addEventListener('error', e => {
  console.error('[GLOBAL ERROR]', e.error);
});
// ─────────────────────────────────────────────────────────────────────────────

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
