// ЭКРАН ПЕРВОГО ЗАПУСКА. Показывается вместо входа, пока в базе нет ни одного
// сотрудника. Заводит компанию и первого администратора — после этого экран
// исчезает навсегда, потому что сотрудники уже есть.
//
// ПОЧЕМУ ЭТО ВООБЩЕ ЗДЕСЬ. До него на пустой базе пускал вход по вшитым в код
// admin/titov2024, а пароль лежит в открытом репозитории. Логика проверок — в
// auth/setup.js, под тестами; здесь только форма и запись.
import { useState } from "react";
import { storage } from "../cloud/storage.js";
import { hashPassword } from "../auth/loginGuard.js";
import { firstAdmin, firstBrand, validateSetup } from "../auth/setup.js";
import { normalizeBrand, setBrandLocal } from "../brand.js";
import { BRAND_KEY, USERS_KEY } from "../storageKeys.js";

const fld = { background: "#fff", border: "1px solid #e2e8f0", color: "#0f172a", borderRadius: 8,
  padding: "11px 14px", fontFamily: "inherit", fontSize: 14, width: "100%", outline: "none" };
const lbl = { fontSize: 11, color: "#94a3b8", marginBottom: 6, fontWeight: 600,
  letterSpacing: .5, textTransform: "uppercase" };

export function SetupWizard({ onDone }) {
  const [f, setF] = useState({ company: "", tagline: "", adminName: "", login: "", password: "", password2: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k, v) => { setF(p => ({ ...p, [k]: v })); setError(""); };

  const submit = async () => {
    const bad = validateSetup(f);
    if (bad) { setError(bad); return; }
    setBusy(true);
    try {
      // ПОВТОРНАЯ ПРОВЕРКА ПЕРЕД ЗАПИСЬЮ. Между открытием экрана и нажатием могла
      // пройти чужая установка — например, двое настраивают одну базу с разных
      // устройств. Перезаписать уже заведённых сотрудников нельзя ни при каких
      // условиях: это отобрало бы доступ у того, кто успел первым.
      const again = await storage.getResult(USERS_KEY);
      if (again.status !== "empty") {
        setError("База уже настроена — обновите страницу и войдите.");
        setBusy(false);
        return;
      }
      const user = firstAdmin({ adminName: f.adminName, login: f.login,
        passwordHash: await hashPassword(f.password) });
      const res = await storage.set(USERS_KEY, JSON.stringify([user]));
      if (res && res.ok === false) throw new Error(res.error || "не удалось записать");

      // Оформление — отдельной записью и НЕ критично: если правила базы ещё не
      // опубликованы, сотрудник уже создан и войти можно, а название допишется
      // в админке. Ронять из-за оформления настройку целиком нельзя.
      const brand = normalizeBrand(firstBrand(f));
      try { await storage.set(BRAND_KEY, JSON.stringify(brand)); setBrandLocal(brand); }
      catch (e) { /* название впишут в Админке → Оформление */ }

      onDone(f.login);
    } catch (e) {
      setError("Не удалось настроить: " + (e?.message || "ошибка записи в базу"));
      setBusy(false);
    }
  };

  const row = (label, key, props = {}) => (
    <div style={{ marginBottom: 14 }}>
      <div style={lbl}>{label}</div>
      <input style={fld} value={f[key]} disabled={busy}
        onChange={e => set(key, e.target.value)}
        onKeyDown={e => e.key === "Enter" && submit()} {...props} />
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", display: "flex", alignItems: "center",
      justifyContent: "center", padding: 20, fontFamily: "'Inter','Segoe UI',sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 26 }}>
          <div style={{ fontWeight: 900, fontSize: 22, color: "#0f172a" }}>Первый запуск</div>
          <div style={{ fontSize: 12.5, color: "#64748b", marginTop: 6, lineHeight: 1.5 }}>
            База пустая — сотрудников ещё нет. Заведите компанию и администратора,
            дальше он добавит остальных.
          </div>
        </div>

        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "24px 24px" }}>
          {row("Название компании", "company", { placeholder: "ТОО «Название»", autoFocus: true })}
          {row("Подпись под названием (необязательно)", "tagline", { placeholder: "ремонт и отделка" })}
          <div style={{ height: 1, background: "#f1f5f9", margin: "18px 0" }} />
          {row("Имя администратора", "adminName", { placeholder: "Иван Петров" })}
          {row("Логин", "login", { placeholder: "ivan", autoCapitalize: "none", autoCorrect: "off" })}
          {row("Пароль", "password", { type: "password", autoComplete: "new-password" })}
          {row("Пароль ещё раз", "password2", { type: "password", autoComplete: "new-password" })}

          {error && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c",
              borderRadius: 8, padding: "9px 12px", fontSize: 12.5, marginBottom: 14 }}>{error}</div>
          )}

          <button onClick={submit} disabled={busy}
            style={{ width: "100%", background: busy ? "#93c5fd" : "#2563eb", color: "#fff", border: 0,
              borderRadius: 8, padding: "12px 16px", fontSize: 14.5, fontWeight: 700,
              fontFamily: "inherit", cursor: busy ? "default" : "pointer" }}>
            {busy ? "Настраиваю…" : "Настроить"}
          </button>
        </div>

        <div style={{ textAlign: "center", marginTop: 14, fontSize: 11.5, color: "#94a3b8", lineHeight: 1.5 }}>
          Этот экран виден, пока в базе нет сотрудников. Настройте систему сразу после
          установки: до этого завести администратора может любой, кто знает адрес.
        </div>
      </div>
    </div>
  );
}
