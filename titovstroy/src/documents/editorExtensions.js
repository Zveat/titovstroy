import { Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import { FontFamily, FontSize, TextStyle } from "@tiptap/extension-text-style";
import { AUTOFIELD_DEFINITIONS } from "./autofields.js";

const FIELD_BY_ID = new Map(AUTOFIELD_DEFINITIONS.map(definition => [definition.id, definition]));

const validField = (fieldId, kind) => {
  const definition = FIELD_BY_ID.get(fieldId);
  return !!definition && (!kind || definition.kind === kind);
};

export const ProtectedField = Node.create({
  name: "protectedField",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return { fieldId: { default: null } };
  },
  parseHTML() {
    return [{
      tag: "span[data-protected-field]",
      getAttrs: element => {
        const fieldId = element.getAttribute("data-field-id");
        return validField(fieldId) ? { fieldId } : false;
      },
    }];
  },
  renderHTML({ node }) {
    if (!validField(node.attrs.fieldId)) return ["span", { "data-invalid-field": "true" }, "Недопустимое поле"];
    return ["span", { "data-protected-field": "true", "data-field-id": node.attrs.fieldId }];
  },
  addCommands() {
    return {
      insertProtectedField: fieldId => ({ commands }) => (
        validField(fieldId)
          ? commands.insertContent({ type: this.name, attrs: { fieldId } })
          : false
      ),
    };
  },
});

export const DataTable = Node.create({
  name: "dataTable",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return { fieldId: { default: null } };
  },
  parseHTML() {
    return [{
      tag: "div[data-document-table]",
      getAttrs: element => {
        const fieldId = element.getAttribute("data-field-id");
        return validField(fieldId, "table") ? { fieldId } : false;
      },
    }];
  },
  renderHTML({ node }) {
    if (!validField(node.attrs.fieldId, "table")) return ["div", { "data-invalid-field": "true" }, "Недопустимая таблица"];
    return ["div", { "data-document-table": "true", "data-field-id": node.attrs.fieldId }];
  },
  addCommands() {
    return {
      insertDataTable: fieldId => ({ commands }) => (
        validField(fieldId, "table")
          ? commands.insertContent({ type: this.name, attrs: { fieldId } })
          : false
      ),
    };
  },
});

export const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  parseHTML() {
    return [{ tag: "div[data-page-break]" }];
  },
  renderHTML() {
    return ["div", { "data-page-break": "true" }];
  },
  addCommands() {
    return { insertPageBreak: () => ({ commands }) => commands.insertContent({ type: this.name }) };
  },
});

export function createTemplateExtensions({ editable = true } = {}) {
  return [
    StarterKit.configure({ link: false, code: false, codeBlock: false, strike: false }),
    TextStyle,
    FontFamily.configure({ types: ["textStyle"] }),
    FontSize.configure({ types: ["textStyle"] }),
    TextAlign.configure({ types: ["heading", "paragraph"], alignments: ["left", "center", "right", "justify"] }),
    Table.configure({ resizable: !!editable }),
    TableRow,
    TableHeader,
    TableCell,
    ProtectedField,
    DataTable,
    PageBreak,
  ];
}
