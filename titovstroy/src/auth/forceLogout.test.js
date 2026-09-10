import { describe, expect, it } from "vitest";
import { shouldForceLogout } from "./forceLogout.js";

const OPENED = 1_700_000_000_000;

describe("выход по кнопке владельца", () => {
  it("нажали ПОСЛЕ того, как человек вошёл — выходим", () => {
    expect(shouldForceLogout(String(OPENED + 1000), OPENED)).toBe(true);
  });

  it("СТАРАЯ отметка не выкидывает — иначе одно нажатие закрыло бы работу навсегда", () => {
    // Отметка остаётся в базе после нажатия. Без этой проверки человек вылетал бы сразу
    // после каждого следующего входа, и войти обратно было бы нельзя вообще.
    expect(shouldForceLogout(String(OPENED - 1000), OPENED)).toBe(false);
  });

  it("отметка ровно в момент открытия не считается новой", () => {
    expect(shouldForceLogout(String(OPENED), OPENED)).toBe(false);
  });

  it("REST отдаёт значение в кавычках — это тоже число", () => {
    expect(shouldForceLogout(`"${OPENED + 1}"`, OPENED)).toBe(true);
  });

  it("пусто и мусор — ничего не делаем, а не падаем", () => {
    for (const raw of ["", null, undefined, "не число", "{}", "0", "-5"]) {
      expect(shouldForceLogout(raw, OPENED)).toBe(false);
    }
  });

  it("без известного времени открытия любая отметка считается новой", () => {
    // Такого быть не должно, но если время открытия потерялось, безопаснее выйти,
    // чем проигнорировать прямое распоряжение владельца.
    expect(shouldForceLogout(String(OPENED), 0)).toBe(true);
  });
});
