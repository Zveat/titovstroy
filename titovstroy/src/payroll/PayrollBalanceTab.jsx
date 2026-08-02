import { useMemo } from "react";
import { monthLabel } from "./payrollModel.js";
import { buildPayrollBalance, accrualKindMeta } from "./payrollAccruals.js";
import { C, card, cardTable, th, td, numCell, pill, avatarOf, avatarStyle, h1, h1sub, footNote } from "./payrollUi.js";

// ─────────────────────────────────────────────────────────────────────────────
// Вкладка «Долги»: начислено против выплаченного.
//
// Плюс — компания должна человеку, минус — человек взял авансом. Складывать их
// в одну цифру нельзя: получился бы ноль там, где одному должны 300 тысяч,
// а другому столько же переплатили.
// ─────────────────────────────────────────────────────────────────────────────

export function BalanceTab({ staff, accruals, report, money }) {
  const paidByStaff = useMemo(() => {
    const m = {};
    // Только зарплатная часть: дивиденды и прочие «не зарплата» — деньги человеку,
    // но не выплата по начислениям. Иначе у учредителя вечная переплата.
    for (const r of report.rows) if (r.kind === "staff") m[r.id] = { byMonth: r.wageByMonth || r.byMonth, total: r.wage ?? r.total };
    return m;
  }, [report]);

  const bal = useMemo(() => buildPayrollBalance({ staff, accruals, paidByStaff }), [staff, accruals, paidByStaff]);
  const months = bal.months.slice(-4);

  const tile = (mark, markColor, markBg, label, value, sub, valueColor) => (
    <div style={card}>
      <div style={{ width: 40, height: 40, borderRadius: 12, background: markBg, color: markColor,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 800, fontSize: 17, marginBottom: 16 }}>{mark}</div>
      <div style={{ fontSize: 14, color: C.mute2, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 800, color: valueColor || C.ink, letterSpacing: "-.01em",
        fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 13, color: C.faint, marginTop: 8 }}>{sub}</div>}
    </div>
  );

  if (bal.rows.length === 0) return (
    <div style={{ ...card, fontSize: 14, color: C.mute2, lineHeight: 1.55 }}>
      Сверять пока нечего: начислений ещё нет. Сначала задайте схемы мотивации на вкладке «Сотрудники»,
      затем начислите месяц на вкладке «Начисления» — здесь появится разница между заработанным и выплаченным.
    </div>
  );

  return (
    <>
      <div>
        <h1 style={h1}>Долги</h1>
        <p style={h1sub}>Начислено против выплаченного. Плюс — должны человеку, минус — он взял авансом.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 20 }}>
        {tile("Н", C.accentInk, C.accentSoft, "Начислено", money(bal.accrued), `${bal.rows.length} человек`)}
        {tile("В", C.green, C.greenSoft, "Выплачено", money(bal.paid), "зарплатой, с первого месяца начислений")}
        {tile("Д", C.red, C.redSoft, "Должны людям", money(bal.debt), bal.debt ? "не выплачено" : "всё закрыто", bal.debt ? C.red : C.green)}
        {tile("А", C.warnText, C.warnChip, "Выдано авансом", money(bal.advance), bal.advance ? "выплачено сверх начисленного" : "нет", bal.advance ? C.warnText : C.green)}
      </div>

      <div style={cardTable}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 680 }}>
            <thead>
              <tr>
                <th style={th}>Сотрудник</th>
                {months.map(m => <th key={m} style={{ ...th, textAlign: "right" }}>{monthLabel(m)}</th>)}
                <th style={{ ...th, textAlign: "right" }}>Начислено</th>
                <th style={{ ...th, textAlign: "right" }}>Выплачено</th>
                <th style={{ ...th, textAlign: "right" }}>Итог</th>
              </tr>
            </thead>
            <tbody>
              {bal.rows.map(r => (
                <tr key={r.staffId}>
                  <td style={td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                      {(() => { const a = avatarOf(r.name); return <span style={avatarStyle(a)}>{a.initials}</span>; })()}
                      <div style={{ fontWeight: 700, color: C.ink, fontSize: 15 }}>{r.name}</div>
                    </div>
                    <div style={{ fontSize: 11, color: C.faint, marginTop: 8, display: "flex", gap: 5, flexWrap: "wrap" }}>
                      {Object.entries(r.kinds).map(([k, v]) => {
                        const meta = accrualKindMeta(k);
                        return <span key={k} style={pill(meta.color, meta.bg)}>{meta.label} {money(v)}</span>;
                      })}
                    </div>
                  </td>
                  {months.map(m => {
                    const c = r.byMonth[m];
                    if (!c) return <td key={m} style={numCell}>—</td>;
                    return (
                      <td key={m} style={numCell}>
                        <div style={{ color: C.ink2, fontWeight: 600 }}>{money(c.accrued)}</div>
                        <div style={{ fontSize: 12, color: c.delta > 0 ? C.red : C.faint, marginTop: 2 }}>выпл. {money(c.paid)}</div>
                      </td>
                    );
                  })}
                  <td style={{ ...numCell, fontWeight: 800, fontSize: 16, color: C.ink }}>{money(r.accrued)}</td>
                  <td style={{ ...numCell, color: C.mute }}>{money(r.paid)}</td>
                  <td style={{ ...numCell, fontWeight: 800, fontSize: 15, color: r.balance > 0 ? C.red : r.balance < 0 ? C.warnText : C.green }}>
                    {r.balance > 0 ? `должны ${money(r.balance)}`
                      : r.balance < 0 ? `аванс ${money(-r.balance)}`
                      : "в расчёте"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={footNote}>
        Выплаты берутся из тех же операций, что и в отчёте «Кому сколько ушло», но только
        зарплатные: подкатегории, отмеченные «не зарплата» (дивиденды и подобное), в разницу
        не идут. Считаем с первого месяца, где есть начисления, — платежи до начала учёта
        в разницу не попадают, иначе у всех была бы огромная «переплата» за прошлые годы.
      </div>
    </>
  );
}

export default BalanceTab;
