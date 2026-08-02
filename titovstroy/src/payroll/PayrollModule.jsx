import { useState, useMemo } from "react";
import {
  buildPayrollReport, buildStaffDetail, expenseSubcategoryTotals, contractObjectIndex,
  normalizeStaff, staffStatusMeta, STAFF_STATUSES, monthLabel,
} from "./payrollModel.js";
import { normalizeScheme, PERCENT_TRIGGERS, schemeIsEmpty } from "./payrollAccruals.js";
import { AssignTab } from "./PayrollAssignTab.jsx";
import { DynamicsTab } from "./PayrollDynamicsTab.jsx";
import {
  C, card, cardTable, inp, lab, th, td, numCell, tdTight, numCellTight,
  pill, btnPrimary, btnGhost, btnDanger,
  tabsWrap, tabBtn, segWrap, seg, avatarOf, avatarStyle, h1, h1sub, footNote, notice,
  shell, sharePill, runSave,
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

// Вкладки «Начисления» и «Долги» сняты по решению владельца: механика начислений
// и сверки долгов сделана, но пользоваться ей неудобно — вернём, когда переработаем.
// Код лежит в PayrollAccrualsTab.jsx / PayrollBalanceTab.jsx и не подключён.
//
// «Разбор истории» — инструмент ВРЕМЕННЫЙ: он нужен, пока в базе есть операции без
// получателя. Новые операции размечаются прямо при вводе, поэтому вкладка сама
// сообщает, когда работа закончена, и больше ни о чём не просит.
const TABS = [
  { key: "report",   label: "Кому сколько ушло" },
  { key: "dynamics", label: "Динамика" },
  { key: "staff",    label: "Сотрудники" },
  { key: "map",      label: "Разбор истории" },
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
  // Номер договора в операции → адрес объекта. Без этого в карточке человека
  // стоят голые «№0919#152», по которым владельцу нечего вспомнить.
  const objectLabel = useMemo(() => contractObjectIndex({ objects, contracts, finProjects }),
    [objects, contracts, finProjects]);
  const openCard = (kind, id, name) => { setTab("report"); setOpenPerson({ kind, id, name }); };

  // Сколько месяцев показывать колонками. Раньше жёстко три, и на вопрос «почему
  // с мая, а не раньше» ответить было нечем: данных в базе 10 месяцев.
  const [monthsShown, setMonthsShown] = useState(3);
  const lastMonths = monthsShown === 0 ? report.months : report.months.slice(-monthsShown);

  return (
    <div style={{ ...shell, display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={tabsWrap}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setOpenPerson(null); }} style={tabBtn(tab === t.key)}>
            {t.label}
            {/* Счётчик виден только пока есть что разбирать: закончилась работа —
                исчез и счётчик, и повод сюда заходить. */}
            {t.key === "map" && report.unassignedCount > 0 && (
              <span style={{ ...pill(C.warnText, C.warnChip), marginLeft: 7 }}>{report.unassignedCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Режим чтения раньше просто прятал кнопки, и раздел выглядел сломанным:
          выпадашки не нажимаются, «+ Сотрудник» нет — а почему, неизвестно. */}
      {readOnly && (
        <div style={{ background: C.bgSoft, border: `1px solid ${C.line}`, borderRadius: 11, padding: "11px 15px", fontSize: 12.5, color: C.mute, display: "flex", gap: 9 }}>
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
        <PersonCard person={openPerson} detail={detail} money={money} objectLabel={objectLabel}
          staffRec={openPerson.kind === "staff" ? staff.find(s => s.id === openPerson.id) : null}
          shareOfFot={report.total > 0 ? Math.round((detail?.total || 0) / report.total * 100) : null}
          onBack={() => setOpenPerson(null)} />
      )}
      {tab === "dynamics" && (
        <DynamicsTab financeTx={financeTx} report={report} money={money} />
      )}
      {tab === "staff" && (
        <StaffTab staff={staff} users={users} report={report} money={money}
          genId={genId} readOnly={readOnly} saveStaff={saveStaff}
          onOpenCard={(s) => openCard("staff", s.id, s.name || "Без имени")} />
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
  // Раздел про ФОТ и только про ФОТ: подкатегории, отмеченные «не ФОТ» (дивиденды,
  // материалы, аренда), в расчёт не входят вовсе — ни строкой, ни колонкой.
  // Разрез по типу людей: сотрудники и подрядчики — разные истории, и смешивать их
  // в одной простыне бесполезно.
  const [side, setSide] = useState("staff");
  const isStaff = side === "staff";
  const rows = isStaff ? report.staffRows : report.workerRows;
  const sideTotal = isStaff ? report.staffTotal : report.workerTotal;
  const sideByMonth = isStaff ? report.staffByMonth : report.workerByMonth;
  const share = (v) => report.total > 0 ? Math.round((v / report.total) * 100) : null;

  const tile = (mark, markColor, markBg, label, value, sub, valueColor) => (
    <div style={card}>
      <div style={{ width: 32, height: 32, borderRadius: 10, background: markBg, color: markColor,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 800, fontSize: 14, marginBottom: 12 }}>{mark}</div>
      <div style={{ fontSize: 12.5, color: C.mute2, marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 23, fontWeight: 800, color: valueColor || C.ink, letterSpacing: "-.01em",
        fontVariantNumeric: "tabular-nums", lineHeight: 1.15 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: C.faint, marginTop: 6 }}>{sub}</div>}
    </div>
  );
  if (report.total === 0) return (
    <div style={{ ...card, color: C.faint, fontSize: 13 }}>Зарплатных расходов за период нет.</div>
  );
  return (
    <>
      <div>
        <h1 style={h1}>Кому сколько ушло</h1>
        <p style={h1sub}>Фонд оплаты труда в разрезе по людям.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(215px,1fr))", gap: 14 }}>
        {tile("₸", C.accentInk, C.accentSoft, "ФОТ всего", money(report.total),
          report.excludedTotal > 0 ? `не ФОТ вне расчёта: ${money(report.excludedTotal)}` : `${report.rows.length} получателей`)}
        {tile("С", C.green, C.greenSoft, "Сотрудникам", money(report.staffTotal),
          `${report.staffRows.length} чел.${share(report.staffTotal) === null ? "" : ` · ${share(report.staffTotal)}%`}`, C.green)}
        {tile("П", C.warnText, C.warnChip, "Подрядчикам", money(report.workerTotal),
          `${report.workerRows.length} чел.${share(report.workerTotal) === null ? "" : ` · ${share(report.workerTotal)}%`}`, C.warnText)}
        {tile("?", C.red, C.redSoft, "Не разложено", money(report.unassigned),
          `${report.unassignedCount} операций${share(report.unassigned) === null ? "" : ` · ${share(report.unassigned)}%`}`,
          report.unassigned > 0 ? C.red : C.green)}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={segWrap}>
          {[["staff", `Сотрудники · ${report.staffRows.length}`], ["worker", `Подрядчики · ${report.workerRows.length}`]].map(([k, label]) => (
            <button key={k} onClick={() => setSide(k)} style={seg(side === k)}>{label}</button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: C.mute2, fontWeight: 600 }}>Месяцев</span>
          <div style={segWrap}>
            {[3, 6, 12, 0].map(n => (
              <button key={n} onClick={() => setMonthsShown(n)} style={seg(monthsShown === n)}>
                {n === 0 ? `все · ${report.months.length}` : n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {report.unassigned > 0 && (
        <div style={notice()}>
          <b>{money(report.unassigned)}</b> ({report.unassignedCount} оп.) пока без получателя — в таблицах ниже их нет.
          Вкладка «Разбор истории» — отфильтровать, выделить пачкой и проставить получателя одним действием.
        </div>
      )}

      <div style={cardTable}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 760 }}>
            <thead>
              <tr>
                <th style={th}>{isStaff ? "Сотрудник" : "Подрядчик"}</th>
                {lastMonths.map(m => <th key={m} style={{ ...th, textAlign: "right" }}>{monthLabel(m)}</th>)}
                <th style={{ ...th, textAlign: "right" }}>Всего</th>
                <th style={{ ...th, textAlign: "right" }}>Операций</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td style={{ ...td, color: C.faint, textAlign: "center", padding: "36px 16px" }}
                  colSpan={lastMonths.length + 3}>
                  {isStaff ? "Ни одной выплаты сотрудникам не размечено." : "Ни одной выплаты подрядчикам не размечено."}
                </td></tr>
              )}
              {rows.map(r => (
                <tr key={r.key} onClick={() => onOpen(r)} title="Открыть карточку"
                  style={{ cursor: "pointer", transition: "background .1s" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "#fafbff"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                  <td style={{ ...td, minWidth: 240, maxWidth: 330 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                      {(() => { const a = avatarOf(r.name); return <span style={avatarStyle(a)}>{a.initials}</span>; })()}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                          <span style={{ fontWeight: 700, color: C.ink, fontSize: 13.5,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                          {/* Откуда взялась привязка: из самой операции или из правила. */}
                          {r.source === "map" && <span style={pill(C.mute, C.lineSoft)}>по правилу</span>}
                        </div>
                        <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.position || (isStaff ? "—" : "Подрядчик")}
                        </div>
                      </div>
                    </div>
                  </td>
                  {lastMonths.map(m => <td key={m} style={numCell}>{r.byMonth[m] ? money(r.byMonth[m]) : "—"}</td>)}
                  <td style={numCell}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: C.ink }}>{money(r.total)}</span>
                      {share(r.total) !== null && <span style={sharePill}>{share(r.total)}%</span>}
                    </span>
                  </td>
                  <td style={{ ...numCell, fontSize: 12.5, fontWeight: 600, color: "#6e7278" }}>{r.count}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: C.bg }}>
                <td style={{ ...td, fontWeight: 800, fontSize: 14, color: C.ink, borderBottom: "none" }}>
                  Итого {isStaff ? "сотрудникам" : "подрядчикам"}
                </td>
                {lastMonths.map(m => (
                  <td key={m} style={{ ...numCell, fontWeight: 800, fontSize: 14, color: C.ink, borderBottom: "none" }}>
                    {money(sideByMonth[m] || 0)}
                  </td>
                ))}
                <td style={{ ...numCell, fontWeight: 800, fontSize: 14, color: C.ink, borderBottom: "none" }}>{money(sideTotal)}</td>
                <td style={{ ...numCell, borderBottom: "none" }}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div style={footNote}>
        Сотрудники {money(report.staffTotal)} + подрядчики {money(report.workerTotal)}
        {report.unassigned > 0 ? ` + не разложено ${money(report.unassigned)}` : ""} = ФОТ {money(report.total)}.
        {report.excludedTotal > 0 && ` Подкатегории, отмеченные «не ФОТ» (${money(report.excludedTotal)}), в раздел не входят.`}
        {report.months.length > lastMonths.length && ` Показаны последние ${lastMonths.length} мес. из ${report.months.length}; «Всего» — за всю историю.`}
      </div>
    </>
  );
}

// ── Карточка человека ───────────────────────────────────────────────────────
// Отвечает на вопрос «за что ему столько»: раньше в отчёте была только итоговая
// сумма, и чтобы понять её состав, приходилось идти в Финансы и фильтровать руками.
function PersonCard({ person, detail, staffRec, money, objectLabel, shareOfFot, onBack }) {
  const [month, setMonth] = useState("");        // фильтр по месяцу: клик по столбику
  const [allContracts, setAllContracts] = useState(false);
  const months = detail?.months || [];
  // У зарплатных операций договора обычно нет: оклад платят не «за объект».
  // Показывать карточку «по объектам» с единственной строкой «— без договора —»
  // незачем, как и пустую колонку в таблице.
  const contracts = Object.entries(detail?.byContract || {})
    .filter(([cn]) => cn !== "— без договора —").sort((a, b) => b[1] - a[1]);
  const hasObjects = contracts.length > 0;
  const subs = Object.entries(detail?.bySubcategory || {}).sort((a, b) => b[1] - a[1]);
  const dt = (ms) => ms ? new Date(ms).toLocaleDateString("ru-RU") : "—";
  const ops = month ? (detail?.ops || []).filter(o => o.month === month) : (detail?.ops || []);
  const scheme = staffRec ? normalizeScheme(staffRec.scheme) : null;
  const meta = staffRec ? staffStatusMeta(staffRec.status) : null;
  const maxMonth = Math.max(...months.map(x => detail.byMonth[x]), 1);

  const tile = (label, value, sub, color) => (
    <div style={card}>
      <div style={{ fontSize: 12, color: C.mute2, marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 800, color: color || C.ink, letterSpacing: "-.01em",
        fontVariantNumeric: "tabular-nums", lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: C.faint, marginTop: 5 }}>{sub}</div>}
    </div>
  );

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button onClick={onBack} style={btnGhost}>← Назад</button>
      </div>

      <div style={{ ...card, display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        {(() => { const a = avatarOf(person.name); return (
          <span style={avatarStyle(a, 46)}>{a.initials}</span>
        ); })()}
        <div style={{ minWidth: 160 }}>
          <div style={{ fontSize: 19, fontWeight: 800, color: C.ink, letterSpacing: "-.02em" }}>{person.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 5, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12.5, color: C.mute2 }}>
              {staffRec?.position || (person.kind === "worker" ? "Подрядчик" : "—")}
            </span>
            {meta && <span style={pill(meta.key === "fired" ? "#6e7278" : C.green, meta.key === "fired" ? C.lineSoft : C.greenSoft)}>{meta.label}</span>}
            {scheme && scheme.salary > 0 && <span style={pill(C.accent, C.accentSoft)}>оклад {money(scheme.salary)}</span>}
          </div>
        </div>
        <span style={{ flex: 1 }} />
        <div style={{ textAlign: "right" }}>
          <div style={lab}>Выплачено в ФОТ</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.ink, fontVariantNumeric: "tabular-nums", letterSpacing: "-.01em" }}>{money(detail?.total || 0)}</div>
          {shareOfFot !== null && <div style={{ fontSize: 11.5, color: C.faint, marginTop: 3 }}>{shareOfFot}% всего ФОТ</div>}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
        {tile("Операций", `${detail?.count || 0}`,
          detail?.first ? `${dt(detail.first)} — ${dt(detail.last)}` : "нет выплат")}
        {tile("В среднем за месяц", money(detail?.avgMonth || 0),
          `${months.length} мес. с выплатами${scheme && scheme.salary > 0
            ? ` · оклад ${money(scheme.salary)}` : ""}`)}
        {tile("Средняя выплата", money(detail?.avgOp || 0), `самая крупная ${money(detail?.maxOp || 0)}`)}
        {tile("Последняя выплата", dt(detail?.last),
          detail?.ops?.[0] ? money(detail.ops[0].amount) : "—")}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 12 }}>
        <div style={card}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>По месяцам</div>
            <div style={{ fontSize: 11.5, color: C.faint }}>клик — показать операции месяца</div>
          </div>
          {months.length === 0 ? <div style={{ fontSize: 12, color: C.faint }}>Нет данных</div> : months.map(m => (
            <div key={m} onClick={() => setMonth(month === m ? "" : m)}
              style={{ marginBottom: 8, cursor: "pointer", opacity: month && month !== m ? .45 : 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 3 }}>
                <span style={{ color: month === m ? C.accentInk : C.ink2, fontWeight: month === m ? 800 : 600 }}>{monthLabel(m)}</span>
                <span style={{ color: C.mute, fontVariantNumeric: "tabular-nums" }}>{money(detail.byMonth[m])}</span>
              </div>
              <div style={{ height: 7, background: C.lineSoft, borderRadius: 999, overflow: "hidden" }}>
                <div style={{ width: `${Math.round(detail.byMonth[m] / maxMonth * 100)}%`, height: "100%",
                  background: month === m ? C.accentInk : C.accent, borderRadius: 999 }} />
              </div>
            </div>
          ))}
        </div>

        {hasObjects && <div style={card}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink, marginBottom: 12 }}>По объектам</div>
          {(allContracts ? contracts : contracts.slice(0, 7)).map(([cn, v]) => {
              const addr = objectLabel(cn);
              return (
                <div key={cn} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12,
                  padding: "6px 0", borderBottom: `1px solid ${C.lineSoft}` }}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ color: C.ink2, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {addr || cn}
                    </span>
                    {addr && <span style={{ color: C.faint, fontSize: 10.5 }}>{cn}</span>}
                  </span>
                  <span style={{ color: C.mute, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{money(v)}</span>
                </div>
              );
            })}
          {contracts.length > 7 && (
            <button onClick={() => setAllContracts(v => !v)} style={{ ...btnGhost, marginTop: 10, padding: "5px 10px", fontSize: 11.5 }}>
              {allContracts ? "Свернуть" : `Показать все · ${contracts.length}`}
            </button>
          )}
        </div>}

        <div style={card}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink, marginBottom: 12 }}>По статьям</div>
          {subs.length === 0 ? <div style={{ fontSize: 12, color: C.faint }}>Нет данных</div> : subs.slice(0, 8).map(([s, v]) => (
            <div key={s} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12,
              padding: "6px 0", borderBottom: `1px solid ${C.lineSoft}` }}>
              <span style={{ color: C.ink2, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s}</span>
              <span style={{ color: C.mute, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{money(v)}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>
          Операции{month ? ` за ${monthLabel(month)}` : ""} · {ops.length}
        </div>
        {month && <button onClick={() => setMonth("")} style={btnGhost}>Показать все месяцы</button>}
        <span style={{ flex: 1 }} />
        <div style={{ fontSize: 12.5, color: C.mute, fontVariantNumeric: "tabular-nums" }}>
          {money(ops.reduce((s, o) => s + o.amount, 0))}
        </div>
      </div>

      <div style={cardTable}>
        <div style={{ overflowX: "auto", maxHeight: 520 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 640 }}>
            <thead><tr>
              <th style={th}>Дата</th><th style={th}>Статья</th>
              {hasObjects && <th style={th}>Объект</th>}
              <th style={th}>Комментарий</th><th style={{ ...th, textAlign: "right" }}>Сумма</th>
            </tr></thead>
            <tbody>
              {ops.length === 0 && (
                <tr><td colSpan={hasObjects ? 5 : 4} style={{ ...td, textAlign: "center", color: C.faint, padding: "30px 16px" }}>
                  Операций нет.
                </td></tr>
              )}
              {ops.map(o => {
                const addr = objectLabel(o.contractNo);
                return (
                  <tr key={o.id}>
                    <td style={{ ...tdTight, whiteSpace: "nowrap", color: C.mute }}>{dt(o.date)}</td>
                    <td style={tdTight}>{o.subcategory || "—"}</td>
                    {hasObjects && (
                      <td style={{ ...tdTight, color: C.mute, maxWidth: 190 }}>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{addr || o.contractNo || "—"}</div>
                        {addr && o.contractNo && <div style={{ fontSize: 10.5, color: C.faint }}>{o.contractNo}</div>}
                      </td>
                    )}
                    {/* Комментарий не обрезаем в одну строку: в боевой базе там и адрес,
                        и что именно сделано, и расчёт суммы — ради этого карточку и открывают. */}
                    <td style={{ ...tdTight, color: C.faint2, maxWidth: 340, whiteSpace: "normal", lineHeight: 1.45 }}>{o.comment || ""}</td>
                    <td style={{ ...numCellTight, fontWeight: 700, color: C.ink }}>{money(o.amount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ── Справочник сотрудников ──────────────────────────────────────────────────
function StaffTab({ staff, users, report, money, genId, readOnly, saveStaff, onOpenCard }) {
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
          <h1 style={h1}>Сотрудники</h1>
          <p style={h1sub}>Кто получает зарплату. Подрядчики — в своём справочнике, в «Админке».</p>
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
        <div style={{ ...card, borderColor: C.accentLine, background: "#fafbff" }}
          onKeyDown={e => { if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") { e.preventDefault(); save(); } }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 15.5, fontWeight: 800, color: C.ink, letterSpacing: "-.01em" }}>
              {isEdit ? `Изменение: ${draft.name || "без имени"}` : "Новый сотрудник"}
            </div>
            <div style={{ fontSize: 12, color: C.mute }}>
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
          <div style={{ fontSize: 12, color: C.faint, margin: "10px 0 4px" }}>
            Учётная запись нужна, чтобы связать человека с полем «менеджер» на объектах. Без неё сотрудник просто получает выплаты.
          </div>

          {/* ── Мотивация ── */}
          <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 12, paddingTop: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, marginBottom: 4 }}>Мотивация</div>
            <div style={{ fontSize: 12, color: C.faint, marginBottom: 12 }}>
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
            <div style={{ fontSize: 12, color: C.faint, marginTop: 8 }}>
              Через запятую — все написания, которые встречаются на объектах. Без этого процент
              с объекта начислить не на кого: в объектах менеджер хранится строкой, а не ссылкой.
            </div>
          </div>

          {err && (
            <div style={{ ...notice("red"), marginTop: 16 }}>{err}</div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
            <button onClick={() => { setDraft(null); setErr(""); }} style={btnGhost}>Отмена</button>
            <button onClick={save} disabled={busy} style={{ ...btnPrimary(!busy), padding: "9px 22px" }}>
              {busy ? "Сохраняю…" : isEdit ? "Сохранить изменения" : "➕ Добавить в справочник"}
            </button>
          </div>
        </div>
      )}

      <div style={cardTable}>
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
                      {/* Клик по имени открывает карточку: все выплаты человека,
                          по месяцам, объектам и статьям. */}
                      <td style={{ ...td, cursor: "pointer" }} title="Открыть карточку"
                        onClick={() => onOpenCard && onOpenCard(s)}>
                        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                          {(() => { const a = avatarOf(s.name || "?"); return <span style={avatarStyle(a)}>{a.initials}</span>; })()}
                          <div>
                            <div style={{ fontWeight: 700, color: C.ink, fontSize: 13.5 }}>{s.name || "Без имени"}</div>
                            <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2 }}>
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
                      <td style={{ ...numCell, fontWeight: 800, fontSize: 14, color: C.ink }}>{paidOf(s.id) ? money(paidOf(s.id)) : "—"}</td>
                      <td style={td}><span style={pill(meta.key === "fired" ? "#6e7278" : C.green, meta.key === "fired" ? C.lineSoft : C.greenSoft)}>{meta.label}</span></td>
                      <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                        {!readOnly && <>
                          <button onClick={() => setErr("") || setDraft(normalizeStaff(s))} style={{ ...btnGhost, marginRight: 8 }}>Изменить</button>
                          <button onClick={() => remove(s)} style={btnDanger}>Удалить</button>
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
