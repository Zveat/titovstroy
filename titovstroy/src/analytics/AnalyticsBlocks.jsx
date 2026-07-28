import React, { useState } from "react";
import { ANALYTICS_BLOCKS, deltaPct, refuseReasonLabel } from "./analyticsModel.js";
import { FunnelChart } from "./Dashboard.jsx";

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

// Раскрывающийся список «что именно посчиталось». Нужен, чтобы цифру можно было
// проверить глазами, а не верить на слово.
function AuditList({ items, fmt, title = "Показать список" }) {
  const [open, setOpen] = useState(false);
  if (!items?.length) return null;
  const dt = (t) => (t ? new Date(t).toLocaleDateString("ru-RU") : "—");
  return (
    <div style={{ marginTop: 8 }}>
      <button type="button" onClick={() => setOpen(v => !v)}
        style={{ border: 0, background: "transparent", color: "#2563eb", cursor: "pointer",
                 fontFamily: "inherit", fontSize: 11, padding: 0 }}>
        {open ? `▲ скрыть · ${title.toLowerCase()}` : `▼ ${title.toLowerCase()} (${items.length})`}
      </button>
      {open && (
        <div style={{ marginTop: 6, maxHeight: 260, overflow: "auto", border: "1px solid #eef2f7", borderRadius: 8 }}>
          {items.map((it, i) => (
            <div key={it.id || i} style={{ display: "grid", gridTemplateColumns: "78px minmax(0,1fr) auto",
              gap: 8, padding: "6px 9px", fontSize: 11, borderTop: i ? "1px solid #f4f7fb" : 0 }}>
              <span style={{ color: "#94a3b8" }}>{dt(it.createdAt)}</span>
              <span style={{ color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {it.name}{it.manager ? ` · ${it.manager}` : ""}
              </span>
              <span style={{ color: "#64748b", whiteSpace: "nowrap" }}>
                {it.value > 0 ? `${fmt(Math.round(it.value))} ₸` : "без сметы"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const EmptyNote = ({ text }) => (
  <div style={{ ...card, color: "#94a3b8", fontSize: 12 }}>{text}</div>
);

export function AnalyticsBlocks({ data, permissions = {}, fmt, financialDetails = true, catProfit = [] }) {
  if (!data) return null;
  const { sales, backlog, production, finance, quality, cash, dataQuality, previous } = data;
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
          <Tile label="Объектов со сметой" value={sales.estimatedCount} sub={money(sales.estimatedSum)}
            delta={d(previous?.sales.estimatedSum, sales.estimatedSum)} />
          <Tile label="В согласовании" value={sales.inApprovalCount} sub={money(sales.inApprovalSum)} accent="#d97706" />
          <Tile label="Подписано" value={sales.signedCount} sub={`${money(sales.signedSum)} · по дате подписания`}
            accent="#059669" delta={d(previous?.sales.signedSum, sales.signedSum)} />
          <Tile label="Средний чек" value={money(sales.avgCheck)} sub="на подписанный объект" />
          <Tile label="Конверсия" value={`${sales.convTotal}%`} sub="объект → договор"
            delta={d(previous?.sales.convTotal, sales.convTotal)} />
          <Tile label="Срок сделки" value={sales.avgDealDays ? `${sales.avgDealDays} дн.` : "—"}
            sub={sales.avgDealDaysSample
              ? `от заведения объекта до подписания · по ${sales.avgDealDaysSample} сделкам`
              : "нет сделок с датой договора"} />
          <Tile label="Цена за м²" value={sales.avgPricePerSqm ? money(sales.avgPricePerSqm) : "—"}
            sub={sales.avgPricePerSqmSample
              ? `по ${sales.avgPricePerSqmSample} объектам с площадью`
              : "не указана площадь"} />
          <Tile label="Отказов" value={sales.lostCount} sub={money(sales.lostSum)} accent="#dc2626"
            delta={d(previous?.sales.lostCount, sales.lostCount)} />
          {sales.cancelledCount > 0 && (
            <Tile label="Расторгнуто" value={sales.cancelledCount} sub="уже подписанных договоров" accent="#dc2626" />
          )}
        </div>

        <AuditList items={sales.cohortList} fmt={fmt} title="Какие объекты посчитаны" />

        <div style={{ ...grid(260), marginTop: 10 }}>
          {/* Когортная воронка: движение объектов, зашедших в выбранном периоде.
              Отвечает на «как отработали месяц», а не «кто где стоит сейчас». */}
          <FunnelChart funnel={sales.cohortFunnel} fmt={fmt} showMoney
            title="Движение по воронке" hint="зашли в периоде — докуда дошли"
            colors={["#93c5fd", "#60a5fa", "#2563eb"]} />

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
                  .sort((a, b) => b[1].estimatedSum - a[1].estimatedSum)
                  .map(([name, v]) => (
                    <BarRow key={name} label={name} value={v.estimatedSum}
                      max={Math.max(...Object.values(sales.byManager).map(x => x.estimatedSum), 1)}
                      note={`смет ${v.estimated}/${v.objects} · подписано ${v.signed}${v.avgCheck ? ` · чек ${money(v.avgCheck)}` : ""}`}
                      color="#059669" />
                  ))}
          </div>
          <div style={card}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "#334155", marginBottom: 8 }}>Конверсия по типу объекта</div>
            {Object.entries(sales.byType).length === 0
              ? <div style={{ fontSize: 11.5, color: "#94a3b8" }}>Нет данных</div>
              : Object.entries(sales.byType)
                  .sort((a, b) => b[1].objects - a[1].objects)
                  .map(([type, v]) => (
                    <BarRow key={type} label={type} value={v.conv} max={100}
                      note={`${v.signed} из ${v.objects} · ${v.conv}%`}
                      color={v.conv >= 30 ? "#059669" : v.conv >= 15 ? "#d97706" : "#dc2626"} />
                  ))}
            <div style={{ fontSize: 10.5, color: "#94a3b8", marginTop: 8 }}>
              Смет на объект в среднем: <b>{sales.estimatedCount ? Math.round(sales.estimatesTotalCount / sales.estimatedCount * 10) / 10 : 0}</b>
            </div>
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
          <Tile label="Простой до старта" value={production.avgStartLagDays ? `${production.avgStartLagDays} дн.` : "—"}
            sub={production.startLagSample
              ? `от подписания до выхода · по ${production.startLagSample} объектам`
              : "нет дат продажи и старта"}
            accent={production.avgStartLagDays > 14 ? "#dc2626" : "#0f172a"} />
          <Tile label="Объектов без движения" value={production.staleObjects.length}
            sub="карточку не трогали 14+ дней"
            accent={production.staleObjects.length ? "#d97706" : "#059669"} />
          {financialDetails && (
            <Tile label="Закрыто, но не оплачено клиентом" value={money(production.unpaidDoneSum)}
              sub={`${production.unpaidDoneStages} закрытых этапов без галочки «оплачено»`} accent="#d97706" />
          )}
        </div>
        <AuditList items={production.overdueStageList} fmt={fmt} title="Какие этапы просрочены" />
        <AuditList items={production.staleObjects} fmt={fmt} title="Объекты без движения" />
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
              sub={`выручка − прямая себестоимость · ${finance.grossMarginPct}%`}
              accent={finance.gross >= 0 ? "#059669" : "#dc2626"}
              delta={d(previous?.finance.gross, finance.gross)} />
          )}
          {financialDetails && (
            <Tile label="Чистая прибыль" value={money(finance.net)}
              sub={`после всех расходов · ${finance.marginPct}%`}
              accent={finance.net >= 0 ? "#059669" : "#dc2626"}
              delta={d(previous?.finance.net, finance.net)} />
          )}
          <Tile label="Дебиторка" value={money(finance.receivables)} sub="осталось получить" accent="#d97706" />
          <Tile label="Просроченная дебиторка" value={money(finance.receivablesOverdue)}
            sub="срок сдачи прошёл" accent={finance.receivablesOverdue ? "#dc2626" : "#0f172a"} />
          {finance.unlinkedObjects > 0 && (
            <Tile label="Без привязки к договору" value={finance.unlinkedObjects}
              sub={`${money(finance.unlinkedSum)} — платежи сопоставить не с чем`} accent="#d97706" />
          )}
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

          {financialDetails && finance.marginSample > 0 && (
            <div style={card}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: "#334155", marginBottom: 8 }}>
                Маржа: план → факт
                <span style={{ fontWeight: 400, color: "#94a3b8" }}> · по {finance.marginSample} объектам</span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 20, fontWeight: 900, color: "#64748b" }}>{finance.marginPlanAvg}%</span>
                <span style={{ color: "#94a3b8" }}>→</span>
                <span style={{ fontSize: 20, fontWeight: 900,
                  color: finance.marginFactAvg >= finance.marginPlanAvg ? "#059669" : "#dc2626" }}>
                  {finance.marginFactAvg}%
                </span>
                <span style={{ fontSize: 11, color: "#94a3b8" }}>
                  {finance.marginFactAvg < finance.marginPlanAvg
                    ? `теряем ${finance.marginPlanAvg - finance.marginFactAvg} пунктов`
                    : "держим план"}
                </span>
              </div>
              {finance.marginDrops.length === 0
                ? <div style={{ fontSize: 11.5, color: "#94a3b8" }}>Объектов с просадкой больше 10 пунктов нет</div>
                : finance.marginDrops.slice(0, 6).map(o => (
                    <BarRow key={o.id} label={o.name} value={o.drop}
                      max={Math.max(...finance.marginDrops.map(x => x.drop))}
                      note={`${o.planMargin}% → ${o.factMargin}% · −${o.drop} п.`} color="#dc2626" />
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
        <div style={{ ...grid(260), marginTop: 10 }}>
          <div style={card}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "#334155", marginBottom: 8 }}>Замечания по прорабам</div>
            {Object.entries(quality.byForeman).length === 0
              ? <div style={{ fontSize: 11.5, color: "#94a3b8" }}>Нет данных</div>
              : Object.entries(quality.byForeman)
                  .sort((a, b) => b[1].total - a[1].total)
                  .map(([name, v]) => (
                    <BarRow key={name} label={name} value={v.total}
                      max={Math.max(...Object.values(quality.byForeman).map(x => x.total), 1)}
                      note={`${v.total} всего · открыто ${v.open} · объектов ${v.objects}`}
                      color={v.open ? "#dc2626" : "#059669"} />
                  ))}
          </div>
        </div>
      </Block>
    ),

    // ── Деньги: остатки на счетах и ближайший приход ──
    cash: financialDetails ? (
      <Block key="cash" icon="🏦" title="Деньги" hint="остатки как в разделе «Финансы»">
        <div style={grid()}>
          <Tile label="Всего на счетах" value={money(cash.total)}
            accent={cash.total >= 0 ? "#059669" : "#dc2626"} />
          <Tile label="Ждём в этом месяце" value={money(cash.expectedThisMonth)}
            sub="долг по объектам, что закрываются" accent="#2563eb" />
          <Tile label="Вся дебиторка" value={money(finance.receivables)} accent="#d97706"
            sub={finance.receivablesOverdue ? `просрочено ${money(finance.receivablesOverdue)}` : "без просрочки"} />
        </div>
        <div style={{ ...grid(260), marginTop: 10 }}>
          <div style={card}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "#334155", marginBottom: 8 }}>Остатки по счетам</div>
            {cash.byAccount.length === 0
              ? <div style={{ fontSize: 11.5, color: "#94a3b8" }}>Счета не заведены</div>
              : cash.byAccount.map(a => (
                  <BarRow key={a.name} label={a.name} value={Math.abs(a.value)}
                    max={Math.max(...cash.byAccount.map(x => Math.abs(x.value)), 1)}
                    note={money(a.value)} color={a.value >= 0 ? "#059669" : "#dc2626"} />
                ))}
          </div>
        </div>
      </Block>
    ) : null,

    // ── Качество данных: почему цифры бывают пустыми ──
    dataQuality: (
      <Block key="dataQuality" icon="🧹" title="Качество данных"
        hint="что дозаполнить, чтобы показателям можно было верить">
        <div style={grid()}>
          <Tile label="Пробелов в объектах" value={dataQuality.totalGaps}
            sub={`активных объектов: ${dataQuality.activeObjects}`}
            accent={dataQuality.totalGaps ? "#d97706" : "#059669"} />
          <Tile label="Операций без договора" value={dataQuality.txWithoutContract}
            sub={`${dataQuality.txWithoutContractPct}% от всех операций`}
            accent={dataQuality.txWithoutContractPct > 20 ? "#dc2626" : "#0f172a"} />
        </div>
        <div style={{ marginTop: 10 }}>
          {dataQuality.gaps.length === 0 ? (
            <div style={{ ...card, fontSize: 12, color: "#059669" }}>Всё заполнено — данные полные.</div>
          ) : dataQuality.gaps.map(g => (
            <div key={g.key} style={{ ...card, marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12 }}>
                <span style={{ color: "#334155", fontWeight: 700 }}>{g.label}</span>
                <span style={{ color: "#dc2626", fontWeight: 700 }}>{g.count}</span>
              </div>
              <AuditList items={g.list} fmt={fmt} title="Показать объекты" />
            </div>
          ))}
        </div>
      </Block>
    ),
  };

  return <div>{visible.map(b => blockById[b.id]).filter(Boolean)}</div>;
}

export default AnalyticsBlocks;

// ─── Плитки для «Главной» ────────────────────────────────────────────────────
// Не аналитика, а «что происходит прямо сейчас»: сколько в работе, что горит,
// сколько денег ждём. Числа берутся из той же модели, что и аналитика, поэтому
// сходятся с ней один в один.
export function DashboardKpis({ data, fmt, financialDetails = true }) {
  if (!data) return null;
  const { sales, backlog, production, finance, cash: cashData } = data;
  const money = (v) => `${fmt(Math.round(v || 0))} ₸`;

  // Две группы: сверху «что происходит» (объекты и сроки), ниже «деньги».
  // Namely: одна цифра — один смысл, дублей между строками быть не должно.
  const work = [
    { label: "Объектов в работе", value: production.inWork,
      sub: production.paused ? `на паузе: ${production.paused}` : "без пауз" },
    { label: "Просрочено", value: production.overdueObjects,
      sub: production.overdueObjects ? `в среднем на ${production.overdueAvgDays} дн.` : "всё в срок",
      accent: production.overdueObjects ? "#dc2626" : "#059669" },
    { label: "Сдано за месяц", value: production.doneInPeriod, accent: "#059669",
      sub: production.onTimeRate ? `в срок: ${production.onTimeRate}%` : "" },
    { label: "В согласовании", value: sales.inApprovalCount, accent: "#d97706",
      sub: money(sales.inApprovalSum) },
    { label: "Подписано за месяц", value: sales.signedCount, sub: money(sales.signedSum), accent: "#059669" },
    { label: "Объектов без движения", value: production.staleObjects.length,
      sub: "не трогали 14+ дней",
      accent: production.staleObjects.length ? "#d97706" : "#059669" },
  ];
  const cash = financialDetails ? [
    { label: "Деньги на счетах", value: money(cashData.total),
      accent: cashData.total >= 0 ? "#059669" : "#dc2626", sub: "сейчас" },
    { label: "Выручка за месяц", value: money(finance.income), accent: "#059669", sub: "поступления факт" },
    { label: "Валовая прибыль", value: money(finance.gross), sub: `маржа ${finance.grossMarginPct}%`,
      accent: finance.gross >= 0 ? "#059669" : "#dc2626" },
    { label: "Дебиторка", value: money(finance.receivables),
      sub: finance.receivablesOverdue ? `просрочено: ${money(finance.receivablesOverdue)}` : "без просрочки",
      accent: finance.receivablesOverdue ? "#dc2626" : "#d97706" },
    { label: "Закрывается в этом месяце", value: backlog.closingThisMonthCount,
      sub: money(backlog.closingThisMonthSum), accent: "#2563eb" },
  ] : [];

  const renderTile = (t) => (
    <div key={t.label} style={card}>
      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>{t.label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: t.accent || "#0f172a", lineHeight: 1.15 }}>{t.value}</div>
      {t.sub && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>{t.sub}</div>}
    </div>
  );

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={grid(150)}>{work.map(renderTile)}</div>
      {cash.length > 0 && (
        <div style={{ ...grid(150), marginTop: 10 }}>{cash.map(renderTile)}</div>
      )}
    </div>
  );
}
