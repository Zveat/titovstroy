// Оформление компании. Проверяется в первую очередь то, чем можно испортить
// документ клиенту: цвет и подстановка значений.
import { describe, it, expect } from "vitest";
import { BRAND_DEFAULT, brandInk, brandLetter, normalizeBrand, waLink } from "./brand.js";

// Контраст по WCAG, посчитанный независимо от самого модуля: если считать той же
// функцией, тест подтвердит только сам себя.
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

describe("цвет фирменного стиля", () => {
  // Именно это и случилось на боевом КП: владелец выбрал светлый цвет, и в шапке
  // пропали название компании и номер телефона — документ ушёл клиенту таким.
  it("светлый фирменный цвет читается на светлой бумаге КП", () => {
    for (const c of ["#f5f0dc", "#ffffff", "#fde68a", "#e2e8f0"]) {
      expect(ratio(brandInk({ accent: c }, "#f5f2ec"), "#f5f2ec")).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("тёмный фирменный цвет читается на тёмных плашках", () => {
    for (const c of ["#111111", "#1a1a28", "#0f172a"]) {
      expect(ratio(brandInk({ accent: c }, "#1a1a28"), "#1a1a28")).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("цвет, который и так читается, не трогаем", () => {
    expect(brandInk({ accent: "#2563eb" }, "#ffffff")).toBe("#2563eb");
  });

  it("мусор вместо цвета не роняет документ", () => {
    expect(ratio(brandInk({ accent: "не цвет" }, "#f5f2ec"), "#f5f2ec")).toBeGreaterThanOrEqual(4.5);
    expect(normalizeBrand({ accent: "красный" }).accent).toBe(BRAND_DEFAULT.accent);
  });
});

describe("значения оформления", () => {
  it("пустое поле означает «оставить умолчание», а не пустоту на экране", () => {
    const b = normalizeBrand({ name: "", tagline: "   " });
    expect(b.name).toBe(BRAND_DEFAULT.name);
    expect(b.tagline).toBe(BRAND_DEFAULT.tagline);
  });

  it("название компании подставляется целиком", () => {
    expect(normalizeBrand({ name: "Ок-Стор" }).name).toBe("Ок-Стор");
    expect(brandLetter({ name: "Ок-Стор" })).toBe("О");
  });

  // Номер вставляют как придётся — со скобками, пробелами и плюсом, а ссылка
  // wa.me принимает только цифры.
  it("телефон чистится до цифр и даёт рабочую ссылку", () => {
    expect(normalizeBrand({ whatsapp: "+7 (707) 982-49-15" }).whatsapp).toBe("77079824915");
    expect(waLink({ whatsapp: "77079824915" })).toBe("https://wa.me/77079824915");
  });

  it("посторонние поля в узел не протаскиваются", () => {
    expect(normalizeBrand({ name: "X", hack: "<script>" }).hack).toBeUndefined();
  });
});
