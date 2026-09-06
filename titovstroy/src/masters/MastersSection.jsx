// Раздел «Мастера»: справочник naimi.kz/OLX, фильтры, выгрузка, телефоны.
// Перенос из App.jsx без изменения логики.
import { useEffect, useMemo, useState } from "react";
import { downloadCSV } from "../format.js";
import { MasterCrmButton, MasterCrmDatabase, MasterCrmEditor } from "./MasterCRM.jsx";
import { SearchMultiSelect, SearchSelect as MasterSearchSelect } from "./MasterSelects.jsx";
import { MASTER_CATEGORIES, NAIMI_CITY_FALLBACK, OLX_REPAIR_CATEGORIES } from "./catalog.mjs";
import { interactionsForContact, masterSourceKey, normalizeMasterCrm } from "./masterCrm.js";
import { parserRunMessage } from "./parserTrigger.js";

// ── РАЗДЕЛ «МАСТЕРА» ── справочник с naimi.kz (наполняется парсером, только чтение)
export function _kzPhone(d) {
  d = String(d || "").replace(/\D/g, "");
  if (d.length === 11 && (d[0] === "8" || d[0] === "7")) d = "7" + d.slice(1);
  else if (d.length === 10) d = "7" + d;
  return d;
}
export function _fmtPhone(d) {
  const p = _kzPhone(d);
  if (p.length === 11) return `+7 ${p.slice(1, 4)} ${p.slice(4, 7)}-${p.slice(7, 9)}-${p.slice(9)}`;
  return d ? "+" + p : "";
}
export function _phoneStatusLabel(master) {
  if (master?.phoneStatus === "unavailable") return "Номер не опубликован источником";
  if (master?.phoneStatus === "retry") return "Не удалось проверить — повторим автоматически";
  if (master?.phoneCheckedAt) return "Ожидает повторной проверки";
  return "В очереди на проверку номера";
}
export function _masterCrmExport(crmValue, source, master) {
  const crm = normalizeMasterCrm(crmValue);
  const sourceKey = masterSourceKey(source, master);
  const contact = crm.contacts.find(item => item.sourceKey === sourceKey);
  const history = contact ? interactionsForContact(crm, contact.id) : [];
  return {
    status: contact?.status || "",
    tags: Array.isArray(contact?.tags) ? contact.tags.join(", ") : "",
    note: contact?.note || "",
    history: history.map(item => {
      const date = item.createdAt ? new Date(item.createdAt).toLocaleString("ru-RU") : "";
      return [date, item.author, item.note].filter(Boolean).join(" — ");
    }).join(" | "),
  };
}
export function exportFilteredMasters(source, masters, crmValue) {
  const isOlx = source === "olx";
  const headers = [
    "Источник", "Имя", "Телефон", "Город", "Специализации", "Рейтинг / балл",
    "Отзывы", "Тип", "Проверен", "Актуален", "Заголовок", "Объявлений",
    "Ссылка", "Обновлён", "CRM статус", "CRM метки", "CRM заметка", "История взаимодействий",
  ];
  const rows = masters.map(master => {
    const crm = _masterCrmExport(crmValue, source, master);
    return [
      isOlx ? "OLX.kz" : "Naimi.kz",
      master.name || "",
      _fmtPhone(master.phone),
      master.city || "",
      Array.isArray(master.services) ? master.services.join(", ") : "",
      isOlx ? (master.score ?? "") : (master.rating ?? ""),
      isOlx ? "" : (master.reviews ?? ""),
      isOlx ? (master.business ? "Компания" : "Частник") : "",
      master.verified ? "Да" : "",
      master.active === false ? "Нет" : "Да",
      master.title || "",
      master.adsCount ?? "",
      master.url || "",
      master.lastRefresh || master.updatedAt || master.phoneCheckedAt || "",
      crm.status,
      crm.tags,
      crm.note,
      crm.history,
    ];
  });
  const day = new Date().toISOString().slice(0, 10);
  downloadCSV(`masters_${isOlx ? "olx" : "naimi"}_${day}.csv`, headers, rows);
}
export function MastersSection({ masters = [], meta = null, loaded = true, config = null, onSaveConfig = null, canManage = false,
  mastersOlx = [], olxMeta = null, olxLoaded = true, olxConfig = null, onSaveOlxConfig = null,
  crmData = null, onSaveCrm = null, currentUser = null }) {
  const [source, setSource] = useState("naimi"); // "naimi" | "olx" | "own"
  const [crmTarget, setCrmTarget] = useState(null);
  const [cfgOpen, setCfgOpen] = useState(false);
  const [freq, setFreq] = useState("daily");
  const [cfgCities, setCfgCities] = useState(["karaganda"]);
  const [cfgPhones, setCfgPhones] = useState(25);
  const [cfgCats, setCfgCats] = useState(["47"]); // выбранные id категорий
  const [cfgMsg, setCfgMsg] = useState("");
  const [cfgBusy, setCfgBusy] = useState(false);
  useEffect(() => {
    if (config) {
      setFreq(["off", "daily", "twice", "weekly"].includes(config.frequency) ? config.frequency : "daily");
      const cityIds = String(config.cities || "karaganda").split(",").map(s => s.trim()).filter(Boolean);
      setCfgCities(cityIds.length ? cityIds : ["karaganda"]);
      const phoneLimit = Number(config.phonesPerRun);
      setCfgPhones(Number.isFinite(phoneLimit) ? Math.min(60, Math.max(0, phoneLimit)) : 25);
      const ids = String(config.categoryIds || "47").split(",").map(s => s.trim()).filter(Boolean);
      setCfgCats(ids.length ? ids : ["47"]);
    }
  }, [config]);
  const applyCfg = async (extra) => {
    if (!onSaveConfig || cfgBusy) return;
    const cats = cfgCats.length ? cfgCats : ["47"];
    setCfgBusy(true); setCfgMsg(extra?.runNow ? "Запрос отправлен…" : "Сохраняю…");
    const phoneLimit = Number(cfgPhones);
    const result = await onSaveConfig({ frequency: freq, cities: (cfgCities.length ? cfgCities : ["karaganda"]).join(","), categoryIds: cats.join(","), phonesPerRun: Number.isFinite(phoneLimit) ? Math.min(60, Math.max(0, phoneLimit)) : 25, ...(extra || {}) });
    const ok = result === true || result?.ok === true;
    setCfgMsg(ok ? (extra?.runNow ? parserRunMessage(result?.trigger) : "✓ Настройки сохранены") : "Не удалось сохранить в облако");
    setCfgBusy(false);
  };
  const runPending = (Number(config?.runNow) || 0) > (Number(config?.lastRunNow) || 0);
  // Города — МНОЖЕСТВЕННЫЙ выбор: база теперь по нескольким регионам, и «Астана + Алматы»
  // одним списком нужнее, чем по одному городу за раз. Пустой массив = все города.
  const [city, setCity] = useState([]);
  const [service, setService] = useState("");
  const [minRating, setMinRating] = useState(0);
  const [onlyVerified, setOnlyVerified] = useState(false);
  const [onlyPhone, setOnlyPhone] = useState(false);
  const [onlyActive, setOnlyActive] = useState(true);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("rating");
  const [limit, setLimit] = useState(60);

  const cities = useMemo(() => [...new Set(masters.map(m => m.city).filter(Boolean))].sort(), [masters]);
  const services = useMemo(() => {
    const s = new Set();
    for (const m of masters) for (const x of (m.services || [])) if (x) s.add(x);
    return [...s].sort((a, b) => a.localeCompare(b, "ru"));
  }, [masters]);
  const naimiCityOptions = useMemo(() => {
    const fromParser = Array.isArray(config?.availableCities) ? config.availableCities : [];
    const normalized = fromParser.map(item => ({ id: String(item.slug || item.id || ""), name: String(item.name || item.title || item.slug || item.id || "") })).filter(item => item.id && item.name);
    const options = normalized.length ? normalized : [...NAIMI_CITY_FALLBACK];
    for (const id of cfgCities) if (!options.some(item => item.id === id)) options.push({ id, name: id });
    return options;
  }, [config?.availableCities, cfgCities]);

  const filtered = useMemo(() => {
    const qn = q.trim().toLowerCase();
    // null = фильтр по городам не задан. Иначе Set — сравнение за одну операцию на мастера,
    // а их тут тысячи.
    const citySet = city.length ? new Set(city) : null;
    const list = masters.filter(m => {
      if (citySet && !citySet.has(m.city)) return false;
      if (service && !(m.services || []).includes(service)) return false;
      if (minRating && (Number(m.rating) || 0) < minRating) return false;
      if (onlyVerified && !m.verified) return false;
      if (onlyPhone && !m.phone) return false;
      if (onlyActive && m.active === false) return false;
      if (qn && !String(m.name || "").toLowerCase().includes(qn)) return false;
      return true;
    });
    list.sort((a, b) => {
      if (sort === "reviews") return (b.reviews || 0) - (a.reviews || 0);
      if (sort === "name") return String(a.name || "").localeCompare(String(b.name || ""), "ru");
      return (Number(b.rating) || 0) - (Number(a.rating) || 0) || (b.reviews || 0) - (a.reviews || 0);
    });
    return list;
  }, [masters, city, service, minRating, onlyVerified, onlyPhone, onlyActive, q, sort]);

  const shown = filtered.slice(0, limit);
  const withPhone = masters.filter(m => m.phone).length;
  const olxWithPhone = mastersOlx.filter(m => m.phone).length;

  const selStyle = { height: 36, borderRadius: 9, border: "1px solid #e2e8f0", padding: "0 10px", fontSize: 13, background: "#fff", color: "#0f172a", fontFamily: "inherit", minWidth: 0 };
  const chip = (active) => ({ border: "1px solid " + (active ? "#2563eb" : "#e2e8f0"), background: active ? "#eff6ff" : "#fff", color: active ? "#2563eb" : "#64748b", borderRadius: 8, padding: "6px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" });

  return (
    <div className="page" style={{ maxWidth: 1600, minHeight: "100vh", paddingBottom: 40 }}>
      <div className="hero" style={{ background: "linear-gradient(135deg,#0f172a 0%,#1e293b 70%,#283549 100%)", borderRadius: 16, padding: "22px 26px", marginBottom: 18, position: "relative", overflow: "hidden", boxShadow: "0 4px 20px rgba(15,23,42,.3)" }}>
        <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 13, flexWrap: "wrap" }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, background: "linear-gradient(135deg,#3b82f6,#2563eb)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🔎</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 21, fontWeight: 900, color: "#fff", lineHeight: 1.1 }}>Мастера</h1>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.7)", marginTop: 3 }}>
              {source === "own"
                ? <>Собственная база · контактов {normalizeMasterCrm(crmData).contacts.length} · история взаимодействий сохраняется отдельно от парсеров</>
                : source === "olx"
                ? <>База с OLX.kz · актуальных {olxMeta?.activeCount ?? mastersOlx.filter(m => m.active !== false).length} · с телефоном {olxWithPhone}{olxMeta?.updatedAt ? ` · обновлено ${new Date(olxMeta.updatedAt).toLocaleDateString("ru-RU")}` : ""}</>
                : <>База с naimi.kz · актуальных {meta?.activeCount ?? masters.filter(m => m.active !== false).length} · с телефоном {withPhone}{meta?.updatedAt ? ` · обновлено ${new Date(meta.updatedAt).toLocaleDateString("ru-RU")}` : ""}</>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 5, background: "rgba(255,255,255,.08)", borderRadius: 10, padding: 4 }}>
            {[["naimi", "naimi.kz"], ["olx", "OLX.kz"], ["own", "Своя база"]].map(([s, l]) => (
              <button key={s} onClick={() => setSource(s)} style={{ border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 800, borderRadius: 7, padding: "6px 14px", background: source === s ? "#fff" : "transparent", color: source === s ? "#0f172a" : "rgba(255,255,255,.8)" }}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      {source === "own" ? (
        <MasterCrmDatabase crmData={crmData} onSave={onSaveCrm} onOpen={setCrmTarget} canDelete={canManage} />
      ) : source === "olx" ? (
        <MastersOlxView masters={mastersOlx} meta={olxMeta} loaded={olxLoaded} config={olxConfig} onSaveConfig={onSaveOlxConfig} canManage={canManage} crmData={crmData} onOpenCrm={setCrmTarget} />
      ) : (<>

      {/* Настройки парсера (только Админ) */}
      {canManage && (
        <div style={{ marginBottom: 14, border: "1px solid #e9eef5", borderRadius: 14, background: "#fff", overflow: cfgOpen ? "visible" : "hidden", boxShadow: "0 1px 2px rgba(15,23,42,.04)" }}>
          <div onClick={() => setCfgOpen(o => !o)} style={{ display: "flex", alignItems: "center", gap: 9, padding: "12px 16px", cursor: "pointer", background: cfgOpen ? "#fbfcfe" : "#fff", userSelect: "none" }}>
            <span style={{ fontSize: 15 }}>⚙️</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", flex: 1 }}>Настройки обновления</span>
            {config?.lastRunAt ? <span style={{ fontSize: 11, color: "#94a3b8" }}>последнее: {new Date(config.lastRunAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}{config.lastCount != null ? ` · собрано ${config.lastCount}` : ""}{config.lastWithPhone ? ` · с тел. ${config.lastWithPhone}` : ""}</span> : null}
            {runPending
              ? <span title="Запрос сохранён. Прогон запустится сам — обычно в течение 10–30 минут." style={{ fontSize: 10.5, fontWeight: 700, color: "#d97706", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 20, padding: "2px 8px" }}>⏳ в очереди — запустится сам</span>
              : (config?.lastRunAt ? (config.lastRunStatus === "partial"
                ? <span style={{ fontSize: 10.5, fontWeight: 700, color: "#b45309", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 20, padding: "2px 8px" }}>частично — повторим</span>
                : <span title="Последний прогон завершён." style={{ fontSize: 10.5, fontWeight: 700, color: "#059669", background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 20, padding: "2px 8px" }}>✓ обновлено</span>) : null)}
            <span style={{ color: "#cbd5e1", fontSize: 12, transform: cfgOpen ? "none" : "rotate(-90deg)", transition: "transform .15s" }}>▾</span>
          </div>
          {cfgOpen && (
            <div style={{ padding: "12px 16px", borderTop: "1px solid #f1f5f9" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end" }}>
                <label style={{ fontSize: 11.5, color: "#64748b", fontWeight: 600 }}>Частота обновления<br />
                  <select value={freq} onChange={e => setFreq(e.target.value)} style={{ ...selStyle, marginTop: 4, minWidth: 160 }}>
                    <option value="off">Выключено</option>
                    <option value="daily">Раз в день</option>
                    <option value="twice">2 раза в день</option>
                    <option value="weekly">Раз в неделю</option>
                  </select>
                </label>
                <label style={{ fontSize: 11.5, color: "#64748b", fontWeight: 600 }}>Города<br />
                  <span style={{ display: "block", marginTop: 4 }}><SearchMultiSelect values={cfgCities} onChange={setCfgCities} options={naimiCityOptions} label="Выберите города" width={250} /></span>
                </label>
                <label style={{ fontSize: 11.5, color: "#64748b", fontWeight: 600 }}>Телефонов за прогон<br />
                  <input type="number" min="0" max="60" value={cfgPhones} onChange={e => setCfgPhones(e.target.value)} style={{ ...selStyle, marginTop: 4, width: 120 }} />
                </label>
                <button disabled={cfgBusy} onClick={() => applyCfg()} style={{ background: "#0f172a", color: "#fff", border: "none", borderRadius: 9, padding: "9px 16px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", height: 36 }}>💾 Сохранить</button>
                <button disabled={cfgBusy} onClick={() => applyCfg({ runNow: Date.now() })} style={{ background: "#ecfdf5", color: "#059669", border: "1px solid #a7f3d0", borderRadius: 9, padding: "9px 16px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", height: 36 }}>🔄 Обновить сейчас</button>
                {cfgMsg && <span style={{ fontSize: 12, color: cfgMsg.startsWith("✓") ? "#059669" : "#64748b", alignSelf: "center" }}>{cfgMsg}</span>}
              </div>
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 11.5, color: "#64748b", fontWeight: 600, marginBottom: 7 }}>Категории мастеров — что парсить</div>
                <SearchMultiSelect values={cfgCats} onChange={setCfgCats} options={MASTER_CATEGORIES} label="Выберите категории" width={360} />
              </div>
              <div style={{ fontSize: 10.5, color: "#94a3b8", marginTop: 12, lineHeight: 1.5 }}>
                Отмечены только выбранные категории (не «всё найми»). Изменил категории/города — нажми <b>💾 Сохранить</b>, затем <b>🔄 Обновить сейчас</b>.
                «Обновить сейчас» сразу создаёт запуск парсера. Метка <b>⏳ в очереди</b> остаётся до завершения; расписание GitHub используется как резерв. Телефоны докапываются постепенно из-за защиты сайтов.
                Список городов и категорий обновляется из справочника Naimi. Телефон может быть получен только при действующей сессии Naimi.
                {config?.lastPhoneError ? <><br /><b style={{ color: "#dc2626" }}>{config.lastPhoneError}</b></> : null}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Фильтры */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск по имени…" style={{ ...selStyle, flex: "1 1 200px", maxWidth: 280 }} />
        <SearchMultiSelect values={city} onChange={setCity} options={cities.map(c => ({ id: c, name: c }))} label="Все города" width={190} />
        <MasterSearchSelect value={service} onChange={setService} options={services.map(s => ({ id: s, name: s }))} emptyLabel="Все виды работ" width={250} />
        <select value={sort} onChange={e => setSort(e.target.value)} style={selStyle}>
          <option value="rating">По рейтингу</option>
          <option value="reviews">По отзывам</option>
          <option value="name">По имени</option>
        </select>
        <div style={{ display: "flex", gap: 4 }}>
          {[[0, "Рейтинг: все"], [4, "4+"], [4.5, "4.5+"], [5, "5"]].map(([v, l]) => (
            <button key={v} style={chip(minRating === v)} onClick={() => setMinRating(v)}>{l}</button>
          ))}
        </div>
        <button style={chip(onlyVerified)} onClick={() => setOnlyVerified(v => !v)}>✓ Проверенные</button>
        <button style={chip(onlyPhone)} onClick={() => setOnlyPhone(v => !v)}>📞 С телефоном</button>
        <button style={chip(onlyActive)} onClick={() => setOnlyActive(v => !v)}>Актуальные</button>
      </div>

      {/* Пусто / загрузка */}
      {!masters.length && (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#94a3b8", background: "#f9fafb", border: "1px dashed #e5e7eb", borderRadius: 14 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔎</div>
          <div style={{ fontWeight: 700, marginBottom: 6, color: "#64748b" }}>{loaded ? "База мастеров пока пуста" : "Загрузка…"}</div>
          <div style={{ fontSize: 12.5 }}>Парсер naimi.kz наполнит её в ближайший запуск (по расписанию раз в день).<br />Телефоны докапываются постепенно.</div>
        </div>
      )}

      {/* Список */}
      {!!masters.length && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 12.5, color: "#94a3b8" }}>Найдено: {filtered.length}</div>
            <button onClick={() => exportFilteredMasters("naimi", filtered, crmData)} style={{ border: "1px solid #bfdbfe", background: "#eff6ff", color: "#2563eb", borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 750, cursor: "pointer", fontFamily: "inherit" }}>⬇ Excel по фильтру</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(310px,100%),1fr))", gap: 12, alignItems: "stretch" }}>
            {shown.map(m => {
              const phoneD = m.phone ? _kzPhone(m.phone) : "";
              return (
                <div key={m.source + ":" + m.extId} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "15px 16px 13px", boxShadow: "0 2px 7px rgba(15,23,42,.045)", display: "flex", flexDirection: "column", minHeight: 214, overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 11 }}>
                    <div style={{ width: 38, height: 38, flex: "0 0 38px", borderRadius: 9, display: "grid", placeItems: "center", background: "#eff6ff", color: "#2563eb", fontSize: 16, fontWeight: 850 }}>
                      {String(m.name || "М").trim().charAt(0).toUpperCase() || "М"}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                        <span title={m.name || "Без имени"} style={{ fontSize: 14.5, fontWeight: 800, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name || "Без имени"}</span>
                        {m.verified && <span title="Проверенный" style={{ fontSize: 11, fontWeight: 800, color: "#059669", background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 6, padding: "1px 6px" }}>✓</span>}
                      </div>
                      <div style={{ fontSize: 11.5, color: "#64748b", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {m.city || "—"}
                        {m.rating ? <span style={{ color: "#d97706", fontWeight: 700 }}> · ★ {Number(m.rating).toFixed(1)}</span> : ""}
                        {m.reviews ? ` · ${m.reviews} отзывов` : ""}
                      </div>
                    </div>
                    <span style={{ flex: "0 0 auto", fontSize: 9.5, fontWeight: 800, color: "#64748b", background: "#f1f5f9", borderRadius: 6, padding: "3px 6px" }}>NAIMI</span>
                  </div>
                  <div style={{ minHeight: 44, marginBottom: 11 }}>
                    {!!(m.services || []).length ? <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignContent: "flex-start" }}>
                      {(m.services || []).slice(0, 3).map((s, i) => (
                        <span key={i} style={{ fontSize: 10.5, color: "#475569", background: "#f1f5f9", borderRadius: 6, padding: "2px 7px" }}>{s}</span>
                      ))}
                      {(m.services || []).length > 3 && <span style={{ fontSize: 10.5, color: "#64748b", background: "#f8fafc", borderRadius: 6, padding: "2px 5px" }}>+{(m.services || []).length - 3}</span>}
                    </div> : <span style={{ fontSize: 11, color: "#94a3b8" }}>Специализация не указана</span>}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 11, minHeight: 33 }}>
                    {phoneD ? (
                      <>
                        <a href={"tel:+" + phoneD} style={{ minWidth: 0, flex: "1 1 auto", textAlign: "center", textDecoration: "none", background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", borderRadius: 8, padding: "6px 8px", fontSize: 12, fontWeight: 750, whiteSpace: "nowrap" }}>📞 {_fmtPhone(m.phone)}</a>
                        <a href={"https://wa.me/" + phoneD} target="_blank" rel="noreferrer" style={{ flex: "0 0 auto", textDecoration: "none", background: "#ecfdf5", color: "#059669", border: "1px solid #a7f3d0", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 750 }}>WhatsApp</a>
                      </>
                    ) : (
                      <span style={{ width: "100%", fontSize: 11.5, color: "#94a3b8", background: "#f8fafc", borderRadius: 8, padding: "7px 10px" }}>📞 {_phoneStatusLabel(m)}</span>
                    )}
                  </div>
                  <div style={{ marginTop: "auto", paddingTop: 10, borderTop: "1px solid #f1f5f9", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    {m.url && <a href={m.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none", background: "#fff", color: "#64748b", border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700 }}>🔗 Профиль</a>}
                    <MasterCrmButton crmData={crmData} source="naimi" master={m} onOpen={setCrmTarget} />
                  </div>
                </div>
              );
            })}
          </div>
          {filtered.length > limit && (
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <button onClick={() => setLimit(l => l + 60)} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 700, color: "#2563eb", cursor: "pointer", fontFamily: "inherit" }}>Показать ещё ({filtered.length - limit})</button>
            </div>
          )}
        </>
      )}
      </>)}
      {crmTarget && <MasterCrmEditor crmData={crmData} target={crmTarget} currentUser={currentUser} onSave={onSaveCrm} onClose={() => setCrmTarget(null)} canDelete={canManage} />}
    </div>
  );
}

// Отдельная вкладка OLX (доска объявлений: нет рейтингов/отзывов, поэтому — балл
// «серьёзности» из косвенных сигналов + фильтры компания/частник, свежесть, продвижение).
export function MastersOlxView({ masters = [], meta = null, loaded = true, config = null, onSaveConfig = null, canManage = false, crmData = null, onOpenCrm = null }) {
  const [cfgOpen, setCfgOpen] = useState(false);
  const [freq, setFreq] = useState("daily");
  const [cfgRegion, setCfgRegion] = useState("5");
  const [cfgPhones, setCfgPhones] = useState(60);
  const [cfgCats, setCfgCats] = useState(() => OLX_REPAIR_CATEGORIES.map(c => c.id));
  const [cfgMsg, setCfgMsg] = useState("");
  const [cfgBusy, setCfgBusy] = useState(false);
  useEffect(() => {
    if (config) {
      setFreq(["off", "daily", "twice", "weekly"].includes(config.frequency) ? config.frequency : "daily");
      setCfgRegion(String(config.regionId || "5"));
      const phoneLimit = Number(config.phonesPerRun);
      setCfgPhones(Number.isFinite(phoneLimit) ? Math.min(300, Math.max(0, phoneLimit)) : 60);
      const ids = String(config.categoryIds || "188").split(",").map(s => s.trim()).filter(Boolean);
      const officialIds = OLX_REPAIR_CATEGORIES.map(c => c.id);
      const selected = ids.includes("188") ? officialIds : ids.filter(id => officialIds.includes(id));
      setCfgCats(selected.length ? selected : officialIds);
    }
  }, [config]);
  const applyCfg = async (extra) => {
    if (!onSaveConfig || cfgBusy) return;
    const cats = cfgCats.length ? cfgCats : OLX_REPAIR_CATEGORIES.map(c => c.id);
    setCfgBusy(true); setCfgMsg(extra?.runNow ? "Запрос отправлен…" : "Сохраняю…");
    const phoneLimit = Number(cfgPhones);
    const result = await onSaveConfig({ frequency: freq, regionId: String(cfgRegion).trim() || "5", categoryIds: cats.join(","), phonesPerRun: Number.isFinite(phoneLimit) ? Math.min(300, Math.max(0, phoneLimit)) : 60, ...(extra || {}) });
    const ok = result === true || result?.ok === true;
    setCfgMsg(ok ? (extra?.runNow ? parserRunMessage(result?.trigger) : "✓ Настройки сохранены") : "Не удалось сохранить в облако");
    setCfgBusy(false);
  };
  const runPending = (Number(config?.runNow) || 0) > (Number(config?.lastRunNow) || 0);
  // Города — МНОЖЕСТВЕННЫЙ выбор: база теперь по нескольким регионам, и «Астана + Алматы»
  // одним списком нужнее, чем по одному городу за раз. Пустой массив = все города.
  const [city, setCity] = useState([]);
  const [service, setService] = useState("");
  const [who, setWho] = useState("");        // "" | "company" | "private"
  const [onlyPhone, setOnlyPhone] = useState(false);
  const [onlyPromoted, setOnlyPromoted] = useState(false);
  const [freshOnly, setFreshOnly] = useState(false);
  const [onlyActive, setOnlyActive] = useState(true);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("score");
  const [limit, setLimit] = useState(60);

  const cities = useMemo(() => [...new Set(masters.map(m => m.city).filter(Boolean))].sort(), [masters]);
  const services = useMemo(() => {
    const s = new Set();
    for (const m of masters) for (const x of (m.services || [])) if (x) s.add(x);
    return [...s].sort((a, b) => a.localeCompare(b, "ru"));
  }, [masters]);
  const DAY = 24 * 3600e3;
  const freshDays = (m) => m.lastRefresh ? (Date.now() - Date.parse(m.lastRefresh)) / DAY : 999;

  const filtered = useMemo(() => {
    const qn = q.trim().toLowerCase();
    // null = фильтр по городам не задан. Иначе Set — сравнение за одну операцию на мастера,
    // а их тут тысячи.
    const citySet = city.length ? new Set(city) : null;
    const list = masters.filter(m => {
      if (citySet && !citySet.has(m.city)) return false;
      if (service && !(m.services || []).includes(service)) return false;
      if (who === "company" && !m.business) return false;
      if (who === "private" && m.business) return false;
      if (onlyPhone && !m.phone) return false;
      if (onlyPromoted && !m.promoted) return false;
      if (freshOnly && freshDays(m) > 30) return false;
      if (onlyActive && m.active === false) return false;
      if (qn && !(String(m.name || "").toLowerCase().includes(qn) || String(m.title || "").toLowerCase().includes(qn))) return false;
      return true;
    });
    list.sort((a, b) => {
      if (sort === "fresh") return freshDays(a) - freshDays(b);
      if (sort === "name") return String(a.name || "").localeCompare(String(b.name || ""), "ru");
      return (Number(b.score) || 0) - (Number(a.score) || 0);
    });
    return list;
  }, [masters, city, service, who, onlyPhone, onlyPromoted, freshOnly, onlyActive, q, sort]);

  const shown = filtered.slice(0, limit);
  const selStyle = { height: 36, borderRadius: 9, border: "1px solid #e2e8f0", padding: "0 10px", fontSize: 13, background: "#fff", color: "#0f172a", fontFamily: "inherit", minWidth: 0 };
  const chip = (active) => ({ border: "1px solid " + (active ? "#2563eb" : "#e2e8f0"), background: active ? "#eff6ff" : "#fff", color: active ? "#2563eb" : "#64748b", borderRadius: 8, padding: "6px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" });
  const scoreColor = (s) => s >= 70 ? "#059669" : s >= 45 ? "#d97706" : "#94a3b8";

  return (
    <>
      {/* Настройки OLX-парсера (только Админ) */}
      {canManage && (
        <div style={{ marginBottom: 14, border: "1px solid #e9eef5", borderRadius: 14, background: "#fff", overflow: cfgOpen ? "visible" : "hidden", boxShadow: "0 1px 2px rgba(15,23,42,.04)" }}>
          <div onClick={() => setCfgOpen(o => !o)} style={{ display: "flex", alignItems: "center", gap: 9, padding: "12px 16px", cursor: "pointer", background: cfgOpen ? "#fbfcfe" : "#fff", userSelect: "none" }}>
            <span style={{ fontSize: 15 }}>⚙️</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", flex: 1 }}>Настройки обновления (OLX)</span>
            {config?.lastRunAt ? <span style={{ fontSize: 11, color: "#94a3b8" }}>последнее: {new Date(config.lastRunAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}{config.lastCount != null ? ` · собрано ${config.lastCount}` : ""}{config.lastWithPhone ? ` · с тел. ${config.lastWithPhone}` : ""}</span> : null}
            {runPending
              ? <span title="Запрос сохранён. Прогон запустится сам — обычно в течение 10–30 минут." style={{ fontSize: 10.5, fontWeight: 700, color: "#d97706", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 20, padding: "2px 8px" }}>⏳ в очереди — запустится сам</span>
              : (config?.lastRunAt ? (config.lastRunStatus === "partial"
                ? <span style={{ fontSize: 10.5, fontWeight: 700, color: "#b45309", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 20, padding: "2px 8px" }}>частично — повторим</span>
                : <span style={{ fontSize: 10.5, fontWeight: 700, color: "#059669", background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 20, padding: "2px 8px" }}>✓ обновлено</span>) : null)}
            <span style={{ color: "#cbd5e1", fontSize: 12, transform: cfgOpen ? "none" : "rotate(-90deg)", transition: "transform .15s" }}>▾</span>
          </div>
          {cfgOpen && (
            <div style={{ padding: "12px 16px", borderTop: "1px solid #f1f5f9" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end" }}>
                <label style={{ fontSize: 11.5, color: "#64748b", fontWeight: 600 }}>Частота обновления<br />
                  <select value={freq} onChange={e => setFreq(e.target.value)} style={{ ...selStyle, marginTop: 4, minWidth: 160 }}>
                    <option value="off">Выключено</option>
                    <option value="daily">Раз в день</option>
                    <option value="twice">2 раза в день</option>
                    <option value="weekly">Раз в неделю</option>
                  </select>
                </label>
                <label style={{ fontSize: 11.5, color: "#64748b", fontWeight: 600 }}>Регионы (Караганда = 5)<br />
                  <input value={cfgRegion} onChange={e => setCfgRegion(e.target.value)} placeholder="5 или 5,18,1"
                    title="Можно несколько через запятую. Города внутри области парсер находит сам."
                    style={{ ...selStyle, marginTop: 4, width: 150 }} />
                </label>
                <label style={{ fontSize: 11.5, color: "#64748b", fontWeight: 600 }}>Телефонов за прогон<br />
                  <input type="number" min="0" max="300" value={cfgPhones} onChange={e => setCfgPhones(e.target.value)} style={{ ...selStyle, marginTop: 4, width: 120 }} />
                </label>
                <button disabled={cfgBusy} onClick={() => applyCfg()} style={{ background: "#0f172a", color: "#fff", border: "none", borderRadius: 9, padding: "9px 16px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", height: 36 }}>💾 Сохранить</button>
                <button disabled={cfgBusy} onClick={() => applyCfg({ runNow: Date.now() })} style={{ background: "#ecfdf5", color: "#059669", border: "1px solid #a7f3d0", borderRadius: 9, padding: "9px 16px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", height: 36 }}>🔄 Обновить сейчас</button>
                {cfgMsg && <span style={{ fontSize: 12, color: cfgMsg.startsWith("✓") ? "#059669" : "#64748b", alignSelf: "center" }}>{cfgMsg}</span>}
              </div>
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 11.5, color: "#64748b", fontWeight: 600, marginBottom: 7 }}>Специальности OLX — что парсить</div>
                <SearchMultiSelect values={cfgCats} onChange={setCfgCats} options={OLX_REPAIR_CATEGORIES} label="Выберите специальности" width={380} />
              </div>
              <div style={{ fontSize: 10.5, color: "#94a3b8", marginTop: 12, lineHeight: 1.5 }}>
                Здесь полный текущий список из раздела OLX «Ремонт и строительство» — {OLX_REPAIR_CATEGORIES.length} специальностей.
                Телефоны проверяются честной очередью: сначала новые мастера, затем самые давно проверенные. Если автор скрыл номер, это будет указано в карточке.
                <br />В поле «Регионы» можно перечислить несколько областей через запятую — <b>5,18,1</b>. Города внутри области парсер находит сам, вписывать их не нужно.
                Номер области видно в адресе запроса OLX: открыть olx.kz с выбранной областью → F12 → вкладка Network → строка <b>offers</b> → в ней <b>region_id=</b>.
                {config?.lastPendingPhone != null ? <><br />Ожидают проверки: <b>{config.lastPendingPhone}</b>.</> : null}
                {config?.lastPhoneError ? <><br /><b style={{ color: "#dc2626" }}>{config.lastPhoneError}</b></> : null}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Фильтры OLX */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск по имени/объявлению…" style={{ ...selStyle, flex: "1 1 200px", maxWidth: 300 }} />
        <SearchMultiSelect values={city} onChange={setCity} options={cities.map(c => ({ id: c, name: c }))} label="Все города" width={190} />
        <MasterSearchSelect value={service} onChange={setService} options={services.map(s => ({ id: s, name: s }))} emptyLabel="Все специальности" width={250} />
        <select value={sort} onChange={e => setSort(e.target.value)} style={selStyle}>
          <option value="score">По баллу серьёзности</option>
          <option value="fresh">По свежести</option>
          <option value="name">По имени</option>
        </select>
        <div style={{ display: "flex", gap: 4 }}>
          {[["", "Все"], ["company", "Компании"], ["private", "Частники"]].map(([v, l]) => (
            <button key={v} style={chip(who === v)} onClick={() => setWho(v)}>{l}</button>
          ))}
        </div>
        <button style={chip(freshOnly)} onClick={() => setFreshOnly(v => !v)}>🕒 Активные (30д)</button>
        <button style={chip(onlyPromoted)} onClick={() => setOnlyPromoted(v => !v)}>⭐ Продвигаемые</button>
        <button style={chip(onlyPhone)} onClick={() => setOnlyPhone(v => !v)}>📞 С телефоном</button>
        <button style={chip(onlyActive)} onClick={() => setOnlyActive(v => !v)}>Актуальные объявления</button>
      </div>

      {!masters.length && (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#94a3b8", background: "#f9fafb", border: "1px dashed #e5e7eb", borderRadius: 14 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🧱</div>
          <div style={{ fontWeight: 700, marginBottom: 6, color: "#64748b" }}>{loaded ? "База OLX пока пуста" : "Загрузка…"}</div>
          <div style={{ fontSize: 12.5 }}>Парсер OLX.kz наполнит её в ближайший запуск.<br />Телефоны на OLX открыты и собираются вместе со списком.</div>
        </div>
      )}

      {!!masters.length && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 12.5, color: "#94a3b8" }}>Найдено: {filtered.length}</div>
            <button onClick={() => exportFilteredMasters("olx", filtered, crmData)} style={{ border: "1px solid #bfdbfe", background: "#eff6ff", color: "#2563eb", borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 750, cursor: "pointer", fontFamily: "inherit" }}>⬇ Excel по фильтру</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(310px,100%),1fr))", gap: 12, alignItems: "stretch" }}>
            {shown.map(m => {
              const phoneD = m.phone ? _kzPhone(m.phone) : "";
              const fd = freshDays(m);
              return (
                <div key={m.source + ":" + m.extId} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "15px 16px 13px", boxShadow: "0 2px 7px rgba(15,23,42,.045)", display: "flex", flexDirection: "column", minHeight: 236, overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
                    <div style={{ width: 38, height: 38, flex: "0 0 38px", borderRadius: 9, display: "grid", placeItems: "center", background: "#f0fdf4", color: "#059669", fontSize: 16, fontWeight: 850 }}>
                      {String(m.name || "М").trim().charAt(0).toUpperCase() || "М"}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                        <span title={m.name || "Без имени"} style={{ minWidth: 0, fontSize: 14.5, fontWeight: 800, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name || "Без имени"}</span>
                        <span title="Балл серьёзности/активности (не качество работы)" style={{ fontSize: 11, fontWeight: 800, color: "#fff", background: scoreColor(m.score || 0), borderRadius: 6, padding: "1px 6px" }}>{m.score || 0}</span>
                        {m.promoted && <span title="Платное продвижение" style={{ fontSize: 10 }}>⭐</span>}
                      </div>
                      <div style={{ fontSize: 11.5, color: "#64748b", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {m.city || "—"}
                        {fd <= 7 ? <span style={{ color: "#059669", fontWeight: 700 }}> · свежее</span> : fd <= 30 ? " · активно" : fd < 999 ? ` · ${Math.round(fd)} дн. назад` : ""}
                        {m.adsCount > 1 ? ` · ${m.adsCount} объявл.` : ""}
                      </div>
                    </div>
                    <span style={{ flex: "0 0 auto", fontSize: 9.5, fontWeight: 800, color: m.business ? "#7c3aed" : "#64748b", background: m.business ? "#f5f3ff" : "#f1f5f9", borderRadius: 6, padding: "3px 6px" }}>{m.business ? "КОМПАНИЯ" : "ЧАСТНИК"}</span>
                  </div>
                  <div title={m.title || ""} style={{ minHeight: 34, marginBottom: 8, fontSize: 12, color: m.title ? "#334155" : "#94a3b8", lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{m.title || "Описание не указано"}</div>
                  <div style={{ minHeight: 44, marginBottom: 10 }}>
                    {!!(m.services || []).length ? <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignContent: "flex-start" }}>
                      {(m.services || []).slice(0, 3).map((s, i) => (
                        <span key={i} style={{ fontSize: 10.5, color: "#475569", background: "#f1f5f9", borderRadius: 6, padding: "2px 7px" }}>{s}</span>
                      ))}
                      {(m.services || []).length > 3 && <span style={{ fontSize: 10.5, color: "#64748b", background: "#f8fafc", borderRadius: 6, padding: "2px 5px" }}>+{(m.services || []).length - 3}</span>}
                    </div> : <span style={{ fontSize: 11, color: "#94a3b8" }}>Специализация не указана</span>}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 11, minHeight: 33 }}>
                    {phoneD ? (
                      <>
                        <a href={"tel:+" + phoneD} style={{ minWidth: 0, flex: "1 1 auto", textAlign: "center", textDecoration: "none", background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", borderRadius: 8, padding: "6px 8px", fontSize: 12, fontWeight: 750, whiteSpace: "nowrap" }}>📞 {_fmtPhone(m.phone)}</a>
                        <a href={"https://wa.me/" + phoneD} target="_blank" rel="noreferrer" style={{ flex: "0 0 auto", textDecoration: "none", background: "#ecfdf5", color: "#059669", border: "1px solid #a7f3d0", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 750 }}>WhatsApp</a>
                      </>
                    ) : (
                      <span style={{ width: "100%", fontSize: 11.5, color: "#94a3b8", background: "#f8fafc", borderRadius: 8, padding: "7px 10px" }}>📞 {_phoneStatusLabel(m)}</span>
                    )}
                  </div>
                  <div style={{ marginTop: "auto", paddingTop: 10, borderTop: "1px solid #f1f5f9", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    {m.url && <a href={m.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none", background: "#fff", color: "#64748b", border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700 }}>🔗 Объявление</a>}
                    {onOpenCrm && <MasterCrmButton crmData={crmData} source="olx" master={m} onOpen={onOpenCrm} />}
                  </div>
                </div>
              );
            })}
          </div>
          {filtered.length > limit && (
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <button onClick={() => setLimit(l => l + 60)} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 700, color: "#2563eb", cursor: "pointer", fontFamily: "inherit" }}>Показать ещё ({filtered.length - limit})</button>
            </div>
          )}
        </>
      )}
    </>
  );
}
