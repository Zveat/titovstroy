// Две кнопки в карточке этапа и панели под ними: «Фото» и «Расчёт с рабочими».
// Обе панели рассчитаны на телефон в первую очередь — прораб заполняет их
// стоя на объекте, а не за столом.
import { useEffect, useMemo, useState } from "react";
import {
  PHOTO_KINDS, PAY_MODES, MAX_PHOTOS_PER_KIND,
  REVIEW_APPROVED, REVIEW_REJECTED, REVIEW_PENDING,
  listPhotos, listPayments, countPhotosOfKind, countStagePhotos,
  paymentDeviation, isOverpaid, paymentRemainder, payModeMeta, isPartialPayment,
  paymentLines, paymentAmount, allocatedTotal, unallocated, allocateByPlan,
  listAllPayments, summarizePayments, canEditPayment,
  reportStatusMeta, canReviewPayment, validatePaymentReport,
} from "./model.js";
import { entryStatus, QUEUE_STATUS_LABELS, QUEUE_FAILED, QUEUE_UPLOADING } from "./queue.js";

export const STAGE_REPORTS_CSS = `
.sr-acts{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.sr-btn{display:inline-flex;align-items:center;gap:5px;border-radius:7px;padding:6px 10px;
  font-size:11.5px;font-weight:800;cursor:pointer;font-family:inherit;white-space:nowrap;background:#f8fafc;
  border:1px solid #e2e8f0;color:#475569}
.sr-btn[data-on="1"]{background:#eff6ff;border-color:#bfdbfe;color:#2563eb}
.sr-panel{margin-top:9px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;padding:11px}
.sr-kinds{display:flex;gap:6px;flex-wrap:wrap}
.sr-tiles{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}
.sr-tile{position:relative;width:82px;height:82px;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;background:#f1f5f9}
.sr-tile img{width:100%;height:100%;object-fit:cover;display:block}
.sr-add{border:1px dashed #cbd5e1;background:#fff;display:flex;flex-direction:column;gap:2px;
  align-items:center;justify-content:center;cursor:pointer;color:#475569;font-size:16px;text-align:center;padding:4px}
.sr-add span{font-size:10px;font-weight:800;line-height:1.1}
.sr-field{width:100%;box-sizing:border-box;border:1px solid #dbe3ee;border-radius:8px;padding:9px 10px;
  font-family:inherit;font-size:13px;color:#0f172a;background:#fff;outline:none}
.sr-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.sr-wide{grid-column:1/-1}
.sr-lab{display:grid;gap:4px;font-size:11px;font-weight:700;color:#64748b;min-width:0}
.sr-rep{border:1px solid #e2e8f0;border-radius:9px;background:#fff;padding:10px 11px;margin-top:8px}
.sr-sums{display:flex;gap:14px;flex-wrap:wrap;align-items:baseline;margin-top:5px}
@media(max-width:700px){
  .sr-form{grid-template-columns:minmax(0,1fr)}
  .sr-note{flex:1 1 100%!important;order:3}
  .sr-acts>button{flex:1 1 auto}
  .sr-tile{width:76px;height:76px}
}`;

const money = (value) => Math.round(Number(value) || 0).toLocaleString("ru-RU");
// «2026-08-20» на карточке читается как служебный мусор, особенно когда таких
// строк несколько подряд.
const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const shortDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return `${date.getDate()} ${MONTHS[date.getMonth()]}${sameYear ? "" : " " + String(date.getFullYear()).slice(2)}`;
};
const chip = (color, background) => ({
  color, background, border: `1px solid ${color}26`, borderRadius: 7,
  padding: "2px 7px", fontSize: 10.5, fontWeight: 800, whiteSpace: "nowrap", display: "inline-block",
});
const primary = {
  border: 0, borderRadius: 8, padding: "10px 14px", background: "#0f172a", color: "#fff",
  fontFamily: "inherit", fontSize: 12.5, fontWeight: 800, cursor: "pointer",
};
const small = (color, background) => ({
  border: `1px solid ${color}33`, background, color, borderRadius: 7, padding: "6px 10px",
  fontSize: 11.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
});

// Плитка снимка, который ещё не ушёл в облако. Показываем сразу и из локального
// файла: иначе прораб на слабой связи не понимает, приняло приложение фото или
// нет, и снимает то же самое ещё раз.
function QueuedTile({ entry, activeId, onDrop }) {
  const status = entryStatus(entry, activeId);
  const failed = status === QUEUE_FAILED;
  const src = useMemo(() => {
    const blob = entry.thumbBlob || entry.fullBlob;
    if (!blob || typeof URL === "undefined") return "";
    try { return URL.createObjectURL(blob); } catch { return ""; }
  }, [entry.id]);
  return (
    <div className="sr-tile" style={{ borderColor: failed ? "#fecaca" : "#e2e8f0" }}>
      {src ? <img src={src} alt="" style={{ opacity: .5 }} /> : null}
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 2,
        background: failed ? "rgba(254,242,242,.72)" : "rgba(248,250,252,.72)" }}>
        <span style={{ fontSize: 14 }}>{failed ? "⚠" : status === QUEUE_UPLOADING ? "⏳" : "•••"}</span>
        <span style={{ fontSize: 9, fontWeight: 800, textAlign: "center", lineHeight: 1.1,
          color: failed ? "#b91c1c" : "#475569" }}>{QUEUE_STATUS_LABELS[status]}</span>
      </div>
      {failed && onDrop && (
        <button type="button" title="Убрать из очереди" onClick={() => onDrop(entry.id)}
          style={{ position: "absolute", top: -6, right: -6, width: 21, height: 21, borderRadius: "50%",
            border: "1px solid #fecaca", background: "#fff", color: "#dc2626", cursor: "pointer",
            fontSize: 11, lineHeight: 1, fontFamily: "inherit" }}>×</button>
      )}
    </div>
  );
}

function PhotoTile({ photo, api, onOpen }) {
  const review = photo.review || REVIEW_PENDING;
  const mark = review === REVIEW_APPROVED ? { t: "✓", c: "#047857", b: "#ecfdf5" }
    : review === REVIEW_REJECTED ? { t: "✕", c: "#b91c1c", b: "#fef2f2" }
      : { t: "?", c: "#b45309", b: "#fffbeb" };
  return (
    <div className="sr-tile">
      <img src={photo.thumbUrl || photo.url} alt={photo.kind} loading="lazy"
        onClick={() => onOpen?.(photo)} style={{ cursor: "pointer" }} />
      <span title={review === REVIEW_APPROVED ? "Подтверждено руководителем"
        : review === REVIEW_REJECTED ? "Отклонено руководителем" : "Ждёт проверки руководителем"}
        style={{ position: "absolute", left: 4, top: 4, ...chip(mark.c, mark.b), padding: "0 5px" }}>{mark.t}</span>
      {/* Пометка «клиенту» — на самом снимке: иначе непонятно, какие из десяти
          фото уйдут в кабинет, а какие остаются внутренними. */}
      {!api.readOnly && (
        <button type="button" title={photo.showClient ? "Показывается клиенту — скрыть" : "Скрыто от клиента — показать"}
          onClick={() => api.setPhotoClientVisible(photo.id, !photo.showClient)}
          style={{ position: "absolute", left: 4, bottom: 4, border: 0, cursor: "pointer", fontFamily: "inherit",
            ...chip(photo.showClient ? "#2563eb" : "#64748b", photo.showClient ? "#eff6ff" : "#f1f5f9"), padding: "1px 6px" }}>
          {photo.showClient ? "клиенту" : "внутр."}
        </button>
      )}
      {!api.readOnly && (
        <button type="button" title="Удалить фото"
          onClick={() => { if (confirm("Удалить фото? Восстановить будет нельзя.")) api.dropPhoto(photo.id); }}
          style={{ position: "absolute", top: -6, right: -6, width: 21, height: 21, borderRadius: "50%",
            border: "1px solid #fecaca", background: "#fff", color: "#dc2626", cursor: "pointer",
            fontSize: 11, lineHeight: 1, fontFamily: "inherit" }}>×</button>
      )}
    </div>
  );
}

function PhotoPanel({ stage, api, onOpen }) {
  const [kind, setKind] = useState("during");
  const [note, setNote] = useState("");
  const [showClient, setShowClient] = useState(true);
  const photos = listPhotos(api.list, stage.id).filter((item) => item.kind === kind);
  const queued = api.pending.filter((item) => String(item.stageId) === String(stage.id) && item.kind === kind && !item.receipt);
  const used = countPhotosOfKind(api.list, stage.id, kind) + queued.length;
  const left = MAX_PHOTOS_PER_KIND - used;
  const hint = PHOTO_KINDS.find((item) => item.key === kind)?.hint || "";
  const failed = api.pending.some((item) => entryStatus(item, api.activeId) === QUEUE_FAILED);

  const pick = (event) => {
    const files = [...(event.target.files || [])].slice(0, Math.max(0, left));
    event.target.value = "";
    if (files.length) api.addPhotos(stage.id, kind, files, { note, showClient });
    setNote("");
  };

  return (
    <div className="sr-panel">
      <div className="sr-kinds">
        {PHOTO_KINDS.map((item) => {
          const count = countPhotosOfKind(api.list, stage.id, item.key);
          const on = item.key === kind;
          return (
            <button key={item.key} type="button" className="sr-btn" data-on={on ? "1" : "0"} onClick={() => setKind(item.key)}>
              {item.label}{count > 0 ? ` · ${count}` : ""}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>{hint}</div>

      {failed && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 9,
          background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "7px 9px" }}>
          <span style={{ fontSize: 11.5, color: "#b91c1c", fontWeight: 700, flex: 1, minWidth: 0 }}>
            Фото сохранены на телефоне и уйдут сами, когда появится связь.
          </span>
          <button type="button" onClick={api.retry} disabled={api.busy} style={small("#b91c1c", "#fff")}>
            {api.busy ? "Отправляю…" : "Повторить"}
          </button>
        </div>
      )}

      <div className="sr-tiles">
        {photos.map((photo) => <PhotoTile key={photo.id} photo={photo} api={api} onOpen={onOpen} />)}
        {queued.map((entry) => <QueuedTile key={entry.id} entry={entry} activeId={api.activeId} onDrop={api.dropQueued} />)}
        {/* Две плитки, а не одна: capture="environment" открывает камеру сразу и
            галерею при этом не показывает вовсе — снять на месте удобно, но
            дослать вечером уже снятое было нельзя. Съёмка и галерея — разные
            входы, и оба нужны. */}
        {!api.readOnly && left > 0 && (
          <label className="sr-tile sr-add" title="Снять камерой">
            📷<span>Снять</span>
            <input type="file" accept="image/*" capture="environment" multiple
              style={{ display: "none" }} onChange={pick} />
          </label>
        )}
        {!api.readOnly && left > 0 && (
          <label className="sr-tile sr-add" title="Выбрать из галереи">
            🖼<span>Галерея</span>
            <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={pick} />
          </label>
        )}
      </div>

      {!api.readOnly && (
        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          <input className="sr-field" value={note} onChange={(event) => setNote(event.target.value)}
            placeholder="Комментарий к фото — необязательно" />
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#475569", cursor: "pointer" }}>
            <input type="checkbox" checked={showClient} onChange={(event) => setShowClient(event.target.checked)} />
            Показывать клиенту
          </label>
          <div style={{ fontSize: 11, color: left <= 3 ? "#b45309" : "#94a3b8" }}>
            {left > 0 ? `Можно добавить ещё ${left} на этот тип` : `Достигнут предел ${MAX_PHOTOS_PER_KIND} фото на тип`}
          </div>
        </div>
      )}

      {api.canReview && photos.some((photo) => photo.review === REVIEW_PENDING) && (
        <div style={{ marginTop: 10, borderTop: "1px solid #e2e8f0", paddingTop: 9 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#0f172a", marginBottom: 7 }}>Ждут вашего решения</div>
          <div style={{ display: "grid", gap: 7 }}>
            {photos.filter((photo) => photo.review === REVIEW_PENDING).map((photo) => (
              <div key={photo.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <img src={photo.thumbUrl || photo.url} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6, border: "1px solid #e2e8f0" }} />
                <span style={{ fontSize: 11.5, color: "#64748b", flex: 1, minWidth: 80 }}>
                  {photo.author || "—"}{photo.note ? ` · ${photo.note}` : ""}
                </span>
                <button type="button" onClick={() => api.decidePhoto(photo.id, REVIEW_APPROVED)} style={small("#047857", "#ecfdf5")}>Показать клиенту</button>
                <button type="button" onClick={() => api.decidePhoto(photo.id, REVIEW_REJECTED)} style={small("#b91c1c", "#fef2f2")}>Отклонить</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Форма выплаты. Одна выплата — один чек, но закрывать она может несколько
// работ: заплатили мастеру 300 000, из них 100 000 за демонтаж и 200 000 за
// остальное. Поэтому суммы вводятся построчно, а не одним полем.
function PaymentForm({ stages, api, onDone, preselect = "", edit = null }) {
  const today = new Date().toISOString().slice(0, 10);
  const editLines = edit ? paymentLines(edit) : [];
  const [form, setForm] = useState(edit
    ? { mode: edit.mode, payee: edit.payee, amount: String(paymentAmount(edit)), note: edit.note || "", date: edit.date || today }
    : { mode: "full", payee: "", amount: "", note: "", date: today });
  const [picked, setPicked] = useState(() => (edit
    ? Object.fromEntries(editLines.map((line) => [line.stageId, String(line.fact)]))
    : (preselect ? { [preselect]: "" } : {})));
  const [receipts, setReceipts] = useState(edit?.receipts || []);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState("");
  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const chosen = stages.filter((stage) => stage.id in picked);
  const planOf = (stage) => Math.round(Number(stage?.costPlan) || 0);
  const lines = chosen.map((stage) => ({ stageId: stage.id, agreed: planOf(stage), fact: Math.round(Number(String(picked[stage.id]).replace(/\s/g, "").replace(",", ".")) || 0) }));
  const draft = { objectId: api.objectId || "x", mode: form.mode, payee: form.payee, amount: form.amount, lines };
  const amount = paymentAmount(draft);
  const spread = allocatedTotal(draft);
  const rest = amount - spread;
  const errors = validatePaymentReport(draft);

  const toggle = (stage) => setPicked((prev) => {
    const next = { ...prev };
    if (stage.id in next) delete next[stage.id];
    else next[stage.id] = "";
    return next;
  });
  // Раскладка по смете: суммы делятся пропорционально себестоимости плана.
  // Вручную по десяти работам никто считать не станет — а без раскладки не
  // станет и заполнять.
  const spreadByPlan = () => {
    const rows = allocateByPlan(chosen, amount);
    setPicked((prev) => {
      const next = { ...prev };
      for (const row of rows) next[row.stageId] = String(row.fact);
      return next;
    });
  };
  // Одна работа — вся сумма чека уходит в неё, лишний ввод ни к чему. При правке
  // не трогаем: там суммы уже заданы человеком.
  const oneStage = (!edit && chosen.length === 1) ? chosen[0].id : "";
  useEffect(() => {
    if (!oneStage || !amount) return;
    setPicked((prev) => (String(prev[oneStage] || "") === "" ? { ...prev, [oneStage]: String(amount) } : prev));
  }, [oneStage, amount]);

  const attach = async (event) => {
    const files = [...(event.target.files || [])];
    event.target.value = "";
    if (!files.length) return;
    setSaving(true); setProblem("");
    try {
      const uploaded = await api.uploadReceipts(chosen[0]?.id || preselect || "obj", files);
      setReceipts((prev) => [...prev, ...uploaded]);
    } catch (failure) { setProblem(failure?.message || "Чек не загрузился — проверьте связь"); }
    finally { setSaving(false); }
  };

  const submit = async () => {
    if (errors.length) { setProblem(errors[0]); return; }
    setSaving(true); setProblem("");
    try {
      if (edit) await api.editPayment(edit.id, { ...form, amount, lines, receipts });
      else await api.savePayment({ ...form, amount, lines, receipts });
      onDone?.();
    } catch (failure) { setProblem(failure?.message || "Не удалось сохранить выплату"); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ borderTop: "1px solid #e2e8f0", marginTop: 10, paddingTop: 10 }}>
      <div className="sr-form">
        <label className="sr-lab">Вид оплаты
          <select className="sr-field" value={form.mode} onChange={(event) => set({ mode: event.target.value })}>
            {PAY_MODES.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
        </label>
        <label className="sr-lab">Дата
          <input className="sr-field" type="date" value={form.date} onChange={(event) => set({ date: event.target.value })} />
        </label>
        <label className="sr-lab sr-wide">Кому платим
          <input className="sr-field" value={form.payee} onChange={(event) => set({ payee: event.target.value })}
            placeholder="рабочий, бригада или подрядчик" />
        </label>
        <label className="sr-lab sr-wide">Сумма выплаты, ₸ — как в чеке
          <input className="sr-field" inputMode="numeric" value={form.amount} onChange={(event) => set({ amount: event.target.value })}
            placeholder="300 000" />
        </label>
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 7 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: "#0f172a" }}>За какие работы</span>
          {chosen.length > 1 && amount > 0 && (
            <button type="button" onClick={spreadByPlan} style={small("#2563eb", "#eff6ff")}>Разложить по смете</button>
          )}
        </div>
        <div style={{ display: "grid", gap: 6, maxHeight: 260, overflowY: "auto" }}>
          {stages.map((stage) => {
            const on = stage.id in picked;
            return (
              <div key={stage.id} style={{ border: "1px solid " + (on ? "#bfdbfe" : "#e2e8f0"), background: on ? "#f8fbff" : "#fff",
                borderRadius: 9, padding: "8px 10px", display: "grid", gap: 6 }}>
                <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer", minWidth: 0 }}>
                  <input type="checkbox" checked={on} onChange={() => toggle(stage)} style={{ marginTop: 2, flexShrink: 0 }} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ fontSize: 12.5, fontWeight: on ? 800 : 600, color: "#0f172a", overflowWrap: "anywhere" }}>{stage.name || "Работа"}</span>
                    {planOf(stage) > 0 && <span style={{ display: "block", fontSize: 11, color: "#94a3b8" }}>по смете {money(planOf(stage))} ₸</span>}
                  </span>
                </label>
                {on && (() => {
                  const line = lines.find((item) => item.stageId === stage.id) || { agreed: 0, fact: 0 };
                  const delta = line.fact - line.agreed;
                  return (
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <input className="sr-field" inputMode="numeric" style={{ flex: "1 1 120px", minWidth: 0 }}
                        value={picked[stage.id]} placeholder="сумма по этой работе"
                        onChange={(event) => setPicked((prev) => ({ ...prev, [stage.id]: event.target.value }))} />
                      {line.fact > 0 && line.agreed > 0 && (
                        <span style={chip(delta > 0 ? "#b91c1c" : delta < 0 ? "#64748b" : "#047857",
                          delta > 0 ? "#fef2f2" : delta < 0 ? "#f1f5f9" : "#ecfdf5")}>
                          {delta > 0 ? `⚠ выше сметы на ${money(delta)} ₸` : delta < 0 ? `ниже сметы на ${money(-delta)} ₸` : "как в смете"}
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      </div>

      {/* Сходится ли разложенное с чеком. Остаток сохранять не мешает — прораб
          на объекте не всегда помнит разбивку, и запрет означал бы, что запись
          не появится вовсе. Но висящую сумму видно и ему, и руководителю. */}
      {amount > 0 && (
        <div style={{ marginTop: 10, ...chip(rest === 0 ? "#047857" : rest < 0 ? "#b91c1c" : "#b45309",
          rest === 0 ? "#ecfdf5" : rest < 0 ? "#fef2f2" : "#fffbeb"), padding: "7px 11px", fontSize: 12 }}>
          {rest === 0 ? `✓ Разложено ${money(spread)} из ${money(amount)} ₸`
            : rest > 0 ? `Не распределено ${money(rest)} ₸ из ${money(amount)}`
              : `⚠ Разложено на ${money(-rest)} ₸ больше, чем в выплате`}
        </div>
      )}

      <div className="sr-tiles">
        {receipts.map((receipt) => (
          <div key={receipt.id} className="sr-tile">
            <a href={receipt.url} target="_blank" rel="noopener"><img src={receipt.thumbUrl || receipt.url} alt="Чек" /></a>
            <button type="button" title="Убрать" onClick={() => setReceipts((prev) => prev.filter((item) => item.id !== receipt.id))}
              style={{ position: "absolute", top: -6, right: -6, width: 21, height: 21, borderRadius: "50%",
                border: "1px solid #fecaca", background: "#fff", color: "#dc2626", cursor: "pointer", fontSize: 11, lineHeight: 1 }}>×</button>
          </div>
        ))}
        {/* Чек чаще всего уже в галерее — это скриншот перевода, а не то, что
            фотографируют на месте. Поэтому галерея первой. */}
        <label className="sr-tile sr-add" title="Выбрать из галереи">
          🖼<span>Чек из галереи</span>
          <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={attach} />
        </label>
        <label className="sr-tile sr-add" title="Снять камерой">
          📷<span>Снять чек</span>
          <input type="file" accept="image/*" capture="environment" multiple style={{ display: "none" }} onChange={attach} />
        </label>
      </div>

      <label className="sr-lab" style={{ marginTop: 10 }}>Комментарий
        <textarea className="sr-field" rows={2} value={form.note} onChange={(event) => set({ note: event.target.value })}
          placeholder="за что и почему столько" />
      </label>

      {problem && <div style={{ marginTop: 8, fontSize: 12, color: "#b91c1c", fontWeight: 700 }}>{problem}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <button type="button" onClick={submit} disabled={saving} style={{ ...primary, opacity: saving ? .6 : 1 }}>
          {saving ? "Сохраняю…" : edit ? "Сохранить и отправить на проверку" : "Отправить на проверку"}
        </button>
        <button type="button" onClick={onDone} style={small("#64748b", "#f1f5f9")}>Отмена</button>
      </div>
    </div>
  );
}

// Карточка выплаты. Видно и общую сумму чека, и на какие работы она разошлась —
// иначе «300 000 Ержану» не проверить: неясно, за что именно платили.
function PaymentCard({ report, api, currentUser, stageName, stages, onEdit, editing }) {
  const [comment, setComment] = useState("");
  const [open, setOpen] = useState(false);
  const meta = reportStatusMeta(report.status);
  const lines = paymentLines(report);
  const amount = paymentAmount(report);
  const spread = allocatedTotal(report);
  const rest = amount - spread;
  const delta = paymentDeviation(report);
  const mine = String(report.authorId || "") === String(currentUser?.id || "");
  const mayReview = canReviewPayment(report, currentUser, { canReview: api.canReview, allowSelfReview: api.allowSelfReview });
  const mayEdit = !api.readOnly && canEditPayment(report, currentUser, { canReview: api.canReview });

  return (
    <div className="sr-rep" style={{ borderLeft: `3px solid ${meta.color}` }}>
      <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <span style={{ fontSize: 13.5, fontWeight: 800, color: "#0f172a", minWidth: 0, overflowWrap: "anywhere" }}>{report.payee}</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>{money(amount)} ₸</span>
        <span style={chip(meta.color, meta.bg)}>{meta.label}</span>
        <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: "auto" }}>
          {payModeMeta(report.mode).label} · {shortDate(report.date)}
        </span>
      </div>

      <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
        {lines.map((line) => {
          const over = line.fact - line.agreed;
          return (
            <div key={line.stageId} style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", fontSize: 12 }}>
              <span style={{ color: "#475569", flex: "1 1 140px", minWidth: 0, overflowWrap: "anywhere" }}>{stageName?.(line.stageId) || "Работа"}</span>
              <span style={{ fontWeight: 800, color: "#0f172a", whiteSpace: "nowrap" }}>{money(line.fact)} ₸</span>
              {line.agreed > 0 && over !== 0 && (
                <span style={chip(over > 0 ? "#b91c1c" : "#64748b", over > 0 ? "#fef2f2" : "#f1f5f9")}>
                  {over > 0 ? `⚠ +${money(over)}` : `−${money(-over)}`} к смете
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="sr-sums">
        {rest !== 0 && (
          <span style={chip(rest < 0 ? "#b91c1c" : "#b45309", rest < 0 ? "#fef2f2" : "#fffbeb")}>
            {rest > 0 ? `не распределено ${money(rest)} ₸` : `⚠ разложено на ${money(-rest)} ₸ больше чека`}
          </span>
        )}
        {delta > 0 && <span style={chip("#b91c1c", "#fef2f2")}>⚠ выше сметы на {money(delta)} ₸</span>}
        {delta < 0 && (isPartialPayment(report)
          ? <span style={chip("#64748b", "#f1f5f9")}>остаток по смете {money(paymentRemainder(report))} ₸</span>
          : <span style={chip("#047857", "#ecfdf5")}>ниже сметы на {money(-delta)} ₸</span>)}
      </div>

      {report.note && <div style={{ fontSize: 12, color: "#475569", marginTop: 6, lineHeight: 1.4 }}>{report.note}</div>}
      {report.receipts?.length > 0 && (
        <div className="sr-tiles">
          {report.receipts.map((receipt) => (
            <a key={receipt.id} className="sr-tile" href={receipt.url} target="_blank" rel="noopener" style={{ display: "block" }}>
              <img src={receipt.thumbUrl || receipt.url} alt="Чек" loading="lazy" />
            </a>
          ))}
        </div>
      )}
      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 7 }}>
        {report.author || "—"}{report.reviewedBy ? ` · проверил ${report.reviewedBy}` : ""}
      </div>
      {report.reviewNote && (
        <div style={{ marginTop: 7, background: meta.bg, border: `1px solid ${meta.color}26`, borderRadius: 7, padding: "7px 9px", fontSize: 12, color: meta.color }}>
          {report.reviewNote}
        </div>
      )}

      {mayReview && (
        <div style={{ marginTop: 9, borderTop: "1px solid #f1f5f9", paddingTop: 9 }}>
          {open ? (
            <div style={{ display: "grid", gap: 8 }}>
              <textarea className="sr-field" rows={2} value={comment} onChange={(event) => setComment(event.target.value)}
                placeholder="Комментарий к решению" />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button type="button" onClick={() => { api.decidePayment(report.id, "approved", comment); setOpen(false); }} style={small("#047857", "#ecfdf5")}>Подтвердить</button>
                <button type="button" onClick={() => { api.decidePayment(report.id, "clarify", comment); setOpen(false); }} style={small("#2563eb", "#eff6ff")}>Нужны пояснения</button>
                <button type="button" onClick={() => { api.decidePayment(report.id, "rejected", comment); setOpen(false); }} style={small("#b91c1c", "#fef2f2")}>Отклонить</button>
                <button type="button" onClick={() => setOpen(false)} style={small("#64748b", "#f1f5f9")}>Отмена</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setOpen(true)} style={small("#0f172a", "#f1f5f9")}>
              {report.status === "pending" ? "Проверить выплату" : "Изменить решение"}
            </button>
          )}
        </div>
      )}
      {mayEdit && (
        <div style={{ marginTop: 8 }}>
          <button type="button" onClick={() => onEdit?.(editing ? "" : report.id)} style={small("#2563eb", "#eff6ff")}>
            {editing ? "Отменить правку" : "Исправить"}
          </button>
          {report.status !== "pending" && !editing && (
            <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 8 }}>после правки выплата вернётся на проверку</span>
          )}
        </div>
      )}
      {editing && (
        <PaymentForm stages={stages} api={api} edit={report} onDone={() => onEdit?.("")} />
      )}
      {/* Своё подтвердить нельзя — в этом и смысл проверки. Владельцу это не
          мешает: у него право проверять себя есть. */}
      {mine && api.canReview && !api.allowSelfReview && (
        <div style={{ marginTop: 8, fontSize: 11, color: "#94a3b8" }}>Свою выплату подтверждает другой человек.</div>
      )}
    </div>
  );
}

// Раздел «Взаиморасчёты» под таблицей финансов: список выплат по объекту.
// Прораб не видит чужие выплаты — только свои и их статус.
export function PaymentsSection({ stages = [], api, currentUser, filterStageId = "", onClearFilter }) {
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState("");
  const all = filterStageId ? listPayments(api.list, filterStageId) : listAllPayments(api.list);
  const visible = api.canReview ? all : all.filter((item) => String(item.authorId || "") === String(currentUser?.id || ""));
  const nameOf = (stageId) => stages.find((item) => item.id === stageId)?.name || "";
  const totals = summarizePayments(api.list);

  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14 }}>
      <style>{STAGE_REPORTS_CSS}</style>
      <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Взаиморасчёты с мастерами</span>
        {!filterStageId && totals.paid > 0 && <span style={chip("#64748b", "#f1f5f9")}>выплачено {money(totals.paid)} ₸</span>}
        {filterStageId && (
          <span style={chip("#2563eb", "#eff6ff")}>только по работе: {nameOf(filterStageId) || "выбранной"}</span>
        )}
        {filterStageId && onClearFilter && (
          <button type="button" onClick={onClearFilter} style={small("#64748b", "#f1f5f9")}>Показать все</button>
        )}
        {!api.readOnly && !adding && (
          <button type="button" onClick={() => setAdding(true)} style={{ ...primary, marginLeft: "auto" }}>+ Выплата</button>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 3, lineHeight: 1.45 }}>
        Один чек может закрывать несколько работ — суммы разносятся по ним внутри выплаты.
        Внутренний документ: финансовых операций не создаёт.
      </div>

      {adding && <PaymentForm stages={stages} api={api} preselect={filterStageId} onDone={() => setAdding(false)} />}

      {visible.length === 0 && !adding && (
        <div style={{ fontSize: 12.5, color: "#94a3b8", padding: "14px 0 2px" }}>
          {filterStageId ? "По этой работе выплат пока нет." : "Выплат пока нет."}
        </div>
      )}
      {visible.map((report) => (
        <PaymentCard key={report.id} report={report} api={api} currentUser={currentUser} stageName={nameOf}
          stages={stages} editing={editId === report.id} onEdit={setEditId} />
      ))}
    </div>
  );
}

// Сводка по объекту для руководителя. Нужна ровно потому, что фото уходит
// клиенту только после подтверждения: без этой строки непроверенные снимки тихо
// копятся, клиент не видит ничего и никто не понимает почему.
export function StageReportsSummary({ api, kind = "photo" }) {
  if (!api?.canReview) return null;
  const { awaitingPhotos, payments } = api.summary;
  const photos = kind === "photo";
  if (photos ? !awaitingPhotos : (!payments.pending && !payments.overpaid)) return null;
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center",
      background: "#fff", border: "1px solid #e2e8f0", borderRadius: 11, padding: "10px 13px", marginBottom: 12 }}>
      <span style={{ fontSize: 12.5, fontWeight: 800, color: "#0f172a" }}>Ждёт вашего решения</span>
      {photos && <span style={chip("#b45309", "#fffbeb")}>📷 фото: {awaitingPhotos}</span>}
      {!photos && payments.pending > 0 && <span style={chip("#b45309", "#fffbeb")}>💵 отчётов: {payments.pending}</span>}
      {!photos && payments.overpaid > 0 && (
        <span style={chip("#b91c1c", "#fef2f2")}>⚠ выше согласованного на {money(payments.deviation)} ₸</span>
      )}
      <span style={{ fontSize: 11, color: "#94a3b8", flexBasis: "100%" }}>
        {photos
          ? "Пока фото не подтверждено, клиент его не видит. Решения — в карточке работы на вкладке «Этапы»."
          : "Отчёты прораба — в строках работ ниже. Финансовых операций они не создают."}
      </span>
    </div>
  );
}

// Точка входа: две компактные кнопки, панели раскрываются под карточкой этапа.
// Точка входа для вкладок «Этапы», «Сегодня» и «Управление»: только фото.
// Расчёты с рабочими сюда намеренно не попадают — они про деньги и живут во
// вкладке «Финансы», где строки те же этапы и рядом стоит себестоимость факт.
// Клиенту в этапах важны снимки, а не чужие расчёты с бригадой.
export default function StageReports({ stage, api, currentUser, onOpenPhoto }) {
  const [open, setOpen] = useState(false);
  if (!stage?.id || !api) return null;
  const photoCount = countStagePhotos(api.list, stage.id);
  const queuedCount = api.pending.filter((item) => String(item.stageId) === String(stage.id) && !item.receipt).length;
  const waiting = api.canReview
    ? listPhotos(api.list, stage.id).filter((item) => item.showClient !== false && item.review === REVIEW_PENDING && item.url).length
    : 0;

  return (
    <div style={{ marginTop: 2 }}>
      <div className="sr-acts">
        <button type="button" className="sr-btn" data-on={open ? "1" : "0"} onClick={() => setOpen((prev) => !prev)}>
          📷 Фото{photoCount > 0 ? ` · ${photoCount}` : ""}
          {queuedCount > 0 && <span style={chip("#b45309", "#fffbeb")}>{queuedCount}</span>}
          {waiting > 0 && <span style={chip("#b45309", "#fffbeb")}>ждут: {waiting}</span>}
        </button>
      </div>
      {open && <PhotoPanel stage={stage} api={api} onOpen={onOpenPhoto} />}
    </div>
  );
}
