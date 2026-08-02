import { useState, useMemo } from "react";
import { monthLabel } from "./payrollModel.js";
import {
  proposeAccruals, buildObjectEvents, normalizeAccrual, accrualKey,
  monthAccruals, accrualKindMeta, normalizeScheme,
} from "./payrollAccruals.js";
import {
  C, card, cardTable, inp, lab, th, td, numCell, tdTight, numCellTight, pill,
  btnPrimary, btnGhost, btnDanger, avatarOf, avatarStyle, h1, h1sub, notice,
  monthOptions, runSave,
} from "./payrollUi.js";

// ─────────────────────────────────────────────────────────────────────────────
// ⚠ ВКЛАДКА ОТКЛЮЧЕНА. Владелец снял «Начисления» из интерфейса: механика работает, но
// пользоваться ей неудобно и непонятно. Файл оставлен целиком — вернём, когда
// переработаем сценарий. В PayrollModule.jsx не импортируется.
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
        <div style={notice("red")}>{err}</div>
      )}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={h1}>Начисления</h1>
          <p style={h1sub}>Сколько человек заработал за месяц. Выплаты считаются отдельно — на вкладке «Долги» видно разницу.</p>
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
        <div style={{ ...cardTable, borderColor: C.accentLine, background: "#fafbff" }}>
          <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.accentInk }}>
                Можно начислить: {proposal.items.length} шт на {money(proposal.items.reduce((s, i) => s + i.amount, 0))}
              </div>
              <div style={{ fontSize: 12, color: C.mute, marginTop: 3 }}>
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
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 600 }}>
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
                      <td style={td}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          {(() => { const a = avatarOf(i.staffName); return <span style={avatarStyle(a)}>{a.initials}</span>; })()}
                          <span style={{ fontWeight: 700, color: C.ink, fontSize: 13.5 }}>{i.staffName}</span>
                        </div>
                      </td>
                      <td style={td}>
                        <span style={pill(meta.color, meta.bg)}>{meta.label}</span>
                        {i.objectLabel && <div style={{ fontSize: 11, color: C.mute, marginTop: 3 }}>{i.objectLabel}</div>}
                      </td>
                      <td style={{ ...td, color: C.mute, fontSize: 13 }}>{i.note || i.reason}</td>
                      <td style={{ ...numCell, fontWeight: 800, fontSize: 14, color: C.ink }}>{money(i.amount)}</td>
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
        <div style={notice()}>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 8 }}>
            Событий месяца без бонуса: {proposal.issues.length}
          </div>
          <div style={{ fontSize: 12.5, marginBottom: 10, lineHeight: 1.5 }}>
            Объект закрылся или подписан в этом месяце, но начислить некому. Ни объекты, ни производство
            система не правит — исправьте данные там, где они ведутся, либо начислите вручную.
          </div>
          {proposal.issues.slice(0, 12).map(x => (
            <div key={x.objectId} style={{ display: "flex", gap: 12, justifyContent: "space-between",
              fontSize: 12, padding: "6px 0", borderTop: `1px solid ${C.warnLine}` }}>
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <b>{x.label}</b> — {x.reason}
              </span>
              <span style={{ fontWeight: 700, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                {x.budget ? money(x.budget) : "сумма не задана"}
              </span>
            </div>
          ))}
        </div>
      )}

      {proposal.items.length === 0 && proposal.issues.length === 0 && (
        <div style={{ ...card, fontSize: 13, color: C.mute2, lineHeight: 1.5 }}>
          За {monthLabel(month)} предлагать нечего: либо всё уже начислено, либо схемы мотивации ещё не заданы
          (вкладка «Сотрудники» → «Изменить» → блок «Мотивация»).
        </div>
      )}

      {/* ── Ручное начисление ── */}
      {!readOnly && (manual ? (
        <div style={{ ...card, borderColor: C.accentLine, background: "#fafbff" }}>
          <div style={{ fontSize: 15.5, fontWeight: 800, color: C.ink, marginBottom: 13, letterSpacing: "-.01em" }}>
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
      <div style={cardTable}>
        <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
          borderBottom: current.list.length ? `1px solid ${C.lineHead}` : "none" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>Начислено за {monthLabel(month)}</div>
          <span style={{ flex: 1 }} />
          <div style={{ fontSize: 19, fontWeight: 800, color: C.ink, fontVariantNumeric: "tabular-nums", letterSpacing: "-.01em" }}>{money(current.total)}</div>
        </div>
        {current.list.length === 0 ? (
          <div style={{ padding: "0 18px 18px", fontSize: 13, color: C.faint }}>За этот месяц ещё ничего не начислено.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 600 }}>
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
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          {(() => { const av = avatarOf(a.staffName); return <span style={avatarStyle(av)}>{av.initials}</span>; })()}
                          <div>
                            <div style={{ fontWeight: 700, color: C.ink, fontSize: 13.5 }}>{a.staffName}</div>
                            {a.position && <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2 }}>{a.position}</div>}
                          </div>
                        </div>
                      </td>
                      <td style={td}>
                        <span style={pill(meta.color, meta.bg)}>{meta.label}</span>
                        {a.source === "auto" && <span style={{ ...pill(C.mute, C.lineSoft), marginLeft: 6 }}>по схеме</span>}
                      </td>
                      <td style={{ ...td, color: C.mute, fontSize: 13 }}>
                        {a.objectLabel && <div style={{ color: C.ink2 }}>{a.objectLabel}</div>}
                        {a.note}
                      </td>
                      <td style={{ ...numCell, fontWeight: 800, fontSize: 14, color: C.ink }}>{money(a.amount)}</td>
                      <td style={{ ...td, textAlign: "right" }}>
                        {!readOnly && (
                          <button onClick={() => removeAccrual(a)}
                            style={{ ...btnDanger, padding: "4px 10px", fontSize: 11.5 }}>
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
