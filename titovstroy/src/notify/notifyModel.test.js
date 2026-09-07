import { describe, it, expect } from "vitest";
import {
  NOTIFY_TOPIC_KEYS, auditMessage, buildEventMessages, groupMessages, renderEvent,
  buildReminderMessages, routeMessages, inQuietHours, localDayKey, daysWord, esc,
  makeLinkCode, linkUrl, findUserByCode, assertWritable, pruneSent, tenge, userScope,
  NOTIFY_EVENTS, eventEnabled, objectAllowed, reminderOn, reminderNum, OBJECT_MODES,
  NOTIFY_CATALOG, NOTIFY_BY_KEY, buildDateReminders, buildDigestMessage, daysUntil,
  makeEventContext, isSubscribed, groupSubscribed, DATE_REMINDERS, DIGESTS,
} from "./notifyModel.js";

// Записи ниже — НЕ выдуманные: это настоящие строки из боевого журнала, снятые
// перед тем как писать правила. Если формат журнала когда-нибудь поедет, эти
// тесты упадут раньше, чем сломается рассылка.
const REAL = {
  status: { ts: 1784968832394, userId: "1", by: "P.Zveat", entity: "object", entityId: "mryt8t21fln1",
    label: "Максат", objectId: "mryt8t21fln1", field: "статус", action: "изменил",
    old: "Новый", new: "Согласование сметы", detail: "", source: "manual" },
  money: { ts: 1784888471841, userId: "1", by: "P.Zveat", entity: "finance_tx", entityId: "mrysif4xildx",
    label: "расход · Прямые расходы (COGS / себестоимость) · дог. №0919#148", objectId: "mqyqnj2p24if",
    field: "", action: "создал операцию", old: "", new: "12 000 ₸", detail: "", source: "manual" },
  login: { ts: 1784888000000, by: "Сергей Штанько", entity: "session", entityId: "2",
    label: "вход", field: "вход", action: "вошёл в систему", old: "", new: "" },
  badLogin: { ts: 1784888100000, by: "?", entity: "session", entityId: "?",
    label: "Test1", field: "вход", action: "неудачная попытка входа", old: "", new: "" },
  reportDel: { ts: 1784888200000, by: "P.Zveat", entity: "report", entityId: "r1",
    label: "АВР №3", field: "запись", action: "удалил", old: "", new: "" },
  photo: { ts: 1784888300000, by: "Сергей Штанько", entity: "stage", entityId: "s1",
    label: "Демонтаж", field: "фотоотчёт", action: "добавил фото", old: "", new: "" },
};
const rolePerm = (i) => ({ ts: 1784880000000 + i * 40, by: "P.Zveat", entity: "role",
  entityId: "manager", label: "manager", field: `право${i}`, action: "изменил право",
  old: "нет", new: "всё" });

describe("что становится сообщением, а что нет", () => {
  it("смена статуса объекта — сделки", () => {
    const m = auditMessage(REAL.status);
    expect(m.topic).toBe("sales");
    expect(m.title).toContain("Максат");
    expect(m.body).toContain("Новый");
    expect(m.body).toContain("Согласование сметы");
  });

  it("операция по деньгам — финансы, с суммой", () => {
    const m = auditMessage(REAL.money);
    expect(m.topic).toBe("finance");
    expect(m.body).toContain("12 000 ₸");
  });

  it("обычный вход в систему не шлётся — это 39 записей из 142", () => {
    expect(auditMessage(REAL.login)).toBeNull();
  });

  it("а неудачная попытка входа шлётся — это безопасность", () => {
    const m = auditMessage(REAL.badLogin);
    expect(m.topic).toBe("security");
    expect(m.title).toContain("Неудачная попытка");
  });

  it("удаление акта шлётся — производство", () => {
    expect(auditMessage(REAL.reportDel).topic).toBe("production");
  });

  it("фотоотчёты и чек-листы не шлются — их десятки за смену", () => {
    expect(auditMessage(REAL.photo)).toBeNull();
  });

  // Тоже с боевого: в журнале есть записи с пустым label. Без запаски в чат
  // уходило «➕ Новый объект» вообще без объекта и «Учётная запись «»».
  it("запись без названия не превращается в пустое сообщение", () => {
    const m = auditMessage({ ts: 1, by: "P.Zveat", entity: "object", entityId: "abc123",
      label: "", action: "создал объект" });
    expect(m.body).toContain("abc123");
    const u = auditMessage({ ts: 1, by: "P.Zveat", entity: "user", entityId: "",
      label: "", action: "создал пользователя" });
    expect(u.title).toContain("без названия");
    expect(u.title).not.toMatch(/«»/);
  });

  it("незнакомая сущность молча пропускается, а не падает", () => {
    expect(auditMessage({ entity: "чтототакое", action: "сделал" })).toBeNull();
    expect(auditMessage(null)).toBeNull();
    expect(auditMessage({})).toBeNull();
  });

  it("каждое правило ведёт в существующее направление", () => {
    for (const e of Object.values(REAL)) {
      const m = auditMessage(e);
      if (m) expect(NOTIFY_TOPIC_KEYS).toContain(m.topic);
    }
  });
});

describe("пачки сворачиваются в одно сообщение", () => {
  it("30 правок прав роли — одно сообщение, а не тридцать", () => {
    const msgs = Array.from({ length: 30 }, (_, i) => auditMessage(rolePerm(i)));
    const grouped = groupMessages(msgs);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].grouped).toBe(30);
    expect(grouped[0].body).toContain("30");
    expect(grouped[0].body).toContain("изменено");
  });

  // Ловили на боевом журнале: 15 удалённых актов подписывались «изменено 15
  // пунктов». Сообщение о пропаже данных не имеет права врать о том, что было.
  it("пачка удалений называется удалением, а не изменением", () => {
    const msgs = Array.from({ length: 15 }, (_, i) => auditMessage({
      ts: 1784888200000 + i * 30, by: "P.Zveat", entity: "report", entityId: "r" + i,
      label: "avr", field: "запись", action: "удалил", old: "", new: "" }));
    const [g] = groupMessages(msgs);
    expect(g.body).toContain("удалено");
    expect(g.body).toContain("15");
    expect(g.body).not.toContain("изменено");
  });

  it("одинаковые названия в пачке не повторяются пятнадцать раз", () => {
    const msgs = Array.from({ length: 15 }, (_, i) => auditMessage({
      ts: 1784888200000 + i * 30, by: "P.Zveat", entity: "report", entityId: "r" + i,
      label: "avr", field: "запись", action: "удалил" }));
    const [g] = groupMessages(msgs);
    expect((g.body.match(/avr/g) || []).length).toBe(1);
  });

  it("две правки не сворачиваются — незачем", () => {
    const msgs = [rolePerm(0), rolePerm(1)].map(auditMessage);
    expect(groupMessages(msgs)).toHaveLength(2);
  });

  it("разнесённые по времени правки не склеиваются", () => {
    const msgs = [
      auditMessage(rolePerm(0)),
      auditMessage({ ...rolePerm(1), ts: 1784880000000 + 3600e3 }),
      auditMessage({ ...rolePerm(2), ts: 1784880000000 + 7200e3 }),
    ];
    expect(groupMessages(msgs)).toHaveLength(3);
  });
});

describe("отбор новых записей", () => {
  const entries = [REAL.status, REAL.money, REAL.login, REAL.photo];

  it("берёт только то, что новее курсора", () => {
    const out = buildEventMessages(entries, { sinceTs: 1784888471841 });
    expect(out).toHaveLength(1);
    expect(out[0].title).toContain("Максат");
  });

  it("уже отправленное второй раз не уходит", () => {
    const first = buildEventMessages(entries, { sinceTs: 0 });
    const sent = Object.fromEntries(first.map(m => [m.id, Date.now()]));
    expect(buildEventMessages(entries, { sinceTs: 0, sentIds: sent })).toHaveLength(0);
  });

  it("пустой и битый журнал не роняют", () => {
    expect(buildEventMessages([], {})).toEqual([]);
    expect(buildEventMessages(null, {})).toEqual([]);
    expect(buildEventMessages([null, 5, "x"], {})).toEqual([]);
  });
});

describe("напоминания считаются из тех же чисел, что на Главной", () => {
  const analytics = {
    production: {
      overdueStageList: [
        { objectId: "o1", name: "Демонтаж · Николай", manager: "Сергей Штанько", days: 12, value: 100 },
        { objectId: "o2", name: "Электрика · Аида", manager: "P.Zveat", days: 5, value: 200 },
      ],
      staleObjects: [{ id: "o3", name: "Максат", manager: "Сергей Штанько", days: 21 }],
    },
    backlog: { closingThisMonthCount: 2, closingThisMonthSum: 5610989 },
    finance: { receivableList: [
      { id: "o1", name: "Николай", manager: "Сергей Штанько", value: 1200000, overdue: true },
      { id: "o9", name: "Не просрочен", manager: "P.Zveat", value: 50, overdue: false },
    ] },
  };
  const now = Date.UTC(2026, 8, 8, 4, 0, 0);

  it("общая сводка и персональные части", () => {
    const out = buildReminderMessages(analytics, { now });
    const common = out.filter(m => !m.person);
    const personal = out.filter(m => m.person);
    expect(common.length).toBeGreaterThan(0);
    expect(personal.length).toBeGreaterThan(0);
    expect(personal.every(m => m.kind === "reminder")).toBe(true);
  });

  it("в персональной сводке только свои строки", () => {
    const out = buildReminderMessages(analytics, { now });
    const mine = out.find(m => m.person === "P.Zveat" && m.text.includes("этапы"));
    expect(mine.text).toContain("Электрика");
    expect(mine.text).not.toContain("Демонтаж");
  });

  it("непросроченная дебиторка в напоминание не попадает", () => {
    const out = buildReminderMessages(analytics, { now });
    const debt = out.find(m => !m.person && m.topic === "finance");
    expect(debt.text).toContain("Николай");
    expect(debt.text).not.toContain("Не просрочен");
  });

  // Здесь была ошибка первой версии: ключ считался по дню, и «объект молчит
  // 47 дней» приходило каждое утро с новым числом. Теперь ключ — состав списка.
  it("на следующий день тот же список даёт ТОТ ЖЕ ключ — повтора не будет", () => {
    const a = buildReminderMessages(analytics, { now });
    const tomorrow = buildReminderMessages(analytics, { now: now + 24 * 3600e3 });
    expect(tomorrow.map(m => m.id)).toEqual(a.map(m => m.id));
  });

  it("счётчик дней ключ не меняет — меняет только состав", () => {
    const older = JSON.parse(JSON.stringify(analytics));
    older.production.staleObjects[0].days = 99;          // «молчит дольше»
    const a = buildReminderMessages(analytics, { now });
    const b = buildReminderMessages(older, { now });
    const stale = (list) => list.find(m => !m.person && m.text.includes("без движения")).id;
    expect(stale(b)).toBe(stale(a));
  });

  it("новый объект в списке — новый ключ, сводка уйдёт сразу", () => {
    const more = JSON.parse(JSON.stringify(analytics));
    more.production.staleObjects.push({ id: "o77", name: "Новый молчун", manager: "", days: 15 });
    const stale = (list) => list.find(m => !m.person && m.text.includes("без движения")).id;
    expect(stale(buildReminderMessages(more, { now })))
      .not.toBe(stale(buildReminderMessages(analytics, { now })));
  });

  it("пустая аналитика — ни одного напоминания, а не пустые сводки", () => {
    expect(buildReminderMessages({}, { now })).toEqual([]);
    expect(buildReminderMessages({ production: {}, finance: {} }, { now })).toEqual([]);
  });
});

describe("маршрутизация", () => {
  const users = [
    { id: "1", name: "P.Zveat", tg: { topics: ["sales", "finance", "security"], scope: "all" } },
    { id: "2", name: "Сергей Штанько", tg: { topics: ["production", "sales"], scope: "own" } },
    { id: "3", name: "Без телеграма", tg: { topics: ["sales"] } },
  ];
  const links = { 1: { chatId: "111" }, 2: { chatId: "222" } };
  const settings = { groupChatId: "-100999", groupTopics: ["sales", "production"] };

  it("событие уходит подписчикам направления и в общий чат", () => {
    const msg = auditMessage(REAL.status);
    const sent = routeMessages([msg], { users, links, settings });
    expect(sent.map(s => s.chatId).sort()).toEqual(["-100999", "111", "222"]);
  });

  it("финансы в общий чат не идут — их нет в списке направлений чата", () => {
    const sent = routeMessages([auditMessage(REAL.money)], { users, links, settings });
    expect(sent.map(s => s.chatId)).toEqual(["111"]);
  });

  it("непривязанный сотрудник ничего не получает", () => {
    const sent = routeMessages([auditMessage(REAL.status)], { users, links, settings });
    expect(sent.some(s => s.chatId === "333")).toBe(false);
  });

  it("адресное напоминание уходит только своему и не в общий чат", () => {
    const msg = { id: "r1", key: "stale", topic: "production", kind: "reminder", person: "Сергей Штанько", text: "твоё" };
    const sent = routeMessages([msg], { users, links, settings });
    expect(sent).toHaveLength(1);
    expect(sent[0].chatId).toBe("222");
  });

  it("общую сводку получает только тот, кому видна вся компания", () => {
    const msg = { id: "r2", key: "stale", topic: "production", kind: "reminder", person: null, text: "всё" };
    const sent = routeMessages([msg], { users, links, settings });
    // Сергей — scope "own", ему общая сводка не нужна: он получил свою часть
    expect(sent.map(s => s.chatId).sort()).toEqual(["-100999"]);
  });

  it("одно и то же сообщение в один чат дважды не уходит", () => {
    const msg = auditMessage(REAL.status);
    expect(routeMessages([msg, msg], { users, links, settings })
      .filter(s => s.chatId === "111")).toHaveLength(1);
  });

  it("без настроек и без людей просто ничего не отправляется", () => {
    expect(routeMessages([auditMessage(REAL.status)], {})).toEqual([]);
  });

  it("scope по умолчанию — только свои объекты", () => {
    expect(userScope({ tg: {} })).toBe("own");
    expect(userScope({ tg: { scope: "all" } })).toBe("all");
  });
});

describe("выключатели по каждому правилу", () => {
  it("выключенное правило не даёт сообщения", () => {
    expect(auditMessage(REAL.status, { events: { object_status: false } })).toBeNull();
    expect(auditMessage(REAL.status, { events: { object_status: true } })).not.toBeNull();
  });

  it("выключение одного правила не глушит остальные", () => {
    const s = { events: { object_status: false } };
    expect(auditMessage(REAL.money, s)).not.toBeNull();
    expect(auditMessage(REAL.badLogin, s)).not.toBeNull();
  });

  it("без настроек работают умолчания: шумные правила выключены", () => {
    expect(eventEnabled("object_status", {})).toBe(true);
    expect(eventEnabled("money", {})).toBe(true);
    expect(eventEnabled("client", {})).toBe(false);
    expect(eventEnabled("stage", {})).toBe(false);
    expect(eventEnabled("price", {})).toBe(false);
  });

  it("явное включение сильнее умолчания и наоборот", () => {
    expect(eventEnabled("client", { events: { client: true } })).toBe(true);
    expect(eventEnabled("money", { events: { money: false } })).toBe(false);
  });

  it("у каждого правила есть ключ, подпись и своё направление", () => {
    for (const e of NOTIFY_EVENTS) {
      expect(e.key).toBeTruthy();
      expect(e.label.length).toBeGreaterThan(3);
      expect(NOTIFY_TOPIC_KEYS).toContain(e.topic);
    }
    expect(new Set(NOTIFY_EVENTS.map(e => e.key)).size).toBe(NOTIFY_EVENTS.length);
  });
});

describe("включение и выключение по конкретному объекту", () => {
  const other = { ...REAL.status, objectId: "чужой", entityId: "чужой" };

  it("режим «только по отмеченным»: пришло по отмеченному, молчок по остальным", () => {
    const s = { objectMode: "only", objectList: ["mryt8t21fln1"] };
    expect(auditMessage(REAL.status, s)).not.toBeNull();
    expect(auditMessage(other, s)).toBeNull();
  });

  it("пустой белый список — полная тишина по объектам", () => {
    const s = { objectMode: "only", objectList: [] };
    expect(auditMessage(REAL.status, s)).toBeNull();
  });

  it("режим «кроме отмеченных» глушит точечно", () => {
    const s = { objectMode: "except", objectList: ["mryt8t21fln1"] };
    expect(auditMessage(REAL.status, s)).toBeNull();
    expect(auditMessage(other, s)).not.toBeNull();
  });

  // Иначе, отметив один объект, владелец случайно выключил бы себе всю
  // безопасность: у прав и пользователей объекта нет вообще.
  it("права, пользователи и бэкапы фильтром по объектам НЕ глушатся", () => {
    const s = { objectMode: "only", objectList: [] };
    expect(auditMessage(REAL.badLogin, s)).not.toBeNull();
    expect(auditMessage(rolePerm(0), s)).not.toBeNull();
  });

  it("режим по умолчанию — по всем", () => {
    expect(objectAllowed("что угодно", {})).toBe(true);
    expect(objectAllowed("", { objectMode: "only", objectList: [] })).toBe(true);
  });
});

describe("пороги напоминаний", () => {
  const analytics = {
    production: {
      overdueStageList: [
        { objectId: "o1", name: "Свежий", manager: "A", days: 2 },
        { objectId: "o2", name: "Давний", manager: "A", days: 30 },
      ],
      staleObjects: [
        { id: "o3", name: "Молчит немного", manager: "A", days: 15 },
        { id: "o4", name: "Молчит давно", manager: "A", days: 70 },
      ],
    },
    finance: { receivableList: [
      { id: "o5", name: "Мелочь", manager: "A", value: 5000, overdue: true },
      { id: "o6", name: "Крупный", manager: "A", value: 3000000, overdue: true },
    ] },
    backlog: {},
  };
  const now = Date.UTC(2026, 8, 8, 4, 0, 0);
  const common = (out, word) => out.find(m => !m.person && m.text.includes(word));

  it("порог по дням просрочки отсекает свежие этапы", () => {
    const out = buildReminderMessages(analytics, { now, settings: { reminders: { stages: { minDays: 10 } } } });
    const t = common(out, "Просроченные этапы").text;
    expect(t).toContain("Давний");
    expect(t).not.toContain("Свежий");
  });

  it("порог тишины поднимается — остаётся только давнее", () => {
    const out = buildReminderMessages(analytics, { now, settings: { reminders: { stale: { minDays: 45 } } } });
    const t = common(out, "без движения").text;
    expect(t).toContain("Молчит давно");
    expect(t).not.toContain("Молчит немного");
  });

  it("порог суммы отсекает копеечные долги", () => {
    const out = buildReminderMessages(analytics, { now, settings: { reminders: { debt: { minSum: 1000000 } } } });
    const t = common(out, "Просроченная оплата").text;
    expect(t).toContain("Крупный");
    expect(t).not.toContain("Мелочь");
  });

  it("выключенное напоминание не приходит вообще", () => {
    const out = buildReminderMessages(analytics, { now, settings: {
      reminders: { stages: { on: false }, stale: { on: false }, debt: { on: false } } } });
    expect(out).toEqual([]);
  });

  // Поймали на боевых данных: остальные напоминания фильтруются построчно, а
  // «сдаётся в этом месяце» — счётчик, и он проскакивал мимо глушения объектов.
  it("«сдаётся в этом месяце» тоже слушается фильтра объектов", () => {
    const withClosing = { ...analytics, backlog: { closingThisMonthCount: 2,
      closingThisMonthSum: 5610989, closingThisMonthIds: ["c1", "c2"] } };
    const none = buildReminderMessages(withClosing, { now,
      settings: { objectMode: "only", objectList: [] } });
    expect(none.some(m => m.text.includes("Сдаётся"))).toBe(false);

    const one = buildReminderMessages(withClosing, { now,
      settings: { objectMode: "only", objectList: ["c1"] } });
    const t = one.find(m => m.text.includes("Сдаётся")).text;
    expect(t).toContain("Объектов: <b>1</b>");
    // сумму пересчитать не из чего — «1 объект на 5 610 989 ₸» было бы враньём
    expect(t).not.toContain("5 610 989");
  });

  it("без фильтра сумма по сдаче остаётся на месте", () => {
    const withClosing = { ...analytics, backlog: { closingThisMonthCount: 2,
      closingThisMonthSum: 5610989, closingThisMonthIds: ["c1", "c2"] } };
    const t = buildReminderMessages(withClosing, { now }).find(m => m.text.includes("Сдаётся")).text;
    expect(t).toContain("5 610 989");
  });

  // Ровно случай владельца: объектов в базе много, а через производство ведут
  // единицы — по остальным «тишина 47 дней» это не проблема, а неначатая работа.
  it("белый список объектов: сводка только по тем, что реально ведут", () => {
    const out = buildReminderMessages(analytics, { now,
      settings: { objectMode: "only", objectList: ["o4"] } });
    const t = common(out, "без движения").text;
    expect(t).toContain("Молчит давно");
    expect(t).not.toContain("Молчит немного");
    expect(out.some(m => m.text.includes("Просроченные этапы"))).toBe(false);
  });
});

describe("напоминания о будущем: старт работ и сдача", () => {
  const now = Date.UTC(2026, 8, 8, 6, 0, 0);          // 8 сентября, 11:00 в Караганде
  const day = (n) => new Date(now + n * 86400000).toISOString().slice(0, 10);
  const data = {
    objects: [
      { id: "o1", clientName: "Николай", status: "signed" },
      { id: "o2", clientName: "Аида", status: "work" },
      { id: "o3", clientName: "Отказник", status: "refuse" },
      { id: "o4", clientName: "Сданный", status: "work" },
    ],
    productions: [
      { objectId: "o1", startDate: day(3), responsible: "Сергей Штанько" },
      { objectId: "o2", planEndDate: day(5), responsible: "P.Zveat" },
      { objectId: "o3", startDate: day(3) },
      { objectId: "o4", planEndDate: day(5), factEndDate: day(-1) },
    ],
  };

  it("предупреждает ровно за столько дней, сколько задано", () => {
    const out = buildDateReminders(data, { now });
    const start = out.find(m => !m.person && m.key === "start_soon");
    expect(start.text).toContain("Николай");
    expect(start.text).toContain("3 дня");
  });

  it("сдача — свой список дней, свой текст", () => {
    const out = buildDateReminders(data, { now });
    const end = out.find(m => !m.person && m.key === "handover_soon");
    expect(end.text).toContain("Аида");
    expect(end.text).toContain("5 дней");
  });

  it("«завтра» и «сегодня» пишутся словами, а не «через 1 день»", () => {
    const soon = { objects: [{ id: "x", clientName: "Завтра" }, { id: "y", clientName: "Сегодня" }],
      productions: [{ objectId: "x", startDate: day(1) }, { objectId: "y", startDate: day(0) }] };
    const out = buildDateReminders(soon, { now, settings: { reminders: { start_soon: { days: [1, 0] } } } });
    const t = out.find(m => !m.person).text;
    expect(t).toContain("завтра");
    expect(t).toContain("сегодня");
  });

  it("день не по списку — молчим (не «за 4 дня», если просили за 3 и 1)", () => {
    const off = { objects: [{ id: "z", clientName: "Через четыре" }],
      productions: [{ objectId: "z", startDate: day(4) }] };
    expect(buildDateReminders(off, { now })).toEqual([]);
  });

  it("отказ и уже сданный объект не напоминают", () => {
    const out = buildDateReminders(data, { now });
    const all = out.map(m => m.text).join("\n");
    expect(all).not.toContain("Отказник");
    expect(all).not.toContain("Сданный");
  });

  it("каждому — свои объекты отдельным сообщением", () => {
    const out = buildDateReminders(data, { now });
    const mine = out.find(m => m.person === "Сергей Штанько");
    expect(mine.text).toContain("Николай");
    expect(mine.text).not.toContain("Аида");
  });

  it("глушение объекта действует и здесь", () => {
    const out = buildDateReminders(data, { now, settings: { objectMode: "only", objectList: ["o2"] } });
    const all = out.map(m => m.text).join("\n");
    expect(all).toContain("Аида");
    expect(all).not.toContain("Николай");
  });

  it("выключенное напоминание не приходит", () => {
    const out = buildDateReminders(data, { now, settings: {
      reminders: { start_soon: { on: false }, handover_soon: { on: false } } } });
    expect(out).toEqual([]);
  });

  it("дни считаются по календарю, а не по 24 часам", () => {
    // поздний вечер: «завтра» обязано остаться «через 1 день», а не стать нулём
    const late = Date.UTC(2026, 8, 8, 18, 0, 0);
    expect(daysUntil("2026-09-09", late)).toBe(1);
    expect(daysUntil("2026-09-08", late)).toBe(0);
    expect(daysUntil("", late)).toBeNull();
    expect(daysUntil("не дата", late)).toBeNull();
  });

  it("пустые данные не роняют", () => {
    expect(buildDateReminders({}, { now })).toEqual([]);
    expect(buildDateReminders({ objects: [{ id: "a" }], productions: [] }, { now })).toEqual([]);
  });
});

describe("сводка руководителю", () => {
  const now = Date.UTC(2026, 8, 8, 4, 0, 0);
  const analytics = {
    sales: {
      newObjects: 12, estimatedCount: 8, estimatedSum: 9000000,
      signedCount: 3, signedSum: 5400000, avgCheck: 1800000,
      convToEstimate: 67, convToSigned: 38, convTotal: 25,
      lostCount: 4, lostSum: 3100000,
      lostByReason: { price: { count: 2, sum: 2000000 }, competitor: { count: 1, sum: 800000 },
        unknown: { count: 1, sum: 300000 } },
    },
    finance: { income: 7200000, gross: 2600000, grossMarginPct: 36,
      net: 1400000, marginPct: 19, receivablesOverdue: 4115000 },
  };

  it("в сводке есть всё, что просили: продажи, конверсия, потери, деньги", () => {
    const m = buildDigestMessage(analytics, { key: "digest_week", now,
      reasonLabel: (k) => ({ price: "Дорого", competitor: "Выбрали других" }[k] || k) });
    const t = m.text;
    expect(t).toContain("Итоги недели");
    expect(t).toContain("Зашло новых");
    expect(t).toContain("Посчитано смет");
    expect(t).toContain("Подписано договоров");
    expect(t).toContain("Конверсия");
    expect(t).toContain("Дорого");
    expect(t).toContain("Выбрали других");
    expect(t).toContain("Причина не указана");
    expect(t).toContain("Выручка");
    expect(t).toContain("Валовая прибыль");
    expect(t).toContain("Чистая прибыль");
    expect(t).toContain("7 200 000 ₸");
  });

  it("месячная сводка — та же форма, другой заголовок и свой ключ", () => {
    const m = buildDigestMessage(analytics, { key: "digest_month", now });
    expect(m.text).toContain("Итоги месяца");
    expect(m.key).toBe("digest_month");
  });

  // «Выручка 0 ₸ · маржа —» читается как поломка, а не как факт «денег не было».
  it("без движения денег блок про деньги не рисуется вовсе", () => {
    const m = buildDigestMessage({ sales: analytics.sales, finance: { income: 0, expense: 0 } },
      { key: "digest_week", now });
    expect(m.text).not.toContain("Выручка");
    expect(m.text).toContain("Подписано договоров");
  });

  it("пустая аналитика не роняет и не врёт нулями", () => {
    const m = buildDigestMessage({}, { key: "digest_week", now });
    expect(m.text).toContain("Итоги недели");
    expect(m.text).toContain("—");
  });

  it("неизвестный ключ сводки — null, а не пустое сообщение", () => {
    expect(buildDigestMessage(analytics, { key: "digest_век", now })).toBeNull();
  });

  it("за день сводка уходит один раз", () => {
    const a = buildDigestMessage(analytics, { key: "digest_week", now });
    const b = buildDigestMessage(analytics, { key: "digest_week", now: now + 3600e3 });
    expect(a.id).toBe(b.id);
  });
});

describe("подписка по каждому уведомлению отдельно", () => {
  const links = { 1: { chatId: "111" }, 2: { chatId: "222" } };
  const msg = (key, extra = {}) => ({ id: key + "~1", key, topic: NOTIFY_BY_KEY[key].topic, text: "т", ...extra });

  it("человек получает ровно те уведомления, что отмечены ему", () => {
    const users = [
      { id: "1", name: "Директор", tg: { subs: { digest_week: true, money: true } } },
      { id: "2", name: "Прораб", tg: { subs: { start_soon: true, handover_soon: true } } },
    ];
    const to = (k) => routeMessages([msg(k)], { users, links, settings: {} }).map(s => s.chatId).sort();
    expect(to("digest_week")).toEqual(["111"]);
    expect(to("start_soon")).toEqual(["222"]);
    expect(to("money")).toEqual(["111"]);
    expect(to("object_status")).toEqual([]);
  });

  it("общий чат подписывается отдельно от людей", () => {
    const users = [{ id: "1", name: "Директор", tg: { subs: { money: true } } }];
    const settings = { groupChatId: "-100", groupSubs: { object_status: true, money: false } };
    expect(routeMessages([msg("object_status")], { users, links, settings }).map(s => s.chatId))
      .toEqual(["-100"]);
    // деньги — только директору в личку, в общий чат не идут
    expect(routeMessages([msg("money")], { users, links, settings }).map(s => s.chatId))
      .toEqual(["111"]);
  });

  it("одно уведомление можно отправить и в чат, и лично", () => {
    const users = [{ id: "1", name: "Директор", tg: { subs: { digest_month: true } } }];
    const settings = { groupChatId: "-100", groupSubs: { digest_month: true } };
    expect(routeMessages([msg("digest_month")], { users, links, settings })
      .map(s => s.chatId).sort()).toEqual(["-100", "111"]);
  });

  // Первая версия настраивалась направлениями. Кто уже успел их расставить,
  // не должен остаться без уведомлений после перехода на поштучный выбор.
  it("старая настройка направлениями продолжает работать", () => {
    const users = [{ id: "1", name: "Старый", tg: { topics: ["sales"] } }];
    expect(routeMessages([msg("object_status")], { users, links, settings: {} })
      .map(s => s.chatId)).toEqual(["111"]);
    // но выключенное по умолчанию внутри направления не приходит
    expect(routeMessages([msg("client")], { users, links, settings: {} })).toEqual([]);
  });

  it("поштучная настройка сильнее старых направлений", () => {
    const users = [{ id: "1", name: "Оба", tg: { topics: ["sales"], subs: { object_status: false } } }];
    expect(routeMessages([msg("object_status")], { users, links, settings: {} })).toEqual([]);
  });

  it("в каталоге у всего есть ключ, подпись и направление, ключи не повторяются", () => {
    expect(NOTIFY_CATALOG.length).toBeGreaterThan(20);
    for (const n of NOTIFY_CATALOG) {
      expect(n.key).toBeTruthy();
      expect(n.label.length).toBeGreaterThan(3);
      expect(NOTIFY_TOPIC_KEYS).toContain(n.topic);
      expect(["event", "reminder", "dates", "digest"]).toContain(n.kind);
    }
    expect(new Set(NOTIFY_CATALOG.map(n => n.key)).size).toBe(NOTIFY_CATALOG.length);
  });
});

describe("подписание договора дополняется датами", () => {
  const signed = { ts: 1784968832394, by: "Сергей Штанько", entity: "object", entityId: "o1",
    label: "Николай", objectId: "o1", field: "статус", action: "изменил",
    old: "Согласование сметы", new: "Договор подписан" };

  it("к «договор подписан» подтягиваются старт и плановая сдача", () => {
    const ctx = makeEventContext({ productions: [{ objectId: "o1",
      startDate: "2026-09-15", planEndDate: "2026-11-20", responsible: "Сергей Штанько" }] });
    const [m] = buildEventMessages([signed], { sinceTs: 0, context: ctx });
    expect(m.body).toContain("15 сентября");
    expect(m.body).toContain("20 ноября");
    expect(m.body).toContain("Сергей Штанько");
  });

  it("дат нет — так и написано, а не пустая строка", () => {
    const ctx = makeEventContext({ productions: [{ objectId: "o1" }] });
    const [m] = buildEventMessages([signed], { sinceTs: 0, context: ctx });
    expect(m.body).toContain("не заполнены");
  });

  it("другие смены статуса датами не обрастают", () => {
    const ctx = makeEventContext({ productions: [{ objectId: "mryt8t21fln1", startDate: "2026-09-15" }] });
    const [m] = buildEventMessages([REAL.status], { sinceTs: 0, context: ctx });
    expect(m.body).not.toContain("сентября");
  });

  it("без карточки производства ничего не ломается", () => {
    const [m] = buildEventMessages([signed], { sinceTs: 0, context: makeEventContext({}) });
    expect(m.body).toContain("Договор подписан");
  });
});

describe("тихие часы", () => {
  const at = (h) => Date.UTC(2026, 8, 8, h - 5, 0, 0);   // местное время → UTC
  it("ночью молчим", () => {
    expect(inQuietHours(at(3), {})).toBe(true);
    expect(inQuietHours(at(23), {})).toBe(true);
  });
  it("днём говорим", () => {
    expect(inQuietHours(at(10), {})).toBe(false);
    expect(inQuietHours(at(21), {})).toBe(false);
  });
  it("одинаковые границы = тишина выключена", () => {
    expect(inQuietHours(at(3), { quietFrom: 0, quietTo: 0 })).toBe(false);
  });
});

describe("привязка Telegram", () => {
  it("код без похожих символов и достаточно длинный", () => {
    const code = makeLinkCode();
    expect(code).toHaveLength(12);
    expect(code).toMatch(/^[a-z2-9]+$/);
    expect(code).not.toMatch(/[lo01]/);
  });
  it("ссылка собирается и терпит @ в имени бота", () => {
    expect(linkUrl("@TitovBot", "abc")).toBe("https://t.me/TitovBot?start=abc");
    expect(linkUrl("", "abc")).toBe("");
    expect(linkUrl("bot", "")).toBe("");
  });
  it("поиск по коду не путает регистр и не находит пустое", () => {
    const users = [{ id: "7", tg: { code: "abcdef" } }, { id: "8", tg: {} }];
    expect(findUserByCode(users, "ABCDEF").id).toBe("7");
    expect(findUserByCode(users, "")).toBeNull();
    expect(findUserByCode(users, "нет")).toBeNull();
  });
});

describe("защита боевых данных", () => {
  it("свои узлы писать можно", () => {
    expect(assertWritable("titovstroy-tg-links")).toBe("titovstroy-tg-links");
    expect(assertWritable("titovstroy-tg-state")).toBe("titovstroy-tg-state");
  });
  it("в боевые данные — нельзя, и это исключение, а не тихий пропуск", () => {
    for (const key of ["titovstroy-objects", "titovstroy-finance-tx", "titovstroy-users",
                       "titovstroy-estimates", "titovstroy-contracts", "titovstroy-productions"]) {
      expect(() => assertWritable(key)).toThrow(/запрещено писать/);
    }
  });
});

describe("мелочи, на которых легко обжечься", () => {
  it("склонение дней", () => {
    expect(daysWord(1)).toBe("1 день");
    expect(daysWord(3)).toBe("3 дня");
    expect(daysWord(12)).toBe("12 дней");
    expect(daysWord(21)).toBe("21 день");
    expect(daysWord(0)).toBe("0 дней");
  });
  it("имя клиента с угловой скобкой не ломает сообщение", () => {
    expect(esc('<b>x</b> & "y"')).toBe("&lt;b&gt;x&lt;/b&gt; &amp; \"y\"");
    const m = auditMessage({ ...REAL.status, label: "<script>" });
    expect(m.title).not.toContain("<script>");
  });
  it("суммы с разрядами", () => {
    expect(tenge(1200000)).toBe("1 200 000 ₸");
    expect(tenge(0)).toBe("0 ₸");
    expect(tenge(null)).toBe("0 ₸");
  });
  it("день считается по местному времени, а не по UTC", () => {
    // 20:00 UTC — это уже следующий день в Караганде
    expect(localDayKey(Date.UTC(2026, 8, 7, 20, 0, 0))).toBe("2026-09-08");
    expect(localDayKey(Date.UTC(2026, 8, 7, 10, 0, 0))).toBe("2026-09-07");
  });
  it("старые отметки об отправке вычищаются", () => {
    const now = Date.now();
    const sent = { fresh: now - 1000, old: now - 30 * 24 * 3600e3 };
    const out = pruneSent(sent, { now });
    expect(out.fresh).toBeDefined();
    expect(out.old).toBeUndefined();
  });
  it("готовое сообщение содержит и суть, и кто, и когда", () => {
    const text = renderEvent(auditMessage(REAL.status));
    expect(text).toContain("Максат");
    expect(text).toContain("P.Zveat");
    expect(text).toMatch(/\d\d:\d\d/);
  });
});
