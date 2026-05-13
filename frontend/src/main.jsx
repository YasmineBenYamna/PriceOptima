// src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/global.css'   // ← Design system unifié (Sora + Inter + CSS vars)

window.addEventListener('error', (e) => {
  document.body.style.cssText =
    'margin:0;padding:20px;font-family:monospace;background:#1e1e1e;color:#f44;';
  document.body.innerHTML = `<h2>Erreur :</h2><pre>${e.message}\n\nFichier: ${e.filename}\nLigne: ${e.lineno}\n\n${e?.error?.stack || ''}</pre>`;
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)