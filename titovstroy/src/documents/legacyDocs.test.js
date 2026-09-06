import { describe, it, expect, beforeAll } from "vitest";
import { buildContractHtml, buildPodryadHtml, buildAvrHtml, podryadContractToModel } from "./legacyDocs.js";

// СТОРОЖ ЮРИДИЧЕСКОГО ТЕКСТА.
// Тексты договоров, приложений и актов менять нельзя вообще — это правило владельца.
// Тест берёт отпечаток каждого документа ПО ОДНИМ БУКВАМ: цифры и пробелы выброшены,
// поэтому суммы, даты и формат разделителей на него не влияют, а любое изменение
// формулировки — влияет и роняет тест. Если документ поменяли осознанно, отпечаток
// обновляют тем же прогоном и это видно в истории отдельной строкой.
const fingerprint = (html) => {
  const text = String(html).replace(/<[^>]*>/g, " ")      // только видимый текст
    .replace(/&nbsp;|&#\d+;|&[a-z]+;/gi, " ")
    .replace(/[\d\s  .,:%№-]+/g, "");            // цифры/пробелы/пунктуация вон
  let h = 0;
  for (let i = 0; i < text.length; i++) { h = (h * 31 + text.charCodeAt(i)) | 0; }
  return `${text.length}:${(h >>> 0).toString(36)}`;
};

const CONTRAGENTS = [{ id:"ca1", name:'ТОО "TITOVSTROY"', bin:"231040002769", bank:'АО "Kaspi Bank"',
  iik:"KZ123456789012345678", bik:"CASPKZKA", director:"Титов В.Е.", phone:"8707 667 8766",
  address:"Караганда, Ерубаева 1", stampFile:"stamp.jpg" }];
const WORKERS = [{ id:"w1", name:"Федин Иван Евгеньевич", iin:"890921350770", doc:"уд. 123456",
  address:"Караганда", phone:"8776 103 43 48" }];
const CLIENT = { id:"c1", name:"Николай", phone:"87001234567", iin:"900101300123",
  address:"Караганда, Гоголя 5", type:"физ" };
const CONTRACT = { id:"1", type:"repair_fiz", number:"1037", date:"2026-08-31", city:"Караганда",
  clientId:"c1", contragentId:"ca1", objectAddress:"Гоголя 5, кв 10", discount:5, avans:"300000",
  termDays:"45", priceMode:"perline", manualTotal:"",
  works:[{ name:"Демонтаж плитки", quantity:12, unit:"м²", price:3500 },
         { name:"Стяжка пола", quantity:40, unit:"м²", price:2800 },
         { name:"Штукатурка стен", quantity:85.5, unit:"м²", price:2200 }] };
const PODRYAD = { ...CONTRACT, type:"podryad", number:"1017", workerId:"w1",
  mainNumber:"1037", mainDate:"2026-08-31" };
const REPORT = { actNo:"1", actDate:"2026-09-05", clientName:"Николай", clientType:"физ",
  clientIin:"900101300123", address:"Гоголя 5", contractNo:"1037", contractDate:"2026-08-31",
  withStamp:false, lines:[
    { name:"Демонтаж плитки", unit:"м²", qty:12, doneQty:12, price:3500, included:true },
    { name:"Стяжка пола", unit:"м²", qty:40, doneQty:30, price:2800, included:true }] };

beforeAll(() => {
  // Печать вставляется через window — в тестовой среде его нет, хватит заглушки.
  globalThis.window = globalThis.window || { location:{ origin:"https://erp.titovstroy.kz" }, matchMedia:()=>({matches:false}) };
  globalThis.document = globalThis.document || { createElement:()=>({ style:{}, appendChild(){}, click(){} }), body:{ appendChild(){}, removeChild(){} } };
});

describe("юридический текст документов не менялся", () => {
  it("договор ремонта", () => {
    expect(fingerprint(buildContractHtml(CONTRACT, CLIENT, CONTRAGENTS[0], false, ""))).toBe("24539:a8zs86");
  });
  it("договор ремонта — вариант для DOCX", () => {
    expect(fingerprint(buildContractHtml(CONTRACT, CLIENT, CONTRAGENTS[0], true, ""))).toBe("24279:1gcywl7");
  });
  it("договор подряда", () => {
    expect(fingerprint(buildPodryadHtml(podryadContractToModel(PODRYAD, WORKERS[0], false), CONTRAGENTS))).toBe("11520:am8n4a");
  });
  it("акт выполненных работ (форма Р-1)", () => {
    expect(fingerprint(buildAvrHtml(REPORT))).toBe("1363:1l14kmi");
  });
});

describe("документы собираются, а не падают", () => {
  it("печать в договоре подряда не ломает сборку", () => {
    const html = buildPodryadHtml(podryadContractToModel(PODRYAD, WORKERS[0], true), CONTRAGENTS);
    expect(html).toMatch(/договор/i);
    expect(html.length).toBeGreaterThan(5000);
  });
  it("без контрагентов договор подряда всё равно собирается", () => {
    expect(() => buildPodryadHtml(podryadContractToModel(PODRYAD, WORKERS[0], false), [])).not.toThrow();
  });
});
