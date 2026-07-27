import React from "react";

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

// Столбчатый график прихода/расхода по месяцам + линия подписанных договоров.
function TrendChart({ trend = [], fmt, showMoney = true }) {
  if (!trend.length) return null;
  const max = Math.max(...trend.flatMap(t => [t.income, t.expense]), 1);
  const barW = 100 / (trend.length * 3);
  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 900, color: "#0f172a" }}>Динамика за 6 месяцев</div>
        <div style={{ display: "flex", gap: 12, fontSize: 10.5, color: "#64748b" }}>
          <span><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: "#059669", marginRight: 4 }} />приход</span>
          <span><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: "#f87171", marginRight: 4 }} />расход</span>
          <span><span style={{ display: "inline-block", width: 9, height: 2, background: "#2563eb", marginRight: 4, verticalAlign: "middle" }} />подписано</span>
        </div>
      </div>

      <svg viewBox="0 0 100 46" preserveAspectRatio="none" style={{ width: "100%", height: 150, marginTop: 12, display: "block" }}>
        {[0.25, 0.5, 0.75].map(p => (
          <line key={p} x1="0" x2="100" y1={40 * p} y2={40 * p} stroke="#f1f5f9" strokeWidth="0.4" />
        ))}
        {trend.map((t, i) => {
          const x = i * (100 / trend.length) + barW * 0.5;
          const hIn = (t.income / max) * 38;
          const hOut = (t.expense / max) * 38;
          return (
            <g key={t.month}>
              <rect x={x} y={40 - hIn} width={barW} height={Math.max(hIn, 0.4)} fill="#059669" rx="0.4" />
              <rect x={x + barW * 1.15} y={40 - hOut} width={barW} height={Math.max(hOut, 0.4)} fill="#f87171" rx="0.4" />
            </g>
          );
        })}
        {(() => {
          const maxSigned = Math.max(...trend.map(t => t.signed), 1);
          const pts = trend.map((t, i) => {
            const x = i * (100 / trend.length) + (100 / trend.length) / 2;
            return `${x},${40 - (t.signed / maxSigned) * 34}`;
          }).join(" ");
          return <polyline points={pts} fill="none" stroke="#2563eb" strokeWidth="1.6"
            vectorEffect="non-scaling-stroke" strokeLinejoin="round" />;
        })()}
      </svg>

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${trend.length}, 1fr)`, gap: 2, marginTop: 4 }}>
        {trend.map(t => (
          <div key={t.month} style={{ textAlign: "center", fontSize: 10, color: "#94a3b8" }}>
            <div style={{ fontWeight: 700, color: "#64748b" }}>{monthLabel(t.month)}</div>
            {showMoney && <div>{fmt(Math.round(t.income / 1000))}k</div>}
            <div style={{ color: "#2563eb" }}>{t.signed ? `${t.signed} дог.` : "—"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

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
  const { sales, backlog, production, finance, cash, dataQuality, trend } = data;
  // Что кому показывать. Опираемся на уже существующие права роли, чтобы не плодить
  // отдельные настройки: деньги — financialDetails, стройка — доступ к производству,
  // продажи — доступ к объектам, «пробелы в данных» — только тем, кто их и правит.
  const canMoney = financialDetails;
  const canProduction = permissions.production !== "none";
  const canSales = permissions.objects !== "none";
  const canDataQuality = permissions.admin === "full" || permissions.adminCatalog === "all";
  const money = (v) => `${fmt(Math.round(v || 0))} ₸`;
  const short = (v) => `${fmt(Math.round((Number(v) || 0) / 1000))}k ₸`;

  const heroes = [];
  if (canMoney) {
    heroes.push({
      label: "Деньги на счетах", value: money(cash.total), sub: "остаток сейчас",
      accent: cash.total >= 0 ? "#059669" : "#dc2626", onClick: onNavFinance,
      spark: trend.map(t => t.income - t.expense), sparkColor: "#059669",
    });
    heroes.push({
      label: "Выручка за месяц", value: money(finance.income),
      sub: `валовая ${money(finance.gross)} · ${finance.grossMarginPct}%`,
      accent: "#0f172a", spark: trend.map(t => t.income), sparkColor: "#2563eb",
      onClick: onNavFinance,
    });
    heroes.push({
      label: "Дебиторка", value: money(finance.receivables),
      sub: finance.receivablesOverdue ? `просрочено ${short(finance.receivablesOverdue)}` : "без просрочки",
      accent: finance.receivablesOverdue ? "#dc2626" : "#d97706", onClick: onNavFinance,
    });
  }
  if (canProduction) heroes.push({
    label: "Объектов в работе", value: production.inWork,
    sub: `${backlog.activeObjects} в портфеле · ${money(backlog.contracted)}`,
    accent: "#0f172a", spark: trend.map(t => t.signed), sparkColor: "#7c3aed",
  });

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
        {heroes.map(h => <HeroTile key={h.label} {...h} />)}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1fr)", gap: 12, marginTop: 12 }}
        className="dash-main">
        <TrendChart trend={trend} fmt={fmt} showMoney={financialDetails} />

        <div style={{ display: "grid", gap: 12 }}>
          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#0f172a", marginBottom: 10 }}>Сейчас в компании</div>
            {[
              ...(canProduction ? [
              ["Просрочено объектов", production.overdueObjects,
                production.overdueObjects ? `в среднем ${production.overdueAvgDays} дн.` : "всё в срок",
                production.overdueObjects ? "#dc2626" : "#059669"],
              ["Просроченных этапов", production.overdueStages, "", production.overdueStages ? "#dc2626" : "#059669"],
              ] : []),
              ...(canProduction && canMoney ? [
              ["Сдаётся в этом месяце", backlog.closingThisMonthCount, money(backlog.closingThisMonthSum), "#2563eb"],
              ] : []),
              ...(canSales ? [
              ["В согласовании", sales.inApprovalCount, canMoney ? money(sales.inApprovalSum) : "", "#d97706"],
              ] : []),
              ...(canDataQuality ? [
              ["Пробелов в данных", dataQuality.totalGaps, "мешают точности цифр",
                dataQuality.totalGaps ? "#d97706" : "#059669"],
              ] : []),
            ].map(([label, value, sub, color]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, padding: "7px 0", borderTop: "1px solid #f4f7fb" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: "#334155" }}>{label}</div>
                  {sub && <div style={{ fontSize: 10.5, color: "#94a3b8" }}>{sub}</div>}
                </div>
                <div style={{ fontSize: 16, fontWeight: 900, color }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {canProduction && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginTop: 12 }}>
          <ActionList title="Горят этапы" items={production.overdueStageList} fmt={fmt}
            empty="Просроченных этапов нет" unit=" просрочки" />
          <ActionList title="Объекты без движения" items={production.staleObjects} fmt={fmt}
            empty="Все объекты в работе" color="#d97706" onOpen={onOpenObject} unit=" тишины" />
        </div>
      )}

      <style>{`@media(max-width:900px){.dash-main{grid-template-columns:1fr!important}}`}</style>
    </div>
  );
}

export default Dashboard;
