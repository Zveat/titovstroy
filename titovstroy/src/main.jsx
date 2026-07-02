import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// Service Worker: offline shell + АВТО-ОБНОВЛЕНИЕ кода.
// Раньше клиенты могли зависать на старой версии приложения (разные экраны на
// ПК/телефоне/иконке). Теперь при каждом запуске проверяем обновление, а когда
// новая версия готова — активируем её и один раз перезагружаем страницу.
if ("serviceWorker" in navigator) {
  let _reloading = false;
  window.addEventListener("load", () => {
    const hadController = !!navigator.serviceWorker.controller; // была ли уже активная версия
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (_reloading || !hadController) return; // не перезагружаем при самой первой установке
      _reloading = true;
      window.location.reload();
    });
    navigator.serviceWorker.register("/sw.js").then(reg => {
      try { reg.update(); } catch (e) {}
      if (reg.waiting) { try { reg.waiting.postMessage("SKIP_WAITING"); } catch (e) {} }
      reg.addEventListener("updatefound", () => {
        const nw = reg.installing;
        if (nw) nw.addEventListener("statechange", () => {
          if (nw.state === "installed" && navigator.serviceWorker.controller) {
            try { nw.postMessage("SKIP_WAITING"); } catch (e) {}
          }
        });
      });
    }).catch(() => {});
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
