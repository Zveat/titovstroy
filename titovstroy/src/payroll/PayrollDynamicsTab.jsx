import { useMemo, useState } from "react";
import { monthLabel, buildPayrollDynamics, payrollMovers } from "./payrollModel.js";
import {
  C, card, cardTable, th, td, numCell, pill, segWrap, seg, notice,
  avatarOf, avatarStyle, h1, h1sub, footNote,
} from "./payrollUi.js";

// ─────────────────────────────────────────────────────────────────────────────
// Вкладка «Динамика».
//
// Отчёт «Кому сколько ушло» отвечает на вопрос «сколько всего», но не отвечает
// на главный: растёт ФОТ или падает и по отношению к чему. Здесь ФОТ стоит рядом
// со всеми расходами и выручкой того же месяца — иначе «стало на два миллиона
// больше» не значит ничего: месяц мог быть просто вдвое крупнее.
//
// Ничего не сохраняем: вкладка целиком на чтение, поэтому режим «только просмотр»
// на неё не влияет.
// ─────────────────────────────────────────────────────────────────────────────

const pct = (v) => (v === null || v === undefined) ? "—" : `${Math.round(v * 100)}%`;

export function DynamicsTab({ financeTx, report, money }) {
  const [monthsBack, setMonthsBack] = useState(12);
  // База расчёта. Пока история не разобрана, «всё кроме „не ФОТ"» тянет в зарплату
  // материалы и эквайринг, и доля выходит под 100%; «только размеченное» наоборот
  // занижает — 24 млн подрядчикам ещё лежат общей кучей. Показываем обе границы.
  const [basis, setBasis] = useState("all");
  const named = basis === "named";
  const dyn = useMemo(() => buildPayrollDynamics(financeTx, report, { monthsBack, basis }),
    [financeTx, report, monthsBack, basis]);

  // Сравниваем два последних месяца, где вообще были выплаты. Брать календарные
  // соседние нельзя: месяц без единой выплаты дал бы «все просели до нуля».
  const [prevM, curM] = useMemo(() => {
    const ms = (report.months || []).filter(m => (report.totalByMonth?.[m] || 0) > 0);
    return [ms[ms.length - 2] || "", ms[ms.length - 1] || ""];
  }, [report]);
  const movers = useMemo(() => payrollMovers(report, prevM, curM), [report, prevM, curM]);

  if (dyn.rows.length === 0) return (
    <div style={{ ...card, color: C.faint, fontSize: 13 }}>Данных для динамики пока нет.</div>
  );

  const last = dyn.last;
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

  // Рост ФОТ сам по себе не хорош и не плох, поэтому не красим его в «плохой красный»:
  // растущий ФОТ на растущей выручке — норма. Цвет нейтральный, знак и цифра — по делу.
  const deltaText = (d, p) => d === null ? "первый месяц с данными"
    : `${d >= 0 ? "+" : "−"}${money(Math.abs(d)).replace(" ₸", "")} ₸ к ${monthLabel(p)}`;

  return (
    <>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={h1}>Динамика</h1>
          <p style={h1sub}>ФОТ по месяцам: сколько, какая это доля расходов и выручки, кто вырос и кто просел.</p>
        </div>
        <span style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: C.mute2, fontWeight: 600 }}>Считать ФОТ</span>
          <div style={segWrap}>
            <button onClick={() => setBasis("all")} style={seg(!named)}
              title="Все расходы, кроме отмеченных «не ФОТ»">всё</button>
            <button onClick={() => setBasis("named")} style={seg(named)}
              title="Только выплаты с известным получателем">только по людям</button>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: C.mute2, fontWeight: 600 }}>Месяцев</span>
          <div style={segWrap}>
            {[6, 12, 24, 0].map(n => (
              <button key={n} onClick={() => setMonthsBack(n)} style={seg(monthsBack === n)}>
                {n === 0 ? `все · ${dyn.allMonths.length}` : n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Почему цифры такие. Без этой строчки доля «100%» читается как поломка. */}
      {report.unassigned > 0 && (
        <div style={notice()}>
          {named
            ? <>Считаем <b>только выплаты с известным получателем</b>. {money(report.unassigned)} ещё без имени — они в эти цифры не входят, поэтому доля ФОТ здесь занижена.</>
            : <>Считаем <b>всё, кроме отмеченного «не ФОТ»</b>. В это пока попадают материалы, эквайринг, налоги и прочее — доля ФОТ поэтому завышена. Отметьте лишние подкатегории «не ФОТ» на вкладке «Разбор истории», и цифра станет точной.</>}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(215px,1fr))", gap: 14 }}>
        {tile("₸", C.accentInk, C.accentSoft, `ФОТ за ${monthLabel(last.month)}`, money(last.payroll),
          deltaText(last.delta, last.prevMonth))}
        {tile("~", C.violet, C.violetSoft, "В среднем за месяц", money(dyn.avgPayroll),
          `за ${dyn.rows.length} мес. · всего ${money(dyn.totalPayroll)}`)}
        {tile("%", C.green, C.greenSoft, "Доля в расходах", pct(dyn.shareExpense),
          `в ${monthLabel(last.month)} — ${pct(last.shareExpense)}`, C.green)}
        {tile("В", C.warnText, C.warnChip, "ФОТ к выручке", pct(dyn.shareIncome),
          dyn.totalIncome > 0 ? `выручка за период ${money(dyn.totalIncome)}` : "прихода за период нет", C.warnText)}
      </div>

      {/* Столбики: серая часть — все расходы месяца, цветная — ФОТ внутри них.
          Так доля видна глазом, без чтения процентов. */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>ФОТ внутри расходов месяца</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11, color: C.faint }}>
            <span><i style={legendDot(C.accent)} />сотрудники</span>
            <span><i style={legendDot(C.warn)} />подрядчики</span>
            {!named && <span><i style={legendDot("#c9ced6")} />не разложено</span>}
            <span><i style={legendDot(C.lineSoft)} />остальные расходы</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
          {(() => { const scale = Math.max(...dyn.rows.map(x => Math.max(x.expense, x.payroll)), 1); return dyn.rows.map(r => {
            const base = Math.max(r.expense, r.payroll, 1);
            const colH = Math.max(6, Math.round((base / scale) * 132));
            const part = (v) => base > 0 ? Math.round((v / base) * colH) : 0;
            return (
              <div key={r.month} style={{ flex: "1 0 42px", minWidth: 42, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}
                title={`${monthLabel(r.month)}\nФОТ ${money(r.payroll)} из расходов ${money(r.expense)} (${pct(r.shareExpense)})\nвыручка ${money(r.income)}`}>
                <div style={{ fontSize: 10, color: C.faint, fontVariantNumeric: "tabular-nums" }}>{pct(r.shareExpense)}</div>
                <div style={{ width: "100%", height: colH, background: C.lineSoft, borderRadius: 6,
                  display: "flex", flexDirection: "column", justifyContent: "flex-end", overflow: "hidden" }}>
                  <div style={{ height: named ? 0 : part(r.unassigned), background: "#c9ced6" }} />
                  <div style={{ height: part(r.worker), background: C.warn }} />
                  <div style={{ height: part(r.staff), background: C.accent }} />
                </div>
                <div style={{ fontSize: 10.5, color: C.mute2, whiteSpace: "nowrap" }}>{monthLabel(r.month)}</div>
              </div>
            );
          }); })()}
        </div>
      </div>

      <div style={cardTable}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 880 }}>
            <thead>
              <tr>
                <th style={th}>Месяц</th>
                <th style={{ ...th, textAlign: "right" }}>ФОТ</th>
                <th style={{ ...th, textAlign: "right" }}>Сотрудники</th>
                <th style={{ ...th, textAlign: "right" }}>Подрядчики</th>
                <th style={{ ...th, textAlign: "right" }}>Не разложено</th>
                <th style={{ ...th, textAlign: "right" }}>Расходы всего</th>
                <th style={{ ...th, textAlign: "right" }}>Выручка</th>
                <th style={{ ...th, textAlign: "right" }}>Людей</th>
              </tr>
            </thead>
            <tbody>
              {[...dyn.rows].reverse().map(r => (
                <tr key={r.month}>
                  <td style={{ ...td, fontWeight: 700, color: C.ink, whiteSpace: "nowrap" }}>{monthLabel(r.month)}</td>
                  <td style={numCell}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: C.ink }}>{money(r.payroll)}</div>
                    <div style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>
                      {r.delta === null ? "—"
                        : r.delta === 0 ? "без изменений"
                        : `${r.delta > 0 ? "↑" : "↓"} ${money(Math.abs(r.delta))}${r.deltaPct === null ? "" : ` · ${pct(Math.abs(r.deltaPct))}`}`}
                    </div>
                  </td>
                  <td style={numCell}>{r.staff ? money(r.staff) : "—"}</td>
                  <td style={numCell}>{r.worker ? money(r.worker) : "—"}</td>
                  <td style={{ ...numCell, color: r.unassigned > 0 ? C.red : C.faint }}>{r.unassigned ? money(r.unassigned) : "—"}</td>
                  <td style={numCell}>
                    <div style={{ color: C.ink2 }}>{money(r.expense)}</div>
                    <div style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>доля ФОТ {pct(r.shareExpense)}</div>
                  </td>
                  <td style={numCell}>
                    <div style={{ color: C.ink2 }}>{r.income ? money(r.income) : "—"}</div>
                    <div style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>
                      {r.income ? `ФОТ ${pct(r.shareIncome)}` : "прихода нет"}
                    </div>
                  </td>
                  <td style={numCell}>
                    <div style={{ color: C.ink2, fontWeight: 600 }}>{r.people || "—"}</div>
                    <div style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>
                      {r.people ? `в ср. ${money(r.avgPerPerson)}` : ""}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {prevM && curM && (movers.up.length > 0 || movers.down.length > 0) && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 14 }}>
          <MoverCard title="Выросли" hint={`${monthLabel(prevM)} → ${monthLabel(curM)}`}
            rows={movers.up} money={money} tone="up" />
          <MoverCard title="Просели" hint={`${monthLabel(prevM)} → ${monthLabel(curM)}`}
            rows={movers.down} money={money} tone="down" />
        </div>
      )}

      <div style={footNote}>
        Расходы и выручка — все операции месяца; переводы между своими счетами и операции,
        помеченные «не входит в отчёты», не считаются. В «расходы всего» входит и то, что
        отмечено «не ФОТ» (дивиденды и прочее), — иначе доля ФОТ была бы всегда 100%.
        {named
          ? " Сейчас в ФОТ идут только выплаты с известным получателем."
          : " Сейчас в ФОТ идёт всё, что не отмечено «не ФОТ», включая ещё не разобранное."}
      </div>
    </>
  );
}

const legendDot = (bg) => ({
  display: "inline-block", width: 8, height: 8, borderRadius: 3, background: bg, marginRight: 5,
});

function MoverCard({ title, hint, rows, money, tone }) {
  const color = tone === "up" ? C.green : C.red;
  const bg = tone === "up" ? C.greenSoft : C.redSoft;
  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>{title}</div>
        <div style={{ fontSize: 11.5, color: C.faint }}>{hint}</div>
      </div>
      {rows.length === 0 ? <div style={{ fontSize: 12, color: C.faint }}>Никто.</div> : rows.slice(0, 7).map(r => {
        const a = avatarOf(r.name);
        return (
          <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0",
            borderBottom: `1px solid ${C.lineSoft}` }}>
            <span style={avatarStyle(a, 28)}>{a.initials}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: C.ink,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
              <div style={{ fontSize: 11, color: C.faint, fontVariantNumeric: "tabular-nums" }}>
                {money(r.prev)} → {money(r.cur)}
              </div>
            </div>
            <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>
                {r.delta > 0 ? "+" : "−"}{money(Math.abs(r.delta))}
              </div>
              {(r.appeared || r.stopped || r.pct !== null) && (
                <span style={{ ...pill(color, bg), marginTop: 3 }}>
                  {r.appeared ? "новый" : r.stopped ? "выплат нет" : pct(Math.abs(r.pct))}
                </span>
              )}
            </div>
          </div>
        );
      })}
      {rows.length > 7 && (
        <div style={{ fontSize: 11.5, color: C.faint, marginTop: 8 }}>и ещё {rows.length - 7} чел.</div>
      )}
    </div>
  );
}

export default DynamicsTab;
