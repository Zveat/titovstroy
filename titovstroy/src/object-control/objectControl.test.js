import { describe, expect, it } from "vitest";
import {
  buildObjectHealth,
  buildTodayStageGroups,
  updateStageStatus,
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
      defects: [
        { id: "open", status: "open" },
        { id: "closed", status: "done" },
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
});
