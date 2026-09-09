import { describe, expect, it } from "vitest";
import {
  buildInfo,
  changedRecords,
  chunkRecords,
  decodeRecords,
  droppedRecords,
  encodeRecords,
  mergeRecords,
  infoKey,
  recordKey,
  recordsKey,
} from "./mastersStore.mjs";

const master = (over = {}) => ({ source: "olx", extId: "77", name: "Мастер", active: true, ...over });

describe("имена узлов", () => {
  it("держатся рядом с базовым ключом", () => {
    expect(recordsKey("titovstroy-masters-olx")).toBe("titovstroy-masters-olx-rec");
    expect(infoKey("titovstroy-masters-olx")).toBe("titovstroy-masters-olx-info");
  });
});

describe("ключ записи", () => {
  it("собирается из источника и идентификатора", () => {
    // «:» Firebase в имени узла разрешает, но кодируем всё, что не буква/цифра/подчёркивание —
    // так правило одно и не приходится помнить точный список запрещённых символов.
    expect(recordKey({ source: "olx", extId: "12345" })).toBe("olx-003a12345");
    expect(recordKey({ source: "naimi", extId: "9" })).toBe("naimi-003a9");
  });

  it("РАЗНЫЕ мастера получают РАЗНЫЕ ключи — иначе они слились бы в одного", () => {
    // Ровно этим опасна замена «всё лишнее на подчёркивание»: «a.b» и «a/b» дали бы «a_b».
    const keys = new Set([
      recordKey({ source: "olx", extId: "a.b" }),
      recordKey({ source: "olx", extId: "a/b" }),
      recordKey({ source: "olx", extId: "a_b" }),
      recordKey({ source: "olx", extId: "a-b" }),
      recordKey({ source: "olx", extId: "a b" }),
    ]);
    expect(keys.size).toBe(5);
  });

  it("в ключе не остаётся символов, запрещённых Firebase", () => {
    const key = recordKey({ source: "olx", extId: 'ид.$#[]/с кириллицей' });
    expect(key).not.toMatch(/[.$#[\]/\s]/);
    expect(key).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("кодирование и разбор", () => {
  it("запись переживает путь «объект → база → объект»", () => {
    const item = master({ phone: "77010000000", services: ["Электрика"] });
    const { items } = decodeRecords(encodeRecords([item]));
    expect(items).toEqual([item]);
  });

  it("записи без источника или идентификатора не попадают в базу", () => {
    // У них нет имени узла: при следующем обходе такая запись стала бы дублем.
    const encoded = encodeRecords([master(), { name: "без источника" }, { source: "olx" }, null]);
    expect(Object.keys(encoded)).toEqual(["olx-003a77"]);
  });

  it("битый узел пропускается и попадает в счётчик, а не роняет справочник", () => {
    const { items, broken } = decodeRecords({ a: '{"source":"olx","extId":"1"}', b: "{сломано", c: "[]" });
    expect(items).toHaveLength(1);
    expect(broken).toBe(2);
  });

  it("старый формат — вложенный объект вместо строки — тоже читается", () => {
    const { items, broken } = decodeRecords({ a: { source: "olx", extId: "1" } });
    expect(items).toEqual([{ source: "olx", extId: "1" }]);
    expect(broken).toBe(0);
  });
});

describe("пишем только изменившееся", () => {
  it("не изменившиеся записи в обновление не попадают", () => {
    const before = encodeRecords([master({ extId: "1" }), master({ extId: "2" })]);
    const after = encodeRecords([master({ extId: "1" }), master({ extId: "2", phone: "77010000000" })]);
    expect(Object.keys(changedRecords(before, after))).toEqual(["olx-003a2"]);
  });

  it("новая запись — это изменение", () => {
    const after = encodeRecords([master({ extId: "1" })]);
    expect(Object.keys(changedRecords({}, after))).toEqual(["olx-003a1"]);
  });

  it("первый прогон на пустой базе пишет всё", () => {
    const after = encodeRecords([master({ extId: "1" }), master({ extId: "2" })]);
    expect(Object.keys(changedRecords(null, after))).toHaveLength(2);
  });
});

describe("ничего не теряется", () => {
  it("исчезнувший ключ виден до записи, а не после", () => {
    const before = encodeRecords([master({ extId: "1" }), master({ extId: "2" })]);
    const after = encodeRecords([master({ extId: "1" })]);
    expect(droppedRecords(before, after)).toEqual(["olx-003a2"]);
  });

  it("на обычном прогоне не теряется никто: пропавшие остаются с active:false", () => {
    const before = encodeRecords([master({ extId: "1" }), master({ extId: "2" })]);
    const after = encodeRecords([master({ extId: "1" }), master({ extId: "2", active: false })]);
    expect(droppedRecords(before, after)).toEqual([]);
  });
});

describe("прерванный переезд", () => {
  it("недоехавшие записи берутся из старого узла и не теряются", () => {
    // Переезд оборвался на середине: в новом узле только первый мастер.
    const переехали = [master({ extId: "1", phone: "77010000000" })];
    const старый = [master({ extId: "1" }), master({ extId: "2", phone: "77020000000" })];
    const merged = mergeRecords(переехали, старый);
    expect(merged).toHaveLength(2);
    // Телефон второго — единственная его копия, и он на месте.
    expect(merged.find((m) => m.extId === "2").phone).toBe("77020000000");
  });

  it("переехавшая запись главнее старой: в ней уже могли появиться новые данные", () => {
    const merged = mergeRecords(
      [master({ extId: "1", phone: "77010000000" })],
      [master({ extId: "1", phone: "" })],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].phone).toBe("77010000000");
  });

  it("когда переезд завершён, старый узел ничего не добавляет", () => {
    const items = [master({ extId: "1" }), master({ extId: "2" })];
    expect(mergeRecords(items, items)).toHaveLength(2);
  });

  it("мусор с любой стороны не попадает в справочник", () => {
    expect(mergeRecords([null, { name: "без источника" }], [undefined])).toEqual([]);
  });
});

describe("порции", () => {
  it("обновление режется на куски заданного размера", () => {
    const records = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`k${i}`, "v"]));
    const chunks = chunkRecords(records, 3);
    expect(chunks.map((c) => Object.keys(c).length)).toEqual([3, 3, 1]);
    expect(Object.assign({}, ...chunks)).toEqual(records);
  });

  it("пустое обновление не порождает пустых запросов", () => {
    expect(chunkRecords({}, 3)).toEqual([]);
    expect(chunkRecords(null)).toEqual([]);
  });

  it("бессмысленный размер порции не приводит к бесконечному циклу", () => {
    const records = { a: "1", b: "2" };
    expect(chunkRecords(records, 0)).toHaveLength(1);
    expect(chunkRecords(records, -5)).toHaveLength(1);
  });
});

describe("счётчики для шапки", () => {
  it("на OLX скрывший номер в очередь не ставится, а на naimi номер есть у всех", () => {
    // OLX: hasPhoneFlag:false — автор скрыл телефон, ждать нечего.
    const olx = buildInfo([master({ extId: "1", hasPhoneFlag: false }), master({ extId: "2", hasPhoneFlag: true })]);
    expect(olx.pendingPhone).toBe(1);
    // naimi: флага нет вовсе — без телефона там нет регистрации, значит ждут все без номера.
    const naimi = buildInfo([{ source: "naimi", extId: "1", active: true }, { source: "naimi", extId: "2", phone: "7701" }]);
    expect(naimi.pendingPhone).toBe(1);
  });

  it("считаются по списку, чтобы экран не читал его весь ради шапки", () => {
    const info = buildInfo([
      master({ extId: "1", phone: "7701", hasPhoneFlag: true }),
      master({ extId: "2", phone: "", hasPhoneFlag: true }),
      master({ extId: "3", phone: "", hasPhoneFlag: true, active: false }),
    ], { source: "olx.kz" });
    expect(info.count).toBe(3);
    expect(info.activeCount).toBe(2);
    expect(info.withPhone).toBe(1);
    expect(info.pendingPhone).toBe(1);      // пропавший в очередь на номер не идёт
    expect(info.source).toBe("olx.kz");
    expect(Date.parse(info.updatedAt)).toBeGreaterThan(0);
  });
});
