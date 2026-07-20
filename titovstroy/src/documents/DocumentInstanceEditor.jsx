import { useState } from "react";
import { snapshotContent } from "./documentSnapshots.js";
import TemplateEditor from "./TemplateEditor.jsx";

export default function DocumentInstanceEditor({ snapshot, service, onClose, onSaved }) {
  const [contentJson, setContentJson] = useState(() => snapshotContent(snapshot));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const close = () => {
    if (dirty && !window.confirm("Закрыть без сохранения индивидуальной версии?")) return;
    onClose?.();
  };

  const save = async () => {
    if (!dirty || !service?.appendSnapshotRevision) return;
    setSaving(true);
    const result = await service.appendSnapshotRevision(snapshot.documentId, contentJson);
    setSaving(false);
    if (!result?.ok || !result?.committed) {
      setMessage(result?.reason || "Индивидуальная версия не сохранена в облаке");
      return;
    }
    setDirty(false);
    setMessage("Индивидуальная версия сохранена. Исходный шаблон не изменён.");
    onSaved?.(result.snapshots?.find(item => item.documentId === snapshot.documentId) || null);
  };

  return (
    <section className="dt-center dt-instance">
      <header className="dt-editor-header">
        <button className="dt-back" type="button" onClick={close}>←</button>
        <div className="dt-editor-identity">
          <h2>{snapshot.title || "Экземпляр документа"}</h2>
          <div><span>Индивидуальная версия</span>{dirty && <span className="dt-unsaved">Есть несохранённые изменения</span>}</div>
        </div>
        <div className="dt-editor-actions">
          <button type="button" className="dt-btn primary" disabled={!dirty || saving} onClick={save}>{saving ? "Сохранение…" : "Сохранить версию"}</button>
        </div>
      </header>
      <div className="dt-instance-notice">Изменения относятся только к этому документу. Глобальный шаблон и ранее созданные документы не меняются.</div>
      <TemplateEditor
        contentJson={contentJson}
        editable
        showAutofields={false}
        instanceMode
        onChange={next => { setContentJson(next); setDirty(true); }}
      />
      {message && <div className="dt-toast" onClick={() => setMessage("")}>{message}</div>}
    </section>
  );
}
