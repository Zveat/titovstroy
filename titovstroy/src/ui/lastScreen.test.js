import { describe, expect, it } from "vitest";
import { MAX_AGE_MS, decodeLastScreen, encodeLastScreen, touchLastScreen } from "./lastScreen.js";

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

  it("редактор сметы запоминаем по номеру сметы", () => {
    expect(encodeLastScreen({ uid: UID, screen: "editor", estimateId: "e5", now: NOW }))
      .toEqual({ uid: UID, screen: "editor", estimateId: "e5", ts: NOW });
  });

  it("редактор без номера сметы не запоминаем — открывать нечего", () => {
    expect(encodeLastScreen({ uid: UID, screen: "editor", now: NOW })).toBeNull();
  });

  it("прочие внутренние экраны не запоминаем", () => {
    for (const screen of ["deals", "production", "list", "", null]) {
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
    // Владелец: «закрыл давно, открываешь — а он на той же странице, переборщил».
    // Правка нужна, чтобы пережить ПЕРЕЗАГРУЗКУ, а это секунды. Через десять минут
    // это уже новый заход.
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

  it("редактор сметы восстанавливаем, права проверит openEstimate", () => {
    // Разрешения на редактор в списке разделов нет — и не должно быть: право на конкретную
    // смету знает только openEstimate, он её и открывает.
    expect(decodeLastScreen({ uid: UID, screen: "editor", estimateId: "e5", ts: NOW }, { uid: UID, now: NOW, allowed: [] }))
      .toEqual({ screen: "editor", estimateId: "e5" });
  });

  it("чужой и вчерашний редактор — тоже мимо", () => {
    expect(decodeLastScreen({ uid: UID, screen: "editor", estimateId: "e5", ts: NOW }, { uid: "u2", now: NOW })).toBeNull();
    expect(decodeLastScreen({ uid: UID, screen: "editor", estimateId: "e5", ts: NOW }, { uid: UID, now: NOW + MAX_AGE_MS + 1 })).toBeNull();
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

describe("отметка живёт, пока жива вкладка", () => {
  const UID2 = "u1";
  const NOW2 = 1_789_400_000_000;
  const rec = { uid: UID2, screen: "objects", objectId: "o7", ts: NOW2 };

  it("срок восстановления — десять минут, не полсуток", () => {
    expect(MAX_AGE_MS).toBe(10 * 60 * 1000);
  });

  // Без этого человек, просидевший полчаса в карточке, при обновлении улетал бы
  // на Главную — вместо старой беды получили бы новую.
  it("подновление двигает только время, экран не трогает", () => {
    const next = JSON.parse(touchLastScreen(JSON.stringify(rec), { uid: UID2, now: NOW2 + 20 * 60e3 }));
    expect(next.ts).toBe(NOW2 + 20 * 60e3);
    expect(next.screen).toBe("objects");
    expect(next.objectId).toBe("o7");
  });

  it("подновлённая отметка снова восстанавливается, старая — нет", () => {
    const later = NOW2 + 30 * 60e3;
    expect(decodeLastScreen(rec, { uid: UID2, now: later })).toBeNull();
    const touched = touchLastScreen(rec, { uid: UID2, now: later });
    expect(decodeLastScreen(touched, { uid: UID2, now: later + 60e3 })).not.toBeNull();
    expect(decodeLastScreen(touched, { uid: UID2, now: later + 11 * 60e3 })).toBeNull();
  });

  it("чужую отметку не подновляем — иначе она пережила бы смену пользователя", () => {
    expect(touchLastScreen(rec, { uid: "другой", now: NOW2 })).toBeNull();
  });

  it("мусор и пустота не роняют", () => {
    for (const bad of [null, undefined, "", "{", "[]", 5, {}]) {
      expect(touchLastScreen(bad, { uid: UID2, now: NOW2 })).toBeNull();
    }
  });
});
