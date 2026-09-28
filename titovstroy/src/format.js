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
// ── ПОКАЗАТЬ ГОТОВЫЙ ДОКУМЕНТ ────────────────────────────────────────────────
//
// Владелец: «нажимаю PDF или Google Doc — не работает. Че?» — и ни ошибки, ни вкладки.
// Открывает он сервис С ИКОНКИ НА ЭКРАНЕ, то есть как приложение, и там оба прежних
// способа мертвы:
//
//   • новая вкладка. iOS разрешает открыть окно только в тот же миг, когда человек
//     нажал. А у нас по нажатию сперва идёт поход в базу за снимком документа — пока
//     он идёт, разрешение сгорает, и Safari гасит окно МОЛЧА. Вдобавок ссылки вида
//     blob: iOS в новой вкладке не открывает вообще;
//   • печать через скрытый кадр. У приложения, запущенного с иконки, на iOS нет
//     диалога печати — вызов уходит в пустоту, тоже молча.
//
// Значит уходить из приложения нельзя, и полагаться на печать нельзя. Документ
// показывается ПРЯМО В ПРИЛОЖЕНИИ, поверх всего, и оттуда человек сам выбирает:
// напечатать (там, где печать есть), сохранить файлом или отправить через «Поделиться».
// Никакого окна открывать не нужно — значит и блокировать нечего.
//
// САМ ДОКУМЕНТ НЕ ТРОГАЕМ. В кадр уходит ровно тот HTML, что пришёл: юридический текст,
// вёрстка, печать — всё как при печати с компьютера. Здесь только способ показа.
const isIOS = () => typeof navigator !== "undefined"
  && (/iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
export const isStandaloneApp = () => typeof window !== "undefined"
  && ((window.matchMedia && window.matchMedia("(display-mode: standalone)").matches)
    || window.navigator.standalone === true);

const docTitleOf = (html) => {
  const m = String(html).match(/<title>([\s\S]*?)<\/title>/i);
  return (m ? m[1].trim() : "") || "Документ";
};

export const showHtmlDocumentInApp = (html) => {
  const title = docTitleOf(html);
  const prevOverflow = document.body.style.overflow;

  const wrap = document.createElement("div");
  wrap.setAttribute("data-document-viewer", "1");
  wrap.style.cssText = "position:fixed;inset:0;z-index:99999;background:#334155;display:flex;flex-direction:column";

  const bar = document.createElement("div");
  bar.style.cssText = "flex:0 0 auto;display:flex;gap:8px;align-items:center;padding:9px 12px;"
    + "padding-top:calc(9px + env(safe-area-inset-top));background:#1e293b;color:#fff;"
    + "font:600 13px/1.2 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif";

  const name = document.createElement("div");
  name.textContent = title;
  name.style.cssText = "flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:#cbd5e1";

  const mkBtn = (label, main) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.style.cssText = "flex:0 0 auto;border:0;border-radius:9px;padding:10px 14px;"
      + `background:${main ? "#2563eb" : "#475569"};color:#fff;font:700 13px/1 inherit;`
      + "cursor:pointer;-webkit-appearance:none";
    return b;
  };

  // СТРАНИЦА ПОКАЗЫВАЕТСЯ ЦЕЛИКОМ, А НЕ ВТИСКИВАЕТСЯ В ШИРИНУ ТЕЛЕФОНА.
  // Первая попытка отдала кадру ширину экрана — и договор поехал: текст по ширине
  // расползся дырами между словами, «г. Караганда» обрезалось справа. Документы свёрстаны
  // под А4 (@page{size:A4} в legacyDocs.js), поэтому кадр и держим шириной ровно в А4,
  // а к экрану подгоняем МАСШТАБОМ. Тогда на телефоне видно ту же страницу, что выйдет
  // из принтера, только меньше. Сам документ при этом не трогаем ни на символ.
  const A4_W = 794;          // 210 мм при 96 точках на дюйм
  const A4_H = 1123;         // 297 мм — пока не измерили настоящую высоту
  const stage = document.createElement("div");
  stage.style.cssText = "flex:1 1 auto;overflow:auto;-webkit-overflow-scrolling:touch;padding:10px 0";
  const holder = document.createElement("div");
  holder.style.cssText = "transform-origin:top left;margin:0 auto";
  const frame = document.createElement("iframe");
  frame.setAttribute("title", title);
  frame.style.cssText = `width:${A4_W}px;height:${A4_H}px;border:0;background:#fff;display:block;`
    + "box-shadow:0 2px 14px rgba(0,0,0,.35)";
  holder.append(frame);
  stage.append(holder);

  const fit = () => {
    let h = A4_H;
    try { h = Math.max(frame.contentDocument.documentElement.scrollHeight, A4_H); } catch { /* ещё не готов */ }
    frame.style.height = `${h}px`;
    const k = Math.min(1, (stage.clientWidth - 20) / A4_W);
    holder.style.transform = `scale(${k})`;
    holder.style.width = `${A4_W * k}px`;
    holder.style.height = `${h * k}px`;
  };

  const hint = document.createElement("div");
  hint.style.cssText = "flex:0 0 auto;padding:9px 12px;padding-bottom:calc(9px + env(safe-area-inset-bottom));"
    + "background:#1e293b;color:#cbd5e1;font:500 11.5px/1.35 inherit;text-align:center";
  hint.textContent = "«Печать» → в окне печати нажмите «Поделиться» и сохраните PDF.";

  const close = () => {
    try { document.body.removeChild(wrap); } catch { /* уже закрыт */ }
    window.removeEventListener("resize", fit);
    document.body.style.overflow = prevOverflow;
  };

  // PDF НА АЙФОНЕ ДЕЛАЕТ САМА ПЕЧАТЬ. Своего построителя PDF у нас нет, а собирать
  // договор картинкой (единственное, что дают такие библиотеки) — значит получить
  // нечитаемый и невыделяемый текст на десять мегабайт. Системное окно печати умеет
  // ровно то, что нужно: «Поделиться» → PDF. Главное, чтобы печать звали НАЖАТИЕМ —
  // из-за того, что раньше её звали после загрузки данных, она и перестала открываться.
  const btnPrint = mkBtn("Печать · PDF", true);
  btnPrint.onclick = () => {
    try { frame.contentWindow.focus(); frame.contentWindow.print(); }
    catch { hint.textContent = "Печать в этом браузере недоступна — откройте сервис в Safari."; }
  };

  const btnClose = mkBtn("Закрыть");
  btnClose.onclick = close;

  bar.append(name, btnPrint, btnClose);
  wrap.append(bar, stage, hint);
  document.body.appendChild(wrap);
  document.body.style.overflow = "hidden";
  // Пишем после вставки в дерево: у кадра вне документа нет contentWindow.
  const d = frame.contentWindow.document;
  d.open(); d.write(html); d.close();
  fit();
  // Картинки (печать, логотип) приезжают позже и меняют высоту — подгоняем ещё раз.
  frame.contentWindow.addEventListener?.("load", fit);
  setTimeout(fit, 350);
  setTimeout(fit, 1200);
  window.addEventListener("resize", fit);
  return close;
};

// Открыть адрес, а если браузер погасил окно — показать ссылку, на которую можно нажать.
// Нажатие по настоящей ссылке — это уже жест человека, и его не блокирует никто.
// Нужно там, где адрес рождается ПОСЛЕ ожидания (документ сперва заливается в Google):
// к этому моменту разрешение открывать окна на айфоне уже сгорело.
export const openUrlOrShowLink = (url, { title = "Документ готов", note = "" } = {}) => {
  let opened = null;
  try { opened = window.open(url, "_blank", "noopener"); } catch { opened = null; }
  if (opened) return true;

  const wrap = document.createElement("div");
  wrap.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,.86);display:flex;"
    + "align-items:center;justify-content:center;padding:24px;"
    + "font:500 14px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif";
  const card = document.createElement("div");
  card.style.cssText = "background:#fff;border-radius:14px;padding:20px;max-width:420px;width:100%;text-align:center";
  const head = document.createElement("div");
  head.textContent = title;
  head.style.cssText = "font-weight:700;font-size:15px;margin-bottom:8px;color:#0f172a";
  const sub = document.createElement("div");
  sub.textContent = note || "Браузер не дал открыть вкладку сам — нажмите ссылку.";
  sub.style.cssText = "color:#64748b;font-size:12.5px;margin-bottom:14px";
  const link = document.createElement("a");
  link.href = url; link.target = "_blank"; link.rel = "noopener";
  link.textContent = "Открыть документ";
  link.style.cssText = "display:block;background:#2563eb;color:#fff;border-radius:9px;padding:12px;"
    + "text-decoration:none;font-weight:700;margin-bottom:10px";
  const close = document.createElement("button");
  close.type = "button"; close.textContent = "Закрыть";
  close.style.cssText = "border:0;background:#e2e8f0;color:#334155;border-radius:9px;padding:10px 16px;"
    + "font:600 13px/1 inherit;cursor:pointer;-webkit-appearance:none";
  const kill = () => { try { document.body.removeChild(wrap); } catch { /* уже закрыт */ } };
  close.onclick = kill;
  link.addEventListener("click", () => setTimeout(kill, 300));
  card.append(head, sub, link, close);
  wrap.append(card);
  document.body.appendChild(wrap);
  return false;
};

// Открыть/распечатать готовый HTML-документ. На компьютере — как было, новой вкладкой.
// На айфоне и в любом приложении с иконки — показом внутри приложения (см. выше).
export const openOrPrintHtml = (html, revokeMs = 30000) => {
  const isStandalone = isStandaloneApp();
  if (isStandalone || isIOS()) return showHtmlDocumentInApp(html);
  if (!isStandalone) {
    const blob = new Blob([html], {type:"text/html"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.target = "_blank"; a.rel = "noopener";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), revokeMs);
    return;
  }
  // Сюда попасть уже нельзя: и приложение с иконки, и айфон ушли выше, в показ
  // внутри приложения. Оставлено страховкой, если условие когда-нибудь разойдётся.
  return showHtmlDocumentInApp(html);
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
