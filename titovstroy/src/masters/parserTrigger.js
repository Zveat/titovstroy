export async function triggerParserRun({ source, runNow, getToken, fetchImpl = fetch }) {
  try {
    const token = await getToken();
    if (!token) return { ok: false, queued: true, code: "firebase_auth_unavailable" };

    const response = await fetchImpl("/api/trigger-parser", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ source, runNow }),
    });
    let payload = null;
    try { payload = await response.json(); } catch {}
    if (response.ok && payload?.ok) return payload;
    return { ok: false, queued: true, code: payload?.code || `http_${response.status || 0}` };
  } catch {
    return { ok: false, queued: true, code: "trigger_unavailable" };
  }
}

export function parserRunMessage(result) {
  if (result?.dispatched) return "✓ Запуск создан — парсер начал обновление";
  if (result?.alreadyRunning) return "✓ Парсер уже запущен — запрос принят";
  return "✓ Запрос сохранён в очереди — прямой запуск временно недоступен";
}
