// Замечание считается закрытым по галочке done — именно так его пишет вкладка
// «Замечания» (`{id, text, done, ts, author}`). Поля status у замечаний нет ни у
// одного в боевой базе: пока читали его, устранённое замечание навсегда
// оставалось «открытым», и объект намертво висел в «Требуют внимания».
// Строковые статусы оставлены на случай, если форма записи когда-то изменится.
const DONE_DEFECT_STATUSES = new Set(["done", "closed", "resolved", "fixed"]);
export const isDefectClosed = (defect) => {
  if (!defect) return true;
  if (defect.done === true) return true;
  if (defect.status === undefined || defect.status === null) return false;
  return DONE_DEFECT_STATUSES.has(String(defect.status).toLowerCase());
};
const DONE_TASK_STATUSES = new Set(["done", "cancelled"]);

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
  const openDefects = defects.filter((defect) => !isDefectClosed(defect)).length;
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

const stageReason = (count) => count === 1 ? "Просрочен 1 этап" : `Просрочено ${count} этапов`;
const delayedStageReason = (count) => count === 1 ? "Задержан 1 этап" : `Задержано ${count} этапов`;
const defectReason = (count) => count === 1 ? "1 открытое замечание" : `${count} открытых замечания`;
const taskReason = (count) => count === 1 ? "Просрочена 1 задача" : `Просрочено ${count} задач`;
const highTaskReason = (count) => count === 1 ? "1 срочная задача" : `${count} срочных задач`;

export const buildObjectDispatcher = (objects = [], productions = [], today) => {
  const productionByObject = new Map(
    cleanItems(productions).map((production) => [String(production.objectId), production]),
  );
  return cleanItems(objects).map((object) => {
    const production = productionByObject.get(String(object.id)) || { objectId: object.id };
    const health = buildObjectHealth(production, today);
    const tasks = buildTaskSummary(production.tasks, today);
    const reasons = [];
    if (health.overdueStages) reasons.push(stageReason(health.overdueStages));
    if (health.delayedStages) reasons.push(delayedStageReason(health.delayedStages));
    if (health.openDefects) reasons.push(defectReason(health.openDefects));
    if (tasks.overdue) reasons.push(taskReason(tasks.overdue));
    if (tasks.high) reasons.push(highTaskReason(tasks.high));
    const score = (
      health.overdueStages * 5
      + health.delayedStages * 5
      + health.openDefects * 4
      + tasks.overdue * 4
      + tasks.high * 2
    );
    return {
      object,
      production,
      health,
      tasks,
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

// Во все три update-функции «сегодня» приходит ОДНОГО вида — строкой «ГГГГ-ММ-ДД».
// Раньше этапам передавали дату, а задачам и снабжению — Date.now(), и в одних и
// тех же по смыслу полях лежали то дата, то миллисекунды.
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

// ── РАССТАНОВКА СРОКОВ ЭТАПОВ ───────────────────────────────────────────────
// Сроки заданы у 10 этапов из 288 на боевой базе. Пока их нет, «просрочено»
// структурно равно нулю, «план на сегодня» показывает первые попавшиеся работы,
// а диспетчерская пуста. Проставлять 288 дат руками никто не будет.
//
// Раскладываем этапы подряд между двумя датами, длительность — пропорционально
// стоимости работы (дорогая работа дольше; это грубо, но ближе к правде, чем
// поровну). Работы без цены получают минимальную долю. Меньше дня не бывает.
// Порядок сохраняется, категории не перемешиваются — берём список как есть.
const _dayMs = 864e5;
const _toDay = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};
const _dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);

export function planStageSchedule(stages = [], { from, to, overwrite = false } = {}) {
  const list = Array.isArray(stages) ? stages : [];
  const start = _toDay(from);
  const end = _toDay(to);
  if (start == null || end == null || end < start) return list;
  // Кому вообще ставим: либо всем, либо только тем, у кого срок не задан.
  const targets = list.filter(stage => stage && stage.status !== "done"
    && (overwrite || (!stage.planStart && !stage.planEnd)));
  if (!targets.length) return list;

  const totalDays = Math.round((end - start) / _dayMs) + 1;
  const weightOf = (stage) => {
    const price = Number(stage?.priceClient);
    return Number.isFinite(price) && price > 0 ? price : 0;
  };
  const weights = targets.map(weightOf);
  const weightSum = weights.reduce((sum, value) => sum + value, 0);
  // Сначала каждому по дню, остаток раскидываем по весу. Так короткий проект с
  // длинным списком работ не превращается в «все по нулю дней».
  const spare = Math.max(0, totalDays - targets.length);
  const days = targets.map((stage, index) => {
    const share = weightSum > 0 ? weights[index] / weightSum : 1 / targets.length;
    return 1 + Math.floor(spare * share);
  });

  const planned = new Map();
  let cursor = start;
  targets.forEach((stage, index) => {
    const length = Math.max(1, days[index]);
    const finish = Math.min(end, cursor + (length - 1) * _dayMs);
    planned.set(stage.id, { planStart: _dayKey(cursor), planEnd: _dayKey(finish) });
    cursor = Math.min(end, finish + _dayMs);
  });
  // Округление вниз при делении остатка оставляло хвост незанятым, и последняя
  // работа заканчивалась раньше плановой сдачи. Дотягиваем её до конца срока.
  const last = targets[targets.length - 1];
  const lastDates = planned.get(last.id);
  if (lastDates && lastDates.planEnd < _dayKey(end)) planned.set(last.id, { ...lastDates, planEnd: _dayKey(end) });

  return list.map(stage => {
    const dates = stage && planned.get(stage.id);
    return dates ? { ...stage, ...dates } : stage;
  });
}

// Сколько этапов реально имеет сроки — для подсказки «сроки не заданы».
export const countStagesWithPlan = (stages = []) => (
  (Array.isArray(stages) ? stages : []).filter(stage => stage?.planStart || stage?.planEnd).length
);
