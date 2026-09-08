// КЛЮЧИ ХРАНИЛИЩА. Вынесены из App.jsx как есть, строка в строку, вместе с комментариями.
// Это чистые строки: имена узлов Firebase, по которым лежат данные компании.
//
// ПЕРЕИМЕНОВЫВАТЬ НЕЛЬЗЯ. Ключ — это адрес данных в боевой базе: сменишь строку, и приложение
// начнёт читать пустой узел, а старый останется висеть. Здесь только перенос, ни один символ
// внутри кавычек не изменён.
//
// Firebase санитизирует ключи: всё кроме [a-zA-Z0-9_] превращается в _, поэтому
// titovstroy-finance-tx в базе лежит как titovstroy_finance_tx. Правила базы написаны под
// эти же имена (firebase/database.rules.json) — менять надо парой.

export const OBJECTS_KEY         = "titovstroy-objects";
export const OBJECTS_BACKUPS_KEY = "titovstroy-objects-backups";
export const PRODUCTIONS_KEY         = "titovstroy-productions";   // производственные карточки объектов
export const PRODUCTIONS_BACKUPS_KEY = "titovstroy-productions-backups";
export const REPORTS_KEY         = "titovstroy-reports";          // отчёты по объектам (АВР, форма Р-1)
export const REPORTS_BACKUPS_KEY = "titovstroy-reports-backups";
export const WORKERS_KEY         = "titovstroy-workers";          // справочник подрядчиков (рабочих)
export const WORKERS_BACKUPS_KEY = "titovstroy-workers-backups";
export const PODRYADS_KEY        = "titovstroy-podryads";         // договоры подряда с рабочими + их приложения
export const PODRYADS_BACKUPS_KEY= "titovstroy-podryads-backups";
export const MASTERS_KEY         = "titovstroy-masters";          // справочник мастеров с naimi.kz (пишет парсер, читаем только на чтение)
export const MASTERS_CONFIG_KEY  = "titovstroy-masters-config";   // настройки парсера (частота, «Обновить сейчас») — редактирует Админ, читает парсер
export const MASTERS_OLX_KEY        = "titovstroy-masters-olx";       // справочник мастеров с OLX.kz (второй источник, пишет отдельный парсер)
export const MASTERS_OLX_CONFIG_KEY = "titovstroy-masters-olx-config";// настройки OLX-парсера
export const MASTERS_CRM_KEY        = "titovstroy-masters-crm-v1";    // собственная база и история взаимодействий; парсеры этот ключ не меняют
export const WORKSPACE_BACKUPS_KEY = "titovstroy-workspace-backups";
export const DEALS_KEY          = "titovstroy-deals";
export const DEALS_BACKUPS_KEY  = "titovstroy-deals-backups";
export const STORAGE_KEY        = "titovstroy-estimates";
export const BACKUPS_KEY        = "titovstroy-estimates-backups"; // снимки архива для восстановления
export const USERS_KEY          = "titovstroy-users";
export const USERS_BACKUPS_KEY  = "titovstroy-users-backups";
export const ROLE_PERMISSIONS_KEY = "titovstroy-role-permissions";
export const ROLE_PERMISSIONS_BACKUPS_KEY = "titovstroy-role-permissions-backups";
export const SESSION_KEY        = "titovstroy-session";
export const PRESENCE_KEY       = "titovstroy-presence"; // { [userId]: lastSeenTs } — кто когда был онлайн
export const PRICES_KEY         = "titovstroy-prices";  // переопределённые цены {code: {fixedPrice?, tiers?}}
export const PRICES_BACKUPS_KEY = "titovstroy-prices-backups"; // ОТДЕЛЬНО от каталога: цены — объект другого формата
export const PUBLIC_NODES_BACKUPS_KEY = "titovstroy-public-nodes-backups"; // пред-бэкап публичных нод (КП/кабинеты) перед restore
export const CATALOG_BACKUPS_KEY= "titovstroy-catalog-backups"; // снимки каталога (последние 10)
export const CONTRACTS_BACKUPS_KEY = "titovstroy-contracts-backups";
export const CLIENTS_BACKUPS_KEY   = "titovstroy-clients-backups";
export const CONTRAGENTS_BACKUPS_KEY = "titovstroy-contragents-backups";
export const CATALOG_KEY    = "titovstroy-catalog";
export const CONTRACTS_KEY  = "titovstroy-contracts";
export const CLIENTS_KEY    = "titovstroy-clients";
export const CONTRAGENTS_KEY= "titovstroy-contragents";
export const AUDIT_KEY               = "titovstroy-audit";             // ЛЕГАСИ-журнал (архив, только чтение)
export const AUDIT_INDEX_KEY         = "titovstroy-audit-index";       // список месяцев ["2026-07", ...] (какие помесячные ключи есть)
export const AUDIT_MONTH_KEY         = (ym) => "titovstroy-audit-" + ym; // помесячный журнал (без лимита записей)
export const FINANCE_TX_KEY          = "titovstroy-finance-tx";        // массив транзакций
export const FINANCE_TX_BACKUPS_KEY  = "titovstroy-finance-tx-backups";
export const FINANCE_META_KEY        = "titovstroy-finance-meta";      // {accounts, income, expense}
export const FINANCE_META_BACKUPS_KEY= "titovstroy-finance-meta-backups";
export const FINANCE_PROJECTS_KEY         = "titovstroy-finance-projects";   // массив проектов
export const FINANCE_PROJECTS_BACKUPS_KEY = "titovstroy-finance-projects-backups";
export const LOGIN_ATTEMPTS_KEY = "titovstroy-login-attempts";
// ── УВЕДОМЛЕНИЯ В TELEGRAM ───────────────────────────────────────────────────
// Три узла, все новые. Настройки пишет Админка; привязки и состояние рассылки —
// ТОЛЬКО служба уведомлений (GitHub Actions). Приложение их лишь читает, чтобы
// показать «подключён / не подключён».
export const TG_SETTINGS_KEY = "titovstroy-tg-settings"; // общий чат, часы тишины, включение
export const TG_LINKS_KEY    = "titovstroy-tg-links";    // { [userId]: {chatId, tgName, ts} }
export const TG_STATE_KEY    = "titovstroy-tg-state";    // курсор журнала и защита от повторов

// Оформление компании: название, логотип, цвет, WhatsApp, печать (см. brand.js).
// Реквизитов здесь НЕТ — они в карточках контрагентов, оттуда же их берут
// договоры. Узел читают и публичные страницы клиента, поэтому в правилах базы
// он открыт на чтение всем вошедшим и на запись — только админу.
export const BRAND_KEY = "titovstroy-brand";
