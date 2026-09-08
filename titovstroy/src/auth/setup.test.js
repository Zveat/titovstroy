// Первый запуск. Здесь решается, кто станет администратором новой установки, —
// значит проверять надо не «форма заполнена», а «слабый пароль не пройдёт».
import { describe, it, expect } from "vitest";
import { LOGIN_RE, firstAdmin, firstBrand, validateSetup } from "./setup.js";

const ok = { company: "ТОО Ромашка", adminName: "Иван Петров", login: "ivan",
  password: "Xk7-mid-93", password2: "Xk7-mid-93" };

describe("проверки первого запуска", () => {
  it("правильно заполненная форма проходит", () => {
    expect(validateSetup(ok)).toBe(null);
  });

  it("без названия компании не пускаем — иначе в шапке и в КП будет чужое имя", () => {
    expect(validateSetup({ ...ok, company: "   " })).toContain("название компании");
  });

  it("без имени администратора не пускаем", () => {
    expect(validateSetup({ ...ok, adminName: "" })).toContain("администратора");
  });

  // Ровно та дыра, ради которой всё это делалось: установка не должна
  // заканчиваться учёткой с паролем, который подберут с первой попытки.
  it("слабый пароль не проходит", () => {
    for (const password of ["123456", "admin", "qwerty", "11111", "abc"]) {
      expect(validateSetup({ ...ok, password, password2: password }), password).toBeTruthy();
    }
  });

  it("несовпадение паролей ловится", () => {
    expect(validateSetup({ ...ok, password2: "другой-пароль-9" })).toContain("не совпадают");
  });

  // Логин диктуют по телефону и вводят с чужого устройства: кириллица и пробелы
  // делают вход невоспроизводимым.
  it("логин только латиницей и без пробелов", () => {
    for (const login of ["Иван", "ив ан", "a", "администратор", "иван@почта"]) {
      expect(validateSetup({ ...ok, login }), login).toBeTruthy();
    }
    for (const login of ["ivan", "ivan.petrov", "ivan_2", "IVAN-1"]) {
      expect(LOGIN_RE.test(login), login).toBe(true);
    }
  });
});

describe("что записывается при установке", () => {
  it("первый сотрудник — администратор, иначе систему некому настраивать", () => {
    const u = firstAdmin({ adminName: "Иван", login: " ivan ", passwordHash: "sha256:a:b" });
    expect(u.role).toBe("admin");
    expect(u.login).toBe("ivan");                 // пробелы по краям не попадают в логин
    expect(u.password).toBe("sha256:a:b");        // храним только хэш
  });

  it("пароль в открытом виде в запись не попадает", () => {
    const u = firstAdmin({ adminName: "И", login: "i", passwordHash: "sha256:s:h" });
    expect(JSON.stringify(u)).not.toContain("Xk7");
  });

  it("название компании уходит в оформление, пустая подпись не создаёт поле", () => {
    expect(firstBrand({ company: " ТОО Ромашка ", tagline: "" })).toEqual({ name: "ТОО Ромашка" });
    expect(firstBrand({ company: "X", tagline: " ремонт " }).tagline).toBe("ремонт");
  });
});
