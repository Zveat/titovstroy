import { useMemo } from "react";
import { buildObjectDispatcher } from "./objectControl.js";

const todayKey = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const objectTitle = (object = {}) => object.clientName || object.name || object.address || "Объект";

const objectSubtitle = (object = {}) => {
  const details = [object.address, object.manager].filter(Boolean);
  return details.join(" · ") || "Откройте карточку для подробностей";
};

const metric = (label, value, tone = "neutral") => {
  const tones = {
    neutral: { color: "#334155", background: "#f8fafc", border: "#e2e8f0" },
    danger: { color: "#b91c1c", background: "#fff7f7", border: "#fecaca" },
    warning: { color: "#a16207", background: "#fffdf2", border: "#fde68a" },
  };
  const palette = tones[tone] || tones.neutral;
  return (
    <div style={{ minWidth: 0, padding: "10px 12px", background: palette.background, border: `1px solid ${palette.border}`, borderRadius: 8 }}>
      <div style={{ fontSize: 10.5, color: "#64748b", fontWeight: 700, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 20, lineHeight: 1.1, color: palette.color, fontWeight: 850 }}>{value}</div>
    </div>
  );
};

export default function ObjectDispatcher({ objects = [], productions = [], onOpenObject }) {
  const rows = useMemo(
    () => buildObjectDispatcher(objects, productions, todayKey()),
    [objects, productions],
  );
  const riskyRows = rows.filter((row) => row.score > 0);
  const totals = riskyRows.reduce((result, row) => ({
    overdueStages: result.overdueStages + row.health.overdueStages,
    overdueTasks: result.overdueTasks + row.tasks.overdue,
    openDefects: result.openDefects + row.health.openDefects,
  }), { overdueStages: 0, overdueTasks: 0, openDefects: 0 });

  return (
    <section style={{ margin: "14px 0 4px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 16px", borderBottom: "1px solid #e2e8f0", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 15, color: "#0f172a", fontWeight: 850 }}>Диспетчерская объектов</div>
          <div style={{ marginTop: 2, fontSize: 11.5, color: "#64748b" }}>Задачи, задержки, замечания и снабжение в одном месте</div>
        </div>
        <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>{objects.length} объектов в текущем списке</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8, padding: "12px 16px" }}>
        {metric("Требуют внимания", riskyRows.length, riskyRows.length ? "danger" : "neutral")}
        {metric("Просрочено задач", totals.overdueTasks, totals.overdueTasks ? "danger" : "neutral")}
        {metric("Просрочено этапов", totals.overdueStages, totals.overdueStages ? "danger" : "neutral")}
        {metric("Открыто замечаний", totals.openDefects, totals.openDefects ? "warning" : "neutral")}
      </div>

      {riskyRows.length === 0 ? (
        <div style={{ padding: "14px 16px 18px", color: "#047857", fontSize: 12.5, fontWeight: 750 }}>
          По выбранным объектам срочных отклонений нет.
        </div>
      ) : (
        <div style={{ borderTop: "1px solid #eef2f7" }}>
          {riskyRows.slice(0, 8).map((row) => (
            <button
              key={row.object.id}
              type="button"
              onClick={() => onOpenObject?.(row.object)}
              style={{ width: "100%", border: 0, borderBottom: "1px solid #eef2f7", background: "#fff", padding: "12px 16px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, textAlign: "left", fontFamily: "inherit", cursor: "pointer" }}
            >
              <span style={{ minWidth: 0, flex: "1 1 180px" }}>
                <span style={{ display: "block", color: "#0f172a", fontSize: 12.5, fontWeight: 850, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{objectTitle(row.object)}</span>
                <span style={{ display: "block", marginTop: 2, color: "#94a3b8", fontSize: 10.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{objectSubtitle(row.object)}</span>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", flex: "2 1 220px" }}>
                {row.reasons.slice(0, 3).map((reason) => (
                  <span key={reason} style={{ padding: "4px 7px", borderRadius: 6, background: "#fff1f2", border: "1px solid #fecdd3", color: "#be123c", fontSize: 10.5, fontWeight: 750 }}>{reason}</span>
                ))}
              </span>
              <span style={{ minWidth: 0, flex: "1 1 130px" }}>
                <span style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 5, color: "#64748b", fontSize: 10.5, fontWeight: 700 }}>
                  <span>Работы</span><span>{row.health.progressPct}%</span>
                </span>
                <span style={{ display: "block", height: 5, borderRadius: 3, background: "#e2e8f0", overflow: "hidden" }}>
                  <span style={{ display: "block", width: `${row.health.progressPct}%`, height: "100%", background: row.score ? "#f59e0b" : "#10b981" }} />
                </span>
              </span>
              <span aria-hidden="true" style={{ color: "#94a3b8", fontSize: 18, textAlign: "right", flex: "0 0 20px" }}>›</span>
            </button>
          ))}
          {riskyRows.length > 8 && (
            <div style={{ padding: "9px 16px", color: "#64748b", fontSize: 10.5, fontWeight: 700 }}>Ещё требуют внимания: {riskyRows.length - 8}</div>
          )}
        </div>
      )}
    </section>
  );
}
