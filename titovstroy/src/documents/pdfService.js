// PDF ДЛЯ ТЕЛЕФОНА: ПРОСИМ У СЕРВЕРА, ОТДАЁМ СИСТЕМЕ.
//
// В приложении, запущенном с иконки, окно печати на iOS не открывается вовсе — это
// проверено владельцем на живом договоре, а печать была единственным способом получить
// PDF силами браузера. Поэтому страницу печатает сервер (api/pdf.mjs) и возвращает
// готовый файл, а здесь остаётся отдать его телефону.
//
// ОТДАЁМ НЕ СРАЗУ, А ПО ВТОРОМУ НАЖАТИЮ. Меню «Поделиться» и сохранение файла на iOS
// требуют живого нажатия ровно так же, как окно печати, а пока сервер рисует документ,
// проходят секунды — разрешение к тому времени сгорает. Отсюда порядок: первое нажатие
// заказывает файл, второе (по уже готовому) его отдаёт. Один лишний тык вместо
// очередного молчания.
import { _restToken } from "../cloud/storage.js";

export function pdfFileName(title) {
  const clean = String(title || "Документ").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim();
  return `${clean.slice(0, 90) || "Документ"}.pdf`;
}

// Ответ всегда объясняет себя словами: молчание здесь и было главной бедой.
export async function requestServerPdf({ html, title }, { fetchImpl = fetch, getToken = _restToken } = {}) {
  if (!html) return { ok: false, reason: "Документ пуст" };
  let token = null;
  try { token = await getToken(); } catch { token = null; }
  if (!token) return { ok: false, reason: "Сессия истекла — войдите заново" };
  let response;
  try {
    response = await fetchImpl("/api/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ html, title }),
    });
  } catch {
    return { ok: false, reason: "Нет связи с сервером" };
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const codes = {
      not_staff: "Сессия истекла — войдите заново",
      origin_not_allowed: "Запрос пришёл с чужого адреса",
      html_too_big: "Документ слишком большой для печати",
      render_failed: "Сервер не смог напечатать документ",
    };
    return { ok: false, reason: codes[payload?.code] || `Сервер ответил ${response.status}` };
  }
  const blob = await response.blob();
  if (!blob || !blob.size) return { ok: false, reason: "Сервер вернул пустой файл" };
  return { ok: true, blob, name: pdfFileName(title) };
}

// Можно ли отдать файл через системное меню «Поделиться». Проверяем ИМЕННО файлом:
// navigator.share есть много где, а файлы умеет далеко не каждый браузер, и кнопка,
// которая ничего не делает, — ровно то, чего мы избегаем.
export function canSharePdf(blob, name) {
  try {
    if (!navigator.canShare || typeof File !== "function") return false;
    return navigator.canShare({ files: [new File([blob], name, { type: "application/pdf" })] });
  } catch { return false; }
}

// Зовётся ИЗ НАЖАТИЯ по уже готовому файлу — иначе телефон откажет и в меню, и в
// сохранении. Возвращает, что именно произошло, чтобы сказать это человеку.
export async function deliverPdf(blob, name) {
  if (canSharePdf(blob, name)) {
    try {
      await navigator.share({ files: [new File([blob], name, { type: "application/pdf" })], title: name });
      return { ok: true, how: "share" };
    } catch (error) {
      // Человек закрыл меню — это не ошибка, и извиняться за неё не нужно.
      if (error?.name === "AbortError") return { ok: true, how: "cancelled" };
    }
  }
  try {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return { ok: true, how: "download" };
  } catch {
    return { ok: false, reason: "Телефон не дал сохранить файл" };
  }
}
