import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

// Сервер входа кладёт в токен не роль, а то, что этой роли РАЗРЕШЕНО ПИСАТЬ по матрице
// «Права ролей». Правила базы смотрят на эти флаги, поэтому настройка в админке и правила
// не могут разойтись. Здесь проверяем именно вычисление флагов.
const { writeScopeForRole } = createRequire(import.meta.url)("../../api/login.js");

const matrix = (roles) => JSON.stringify(roles);

describe("права записи для токена", () => {
  it("админ получает всё, даже если матрицы нет", () => {
    expect(writeScopeForRole("admin", null)).toEqual({ fin: true, pay: true, cat: true, usr: true });
  });

  it("без матрицы остальным ролям — ничего", () => {
    expect(writeScopeForRole("manager", null)).toEqual({ fin: false, pay: false, cat: false, usr: false });
    expect(writeScopeForRole("user", undefined)).toEqual({ fin: false, pay: false, cat: false, usr: false });
  });

  // Главное требование: дал право в админке — оно доехало до базы.
  it("выданное в матрице право на финансы включает флаг", () => {
    const raw = matrix({ manager: { finance: "edit", payroll: "none" } });
    expect(writeScopeForRole("manager", raw)).toMatchObject({ fin: true, pay: false });
  });

  it("просмотр финансов правом на запись НЕ считается", () => {
    const raw = matrix({ manager: { finance: "view" } });
    expect(writeScopeForRole("manager", raw).fin).toBe(false);
  });

  it("зарплаты: только edit, не view", () => {
    expect(writeScopeForRole("manager", matrix({ manager: { payroll: "edit" } })).pay).toBe(true);
    expect(writeScopeForRole("manager", matrix({ manager: { payroll: "view" } })).pay).toBe(false);
  });

  it("каталог и прайс — по любому из двух админских прав", () => {
    expect(writeScopeForRole("manager", matrix({ manager: { adminCatalog: "all" } })).cat).toBe(true);
    expect(writeScopeForRole("manager", matrix({ manager: { adminPrices: "all" } })).cat).toBe(true);
    expect(writeScopeForRole("manager", matrix({ manager: { adminCatalog: "none", adminPrices: "none" } })).cat).toBe(false);
  });

  it("пользователи и матрица прав — по adminUsers или adminRoles", () => {
    expect(writeScopeForRole("manager", matrix({ manager: { adminUsers: "all" } })).usr).toBe(true);
    expect(writeScopeForRole("manager", matrix({ manager: { adminRoles: "all" } })).usr).toBe(true);
    expect(writeScopeForRole("manager", matrix({ manager: {} })).usr).toBe(false);
  });

  // Матрица приходит из базы и может прийти чем угодно. Падать нельзя, и «на всякий случай
  // разрешить» — тоже нельзя: молча выданное право хуже отказа.
  it("мусор вместо матрицы не даёт прав никому, кроме админа", () => {
    for (const junk of ["сломано", "[]", JSON.stringify([1, 2]), "{", 42]) {
      expect(writeScopeForRole("manager", junk)).toEqual({ fin: false, pay: false, cat: false, usr: false });
      expect(writeScopeForRole("admin", junk)).toEqual({ fin: true, pay: true, cat: true, usr: true });
    }
  });

  it("роли нет в матрице — прав нет", () => {
    expect(writeScopeForRole("foreman", matrix({ manager: { finance: "edit" } })).fin).toBe(false);
  });

  it("админа матрица ограничить не может", () => {
    const raw = matrix({ admin: { finance: "none", payroll: "none", adminUsers: "none" } });
    expect(writeScopeForRole("admin", raw)).toEqual({ fin: true, pay: true, cat: true, usr: true });
  });
});
