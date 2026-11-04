import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

const HQApp = lazy(() => import('./hq/HQApp'));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Suspense fallback={<div className="fixed inset-0 flex items-center justify-center font-mono text-[12px] uppercase tracking-widest text-dim">HQ laden…</div>}>
      <HQApp />
    </Suspense>
  </React.StrictMode>,
);
