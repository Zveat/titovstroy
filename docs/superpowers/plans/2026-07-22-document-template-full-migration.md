# Full Document Template Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перенести в Центр шаблонов все действующие договоры, приложения, дополнительные соглашения, договоры подряда и АВР без изменения юридического текста и без записи в существующие рабочие сущности.

**Architecture:** Новый реестр документов в `src/documents/` описывает каждый тип, его legacy-рендерер, автополя, контекст данных и допустимые экспорты. Универсальный импортёр преобразует HTML действующего генератора в TipTap JSON, заменяя уникальные маркеры на защищённые поля; публикация допускается только после автоматического сравнения с тем же legacy-генератором и ручного подтверждения. Новый экспорт включается по типам и всегда сохраняет неизменяемый снимок; существующие документы остаются на legacy-пути.

**Tech Stack:** React 18, TipTap 3.28, Firebase Realtime Database 10.7, Vitest 3.2, существующие PDF/Google Docs/DOCX адаптеры.

## Global Constraints

- Юридический текст, нумерация, таблицы, реквизиты и смысл существующих документов не изменяются ни на один символ намеренно.
- Объекты, сметы, договоры, АВР, финансы, клиенты, подрядчики и production-карточки не мигрируются и не перезаписываются.
- Миграция пишет только в `titovstroy-document-templates-v1` и связанные template backup/audit keys.
- Старый генератор остаётся резервным для существующих документов и любого типа, не прошедшего проверку.
- Excel-сметы остаются на текущем структурированном экспорте.

---

### Task 1: Реестр типов и защищённых полей

**Files:**
- Create: `titovstroy/src/documents/documentTypeRegistry.js`
- Create: `titovstroy/src/documents/documentTypeRegistry.test.js`
- Modify: `titovstroy/src/documents/autofields.js`

- [ ] Написать падающие тесты полного реестра восьми типов и уникальности ID.
- [ ] Реализовать метаданные типов, обязательные поля и feature flags.
- [ ] Добавить недостающие поля договора, приложения, дизайна, брони, подряда и АВР.
- [ ] Запустить тесты реестра и автополей.

### Task 2: Универсальный дословный импорт legacy HTML

**Files:**
- Create: `titovstroy/src/documents/legacyTemplateImporter.js`
- Create: `titovstroy/src/documents/legacyTemplateImporter.test.js`
- Modify: `titovstroy/src/documents/repairLegacySeed.js`

- [ ] Написать падающие тесты замены повторяющихся маркеров, таблиц, подписей и разрывов страниц.
- [ ] Вынести текущий безопасный HTML parser в универсальный импортёр.
- [ ] Оставить repair seed совместимым фасадом поверх универсального импортёра.
- [ ] Проверить, что импорт не нормализует и не исправляет текст.

### Task 3: Контексты данных и сравнение каждого типа

**Files:**
- Create: `titovstroy/src/documents/documentContexts.js`
- Create: `titovstroy/src/documents/documentContexts.test.js`
- Create: `titovstroy/src/documents/legacyTemplateCatalog.js`
- Create: `titovstroy/src/documents/legacyTemplateCatalog.test.js`

- [ ] Написать падающие тесты точного связывания по `objectId`, `contract.id`, `workerId` и `report.id` без поиска по имени.
- [ ] Реализовать контексты восьми типов и точные сообщения о недостающих данных.
- [ ] Создать каталожные seed-входы с уникальными маркерами для каждого динамического значения.
- [ ] Добавить parity-проверку rendered template против действующего legacy HTML.

### Task 4: Транзакционный импорт полного каталога

**Files:**
- Modify: `titovstroy/src/documents/templateRepository.js`
- Modify: `titovstroy/src/documents/documentTemplateService.js`
- Modify: `titovstroy/src/documents/templateRepository.test.js`
- Create: `titovstroy/src/documents/documentTemplateService.test.js`

- [ ] Написать падающий тест all-or-nothing импорта и повторной идемпотентной загрузки.
- [ ] Добавить одну транзакцию, создающую только отсутствующие legacy-шаблоны.
- [ ] Запретить перезапись пользовательских черновиков и опубликованных версий.
- [ ] Записать результат импорта в audit log.

### Task 5: Полный интерфейс Центра шаблонов

**Files:**
- Modify: `titovstroy/src/documents/TemplateCenter.jsx`
- Modify: `titovstroy/src/documents/TemplateEditor.jsx`
- Modify: `titovstroy/src/documents/documentTemplates.css`

- [ ] Показать полный реестр, состояние импорта и действие `Импортировать действующие шаблоны`.
- [ ] Сделать выбор тестового объекта/договора/акта зависимым от типа.
- [ ] Показывать список обязательных полей и точный отчёт parity до публикации.
- [ ] Сохранить визуальный язык существующей Админки и компактную компоновку.

### Task 6: Универсальная маршрутизация экспорта

**Files:**
- Modify: `titovstroy/src/documents/documentExportRouter.js`
- Modify: `titovstroy/src/documents/documentTemplateRuntime.js`
- Modify: `titovstroy/src/documents/documentSnapshots.js`
- Modify: `titovstroy/src/documents/documentExportRouter.test.js`
- Modify: `titovstroy/src/documents/documentSnapshots.test.js`

- [ ] Написать падающие тесты новых документов, старых документов, отсутствующего шаблона и повреждённого снимка.
- [ ] Маршрутизировать по типу и feature flag, сохраняя immutable snapshot.
- [ ] Для существующих документов всегда оставлять legacy путь.
- [ ] Поддержать PDF, Google Docs и DOCX из одного канонического снимка.

### Task 7: Минимальная интеграция с App

**Files:**
- Modify: `titovstroy/src/App.jsx`
- Modify: `titovstroy/src/documents/DocumentTemplateAdminRoute.jsx`

- [ ] Передать в runtime рендереры договора, подряда и АВР как callbacks.
- [ ] Передать workers, reports и остальные read-only данные для предпросмотра.
- [ ] Не переносить редактор, seed-каталог или юридический текст в `App.jsx`.
- [ ] Проверить отсутствие записей в ключи рабочих сущностей.

### Task 8: Полная проверка и выпуск без риска

**Files:**
- Create: `docs/superpowers/verification/2026-07-22-document-template-full-migration.md`

- [ ] Запустить все Vitest тесты.
- [ ] Собрать production bundle.
- [ ] Сравнить нормализованный текст каждого типа со старым генератором на marker fixture.
- [ ] Проверить, что export flags по умолчанию выключены.
- [ ] Проверить git diff на отсутствие изменений юридических строк в `App.jsx`.
- [ ] Зафиксировать ручной чек-лист Preview перед включением каждого типа.
