// СКОЛЬКО ЭТА ВКЛАДКА СКАЧАЛА ИЗ БАЗЫ.
//
// ЗАЧЕМ. За сутки база отдаёт около гигабайта, а объяснить удалось меньше пятой части:
// обычная сессия — 2 МБ, парсер — десятки мегабайт, копия базы — ещё столько же. Остальное
// непонятно откуда. Профайлер самой Firebase показал бы всё разом, но живёт только в
// терминале. Поэтому цифра считается прямо здесь: открыл раздел на подозрительном
// устройстве — увидел, сколько оно тянет и по каким ключам.
//
// СЧИТАЕТСЯ ТОЛЬКО ЭТА ВКЛАДКА и только с момента её открытия. Перезагрузил страницу —
// счёт начался заново. Данные никуда не отправляются и в базу не пишутся: измерительный
// прибор не должен сам создавать то, что измеряет.
import { useEffect, useState } from "react";
import { storage } from "../cloud/storage.js";
import { formatBytes } from "../cloud/trafficMeter.js";

const CARD = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 18px" };

export function TrafficTab() {
  const [stats, setStats] = useState(() => storage.trafficStats());
  useEffect(() => {
    const iv = setInterval(() => setStats(storage.trafficStats()), 2000);
    return () => clearInterval(iv);
  }, []);

  // В час — прикидка по тому, что уже накопилось. В первые минуты она скачет, поэтому до
  // пяти минут её не показываем: цифра «480 МБ/час» на второй минуте только пугает.
  const perHour = stats.minutes >= 5 ? Math.round((stats.bytes / stats.minutes) * 60) : null;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={CARD}>
        <div style={{ fontWeight: 800, fontSize: 15, color: "#0f172a", marginBottom: 4 }}>📡 Трафик этой вкладки</div>
        <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>
          Сколько скачано из базы с момента открытия страницы. Считает только это устройство и
          только эту вкладку. Чтобы найти, кто тянет лишнее, откройте раздел на подозрительном
          устройстве и оставьте на час.
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
        {[
          { label: "Скачано", value: formatBytes(stats.bytes) },
          { label: "Вкладка открыта", value: `${stats.minutes} мин` },
          { label: "В час", value: perHour == null ? "считаю…" : formatBytes(perHour) },
          { label: "Чтений", value: String(stats.reads) },
          // Обрыв связи стоит трафика: при переподключении база заново шлёт всё, на что
          // вкладка подписана. Много обрывов — это скрытое скачивание.
          { label: "Обрывов связи", value: String(stats.reconnects) },
        ].map((c) => (
          <div key={c.label} style={CARD}>
            <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, marginBottom: 6 }}>{c.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a" }}>{c.value}</div>
          </div>
        ))}
      </div>

      <div style={CARD}>
        <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 10 }}>Что качается больше всего</div>
        {stats.top.length === 0 ? (
          <div style={{ fontSize: 12, color: "#94a3b8" }}>Пока ничего не скачано.</div>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {stats.top.map((row) => (
              <div key={row.key} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline",
                fontSize: 12, borderBottom: "1px solid #f1f5f9", paddingBottom: 5 }}>
                <span style={{ color: "#334155", overflowWrap: "anywhere" }}>{row.key}</span>
                <span style={{ fontWeight: 700, color: "#0f172a", whiteSpace: "nowrap" }}>{formatBytes(row.bytes)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
