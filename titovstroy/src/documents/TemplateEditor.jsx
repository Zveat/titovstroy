import { useEffect, useMemo, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { AUTOFIELD_DEFINITIONS } from "./autofields.js";
import { createTemplateExtensions } from "./editorExtensions.js";

const EMPTY_DOCUMENT = { type: "doc", content: [{ type: "paragraph" }] };

function ToolButton({ title, active = false, disabled = false, onClick, children }) {
  return (
    <button
      type="button"
      className={`dt-tool${active ? " is-active" : ""}`}
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export default function TemplateEditor({ contentJson, editable, onChange, showAutofields = true, instanceMode = false }) {
  const [outline, setOutline] = useState([]);
  const [scrollProgress, setScrollProgress] = useState(0);
  const extensions = useMemo(() => createTemplateExtensions({ editable }), [editable]);
  const updateOutline = current => {
    const next = [];
    current.state.doc.descendants((node, pos) => {
      if (!node.isTextblock) return;
      const text = node.textContent.trim().replace(/\s+/g, " ");
      if (!text || text.length > 150) return;
      const isHeading = node.type.name === "heading";
      const isNumberedSection = /^(?:раздел\s+)?(?:\d+(?:\.\d+)*[.)]?|[IVXLC]+[.)])\s+/iu.test(text);
      if (isHeading || isNumberedSection) next.push({ pos, label: text });
    });
    setOutline(next.slice(0, 120));
  };
  const editor = useEditor({
    extensions,
    content: contentJson || EMPTY_DOCUMENT,
    editable,
    editorProps: {
      attributes: { class: "dt-prosemirror" },
    },
    onCreate: ({ editor: current }) => updateOutline(current),
    onUpdate: ({ editor: current }) => {
      updateOutline(current);
      onChange?.(current.getJSON());
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!!editable);
  }, [editor, editable]);

  useEffect(() => {
    if (!editor || !contentJson) return;
    const incoming = JSON.stringify(contentJson);
    if (JSON.stringify(editor.getJSON()) !== incoming) editor.commands.setContent(contentJson, { emitUpdate: false });
    updateOutline(editor);
  }, [editor, contentJson]);

  useEffect(() => {
    if (!editor || typeof document === "undefined") return undefined;
    const scroller = getDocumentScroller(editor);
    const update = () => {
      const maximum = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      setScrollProgress(maximum > 0 ? Math.round((scroller.scrollTop / maximum) * 100) : 0);
    };
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      scroller.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [editor, contentJson]);

  if (!editor) return <div className="dt-editor-loading">Подготовка редактора…</div>;

  const insertField = field => {
    if (field.kind === "table") editor.chain().focus().insertDataTable(field.id).run();
    else editor.chain().focus().insertProtectedField(field.id).run();
  };

  const scrollDocument = target => {
    const viewport = getDocumentScroller(editor);
    if (target === "start" || target === "end") {
      viewport?.scrollTo({ top: target === "start" ? 0 : viewport.scrollHeight, behavior: "smooth" });
      return;
    }
    const element = editor.view.nodeDOM(Number(target));
    element?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };

  const scrollByScreen = direction => {
    const viewport = getDocumentScroller(editor);
    viewport.scrollBy({ top: direction * Math.max(320, viewport.clientHeight * 0.78), behavior: "smooth" });
  };

  const seekDocument = value => {
    const viewport = getDocumentScroller(editor);
    const maximum = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    viewport.scrollTo({ top: maximum * (Number(value) / 100), behavior: "auto" });
  };

  return (
    <div className="dt-editor-shell">
      <div className="dt-toolbar" aria-label="Панель форматирования">
        <div className="dt-tool-group">
          <ToolButton title="Отменить" disabled={!editable || !editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>↶</ToolButton>
          <ToolButton title="Повторить" disabled={!editable || !editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>↷</ToolButton>
        </div>
        <div className="dt-tool-group dt-tool-selects">
          <select title="Шрифт" disabled={!editable} value={editor.getAttributes("textStyle").fontFamily || "Times New Roman"} onChange={event => editor.chain().focus().setFontFamily(event.target.value).run()}>
            <option>Times New Roman</option>
            <option>Arial</option>
            <option>Verdana</option>
          </select>
          <select title="Размер текста" disabled={!editable} value={editor.getAttributes("textStyle").fontSize || "11pt"} onChange={event => editor.chain().focus().setFontSize(event.target.value).run()}>
            {[8, 9, 10, 11, 12, 13, 14, 16, 18].map(size => <option key={size} value={`${size}pt`}>{size}</option>)}
          </select>
        </div>
        <div className="dt-tool-group">
          <ToolButton title="Полужирный" active={editor.isActive("bold")} disabled={!editable} onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></ToolButton>
          <ToolButton title="Курсив" active={editor.isActive("italic")} disabled={!editable} onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></ToolButton>
          <ToolButton title="Подчёркнутый" active={editor.isActive("underline")} disabled={!editable} onClick={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></ToolButton>
          <ToolButton title="Заголовок" active={editor.isActive("heading", { level: 2 })} disabled={!editable} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H</ToolButton>
        </div>
        <div className="dt-tool-group">
          <ToolButton title="Маркированный список" active={editor.isActive("bulletList")} disabled={!editable} onClick={() => editor.chain().focus().toggleBulletList().run()}>•≡</ToolButton>
          <ToolButton title="Нумерованный список" active={editor.isActive("orderedList")} disabled={!editable} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1≡</ToolButton>
          <ToolButton title="По левому краю" disabled={!editable} onClick={() => editor.chain().focus().setTextAlign("left").run()}>≡</ToolButton>
          <ToolButton title="По центру" disabled={!editable} onClick={() => editor.chain().focus().setTextAlign("center").run()}>≡</ToolButton>
          <ToolButton title="По ширине" disabled={!editable} onClick={() => editor.chain().focus().setTextAlign("justify").run()}>☰</ToolButton>
        </div>
        <div className="dt-tool-group">
          <ToolButton title="Вставить таблицу" disabled={!editable} onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>▦</ToolButton>
          <ToolButton title="Разрыв страницы" disabled={!editable} onClick={() => editor.chain().focus().insertPageBreak().run()}>⇥</ToolButton>
        </div>
        <div className="dt-tool-group dt-document-nav">
          <ToolButton title="В начало документа" onClick={() => scrollDocument("start")}>↑</ToolButton>
          <select aria-label="Перейти к разделу договора" value="" disabled={outline.length === 0} onChange={event => scrollDocument(event.target.value)}>
            <option value="">{outline.length ? `Перейти к разделу (${outline.length})` : "Разделы не найдены"}</option>
            {outline.map((item, index) => <option key={`${item.pos}-${index}`} value={item.pos}>{item.label}</option>)}
          </select>
          <ToolButton title="В конец документа" onClick={() => scrollDocument("end")}>↓</ToolButton>
        </div>
      </div>

      <div className={`dt-editor-workspace${showAutofields ? "" : " without-fields"}${instanceMode ? " instance-mode" : ""}`}>
        <main className="dt-page-wrap">
          <div className="dt-a4-page">
            <EditorContent editor={editor} />
          </div>
        </main>
        {showAutofields && <aside className="dt-fields-panel">
          <div className="dt-fields-title">Автозаполнение</div>
          <div className="dt-fields-note">Синие поля защищены. При создании документа они заполнятся из карточки объекта.</div>
          {[...new Set(AUTOFIELD_DEFINITIONS.map(item => item.group))].map(group => (
            <details key={group} open={group === "Договор" || group === "Клиент"}>
              <summary>{group}</summary>
              <div className="dt-field-list">
                {AUTOFIELD_DEFINITIONS.filter(item => item.group === group).map(field => (
                  <button key={field.id} type="button" disabled={!editable} title={field.id} onClick={() => insertField(field)}>
                    <span>{field.kind === "table" ? "▦" : "{}"}</span>{field.label}
                  </button>
                ))}
              </div>
            </details>
          ))}
        </aside>}
      </div>
      <nav className="dt-scroll-rail" aria-label="Навигация по документу">
        <button type="button" title="На экран вверх" aria-label="На экран вверх" onClick={() => scrollByScreen(-1)}>↑</button>
        <input type="range" min="0" max="100" step="1" value={scrollProgress} aria-label="Положение в документе" onChange={event => seekDocument(event.target.value)} />
        <small>{scrollProgress}%</small>
        <button type="button" title="На экран вниз" aria-label="На экран вниз" onClick={() => scrollByScreen(1)}>↓</button>
      </nav>
    </div>
  );
}

function getDocumentScroller(editor) {
  let element = editor?.view?.dom?.parentElement;
  while (element && element !== document.body) {
    const style = window.getComputedStyle(element);
    if (/(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 8) return element;
    element = element.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}
