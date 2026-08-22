import { useEffect, useMemo, useState } from "react";
import { STAGE_REPORTS_CSS } from "../stage-reports/StageReports.jsx";
import {
  buildObjectHealth,
  buildTaskSummary,
  buildTodayStageGroups,
  countStagesWithPlan,
  isDefectClosed,
  updateTaskStatus,
} from "./objectControl.js";

// ─────────────────────────────────────────────────────────────────────────
// ОПЕРАТИВНАЯ ЧАСТЬ КАРТОЧКИ ОБЪЕКТА — две вкладки.
//
//   «Сегодня»    — экран прораба: что делать сегодня, статус в один тап,
//                  закрытие дня и срочное по задачам/снабжению.
//   «Управление» — экран руководителя: картина объекта, что не так, полный
//                  список задач и заявок с формами.
//
// Задачи живут в ОДНОМ компоненте с двумя режимами. Раньше он целиком рисовался
// и там и там — один и тот же блок дважды подряд. Теперь на «Сегодня» только
// просроченное и на сегодня плюс быстрое добавление, полный список — на
// «Управлении».
//
// Снабжения здесь нет намеренно: заявки писать некому — прораб закупает сам,
// и очередь заявок самому себе только создавала бы вид работы.
// ─────────────────────────────────────────────────────────────────────────

const localDateKey = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

// Даты в интерфейсе — по-человечески. «2026-08-14» на карточке читается как
// служебный мусор, особенно когда таких строк десяток подряд.
const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
// capitalize поднимал и «Августа» — заглавная нужна только первой букве.
const capFirst = (value) => { const text = String(value || ""); return text ? text[0].toUpperCase() + text.slice(1) : text; };
const shortDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  return `${date.getDate()} ${MONTHS[date.getMonth()]}${sameYear ? "" : " " + String(date.getFullYear()).slice(2)}`;
};
const longDate = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return String(value || "");
  const full = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  const week = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
  const day = week[date.getDay()];
  // Заглавная — только у дня недели. CSS-capitalize поднимал ещё и месяц: «13 Августа».
  return `${day[0].toUpperCase()}${day.slice(1)}, ${date.getDate()} ${full[date.getMonth()]}`;
};

const statusMeta = {
  todo: { label: "Не начато", color: "#64748b", bg: "#f1f5f9" },
  progress: { label: "В работе", color: "#2563eb", bg: "#eff6ff" },
  done: { label: "Готово", color: "#059669", bg: "#ecfdf5" },
  delayed: { label: "Есть проблема", color: "#dc2626", bg: "#fef2f2" },
};

const panel = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 };
const chip = (color, background) => ({ color, background, border: `1px solid ${color}26`, borderRadius: 7, padding: "5px 9px", fontSize: 11.5, fontWeight: 800, whiteSpace: "nowrap" });
const bigAction = (color, background) => ({
  border: `1px solid ${color}33`, background, color, borderRadius: 9, padding: "11px 14px",
  fontSize: 13.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
  minHeight: 42, lineHeight: 1,
});
const action = (color, background) => ({
  border: `1px solid ${color}33`, background, color, borderRadius: 7, padding: "7px 11px",
  fontSize: 11.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
});
const inputStyle = { width: "100%", boxSizing: "border-box", border: "1px solid #dbe3ee", borderRadius: 8, padding: "9px 10px", fontFamily: "inherit", color: "#0f172a", background: "#fff", fontSize: 13 };
const sectionTitle = { fontSize: 14, fontWeight: 800, color: "#0f172a" };
const sectionNote = { fontSize: 11.5, color: "#64748b", marginTop: 3 };
const emptyNote = { color: "#94a3b8", fontSize: 12.5, padding: "16px 0" };

// Мобильная раскладка. Инлайновые стили медиа-запросов не умеют, а весь модуль
// на них: без этого блока формы уезжают за край телефона, а ряды кнопок
// разваливаются на неровные ступеньки.
const CSS = STAGE_REPORTS_CSS + `
.oc-two{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:12px}
.oc-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;
  padding:11px 0;border-bottom:1px solid #eef2f7}
.oc-acts{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.oc-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:11px;
  background:#f8fafc;border:1px solid #e2e8f0;border-radius:9px}
.oc-form-wide{grid-column:1/-1}
/* Карточка работы: слева текст, справа действия. На телефоне действия уходят
   вниз и растягиваются — по кнопке во всю ширину пальцем не промахнёшься. */
.oc-stage{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;
  padding:12px 13px;background:#fff;border:1px solid #e2e8f0;border-radius:11px;margin-top:8px}
.oc-stage-acts{display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
/* Полоса готовности вместо плитки с процентом */
.oc-bar{height:9px;border-radius:5px;background:#e2e8f0;overflow:hidden}
.oc-bar>i{display:block;height:100%;border-radius:5px;background:#2563eb}
@media(max-width:700px){.oc-grow{flex:1 1 100%!important}}
@media(max-width:700px){
  .oc-row{grid-template-columns:minmax(0,1fr)!important;gap:8px!important}
  .oc-acts{justify-content:flex-start!important}
  .oc-acts>button{flex:1 1 auto!important;min-width:88px!important}
  .oc-form{grid-template-columns:minmax(0,1fr)!important}
  .oc-stage{grid-template-columns:minmax(0,1fr)!important;gap:10px!important}
  .oc-stage-acts{justify-content:stretch!important}
  .oc-stage-acts>button{flex:1 1 40%!important}
  .oc-stage-acts>button:first-child{flex:1 1 100%!important}
  .oc-head{flex-direction:column!important;align-items:stretch!important}
}`;

// Работа — карточка с ОДНИМ главным действием. Раньше это была строка с тремя
// одинаково мелкими кнопками: на телефоне в них надо целиться, и было непонятно,
// что нажимать. Теперь главное действие зависит от статуса и занимает всю
// ширину, остальные — второстепенные и мельче.
function StageLine({ stage, readOnly, onStatus, compact, reports }) {
  const meta = statusMeta[stage.status] || statusMeta.todo;
  const today = localDateKey();
  const late = stage.status !== "done" && stage.planEnd && stage.planEnd < today;
  const primary = stage.status === "progress"
    ? { key: "done", label: "✓ Готово", color: "#047857", bg: "#ecfdf5" }
    : stage.status === "delayed"
      ? { key: "progress", label: "▶ Продолжить", color: "#2563eb", bg: "#eff6ff" }
      : { key: "progress", label: "▶ Начать", color: "#2563eb", bg: "#eff6ff" };
  const extras = [
    stage.status !== "done" && primary.key !== "done" ? { key: "done", label: "Готово", color: "#047857", bg: "#ecfdf5" } : null,
    stage.status !== "delayed" && stage.status !== "done" ? { key: "delayed", label: "Проблема", color: "#b91c1c", bg: "#fef2f2" } : null,
  ].filter(Boolean);
  const done = stage.status === "done";

  return (
    <div className="oc-stage" style={{ borderLeft: `3px solid ${late ? "#dc2626" : meta.color}` }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: done ? "#94a3b8" : late ? "#b91c1c" : "#0f172a", fontSize: 14, fontWeight: 700,
          overflowWrap: "anywhere", lineHeight: 1.3, textDecoration: done ? "line-through" : "none" }}>{stage.name || "Работа без названия"}</div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center", marginTop: 5, color: "#64748b", fontSize: 11.5 }}>
          <span style={{ ...chip(meta.color, meta.bg), padding: "2px 7px", fontSize: 10.5 }}>{meta.label}</span>
          {!compact && stage.cat && <span>{stage.cat}</span>}
          {stage.responsible && <span>{stage.responsible}</span>}
          {stage.planEnd && <span style={late ? { color: "#b91c1c", fontWeight: 800 } : undefined}>до {shortDate(stage.planEnd)}</span>}
          {stage.qty > 0 && <span>{stage.qty} {stage.unit || ""}</span>}
        </div>
      </div>
      {!readOnly && onStatus && !done && (
        <div className="oc-stage-acts">
          <button type="button" onClick={() => onStatus(stage.id, primary.key)} style={bigAction(primary.color, primary.bg)}>{primary.label}</button>
          {extras.map((item) => (
            <button key={item.key} type="button" onClick={() => onStatus(stage.id, item.key)} style={action(item.color, item.bg)}>{item.label}</button>
          ))}
        </div>
      )}
      {!readOnly && onStatus && done && (
        <div className="oc-stage-acts">
          <button type="button" onClick={() => onStatus(stage.id, "progress")} style={action("#64748b", "#f1f5f9")}>Вернуть в работу</button>
        </div>
      )}
      {/* Фото и расчёт с рабочими — те же панели, что на вкладке «Этапы».
          Прораб работает здесь, и гонять его на другую вкладку ради снимка
          скрытых работ значит, что снимка не будет. */}
      {reports ? <div style={{ gridColumn: "1 / -1" }}>{reports(stage)}</div> : null}
    </div>
  );
}

// ─── ВКЛАДКА «УПРАВЛЕНИЕ» — экран руководителя ───
function ControlView({ production, currentUser, readOnly, onPatchProduction, onAddDefect, defectsReadOnly, renderStageReports }) {
  const today = localDateKey();
  const health = useMemo(() => buildObjectHealth(production, today), [production, today]);
  const stages = production.stages || [];
  const active = stages.filter((stage) => ["progress", "delayed"].includes(stage.status));
  const latestReport = [...(production.dailyReports || [])].sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))[0];

  // Вместо «Нужен контроль» без объяснений — конкретные причины. Ровно то же
  // правило, по которому объект попадает наверх диспетчерской.
  const reasons = [];
  if (health.overdueStages) reasons.push(`Просрочено этапов: ${health.overdueStages}`);
  if (health.delayedStages) reasons.push(`Отмечено проблемой: ${health.delayedStages}`);
  if (health.openDefects) reasons.push(`Открытых замечаний: ${health.openDefects}`);
  if (health.deadlineOverdue) reasons.push("Плановая сдача просрочена");
  if (!health.activeStages && health.totalStages) reasons.push("Ни одна работа не в работе");
  if (health.launchPct < 100 && health.totalStages) reasons.push(`Чек-лист запуска: ${health.launchPct}%`);
  const tone = health.tone;
  const toneLabel = tone === "danger" ? "Нужно вмешательство" : tone === "warning" ? "Нужен контроль" : "Под контролем";
  const toneColor = tone === "danger" ? "#fca5a5" : tone === "warning" ? "#fcd34d" : "#6ee7b7";

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <style>{CSS}</style>
      {/* Одна панель состояния вместо тёмной шапки и пяти плиток. Три плитки из
          пяти почти всегда показывали ноль — это был шум, из-за которого главное
          (готовность и причины) терялось. Теперь: полоса готовности, а рядом
          только те показатели, которые не нули. */}
      <section style={{ ...panel, borderColor: tone === "danger" ? "#fecaca" : tone === "warning" ? "#fde68a" : "#e2e8f0" }}>
        <div className="oc-head" style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#0f172a", lineHeight: 1 }}>{health.progressPct}%</div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>готовность · {health.doneStages} из {health.totalStages} работ</div>
          </div>
          <span style={{ ...chip(
            tone === "danger" ? "#b91c1c" : tone === "warning" ? "#b45309" : "#047857",
            tone === "danger" ? "#fef2f2" : tone === "warning" ? "#fffbeb" : "#ecfdf5"), flexShrink: 0 }}>{toneLabel}</span>
        </div>
        <div className="oc-bar" style={{ marginTop: 10 }}>
          <i style={{ width: `${health.progressPct}%`, background: tone === "danger" ? "#dc2626" : tone === "warning" ? "#d97706" : "#059669" }} />
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 11 }}>
          {health.activeStages > 0 && <span style={chip("#2563eb", "#eff6ff")}>В работе: {health.activeStages}</span>}
          {health.overdueStages > 0 && <span style={chip("#b91c1c", "#fef2f2")}>Просрочено: {health.overdueStages}</span>}
          {health.delayedStages > 0 && <span style={chip("#b91c1c", "#fef2f2")}>Проблемы: {health.delayedStages}</span>}
          {health.openDefects > 0 && <span style={chip("#b45309", "#fffbeb")}>Замечания: {health.openDefects}</span>}
          {health.launchPct < 100 && <span style={chip("#b45309", "#fffbeb")}>Запуск: {health.launchPct}%</span>}
          {reasons.length === 0 && <span style={chip("#047857", "#ecfdf5")}>Просрочек и замечаний нет</span>}
        </div>
        {/* Причины строкой убраны: чипы выше говорят ровно то же самое цифрами. */}
      </section>

      <div className="oc-two">
        <section style={panel}>
          <div style={sectionTitle}>Сейчас в работе</div>
          {active.length
            ? active.slice(0, 8).map((stage) => <StageLine key={stage.id} stage={stage} readOnly reports={renderStageReports} />)
            : <div style={emptyNote}>Ни один этап не отмечен «В работе». Отметьте на вкладке «Сегодня» — тогда здесь будет видно, чем занят объект.</div>}
        </section>
        <section style={panel}>
          <div style={sectionTitle}>Последний отчёт прораба</div>
          {latestReport ? (
            <div style={{ marginTop: 11, display: "grid", gap: 9, fontSize: 12.5, color: "#475569" }}>
              <div><b style={{ color: "#0f172a" }}>{shortDate(latestReport.date)}</b> · {latestReport.createdByName || "Сотрудник"}</div>
              <ReportField label="Людей на объекте" value={latestReport.workers || "Не указано"} />
              <ReportField label="Что мешает" value={latestReport.blockers || "Ничего не мешает"} />
              <ReportField label="Нужно на завтра" value={latestReport.tomorrowNeeds || "Не указано"} />
              {latestReport.note && <ReportField label="Комментарий" value={latestReport.note} />}
            </div>
          ) : <div style={emptyNote}>Отчётов пока нет. Прораб закрывает день на вкладке «Сегодня».</div>}
        </section>
      </div>

      <OpenDefects production={production} readOnly={defectsReadOnly} onAdd={onAddDefect} />
      <WorkCoordination production={production} currentUser={currentUser} readOnly={readOnly} onPatchProduction={onPatchProduction} />
    </div>
  );
}

// Замечания на «Управлении». Раньше их тут только считали: руководитель видел в
// отчёте прораба «скол на откосе» и шёл записывать на соседнюю вкладку. Пишем
// в тот же список, что и вкладка «Замечания» — это одни и те же записи.
function OpenDefects({ production, readOnly, onAdd }) {
  const [text, setText] = useState("");
  const defects = Array.isArray(production?.defects) ? production.defects : [];
  const open = defects.filter((item) => !isDefectClosed(item));
  const submit = () => { const value = text.trim(); if (!value || readOnly) return; onAdd?.(value); setText(""); };
  return (
    <section style={panel}>
      <div className="oc-head" style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={sectionTitle}>⚠️ Открытые замечания</div>
          <div style={sectionNote}>Тот же список, что на вкладке «Замечания» — там их закрывают</div>
        </div>
        <span style={chip(open.length ? "#b91c1c" : "#047857", open.length ? "#fef2f2" : "#ecfdf5")}>{open.length ? `Открыто: ${open.length}` : "Всё устранено"}</span>
      </div>
      {!readOnly && (
        <div style={{ display: "flex", gap: 8, marginTop: 11, flexWrap: "wrap" }}>
          <input className="oc-grow" value={text} onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") submit(); }}
            placeholder="Что исправить" style={{ ...inputStyle, flex: "1 1 220px", width: "auto" }} />
          <button type="button" onClick={submit} disabled={!text.trim()} style={primaryMini}>Записать</button>
        </div>
      )}
      {open.length ? open.slice(0, 8).map((item) => (
        <div key={item.id} style={{ padding: "10px 0", borderBottom: "1px solid #eef2f7" }}>
          <div style={{ fontSize: 12.5, color: "#0f172a", fontWeight: 700, overflowWrap: "anywhere", lineHeight: 1.3 }}>{item.text || "Без описания"}</div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>{item.author || "—"}{item.ts ? ` · ${shortDate(item.ts)}` : ""}</div>
        </div>
      )) : <div style={emptyNote}>Замечаний нет.</div>}
    </section>
  );
}

function ReportField({ label, value }) {
  return (
    <div>
      <div style={{ color: "#94a3b8", fontSize: 10.5, fontWeight: 800, textTransform: "uppercase" }}>{label}</div>
      <div style={{ marginTop: 2, overflowWrap: "anywhere" }}>{value}</div>
    </div>
  );
}

// ─── ВКЛАДКА «СЕГОДНЯ» — экран прораба ───
function TodayView({ object, production, currentUser, readOnly, onStageStatus, onCloseDay, onPatchProduction, onPlanDates, renderStageReports }) {
  const today = localDateKey();
  const stages = production.stages || [];
  const groups = useMemo(() => buildTodayStageGroups(stages, today), [stages, today]);
  const withPlan = countStagesWithPlan(stages);
  const existing = (production.dailyReports || []).find((report) => report?.date === today && String(report?.createdById || "") === String(currentUser?.id || ""));
  const [form, setForm] = useState({ workers: "", blockers: "", tomorrowNeeds: "", note: "" });
  const [saved, setSaved] = useState(false);
  const [dayOpen, setDayOpen] = useState(false);

  useEffect(() => {
    setForm({
      workers: existing?.workers ?? "",
      blockers: existing?.blockers || "",
      tomorrowNeeds: existing?.tomorrowNeeds || "",
      note: existing?.note || "",
    });
    setSaved(Boolean(existing));
  }, [existing?.id, existing?.updatedAt]);

  const closeDay = () => {
    onCloseDay({
      objectId: object.id,
      date: today,
      createdById: currentUser?.id || currentUser?.login || "unknown",
      createdByName: currentUser?.name || currentUser?.login || "Сотрудник",
      workers: form.workers === "" ? "" : Number(form.workers),
      blockers: form.blockers.trim(),
      tomorrowNeeds: form.tomorrowNeeds.trim(),
      note: form.note.trim(),
      completedStageIds: stages.filter((stage) => stage.status === "done").map((stage) => stage.id),
      missedStageIds: groups.overdue.map((stage) => stage.id),
    });
    setSaved(true);
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <style>{CSS}</style>
      {/* Шапка одной строкой. Заголовок «План на сегодня» убран: вкладка и так
          называется «Сегодня», а он занимал строку. Нулевые счётчики не рисуем —
          у большинства объектов сроков нет, и три нуля были просто шумом. */}
      <div className="oc-head" style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: "#0f172a" }}>{capFirst(longDate())}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {groups.overdue.length > 0 && <span style={chip("#b91c1c", "#fef2f2")}>Просрочено: {groups.overdue.length}</span>}
          {groups.dueToday.length > 0 && <span style={chip("#b45309", "#fffbeb")}>На сегодня: {groups.dueToday.length}</span>}
          <span style={chip(groups.active.length ? "#2563eb" : "#64748b", groups.active.length ? "#eff6ff" : "#f1f5f9")}>В работе: {groups.active.length}</span>
        </div>
      </div>

      {/* Сроки — узкое место. Без них «просрочено» всегда ноль, а фокус дня
          показывает первые попавшиеся работы. Предлагаем расставить прямо тут. */}
      {!readOnly && stages.length > 0 && withPlan < stages.length && (
        <div style={{ ...panel, background: "#fffbeb", borderColor: "#fde68a", display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", padding: "12px 16px" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#92400e" }}>Сроки заданы у {withPlan} из {stages.length} работ</div>
            <div style={{ fontSize: 11.5, color: "#b45309", marginTop: 2 }}>Пока сроков нет, просрочки не считаются, а план дня — просто первые незавершённые работы.</div>
          </div>
          <button type="button" onClick={onPlanDates} style={{ ...action("#b45309", "#fff"), padding: "9px 14px", fontSize: 12.5, flexShrink: 0 }}>Расставить сроки</button>
        </div>
      )}

      {/* Работы идут карточками прямо в потоке, без общей панели: лишняя рамка
          вокруг рамок только съедала ширину на телефоне. */}
      <div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>{groups.isFallback ? "Следующие работы" : "Фокус дня"}</div>
          {groups.isFallback && <span style={{ fontSize: 11.5, color: "#94a3b8" }}>сроки не заданы — показаны первые незавершённые</span>}
        </div>
        {groups.focus.length
          ? groups.focus.map((stage) => <StageLine key={stage.id} stage={stage} readOnly={readOnly} onStatus={onStageStatus} compact reports={renderStageReports} />)
          : <div style={{ color: "#047857", background: "#ecfdf5", border: "1px solid #bbf7d0", borderRadius: 11, padding: 16, marginTop: 8, fontWeight: 800, fontSize: 13.5 }}>✓ Все работы завершены</div>}
      </div>

      {/* Закрытие дня свёрнуто в одну кнопку. Форма из четырёх полей занимала
          пол-экрана и стояла открытой весь день, хотя нужна один раз вечером.
          Если день уже закрыт — видно это и краткую выжимку, без раскрытия. */}
      <section style={panel}>
        <button type="button" onClick={() => setDayOpen(value => !value)}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
            background: "transparent", border: 0, padding: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 14, fontWeight: 800, color: "#0f172a" }}>
              {saved ? "✓ День закрыт" : "🌙 Закрыть день"}
            </span>
            <span style={{ display: "block", fontSize: 11.5, color: "#94a3b8", marginTop: 2, overflowWrap: "anywhere" }}>
              {saved
                ? [existing?.workers !== "" && existing?.workers != null ? `людей: ${existing.workers}` : "", existing?.blockers || "", existing?.tomorrowNeeds ? `на завтра: ${existing.tomorrowNeeds}` : ""].filter(Boolean).join(" · ") || "отчёт сохранён"
                : "людей на объекте, что мешало, что нужно завтра"}
            </span>
          </span>
          <span style={{ fontSize: 11, color: "#94a3b8", flexShrink: 0 }}>{dayOpen ? "▲" : "▼"}</span>
        </button>
        {dayOpen && (<>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,190px),1fr))", gap: 9, marginTop: 12 }}>
          <Field label="Людей на объекте"><input type="number" min="0" inputMode="numeric" value={form.workers} disabled={readOnly} onChange={(event) => { setSaved(false); setForm((prev) => ({ ...prev, workers: event.target.value })); }} style={inputStyle} /></Field>
          <Field label="Что мешало работе"><input value={form.blockers} disabled={readOnly} onChange={(event) => { setSaved(false); setForm((prev) => ({ ...prev, blockers: event.target.value })); }} placeholder="Нет материалов, нет доступа…" style={inputStyle} /></Field>
          <Field label="Что нужно на завтра"><input value={form.tomorrowNeeds} disabled={readOnly} onChange={(event) => { setSaved(false); setForm((prev) => ({ ...prev, tomorrowNeeds: event.target.value })); }} placeholder="Материалы, мастер, решение…" style={inputStyle} /></Field>
        </div>
        <div style={{ marginTop: 9 }}>
          <Field label="Комментарий"><textarea rows={2} value={form.note} disabled={readOnly} onChange={(event) => { setSaved(false); setForm((prev) => ({ ...prev, note: event.target.value })); }} placeholder="Короткий итог дня" style={{ ...inputStyle, resize: "vertical", minHeight: 62 }} /></Field>
        </div>
        {!readOnly && (
          <button type="button" onClick={() => { closeDay(); setDayOpen(false); }}
            style={{ width: "100%", border: 0, borderRadius: 9, padding: "13px 18px", background: "#0f172a", color: "#fff",
              fontFamily: "inherit", fontSize: 14, fontWeight: 800, cursor: "pointer", marginTop: 12, minHeight: 46 }}>
            {saved ? "Обновить отчёт за день" : "Закрыть день"}
          </button>
        )}
        </>)}
      </section>

      <WorkCoordination production={production} currentUser={currentUser} readOnly={readOnly} onPatchProduction={onPatchProduction} compact />
    </div>
  );
}

function Field({ label, children }) {
  return <label style={{ display: "grid", gap: 5, color: "#64748b", fontSize: 11.5, fontWeight: 800 }}>{label}{children}</label>;
}

// ─── КООРДИНАЦИЯ РАБОТ ───
const taskStatusMeta = {
  open: { label: "К выполнению", color: "#b45309", bg: "#fffbeb" },
  in_progress: { label: "В работе", color: "#2563eb", bg: "#eff6ff" },
  done: { label: "Готово", color: "#047857", bg: "#ecfdf5" },
  cancelled: { label: "Отменено", color: "#64748b", bg: "#f1f5f9" },
};

const makeWorkId = (prefix) => {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ? `${prefix}_${uuid}` : `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};

function WorkCoordination({ production, currentUser, readOnly, onPatchProduction, compact = false }) {
  const today = localDateKey();
  const tasks = Array.isArray(production?.tasks) ? production.tasks : [];
  const taskSummary = useMemo(() => buildTaskSummary(tasks, today), [tasks, today]);
  const [taskForm, setTaskForm] = useState({ title: "", assignee: "", dueDate: "", priority: "normal" });
  // На «Сегодня» форму держим свёрнутой: прорабу чаще нужно посмотреть, а не завести.
  const [openForm, setOpenForm] = useState(compact ? "" : "task");
  // Выполненные не исчезают: их видно отдельным свёрнутым списком, и любую
  // можно вернуть в работу. Раньше нажал «Готово» — и задача пропадала совсем.
  const [showDone, setShowDone] = useState(false);

  const isOpenTask = (item) => !["done", "cancelled"].includes(item?.status);
  // Компактный режим: только то, что горит — просрочено, на сегодня, срочное.
  const urgentTask = (item) => item?.priority === "high" || (item?.dueDate && item.dueDate <= today);
  const visibleTasks = tasks.filter(item => isOpenTask(item) && (!compact || urgentTask(item))).slice(0, compact ? 4 : 10);
  const doneTasks = tasks.filter(item => !isOpenTask(item))
    .sort((a, b) => String(b?.completedAt || "").localeCompare(String(a?.completedAt || "")));
  const actor = currentUser?.name || currentUser?.login || "Сотрудник";

  const saveTasks = (next) => onPatchProduction?.({ tasks: next });
  const setTaskStatus = (taskId, status) => saveTasks(tasks.map((task) => (
    task?.id === taskId ? updateTaskStatus(task, status, today) : task
  )));

  const addTask = () => {
    const title = taskForm.title.trim();
    if (!title || readOnly) return;
    saveTasks([...tasks, {
      id: makeWorkId("task"), title, assignee: taskForm.assignee.trim(), dueDate: taskForm.dueDate,
      priority: taskForm.priority, status: "open", createdAt: Date.now(), createdByName: actor,
    }]);
    setTaskForm({ title: "", assignee: "", dueDate: "", priority: "normal" });
  };
  const formOpen = openForm === "task";
  const toggle = () => setOpenForm((prev) => (prev ? "" : "task"));

  return (
    <section style={{ ...panel, padding: 0, overflow: "hidden" }}>
      <div className="oc-head" style={{ padding: "13px 16px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>✓ Задачи по объекту</div>
          <div style={sectionNote}>{compact ? "Только срочное — полный список на вкладке «Управление»" : "Поручения прорабу: что сделать, кому и к какому сроку"}</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={chip(taskSummary.overdue ? "#b91c1c" : "#2563eb", taskSummary.overdue ? "#fef2f2" : "#eff6ff")}>Открыто: {taskSummary.open}{taskSummary.overdue ? ` · просрочено ${taskSummary.overdue}` : ""}</span>
          {!readOnly && <button type="button" onClick={toggle} style={action(formOpen ? "#64748b" : "#0f172a", formOpen ? "#f1f5f9" : "#f8fafc")}>{formOpen ? "Свернуть" : "+ Задача"}</button>}
        </div>
      </div>

      <div style={{ padding: "13px 16px 16px" }}>
        {!readOnly && formOpen && (
          <div className="oc-form" style={{ marginBottom: 9 }}>
            <input className="oc-form-wide" value={taskForm.title} onChange={(event) => setTaskForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="Что нужно сделать" style={inputStyle} />
            <input value={taskForm.assignee} onChange={(event) => setTaskForm((prev) => ({ ...prev, assignee: event.target.value }))} placeholder="Ответственный" style={inputStyle} />
            <input type="date" value={taskForm.dueDate} onChange={(event) => setTaskForm((prev) => ({ ...prev, dueDate: event.target.value }))} style={inputStyle} />
            <select value={taskForm.priority} onChange={(event) => setTaskForm((prev) => ({ ...prev, priority: event.target.value }))} style={inputStyle}>
              <option value="normal">Обычная</option><option value="high">Срочная</option>
            </select>
            <button type="button" onClick={addTask} disabled={!taskForm.title.trim()} style={primaryMini}>Добавить</button>
          </div>
        )}
        {visibleTasks.length ? visibleTasks.map((task) => (
          <Row key={task.id} title={task.title}
            meta={[task.assignee, task.dueDate && `до ${shortDate(task.dueDate)}`].filter(Boolean).join(" · ")}
            status={taskStatusMeta[task.status] || taskStatusMeta.open}
            urgent={task.priority === "high" || (task.dueDate && task.dueDate < today)}>
            {!readOnly && task.status === "open" && <button type="button" onClick={() => setTaskStatus(task.id, "in_progress")} style={action("#2563eb", "#eff6ff")}>Начать</button>}
            {!readOnly && task.status !== "done" && <button type="button" onClick={() => setTaskStatus(task.id, "done")} style={action("#047857", "#ecfdf5")}>Готово</button>}
          </Row>
        )) : <div style={emptyNote}>{compact
          ? (taskSummary.open ? `Срочных задач нет. Всего открыто: ${taskSummary.open}` : "Открытых задач нет.")
          : "Открытых задач нет. Нажмите «+ Задача», чтобы поставить поручение."}</div>}

        {!compact && doneTasks.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <button type="button" onClick={() => setShowDone(value => !value)}
              style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer", fontFamily: "inherit",
                fontSize: 12, fontWeight: 800, color: "#64748b" }}>
              {showDone ? "▲" : "▼"} Выполнено и отменено: {doneTasks.length}
            </button>
            {showDone && doneTasks.map((task) => (
              <Row key={task.id} title={task.title} muted
                meta={[task.assignee, task.completedAt && `закрыто ${shortDate(task.completedAt)}`].filter(Boolean).join(" · ")}
                status={taskStatusMeta[task.status] || taskStatusMeta.done}>
                {!readOnly && <button type="button" onClick={() => setTaskStatus(task.id, "open")} style={action("#64748b", "#f1f5f9")}>Вернуть в работу</button>}
              </Row>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function Row({ title, meta, status, urgent, muted, children }) {
  return (
    <div className="oc-row">
      <div style={{ minWidth: 0 }}>
        <div style={{ color: muted ? "#94a3b8" : urgent ? "#b91c1c" : "#0f172a", fontSize: 12.5, fontWeight: 700,
          overflowWrap: "anywhere", lineHeight: 1.3, textDecoration: muted ? "line-through" : "none" }}>{title}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4, alignItems: "center" }}>
          <span style={{ ...chip(status.color, status.bg), padding: "2px 7px", fontSize: 10.5 }}>{status.label}</span>
          {meta && <span style={{ color: "#64748b", fontSize: 11 }}>{meta}</span>}
        </div>
      </div>
      <div className="oc-acts">{children}</div>
    </div>
  );
}

const primaryMini = { border: 0, borderRadius: 8, padding: "9px 12px", background: "#0f172a", color: "#fff", fontFamily: "inherit", fontSize: 12, fontWeight: 800, cursor: "pointer" };

export default function ObjectControlModule(props) {
  if (props.mode === "today") return <TodayView {...props} />;
  return <ControlView {...props} />;
}
