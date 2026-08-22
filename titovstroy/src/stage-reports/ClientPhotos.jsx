// Фотоотчёт в кабинете клиента. Отдельный файл, потому что его же рендерит
// проверочный стенд: иначе вёрстку на телефоне пришлось бы проверять на копии
// разметки, а копия расходится с оригиналом.
//
// Показываем двумя способами сразу и намеренно: отдельным разделом «Фотоотчёт»,
// где работы с фото собраны вместе и их удобно листать, и значком прямо в ленте
// этапов — чтобы фото нашлось там, где клиент читает про конкретную работу.
// Отдельная вкладка на этой странице не нужна: она одна и прокручивается, а
// вкладка спрятала бы главное, ради чего клиент и заходит.
import React, { useEffect } from "react";
import { PHOTO_KINDS } from "./model.js";

export function orderClientPhotos(list = []) {
  const order = PHOTO_KINDS.map((item) => item.key);
  return (Array.isArray(list) ? list : [])
    .filter((item) => item && item.url)
    .slice()
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || (Number(a.ts) || 0) - (Number(b.ts) || 0));
}

export function stagesWithPhotos(stages = []) {
  return (Array.isArray(stages) ? stages : [])
    .map((stage) => ({ stage, list: orderClientPhotos(stage?.photos) }))
    .filter((item) => item.list.length > 0);
}

export function ClientPhotoReport({ groups = [], ui, expanded, onExpand, onOpen }) {
  if (!groups.length) return null;
  const { card, INK, BRASS, FAINT, BLUE } = ui;
  const total = groups.reduce((sum, group) => sum + group.list.length, 0);
  // Сначала три работы: при двадцати работах с фото страница иначе превращается
  // в бесконечную ленту, и оплата с документами уезжает вниз.
  const shown = expanded ? groups : groups.slice(0, 3);
  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 15 }}>📷</span>
        <span style={{ fontSize: 15.5, fontWeight: 800, color: INK, letterSpacing: "-.01em" }}>Фотоотчёт</span>
        <span style={{ fontSize: 11, color: FAINT, fontWeight: 700, background: "#f8fafc", borderRadius: 20, padding: "2px 9px", marginLeft: "auto", flexShrink: 0 }}>{total} фото</span>
      </div>
      <div style={{ fontSize: 12, color: FAINT, marginBottom: 14, lineHeight: 1.45 }}>
        Снимки по каждой работе, включая скрытые работы — то, что после отделки уже не увидеть.
      </div>
      {shown.map((group, index) => {
        const last = index === shown.length - 1;
        return (
          <div key={(group.stage.name || "") + index} style={{ marginBottom: last ? 0 : 16, paddingBottom: last ? 0 : 16, borderBottom: last ? "none" : "1px solid #f1f5f9" }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: INK, marginBottom: 2, overflowWrap: "anywhere" }}>{group.stage.name}</div>
            <div style={{ fontSize: 11, color: FAINT, marginBottom: 9 }}>{group.stage.cat}</div>
            {PHOTO_KINDS.map((phase) => {
              const items = group.list.filter((photo) => (photo.kind || "after") === phase.key);
              if (!items.length) return null;
              return (
                <div key={phase.key} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: BRASS, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>{phase.label}</div>
                  {/* Лента прокручивается вбок внутри карточки: на телефоне четыре
                      снимка в ряд не помещаются, а перенос строкой рвёт стадию пополам. */}
                  <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
                    {items.map((photo, i) => (
                      <button key={photo.id || i} onClick={() => onOpen?.({ list: group.list, i: group.list.indexOf(photo), title: group.stage.name })}
                        style={{ border: "1px solid #eef1f5", borderRadius: 12, padding: 0, background: "#f1f5f9", cursor: "pointer", flexShrink: 0, width: 104, height: 104, overflow: "hidden", lineHeight: 0 }}>
                        <img src={photo.thumbUrl || photo.url} alt={phase.label} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
      {groups.length > shown.length && (
        <button onClick={() => onExpand?.(true)} style={{ width: "100%", boxSizing: "border-box", marginTop: 14, background: "#f8fafc", border: "1px solid #eef1f5", borderRadius: 13, padding: "11px", fontSize: 13, fontWeight: 700, color: BLUE, cursor: "pointer", fontFamily: "inherit" }}>
          Показать все работы с фото ({groups.length})
        </button>
      )}
    </div>
  );
}

// Фото на весь экран. Листается кнопками — клиент смотрит историю одной работы
// подряд: до → в процессе → после, в том же порядке, что и в ленте.
export function PhotoLightbox({ value, onChange, onClose }) {
  const list = Array.isArray(value?.list) ? value.list : [];
  const index = Math.max(0, Math.min(list.length - 1, Number(value?.i) || 0));
  const open = !!value && !!list[index];
  const go = (step) => onChange?.({ ...value, i: Math.max(0, Math.min(list.length - 1, index + step)) });

  // Пока фото открыто, страница под ним не должна прокручиваться: на телефоне
  // палец иначе листает ленту за подложкой вместо снимка.
  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  // С компьютера ссылку тоже открывают: Esc закрывает, стрелки листают.
  useEffect(() => {
    if (!open || typeof window === "undefined") return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") onClose?.();
      else if (event.key === "ArrowLeft") go(-1);
      else if (event.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, index, list.length]);

  if (!open) return null;
  const current = list[index];
  const phase = PHOTO_KINDS.find((item) => item.key === (current.kind || "after"));
  const navBtn = (disabled) => ({
    flex: 1, background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.18)",
    color: disabled ? "#64748b" : "#fff", borderRadius: 12, padding: "12px", fontSize: 14,
    fontWeight: 700, cursor: disabled ? "default" : "pointer", fontFamily: "inherit",
  });

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(8,11,20,.94)", display: "flex", flexDirection: "column", padding: "max(14px,env(safe-area-inset-top)) 14px max(14px,env(safe-area-inset-bottom))", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, color: "#fff", flexShrink: 0 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.3, overflowWrap: "anywhere" }}>{value.title}</div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 3 }}>{phase ? phase.label : ""} · {index + 1} из {list.length}</div>
        </div>
        <button onClick={(event) => { event.stopPropagation(); onClose?.(); }} aria-label="Закрыть"
          style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.18)", color: "#fff", fontSize: 17, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0, lineHeight: 1 }}>✕</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", margin: "12px 0" }}>
        <img src={current.url} alt={phase ? phase.label : "Фото"} onClick={(event) => event.stopPropagation()}
          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 12, display: "block" }} />
      </div>
      {current.note ? <div style={{ color: "#e2e8f0", fontSize: 13, textAlign: "center", marginBottom: 10, lineHeight: 1.45 }}>{current.note}</div> : null}
      {list.length > 1 && (
        <div style={{ display: "flex", gap: 10, flexShrink: 0 }} onClick={(event) => event.stopPropagation()}>
          <button onClick={() => go(-1)} disabled={index === 0} style={navBtn(index === 0)}>← Назад</button>
          <button onClick={() => go(1)} disabled={index === list.length - 1} style={navBtn(index === list.length - 1)}>Вперёд →</button>
        </div>
      )}
    </div>
  );
}
