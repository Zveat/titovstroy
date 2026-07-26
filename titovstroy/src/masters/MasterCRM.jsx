import { useMemo, useState } from "react";
import { addMasterInteraction, contactFromParsedMaster, interactionsForContact, masterSourceKey, normalizeMasterCrm, removeMasterContact, upsertMasterContact } from "./masterCrm.js";

const inputStyle = { width:"100%", height:38, border:"1px solid #dbe3ee", borderRadius:8, padding:"0 11px", fontSize:13, color:"#0f172a", background:"#fff", fontFamily:"inherit", boxSizing:"border-box" };
const labelStyle = { display:"block", fontSize:11.5, fontWeight:700, color:"#64748b" };
const buttonStyle = { height:36, borderRadius:8, padding:"0 13px", border:"1px solid #dbe3ee", background:"#fff", color:"#334155", fontSize:12.5, fontWeight:750, cursor:"pointer", fontFamily:"inherit" };

const STATUS = {
  new: { label:"Не связывались", color:"#64748b", bg:"#f1f5f9" },
  contacted: { label:"Связались", color:"#2563eb", bg:"#eff6ff" },
  candidate: { label:"Подходит", color:"#059669", bg:"#ecfdf5" },
  unavailable: { label:"Недоступен", color:"#b45309", bg:"#fffbeb" },
  blocked: { label:"Не работать", color:"#dc2626", bg:"#fef2f2" },
};
const KIND = { master:"Мастер", contractor:"Подрядчик", shop:"Магазин" };

function StatusBadge({ value }) {
  const status = STATUS[value] || STATUS.new;
  return <span style={{ color:status.color, background:status.bg, borderRadius:6, padding:"3px 7px", fontSize:10.5, fontWeight:800 }}>{status.label}</span>;
}

export function MasterCrmButton({ crmData, source, master, onOpen }) {
  const crm = normalizeMasterCrm(crmData);
  const key = masterSourceKey(source, master);
  const contact = crm.contacts.find(item => item.sourceKey === key);
  const count = contact ? crm.interactions.filter(item => item.contactId === contact.id).length : 0;
  return (
    <button type="button" onClick={() => onOpen({ source, master })} style={{ ...buttonStyle, height:31, color:contact ? "#2563eb" : "#475569", background:contact ? "#eff6ff" : "#fff" }}>
      📝 {contact ? `История${count ? ` · ${count}` : ""}` : "Добавить заметку"}
    </button>
  );
}

export function MasterCrmEditor({ crmData, target, currentUser, onSave, onClose, canDelete = false }) {
  const crm = normalizeMasterCrm(crmData);
  const parsed = target?.master || null;
  const source = target?.source || "manual";
  const sourceKey = parsed ? masterSourceKey(source, parsed) : String(target?.contact?.sourceKey || "");
  const existing = target?.contact || crm.contacts.find(item => sourceKey && item.sourceKey === sourceKey);
  const initial = existing || (parsed ? contactFromParsedMaster(source, parsed) : { id:`mc_manual_${Date.now()}`, source:"manual", kind:"master", name:"", phone:"", city:"", specialties:[], status:"new", tags:[], note:"" });
  const [draft, setDraft] = useState(initial);
  const [interaction, setInteraction] = useState("");
  const [interactionType, setInteractionType] = useState("note");
  const [busy, setBusy] = useState(false);
  const history = interactionsForContact(crm, initial.id);
  const patch = (key, value) => setDraft(current => ({ ...current, [key]:value }));

  const persist = async (withInteraction = false) => {
    if (!String(draft.name || "").trim() || busy) return;
    setBusy(true);
    let next = upsertMasterContact(crm, { ...draft, name:String(draft.name).trim() });
    if (withInteraction && interaction.trim()) {
      next = addMasterInteraction(next, next.contacts.find(item => item.id === draft.id || (draft.sourceKey && item.sourceKey === draft.sourceKey))?.id || draft.id, {
        type:interactionType,
        note:interaction,
        author:currentUser?.name || "",
        authorId:currentUser?.id || "",
      });
    }
    const ok = await onSave(next);
    setBusy(false);
    if (ok !== false) { setInteraction(""); if (!withInteraction) onClose(); }
  };

  const remove = async () => {
    if (!canDelete || !existing || !window.confirm(`Удалить «${existing.name}» и всю историю контактов?`)) return;
    setBusy(true);
    const ok = await onSave(removeMasterContact(crm, existing.id));
    setBusy(false);
    if (ok !== false) onClose();
  };

  return (
    <div role="dialog" aria-modal="true" style={{ position:"fixed", inset:0, zIndex:400, background:"rgba(15,23,42,.45)", display:"flex", justifyContent:"flex-end" }} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width:"min(560px,100vw)", height:"100%", background:"#f8fafc", boxShadow:"-18px 0 50px rgba(15,23,42,.22)", overflowY:"auto" }}>
        <div style={{ position:"sticky", top:0, zIndex:2, background:"#fff", borderBottom:"1px solid #e2e8f0", padding:"17px 20px", display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ minWidth:0, flex:1 }}><div style={{ fontSize:18, fontWeight:900, color:"#0f172a" }}>Карточка контакта</div><div style={{ fontSize:11.5, color:"#94a3b8", marginTop:2 }}>{source === "manual" ? "Собственная база" : `Источник: ${source.toUpperCase()}`}</div></div>
          <button type="button" onClick={onClose} aria-label="Закрыть" style={{ ...buttonStyle, width:36, padding:0, fontSize:18 }}>×</button>
        </div>

        <div style={{ padding:20, display:"grid", gap:14 }}>
          <section style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:10, padding:16 }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <label style={{ ...labelStyle, gridColumn:"1 / -1" }}>Имя / компания<input value={draft.name || ""} onChange={e => patch("name", e.target.value)} style={{ ...inputStyle, marginTop:5 }} /></label>
              <label style={labelStyle}>Тип<select value={draft.kind || "master"} onChange={e => patch("kind", e.target.value)} style={{ ...inputStyle, marginTop:5 }}><option value="master">Мастер</option><option value="contractor">Подрядчик</option><option value="shop">Магазин</option></select></label>
              <label style={labelStyle}>Статус<select value={draft.status || "new"} onChange={e => patch("status", e.target.value)} style={{ ...inputStyle, marginTop:5 }}>{Object.entries(STATUS).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select></label>
              <label style={labelStyle}>Телефон<input value={draft.phone || ""} onChange={e => patch("phone", e.target.value)} style={{ ...inputStyle, marginTop:5 }} /></label>
              <label style={labelStyle}>Город<input value={draft.city || ""} onChange={e => patch("city", e.target.value)} style={{ ...inputStyle, marginTop:5 }} /></label>
              <label style={{ ...labelStyle, gridColumn:"1 / -1" }}>Специализации<input value={(draft.specialties || []).join(", ")} onChange={e => patch("specialties", e.target.value.split(",").map(x => x.trim()).filter(Boolean))} placeholder="Электрика, сантехника…" style={{ ...inputStyle, marginTop:5 }} /></label>
              <label style={{ ...labelStyle, gridColumn:"1 / -1" }}>Краткая пометка<textarea value={draft.note || ""} onChange={e => patch("note", e.target.value)} placeholder="Что важно видеть сразу" style={{ ...inputStyle, height:76, padding:"9px 11px", resize:"vertical", marginTop:5 }} /></label>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", gap:8, marginTop:14 }}>
              <div>{canDelete && existing && <button type="button" disabled={busy} onClick={remove} style={{ ...buttonStyle, color:"#dc2626", borderColor:"#fecaca" }}>Удалить</button>}</div>
              <button type="button" disabled={busy || !String(draft.name || "").trim()} onClick={() => persist(false)} style={{ ...buttonStyle, background:"#2563eb", color:"#fff", borderColor:"#2563eb" }}>{busy ? "Сохраняю…" : "Сохранить карточку"}</button>
            </div>
          </section>

          <section style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:10, padding:16 }}>
            <div style={{ fontSize:14, fontWeight:850, color:"#0f172a", marginBottom:10 }}>Новое взаимодействие</div>
            <div style={{ display:"grid", gridTemplateColumns:"150px 1fr", gap:8 }}>
              <select value={interactionType} onChange={e => setInteractionType(e.target.value)} style={inputStyle}><option value="note">Заметка</option><option value="call">Звонок</option><option value="whatsapp">WhatsApp</option><option value="meeting">Встреча</option></select>
              <input value={interaction} onChange={e => setInteraction(e.target.value)} placeholder="Например: уехал до мая, повторно не звонить" style={inputStyle} />
            </div>
            <div style={{ textAlign:"right", marginTop:9 }}><button type="button" disabled={busy || !interaction.trim()} onClick={() => persist(true)} style={{ ...buttonStyle, background:"#0f172a", color:"#fff", borderColor:"#0f172a" }}>Добавить в историю</button></div>
          </section>

          <section style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:10, padding:16 }}>
            <div style={{ fontSize:14, fontWeight:850, color:"#0f172a", marginBottom:10 }}>История · {history.length}</div>
            {!history.length && <div style={{ color:"#94a3b8", fontSize:12.5, padding:"10px 0" }}>Взаимодействий пока нет.</div>}
            {history.map(item => <div key={item.id} style={{ padding:"10px 0", borderTop:"1px solid #f1f5f9" }}><div style={{ fontSize:12.5, color:"#0f172a", lineHeight:1.45 }}>{item.note}</div><div style={{ fontSize:10.5, color:"#94a3b8", marginTop:4 }}>{new Date(item.createdAt).toLocaleString("ru-RU")} · {item.author || "без автора"}</div></div>)}
          </section>
        </div>
      </div>
    </div>
  );
}

export function MasterCrmDatabase({ crmData, onSave, onOpen, canDelete = false }) {
  const crm = normalizeMasterCrm(crmData);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return crm.contacts.filter(contact => (!kind || contact.kind === kind) && (!q || `${contact.name} ${contact.phone} ${contact.city} ${(contact.specialties || []).join(" ")} ${contact.note || ""}`.toLowerCase().includes(q)))
      .sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0));
  }, [crm.contacts, query, kind]);

  return (
    <div>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:14 }}>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Поиск по своей базе…" style={{ ...inputStyle, maxWidth:360 }} />
        <select value={kind} onChange={e => setKind(e.target.value)} style={{ ...inputStyle, width:180 }}><option value="">Все типы</option><option value="master">Мастера</option><option value="contractor">Подрядчики</option><option value="shop">Магазины</option></select>
        <button type="button" onClick={() => onOpen({ source:"manual" })} style={{ ...buttonStyle, marginLeft:"auto", background:"#2563eb", color:"#fff", borderColor:"#2563eb" }}>+ Добавить контакт</button>
      </div>
      {!filtered.length ? <div style={{ border:"1px dashed #cbd5e1", borderRadius:10, background:"#fff", padding:"48px 20px", textAlign:"center", color:"#64748b" }}><div style={{ fontSize:28, marginBottom:8 }}>📇</div><b>{crm.contacts.length ? "Ничего не найдено" : "Собственная база пока пуста"}</b><div style={{ fontSize:12, marginTop:5 }}>Добавляйте мастеров, подрядчиков и магазины вручную или из карточек OLX/Naimi.</div></div> :
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(310px,1fr))", gap:10 }}>
          {filtered.map(contact => {
            const historyCount = crm.interactions.filter(item => item.contactId === contact.id).length;
            return <button key={contact.id} type="button" onClick={() => onOpen({ source:contact.source || "manual", contact })} style={{ textAlign:"left", background:"#fff", border:"1px solid #e2e8f0", borderRadius:10, padding:14, cursor:"pointer", fontFamily:"inherit" }}>
              <div style={{ display:"flex", gap:8, alignItems:"flex-start" }}><div style={{ flex:1, minWidth:0 }}><div style={{ fontSize:14, fontWeight:850, color:"#0f172a" }}>{contact.name || "Без имени"}</div><div style={{ fontSize:11, color:"#94a3b8", marginTop:2 }}>{KIND[contact.kind] || "Контакт"}{contact.city ? ` · ${contact.city}` : ""}{contact.source && contact.source !== "manual" ? ` · ${contact.source.toUpperCase()}` : ""}</div></div><StatusBadge value={contact.status} /></div>
              {contact.note && <div style={{ marginTop:9, padding:"7px 9px", borderRadius:7, background:"#f8fafc", color:"#475569", fontSize:11.5, lineHeight:1.4 }}>{contact.note}</div>}
              <div style={{ display:"flex", gap:9, marginTop:10, fontSize:11.5, color:"#64748b" }}><span>{contact.phone || "без телефона"}</span><span>История: {historyCount}</span></div>
            </button>;
          })}
        </div>}
    </div>
  );
}

