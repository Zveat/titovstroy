import { describe, it, expect } from "vitest";
import {
  NOTIFY_CATALOG, NOTIFY_BY_KEY, NOTIFY_TOPIC_KEYS,
  auditMessage, buildEventMessages, renderEvent, makeEventContext,
  buildReminderMessages, buildDateReminders, buildDigestMessage,
  routeMessages, isSubscribed, groupSubscribed, userScope,
  objectAllowed, reminderOn, reminderNum, reminderDays, daysUntil,
  inQuietHours, localDayKey, daysWord, esc, tenge, pruneSent, nextCursor,
  makeLinkCode, linkUrl, findUserByCode, assertWritable, handleBotCommand,
  subsList, subsFingerprint, buildSubsChangeMessages,
} from "./notifyModel.js";

// Записи ниже — НЕ выдуманные: настоящие строки из боевого журнала, снятые
// перед тем как писать правила. Поедет формат журнала — эти тесты упадут
// раньше, чем сломается рассылка.
const SIGNED = { ts: 1784968832394, userId: "2", by: "Сергей Штанько", entity: "object",
  entityId: "o1", label: "Николай", objectId: "o1", field: "статус", action: "изменил",
  old: "Согласование сметы", new: "Договор подписан", detail: "", source: "manual" };
const OTHER_STATUS = { ...SIGNED, entityId: "o2", objectId: "o2", label: "Максат",
  old: "Новый", new: "Согласование сметы" };
const MONEY = { ts: 1784888471841, by: "P.Zveat", entity: "finance_tx", entityId: "t1",
  label: "расход · COGS · дог. №0919", objectId: "o3", field: "", action: "создал операцию",
  old: "", new: "12 000 ₸" };
const LOGIN = { ts: 1784888000000, by: "Сергей Штанько", entity: "session", entityId: "2",
  label: "вход", field: "вход", action: "вошёл в систему" };
const PHOTO = { ts: 1784888300000, by: "Сергей Штанько", entity: "stage", entityId: "s1",
  label: "Демонтаж", field: "фотоотчёт", action: "добавил фото" };
// Записи сентября — тоже настоящие, снятые с боевой перед тем как писать правила.
const LOST = { ts: 1789017234492, userId: "2", by: "Сергей Штанько", entity: "object",
  entityId: "mr1ztpllyvfo", label: "Акдана", objectId: "mr1ztpllyvfo", field: "статус",
  action: "изменил", old: "Согласование сметы", new: "Потерян", detail: "", source: "manual" };
const HANDED = { ts: 1788971105687, userId: "1", by: "P.Zveat", entity: "object", entityId: "",
  label: "Рауан", objectId: "mspz8fw2nup2", field: "факт сдачи", action: "изменил",
  old: "—", new: "30.09.2026", detail: "", source: "manual" };
const HANDED_CLEARED = { ...HANDED, old: "30.09.2026", new: "—" };
const EST_DELETED = { ts: 1788843435592, userId: "1", by: "P.Zveat", entity: "estimate",
  entityId: "mt72vat3n3bj", label: "Алина", objectId: "mt729ulyn4pk", field: "смета",
  action: "удалил смету", old: "3 523 942 ₸", new: "—", detail: "", source: "manual" };
const OBJ_DELETED = { ts: 1783625325054, by: "P.Zveat", entity: "object",
  entityId: "mrdelkc58ma8", label: "Муканова 108/1", action: "удалил объект" };
const REPORT_DELETED = { ts: 1788981013773, userId: "1", by: "P.Zveat", entity: "report",
  entityId: "mtubddeitb80", label: "avr", objectId: "", field: "запись", action: "удалил",
  old: "avr", new: "—", detail: "", source: "manual" };

describe("состав: ровно то, что просил владелец", () => {
  it("двенадцать уведомлений, не больше", () => {
    expect(NOTIFY_CATALOG).toHaveLength(12);
    expect(NOTIFY_CATALOG.map(n => n.key).sort()).toEqual([
      "contract_signed", "deleted", "digest_month", "digest_sales_month", "digest_sales_week",
      "digest_week", "handover_soon", "object_done", "object_status", "stages", "stale",
      "start_soon",
    ]);
  });

  // Владелец: «как я должен понять какое конкретно и почему придёт уведомление».
  // Поэтому у каждой строки обязаны быть оба объяснения — экран показывает их
  // прямо под названием, и пустых там быть не может.
  it("у каждого написано, КОГДА сработает и ЧТО будет в сообщении", () => {
    for (const n of NOTIFY_CATALOG) {
      expect(n.label.length).toBeGreaterThan(3);
      expect(n.when.length).toBeGreaterThan(15);
      expect(n.what.length).toBeGreaterThan(15);
      expect(NOTIFY_TOPIC_KEYS).toContain(n.topic);
    }
    expect(new Set(NOTIFY_CATALOG.map(n => n.key)).size).toBe(NOTIFY_CATALOG.length);
  });
});

describe("что из журнала становится сообщением", () => {
  it("статус сменили на «Договор подписан» — сообщение есть", () => {
    const m = auditMessage(SIGNED);
    expect(m.key).toBe("contract_signed");
    expect(m.title).toContain("Николай");
    expect(m.body).toContain("Договор подписан");
  });

  it("подписание НЕ дублируется общей сменой статуса", () => {
    // Одно действие — одно сообщение. Правило подписания стоит первым и забирает
    // запись себе; сорвись это, владелец получал бы каждое подписание дважды.
    expect(auditMessage(SIGNED).key).toBe("contract_signed");
  });

  it("остальные смены статуса приходят, и с разным значком", () => {
    // Раньше здесь стоял «молчим»: правило было одно, и «Потерян» — девять раз за
    // сентябрь, самое частое событие месяца — не доходило вообще.
    const lost = auditMessage(LOST);
    expect(lost.key).toBe("object_status");
    expect(lost.title).toBe("Клиент потерян — Акдана");
    expect(lost.icon).toBe("💔");
    expect(lost.body).toContain("Согласование сметы");

    const moved = auditMessage(OTHER_STATUS);
    expect(moved.key).toBe("object_status");
    expect(moved.title).toBe("Смета на согласовании — Максат");
    expect(moved.icon).toBe("🔁");
    // Незнакомый статус не проваливается мимо уведомления — уходит общим случаем.
    expect(auditMessage({ ...LOST, new: "Придуманный статус" }).title).toBe("Статус объекта — Акдана");

    expect(auditMessage({ ...LOST, new: "В работе" }).icon).toBe("🔨");
    expect(auditMessage({ ...LOST, new: "Приостановлен" }).title).toContain("приостановлен");
    expect(auditMessage({ ...LOST, new: "Расторгнут" }).title).toContain("расторгнут");
  });

  it("факт сдачи: поставили — шлём, стёрли — нет", () => {
    const m = auditMessage(HANDED);
    expect(m.key).toBe("object_done");
    expect(m.title).toBe("Объект сдан — Рауан");
    expect(m.body).toContain("30.09.2026");
    expect(auditMessage(HANDED_CLEARED)).toBeNull();
  });

  it("удаления: объект, смета и договор — одна подписка, но разный текст", () => {
    const est = auditMessage(EST_DELETED);
    expect(est.key).toBe("deleted");
    expect(est.title).toBe("Удалена смета — Алина");
    expect(est.body).toContain("3 523 942 ₸");        // сумма — главное в этой новости

    const obj = auditMessage(OBJ_DELETED);
    expect(obj.key).toBe("deleted");
    expect(obj.title).toBe("Удалён объект — Муканова 108/1");

    const dog = auditMessage({ ts: 1, by: "P.Zveat", entity: "contract",
      entityId: "c1", label: "№0919", action: "удалил договор" });
    expect(dog.title).toBe("Удалён договор — №0919");
  });

  it("разбор воронки пачкой — одно сообщение, а не четыре", () => {
    // Настоящий случай 9 сентября: Сергей за полторы минуты отметил четверых
    // потерянными. Четыре сообщения подряд про одно и то же — это отписка от бота.
    const batch = ["Эльвира", "Баян", "Сымбат", "Катерина"].map((label, i) => ({
      ...LOST, label, entityId: "o" + i, objectId: "o" + i, ts: LOST.ts + i * 20_000,
    }));
    const out = buildEventMessages(batch, { sinceTs: 0 });
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Клиент потерян");         // без имени: их четверо
    expect(out[0].body).toContain("переведено <b>4</b> объекта");
    for (const n of ["Эльвира", "Баян", "Сымбат", "Катерина"]) expect(out[0].body).toContain(n);
  });

  it("в пачку идут только ОДИНАКОВЫЕ исходы одного человека", () => {
    // Иначе «двое потеряны, один подписан» слиплось бы в одну строку, и хорошая
    // новость растворилась бы в плохой.
    const mixed = [
      { ...LOST, entityId: "a", objectId: "a", label: "Эльвира" },
      { ...LOST, entityId: "b", objectId: "b", label: "Баян", ts: LOST.ts + 1000 },
      { ...LOST, entityId: "c", objectId: "c", label: "Пётр", ts: LOST.ts + 2000, new: "В работе" },
    ];
    const out = buildEventMessages(mixed, { sinceTs: 0 });
    expect(out).toHaveLength(3);                          // до тройки одинаковых не добрали
  });

  it("удаления актов НЕ рассылаются", () => {
    // За сентябрь владелец удалил 156 актов подряд, разбирая старьё. Попади они
    // в рассылку — это 156 сообщений за два дня и отписка от бота.
    expect(auditMessage(REPORT_DELETED)).toBeNull();
  });

  it("деньги, входы, фото и прочее из журнала не рассылаются", () => {
    for (const e of [MONEY, LOGIN, PHOTO]) expect(auditMessage(e)).toBeNull();
    expect(auditMessage({ entity: "role", action: "изменил право", label: "manager" })).toBeNull();
    expect(auditMessage({ entity: "client", action: "изменил", field: "address", label: "Вера" })).toBeNull();
    expect(auditMessage({ entity: "object", action: "создал объект", detail: "Новый объект" })).toBeNull();
  });

  it("мусор на входе не роняет", () => {
    expect(auditMessage(null)).toBeNull();
    expect(auditMessage({})).toBeNull();
    expect(buildEventMessages(null, {})).toEqual([]);
    expect(buildEventMessages([null, 5, "x"], {})).toEqual([]);
  });

  it("берётся только то, что новее курсора, и один раз", () => {
    const out = buildEventMessages([SIGNED], { sinceTs: 0 });
    expect(out).toHaveLength(1);
    expect(buildEventMessages([SIGNED], { sinceTs: SIGNED.ts })).toHaveLength(0);
    const sent = { [out[0].id]: Date.now() };
    expect(buildEventMessages([SIGNED], { sinceTs: 0, sentIds: sent })).toHaveLength(0);
  });

  it("в сообщении есть кто и когда", () => {
    const text = renderEvent(auditMessage(SIGNED));
    expect(text).toContain("Николай");
    expect(text).toContain("Сергей Штанько");
    expect(text).toMatch(/\d\d:\d\d/);
  });
});

// Владелец просил именно так: «подписали договор новый и дата старта работ
// такая-то по плану». Без дат это половина новости — сразу возникает вопрос
// «а когда выходить».
describe("к подписанию подтягиваются плановые даты", () => {
  it("старт, сдача и ответственный", () => {
    const ctx = makeEventContext({ productions: [{ objectId: "o1",
      startDate: "2026-09-15", planEndDate: "2026-11-20", responsible: "Сергей Штанько" }] });
    const [m] = buildEventMessages([SIGNED], { sinceTs: 0, context: ctx });
    expect(m.body).toContain("15 сентября");
    expect(m.body).toContain("20 ноября");
    expect(m.body).toContain("Сергей Штанько");
  });

  it("дат нет — так и написано, а не пустая строка", () => {
    const ctx = makeEventContext({ productions: [{ objectId: "o1" }] });
    const [m] = buildEventMessages([SIGNED], { sinceTs: 0, context: ctx });
    expect(m.body).toContain("не заполнены");
  });

  it("без карточки производства ничего не ломается", () => {
    const [m] = buildEventMessages([SIGNED], { sinceTs: 0, context: makeEventContext({}) });
    expect(m.body).toContain("Договор подписан");
  });
});

describe("скоро старт и скоро сдача", () => {
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

  it("предупреждает за те дни, что заданы: 3, 2, 1 и 10, 5, 4, 2", () => {
    expect(reminderDays("start_soon", {})).toEqual([3, 2, 1]);
    expect(reminderDays("handover_soon", {})).toEqual([10, 5, 4, 2]);
    const out = buildDateReminders(data, { now });
    expect(out.find(m => !m.person && m.key === "start_soon").text).toContain("Николай");
    expect(out.find(m => !m.person && m.key === "handover_soon").text).toContain("Аида");
  });

  it("день не по списку — молчим (не «за 6 дней», если просили за 3, 2, 1)", () => {
    const off = { objects: [{ id: "z", clientName: "Через шесть" }],
      productions: [{ objectId: "z", startDate: day(6) }] };
    expect(buildDateReminders(off, { now })).toEqual([]);
  });

  it("«завтра» и «сегодня» словами, а не «через 1 день»", () => {
    const soon = { objects: [{ id: "x", clientName: "Завтра" }, { id: "y", clientName: "Сегодня" }],
      productions: [{ objectId: "x", startDate: day(1) }, { objectId: "y", startDate: day(0) }] };
    const t = buildDateReminders(soon, { now,
      settings: { reminders: { start_soon: { days: [1, 0] } } } }).find(m => !m.person).text;
    expect(t).toContain("завтра");
    expect(t).toContain("сегодня");
  });

  it("отказ и уже сданный объект не напоминают", () => {
    const all = buildDateReminders(data, { now }).map(m => m.text).join("\n");
    expect(all).not.toContain("Отказник");
    expect(all).not.toContain("Сданный");
  });

  it("каждому — свои объекты отдельным сообщением", () => {
    const mine = buildDateReminders(data, { now }).find(m => m.person === "Сергей Штанько");
    expect(mine.text).toContain("Николай");
    expect(mine.text).not.toContain("Аида");
  });

  it("дни считаются по календарю, а не по 24 часам", () => {
    const late = Date.UTC(2026, 8, 8, 18, 0, 0);      // поздний вечер
    expect(daysUntil("2026-09-09", late)).toBe(1);
    expect(daysUntil("2026-09-08", late)).toBe(0);
    expect(daysUntil("", late)).toBeNull();
    expect(daysUntil("не дата", late)).toBeNull();
  });

  it("выключенное не приходит, пустые данные не роняют", () => {
    expect(buildDateReminders(data, { now, settings: {
      reminders: { start_soon: { on: false }, handover_soon: { on: false } } } })).toEqual([]);
    expect(buildDateReminders({}, { now })).toEqual([]);
  });
});

describe("просроченные этапы и объекты без движения", () => {
  const now = Date.UTC(2026, 8, 8, 4, 0, 0);
  const analytics = {
    production: {
      overdueStageList: [
        { objectId: "o1", name: "Демонтаж · Николай", manager: "Сергей Штанько", days: 12 },
        { objectId: "o2", name: "Электрика · Аида", manager: "P.Zveat", days: 5 },
      ],
      staleObjects: [
        { id: "o3", name: "Молчит немного", manager: "Сергей Штанько", days: 15 },
        { id: "o4", name: "Молчит давно", manager: "P.Zveat", days: 70 },
      ],
    },
  };
  const common = (out, word) => out.find(m => !m.person && m.text.includes(word));

  it("общая сводка и персональные части", () => {
    const out = buildReminderMessages(analytics, { now });
    expect(out.filter(m => !m.person).length).toBe(2);
    expect(out.filter(m => m.person).length).toBeGreaterThan(0);
  });

  it("в персональной — только свои строки", () => {
    const mine = buildReminderMessages(analytics, { now })
      .find(m => m.person === "P.Zveat" && m.text.includes("этапы"));
    expect(mine.text).toContain("Электрика");
    expect(mine.text).not.toContain("Демонтаж");
  });

  it("пороги отсекают: свежую просрочку и недавнюю тишину", () => {
    const s = { reminders: { stages: { minDays: 10 }, stale: { minDays: 45 } } };
    const out = buildReminderMessages(analytics, { now, settings: s });
    expect(common(out, "Просроченные этапы").text).toContain("Демонтаж");
    expect(common(out, "Просроченные этапы").text).not.toContain("Электрика");
    expect(common(out, "без движения").text).toContain("Молчит давно");
    expect(common(out, "без движения").text).not.toContain("Молчит немного");
  });

  // Здесь была ошибка первой версии: ключ считался по дню, и «объект молчит
  // 47 дней» приходило каждое утро с новым числом — ровно то, из-за чего
  // уведомления отключают. Теперь ключ — состав списка.
  it("назавтра тот же список даёт тот же ключ — повтора не будет", () => {
    const a = buildReminderMessages(analytics, { now });
    const b = buildReminderMessages(analytics, { now: now + 24 * 3600e3 });
    expect(b.map(m => m.id)).toEqual(a.map(m => m.id));
  });

  it("счётчик дней ключ не меняет, а новый объект в списке — меняет", () => {
    const older = JSON.parse(JSON.stringify(analytics));
    older.production.staleObjects[0].days = 99;
    const key = (a) => common(buildReminderMessages(a, { now }), "без движения").id;
    expect(key(older)).toBe(key(analytics));
    const more = JSON.parse(JSON.stringify(analytics));
    more.production.staleObjects.push({ id: "o77", name: "Новый молчун", days: 15 });
    expect(key(more)).not.toBe(key(analytics));
  });

  it("выключенное не приходит, пустая аналитика не роняет", () => {
    expect(buildReminderMessages(analytics, { now, settings: {
      reminders: { stages: { on: false }, stale: { on: false } } } })).toEqual([]);
    expect(buildReminderMessages({}, { now })).toEqual([]);
  });
});

describe("сводки за неделю и за месяц", () => {
  const now = Date.UTC(2026, 8, 8, 4, 0, 0);
  const analytics = {
    sales: { newObjects: 12, estimatedCount: 8, estimatedSum: 9000000,
      signedCount: 3, signedSum: 5400000, avgCheck: 1800000,
      convToEstimate: 67, convToSigned: 38, convTotal: 25,
      lostCount: 4, lostSum: 3100000,
      lostByReason: { price: { count: 2, sum: 2000000 }, unknown: { count: 1, sum: 300000 } } },
    finance: { income: 7200000, gross: 2600000, grossMarginPct: 36,
      net: 1400000, marginPct: 19, receivablesOverdue: 4115000 },
  };

  it("в сводке всё, что просили", () => {
    const t = buildDigestMessage(analytics, { key: "digest_week", now,
      reasonLabel: (k) => ({ price: "Дорого" }[k] || k) }).text;
    for (const part of ["Итоги недели", "Зашло новых", "Посчитано смет", "Подписано договоров",
      "Средний чек", "Конверсия", "Дорого", "Причина не указана",
      "Выручка", "Валовая прибыль", "Чистая прибыль", "7 200 000 ₸"]) {
      expect(t).toContain(part);
    }
  });

  // Владелец: «эту сводку я не могу в общий чат отправлять, там валовая и
  // чистая прибыль». Сводка отдела продаж сделана ровно чтобы её было можно —
  // значит денег компании в ней быть не должно ни при каких данных.
  it("в сводке отдела продаж НЕТ выручки, прибыли и маржи", () => {
    const t = buildDigestMessage(analytics, { key: "digest_sales_week", now }).text;
    for (const forbidden of ["Выручка", "Валовая", "Чистая прибыль", "Просрочено к оплате"]) {
      expect(t).not.toContain(forbidden);
    }
    expect(t).toContain("Отдел продаж");
    expect(t).toContain("Подписано договоров");
    expect(t).toContain("Конверсия");
  });

  it("в сводке отдела продаж есть разрез по менеджерам, в руководительской — нет", () => {
    const withMgr = { ...analytics, sales: { ...analytics.sales, byManager: {
      "Сергей Штанько": { objects: 5, signed: 2, signedSum: 3000000 },
      "P.Zveat": { objects: 3, signed: 1, signedSum: 1200000 },
    } } };
    const sales = buildDigestMessage(withMgr, { key: "digest_sales_month", now }).text;
    expect(sales).toContain("По менеджерам");
    expect(sales).toContain("Сергей Штанько");
    expect(buildDigestMessage(withMgr, { key: "digest_week", now }).text).not.toContain("По менеджерам");
  });

  it("руководительская сводка деньги по-прежнему показывает", () => {
    const t = buildDigestMessage(analytics, { key: "digest_week", now }).text;
    expect(t).toContain("Чистая прибыль");
    expect(t).toContain("7 200 000 ₸");
  });

  it("месячная — та же форма, свой заголовок и ключ", () => {
    const m = buildDigestMessage(analytics, { key: "digest_month", now });
    expect(m.text).toContain("Итоги месяца");
    expect(m.key).toBe("digest_month");
  });

  // «Выручка 0 ₸ · маржа —» читается как поломка, а не как факт «денег не было».
  it("без движения денег блок про деньги не рисуется", () => {
    const m = buildDigestMessage({ sales: analytics.sales, finance: { income: 0, expense: 0 } },
      { key: "digest_week", now });
    expect(m.text).not.toContain("Выручка");
    expect(m.text).toContain("Подписано договоров");
  });

  it("пустая аналитика не роняет, неизвестный ключ — null", () => {
    expect(buildDigestMessage({}, { key: "digest_week", now }).text).toContain("—");
    expect(buildDigestMessage(analytics, { key: "неттакого", now })).toBeNull();
  });

  it("за день сводка уходит один раз", () => {
    expect(buildDigestMessage(analytics, { key: "digest_week", now }).id)
      .toBe(buildDigestMessage(analytics, { key: "digest_week", now: now + 3600e3 }).id);
  });
});

describe("кому что уходит", () => {
  const links = { 1: { chatId: "111" }, 2: { chatId: "222" } };
  const msg = (key, extra = {}) =>
    ({ id: key + "~1", key, topic: NOTIFY_BY_KEY[key].topic, text: "т", ...extra });

  it("человек получает ровно отмеченное ему", () => {
    const users = [
      { id: "1", name: "Директор", tg: { subs: { digest_week: true, contract_signed: true } } },
      { id: "2", name: "Прораб", tg: { subs: { start_soon: true, handover_soon: true } } },
    ];
    const to = (k) => routeMessages([msg(k)], { users, links, settings: {} }).map(s => s.chatId).sort();
    expect(to("digest_week")).toEqual(["111"]);
    expect(to("start_soon")).toEqual(["222"]);
    expect(to("contract_signed")).toEqual(["111"]);
    expect(to("stale")).toEqual([]);
  });

  it("общий чат подписывается отдельно от людей", () => {
    const users = [{ id: "1", name: "Директор", tg: { subs: { digest_week: true } } }];
    const settings = { groupChatId: "-100", groupSubs: { contract_signed: true, digest_week: false } };
    expect(routeMessages([msg("contract_signed")], { users, links, settings }).map(s => s.chatId))
      .toEqual(["-100"]);
    expect(routeMessages([msg("digest_week")], { users, links, settings }).map(s => s.chatId))
      .toEqual(["111"]);
  });

  it("одно уведомление можно и в чат, и лично", () => {
    const users = [{ id: "1", name: "Директор", tg: { subs: { digest_month: true } } }];
    const settings = { groupChatId: "-100", groupSubs: { digest_month: true } };
    expect(routeMessages([msg("digest_month")], { users, links, settings })
      .map(s => s.chatId).sort()).toEqual(["-100", "111"]);
  });

  it("адресное напоминание — только своему и никогда в общий чат", () => {
    const users = [{ id: "2", name: "Прораб", tg: { subs: { stages: true } } }];
    const settings = { groupChatId: "-100", groupSubs: { stages: true } };
    const personal = msg("stages", { kind: "reminder", person: "Прораб" });
    expect(routeMessages([personal], { users, links, settings }).map(s => s.chatId)).toEqual(["222"]);
  });

  it("общую сводку получает только тот, кому видна вся компания", () => {
    const users = [{ id: "2", name: "Прораб", tg: { subs: { stales: true, stale: true }, scope: "own" } }];
    const settings = { groupChatId: "-100", groupSubs: { stale: true } };
    const общая = msg("stale", { kind: "reminder", person: null });
    expect(routeMessages([общая], { users, links, settings }).map(s => s.chatId)).toEqual(["-100"]);
  });

  it("непривязанный сотрудник не получает ничего", () => {
    const users = [{ id: "9", name: "Без телеграма", tg: { subs: { digest_week: true } } }];
    expect(routeMessages([msg("digest_week")], { users, links, settings: {} })).toEqual([]);
  });

  it("одно и то же в один чат дважды не уходит", () => {
    const users = [{ id: "1", name: "Д", tg: { subs: { digest_week: true } } }];
    const m = msg("digest_week");
    expect(routeMessages([m, m], { users, links, settings: {} })).toHaveLength(1);
  });

  it("охват по умолчанию — только свои объекты", () => {
    expect(userScope({ tg: {} })).toBe("own");
    expect(userScope({ tg: { scope: "all" } })).toBe("all");
  });

  it("ничего не настроено — никому ничего", () => {
    expect(routeMessages([msg("contract_signed")], {})).toEqual([]);
    expect(isSubscribed({ tg: {} }, "digest_week")).toBe(false);
    expect(groupSubscribed({}, "digest_week")).toBe(false);
  });
});

describe("глушение по объекту", () => {
  const now = Date.UTC(2026, 8, 8, 6, 0, 0);
  const day = (n) => new Date(now + n * 86400000).toISOString().slice(0, 10);

  it("режим «только по отмеченным»: остальное молчит", () => {
    const s = { objectMode: "only", objectList: ["o1"] };
    expect(auditMessage(SIGNED, s)).not.toBeNull();
    expect(auditMessage({ ...SIGNED, objectId: "чужой" }, s)).toBeNull();
  });

  it("пустой белый список — полная тишина по объектам", () => {
    expect(auditMessage(SIGNED, { objectMode: "only", objectList: [] })).toBeNull();
  });

  it("режим «кроме отмеченных» глушит точечно", () => {
    const s = { objectMode: "except", objectList: ["o1"] };
    expect(auditMessage(SIGNED, s)).toBeNull();
    expect(auditMessage({ ...SIGNED, objectId: "другой" }, s)).not.toBeNull();
  });

  it("действует и на напоминания о датах", () => {
    const data = { objects: [{ id: "o1", clientName: "Николай" }, { id: "o2", clientName: "Аида" }],
      productions: [{ objectId: "o1", startDate: day(3) }, { objectId: "o2", startDate: day(3) }] };
    const all = buildDateReminders(data, { now, settings: { objectMode: "only", objectList: ["o2"] } })
      .map(m => m.text).join("\n");
    expect(all).toContain("Аида");
    expect(all).not.toContain("Николай");
  });

  it("по умолчанию — по всем", () => {
    expect(objectAllowed("что угодно", {})).toBe(true);
    expect(objectAllowed("", { objectMode: "only", objectList: [] })).toBe(true);
  });
});

describe("тихие часы", () => {
  const at = (h) => Date.UTC(2026, 8, 8, h - 5, 0, 0);   // местное время → UTC
  it("ночью молчим, днём говорим", () => {
    expect(inQuietHours(at(3), {})).toBe(true);
    expect(inQuietHours(at(23), {})).toBe(true);
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

// Служба рассылки работает сервисным ключом Firebase, а он ОБХОДИТ правила
// базы. Этот список — единственное, что стоит между ней и боевыми данными.
describe("защита боевых данных", () => {
  it("свои узлы писать можно", () => {
    expect(assertWritable("titovstroy-tg-links")).toBe("titovstroy-tg-links");
    expect(assertWritable("titovstroy-tg-state")).toBe("titovstroy-tg-state");
  });
  it("в боевые данные — исключение, а не тихий пропуск", () => {
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
  });
  it("имя клиента с угловой скобкой не ломает сообщение", () => {
    expect(esc('<b>x</b> & "y"')).toBe("&lt;b&gt;x&lt;/b&gt; &amp; \"y\"");
    expect(auditMessage({ ...SIGNED, label: "<script>" }).title).not.toContain("<script>");
  });
  it("суммы с разрядами", () => {
    expect(tenge(1200000)).toBe("1 200 000 ₸");
    expect(tenge(0)).toBe("0 ₸");
    expect(tenge(null)).toBe("0 ₸");
  });
  it("день считается по местному времени, а не по UTC", () => {
    expect(localDayKey(Date.UTC(2026, 8, 7, 20, 0, 0))).toBe("2026-09-08");
    expect(localDayKey(Date.UTC(2026, 8, 7, 10, 0, 0))).toBe("2026-09-07");
  });
  it("старые отметки об отправке вычищаются", () => {
    const now = Date.now();
    const out = pruneSent({ fresh: now - 1000, old: now - 30 * 24 * 3600e3 }, { now });
    expect(out.fresh).toBeDefined();
    expect(out.old).toBeUndefined();
  });
  // Курсор — единственное место, где событие может пропасть насовсем: если он
  // уехал вперёд, запись под ним больше никогда не будет прочитана. Поэтому
  // тихие часы проверяются именно здесь, а не только на «не отправили ночью».
  it("в тихие часы курсор журнала стоит на месте — ночное уходит утром", () => {
    const prev = 1000, maxTs = 9000, now = 9500;
    expect(nextCursor({ prev, maxTs, now, quiet: true })).toBe(prev);
    expect(nextCursor({ prev, maxTs, now, quiet: false })).toBe(maxTs);
  });
  it("курсор идёт по метке записи, а не по «сейчас»", () => {
    expect(nextCursor({ prev: 0, maxTs: 5000, now: 9000 })).toBe(5000);
    expect(nextCursor({ prev: 7000, maxTs: 5000, now: 9000 })).toBe(7000);  // назад не ходит
    expect(nextCursor({ prev: 0, maxTs: 99000, now: 9000 })).toBe(9000);    // и не в будущее
  });
  it("первый запуск начинается с текущего момента, а ночью — не начинается вовсе", () => {
    expect(nextCursor({ prev: 0, maxTs: 5000, now: 9000, firstRun: true })).toBe(9000);
    expect(nextCursor({ prev: 0, maxTs: 5000, now: 9000, firstRun: true, quiet: true })).toBe(0);
  });

  it("пороги и выключатели напоминаний читаются с умолчаниями", () => {
    expect(reminderOn("stages", {})).toBe(true);
    expect(reminderOn("start_soon", {})).toBe(true);
    expect(reminderNum("stale", "minDays", {})).toBe(14);
    expect(reminderNum("stale", "minDays", { reminders: { stale: { minDays: 45 } } })).toBe(45);
  });
});

// ─── КОМАНДЫ БОТА ────────────────────────────────────────────────────────────
// Эта функция — единственное место, где решается, кому принадлежит чат. Ошибка
// здесь означает, что человек получает чужие сводки с выручкой и прибылью,
// поэтому проверяется поштучно.
describe("команды бота", () => {
  const USERS = [
    { id: "1", name: "Пётр", login: "p", tg: { code: "abc123", subs: { contract_signed: true, stages: true } } },
    { id: "2", name: "Сергей", login: "s", tg: { code: "zzz999", subs: {} } },
  ];

  it("/start с верным кодом привязывает чат и перечисляет, что придёт", () => {
    const out = handleBotCommand({ text: "/start abc123", chatId: 555, from: { first_name: "Пётр" },
      users: USERS, links: {}, now: 1000 });
    expect(out.kind).toBe("start");
    expect(out.links["1"]).toEqual({ chatId: "555", tgName: "Пётр", ts: 1000 });
    expect(out.reply).toContain("Готово, Пётр");
    expect(out.reply).toContain("Буду присылать (2)");
  });

  it("/start с чужим кодом ничего не привязывает", () => {
    const out = handleBotCommand({ text: "/start нетакого", chatId: 666, users: USERS, links: {} });
    expect(out.kind).toBe("start_unknown");
    expect(out.links).toBe(null);
    expect(out.reply).toContain("Не узнал код");
  });

  it("/start из другого Telegram переносит привязку и говорит об этом в логе", () => {
    const links = { "1": { chatId: "555", tgName: "Пётр", ts: 1 } };
    const out = handleBotCommand({ text: "/start abc123", chatId: 777, users: USERS, links, now: 2000 });
    expect(out.links["1"].chatId).toBe("777");
    expect(out.log).toContain("переехала");
    expect(links["1"].chatId).toBe("555");        // исходный объект не портим
  });

  it("/stop снимает привязку именно того чата, откуда пришёл", () => {
    const links = { "1": { chatId: "555" }, "2": { chatId: "777" } };
    const out = handleBotCommand({ text: "/stop", chatId: 777, users: USERS, links });
    expect(out.links["1"]).toBeDefined();
    expect(out.links["2"]).toBeUndefined();
  });

  it("/stop без привязки всё равно отвечает, но ничего не меняет", () => {
    const out = handleBotCommand({ text: "/stop", chatId: 999, users: USERS, links: {} });
    expect(out.links).toBe(null);
    expect(out.reply).toContain("Отключено");
  });

  it("/id подсказывает номер чата целиком, вместе с минусом", () => {
    const out = handleBotCommand({ text: "/id", chatId: -1003954788183, users: USERS, links: {} });
    expect(out.reply).toContain("-1003954788183");
  });

  it("обычный текст командой не считается", () => {
    expect(handleBotCommand({ text: "привет", chatId: 5, users: USERS, links: {} })).toBe(null);
    expect(handleBotCommand({ text: "/start abc123", chatId: "", users: USERS, links: {} })).toBe(null);
  });
});

// ─── «ЧТО МНЕ ПРИХОДИТ» ──────────────────────────────────────────────────────
// Бот сам просит сходить к администратору, тот отмечает — и человеку об этом
// никто не говорит. Тут закрывается именно этот разрыв.
describe("список подписок и его изменения", () => {
  const withSubs = (subs) => ({ id: "1", name: "Пётр", login: "p", tg: { code: "abc123", subs } });

  it("пустой список честно говорит, что делать", () => {
    expect(subsList(withSubs({}))).toContain("попросите администратора");
  });

  it("/menu показывает текущий список подключённому чату", () => {
    const users = [withSubs({ contract_signed: true, stages: true })];
    const out = handleBotCommand({ text: "/menu", chatId: 555, users,
      links: { "1": { chatId: "555" } } });
    expect(out.kind).toBe("menu");
    expect(out.reply).toContain("Буду присылать (2)");
    expect(out.links).toBe(null);              // читающая команда ничего не меняет
  });

  it("/menu из чужого чата не выдаёт ничей список", () => {
    const users = [withSubs({ contract_signed: true })];
    const out = handleBotCommand({ text: "/menu", chatId: 999, users,
      links: { "1": { chatId: "555" } } });
    expect(out.kind).toBe("menu_unlinked");
    expect(out.reply).not.toContain("Буду присылать");
  });

  it("первый прогон только запоминает набор и молчит", () => {
    const users = [withSubs({ contract_signed: true })];
    const links = { "1": { chatId: "555" } };
    const out = buildSubsChangeMessages({ users, links, sent: {} });
    expect(out.messages).toHaveLength(0);
    expect(out.fingerprints["1"]).toBe("contract_signed");
  });

  it("администратор изменил набор — человеку уходит новый список", () => {
    const links = { "1": { chatId: "555" } };
    const before = buildSubsChangeMessages({ users: [withSubs({})], links, sent: {} });
    const after = buildSubsChangeMessages({
      users: [withSubs({ contract_signed: true, digest_week: true })], links,
      sent: before.fingerprints });
    expect(after.messages).toHaveLength(1);
    expect(after.messages[0].chatId).toBe("555");
    expect(after.messages[0].text).toContain("изменились");
    expect(after.messages[0].text).toContain("Буду присылать (2)");
  });

  it("набор не менялся — второй раз не пишем", () => {
    const users = [withSubs({ contract_signed: true })];
    const links = { "1": { chatId: "555" } };
    const first = buildSubsChangeMessages({ users, links, sent: {} });
    const again = buildSubsChangeMessages({ users, links, sent: first.fingerprints });
    expect(again.messages).toHaveLength(0);
  });

  it("неподключённому не пишем вообще", () => {
    const out = buildSubsChangeMessages({ users: [withSubs({ stages: true })], links: {}, sent: {} });
    expect(out.messages).toHaveLength(0);
    expect(out.fingerprints).toEqual({});
  });

  // Порядок ключей в базе не гарантирован: без сортировки перестановка
  // выглядела бы как изменение, и человек получал бы письмо на ровном месте.
  it("порядок галочек в базе изменением не считается", () => {
    const a = { id: "1", tg: { subs: { stages: true, contract_signed: true } } };
    const b = { id: "1", tg: { subs: { contract_signed: true, stages: true } } };
    expect(subsFingerprint(a)).toBe(subsFingerprint(b));
  });
});
