const DONE_DEFECT_STATUSES = new Set(["done", "closed", "resolved"]);
const DONE_TASK_STATUSES = new Set(["done", "cancelled"]);
const OPEN_SUPPLY_STATUSES = new Set(["needed", "ordered"]);

const cleanItems = (items) => (Array.isArray(items) ? items.filter(Boolean) : []);

const uniqStages = (groups) => {
  const seen = new Set();
  return groups.flat().filter((stage) => {
    const key = String(stage?.id || "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const buildTodayStageGroups = (stages = [], today) => {
  const unfinished = stages.filter((stage) => stage && stage.status !== "done");
  const active = unfinished.filter((stage) => ["progress", "delayed"].includes(stage.status));
  const overdue = unfinished.filter((stage) => (
    stage.status === "todo" && stage.planEnd && stage.planEnd < today
  ));
  const dueToday = unfinished.filter((stage) => (
    stage.status === "todo"
      && !overdue.some((item) => item.id === stage.id)
      && (stage.planStart === today || stage.planEnd === today)
  ));
  const selected = uniqStages([active, overdue, dueToday]);
  const isFallback = selected.length === 0;
  const focus = isFallback ? unfinished.filter((stage) => stage.status === "todo").slice(0, 3) : selected;

  return { active, overdue, dueToday, focus, isFallback };
};

export const buildObjectHealth = (production = {}, today) => {
  const stages = Array.isArray(production.stages) ? production.stages : [];
  const checklist = Array.isArray(production.checklistLaunch) ? production.checklistLaunch : [];
  const defects = Array.isArray(production.defects) ? production.defects : [];
  const totalStages = stages.length;
  const doneStages = stages.filter((stage) => stage.status === "done").length;
  const activeStages = stages.filter((stage) => stage.status === "progress").length;
  const delayedStages = stages.filter((stage) => stage.status === "delayed").length;
  const overdueStages = stages.filter((stage) => (
    stage.status !== "done" && stage.planEnd && stage.planEnd < today
  )).length;
  const openDefects = defects.filter((defect) => (
    !DONE_DEFECT_STATUSES.has(String(defect?.status || "open").toLowerCase())
  )).length;
  const launchDone = checklist.filter((item) => item?.done).length;
  const deadlineOverdue = Boolean(production.planEndDate && production.planEndDate < today && doneStages < totalStages);
  const hasDanger = delayedStages > 0 || overdueStages > 0 || openDefects > 0 || deadlineOverdue;
  const hasWarning = !hasDanger && (activeStages === 0 || (checklist.length > 0 && launchDone < checklist.length));

  return {
    totalStages,
    doneStages,
    activeStages,
    delayedStages,
    overdueStages,
    openDefects,
    progressPct: totalStages ? Math.round((doneStages / totalStages) * 100) : 0,
    launchPct: checklist.length ? Math.round((launchDone / checklist.length) * 100) : 0,
    deadlineOverdue,
    tone: hasDanger ? "danger" : hasWarning ? "warning" : "ok",
  };
};

export const buildTaskSummary = (tasks = [], today) => {
  const all = cleanItems(tasks);
  const actionable = all.filter((task) => !DONE_TASK_STATUSES.has(task.status));
  return {
    total: all.length,
    open: actionable.length,
    inProgress: actionable.filter((task) => task.status === "in_progress").length,
    dueToday: actionable.filter((task) => task.dueDate === today).length,
    overdue: actionable.filter((task) => task.dueDate && task.dueDate < today).length,
    high: actionable.filter((task) => task.priority === "high").length,
    done: all.filter((task) => task.status === "done").length,
  };
};

export const buildSupplySummary = (requests = [], today) => {
  const all = cleanItems(requests);
  const open = all.filter((request) => OPEN_SUPPLY_STATUSES.has(request.status));
  return {
    total: all.length,
    open: open.length,
    needed: open.filter((request) => request.status === "needed").length,
    ordered: open.filter((request) => request.status === "ordered").length,
    late: open.filter((request) => request.neededBy && request.neededBy < today).length,
    delivered: all.filter((request) => request.status === "delivered").length,
  };
};

const stageReason = (count) => count === 1 ? "Просрочен 1 этап" : `Просрочено ${count} этапов`;
const delayedStageReason = (count) => count === 1 ? "Задержан 1 этап" : `Задержано ${count} этапов`;
const defectReason = (count) => count === 1 ? "1 открытое замечание" : `${count} открытых замечания`;
const taskReason = (count) => count === 1 ? "Просрочена 1 задача" : `Просрочено ${count} задач`;
const highTaskReason = (count) => count === 1 ? "1 срочная задача" : `${count} срочных задач`;
const supplyReason = (count) => count === 1 ? "Опаздывает 1 заявка" : `Опаздывают ${count} заявки`;

export const buildObjectDispatcher = (objects = [], productions = [], today) => {
  const productionByObject = new Map(
    cleanItems(productions).map((production) => [String(production.objectId), production]),
  );
  return cleanItems(objects).map((object) => {
    const production = productionByObject.get(String(object.id)) || { objectId: object.id };
    const health = buildObjectHealth(production, today);
    const tasks = buildTaskSummary(production.tasks, today);
    const supply = buildSupplySummary(production.supplyRequests, today);
    const reasons = [];
    if (health.overdueStages) reasons.push(stageReason(health.overdueStages));
    if (health.delayedStages) reasons.push(delayedStageReason(health.delayedStages));
    if (health.openDefects) reasons.push(defectReason(health.openDefects));
    if (tasks.overdue) reasons.push(taskReason(tasks.overdue));
    if (tasks.high) reasons.push(highTaskReason(tasks.high));
    if (supply.late) reasons.push(supplyReason(supply.late));
    const score = (
      health.overdueStages * 5
      + health.delayedStages * 5
      + health.openDefects * 4
      + tasks.overdue * 4
      + supply.late * 3
      + tasks.high * 2
    );
    return {
      object,
      production,
      health,
      tasks,
      supply,
      reasons,
      score,
      tone: score > 0 ? "danger" : health.tone,
    };
  }).sort((a, b) => b.score - a.score || String(a.object.clientName || "").localeCompare(String(b.object.clientName || ""), "ru"));
};

export const updateStageStatus = (stage, status, today) => {
  if (!stage || !["todo", "progress", "done", "delayed"].includes(status)) return stage;
  const next = { ...stage, status };
  if (["progress", "done"].includes(status) && !next.factStart) next.factStart = today;
  if (status === "done") next.factEnd = today;
  if (status !== "done" && next.factEnd) next.factEnd = "";
  return next;
};

export const updateTaskStatus = (task, status, today) => {
  if (!task || !["open", "in_progress", "done", "cancelled"].includes(status)) return task;
  const next = { ...task, status };
  if (status === "in_progress" && !next.startedAt) next.startedAt = today;
  if (status === "done") {
    if (!next.startedAt) next.startedAt = today;
    next.completedAt = today;
  } else if (next.completedAt) {
    next.completedAt = "";
  }
  return next;
};

export const updateSupplyStatus = (request, status, today) => {
  if (!request || !["needed", "ordered", "delivered", "cancelled"].includes(status)) return request;
  const next = { ...request, status };
  if (status === "ordered" && !next.orderedAt) next.orderedAt = today;
  if (status === "delivered") {
    if (!next.orderedAt) next.orderedAt = today;
    next.deliveredAt = today;
  } else if (next.deliveredAt) {
    next.deliveredAt = "";
  }
  return next;
};

const reportId = ({ objectId, date, createdById }) => (
  `daily:${String(objectId || "unknown")}:${String(date || "unknown")}:${String(createdById || "unknown")}`
);

export const upsertDailyReport = (reports = [], draft = {}, now = Date.now()) => {
  const id = draft.id || reportId(draft);
  const existing = reports.find((report) => report?.id === id);
  const next = {
    ...existing,
    ...draft,
    id,
    createdAt: existing?.createdAt || draft.createdAt || now,
    updatedAt: now,
  };
  return existing
    ? reports.map((report) => report?.id === id ? next : report)
    : [...reports, next];
};
