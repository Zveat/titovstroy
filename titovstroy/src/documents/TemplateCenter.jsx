import { useEffect, useMemo, useState } from "react";
import TemplateEditor from "./TemplateEditor.jsx";
import { AUTOFIELD_DEFINITIONS, buildRepairPreviewContext, requiredFieldIdsForType, resolveRepairContractVariables } from "./autofields.js";
import { buildTemplateActions, filterTemplates } from "./templateModel.js";
import { createRepairParityReport } from "./repairLegacySeed.js";
import { DEFAULT_PAGE, extractTemplateFieldIds, normalizeLegalText, renderTemplateToCanonicalHtml } from "./templateRender.js";

const EMPTY_DOCUMENT = { type: "doc", content: [{ type: "paragraph" }] };
const EMPTY_NEW = { name: "", type: "custom", category: "custom", usageContexts: ["objects"], supportedExports: ["pdf", "gdoc", "docx"] };
const TYPE_OPTIONS = [
  ["custom", "Произвольный документ"],
];
const CATEGORY_OPTIONS = [
  ["custom", "Прочее"],
  ["contracts", "Договоры"],
  ["annexes", "Доп. соглашения"],
  ["acts", "Акты"],
  ["design", "Дизайн"],
  ["subcontracts", "Подряд"],
];
const STATUS_LABEL = { draft: "Черновик", published: "Опубликован", archived: "Архив" };
const can = value => value === "all" || value === "own";
const slug = value => String(value || "template").trim().toLowerCase().replace(/[^a-zа-яё0-9]+/giu, "-").replace(/^-|-$/g, "").slice(0, 42) || "template";
const activeContent = template => template?.draft?.contentJson
  || template?.versions?.find(version => version.id === template.activeVersionId)?.contentJson
  || EMPTY_DOCUMENT;

function NewTemplateModal({ onClose, onCreate }) {
  const [form, setForm] = useState(EMPTY_NEW);
  const [saving, setSaving] = useState(false);
  const submit = async event => {
    event.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    const result = await onCreate({
      ...form,
      id: `${slug(form.name)}-${Date.now().toString(36)}`,
    });
    setSaving(false);
    if (result?.ok) onClose();
  };
  return (
    <div className="dt-modal-backdrop" onMouseDown={onClose}>
      <form className="dt-modal" onSubmit={submit} onMouseDown={event => event.stopPropagation()}>
        <div className="dt-modal-head"><div><h3>Новый шаблон</h3><p>Создаётся отдельный черновик. Рабочие документы не меняются.</p></div><button type="button" onClick={onClose}>×</button></div>
        <label>Название<input autoFocus value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} placeholder="Например: Памятка клиенту" /></label>
        <label>Тип документа<select value={form.type} onChange={event => setForm(current => ({ ...current, type: event.target.value }))}>{TYPE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Раздел<select value={form.category} onChange={event => setForm(current => ({ ...current, category: event.target.value }))}>{CATEGORY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <fieldset className="dt-check-group"><legend>Использование</legend>{[["objects", "В карточке объекта"], ["documents", "В прочих документах"], ["manual", "Ручное создание"]].map(([value, label]) => <label key={value}><input type="checkbox" checked={form.usageContexts.includes(value)} onChange={event => setForm(current => ({ ...current, usageContexts: event.target.checked ? [...current.usageContexts, value] : current.usageContexts.filter(item => item !== value) }))} />{label}</label>)}</fieldset>
        <fieldset className="dt-check-group"><legend>Экспорты</legend>{[["pdf", "PDF"], ["gdoc", "Google Docs"], ["docx", "Word"]].map(([value, label]) => <label key={value}><input type="checkbox" checked={form.supportedExports.includes(value)} onChange={event => setForm(current => ({ ...current, supportedExports: event.target.checked ? [...current.supportedExports, value] : current.supportedExports.filter(item => item !== value) }))} />{label}</label>)}</fieldset>
        <div className="dt-modal-actions"><button type="button" className="dt-btn secondary" onClick={onClose}>Отмена</button><button className="dt-btn primary" disabled={saving || !form.name.trim()}>{saving ? "Создание…" : "Создать"}</button></div>
      </form>
    </div>
  );
}

export default function TemplateCenter({ service, permissions = {}, data = {} }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const [draftContent, setDraftContent] = useState(EMPTY_DOCUMENT);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [previewObjectId, setPreviewObjectId] = useState("");
  const [previewReady, setPreviewReady] = useState(false);
  const [parityReport, setParityReport] = useState(null);
  const [legalChecked, setLegalChecked] = useState(false);
  const selected = templates.find(template => template.id === selectedId) || null;
  const editable = can(permissions.templateEdit) && selected?.status !== "archived";

  const reload = async preferredId => {
    setLoading(true);
    const result = await service.loadTemplates();
    setLoading(false);
    if (result.status === "corrupt") { setMessage("Хранилище шаблонов повреждено. Запись отключена."); return; }
    const list = result.store?.templates || [];
    setTemplates(list);
    if (preferredId && list.some(item => item.id === preferredId)) setSelectedId(preferredId);
  };

  useEffect(() => { reload(); }, []);
  useEffect(() => {
    if (!selected) return;
    setDraftContent(activeContent(selected));
    setDirty(false);
    setPreviewReady(false);
    setParityReport(null);
    setLegalChecked(false);
  }, [selectedId, selected?.updatedAt]);

  const visible = useMemo(() => filterTemplates(templates, { query, category, status }), [templates, query, category, status]);

  const report = result => {
    if (!result?.ok || !result?.committed) { setMessage(result?.reason || "Изменение не сохранено в облаке"); return false; }
    setMessage("Сохранено в облаке");
    return true;
  };

  const create = async input => {
    const result = await service.createTemplate(input);
    if (!report(result)) return result;
    const draftResult = await service.saveDraft(input.id, EMPTY_DOCUMENT, { page: DEFAULT_PAGE });
    if (!report(draftResult)) return draftResult;
    await reload(input.id);
    return result;
  };

  const save = async () => {
    if (!selected || !editable) return;
    setSaving(true);
    const result = await service.saveDraft(selected.id, draftContent, { page: selected.draft?.page || DEFAULT_PAGE });
    setSaving(false);
    if (report(result)) { setDirty(false); await reload(selected.id); }
  };

  const preview = () => {
    if (!selected) return;
    let variables = {};
    let context = null;
    if (selected.type === "repair_fiz") {
      context = buildRepairPreviewContext({ objectId: previewObjectId, ...data });
      if (!context.ok) { setMessage(context.reason); return; }
      const resolved = resolveRepairContractVariables(context);
      if (!resolved.ok) { setMessage(resolved.missing.map(item => item.label).join(", ")); return; }
      variables = resolved.values;
    }
    try {
      const html = renderTemplateToCanonicalHtml({ contentJson: draftContent, variables, page: selected.draft?.page || DEFAULT_PAGE });
      const popup = window.open("", "_blank");
      if (!popup) { setMessage("Браузер заблокировал окно предпросмотра"); return; }
      popup.opener = null;
      popup.document.open(); popup.document.write(html); popup.document.close();
      if (selected.source === "legacy-repair") {
        const comparison = createRepairParityReport({
          buildLegacyHtml: service.renderLegacyRepair,
          contentJson: draftContent,
          context,
        });
        setParityReport(comparison);
        if (!comparison.ok) {
          setPreviewReady(false);
          setMessage(`Предпросмотр открыт, но юридическое сравнение не пройдено: ${comparison.reason || comparison.firstDifference?.kind || "есть отличие"}`);
          return;
        }
      }
      setPreviewReady(true);
      setMessage(selected.source === "legacy-repair" ? "Предпросмотр совпадает с действующим договором" : "Предпросмотр сформирован");
    } catch (error) { setMessage(error?.message || "Не удалось сформировать предпросмотр"); }
  };

  const publish = async () => {
    if (!selected || !can(permissions.templatePublish) || dirty) return;
    if (!previewReady || !legalChecked) { setMessage("Сначала проверьте предпросмотр и подтвердите юридический текст"); return; }
    let variables = {};
    let verifiedParity = null;
    if (selected.type === "repair_fiz") {
      const context = buildRepairPreviewContext({ objectId: previewObjectId, ...data });
      if (!context.ok) { setMessage(context.reason); return; }
      const resolved = resolveRepairContractVariables(context);
      if (!resolved.ok) { setMessage(resolved.missing.map(item => item.label).join(", ")); return; }
      variables = resolved.values;
      if (selected.source === "legacy-repair") {
        verifiedParity = createRepairParityReport({ buildLegacyHtml: service.renderLegacyRepair, contentJson: draftContent, context });
        if (!verifiedParity.ok) { setParityReport(verifiedParity); setMessage("Публикация отменена: юридический текст отличается от действующего договора"); return; }
      }
    }
    const html = renderTemplateToCanonicalHtml({ contentJson: draftContent, variables, page: selected.draft?.page || DEFAULT_PAGE });
    const result = await service.publish(selected.id, {
      contentJson: draftContent,
      requiredFieldIds: requiredFieldIdsForType(selected.type),
      fieldIds: extractTemplateFieldIds(draftContent),
      normalizedText: normalizeLegalText(html),
      page: selected.draft?.page || DEFAULT_PAGE,
      checksum: `text-${normalizeLegalText(html).length}`,
      parityReport: verifiedParity,
      manualLegalReview: legalChecked,
      exportChecks: { pdf: true, gdoc: true, docx: true },
    });
    if (report(result)) await reload(selected.id);
  };

  const seedLegacyRepair = async () => {
    if (!window.confirm("Импортировать действующий договор ремонта как новый черновик шаблона? Существующие договоры, объекты и документы не изменятся.")) return;
    setSaving(true);
    const result = await service.seedLegacyRepair();
    setSaving(false);
    if (report(result)) await reload("repair-fiz-legacy");
  };

  const runAction = async (action, template) => {
    if (action === "open") { setSelectedId(template.id); return; }
    if (action === "copy") {
      const name = window.prompt("Название копии", `${template.name} — копия`);
      if (!name) return;
      const result = await service.copyTemplate(template.id, { id: `${slug(name)}-${Date.now().toString(36)}`, name });
      if (report(result)) await reload(result.value?.id);
      return;
    }
    if (action === "archive") {
      if (!window.confirm(`Архивировать шаблон «${template.name}»? Опубликованные версии сохранятся.`)) return;
      const result = await service.archive(template.id);
      if (report(result)) { setSelectedId(null); await reload(); }
      return;
    }
    if (action === "history") setSelectedId(template.id);
  };

  const rollback = async versionId => {
    if (window.prompt("Введите ОТКАТИТЬ, чтобы активировать эту версию") !== "ОТКАТИТЬ") return;
    const result = await service.rollback(selected.id, versionId);
    if (report(result)) await reload(selected.id);
  };

  if (selected) return (
    <section className="dt-center">
      <header className="dt-editor-header">
        <button className="dt-back" onClick={() => { if (!dirty || window.confirm("Закрыть редактор без сохранения черновика?")) setSelectedId(null); }}>←</button>
        <div className="dt-editor-identity"><h2>{selected.name}</h2><div><span className={`dt-status ${selected.status}`}>{STATUS_LABEL[selected.status] || selected.status}</span><span>{selected.type}</span>{dirty && <span className="dt-unsaved">Есть несохранённые изменения</span>}</div></div>
        <div className="dt-editor-actions">
          {selected.type === "repair_fiz" && <select value={previewObjectId} onChange={event => setPreviewObjectId(event.target.value)}><option value="">Объект для проверки</option>{(data.objects || []).filter(item => !item.deletedAt).map(item => <option key={item.id} value={item.id}>{item.clientName || item.address || item.id}</option>)}</select>}
          <button className="dt-btn secondary" onClick={preview}>Предпросмотр</button>
          {editable && <button className="dt-btn primary" onClick={save} disabled={!dirty || saving}>{saving ? "Сохранение…" : "Сохранить черновик"}</button>}
        </div>
      </header>
      <TemplateEditor contentJson={draftContent} editable={editable} onChange={next => { setDraftContent(next); setDirty(true); setPreviewReady(false); setParityReport(null); }} />
      <footer className="dt-publish-bar">
        <div><strong>Публикация версии</strong><span>Новые документы получат эту версию. Уже созданные документы не изменятся.</span></div>
        <label><input type="checkbox" checked={legalChecked} onChange={event => setLegalChecked(event.target.checked)} /> {selected.source === "legacy-repair" ? "Юридический текст сравнен с действующим документом" : "Юридический текст проверен без сокращений"}</label>
        {can(permissions.templatePublish) && <button className="dt-btn primary" disabled={dirty || !selected.draft || !previewReady || !legalChecked || (selected.source === "legacy-repair" && parityReport?.ok !== true)} onClick={publish}>Опубликовать</button>}
      </footer>
      {selected.source === "legacy-repair" && <div className="dt-legal-lock">{parityReport?.ok ? "Сравнение пройдено: текст совпадает с действующим договором." : "Пилотный договор ремонта публикуется только после автоматического сравнения с действующим генератором. Юридический текст здесь не меняется автоматически."}</div>}
      {(selected.versions?.length || 0) > 0 && <section className="dt-history"><h3>История версий</h3>{[...selected.versions].reverse().map(version => <div key={version.id}><span><b>Версия {version.versionNumber}</b><small>{new Date(version.publishedAt).toLocaleString("ru-RU")} · {version.publishedBy || "—"}</small></span>{version.id === selected.activeVersionId ? <em>Активна</em> : can(permissions.templateRollback) && <button onClick={() => rollback(version.id)}>Вернуть</button>}</div>)}</section>}
      {message && <div className="dt-toast" onClick={() => setMessage("")}>{message}</div>}
    </section>
  );

  return (
    <section className="dt-center">
      <div className="dt-library-head"><div><h2>Шаблоны документов</h2><p>Договоры, акты и приложения редактируются здесь. Созданные ранее документы остаются без изменений.</p></div><div className="dt-library-actions">{service.repairTemplateEnabled && can(permissions.templatePublish) && !templates.some(item => item.type === "repair_fiz" && item.status !== "archived") && <button className="dt-btn secondary" disabled={saving} onClick={seedLegacyRepair}>Импортировать действующий договор</button>}{can(permissions.templateEdit) && <button className="dt-btn primary" onClick={() => setNewOpen(true)}>+ Новый шаблон</button>}</div></div>
      <div className="dt-filters"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Поиск по названию…" /><select value={category} onChange={event => setCategory(event.target.value)}><option value="all">Все разделы</option>{CATEGORY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select value={status} onChange={event => setStatus(event.target.value)}><option value="all">Все статусы</option><option value="draft">Черновики</option><option value="published">Опубликованные</option><option value="archived">Архив</option></select></div>
      {loading ? <div className="dt-empty">Загрузка шаблонов…</div> : visible.length === 0 ? <div className="dt-empty"><strong>Шаблонов пока нет</strong><span>Создайте новый документ или дождитесь добавления пилотного договора ремонта.</span></div> : <div className="dt-template-table"><div className="dt-template-row header"><span>Шаблон</span><span>Раздел</span><span>Статус</span><span>Версии</span><span>Обновлён</span><span /></div>{visible.map(template => <div className="dt-template-row" key={template.id}><span><b>{template.name}</b><small>{template.type}</small></span><span>{CATEGORY_OPTIONS.find(([value]) => value === template.category)?.[1] || template.category}</span><span><i className={`dt-status ${template.status}`}>{STATUS_LABEL[template.status] || template.status}</i></span><span>{template.versions?.length || 0}</span><span>{template.updatedAt ? new Date(template.updatedAt).toLocaleDateString("ru-RU") : "—"}</span><span className="dt-row-actions">{buildTemplateActions(template, permissions).map(action => <button key={action} title={{ open: "Открыть", copy: "Создать копию", archive: "Архивировать", history: "История версий" }[action]} onClick={() => runAction(action, template)}>{{ open: "Открыть", copy: "Копия", archive: "Архив", history: "Версии" }[action]}</button>)}</span></div>)}</div>}
      {newOpen && <NewTemplateModal onClose={() => setNewOpen(false)} onCreate={create} />}
      {message && <div className="dt-toast" onClick={() => setMessage("")}>{message}</div>}
    </section>
  );
}
