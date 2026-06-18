import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// Service Worker: offline shell (кэш иконок, index.html и статики)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

// Прячем стартовый сплэш, как только React отрисовал первый кадр
requestAnimationFrame(() => {
  const s = document.getElementById('boot-splash')
  if (s) {
    s.classList.add('hide')
    setTimeout(() => s.remove(), 300)
  }
})
