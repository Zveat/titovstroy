// АДМИНКА → ОФОРМЛЕНИЕ. Название, логотип, цвет, WhatsApp, печать.
//
// Здесь НЕТ реквизитов — ни БИН, ни банка, ни директора. Они уже настраиваются
// в «Реквизитах» (карточки контрагентов), и договоры берут их именно оттуда.
// Завести им второе место значило бы гарантированно их развести: в документе
// одно, на экране другое, и никто не знает, что правильно.
import { useEffect, useState } from "react";
import { storage } from "../cloud/storage.js";
import { logChange } from "../cloud/audit.js";
import { BRAND_KEY } from "../storageKeys.js";
import { BRAND_DEFAULT, brandLetter, fileToLogo, getBrand, normalizeBrand, setBrandLocal } from "../brand.js";

const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "18px 20px", marginBottom: 16 };
const h = { fontSize: 15, fontWeight: 800, color: "#0f172a", marginBottom: 4 };
const sub = { fontSize: 12, color: "#64748b", lineHeight: 1.55, marginBottom: 14 };
const lbl = { fontSize: 11.5, color: "#64748b", marginBottom: 4, display: "block" };

export function BrandTab({ currentUser, contragents = [], readOnly = false, canEdit = false }) {
  const [form, setForm] = useState(() => ({ ...getBrand() }));
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const editable = canEdit && !readOnly;

  useEffect(() => { setForm({ ...getBrand() }); }, []);

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(""), 3000); };
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!editable) return;
    setBusy(true);
    const next = normalizeBrand(form);
    try {
      await storage.set(BRAND_KEY, JSON.stringify(next));
      // Применяем сразу же: заголовок вкладки, значок и шапки меняются, не
      // дожидаясь перезагрузки, — иначе непонятно, сохранилось или нет.
      setBrandLocal(next);
      setForm({ ...next });
      logChange(currentUser, { entity: "settings", entityId: "brand", label: "Оформление",
        field: "оформление", action: "изменил", old: "", new: next.name });
      flash("Сохранено");
    } catch (e) {
      flash("Не сохранилось: " + (e?.message || "ошибка"));
    }
    setBusy(false);
  };

  const pickLogo = async (file) => {
    if (!editable || !file) return;
    try {
      const data = await fileToLogo(file);
      set("logo", data);
      flash("Логотип подготовлен — не забудьте «Сохранить»");
    } catch (e) { flash(e.message); }
  };

  const preview = normalizeBrand(form);

  return (
    <div>
      {msg && <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#065f46",
        borderRadius: 9, padding: "9px 14px", fontSize: 13, marginBottom: 14,
        position: "sticky", top: 8, zIndex: 5 }}>{msg}</div>}

      <div style={card}>
        <div style={h}>Оформление</div>
        <div style={sub}>
          Название и логотип видят и сотрудники, и клиенты — в шапке сервиса, на входе,
          в кабинете объекта и в коммерческом предложении.
          <br />Реквизиты (БИН, банк, счёт, директор) настраиваются отдельно, в разделе
          «Реквизиты»: оттуда их берут договоры и акты.
        </div>

        {/* Живой пример — рядом с полями, чтобы не гадать, как это выглядит. */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#0f172a",
          borderRadius: 12, padding: "13px 16px", marginBottom: 18 }}>
          {preview.logo
            ? <img src={preview.logo} alt="" style={{ height: 34, maxWidth: 150, objectFit: "contain" }} />
            : <div style={{ width: 34, height: 34, borderRadius: 9, background: preview.accent,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 20, fontWeight: 900, color: "#0c0e1a" }}>{brandLetter(preview)}</div>}
          <div>
            <div style={{ color: "#f8fafc", fontWeight: 800, fontSize: 15 }}>{preview.name}</div>
            <div style={{ color: "#94a3b8", fontSize: 11.5 }}>{preview.tagline}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 14 }}>
          <div>
            <label style={lbl}>Название компании</label>
            <input className="fi" style={{ width: "100%" }} disabled={!editable}
              value={form.name || ""} onChange={e => set("name", e.target.value)}
              placeholder={BRAND_DEFAULT.name} />
          </div>
          <div>
            <label style={lbl}>Подпись под названием</label>
            <input className="fi" style={{ width: "100%" }} disabled={!editable}
              value={form.tagline || ""} onChange={e => set("tagline", e.target.value)}
              placeholder={BRAND_DEFAULT.tagline} />
          </div>
          <div>
            <label style={lbl}>Заголовок вкладки браузера</label>
            <input className="fi" style={{ width: "100%" }} disabled={!editable}
              value={form.appTitle || ""} onChange={e => set("appTitle", e.target.value)}
              placeholder={BRAND_DEFAULT.appTitle} />
          </div>
          <div>
            <label style={lbl}>WhatsApp для клиентов (только цифры)</label>
            <input className="fi" style={{ width: "100%" }} disabled={!editable}
              value={form.whatsapp || ""} onChange={e => set("whatsapp", e.target.value)}
              placeholder={BRAND_DEFAULT.whatsapp} />
          </div>
          <div>
            <label style={lbl}>Фирменный цвет</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="color" disabled={!editable} value={preview.accent}
                onChange={e => set("accent", e.target.value)}
                style={{ width: 44, height: 32, padding: 0, border: "1px solid #cbd5e1", borderRadius: 6 }} />
              <input className="fi" style={{ flex: 1 }} disabled={!editable}
                value={form.accent || ""} onChange={e => set("accent", e.target.value)}
                placeholder={BRAND_DEFAULT.accent} />
            </div>
          </div>
          <div>
            {/* У компании может быть несколько юрлиц (у владельца их два).
                Раньше в шапке КП стоял вписанный в код БИН, то есть всегда одно
                и то же — теперь нужно сказать, от кого выходит предложение. */}
            <label style={lbl}>КП выходит от юрлица</label>
            <select className="fi" style={{ width: "100%" }} disabled={!editable}
              value={form.kpContragentId || ""} onChange={e => set("kpContragentId", e.target.value)}>
              <option value="">— первое из «Реквизитов» —</option>
              {contragents.map(c => (
                <option key={c.id} value={c.id}>{c.name || "без названия"}{c.bin ? ` · БИН ${c.bin}` : ""}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={lbl}>Печать для КП и актов</label>
            <input className="fi" style={{ width: "100%" }} disabled={!editable}
              value={form.stamp || ""} onChange={e => set("stamp", e.target.value)}
              placeholder={BRAND_DEFAULT.stamp} />
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <label style={lbl}>Логотип</label>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input type="file" accept="image/*" disabled={!editable}
              onChange={e => { pickLogo(e.target.files?.[0]); e.target.value = ""; }}
              style={{ fontSize: 12 }} />
            {form.logo && editable && (
              <button className="btn btn-o" style={{ padding: "4px 11px", fontSize: 11.5 }}
                onClick={() => set("logo", "")}>убрать логотип</button>
            )}
          </div>
          <div style={{ ...sub, marginTop: 6, marginBottom: 0 }}>
            Картинка уменьшается до 320 точек и хранится в базе — её открывают и клиенты,
            поэтому тяжёлый файл замедлил бы им страницу. Если логотипа нет, рисуется
            плитка с первой буквой названия.
          </div>
        </div>

        {editable && (
          <div style={{ marginTop: 18 }}>
            <button className="btn" disabled={busy} onClick={save}>
              {busy ? "Сохраняю…" : "Сохранить"}
            </button>
          </div>
        )}
        {!editable && (
          <div style={{ ...sub, marginTop: 14, marginBottom: 0 }}>
            Менять оформление может администратор.
          </div>
        )}
      </div>
    </div>
  );
}
