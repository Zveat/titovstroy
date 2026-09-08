// ОФОРМЛЕНИЕ КОММЕРЧЕСКОГО ПРЕДЛОЖЕНИЯ.
//
// Настраивается ТРИ вещи — бумага, плашки и акцент — а всё остальное (полосы
// таблицы, рамки, цвет текста, цвет на тёмном) считается из них. Это сделано
// намеренно и обсуждалось с владельцем: десяток отдельных пипеток гарантированно
// приводит к нечитаемому документу у клиента, а отвечать за это будет сервис.
// Здесь же ошибиться нельзя: контраст текста доводится до нормы автоматически.
//
// Умолчания повторяют нынешний вид КП — кремовая бумага, почти чёрные плашки,
// золотой акцент, — чтобы у тех, кто ничего не настраивал, документ не поменялся.
import { brandInk, normalizeBrand } from "../brand.js";

export const KP_THEME_DEFAULT = Object.freeze({
  kpPaper: "#f5f2ec",   // бумага документа
  kpBar: "#1a1a28",     // тёмные плашки: заголовки разделов и блок итога
  kpAccent: "",         // акцент документа; пусто — берём фирменный цвет компании
  kpFont: "golos",      // шрифт
});

export const KP_FONTS = Object.freeze([
  { key: "golos", label: "Golos Text (как сейчас)", css: "'Golos Text','Segoe UI',sans-serif" },
  { key: "system", label: "Системный гротеск", css: "-apple-system,'Segoe UI',Roboto,sans-serif" },
  { key: "serif", label: "С засечками", css: "Georgia,'Times New Roman',serif" },
]);

// Готовые схемы. Не «красивости», а рабочие сочетания: каждую я проверил на
// читаемость целиком, и с них удобно начинать, а не подбирать три цвета с нуля.
export const KP_PRESETS = Object.freeze([
  { key: "cream", label: "Кремовая (как сейчас)", kpPaper: "#f5f2ec", kpBar: "#1a1a28", kpAccent: "#b8904a" },
  { key: "white", label: "Белая деловая", kpPaper: "#ffffff", kpBar: "#0f172a", kpAccent: "#2563eb" },
  { key: "grey", label: "Светло-серая", kpPaper: "#f1f5f9", kpBar: "#334155", kpAccent: "#0f766e" },
  { key: "dark", label: "Тёмная", kpPaper: "#1e2230", kpBar: "#0b0e17", kpAccent: "#e0b357" },
]);

const S = (v) => (v == null ? "" : String(v));
const hex2rgb = (h) => {
  let s = S(h).replace("#", "");
  if (s.length === 3) s = s.split("").map(c => c + c).join("");
  const n = parseInt(s.slice(0, 6) || "000000", 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgb2hex = (c) => "#" + c.map(v =>
  Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const lum = ([r, g, b]) => {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

// Шаг «в сторону от бумаги»: на светлой бумаге полосы и рамки темнее, на тёмной
// — светлее. Без этого тёмная схема давала бы чёрное на чёрном.
function step(hex, k) {
  const c = hex2rgb(hex);
  return rgb2hex(lum(c) > 0.5 ? c.map(v => v * (1 - k)) : c.map(v => v + (255 - v) * k));
}

export const isHex = (v) => /^#[0-9a-fA-F]{3,8}$/.test(S(v).trim());

const contrast = (a, b) => {
  const l = [lum(hex2rgb(a)), lum(hex2rgb(b))].sort((x, y) => y - x);
  return (l[0] + 0.05) / (l[1] + 0.05);
};

// Читаемый цвет текста на заданном фоне.
//
// brandInk двигает цвет в ОДНУ сторону — от фона. На светлой бумаге он темнит,
// на тёмной светлит, и этого хватает почти всегда. Но на бумаге средней яркости
// (владелец волен выбрать хоть бронзовую) тёмный текст физически не может дать
// контраст 7: даже чистый чёрный на такой бумаге даёт около 4,4. Тогда правильный
// ответ — не «темнить дальше», а взять противоположную сторону. Поймано тестом,
// а не на экране клиента.
// ГАРАНТИЯ. Худшая возможная бумага — та, где чёрный и белый дают поровну; это
// яркость около 0.18, и контраст там 4.58. То есть после запасного варианта
// норма 4.5 достижима на ЛЮБОМ цвете бумаги, и предупреждать человеку не о чем:
// испортить читаемость выбором цвета он не может в принципе. Закреплено тестом.
function readable(src, bg, min) {
  const tuned = brandInk({ accent: src }, bg, min);
  if (contrast(tuned, bg) >= min) return tuned;
  return contrast("#ffffff", bg) >= contrast("#000000", bg) ? "#ffffff" : "#000000";
}

// Готовая палитра документа из настроек. Одна функция на все места, где КП
// рисуется: экран, печать и публичная страница клиента.
export function kpTheme(brand = {}) {
  const b = normalizeBrand(brand);
  const paper = isHex(b.kpPaper) ? b.kpPaper : KP_THEME_DEFAULT.kpPaper;
  const bar = isHex(b.kpBar) ? b.kpBar : KP_THEME_DEFAULT.kpBar;
  const accentSrc = isHex(b.kpAccent) ? b.kpAccent : b.accent;
  const font = (KP_FONTS.find(f => f.key === b.kpFont) || KP_FONTS[0]).css;
  return {
    font, paper, bar,
    paperAlt: step(paper, 0.035),                    // чётные строки таблицы
    panel: step(paper, 0.06),                        // блок клиента, строка итога
    border: step(paper, 0.10),
    // Текст берём от цвета плашек и доводим до читаемого на бумаге: так документ
    // остаётся единым по тону, а не «чёрный текст поверх любой схемы».
    text: readable(bar, paper, 7),
    muted: readable(bar, paper, 3),
    barText: readable(paper, bar, 7),
    // Акцентом набраны суммы и номера — крупный жирный текст, для него норма
    // контраста 3, а не 4.5. Ставить сюда 4.5 значило бы затемнить нынешний
    // золотой до бурого и без нужды изменить вид документа у всех, кто ничего
    // не настраивал.
    accent: readable(accentSrc, paper, 3),
    accentOnBar: readable(accentSrc, bar, 3),
    // Названия разделов сметы и строка скидки — смысловые цвета, не фирменные:
    // они должны оставаться узнаваемыми, но читаться на любой бумаге и плашке.
    subtle: readable("#8855aa", paper, 3),
    warnOnBar: readable("#e07070", bar, 3),
  };
}
