import { useState, useMemo } from "react";
import { monthLabel } from "./payrollModel.js";
import {
  proposeAccruals, buildObjectEvents, normalizeAccrual, accrualKey,
  monthAccruals, accrualKindMeta, normalizeScheme,
} from "./payrollAccruals.js";
import { card, inp, lab, th, td, numCell, pill, btnPrimary, btnGhost, monthOptions, runSave } from "./payrollUi.js";

// ─────────────────────────────────────────────────────────────────────────────
// Вкладка «Начисления»: что человек ЗАРАБОТАЛ за месяц.
//
// Ничего не начисляется само. Кнопка «Пересчитать» показывает предложения,
// начисляет — владелец галочками. Объекты, производство и финансы этот экран
// только читает.
// ─────────────────────────────────────────────────────────────────────────────

export function AccrualsTab({
  staff, accruals, objects, productions, finProjects, contracts,
  money, genId, readOnly, saveAccruals,
}) {
  const months = useMemo(() => monthOptions(accruals.map(a => a.month)), [accruals]);
  const [month, setMonth] = useState(months[0]);
  const [picked, setPicked] = useState(null);     // Set ключей выбранных предложений
  const [manual, setManual] = useState(null);
  const [busy, setBusy] = useState(false);

  const events = useMemo(
    () => buildObjectEvents({ objects, productions, finProjects, contracts }),
    [objects, productions, finProjects, contracts]);
  const proposal = useMemo(
    () => proposeAccruals({ month, staff, events, existing: accruals }),
    [month, staff, events, accruals]);
  const current = useMemo(() => monthAccruals(accruals, month, staff), [accruals, month, staff]);

  const chosen = picked || new Set(proposal.items.map(accrualKey));
  const toggle = (k) => {
    const next = new Set(chosen);
    next.has(k) ? next.delete(k) : next.add(k);
    setPicked(next);
  };
  const chosenItems = proposal.items.filter(i => chosen.has(accrualKey(i)));
  const chosenSum = chosenItems.reduce((s, i) => s + i.amount, 0);

  const [err, setErr] = useState("");
  // Заблокированная запись возвращает undefined, а не false: проверять на false мало —
  // экран считал бы сохранённым то, что не сохранилось.
  const commit = async (next) => {
    setBusy(true);
    try {
      const r = await runSave(saveAccruals, next);
      setErr(r.ok ? "" : `Не сохранено: ${r.reason}. ${r.hint || ""}`.trim());
      return r.ok;
    } finally { setBusy(false); }
  };

  const applyProposal = async () => {
    if (!chosenItems.length) return;
    // id проставляем здесь: до подтверждения предложение — это просто расчёт,
    // записи ещё нет.
    const rows = chosenItems.map(i => normalizeAccrual({ ...i, id: genId(), createdAt: Date.now() }));
    if (await commit([...accruals, ...rows])) setPicked(null);
  };

  const removeAccrual = async (a) => {
    if (!window.confirm(`Убрать начисление «${a.staffName}» на ${money(a.amount)}?\n\nВыплаты и операции это не тронет.`)) return;
    await commit(accruals.filter(x => x.id !== a.id));
  };

  const saveManual = async () => {
    if (!manual.staffId) { window.alert("Выберите сотрудника."); return; }
    const amount = Math.round(Number(String(manual.amount).replace(/\s/g, "").replace(",", ".")) || 0);
    if (!amount) { window.alert("Укажите сумму."); return; }
    const rec = normalizeAccrual({ ...manual, id: genId(), month, amount, source: "manual", createdAt: Date.now() });
    if (await commit([...accruals, rec])) setManual(null);
  };

  const pieceStaff = staff.filter(s => normalizeScheme(s.scheme).pieceRate > 0 && s.status !== "fired");

  return (
    <>
      {err && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "10px 13px", fontSize: 12, color: "#b91c1c" }}>{err}</div>
      )}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>Начисления за месяц</div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>Сколько человек заработал. Выплаты считаются отдельно — на вкладке «Долги» видно разницу.</div>
        </div>
        <span style={{ flex: 1 }} />
        <div style={{ minWidth: 150 }}>
          <span style={lab}>Месяц</span>
          <select style={inp} value={month} onChange={e => { setMonth(e.target.value); setPicked(null); }}>
            {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </div>
      </div>

      {/* ── Предложения ── */}
      {proposal.items.length > 0 && (
        <div style={{ ...card, borderColor: "#bfdbfe", background: "#f8fbff", padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#1e3a8a" }}>
                Можно начислить: {proposal.items.length} шт на {money(proposal.items.reduce((s, i) => s + i.amount, 0))}
              </div>
              <div style={{ fontSize: 11.5, color: "#64748b", marginTop: 2 }}>
                Посчитано по схемам мотивации. Снимите галочку с того, что начислять не нужно.
              </div>
            </div>
            <span style={{ flex: 1 }} />
            {!readOnly && (
              <button onClick={applyProposal} disabled={!chosenItems.length || busy}
                style={btnPrimary(!!chosenItems.length && !busy)}>
                {busy ? "Сохраняю…" : `Начислить ${money(chosenSum)}`}
              </button>
            )}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 620 }}>
              <thead><tr>
                <th style={{ ...th, width: 34 }}></th>
                <th style={th}>Сотрудник</th><th style={th}>За что</th><th style={th}>Расчёт</th>
                <th style={{ ...th, textAlign: "right" }}>Сумма</th>
              </tr></thead>
              <tbody>
                {proposal.items.map(i => {
                  const k = accrualKey(i);
                  const meta = accrualKindMeta(i.kind);
                  return (
                    <tr key={k} style={chosen.has(k) ? undefined : { opacity: .45 }}>
                      <td style={{ ...td, textAlign: "center" }}>
                        <input type="checkbox" checked={chosen.has(k)} disabled={readOnly}
                          onChange={() => toggle(k)} style={{ cursor: "pointer" }} />
                      </td>
                      <td style={{ ...td, fontWeight: 700, color: "#0f172a" }}>{i.staffName}</td>
                      <td style={td}>
                        <span style={pill(meta.color, meta.bg)}>{meta.label}</span>
                        {i.objectLabel && <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>{i.objectLabel}</div>}
                      </td>
                      <td style={{ ...td, color: "#64748b", fontSize: 11.5 }}>{i.note || i.reason}</td>
                      <td style={{ ...numCell, fontWeight: 800 }}>{money(i.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── С чем нужно разобраться ── */}
      {proposal.issues.length > 0 && (
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, padding: "12px 15px" }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: "#92400e", marginBottom: 7 }}>
            Событий месяца без бонуса: {proposal.issues.length}
          </div>
          <div style={{ fontSize: 11.5, color: "#78350f", marginBottom: 9 }}>
            Объект закрылся или подписан в этом месяце, но начислить некому. Ни объекты, ни производство
            система не правит — исправьте данные там, где они ведутся, либо начислите вручную.
          </div>
          {proposal.issues.slice(0, 12).map(x => (
            <div key={x.objectId} style={{ display: "flex", gap: 10, justifyContent: "space-between",
              fontSize: 11.5, padding: "5px 0", borderTop: "1px solid #fde68a" }}>
              <span style={{ color: "#78350f", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <b>{x.label}</b> — {x.reason}
              </span>
              <span style={{ color: "#92400e", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                {x.budget ? money(x.budget) : "сумма не задана"}
              </span>
            </div>
          ))}
        </div>
      )}

      {proposal.items.length === 0 && proposal.issues.length === 0 && (
        <div style={{ ...card, fontSize: 12.5, color: "#94a3b8" }}>
          За {monthLabel(month)} предлагать нечего: либо всё уже начислено, либо схемы мотивации ещё не заданы
          (вкладка «Сотрудники» → «Изменить» → блок «Мотивация»).
        </div>
      )}

      {/* ── Ручное начисление ── */}
      {!readOnly && (manual ? (
        <div style={{ ...card, borderColor: "#bfdbfe", background: "#f8fbff" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", marginBottom: 10 }}>
            Начислить вручную · {monthLabel(month)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 11 }}>
            <div><span style={lab}>Сотрудник</span>
              <select style={inp} value={manual.staffId} onChange={e => setManual(m => ({ ...m, staffId: e.target.value }))}>
                <option value="">— выберите —</option>
                {staff.filter(s => s.status !== "fired").map(s => (
                  <option key={s.id} value={s.id}>{s.name}{s.position ? ` · ${s.position}` : ""}</option>
                ))}
              </select></div>
            <div><span style={lab}>Тип</span>
              <select style={inp} value={manual.kind} onChange={e => setManual(m => ({ ...m, kind: e.target.value }))}>
                <option value="manual">Разовое</option>
                <option value="piece">За единицу (замеры)</option>
                <option value="salary">Оклад</option>
                <option value="percent">% с объекта</option>
              </select></div>
            {manual.kind === "piece" && (<>
              <div><span style={lab}>Количество</span>
                <input style={inp} value={manual.qty} inputMode="numeric"
                  onChange={e => {
                    const qty = e.target.value;
                    const s = staff.find(x => x.id === manual.staffId);
                    const rate = s ? normalizeScheme(s.scheme).pieceRate : 0;
                    setManual(m => ({ ...m, qty, rate, amount: rate ? String(Math.round(Number(qty) * rate)) : m.amount }));
                  }} placeholder="сколько замеров" /></div>
              <div><span style={lab}>Ставка за единицу</span>
                <input style={{ ...inp, background: "#f8fafc" }} readOnly
                  value={(() => { const s = staff.find(x => x.id === manual.staffId); return s ? normalizeScheme(s.scheme).pieceRate : 0; })()} /></div>
            </>)}
            <div><span style={lab}>Сумма, ₸</span>
              <input style={inp} value={manual.amount} inputMode="numeric"
                onChange={e => setManual(m => ({ ...m, amount: e.target.value }))} placeholder="0" /></div>
            <div style={{ gridColumn: "1 / -1" }}><span style={lab}>Комментарий</span>
              <input style={inp} value={manual.note} onChange={e => setManual(m => ({ ...m, note: e.target.value }))}
                placeholder="за что начислено" /></div>
          </div>
          {manual.kind === "piece" && pieceStaff.length === 0 && (
            <div style={{ fontSize: 11, color: "#b45309", marginTop: 8 }}>
              Ни у кого не задана ставка за единицу — сумму придётся вписать руками.
            </div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
            <button onClick={() => setManual(null)} style={btnGhost}>Отмена</button>
            <button onClick={saveManual} disabled={busy} style={btnPrimary(!busy)}>{busy ? "Сохраняю…" : "Начислить"}</button>
          </div>
        </div>
      ) : (
        <div>
          <button onClick={() => setManual({ staffId: "", kind: "manual", amount: "", qty: "", note: "" })} style={btnGhost}>
            + Начислить вручную
          </button>
        </div>
      ))}

      {/* ── Уже начислено за месяц ── */}
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a" }}>Начислено за {monthLabel(month)}</div>
          <span style={{ flex: 1 }} />
          <div style={{ fontSize: 15, fontWeight: 900, color: "#0f172a", fontVariantNumeric: "tabular-nums" }}>{money(current.total)}</div>
        </div>
        {current.list.length === 0 ? (
          <div style={{ padding: "0 16px 16px", fontSize: 12.5, color: "#94a3b8" }}>За этот месяц ещё ничего не начислено.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 620 }}>
              <thead><tr>
                <th style={th}>Сотрудник</th><th style={th}>Тип</th><th style={th}>За что</th>
                <th style={{ ...th, textAlign: "right" }}>Сумма</th><th style={th}></th>
              </tr></thead>
              <tbody>
                {current.list.map(a => {
                  const meta = accrualKindMeta(a.kind);
                  return (
                    <tr key={a.id}>
                      <td style={td}>
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>{a.staffName}</div>
                        {a.position && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>{a.position}</div>}
                      </td>
                      <td style={td}>
                        <span style={pill(meta.color, meta.bg)}>{meta.label}</span>
                        {a.source === "auto" && <span style={{ ...pill("#64748b", "#f1f5f9"), marginLeft: 6 }}>по схеме</span>}
                      </td>
                      <td style={{ ...td, color: "#64748b", fontSize: 11.5 }}>
                        {a.objectLabel && <div style={{ color: "#334155" }}>{a.objectLabel}</div>}
                        {a.note}
                      </td>
                      <td style={{ ...numCell, fontWeight: 800 }}>{money(a.amount)}</td>
                      <td style={{ ...td, textAlign: "right" }}>
                        {!readOnly && (
                          <button onClick={() => removeAccrual(a)}
                            style={{ ...btnGhost, borderColor: "#fecaca", color: "#dc2626", padding: "4px 10px", fontSize: 11.5 }}>
                            Убрать
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

export default AccrualsTab;
