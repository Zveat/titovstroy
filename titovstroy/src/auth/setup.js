// ПЕРВЫЙ ЗАПУСК: проверки и заготовки записей. Без сети и без базы, поэтому под
// тестами — здесь решается, кто станет администратором новой установки.
//
// ЗАЧЕМ ЭТО ПОЯВИЛОСЬ. Раньше на пустой базе работал вход по вшитым в код
// admin/titov2024. Пароль лежит в открытом репозитории, то есть у каждой новой
// установки была готовая дверь ровно в тот момент, когда за ней ещё никто не
// следит: сайт развёрнут, а настраивать его не начали. Мастер закрывает этот
// промежуток: пока сотрудников нет, войти нельзя вообще, можно только завести
// первого — и с паролем, который придумали здесь и сейчас.
import { passwordTooWeak } from "./loginGuard.js";

const S = (v) => (v == null ? "" : String(v));
const t = (v) => S(v).trim();

// Логин уходит в адреса и сравнивается без учёта регистра — поэтому только
// латиница, цифры и простые разделители. Кириллический логин человек потом не
// сможет ни продиктовать, ни повторить.
export const LOGIN_RE = /^[a-zA-Z0-9._-]{3,32}$/;

export function validateSetup({ company, adminName, login, password, password2 } = {}) {
  if (!t(company)) return "Впишите название компании";
  if (!t(adminName)) return "Впишите имя администратора";
  if (!LOGIN_RE.test(t(login))) {
    return "Логин: латиница, цифры, точка, дефис или подчёркивание, от 3 до 32 символов";
  }
  const weak = passwordTooWeak(S(password));
  if (weak) return weak;
  if (S(password) !== S(password2)) return "Пароли не совпадают";
  return null;
}

// Первый сотрудник новой установки. Роль admin — иначе систему сразу некому
// настраивать, а поднять себе права было бы некому и негде.
export function firstAdmin({ adminName, login, passwordHash }) {
  return {
    id: "1",
    login: t(login),
    password: passwordHash,
    name: t(adminName),
    role: "admin",
    createdAt: Date.now(),
  };
}

// Оформление новой установки. Название обязательно — именно из-за него мастер и
// спрашивает компанию: иначе у чужой компании в шапке и в КП стояло бы
// «TitovStroy» из умолчаний.
export function firstBrand({ company, tagline }) {
  const out = { name: t(company) };
  if (t(tagline)) out.tagline = t(tagline);
  return out;
}
