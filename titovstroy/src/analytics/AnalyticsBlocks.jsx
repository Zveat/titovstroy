import React from "react";
import { ANALYTICS_BLOCKS, deltaPct, refuseReasonLabel } from "./analyticsModel.js";

// Блоки аналитики. Компонент только рисует — все числа приходят готовыми из
// buildAnalytics (чистая функция с тестами). Каждый блок скрывается своим правом,
// финансовые показатели дополнительно гасятся флагом financialDetails.

const card = {
  background: "#fff", border: "1px solid #e8edf3", borderRadius: 12,
  padding: 14, minWidth: 0,
};

const Delta = ({ value }) => {
  if (value === null || value === undefined) return null;
  if (value === 0) return <span style={{ fontSize: 11, color: "#94a3b8" }}> — без изменений</span>;
  const up = value > 0;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: up ? "#059669" : "#dc2626" }}>
      {up ? "↑" : "↓"} {Math.abs(value)}%
      <span style={{ color: "#94a3b8", fontWeight: 400 }}> к пред. периоду</span>
    </span>
  );
};

function Tile({ label, value, sub, delta, accent = "#0f172a" }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 21, fontWeight: 900, color: accent, lineHeight: 1.15 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>{sub}</div>}
      {delta !== undefined && <div style={{ marginTop: 5 }}><Delta value={delta} /></div>}
    </div>
  );
}

function Block({ icon, title, hint, children }) {
  return (
    <section style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 15 }}>{icon}</span>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 900, color: "#0f172a" }}>{title}</h3>
        {hint && <span style={{ fontSize: 11, color: "#94a3b8" }}>{hint}</span>}
      </div>
      {children}
    </section>
  );
}

const grid = (min = 165) => ({
  display: "grid",
  gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`,
  gap: 10,
});

// Горизонтальная полоска для распределений (воронка, категории, менеджеры).
function BarRow({ label, value, max, note, color = "#2563eb" }) {
  const width = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div style={{ marginBottom: 7 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 11.5, marginBottom: 3 }}>
        <span style={{ color: "#334155", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        <span style={{ color: "#64748b", whiteSpace: "nowrap" }}>{note}</span>
      </div>
      <div style={{ height: 6, background: "#f1f5f9", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${width}%`, height: "100%", background: color, borderRadius: 4 }} />
      </div>
    </div>
  );
}

const EmptyNote = ({ text }) => (
  <div style={{ ...card, color: "#94a3b8", fontSize: 12 }}>{text}</div>
);

export function AnalyticsBlocks({ data, permissions = {}, fmt, financialDetails = true, catProfit = [] }) {
  if (!data) return null;
  const { sales, backlog, production, finance, quality, previous } = data;
  const money = (v) => `${fmt(Math.round(v || 0))} ₸`;
  const can = (block) => permissions[block.permission] !== false;
  const d = (path, current) => (previous ? deltaPct(current, path) : undefined);

  const visible = ANALYTICS_BLOCKS.filter(can);
  if (!visible.length) {
    return <EmptyNote text="Блоки аналитики скрыты для вашей роли. Настраивается в «Админка → Права ролей»." />;
  }

  const blockById = {
    // ── Продажи и воронка ──
    sales: (
      <Block key="sales" icon="🎯" title="Продажи и воронка" hint="когорта по дате создания объекта">
        <div style={grid()}>
          <Tile label="Новых объектов" value={sales.newObjects}
            delta={d(previous?.sales.newObjects, sales.newObjects)} />
          <Tile label="Посчитано смет" value={sales.estimatedCount} sub={money(sales.estimatedSum)}
            delta={d(previous?.sales.estimatedSum, sales.estimatedSum)} />
          <Tile label="В согласовании" value={sales.inApprovalCount} sub={money(sales.inApprovalSum)} accent="#d97706" />
          <Tile label="Подписано" value={sales.signedCount} sub={money(sales.signedSum)} accent="#059669"
            delta={d(previous?.sales.signedSum, sales.signedSum)} />
          <Tile label="Средний чек" value={money(sales.avgCheck)} sub="на подписанный объект" />
          <Tile label="Конверсия" value={`${sales.convTotal}%`} sub="объект → договор"
            delta={d(previous?.sales.convTotal, sales.convTotal)} />
          <Tile label="Срок сделки" value={sales.avgDealDays ? `${sales.avgDealDays} дн.` : "—"} sub="от заявки до договора" />
          <Tile label="Цена за м²" value={sales.avgPricePerSqm ? money(sales.avgPricePerSqm) : "—"} sub="по подписанным" />
          <Tile label="Отказов" value={sales.lostCount} sub={money(sales.lostSum)} accent="#dc2626"
            delta={d(previous?.sales.lostCount, sales.lostCount)} />
          {sales.cancelledCount > 0 && (
            <Tile label="Расторгнуто" value={sales.cancelledCount} sub="уже подписанных договоров" accent="#dc2626" />
          )}
        </div>

        <div style={{ ...grid(260), marginTop: 10 }}>
          <div style={card}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "#334155", marginBottom: 8 }}>Воронка по шагам</div>
            {[
              ["Создано объектов", sales.newObjects, 100],
              ["Посчитана смета", sales.estimatedCount, sales.convToEstimate],
              ["Подписан договор", sales.signedCount, sales.convTotal],
            ].map(([label, count, percent]) => (
              <BarRow key={label} label={label} value={percent} max={100} note={`${count} · ${percent}%`} />
            ))}
          </div>

          <div style={card}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "#334155", marginBottom: 8 }}>Причины отказа</div>
            {Object.keys(sales.lostByReason).length === 0
              ? <div style={{ fontSize: 11.5, color: "#94a3b8" }}>Отказов в периоде нет</div>
              : Object.entries(sales.lostByReason)
                  .sort((a, b) => b[1].count - a[1].count)
                  .map(([key, v]) => (
                    <BarRow key={key} label={refuseReasonLabel(key)} value={v.count}
                      max={Math.max(...Object.values(sales.lostByReason).map(x => x.count))}
                      note={`${v.count} · ${money(v.sum)}`} color="#dc2626" />
                  ))}
          </div>

          <div style={card}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "#334155", marginBottom: 8 }}>По менеджерам</div>
            {Object.entries(sales.byManager).length === 0
              ? <div style={{ fontSize: 11.5, color: "#94a3b8" }}>Нет данных</div>
              : Object.entries(sales.byManager)
                  .sort((a, b) => b[1].signedSum - a[1].signedSum)
                  .map(([name, v]) => (
                    <BarRow key={name} label={name} value={v.signedSum}
                      max={Math.max(...Object.values(sales.byManager).map(x => x.signedSum), 1)}
                      note={`${v.signed}/${v.objects} · ${money(v.signedSum)}`} color="#059669" />
                  ))}
          </div>
        </div>
      </Block>
    ),

    // ── Портфель заказов ──
    backlog: (
      <Block key="backlog" icon="📦" title="Портфель заказов" hint="состояние сейчас, период не применяется">
        <div style={grid()}>
          <Tile label="Объектов в портфеле" value={backlog.activeObjects} sub="подписаны и в работе" />
          <Tile label="Законтрактовано" value={money(backlog.contracted)} />
          <Tile label="Выполнено"
            value={backlog.objectsWithStagePrices ? money(backlog.doneValue) : "нет данных"}
            sub={backlog.objectsWithStagePrices
              ? `по закрытым этапам (${backlog.objectsWithStagePrices} об. с ценами этапов)`
              : "у этапов не заполнены цены"}
            accent="#059669" />
          <Tile label="Осталось выполнить"
            value={backlog.objectsWithStagePrices ? money(backlog.remaining) : "—"}
            sub="объём работ впереди" accent="#2563eb" />
          <Tile label="Закрывается в этом месяце" value={backlog.closingThisMonthCount}
            sub={money(backlog.closingThisMonthSum)} accent="#d97706" />
        </div>
        <div style={{ ...grid(260), marginTop: 10 }}>
          <div style={card}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "#334155", marginBottom: 8 }}>Загрузка прорабов</div>
            {Object.entries(backlog.byForeman).length === 0
              ? <div style={{ fontSize: 11.5, color: "#94a3b8" }}>Нет активных объектов</div>
              : Object.entries(backlog.byForeman)
                  .sort((a, b) => b[1].sum - a[1].sum)
                  .map(([name, v]) => (
                    <BarRow key={name} label={name} value={v.sum}
                      max={Math.max(...Object.values(backlog.byForeman).map(x => x.sum), 1)}
                      note={`${v.objects} об. · ${money(v.sum)}`} color="#7c3aed" />
                  ))}
          </div>
        </div>
      </Block>
    ),

    // ── Производство и сроки ──
    production: (
      <Block key="production" icon="🔨" title="Производство и сроки">
        <div style={grid()}>
          <Tile label="В работе" value={production.inWork} />
          <Tile label="Приостановлено" value={production.paused} accent={production.paused ? "#d97706" : "#0f172a"} />
          <Tile label="Сдано за период" value={production.doneInPeriod} accent="#059669"
            delta={d(previous?.production.doneInPeriod, production.doneInPeriod)} />
          <Tile label="Просрочено объектов" value={production.overdueObjects}
            sub={production.overdueObjects ? `в среднем на ${production.overdueAvgDays} дн., макс. ${production.overdueMaxDays}` : "всё в срок"}
            accent={production.overdueObjects ? "#dc2626" : "#059669"} />
          <Tile label="Сдача в срок" value={`${production.onTimeRate}%`} sub="из сданных за период"
            accent={production.onTimeRate >= 80 ? "#059669" : "#d97706"}
            delta={d(previous?.production.onTimeRate, production.onTimeRate)} />
          <Tile label="План / факт срока" value={`${production.avgPlanDays} / ${production.avgFactDays} дн.`}
            sub="средняя длительность объекта" />
          <Tile label="Прогресс по этапам" value={`${production.stagesProgress}%`} sub="закрыто на активных объектах" />
          <Tile label="Просроченных этапов" value={production.overdueStages}
            accent={production.overdueStages ? "#dc2626" : "#0f172a"} />
          {financialDetails && (
            <Tile label="Не оплачено бригадам" value={money(production.unpaidDoneSum)}
              sub={`${production.unpaidDoneStages} закрытых этапов`} accent="#d97706" />
          )}
        </div>
      </Block>
    ),

    // ── Финансы ──
    finance: (
      <Block key="finance" icon="💰" title="Финансы" hint="как в ОПУ: без займов, вкладов и авансов; привязка по номеру договора">
        <div style={grid()}>
          <Tile label="Поступления" value={money(finance.income)} accent="#059669"
            delta={d(previous?.finance.income, finance.income)} />
          <Tile label="Расходы" value={money(finance.expense)} accent="#dc2626"
            delta={d(previous?.finance.expense, finance.expense)} />
          {financialDetails && (
            <Tile label="Валовая прибыль" value={money(finance.gross)}
              accent={finance.gross >= 0 ? "#059669" : "#dc2626"}
              delta={d(previous?.finance.gross, finance.gross)} />
          )}
          {financialDetails && <Tile label="Маржа" value={`${finance.marginPct}%`} />}
          <Tile label="Дебиторка" value={money(finance.receivables)} sub="осталось получить" accent="#d97706" />
          <Tile label="Просроченная дебиторка" value={money(finance.receivablesOverdue)}
            sub="срок сдачи прошёл" accent={finance.receivablesOverdue ? "#dc2626" : "#0f172a"} />
        </div>

        <div style={{ ...grid(260), marginTop: 10 }}>
          <div style={card}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "#334155", marginBottom: 8 }}>Расходы по категориям</div>
            {Object.keys(finance.expenseByCategory).length === 0
              ? <div style={{ fontSize: 11.5, color: "#94a3b8" }}>Расходов в периоде нет</div>
              : Object.entries(finance.expenseByCategory)
                  .sort((a, b) => b[1] - a[1]).slice(0, 7)
                  .map(([cat, sum]) => (
                    <BarRow key={cat} label={cat} value={sum}
                      max={Math.max(...Object.values(finance.expenseByCategory))}
                      note={money(sum)} color="#dc2626" />
                  ))}
          </div>

          <div style={card}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "#334155", marginBottom: 8 }}>Денежный поток по месяцам</div>
            {Object.keys(finance.cashflow).length === 0
              ? <div style={{ fontSize: 11.5, color: "#94a3b8" }}>Нет операций в периоде</div>
              : Object.entries(finance.cashflow).sort().map(([month, v]) => (
                  <div key={month} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11, color: "#64748b", marginBottom: 3 }}>{month}</div>
                    <BarRow label="приход" value={v.income}
                      max={Math.max(...Object.values(finance.cashflow).flatMap(x => [x.income, x.expense]), 1)}
                      note={money(v.income)} color="#059669" />
                    <BarRow label="расход" value={v.expense}
                      max={Math.max(...Object.values(finance.cashflow).flatMap(x => [x.income, x.expense]), 1)}
                      note={money(v.expense)} color="#dc2626" />
                  </div>
                ))}
          </div>

          {financialDetails && (
            <div style={card}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: "#334155", marginBottom: 8 }}>
                Перерасход к смете
              </div>
              {finance.overspendObjects.length === 0
                ? <div style={{ fontSize: 11.5, color: "#94a3b8" }}>Перерасхода нет</div>
                : finance.overspendObjects.map(o => (
                    <BarRow key={o.objectId} label={o.name} value={o.overspend}
                      max={Math.max(...finance.overspendObjects.map(x => x.overspend))}
                      note={`+${money(o.overspend)}`} color="#dc2626" />
                  ))}
            </div>
          )}

          {financialDetails && catProfit.length > 0 && (
            <div style={card}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: "#334155", marginBottom: 8 }}>
                Рентабельность по видам работ
                <span style={{ fontWeight: 400, color: "#94a3b8" }}> · по сметам периода</span>
              </div>
              {catProfit.map(c => (
                <BarRow key={c.cat} label={c.cat} value={Math.max(0, c.profit)}
                  max={Math.max(...catProfit.map(x => Math.max(0, x.profit)), 1)}
                  note={`${money(c.profit)} · ${c.margin}%`}
                  color={c.margin >= 35 ? "#059669" : c.margin >= 20 ? "#d97706" : "#dc2626"} />
              ))}
            </div>
          )}

          {financialDetails && (
            <div style={card}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: "#334155", marginBottom: 8 }}>
                Прибыль по объектам
                <span style={{ fontWeight: 400, color: "#94a3b8" }}> · получено − потрачено</span>
              </div>
              {finance.topProfitable.length === 0
                ? <div style={{ fontSize: 11.5, color: "#94a3b8" }}>Нет данных</div>
                : finance.topProfitable.map(o => (
                    <BarRow key={o.objectId} label={o.name} value={Math.abs(o.profit)}
                      max={Math.max(...finance.topProfitable.map(x => Math.abs(x.profit)), 1)}
                      note={money(o.profit)} color={o.profit >= 0 ? "#059669" : "#dc2626"} />
                  ))}
            </div>
          )}
        </div>
      </Block>
    ),

    // ── Качество и клиент ──
    quality: (
      <Block key="quality" icon="⭐" title="Качество и клиент" hint="состояние сейчас — у замечаний в базе нет даты закрытия">
        <div style={grid()}>
          <Tile label="Открытых замечаний" value={quality.openRemarks}
            sub={quality.openFromClient ? `из них от клиента: ${quality.openFromClient}` : "от клиента нет"}
            accent={quality.openRemarks ? "#dc2626" : "#059669"} />
          <Tile label="Висят дольше недели" value={quality.openOverWeek}
            sub={quality.oldestOpenDays ? `самое старое — ${quality.oldestOpenDays} дн.` : ""}
            accent={quality.openOverWeek ? "#dc2626" : "#059669"} />
          <Tile label="Закрыто всего" value={quality.closedRemarks} accent="#059669" />
          <Tile label="Замечаний от клиента" value={quality.fromClient} sub="за всё время" />
          <Tile label="Замечаний на объект" value={quality.remarksPerObject || "—"} sub="в среднем" />
          <Tile label="Чек-лист сдачи" value={`${quality.handoverPct}%`}
            sub={quality.objectsInHandover ? `по ${quality.objectsInHandover} объектам в работе и сданным` : "нет объектов в работе"} />
        </div>
      </Block>
    ),
  };

  return <div>{visible.map(b => blockById[b.id])}</div>;
}

export default AnalyticsBlocks;
