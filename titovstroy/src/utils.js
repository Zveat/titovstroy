// Чистые бизнес-функции без побочных эффектов (не тянут Firebase/React) — вынесены
// сюда специально, чтобы их можно было тестировать (vitest) без инициализации всего
// приложения. Это НЕ полный рефакторинг монолита App.jsx (тот — отдельная большая
// задача), только те функции, что уже были самодостаточны (module-level, без замыканий
// на состояние компонента) и стоят прямого юнит-теста.

// Нормализация номера договора для сопоставления: убираем пробелы, № и # — чтобы
// «№0919#153» и «0919#153» считались одним и тем же номером. Используется по всему
// приложению для связки договоров/финпроектов/операций между собой.
export const normCN = (s) => String(s||"").trim().toLowerCase().replace(/[\s№#]/g,"");

export const CATALOG_DEFAULTS = Object.freeze({ renames:{}, catRenames:{}, subRenames:{}, hiddenCodes:[], hiddenSubs:[], hiddenCats:[], custom:[] });
// Дефолты + текущее состояние + патч, одним местом.
export const withCatalogOverrides = (cur, patch = {}) => ({ ...CATALOG_DEFAULTS, ...(cur||{}), ...patch });

// Группировка строк по (cat, sub) — категория › подкатегория, с сохранением порядка появления.
export function groupData(works) {
  const g = {};
  for (const w of works) {
    if (!g[w.cat]) g[w.cat] = {};
    if (!g[w.cat][w.sub]) g[w.cat][w.sub] = [];
    g[w.cat][w.sub].push(w);
  }
  return g;
}

// Сумма прописью на казахском тенге — используется в легальном тексте договоров.
export function tengeInWords(num){
  num = Math.round(Math.abs(Number(num)||0));
  if(num===0) return "Ноль тенге";
  const ones=["","один","два","три","четыре","пять","шесть","семь","восемь","девять","десять","одиннадцать","двенадцать","тринадцать","четырнадцать","пятнадцать","шестнадцать","семнадцать","восемнадцать","девятнадцать"];
  const onesF=["","одна","две","три","четыре","пять","шесть","семь","восемь","девять","десять","одиннадцать","двенадцать","тринадцать","четырнадцать","пятнадцать","шестнадцать","семнадцать","восемнадцать","девятнадцать"];
  const tens=["","","двадцать","тридцать","сорок","пятьдесят","шестьдесят","семьдесят","восемьдесят","девяносто"];
  const hund=["","сто","двести","триста","четыреста","пятьсот","шестьсот","семьсот","восемьсот","девятьсот"];
  const triplet=(n,fem)=>{ const s=[]; const h=Math.floor(n/100), t=Math.floor((n%100)/10), o=n%10;
    if(h) s.push(hund[h]);
    if(t>=2){ s.push(tens[t]); if(o) s.push((fem?onesF:ones)[o]); }
    else { const v=t*10+o; if(v) s.push((fem?onesF:ones)[v]); }
    return s.join(" "); };
  const plural=(n,f)=>{ const a=n%10, b=n%100; if(a===1&&b!==11)return f[0]; if(a>=2&&a<=4&&(b<10||b>=20))return f[1]; return f[2]; };
  const res=[];
  const mlrd=Math.floor(num/1e9)%1000, mln=Math.floor(num/1e6)%1000, ths=Math.floor(num/1e3)%1000, rest=num%1000;
  if(mlrd){ res.push(triplet(mlrd,false), plural(mlrd,["миллиард","миллиарда","миллиардов"])); }
  if(mln){ res.push(triplet(mln,false), plural(mln,["миллион","миллиона","миллионов"])); }
  if(ths){ res.push(triplet(ths,true), plural(ths,["тысяча","тысячи","тысяч"])); }
  if(rest){ res.push(triplet(rest,false)); }
  res.push("тенге");
  const str=res.join(" ").replace(/\s+/g," ").trim();
  return str.charAt(0).toUpperCase()+str.slice(1);
}

export const DEFAULT_FIN_META = {
  accounts: [
    { id:"acc0", name:"Наличные",    opening:0, accType:"cash" },
    { id:"acc1", name:"KASPI Pay",   opening:0, accType:"bank" },
    { id:"acc2", name:"Учет займов", opening:0, accType:"bank" },
    { id:"acc3", name:"Лч Звеат",    opening:0, accType:"card" },
  ],
  balanceItems: {
    inventory:0, collateral:0, loansGivenShort:0, transfersInTransit:0,
    faTechnika:0, faMebel:0, faInventar:0, faOborud:0, faTransport:0,
    loansGivenLong:0, financialInvest:0, intangibles:0,
    payablesMoney:0, payablesNonMoney:0, paymentsThirdParty:0, loansTakenShort:0,
    creditsLong:0, loansTakenLong:0,
    foundersContribution:0, otherCapital:0,
  },
  income: [
    { cat:"Основные доходы", subs:["Оплата по договору (вторичка)","Оплата по договору (новостройки)","Оплата по договору  (коммерция)","Частичные работы, услуги"] },
    { cat:"Дополнительные доходы", subs:["Доп. работы по ходу ремонта","Закупка материалов (наценка)"] },
    { cat:"Скрытые/косвенные доходы", subs:["Кэшбэк и бонусы от поставщиков","Бонусы от субподрядчиков (наш %)","Услуги по доставке/подъёму"] },
    { cat:"Финансирование (не выручка)", subs:["Полученный заём (до 1 года)","Полученный заём (от 1 года)","Полученный кредит (от 1 года)","Вклад учредителя"] },
    { cat:"Возврат займов и активов", subs:["Возврат займа выданного (кратк.)","Возврат займа выданного (долг.)","Возврат залогового платежа","Продажа / реализация запасов","Возврат фин. вложений"] },
  ],
  expense: [
    { cat:"Прямые расходы (COGS / себестоимость)", subs:["Зарплаты рабочих / подрядчиков","Аренда инструмента, спецтехника","Вывоз мусора, уборка","Логистика, доставка"] },
    { cat:"Косвенные расходы (OPEX / операционные)", subs:["Аренда офиса","ФОТ Директор по производству","ФОТ Управляющий партнер","ФОТ Прораб","Софт (IT, CRM)","Рекрутинг","Телефония, связь","Маркетинг бюджет контекст","Маркетинг бюджет таргет"] },
    { cat:"Финансовые расходы", subs:["КПН, ИПН","НДС 16%","Налог за сотрудников","Дивиденды учредителям"] },
    { cat:"Финансовая деятельность (не расход)", subs:["Возврат займа (до 1 года)","Возврат займа (от 1 года)","Погашение кредита (от 1 года)","Возврат вклада учредителю"] },
    { cat:"Инвестиции (покупка активов)", subs:["Покупка: Техника","Покупка: Мебель","Покупка: Инвентарь","Покупка: Оборудование","Покупка: Транспорт"] },
    { cat:"Выданные займы и прочие активы", subs:["Выдан займ (до 1 года)","Выдан займ (от 1 года)","Залоговый платёж","Закуп запасов / материалов","Финансовые вложения (долг.)","НМА (нематериальные активы)"] },
  ],
};

// Дополняет сохранённые категории/подкатегории Финансов дефолтными (не удаляет пользовательские).
export function mergeFinMeta(saved) {
  const m = { ...saved };
  ["income","expense"].forEach(key => {
    const cur = Array.isArray(m[key]) ? [...m[key]] : [];
    (DEFAULT_FIN_META[key]||[]).forEach(defCat => {
      const ex = cur.find(c => c.cat === defCat.cat);
      if (!ex) { cur.push({ cat: defCat.cat, subs: [...(defCat.subs||[])] }); }
      else { const subs = Array.isArray(ex.subs) ? [...ex.subs] : []; (defCat.subs||[]).forEach(s => { if (!subs.includes(s)) subs.push(s); }); ex.subs = subs; }
    });
    m[key] = cur;
  });
  return m;
}

// ── ДЕТЕКТОР ПРОБЛЕМ: «Что горит сегодня» + «Проверка базы» ──
// Одна чистая функция без побочных эффектов: получает все списки, возвращает массив проблем.
// Используется двумя экранами (дашборд admin/manager/прораб — операционные; Админка → Проверка
// базы — целостность данных). Read-only: НИЧЕГО не пишет, только считает. Не бросает исключений
// на неполных данных. Каждая проблема:
//   { id, group, sev, scope, dismissable, title, detail, nav }
//   scope: "today" — операционные (что разрулить сегодня, скрываемые «до завтра»);
//          "check" — целостность данных (перед мержем/релизом, не скрываемые).
//   sev:   "red" | "yellow".
//   nav:   как открыть — { object:id, tab? } | { screen, tab? } — интерпретирует UI.
const _dayStartTs = (d) => { const x = new Date(d); if (isNaN(x.getTime())) return 0; x.setHours(0,0,0,0); return x.getTime(); };
const _fmtT = (n) => (Math.round(Number(n)||0)).toLocaleString("ru-RU");
const _objLabel = (o) => (o && (o.clientName || o.address || o.objType)) || "объект без названия";

export function computeIssues(data = {}, opts = {}) {
  const objects = (data.objects||[]).filter(o => o && !o.deletedAt);
  const productions = data.productions || [];
  const finProjects = data.finProjects || [];
  const financeTx = (data.financeTx||[]).filter(t => t && !t.deletedAt && t.included !== false);
  const contracts = (data.contracts||[]).filter(c => c && !c.deletedAt);
  const estimates = data.estimates || [];
  const clients = data.clients || [];
  const now = opts.now || Date.now();
  const today = _dayStartTs(now);
  const out = [];

  const prodByObj = {}; for (const p of productions) if (p && p.objectId != null) prodByObj[p.objectId] = p;
  const objById = {};   for (const o of objects) objById[o.id] = o;

  // Оплаты по нормализованному номеру договора
  const incByCN = {};
  for (const t of financeTx) { const cn = normCN(t.contractNo); if (!cn) continue; if (t.type==="income") incByCN[cn] = (incByCN[cn]||0) + (Number(t.amount)||0); }

  // Связка финпроект ↔ объект (по objectId или по номеру договора объекта)
  const contractsByObj = {}; for (const c of contracts) { if (c.objectId) (contractsByObj[c.objectId]||(contractsByObj[c.objectId]=[])).push(c); }
  const finProjByObj = {}, finProjByCN = {};
  for (const fp of finProjects) { if (fp.objectId) finProjByObj[fp.objectId] = fp; if (fp.contractNo) finProjByCN[normCN(fp.contractNo)] = fp; }
  const finProjForObject = (o) => {
    if (finProjByObj[o.id]) return finProjByObj[o.id];
    for (const c of (contractsByObj[o.id]||[])) { const fp = finProjByCN[normCN(c.number)]; if (fp) return fp; }
    return null;
  };
  const objIsActive = (o) => !["done","cancel","archive","refuse"].includes(o.status);

  // ─────────── TODAY: операционные (что разрулить сегодня) ───────────
  // 1. Просроченные этапы производства
  for (const o of objects) {
    if (!objIsActive(o)) continue;
    const p = prodByObj[o.id]; if (!p) continue;
    for (const s of (p.stages||[])) {
      if ((s.status||"todo") === "done" || !s.planEnd) continue;
      const d = _dayStartTs(s.planEnd); if (!d || d >= today) continue;
      const days = Math.round((today - d)/864e5);
      out.push({ id:`overdue-stage:${o.id}:${s.id||s.name}`, group:"Производство", sev:"red", scope:"today", dismissable:true,
        title:`Просрочен этап: ${s.name||"без названия"}`,
        detail:`${_objLabel(o)} · ${s.responsible?("ответств. "+s.responsible+" · "):""}просрочка ${days} дн`,
        nav:{ object:o.id, tab:"stages" } });
    }
  }
  // 2. Объект в работе/подписан без назначенного прораба
  for (const o of objects) {
    if (!["signed","work","paused"].includes(o.status)) continue;
    const p = prodByObj[o.id];
    if ((p && (p.responsible||"").trim())) continue;
    out.push({ id:`no-foreman:${o.id}`, group:"Производство", sev:"yellow", scope:"today", dismissable:true,
      title:"Не назначен прораб", detail:`${_objLabel(o)} · статус «${o.status==="signed"?"договор подписан":o.status==="paused"?"приостановлен":"в работе"}»`,
      nav:{ object:o.id, tab:"info" } });
  }
  // 3. Договор подписан, но нет финпроекта (важно: не скрываемая — это дыра в данных)
  for (const o of objects) {
    if (!["signed","work"].includes(o.status)) continue;
    if (finProjForObject(o)) continue;
    out.push({ id:`signed-nofin:${o.id}`, group:"Финансы", sev:"red", scope:"today", dismissable:false,
      title:"Договор подписан, но нет финпроекта", detail:_objLabel(o),
      nav:{ object:o.id, tab:"finance" } });
  }
  // 4. Долг клиента (оплачено меньше бюджета)
  for (const fp of finProjects) {
    if ((fp.rawStatus||fp.status||"").toLowerCase() === "отменен") continue;
    const budget = Number(fp.budget)||0; if (budget<=0) continue;
    const inc = incByCN[normCN(fp.contractNo)]||0;
    const debt = budget - inc; if (debt <= 0) continue;
    const o = fp.objectId ? objById[fp.objectId] : null;
    out.push({ id:`debt:${fp.id||normCN(fp.contractNo)}`, group:"Финансы", sev: debt>budget*0.5?"red":"yellow", scope:"today", dismissable:true,
      title:`Долг клиента: ${_fmtT(debt)} ₸`, detail:`${(o&&o.clientName)||fp.description||("№"+(fp.contractNo||"?"))} · оплачено ${_fmtT(inc)} из ${_fmtT(budget)}`,
      nav: o ? { object:o.id, tab:"finance" } : { screen:"finance", tab:"projects" } });
  }
  // 5. Замечания клиента (новые/необработанные из клиентского кабинета)
  for (const o of objects) {
    const p = prodByObj[o.id]; if (!p) continue;
    for (const d of (p.defects||[])) {
      if (!d || d.source!=="client" || d.done) continue;
      out.push({ id:`client-remark:${o.id}:${d.id||d.clientRemarkId||d.ts}`, group:"Клиенты", sev:"red", scope:"today", dismissable:true,
        title:"Замечание клиента", detail:`${_objLabel(o)}: «${String(d.text||"").slice(0,80)}»`,
        nav:{ object:o.id, tab:"defects" } });
    }
  }
  // 6. Близко к сдаче, но есть незакрытые этапы или долг
  for (const o of objects) {
    if (o.status!=="work") continue;
    const p = prodByObj[o.id]; if (!p || !p.planEndDate || p.factEndDate) continue;
    const d = _dayStartTs(p.planEndDate); if (!d) continue;
    const left = Math.round((d - today)/864e5);
    if (left < 0 || left > 7) continue;
    const openStages = (p.stages||[]).filter(s => (s.status||"todo")!=="done").length;
    const fp = finProjForObject(o); const budget = fp?(Number(fp.budget)||0):0; const debt = fp?Math.max(0,budget-(incByCN[normCN(fp.contractNo)]||0)):0;
    if (openStages===0 && debt<=0) continue;
    out.push({ id:`near-handover:${o.id}`, group:"Производство", sev:"yellow", scope:"today", dismissable:true,
      title:`Скоро сдача (${left===0?"сегодня":("через "+left+" дн")})`,
      detail:`${_objLabel(o)}${openStages?` · ${openStages} незакрытых этапов`:""}${debt>0?` · долг ${_fmtT(debt)} ₸`:""}`,
      nav:{ object:o.id, tab:"info" } });
  }

  // ─────────── CHECK: целостность данных (перед мержем/релизом) ───────────
  // 7. Дубли номеров договоров (кроме приложений — у них номер родителя)
  const cnGroups = {};
  for (const c of contracts) { if (c.type==="annex"||c.type==="podryad_annex") continue; const cn=normCN(c.number); if (!cn) continue; (cnGroups[cn]||(cnGroups[cn]={n:0,sample:c})).n++; }
  for (const cn of Object.keys(cnGroups)) { const g=cnGroups[cn]; if (g.n>1) out.push({ id:`dup-cn:${cn}`, group:"Данные", sev:"red", scope:"check", dismissable:false,
    title:`Дубль номера договора №${g.sample.number}`, detail:`${g.n} договоров с одинаковым номером — финансы/оплаты могут сойтись не на тот`, nav:{ screen:"contracts" } }); }
  // 8. Сметы без objectId
  for (const e of estimates) { if (!e || e.objectId) continue; out.push({ id:`est-noobj:${e.id}`, group:"Данные", sev:"yellow", scope:"check", dismissable:false,
    title:"Смета не привязана к объекту", detail:`Смета на ${_fmtT(e.total||0)} ₸ — не попадёт в объект/этапы`, nav:{ screen:"objects" } }); }
  // 9. Финпроект без объекта (нет objectId и не находится по номеру договора)
  for (const fp of finProjects) {
    if (fp.objectId && objById[fp.objectId]) continue;
    const linkedByCN = fp.contractNo && contracts.some(c => c.objectId && objById[c.objectId] && normCN(c.number)===normCN(fp.contractNo));
    if (linkedByCN) continue;
    out.push({ id:`fp-noobj:${fp.id||normCN(fp.contractNo)}`, group:"Финансы", sev:"yellow", scope:"check", dismissable:false,
      title:"Финпроект без объекта", detail:`${fp.description||("№"+(fp.contractNo||"?"))} — не связан ни с одним объектом`, nav:{ screen:"finance", tab:"projects" } });
  }
  // 11. Пустые production-карточки (нет этапов, дат, ответственного) у неактивных объектов
  for (const p of productions) {
    if (String(p.objectId).startsWith("fp:")) continue;
    const o = objById[p.objectId]; if (!o) continue;
    const empty = !(p.stages||[]).length && !p.startDate && !p.planEndDate && !(p.responsible||"").trim();
    if (empty && !["work","done"].includes(o.status)) out.push({ id:`empty-prod:${p.objectId}`, group:"Данные", sev:"yellow", scope:"check", dismissable:false,
      title:"Пустая производственная карточка", detail:`${_objLabel(o)} — карточка есть, но не заполнена`, nav:{ object:o.id, tab:"info" } });
  }
  // 12. Production-запись без объекта (объект удалён/не существует)
  for (const p of productions) {
    if (String(p.objectId).startsWith("fp:")) continue;
    if (objById[p.objectId]) continue;
    out.push({ id:`prod-noobj:${p.objectId}`, group:"Данные", sev:"red", scope:"check", dismissable:false,
      title:"Производство без объекта", detail:`Карточка производства ссылается на несуществующий объект (${p.objectId})`, nav:{ screen:"objects" } });
  }
  // 13. Договор подряда без рабочего (битая ссылка на подрядчика)
  for (const c of contracts) {
    if (c.type!=="podryad" && c.type!=="podryad_annex") continue;
    if (c.workerId) continue;
    out.push({ id:`pod-noworker:${c.id}`, group:"Данные", sev:"yellow", scope:"check", dismissable:false,
      title:`Договор подряда без рабочего`, detail:`№${c.number||"?"} — не указан подрядчик (workerId)`, nav:{ screen:"contracts" } });
  }
  // 14. Расхождение бюджета финпроекта и суммы смет объекта (>20%)
  for (const o of objects) {
    const fp = finProjForObject(o); if (!fp) continue;
    const budget = Number(fp.budget)||0; if (budget<=0) continue;
    const estSum = estimates.filter(e => e && e.objectId===o.id).reduce((s,e)=>s+(Number(e.total)||0),0);
    if (estSum<=0) continue;
    const diff = Math.abs(budget-estSum);
    if (diff > budget*0.2) out.push({ id:`budget-mismatch:${o.id}`, group:"Финансы", sev:"yellow", scope:"check", dismissable:false,
      title:"Бюджет ≠ сумма смет", detail:`${_objLabel(o)}: бюджет ${_fmtT(budget)} ₸, сметы ${_fmtT(estSum)} ₸ (разница ${_fmtT(diff)} ₸)`, nav:{ object:o.id, tab:"finance" } });
  }
  // 15. Платежи с номером договора, которому не соответствует ни проект, ни договор
  const knownCN = new Set();
  for (const fp of finProjects) if (fp.contractNo) knownCN.add(normCN(fp.contractNo));
  for (const c of contracts) if (c.number) knownCN.add(normCN(c.number));
  const orphanPay = {};
  for (const t of financeTx) { const cn=normCN(t.contractNo); if (!cn || knownCN.has(cn)) continue; (orphanPay[cn]||(orphanPay[cn]={n:0,sum:0,sample:t})).n++; orphanPay[cn].sum+=(Number(t.amount)||0); }
  for (const cn of Object.keys(orphanPay)) { const g=orphanPay[cn]; out.push({ id:`pay-orphan:${cn}`, group:"Финансы", sev:"yellow", scope:"check", dismissable:false,
    title:`Платежи без проекта/договора (№${g.sample.contractNo})`, detail:`${g.n} операций на ${_fmtT(g.sum)} ₸ — номер договора не найден`, nav:{ screen:"finance", tab:"ops" } }); }
  // 16. Клиенты без имени или телефона
  for (const c of clients) { if ((c.name||"").trim() && (c.phone||"").trim()) continue; out.push({ id:`client-incomplete:${c.id}`, group:"Клиенты", sev:"yellow", scope:"check", dismissable:false,
    title:"Клиент без имени или телефона", detail:`${c.name||"(без имени)"}${c.phone?"":" · нет телефона"}`, nav:{ screen:"admin", tab:"clients" } }); }
  // 17. Публичная ссылка клиента без срока действия
  for (const o of objects) { if (o.progressShared && o.progressToken && !o.progressExpiresAt) out.push({ id:`link-noexp:${o.id}`, group:"Данные", sev:"yellow", scope:"check", dismissable:false,
    title:"Публичная ссылка без срока действия", detail:`${_objLabel(o)} — доступ клиента открыт бессрочно (нет 60-дневного лимита)`, nav:{ object:o.id, tab:"info" } }); }

  return out;
}

// ── КАЛЕНДАРЬ ПРОИЗВОДСТВА: плоский список этапов для таймлайна ──
// Разворачивает все этапы всех объектов в единый список для календаря/гантта.
// Read-only, чистая, тестируемая. Берёт плановые даты (fallback на фактические).
// Каждый элемент: { objId, objLabel, stageId, name, cat, responsible, status,
//   start(ms), end(ms), overdue }. Этапы без дат пропускаются (нечего размещать).
export function buildCalendarStages(objects = [], productions = [], opts = {}) {
  const now = opts.now || Date.now();
  const today = _dayStartTs(now);
  const objById = {}; for (const o of (objects||[])) if (o && !o.deletedAt) objById[o.id] = o;
  const out = [];
  for (const p of (productions||[])) {
    if (!p || String(p.objectId).startsWith("fp:")) continue;
    const o = objById[p.objectId]; if (!o) continue;
    if (["archive","refuse","cancel"].includes(o.status)) continue;
    for (const s of (p.stages||[])) {
      if (!s) continue;
      const startRaw = s.planStart || s.factStart || s.planEnd || s.factEnd;
      const endRaw   = s.planEnd || s.factEnd || s.planStart || s.factStart;
      const start = _dayStartTs(startRaw), end = _dayStartTs(endRaw);
      if (!start && !end) continue; // нет дат — не размещаем
      const st = start || end, en = Math.max(start, end) || start;
      const status = s.status || "todo";
      out.push({
        objId: o.id, objLabel: _objLabel(o), stageId: s.id || s.name,
        name: s.manualName || s.name || "Этап", cat: s.cat || "Работы",
        responsible: (s.responsible || p.responsible || "").trim(),
        status, start: st, end: en,
        overdue: status !== "done" && en > 0 && en < today,
      });
    }
  }
  return out.sort((a,b) => a.start - b.start);
}

// Загрузка прораба/бригады: для каждого ответственного — максимум одновременно идущих
// (не завершённых) этапов в любой день окна. overloaded, если пик ≥ порога (по умолчанию 3).
// Показывает узкие места: один прораб назначен на слишком много объектов одновременно.
export function foremanLoad(calStages = [], opts = {}) {
  const threshold = opts.threshold || 3;
  const DAY = 864e5;
  const byResp = {};
  for (const s of calStages) {
    if (s.status === "done") continue;
    const r = s.responsible || "— без прораба —";
    (byResp[r] || (byResp[r] = [])).push(s);
  }
  const res = {};
  for (const r of Object.keys(byResp)) {
    const arr = byResp[r];
    let peak = 0;
    // Перебираем дни от min start до max end, считаем пересечения
    let minD = Infinity, maxD = -Infinity;
    for (const s of arr) { if (s.start && s.start<minD) minD=s.start; if (s.end && s.end>maxD) maxD=s.end; }
    if (!isFinite(minD) || !isFinite(maxD)) { res[r] = { count: arr.length, peak: arr.length, overloaded: arr.length>=threshold }; continue; }
    for (let d = minD; d <= maxD; d += DAY) {
      let c = 0;
      for (const s of arr) { if (s.start <= d && d <= s.end) c++; }
      if (c > peak) peak = c;
    }
    res[r] = { count: arr.length, peak, overloaded: peak >= threshold };
  }
  return res;
}

// ── Классификация облачного чтения для ПОЛНОГО БЭКАПА ──
// Бэкап читает только из Firebase (getCloudResult). Здесь — чистая классификация ответа:
//  found + валидный JSON-массив → ok (данные);
//  empty → ok (раздела реально нет — это не ошибка);
//  found, но битый JSON или не массив → НЕ ok (порча данных — это ошибка раздела, не «пусто»);
//  unavailable / found без value → НЕ ok (база не ответила — файл нельзя звать полным).
export function classifyCloudArr(r) {
  if (!r) return { list: [], ok: false };
  if (r.status === "empty") return { list: [], ok: true };
  if (r.status === "found" && r.value != null) {
    try { const p = JSON.parse(r.value); return Array.isArray(p) ? { list: p, ok: true } : { list: [], ok: false }; }
    catch { return { list: [], ok: false }; }
  }
  return { list: [], ok: false };
}
// То же для НЕ-массивов (настройки/каталог/цены). Валидным считаем ТОЛЬКО обычный объект —
// массив/число/строка вместо настроек = порча, а не корректное значение (иначе восстановление
// могло бы записать мусор в каталог/цены/настройки).
export function classifyCloudObj(r) {
  if (!r) return { value: null, ok: false };
  if (r.status === "empty") return { value: null, ok: true };
  if (r.status === "found" && r.value != null) {
    try {
      const p = JSON.parse(r.value);
      if (p === null) return { value: null, ok: true }; // литеральный null = «настроек нет» (так пишется очищенный раздел), не порча
      const isPlainObj = typeof p === "object" && !Array.isArray(p);
      return isPlainObj ? { value: p, ok: true } : { value: null, ok: false };
    } catch { return { value: null, ok: false }; }
  }
  return { value: null, ok: false };
}
// Решение по ПРЕД-БЭКАПУ раздела перед восстановлением (чистая логика для тестов).
// Возвращает { action:"skip"|"proceed", backups }:
//  - текущее значение раздела недоступно (unavailable) → skip (не знаем, что затираем);
//  - список пред-бэкапов (bkey) недоступен/битый/не массив → skip (не сможем безопасно откатить);
//  - иначе proceed с массивом бэкапов (пустой, если раздела-бэкапов ещё нет).
export function preBackupDecision(curResult, bkeyResult) {
  if (!curResult || curResult.status === "unavailable") return { action: "skip", backups: [] };
  // раздела ещё нет в облаке (empty) — бэкапить нечего, но перезапись безопасна
  if (curResult.status === "empty" || !curResult.value) return { action: "proceed", backups: [] };
  // есть текущее значение → нужен валидный список пред-бэкапов, иначе не рискуем
  if (!bkeyResult || bkeyResult.status === "unavailable") return { action: "skip", backups: [] };
  if (bkeyResult.status === "empty" || !bkeyResult.value) return { action: "proceed", backups: [] };
  try {
    const arr = JSON.parse(bkeyResult.value);
    if (!Array.isArray(arr)) return { action: "skip", backups: [] };
    return { action: "proceed", backups: arr };
  } catch { return { action: "skip", backups: [] }; }
}

// Безопасное объединение журнала аудита при восстановлении: добавляем записи из бэкапа,
// которых нет в текущем (по сигнатуре), НИЧЕГО не удаляем, сортируем по времени.
// Возвращает { merged: [...], added: N }. Чистая функция — покрыта тестами.
export function mergeAuditEntries(current = [], backup = []) {
  const sig = e => [e?.ts, e?.userId, e?.entity, e?.entityId, e?.field, e?.action].join("|");
  const out = Array.isArray(current) ? [...current] : [];
  const seen = new Set(out.map(sig));
  let added = 0;
  for (const e of (Array.isArray(backup) ? backup : [])) {
    const s = sig(e);
    if (!seen.has(s)) { out.push(e); seen.add(s); added++; }
  }
  out.sort((a, b) => (a.ts || 0) - (b.ts || 0));
  return { merged: out, added };
}

// Валидация СТРУКТУРЫ файла бэкапа ДО первой записи в Firebase. Валидный JSON может иметь
// неверную форму (массив вместо цен, строка вместо каталога, кривые публичные ноды) ИЛИ
// битые элементы внутри списков (null/строки/числа, объекты без id) — без этой проверки
// восстановление записало бы мусор в раздел. При любой ошибке возвращает { ok:false, error }
// и восстановление должно быть ПОЛНОСТЬЮ отменено.
// arraySpecs — [{ key, idKey }] : какие разделы — списки и по какому полю у них идентификатор
// (для большинства "id", для производства — "objectId").
export function validateBackupSchema(snap, arraySpecs = []) {
  const isPlain = v => v !== null && typeof v === "object" && !Array.isArray(v);
  if (!isPlain(snap)) return { ok: false, error: "файл не является объектом бэкапа" };
  if (snap._type !== "titovstroy-backup") return { ok: false, error: "это не файл бэкапа TitovStroy" };
  const d = snap.data;
  if (!isPlain(d)) return { ok: false, error: "data не является объектом" };
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  for (const spec of arraySpecs) {
    const key = spec.key, idKey = spec.idKey || "id";
    if (!has(d, key)) continue;
    const arr = d[key];
    if (!Array.isArray(arr)) return { ok: false, error: `раздел «${key}» должен быть массивом` };
    for (let i = 0; i < arr.length; i++) {
      const it = arr[i];
      if (!isPlain(it)) return { ok: false, error: `раздел «${key}»: элемент #${i} не является объектом (null/строка/число не допускаются)` };
      if (it[idKey] == null || it[idKey] === "") return { ok: false, error: `раздел «${key}»: элемент #${i} без «${idKey}»` };
    }
  }
  for (const k of ["financeMeta", "catalog", "prices"]) {
    if (has(d, k) && !(d[k] === null || isPlain(d[k]))) return { ok: false, error: `«${k}» должен быть объектом или пустым` };
  }
  if (has(d, "publicNodes")) {
    const pn = d.publicNodes;
    if (!isPlain(pn)) return { ok: false, error: "publicNodes должен быть объектом" };
    for (const sub of ["kp", "progress", "docs"]) {
      if (has(pn, sub)) {
        if (!isPlain(pn[sub])) return { ok: false, error: `publicNodes.${sub} должен быть объектом` };
        for (const val of Object.values(pn[sub])) if (!isPlain(val)) return { ok: false, error: `значение в publicNodes.${sub} должно быть объектом` };
      }
    }
  }
  if (has(d, "audit")) {
    const a = d.audit;
    if (!isPlain(a)) return { ok: false, error: "audit должен быть объектом" };
    if (has(a, "index")) {
      if (!Array.isArray(a.index)) return { ok: false, error: "audit.index должен быть массивом" };
      for (const ym of a.index) if (typeof ym !== "string" || !/^\d{4}-\d{2}$/.test(ym)) return { ok: false, error: `audit.index: неверный месяц «${ym}»` };
    }
    // Запись журнала: объект хотя бы с ts и (action или entity). Мусор в списках отсекаем.
    const badEntry = (list, label) => {
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!isPlain(e)) return `${label}: запись #${i} не объект`;
        if (e.ts == null || (e.action == null && e.entity == null)) return `${label}: запись #${i} без ts/action/entity`;
      }
      return null;
    };
    if (has(a, "legacy")) { if (!Array.isArray(a.legacy)) return { ok: false, error: "audit.legacy должен быть массивом" }; const er = badEntry(a.legacy, "audit.legacy"); if (er) return { ok: false, error: er }; }
    if (has(a, "months")) {
      if (!isPlain(a.months)) return { ok: false, error: "audit.months должен быть объектом" };
      for (const [ym, entries] of Object.entries(a.months)) {
        if (!/^\d{4}-\d{2}$/.test(ym)) return { ok: false, error: `неверный ключ месяца журнала: ${ym}` };
        if (!Array.isArray(entries)) return { ok: false, error: `audit.months[${ym}] должен быть массивом` };
        const er = badEntry(entries, `audit.months[${ym}]`); if (er) return { ok: false, error: er };
      }
    }
  }
  return { ok: true };
}

// Можно ли использовать файл для МАССОВОГО «Восстановить всё». Неполный бэкап (какой-то раздел
// не прочитался из Firebase и лежит в файле ПУСТЫМ) при массовом restore затёр бы рабочий раздел
// пустотой — поэтому такие файлы для «Восстановить всё» запрещены (годятся лишь для ручного
// точечного разбора). Требуем подтверждённую полноту: verifiedFromFirebase===true И пустой _incomplete.
export function isBackupRestorable(snap) {
  if (!snap || typeof snap !== "object") return { ok: false, reason: "файл не распознан" };
  if (snap.verifiedFromFirebase !== true) return { ok: false, reason: "полнота файла не подтверждена (verifiedFromFirebase ≠ true) — возможно, часть разделов не читалась из Firebase" };
  if (Array.isArray(snap._incomplete) && snap._incomplete.length) return { ok: false, reason: "файл помечен как НЕПОЛНЫЙ: " + snap._incomplete.join(", ") };
  return { ok: true };
}
