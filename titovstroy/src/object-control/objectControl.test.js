import { describe, expect, it } from "vitest";
import {
  buildObjectDispatcher,
  buildObjectHealth,
  buildTaskSummary,
  buildTodayStageGroups,
  planStageSchedule,
  updateStageStatus,
  updateTaskStatus,
  upsertDailyReport,
} from "./objectControl";

const TODAY = "2026-07-29";

describe("object control helpers", () => {
  it("collects active, delayed, overdue and due-today stages without duplicates", () => {
    const stages = [
      { id: "active", status: "progress", name: "Стяжка" },
      { id: "problem", status: "delayed", name: "Плитка" },
      { id: "overdue", status: "todo", name: "Электрика", planEnd: "2026-07-28" },
      { id: "today", status: "todo", name: "Штукатурка", planStart: TODAY },
      { id: "later", status: "todo", name: "Двери", planStart: "2026-08-03" },
      { id: "done", status: "done", name: "Демонтаж" },
    ];

    const result = buildTodayStageGroups(stages, TODAY);

    expect(result.active.map((stage) => stage.id)).toEqual(["active", "problem"]);
    expect(result.overdue.map((stage) => stage.id)).toEqual(["overdue"]);
    expect(result.dueToday.map((stage) => stage.id)).toEqual(["today"]);
    expect(result.focus.map((stage) => stage.id)).toEqual([
      "active",
      "problem",
      "overdue",
      "today",
    ]);
  });

  it("offers the next three unfinished stages when there is no work for today", () => {
    const stages = [
      { id: "one", status: "todo", name: "1" },
      { id: "two", status: "todo", name: "2" },
      { id: "three", status: "todo", name: "3" },
      { id: "four", status: "todo", name: "4" },
    ];

    const result = buildTodayStageGroups(stages, TODAY);

    expect(result.focus.map((stage) => stage.id)).toEqual(["one", "two", "three"]);
    expect(result.isFallback).toBe(true);
  });

  it("calculates manager health from stages, launch checklist, defects and deadline", () => {
    const production = {
      planEndDate: "2026-07-28",
      stages: [
        { id: "done", status: "done" },
        { id: "active", status: "progress" },
        { id: "late", status: "todo", planEnd: "2026-07-27" },
        { id: "problem", status: "delayed" },
      ],
      checklistLaunch: [
        { id: "a", done: true },
        { id: "b", done: false },
      ],
      // Форма ровно как во вкладке «Замечания»: закрытие — галочкой done.
      defects: [
        { id: "open", done: false },
        { id: "closed", done: true },
      ],
    };

    expect(buildObjectHealth(production, TODAY)).toMatchObject({
      totalStages: 4,
      doneStages: 1,
      activeStages: 1,
      delayedStages: 1,
      overdueStages: 1,
      openDefects: 1,
      progressPct: 25,
      launchPct: 50,
      deadlineOverdue: true,
      tone: "danger",
    });
  });

  it("sets actual dates on explicit stage actions and preserves existing fields", () => {
    const original = { id: "stage", name: "Работа", responsible: "Иван" };
    const started = updateStageStatus(original, "progress", TODAY);
    const completed = updateStageStatus(started, "done", "2026-07-30");

    expect(started).toEqual({
      ...original,
      status: "progress",
      factStart: TODAY,
    });
    expect(completed).toEqual({
      ...original,
      status: "done",
      factStart: TODAY,
      factEnd: "2026-07-30",
    });
  });

  it("upserts one daily report per object, date and author without duplicates", () => {
    const first = upsertDailyReport([], {
      objectId: "object-1",
      date: TODAY,
      createdById: "foreman-1",
      createdByName: "Прораб",
      workers: 4,
      note: "Первый отчёт",
    }, 100);
    const second = upsertDailyReport(first, {
      objectId: "object-1",
      date: TODAY,
      createdById: "foreman-1",
      createdByName: "Прораб",
      workers: 5,
      note: "Исправленный отчёт",
    }, 200);

    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({
      id: "daily:object-1:2026-07-29:foreman-1",
      workers: 5,
      note: "Исправленный отчёт",
      createdAt: 100,
      updatedAt: 200,
    });
  });

  it("summarizes only actionable foreman tasks", () => {
    const result = buildTaskSummary([
      { id: "late", status: "open", priority: "high", dueDate: "2026-07-28" },
      { id: "today", status: "in_progress", dueDate: TODAY },
      { id: "done", status: "done", priority: "high", dueDate: "2026-07-20" },
      null,
    ], TODAY);

    expect(result).toEqual({
      total: 3,
      open: 2,
      inProgress: 1,
      dueToday: 1,
      overdue: 1,
      high: 1,
      done: 1,
    });
  });


  it("ranks risky objects first in the manager dispatcher", () => {
    const rows = buildObjectDispatcher([
      { id: "ok", clientName: "А" },
      { id: "risk", clientName: "Б" },
    ], [
      { objectId: "ok", stages: [{ id: "done", status: "done" }] },
      {
        objectId: "risk",
        stages: [{ id: "late", status: "todo", planEnd: "2026-07-28" }],
        defects: [{ id: "defect", done: false }],
        tasks: [{ id: "task", status: "open", priority: "high", dueDate: "2026-07-28" }],
      },
    ], TODAY);

    expect(rows.map((row) => row.object.id)).toEqual(["risk", "ok"]);
    expect(rows[0]).toMatchObject({ tone: "danger" });
    expect(rows[0].reasons).toEqual(expect.arrayContaining([
      "Просрочен 1 этап",
      "1 открытое замечание",
      "Просрочена 1 задача",
    ]));
  });

  it("explains delayed stages and high-priority tasks in the dispatcher", () => {
    const rows = buildObjectDispatcher([
      { id: "risk", clientName: "Объект" },
    ], [{
      objectId: "risk",
      stages: [{ id: "delayed", status: "delayed" }],
      tasks: [{ id: "urgent", status: "open", priority: "high" }],
    }], TODAY);

    expect(rows[0].score).toBeGreaterThan(0);
    expect(rows[0].reasons).toEqual([
      "Задержан 1 этап",
      "1 срочная задача",
    ]);
  });

  it("sets task timestamps only on explicit status actions", () => {
    const taskStarted = updateTaskStatus({ id: "task", status: "open" }, "in_progress", TODAY);
    const taskDone = updateTaskStatus(taskStarted, "done", "2026-07-30");

    expect(taskStarted).toMatchObject({ status: "in_progress", startedAt: TODAY });
    expect(taskDone).toMatchObject({ status: "done", startedAt: TODAY, completedAt: "2026-07-30" });
  });
});

describe("замечания считаются по галочке done, а не по несуществующему status", () => {
  const TODAY = "2026-07-28";

  it("устранённое замечание не остаётся открытым навсегда", () => {
    const health = buildObjectHealth({ defects: [
      { id: "a", done: true }, { id: "b", done: false }, { id: "c", done: true },
    ] }, TODAY);
    expect(health.openDefects).toBe(1);
  });

  it("замечание без единого признака закрытия считается открытым", () => {
    expect(buildObjectHealth({ defects: [{ id: "a" }] }, TODAY).openDefects).toBe(1);
  });

  it("строковый статус тоже понимается, если когда-нибудь появится", () => {
    const health = buildObjectHealth({ defects: [
      { id: "a", status: "resolved" }, { id: "b", status: "open" },
    ] }, TODAY);
    expect(health.openDefects).toBe(1);
  });
});

describe("расстановка сроков этапов", () => {
  const stages = [
    { id: "s1", name: "Демонтаж", priceClient: 100000 },
    { id: "s2", name: "Стяжка", priceClient: 300000 },
    { id: "s3", name: "Покраска", priceClient: 100000 },
  ];

  it("раскладывает работы подряд между началом и концом", () => {
    const out = planStageSchedule(stages, { from: "2026-08-01", to: "2026-08-10" });
    expect(out[0].planStart).toBe("2026-08-01");
    expect(out[2].planEnd).toBe("2026-08-10");
    expect(out[0].planEnd <= out[1].planStart).toBe(true);
    expect(out[1].planEnd <= out[2].planStart).toBe(true);
  });

  it("дорогая работа получает больше дней", () => {
    const out = planStageSchedule(stages, { from: "2026-08-01", to: "2026-08-20" });
    const days = (stage) => (new Date(stage.planEnd) - new Date(stage.planStart)) / 864e5;
    expect(days(out[1])).toBeGreaterThan(days(out[0]));
  });

  it("уже проставленные сроки не трогает", () => {
    const withPlan = [{ ...stages[0], planStart: "2026-09-01", planEnd: "2026-09-05" }, stages[1]];
    const out = planStageSchedule(withPlan, { from: "2026-08-01", to: "2026-08-10" });
    expect(out[0].planStart).toBe("2026-09-01");
    expect(out[1].planStart).toBe("2026-08-01");
  });

  it("готовым работам сроки не ставит", () => {
    const done = [{ id: "d", status: "done" }, stages[0]];
    const out = planStageSchedule(done, { from: "2026-08-01", to: "2026-08-10" });
    expect(out[0].planStart).toBeUndefined();
    expect(out[1].planStart).toBe("2026-08-01");
  });

  it("кривые даты не ломают список", () => {
    expect(planStageSchedule(stages, { from: "", to: "2026-08-10" })).toEqual(stages);
    expect(planStageSchedule(stages, { from: "2026-08-10", to: "2026-08-01" })).toEqual(stages);
  });

  it("работ больше, чем дней — каждой достаётся минимум день", () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ id: `x${i}` }));
    const out = planStageSchedule(many, { from: "2026-08-01", to: "2026-08-02" });
    expect(out.every((stage) => stage.planStart && stage.planEnd)).toBe(true);
  });
});
