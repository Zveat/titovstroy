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
import { currentEntry } from "./appVersion.js";

if ("serviceWorker" in navigator) {
  let _reloading = false;
  window.addEventListener("load", () => {
    const hadController = !!navigator.serviceWorker.controller; // была ли уже активная версия
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (_reloading || !hadController) return; // не перезагружаем при самой первой установке
      _reloading = true;
      window.location.reload();
    });
    // АДРЕС SW НЕСЁТ ОТПЕЧАТОК СБОРКИ, И ЭТО НЕ КОСМЕТИКА.
    //
    // Браузер считает, что «вышло обновление», ТОЛЬКО если файл sw.js изменился.
    // Наш sw.js от сборки к сборке не менялся ни на байт — значит updatefound не
    // наступал НИКОГДА, и телефон мог неделями крутить старый код, о чём и
    // написано в appVersion.js. Это не теория: 16 сентября владелец удалил сметы
    // в 12:52, а уведомления пришли в 18:34, потому что в его вкладке не было
    // кода быстрой отправки — за сутки от браузера не пришло НИ ОДНОГО запроса.
    //
    // Отпечаток берём из имени главного файла страницы (Vite вшивает туда хеш
    // содержимого): каждая выкатка — новый адрес, браузер видит новый SW,
    // ставит его, а обработчик ниже просит активироваться немедленно. Дальше
    // controllerchange перезагружает страницу один раз — и человек уже на новом
    // коде, ничего не нажимая.
    const stamp = currentEntry(document).replace(/\D+/g, "").slice(-10);
    navigator.serviceWorker.register(stamp ? `/sw.js?v=${stamp}` : "/sw.js").then(reg => {
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
