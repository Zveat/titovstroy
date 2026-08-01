import React from "react";
import { formatTenge } from "./analyticsModel.js";

// ─── «Главная» ────────────────────────────────────────────────────────────────
// Принцип, по которому она отличается от «Аналитики»:
//   • Главная  = состояние СЕЙЧАС + динамика + что делать сегодня. Без фильтров.
//   • Аналитика = разбор за период, разрезы, сравнения.
// Поэтому здесь нет ни одного показателя «за выбранный период» — только «сейчас»,
// один график тренда и списки, по которым можно кликнуть и пойти работать.
// Числа берутся из той же модели (buildAnalytics), поэтому расходиться не могут.

const card = {
  background: "#fff", border: "1px solid #e8edf3", borderRadius: 14, padding: 16, minWidth: 0,
};

const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const monthLabel = (key) => {
  const [, m] = String(key || "").split("-");
  return MONTHS_SHORT[Number(m) - 1] || key;
};

// Мини-график в плитке: показывает форму динамики, без осей и подписей.
function Sparkline({ values = [], color = "#2563eb", height = 28 }) {
  const nums = values.map(v => Number(v) || 0);
  if (nums.length < 2) return null;
  const max = Math.max(...nums, 1);
  const min = Math.min(...nums, 0);
  const span = max - min || 1;
  const step = 100 / (nums.length - 1);
  const points = nums.map((v, i) => `${i * step},${100 - ((v - min) / span) * 100}`).join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none"
      style={{ width: "100%", height, display: "block", marginTop: 8 }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="4"
        vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// Крупная плитка с трендом — то, за чем заходят в систему в первую очередь.
function HeroTile({ label, value, sub, accent = "#0f172a", spark, sparkColor, onClick }) {
  return (
    <div onClick={onClick} style={{ ...card, cursor: onClick ? "pointer" : "default" }}>
      <div style={{ fontSize: 11.5, color: "#64748b", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 900, color: accent, lineHeight: 1.1, marginTop: 6, letterSpacing: -.5 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 4 }}>{sub}</div>}
      {spark && <Sparkline values={spark} color={sparkColor || accent} />}
    </div>
  );
}

// График динамики. Две версии, потому что «нет доступа к деньгам» не должно
// означать «пустой график»: продажнику показываем суммы подписанных договоров,
// финансисту — приход/расход. Линия подписанных договоров есть в обеих.
function TrendChart({ trend = [], fmt, showMoney = true }) {
  if (!trend.length) return null;
  const bars = showMoney
    ? [{ key: "income", color: "#059669", label: "приход" }, { key: "expense", color: "#f87171", label: "расход" }]
    : [{ key: "signedSum", color: "#059669", label: "сумма договоров" }];
  const max = Math.max(...trend.flatMap(t => bars.map(b => t[b.key] || 0)), 1);
  const slot = 100 / trend.length;
  const barW = (slot * 0.62) / bars.length;
  const maxSigned = Math.max(...trend.map(t => t.signed), 1);

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 900, color: "#0f172a" }}>Динамика за 6 месяцев</div>
        <div style={{ display: "flex", gap: 12, fontSize: 10.5, color: "#64748b", flexWrap: "wrap" }}>
          {bars.map(b => (
            <span key={b.key}>
              <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: b.color, marginRight: 4 }} />
              {b.label}
            </span>
          ))}
          <span><span style={{ display: "inline-block", width: 9, height: 2, background: "#2563eb", marginRight: 4, verticalAlign: "middle" }} />договоров, шт</span>
        </div>
      </div>

      <svg viewBox="0 0 100 44" preserveAspectRatio="none" style={{ width: "100%", height: 160, marginTop: 12, display: "block" }}>
        {[0.25, 0.5, 0.75].map(p => (
          <line key={p} x1="0" x2="100" y1={40 * p} y2={40 * p} stroke="#f1f5f9" strokeWidth="0.4" />
        ))}
        {trend.map((t, i) => (
          <g key={t.month}>
            {bars.map((b, bi) => {
              const h = ((t[b.key] || 0) / max) * 37;
              const x = i * slot + slot * 0.19 + bi * barW;
              return <rect key={b.key} x={x} y={40 - h} width={barW * 0.9}
                height={Math.max(h, 0.5)} fill={b.color} rx="0.4" />;
            })}
          </g>
        ))}
        <polyline
          points={trend.map((t, i) => `${i * slot + slot / 2},${40 - (t.signed / maxSigned) * 33}`).join(" ")}
          fill="none" stroke="#2563eb" strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {trend.map((t, i) => (
          <circle key={t.month} cx={i * slot + slot / 2} cy={40 - (t.signed / maxSigned) * 33} r="0.7" fill="#2563eb" />
        ))}
      </svg>

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${trend.length}, 1fr)`, gap: 2, marginTop: 4 }}>
        {trend.map(t => (
          <div key={t.month} style={{ textAlign: "center", fontSize: 10, color: "#94a3b8" }}>
            <div style={{ fontWeight: 700, color: "#64748b" }}>{monthLabel(t.month)}</div>
            <div>{(showMoney ? t.income : t.signedSum) > 0
              ? `${fmt(Math.round((showMoney ? t.income : t.signedSum) / 1000))}k` : "—"}</div>
            <div style={{ color: "#2563eb" }}>{t.signed ? `${t.signed} дог.` : "—"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}


// Настоящая воронка: каждая стадия уже предыдущей, ширина = доля от входа.
// Так сразу видно, где отваливаются сделки, а не просто список статусов.
export function FunnelChart({ funnel, fmt, showMoney = true, title, hint, colors }) {
  const stages = funnel?.stages || [];
  const terminal = funnel?.terminal;
  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4, gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 900, color: "#0f172a" }}>{title}</span>
        <span style={{ fontSize: 11, color: "#94a3b8", textAlign: "right" }}>{hint}</span>
      </div>
      {/* На какой базе считается карточка. Две воронки стоят рядом и считают разное —
          без этой строки они читаются как противоречие. */}
      {funnel?.basisNote && (
        <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 10, lineHeight: 1.35 }}>{funnel.basisNote}</div>
      )}
      {stages.map((st, i) => {
        // Ширина считается от самой массовой стадии, но не уже 18% — иначе
        // подпись не читается, а стадия визуально «исчезает».
        const maxCount = Math.max(...stages.map(x => x.count), 1);
        const width = Math.max(38, Math.round((st.count / maxCount) * 100));
        // В потоке событий у каждой стадии СВОИ объекты (подписали одних, сдали
        // других), поэтому «% с прошлой стадии» там был бы выдумкой.
        const conv = (i === 0 || funnel?.flow) ? null : pctOf(st.count, stages[i - 1].count);
        return (
          <div key={st.key} style={{ marginBottom: 6 }}>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <div style={{
                width: `${width}%`, background: (colors || [])[i] || "#2563eb", color: "#fff",
                borderRadius: 8, padding: "9px 12px", textAlign: "center", minWidth: 130,
                display: "flex", alignItems: "baseline", justifyContent: "center", gap: 7,
                transition: "width .2s ease",
              }}>
                <span style={{ fontSize: 16, fontWeight: 900, lineHeight: 1 }}>{st.count}</span>
                <span style={{ fontSize: 11, opacity: .95 }}>{st.label}</span>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#94a3b8", padding: "2px 2px 0", gap: 8 }}>
              {/* Слева — конверсия (когорта) или пояснение, ОТКУДА взялось число (поток).
                  Без этого «Подписали договор» слева и справа выглядят как одно и то же. */}
              <span>{[
                conv !== null ? `→ ${conv}% с прошлой стадии`
                  : (i > 0 && !funnel?.flow && stages[i - 1].count === 0) ? "→ не из чего считать" : "",
                st.note || "",
              ].filter(Boolean).join(" · ")}</span>
              <span style={{ whiteSpace: "nowrap" }}>{showMoney && st.sum > 0 ? `${fmt(Math.round(st.sum / 1000))}k ₸` : ""}</span>
            </div>
          </div>
        );
      })}
      {/* Для когортной воронки — исходы: кого потеряли и кто ещё в работе.
          Для потока событий — срез «сейчас», он отвечает на другой вопрос и
          поэтому отделён чертой. */}
      {(funnel?.inProgress || terminal || funnel?.current?.length > 0 || funnel?.signedInPeriod) && (
        <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px dashed #e2e8f0", fontSize: 11.5 }}>
          {/* «Сколько мы вообще продали в этом месяце» — то же число, что «Подписали
              договор» в производстве. Разница со стадией выше — договоры по лидам
              прошлых месяцев; называем её вслух, чтобы два числа не выглядели спором. */}
          {funnel?.signedInPeriod && (
            <div style={{ marginBottom: 6, paddingBottom: 6, borderBottom: "1px dashed #f1f5f9" }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: "#1d4ed8", gap: 8 }}>
                <span>{funnel.signedInPeriod.label}: <b>{funnel.signedInPeriod.count}</b></span>
                {showMoney && funnel.signedInPeriod.sum > 0 &&
                  <span style={{ whiteSpace: "nowrap" }}>{fmt(Math.round(funnel.signedInPeriod.sum / 1000))}k ₸</span>}
              </div>
              {funnel.signedInPeriod.fromEarlier > 0 && (
                <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
                  из них {funnel.signedInPeriod.fromEarlier} — по лидам прошлых месяцев
                </div>
              )}
            </div>
          )}
          {funnel?.inProgress && (
            <div style={{ display: "flex", justifyContent: "space-between", color: "#d97706", marginBottom: 4 }}>
              <span>Ещё в работе: <b>{funnel.inProgress.count}</b></span>
              {showMoney && funnel.inProgress.sum > 0 && <span>{fmt(Math.round(funnel.inProgress.sum / 1000))}k ₸</span>}
            </div>
          )}
          {(funnel?.current || []).map(row => (
            <div key={row.label} style={{ display: "flex", justifyContent: "space-between", color: row.color, marginBottom: 4 }}>
              <span>{row.label}: <b>{row.count}</b></span>
              {showMoney && row.sum > 0 && <span>{fmt(Math.round(row.sum / 1000))}k ₸</span>}
            </div>
          ))}
          {(funnel?.lost || terminal) && (() => {
            const t = funnel?.lost || terminal;
            const label = funnel?.lost ? "Отказ" : terminal.label;
            return (
              <div style={{ display: "flex", justifyContent: "space-between", color: "#dc2626" }}>
                <span>{label}: <b>{t.count}</b></span>
                {showMoney && t.sum > 0 && <span>{fmt(Math.round(t.sum / 1000))}k ₸</span>}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
// null, а НЕ 0, когда делить не на что. «0% конверсии» при нуле заходов — это
// утверждение, что мы никого не закрыли, хотя закрывать было некого.
const pctOf = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : null);

// Компактный список дел: просроченное, забытое, долги. Клик — переход к объекту.
function ActionList({ title, items = [], empty, fmt, color = "#dc2626", onOpen, unit = "" }) {
  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 900, color: "#0f172a" }}>{title}</span>
        <span style={{ fontSize: 12, fontWeight: 800, color: items.length ? color : "#059669" }}>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 12, color: "#059669" }}>{empty}</div>
      ) : (
        <div style={{ maxHeight: 210, overflow: "auto" }}>
          {items.slice(0, 12).map((it, i) => (
            <div key={it.id || i} onClick={onOpen ? () => onOpen(it) : undefined}
              style={{
                display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 10, alignItems: "center",
                padding: "7px 0", borderTop: i ? "1px solid #f4f7fb" : 0,
                cursor: onOpen ? "pointer" : "default",
              }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: "#0f172a", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {it.name}
                </div>
                {it.manager && <div style={{ fontSize: 10.5, color: "#94a3b8" }}>{it.manager}</div>}
              </div>
              <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                {it.days !== undefined && (
                  <div style={{ fontSize: 12, fontWeight: 800, color }}>{it.days} дн.{unit}</div>
                )}
                {it.value > 0 && (
                  <div style={{ fontSize: 10.5, color: "#94a3b8" }}>{fmt(Math.round(it.value))} ₸</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Dashboard({ data, fmt, financialDetails = true, permissions = {}, onOpenObject, onNavFinance }) {
  if (!data) return null;
  const { sales, backlog, production, finance, cash, dataQuality, trend, funnels } = data;
  const money = (v) => formatTenge(v);
  const short = (v) => formatTenge(v, { thousands: true });

  // Права. Важное разделение, на котором раньше ошиблись: СУММЫ ПРОДАЖ (сколько
  // продали, средний чек) — это работа отдела продаж, их видит любой, кто работает
  // с объектами. А вот СЕБЕСТОИМОСТЬ, ПРИБЫЛЬ и МАРЖА — только financialDetails,
  // деньги на счетах и дебиторка — только с доступом к финансам.
  const canSales = permissions.objects !== "none";
  const canProduction = permissions.production !== "none";
  const canProfit = financialDetails;
  const canCash = permissions.finance !== "none" || financialDetails;
  const canDataQuality = permissions.admin === "full" || permissions.adminCatalog === "all";

  // Плитки собираются под роль: у продажника сверху продажи, у прораба — стройка,
  // у руководителя — деньги. Никто не видит пустой экран «не для него».
  const heroes = [];
  if (canCash) {
    heroes.push({
      label: "Деньги на счетах", value: money(cash.total), sub: "остаток сейчас",
      accent: cash.total >= 0 ? "#059669" : "#dc2626", onClick: onNavFinance,
      spark: trend.map(t => t.income - t.expense), sparkColor: "#059669",
    });
    heroes.push({
      label: "Выручка за месяц", value: money(finance.income),
      sub: canProfit ? `валовая ${money(finance.gross)}${finance.grossMarginPct === null ? "" : ` · ${finance.grossMarginPct}%`}` : "поступления факт",
      accent: "#0f172a", spark: trend.map(t => t.income), sparkColor: "#2563eb", onClick: onNavFinance,
    });
    heroes.push({
      label: "Дебиторка", value: money(finance.receivables),
      sub: finance.receivablesOverdue ? `просрочено ${short(finance.receivablesOverdue)}` : "без просрочки",
      accent: finance.receivablesOverdue ? "#dc2626" : "#d97706", onClick: onNavFinance,
    });
  }
  if (canSales) {
    heroes.push({
      label: "Подписано за месяц", value: sales.signedCount, sub: money(sales.signedSum),
      accent: "#059669", spark: trend.map(t => t.signedSum), sparkColor: "#059669",
    });
    heroes.push({
      label: "В согласовании", value: sales.inApprovalCount, sub: money(sales.inApprovalSum),
      accent: "#d97706",
    });
    heroes.push({
      label: "Конверсия", value: sales.convTotal === null ? "—" : `${sales.convTotal}%`,
      sub: `новых за месяц: ${sales.newObjects}${sales.avgCheck === null ? "" : ` · средний чек ${short(sales.avgCheck)}`}`,
      accent: "#0f172a",
    });
  }
  if (canProduction) {
    heroes.push({
      label: "Объектов в работе", value: production.inWork,
      sub: `${backlog.activeObjects} в портфеле · ${money(backlog.contracted)}`,
      accent: "#0f172a", spark: trend.map(t => t.signed), sparkColor: "#7c3aed",
    });
    heroes.push({
      label: "Просрочено", value: production.overdueObjects,
      sub: production.overdueObjects ? `в среднем ${production.overdueAvgDays} дн.` : "всё в срок",
      accent: production.overdueObjects ? "#dc2626" : "#059669",
    });
  }

  const nowRows = [
    ...(canProduction ? [
      ["Просроченных этапов", production.overdueStages, "", production.overdueStages ? "#dc2626" : "#059669"],
      ["Сдаётся в этом месяце", backlog.closingThisMonthCount,
        canSales ? money(backlog.closingThisMonthSum) : "", "#2563eb"],
      ["Объектов без движения", production.staleObjects.length, "14+ дней тишины",
        production.staleObjects.length ? "#d97706" : "#059669"],
      ["Открытых замечаний", data.quality.openRemarks,
        data.quality.openOverWeek ? `дольше недели: ${data.quality.openOverWeek}` : "",
        data.quality.openRemarks ? "#dc2626" : "#059669"],
    ] : []),
    ...(canSales ? [
      ["Срок сделки", sales.avgDealDays ? `${sales.avgDealDays} дн.` : "—",
        sales.avgDealDaysSample ? `по ${sales.avgDealDaysSample} сделкам` : "нет дат подписания", "#0f172a"],
      ["Отказов за месяц", sales.lostCount, canSales ? money(sales.lostSum) : "",
        sales.lostCount ? "#dc2626" : "#059669"],
    ] : []),
    ...(canProfit && finance.marginSample > 0 ? [
      ["Маржа план → факт", `${finance.marginPlanAvg}% → ${finance.marginFactAvg}%`,
        finance.marginFactAvg < finance.marginPlanAvg
          ? `теряем ${finance.marginPlanAvg - finance.marginFactAvg} п.` : "держим план",
        finance.marginFactAvg < finance.marginPlanAvg ? "#dc2626" : "#059669"],
    ] : []),
    ...(canDataQuality ? [
      ["Пробелов в данных", dataQuality.totalGaps, "мешают точности цифр",
        dataQuality.totalGaps ? "#d97706" : "#059669"],
    ] : []),
  ];

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
        {heroes.map(h => <HeroTile key={h.label} {...h} />)}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)", gap: 12, marginTop: 12 }}
        className="dash-main">
        <TrendChart trend={trend} fmt={fmt} showMoney={canCash} />
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 900, color: "#0f172a", marginBottom: 4 }}>Сейчас в компании</div>
          {nowRows.map(([label, value, sub, color]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, padding: "7px 0", borderTop: "1px solid #f4f7fb" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: "#334155" }}>{label}</div>
                {sub && <div style={{ fontSize: 10.5, color: "#94a3b8" }}>{sub}</div>}
              </div>
              <div style={{ fontSize: 15, fontWeight: 900, color, whiteSpace: "nowrap" }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12, marginTop: 12 }}>
        {canSales && (
          <FunnelChart funnel={sales.cohortFunnel} fmt={fmt} showMoney={canSales}
            title="Воронка продаж за месяц" hint="кто зашёл в этом месяце и докуда дошёл"
            colors={["#93c5fd", "#60a5fa", "#2563eb"]} />
        )}
        {canProduction && (
          <FunnelChart funnel={funnels.production} fmt={fmt} showMoney={canSales}
            title="Производство за месяц" hint="что произошло на стройке в этом месяце"
            colors={["#a78bfa", "#f59e0b", "#059669"]} />
        )}
        {canProduction && (
          <ActionList title="Горят этапы" items={production.overdueStageList} fmt={fmt}
            empty="Просроченных этапов нет" unit=" просрочки" />
        )}
        {canProduction && (
          <ActionList title="Объекты без движения" items={production.staleObjects} fmt={fmt}
            empty="Все объекты в работе" color="#d97706" onOpen={onOpenObject} unit=" тишины" />
        )}
      </div>

      <style>{`@media(max-width:900px){.dash-main{grid-template-columns:1fr!important}}`}</style>
    </div>
  );
}

export default Dashboard;
