// Журнал изменений: общий (Админка) и срез по объекту. Перенос из App.jsx.
import { useEffect, useState } from "react";
import { storage } from "../cloud/storage.js";
import { AUDIT_SECTION_META, AUDIT_SOURCE_META, _auditActionMeta, _auditVal } from "../constants.js";
import { _auditYM, downloadCSV } from "../format.js";
import { AUDIT_INDEX_KEY, AUDIT_KEY, AUDIT_MONTH_KEY } from "../storageKeys.js";
import { splitAuditMonths } from "../utils.js";

// Журнал изменений. Без objectId — общий (Админка, только админ), с помесячным выбором и фильтрами.
// С objectId — компактный срез по конкретному объекту (все месяцы + архив).
export function AuditTab({ objectId = null }) {
  const embed = !!objectId;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState([]);      // ["2026-07", ...] newest-first
  const [month, setMonth] = useState("");         // выбранный; "__legacy__" = архив
  const [fEntity, setFEntity] = useState("");
  const [fUser, setFUser] = useState("");
  const [q, setQ] = useState("");

  const readKey = async (k) => { try { const r = await storage.get(k); if (r) { const p = JSON.parse(r.value); if (Array.isArray(p)) return p; } } catch {} return []; };

  // Индекс месяцев (для селектора / обхода при embed)
  useEffect(() => {
    (async () => {
      let idx = await readKey(AUDIT_INDEX_KEY);
      if (!Array.isArray(idx)) idx = [];
      const cur = _auditYM();
      idx = [...new Set([cur, ...idx])].sort().reverse();
      // СРОК ХРАНЕНИЯ. Журнал рос бы вечно: помесячные ключи накапливаются, а каждая
      // запись переписывает весь месяц целиком. Держим последние четыре месяца — этого
      // хватает разобрать любой спор «кто поменял сумму». Чистим только при ОТКРЫТИИ
      // полного журнала (не во встроенном виде в карточке объекта), то есть по явному
      // заходу человека, а не фоном.
      if (!embed) {
        const split = splitAuditMonths(idx, cur);
        if (split.drop.length) {
          for (const ym of split.drop) {
            try { await storage.setCloudOnly(AUDIT_MONTH_KEY(ym), null); } catch {}
          }
          idx = split.keep;
          try { await storage.set(AUDIT_INDEX_KEY, JSON.stringify(idx)); } catch {}
        }
      }
      setMonths(idx);
      if (!embed) setMonth((m) => m || idx[0] || cur);
    })();
  }, [embed]);

  // Загрузка записей
  useEffect(() => {
    (async () => {
      setLoading(true);
      let out = [];
      if (embed) {
        // все месяцы (макс. 12 последних) + архив, фильтр по объекту
        const keys = [...months.slice(0, 12).map(AUDIT_MONTH_KEY), AUDIT_KEY];
        for (const k of keys) out.push(...await readKey(k));
        out = out.filter(e => (e.objectId && e.objectId === objectId) || e.entityId === objectId);
      } else {
        if (!month) { setLoading(false); return; }
        out = month === "__legacy__" ? await readKey(AUDIT_KEY) : await readKey(AUDIT_MONTH_KEY(month));
      }
      out.sort((a, b) => (b.ts || 0) - (a.ts || 0));
      setRows(out);
      setLoading(false);
    })();
  }, [embed, objectId, month, months]);

  const users = [...new Set(rows.map(e => e.by).filter(Boolean))];
  const sections = [...new Set(rows.map(e => e.entity).filter(Boolean))];
  const filtered = rows.filter(e => {
    if (fEntity && e.entity !== fEntity) return false;
    if (fUser && e.by !== fUser) return false;
    if (q) {
      const hay = [e.by, e.label, e.detail, e.field, e.action, e.old, e.new].map(x => String(x || "").toLowerCase()).join(" ");
      if (!hay.includes(q.toLowerCase().trim())) return false;
    }
    return true;
  });

  const monthLabel = (ym) => {
    if (ym === "__legacy__") return "🗄 Архив (старое)";
    const [y, m] = ym.split("-");
    const nm = ["", "янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"][+m] || m;
    return `${nm} ${y}`;
  };

  const renderEntry = (e, i) => {
    const sm = AUDIT_SECTION_META[e.entity] || { label: e.entity || "—", color: "#64748b", bg: "#f1f5f9", icon: "📝" };
    const am = _auditActionMeta(e.action);
    const src = AUDIT_SOURCE_META[e.source] || null;
    const _hasVal = (v) => v !== undefined && v !== null && v !== "";
    const showDiff = _hasVal(e.old) || _hasVal(e.new);
    return (
      <div key={i} style={{ background: "#fff", border: "1px solid #f1f5f9", borderRadius: 10, padding: "10px 13px", display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: sm.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>{sm.icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 3 }}>
            <span style={{ fontSize: 9.5, fontWeight: 700, color: sm.color, background: sm.bg, padding: "1px 7px", borderRadius: 20, border: `1px solid ${sm.color}30` }}>{sm.label}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: am.color }}>{am.icon} {e.action}{e.field ? <span style={{ color: "#0f172a" }}> · {e.field}</span> : null}</span>
            {src && <span style={{ fontSize: 9.5, fontWeight: 700, color: src.color, background: src.color + "14", padding: "1px 7px", borderRadius: 20 }}>{src.label}</span>}
          </div>
          {e.label && <div style={{ fontSize: 12, color: "#334155", marginBottom: showDiff ? 4 : 0, overflowWrap: "break-word" }}>{e.label}</div>}
          {showDiff && (
            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", fontSize: 12, marginBottom: 2 }}>
              <span style={{ background: "#fef2f2", color: "#b91c1c", padding: "1px 8px", borderRadius: 6, textDecoration: "line-through", overflowWrap: "anywhere" }}>{_auditVal(e.old)}</span>
              <span style={{ color: "#94a3b8" }}>→</span>
              <span style={{ background: "#f0fdf4", color: "#15803d", padding: "1px 8px", borderRadius: 6, fontWeight: 700, overflowWrap: "anywhere" }}>{_auditVal(e.new)}</span>
            </div>
          )}
          <div style={{ fontSize: 11.5, color: "#0f172a" }}><b style={{ color: "#2563eb" }}>{e.by}</b>{e.detail ? <span style={{ color: "#64748b", fontWeight: 400 }}> · {e.detail}</span> : null}</div>
        </div>
        <div style={{ fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap", flexShrink: 0, textAlign: "right" }}>
          <div>{new Date(e.ts).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit" })}</div>
          <div>{new Date(e.ts).toLocaleString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</div>
        </div>
      </div>
    );
  };

  const selStyle = { fontSize: 12, padding: "5px 9px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: "#334155", fontFamily: "inherit", cursor: "pointer" };

  if (embed) {
    // Компактный срез по объекту
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {loading && <div style={{ color: "#94a3b8", textAlign: "center", padding: "20px 0", fontSize: 13 }}>Загрузка журнала…</div>}
        {!loading && filtered.length === 0 && <div style={{ color: "#94a3b8", textAlign: "center", padding: "20px 0", fontSize: 13 }}>Изменений по объекту пока нет</div>}
        {filtered.map(renderEntry)}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>Журнал изменений</div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <select value={month} onChange={e => setMonth(e.target.value)} style={selStyle}>
            {months.map(ym => <option key={ym} value={ym}>{monthLabel(ym)}</option>)}
            <option value="__legacy__">{monthLabel("__legacy__")}</option>
          </select>
          <select value={fUser} onChange={e => setFUser(e.target.value)} style={selStyle}>
            <option value="">Все пользователи</option>
            {users.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск: объект, договор…" style={{ ...selStyle, cursor: "text", minWidth: 150 }} />
        </div>
      </div>
      {/* Фильтр по разделу */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
        <button onClick={() => setFEntity("")} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, border: "1px solid #e2e8f0", background: fEntity === "" ? "#0f172a" : "#f8fafc", color: fEntity === "" ? "#fff" : "#64748b", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Все</button>
        {sections.map(s => { const m = AUDIT_SECTION_META[s]; if (!m) return null; return (
          <button key={s} onClick={() => setFEntity(s === fEntity ? "" : s)} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, border: `1px solid ${m.color}40`, background: fEntity === s ? m.color : m.bg, color: fEntity === s ? "#fff" : m.color, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>{m.icon} {m.label}</button>
        ); })}
        <span style={{ fontSize: 11, color: "#94a3b8" }}>{filtered.length} событий</span>
      </div>
      {loading && <div style={{ color: "#94a3b8", textAlign: "center", padding: "30px 0" }}>Загрузка…</div>}
      {!loading && filtered.length === 0 && <div style={{ color: "#94a3b8", textAlign: "center", padding: "30px 0" }}>Событий не найдено</div>}
      {filtered.map(renderEntry)}
      {filtered.length > 0 && <button onClick={() => downloadCSV("journal_" + (month === "__legacy__" ? "archive" : month) + ".csv", ["Дата", "Кто", "Раздел", "Действие", "Поле", "Было", "Стало", "Источник", "Объект/детали"], filtered.map(e => [new Date(e.ts).toLocaleString("ru-RU"), e.by, AUDIT_SECTION_META[e.entity]?.label || e.entity || "", e.action, e.field || "", _auditVal(e.old), _auditVal(e.new), AUDIT_SOURCE_META[e.source]?.label || e.source || "", e.label || e.detail || ""]))} style={{ alignSelf: "flex-start", background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginTop: 4 }}>⬇ Экспорт (CSV)</button>}
    </div>
  );
}
