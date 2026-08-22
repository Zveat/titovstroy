import { describe, it, expect } from "vitest";
import {
  MAX_PHOTOS_PER_KIND, REVIEW_APPROVED, REVIEW_REJECTED, REC_PHOTO, REC_PAYMENT,
  emptyStageReports, normalizeStageReports, stageReportsKey, fitSize,
  FULL_MAX_SIDE, THUMB_MAX_SIDE,
  makePhotoRecord, validatePhoto, addPhoto, patchPhoto, reviewPhoto, removeRecord,
  listPhotos, countPhotosOfKind, countStagePhotos, clientPhotosByStage,
  countAwaitingReview, isClientVisible,
  makePaymentReport, validatePaymentReport, addPaymentReport, patchPaymentReport,
  reviewPaymentReport, canReviewPayment, paymentDeviation, isOverpaid,
  paymentRemainder, payModeMeta, isPartialPayment, paymentLines, paymentAmount,
  allocatedTotal, agreedTotal, unallocated, allocateByPlan, stagePaymentTotals,
  listPayments, listAllPayments, summarizePayments,
} from "./model.js";

const photoInput = (over = {}) => ({
  objectId: "o1", stageId: "s1", kind: "during", url: "https://x/1.jpg",
  author: "Прораб", authorId: "u1", ...over,
});
const payInput = (over = {}) => ({
  objectId: "o1", mode: "full", payee: "Бригада Ержана", amount: 250000,
  lines: [{ stageId: "s1", agreed: 150000, fact: 250000 }], author: "Прораб", authorId: "u1", ...over,
});
const approvedPhoto = (list, record) => reviewPhoto(addPhoto(list, record), record.id, REVIEW_APPROVED, { id: "u2", name: "Рук" });

describe("узел отчётов", () => {
  it("ключ строится по объекту", () => {
    expect(stageReportsKey("o1")).toBe("titovstroy-stage-reports-o1");
  });

  it("мусор из облака отбрасывается, а не роняет всё", () => {
    expect(normalizeStageReports(null)).toEqual([]);
    expect(normalizeStageReports("сломано")).toEqual([]);
    expect(normalizeStageReports([
      { id: "ok", stageId: "s1", rec: REC_PHOTO },
      { id: "без этапа", rec: REC_PHOTO },
      { stageId: "s1", rec: REC_PHOTO },
      { id: "чужой тип", stageId: "s1", rec: "нечто" },
      null, "строка",
    ]).map(r => r.id)).toEqual(["ok"]);
  });

  it("добавление не мутирует исходный список", () => {
    const before = emptyStageReports();
    const after = addPhoto(before, makePhotoRecord(photoInput()));
    expect(before).toHaveLength(0);
    expect(after).toHaveLength(1);
  });

  it("фото и отчёты о расчёте живут в одном списке и не смешиваются", () => {
    let list = addPhoto(emptyStageReports(), makePhotoRecord(photoInput()));
    list = addPaymentReport(list, makePaymentReport(payInput()));
    expect(listPhotos(list, "s1")).toHaveLength(1);
    expect(listPayments(list, "s1")).toHaveLength(1);
    expect(list.every(r => r.rec === REC_PHOTO || r.rec === REC_PAYMENT)).toBe(true);
  });
});

describe("сжатие: подбор размера", () => {
  it("большое фото ужимается по длинной стороне", () => {
    expect(fitSize(4032, 3024, FULL_MAX_SIDE)).toEqual({ width: 1600, height: 1200, scaled: true });
    expect(fitSize(3024, 4032, THUMB_MAX_SIDE)).toEqual({ width: 300, height: 400, scaled: true });
  });
  it("маленькое не растягивается", () => {
    expect(fitSize(800, 600, FULL_MAX_SIDE)).toEqual({ width: 800, height: 600, scaled: false });
  });
  it("нулевые размеры не ломают расчёт", () => {
    expect(fitSize(0, 0, FULL_MAX_SIDE)).toEqual({ width: 0, height: 0, scaled: false });
  });
});

describe("фото: обязательные поля", () => {
  it("без этапа и типа фото не создаётся", () => {
    expect(validatePhoto({ objectId: "o1" })).toEqual([
      "Фото нужно привязать к этапу",
      "Не выбран тип фото: до, в процессе или после",
    ]);
    expect(() => makePhotoRecord({ objectId: "o1" })).toThrow(/привязать к этапу/);
  });

  it("неизвестный тип фото отвергается", () => {
    expect(validatePhoto(photoInput({ kind: "сбоку" }))).toContain("Не выбран тип фото: до, в процессе или после");
  });

  it("корректный вход даёт запись с обязательными полями", () => {
    const record = makePhotoRecord(photoInput());
    expect(record.id).toMatch(/^ph_/);
    expect(record).toMatchObject({ rec: REC_PHOTO, objectId: "o1", stageId: "s1", kind: "during", review: "pending", showClient: true });
    expect(record.createdAt).toBeGreaterThan(0);
    expect(record.thumbUrl).toBe("https://x/1.jpg");
  });
});

describe("фото: лимит на тип", () => {
  it("до 30 фото одного типа можно, 31-е нельзя", () => {
    let list = emptyStageReports();
    for (let i = 0; i < MAX_PHOTOS_PER_KIND; i++) list = addPhoto(list, makePhotoRecord(photoInput()));
    expect(countPhotosOfKind(list, "s1", "during")).toBe(MAX_PHOTOS_PER_KIND);
    expect(() => addPhoto(list, makePhotoRecord(photoInput()))).toThrow(/Больше 30/);
  });

  it("лимит считается по типу, а не по этапу целиком", () => {
    let list = emptyStageReports();
    for (let i = 0; i < MAX_PHOTOS_PER_KIND; i++) list = addPhoto(list, makePhotoRecord(photoInput()));
    list = addPhoto(list, makePhotoRecord(photoInput({ kind: "after" })));
    expect(countPhotosOfKind(list, "s1", "after")).toBe(1);
    expect(countStagePhotos(list, "s1")).toBe(MAX_PHOTOS_PER_KIND + 1);
  });

  it("лимит не мешает соседнему этапу", () => {
    let list = emptyStageReports();
    for (let i = 0; i < MAX_PHOTOS_PER_KIND; i++) list = addPhoto(list, makePhotoRecord(photoInput()));
    list = addPhoto(list, makePhotoRecord(photoInput({ stageId: "s2" })));
    expect(countPhotosOfKind(list, "s2", "during")).toBe(1);
  });
});

describe("фото: что видит клиент", () => {
  const build = () => {
    const approved = makePhotoRecord(photoInput({ kind: "after", url: "https://x/after.jpg" }));
    const pending = makePhotoRecord(photoInput({ kind: "before", url: "https://x/before.jpg" }));
    const hidden = makePhotoRecord(photoInput({ kind: "during", url: "https://x/hidden.jpg", showClient: false }));
    const noUrl = makePhotoRecord(photoInput({ kind: "during", url: "" }));
    let list = approvedPhoto(emptyStageReports(), approved);
    list = addPhoto(list, pending);
    list = approvedPhoto(list, hidden);
    list = approvedPhoto(list, noUrl);
    return { list, approved, pending, hidden, noUrl };
  };

  it("нужны ОБА условия: пометка прораба и подтверждение руководителя", () => {
    const { list, approved, pending, hidden } = build();
    const client = clientPhotosByStage(list).s1;
    expect(client).toHaveLength(1);
    expect(client[0].id).toBe(approved.id);
    expect(isClientVisible(listPhotos(list, "s1").find(p => p.id === pending.id))).toBe(false);
    expect(isClientVisible(listPhotos(list, "s1").find(p => p.id === hidden.id))).toBe(false);
  });

  it("подтверждённое, но недогруженное фото клиенту не уходит", () => {
    const { list, noUrl } = build();
    expect(clientPhotosByStage(list).s1.some(p => p.id === noUrl.id)).toBe(false);
  });

  it("внутренние поля наружу не попадают", () => {
    const { list } = build();
    const photo = clientPhotosByStage(list).s1[0];
    expect(Object.keys(photo).sort()).toEqual(["id", "kind", "note", "thumbUrl", "ts", "url"]);
    expect(photo.author).toBeUndefined();
    expect(photo.reviewedBy).toBeUndefined();
    expect(photo.showClient).toBeUndefined();
  });

  it("отчёты о расчёте в клиентский снимок не попадают никогда", () => {
    let list = approvedPhoto(emptyStageReports(), makePhotoRecord(photoInput()));
    list = addPaymentReport(list, makePaymentReport(payInput()));
    const client = clientPhotosByStage(list);
    expect(client.s1).toHaveLength(1);
    expect(JSON.stringify(client)).not.toContain("Бригада");
    expect(JSON.stringify(client)).not.toContain("150000");
  });

  it("отклонённое руководителем фото пропадает у клиента", () => {
    const record = makePhotoRecord(photoInput());
    let list = approvedPhoto(emptyStageReports(), record);
    expect(clientPhotosByStage(list).s1).toHaveLength(1);
    list = reviewPhoto(list, record.id, REVIEW_REJECTED, { id: "u2" });
    expect(clientPhotosByStage(list).s1).toBeUndefined();
  });

  it("порядок для клиента: до → в процессе → после", () => {
    let list = emptyStageReports();
    for (const kind of ["after", "before", "during"]) {
      list = approvedPhoto(list, makePhotoRecord(photoInput({ kind, url: `https://x/${kind}.jpg` })));
    }
    expect(clientPhotosByStage(list).s1.map(p => p.kind)).toEqual(["before", "during", "after"]);
  });

  it("считает фото, ждущие решения руководителя", () => {
    let list = addPhoto(emptyStageReports(), makePhotoRecord(photoInput()));
    list = addPhoto(list, makePhotoRecord(photoInput({ kind: "after" })));
    list = addPhoto(list, makePhotoRecord(photoInput({ kind: "before", showClient: false })));
    expect(countAwaitingReview(list)).toBe(2);
  });

  it("удаление и правка фото идут по id", () => {
    const record = makePhotoRecord(photoInput());
    let list = addPhoto(emptyStageReports(), record);
    list = patchPhoto(list, record.id, { note: "каркас и минвата" });
    expect(listPhotos(list, "s1")[0].note).toBe("каркас и минвата");
    list = removeRecord(list, record.id);
    expect(listPhotos(list, "s1")).toHaveLength(0);
  });
});

describe("выплата: распределение по работам", () => {
  const pay = (over = {}) => ({
    objectId: "o1", mode: "full", payee: "Бригада Ержана", amount: 300000,
    lines: [{ stageId: "s1", agreed: 96800, fact: 100000 }, { stageId: "s2", agreed: 140000, fact: 150000 }],
    author: "Прораб", authorId: "u1", ...over,
  });

  it("один чек закрывает несколько работ", () => {
    const report = makePaymentReport(pay({ lines: [
      { stageId: "s1", agreed: 96800, fact: 100000 },
      { stageId: "s2", agreed: 140000, fact: 150000 },
      { stageId: "s3", agreed: 60000, fact: 50000 },
    ] }));
    expect(paymentLines(report)).toHaveLength(3);
    expect(allocatedTotal(report)).toBe(300000);
    expect(agreedTotal(report)).toBe(296800);
    expect(paymentDeviation(report)).toBe(3200);
    expect(unallocated(report)).toBe(0);
  });

  it("нераспределённый остаток виден, но сохранять не мешает", () => {
    const report = makePaymentReport(pay({ amount: 300000, lines: [{ stageId: "s1", agreed: 96800, fact: 100000 }] }));
    expect(unallocated(report)).toBe(200000);
    expect(validatePaymentReport(pay({ amount: 300000, lines: [{ stageId: "s1", agreed: 1, fact: 100000 }] }))).toEqual([]);
  });

  it("разложить БОЛЬШЕ, чем в чеке, нельзя", () => {
    // Разделитель тысяч в русской локали — неразрывный пробел, поэтому
    // сверяем по смыслу, а не по точной строке.
    expect(validatePaymentReport(pay({ amount: 100000 })))
      .toEqual([expect.stringMatching(/^По работам разложено на 150\s?000 ₸ больше, чем в выплате$/)]);
  });

  it("без работ и без суммы отчёт не создаётся", () => {
    expect(validatePaymentReport({ objectId: "o1", mode: "full", payee: "х", amount: 100 }))
      .toContain("Выберите хотя бы одну работу");
    expect(validatePaymentReport(pay({ amount: 0 }))).toContain("Сумма выплаты должна быть больше нуля");
  });

  it("суммы по работе собираются из всех выплат", () => {
    let list = addPaymentReport(emptyStageReports(), makePaymentReport(pay()));
    list = addPaymentReport(list, makePaymentReport(pay({ amount: 40000, lines: [{ stageId: "s1", agreed: 0, fact: 40000 }] })));
    expect(stagePaymentTotals(list, "s1")).toEqual({ fact: 140000, agreed: 96800, count: 2, over: 43200 });
    expect(listPayments(list, "s2")).toHaveLength(1);
    expect(listAllPayments(list)).toHaveLength(2);
  });

  it("раскладка по смете делит пропорционально и сходится до копейки", () => {
    const rows = allocateByPlan([{ id: "a", costPlan: 100 }, { id: "b", costPlan: 200 }], 301);
    expect(rows.reduce((sum, r) => sum + r.fact, 0)).toBe(301);
    expect(rows).toEqual([{ stageId: "a", agreed: 100, fact: 100 }, { stageId: "b", agreed: 200, fact: 201 }]);
  });

  it("если смета пустая — делим поровну, и итог всё равно сходится", () => {
    const rows = allocateByPlan([{ id: "a" }, { id: "b" }, { id: "c" }], 100);
    expect(rows.reduce((sum, r) => sum + r.fact, 0)).toBe(100);
  });

  it("остаток к доплате считается по авансу, но не по полной оплате", () => {
    const advance = makePaymentReport(pay({ mode: "advance", amount: 50000, lines: [{ stageId: "s1", agreed: 150000, fact: 50000 }] }));
    expect(paymentRemainder(advance)).toBe(100000);
    const full = makePaymentReport(pay({ mode: "full", amount: 50000, lines: [{ stageId: "s1", agreed: 150000, fact: 50000 }] }));
    expect(paymentRemainder(full)).toBe(0);
    expect(paymentDeviation(full)).toBe(-100000);
  });

  it("переплата остаётся переплатой при любом виде оплаты", () => {
    const report = makePaymentReport(pay({ mode: "advance", amount: 200000, lines: [{ stageId: "s1", agreed: 150000, fact: 200000 }] }));
    expect(isOverpaid(report)).toBe(true);
    expect(paymentRemainder(report)).toBe(0);
  });

  it("записи в старом формате (одна работа) читаются и не пропадают", () => {
    const legacy = [{ rec: "payment", id: "old", objectId: "o1", stageId: "s9", agreed: 80000, fact: 95000, mode: "paid", status: "pending" }];
    expect(normalizeStageReports(legacy)).toHaveLength(1);
    expect(paymentLines(legacy[0])).toEqual([{ stageId: "s9", agreed: 80000, fact: 95000 }]);
    expect(paymentAmount(legacy[0])).toBe(95000);
    expect(payModeMeta("paid").label).toBe("Полная оплата");
    expect(isPartialPayment({ mode: "due" })).toBe(true);
    expect(stagePaymentTotals(legacy, "s9").fact).toBe(95000);
  });

  it("сводка по объекту: сколько выплачено, сколько на проверке и переплат", () => {
    let list = addPaymentReport(emptyStageReports(), makePaymentReport(pay()));
    list = addPaymentReport(list, makePaymentReport(pay({ amount: 100000, lines: [{ stageId: "s3", agreed: 120000, fact: 90000 }] })));
    // 300 000 − 250 000 разложенных и 100 000 − 90 000: суммарно 60 000 висит нераспределённым.
    expect(summarizePayments(list)).toEqual({ total: 2, pending: 2, overpaid: 1, deviation: 13200, paid: 400000, loose: 60000 });
  });
});

describe("расчёт с рабочими: проверка руководителем", () => {
  const pay = (over = {}) => ({
    objectId: "o1", mode: "full", payee: "Бригада Ержана", amount: 250000,
    lines: [{ stageId: "s1", agreed: 150000, fact: 250000 }], author: "Прораб", authorId: "u1", ...over,
  });

  it("свой отчёт подтвердить нельзя даже с правами", () => {
    const report = makePaymentReport(pay());
    expect(canReviewPayment(report, { id: "u1" }, { canReview: true })).toBe(false);
    expect(canReviewPayment(report, { id: "u2" }, { canReview: true })).toBe(true);
  });

  it("без права проверки нельзя никому", () => {
    const report = makePaymentReport(pay());
    expect(canReviewPayment(report, { id: "u2" }, { canReview: false })).toBe(false);
    expect(canReviewPayment(report, { id: "u2" }, {})).toBe(false);
  });

  it("вердикт пишется вместе с автором и комментарием", () => {
    const report = makePaymentReport(pay());
    let list = reviewPaymentReport(addPaymentReport(emptyStageReports(), report), report.id, "clarify", { id: "u2", name: "Титов" }, "откуда 250?");
    const saved = listAllPayments(list)[0];
    expect(saved).toMatchObject({ status: "clarify", reviewNote: "откуда 250?", reviewedBy: "Титов", reviewedById: "u2" });
    expect(saved.reviewedAt).toBeGreaterThan(0);
  });

  it("несуществующий вердикт отвергается", () => {
    const list = addPaymentReport(emptyStageReports(), makePaymentReport(pay()));
    expect(() => reviewPaymentReport(list, "нет", "одобрямс", {})).toThrow(/Неизвестное решение/);
  });

  it("правка отчёта не теряет id и не подменяет тип записи", () => {
    const report = makePaymentReport(pay());
    let list = patchPaymentReport(addPaymentReport(emptyStageReports(), report), report.id, { id: "подмена", rec: REC_PHOTO, note: "доплата" });
    const saved = listAllPayments(list)[0];
    expect(saved.id).toBe(report.id);
    expect(saved.rec).toBe(REC_PAYMENT);
    expect(saved.note).toBe("доплата");
  });

  it("правкой отчёта нельзя тронуть фото с тем же вызовом", () => {
    const photo = makePhotoRecord(photoInput());
    const list = patchPaymentReport(addPhoto(emptyStageReports(), photo), photo.id, { payee: "подмена" });
    expect(listPhotos(list, "s1")[0].payee).toBeUndefined();
  });
});
