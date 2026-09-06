// Матрица «Права ролей»: группы прав и редактор. Перенос из App.jsx.
import { useEffect, useState } from "react";
import { DEFAULT_ROLE_PERMISSIONS, ROLE_DEFINITIONS, normalizeRolePermissions } from "../utils.js";

export const ROLE_PERMISSION_GROUPS = [
  {
    id:"overview", icon:"⌂", label:"Главная и календарь",
    actions:[
      { key:"dashboard", label:"Главная", hint:"Виджеты и показатели", type:"scope" },
      { key:"calendar", label:"Календарь", hint:"Объекты, этапы и сроки", type:"scope" },
      { key:"calendarEdit", label:"Изменять календарь", hint:"Переносить сроки и этапы", type:"scope" },
    ],
  },
  {
    id:"objects", icon:"📦", label:"Объекты",
    actions:[
      { key:"objects", label:"Просмотр объектов", hint:"Карточки и список", type:"scope" },
      { key:"objectCreate", label:"Создание", hint:"Новые карточки объектов", type:"scope" },
      { key:"objectEdit", label:"Изменение данных", hint:"Клиент, адрес, даты и примечания", type:"scope" },
      { key:"objectStatus", label:"Изменение статуса", hint:"Перевод объекта по этапам", type:"scope" },
      { key:"objectAssign", label:"Назначение ответственного", hint:"Менеджер и прораб", type:"scope" },
      { key:"objectDelete", label:"Удаление и восстановление", hint:"Корзина объектов", type:"scope" },
      { key:"objectExport", label:"Экспорт", hint:"Выгрузка списка в Excel", type:"scope" },
      { key:"objectFinanceSummary", label:"Финансовая сводка списка", hint:"Объём продаж, оплаты, дебиторка, расходы, валовая прибыль и маржа над списком объектов", type:"boolean" },
      { key:"financialDetails", label:"Подробные финпоказатели", hint:"Себестоимость, прибыль, маржа и долги внутри карточек, на Главной и в Аналитике", type:"boolean" },
    ],
  },
  {
    id:"estimates", icon:"📋", label:"Сметы и КП",
    actions:[
      { key:"estimates", label:"Просмотр", hint:"Сметы и коммерческие предложения", type:"scope" },
      { key:"estimateCreate", label:"Создание", hint:"Основные и дополнительные сметы", type:"scope" },
      { key:"estimateEdit", label:"Изменение", hint:"Работы, цены, скидки и наценки", type:"scope" },
      { key:"estimateStatus", label:"Статус согласования", hint:"Принято, отправлено, отклонено", type:"scope" },
      { key:"estimatePublish", label:"Публикация клиенту", hint:"Ссылка на КП и кабинет клиента", type:"scope" },
      { key:"estimateDelete", label:"Удаление", hint:"Удаление смет и ДС", type:"scope" },
      { key:"estimateExport", label:"Печать и экспорт", hint:"PDF, Excel и JSON", type:"scope" },
    ],
  },
  {
    id:"production", icon:"🔨", label:"Производство",
    actions:[
      { key:"production", label:"Просмотр карточки", hint:"Ход работ и производственные данные", type:"scope" },
      { key:"productionEdit", label:"Основные данные", hint:"Даты, доступ, ответственный и примечания", type:"scope" },
      { key:"productionStages", label:"Этапы работ", hint:"Создание, сроки и выполнение", type:"scope" },
      { key:"productionToday", label:"Вкладка «Сегодня»", hint:"План дня, статус работ в один тап, закрытие дня", type:"scope" },
      { key:"productionControl", label:"Вкладка «Управление»", hint:"Оперативная картина объекта, задачи и замечания", type:"scope" },
      { key:"productionQuality", label:"Контроль качества", hint:"Журнал, чек-листы и замечания", type:"scope" },
      { key:"productionClientAccess", label:"Доступ клиента", hint:"Настройки клиентского кабинета", type:"scope" },
    ],
  },
  {
    id:"documents", icon:"📄", label:"Документы",
    actions:[
      { key:"documents", label:"Просмотр раздела", hint:"Доступ к документам объекта и «Прочим документам»", type:"scope" },
      { key:"docRepair", label:"Договоры ремонта", hint:"Договор ремонта, приложения и брони", type:"scope" },
      { key:"docDesign", label:"Дизайн-проект", hint:"Соглашение о дизайне и доп. соглашения", type:"scope" },
      { key:"docPodryad", label:"Договоры подряда", hint:"Подряд с рабочими и приложения (себестоимость)", type:"scope" },
      { key:"docAvr", label:"АВР (акты)", hint:"Акты выполненных работ по форме Р-1", type:"scope" },
      { key:"documentCreate", label:"Создание", hint:"Новые документы", type:"scope" },
      { key:"documentEdit", label:"Изменение", hint:"Реквизиты, работы и статус", type:"scope" },
      { key:"documentDelete", label:"Удаление", hint:"Корзина и безвозвратное удаление", type:"scope" },
      { key:"documentExport", label:"Печать и экспорт", hint:"PDF и печатные формы", type:"scope" },
    ],
  },
  {
    id:"documentTemplates", icon:"🧩", label:"Шаблоны и экземпляры",
    actions:[
      { key:"templateView", label:"Просмотр шаблонов", hint:"Список, версии и предпросмотр", type:"binary" },
      { key:"templateEdit", label:"Изменение шаблонов", hint:"Текст, форматирование и автополя", type:"binary" },
      { key:"templatePublish", label:"Публикация версий", hint:"Включение новой версии в работу", type:"binary" },
      { key:"templateRollback", label:"Откат версии", hint:"Возврат к ранее опубликованной версии", type:"binary" },
      { key:"templateArchive", label:"Архивирование", hint:"Скрытие шаблона без удаления истории", type:"binary" },
      { key:"documentInstanceEdit", label:"Изменение экземпляра", hint:"Разовая правка документа конкретного объекта", type:"binary" },
    ],
  },
  {
    id:"analytics", icon:"📊", label:"Аналитика",
    actions:[
      { key:"analytics", label:"Просмотр", hint:"Воронка, показатели и сотрудники", type:"scope" },
      { key:"analyticsExport", label:"Экспорт", hint:"Выгрузка аналитики", type:"scope" },
      { key:"analyticsSales", label:"Блок «Продажи и воронка»", hint:"Заявки, сметы, договоры, конверсия, причины отказа", type:"boolean" },
      { key:"analyticsBacklog", label:"Блок «Портфель заказов»", hint:"Законтрактовано, остаток работ и загрузка прорабов", type:"boolean" },
      { key:"analyticsProduction", label:"Блок «Производство и сроки»", hint:"Просрочки, сдача в срок, прогресс по этапам", type:"boolean" },
      { key:"analyticsFinance", label:"Блок «Финансы»", hint:"Поступления, расходы, дебиторка и прибыль по объектам", type:"boolean" },
      { key:"analyticsQuality", label:"Блок «Качество и клиент»", hint:"Замечания, сроки закрытия, чек-лист сдачи", type:"boolean" },
    ],
  },
  {
    id:"masters", icon:"🔎", label:"Мастера и парсер",
    actions:[
      { key:"masters", label:"Просмотр базы мастеров", hint:"Карточки мастеров из Naimi.kz и OLX.kz", type:"binary" },
      { key:"mastersManage", label:"Управление парсером", hint:"Настройки источников и запуск обновления", type:"binary" },
    ],
  },
  {
    id:"finance", icon:"💰", label:"Финансы",
    actions:[
      { key:"finance", label:"Доступ к разделу", hint:"ДДС, ОПУ, баланс и проекты", type:"finance" },
      { key:"financeCreate", label:"Добавление операций", hint:"Доходы, расходы и переводы", type:"scope" },
      { key:"financeEdit", label:"Изменение операций", hint:"Суммы, даты и привязки", type:"scope" },
      { key:"financeDelete", label:"Удаление операций", hint:"Корзина и окончательное удаление", type:"scope" },
      { key:"financeExport", label:"Экспорт", hint:"Финансовые выгрузки", type:"scope" },
      { key:"financeDirectories", label:"Справочники", hint:"Счета и категории", type:"scope" },
    ],
  },
  {
    id:"payroll", icon:"👥", label:"ФОТ (зарплаты)",
    actions:[
      { key:"payroll", label:"Доступ к разделу", hint:"Кто сколько получил, справочник сотрудников, разбор истории. Раздел живёт внутри «Финансов», поэтому нужен и доступ к ним", type:"finance" },
    ],
  },
  {
    id:"admin", icon:"⚙️", label:"Администрирование",
    actions:[
      { key:"admin", label:"Доступ к админке", hint:"Открытие раздела", type:"admin" },
      { key:"adminUsers", label:"Сотрудники", hint:"Создание, роли и пароли", type:"binary" },
      { key:"adminRoles", label:"Матрица прав", hint:"Настройка доступа ролей", type:"binary" },
      { key:"adminClients", label:"Клиенты и реквизиты", hint:"Общие справочники клиентов", type:"binary" },
      { key:"adminContractors", label:"Подрядчики", hint:"Справочник подрядчиков", type:"binary" },
      { key:"adminCatalog", label:"Каталог работ", hint:"Категории и состав работ", type:"binary" },
      { key:"adminPrices", label:"Цены", hint:"Базовые цены каталога", type:"binary" },
      { key:"adminAudit", label:"Журнал изменений", hint:"Просмотр и откат критичных полей", type:"binary" },
      { key:"adminDbCheck", label:"Проверка базы", hint:"Диагностика связей и дублей", type:"binary" },
      { key:"adminBackups", label:"Создание бэкапа", hint:"Выгрузка резервной копии", type:"binary" },
      { key:"adminRestore", label:"Восстановление", hint:"Импорт резервной копии", type:"binary" },
    ],
  },
  {
    id:"interface", icon:"◉", label:"Интерфейс",
    actions:[
      { key:"showLocked", label:"Показывать закрытые разделы", hint:"Оставлять пункт меню с объяснением доступа", type:"boolean" },
    ],
  },
];

export const ROLE_PERMISSION_ACTIONS = ROLE_PERMISSION_GROUPS.flatMap(group => group.actions);

export function PermissionSelect({ value, onChange, disabled, label, children }) {
  return (
    <select
      className="fi"
      value={value}
      onChange={e=>onChange(e.target.value)}
      disabled={disabled}
      aria-label={label}
      style={{width:"100%",minWidth:0,height:34,padding:"4px 28px 4px 9px",fontSize:12,borderRadius:7}}
    >
      {children}
    </select>
  );
}

// Держим черновик матрицы в отдельном компоненте. Иначе каждый выбор в select
// перерисовывает всю тяжёлую Админку (прайс, справочники, сотрудники) и кажется,
// что кнопка срабатывает с задержкой.
export function RolePermissionsEditor({ rolePermissions, onSaveRolePermissions }) {
  const [permissionRole, setPermissionRole] = useState("sales_head");
  const [permissionDraft, setPermissionDraft] = useState(() => normalizeRolePermissions(rolePermissions));
  const [permissionMsg, setPermissionMsg] = useState("");
  const [permissionSaving, setPermissionSaving] = useState(false);
  const [permissionSearch, setPermissionSearch] = useState("");

  useEffect(() => {
    setPermissionDraft(normalizeRolePermissions(rolePermissions));
  }, [rolePermissions]);

  const p = permissionDraft[permissionRole] || DEFAULT_ROLE_PERMISSIONS[permissionRole];
  const locked = permissionRole === "admin";
  const role = ROLE_DEFINITIONS.find(x => x.key === permissionRole);
  const roleLabel = role ? `${role.icon} ${role.label}` : "👤 Замерщик";
  const searchNorm = permissionSearch.trim().toLowerCase();
  const visibleGroups = ROLE_PERMISSION_GROUPS.map(group => ({
    ...group,
    actions: group.actions.filter(action => !searchNorm
      || `${group.label} ${action.label} ${action.hint}`.toLowerCase().includes(searchNorm)),
  })).filter(group => group.actions.length);

  const setPermission = (key, value) => {
    if (locked) return;
    setPermissionDraft(prev => ({
      ...prev,
      [permissionRole]: { ...prev[permissionRole], [key]: value },
    }));
    setPermissionMsg("");
  };

  const savePermissions = async () => {
    if (permissionSaving) return;
    setPermissionSaving(true);
    setPermissionMsg("");
    try {
      const ok = await onSaveRolePermissions(permissionDraft);
      setPermissionMsg(ok ? "✓ Права сохранены" : "Не удалось сохранить в облако");
    } finally {
      setPermissionSaving(false);
    }
  };

  const applyPreset = (kind) => {
    if (locked) return;
    if (kind === "default") {
      // Через нормализацию — иначе новые права (категории документов) выпадут из черновика.
      const norm = normalizeRolePermissions();
      setPermissionDraft(prev => ({ ...prev, [permissionRole]: { ...norm[permissionRole] } }));
      setPermissionMsg("");
      return;
    }
    const next = {};
    for (const action of ROLE_PERMISSION_ACTIONS) {
      if (action.type === "boolean") {
        next[action.key] = action.key === "showLocked" ? kind === "none" : kind === "full";
      } else if (action.type === "finance") {
        next[action.key] = kind === "full" ? "edit" : "none";
      } else if (action.type === "admin") {
        next[action.key] = kind === "full" ? "full" : "none";
      } else {
        next[action.key] = kind === "full" ? "all" : "none";
      }
    }
    setPermissionDraft(prev => ({ ...prev, [permissionRole]: { ...prev[permissionRole], ...next } }));
    setPermissionMsg("");
  };

  const renderPermissionControl = (action) => {
    if (action.type === "boolean") {
      return (
        <label style={{display:"flex",alignItems:"center",justifyContent:"flex-end",cursor:locked?"default":"pointer"}}>
          <input
            type="checkbox"
            checked={p[action.key] === true}
            disabled={locked}
            onChange={e=>setPermission(action.key,e.target.checked)}
            aria-label={action.label}
            style={{width:18,height:18}}
          />
        </label>
      );
    }
    if (action.type === "finance") {
      return (
        <PermissionSelect value={p[action.key]} onChange={v=>setPermission(action.key,v)} disabled={locked} label={action.label}>
          <option value="none">Нет доступа</option>
          <option value="view">Только просмотр</option>
          <option value="edit">Просмотр и изменение</option>
        </PermissionSelect>
      );
    }
    if (action.type === "admin") {
      return (
        <PermissionSelect value={p[action.key]} onChange={v=>setPermission(action.key,v)} disabled={locked} label={action.label}>
          <option value="none">Нет доступа</option>
          <option value="full">Открыть раздел</option>
        </PermissionSelect>
      );
    }
    const binary = action.type === "binary";
    return (
      <PermissionSelect value={p[action.key]} onChange={v=>setPermission(action.key,v)} disabled={locked} label={action.label}>
        <option value="none">Нет доступа</option>
        {!binary && <option value="own">Только свои</option>}
        <option value="all">{binary ? "Разрешено" : "Все"}</option>
      </PermissionSelect>
    );
  };

  return (
    <div>
      <style>{`
        .role-perm-action{display:grid;grid-template-columns:minmax(180px,1fr) minmax(140px,190px);gap:12px;align-items:center}
        .role-perm-group summary::-webkit-details-marker{display:none}
        .role-perm-group summary{list-style:none}
        @media(max-width:620px){
          .role-perm-action{grid-template-columns:minmax(0,1fr) minmax(122px,150px);gap:8px}
        }
      `}</style>
      <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:9}}>
        {ROLE_DEFINITIONS.map(item => (
          <button
            key={item.key}
            type="button"
            onClick={()=>setPermissionRole(item.key)}
            className="btn"
            style={{padding:"6px 9px",fontSize:11,background:permissionRole===item.key?"#eff6ff":"#fff",color:permissionRole===item.key?"#2563eb":"#64748b",border:`1px solid ${permissionRole===item.key?"#93c5fd":"#e2e8f0"}`}}
          >
            {item.icon} {item.label}
          </button>
        ))}
      </div>

      <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:10,overflow:"hidden"}}>
        <div style={{padding:"10px 12px",borderBottom:"1px solid #e2e8f0",background:"#f8fafc"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <div style={{fontSize:13,fontWeight:800,color:"#0f172a"}}>{roleLabel}</div>
            <div style={{flex:1}}/>
            {!locked && <>
              <button type="button" className="btn" onClick={()=>applyPreset("default")} style={{padding:"5px 8px",fontSize:10}}>Сбросить роль</button>
              <button type="button" className="btn" onClick={()=>applyPreset("none")} style={{padding:"5px 8px",fontSize:10,color:"#dc2626"}}>Запретить всё</button>
              <button type="button" className="btn" onClick={()=>applyPreset("full")} style={{padding:"5px 8px",fontSize:10,color:"#059669"}}>Разрешить всё</button>
            </>}
          </div>
          <div style={{fontSize:10,color:"#64748b",marginTop:3}}>
            {locked
              ? "Администратор всегда имеет полный доступ, чтобы систему нельзя было случайно заблокировать."
              : "Права применяются к сотрудникам этой роли после сохранения и обновления страницы."}
          </div>
        </div>

        <div style={{padding:"8px 12px 5px"}}>
          <div style={{position:"relative",marginBottom:8}}>
            <span style={{position:"absolute",left:10,top:8,color:"#94a3b8",fontSize:12}}>⌕</span>
            <input
              className="fi"
              value={permissionSearch}
              onChange={e=>setPermissionSearch(e.target.value)}
              placeholder="Найти право: удаление, экспорт, статус..."
              style={{height:32,paddingLeft:28,fontSize:11}}
            />
          </div>

          {visibleGroups.map(group => {
            const allowed = group.actions.filter(action => action.type === "boolean"
              ? p[action.key] === true
              : p[action.key] !== "none").length;
            return (
              <details
                key={group.id}
                className="role-perm-group"
                open={searchNorm ? true : undefined}
                style={{border:"1px solid #e2e8f0",borderRadius:8,marginBottom:6,overflow:"hidden",background:"#fff"}}
              >
                <summary style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",cursor:"pointer",background:"#f8fafc",userSelect:"none"}}>
                  <span style={{fontSize:13,width:18,textAlign:"center"}}>{group.icon}</span>
                  <span style={{fontSize:12,fontWeight:800,color:"#334155",flex:1}}>{group.label}</span>
                  <span style={{fontSize:10,fontWeight:700,color:allowed?"#2563eb":"#94a3b8",background:allowed?"#eff6ff":"#f1f5f9",borderRadius:10,padding:"2px 7px"}}>
                    {allowed}/{group.actions.length}
                  </span>
                  <span style={{fontSize:10,color:"#94a3b8"}}>▼</span>
                </summary>
                <div style={{padding:"0 10px"}}>
                  {group.actions.map(action => (
                    <div key={action.key} className="role-perm-action" style={{padding:"7px 0",borderTop:"1px solid #f1f5f9"}}>
                      <div style={{minWidth:0}}>
                        <div style={{fontSize:11.5,fontWeight:700,color:"#334155"}}>{action.label}</div>
                        <div style={{fontSize:9.5,color:"#94a3b8",marginTop:1,lineHeight:1.25}}>{action.hint}</div>
                      </div>
                      {renderPermissionControl(action)}
                    </div>
                  ))}
                </div>
              </details>
            );
          })}
          {visibleGroups.length === 0 && (
            <div style={{padding:"22px",textAlign:"center",fontSize:12,color:"#94a3b8"}}>Права не найдены</div>
          )}
        </div>

        {!locked && (
          <div style={{padding:"9px 12px",borderTop:"1px solid #e2e8f0",display:"flex",alignItems:"center",gap:10,justifyContent:"flex-end"}}>
            {permissionMsg && <span style={{fontSize:12,color:permissionMsg.startsWith("✓")?"#059669":"#dc2626"}}>{permissionMsg}</span>}
            <button type="button" className="btn btn-g" disabled={permissionSaving} onClick={savePermissions} style={{padding:"8px 12px",fontSize:12}}>
              {permissionSaving ? "Сохраняем..." : "💾 Сохранить права"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
