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
  listPayments, summarizePayments,
} from "./model.js";

const photoInput = (over = {}) => ({
  objectId: "o1", stageId: "s1", kind: "during", url: "https://x/1.jpg",
  author: "Прораб", authorId: "u1", ...over,
});
const payInput = (over = {}) => ({
  objectId: "o1", stageId: "s1", mode: "paid", payee: "Бригада Ержана",
  agreed: 150000, fact: 250000, author: "Прораб", authorId: "u1", ...over,
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

describe("расчёт с рабочими: обязательные поля", () => {
  it("перечисляет всё, чего не хватает", () => {
    expect(validatePaymentReport({})).toEqual([
      "Не указан объект",
      "Отчёт нужно привязать к этапу",
      "Не выбрано: нужно оплатить или оплачено",
      "Не указано, кому платим",
      "Согласованная сумма должна быть больше нуля",
    ]);
  });

  it("без исполнителя отчёт не создаётся", () => {
    expect(() => makePaymentReport(payInput({ payee: "  " }))).toThrow(/кому платим/);
  });

  it("нулевая согласованная сумма не проходит", () => {
    expect(validatePaymentReport(payInput({ agreed: 0 }))).toContain("Согласованная сумма должна быть больше нуля");
  });

  it("отрицательный факт не проходит", () => {
    expect(validatePaymentReport(payInput({ fact: -1 }))).toContain("Фактическая сумма не может быть отрицательной");
  });

  it("суммы с пробелами и запятой читаются", () => {
    const report = makePaymentReport(payInput({ agreed: "150 000", fact: "250000,49" }));
    expect(report.agreed).toBe(150000);
    expect(report.fact).toBe(250000);
  });

  it("дата подставляется, статус всегда «на проверке»", () => {
    const report = makePaymentReport(payInput({ date: "" }));
    expect(report.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(report.status).toBe("pending");
  });
});

describe("расчёт с рабочими: отклонение", () => {
  it("считает факт минус согласовано", () => {
    expect(paymentDeviation({ agreed: 150000, fact: 250000 })).toBe(100000);
    expect(isOverpaid({ agreed: 150000, fact: 250000 })).toBe(true);
  });

  it("экономия — отрицательное отклонение и не переплата", () => {
    expect(paymentDeviation({ agreed: 150000, fact: 120000 })).toBe(-30000);
    expect(isOverpaid({ agreed: 150000, fact: 120000 })).toBe(false);
  });

  it("совпадение сумм — ноль", () => {
    expect(paymentDeviation({ agreed: 150000, fact: 150000 })).toBe(0);
    expect(isOverpaid({ agreed: 150000, fact: 150000 })).toBe(false);
  });

  it("сводка по объекту: сколько на проверке и на сколько переплата", () => {
    let list = addPaymentReport(emptyStageReports(), makePaymentReport(payInput()));
    list = addPaymentReport(list, makePaymentReport(payInput({ stageId: "s2", agreed: 100000, fact: 90000 })));
    list = addPaymentReport(list, makePaymentReport(payInput({ stageId: "s2", agreed: 50000, fact: 70000 })));
    list = addPhoto(list, makePhotoRecord(photoInput()));
    expect(summarizePayments(list)).toEqual({ total: 3, pending: 3, overpaid: 2, deviation: 120000 });
  });
});

describe("расчёт с рабочими: проверка руководителем", () => {
  it("свой отчёт подтвердить нельзя даже с правами", () => {
    const report = makePaymentReport(payInput());
    expect(canReviewPayment(report, { id: "u1" }, { canReview: true })).toBe(false);
    expect(canReviewPayment(report, { id: "u2" }, { canReview: true })).toBe(true);
  });

  it("без права проверки нельзя никому", () => {
    const report = makePaymentReport(payInput());
    expect(canReviewPayment(report, { id: "u2" }, { canReview: false })).toBe(false);
    expect(canReviewPayment(report, { id: "u2" }, {})).toBe(false);
  });

  it("вердикт пишется вместе с автором и комментарием", () => {
    const report = makePaymentReport(payInput());
    let list = addPaymentReport(emptyStageReports(), report);
    list = reviewPaymentReport(list, report.id, "clarify", { id: "u2", name: "Титов" }, "откуда 250?");
    const saved = listPayments(list, "s1")[0];
    expect(saved).toMatchObject({ status: "clarify", reviewNote: "откуда 250?", reviewedBy: "Титов", reviewedById: "u2" });
    expect(saved.reviewedAt).toBeGreaterThan(0);
  });

  it("несуществующий вердикт отвергается", () => {
    const list = addPaymentReport(emptyStageReports(), makePaymentReport(payInput()));
    expect(() => reviewPaymentReport(list, "нет", "одобрямс", {})).toThrow(/Неизвестное решение/);
  });

  it("правка отчёта не теряет id и не подменяет тип записи", () => {
    const report = makePaymentReport(payInput());
    let list = addPaymentReport(emptyStageReports(), report);
    list = patchPaymentReport(list, report.id, { id: "подмена", rec: REC_PHOTO, note: "доплата" });
    const saved = listPayments(list, "s1")[0];
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
