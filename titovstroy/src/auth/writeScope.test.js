import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

// Сервер входа кладёт в токен не роль, а то, что этой роли РАЗРЕШЕНО ПИСАТЬ по матрице
// «Права ролей». Правила базы смотрят на эти флаги, поэтому настройка в админке и правила
// не могут разойтись. Здесь проверяем именно вычисление флагов.
const { writeScopeForRole } = createRequire(import.meta.url)("../../api/login.js");

const matrix = (roles) => JSON.stringify(roles);

describe("права записи для токена", () => {
  it("админ получает всё, даже если матрицы нет", () => {
    expect(writeScopeForRole("admin", null)).toMatchObject({ fin: true, pay: true, cat: true, usr: true, finR: true, payR: true });
  });

  it("без матрицы остальным ролям — ничего", () => {
    expect(writeScopeForRole("manager", null)).toMatchObject({ fin: false, pay: false, cat: false, usr: false, finR: false, payR: false });
    expect(writeScopeForRole("user", undefined)).toMatchObject({ fin: false, pay: false, cat: false, usr: false, finR: false, payR: false });
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
      expect(writeScopeForRole("manager", junk)).toMatchObject({ fin: false, pay: false, cat: false, usr: false, finR: false, payR: false });
      expect(writeScopeForRole("admin", junk)).toMatchObject({ fin: true, pay: true, cat: true, usr: true, finR: true, payR: true });
    }
  });

  it("роли нет в матрице — прав нет", () => {
    expect(writeScopeForRole("foreman", matrix({ manager: { finance: "edit" } })).fin).toBe(false);
  });

  it("админа матрица ограничить не может", () => {
    const raw = matrix({ admin: { finance: "none", payroll: "none", adminUsers: "none" } });
    expect(writeScopeForRole("admin", raw)).toMatchObject({ fin: true, pay: true, cat: true, usr: true, finR: true, payR: true });
  });
});

// ── ФЛАГИ ЧТЕНИЯ ──
// Проверяем главное: флаг чтения обязан совпадать с условием, по которому приложение
// РЕАЛЬНО грузит раздел. Разойдутся — роль увидит пустой раздел вместо данных.
describe("writeScopeForRole — права ЧТЕНИЯ денег и зарплат", () => {
  const matrix = JSON.stringify({
    admin:      { finance: "edit", payroll: "edit" },
    manager:    { finance: "view", payroll: "none", financialDetails: true, objectFinanceSummary: true },
    foreman:    { finance: "none", payroll: "none", financialDetails: true, objectFinanceSummary: false },
    sales_head: { finance: "none", payroll: "none", financialDetails: false, objectFinanceSummary: false },
    viewer:     { finance: "none", payroll: "none", financialDetails: false, objectFinanceSummary: false },
  });
  it("админ читает и пишет всё", () => {
    const s = writeScopeForRole("admin", matrix);
    expect(s).toMatchObject({ fin: true, pay: true, finR: true, payR: true });
  });
  it("менеджер: финансы только смотрит — писать нельзя, читать можно", () => {
    const s = writeScopeForRole("manager", matrix);
    expect(s.fin).toBe(false);
    expect(s.finR).toBe(true);
  });
  it("менеджеру с доступом к финансам открыт и ФОТ: приложение грузит его вместе с деньгами", () => {
    expect(writeScopeForRole("manager", matrix).payR).toBe(true);
  });
  it("прораб видит финансы объекта (financialDetails) — значит и узел финансов ему открыт", () => {
    const s = writeScopeForRole("foreman", matrix);
    expect(s.finR).toBe(true);
    expect(s.fin).toBe(false);
    expect(s.payR).toBe(false); // зарплаты ему не грузятся — и читать нечего
  });
  it("РОП и наблюдатель к деньгам и зарплатам не допущены вовсе", () => {
    for (const role of ["sales_head", "viewer"]) {
      const s = writeScopeForRole(role, matrix);
      expect(s).toMatchObject({ fin: false, pay: false, finR: false, payR: false });
    }
  });
  it("роли нет в матрице — отказ, а не молчаливый доступ", () => {
    const s = writeScopeForRole("нет-такой-роли", matrix);
    expect(s).toMatchObject({ fin: false, pay: false, finR: false, payR: false });
  });
  it("матрица недоступна — админ не заперт, остальным отказ", () => {
    expect(writeScopeForRole("admin", null)).toMatchObject({ finR: true, payR: true });
    expect(writeScopeForRole("foreman", null)).toMatchObject({ finR: false, payR: false });
  });
});

// НАБЛЮДАТЕЛЬ. В интерфейсе он и так строго read-only, но в токене у него staff:true,
// а правила базы пускают на запись любого сотрудника. Флаг ro — то, чем правила отличают
// «смотрящего» от «работающего»: без него человек ничего не нажал бы на экране, зато
// переписал бы данные обычным HTTP-запросом мимо сайта.
describe("наблюдатель — только чтение", () => {
  it("роль viewer получает ro:true даже без матрицы", () => {
    expect(writeScopeForRole("viewer", null).ro).toBe(true);
  });

  it("остальные роли ro не получают", () => {
    for (const role of ["admin", "manager", "sales_head", "foreman", "user"]) {
      expect(writeScopeForRole(role, null).ro).toBe(false);
    }
  });

  it("наблюдателю не выдаются права записи, даже если матрица их разрешила", () => {
    const wide = matrix({ viewer: {
      finance: "edit", payroll: "edit", adminCatalog: "all", adminPrices: "all",
      adminUsers: "all", adminRoles: "all", financialDetails: true,
    } });
    const scope = writeScopeForRole("viewer", wide);
    expect(scope).toMatchObject({ ro: true, fin: false, pay: false, cat: false, usr: false });
  });

  it("но ЧИТАТЬ деньги и зарплаты наблюдателю можно — ему это и нужно", () => {
    const wide = matrix({ viewer: { finance: "view", payroll: "view", financialDetails: true } });
    const scope = writeScopeForRole("viewer", wide);
    expect(scope.finR).toBe(true);
    expect(scope.payR).toBe(true);
    expect(scope.ro).toBe(true);
  });

  it("та же матрица у обычной роли права записи не теряет", () => {
    const wide = matrix({ manager: { finance: "edit", payroll: "edit", adminCatalog: "all" } });
    expect(writeScopeForRole("manager", wide)).toMatchObject({ ro: false, fin: true, pay: true, cat: true });
  });
});
