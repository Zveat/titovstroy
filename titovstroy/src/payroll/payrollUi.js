import { saveFailReasonText } from "../utils.js";

// ─────────────────────────────────────────────────────────────────────────────
// Оформление раздела ФОТ — по макету владельца (Payroll_Dashboard).
// Цвета переведены из oklch макета в hex один в один, размеры взяты оттуда же:
// заголовок 30/800, плитка 28px с иконкой 40×40 сверху, число 32/800, строка
// таблицы 20×24 с аватаром 40×40 и именем 15/700.
//
// Правила:
//   • деньги — tabular-nums, чтобы разряды в столбце стояли ровно;
//   • объём даёт светлая граница, а не тень: в макете теней нет нигде, кроме
//     активного сегмента;
//   • один акцент (индиго), остальные цвета несут смысл — зелёный сотрудники,
//     бирюзовый подрядчики и «есть что разобрать», красный долг и ошибки.
// ─────────────────────────────────────────────────────────────────────────────

export const C = {
  ink: "#11161f", ink2: "#282e38", ink3: "#363b43",
  mute: "#646972", mute2: "#6c727b", faint: "#777a80", faint2: "#83868c",
  line: "#dde2e8", lineHead: "#e4e8ed", lineRow: "#e8ebef", lineSoft: "#eceff2",
  bg: "#f2f5f9", bgSoft: "#f7f8fa", white: "#fff",

  accent: "#5358d6", accentInk: "#494fb5", accentSoft: "#e5eaff", accentLine: "#c6d0ff",
  green: "#00602a", greenSoft: "#d2f6dd",
  // Внимание/подрядчики — БИРЮЗОВЫЙ, не жёлтый. Жёлтые плашки владелец убрал:
  // на светлом фоне они выглядят как предупреждение системы, а тут это просто
  // «есть что разобрать». Оттенок из той же палитры макета (oklch 45%/92% 0.13 190).
  warnInk: "#00504c", warnText: "#006a65", warn: "#006a65",
  warnSoft: "#e6f7f5", warnLine: "#b5e3df", warnChip: "#bff0ec",
  red: "#b93004", redSoft: "#ffe6dd", redLine: "#ead1ca",
  violet: "#5f49ab", violetSoft: "#e3e0ff",
};

export const shadowSeg = "0 1px 3px rgba(0,0,0,.08)";

// Карточка. Радиус 20 и padding 28 — как в макете; тени нет.
export const card = {
  background: C.white, border: `1px solid ${C.line}`, borderRadius: 20, padding: 28,
};
export const cardFlat = { ...card, padding: 20 };
// Карточка-таблица: содержимое идёт до краёв, скруглённые углы обрезают строки.
export const cardTable = {
  background: C.white, border: `1px solid ${C.line}`, borderRadius: 20, overflow: "hidden",
};

export const inp = {
  border: `1px solid ${C.line}`, borderRadius: 12, padding: "11px 14px", fontSize: 14,
  fontFamily: "inherit", width: "100%", boxSizing: "border-box", background: C.white,
  color: C.ink, outline: "none",
};
export const lab = {
  fontSize: 13, color: C.mute2, fontWeight: 600, marginBottom: 7, display: "block",
};

// Шапка и ячейки таблицы. В макете это grid, но у нас настоящая таблица —
// повторяем метрики: 16×24 в шапке, 20×24 в строке.
export const th = {
  textAlign: "left", fontSize: 12, fontWeight: 700, letterSpacing: ".04em",
  textTransform: "uppercase", color: C.faint, padding: "16px 24px",
  borderBottom: `1px solid ${C.lineHead}`, whiteSpace: "nowrap", background: C.white,
};
export const td = {
  padding: "20px 24px", fontSize: 15, borderBottom: `1px solid ${C.lineRow}`,
  verticalAlign: "middle", color: C.ink2,
};
export const numCell = {
  ...td, textAlign: "right", fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap", fontFeatureSettings: '"tnum"',
};
// Плотная строка — для длинных списков операций, где 20px по вертикали слишком много.
export const tdTight = { ...td, padding: "13px 20px", fontSize: 14 };
export const numCellTight = { ...tdTight, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };

export const pill = (color, bg) => ({
  display: "inline-flex", alignItems: "center", gap: 5, borderRadius: 999,
  padding: "3px 9px", fontSize: 11, fontWeight: 700, color, background: bg,
  whiteSpace: "nowrap", lineHeight: 1.6,
});

export const btnPrimary = (on = true) => ({
  background: on ? C.accent : "#c6cad4", color: "#fff", border: "none", borderRadius: 12,
  padding: "12px 22px", fontSize: 14, fontWeight: 700, cursor: on ? "pointer" : "default",
  fontFamily: "inherit", transition: "background .12s",
});
export const btnGhost = {
  background: C.white, border: `1px solid ${C.line}`, borderRadius: 10, padding: "9px 16px",
  fontSize: 13, cursor: "pointer", color: C.mute, fontFamily: "inherit", fontWeight: 600,
};
export const btnDanger = { ...btnGhost, borderColor: C.redLine, color: C.red };

// Вкладки раздела: белая полоса-контейнер по ширине содержимого.
export const tabsWrap = {
  display: "flex", gap: 6, padding: 6, background: C.white,
  border: `1px solid ${C.line}`, borderRadius: 16, width: "fit-content",
  maxWidth: "100%", flexWrap: "wrap", alignSelf: "flex-start",
};
export const tabBtn = (on) => ({
  background: on ? C.accentSoft : "transparent",
  color: on ? C.accentInk : "#50565e",
  border: on ? `1.5px solid ${C.accent}` : "1.5px solid transparent",
  borderRadius: 11, padding: "10px 19px", fontSize: 14, fontWeight: on ? 700 : 600,
  cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
});

// Сегменты внутри экрана («Считать», «Месяцев») — серая подложка, белый активный.
export const segWrap = {
  display: "flex", gap: 4, background: C.lineSoft, borderRadius: 10, padding: 4,
};
export const seg = (on) => ({
  background: on ? C.white : "transparent", color: on ? C.ink2 : "#6e7278",
  border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13,
  fontWeight: on ? 700 : 600, cursor: "pointer", fontFamily: "inherit",
  boxShadow: on ? shadowSeg : "none", whiteSpace: "nowrap",
});

// Инициалы вместо безликой строки: в списке из десяти человек глаз цепляется за них
// быстрее, чем за текст. Цвет — устойчивый хеш имени, чтобы не прыгал между заходами.
const AVA = [
  ["#494fb5", "#e5eaff"], ["#006a65", "#bff0ec"], ["#00602a", "#d2f6dd"],
  ["#aa2e4e", "#ffd5db"], ["#5f49ab", "#e3e0ff"], ["#004d9a", "#c6e1ff"],
  ["#b93004", "#ffe6dd"],
];
export function avatarOf(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  const initials = (parts[0]?.[0] || "?") + (parts[1]?.[0] || "");
  let h = 0;
  for (let i = 0; i < String(name).length; i++) h = (h * 31 + String(name).charCodeAt(i)) >>> 0;
  const [color, bg] = AVA[h % AVA.length];
  return { initials: initials.toUpperCase(), color, bg };
}
export const avatarStyle = (a, size = 40) => ({
  width: size, height: size, borderRadius: size >= 40 ? 12 : 10, flexShrink: 0,
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  background: a.bg, color: a.color, fontSize: size >= 40 ? 14 : 12, fontWeight: 700,
});

// Доля в итоге — компактным бейджем у суммы. Полоска под именем читалась как
// обрывок линии: у большинства людей доля 1–5%, и заливка была почти невидимой.
export const sharePill = {
  display: "inline-block", padding: "2px 7px", borderRadius: 999,
  fontSize: 11, fontWeight: 700, fontVariantNumeric: "tabular-nums",
  background: C.lineSoft, color: "#6e7278",
};

// Рабочая область. Без ограничения таблица растягивается на два монитора,
// колонки разъезжаются к краям и между ними зияет пустота.
export const shell = { maxWidth: 1440, width: "100%", margin: "0 auto", paddingBottom: 40 };

export const h1 = { fontSize: 30, fontWeight: 800, color: C.ink, letterSpacing: "-.02em", margin: 0 };
export const h1sub = { fontSize: 16, color: C.mute, margin: "8px 0 0" };
export const sectionTitle = h1;
export const sectionHint = h1sub;
export const footNote = { fontSize: 13, color: C.faint2, lineHeight: 1.5 };

// Полоса-уведомление. Тонов два: «info» — что-то стоит разобрать (бирюзовый),
// «red» — сохранить не удалось. Жёлтого в разделе нет.
export const notice = (tone = "info") => ({
  background: tone === "red" ? C.redSoft : C.warnSoft,
  border: `1px solid ${tone === "red" ? C.redLine : C.warnLine}`,
  borderRadius: 14, padding: "16px 20px", fontSize: 14,
  color: tone === "red" ? C.red : C.warnInk,
});

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
