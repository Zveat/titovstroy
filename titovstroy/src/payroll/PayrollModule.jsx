import { useState, useMemo } from "react";
import {
  buildPayrollReport, buildStaffDetail, expenseSubcategoryTotals,
  normalizeStaff, staffStatusMeta, STAFF_STATUSES, monthLabel,
} from "./payrollModel.js";
import { normalizeScheme, PERCENT_TRIGGERS, schemeIsEmpty } from "./payrollAccruals.js";
import { AccrualsTab } from "./PayrollAccrualsTab.jsx";
import { AssignTab } from "./PayrollAssignTab.jsx";
import { BalanceTab } from "./PayrollBalanceTab.jsx";
import {
  C, card, cardFlat, inp, lab, th, td, numCell, pill, btnPrimary, btnGhost, btnDanger,
  segWrap, seg, avatarOf, avatarStyle, sectionTitle, sectionHint,
  shadow, shell, sharePill, runSave,
} from "./payrollUi.js";

// ─────────────────────────────────────────────────────────────────────────────
// ФОТ — раздел «кому сколько ушло».
// Отдельный модуль: App.jsx и без того 16 000 строк. Данные приходят пропсами,
// сохранение делегируется наружу — внутри нет ни storage, ни знания о Firebase.
//
// props:
//   financeTx, workers, users — как есть из App
//   staff, saveStaff(list)                 — справочник сотрудников
//   subcategoryMap, saveSubcategoryMap(map) — постоянные правила «подкатегория → сотрудник»
//   accruals, saveAccruals(list)            — начисления
//   saveFinanceTx(list)                     — нужен только для простановки получателя пачкой
//   fmt, genId, readOnly
// ─────────────────────────────────────────────────────────────────────────────

const TABS = [
  { key: "report",   label: "Кому сколько ушло" },
  { key: "accruals", label: "Начисления" },
  { key: "balance",  label: "Долги" },
  { key: "staff",    label: "Сотрудники" },
  { key: "map",      label: "Разложить операции" },
];

export function PayrollModule({
  financeTx = [], workers = [], users = [], staff = [],
  saveStaff, subcategoryMap = {}, saveSubcategoryMap,
  // Начисления: свой список + справочные данные для расчёта бонусов. Всё только на чтение —
  // объекты, производство и финпроекты этот раздел не меняет никогда.
  accruals = [], saveAccruals, objects = [], productions = [], finProjects = [], contracts = [],
  saveFinanceTx,
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

  // Сколько месяцев показывать колонками. Раньше жёстко три, и на вопрос «почему
  // с мая, а не раньше» ответить было нечем: данных в базе 10 месяцев.
  const [monthsShown, setMonthsShown] = useState(3);
  const lastMonths = monthsShown === 0 ? report.months : report.months.slice(-monthsShown);

  return (
    <div style={{ ...shell, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ ...segWrap, flexWrap: "wrap", maxWidth: "100%" }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setOpenPerson(null); }} style={seg(tab === t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Режим чтения раньше просто прятал кнопки, и раздел выглядел сломанным:
          выпадашки не нажимаются, «+ Сотрудник» нет — а почему, неизвестно. */}
      {readOnly && (
        <div style={{ background: C.bg, border: `1px solid ${C.line}`, borderRadius: 12, padding: "11px 15px", fontSize: 12.5, color: C.mute, display: "flex", gap: 9 }}>
          <span style={{ fontSize: 14 }}>🔒</span><span>Только просмотр: менять справочник, соответствия и начисления нельзя.
          Нужны права «Финансы: редактирование», и вкладка должна быть активным редактором.</span>
        </div>
      )}

      {tab === "report" && !openPerson && (
        <ReportTab report={report} lastMonths={lastMonths} money={money}
          monthsShown={monthsShown} setMonthsShown={setMonthsShown}
          onOpen={(r) => setOpenPerson({ kind: r.kind, id: r.id, name: r.name })} />
      )}
      {tab === "report" && openPerson && (
        <PersonCard person={openPerson} detail={detail} money={money} onBack={() => setOpenPerson(null)} />
      )}
      {tab === "accruals" && (
        <AccrualsTab staff={staff} accruals={accruals} objects={objects} productions={productions}
          finProjects={finProjects} contracts={contracts} money={money} genId={genId}
          readOnly={readOnly} saveAccruals={saveAccruals} />
      )}
      {tab === "balance" && (
        <BalanceTab staff={staff} accruals={accruals} report={report} money={money} />
      )}
      {tab === "staff" && (
        <StaffTab staff={staff} users={users} report={report} money={money}
          genId={genId} readOnly={readOnly} saveStaff={saveStaff} />
      )}
      {tab === "map" && (
        <AssignTab financeTx={financeTx} saveFinanceTx={saveFinanceTx} staff={staff} workers={workers}
          subTotals={subTotals} subcategoryMap={subcategoryMap} saveSubcategoryMap={saveSubcategoryMap}
          saveStaff={saveStaff} genId={genId} money={money} readOnly={readOnly}
          onGoStaff={() => setTab("staff")} />
      )}
    </div>
  );
}

// ── Отчёт ───────────────────────────────────────────────────────────────────
function ReportTab({ report, lastMonths, money, onOpen, monthsShown, setMonthsShown }) {
  // Основа расчёта. По умолчанию — ЗАРПЛАТА: раздел про ФОТ, и вычитать дивиденды
  // из «всего» в уме, чтобы узнать зарплату, — не работа отчёта.
  const [basis, setBasis] = useState("wage");
  const wage = basis === "wage";
  const hasNonWage = report.nonWageTotal > 0;
  // Всё ниже читается по выбранной основе, поэтому таблица всегда сходится сама с собой:
  // сумма строк + «не разложено» = итог.
  const B = wage ? {
    grand: report.wageTotal,
    byMonth: report.wageByMonthTotal,
    staff: report.staffWage, worker: report.workerWage,
    unassigned: report.unassignedWage, unassignedCount: report.unassignedWageCount,
    unassignedByMonth: report.unassignedWageByMonth,
    rowTotal: (r) => r.wage, rowByMonth: (r) => r.wageByMonth,
    grandLabel: "Зарплата всего", footLabel: "Итого зарплата",
  } : {
    grand: report.total,
    byMonth: report.totalByMonth,
    staff: report.staffTotal, worker: report.workerTotal,
    unassigned: report.unassigned, unassignedCount: report.unassignedCount,
    unassignedByMonth: report.unassignedByMonth,
    rowTotal: (r) => r.total, rowByMonth: (r) => r.byMonth,
    grandLabel: "Всего расходов", footLabel: "Итого расходов",
  };
  const share = (v) => B.grand > 0 ? Math.round((v / B.grand) * 100) : null;
  const visibleRows = report.rows.filter(r => B.rowTotal(r) > 0);
  // Плитка с цветной шапкой-полоской: смысл цифры читается до того, как прочитан
  // заголовок. Крупный кегль и tabular-nums — чтобы суммы сравнивались взглядом.
  // Иконка слева даёт плитке центр тяжести: без неё цифра болталась в пустоте,
  // особенно на широком мониторе.
  const tile = (icon, label, value, sub, color) => (
    <div style={{ ...card, padding: 16, display: "flex", gap: 13, alignItems: "flex-start" }}>
      <span style={{ width: 36, height: 36, borderRadius: 11, flexShrink: 0, fontSize: 16,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        background: `${color || C.accent}12` }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <div style={lab}>{label}</div>
        <div style={{ fontSize: 21, fontWeight: 900, color: color || C.ink, fontVariantNumeric: "tabular-nums", letterSpacing: "-.02em", lineHeight: 1.2 }}>{value}</div>
        {sub && <div style={{ fontSize: 11.5, color: C.faint, marginTop: 5 }}>{sub}</div>}
      </div>
    </div>
  );
  if (report.total === 0) return (
    <div style={{ ...card, color: C.faint, fontSize: 13 }}>Расходных операций за период нет.</div>
  );
  return (
    <>
      <div>
        <div style={sectionTitle}>Кому сколько ушло</div>
        <div style={sectionHint}>
          {wage ? "Зарплатная часть расходов в разрезе по людям." : "Все выплаты людям, включая не зарплатные."}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 12 }}>
        {tile("💰", B.grandLabel, money(B.grand),
          wage && hasNonWage ? `не зарплата отдельно: ${money(report.nonWageTotal)}` : `${visibleRows.length} получателей`)}
        {tile("🧑‍💼", "Сотрудникам", money(B.staff), share(B.staff) === null ? "" : `${share(B.staff)}% от итога`, C.green)}
        {tile("🔧", "Подрядчикам", money(B.worker), share(B.worker) === null ? "" : `${share(B.worker)}% от итога`, C.amber)}
        {tile("❓", "Не разложено", money(B.unassigned),
          `${B.unassignedCount} операций${share(B.unassigned) === null ? "" : ` · ${share(B.unassigned)}%`}`,
          B.unassigned > 0 ? C.red : C.green)}
      </div>

      {/* Переключатель основы. Отдельная строка, а не мелкая ссылка: от неё зависит
          КАЖДАЯ цифра в таблице. */}
      <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", padding: "0 2px" }}>
        {hasNonWage && (
          <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11.5, color: C.faint, fontWeight: 700 }}>Считать</span>
            <div style={segWrap}>
              {[["wage", "только зарплату"], ["all", "все выплаты"]].map(([k, label]) => (
                <button key={k} onClick={() => setBasis(k)} style={{ ...seg(basis === k), padding: "5px 13px", fontSize: 12 }}>{label}</button>
              ))}
            </div>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11.5, color: C.faint, fontWeight: 700 }}>Месяцев</span>
          <div style={segWrap}>
            {[3, 6, 12, 0].map(n => (
              <button key={n} onClick={() => setMonthsShown(n)} style={{ ...seg(monthsShown === n), padding: "5px 12px", fontSize: 12 }}>
                {n === 0 ? `все · ${report.months.length}` : n}
              </button>
            ))}
          </div>
        </div>
        <span style={{ flex: 1 }} />
        {hasNonWage && (
          <span style={{ fontSize: 11.5, color: C.amber }}>
            {wage ? `не зарплата ${money(report.nonWageTotal)} — вне расчёта` : `включая не зарплату ${money(report.nonWageTotal)}`}
          </span>
        )}
      </div>

      {B.unassigned > 0 && (
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "10px 13px", fontSize: 12, color: "#78350f" }}>
          <b style={{ color: "#92400e" }}>{money(B.unassigned)}</b> пока не привязаны ни к кому.
          Вкладка «Разложить операции» — отфильтровать, выделить пачкой и проставить получателя одним действием.
        </div>
      )}

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 620 }}>
            <thead>
              <tr>
                <th style={th}>Получатель</th>
                {lastMonths.map(m => <th key={m} style={{ ...th, textAlign: "right" }}>{monthLabel(m)}</th>)}
                <th style={{ ...th, textAlign: "right" }}>Всего</th>
                <th style={{ ...th, textAlign: "right" }}>Операций</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(r => (
                <tr key={r.key} onClick={() => onOpen(r)} title="Открыть карточку"
                  style={{ cursor: "pointer", transition: "background .1s" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "#fafbff"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                  {/* Всё о человеке — в одной ячейке. Отдельная колонка «кто это» держала
                      треть ширины ради двух пилюль и оставляла пустоту между данными. */}
                  <td style={{ ...td, minWidth: 260 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                      {(() => { const a = avatarOf(r.name); return <span style={avatarStyle(a.color)}>{a.initials}</span>; })()}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 700, color: C.ink, fontSize: 13.5 }}>{r.name}</span>
                          <span style={r.kind === "staff" ? pill(C.green, C.greenSoft) : pill(C.amber, C.amberSoft)}>
                            {r.kind === "staff" ? "сотрудник" : "подрядчик"}
                          </span>
                          {/* Откуда взялась привязка: из самой операции или из соответствий. */}
                          {r.source === "map" && <span style={pill(C.mute, C.lineSoft)}>по категории</span>}
                        </div>
                        <div style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>
                          {r.position || "—"}
                          {/* В зарплатной основе дивиденды в цифру не входят вовсе — просто
                              сообщаем, что у человека они есть, чтобы это не выглядело потерей. */}
                          {r.nonWage > 0 && (
                            <span style={{ color: C.amber }}>
                              {" · "}{wage ? `не зарплата вне расчёта ${money(r.nonWage)}` : `в т.ч. не зарплата ${money(r.nonWage)}`}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  {lastMonths.map(m => <td key={m} style={numCell}>{B.rowByMonth(r)[m] ? money(B.rowByMonth(r)[m]) : "—"}</td>)}
                  <td style={{ ...numCell, fontWeight: 800, fontSize: 14, color: C.ink }}>
                    {money(B.rowTotal(r))}
                    {share(B.rowTotal(r)) !== null && (
                      <span style={sharePill(share(B.rowTotal(r)))}>{share(B.rowTotal(r))}%</span>
                    )}
                  </td>
                  <td style={{ ...numCell, color: C.faint }}>{r.count}</td>
                </tr>
              ))}
              {B.unassigned > 0 && (
                <tr style={{ background: "#fffdf5" }}>
                  <td style={td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                      <span style={{ ...avatarStyle(C.amber), borderRadius: 10 }}>?</span>
                      <div>
                        <div style={{ fontWeight: 700, color: "#92400e", fontSize: 13.5 }}>Не разложено</div>
                        <div style={{ fontSize: 11, color: C.amber, marginTop: 2 }}>получатель не указан</div>
                      </div>
                    </div>
                  </td>
                  {lastMonths.map(m => (
                    <td key={m} style={numCell}>
                      {B.unassignedByMonth[m] ? money(B.unassignedByMonth[m]) : "—"}
                    </td>
                  ))}
                  <td style={{ ...numCell, fontWeight: 800, color: "#92400e" }}>{money(B.unassigned)}</td>
                  <td style={numCell}>{B.unassignedCount}</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr style={{ background: "#fbfcfe" }}>
                <td style={{ ...td, fontWeight: 800, borderTop: `1px solid ${C.line}` }} >{B.footLabel}</td>
                {/* Итог месяца — ВЕСЬ расход месяца, вместе с «не разложено»: столбец,
                    считающий только именованные строки, врал бы в меньшую сторону. */}
                {lastMonths.map(m => (
                  <td key={m} style={{ ...numCell, fontWeight: 800, borderTop: `1px solid ${C.line}` }}>
                    {money(B.byMonth[m] || 0)}
                  </td>
                ))}
                <td style={{ ...numCell, fontWeight: 900, borderTop: `1px solid ${C.line}` }}>{money(B.grand)}</td>
                <td style={{ ...numCell, borderTop: `1px solid ${C.line}` }}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: C.faint }}>
        {wage ? "Итог таблицы равен зарплатной части расходов" : "Итог таблицы равен итогу расходов"}: операции без получателя не выброшены, а показаны отдельной строкой.
        {report.months.length > lastMonths.length && ` Показаны последние ${lastMonths.length} мес. из ${report.months.length}; «Всего» — за всю историю.`}
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
        <button onClick={onBack} style={btnGhost}>← Назад</button>
      </div>

      <div style={{ ...card, display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        {(() => { const a = avatarOf(person.name); return (
          <span style={{ ...avatarStyle(a.color), width: 52, height: 52, borderRadius: 15, fontSize: 18 }}>{a.initials}</span>
        ); })()}
        <div style={{ minWidth: 160 }}>
          <div style={{ fontSize: 19, fontWeight: 900, color: C.ink, letterSpacing: "-.02em" }}>{person.name}</div>
          <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>{detail?.count || 0} операций</div>
        </div>
        <span style={{ flex: 1 }} />
        {/* Зарплата и «не зарплата» — врозь и обе крупно: складывать в уме не нужно. */}
        <div style={{ display: "flex", gap: 26, flexWrap: "wrap" }}>
          {detail?.nonWage > 0 && (
            <div>
              <div style={lab}>Зарплата</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: C.green, fontVariantNumeric: "tabular-nums" }}>{money(detail.wage)}</div>
            </div>
          )}
          {detail?.nonWage > 0 && (
            <div>
              <div style={lab}>Не зарплата</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: C.amber, fontVariantNumeric: "tabular-nums" }}>{money(detail.nonWage)}</div>
            </div>
          )}
          <div>
            <div style={lab}>Всего выплачено</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: C.ink, fontVariantNumeric: "tabular-nums" }}>{money(detail?.total || 0)}</div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12 }}>
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.ink, marginBottom: 12 }}>По месяцам</div>
          {months.length === 0 ? <div style={{ fontSize: 12, color: C.faint }}>Нет данных</div> : months.map(m => {
            const max = Math.max(...months.map(x => detail.byMonth[x]), 1);
            return (
              <div key={m} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 3 }}>
                  <span style={{ color: C.ink2, fontWeight: 600 }}>{monthLabel(m)}</span>
                  <span style={{ color: C.mute, fontVariantNumeric: "tabular-nums" }}>{money(detail.byMonth[m])}</span>
                </div>
                <div style={{ height: 7, background: C.lineSoft, borderRadius: 999, overflow: "hidden" }}>
                  <div style={{ width: `${Math.round(detail.byMonth[m] / max * 100)}%`, height: "100%",
                    background: `linear-gradient(90deg, ${C.accent}, #6366f1)`, borderRadius: 999 }} />
                </div>
              </div>
            );
          })}
        </div>
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.ink, marginBottom: 12 }}>По договорам</div>
          {contracts.length === 0 ? <div style={{ fontSize: 12, color: C.faint }}>Нет данных</div> : contracts.slice(0, 8).map(([cn, v]) => (
            <div key={cn} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, padding: "5px 0", borderBottom: `1px solid ${C.lineSoft}` }}>
              <span style={{ color: C.ink2, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cn}</span>
              <span style={{ color: C.mute, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{money(v)}</span>
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
                  <td style={{ ...td, whiteSpace: "nowrap", color: C.mute }}>{dt(o.date)}</td>
                  <td style={td}>
                    {o.subcategory || "—"}
                    {o.nonWage && <span style={{ ...pill("#d97706", "#fffbeb"), marginLeft: 6 }}>не зарплата</span>}
                  </td>
                  <td style={{ ...td, color: C.mute }}>{o.contractNo || "—"}</td>
                  <td style={{ ...td, color: C.faint, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.comment || ""}</td>
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
  const [err, setErr] = useState("");        // почему не сохранилось — прямо в форме
  const [busy, setBusy] = useState(false);
  const paidOf = (id) => (report.rows.find(r => r.kind === "staff" && r.id === id) || {}).total || 0;

  const isEdit = !!draft && staff.some(s => s.id === draft.id);
  const startNew = () => { setErr(""); setDraft({ ...normalizeStaff({ id: genId(), status: "active" }), scheme: normalizeScheme({}) }); };
  // ВАЖНО: в черновике держим то, что человек НАБРАЛ, без нормализации. Раньше поле
  // прогонялось через normalizeScheme на каждом нажатии, и запятая с пробелом в конце
  // срезались мгновенно — второй вариант написания набрать было физически нельзя.
  // Приводим к числам и спискам один раз, при сохранении.
  const setScheme = (patch) => setDraft(d => ({ ...d, scheme: { ...(d.scheme || {}), ...patch } }));
  const dsc = draft?.scheme || {};                       // схема В ЧЕРНОВИКЕ, как набрана
  const rawNum = (v) => (v === 0 || v === undefined || v === null) ? "" : String(v);
  const rawNames = Array.isArray(dsc.managerNames) ? dsc.managerNames.join(", ") : String(dsc.managerNames ?? "");

  // Форма НЕ закрывается, пока запись не подтверждена. Раньше результат сейва не
  // проверялся вообще: при заблокированной записи (другая вкладка, недогруженный
  // раздел, молчащее облако) форма закрывалась и введённое исчезало — отсюда
  // «нажимаю, а бывает добавляет, бывает нет».
  const save = async () => {
    if (!draft) return;
    if (!draft.name.trim()) { setErr("Укажите имя сотрудника — без него запись не сохранить."); return; }
    setErr(""); setBusy(true);
    try {
      // Схема мотивации живёт в записи сотрудника: отдельный ключ ради пяти чисел заводить незачем.
      const rec = { ...normalizeStaff({ ...draft, updatedAt: Date.now() }), scheme: normalizeScheme(draft.scheme) };
      const exists = staff.some(s => s.id === rec.id);
      const r = await runSave(saveStaff, exists ? staff.map(s => s.id === rec.id ? rec : s) : [...staff, rec]);
      if (!r.ok) { setErr(`Не сохранено: ${r.reason}. Введённое осталось в форме. ${r.hint || "Попробуйте ещё раз."}`); return; }
      setDraft(null);
    } finally { setBusy(false); }
  };
  const remove = async (s) => {
    if (!window.confirm(`Удалить «${s.name}» из справочника?\n\nОперации и суммы останутся на месте — пропадёт только имя.`)) return;
    const r = await runSave(saveStaff, staff.filter(x => x.id !== s.id));
    if (!r.ok) window.alert(`Не удалено: ${r.reason}.`);
  };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={sectionTitle}>Сотрудники</div>
          <div style={sectionHint}>Кто получает зарплату. Подрядчики — в своём справочнике, в «Админке».</div>
        </div>
        <span style={{ flex: 1 }} />
        {/* Пока форма открыта, этой кнопки НЕТ. Она начинает новую пустую запись, то есть
            стирает введённое, — а выглядит как «добавить». Владелец заполнял форму, жал
            её вместо «Сохранить» и терял данные. */}
        {!readOnly && !draft && (
          <button onClick={startNew} style={btnPrimary()}>+ Сотрудник</button>
        )}
      </div>

      {draft && (
        <div style={{ ...card, borderColor: C.accentLine, background: "#fbfcff" }}
          onKeyDown={e => { if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") { e.preventDefault(); save(); } }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>
              {isEdit ? `Изменение: ${draft.name || "без имени"}` : "Новый сотрудник"}
            </div>
            <div style={{ fontSize: 11.5, color: C.mute }}>
              Заполните и нажмите «{isEdit ? "Сохранить изменения" : "Добавить в справочник"}» внизу формы.
            </div>
          </div>
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
          <div style={{ fontSize: 11, color: C.faint, margin: "9px 0 4px" }}>
            Учётная запись нужна, чтобы связать человека с полем «менеджер» на объектах. Без неё сотрудник просто получает выплаты.
          </div>

          {/* ── Мотивация ── */}
          <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 12, paddingTop: 12 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: C.ink, marginBottom: 3 }}>💼 Мотивация</div>
            <div style={{ fontSize: 11, color: C.faint, marginBottom: 10 }}>
              По этим настройкам считаются предложения к начислению. Ноль — значит такой части в схеме нет.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 11 }}>
              <div><span style={lab}>Оклад, ₸ в месяц</span>
                <input style={inp} inputMode="numeric" value={rawNum(dsc.salary)}
                  onChange={e => setScheme({ salary: e.target.value })} placeholder="0" /></div>
              <div><span style={lab}>% с объекта</span>
                <input style={inp} inputMode="decimal" value={rawNum(dsc.percentRate)}
                  onChange={e => setScheme({ percentRate: e.target.value })} placeholder="напр. 5" /></div>
              <div><span style={lab}>Когда начисляется процент</span>
                <select style={inp} value={dsc.percentTrigger === "signed" ? "signed" : "handover"}
                  onChange={e => setScheme({ percentTrigger: e.target.value })}>
                  {PERCENT_TRIGGERS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select></div>
              <div><span style={lab}>За единицу, ₸</span>
                <input style={inp} inputMode="numeric" value={rawNum(dsc.pieceRate)}
                  onChange={e => setScheme({ pieceRate: e.target.value })} placeholder="напр. 3000 за замер" /></div>
              <div><span style={lab}>Что за единица</span>
                <input style={inp} value={dsc.pieceLabel ?? ""}
                  onChange={e => setScheme({ pieceLabel: e.target.value })} placeholder="целевой замер" /></div>
              <div style={{ gridColumn: "1 / -1" }}><span style={lab}>Как записан в поле «менеджер» на объектах</span>
                <input style={inp} value={rawNames}
                  onChange={e => setScheme({ managerNames: e.target.value })}
                  placeholder="Сергей Штанько, Сергей Ш." /></div>
            </div>
            <div style={{ fontSize: 11, color: C.faint, marginTop: 8 }}>
              Через запятую — все написания, которые встречаются на объектах. Без этого процент
              с объекта начислить не на кого: в объектах менеджер хранится строкой, а не ссылкой.
            </div>
          </div>

          {err && (
            <div style={{ background: C.redSoft, border: `1px solid ${C.redLine}`, borderRadius: 11, padding: "11px 14px",
              fontSize: 12.5, color: "#b91c1c", marginTop: 14 }}>{err}</div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
            <button onClick={() => { setDraft(null); setErr(""); }} style={btnGhost}>Отмена</button>
            <button onClick={save} disabled={busy} style={{ ...btnPrimary(!busy), padding: "9px 22px" }}>
              {busy ? "Сохраняю…" : isEdit ? "Сохранить изменения" : "➕ Добавить в справочник"}
            </button>
          </div>
        </div>
      )}

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        {staff.length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", color: C.faint, fontSize: 13 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>👥</div>
            Справочник пуст. Добавьте сотрудников — и выплаты начнут раскладываться по именам.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 620 }}>
              <thead><tr>
                <th style={th}>Сотрудник</th><th style={th}>Должность</th><th style={th}>Мотивация</th>
                <th style={{ ...th, textAlign: "right" }}>Выплачено</th><th style={th}>Статус</th><th style={th}></th>
              </tr></thead>
              <tbody>
                {staff.map(s => {
                  const u = users.find(x => x.id === s.userId);
                  const meta = staffStatusMeta(s.status);
                  const sc = normalizeScheme(s.scheme);
                  return (
                    <tr key={s.id}>
                      <td style={td}>
                        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                          {(() => { const a = avatarOf(s.name || "?"); return <span style={avatarStyle(a.color)}>{a.initials}</span>; })()}
                          <div>
                            <div style={{ fontWeight: 700, color: C.ink, fontSize: 13.5 }}>{s.name || "Без имени"}</div>
                            <div style={{ fontSize: 11, color: C.faint, marginTop: 1 }}>
                              {s.hiredAt ? `с ${new Date(s.hiredAt).toLocaleDateString("ru-RU")}` : ""}
                              {u ? `${s.hiredAt ? " · " : ""}вход: ${u.role}` : ""}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={td}>{s.position || "—"}</td>
                      <td style={td}>
                        {schemeIsEmpty(sc) ? <span style={pill(C.faint, C.bg)}>не задана</span> : (
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {sc.salary > 0 && <span style={pill(C.accent, C.accentSoft)}>оклад {money(sc.salary)}</span>}
                            {sc.percentRate > 0 && <span style={pill(C.green, C.greenSoft)}>{sc.percentRate}% {sc.percentTrigger === "handover" ? "при сдаче" : "при подписании"}</span>}
                            {sc.pieceRate > 0 && <span style={pill(C.violet, C.violetSoft)}>{money(sc.pieceRate)} / {sc.pieceLabel}</span>}
                          </div>
                        )}
                      </td>
                      <td style={{ ...numCell, fontWeight: 700 }}>{paidOf(s.id) ? money(paidOf(s.id)) : "—"}</td>
                      <td style={td}><span style={pill(meta.color, meta.bg)}>{meta.label}</span></td>
                      <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                        {!readOnly && <>
                          <button onClick={() => setErr("") || setDraft(normalizeStaff(s))} style={{ ...btnGhost, padding: "5px 12px", fontSize: 12, marginRight: 6 }}>Изменить</button>
                          <button onClick={() => remove(s)} style={{ ...btnDanger, padding: "5px 12px", fontSize: 12 }}>Удалить</button>
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

export default PayrollModule;
