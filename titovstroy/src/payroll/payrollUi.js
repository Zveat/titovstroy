// Общие стили раздела ФОТ. Вынесены отдельно, чтобы вкладки лежали в своих файлах
// и при этом выглядели одинаково — раньше константы жили внутри PayrollModule.jsx.

export const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 16 };
export const inp = { border: "1px solid #e2e8f0", borderRadius: 9, padding: "8px 11px", fontSize: 12.5, fontFamily: "inherit", width: "100%", boxSizing: "border-box" };
export const lab = { fontSize: 10.5, color: "#94a3b8", fontWeight: 600, marginBottom: 4, display: "block" };
export const th = { textAlign: "left", fontSize: 10, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: "#94a3b8", padding: "9px 12px", background: "#fafbfd", borderBottom: "1px solid #eef2f7", whiteSpace: "nowrap" };
export const td = { padding: "10px 12px", fontSize: 12.5, borderBottom: "1px solid #f4f7fb", verticalAlign: "middle" };
export const numCell = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
export const pill = (color, bg) => ({ display: "inline-flex", alignItems: "center", gap: 5, borderRadius: 20, padding: "3px 9px", fontSize: 10.5, fontWeight: 800, color, background: bg, whiteSpace: "nowrap" });

export const btnPrimary = (on = true) => ({
  background: on ? "#2563eb" : "#cbd5e1", color: "#fff", border: "none", borderRadius: 9,
  padding: "8px 18px", fontSize: 12.5, fontWeight: 700, cursor: on ? "pointer" : "default", fontFamily: "inherit",
});
export const btnGhost = {
  background: "none", border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 13px",
  fontSize: 12, cursor: "pointer", color: "#64748b", fontFamily: "inherit",
};

// Список месяцев для выбора: от самого раннего месяца с данными до текущего.
// Пустых дыр не пропускаем — иначе за месяц без операций начислить оклад было бы нельзя.
// Минимум — год назад: в первый заход начислений ещё нет, а начислить нужно за прошлый
// месяц, и список из одного текущего месяца этого просто не позволил бы.
export function monthOptions(fromKeys = [], now = new Date(), minBack = 12) {
  const cur = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const back = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (minBack - 1), 1));
  const floor = `${back.getUTCFullYear()}-${String(back.getUTCMonth() + 1).padStart(2, "0")}`;
  const keys = [...fromKeys.filter(Boolean), floor, cur].sort();
  const first = keys[0] || cur;
  const out = [];
  let [y, m] = first.split("-").map(Number);
  for (let i = 0; i < 240; i++) {
    const k = `${y}-${String(m).padStart(2, "0")}`;
    out.push(k);
    if (k === cur) break;
    m++; if (m > 12) { m = 1; y++; }
  }
  return out.reverse();
}
