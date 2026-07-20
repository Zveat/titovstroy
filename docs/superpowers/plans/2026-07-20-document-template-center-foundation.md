# Document Template Center Foundation and Repair Contract Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить в Админку безопасный центр редактируемых шаблонов и подготовить договор ремонта как первый пилот, не изменяя существующие документы и не включая новый генератор в production до отдельной приёмки.

**Architecture:** Вся новая функциональность живёт в изолированном модуле `src/documents/`; `App.jsx` не содержит редактор, модель, репозиторий, рендер, шаблонные ключи или export-routing, а только импортирует один фасад, монтирует один экран и передаёт существующий legacy-renderer как callback. Шаблоны и снимки документов хранятся в новых Firebase-ключах как JSON-массивы и публикуются атомарными транзакциями. Пилот договора ремонта создаётся из вывода действующего генератора, проходит автоматическое сравнение, а затем может быть включён только флагом `VITE_DOCUMENT_TEMPLATES_REPAIR_ON=1`; при любом сомнении остаётся текущий генератор.

**Tech Stack:** React 18.2, Vite 5, Vitest 3.2, Firebase Realtime Database 10.7, `docx` 7.8.2, TipTap/ProseMirror 3.28.0, существующие Google Drive HTML upload и browser print/PDF.

## Global Constraints

- Юридический текст первичного шаблона переносится дословно из действующего генератора; запрещены сокращения, исправления, перефразирование, изменение нумерации, условий, таблиц и реквизитов.
- Нельзя автоматически менять существующие объекты, сметы, договоры, дополнительные соглашения, АВР, финансы, клиентов, подрядчиков, производственные карточки или ранее созданные документы.
- Новые Firebase-ключи не используются существующими загрузчиками рабочих сущностей.
- Новый код центра шаблонов запрещено размещать внутри `App.jsx`; допустимы только короткие import, props и вызов публичного фасада модуля.
- `main` и production-база не используются для разработки и приёмки; проверка идёт в Preview с копией production-базы.
- Feature flag `VITE_DOCUMENT_TEMPLATES_REPAIR_ON` имеет безопасное значение по умолчанию `0`.
- Контракт, созданный раньше публикации пилотной версии, всегда остаётся на legacy-генераторе.
- Если шаблон, снимок, обязательное автополе или облачная запись не подтверждены, новый генератор не создаёт документ молча.
- Excel-выгрузка смет не меняется.
- Untracked `.superpowers/`, `titovstroy/dist/` и `titovstroy/node_modules/` не добавляются в git.
- Каждый коммит должен проходить указанный в своей задаче тест и не включать изменения вне перечисленных файлов.

---

## Scope of This Plan

Этот план выпускает законченную основу и один выключенный по умолчанию пилот `repair_fiz`. Дополнительные соглашения, дизайн, бронь, подряд и АВР остаются на действующих генераторах и получают отдельные планы только после приёмки пилота. Удаление юридического текста из `App.jsx` в этот план не входит.

## File Map

**Новые файлы**

- `titovstroy/src/documents/templateModel.js` — схема данных, нормализация, жизненный цикл черновика и опубликованных версий.
- `titovstroy/src/documents/templateModel.test.js` — тесты неизменяемости, публикации, отката и архива.
- `titovstroy/src/documents/autofields.js` — реестр защищённых полей и сбор данных договора ремонта/предпросмотра из переданных массивов.
- `titovstroy/src/documents/autofields.test.js` — тесты обязательных значений и таблицы работ.
- `titovstroy/src/documents/editorExtensions.js` — TipTap-схема, атомарные `protectedField`, `dataTable`, `pageBreak`.
- `titovstroy/src/documents/templateRender.js` — безопасный рендер JSON в канонический HTML и сравнение с legacy HTML.
- `titovstroy/src/documents/templateRender.test.js` — тесты экранирования, порядка и parity-report.
- `titovstroy/src/documents/templateRepository.js` — адаптер чтения и атомарных изменений через существующий `storage`.
- `titovstroy/src/documents/templateRepository.test.js` — тесты транзакционных команд на fake storage.
- `titovstroy/src/documents/documentTemplateKeys.js` — все Firebase-ключи и feature flags нового блока.
- `titovstroy/src/documents/documentTemplateBackup.js` — секции и глубокая проверка бэкапа нового блока.
- `titovstroy/src/documents/documentTemplateService.js` — единый фасад, который связывает repository, snapshots, audit и exports.
- `titovstroy/src/documents/documentExportRouter.js` — выбор legacy/template пути без разрастания `App.jsx`.
- `titovstroy/src/documents/repairLegacySeed.js` — sentinel-импорт действующего договора ремонта без ручного переписывания юридического текста.
- `titovstroy/src/documents/repairLegacySeed.test.js` — тесты замены sentinels и таблицы работ.
- `titovstroy/src/documents/documentSnapshots.js` — создание неизменяемого снимка и индивидуальных версий документа.
- `titovstroy/src/documents/documentSnapshots.test.js` — тесты legacy cutoff, повторного экспорта и редактирования экземпляра.
- `titovstroy/src/documents/exportAdapters.js` — PDF/GDoc/DOCX из одного канонического представления.
- `titovstroy/src/documents/exportAdapters.test.js` — тест единого входа и соответствия текстового содержания.
- `titovstroy/src/documents/TemplateCenter.jsx` — библиотека шаблонов, история, предпросмотр и публикация.
- `titovstroy/src/documents/TemplateEditor.jsx` — A4-редактор и панель защищённых полей.
- `titovstroy/src/documents/DocumentInstanceEditor.jsx` — индивидуальное редактирование нового снимка.
- `titovstroy/src/documents/documentTemplates.css` — стили в визуальном языке существующей Админки.

**Изменяемые файлы**

- `titovstroy/package.json` и `titovstroy/package-lock.json` — фиксированные зависимости TipTap 3.28.0.
- `titovstroy/src/utils.js` и `titovstroy/src/utils.test.js` — шесть новых прав и строгая валидация разделов бэкапа.
- `titovstroy/src/App.jsx` — только импорт фасада, один Admin render-slot, передача существующего `storage/logChange/buildContractHtml` и вызов export-router.
- `titovstroy/.env.example` — безопасный флаг пилота.

---

### Task 1: Domain Model and Fixed Editor Dependencies

**Files:**
- Create: `titovstroy/src/documents/templateModel.js`
- Create: `titovstroy/src/documents/templateModel.test.js`
- Modify: `titovstroy/package.json`
- Modify: `titovstroy/package-lock.json`

**Interfaces:**
- Produces: `emptyTemplateStore()`, `normalizeTemplateStore(value)`, `createTemplate(store, input, actor, now)`, `copyTemplate(store, sourceTemplateId, input, actor, now)`, `saveTemplateDraft(store, templateId, contentJson, actor, now)`, `publishTemplateDraft(store, templateId, publication, actor, now)`, `activateTemplateVersion(store, templateId, versionId, actor, now)`, `archiveTemplate(store, templateId, actor, now)`, `getActiveTemplateVersion(store, type)`, `validateTemplateContent(contentJson, requiredFieldIds)`.
- Data shape: `TemplateStore = { schemaVersion:1, templates:Array<TemplateRecord> }` serialized as a one-element list `[TemplateStore]` for compatibility with `storage.mutateTransaction`.

- [ ] **Step 1: Install fixed TipTap packages and preserve the lockfile**

Run:

```bash
cd titovstroy
npm install --save-exact @tiptap/core@3.28.0 @tiptap/react@3.28.0 @tiptap/pm@3.28.0 @tiptap/starter-kit@3.28.0 @tiptap/extension-table@3.28.0 @tiptap/extension-text-align@3.28.0 @tiptap/extension-text-style@3.28.0
```

Expected: `package.json` and `package-lock.json` change; `npm ls @tiptap/react @tiptap/core` reports `3.28.0` without peer-dependency errors.

- [ ] **Step 2: Write failing lifecycle tests**

Create tests with fixed actors/timestamps. The core assertions must be:

```js
it("draft does not change the active version", () => {
  const first = publishTemplateDraft(seedWithDraft(), "repair", publication("v1"), ACTOR, 100);
  const edited = saveTemplateDraft(first.store, "repair", doc("draft-v2"), ACTOR, 200);
  expect(getActiveTemplateVersion(edited.store, "repair_fiz").contentJson).toEqual(doc("v1"));
});

it("publish appends an immutable version and rollback only changes activeVersionId", () => {
  const v1 = publishTemplateDraft(seedWithDraft(), "repair", publication("v1"), ACTOR, 100).store;
  const withDraft = saveTemplateDraft(v1, "repair", doc("v2"), ACTOR, 200).store;
  const v2 = publishTemplateDraft(withDraft, "repair", publication("v2"), ACTOR, 300).store;
  const rolled = activateTemplateVersion(v2, "repair", "repair:v1", ACTOR, 400).store;
  expect(rolled.templates[0].versions).toHaveLength(2);
  expect(rolled.templates[0].activeVersionId).toBe("repair:v1");
  expect(rolled.templates[0].versions[1].contentJson).toEqual(doc("v2"));
});

it("copy creates a new draft without sharing version arrays", () => {
  const copied = copyTemplate(publishedStore(), "repair", { id:"repair-copy", name:"Копия" }, ACTOR, 500);
  expect(copied.store.templates).toHaveLength(2);
  expect(copied.value.activeVersionId).toBe(null);
  expect(copied.value.versions).toEqual([]);
  expect(copied.value.draft.contentJson).toEqual(getActiveTemplateVersion(publishedStore(), "repair_fiz").contentJson);
});
```

- [ ] **Step 3: Run the model test and confirm it fails**

Run: `cd titovstroy && npx vitest run src/documents/templateModel.test.js`

Expected: FAIL because `templateModel.js` exports do not exist.

- [ ] **Step 4: Implement the model with explicit result objects**

Every mutation returns `{ ok, store, value?, reason? }` and clones nested records before editing. `publishTemplateDraft` must reject missing draft, failed validation, missing `parityReport.ok`, or missing `manualLegalReview === true` when `template.source === "legacy-repair"`.

Use these stable identifiers:

```js
export const TEMPLATE_SCHEMA_VERSION = 1;
export const TEMPLATE_STATUSES = Object.freeze(["draft", "published", "archived"]);

export function versionId(templateId, versionNumber) {
  return `${templateId}:v${versionNumber}`;
}

export function validateTemplateContent(contentJson, requiredFieldIds = []) {
  if (!contentJson || contentJson.type !== "doc" || !Array.isArray(contentJson.content)) {
    return { ok:false, errors:["contentJson должен быть документом TipTap"] };
  }
  const found = new Set();
  walkTemplate(contentJson, node => {
    if (node.type === "protectedField" || node.type === "dataTable") found.add(node.attrs?.fieldId);
  });
  const missing = requiredFieldIds.filter(id => !found.has(id));
  return missing.length ? { ok:false, errors:missing.map(id => `Нет обязательного поля: ${id}`) } : { ok:true, errors:[] };
}
```

Published version fields are exactly: `id`, `templateId`, `versionNumber`, `contentJson`, `normalizedText`, `fieldIds`, `page`, `checksum`, `publishedAt`, `publishedBy`, `previousVersionId`, `parityReport`, `exportChecks`.

- [ ] **Step 5: Run focused and full tests**

Run:

```bash
cd titovstroy
npx vitest run src/documents/templateModel.test.js
npm test
```

Expected: focused tests PASS; the existing suite remains green.

- [ ] **Step 6: Commit the model boundary**

```bash
git add titovstroy/package.json titovstroy/package-lock.json titovstroy/src/documents/templateModel.js titovstroy/src/documents/templateModel.test.js
git commit -m "Add document template domain model"
```

---

### Task 2: Protected Autofield Registry and Repair Contract Resolver

**Files:**
- Create: `titovstroy/src/documents/autofields.js`
- Create: `titovstroy/src/documents/autofields.test.js`

**Interfaces:**
- Consumes: contract/client/contragent/object/estimate values already loaded by `MainApp`.
- Produces: `AUTOFIELD_DEFINITIONS`, `requiredFieldIdsForType(type)`, `buildRepairPreviewContext({ objectId, objects, contracts, estimates, clients, contragents })`, `resolveRepairContractVariables(context)`, `validateResolvedVariables(result)`, `formatRepairWorksTable(works, discount)`.
- `resolveRepairContractVariables` returns `{ ok, values, missing, warnings }`; it never mutates input objects.

- [ ] **Step 1: Write failing tests for scalar fields, missing values, and work rows**

Include at least these assertions:

```js
expect(resolveRepairContractVariables(FIXTURE).values["contract.number"]).toBe("1019");
expect(resolveRepairContractVariables(FIXTURE).values["client.iin"]).toBe("900101300000");
expect(resolveRepairContractVariables(FIXTURE).values["company.bin"]).toBe("231040002769");
expect(resolveRepairContractVariables(FIXTURE).values["estimate.worksTable"].rows[0]).toMatchObject({
  name:"Штукатурка стен", unit:"м²", quantity:10, price:5000, sum:50000,
});
expect(resolveRepairContractVariables({ ...FIXTURE, client:{...FIXTURE.client, iin:""} }).missing)
  .toContainEqual({ fieldId:"client.iin", label:"ИИН клиента" });
```

- [ ] **Step 2: Verify red**

Run: `cd titovstroy && npx vitest run src/documents/autofields.test.js`

Expected: FAIL because the resolver does not exist.

- [ ] **Step 3: Implement a closed registry**

Define every field as data, not executable user content:

```js
export const AUTOFIELD_DEFINITIONS = Object.freeze([
  { id:"client.name", group:"Клиент", label:"ФИО / наименование", kind:"text", requiredFor:["repair_fiz"] },
  { id:"client.iin", group:"Клиент", label:"ИИН / БИН", kind:"text", requiredFor:["repair_fiz"] },
  { id:"client.phone", group:"Клиент", label:"Телефон", kind:"text", requiredFor:[] },
  { id:"object.id", group:"Объект", label:"ID объекта", kind:"text", requiredFor:["repair_fiz"] },
  { id:"object.address", group:"Объект", label:"Адрес объекта", kind:"text", requiredFor:["repair_fiz"] },
  { id:"contract.number", group:"Договор", label:"Номер договора", kind:"text", requiredFor:["repair_fiz"] },
  { id:"contract.date", group:"Договор", label:"Дата договора", kind:"date", requiredFor:["repair_fiz"] },
  { id:"contract.total", group:"Договор", label:"Сумма договора", kind:"money", requiredFor:["repair_fiz"] },
  { id:"estimate.worksTable", group:"Смета", label:"Таблица работ", kind:"table", requiredFor:["repair_fiz"] },
  { id:"company.name", group:"Компания", label:"Наименование подрядчика", kind:"text", requiredFor:["repair_fiz"] },
  { id:"company.bin", group:"Компания", label:"БИН подрядчика", kind:"text", requiredFor:["repair_fiz"] },
  { id:"company.bank", group:"Компания", label:"Банк", kind:"text", requiredFor:["repair_fiz"] },
  { id:"company.bik", group:"Компания", label:"БИК", kind:"text", requiredFor:["repair_fiz"] },
  { id:"company.account", group:"Компания", label:"Счёт", kind:"text", requiredFor:["repair_fiz"] },
  { id:"company.director", group:"Компания", label:"Директор", kind:"text", requiredFor:["repair_fiz"] },
]);
```

Add every scalar currently interpolated by the `repair_fiz` branch before parity work begins. Unknown field IDs are errors, never plain text fallbacks.

`buildRepairPreviewContext` selects one non-deleted object by exact `objectId`, its newest root estimate, newest `repair_fiz` contract, referenced client and contragent. Ambiguous or missing links return `{ ok:false, reason, candidates }`; matching by client name is forbidden.

- [ ] **Step 4: Run focused and full tests, then commit**

Run: `cd titovstroy && npx vitest run src/documents/autofields.test.js && npm test`

Expected: PASS.

```bash
git add titovstroy/src/documents/autofields.js titovstroy/src/documents/autofields.test.js
git commit -m "Add protected document autofields"
```

---

### Task 3: TipTap Schema and Safe Canonical Renderer

**Files:**
- Create: `titovstroy/src/documents/editorExtensions.js`
- Create: `titovstroy/src/documents/templateRender.js`
- Create: `titovstroy/src/documents/templateRender.test.js`

**Interfaces:**
- Consumes: TipTap JSON and resolved variables from Task 2.
- Produces: `createTemplateExtensions({ editable })`, `renderTemplateToCanonicalHtml({ contentJson, variables, page })`, `extractTemplateFieldIds(contentJson)`, `normalizeLegalText(html)`, `compareCanonicalDocuments(legacyHtml, templateHtml)`.
- Custom nodes: `protectedField` is inline/atom; `dataTable` and `pageBreak` are block/atom.

- [ ] **Step 1: Write failing security and parity tests**

Tests must prove:

```js
expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
expect(html).not.toContain("<script>");
expect(html).not.toContain("onclick=");
expect(extractTemplateFieldIds(docWithField("client.name"))).toEqual(["client.name"]);
expect(() => renderTemplateToCanonicalHtml({
  contentJson:docWithField("unknown.field"), variables:{}, page:DEFAULT_PAGE,
})).toThrow(/unknown.field/);
expect(compareCanonicalDocuments("<p>1. Текст</p>", "<p>1. Текст</p>").ok).toBe(true);
expect(compareCanonicalDocuments("<p>1. Текст</p>", "<p>1. Другой текст</p>").ok).toBe(false);
```

- [ ] **Step 2: Verify red**

Run: `cd titovstroy && npx vitest run src/documents/templateRender.test.js`

Expected: FAIL on missing renderer exports.

- [ ] **Step 3: Implement atom nodes with locked attributes**

`protectedField` only accepts a `fieldId` present in `AUTOFIELD_DEFINITIONS`; its React node view renders a chip and never a `contentDOM`. `dataTable` only accepts a table field. `parseHTML` ignores inline styles outside the allowlist; `renderHTML` writes only `data-field-id`.

The renderer must build a fresh DOM/string from the JSON tree. It must not pass stored arbitrary HTML into `innerHTML`. Allowed marks are `bold`, `italic`, `underline`, `textStyle` with allowlisted font/size, and alignment `left|center|right|justify`. Page defaults:

```js
export const DEFAULT_PAGE = Object.freeze({
  size:"A4", marginTopMm:20, marginRightMm:15, marginBottomMm:20, marginLeftMm:30,
  fontFamily:"Times New Roman", fontSizePt:11,
});
```

- [ ] **Step 4: Implement structural parity report**

Return this exact result shape:

```js
{
  ok: textEqual && paragraphsEqual && tablesEqual,
  textEqual,
  paragraphsEqual,
  tablesEqual,
  legacyText,
  candidateText,
  firstDifference: { kind, index, legacy, candidate } | null,
}
```

Whitespace normalization may collapse runs of spaces and line endings only. It must not lowercase text, remove punctuation, reorder paragraphs, or normalize spelling.

- [ ] **Step 5: Run tests and commit**

Run: `cd titovstroy && npx vitest run src/documents/templateRender.test.js && npm test`

Expected: PASS.

```bash
git add titovstroy/src/documents/editorExtensions.js titovstroy/src/documents/templateRender.js titovstroy/src/documents/templateRender.test.js
git commit -m "Add safe document template renderer"
```

---

### Task 4: Transactional Template Repository

**Files:**
- Create: `titovstroy/src/documents/templateRepository.js`
- Create: `titovstroy/src/documents/templateRepository.test.js`
- Create: `titovstroy/src/documents/documentTemplateKeys.js`
- Create: `titovstroy/src/documents/documentTemplateService.js`

**Interfaces:**
- Consumes: `storage.getResult`, `storage.mutateTransaction`, model commands from Task 1.
- Produces: `createTemplateRepository({ storage, templatesKey, snapshotsKey })` with methods `loadTemplates()`, `createTemplate()`, `copyTemplate()`, `saveDraft()`, `publish()`, `rollback()`, `archive()`, `loadSnapshots()`, `mutateSnapshots(mutator)`.
- Produces: `createDocumentTemplateService({ storage, actor, audit, legacyRepairRenderer })`; это единственный объект, который импортирует и использует `App.jsx`.
- Firebase values remain JSON strings containing arrays. Templates key contains `[TemplateStore]`; snapshots key contains `Array<DocumentSnapshot>`.

- [ ] **Step 1: Write failing fake-storage tests**

Cover cold/empty reads, corrupt JSON, transaction failure, simultaneous publish, and no local success claim:

```js
const repo = createTemplateRepository({ storage:fakeStorage(), templatesKey:"templates", snapshotsKey:"snapshots" });
expect((await repo.loadTemplates()).status).toBe("empty");
expect((await repo.publish("repair", publication, ACTOR, 100)).ok).toBe(true);
expect((await repo.publish("repair", publication, ACTOR, 100)).reason).toMatch(/draft|version/);
expect((await createTemplateRepository({ storage:failingStorage() }).saveDraft("repair", DOC, ACTOR, 100)).ok).toBe(false);
```

- [ ] **Step 2: Verify red**

Run: `cd titovstroy && npx vitest run src/documents/templateRepository.test.js`

Expected: FAIL because the repository is absent.

- [ ] **Step 3: Implement repository commands as one transaction each**

Use this adapter pattern so all state decisions run against the freshest Firebase value:

```js
async function transactTemplates(command) {
  let outcome = { ok:false, reason:"not-run" };
  const tx = await storage.mutateTransaction(templatesKey, list => {
    const store = normalizeTemplateStore(list[0]);
    outcome = command(store);
    return outcome.ok ? [outcome.store] : undefined;
  });
  return tx.committed && outcome.ok
    ? { ...outcome, committed:true }
    : { ok:false, committed:false, reason:outcome.reason || tx.reason || "transaction-failed" };
}
```

Do not use `storage.set` for publish/rollback/archive. A failed transaction does not alter React state.

`documentTemplateKeys.js` экспортирует только:

```js
export const DOCUMENT_TEMPLATES_KEY = "titovstroy-document-templates-v1";
export const DOCUMENT_TEMPLATES_BACKUPS_KEY = "titovstroy-document-templates-v1-backups";
export const DOCUMENT_SNAPSHOTS_KEY = "titovstroy-document-snapshots-v1";
export const DOCUMENT_SNAPSHOTS_BACKUPS_KEY = "titovstroy-document-snapshots-v1-backups";
export const REPAIR_TEMPLATE_ENABLED = import.meta.env.VITE_DOCUMENT_TEMPLATES_REPAIR_ON === "1";
```

- [ ] **Step 4: Run tests and commit**

Run: `cd titovstroy && npx vitest run src/documents/templateRepository.test.js && npm test`

Expected: PASS.

```bash
git add titovstroy/src/documents/templateRepository.js titovstroy/src/documents/templateRepository.test.js titovstroy/src/documents/documentTemplateKeys.js titovstroy/src/documents/documentTemplateService.js
git commit -m "Add transactional template repository"
```

---

### Task 5: Permissions, Audit and Backup Safety

**Files:**
- Create: `titovstroy/src/documents/documentTemplateBackup.js`
- Modify: `titovstroy/src/utils.js:147-354`
- Modify: `titovstroy/src/utils.test.js:1-130,277-340`
- Modify: `titovstroy/src/App.jsx:798-842,979-1050,5017-5035,7517-7794`

**Interfaces:**
- Produces permissions: `templateView`, `templateEdit`, `templatePublish`, `templateRollback`, `templateArchive`, `documentInstanceEdit`.
- Consumes keys from `documentTemplateKeys.js`; `App.jsx` не объявляет эти строки повторно.
- Backup sections: `documentTemplates`, `documentSnapshots`.

- [ ] **Step 1: Write failing permission and backup-schema tests**

Assertions:

```js
expect(permissionsForRole({}, "admin").templatePublish).toBe("all");
expect(permissionsForRole({}, "manager").templateView).toBe("none");
expect(permissionsForRole({}, "user").documentInstanceEdit).toBe("none");
expect(validateBackupSchema(backupWithTemplates(), SPECS).ok).toBe(true);
expect(validateBackupSchema(backupWithTemplates([{ id:"t1", versions:"broken" }]), SPECS).ok).toBe(false);
expect(validateBackupSchema(backupWithSnapshots([{ documentId:"d1", contentSnapshot:null }]), SPECS).ok).toBe(false);
```

- [ ] **Step 2: Verify red**

Run: `cd titovstroy && npx vitest run src/utils.test.js`

Expected: FAIL because new permission keys and deep validators are absent.

- [ ] **Step 3: Add secure defaults without migrating saved matrices**

Add all six keys to `FULL_ADMIN_ACCESS` with `"all"`. Add them to `SCOPE_KEYS`. Every non-admin preset receives `"none"`. `normalizeRolePermissions` must keep admin full and fill absent saved values from role defaults.

Add a compact `Шаблоны и экземпляры` group to `RolePermissionsEditor`; do not add six full-width rows to the section overview. The matrix cell opens a small popover containing the six scopes, matching the existing compact permission design.

- [ ] **Step 4: Add strict template/snapshot backup validation**

Extend `validateBackupSchema` with optional `itemValidator` in `arraySpecs`:

```js
const error = spec.itemValidator?.(it, i);
if (error) return { ok:false, error:`раздел «${key}»: ${error}` };
```

Provide exported validators `validateTemplateBackupItem(item)` and `validateSnapshotBackupItem(item)`; require IDs, schema version, valid arrays, immutable version IDs, valid TipTap documents, and snapshot `documentId/objectId/templateVersionId`.

- [ ] **Step 5: Add cloud-verified export and guarded restore**

`documentTemplateBackup.js` exports `DOCUMENT_TEMPLATE_BACKUP_SECTIONS`, `documentTemplateBackupSpecs()` and `restoreDocumentTemplateSections({ data, has, restoreKey })`. `App.jsx` добавляет `...DOCUMENT_TEMPLATE_BACKUP_SECTIONS` в `_backupSections` и вызывает один restore helper; детальная логика нового раздела не размещается в `App.jsx`. Restore uses the existing `restoreKey`, which first creates a confirmed cloud pre-backup and then uses `setCloudOnly`. Do not place template values in `objects`, `contracts` or `reports`.

Log actions through existing `logChange` with `entity:"document_template"` or `entity:"document_snapshot"` and actions `создал шаблон`, `изменил черновик`, `опубликовал версию`, `откатил версию`, `архивировал шаблон`, `изменил экземпляр документа`, `ошибка проверки шаблона`.

- [ ] **Step 6: Run tests and commit**

Run: `cd titovstroy && npx vitest run src/utils.test.js && npm test && npm run build`

Expected: all tests PASS and Vite build succeeds.

```bash
git add titovstroy/src/utils.js titovstroy/src/utils.test.js titovstroy/src/documents/documentTemplateBackup.js titovstroy/src/App.jsx
git commit -m "Protect template permissions and backups"
```

---

### Task 6: Template Library and Word-like Editor UI

**Files:**
- Create: `titovstroy/src/documents/TemplateCenter.jsx`
- Create: `titovstroy/src/documents/TemplateEditor.jsx`
- Create: `titovstroy/src/documents/DocumentTemplateAdminRoute.jsx`
- Create: `titovstroy/src/documents/documentTemplates.css`
- Modify: `titovstroy/src/App.jsx:2508-2820,15005-15043`

**Interfaces:**
- `DocumentTemplateAdminRoute({ service, permissions, data })` is the only UI component mounted by `App.jsx`; `data` is `{ objects, contracts, estimates, clients, contragents }`.
- `TemplateCenter({ service, permissions, data })` consumes `buildRepairPreviewContext` from `autofields.js` internally.
- `TemplateEditor({ template, contentJson, onChange, onSaveDraft, onPreview, onPublish, readOnly })`.
- UI state never writes on keystroke; it keeps a local draft and saves only on explicit `Сохранить черновик` or debounced recovery copy owned by the template module.

- [ ] **Step 1: Add pure UI-state tests to `templateModel.test.js`**

Test `filterTemplates(templates, { query, category, status })` and `buildTemplateActions(template, permissions)` so hidden actions cannot be reached by UI state. Expected admin actions: open/copy/archive/history; viewer only open.

- [ ] **Step 2: Verify red and implement the view-model helpers**

Run: `cd titovstroy && npx vitest run src/documents/templateModel.test.js`

Expected: FAIL, then PASS after adding helpers to `templateModel.js`.

- [ ] **Step 3: Build the library screen matching the approved Figma and existing Admin styling**

Add `Шаблоны документов` to `allowedAdminTabs` only when `accessAllows(permissions.templateView)`. The tab body in `App.jsx` is exactly `<DocumentTemplateAdminRoute service={documentTemplateService} permissions={permissions} data={{ objects, contracts, estimates, clients, contragents }} />`; all library/editor state and context selection stays outside `App.jsx`. The library must contain search, category/status filters, compact rows, version/status/author/date, `Новый шаблон`, `Открыть`, `Копировать`, `Архивировать`, and version history. Use 8px maximum card radius, existing Inter typography and the existing blue/green/orange/red semantic colors.

`Новый шаблон` opens a modal with exact fields: `Название`, `Тип документа`, `Категория`, `Использование`, `Экспорты`. Initially selectable document types are `Пользовательский документ` and `Договор ремонта (пилот)`; only admin can create the pilot seed.

- [ ] **Step 4: Build the A4 editor**

Toolbar controls: undo, redo, font family, font size, bold, italic, underline, heading, list, alignment, table, page break, autofield insert. Use familiar icon buttons with tooltips and stable 36x36 controls. The editor page uses `DEFAULT_PAGE`; protected fields are non-editable chips. Paste accepts plain text and allowlisted editor nodes only.

Right panel groups autofields by registry group. Clicking inserts the corresponding atom. Required fields show a lock. Deleting a required field opens confirmation and still blocks publication until restored.

- [ ] **Step 5: Implement draft/preview/publish UX**

`Сохранить черновик` waits for repository confirmation and displays success only on `committed:true`. `Предпросмотр` requires a selected test object and performs no writes to that object. `Опубликовать` is disabled until model validation, automatic parity and manual legal review are true. History rollback requires typed confirmation `ОТКАТИТЬ`.

- [ ] **Step 6: Run tests/build and visually inspect desktop/mobile**

Run:

```bash
cd titovstroy
npm test
npm run build
npm run dev -- --host 127.0.0.1
```

Expected: tests/build PASS; Admin library/editor render without overlap at 1440x900 and 390x844; no existing admin tab changes layout.

- [ ] **Step 7: Commit the isolated UI**

```bash
git add titovstroy/src/documents/TemplateCenter.jsx titovstroy/src/documents/TemplateEditor.jsx titovstroy/src/documents/DocumentTemplateAdminRoute.jsx titovstroy/src/documents/documentTemplates.css titovstroy/src/documents/templateModel.js titovstroy/src/documents/templateModel.test.js titovstroy/src/App.jsx
git commit -m "Add document template admin editor"
```

---

### Task 7: Verbatim Legacy Repair Seed and Publication Gate

**Files:**
- Create: `titovstroy/src/documents/repairLegacySeed.js`
- Create: `titovstroy/src/documents/repairLegacySeed.test.js`
- Modify: `titovstroy/src/App.jsx:8462-9002,15005-15043`

**Interfaces:**
- Consumes: a callback to the unchanged `buildContractHtml(c, client, ca, gdoc, stamp)`.
- Produces: `createRepairLegacySeed({ buildLegacyHtml })`, `createRepairParityReport({ buildLegacyHtml, contentJson, context })`.
- `App.jsx` passes the current renderer as a dependency; `repairLegacySeed.js` never imports production data.

- [ ] **Step 1: Write failing sentinel-import tests**

Use a synthetic legacy renderer containing punctuation, numbered paragraphs, client fields and a work table. Assert that `normalizeLegalText` before and after is equal, protected fields become atoms, and the entire table becomes one `dataTable` atom.

```js
const seed = createRepairLegacySeed({ buildLegacyHtml:syntheticLegacyRenderer });
expect(seed.source).toBe("legacy-repair");
expect(extractTemplateFieldIds(seed.contentJson)).toContain("client.name");
expect(extractTemplateFieldIds(seed.contentJson)).toContain("estimate.worksTable");
expect(seed.importReport.ok).toBe(true);
```

- [ ] **Step 2: Verify red**

Run: `cd titovstroy && npx vitest run src/documents/repairLegacySeed.test.js`

Expected: FAIL because the importer is absent.

- [ ] **Step 3: Implement sentinels without manually copying legal text**

Build a frozen fake contract/client/company/object whose dynamic values are unique strings such as `⟦TS:client.name⟧`. Call the existing renderer once. Parse its `<body>` through TipTap `generateJSON`, split text nodes at sentinels, replace them with `protectedField`, and replace the table containing `⟦TS:estimate.worksTable⟧` with `dataTable`.

The importer must return an error if any sentinel appears zero times or an unexpected number of times. Store `legacyFingerprint`, `legacyNormalizedText`, `fieldIds`, `importReport` on the draft metadata.

- [ ] **Step 4: Wire an explicit admin-only seed action**

When no `repair_fiz` template exists, show `Создать черновик из действующего договора`. It calls the unchanged renderer with sentinel data and writes only to `DOCUMENT_TEMPLATES_KEY`. It must not read or update contracts/objects beyond selecting preview context.

- [ ] **Step 5: Add publication parity gate against a selected real copy**

Before first publication, render both legacy and candidate using the selected Preview object/contract. Require `compareCanonicalDocuments(...).ok === true`, all three export checks true, and a checked confirmation text `Юридический текст сравнен с действующим документом`. Store the complete parity report in the version.

- [ ] **Step 6: Run tests/build and commit**

Run: `cd titovstroy && npx vitest run src/documents/repairLegacySeed.test.js src/documents/templateRender.test.js && npm test && npm run build`

Expected: PASS.

```bash
git add titovstroy/src/documents/repairLegacySeed.js titovstroy/src/documents/repairLegacySeed.test.js titovstroy/src/App.jsx
git commit -m "Seed repair template from legacy generator"
```

---

### Task 8: Immutable Document Snapshots and Instance Editing

**Files:**
- Create: `titovstroy/src/documents/documentSnapshots.js`
- Create: `titovstroy/src/documents/documentSnapshots.test.js`
- Create: `titovstroy/src/documents/DocumentInstanceEditor.jsx`

**Interfaces:**
- Produces: `documentCreatedAt(contract)`, `isTemplateEligible(contract, version)`, `createDocumentSnapshot(input)`, `appendDocumentRevision(snapshot, contentJson, actor, now)`, `getSnapshotForDocument(snapshots, documentId)`.
- Snapshot ID for contracts: `contract:${contract.id}`.

- [ ] **Step 1: Write failing immutability and cutoff tests**

```js
expect(isTemplateEligible({ id:"1000", createdAt:1000 }, { publishedAt:2000 })).toBe(false);
expect(isTemplateEligible({ id:"3000", createdAt:3000 }, { publishedAt:2000 })).toBe(true);
const snap = createDocumentSnapshot(SNAPSHOT_INPUT);
const changedTemplate = { ...VERSION, contentJson:doc("new global text") };
expect(snap.contentSnapshot).toEqual(VERSION.contentJson);
expect(changedTemplate.contentJson).not.toEqual(snap.contentSnapshot);
const revised = appendDocumentRevision(snap, doc("individual edit"), ACTOR, 4000);
expect(revised.instanceVersions).toHaveLength(1);
expect(snap.instanceVersions).toHaveLength(0);
```

- [ ] **Step 2: Verify red and implement pure snapshot functions**

Run: `cd titovstroy && npx vitest run src/documents/documentSnapshots.test.js`

Expected: FAIL, then PASS.

`createDocumentSnapshot` deep-clones `contentJson`, `variablesSnapshot` and canonical HTML, and records `templateVersionId`. Re-export always uses an existing snapshot even after template publication changes.

- [ ] **Step 3: Implement the individual editor**

`DocumentInstanceEditor` reuses `TemplateEditor` in restricted mode: ordinary text is editable, `protectedField` and `dataTable` remain atom/locked, template metadata and autofield identifiers are hidden. Save appends an instance version through a snapshots transaction. It never updates `DOCUMENT_TEMPLATES_KEY`.

- [ ] **Step 4: Run tests/build and commit**

Run: `cd titovstroy && npx vitest run src/documents/documentSnapshots.test.js && npm test && npm run build`

Expected: PASS.

```bash
git add titovstroy/src/documents/documentSnapshots.js titovstroy/src/documents/documentSnapshots.test.js titovstroy/src/documents/DocumentInstanceEditor.jsx
git commit -m "Add immutable generated document snapshots"
```

---

### Task 9: One Canonical Export Input for PDF, Google Docs and DOCX

**Files:**
- Create: `titovstroy/src/documents/exportAdapters.js`
- Create: `titovstroy/src/documents/exportAdapters.test.js`
- Create: `titovstroy/src/documents/documentExportRouter.js`
- Modify: `titovstroy/src/App.jsx:8992-9002,9189-9647,9649-9726,14477-14965`

**Interfaces:**
- Produces: `buildCanonicalExport(snapshot)`, `openPdfFromCanonical(exportDoc, openOrPrintHtml)`, `uploadGoogleDocFromCanonical(exportDoc, googleDeps)`, `buildDocxBlobFromCanonical(exportDoc, docxModule)`, `createDocumentExportRouter(deps)`.
- All adapters consume exactly `{ title, canonicalHtml, contentJson, variablesSnapshot, page }` from one snapshot.

- [ ] **Step 1: Write failing adapter contract tests**

Use spies and assert the same canonical normalized text reaches PDF, GDoc and DOCX adapters. Include paragraphs, bold, underline, list, page break and work table. Unknown nodes must fail with a visible error result instead of being dropped.

- [ ] **Step 2: Verify red**

Run: `cd titovstroy && npx vitest run src/documents/exportAdapters.test.js`

Expected: FAIL because adapters do not exist.

- [ ] **Step 3: Implement adapters**

PDF passes canonical HTML to existing `openOrPrintHtml`. Google Docs keeps the existing OAuth and multipart Drive upload but uses `canonicalHtml`. DOCX walks `contentJson` and builds `docx` paragraphs/tables; it must support every node allowed by `editorExtensions.js` and return `{ ok:false, reason:"unsupported-node:<type>" }` for anything else.

- [ ] **Step 4: Add guarded pilot routing in App**

Import `REPAIR_TEMPLATE_ENABLED` from `documentTemplateKeys.js`; do not define feature flags in `App.jsx`.

For `repair_fiz` only:

1. If flag is off, call the existing generator unchanged.
2. If contract predates `version.publishedAt`, call legacy unchanged.
3. If snapshot exists, export the snapshot.
4. If eligible and no snapshot, resolve fields, validate, render, atomically save snapshot, then export.
5. If validation or snapshot save fails, show the exact reason and ask whether to use the legacy generator; do not mark the new path successful.

No routing changes are allowed for `annex`, `design`, `design_add`, `reservation`, `podryad`, `podryad_annex` or AVR. `App.jsx` replaces only the bodies of its three button handlers with calls to the router; all five decisions above live in `documentExportRouter.js`.

For a contract that already has a snapshot, the documents card shows `Редактировать экземпляр` only when `accessAllows(currentPermissions.documentInstanceEdit, isOwnDocument(c))`. The click opens `DocumentInstanceEditor` through the document module route. Closing or saving returns to the same contract card; the App contract record is not changed.

- [ ] **Step 5: Add `.env.example` safe default**

```dotenv
VITE_DOCUMENT_TEMPLATES_REPAIR_ON=0
```

- [ ] **Step 6: Run targeted/full tests and build**

Run:

```bash
cd titovstroy
npx vitest run src/documents/exportAdapters.test.js src/documents/documentSnapshots.test.js
npm test
npm run build
```

Expected: PASS; build contains no generator switch unless the env value is `1`.

- [ ] **Step 7: Commit the disabled pilot**

```bash
git add titovstroy/src/documents/exportAdapters.js titovstroy/src/documents/exportAdapters.test.js titovstroy/src/documents/documentExportRouter.js titovstroy/src/App.jsx titovstroy/.env.example
git commit -m "Add disabled repair template export pilot"
```

---

### Task 10: Preview Acceptance, Legal Parity and Rollback Drill

**Files:**
- Create: `docs/superpowers/verification/2026-07-20-repair-template-pilot.md`
- Modify only if defects are found: files owned by Tasks 1-9.

**Interfaces:**
- Produces an acceptance record with commit SHA, Preview URL, Firebase project/database host, template/version IDs, tested contract IDs from the copied database, parity results and screenshots.

- [ ] **Step 1: Verify source tree and automated checks**

Run:

```bash
git status --short
cd titovstroy
npm ci
npm test
npm run build
```

Expected: only intended source/docs changes; all tests PASS; build succeeds. Do not stage `.superpowers/`, `dist/` or `node_modules/`.

- [ ] **Step 2: Deploy Preview with copied database and flag off**

Set Preview branch variables to the test Firebase project/database and `VITE_DOCUMENT_TEMPLATES_REPAIR_ON=0`. Verify login, objects, estimates, existing documents, PDF, GDoc and DOCX behave exactly as before. Confirm no keys outside `titovstroy-document-templates-v1` and `titovstroy-document-snapshots-v1` were written by opening the template module.

- [ ] **Step 3: Create the repair draft and test editing**

Create the seed from the active legacy generator. Change one harmless word in the Preview draft, confirm legacy exports remain unchanged while draft is unpublished, restore the exact word, and save. Insert/remove a non-required paragraph; verify required protected fields cannot be corrupted.

- [ ] **Step 4: Run parity on at least five copied real contracts**

Choose: physical client with complete data, client with missing optional data, multiple work categories, discount, and a large estimate. For each, compare normalized full text, paragraph order, table cells, totals, company/client requisites and PDF visual pages. No production document is edited.

- [ ] **Step 5: Publish only after all gates pass, then enable flag in Preview**

Publish version 1 with automatic report `ok:true` and manual review checked. Set `VITE_DOCUMENT_TEMPLATES_REPAIR_ON=1` only in Preview. Confirm a contract created before publication uses legacy. Create one new test contract in the copied database, export all three formats, and confirm one immutable snapshot is created.

- [ ] **Step 6: Test version isolation and rollback**

Publish version 2 with an obvious Preview-only text change. Re-export the version-1 snapshot and verify it is unchanged. Create a new Preview contract and verify version 2. Roll back active version to version 1; verify historical versions remain.

- [ ] **Step 7: Test failures and permissions**

Remove a required value in copied test data: generation must stop with the exact missing fields. Simulate unavailable Firebase: snapshot save must fail and offer explicit legacy fallback. Verify non-admin roles cannot access template management; a role with view-only cannot save/publish; only `documentInstanceEdit` can modify a generated instance.

- [ ] **Step 8: Record results and keep production disabled**

Write the acceptance document with every result and screenshot path. The production environment keeps `VITE_DOCUMENT_TEMPLATES_REPAIR_ON=0`. Enabling production requires a separate owner decision after this document has no failed checks.

- [ ] **Step 9: Final commit**

```bash
git add docs/superpowers/verification/2026-07-20-repair-template-pilot.md
git commit -m "Document repair template pilot verification"
```

---

## Final Release Gate

The pilot is ready for a production decision only when all statements are true:

- `npm ci`, all Vitest tests and production build pass from a clean checkout.
- The full backup includes verified template and snapshot sections and restore rejects malformed entries before any write.
- Opening/editing templates changes only the two new data sections and audit log.
- Existing contracts and exports remain on legacy because they predate the published version.
- Five copied real contracts have exact text/table/value parity and manual PDF review.
- One new Preview contract creates one immutable snapshot and all three exports use it.
- Publishing a new template version does not alter an existing snapshot.
- Production flag remains `0` until the owner explicitly approves activation.
