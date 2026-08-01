import { useState, useMemo } from "react";
import {
  buildPayrollReport, buildStaffDetail, expenseSubcategoryTotals,
  normalizeStaff, staffStatusMeta, STAFF_STATUSES, monthLabel,
} from "./payrollModel.js";

// ─────────────────────────────────────────────────────────────────────────────
// ФОТ — раздел «кому сколько ушло».
// Отдельный модуль: App.jsx и без того 16 000 строк. Данные приходят пропсами,
// сохранение делегируется наружу — внутри нет ни storage, ни знания о Firebase.
//
// props:
//   financeTx, workers, users — как есть из App
//   staff, saveStaff(list)                 — справочник сотрудников
//   subcategoryMap, saveSubcategoryMap(map) — соответствия «подкатегория → сотрудник»
//   fmt, genId, readOnly
// ─────────────────────────────────────────────────────────────────────────────

const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 16 };
const inp = { border: "1px solid #e2e8f0", borderRadius: 9, padding: "8px 11px", fontSize: 12.5, fontFamily: "inherit", width: "100%", boxSizing: "border-box" };
const lab = { fontSize: 10.5, color: "#94a3b8", fontWeight: 600, marginBottom: 4, display: "block" };
const th = { textAlign: "left", fontSize: 10, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: "#94a3b8", padding: "9px 12px", background: "#fafbfd", borderBottom: "1px solid #eef2f7", whiteSpace: "nowrap" };
const td = { padding: "10px 12px", fontSize: 12.5, borderBottom: "1px solid #f4f7fb", verticalAlign: "middle" };
const numCell = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
const pill = (color, bg) => ({ display: "inline-flex", alignItems: "center", gap: 5, borderRadius: 20, padding: "3px 9px", fontSize: 10.5, fontWeight: 800, color, background: bg, whiteSpace: "nowrap" });

const TABS = [
  { key: "report", label: "Кому сколько ушло" },
  { key: "staff",  label: "Сотрудники" },
  { key: "map",    label: "Разбор истории" },
];

export function PayrollModule({
  financeTx = [], workers = [], users = [], staff = [],
  saveStaff, subcategoryMap = {}, saveSubcategoryMap,
  fmt = (n) => Math.round(Number(n) || 0).toLocaleString("ru-RU"),
  genId = () => String(Date.now()) + Math.random().toString(36).slice(2, 8),
  readOnly = false,
}) {
  const [tab, setTab] = useState("report");
  const [openPerson, setOpenPerson] = useState(null);   // {kind,id,name}
  const money = (n) => `${fmt(Math.round(Number(n) || 0))} ₸`;

  const report = useMemo(
    () => buildPayrollReport(financeTx, { staff, workers, subcategoryMap }),
    [financeTx, staff, workers, subcategoryMap]);
  const subTotals = useMemo(() => expenseSubcategoryTotals(financeTx), [financeTx]);
  const detail = useMemo(() => openPerson
    ? buildStaffDetail(financeTx, {
        staffId: openPerson.kind === "staff" ? openPerson.id : null,
        workerId: openPerson.kind === "worker" ? openPerson.id : null,
        staff, workers, subcategoryMap })
    : null, [openPerson, financeTx, staff, workers, subcategoryMap]);

  // Последние месяцы — в таблице показываем три, остальное в «Всего».
  const lastMonths = report.months.slice(-3);
  const share = (v) => report.total > 0 ? Math.round((v / report.total) * 100) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setOpenPerson(null); }}
            style={{ border: `1px solid ${tab === t.key ? "#2563eb" : "#e2e8f0"}`,
              background: tab === t.key ? "#eff6ff" : "#fff", color: tab === t.key ? "#2563eb" : "#64748b",
              borderRadius: 9, padding: "7px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "report" && !openPerson && (
        <ReportTab report={report} lastMonths={lastMonths} money={money} share={share}
          onOpen={(r) => setOpenPerson({ kind: r.kind, id: r.id, name: r.name })} />
      )}
      {tab === "report" && openPerson && (
        <PersonCard person={openPerson} detail={detail} money={money} onBack={() => setOpenPerson(null)} />
      )}
      {tab === "staff" && (
        <StaffTab staff={staff} users={users} report={report} money={money}
          genId={genId} readOnly={readOnly} saveStaff={saveStaff} />
      )}
      {tab === "map" && (
        <MapTab subTotals={subTotals} staff={staff} subcategoryMap={subcategoryMap}
          money={money} readOnly={readOnly} saveSubcategoryMap={saveSubcategoryMap} />
      )}
    </div>
  );
}

// ── Отчёт ───────────────────────────────────────────────────────────────────
function ReportTab({ report, lastMonths, money, share, onOpen }) {
  const tile = (label, value, sub, color) => (
    <div style={{ ...card, padding: 14 }}>
      <div style={lab}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 900, color: color || "#0f172a", fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 5 }}>{sub}</div>}
    </div>
  );
  if (report.total === 0) return (
    <div style={{ ...card, color: "#94a3b8", fontSize: 13 }}>Расходных операций за период нет.</div>
  );
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12 }}>
        {tile("Всего расходов", money(report.total), `${report.rows.length} получателей`)}
        {tile("Сотрудникам", money(report.staffTotal), share(report.staffTotal) === null ? "" : `${share(report.staffTotal)}% расходов`, "#059669")}
        {tile("Подрядчикам", money(report.workerTotal), share(report.workerTotal) === null ? "" : `${share(report.workerTotal)}% расходов`, "#d97706")}
        {tile("Не разложено", money(report.unassigned),
          `${report.unassignedCount} операций${share(report.unassigned) === null ? "" : ` · ${share(report.unassigned)}%`}`,
          report.unassigned > 0 ? "#dc2626" : "#059669")}
      </div>

      {report.unassigned > 0 && (
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "10px 13px", fontSize: 12, color: "#78350f" }}>
          <b style={{ color: "#92400e" }}>{money(report.unassigned)}</b> пока не привязаны ни к кому.
          Разложить можно двумя способами: указать получателя в самой операции или связать подкатегорию с сотрудником во вкладке «Разбор истории».
        </div>
      )}

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 620 }}>
            <thead>
              <tr>
                <th style={th}>Получатель</th>
                <th style={th}>Кто это</th>
                {lastMonths.map(m => <th key={m} style={{ ...th, textAlign: "right" }}>{monthLabel(m)}</th>)}
                <th style={{ ...th, textAlign: "right" }}>Всего</th>
                <th style={{ ...th, textAlign: "right" }}>Операций</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map(r => (
                <tr key={r.key} onClick={() => onOpen(r)} title="Открыть карточку"
                  style={{ cursor: "pointer" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "#f8fafc"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                  <td style={td}>
                    <div style={{ fontWeight: 700, color: "#0f172a" }}>{r.name}</div>
                    {r.position && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>{r.position}</div>}
                  </td>
                  <td style={td}>
                    <span style={r.kind === "staff" ? pill("#059669", "#ecfdf5") : pill("#d97706", "#fffbeb")}>
                      {r.kind === "staff" ? "сотрудник" : "подрядчик"}
                    </span>
                    {/* Откуда взялась привязка: из самой операции или из соответствий.
                        Видно, кто уже переведён на новое поле, а кто держится на истории. */}
                    {r.source === "map" && <span style={{ ...pill("#64748b", "#f1f5f9"), marginLeft: 6 }}>по категории</span>}
                  </td>
                  {lastMonths.map(m => <td key={m} style={numCell}>{r.byMonth[m] ? money(r.byMonth[m]) : "—"}</td>)}
                  <td style={{ ...numCell, fontWeight: 800 }}>{money(r.total)}</td>
                  <td style={numCell}>{r.count}</td>
                </tr>
              ))}
              {report.unassigned > 0 && (
                <tr style={{ background: "#fffdf7" }}>
                  <td style={td}><div style={{ fontWeight: 700, color: "#92400e" }}>Не разложено</div></td>
                  <td style={td}><span style={pill("#d97706", "#fffbeb")}>получатель не указан</span></td>
                  {lastMonths.map(m => <td key={m} style={numCell}>—</td>)}
                  <td style={{ ...numCell, fontWeight: 800, color: "#92400e" }}>{money(report.unassigned)}</td>
                  <td style={numCell}>{report.unassignedCount}</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr style={{ background: "#fafbfd" }}>
                <td style={{ ...td, fontWeight: 800, borderTop: "1px solid #e2e8f0" }} colSpan={2}>Итого расходов</td>
                {lastMonths.map(m => (
                  <td key={m} style={{ ...numCell, fontWeight: 800, borderTop: "1px solid #e2e8f0" }}>
                    {money(report.rows.reduce((s, r) => s + (r.byMonth[m] || 0), 0))}
                  </td>
                ))}
                <td style={{ ...numCell, fontWeight: 900, borderTop: "1px solid #e2e8f0" }}>{money(report.total)}</td>
                <td style={{ ...numCell, borderTop: "1px solid #e2e8f0" }}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: "#94a3b8" }}>
        Итог таблицы равен итогу расходов: операции без получателя не выброшены, а показаны отдельной строкой.
      </div>
    </>
  );
}

// ── Карточка человека ───────────────────────────────────────────────────────
function PersonCard({ person, detail, money, onBack }) {
  const months = Object.keys(detail?.byMonth || {}).sort();
  const contracts = Object.entries(detail?.byContract || {}).sort((a, b) => b[1] - a[1]);
  const dt = (ms) => ms ? new Date(ms).toLocaleDateString("ru-RU") : "—";
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button onClick={onBack} style={{ background: "none", border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 14px", fontSize: 13, cursor: "pointer", color: "#64748b", fontFamily: "inherit" }}>← Назад</button>
        <div>
          <div style={{ fontSize: 16, fontWeight: 900, color: "#0f172a" }}>{person.name}</div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>{detail?.count || 0} операций · {money(detail?.total || 0)}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12 }}>
        <div style={card}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#334155", marginBottom: 10 }}>По месяцам</div>
          {months.length === 0 ? <div style={{ fontSize: 12, color: "#94a3b8" }}>Нет данных</div> : months.map(m => {
            const max = Math.max(...months.map(x => detail.byMonth[x]), 1);
            return (
              <div key={m} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 3 }}>
                  <span style={{ color: "#334155", fontWeight: 600 }}>{monthLabel(m)}</span>
                  <span style={{ color: "#64748b", fontVariantNumeric: "tabular-nums" }}>{money(detail.byMonth[m])}</span>
                </div>
                <div style={{ height: 6, background: "#f1f5f9", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${Math.round(detail.byMonth[m] / max * 100)}%`, height: "100%", background: "#2563eb", borderRadius: 4 }} />
                </div>
              </div>
            );
          })}
        </div>
        <div style={card}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#334155", marginBottom: 10 }}>По договорам</div>
          {contracts.length === 0 ? <div style={{ fontSize: 12, color: "#94a3b8" }}>Нет данных</div> : contracts.slice(0, 8).map(([cn, v]) => (
            <div key={cn} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, padding: "5px 0", borderBottom: "1px solid #f4f7fb" }}>
              <span style={{ color: "#334155", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cn}</span>
              <span style={{ color: "#64748b", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{money(v)}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto", maxHeight: 420 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 560 }}>
            <thead><tr>
              <th style={th}>Дата</th><th style={th}>Подкатегория</th><th style={th}>Договор</th>
              <th style={th}>Комментарий</th><th style={{ ...th, textAlign: "right" }}>Сумма</th>
            </tr></thead>
            <tbody>
              {(detail?.ops || []).map(o => (
                <tr key={o.id}>
                  <td style={{ ...td, whiteSpace: "nowrap", color: "#64748b" }}>{dt(o.date)}</td>
                  <td style={td}>{o.subcategory || "—"}</td>
                  <td style={{ ...td, color: "#64748b" }}>{o.contractNo || "—"}</td>
                  <td style={{ ...td, color: "#94a3b8", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.comment || ""}</td>
                  <td style={{ ...numCell, fontWeight: 700 }}>{money(o.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ── Справочник сотрудников ──────────────────────────────────────────────────
function StaffTab({ staff, users, report, money, genId, readOnly, saveStaff }) {
  const [draft, setDraft] = useState(null);   // редактируемый сотрудник
  const paidOf = (id) => (report.rows.find(r => r.kind === "staff" && r.id === id) || {}).total || 0;
  const commit = async (next) => { if (saveStaff) await saveStaff(next); };

  const startNew = () => setDraft(normalizeStaff({ id: genId(), status: "active" }));
  const save = async () => {
    if (!draft || !draft.name.trim()) { window.alert("Укажите имя сотрудника."); return; }
    const rec = normalizeStaff({ ...draft, updatedAt: Date.now() });
    const exists = staff.some(s => s.id === rec.id);
    await commit(exists ? staff.map(s => s.id === rec.id ? rec : s) : [...staff, rec]);
    setDraft(null);
  };
  const remove = async (s) => {
    if (!window.confirm(`Удалить «${s.name}» из справочника?\n\nОперации и суммы останутся на месте — пропадёт только имя.`)) return;
    await commit(staff.filter(x => x.id !== s.id));
  };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>Сотрудники</div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>Кто получает зарплату. Подрядчики — в своём справочнике, в «Админке».</div>
        </div>
        <span style={{ flex: 1 }} />
        {!readOnly && <button onClick={startNew} style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 9, padding: "8px 16px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ Сотрудник</button>}
      </div>

      {draft && (
        <div style={{ ...card, borderColor: "#bfdbfe", background: "#f8fbff" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 11 }}>
            <div><span style={lab}>Имя</span>
              <input style={inp} value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="Фамилия Имя" /></div>
            <div><span style={lab}>Должность</span>
              <input style={inp} value={draft.position} onChange={e => setDraft(d => ({ ...d, position: e.target.value }))} placeholder="РОП, менеджер…" /></div>
            <div><span style={lab}>Учётная запись</span>
              <select style={inp} value={draft.userId} onChange={e => setDraft(d => ({ ...d, userId: e.target.value }))}>
                <option value="">— нет входа в систему —</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name} · {u.role}</option>)}
              </select></div>
            <div><span style={lab}>Дата приёма</span>
              <input type="date" style={inp} value={draft.hiredAt} onChange={e => setDraft(d => ({ ...d, hiredAt: e.target.value }))} /></div>
            <div><span style={lab}>Статус</span>
              <select style={inp} value={draft.status} onChange={e => setDraft(d => ({ ...d, status: e.target.value }))}>
                {STAFF_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select></div>
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", margin: "9px 0 12px" }}>
            Учётная запись нужна, чтобы связать человека с полем «менеджер» на объектах. Без неё сотрудник просто получает выплаты.
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setDraft(null)} style={{ background: "#f3f4f6", color: "#64748b", border: "none", borderRadius: 9, padding: "8px 15px", fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>Отмена</button>
            <button onClick={save} style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 9, padding: "8px 18px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Сохранить</button>
          </div>
        </div>
      )}

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        {staff.length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
            Справочник пуст. Добавьте сотрудников — и выплаты начнут раскладываться по именам.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 620 }}>
              <thead><tr>
                <th style={th}>Сотрудник</th><th style={th}>Должность</th><th style={th}>Учётная запись</th>
                <th style={{ ...th, textAlign: "right" }}>Выплачено</th><th style={th}>Статус</th><th style={th}></th>
              </tr></thead>
              <tbody>
                {staff.map(s => {
                  const u = users.find(x => x.id === s.userId);
                  const meta = staffStatusMeta(s.status);
                  return (
                    <tr key={s.id}>
                      <td style={td}>
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>{s.name || "Без имени"}</div>
                        {s.hiredAt && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>с {new Date(s.hiredAt).toLocaleDateString("ru-RU")}</div>}
                      </td>
                      <td style={td}>{s.position || "—"}</td>
                      <td style={td}>{u ? <span style={pill("#2563eb", "#eff6ff")}>{u.role}</span> : <span style={pill("#64748b", "#f1f5f9")}>нет входа</span>}</td>
                      <td style={{ ...numCell, fontWeight: 700 }}>{paidOf(s.id) ? money(paidOf(s.id)) : "—"}</td>
                      <td style={td}><span style={pill(meta.color, meta.bg)}>{meta.label}</span></td>
                      <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                        {!readOnly && <>
                          <button onClick={() => setDraft(normalizeStaff(s))} style={{ background: "none", border: "1px solid #e2e8f0", borderRadius: 7, padding: "4px 10px", fontSize: 11.5, cursor: "pointer", color: "#64748b", fontFamily: "inherit", marginRight: 6 }}>Изменить</button>
                          <button onClick={() => remove(s)} style={{ background: "none", border: "1px solid #fecaca", borderRadius: 7, padding: "4px 10px", fontSize: 11.5, cursor: "pointer", color: "#dc2626", fontFamily: "inherit" }}>Удалить</button>
                        </>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

// ── Разбор истории ──────────────────────────────────────────────────────────
function MapTab({ subTotals, staff, subcategoryMap, money, readOnly, saveSubcategoryMap }) {
  const [local, setLocal] = useState(subcategoryMap);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(local) !== JSON.stringify(subcategoryMap);
  const set = (sub, id) => setLocal(m => { const n = { ...m }; if (id) n[sub] = id; else delete n[sub]; return n; });
  const apply = async () => {
    if (!saveSubcategoryMap) return;
    setSaving(true);
    try { await saveSubcategoryMap(local); } finally { setSaving(false); }
  };
  const mappedSum = subTotals.filter(s => local[s.subcategory]).reduce((a, s) => a + s.total, 0);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>Кто стоит за подкатегорией</div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>Сами операции не меняются. Соответствие используется только при чтении отчёта.</div>
        </div>
        <span style={{ flex: 1 }} />
        {!readOnly && (
          <button onClick={apply} disabled={!dirty || saving}
            style={{ background: dirty && !saving ? "#2563eb" : "#cbd5e1", color: "#fff", border: "none", borderRadius: 9,
              padding: "8px 18px", fontSize: 12.5, fontWeight: 700, cursor: dirty && !saving ? "pointer" : "default", fontFamily: "inherit" }}>
            {saving ? "Сохраняю…" : dirty ? "Сохранить соответствия" : "Сохранено"}
          </button>
        )}
      </div>

      <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "10px 13px", fontSize: 12, color: "#1e3a8a" }}>
        Разложено по этой таблице: <b>{money(mappedSum)}</b>. Операции переписывать не нужно —
        если у операции указан получатель явно, он всегда сильнее этой таблицы.
      </div>

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 620 }}>
            <thead><tr>
              <th style={th}>Подкатегория расхода</th><th style={th}>Категория</th>
              <th style={{ ...th, textAlign: "right" }}>Операций</th><th style={{ ...th, textAlign: "right" }}>Сумма</th><th style={th}>Это</th>
            </tr></thead>
            <tbody>
              {subTotals.map(s => (
                <tr key={s.subcategory} style={local[s.subcategory] ? { background: "#f8fffb" } : undefined}>
                  <td style={{ ...td, fontWeight: 600, color: "#0f172a" }}>{s.subcategory}</td>
                  <td style={{ ...td, color: "#94a3b8", fontSize: 11.5 }}>{s.category || "—"}</td>
                  <td style={numCell}>{s.count}</td>
                  <td style={{ ...numCell, fontWeight: 700 }}>{money(s.total)}</td>
                  <td style={{ ...td, minWidth: 210 }}>
                    <select disabled={readOnly} value={local[s.subcategory] || ""} onChange={e => set(s.subcategory, e.target.value)}
                      style={{ ...inp, padding: "6px 9px", fontSize: 12 }}>
                      <option value="">— не задано —</option>
                      {staff.map(p => <option key={p.id} value={p.id}>{p.name || "Без имени"}{p.position ? ` · ${p.position}` : ""}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: "#94a3b8" }}>
        Подкатегорию, по которой платят разным людям (например «Зарплаты рабочих / подрядчиков»),
        связывать с одним человеком не нужно — она разложится сама, когда в операциях начнут указывать получателя.
      </div>
    </>
  );
}

export default PayrollModule;
