import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

const isAndroidWebView = /Android/.test(navigator.userAgent) && /wv|Version\/\d/.test(navigator.userAgent);

if ('serviceWorker' in navigator && !isAndroidWebView) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
