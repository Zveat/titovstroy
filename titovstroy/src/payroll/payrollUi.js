import { saveFailReasonText } from "../utils.js";

// ─────────────────────────────────────────────────────────────────────────────
// Оформление раздела ФОТ. Один набор токенов на все вкладки — иначе экраны
// разъезжаются по мелочам: где-то радиус 9, где-то 14, где-то другой серый.
//
// Правила, которых держимся:
//   • деньги — всегда tabular-nums, чтобы цифры в столбце стояли ровно;
//   • граница — светлая, объём даёт мягкая тень, а не тёмная рамка;
//   • акцент один (индиго), остальные цвета несут смысл: зелёный — сотрудники,
//     янтарный — подрядчики и «не зарплата», красный — долг и нераспознанное.
// ─────────────────────────────────────────────────────────────────────────────

export const C = {
  ink: "#0f172a", ink2: "#334155", mute: "#64748b", faint: "#94a3b8",
  line: "#e8edf4", lineSoft: "#f1f5f9", bg: "#f8fafc", white: "#fff",
  accent: "#4f46e5", accentSoft: "#eef2ff", accentLine: "#c7d2fe",
  green: "#059669", greenSoft: "#ecfdf5",
  amber: "#d97706", amberSoft: "#fffbeb", amberLine: "#fde68a",
  red: "#dc2626", redSoft: "#fef2f2", redLine: "#fecaca",
  violet: "#7c3aed", violetSoft: "#f5f3ff",
};

export const shadow = "0 1px 2px rgba(15,23,42,.04), 0 8px 24px -12px rgba(15,23,42,.14)";
export const shadowSm = "0 1px 2px rgba(15,23,42,.05)";

export const card = {
  background: C.white, border: `1px solid ${C.line}`, borderRadius: 16,
  padding: 18, boxShadow: shadow,
};
export const cardFlat = { ...card, boxShadow: shadowSm };

export const inp = {
  border: `1px solid ${C.line}`, borderRadius: 10, padding: "9px 12px", fontSize: 13,
  fontFamily: "inherit", width: "100%", boxSizing: "border-box", background: C.white,
  color: C.ink, outline: "none",
};
export const lab = {
  fontSize: 10.5, color: C.faint, fontWeight: 700, marginBottom: 5, display: "block",
  letterSpacing: ".02em",
};

export const th = {
  textAlign: "left", fontSize: 10, fontWeight: 800, letterSpacing: ".07em",
  textTransform: "uppercase", color: C.faint, padding: "11px 14px",
  background: "#fbfcfe", borderBottom: `1px solid ${C.line}`, whiteSpace: "nowrap",
};
export const td = {
  padding: "12px 14px", fontSize: 13, borderBottom: `1px solid ${C.lineSoft}`,
  verticalAlign: "middle", color: C.ink2,
};
export const numCell = {
  ...td, textAlign: "right", fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap", fontFeatureSettings: '"tnum"',
};
export const money0 = { fontVariantNumeric: "tabular-nums", fontFeatureSettings: '"tnum"' };

export const pill = (color, bg) => ({
  display: "inline-flex", alignItems: "center", gap: 5, borderRadius: 999,
  padding: "3px 10px", fontSize: 10.5, fontWeight: 800, color, background: bg,
  whiteSpace: "nowrap", lineHeight: 1.6,
});

export const btnPrimary = (on = true) => ({
  background: on ? C.accent : "#cbd5e1", color: "#fff", border: "none", borderRadius: 10,
  padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: on ? "pointer" : "default",
  fontFamily: "inherit", boxShadow: on ? "0 1px 2px rgba(79,70,229,.28)" : "none",
  transition: "background .12s",
});
export const btnGhost = {
  background: C.white, border: `1px solid ${C.line}`, borderRadius: 10, padding: "7px 14px",
  fontSize: 12.5, cursor: "pointer", color: C.mute, fontFamily: "inherit", fontWeight: 600,
};
export const btnDanger = { ...btnGhost, borderColor: C.redLine, color: C.red };

// Сегмент-контрол: одна капсула с подсветкой активного, вместо россыпи кнопок.
export const segWrap = {
  display: "inline-flex", gap: 3, padding: 3, background: C.lineSoft,
  borderRadius: 12, border: `1px solid ${C.line}`,
};
export const seg = (on) => ({
  border: "none", borderRadius: 9, padding: "7px 15px", fontSize: 12.5, fontWeight: 700,
  cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
  background: on ? C.white : "transparent",
  color: on ? C.accent : C.mute,
  boxShadow: on ? shadowSm : "none",
});

// Инициалы вместо безликой строки: в списке из десяти человек глаз цепляется за них
// быстрее, чем за текст. Цвет — устойчивый хеш имени, чтобы не прыгал между заходами.
const AVA = ["#4f46e5", "#0891b2", "#059669", "#d97706", "#db2777", "#7c3aed", "#0284c7"];
export function avatarOf(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  const initials = (parts[0]?.[0] || "?") + (parts[1]?.[0] || "");
  let h = 0;
  for (let i = 0; i < String(name).length; i++) h = (h * 31 + String(name).charCodeAt(i)) >>> 0;
  return { initials: initials.toUpperCase(), color: AVA[h % AVA.length] };
}
export const avatarStyle = (color) => ({
  width: 32, height: 32, borderRadius: 10, flexShrink: 0,
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  background: `${color}14`, color, fontSize: 11.5, fontWeight: 800, letterSpacing: ".02em",
});

// Полоска доли — читается быстрее числа, когда строк много.
export const barTrack = { height: 4, background: C.lineSoft, borderRadius: 999, overflow: "hidden", marginTop: 6 };
export const barFill = (pct, color) => ({
  width: `${Math.max(0, Math.min(100, pct))}%`, height: "100%",
  background: color, borderRadius: 999,
});

export const sectionTitle = { fontSize: 16, fontWeight: 800, color: C.ink, letterSpacing: "-.01em" };
export const sectionHint = { fontSize: 12.5, color: C.faint, marginTop: 2 };

// Единая обработка сохранения для всех вкладок раздела.
// saveListProtected возвращает МАССИВ при успехе и undefined, когда запись заблокирована
// (другая вкладка редактирует, раздел не догрузился, облако не подтвердило). Форма,
// которая не проверяет результат, закрывается и молча теряет введённое — ровно на это
// жаловался владелец: «нажимаю, а бывает добавляет, бывает нет».
export async function runSave(saver, list, { requireCloud = true } = {}) {
  if (typeof saver !== "function") return { ok: false, reason: "нет обработчика сохранения" };
  let blocked = "";
  let res;
  try {
    res = await saver(list, { requireCloud, onBlocked: (r) => { blocked = r; } });
  } catch (e) {
    console.error(e);
    return { ok: false, reason: "неожиданная ошибка при сохранении" };
  }
  if (blocked) return { ok: false, reason: saveFailReasonText(blocked), hint: SAVE_FAIL_HINTS[blocked] || "" };
  if (res === undefined || res === false || res === null) {
    return { ok: false, reason: "запись не подтверждена", hint: "Обновите страницу и попробуйте ещё раз." };
  }
  return { ok: true };
}

// Что делать пользователю. Без этого сообщение «сервис редактируется в другой вкладке»
// подталкивало жать кнопку снова — а помогает там совсем другое.
const SAVE_FAIL_HINTS = {
  "read-only-tab":   "Закройте другие вкладки сервиса и обновите страницу — жать кнопку снова бесполезно.",
  "not-loaded":      "Обновите страницу: раздел не дочитался из облака, и запись запрещена, чтобы не затереть данные.",
  "db-unavailable":  "Проверьте связь и повторите.",
  "cloud-failed":    "Проверьте связь и повторите.",
  "empty-over-data": "Это защита от затирания. Обновите страницу и посмотрите, что в списке.",
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
