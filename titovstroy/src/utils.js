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
