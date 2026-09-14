// КНОПКА «ОТПРАВИТЬ СЕЙЧАС» СО СТОРОНЫ БРАУЗЕРА.
//
// Порядок принципиален: СНАЧАЛА пишем заявку в настройки уведомлений, ПОТОМ просим
// запустить прогон. Сервер запускает рассылку, только если заявка уже лежит в базе —
// сама по себе конечная точка ничего запустить не может (см. api/trigger-notify.js).
//
// Если запуск не удался (нет токена GitHub, сеть, GitHub отвечает ошибкой) — это не
// провал: заявка осталась в базе, и её выполнит ближайший обычный прогон. Поэтому
// возвращаем queued, а не ошибку, и говорим человеку честно, что сообщение придёт,
// просто не в эту секунду.
export async function requestSendNow({ key, saveSettings, getToken, fetchImpl = fetch, now = Date.now }) {
  const at = now();
  const saved = await saveSettings({ sendNow: { at, key } });
  if (!saved || saved.ok === false) return { ok: false, code: "settings_not_saved" };

  try {
    const token = await getToken();
    if (!token) return { ok: true, queued: true, code: "firebase_auth_unavailable" };
    const response = await fetchImpl("/api/trigger-notify", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ at }),
    });
    let payload = null;
    try { payload = await response.json(); } catch {}
    if (response.ok && payload?.ok) return { ok: true, dispatched: true };
    return { ok: true, queued: true, code: payload?.code || `http_${response.status || 0}` };
  } catch {
    return { ok: true, queued: true, code: "trigger_unavailable" };
  }
}

export function sendNowMessage(result) {
  if (!result?.ok) return "Не удалось сохранить заявку — попробуйте ещё раз";
  if (result.dispatched) return "✓ Отправляю — сообщение придёт в течение минуты";
  return "✓ Заявка принята — уйдёт ближайшим прогоном (до получаса)";
}
