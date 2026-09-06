// Справочники и константы приложения. Перенесено из App.jsx как есть —
// ни одно значение не изменено, только собрано в одном месте.
import { saveFailReasonText } from "./utils.js";
import { set } from "firebase/database";

// Метки сложности точно как в Google Script
export const COMPLEXITY = [
  { label:"Стандарт",              key:"std",  mult:1.0 },
  { label:"Выше среднего + 20%",   key:"mid",  mult:1.2 },
  { label:"Сложно + 50%",          key:"hard", mult:1.5 },
];

export const OBJ_TYPES = ["Вторичка","Новостройка","Коммерция"];

// Виртуальная категория для позиций сметы без каталога (восстановленные из актов и пр.)
export const EXTRA_CAT = "Восстановлено из актов";

export const EMPTY_PROJ = { name:"", type:"Вторичка", area:"", address:"", phone:"", manager:"" };

export const STATUSES = [
  { key:"new",       label:"Новая",              color:"#2563eb", bg:"#eff6ff"   },
  { key:"progress",  label:"В работе",           color:"#d97706", bg:"rgba(217,119,6,.12)"  },
  { key:"sent",      label:"Отправлено клиенту", color:"#7c3aed", bg:"rgba(124,58,237,.1)"  },
  { key:"agreed",    label:"Согласовано",        color:"#059669", bg:"#eff6ff"  },
  { key:"rejected",  label:"Отказ",              color:"#dc2626", bg:"rgba(220,38,38,.12)"   },
];
export const CONTRACT_STATUSES = [
  { key:"draft",   label:"Черновик",     color:"#94a3b8", bg:"#f3f4f6"              },
  { key:"sign",    label:"На подписание", color:"#d97706", bg:"rgba(217,119,6,.12)" },
  { key:"signed",  label:"Заключён",     color:"#059669", bg:"rgba(5,150,105,.1)"   },
  { key:"archive", label:"Архив",        color:"#64748b", bg:"rgba(107,114,128,.12)"},
];
// Объекты — статусы жизненного цикла
// Единые статусы объекта (сделка + производство). Ключи старых статусов сохранены,
// чтобы существующие объекты не потеряли статус: new/approval/signed/refuse/archive.
export const DEAL_STATUSES = [
  { key:"new",      label:"Новый",              color:"#64748b", bg:"#f3f4f6"              },
  { key:"approval", label:"Согласование сметы", color:"#d97706", bg:"rgba(217,119,6,.12)"  },
  { key:"signed",   label:"Договор подписан",   color:"#059669", bg:"rgba(5,150,105,.1)"   },
  { key:"refuse",   label:"Потерян",            color:"#dc2626", bg:"rgba(220,38,38,.1)"   },
  { key:"work",     label:"В работе",           color:"#2563eb", bg:"#eff6ff"              },
  { key:"paused",   label:"Приостановлен",      color:"#d97706", bg:"rgba(217,119,6,.1)"   },
  { key:"done",     label:"Выполнен",           color:"#059669", bg:"#ecfdf5"              },
  { key:"cancel",   label:"Расторгнут",         color:"#dc2626", bg:"rgba(220,38,38,.12)"  },
  { key:"archive",  label:"Архив",              color:"#64748b", bg:"rgba(107,114,128,.12)"},
];
// Производственный статус → единый (производство перевешивает статус сделки, когда объект в работе)
export const PROD_TO_DEAL = { active:"work", paused:"paused", done:"done", cancel:"cancel" };
// Обратная карта: клик по статусу объекта должен сразу отражаться в отображаемом статусе.
// Т.к. unifiedStatusOf при наличии карточки производства всегда берёт производственный статус
// (это нужно для старых объектов, где статус реально хранился в производстве) — без обратного
// зеркалирования клик по кнопке ничего не менял бы визуально (см. баг «кнопки не работают»).
export const DEAL_TO_PROD = { work:"active", paused:"paused", done:"done", cancel:"cancel" };
export const PROD_STATUSES_LABELS = { new:"Новый", active:"В работе", paused:"Приостановлен", done:"Выполнен", cancel:"Расторгнут" };
// единый снимок рабочего пространства: объекты + их сметы + их договора
// legacy ключ для миграции старых сделок
// Почему не удалось заморозить цены смет перед сменой прайса. Раньше все причины
// сваливались в одну фразу «не удалось», и понять, что чинить, было нельзя.
export const PRICE_SEAL_REASONS = {
  "read-only-tab": "приложение открыто в другой вкладке — редактирует она",
  "editor-lock": "приложение открыто в другой вкладке — редактирует она",
  "no-sdk": "нет связи с облаком",
  timeout: "облако не ответило за 15 секунд",
  aborted: "сметы изменились параллельно — повторите",
  empty: "облако вернуло пустой ответ",
  "bad-json": "список смет в облаке повреждён",
  "not-array": "список смет в облаке повреждён",
  // Ошибки самого Firebase при транзакции.
  set: "сметы в этот момент сохранялись из другого места — повторите",
  maxretry: "сметы правятся слишком часто — повторите через пару секунд",
};
export const CLIENT_SAVE_FAIL_TEXT = (reason) =>
  `Клиент НЕ сохранён: ${saveFailReasonText(reason)}. Данные в форме на месте — нажмите «Создать и выбрать» ещё раз.`;

export const PRESENCE_ONLINE_MS = 2 * 60 * 1000; // «в сети», если активность была <2 мин назад

// Справочник финансов по умолчанию (из исходной таблицы)
// DEFAULT_FIN_META импортирован из ./utils.js
// Категории, которые НЕ являются P&L (не выручка / не расход) — финансовая и инвестиционная деятельность
export const C_FINANCING_INC = "Финансирование (не выручка)";        // доходы: займы/кредиты/вклады
export const C_ASSET_INC     = "Возврат займов и активов";            // доходы: возврат активов — не P&L, инвест. раздел ДДС
export const C_FINACT = "Финансовая деятельность (не расход)";        // расходы: возвраты займов/вкладов
export const C_INVEST = "Инвестиции (покупка активов)";               // расходы: капвложения в ОС (кассовый метод — расход)
export const C_ASSET_OUT     = "Выданные займы и прочие активы";      // расходы: займы выданные, залоги, запасы — не P&L
export const FA_SUB_MAP = { "Покупка: Техника":"faTechnika","Покупка: Мебель":"faMebel","Покупка: Инвентарь":"faInventar","Покупка: Оборудование":"faOborud","Покупка: Транспорт":"faTransport" };
// Маппинг подкатегорий C_ASSET_OUT / C_ASSET_INC → ключ баланса
export const ASSET_OUT_KEYS = { "Выдан займ (до 1 года)":"loansGivenShort","Выдан займ (от 1 года)":"loansGivenLong","Залоговый платёж":"collateral","Закуп запасов / материалов":"inventory","Финансовые вложения (долг.)":"financialInvest","НМА (нематериальные активы)":"intangibles" };
export const ASSET_INC_KEYS = { "Возврат займа выданного (кратк.)":"loansGivenShort","Возврат займа выданного (долг.)":"loansGivenLong","Возврат залогового платежа":"collateral","Продажа / реализация запасов":"inventory","Возврат фин. вложений":"financialInvest" };

// Дефолтные пользователи
export const DEFAULT_USERS = [
  { id:"1", login:"admin",    password:"titov2024", name:"Василий Титов",   role:"admin"  },
  { id:"2", login:"zamer1",   password:"zamer1",    name:"Замерщик 1",      role:"user"   },
];

// Метаданные журнала (используются и общим журналом, и срезом по объекту)
export const AUDIT_SECTION_META = {
  finance_tx: { label: "Финансы",   color: "#059669", bg: "#d1fae5", icon: "💰" },
  object:     { label: "Объекты",   color: "#2563eb", bg: "#dbeafe", icon: "🏗" },
  contract:   { label: "Договора",  color: "#7c3aed", bg: "#ede9fe", icon: "📋" },
  estimate:   { label: "Сметы",     color: "#0891b2", bg: "#cffafe", icon: "🧮" },
  stage:      { label: "Этапы",     color: "#ea580c", bg: "#ffedd5", icon: "🛠" },
  publish:    { label: "Кабинет",   color: "#0d9488", bg: "#ccfbf1", icon: "🌐" },
  document:   { label: "Документы", color: "#4f46e5", bg: "#e0e7ff", icon: "📄" },
  client:     { label: "Клиенты",   color: "#db2777", bg: "#fce7f3", icon: "🧑" },
  user:       { label: "Польз-ли",  color: "#d97706", bg: "#fef3c7", icon: "👤" },
  // Разделы, которые раньше вообще не писались в журнал и потому не имели вида.
  session:    { label: "Входы",     color: "#475569", bg: "#e2e8f0", icon: "🔑" },
  role:       { label: "Права",     color: "#b91c1c", bg: "#fee2e2", icon: "🔐" },
  price:      { label: "Прайс",     color: "#a16207", bg: "#fef9c3", icon: "💲" },
  contragent: { label: "Реквизиты", color: "#0369a1", bg: "#e0f2fe", icon: "🏢" },
  worker:     { label: "Работники", color: "#65a30d", bg: "#ecfccb", icon: "👷" },
  report:     { label: "Акты",      color: "#7e22ce", bg: "#f3e8ff", icon: "🧾" },
  podryad:    { label: "Подряд",    color: "#c2410c", bg: "#ffedd5", icon: "🔨" },
  document_template: { label: "Шаблоны", color: "#4f46e5", bg: "#e0e7ff", icon: "📑" },
  // Восстановления, импорт и выгрузка бэкапов. Самые опасные операции в системе — раньше
  // не оставляли в журнале вообще ничего: кто, когда и на какой момент откатил базу.
  backup:     { label: "Бэкапы",    color: "#0f766e", bg: "#ccfbf1", icon: "💾" },
};
export const AUDIT_SOURCE_META = {
  manual:   { label: "вручную",  color: "#64748b" },
  import:   { label: "импорт",   color: "#7c3aed" },
  autosync: { label: "автосинк", color: "#0891b2" },
  cabinet:  { label: "кабинет",  color: "#d97706" },
};
// Иконка/цвет по смыслу действия (работает и со старыми текстовыми, и с новыми записями)
export const _auditActionMeta = (action = "") => {
  const a = String(action).toLowerCase();
  if (/(созда|добав)/.test(a))            return { icon: "➕", color: "#059669" };
  if (/удали/.test(a))                     return { icon: "🗑", color: "#dc2626" };
  if (/восстанов/.test(a))                 return { icon: "♻️", color: "#059669" };
  if (/(назнач)/.test(a))                  return { icon: "👷", color: "#d97706" };
  if (/(опубликова|публик|доступ)/.test(a))return { icon: "🌐", color: "#0d9488" };
  if (/(измен|редактир|обнов|перенёс|перенес)/.test(a)) return { icon: "✏️", color: "#2563eb" };
  return { icon: "📝", color: "#64748b" };
};
export const _auditVal = (v) => (v === null || v === undefined || v === "") ? "—" : String(v);

// Типы документов
export const DOC_TYPES = [
  { value:"repair_fiz",  label:"Договор ремонта" },
  { value:"annex",       label:"Приложение (доп. работы) №2/3..." },
  { value:"design",      label:"Соглашение о дизайн-проекте" },
  { value:"design_add",  label:"Доп. соглашение к дизайн-проекту" },
  { value:"reservation", label:"Соглашение о резервировании" },
  { value:"podryad",     label:"Договор подряда (с рабочим)" },
  { value:"podryad_annex", label:"Доп. приложение к договору подряда" },
];
export const TYPE_LABELS = { repair_fiz:"Договор ремонта", annex:"Приложение", design:"Дизайн-проект", design_add:"Доп. соглашение дизайн", reservation:"Бронь", podryad:"Договор подряда", podryad_annex:"Приложение к подряду" };

// Обёртка авторизации. MainApp монтируется ТОЛЬКО при наличии currentUser,
// поэтому при входе/выходе он целиком монтируется/размонтируется и порядок
// хуков внутри него всегда стабилен (иначе React падал в белый экран).
// ─── ПУБЛИЧНАЯ СТРАНИЦА КП (по ссылке #/kp/<id>, без входа) ───────────────────
export const KP_NODE = (id) => "titovstroy-kp-" + id;

// ─── ПУБЛИЧНАЯ СТРАНИЦА «ПРОГРЕСС ОБЪЕКТА» (по ссылке #/progress/<токен>, без входа) ───
export const PROGRESS_NODE = (token) => "titovstroy-progress-" + token;
export const DOCS_NODE = (token) => "titovstroy-progress-" + token + "-docs"; // документы клиента (договоры, акты)
export const _PROG_ST = { todo:{l:"Не начат",c:"#64748b",bg:"#f1f5f9",i:"⏳"}, progress:{l:"В работе",c:"#2563eb",bg:"#eff6ff",i:"🔨"}, done:{l:"Готово",c:"#059669",bg:"#ecfdf5",i:"✓"}, delayed:{l:"Задержка",c:"#dc2626",bg:"#fef2f2",i:"⚠️"} };
export const COMPANY_WA = "77079824915"; // WhatsApp компании для связи с клиентом
