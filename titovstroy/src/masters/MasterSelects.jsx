import { useEffect, useMemo, useRef, useState } from "react";

const fieldStyle = {
  height: 36,
  width: "100%",
  borderRadius: 9,
  border: "1px solid #e2e8f0",
  background: "#fff",
  color: "#0f172a",
  fontFamily: "inherit",
  fontSize: 13,
};

function useOutsideClose(ref, close) {
  useEffect(() => {
    const onDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) close();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [close, ref]);
}

function filteredOptions(options, query) {
  const needle = query.trim().toLocaleLowerCase("ru");
  if (!needle) return options;
  return options.filter((option) => `${option.name} ${option.id}`.toLocaleLowerCase("ru").includes(needle));
}

export function SearchSelect({ value, onChange, options = [], emptyLabel = "Все", width = 220, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);
  useOutsideClose(rootRef, () => setOpen(false));
  const shown = useMemo(() => filteredOptions(options, query), [options, query]);
  const selected = options.find((option) => String(option.id) === String(value));

  const choose = (next) => {
    onChange(next);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={rootRef} style={{ position: "relative", width, minWidth: 170 }}>
      <button type="button" aria-label={ariaLabel || emptyLabel} aria-expanded={open} onClick={() => setOpen((current) => !current)}
        style={{ ...fieldStyle, padding: "0 10px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, cursor: "pointer" }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selected?.name || emptyLabel}</span>
        <span style={{ color: "#94a3b8", fontSize: 11 }}>▾</span>
      </button>
      {open && (
        <div style={{ position: "absolute", zIndex: 90, top: 40, left: 0, width: "100%", minWidth: 240, padding: 7, border: "1px solid #e2e8f0", borderRadius: 10, background: "#fff", boxShadow: "0 12px 30px rgba(15,23,42,.16)" }}>
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск…"
            style={{ ...fieldStyle, height: 34, padding: "0 10px", marginBottom: 6 }} />
          <div style={{ maxHeight: 250, overflowY: "auto" }}>
            <button type="button" onClick={() => choose("")}
              style={{ width: "100%", border: "none", borderRadius: 7, padding: "8px 9px", textAlign: "left", cursor: "pointer", background: value ? "transparent" : "#eff6ff", color: value ? "#475569" : "#2563eb", fontFamily: "inherit", fontWeight: 700 }}>
              {emptyLabel}
            </button>
            {shown.map((option) => {
              const active = String(option.id) === String(value);
              return (
                <button key={option.id} type="button" onClick={() => choose(String(option.id))}
                  style={{ width: "100%", border: "none", borderRadius: 7, padding: "8px 9px", textAlign: "left", cursor: "pointer", background: active ? "#eff6ff" : "transparent", color: active ? "#2563eb" : "#475569", fontFamily: "inherit", fontWeight: active ? 700 : 500 }}>
                  {option.name}
                </button>
              );
            })}
            {!shown.length && <div style={{ padding: 10, color: "#94a3b8", fontSize: 12 }}>Ничего не найдено</div>}
          </div>
        </div>
      )}
    </div>
  );
}

export function SearchMultiSelect({ values = [], onChange, options = [], label = "Выберите", width = 300, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);
  useOutsideClose(rootRef, () => setOpen(false));
  const selected = new Set(values.map(String));
  const shown = useMemo(() => filteredOptions(options, query), [options, query]);
  const summary = values.length === options.length && options.length
    ? `Все (${options.length})`
    : values.length ? `Выбрано: ${values.length}` : label;

  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(String(id))) next.delete(String(id)); else next.add(String(id));
    onChange([...next]);
  };

  return (
    <div ref={rootRef} style={{ position: "relative", width, minWidth: 210 }}>
      <button type="button" aria-label={ariaLabel || label} aria-expanded={open} onClick={() => setOpen((current) => !current)}
        style={{ ...fieldStyle, padding: "0 10px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, cursor: "pointer" }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{summary}</span>
        <span style={{ color: "#94a3b8", fontSize: 11 }}>▾</span>
      </button>
      {open && (
        <div style={{ position: "absolute", zIndex: 90, top: 40, left: 0, width: "100%", minWidth: 280, padding: 7, border: "1px solid #e2e8f0", borderRadius: 10, background: "#fff", boxShadow: "0 12px 30px rgba(15,23,42,.16)" }}>
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск…"
            style={{ ...fieldStyle, height: 34, padding: "0 10px", marginBottom: 6 }} />
          <div style={{ display: "flex", gap: 6, padding: "2px 2px 7px" }}>
            <button type="button" onClick={() => onChange(options.map((option) => String(option.id)))} style={{ border: "none", background: "#eff6ff", color: "#2563eb", borderRadius: 7, padding: "5px 8px", cursor: "pointer", fontFamily: "inherit", fontSize: 11.5, fontWeight: 700 }}>Выбрать все</button>
            <button type="button" onClick={() => onChange([])} style={{ border: "none", background: "#f8fafc", color: "#64748b", borderRadius: 7, padding: "5px 8px", cursor: "pointer", fontFamily: "inherit", fontSize: 11.5, fontWeight: 700 }}>Снять все</button>
          </div>
          <div style={{ maxHeight: 280, overflowY: "auto" }}>
            {shown.map((option) => {
              const active = selected.has(String(option.id));
              return (
                <button key={option.id} type="button" onClick={() => toggle(option.id)}
                  style={{ width: "100%", border: "none", borderRadius: 7, padding: "8px 9px", display: "flex", alignItems: "center", gap: 8, textAlign: "left", cursor: "pointer", background: active ? "#eff6ff" : "transparent", color: active ? "#2563eb" : "#475569", fontFamily: "inherit", fontWeight: active ? 700 : 500 }}>
                  <span aria-hidden="true" style={{ width: 16, color: active ? "#2563eb" : "#cbd5e1" }}>{active ? "✓" : "○"}</span>
                  <span>{option.name}</span>
                </button>
              );
            })}
            {!shown.length && <div style={{ padding: 10, color: "#94a3b8", fontSize: 12 }}>Ничего не найдено</div>}
          </div>
        </div>
      )}
    </div>
  );
}
