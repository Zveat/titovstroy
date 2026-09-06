// Переиспользуемые поля ввода: выпадающий список с поиском и числовое поле,
// применяющее значение по blur/Enter. Перенос из App.jsx.
import { useState } from "react";

// Переиспользуемый выпадающий список с поиском (вместо некрасивых native <select>)
export function SearchSelect({ value, options, onChange, placeholder = "🔍 Поиск…", style }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const sel = options.find(o => o.value === value);
  const s = q.trim().toLowerCase();
  const filtered = s ? options.filter(o => (o.label || "").toLowerCase().includes(s) || (o.sub || "").toLowerCase().includes(s)) : options;
  return (
    <div style={{ position: "relative", ...(style || {}) }}>
      <input value={open ? q : (sel ? sel.label : "")} placeholder={placeholder}
        onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => { setQ(""); setOpen(true); }}
        style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, color: "#0f172a", fontSize: 13, padding: "8px 10px", fontFamily: "inherit", width: "100%", boxSizing: "border-box" }} />
      {open && (<>
        <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 41, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, marginTop: 4, maxHeight: 300, overflowY: "auto", boxShadow: "0 14px 40px rgba(15,23,42,.18)" }}>
          {filtered.length === 0 && <div style={{ padding: "10px 12px", fontSize: 12, color: "#94a3b8" }}>Ничего не найдено</div>}
          {filtered.slice(0, 120).map(o => (
            <div key={o.value} onClick={() => { onChange(o.value); setOpen(false); setQ(""); }}
              style={{ padding: "9px 12px", cursor: "pointer", fontSize: 13, color: "#0f172a", borderBottom: "1px solid #f1f5f9", display: "flex", flexDirection: "column", gap: 1, background: o.value === value ? "#eff6ff" : "#fff" }}
              onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"} onMouseLeave={e => e.currentTarget.style.background = o.value === value ? "#eff6ff" : "#fff"}>
              <span style={{ fontWeight: 600 }}>{o.label}</span>
              {o.sub && <span style={{ fontSize: 11, color: "#94a3b8" }}>{o.sub}</span>}
            </div>
          ))}
        </div>
      </>)}
    </div>
  );
}

// Числовое поле с ЛОКАЛЬНЫМ вводом: пока печатаешь — меняется только само поле,
// в стейт (и пересчёт всей сметы) значение уходит на blur/Enter. Убирает тормоза при вводе цен/объёмов.
// Число, которое применяется ТОЛЬКО по завершении ввода (blur или Enter), а не на каждой
// нажатой клавише. Это принципиально там, где введённое значение пересчитывается перед
// сохранением: посимвольный пересчёт ломал бы набор прямо под пальцами.
// autoFocus/onBlur/onKeyDown — необязательные, добавлены для инлайн-редактора цены в смете;
// без них поведение ровно прежнее.
export function NumInput({ value, onCommit, style, min = "0", placeholder, className, disabled, autoFocus, onBlur, onKeyDown }) {
  const [local, setLocal] = useState(null);
  const shown = local !== null ? local : ((value === undefined || value === null) ? "" : String(value));
  const commit = () => { if (local === null) return; onCommit(local); setLocal(null); };
  return <input type="number" min={min} placeholder={placeholder} className={className} disabled={disabled} value={shown}
    autoFocus={autoFocus}
    onChange={e => setLocal(e.target.value)}
    onBlur={e => { commit(); onBlur?.(e); }}
    onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); onKeyDown?.(e); }}
    style={style} />;
}
