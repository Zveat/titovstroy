import { useMemo } from "react";
import { monthLabel } from "./payrollModel.js";
import { buildPayrollBalance, accrualKindMeta } from "./payrollAccruals.js";
import { card, th, td, numCell, pill } from "./payrollUi.js";

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

  const tile = (label, value, sub, color) => (
    <div style={{ ...card, padding: 14 }}>
      <div style={{ fontSize: 10.5, color: "#94a3b8", fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 900, color: color || "#0f172a", fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 5 }}>{sub}</div>}
    </div>
  );

  if (bal.rows.length === 0) return (
    <div style={{ ...card, fontSize: 12.5, color: "#94a3b8" }}>
      Сверять пока нечего: начислений ещё нет. Сначала задайте схемы мотивации на вкладке «Сотрудники»,
      затем начислите месяц на вкладке «Начисления» — здесь появится разница между заработанным и выплаченным.
    </div>
  );

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12 }}>
        {tile("Начислено", money(bal.accrued), `${bal.rows.length} человек`)}
        {tile("Выплачено", money(bal.paid), "зарплатой, с первого месяца начислений")}
        {tile("Должны людям", money(bal.debt), bal.debt ? "не выплачено" : "всё закрыто", bal.debt ? "#dc2626" : "#059669")}
        {tile("Выдано авансом", money(bal.advance), bal.advance ? "выплачено сверх начисленного" : "нет", bal.advance ? "#d97706" : "#059669")}
      </div>

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
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
                    <div style={{ fontWeight: 700, color: "#0f172a" }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2, display: "flex", gap: 4, flexWrap: "wrap" }}>
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
                        <div style={{ color: "#334155" }}>{money(c.accrued)}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>выпл. {money(c.paid)}</div>
                      </td>
                    );
                  })}
                  <td style={{ ...numCell, fontWeight: 700 }}>{money(r.accrued)}</td>
                  <td style={{ ...numCell, color: "#64748b" }}>{money(r.paid)}</td>
                  <td style={{ ...numCell, fontWeight: 900, color: r.balance > 0 ? "#dc2626" : r.balance < 0 ? "#d97706" : "#059669" }}>
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

      <div style={{ fontSize: 11.5, color: "#94a3b8" }}>
        Выплаты берутся из тех же операций, что и в отчёте «Кому сколько ушло», но только
        зарплатные: подкатегории, отмеченные «не зарплата» (дивиденды и подобное), в разницу
        не идут. Считаем с первого месяца, где есть начисления, — платежи до начала учёта
        в разницу не попадают, иначе у всех была бы огромная «переплата» за прошлые годы.
      </div>
    </>
  );
}

export default BalanceTab;
