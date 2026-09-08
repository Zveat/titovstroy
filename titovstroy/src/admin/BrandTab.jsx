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
import { KP_FONTS, KP_PRESETS, kpTheme } from "../kp/kpTheme.js";

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

      </div>

      {/* ══ ОФОРМЛЕНИЕ КП ══ */}
      <div style={card}>
        <div style={h}>Коммерческое предложение</div>
        <div style={sub}>
          Настраиваются три вещи — бумага, плашки и акцент, — а полосы таблицы, рамки и цвет
          текста считаются из них. Так сделано намеренно: десяток отдельных пипеток
          гарантированно даёт нечитаемый документ у клиента. Контраст текста доводится до
          нормы автоматически, поэтому испортить КП выбором цвета нельзя.
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {KP_PRESETS.map(pr => {
            const on = preview.kpPaper === pr.kpPaper && preview.kpBar === pr.kpBar;
            return (
              <button key={pr.key} className="btn btn-o" disabled={!editable}
                onClick={() => setForm(f => ({ ...f, kpPaper: pr.kpPaper, kpBar: pr.kpBar, kpAccent: pr.kpAccent }))}
                style={{ padding: "5px 12px", fontSize: 11.5, display: "flex", alignItems: "center", gap: 7,
                  borderColor: on ? "#1d4ed8" : undefined, color: on ? "#1d4ed8" : undefined, fontWeight: on ? 700 : 400 }}>
                <span style={{ display: "flex", borderRadius: 4, overflow: "hidden", border: "1px solid #cbd5e1" }}>
                  <span style={{ width: 12, height: 12, background: pr.kpPaper }} />
                  <span style={{ width: 12, height: 12, background: pr.kpBar }} />
                  <span style={{ width: 12, height: 12, background: pr.kpAccent }} />
                </span>
                {pr.label}
              </button>
            );
          })}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14, marginBottom: 18 }}>
          <Color label="Бумага документа" v={form.kpPaper} d={BRAND_DEFAULT.kpPaper}
            on={v => set("kpPaper", v)} editable={editable} />
          <Color label="Плашки заголовков и итога" v={form.kpBar} d={BRAND_DEFAULT.kpBar}
            on={v => set("kpBar", v)} editable={editable} />
          <Color label="Акцент документа" v={form.kpAccent} d={preview.accent}
            on={v => set("kpAccent", v)} editable={editable}
            hint="пусто — берётся фирменный цвет компании" />
          <div>
            <label style={lbl}>Шрифт документа</label>
            <select className="fi" style={{ width: "100%" }} disabled={!editable}
              value={form.kpFont || "golos"} onChange={e => set("kpFont", e.target.value)}>
              {KP_FONTS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </div>
        </div>

        <KpPreview t={kpTheme(preview)} brand={preview} />
      </div>

      <div style={card}>
        {editable && (
          <div>
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

// Поле цвета: пипетка и текстовое поле рядом. Пустое значение допустимо и
// означает «взять по умолчанию» — поэтому пипетка показывает подставленный
// цвет, а очистить можно только текстом.
function Color({ label, v, d, on, editable, hint }) {
  return (
    <div>
      <label style={lbl}>{label}</label>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input type="color" disabled={!editable} value={/^#[0-9a-fA-F]{6}$/.test(v || "") ? v : d}
          onChange={e => on(e.target.value)}
          style={{ width: 44, height: 32, padding: 0, border: "1px solid #cbd5e1", borderRadius: 6 }} />
        <input className="fi" style={{ flex: 1, minWidth: 0 }} disabled={!editable}
          value={v || ""} onChange={e => on(e.target.value)} placeholder={d} />
      </div>
      {hint && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>{hint}</div>}
    </div>
  );
}

// Живой кусок настоящего КП: шапка, заголовок раздела, две строки таблицы и
// блок итога. Подбирать три цвета вслепую невозможно — надо видеть результат
// сразу, а не открывать смету и печатать её ради проверки.
function KpPreview({ t, brand }) {
  const row = { padding: "5px 8px", fontSize: 11 };
  return (
    <div>
      <div style={{ ...lbl, marginBottom: 6 }}>Как будет выглядеть</div>
      <div style={{ fontFamily: t.font, background: t.paper, color: t.text,
        borderRadius: 10, padding: 14, border: "1px solid #e2e8f0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 14 }}>Ценовое предложение</div>
            <div style={{ fontSize: 10, color: t.muted }}>на услуги ремонта и отделки</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontWeight: 900, fontSize: 12, color: t.accent }}>{brand.name}</div>
            <div style={{ fontSize: 10, color: t.muted }}>WA: <span style={{ color: t.accent }}>{brand.whatsapp}</span></div>
          </div>
        </div>
        <div style={{ background: t.panel, borderRadius: 7, padding: "8px 10px", fontSize: 11, marginBottom: 10 }}>
          <span style={{ color: t.muted }}>Заказчик: </span><b>Иван Петров</b>
        </div>
        <div style={{ background: t.bar, color: t.barText, padding: "6px 10px", borderRadius: "6px 6px 0 0",
          display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700 }}>
          <span>ЧЕРНОВЫЕ РАБОТЫ</span><span style={{ color: t.accentOnBar }}>196 870 ₸</span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {[["Грунтовка перед обоями", "45 820 ₸"], ["Наливной пол", "151 050 ₸"]].map(([n, v], i) => (
              <tr key={n} style={{ background: i % 2 === 0 ? t.paper : t.paperAlt, borderBottom: "1px solid " + t.border }}>
                <td style={{ ...row, color: t.subtle, width: "34%" }}>Выравнивание</td>
                <td style={row}>{n}</td>
                <td style={{ ...row, textAlign: "right", fontWeight: 700 }}>{v}</td>
              </tr>
            ))}
            <tr style={{ background: t.panel }}>
              <td colSpan={2} style={{ ...row, textAlign: "right", fontWeight: 700 }}>Итого по разделу:</td>
              <td style={{ ...row, textAlign: "right", fontWeight: 800, color: t.accent }}>196 870 ₸</td>
            </tr>
          </tbody>
        </table>
        <div style={{ background: t.bar, borderRadius: 9, padding: "10px 14px", marginTop: 8,
          display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: t.barText, fontSize: 11, fontWeight: 700 }}>ИТОГО</span>
          <span style={{ color: t.accentOnBar, fontSize: 20, fontWeight: 900 }}>2 106 683 ₸</span>
        </div>
      </div>
    </div>
  );
}
