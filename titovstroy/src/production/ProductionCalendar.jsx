import { useMemo, useState } from "react";
import { buildCalendarStages, foremanLoad } from "../utils.js";

// ── КАЛЕНДАРЬ ПРОИЗВОДСТВА: общий таймлайн этапов (по объектам / по прорабам) ──
// Read-only v1: показывает загрузку, пересечения, просрочки и перегруз бригад. Клик по
// этапу открывает объект. Перетаскивание/инлайн-редактирование — отдельным заходом.
const _CAL_ST = { todo:{ l:"Не начат", c:"#94a3b8" }, progress:{ l:"В работе", c:"#2563eb" }, done:{ l:"Готово", c:"#059669" }, delayed:{ l:"Задержка", c:"#dc2626" } };
const _CAL_DAY = 864e5;
const _calDayStart = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x.getTime(); };
function ProductionCalendar({ objects, productions, onOpenObject }) {
  const [groupBy, setGroupBy] = useState("object"); // "object" | "foreman"
  const [windowDays, setWindowDays] = useState(30);  // 14 | 30 | 90
  const [anchor, setAnchor] = useState(() => _calDayStart(Date.now()) - 3*_CAL_DAY);
  const [fForeman, setFForeman] = useState("");
  const [fStatus, setFStatus] = useState("");
  const today = _calDayStart(Date.now());

  const allStages = useMemo(() => buildCalendarStages(objects, productions, { now: Date.now() }), [objects, productions]);
  const foremen = useMemo(() => [...new Set(allStages.map(s => s.responsible || "— без прораба —"))].sort((a,b)=>a.localeCompare(b)), [allStages]);
  const load = useMemo(() => foremanLoad(allStages, { threshold: 3 }), [allStages]);
  const overloadedForemen = Object.keys(load).filter(f => load[f].overloaded);

  const stages = allStages.filter(s =>
    (!fForeman || (s.responsible || "— без прораба —") === fForeman) &&
    (!fStatus || (fStatus === "overdue" ? s.overdue : s.status === fStatus)));

  const startMs = anchor, endMs = anchor + windowDays*_CAL_DAY;
  const inWindow = stages.filter(s => s.end >= startMs && s.start <= endMs);

  const rowsMap = {};
  for (const s of inWindow) {
    const key = groupBy === "object" ? s.objId : (s.responsible || "— без прораба —");
    if (!rowsMap[key]) rowsMap[key] = { key, label: groupBy === "object" ? s.objLabel : (s.responsible || "— без прораба —"), objId: s.objId, items: [] };
    rowsMap[key].items.push(s);
  }
  const rows = Object.values(rowsMap).sort((a,b) => a.label.localeCompare(b.label));

  const PX = windowDays <= 14 ? 34 : windowDays <= 30 ? 20 : 8;
  const chartW = windowDays * PX;
  const NAME_W = 172, ROW_H = 40;
  const xOf = ms => Math.round((_calDayStart(ms) - startMs)/_CAL_DAY) * PX;
  const clampX = x => Math.max(0, Math.min(chartW, x));
  // Недельные метки в шапке
  const ticks = [];
  for (let d = startMs; d <= endMs; d += 7*_CAL_DAY) ticks.push(d);
  const fmtD = ms => new Date(ms).toLocaleDateString("ru-RU", { day:"2-digit", month:"2-digit" });

  const ctrlBtn = (active) => ({ border:"1px solid "+(active?"#0f172a":"#e2e8f0"), background:active?"#0f172a":"#fff", color:active?"#fff":"#64748b", borderRadius:8, padding:"6px 12px", fontSize:12.5, fontWeight:700, cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" });

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      {/* Управление */}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
        <div style={{ display:"flex", gap:4 }}>
          <button style={ctrlBtn(groupBy==="object")} onClick={()=>setGroupBy("object")}>По объектам</button>
          <button style={ctrlBtn(groupBy==="foreman")} onClick={()=>setGroupBy("foreman")}>По прорабам</button>
        </div>
        <div style={{ display:"flex", gap:4 }}>
          {[[14,"2 нед"],[30,"Месяц"],[90,"3 мес"]].map(([d,l])=>(
            <button key={d} style={ctrlBtn(windowDays===d)} onClick={()=>setWindowDays(d)}>{l}</button>
          ))}
        </div>
        <div style={{ display:"flex", gap:4 }}>
          <button style={ctrlBtn(false)} onClick={()=>setAnchor(a=>a-Math.round(windowDays/2)*_CAL_DAY)} title="Назад">←</button>
          <button style={ctrlBtn(false)} onClick={()=>setAnchor(_calDayStart(Date.now())-3*_CAL_DAY)}>Сегодня</button>
          <button style={ctrlBtn(false)} onClick={()=>setAnchor(a=>a+Math.round(windowDays/2)*_CAL_DAY)} title="Вперёд">→</button>
        </div>
        <select value={fForeman} onChange={e=>setFForeman(e.target.value)} style={{ border:"1px solid #e2e8f0", borderRadius:8, padding:"6px 10px", fontSize:12.5, fontFamily:"inherit", cursor:"pointer", color:"#0f172a" }}>
          <option value="">Все прорабы</option>
          {foremen.map(f => <option key={f} value={f}>{f}{load[f]?.overloaded?" ⚠":""}</option>)}
        </select>
        <select value={fStatus} onChange={e=>setFStatus(e.target.value)} style={{ border:"1px solid #e2e8f0", borderRadius:8, padding:"6px 10px", fontSize:12.5, fontFamily:"inherit", cursor:"pointer", color:"#0f172a" }}>
          <option value="">Все статусы</option>
          <option value="todo">Не начат</option>
          <option value="progress">В работе</option>
          <option value="done">Готово</option>
          <option value="overdue">Только просрочки</option>
        </select>
      </div>

      {/* Перегруз бригад */}
      {overloadedForemen.length > 0 && (
        <div style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:10, padding:"10px 14px", display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
          <span style={{ fontSize:12.5, fontWeight:800, color:"#dc2626" }}>⚠ Перегруз:</span>
          {overloadedForemen.map(f => (
            <button key={f} onClick={()=>{ setGroupBy("foreman"); setFForeman(f); }} style={{ background:"#fff", border:"1px solid #fecaca", color:"#dc2626", borderRadius:20, padding:"3px 11px", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
              {f} · до {load[f].peak} одновременно
            </button>
          ))}
        </div>
      )}

      {/* Таймлайн */}
      {rows.length === 0 ? (
        <div style={{ textAlign:"center", color:"#94a3b8", padding:"50px 0", fontSize:14, background:"#fff", border:"1px solid #eef2f7", borderRadius:14 }}>
          В этом окне нет этапов с датами. Проставьте плановые даты у работ (вкладка «Этапы» объекта) или сдвиньте период.
        </div>
      ) : (
        <div style={{ background:"#fff", border:"1px solid #eef2f7", borderRadius:14, overflow:"auto" }}>
          <div style={{ minWidth: NAME_W + chartW }}>
            {/* Шапка с датами */}
            <div style={{ display:"flex", position:"sticky", top:0, background:"#f8fafc", borderBottom:"1px solid #e2e8f0", zIndex:2 }}>
              <div style={{ width:NAME_W, flexShrink:0, padding:"8px 12px", fontSize:11, fontWeight:800, color:"#64748b", textTransform:"uppercase", letterSpacing:".03em", borderRight:"1px solid #e2e8f0" }}>{groupBy==="object"?"Объект":"Прораб"}</div>
              <div style={{ position:"relative", width:chartW, height:32 }}>
                {ticks.map(t => (
                  <div key={t} style={{ position:"absolute", left:clampX(xOf(t)), top:0, height:"100%", borderLeft:"1px solid #eef2f7", paddingLeft:4, fontSize:10, color:"#94a3b8", display:"flex", alignItems:"center" }}>{fmtD(t)}</div>
                ))}
                {today>=startMs && today<=endMs && <div style={{ position:"absolute", left:xOf(today), top:0, height:"100%", borderLeft:"2px solid #dc2626" }} />}
              </div>
            </div>
            {/* Строки */}
            {rows.map(row => {
              const ov = groupBy==="foreman" && load[row.label]?.overloaded;
              // Раскладка по дорожкам: пересекающиеся этапы не накладываются, а встают друг
              // под другом — так видно реальную одновременную загрузку (узкое место).
              const LANE_H = 26;
              const sorted = [...row.items].sort((a,b)=>a.start-b.start);
              const laneEnds = []; // конец последнего бара в каждой дорожке
              const placed = sorted.map(s => {
                let lane = laneEnds.findIndex(end => end < s.start);
                if (lane === -1) { lane = laneEnds.length; laneEnds.push(s.end); } else { laneEnds[lane] = s.end; }
                return { s, lane };
              });
              const rowH = Math.max(ROW_H, laneEnds.length*LANE_H + 12);
              return (
                <div key={row.key} style={{ display:"flex", borderBottom:"1px solid #f6f8fa" }}>
                  <div onClick={()=>{ if(groupBy==="object" && onOpenObject) onOpenObject(row.objId); }}
                    style={{ width:NAME_W, flexShrink:0, padding:"8px 12px", borderRight:"1px solid #f1f5f9", cursor:groupBy==="object"?"pointer":"default", display:"flex", flexDirection:"column", justifyContent:"center" }}>
                    <div style={{ fontSize:12.5, fontWeight:700, color:"#0f172a", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{row.label}</div>
                    <div style={{ fontSize:10.5, color: ov?"#dc2626":"#94a3b8", fontWeight: ov?700:500 }}>{row.items.length} этап.{ov?` · перегруз (до ${load[row.label].peak})`:""}</div>
                  </div>
                  <div style={{ position:"relative", width:chartW, height:rowH }}>
                    {today>=startMs && today<=endMs && <div style={{ position:"absolute", left:xOf(today), top:0, bottom:0, borderLeft:"2px solid rgba(220,38,38,.25)" }} />}
                    {placed.map(({s,lane},idx) => {
                      const left = clampX(xOf(s.start));
                      const right = clampX(xOf(s.end) + PX);
                      const w = Math.max(PX*0.6, right - left);
                      const col = s.overdue ? _CAL_ST.delayed.c : (_CAL_ST[s.status]||_CAL_ST.todo).c;
                      return (
                        <div key={s.stageId+idx} title={`${s.name}\n${s.objLabel}\n${(_CAL_ST[s.status]||_CAL_ST.todo).l}${s.overdue?" · ПРОСРОЧКА":""}${s.responsible?`\n${s.responsible}`:""}`}
                          onClick={()=>onOpenObject && onOpenObject(s.objId)}
                          style={{ position:"absolute", left, top:6+lane*LANE_H, height:LANE_H-6, width:w, background:col, borderRadius:6, cursor:"pointer",
                            border: s.overdue?"1.5px solid #991b1b":"none", boxShadow:"0 1px 2px rgba(0,0,0,.12)", display:"flex", alignItems:"center", padding:"0 6px", overflow:"hidden", opacity: s.status==="done"?0.65:1 }}>
                          <span style={{ fontSize:10.5, color:"#fff", fontWeight:700, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{s.name}{groupBy==="foreman"?` · ${s.objLabel}`:""}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Легенда */}
      <div style={{ display:"flex", gap:14, flexWrap:"wrap", fontSize:11.5, color:"#64748b" }}>
        {Object.values(_CAL_ST).map(s => (
          <span key={s.l} style={{ display:"inline-flex", alignItems:"center", gap:5 }}><span style={{ width:11, height:11, borderRadius:3, background:s.c }} />{s.l}</span>
        ))}
        <span style={{ display:"inline-flex", alignItems:"center", gap:5 }}><span style={{ width:11, height:11, borderRadius:3, background:"#dc2626", border:"1.5px solid #991b1b" }} />Просрочка</span>
        <span style={{ display:"inline-flex", alignItems:"center", gap:5 }}><span style={{ width:2, height:12, background:"#dc2626" }} />Сегодня</span>
      </div>
    </div>
  );
}

export { ProductionCalendar };
