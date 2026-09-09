import { describe, expect, it } from "vitest";
import { PRESENCE_KEY } from "../storageKeys.js";

// storage.setPresence — намеренная дыра в замке редактора: наблюдатель замок не захватывает,
// и через обычную запись его отметка «был в сети» не проходила никогда. Дыра узкая, и держится
// она на одной проверке имени ключа. Проверяем именно её: метод не должен годиться ни для чего,
// кроме своей отметки присутствия, иначе через него можно будет писать боевые данные в обход
// замка. Само правило вынесено сюда как есть — оно короткое, а цена ошибки высокая.
const PRESENCE_ALLOWED = /^titovstroy-presence-[A-Za-z0-9_-]+$/;

describe("что пускает setPresence", () => {
  it("пускает ключ присутствия — ровно тот, который строит приложение", () => {
    expect(PRESENCE_ALLOWED.test(`${PRESENCE_KEY}-mrlmuccwzrep`)).toBe(true);
    expect(PRESENCE_ALLOWED.test(`${PRESENCE_KEY}-1`)).toBe(true);
    expect(PRESENCE_ALLOWED.test(`${PRESENCE_KEY}-a_b-c`)).toBe(true);
  });

  it("НЕ пускает боевые данные — ради этого проверка и стоит", () => {
    for (const key of [
      "titovstroy-estimates", "titovstroy-objects", "titovstroy-finance-tx",
      "titovstroy-contracts", "titovstroy-reports", "titovstroy-users",
      "titovstroy-role-permissions", "titovstroy-production",
    ]) expect(PRESENCE_ALLOWED.test(key)).toBe(false);
  });

  it("НЕ пускает похожее, но чужое", () => {
    expect(PRESENCE_ALLOWED.test("titovstroy-presence")).toBe(false);          // общий блок, не свой ключ
    expect(PRESENCE_ALLOWED.test("titovstroy-presence-")).toBe(false);         // без идентификатора
    expect(PRESENCE_ALLOWED.test("titovstroy-presences-1")).toBe(false);
    expect(PRESENCE_ALLOWED.test("xtitovstroy-presence-1")).toBe(false);
    expect(PRESENCE_ALLOWED.test("titovstroy-presence-1-backups")).toBe(true); // хвост из тех же символов — это всё ещё ключ присутствия
  });

  it("НЕ пускает попытку уехать в соседний узел", () => {
    // Firebase-ключи санитизируются позже, но полагаться на это здесь нельзя:
    // проверка обязана отбивать такое сама.
    expect(PRESENCE_ALLOWED.test("titovstroy-presence-1/../titovstroy-users")).toBe(false);
    expect(PRESENCE_ALLOWED.test("titovstroy-presence-1 titovstroy-users")).toBe(false);
    expect(PRESENCE_ALLOWED.test("titovstroy-presence-1.titovstroy-users")).toBe(false);
  });

  it("мусор вместо ключа отбивается, а не падает", () => {
    for (const key of ["", null, undefined, 42, {}]) expect(PRESENCE_ALLOWED.test(String(key))).toBe(false);
  });
});
