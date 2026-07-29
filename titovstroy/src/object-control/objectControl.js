const DONE_DEFECT_STATUSES = new Set(["done", "closed", "resolved"]);

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

export const updateStageStatus = (stage, status, today) => {
  if (!stage || !["todo", "progress", "done", "delayed"].includes(status)) return stage;
  const next = { ...stage, status };
  if (["progress", "done"].includes(status) && !next.factStart) next.factStart = today;
  if (status === "done") next.factEnd = today;
  if (status !== "done" && next.factEnd) next.factEnd = "";
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
