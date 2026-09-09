import { describe, expect, it } from "vitest";
import { avrCoverage, avrLineKey, coverageLabel, coveredCount, markCoveredLines } from "./avrCoverage.js";

const act = (over = {}) => ({ id: 1, objectId: 10, type: "avr", actNo: "1", lines: [], ...over });
const estLine = (over = {}) => ({ name: "Штукатурка стен", unit: "м2", qty: 10, price: 3000, included: true, doneQty: 10, ...over });

describe("сопоставление строк", () => {
  it("не зависит от регистра и лишних пробелов", () => {
    expect(avrLineKey({ name: "  Штукатурка   СТЕН ", unit: " М2 " }))
      .toBe(avrLineKey({ name: "штукатурка стен", unit: "м2" }));
  });

  it("разные единицы — разные работы", () => {
    expect(avrLineKey({ name: "Плитка", unit: "м2" })).not.toBe(avrLineKey({ name: "Плитка", unit: "шт" }));
  });
});

describe("что уже ушло в акты", () => {
  it("складывает количество по всем актам объекта", () => {
    const cov = avrCoverage([
      act({ id: 1, actNo: "1", lines: [{ name: "Штукатурка стен", unit: "м2", doneQty: 4 }] }),
      act({ id: 2, actNo: "2", lines: [{ name: "штукатурка  стен", unit: "М2", doneQty: 3 }] }),
    ], 10);
    const found = cov.get(avrLineKey(estLine()));
    expect(found.qty).toBe(7);
    expect(found.acts).toEqual(["1", "2"]);
  });

  it("акты ЧУЖОГО объекта не учитываются", () => {
    const cov = avrCoverage([act({ objectId: 99, lines: [{ name: "Штукатурка стен", unit: "м2", doneQty: 5 }] })], 10);
    expect(cov.size).toBe(0);
  });

  it("редактируемый акт не считает сданными свои же строки", () => {
    const reports = [act({ id: 7, lines: [{ name: "Штукатурка стен", unit: "м2", doneQty: 10 }] })];
    expect(avrCoverage(reports, 10, { excludeId: 7 }).size).toBe(0);
    expect(avrCoverage(reports, 10).size).toBe(1);
  });

  it("не-акты и пустые строки пропускаются", () => {
    const cov = avrCoverage([
      act({ type: "dogovor", lines: [{ name: "Штукатурка стен", unit: "м2", doneQty: 5 }] }),
      act({ id: 2, lines: [{ name: "", unit: "", doneQty: 5 }, { name: "Плитка", unit: "м2", doneQty: 0 }] }),
      null,
    ], 10);
    expect(cov.size).toBe(0);
  });
});

describe("разметка нового акта", () => {
  it("сданное целиком снимается с галочки, но со списка не пропадает", () => {
    const cov = avrCoverage([act({ lines: [{ name: "Штукатурка стен", unit: "м2", doneQty: 10 }] })], 10);
    const [line] = markCoveredLines([estLine()], cov);
    expect(line.included).toBe(false);
    expect(line.doneQty).toBe(0);
    expect(line.usedQty).toBe(10);
    expect(line.usedActs).toEqual(["1"]);
  });

  it("частично сданному подставляется ОСТАТОК — это и есть смысл всей затеи", () => {
    const cov = avrCoverage([act({ lines: [{ name: "Штукатурка стен", unit: "м2", doneQty: 4 }] })], 10);
    const [line] = markCoveredLines([estLine()], cov);
    expect(line.included).toBe(true);
    expect(line.doneQty).toBe(6);
  });

  it("не сдававшаяся работа ведёт себя как раньше — отмечена, количество из сметы", () => {
    const [line] = markCoveredLines([estLine()], new Map());
    expect(line.included).toBe(true);
    expect(line.doneQty).toBe(10);
    expect(line.usedQty).toBe(0);
  });

  it("сдали больше сметы — остаток не уходит в минус", () => {
    const cov = avrCoverage([act({ lines: [{ name: "Штукатурка стен", unit: "м2", doneQty: 25 }] })], 10);
    const [line] = markCoveredLines([estLine()], cov);
    expect(line.doneQty).toBe(0);
    expect(line.included).toBe(false);
  });

  it("при открытии сохранённого акта галочки и количества НЕ трогаются", () => {
    // Это выписанный документ, а не черновик: подписываем, но не переписываем.
    const cov = avrCoverage([act({ id: 2, actNo: "2", lines: [{ name: "Штукатурка стен", unit: "м2", doneQty: 4 }] })], 10);
    const [line] = markCoveredLines([estLine({ included: true, doneQty: 6 })], cov, { applyDefaults: false });
    expect(line.included).toBe(true);
    expect(line.doneQty).toBe(6);
    expect(line.usedQty).toBe(4);
  });
});

describe("одна работа в нескольких сметах объекта", () => {
  // Найдено на боевых данных: у объекта ТОО «ТССП Казахстан» пять позиций стоят сразу в
  // основной смете и в допсоглашении, а построитель «по всем сметам» выкладывает их подряд.
  const two = () => [estLine({ qty: 60, doneQty: 60 }), estLine({ qty: 60, doneQty: 60 })];

  it("сданное разносится по строкам, а не вычитается из каждой", () => {
    const cov = avrCoverage([act({ lines: [{ name: "Штукатурка стен", unit: "м2", doneQty: 90 }] })], 10);
    const [first, second] = markCoveredLines(two(), cov);
    expect(first.included).toBe(false);          // первые 60 закрыты
    expect(second.included).toBe(true);          // на вторую пришлось 30
    expect(second.doneQty).toBe(30);
    expect(coverageLabel(second)).toBe("сдано 30 из 60 · акт №1");
  });

  it("вторая копия подписана, даже если всё количество ушло первой", () => {
    const cov = avrCoverage([act({ lines: [{ name: "Штукатурка стен", unit: "м2", doneQty: 60 }] })], 10);
    const [first, second] = markCoveredLines(two(), cov);
    expect(first.usedQty).toBe(60);
    expect(second.usedQty).toBe(0);
    expect(second.included).toBe(true);          // остаток есть — работа не закрыта
    expect(second.doneQty).toBe(60);
    // Молчать нельзя: человеку важно знать, что работа в актах уже фигурирует.
    expect(coverageLabel(second)).toBe("есть в акте №1");
    expect(coveredCount([first, second])).toBe(2);
  });

  it("дробные количества не оставляют мусорного хвоста в акте", () => {
    // Взято с боевых данных ТОО «ТССП Казахстан»: сдано 117.64 + 30, в сметах 30 и 117.64.
    // Без округления 147.64 − 30 = 117.63999999999999, остаток выходит 1.42e-14 — «больше
    // нуля», строка оставалась отмеченной и ушла бы в акт с количеством 0,0000000000000142.
    const cov = avrCoverage([
      act({ id: 1, actNo: "2", lines: [{ name: "Ошкуривание стен", unit: "м²", doneQty: 117.64 }] }),
      act({ id: 2, actNo: "3", lines: [{ name: "Ошкуривание стен", unit: "м²", doneQty: 30 }] }),
    ], 10);
    const marked = markCoveredLines([
      estLine({ name: "Ошкуривание стен", unit: "м²", qty: 30 }),
      estLine({ name: "Ошкуривание стен", unit: "м²", qty: 117.64 }),
    ], cov);
    expect(marked.every((l) => l.included === false)).toBe(true);
    expect(marked.map((l) => l.doneQty)).toEqual([0, 0]);
  });

  it("ручная позиция без количества забирает остаток целиком — делить там нечего", () => {
    const cov = avrCoverage([act({ lines: [{ name: "Закуп материалов", unit: "усл", doneQty: 1 }] })], 10);
    const [line] = markCoveredLines([estLine({ name: "Закуп материалов", unit: "усл", qty: 0 })], cov);
    expect(line.usedQty).toBe(1);
    expect(line.included).toBe(false);
  });
});

describe("подпись у строки", () => {
  it("частичная сдача показывает сколько из скольких и где", () => {
    expect(coverageLabel({ qty: 10, usedQty: 4, usedActs: ["1"] })).toBe("сдано 4 из 10 · акт №1");
    expect(coverageLabel({ qty: 10, usedQty: 4, usedActs: ["1", "2"] })).toBe("сдано 4 из 10 · акты №1, №2");
  });

  it("сдано целиком — без дробей и без «0 из 0»", () => {
    expect(coverageLabel({ qty: 10, usedQty: 10, usedActs: ["1"] })).toBe("уже сдано · акт №1");
    expect(coverageLabel({ qty: 0, usedQty: 5, usedActs: [] })).toBe("уже сдано");
  });

  it("дробные количества не превращаются в длинный хвост", () => {
    expect(coverageLabel({ qty: 10, usedQty: 3.333333, usedActs: [] })).toBe("сдано 3.33 из 10");
  });

  it("ничего не сдавалось — подписи нет", () => {
    expect(coverageLabel({ qty: 10, usedQty: 0 })).toBe("");
    expect(coverageLabel(null)).toBe("");
  });
});

describe("счётчик для шапки", () => {
  it("считает строки, которые уже встречались в актах", () => {
    expect(coveredCount([{ usedQty: 3 }, { usedQty: 0 }, { usedQty: 10 }, {}])).toBe(2);
    expect(coveredCount(null)).toBe(0);
  });
});
