import { useMemo, useState } from "react";
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

export default function ObjectDispatcher({ objects = [], productions = [], onOpenObject, open, onToggle }) {
  // Раскрытие обычно хранит родитель (чтобы помнить выбор между заходами), но
  // блок обязан работать и сам по себе: без своего состояния он однажды уже
  // отрисовался с onToggle=undefined и просто не открывался по клику.
  const [ownOpen, setOwnOpen] = useState(false);
  const isOpen = onToggle ? Boolean(open) : ownOpen;
  const toggle = () => (onToggle ? onToggle(!open) : setOwnOpen(value => !value));
  const rows = useMemo(
    () => buildObjectDispatcher(objects, productions, todayKey()),
    [objects, productions],
  );
  const riskyRows = rows.filter((row) => row.score > 0);
  // Пусто — блока нет вовсе. Раньше он занимал место с нулями во всех плитках и
  // только отодвигал сами объекты.
  if (!riskyRows.length) return null;
  const totals = riskyRows.reduce((result, row) => ({
    stages: result.stages + row.health.overdueStages + row.health.delayedStages,
    tasks: result.tasks + row.tasks.overdue,
    defects: result.defects + row.health.openDefects,
  }), { stages: 0, tasks: 0, defects: 0 });
  // Плитки убраны намеренно: при десятке объектов они дословно повторяли строки
  // под собой («Требуют внимания: 2» над двумя строками). Цифры — в заголовке.
  const head = [
    totals.stages ? `этапов: ${totals.stages}` : "",
    totals.defects ? `замечаний: ${totals.defects}` : "",
    totals.tasks ? `задач: ${totals.tasks}` : "",
  ].filter(Boolean).join(" · ");

  return (
    <section style={{ margin: "2px 0 4px", background: "#fff", border: "1px solid #fecaca", borderRadius: 8, overflow: "hidden" }}>
      <button type="button" onClick={toggle}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
          background: "#fff7f7", border: 0, padding: "9px 12px", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: "#b91c1c" }}>🎛 Требуют внимания: {riskyRows.length}</span>
          {head && <span style={{ fontSize: 12, color: "#64748b" }}>{head}</span>}
        </span>
        <span style={{ fontSize: 10.5, color: "#94a3b8", whiteSpace: "nowrap" }}>{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen && riskyRows.map((row) => (
        <button key={row.object.id} type="button" onClick={() => onOpenObject?.(row.object)}
          style={{ width: "100%", display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 10, alignItems: "center",
            padding: "11px 12px", background: "#fff", border: 0, borderTop: "1px solid #f1f5f9", cursor: "pointer",
            fontFamily: "inherit", textAlign: "left" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", overflowWrap: "anywhere" }}>{objectTitle(row.object)}</div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2, overflowWrap: "anywhere" }}>{objectSubtitle(row.object)}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              {row.reasons.map((reason) => (
                <span key={reason} style={{ fontSize: 10.5, fontWeight: 800, color: "#b91c1c", background: "#fef2f2",
                  border: "1px solid #fecaca", borderRadius: 5, padding: "2px 7px" }}>{reason}</span>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, whiteSpace: "nowrap" }}>
            <span style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>работы {row.health.progressPct}%</span>
            <span style={{ color: "#cbd5e1", fontSize: 15 }}>›</span>
          </div>
        </button>
      ))}
    </section>
  );

}
