// СКОЛЬКО ЭТА ВКЛАДКА СКАЧАЛА ИЗ БАЗЫ.
//
// ЗАЧЕМ. За сутки база отдаёт около гигабайта, и объяснить удалось меньше пятой части:
// обычная сессия — 2 МБ, парсер — десятки мегабайт, копия базы — ещё несколько десятков.
// Остальное непонятно откуда, а гадать по третьему разу нельзя. Профайлер самой Firebase
// показал бы всё сразу, но он живёт только в терминале, а владелец работает из браузера.
// Поэтому считаем на месте: открыл раздел на подозрительном устройстве — увидел цифру.
//
// СЧИТАЕМ ТОЛЬКО ЧТЕНИЕ. Платим мы за скачивание, запись в счёт не идёт.
//
// НИЧЕГО НЕ ПИШЕМ В БАЗУ. Счётчик живёт в памяти вкладки и умирает вместе с ней. Иначе
// измерительный прибор сам стал бы источником того, что измеряет.

// Длина строки в БАЙТАХ, а не в символах: база отдаёт UTF-8, и кириллица весит вдвое.
// Считаем без промежуточных выделений памяти — узлы бывают на десять мегабайт.
export function utf8Len(str) {
  const s = String(str ?? "");
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i++; }   // эмодзи: пара единиц UTF-16
    else n += 3;
  }
  return n;
}

// Узел с детьми: у нас в каждом ребёнке лежит готовая строка JSON, поэтому суммируем их
// длины, а не собираем весь объект в одну строку — на мегабайтах это заметная разница.
export function childrenBytes(obj) {
  if (!obj || typeof obj !== "object") return 0;
  let n = 0;
  for (const v of Object.values(obj)) n += typeof v === "string" ? utf8Len(v) : utf8Len(JSON.stringify(v));
  return n;
}

export function createTrafficMeter(now = () => Date.now()) {
  const startedAt = now();
  const byKey = new Map();
  let total = 0, reads = 0, reconnects = 0;

  return {
    // bytes считает вызывающий: он знает, строка у него или узел с детьми.
    note(key, bytes) {
      const n = Number(bytes) || 0;
      if (n <= 0) return;
      total += n; reads += 1;
      byKey.set(key, (byKey.get(key) || 0) + n);
    },
    // Обрыв связи важен сам по себе: при переподключении Firebase заново шлёт всё, на что
    // подписана вкладка. Частые обрывы — это то же самое чтение, только незаметное.
    noteReconnect() { reconnects += 1; },
    stats() {
      return {
        minutes: Math.max(0, Math.round((now() - startedAt) / 60000)),
        bytes: total,
        reads,
        reconnects,
        top: [...byKey.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
          .map(([key, bytes]) => ({ key, bytes })),
      };
    },
  };
}

// «1.23 МБ» / «412 КБ» — читать будет человек, а не программа.
export function formatBytes(n) {
  const b = Number(n) || 0;
  if (b >= 1048576) return `${(b / 1048576).toFixed(2)} МБ`;
  if (b >= 1024) return `${Math.round(b / 1024)} КБ`;
  return `${b} Б`;
}
