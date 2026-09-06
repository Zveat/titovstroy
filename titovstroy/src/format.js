// Форматирование чисел/дат и мелкие утилиты вывода. Перенос из App.jsx без правок.

export const fmt = n => n > 0 ? new Intl.NumberFormat("ru-RU").format(Math.round(n)) : "—";
export const today = () => new Date().toLocaleDateString("ru-RU");
export const addWorkdays = (date, days) => { let d = new Date(date); let added = 0; while(added < days){ d.setDate(d.getDate()+1); if(d.getDay()!==0&&d.getDay()!==6) added++; } return d; };
export const validUntil = () => addWorkdays(new Date(),7).toLocaleDateString("ru-RU",{day:"2-digit",month:"2-digit",year:"numeric"});

// ─── УТИЛИТЫ ────────────────────────────────────────────────────────────────
export const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2,6);

// Надёжное приведение updatedAt к числу: поддерживает и число (Date.now()), и ISO-строку
export const _ts = v => { if (typeof v === "number") return v; const n = new Date(v).getTime(); return isNaN(n) ? 0 : n; };
// tengeInWords импортирован из ./utils.js
// Открыть/распечатать готовый HTML-документ. В обычном браузере открываем новую вкладку,
// в PWA (standalone) на iOS новые окна не открываются — печатаем через скрытый iframe.
export const openOrPrintHtml = (html, revokeMs = 30000) => {
  const isStandalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
  if (!isStandalone) {
    const blob = new Blob([html], {type:"text/html"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.target = "_blank"; a.rel = "noopener";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), revokeMs);
    return;
  }
  // PWA: печать через скрытый iframe.
  // iOS/Safari в режиме приложения берёт имя PDF из заголовка ВЕРХНЕЙ страницы
  // (а не из iframe), поэтому временно подменяем document.title — чтобы в имя
  // файла попали клиент/адрес/телефон, как на ПК. После печати возвращаем обратно.
  const _tm = html.match(/<title>([\s\S]*?)<\/title>/i);
  const _wantTitle = _tm ? _tm[1].trim() : null;
  const _prevTitle = document.title;
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden","true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none";
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow.document;
  doc.open(); doc.write(html); doc.close();
  const triggerPrint = () => {
    if (_wantTitle) document.title = _wantTitle;
    try { iframe.contentWindow.focus(); iframe.contentWindow.print(); }
    catch(e) { /* ignore */ }
    setTimeout(()=>{ document.title = _prevTitle; }, 8000);
    setTimeout(()=>{ try{ document.body.removeChild(iframe);}catch(e){} }, 60000);
  };
  // Дать времени отрисоваться картинкам (печать/штамп) перед вызовом печати
  setTimeout(triggerPrint, 600);
};
export const fmtDate = (ts) => {
  const d = new Date(ts);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const yesterday = new Date(today); yesterday.setDate(today.getDate()-1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleTimeString("ru-RU", {hour:"2-digit",minute:"2-digit"});
  if (isToday) return `Сегодня ${time}`;
  if (isYesterday) return `Вчера ${time}`;
  return d.toLocaleDateString("ru-RU", {day:"numeric",month:"short"}) + " " + time;
};
// Дата + точное время (для статуса онлайн-КП: просмотр/принятие)
export const fmtDateTime = (ts) => ts ? new Date(ts).toLocaleString("ru-RU",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"}) : "";
// Текст статуса онлайн-КП по снимку: просмотры (+ время последнего) и принятие (+ время)
export const kpStatusText = (d) => {
  if (!d) return "";
  const v = d.viewCount ? ("👁 просмотров: " + d.viewCount + (d.viewedAt ? (" · последний " + fmtDateTime(d.viewedAt)) : "")) : "👁 ещё не открыто клиентом";
  return v + (d.acceptedAt ? (" · ✅ ПРИНЯТО " + fmtDateTime(d.acceptedAt)) : "");
};

// ── ФИНАНСЫ (независимый учёт: ДДС + P&L) ──
export const _auditYM = (ts = Date.now()) => { const d = new Date(ts); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); };

// Экспорт в CSV (Excel открывает напрямую; BOM + ; для русской локали)
export const downloadCSV = (filename, headers, rows) => {
  const esc = (v) => {
    let s = v===null||v===undefined ? "" : String(v);
    // Защита от инъекции формул в Excel/Sheets: поле, начинающееся с = + - @,
    // предваряем апострофом, чтобы оно не выполнилось как формула
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[";\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
  };
  const lines = [headers.map(esc).join(";"), ...rows.map(r=>r.map(esc).join(";"))];
  const blob = new Blob(["﻿"+lines.join("\r\n")], { type:"text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
};
