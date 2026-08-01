import { useState, useMemo } from "react";
import { listExpenseOps, normalizeStaff, NON_WAGE_KEY, nonWageSet } from "./payrollModel.js";
import {
  C, card, cardFlat, inp, lab, th, td, numCell, pill, btnPrimary, btnGhost, btnDanger,
  sectionTitle, sectionHint, runSave,
} from "./payrollUi.js";

// ─────────────────────────────────────────────────────────────────────────────
// «Разложить операции» — простановка получателя ПАЧКОЙ.
//
// Первая версия этого экрана предлагала связать подкатегорию с одним человеком,
// и это было неверно по существу:
//   • «Зарплаты рабочих / подрядчиков» — 184 операции на разные бригады,
//     одним человеком такую подкатегорию не закроешь;
//   • «Материалы», «Эквайринг», «Дивиденды» — вообще не выплаты людям, а экран
//     всё равно просил выбрать для них сотрудника;
//   • всё остальное пришлось бы править по одной операции руками.
//
// Поэтому работаем с операциями: фильтр → выделить → один раз выбрать получателя.
// Правило по подкатегории осталось, но как ВТОРОЙ блок и только там, где выплата
// действительно уходит одному человеку.
//
// Пишем ровно одно поле — payee. Остальные данные операции не трогаются,
// и запись идёт только по явной кнопке с подтверждением.
// ─────────────────────────────────────────────────────────────────────────────

const PAYROLL_HINT = /фот|зарплат|оклад|преми|бонус|дивиденд/i;

export function AssignTab({
  financeTx, saveFinanceTx, staff, workers, subTotals, subcategoryMap, saveSubcategoryMap,
  saveStaff, genId, money, readOnly, onGoStaff,
}) {
  const [subcategory, setSubcategory] = useState("");
  const [onlyUnassigned, setOnlyUnassigned] = useState(true);
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(() => new Set());
  const [kind, setKind] = useState("worker");
  const [personId, setPersonId] = useState("");
  const [busy, setBusy] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [err, setErr] = useState("");

  const list = useMemo(
    () => listExpenseOps(financeTx, { staff, workers, subcategoryMap, subcategory, onlyUnassigned, query }),
    [financeTx, staff, workers, subcategoryMap, subcategory, onlyUnassigned, query]);

  const selRows = list.rows.filter(r => sel.has(r.id));
  const selSum = selRows.reduce((s, r) => s + r.amount, 0);
  const people = kind === "worker" ? workers : staff;

  const toggle = (id) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectAll = () => setSel(new Set(list.rows.map(r => r.id)));
  const clearSel = () => setSel(new Set());

  const apply = async (remove = false) => {
    if (!selRows.length) return;
    const person = people.find(p => p.id === personId);
    if (!remove && !person) { window.alert("Выберите получателя."); return; }
    const what = remove ? "Убрать получателя" : `Проставить получателя «${person.name}»`;
    if (!window.confirm(
      `${what} для ${selRows.length} операций на ${money(selSum)}?\n\n` +
      `Изменится только поле «получатель». Суммы, даты, категории и комментарии операций не трогаются.`
    )) return;

    setBusy(true);
    try {
      const ids = new Set(selRows.map(r => r.id));
      const next = financeTx.map(t => {
        if (!ids.has(t.id)) return t;
        if (remove) { const { payee, ...rest } = t; return rest; }
        return { ...t, payee: { kind, id: personId } };
      });
      // Заблокированная запись возвращает undefined, а не false — на false проверять мало.
      const r = await runSave(saveFinanceTx, next);
      if (!r.ok) { setErr(`Не сохранено: ${r.reason}. Выделение осталось. ${r.hint || "Попробуйте ещё раз."}`); return; }
      setErr("");
      clearSel();
    } finally { setBusy(false); }
  };

  // ── Правило по подкатегории (второй блок) ──
  const [rules, setRules] = useState(subcategoryMap);
  const rulesDirty = JSON.stringify(rules) !== JSON.stringify(subcategoryMap);
  const setRule = (sub, id) => setRules(m => { const n = { ...m }; if (id) n[sub] = id; else delete n[sub]; return n; });
  // «Не зарплата» — деньги человеку, но не ФОТ (дивиденды, возврат займа). В разрезе
  // по людям они видны, но в сверку «начислено / выплачено» не идут: иначе у учредителя
  // была бы вечная переплата на миллионы.
  const nw = nonWageSet(rules);
  const toggleNonWage = (sub) => setRules(m => {
    const cur = new Set(Array.isArray(m[NON_WAGE_KEY]) ? m[NON_WAGE_KEY] : []);
    cur.has(sub) ? cur.delete(sub) : cur.add(sub);
    const n = { ...m };
    if (cur.size) n[NON_WAGE_KEY] = [...cur]; else delete n[NON_WAGE_KEY];
    return n;
  });
  const pickRule = async (sub, value) => {
    if (value !== "__new__") { setRule(sub, value); return; }
    const suggested = sub.replace(/^ФОТ\s*/i, "").replace(/^%\s*/, "").trim();
    const name = window.prompt(`Кто получает «${sub}»?\n\nВведите имя сотрудника:`, suggested);
    if (!name || !name.trim()) return;
    const rec = normalizeStaff({ id: genId(), name: name.trim(), position: suggested, status: "active" });
    const r = await runSave(saveStaff, [...staff, rec]);
    if (!r.ok) { setErr(`Сотрудник не сохранён: ${r.reason}.`); return; }
    setErr("");
    setRule(sub, rec.id);
  };
  const saveRules = async () => {
    if (!saveSubcategoryMap) return;
    setBusy(true);
    try {
      const ok = await saveSubcategoryMap(rules);
      setErr(ok === false ? "Правила не сохранены: облако не подтвердило запись." : "");
    } finally { setBusy(false); }
  };
  // Показываем только те подкатегории, где выплата похожа на зарплату, либо правило
  // уже задано. «Материалы» и «Эквайринг» — не люди, и просить для них сотрудника
  // было ошибкой прошлой версии экрана.
  const ruleRows = showRules ? subTotals : subTotals.filter(s => PAYROLL_HINT.test(s.subcategory) || rules[s.subcategory]);

  const dt = (ms) => new Date(ms).toLocaleDateString("ru-RU");

  return (
    <>
      <div>
        <div style={sectionTitle}>Разложить операции</div>
        <div style={sectionHint}>
          Отфильтруйте, выделите нужные и проставьте получателя одним действием. По одной операции заходить не надо.
        </div>
      </div>

      {staff.length === 0 && workers.length === 0 && (
        <div style={{ background: C.amberSoft, border: `1px solid ${C.amberLine}`, borderRadius: 14, padding: "13px 16px", fontSize: 12.5, color: "#78350f" }}>
          <b style={{ color: "#92400e" }}>Некого выбирать</b> — нет ни сотрудников, ни подрядчиков.
          {onGoStaff && <> Заведите людей на вкладке <button onClick={onGoStaff} style={{ background: "none", border: "none", padding: 0, color: "#1d4ed8", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 12, textDecoration: "underline" }}>«Сотрудники»</button>, подрядчики — в «Админке».</>}
        </div>
      )}

      {err && (
        <div style={{ background: C.redSoft, border: `1px solid ${C.redLine}`, borderRadius: 12, padding: "12px 15px", fontSize: 12.5, color: "#b91c1c" }}>{err}</div>
      )}

      {/* ── Фильтры ── */}
      <div style={{ ...card, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 11, alignItems: "end" }}>
        <div><span style={lab}>Подкатегория</span>
          <select style={inp} value={subcategory} onChange={e => { setSubcategory(e.target.value); clearSel(); }}>
            <option value="">— все расходы —</option>
            {subTotals.map(s => (
              <option key={s.subcategory} value={s.subcategory}>{s.subcategory} · {s.count} оп</option>
            ))}
          </select></div>
        <div><span style={lab}>Поиск по комментарию, договору</span>
          <input style={inp} value={query} onChange={e => { setQuery(e.target.value); clearSel(); }}
            placeholder="например: ержан" /></div>
        <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: C.ink2, cursor: "pointer", paddingBottom: 8 }}>
          <input type="checkbox" checked={onlyUnassigned}
            onChange={e => { setOnlyUnassigned(e.target.checked); clearSel(); }} style={{ cursor: "pointer" }} />
          Только без получателя
        </label>
        <div style={{ textAlign: "right", fontSize: 12, color: C.mute, paddingBottom: 6 }}>
          Найдено <b style={{ color: C.ink }}>{list.count}</b> из {list.allCount} · {money(list.total)}
        </div>
      </div>

      {/* ── Панель простановки ── */}
      {!readOnly && (
        <div style={{ ...card, borderColor: selRows.length ? C.accentLine : C.line,
          background: selRows.length ? "#fbfcff" : C.white,
          display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 11, alignItems: "end" }}>
          <div>
            <span style={lab}>Выделено</span>
            <div style={{ fontSize: 18, fontWeight: 900, color: selRows.length ? C.ink : "#cbd5e1", fontVariantNumeric: "tabular-nums", letterSpacing: "-.02em" }}>
              {selRows.length} оп · {money(selSum)}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <button onClick={selectAll} disabled={!list.rows.length} style={{ ...btnGhost, padding: "4px 10px", fontSize: 11.5 }}>Выделить все</button>
              <button onClick={clearSel} disabled={!selRows.length} style={{ ...btnGhost, padding: "4px 10px", fontSize: 11.5 }}>Снять</button>
            </div>
          </div>
          <div><span style={lab}>Кто получил</span>
            <select style={inp} value={kind} onChange={e => { setKind(e.target.value); setPersonId(""); }}>
              <option value="worker">Подрядчик</option>
              <option value="staff">Сотрудник</option>
            </select></div>
          <div><span style={lab}>{kind === "worker" ? "Подрядчик" : "Сотрудник"}</span>
            <select style={inp} value={personId} onChange={e => setPersonId(e.target.value)}>
              <option value="">— выберите —</option>
              {people.map(p => <option key={p.id} value={p.id}>{p.name || "Без имени"}{p.position ? ` · ${p.position}` : ""}</option>)}
            </select></div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => apply(false)} disabled={!selRows.length || !personId || busy}
              style={btnPrimary(!!selRows.length && !!personId && !busy)}>
              {busy ? "Сохраняю…" : `Проставить (${selRows.length})`}
            </button>
            <button onClick={() => apply(true)} disabled={!selRows.length || busy}
              style={btnDanger}>Убрать</button>
          </div>
        </div>
      )}

      {/* ── Операции ── */}
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        {list.rows.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: C.faint, fontSize: 13 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{onlyUnassigned ? "✅" : "🔎"}</div>
            {onlyUnassigned ? "Все операции по этому фильтру уже с получателем." : "По этому фильтру операций нет."}
          </div>
        ) : (
          <div style={{ overflowX: "auto", maxHeight: 560 }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 760 }}>
              <thead><tr>
                <th style={{ ...th, width: 34, position: "sticky", top: 0 }}></th>
                <th style={{ ...th, position: "sticky", top: 0 }}>Дата</th>
                <th style={{ ...th, position: "sticky", top: 0 }}>Подкатегория</th>
                <th style={{ ...th, position: "sticky", top: 0 }}>Комментарий</th>
                <th style={{ ...th, position: "sticky", top: 0 }}>Договор</th>
                <th style={{ ...th, position: "sticky", top: 0 }}>Получатель</th>
                <th style={{ ...th, textAlign: "right", position: "sticky", top: 0 }}>Сумма</th>
              </tr></thead>
              <tbody>
                {list.rows.map(r => (
                  <tr key={r.id} onClick={() => !readOnly && toggle(r.id)}
                    style={{ cursor: readOnly ? "default" : "pointer", background: sel.has(r.id) ? C.accentSoft : undefined, transition: "background .1s" }}>
                    <td style={{ ...td, textAlign: "center" }}>
                      <input type="checkbox" checked={sel.has(r.id)} disabled={readOnly}
                        onChange={() => toggle(r.id)} onClick={e => e.stopPropagation()} style={{ cursor: "pointer" }} />
                    </td>
                    <td style={{ ...td, whiteSpace: "nowrap", color: C.mute }}>{dt(r.date)}</td>
                    <td style={{ ...td, color: C.ink2 }}>{r.subcategory || "—"}</td>
                    <td style={{ ...td, color: C.mute, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.comment || ""}</td>
                    <td style={{ ...td, color: C.faint, whiteSpace: "nowrap" }}>{r.contractNo || "—"}</td>
                    <td style={td}>
                      {r.payee ? (
                        <span style={r.payee.kind === "worker" ? pill(C.amber, C.amberSoft) : pill(C.green, C.greenSoft)}>
                          {r.payee.name}{r.payee.source === "map" ? " · по правилу" : ""}
                        </span>
                      ) : <span style={pill(C.faint, C.bg)}>не указан</span>}
                    </td>
                    <td style={{ ...numCell, fontWeight: 700 }}>{money(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Правило по подкатегории ── */}
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.ink }}>Постоянное правило по подкатегории</div>
            <div style={{ fontSize: 11.5, color: C.faint, marginTop: 3 }}>
              Годится только там, где вся подкатегория уходит одному человеку — «ФОТ РОП», «ФОТ таргетолог».
              Правило действует и на будущие операции, сами операции не переписывает.
              Галочка «не зарплата» — для дивидендов и подобного: в разрезе по людям сумма видна,
              но зарплатой не считается и в сверку долгов не идёт.
            </div>
          </div>
          <span style={{ flex: 1 }} />
          {!readOnly && (
            <button onClick={saveRules} disabled={!rulesDirty || busy} style={btnPrimary(rulesDirty && !busy)}>
              {rulesDirty ? "Сохранить правила" : "Сохранено"}
            </button>
          )}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 620 }}>
            <thead><tr>
              <th style={th}>Подкатегория</th><th style={{ ...th, textAlign: "right" }}>Операций</th>
              <th style={{ ...th, textAlign: "right" }}>Сумма</th><th style={th}>Кому</th>
              <th style={th}>Не зарплата</th>
            </tr></thead>
            <tbody>
              {ruleRows.map(s => (
                <tr key={s.subcategory} style={rules[s.subcategory] ? { background: "#f7fdfa" } : undefined}>
                  <td style={{ ...td, fontWeight: 600, color: C.ink }}>{s.subcategory}</td>
                  <td style={numCell}>{s.count}</td>
                  <td style={{ ...numCell, fontWeight: 700 }}>{money(s.total)}</td>
                  <td style={{ ...td, minWidth: 210 }}>
                    <select disabled={readOnly} value={rules[s.subcategory] || ""}
                      onChange={e => pickRule(s.subcategory, e.target.value)}
                      style={{ ...inp, padding: "6px 9px", fontSize: 12 }}>
                      <option value="">— не задано —</option>
                      {staff.map(p => <option key={p.id} value={p.id}>{p.name || "Без имени"}{p.position ? ` · ${p.position}` : ""}</option>)}
                      {!readOnly && <option value="__new__">+ Завести сотрудника…</option>}
                    </select>
                  </td>
                  <td style={{ ...td, textAlign: "center" }}>
                    <input type="checkbox" disabled={readOnly} checked={nw.has(s.subcategory)}
                      onChange={() => toggleNonWage(s.subcategory)} style={{ cursor: "pointer" }}
                      title="Деньги человеку, но не зарплата — в сверку долгов не пойдут" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "10px 16px", borderTop: `1px solid ${C.lineSoft}` }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 11.5, color: C.mute, cursor: "pointer" }}>
            <input type="checkbox" checked={showRules} onChange={e => setShowRules(e.target.checked)} style={{ cursor: "pointer" }} />
            Показать все подкатегории расходов, а не только похожие на зарплату
          </label>
        </div>
      </div>
    </>
  );
}

export default AssignTab;
