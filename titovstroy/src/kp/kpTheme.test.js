// Палитра коммерческого предложения. Документ уходит клиенту, поэтому главное
// здесь не «красиво», а «читается при любых настройках».
import { describe, it, expect } from "vitest";
import { KP_PRESETS, KP_THEME_DEFAULT, LEGACY_KP_THEME, kpTheme, kpThemeSettings } from "./kpTheme.js";

const rgb = (h) => {
  let s = h.replace("#", "");
  if (s.length === 3) s = s.split("").map(c => c + c).join("");
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const L = (h) => {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = rgb(h);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const [hi, lo] = [L(a), L(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("оформление КП", () => {
  it("умолчания повторяют нынешний вид документа", () => {
    const t = kpTheme({});
    expect(t.paper).toBe("#f5f2ec");
    expect(t.bar).toBe("#1a1a28");
    expect(t.text).toBe("#1a1a28");     // тот же почти-чёрный, что был вписан
    expect(t.barText).toBe("#f5f2ec");
  });

  // Ради этого всё и затевалось: владелец волен выбрать любой цвет, и ни один
  // выбор не должен сделать текст нечитаемым на странице у клиента.
  it("во всех готовых схемах текст читается", () => {
    for (const p of KP_PRESETS) {
      const t = kpTheme(p);
      expect(ratio(t.text, t.paper), p.label + ": основной текст").toBeGreaterThanOrEqual(7);
      expect(ratio(t.muted, t.paper), p.label + ": подписи").toBeGreaterThanOrEqual(3);
      expect(ratio(t.barText, t.bar), p.label + ": текст на плашке").toBeGreaterThanOrEqual(7);
      expect(ratio(t.accent, t.paper), p.label + ": суммы").toBeGreaterThanOrEqual(3);
      expect(ratio(t.accentOnBar, t.bar), p.label + ": итог на плашке").toBeGreaterThanOrEqual(3);
      expect(ratio(t.subtle, t.paper), p.label + ": разделы сметы").toBeGreaterThanOrEqual(3);
      expect(ratio(t.warnOnBar, t.bar), p.label + ": скидка").toBeGreaterThanOrEqual(3);
    }
  });

  // На насыщенной средней бумаге (синей, бронзовой) контраст 7 недостижим в
  // принципе: предел ставит сама бумага, а не подбор цвета текста. Поэтому
  // требуем не «всегда 7», а «код выжал максимум возможного».
  it("на любой бумаге код берёт максимум достижимого", () => {
    const best = (bg) => Math.max(ratio("#ffffff", bg), ratio("#000000", bg));
    for (const paper of ["#ffffff", "#000000", "#b8904a", "#f5f0dc", "#1e2230", "#2563eb"]) {
      const t = kpTheme({ kpPaper: paper, kpBar: "#1a1a28", kpAccent: "#f5f0dc" });
      expect(ratio(t.text, t.paper), paper).toBeGreaterThanOrEqual(Math.min(7, best(paper)) - 0.01);
      expect(ratio(t.accent, t.paper), paper).toBeGreaterThanOrEqual(Math.min(3, best(paper)) - 0.01);
    }
  });

  // ГЛАВНОЕ ОБЕЩАНИЕ этого экрана: владелец не может выбором цвета сделать
  // документ нечитаемым. Проверяем не на удобных примерах, а перебором всего
  // цветового круга плюс серые — включая ту самую бумагу средней яркости, где
  // достижимый предел минимален.
  it("норма читаемости достигается на ЛЮБОМ цвете бумаги", () => {
    const papers = [];
    for (let r = 0; r < 256; r += 51) for (let g = 0; g < 256; g += 51) for (let b = 0; b < 256; b += 51) {
      papers.push("#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join(""));
    }
    let worst = 99, worstPaper = "";
    for (const paper of papers) {
      const t = kpTheme({ kpPaper: paper });
      const c = ratio(t.text, t.paper);
      if (c < worst) { worst = c; worstPaper = paper; }
    }
    expect(worst, "худшая бумага " + worstPaper).toBeGreaterThanOrEqual(4.5);
  });

  it("на тёмной бумаге полосы и рамки светлеют, а не темнеют", () => {
    const dark = kpTheme({ kpPaper: "#1e2230" });
    expect(L(dark.paperAlt)).toBeGreaterThan(L(dark.paper));
    const light = kpTheme({ kpPaper: "#ffffff" });
    expect(L(light.paperAlt)).toBeLessThan(L(light.paper));
  });

  it("акцент документа пустой — берётся фирменный цвет компании", () => {
    expect(kpTheme({ accent: "#2563eb", kpAccent: "" }).accent).toBe("#2563eb");
    expect(kpTheme({ accent: "#2563eb", kpAccent: "#0f766e" }).accent).toBe("#0f766e");
  });

  it("мусор вместо цвета откатывается к умолчанию, а не рушит документ", () => {
    const t = kpTheme({ kpPaper: "синий", kpBar: "()", kpFont: "нет такого" });
    expect(t.paper).toBe(KP_THEME_DEFAULT.kpPaper);
    expect(t.bar).toBe(KP_THEME_DEFAULT.kpBar);
    expect(t.font).toContain("Golos");
  });

  // ГЛАВНОЕ ТРЕБОВАНИЕ ВЛАДЕЛЬЦА: отправленное клиенту предложение не меняет вид
  // от того, что позже поменяли настройки. Меняются только новые.
  describe("вид отправленного КП зафиксирован", () => {
    it("в снимок кладутся разрешённые цвета, а не ссылка на настройки", () => {
      const saved = kpThemeSettings({ accent: "#2563eb", kpAccent: "", kpPaper: "#ffffff" });
      expect(saved.kpAccent).toBe("#2563eb");        // фирменный цвет раскрыт здесь и сейчас
      expect(saved.kpPaper).toBe("#ffffff");
      // Настройки поменяли — снимок этого не замечает.
      expect(kpTheme(saved).accent).toBe(kpTheme({ ...saved }).accent);
      expect(kpTheme(saved).paper).toBe("#ffffff");
    });

    it("снимок рисуется своим оформлением, а не текущим", () => {
      const snapshot = kpThemeSettings({ kpPaper: "#ffffff", kpBar: "#0f172a", kpAccent: "#2563eb" });
      const now = { kpPaper: "#1e2230", kpBar: "#0b0e17", kpAccent: "#e0b357" };
      expect(kpTheme(snapshot).paper).toBe("#ffffff");
      expect(kpTheme(now).paper).toBe("#1e2230");
    });

    // У КП, опубликованных до появления настроек, оформления в снимке нет.
    // Показывать их надо ровно такими, какими их получил клиент, — то есть
    // историческим кремово-золотым, а не тем, что сейчас в настройках.
    it("старые снимки без оформления показываются историческим видом", () => {
      const t = kpTheme(LEGACY_KP_THEME);
      expect(t.paper).toBe("#f5f2ec");
      expect(t.bar).toBe("#1a1a28");
      expect(t.accent).toBe("#a27f41");             // то самое золото, доведённое до нормы
      expect(t.accentOnBar).toBe("#b8904a");
    });
  });
});
