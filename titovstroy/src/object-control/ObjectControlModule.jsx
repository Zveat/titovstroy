import { useEffect, useMemo, useState } from "react";
import {
  buildObjectHealth,
  buildSupplySummary,
  buildTaskSummary,
  buildTodayStageGroups,
  updateSupplyStatus,
  updateTaskStatus,
} from "./objectControl.js";

const localDateKey = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const statusMeta = {
  todo: { label: "Не начато", color: "#64748b", bg: "#f1f5f9" },
  progress: { label: "В работе", color: "#2563eb", bg: "#eff6ff" },
  done: { label: "Готово", color: "#059669", bg: "#ecfdf5" },
  delayed: { label: "Есть проблема", color: "#dc2626", bg: "#fef2f2" },
};

const panelStyle = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  padding: 18,
};

function Metric({ label, value, note, tone = "default" }) {
  const colors = {
    default: ["#0f172a", "#f8fafc"],
    ok: ["#047857", "#ecfdf5"],
    warning: ["#b45309", "#fffbeb"],
    danger: ["#b91c1c", "#fef2f2"],
    info: ["#1d4ed8", "#eff6ff"],
  }[tone] || ["#0f172a", "#f8fafc"];
  return (
    <div style={{ background: colors[1], border: "1px solid #e2e8f0", borderRadius: 8, padding: "13px 14px", minHeight: 84 }}>
      <div style={{ color: "#64748b", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>{label}</div>
      <div style={{ color: colors[0], fontSize: 24, fontWeight: 900, marginTop: 5 }}>{value}</div>
      {note && <div style={{ color: "#64748b", fontSize: 11.5, marginTop: 3 }}>{note}</div>}
    </div>
  );
}

function StageLine({ stage, readOnly, onStatus }) {
  const meta = statusMeta[stage.status] || statusMeta.todo;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: 12, alignItems: "center", padding: "12px 0", borderBottom: "1px solid #eef2f7" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: "#0f172a", fontSize: 13.5, fontWeight: 800, overflowWrap: "anywhere" }}>{stage.name || "Работа без названия"}</div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center", marginTop: 4, color: "#64748b", fontSize: 11.5 }}>
          <span>{stage.cat || "Без раздела"}</span>
          {stage.responsible && <span>Ответственный: {stage.responsible}</span>}
          {stage.planEnd && <span>Срок: {stage.planEnd}</span>}
          <span style={{ color: meta.color, background: meta.bg, borderRadius: 5, padding: "2px 6px", fontWeight: 800 }}>{meta.label}</span>
        </div>
      </div>
      {!readOnly && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {stage.status !== "progress" && stage.status !== "done" && <button type="button" onClick={() => onStatus(stage.id, "progress")} style={actionStyle("#2563eb", "#eff6ff")}>Начать</button>}
          {stage.status !== "done" && <button type="button" onClick={() => onStatus(stage.id, "done")} style={actionStyle("#047857", "#ecfdf5")}>Готово</button>}
          {stage.status !== "delayed" && stage.status !== "done" && <button type="button" onClick={() => onStatus(stage.id, "delayed")} style={actionStyle("#b91c1c", "#fef2f2")}>Проблема</button>}
        </div>
      )}
    </div>
  );
}

const actionStyle = (color, background) => ({
  border: `1px solid ${color}33`, background, color, borderRadius: 6, padding: "7px 10px",
  fontSize: 11.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
});

function ControlView({ production, currentUser, readOnly, onPatchProduction }) {
  const today = localDateKey();
  const health = useMemo(() => buildObjectHealth(production, today), [production, today]);
  const active = (production.stages || []).filter((stage) => ["progress", "delayed"].includes(stage.status));
  const latestReport = [...(production.dailyReports || [])].sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))[0];
  const toneLabel = health.tone === "danger" ? "Нужно вмешательство" : health.tone === "warning" ? "Нужен контроль" : "Под контролем";

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ ...panelStyle, background: "#111c31", borderColor: "#111c31", color: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>Оперативная картина объекта</div>
            <div style={{ color: "#aebbd0", fontSize: 12.5, marginTop: 4 }}>Сроки, текущие работы, проблемы и отчёт прораба в одном месте</div>
          </div>
          <div style={{ border: "1px solid #ffffff26", borderRadius: 7, padding: "8px 12px", color: health.tone === "danger" ? "#fca5a5" : health.tone === "warning" ? "#fcd34d" : "#6ee7b7", fontWeight: 900, fontSize: 12.5 }}>{toneLabel}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 10 }}>
        <Metric label="Готовность" value={`${health.progressPct}%`} note={`${health.doneStages} из ${health.totalStages} работ`} tone="info" />
        <Metric label="Сейчас в работе" value={health.activeStages} note="активных этапов" tone={health.activeStages ? "ok" : "warning"} />
        <Metric label="Просрочено" value={health.overdueStages} note="этапов по плану" tone={health.overdueStages ? "danger" : "ok"} />
        <Metric label="Проблемы" value={health.delayedStages + health.openDefects} note="задержки и замечания" tone={health.delayedStages + health.openDefects ? "danger" : "ok"} />
        <Metric label="Запуск" value={`${health.launchPct}%`} note="чек-лист готовности" tone={health.launchPct === 100 ? "ok" : "warning"} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 12 }}>
        <section style={panelStyle}>
          <div style={{ fontSize: 14, fontWeight: 900, color: "#0f172a", marginBottom: 6 }}>Текущие работы</div>
          {active.length ? active.slice(0, 8).map((stage) => <StageLine key={stage.id} stage={stage} readOnly />) : <div style={{ color: "#94a3b8", fontSize: 12.5, padding: "18px 0" }}>Сейчас нет этапов со статусом «В работе».</div>}
        </section>
        <section style={panelStyle}>
          <div style={{ fontSize: 14, fontWeight: 900, color: "#0f172a" }}>Последний отчёт прораба</div>
          {latestReport ? (
            <div style={{ marginTop: 12, display: "grid", gap: 10, fontSize: 12.5, color: "#475569" }}>
              <div><b style={{ color: "#0f172a" }}>{latestReport.date}</b> · {latestReport.createdByName || "Сотрудник"}</div>
              <ReportField label="Людей на объекте" value={latestReport.workers || "Не указано"} />
              <ReportField label="Что мешает" value={latestReport.blockers || "Нет блокеров"} />
              <ReportField label="Нужно на завтра" value={latestReport.tomorrowNeeds || "Не указано"} />
              {latestReport.note && <ReportField label="Комментарий" value={latestReport.note} />}
            </div>
          ) : <div style={{ color: "#94a3b8", fontSize: 12.5, padding: "18px 0" }}>Ежедневных отчётов пока нет.</div>}
        </section>
      </div>
      <WorkCoordination production={production} currentUser={currentUser} readOnly={readOnly} onPatchProduction={onPatchProduction} />
    </div>
  );
}

function ReportField({ label, value }) {
  return <div><div style={{ color: "#94a3b8", fontSize: 10.5, fontWeight: 800, textTransform: "uppercase" }}>{label}</div><div style={{ marginTop: 2, overflowWrap: "anywhere" }}>{value}</div></div>;
}

function TodayView({ object, production, currentUser, readOnly, onStageStatus, onCloseDay, onPatchProduction }) {
  const today = localDateKey();
  const groups = useMemo(() => buildTodayStageGroups(production.stages || [], today), [production.stages, today]);
  const existing = (production.dailyReports || []).find((report) => report?.date === today && String(report?.createdById || "") === String(currentUser?.id || ""));
  const [form, setForm] = useState({ workers: "", blockers: "", tomorrowNeeds: "", note: "" });
  const [saved, setSaved] = useState(false);

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
      completedStageIds: (production.stages || []).filter((stage) => stage.status === "done").map((stage) => stage.id),
      missedStageIds: groups.overdue.map((stage) => stage.id),
    });
    setSaved(true);
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ ...panelStyle, display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#0f172a" }}>План на сегодня</div>
          <div style={{ fontSize: 12.5, color: "#64748b", marginTop: 3 }}>{today} · только текущие и срочные работы</div>
        </div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          <span style={chipStyle("#2563eb", "#eff6ff")}>В работе: {groups.active.length}</span>
          <span style={chipStyle("#dc2626", "#fef2f2")}>Просрочено: {groups.overdue.length}</span>
          <span style={chipStyle("#b45309", "#fffbeb")}>На сегодня: {groups.dueToday.length}</span>
        </div>
      </div>

      <section style={panelStyle}>
        <div style={{ fontSize: 14, fontWeight: 900, color: "#0f172a" }}>{groups.isFallback ? "Следующие работы" : "Фокус дня"}</div>
        <div style={{ color: "#64748b", fontSize: 11.5, marginTop: 3 }}>{groups.isFallback ? "Сроки не заданы, поэтому показаны первые незавершённые этапы." : "Статус меняется одним нажатием и сохраняется через общую очередь производства."}</div>
        {groups.focus.length ? groups.focus.map((stage) => <StageLine key={stage.id} stage={stage} readOnly={readOnly} onStatus={onStageStatus} />) : <div style={{ color: "#047857", background: "#ecfdf5", borderRadius: 7, padding: 14, marginTop: 12, fontWeight: 800, fontSize: 13 }}>Все этапы завершены.</div>}
      </section>

      <section style={panelStyle}>
        <div style={{ fontSize: 14, fontWeight: 900, color: "#0f172a" }}>Закрытие дня</div>
        <div style={{ color: "#64748b", fontSize: 11.5, marginTop: 3 }}>Отчёт сохранится только после нажатия кнопки. Повторное сохранение обновит сегодняшний отчёт.</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))", gap: 10, marginTop: 14 }}>
          <InputField label="Людей на объекте"><input type="number" min="0" value={form.workers} disabled={readOnly} onChange={(event) => { setSaved(false); setForm((prev) => ({ ...prev, workers: event.target.value })); }} style={inputStyle} /></InputField>
          <InputField label="Что мешало работе"><input value={form.blockers} disabled={readOnly} onChange={(event) => { setSaved(false); setForm((prev) => ({ ...prev, blockers: event.target.value })); }} placeholder="Нет материалов, нет доступа..." style={inputStyle} /></InputField>
          <InputField label="Что нужно на завтра"><input value={form.tomorrowNeeds} disabled={readOnly} onChange={(event) => { setSaved(false); setForm((prev) => ({ ...prev, tomorrowNeeds: event.target.value })); }} placeholder="Материалы, мастер, решение..." style={inputStyle} /></InputField>
        </div>
        <div style={{ marginTop: 10 }}><InputField label="Комментарий"><textarea rows={2} value={form.note} disabled={readOnly} onChange={(event) => { setSaved(false); setForm((prev) => ({ ...prev, note: event.target.value })); }} placeholder="Короткий итог дня" style={{ ...inputStyle, resize: "vertical" }} /></InputField></div>
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, marginTop: 12 }}>
          {saved && <span style={{ color: "#059669", fontSize: 12, fontWeight: 800 }}>Отчёт принят к сохранению</span>}
          {!readOnly && <button type="button" onClick={closeDay} style={{ border: 0, borderRadius: 7, padding: "10px 16px", background: "#0f172a", color: "#fff", fontFamily: "inherit", fontSize: 12.5, fontWeight: 900, cursor: "pointer" }}>Закрыть день</button>}
        </div>
      </section>
      <WorkCoordination production={production} currentUser={currentUser} readOnly={readOnly} onPatchProduction={onPatchProduction} />
    </div>
  );
}

const taskStatusMeta = {
  open: { label: "К выполнению", color: "#b45309", bg: "#fffbeb" },
  in_progress: { label: "В работе", color: "#2563eb", bg: "#eff6ff" },
  done: { label: "Готово", color: "#047857", bg: "#ecfdf5" },
  cancelled: { label: "Отменено", color: "#64748b", bg: "#f1f5f9" },
};

const supplyStatusMeta = {
  needed: { label: "Нужно", color: "#b45309", bg: "#fffbeb" },
  ordered: { label: "Заказано", color: "#2563eb", bg: "#eff6ff" },
  delivered: { label: "На объекте", color: "#047857", bg: "#ecfdf5" },
  cancelled: { label: "Отменено", color: "#64748b", bg: "#f1f5f9" },
};

const makeWorkId = (prefix) => {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ? `${prefix}_${uuid}` : `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};

function WorkCoordination({ production, currentUser, readOnly, onPatchProduction }) {
  const today = localDateKey();
  const tasks = Array.isArray(production?.tasks) ? production.tasks : [];
  const supplyRequests = Array.isArray(production?.supplyRequests) ? production.supplyRequests : [];
  const taskSummary = useMemo(() => buildTaskSummary(tasks, today), [tasks, today]);
  const supplySummary = useMemo(() => buildSupplySummary(supplyRequests, today), [supplyRequests, today]);
  const [taskForm, setTaskForm] = useState({ title: "", assignee: "", dueDate: "", priority: "normal" });
  const [supplyForm, setSupplyForm] = useState({ title: "", quantity: "", neededBy: "", responsible: "" });

  const visibleTasks = tasks.filter((item) => !["done", "cancelled"].includes(item?.status)).slice(0, 8);
  const visibleSupply = supplyRequests.filter((item) => !["delivered", "cancelled"].includes(item?.status)).slice(0, 8);
  const actor = currentUser?.name || currentUser?.login || "Сотрудник";

  const saveTasks = (next) => onPatchProduction?.({ tasks: next });
  const saveSupply = (next) => onPatchProduction?.({ supplyRequests: next });
  const setTaskStatus = (taskId, status) => saveTasks(tasks.map((task) => (
    task?.id === taskId ? updateTaskStatus(task, status, Date.now()) : task
  )));
  const setSupplyStatus = (requestId, status) => saveSupply(supplyRequests.map((request) => (
    request?.id === requestId ? updateSupplyStatus(request, status, Date.now()) : request
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

  const addSupply = () => {
    const title = supplyForm.title.trim();
    if (!title || readOnly) return;
    saveSupply([...supplyRequests, {
      id: makeWorkId("supply"), title, quantity: supplyForm.quantity.trim(), neededBy: supplyForm.neededBy,
      responsible: supplyForm.responsible.trim(), status: "needed", createdAt: Date.now(), createdByName: actor,
    }]);
    setSupplyForm({ title: "", quantity: "", neededBy: "", responsible: "" });
  };

  return (
    <section style={{ ...panelStyle, padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "15px 18px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 900, color: "#0f172a" }}>Координация работ</div>
          <div style={{ color: "#64748b", fontSize: 11.5, marginTop: 3 }}>Поручения прорабу и заявки на материалы в одной очереди</div>
        </div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          <span style={chipStyle(taskSummary.overdue ? "#b91c1c" : "#2563eb", taskSummary.overdue ? "#fef2f2" : "#eff6ff")}>Задачи: {taskSummary.open}</span>
          <span style={chipStyle(supplySummary.late ? "#b91c1c" : "#b45309", supplySummary.late ? "#fef2f2" : "#fffbeb")}>Снабжение: {supplySummary.open}</span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 390px), 1fr))" }}>
        <CoordinationColumn title="Задачи" icon="✓" empty="Открытых задач нет." bordered>
          {!readOnly && (
            <div style={coordinationFormStyle}>
              <input value={taskForm.title} onChange={(event) => setTaskForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="Что нужно сделать" style={{ ...inputStyle, gridColumn: "1 / -1" }} />
              <input value={taskForm.assignee} onChange={(event) => setTaskForm((prev) => ({ ...prev, assignee: event.target.value }))} placeholder="Ответственный" style={inputStyle} />
              <input type="date" value={taskForm.dueDate} onChange={(event) => setTaskForm((prev) => ({ ...prev, dueDate: event.target.value }))} style={inputStyle} />
              <select value={taskForm.priority} onChange={(event) => setTaskForm((prev) => ({ ...prev, priority: event.target.value }))} style={inputStyle}>
                <option value="normal">Обычная</option><option value="high">Срочная</option>
              </select>
              <button type="button" onClick={addTask} disabled={!taskForm.title.trim()} style={primaryMiniButton}>Добавить</button>
            </div>
          )}
          {visibleTasks.length ? visibleTasks.map((task) => (
            <CoordinationRow key={task.id} title={task.title} meta={[task.assignee, task.dueDate && `до ${task.dueDate}`].filter(Boolean).join(" · ")} status={taskStatusMeta[task.status] || taskStatusMeta.open} urgent={task.priority === "high" || (task.dueDate && task.dueDate < today)}>
              {!readOnly && task.status === "open" && <button type="button" onClick={() => setTaskStatus(task.id, "in_progress")} style={actionStyle("#2563eb", "#eff6ff")}>Начать</button>}
              {!readOnly && task.status !== "done" && <button type="button" onClick={() => setTaskStatus(task.id, "done")} style={actionStyle("#047857", "#ecfdf5")}>Готово</button>}
            </CoordinationRow>
          )) : <EmptyCoordination text="Открытых задач нет." />}
        </CoordinationColumn>

        <CoordinationColumn title="Снабжение" icon="▣" empty="Открытых заявок нет.">
          {!readOnly && (
            <div style={coordinationFormStyle}>
              <input value={supplyForm.title} onChange={(event) => setSupplyForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="Материал или инструмент" style={{ ...inputStyle, gridColumn: "1 / -1" }} />
              <input value={supplyForm.quantity} onChange={(event) => setSupplyForm((prev) => ({ ...prev, quantity: event.target.value }))} placeholder="Количество" style={inputStyle} />
              <input type="date" value={supplyForm.neededBy} onChange={(event) => setSupplyForm((prev) => ({ ...prev, neededBy: event.target.value }))} style={inputStyle} />
              <input value={supplyForm.responsible} onChange={(event) => setSupplyForm((prev) => ({ ...prev, responsible: event.target.value }))} placeholder="Кто закупает" style={inputStyle} />
              <button type="button" onClick={addSupply} disabled={!supplyForm.title.trim()} style={primaryMiniButton}>Добавить</button>
            </div>
          )}
          {visibleSupply.length ? visibleSupply.map((item) => (
            <CoordinationRow key={item.id} title={item.title} meta={[item.quantity, item.responsible, item.neededBy && `к ${item.neededBy}`].filter(Boolean).join(" · ")} status={supplyStatusMeta[item.status] || supplyStatusMeta.needed} urgent={item.neededBy && item.neededBy < today}>
              {!readOnly && item.status === "needed" && <button type="button" onClick={() => setSupplyStatus(item.id, "ordered")} style={actionStyle("#2563eb", "#eff6ff")}>Заказано</button>}
              {!readOnly && item.status !== "delivered" && <button type="button" onClick={() => setSupplyStatus(item.id, "delivered")} style={actionStyle("#047857", "#ecfdf5")}>На объекте</button>}
            </CoordinationRow>
          )) : <EmptyCoordination text="Открытых заявок нет." />}
        </CoordinationColumn>
      </div>
    </section>
  );
}

function CoordinationColumn({ title, icon, children, bordered }) {
  return <div style={{ padding: "15px 18px 18px", borderRight: bordered ? "1px solid #e2e8f0" : "none", minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 900, color: "#0f172a", marginBottom: 10 }}>{icon} {title}</div>{children}</div>;
}

function CoordinationRow({ title, meta, status, urgent, children }) {
  return <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, alignItems: "center", padding: "10px 0", borderBottom: "1px solid #eef2f7" }}>
    <div style={{ minWidth: 0 }}>
      <div style={{ color: urgent ? "#b91c1c" : "#0f172a", fontSize: 12.5, fontWeight: 850, overflowWrap: "anywhere" }}>{title}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4, alignItems: "center" }}>
        <span style={{ ...chipStyle(status.color, status.bg), padding: "2px 6px", fontSize: 10.5 }}>{status.label}</span>
        {meta && <span style={{ color: "#64748b", fontSize: 10.8 }}>{meta}</span>}
      </div>
    </div>
    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "flex-end" }}>{children}</div>
  </div>;
}

function EmptyCoordination({ text }) {
  return <div style={{ color: "#94a3b8", fontSize: 12, padding: "14px 0 4px" }}>{text}</div>;
}

const coordinationFormStyle = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 7, padding: 10, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 7, marginBottom: 7 };
const primaryMiniButton = { border: 0, borderRadius: 6, padding: "8px 10px", background: "#0f172a", color: "#fff", fontFamily: "inherit", fontSize: 11.5, fontWeight: 850, cursor: "pointer" };

function InputField({ label, children }) {
  return <label style={{ display: "grid", gap: 5, color: "#64748b", fontSize: 11.5, fontWeight: 800 }}>{label}{children}</label>;
}

const inputStyle = { width: "100%", boxSizing: "border-box", border: "1px solid #dbe3ee", borderRadius: 7, padding: "9px 10px", fontFamily: "inherit", color: "#0f172a", background: "#fff", fontSize: 12.5 };
const chipStyle = (color, background) => ({ color, background, border: `1px solid ${color}26`, borderRadius: 6, padding: "6px 9px", fontSize: 11.5, fontWeight: 900 });

export default function ObjectControlModule(props) {
  if (props.mode === "today") return <TodayView {...props} />;
  return <ControlView {...props} />;
}
