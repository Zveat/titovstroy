import { describe, expect, it } from "vitest";
import {
  buildDateReminders, buildEventMessages, makeEventContext, renderEvent,
} from "./notifyModel.js";
import { OBJ_FIELD_META } from "../cloud/audit.js";

// Две просьбы владельца, обе про «половину новости»:
//   «причину потери нужно указать, а не просто потерян»
//   «адрес добавлять нужно» — про напоминание о старте работ.

const NOW = Date.parse("2026-09-29T05:27:00Z");       // 10:27 по Караганде

const objects = [
  { id: "o1", clientName: "Әділқасан Абай", address: "Восток 1, 3, кв. 32", status: "work" },
  { id: "o2", clientName: "", address: "Шахтеров 70-86", status: "work" },
];
const productions = [
  { objectId: "o1", prodStatus: "new", startDate: "2026-10-01", responsible: "P.Zveat" },
  { objectId: "o2", prodStatus: "new", startDate: "2026-10-01", responsible: "P.Zveat" },
];
const settings = { reminders: { start_soon: { days: [2] } } };
const plain = (t) => t.replace(/<[^>]+>/g, "");

describe("адрес в напоминании о старте", () => {
  it("рядом с клиентом стоит адрес — по имени ехать некуда", () => {
    const [wide] = buildDateReminders({ objects, productions }, { now: NOW, settings });
    expect(plain(wide.text)).toContain("Әділқасан Абай, Восток 1, 3, кв. 32 — через 2 дня");
  });

  it("у объекта без имени клиента адрес не удваивается", () => {
    const [wide] = buildDateReminders({ objects, productions }, { now: NOW, settings });
    expect(plain(wide.text)).toContain("• Шахтеров 70-86 — через 2 дня");
    expect(plain(wide.text)).not.toContain("Шахтеров 70-86, Шахтеров 70-86");
  });

  it("без адреса строка остаётся прежней, а не ломается запятой", () => {
    const [wide] = buildDateReminders(
      { objects: [{ id: "o3", clientName: "Клиент", status: "work" }],
        productions: [{ objectId: "o3", prodStatus: "new", startDate: "2026-10-01" }] },
      { now: NOW, settings },
    );
    expect(plain(wide.text)).toContain("• Клиент — через 2 дня");
  });
});

// Причина выбирается ВТОРЫМ действием: список появляется в карточке только после
// того, как объект уже стал потерянным. Поэтому её два пути — приписка к потере,
// если причина уже стоит, и отдельное событие, когда её выбрали.
const lostEntry = {
  ts: NOW, entity: "object", action: "изменил", field: "статус",
  label: "Женис", objectId: "o1", old: "Согласование сметы", new: "Потерян", by: "Сергей Штанько",
};

describe("причина потери", () => {
  it("известная причина едет в том же сообщении", () => {
    const [msg] = buildEventMessages([lostEntry], {
      sinceTs: 0, settings: {},
      context: makeEventContext({ reasonsByObject: { o1: "Дорого" } }),
    });
    expect(plain(renderEvent(msg))).toContain("причина: Дорого");
  });

  it("причины нет — сообщение само просит её отметить", () => {
    const [msg] = buildEventMessages([lostEntry], {
      sinceTs: 0, settings: {}, context: makeEventContext({ reasonsByObject: {} }),
    });
    expect(plain(renderEvent(msg))).toContain("причина не указана");
  });

  it("выбрали причину позже — приходит отдельным сообщением", () => {
    const [msg] = buildEventMessages([{
      ts: NOW, entity: "object", action: "изменил", field: "причина отказа",
      label: "Катерина", objectId: "o9", old: "Не указана", new: "Выбрали других", by: "Сергей Штанько",
    }], { sinceTs: 0, settings: {} });
    expect(msg.key).toBe("object_status");            // та же галочка, новой не заводим
    expect(plain(renderEvent(msg))).toContain("Причина потери — Катерина");
    expect(plain(renderEvent(msg))).toContain("Выбрали других");
  });

  it("причину стёрли — молчим, это не новость", () => {
    for (const value of ["", "—", "Не указана"]) {
      expect(buildEventMessages([{
        ts: NOW, entity: "object", action: "изменил", field: "причина отказа",
        label: "Катерина", objectId: "o9", old: "Дорого", new: value, by: "С",
      }], { sinceTs: 0, settings: {} })).toHaveLength(0);
    }
  });

  it("причина вообще попадает в журнал — раньше поля там не было", () => {
    expect(OBJ_FIELD_META.refuseReason).toBeTruthy();
    expect(OBJ_FIELD_META.refuseReason.label).toBe("причина отказа");
    expect(OBJ_FIELD_META.refuseReason.fmt("price")).toBe("Дорого");
    expect(OBJ_FIELD_META.refuseReason.fmt("")).toBe("Не указана");
  });
});
