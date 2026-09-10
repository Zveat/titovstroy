import { describe, expect, it } from "vitest";
import { FORCE_LOGOUT_KEY } from "../storageKeys.js";

// storage.setForceLogout — вторая намеренная дыра в замке редактора (первая — отметка
// присутствия). Она нужна именно тогда, когда владелец в режиме просмотра: сотрудник забыл
// вкладку открытой, держит замок, и обычная запись у владельца не проходит. Дыра держится на
// одной проверке имени ключа, поэтому правило вынесено сюда как есть и проверяется отдельно:
// через неё нельзя записать НИЧЕГО, кроме отметки о выходе.
const ALLOWED = /^titovstroy-force-logout-[A-Za-z0-9_-]+$/;

describe("что пускает setForceLogout", () => {
  it("пускает ключ выхода — ровно тот, который строит приложение", () => {
    expect(ALLOWED.test(`${FORCE_LOGOUT_KEY}-mrlmuccwzrep`)).toBe(true);
    expect(ALLOWED.test(`${FORCE_LOGOUT_KEY}-1`)).toBe(true);
    expect(ALLOWED.test(`${FORCE_LOGOUT_KEY}-a_b-c`)).toBe(true);
  });

  it("НЕ пускает боевые данные — ради этого проверка и стоит", () => {
    for (const key of [
      "titovstroy-estimates", "titovstroy-objects", "titovstroy-finance-tx",
      "titovstroy-contracts", "titovstroy-reports", "titovstroy-users",
      "titovstroy-role-permissions", "titovstroy-production",
    ]) expect(ALLOWED.test(key)).toBe(false);
  });

  it("НЕ пускает похожее, но чужое", () => {
    expect(ALLOWED.test("titovstroy-force-logout")).toBe(false);      // общий узел, не свой ключ
    expect(ALLOWED.test("titovstroy-force-logout-")).toBe(false);     // без идентификатора
    expect(ALLOWED.test("titovstroy-force-logouts-1")).toBe(false);
    expect(ALLOWED.test("xtitovstroy-force-logout-1")).toBe(false);
    expect(ALLOWED.test("titovstroy-presence-1")).toBe(false);        // соседняя дыра — не эта
  });

  it("НЕ пускает попытку уехать в соседний узел", () => {
    // Firebase-ключи санитизируются позже, но полагаться на это здесь нельзя.
    expect(ALLOWED.test("titovstroy-force-logout-1/../titovstroy-users")).toBe(false);
    expect(ALLOWED.test("titovstroy-force-logout-1 titovstroy-users")).toBe(false);
    expect(ALLOWED.test("titovstroy-force-logout-1.titovstroy-users")).toBe(false);
  });

  it("мусор вместо ключа отбивается, а не падает", () => {
    for (const key of ["", null, undefined, 42, {}]) expect(ALLOWED.test(String(key))).toBe(false);
  });
});
