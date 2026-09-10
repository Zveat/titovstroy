import { describe, expect, it } from "vitest";
import { MAX_AGE_MS, decodeLastScreen, encodeLastScreen } from "./lastScreen.js";

const NOW = 1_700_000_000_000;
const UID = "u1";

describe("что запоминаем", () => {
  it("раздел нижнего меню", () => {
    expect(encodeLastScreen({ uid: UID, screen: "finance", now: NOW }))
      .toEqual({ uid: UID, screen: "finance", ts: NOW });
  });

  it("открытый объект вместе с его вкладкой", () => {
    expect(encodeLastScreen({ uid: UID, screen: "objects", objectId: "o7", objWsTab: "documents", now: NOW }))
      .toEqual({ uid: UID, screen: "objects", objectId: "o7", objWsTab: "documents", ts: NOW });
  });

  it("объект НЕ запоминается на чужом разделе", () => {
    // «Карточка объекта» в Финансах не значит ничего — восстанавливать было бы нечего.
    expect(encodeLastScreen({ uid: UID, screen: "finance", objectId: "o7", now: NOW }))
      .toEqual({ uid: UID, screen: "finance", ts: NOW });
  });

  it("внутренние экраны не запоминаем", () => {
    // Редактор сметы — про несохранённые правки, поднимать его сам собой опасно.
    for (const screen of ["editor", "deals", "production", "list", "", null]) {
      expect(encodeLastScreen({ uid: UID, screen, now: NOW })).toBeNull();
    }
  });

  it("без пользователя не запоминаем", () => {
    expect(encodeLastScreen({ uid: "", screen: "objects", now: NOW })).toBeNull();
  });
});

describe("что восстанавливаем", () => {
  const saved = (over = {}) => ({ uid: UID, screen: "objects", objectId: "o7", ts: NOW, ...over });

  it("свой свежий экран — восстанавливаем", () => {
    expect(decodeLastScreen(saved(), { uid: UID, now: NOW + 1000 }))
      .toEqual({ screen: "objects", objectId: "o7" });
  });

  it("строка из памяти браузера разбирается так же", () => {
    expect(decodeLastScreen(JSON.stringify(saved()), { uid: UID, now: NOW }))
      .toEqual({ screen: "objects", objectId: "o7" });
  });

  it("ЧУЖОЙ экран НЕ восстанавливаем", () => {
    // Вошёл другой человек — он не должен оказаться в объекте предыдущего.
    expect(decodeLastScreen(saved(), { uid: "u2", now: NOW })).toBeNull();
  });

  it("вчерашнее НЕ восстанавливаем", () => {
    // Через полсуток человек начинает новый день и ждёт Главную.
    expect(decodeLastScreen(saved(), { uid: UID, now: NOW + MAX_AGE_MS + 1 })).toBeNull();
    expect(decodeLastScreen(saved(), { uid: UID, now: NOW + MAX_AGE_MS - 1 })).not.toBeNull();
  });

  it("отметку из будущего НЕ восстанавливаем", () => {
    // Часы на устройстве переводят; отметка «завтра» никогда не протухнет сама.
    expect(decodeLastScreen(saved({ ts: NOW + 3600e3 }), { uid: UID, now: NOW })).toBeNull();
  });

  it("раздел, на который у роли НЕТ прав, НЕ восстанавливаем", () => {
    // Права могли забрать, пока человека не было.
    expect(decodeLastScreen(saved({ screen: "finance" }), { uid: UID, now: NOW, allowed: ["dashboard", "objects"] })).toBeNull();
    expect(decodeLastScreen(saved(), { uid: UID, now: NOW, allowed: ["dashboard", "objects"] })).not.toBeNull();
  });

  it("незнакомый раздел НЕ восстанавливаем", () => {
    // Раздел могли переименовать — старая отметка не должна открывать пустоту.
    expect(decodeLastScreen(saved({ screen: "старый_раздел" }), { uid: UID, now: NOW })).toBeNull();
  });

  it("мусор и пустота — просто ничего, без падения", () => {
    for (const raw of [null, undefined, "", "не json", "[]", "42", {}, [], { uid: UID }]) {
      expect(decodeLastScreen(raw, { uid: UID, now: NOW })).toBeNull();
    }
  });

  it("вкладка внутри объекта и раздел финансов переживают перезагрузку", () => {
    expect(decodeLastScreen(saved({ objWsTab: "documents" }), { uid: UID, now: NOW }))
      .toEqual({ screen: "objects", objectId: "o7", objWsTab: "documents" });
    expect(decodeLastScreen({ uid: UID, screen: "finance", financeTab: "ops", ts: NOW }, { uid: UID, now: NOW }))
      .toEqual({ screen: "finance", financeTab: "ops" });
  });
});
