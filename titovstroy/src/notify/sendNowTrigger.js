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
// ЗАЯВКИ КОПЯТСЯ, А НЕ ЗАТИРАЮТ ДРУГ ДРУГА. Владелец нажал все четыре сводки
// подряд и получил одну: заявка лежала одним полем sendNow={at,key}, и каждое
// следующее нажатие стирало предыдущее. Поэтому ключи теперь складываются в
// sendNowQueue={ключ: отметка}. Одиночное поле остаётся: по нему точка запуска
// проверяет, что заявка правда записана в базу, — сама по себе она ничего
// запустить не может.
// Протухшие (старше получаса) выбрасываем здесь же: прогон их всё равно не
// возьмёт, а в настройках они копились бы вечно.
export async function requestSendNow({ key, queue = {}, saveSettings, getToken, fetchImpl = fetch, now = Date.now, ttlMs = 30 * 60 * 1000 }) {
  const at = now();
  const nextQueue = { [key]: at };
  for (const [k, v] of Object.entries(queue || {})) {
    if (k !== key && at - (Number(v) || 0) < ttlMs) nextQueue[k] = Number(v) || 0;
  }
  const saved = await saveSettings({ sendNow: { at, key }, sendNowQueue: nextQueue });
  if (!saved || saved.ok === false) return { ok: false, code: "settings_not_saved" };

  try {
    const token = await getToken();
    if (!token) return { ok: true, queued: true, code: "firebase_auth_unavailable" };
    const response = await fetchImpl("/api/notify-run", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ kind: "sendNow", at, key }),
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
  if (result.dispatched) return "✓ Отправлено";
  return "✓ Заявка принята — уйдёт ближайшим прогоном по расписанию";
}
