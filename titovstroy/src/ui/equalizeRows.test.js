import { describe, expect, it } from "vitest";
import { KEEP_CLASS, applySize, collectRows, isIconButton, rowSize } from "./equalizeRows.js";

// Кнопки подделываем: измерение и стиль — единственное, что нужно от настоящего DOM.
const btn = (text, parent, size = { width: 100, height: 30 }) => {
  const b = { textContent: text, parentElement: parent, style: { minWidth: "", minHeight: "" }, size };
  parent?.push?.(b);
  return b;
};
const row = (cls = "") => {
  const arr = [];
  arr.classList = { contains: (c) => c === cls };
  return arr;
};
const measure = (b) => b.size;

describe("что считаем кнопкой-значком", () => {
  it("один символ или эмодзи — значок", () => {
    for (const t of ["✕", "🗑", "←", "▼", " ✕ "]) expect(isIconButton(t)).toBe(true);
  });

  it("подпись из слова — не значок", () => {
    expect(isIconButton("Excel")).toBe(false);
    expect(isIconButton("⬇ Excel")).toBe(false);
  });

  it("пусто и мусор считаем значком — размер соседей такое не задаёт", () => {
    for (const t of ["", null, undefined]) expect(isIconButton(t)).toBe(true);
  });
});

describe("поиск рядов", () => {
  it("две и больше кнопок у одного родителя — это ряд", () => {
    const p = row();
    btn("Первая", p); btn("Вторая", p);
    expect(collectRows(p)).toHaveLength(1);
  });

  it("одинокая кнопка рядом не считается", () => {
    const p = row();
    btn("Одна", p);
    expect(collectRows(p)).toHaveLength(0);
  });

  it("значки в ряд не идут и ряд из них не образуют", () => {
    // Иначе крестик и корзина растянулись бы друг под друга, а это выглядит поломкой.
    const p = row();
    btn("✕", p); btn("🗑", p); btn("Сохранить", p);
    expect(collectRows(p)).toHaveLength(0);       // осталась одна текстовая — не ряд
  });

  it("значок не влияет на размер соседей", () => {
    const p = row();
    const a = btn("Сохранить", p), b = btn("Отмена", p);
    btn("✕", p);
    expect(collectRows(p)[0]).toEqual([a, b]);
  });

  it("помеченный ряд не трогаем вообще", () => {
    // Чипы фильтров: подписи от «Все» до «Согласование сметы», общая ширина развернула бы
    // девять чипов в пять рядов пустоты.
    const p = row(KEEP_CLASS);
    btn("Все (88)", p); btn("Согласование сметы (11)", p);
    expect(collectRows(p)).toHaveLength(0);
  });

  it("шесть и больше кнопок подряд — это меню, а не панель: не трогаем", () => {
    // Вкладки Админки (13 штук) от такого выравнивания выстроились в столбик во всю ширину
    // экрана — поймано на живом прогоне.
    const p = row();
    for (const t of ["Сотрудники","Права ролей","Клиенты","Подрядчики","Реквизиты","Прайс-лист"]) btn(t, p);
    expect(collectRows(p)).toHaveLength(0);
  });

  it("пять кнопок — ещё панель, выравниваем", () => {
    const p = row();
    for (const t of ["Всё время","Месяц","3 месяца","Неделя","Вручную"]) btn(t, p);
    expect(collectRows(p)).toHaveLength(1);
  });

  it("кнопки разных родителей — разные ряды", () => {
    const a = row(), b = row();
    btn("Первый", a); btn("Второй", a); btn("Третий", b); btn("Четвёртый", b);
    expect(collectRows([...a, ...b])).toHaveLength(2);
  });
});

describe("размер ряда", () => {
  it("берём самую большую по каждой стороне", () => {
    const p = row();
    btn("a", p, { width: 77, height: 24 });
    btn("b", p, { width: 153, height: 31 });
    expect(rowSize(p, measure)).toEqual({ width: 153, height: 31 });
  });

  it("дробные размеры округляем вверх — иначе значение обрежется на пиксель", () => {
    const p = row();
    btn("a", p, { width: 100.2, height: 30.7 });
    expect(rowSize(p, measure)).toEqual({ width: 101, height: 31 });
  });

  it("скрытая кнопка размер не задаёт", () => {
    const p = row();
    btn("видимая", p, { width: 100, height: 30 });
    btn("скрытая", p, { width: 0, height: 0 });
    expect(rowSize(p, measure)).toEqual({ width: 100, height: 30 });
  });
});

describe("запись размера", () => {
  it("ставит одинаковый размер всем кнопкам ряда", () => {
    const p = row();
    const a = btn("a", p), b = btn("b", p);
    applySize(p, { width: 153, height: 31 });
    expect(a.style).toMatchObject({ minWidth: "153px", minHeight: "31px" });
    expect(b.style).toMatchObject({ minWidth: "153px", minHeight: "31px" });
  });

  it("НЕ пишет, если ничего не изменилось", () => {
    // Правка стиля заставляет браузер пересчитывать раскладку, а проход идёт на каждой
    // перерисовке — лишние записи стоили бы дороже самой задачи.
    const p = row();
    btn("a", p); btn("b", p);
    expect(applySize(p, { width: 100, height: 30 })).toBe(2);
    expect(applySize(p, { width: 100, height: 30 })).toBe(0);
  });

  it("нулевой размер снимает ограничение, а не ставит 0px", () => {
    const p = row();
    const a = btn("a", p);
    applySize(p, { width: 100, height: 30 });
    applySize(p, { width: 0, height: 0 });
    expect(a.style).toMatchObject({ minWidth: "", minHeight: "" });
  });
});
