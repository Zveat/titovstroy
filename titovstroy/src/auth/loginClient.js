// Клиентская половина серверного входа. Firebase здесь намеренно не импортируется:
// это чистая функция вокруг fetch, её можно проверить тестами без браузера и без
// облака, а сам вход в Firebase кастомным токеном делает App.jsx.
export const LOGIN_ENDPOINT = "/api/login";

// Ответы кодируем в четыре исхода, потому что вести себя по ним нужно по-разному:
//   ok          — пароль верный, есть токен и запись пользователя;
//   invalid     — логин или пароль не подошли (одно и то же сообщение на оба случая);
//   locked      — слишком много попыток, вход закрыт на время;
//   unavailable — вход через сервер не настроен или недоступен.
//
// Последний случай — не ошибка входа: пока переменные окружения не проставлены, а
// правила базы ещё старые, приложение должно уметь войти по-прежнему. Иначе выкатка
// кода без ключей заперла бы снаружи всех, включая владельца. Как только правила
// закрутят, старый путь перестанет работать сам — читать titovstroy-users будет некому.
export async function requestServerLogin(login, password, options = {}) {
  const fetchImpl = options.fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!fetchImpl) return { status: "unavailable", reason: "no_fetch" };
  let response;
  try {
    response = await fetchImpl(options.endpoint || LOGIN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login: String(login || "").trim(), password: String(password || "") }),
    });
  } catch {
    return { status: "unavailable", reason: "network" };
  }
  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }

  if (response.status === 401) return { status: "invalid" };
  if (response.status === 429) {
    return { status: "locked", retryAfterMs: Math.max(0, Number(payload?.retryAfterMs) || 0) };
  }
  // Токена нет — значит войти нельзя, чем бы сервер это ни объяснял. Понижаем до
  // «недоступно», а не пропускаем дальше с пустым токеном.
  if (!response.ok || !payload?.ok || !payload?.token || !payload?.user) {
    return { status: "unavailable", reason: String(payload?.code || response.status) };
  }
  return { status: "ok", token: String(payload.token), user: payload.user };
}

// «Осталось 4 мин» человеку понятнее, чем 240000 миллисекунд.
export function lockoutMessage(retryAfterMs) {
  const minutes = Math.ceil((Number(retryAfterMs) || 0) / 60000);
  return minutes > 1
    ? `Слишком много попыток входа. Попробуйте через ${minutes} мин.`
    : "Слишком много попыток входа. Попробуйте через минуту.";
}
