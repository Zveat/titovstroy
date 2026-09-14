import { describe, expect, it } from "vitest";
import { CLIENT_CONTRACT_TYPES, buildObjectSums } from "./objectSums.js";

const works = (sum) => [{ name: "Работы", quantity: 1, unit: "шт", price: sum }];

describe("сумма объекта для «Договор подписан»", () => {
  it("берём договор — в нём уже учтена скидка", () => {
    const sums = buildObjectSums([{ id: "c1", objectId: "o1", type: "repair_fiz", works: works(1000000), discount: 10 }], []);
    expect(sums.o1).toBe(900000);
  });

  it("приложения складываются с договором", () => {
    // Так написано в самом приложении: оно увеличивает общую стоимость Договора.
    const sums = buildObjectSums([
      { id: "c1", objectId: "o1", type: "repair_fiz", works: works(1000000) },
      { id: "c2", objectId: "o1", type: "annex", works: works(120450) },
    ], []);
    expect(sums.o1).toBe(1120450);
  });

  it("ДОГОВОР ПОДРЯДА В СУММУ НЕ ПОПАДАЕТ НИКОГДА", () => {
    // Это себестоимость — сколько платим бригаде. Сообщение уходит в общий чат,
    // где сидит вся команда; подряду там не место.
    const sums = buildObjectSums([
      { id: "c1", objectId: "o1", type: "repair_fiz", works: works(1000000) },
      { id: "p1", objectId: "o1", type: "podryad", works: works(700000) },
      { id: "p2", objectId: "o1", type: "podryad_annex", works: works(50000) },
    ], []);
    expect(sums.o1).toBe(1000000);
  });

  it("незнакомый тип договора в сумму не идёт", () => {
    // Список разрешённых, а не запрещённых: новый тип не просочится молча.
    const sums = buildObjectSums([{ id: "x", objectId: "o1", type: "придуманный", works: works(999) }], []);
    expect(sums.o1).toBeUndefined();
    expect(CLIENT_CONTRACT_TYPES).not.toContain("podryad");
    expect(CLIENT_CONTRACT_TYPES).not.toContain("podryad_annex");
  });

  it("договора нет — считаем по сметам объекта", () => {
    const sums = buildObjectSums([], [
      { id: "e1", objectId: "o2", total: 1630675 },
      { id: "e2", parentId: "e1", total: 200000 },      // доп. смета цепляется к основной
    ]);
    expect(sums.o2).toBe(1830675);
  });

  it("договор важнее смет: обе цифры есть — берём договор", () => {
    const sums = buildObjectSums(
      [{ id: "c1", objectId: "o1", type: "repair_fiz", works: works(1000000) }],
      [{ id: "e1", objectId: "o1", total: 777 }],
    );
    expect(sums.o1).toBe(1000000);
  });

  it("удалённое не считаем", () => {
    const sums = buildObjectSums(
      [{ id: "c1", objectId: "o1", type: "repair_fiz", works: works(1000000), deletedAt: 1 }],
      [{ id: "e1", objectId: "o1", total: 500, deletedAt: 1 }],
    );
    expect(sums.o1).toBeUndefined();
  });

  it("мусор и пустота не роняют прогон", () => {
    expect(buildObjectSums()).toEqual({});
    expect(buildObjectSums(null, "не массив")).toEqual({});
    expect(buildObjectSums([null, {}, { objectId: "o1" }], [null, {}])).toEqual({});
  });
});
