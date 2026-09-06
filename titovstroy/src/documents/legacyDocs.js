// ГЕНЕРАТОРЫ ДОКУМЕНТОВ (старый, «легаси» путь): договор ремонта, договор подряда,
// акт выполненных работ, выгрузка в DOCX и Google Doc.
//
// ЮРИДИЧЕСКИЙ ТЕКСТ ЗДЕСЬ НЕ МЕНЯЕТСЯ ВООБЩЕ. Перенесено из App.jsx строка в строку:
// снят отступ в два пробела, добавлен export, и три обращения к состоянию заменены
// параметрами (contragents, workers, stamp) — больше ничего.
//
// Эти же функции движок «Шаблонов документов» получает как legacyRenderers /
// legacyExports, поэтому их сигнатуры и поведение обязаны остаться прежними.
import { lineTotal, tengeInWords } from "../utils.js";

export const buildAvrHtml = (m) => {
  const esc = s => String(s == null ? "" : s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const P = l => Number(l.price) || 0, Q = l => Number(l.doneQty) || 0;
  const items = (m.lines || []).filter(l => l.included && Q(l) > 0);
  const money = n => Math.round(Number(n) || 0).toLocaleString("ru-RU");
  const total = items.reduce((s, l) => s + Math.round(P(l) * Q(l)), 0);
  const dateStr = m.actDate ? new Date(m.actDate).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }) : "";
  const dateShort = m.actDate ? m.actDate.split("-").reverse().join(".") : "";
  // Название документа (как у договора: номер + клиент + дата) — от него зависит имя файла
  // при сохранении/печати в PDF (браузер подставляет заголовок вкладки), у голого «АВР №5»
  // не разобрать, чей это акт.
  const docTitle = ("АВР №" + (m.actNo || "б_н") + (m.clientName ? " " + m.clientName : "") + (dateShort ? " от " + dateShort : "")).replace(/[<>:"/\\|?*]/g, "_");
  const rowsHtml = items.map((l, i) => `<tr>
    <td class="c">${i + 1}</td>
    <td>${esc(l.name)}</td>
    <td class="c">${esc(l.unit)}</td>
    <td class="c">${Q(l).toLocaleString("ru-RU")}</td>
    <td class="r">${money(P(l))}</td>
    <td class="r">${money(P(l) * Q(l))}</td>
  </tr>`).join("");
  const stampImg = m.withStamp ? `<img src="${window.location.origin}/stamp.jpg" alt="Печать" style="position:absolute;left:40px;bottom:-140px;width:200px;height:200px;object-fit:contain;opacity:.85;mix-blend-mode:multiply;pointer-events:none"/>` : "";
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(docTitle)}</title>
<style>
*{box-sizing:border-box} body{font-family:'Times New Roman',Georgia,serif;color:#000;background:#fff;margin:0;padding:18mm 14mm}
.form{text-align:right;font-size:10px;color:#444;margin-bottom:4px}
h1{font-size:16px;text-align:center;margin:6px 0 2px;text-transform:uppercase}
.sub{text-align:center;font-size:12px;margin-bottom:14px}
.meta{font-size:12.5px;line-height:1.7;margin-bottom:12px}
.meta b{font-weight:700}
table{width:100%;border-collapse:collapse;font-size:12px;margin-top:6px}
th,td{border:1px solid #000;padding:5px 7px;vertical-align:top}
th{background:#f0f0f0;font-weight:700;text-align:center;font-size:11px}
td.c{text-align:center} td.r{text-align:right;white-space:nowrap}
tfoot td{font-weight:700}
.total-words{font-size:12.5px;margin:12px 0 4px} .total-words b{font-weight:700}
.sign{display:flex;justify-content:space-between;gap:40px;margin-top:34px;font-size:12.5px}
.sign .col{flex:1}
.sign .line{border-bottom:1px solid #000;height:30px;margin-bottom:3px}
.muted{color:#555;font-size:11px}
.np{margin-top:24px;text-align:center}
@media print{.np{display:none}@page{size:A4;margin:0}body{padding:14mm 12mm}}
</style></head><body>
<div class="form">Форма Р-1</div>
<h1>Акт выполненных работ (оказанных услуг)</h1>
<div class="sub">№ ${esc(m.actNo) || "____"} от ${dateStr || "«____» __________ 20__ г."}</div>
<div class="meta">
<div><b>Исполнитель:</b> TitovStroy, БИН 231040002769, WhatsApp +7 707 982 4915</div>
<div><b>Заказчик:</b> ${esc(m.clientName) || "—"}${m.clientIin ? ", ИИН/БИН " + esc(m.clientIin) : ""}${m.address ? ", " + esc(m.address) : ""}</div>
<div><b>Основание (договор):</b> ${m.contractNo ? "№ " + esc(m.contractNo) : "—"}${m.contractDate ? " от " + esc(new Date(m.contractDate).toLocaleDateString("ru-RU")) : ""}</div>
</div>
<table>
<thead><tr>
  <th style="width:36px">№</th><th>Наименование работ (услуг)</th><th style="width:64px">Ед. изм.</th>
  <th style="width:70px">Кол-во</th><th style="width:104px">Цена, ₸</th><th style="width:120px">Стоимость, ₸</th>
</tr></thead>
<tbody>${rowsHtml}</tbody>
<tfoot><tr><td colspan="5" class="r">ИТОГО:</td><td class="r">${money(total)}</td></tr></tfoot>
</table>
<div class="total-words">Всего выполнено работ (оказано услуг) на сумму: <b>${money(total)} ₸</b><br/>(${tengeInWords(total)})</div>
<div class="muted">Сумма указана без НДС. Работы выполнены в полном объёме, заказчик претензий по объёму, качеству и срокам не имеет.</div>
<div class="sign" style="${m.withStamp ? "margin-bottom:170px" : ""}">
<div class="col" style="position:relative"><div><b>Сдал (Исполнитель)</b></div><div class="line"></div><div class="muted">TitovStroy · подпись, дата</div>${stampImg}</div>
<div class="col"><div><b>Принял (Заказчик)</b></div><div class="line"></div><div class="muted">${esc(m.clientName) || "подпись"} · подпись, дата</div></div>
</div>
<div class="np"><button onclick="window.print()" style="padding:12px 32px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:15px;cursor:pointer;font-weight:700;font-family:Arial,sans-serif">🖨 Печать / Сохранить PDF</button></div>
</body></html>`;
};
// Сохранить акт в список отчётов объекта и распечатать

export const podSectionSum = (sec) => {
  if (sec.lumpSum !== "" && sec.lumpSum != null) return Number(sec.lumpSum) || 0;
  return (sec.items || []).reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.qty) || 0), 0);
};

export const podTotal = (m) => {
  if (m.manualTotal !== "" && m.manualTotal != null) return Number(m.manualTotal) || 0;
  return (m.sections || []).reduce((s, sec) => s + podSectionSum(sec), 0);
};
// Открыть построитель договора подряда / приложения

export const buildPodryadHtml = (m, contragents = []) => {
  const esc = s => String(s == null ? "" : s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const money = n => Math.round(Number(n) || 0).toLocaleString("ru-RU");
  const ca = m.__templateCompany || contragents.find(c => c.id === m.contragentId) || contragents[0] || {};
  const w = m.worker || {};
  const dt = m.date ? new Date(m.date) : new Date();
  const dd = String(dt.getDate()).padStart(2, "0"), mm = String(dt.getMonth() + 1).padStart(2, "0"), yy = dt.getFullYear();
  const total = podTotal(m);
  const stampBlock = m.withStamp ? `<div style="margin-top:-6px"><img src="${window.location.origin}/${esc(ca.stampFile||"stamp.jpg")}" alt="Печать" style="width:230px;height:230px;object-fit:contain;opacity:.85;mix-blend-mode:multiply"/></div>` : "";
  // Реквизиты — в два столбца: слева Заказчик (наше ТОО), справа Подрядчик; печать — под подписью директора (не на тексте)
  const zakBody = `<p class="b">Заказчик:</p>
<p>${esc(ca.name || 'ТОО "TITOVSTROY"')}<br/>БИН ${esc(ca.bin || "231040002769")}<br/>Банк: ${esc(ca.bank || 'АО "Kaspi Bank"')}<br/>БИК: ${esc(ca.bik || "CASPKZKA")}<br/>Номер счёта: ${esc(ca.account || "KZ38722S000030058973")}<br/>Юр.Адрес: ${esc(ca.address || "Казахстан, улица Кирпичная, дом 8г")}<br/>Тел.: ${esc(ca.phone || "8707 667 8766")}<br/>Email: ${esc(ca.email || "titovstroy@mail.ru")}<br/>Генеральный директор:</p>
<p>${esc(ca.director || "________")}  ______________ М.П.</p>${stampBlock}`;
  const podBody = `<p class="b">Подрядчик:</p>
<p>ФИО: ${esc(w.name || "___________________")}<br/>ИИН: ${esc(w.iin || "___________")}<br/>№ документа: ${esc(w.doc || "___________")}<br/>Адрес: ${esc(w.address || "")}<br/>Тел.: ${esc(w.phone || "")}<br/>Почта: ${esc(w.email || "")}<br/>Подпись ___________</p>`;
  const reqBlock = `<table class="req"><tr><td>${zakBody}</td><td>${podBody}</td></tr></table>`;
  // Перечень работ — таблица (как Прил.1) или разделы (как Прил.2)
  const worksBlock = (() => {
    if ((m.format || "table") === "sections") {
      return (m.sections || []).map(sec => {
        const items = (sec.items || []).filter(i => (i.name || "").trim());
        const lines = items.map(i => `<p style="margin:1pt 0">- ${esc(i.name)}${i.qty ? ` — ${esc(i.qty)} ${esc(i.unit || "")}` : ""}${(i.price !== "" && i.price != null) ? ` — ${money(i.price)} ₸` : ""}</p>`).join("");
        return `<p class="b" style="margin-top:8pt">${esc(sec.title || "Работы")}:</p>${lines}<p class="b">Стоимость работ: ${money(podSectionSum(sec))} ₸</p>`;
      }).join("");
    }
    // табличный формат. В режиме «за объём» (showLinePrice) — колонки Цена + Сумма (как в редакторе)
    let n = 0;
    const rows = (m.sections || []).flatMap(sec => (sec.items || [])).filter(i => (i.name || "").trim()).map(i => {
      n++;
      const price = Number(i.price) || 0, qty = Number(i.qty) || 0;
      return `<tr><td class="tc">${n}</td><td>${esc(i.name)}</td><td class="tc">${esc(i.qty || "")}</td><td class="tc">${esc(i.unit || "")}</td>${m.showLinePrice ? `<td class="tr">${i.price !== "" && i.price != null ? money(price) : ""}</td><td class="tr">${i.price !== "" && i.price != null ? money(price * qty) : ""}</td>` : ""}</tr>`;
    }).join("");
    return `<table><thead><tr><th style="width:32px">№</th><th>Наименование работ</th><th style="width:60px">Объём</th><th style="width:50px">Ед.</th>${m.showLinePrice ? '<th style="width:88px">Цена, ₸</th><th style="width:100px">Сумма, ₸</th>' : ""}</tr></thead><tbody>${rows}</tbody></table>`;
  })();
  const CSS = `*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Verdana,Geneva,Tahoma,sans-serif;padding:18mm 14mm 18mm 22mm;line-height:1.5;color:#000;font-size:10pt}
p{margin:3pt 0;text-align:justify}.b{font-weight:bold}.c{text-align:center}
h1{font-size:13pt;text-align:center;margin:8pt 0 2pt}.sub{text-align:center;margin-bottom:8pt}
.s{font-weight:bold;text-align:center;margin:10pt 0 4pt}
table{width:100%;border-collapse:collapse;margin:6pt 0;font-size:9pt;table-layout:fixed}
th,td{border:1px solid #000;padding:3pt 5pt;word-wrap:break-word}
th{background:#e5e7eb;font-weight:bold;text-align:center;font-size:9pt}.tc{text-align:center}.tr{text-align:right}
table.req{table-layout:fixed;margin-top:10pt}
table.req td{border:none;width:50%;vertical-align:top;padding:0 14pt 0 0;font-size:9pt}
.pb{page-break-before:always}
.np{margin-top:20px;text-align:center}
@media print{.np{display:none}@page{size:A4;margin:0}body{padding:12mm 12mm 12mm 18mm}tr{page-break-inside:avoid}}`;
  // Тело главного договора (kind==="podryad") — дословный юр-текст
  const mainBody = m.kind !== "podryad" ? "" : `
<h1>Договор подряда №${esc(m.number || "____")}<br/>на выполнение ремонтно-отделочных работ</h1>
<p class="c">г. ${esc(m.city || "Караганда")} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; "${dd}" ${["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"][dt.getMonth()]} ${yy} г.</p>
<p>${esc(w.name || "___________________")} ИИН ${esc(w.iin || "___________")}, № документа: ${esc(w.doc || "___________")}., ${esc(w.docIssuer || "Выдан МВД РК")}, (далее - "подрядчик") с одной стороны, и ${esc(ca.name || "ТОО TITOVSTROY")}, БИН ${esc(ca.bin || "231040002769")} (далее - "заказчик"), в лице директора ${esc(ca.directorFull || ca.director || "________")}, действующего на основании Устава, с одной стороны, совместно именуемые "Стороны", а по отдельности – "Сторона", заключили настоящий Договор о нижеследующем:</p>
<p class="s">1. Предмет договора</p>
<p>1.1. Подрядчик обязуется выполнить по заданию Заказчика работу, и сдать ее результат Заказчику, а Заказчик обязуется принять результат работы и оплатить его. Подробный перечень работ, сроки их выполнения, стоимость и иные условия указываются в Приложении №1 к настоящему договору, которое является его неотъемлемой частью. В случае противоречий между условиями договора и Приложения — применяются условия Приложения.</p>
<p>1.3. Работу Подрядчик выполняет на своем оборудовании и своими инструментами, если иное не оговорено и не утверждено сторонами с отметкой в приложение №1</p>
<p>1.4. Срок выполнения работ с указывается в приложение №1, Любые дополнительные работы выполняются на основании дополнительного соглашения сторон</p>
<p>1.4.1. Подрядчик не вправе привлекать третьих лиц без письменного согласия Заказчика.</p>
<p>1.4.2. Подрядчик обязуется не изменять объем и характер работ без предварительного письменного согласования с Заказчиком. Все изменения фиксируются в дополнительном соглашении или обновлённом Приложении №1.”</p>
<p>1.4.3. Работа считается выполненной после подписания акта приема-сдачи Работы Заказчиком или его уполномоченным представителем.</p>
<p class="s">2. Права и обязанности сторон</p>
<p>2.1. Подрядчик обязан:</p>
<p>2.1.1. Выполнить Работу с надлежащим качеством.</p>
<p>2.1.2. Соблюдать нормы СНиП, технику безопасности и правила работы на объекте.</p>
<p>2.1.3. Подрядчик несёт ответственность за сохранность переданного ему инструмента, материалов и имущества Заказчика.</p>
<p>2.1.4. В случае порчи имущества или оборудования, Подрядчик обязан возместить ущерб в полном объёме.</p>
<p>2.1.5. Подрядчик обязуется не покидать объект до подписания акта приёмки работ или письменного разрешения Заказчика.</p>
<p>2.1.6. Выполнить Работу в срок, указанный в приложение №1 настоящего договора.</p>
<p>2.1.7. Передать результат Работы Заказчику.</p>
<p>2.1.8. Безвозмездно исправить по требованию Заказчика все выявленные недостатки, если в процессе выполнения Работы Подрядчик допустил отступление от условий договора, ухудшившее качество Работы, в течение 3 дней, если иное не оговорено сторонами.</p>
<p>2.1.9. Подрядчик обязан выполнить Работу лично.</p>
<p>2.1.10. В случае выявления дефектов в период гарантийного срока (12 месяцев), Подрядчик обязан устранить их за свой счет в течение 3 рабочих дней, если иное не оговорено сторонами.</p>
<p>2.1.11. Ежедневно отправлять фото- или видеоотчет о ходе работ.</p>
<p>2.1.12. Подрядчик несёт ответственность за действия привлеченных им работников и подрядчиков, если иное не согласовано письменно с Заказчиком.</p>
<p>2.1.13. На объекте запрещено употребление алкоголя, нахождение в состоянии опьянения и курение в неположенных местах. Нарушение — основание для расторжения договора и штраф 50 000 тг.</p>
<p>2.2. Подрядчик имеет право:</p>
<p>2.3. Заказчик обязан:</p>
<p>2.3.1. В течение 7 рабочих дней после получения от Подрядчика извещения об окончании Работы либо по истечении срока, указанного в п. 1.4 настоящего договора, осмотреть и принять результат Работы, а при обнаружении отступлений от договора, ухудшающих результат Работы, или иных недостатков в Работе немедленно заявить об этом Подрядчику.</p>
<p>2.3.2. Оплатить Работу по цене, указанной в приложение №1 настоящего договора, в течение 3 банковских дней с момента приемки результатов Работы.</p>
<p>2.4. Заказчик имеет право:</p>
<p>2.4.1. Во всякое время проверять ход и качество Работы, выполняемой Подрядчиком, не вмешиваясь в его деятельность.</p>
<p class="s">3. Цена договора и порядок расчетов</p>
<p>3.1. Цена и порядок оплаты указываются в Приложении №1. Любые дополнительные работы выполняются на основании дополнительного соглашения сторон.</p>
<p>3.2. Оплата производится по факту выполнения и приемки этапа работ.</p>
<p>3.3. Предоплата не допускается, если иное не оговорено сторонами.</p>
<p>3.4. При выявлении некачественно выполненных работ Заказчик вправе уменьшить сумму оплаты пропорционально качеству выполненного.</p>
<p>3.5. Уплата Заказчиком Подрядчику цены договора осуществляется путем перечисления средств на счет подрядчика и/или наличными, в течение 4 банковских дней после выполнения Подрядчиком Работ в полном объеме, на основании Акта выполненных Работ и предоставления Подрядчиком надлежащим образом оформленного счета на оплату.</p>
<p class="s">4. Ответственность сторон</p>
<p>4.1. Подрядчик несет полную материальную ответственность за ущерб, причиненный Заказчику вследствие некачественного выполнения работ, несоблюдения сроков или повреждения имущества на объекте.</p>
<p>4.2. За нарушение сроков выполнения работ — штраф 2,5% от суммы этапа за каждый день просрочки.</p>
<p>4.3. За отказ от устранения брака — штраф 10% от суммы договора.</p>
<p>4.4. Все удержания производятся из суммы, подлежащей оплате подрядчику.</p>
<p>4.3. Меры ответственности сторон, не предусмотренные в настоящем договоре, применяются в соответствии с нормами действующего законодательства Республики Казахстан.</p>
<p>4.4. Уплата неустойки не освобождает стороны от выполнения лежащих на них обязательств или устранения нарушений.</p>
<p>4.5. Гарантийный срок на выполненные работы составляет 12 месяцев с даты подписания акта приемки.</p>
<p>4.6. Подрядчику запрещается вести переговоры с клиентами Заказчика напрямую, принимать оплату в обход Заказчика, оставлять свои контакты на объекте или использовать бренд Заказчика в личных целях. Нарушение — штраф 500 000 тг.</p>
<p>4.7. Подрядчик несёт ответственность за качество выполненных работ, включая скрытые дефекты, выявленные в течение гарантийного срока.</p>
<p>4.8. При невыполнении или ненадлежащем исполнении обязательств Заказчик имеет право привлечь третьих лиц для устранения недостатков с последующим удержанием стоимости таких работ из суммы, подлежащей выплате Подрядчику</p>
<p>4.9. Подрядчик обязуется не использовать коммерческую информацию, фотографии и материалы объектов Заказчика без письменного разрешения.</p>
<p>4.10. Подрядчик обязуется не принимать заказы от клиентов Заказчика в течение 6 месяцев после окончания работ.</p>
<p class="s">5. Обстоятельства непреодолимой силы</p>
<p>5.1. Стороны несут ответственность за неисполнение, а также ненадлежащее исполнение обязательств по настоящему Договору, в соответствии с законодательством Республики Казахстан и Договором. Ни одна из Сторон не несет ответственность за неисполнение, либо ненадлежащее исполнение каких-либо обязательств по Договору, если такое неисполнение или ненадлежащее исполнение вызвано обстоятельствами непреодолимой силы, которые Сторона не могла ни предвидеть, ни предотвратить разумными мерами.</p>
<p>5.2. К обстоятельствам непреодолимой силы Стороны относят: наводнения, пожары, войны, революции, национализации, изъятия для государственных нужд, издания нормативных правовых или иных обязательных к исполнению актов. Обстоятельствами непреодолимой силы не являются любые действия, вызванные небрежностью или виной Сторон, их уполномоченных лиц, сотрудников, агентов, а также аффилированных лиц.</p>
<p>5.3. В случае возникновения обстоятельств непреодолимой силы, Сторона, подвергшаяся их воздействию, незамедлительно уведомляет об этом другую Сторону в течение 2-х суток, путем вручения либо отправкой по почте письменного уведомления, уточняющего дату начала и описание обстоятельств или сообщения по факсимильной связи или по электронной почте с одного из адресов электронной почты, указанных в Договоре. В случае, если обстоятельства непреодолимой силы препятствуют отправлению такого уведомления, оно должно быть отправлено в рабочий день, следующий за днем окончания воздействия обстоятельств непреодолимой силы.</p>
<p>5.4. Срок исполнения обязательств Сторон по Договору приостанавливается на срок действия обстоятельств непреодолимой силы и возобновляется с даты их прекращения. Соответственно, настоящим Стороны подтверждают, что без дополнительного соглашения между Сторонами, обстоятельства непреодолимой силы не прекращают обязательства Сторон по Договору, а лишь приостанавливают сроки для их исполнения и по окончании воздействия обстоятельств непреодолимой силы Стороны продолжат исполнение обязательств по Договору в соответствии и на условиях, изложенных в нем.</p>
<p>5.5. Доказательством наличия обстоятельств непреодолимой силы служит свидетельство, выданное компетентным органом, организацией, авиаперевозчиком, транспортной организацией. В случае, если наличие обстоятельств непреодолимой силы общеизвестно, Стороны освобождаются от обязанности доказывания их воздействия.</p>
<p>5.6. В случае действия обстоятельств непреодолимой силы в течение 30 (тридцати) суток, любая из Сторон вправе расторгнуть настоящий Договор с обязательным предварительным проведением взаиморасчетов за фактически оказанные услуги, но без обязанностей по возмещению возможных убытков другой Стороны. При воздействии обстоятельств непреодолимой силы Стороны, по возможности, препятствуют разглашению конфиденциальной информации. В случае если разглашение все же произошло, Сторона должна сообщить об этом факте другой Стороне в кратчайший срок, в противном случае не уведомившая о разглашении конфиденциальной информации Сторона несет ответственность без учета воздействия обстоятельств непреодолимой силы.</p>
<p class="s">6. Порядок разрешения споров</p>
<p>6.1. Споры и разногласия, которые могут возникнуть при исполнении настоящего договора, будут по возможности разрешаться путем переговоров между сторонами.</p>
<p>6.2. В случае невозможности разрешения споров путем переговоров все споры, разногласия или требования, возникающие из настоящего контракта (договора) либо в связи с ним, в том числе касающиеся его нарушения, прекращения или недействительности подлежат окончательному урегулированию в суде по месту нахождения Заказчика, претензионный порядок обязателен. Срок рассмотрения претензии — 5 (пять) календарных дней</p>
<p class="s">7. Заключительные положения</p>
<p>7.1. Любые изменения и дополнения к настоящему договору действительны лишь при условии, что они совершены в письменной форме и подписаны уполномоченными на то представителями сторон. Приложения к настоящему договору составляют его неотъемлемую часть.</p>
<p>7.2. Настоящий договор составлен в двух экземплярах на русском языке. Оба экземпляра идентичны и имеют одинаковую силу. У каждой из сторон находится один экземпляр настоящего договора.</p>
<p>7.3. В случае расторжения договора по инициативе одной из сторон, стороны обязуются произвести взаиморасчёты за фактически выполненные и принятые работы. Договор считается расторгнутым после подписания сторонами соглашения о расторжении.</p>
<p>7.4. Договор вступает в силу с даты подписания Сторонами и действует в течение 1 года, а в части взаиморасчетов и предоставления гарантии – до их полного завершения.</p>
<p>7.5. Настоящий Договор подписан в двух экземплярах, по одному для каждой Стороны. Экземпляры идентичны и имеют равную юридическую силу.</p>
<p class="s">8. Юридические адреса сторон и банковские реквизиты</p>
${reqBlock}`;
  // Приложение (для kind==="podryad" — №1 в составе договора; для kind==="annex" — отдельный документ)
  const annexNo = m.kind === "podryad" ? "1" : (m.annexNo || "");
  const annexRefNo = m.kind === "podryad" ? m.number : (m.mainNumber || "");
  const annexRefDate = m.kind === "podryad" ? `«${dd}» ${mm}.${yy} г.` : (m.mainDate ? (() => { const d = new Date(m.mainDate); return `«${String(d.getDate()).padStart(2, "0")}» ${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()} г.`; })() : "«__» __.____ г.");
  const annexBody = `
<h1${m.kind === "podryad" ? ' class="pb"' : ""}>Приложение №${esc(annexNo)}${m.kind === "annex" ? ` от ${dd}.${mm}.${yy}` : ""}<br/>Перечень этапов, видов и стоимость работ</h1>
<p class="sub">к Договору ремонтно-отделочных работ № ${esc(annexRefNo || "____")} от ${annexRefDate}</p>
<p class="b">Общие положения</p>
<p>1.1. Настоящее Приложение является неотъемлемой частью Договора ремонтно-отделочных работ и определяет этапы, виды и стоимость работ, выполняемых Подрядчиком на Объекте.</p>
<p class="b">Перечень этапов и видов работ</p>
<p>Ниже приведен перечень этапов и видов работ, их объемы, сроки выполнения и стоимость</p>
${worksBlock}
<p>2.1. Адрес проведения работ: ${esc(m.objectAddress || "___________________")}</p>
<p class="b">Условия выполнения работ</p>
<p>3.1. В стоимость Работ могут входить расходы Подрядчика на материалы, оборудование, доставку и иные затраты, необходимые для выполнения Работ, если иное прямо указано в договоре.</p>
<p>3.2. Работы выполняются поэтапно в соответствии с указанными сроками.</p>
<p>3.3. Любые дополнительные работы, не предусмотренные настоящим Приложением, выполняются на основании дополнительного соглашения сторон с корректировкой стоимости и сроков.</p>
<p class="b">Порядок оплаты</p>
<p>4.1. Оплата за работы (за исключением предоплаты) производится поэтапно на основании актов выполненных работ (форма КС-2) в течение 3 банковских дней после подписания акта.</p>
${(m.avans !== "" && m.avans != null && Number(m.avans) > 0) ? `<p>4.2. Заказчик оплачивает подрядчику аванс в размере ${money(m.avans)} тг, аванс является возвратным в случае если подрядчик не приступил к выполнению работ в день получения или на следующий день после получения авансового платежа.</p>` : ""}
<p class="b">Общая стоимость работ составляет ${money(total)} ₸</p>
${(m.termDays !== "" && m.termDays != null) ? `<p class="b">Срок выполнения работ составляет ${esc(m.termDays)} календарных дней</p>` : ""}
${reqBlock}`;
  // Название документа (как у договора: номер + подрядчик + дата) — от него зависит имя
  // файла при сохранении/печати в PDF, у голого «Приложение №2» не разобрать, к чему оно.
  const docTitle = (m.kind === "annex"
    ? "Приложение №" + (m.annexNo || "") + (w.name ? " " + w.name : "") + " к Договору №" + (m.mainNumber || "") + " от " + dd + "." + mm + "." + yy
    : "Договор подряда №" + (m.number || "") + (w.name ? " " + w.name : "") + " от " + dd + "." + mm + "." + yy
  ).replace(/[<>:"/\\|?*]/g, "_");
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(docTitle)}</title><style>${CSS}</style></head><body>${mainBody}${annexBody}
<div class="np"><button onclick="window.print()" style="padding:12px 32px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:15px;cursor:pointer;font-weight:700;font-family:Arial,sans-serif">🖨 Печать / Сохранить PDF</button></div>
</body></html>`;
};
// upsert одной производственной карточки (ключ — objectId)
// Удаление карточки — командой (идемпотентно, атомарно).

export const buildContractHtml = (c, client, ca, forDocx=false, stamp="") => {
  const type = c.type || "repair_fiz";
  // Экранирование пользовательских данных в HTML (имена, адреса, названия работ
  // со спецсимволами < > & не должны ломать вёрстку печати или быть XSS)
  const esc = s => String(s==null?"":s).replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));
  const fmtN = n => Math.round(n||0).toLocaleString("ru-RU");
  const fmtDate = s => {
    if(!s) return {d:"__",m:"___________",y:"____",full:"__.__.______"};
    const ms=["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
    const dt=new Date(s+"T00:00:00"); if(isNaN(dt)) return {d:s,m:"",y:"",full:s};
    return {d:String(dt.getDate()).padStart(2,"0"),m:ms[dt.getMonth()],y:String(dt.getFullYear()),full:dt.toLocaleDateString("ru-RU")};
  };
  const dt = fmtDate(c.date);
  const dtM = fmtDate(c.mainDate||c.date);
  const dtA = fmtDate(c.annexDate||c.date);
  const total = (c.works||[]).reduce((s,w)=>s+lineTotal(w.quantity,w.price),0);
  const CSS = forDocx
    ? `*{margin:0;padding:0}
body{font-family:Verdana,Geneva,Tahoma,sans-serif;font-size:10pt;color:#000;line-height:1.5}
p{margin:3pt 0;text-align:justify}
.c{text-align:center}.b{font-weight:bold}.t{font-size:13pt;font-weight:bold;text-align:center;margin:6pt 0}
.s{font-weight:bold;margin:8pt 0 3pt}
.city-line{text-align:center}
table{width:100%;border-collapse:collapse;font-size:8pt;table-layout:fixed}
th,td{border:1px solid #000;padding:2pt 4pt;word-wrap:break-word}
th{background:#e5e7eb;font-weight:bold;text-align:center;font-size:8pt}
.tc{text-align:center}.tr{text-align:right}
.st{width:100%;border-collapse:collapse}
.st td{border:none;vertical-align:top;width:50%;padding:0 8pt 0 0;font-size:9pt}`
    : `*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Verdana,Geneva,Tahoma,sans-serif;padding:20mm 15mm 20mm 30mm;line-height:1.5;color:#000;font-size:10pt}
p{margin:3pt 0;text-align:justify}
.c{text-align:center}.b{font-weight:bold}.t{font-size:13pt;font-weight:bold;text-align:center;margin:6pt 0}
.s{font-weight:bold;margin:8pt 0 3pt}
.city-line{text-align:center;margin:4pt 0}
table{width:100%;border-collapse:collapse;margin:8pt 0;font-size:8pt;table-layout:fixed}
th,td{border:1px solid #000;padding:2pt 4pt;word-wrap:break-word}
th{background:#e5e7eb;font-weight:bold;text-align:center;font-size:8pt}
.tc{text-align:center}.tr{text-align:right}
.st{width:100%;border-collapse:collapse;margin-top:20pt;table-layout:auto}
.st td{border:none;vertical-align:top;width:50%;padding:0 8pt 0 0;font-size:9pt;line-height:1.8}
tr{page-break-inside:avoid}
@media print{.np{display:none}body{padding:10mm 10mm 10mm 20mm}@page{size:A4;margin:0}
tr{page-break-inside:avoid}table{page-break-inside:auto}}`
  const isYur = client?.clientType==="yur" || client?.type==="юр";
  const clName = esc(client?.name||"___________________");
  const clIIN = esc(client?.iin||"___________________");
  const clDoc = esc(client?.doc||"___________________");
  const clDir = esc(client?.director||"");
  const clAddr = esc(client?.address||"___________________");
  const clPhone = esc(client?.phone||"___________________");
  const clShort = esc((() => {
    if(!client?.name) return "___";
    const parts=(client.name||"").split(" ");
    if(isYur) return client.name;
    return parts[0]+" "+(parts[1]?parts[1][0]+".":"")+(parts[2]?parts[2][0]+".":"");
  })());
  const TITOV = {
    name: esc(ca?.name||'ТОО "TITOVSTROY"'),
    bin:  esc(ca?.bin||"231040002769"),
    bank: esc(ca?.bank||'АО "Kaspi Bank"'),
    bik:  esc(ca?.bik||"CASPKZKA"),
    acc:  esc(ca?.account||"KZ38722S000030058973"),
    addr: esc(ca?.address||"Казахстан, район им.Казыбек би, улица Кирпичная, дом 8г"),
    phone:esc(ca?.phone||"8707 667 8766"),
    email:esc(ca?.email||"titovstroy@mail.ru"),
    dir:  esc(ca?.director||"Титов В.Е."),
  };
  const sigBlock = (role1="Подрядчик:", role2="Заказчик:") => {
    let clSigRight = "";
    if(isYur){
      clSigRight = "<b>"+role2+"</b><br><br>"+clName+"<br>БИН: "+clIIN;
      if(client?.bank) clSigRight += "<br>Банк: "+esc(client.bank);
      if(client?.bik)  clSigRight += "<br>БИК: "+esc(client.bik);
      if(client?.account) clSigRight += "<br>ИИК: "+esc(client.account);
      if(clAddr)  clSigRight += "<br>Юр.Адрес: "+clAddr;
      if(clPhone) clSigRight += "<br>Тел.: "+clPhone;
      if(client?.email) clSigRight += "<br>Почта: "+esc(client.email);
      if(client?.director) clSigRight += "<br><br>Директор:<br>"+esc(client.directorShort||client.director)+" ____________________  М.П.";
    } else {
      clSigRight = "<b>"+role2+"</b><br><br>ФИО: "+clName+"<br>ИИН: "+clIIN+"<br>№ документа: "+clDoc+"<br>Адрес: "+clAddr+"<br>Тел.: "+clPhone+"<br><br>"+clShort+" Подпись ___________";
    }
    const tbl = '<table class="st"><tr>';
    const td1 = "<td><b>"+role1+"</b><br>"+TITOV.name+"<br>БИН "+TITOV.bin+"<br>Банк: "+TITOV.bank+"<br>БИК: "+TITOV.bik+"<br>Номер счёта: "+TITOV.acc+"<br>Юр.Адрес: "+TITOV.addr+"<br>Тел.: "+TITOV.phone+"<br>Email: "+TITOV.email+"<br><br>Генеральный директор:<br>"+TITOV.dir+" _______________ "+(stamp ? '<img src="'+stamp+'" style="width:200px;height:200px;object-fit:contain;vertical-align:middle;margin-left:6px;opacity:0.85;mix-blend-mode:multiply" alt=\"М.П.\"/>' : "М.П.")+"</td>";
    const td2 = "<td>"+clSigRight+"</td>";
    return tbl+td1+td2+"</tr></table>";
  };
  const worksTable = () => {
    const works = c.works||[];
    const catOrder = [], catMap = {};
    works.forEach(w=>{
      const cat = w.category||"Работы";
      if(!catMap[cat]){ catMap[cat]={total:0,rows:[]}; catOrder.push(cat); }
      const sum = w.priceFrom ? 0 : Number(w.quantity||0)*Number(w.price||0);
      catMap[cat].total += sum;
      catMap[cat].rows.push(Object.assign({},w,{sum:sum}));
    });
    const multiCat = catOrder.length > 1;
    // For DOCX: use width="" attribute which html-docx-js respects
    const thW = forDocx
      ? (w,txt,align) => "<th width=\""+w+"\" style=\"width:"+w+";font-size:7.5pt;background:#e5e7eb;font-weight:bold;text-align:"+(align||"center")+";border:1px solid #000;padding:2pt 3pt\">"+txt+"</th>"
      : (w,txt,align) => "<th style=\"width:"+w+";text-align:"+(align||"center")+"\">" + txt + "</th>";
    let html = "<table"+(forDocx ? ' width="100%" style="table-layout:fixed;width:100%;border-collapse:collapse;font-size:8pt"' : "")+">"+"<thead><tr>"
      + thW("5%","\u2116")
      + thW("45%","\u041d\u0430\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u043d\u0438\u0435 \u0440\u0430\u0431\u043e\u0442","left")
      + thW("8%","\u0415\u0434.")
      + thW("8%","\u041e\u0431\u044a\u0451\u043c")
      + thW("17%","\u0426\u0435\u043d\u0430 \u0437\u0430 \u0435\u0434.")
      + thW("17%","\u0421\u0443\u043c\u043c\u0430")
      + "</tr></thead><tbody>";
    let globalNum = 0;
    catOrder.forEach(function(cat){
      const {rows, total: catTotal} = catMap[cat];
      html += "<tr><td colspan=\"6\" style=\"background:#e5e7eb;color:#d97706;font-weight:bold;font-size:9pt;padding:3pt 5pt\">"
        + esc(cat) + " \u2014 " + fmtN(catTotal) + " \u20b8</td></tr>";
      let lastSub = "";
      rows.forEach(function(w,i){
        if(w.subcategory && w.subcategory !== lastSub){
          lastSub = w.subcategory;
          html += "<tr><td colspan=\"6\" style=\"background:#e5e7eb;color:#2563eb;font-style:italic;font-size:8.5pt;padding:2pt 5pt\">"
            + esc(w.subcategory) + "</td></tr>";
        }
        globalNum++;
        const bg = i%2===0 ? "#f3f4f6" : "#e2e8f0";
        const tdS = forDocx ? ";line-height:1.1;mso-line-height-rule:exactly" : "";
        html += "<tr style=\"background:" + bg + "\">"
          + (forDocx ? '<td width="5%"' : '<td') + ' class="tc" style="font-size:8pt'+tdS+'">' + globalNum + "</td>"
          + (forDocx ? '<td width="45%"' : '<td') + ' style="font-size:8pt'+tdS+'">' + esc(w.name||"") + "</td>"
          + (forDocx ? '<td width="8%"' : '<td') + ' class="tc" style="font-size:8pt'+tdS+'">' + (w.unit||"\u043c\xb2") + "</td>"
          + (forDocx ? '<td width="8%"' : '<td') + ' class="tc" style="font-size:8pt'+tdS+'">' + (w.quantity||"") + "</td>"
          + (forDocx ? '<td width="17%"' : '<td') + ' class="tr" style="font-size:8pt'+tdS+'">' + (w.priceFrom ? "\u043e\u0442 "+fmtN(w.priceFrom)+" \u20b8" : fmtN(w.price) + " \u20b8") + "</td>"
          + (forDocx ? '<td width="17%"' : '<td') + ' class="tr" style="font-size:8pt;font-weight:bold'+tdS+'">' + (w.priceFrom ? "\u0443\u0442\u043e\u0447\u043d\u044f\u0435\u0442\u0441\u044f" : fmtN(w.sum) + " \u20b8") + "</td>"
          + "</tr>";
      });
      html += "<tr style=\"background:#f3f4f6\">"
        + "<td colspan=\"5\" class=\"tr\" style=\"font-style:italic;font-size:9pt\">\u0418\u0442\u043e\u0433\u043e \u043f\u043e \u0440\u0430\u0437\u0434\u0435\u043b\u0443 \u00ab" + cat + "\u00bb:</td>"
        + "<td class=\"tr\" style=\"font-weight:bold\">" + fmtN(catTotal) + " \u20b8</td>"
        + "</tr>";
    });
    html += "</tbody></table>";
    if(multiCat){
      html += "<table style=\"margin-top:6pt;width:60%;margin-left:40%\"><tbody>";
      html += "<tr><td colspan=\"2\" style=\"background:#e5e7eb;font-weight:bold;font-size:9pt\">\u0421\u0432\u043e\u0434\u043a\u0430 \u043f\u043e \u0440\u0430\u0437\u0434\u0435\u043b\u0430\u043c</td></tr>";
      catOrder.forEach(function(cat){
        html += "<tr><td style=\"font-size:9pt\">" + cat + "</td><td class=\"tr\" style=\"font-weight:bold;font-size:9pt\">" + fmtN(catMap[cat].total) + " \u20b8</td></tr>";
      });
      if(c.discount>0){
        const discAmt=Math.round(total*c.discount/100);
        html += "<tr><td style=\"font-size:9pt;color:#c00\">\u0421\u043a\u0438\u0434\u043a\u0430 "+c.discount+"%</td><td class=\"tr\" style=\"font-size:9pt;color:#c00\">\u2212 "+fmtN(discAmt)+" \u20b8</td></tr>";
        html += "<tr style=\"background:#e5e7eb\"><td style=\"font-weight:bold\">\u0418\u0422\u041e\u0413\u041e \u0441\u043e \u0441\u043a\u0438\u0434\u043a\u043e\u0439:</td>"
          + "<td class=\"tr\" style=\"font-weight:bold;font-size:11pt\">" + fmtN(total-discAmt) + " \u20b8</td></tr>";
      } else {
        // Новые договоры: скидка уже разнесена по позициям, вычитать нечего —
        // но клиент должен видеть, что скидка дана.
        if(c.discountApplied>0){
          html += "<tr><td style=\"font-size:9pt;color:#c00\">\u0412 \u0446\u0435\u043d\u0430\u0445 \u0443\u0447\u0442\u0435\u043d\u0430 \u0441\u043a\u0438\u0434\u043a\u0430 "+c.discountApplied+"%</td><td class=\"tr\" style=\"font-size:9pt;color:#c00\"></td></tr>";
        }
        html += "<tr style=\"background:#e5e7eb\"><td style=\"font-weight:bold\">\u0418\u0422\u041e\u0413\u041e:</td>"
          + "<td class=\"tr\" style=\"font-weight:bold;font-size:11pt\">" + fmtN(total) + " \u20b8</td></tr>";
      }
      html += "</tbody></table>";
    } else {
      if(c.discount>0){
        const discAmt=Math.round(total*c.discount/100);
        html += "<p class=\"tr\" style=\"font-size:9pt;color:#c00;padding-top:4pt\">\u0421\u043a\u0438\u0434\u043a\u0430 "+c.discount+"%: \u2212 "+fmtN(discAmt)+" \u20b8</p>";
        html += "<p class=\"tr\" style=\"font-weight:bold;font-size:11pt\">\u0418\u0422\u041e\u0413\u041e \u0441\u043e \u0441\u043a\u0438\u0434\u043a\u043e\u0439: " + fmtN(total-discAmt) + " \u20b8</p>";
      } else {
        if(c.discountApplied>0){
          html += "<p class=\"tr\" style=\"font-size:9pt;color:#c00;padding-top:4pt\">\u0412 \u0446\u0435\u043d\u0430\u0445 \u0443\u0447\u0442\u0435\u043d\u0430 \u0441\u043a\u0438\u0434\u043a\u0430 "+c.discountApplied+"%</p>";
        }
        html += "<p class=\"tr\" style=\"font-weight:bold;font-size:11pt;padding-top:4pt\">\u0418\u0422\u041e\u0413\u041e: " + fmtN(total) + " \u20b8</p>";
      }
    }
    return html;
  };
  const preambula = (role="Подрядчик") => {
    const tit = esc(ca?.name||"ТОО TITOVSTROY")+", БИН "+esc(ca?.bin||"231040002769")+" (далее — \""+role+"\"), в лице директора "+esc(ca?.director||"________")+", действующего на основании Устава";
    const tail = "совместно именуемые \"Стороны\", а по отдельности – \"Сторона\", заключили настоящий документ о нижеследующем:";
    if(isYur){
      const clLine = clName+", БИН "+clIIN+" (далее — \"Заказчик\") в лице "+esc(client?.director||"Директора")+", "+esc(client?.directorShort||client?.director||"")+", действующего на основании Устава, с другой стороны, "+tail;
      return "<p>"+tit+", с одной стороны, и</p><p>"+clLine+"</p>";
    }
    const cl = clName+", ИИН "+clIIN+", № документа "+clDoc+", Выдан МВД РК, (далее — \"Заказчик\") с одной стороны, и";
    return "<p>"+cl+"</p><p>"+tit+", с другой стороны, "+tail+"</p>";
  };
  let body = "";
  // ─────── 1 & 2. ДОГОВОР РЕМОНТА (ФИЗ / ЮР) ───────
  if(type==="repair_fiz"){
    const annex1 = `<div style="page-break-before:always;mso-break-type:page-break">
<p class="t">Приложение №1</p>
<p class="c b">Перечень этапов, видов и стоимость работ</p>
<p class="c">к Договору ремонтно-отделочных работ</p>
<p class="c">№${c.number||"___"} от «${dt.d}» ${dt.m} ${dt.y} г.</p><br>
<p class="s">1. Общие положения</p>
<p>1.1. Настоящее Приложение является неотъемлемой частью Договора ремонтно-отделочных работ №${c.number||"___"} от «${dt.d}» ${dt.m} ${dt.y} г. и определяет этапы, виды и стоимость ремонтно-отделочных работ, выполняемых Подрядчиком на Объекте.</p>
<p class="s">2. Перечень этапов и видов работ</p>
<p>Ниже приведен перечень этапов и видов работ, их объемы, сроки выполнения и стоимость:</p>
${worksTable()}
<p class="s">3. Условия выполнения работ</p>
<p>3.1. В стоимость Работ могут входить расходы Подрядчика на материалы, оборудование, доставку и иные затраты, необходимые для выполнения Работ, если иное прямо указано в договоре. В случае если материалы, оборудование, инструменты, субподряд предоставляет Заказчик, Подрядчик не несет ответственности за их качество, комплектность и соответствие проектным требованиям.</p>
<p>3.2. Работы выполняются поэтапно в соответствии с указанными сроками.</p>
<p>3.3. Любые дополнительные работы, не предусмотренные настоящим Приложением, выполняются на основании дополнительного соглашения сторон с корректировкой стоимости и сроков.</p>
<p class="s">4. Порядок оплаты</p>
<p>4.1. При заключении договора заказчик вносит предоплату (аванс) в размере ${c.advancePercent??30}% (${fmtN(Math.round(total*(c.advancePercent??30)/100))} тенге), которая идет в зачет основной суммы договора, при расторжении договора предоплата возврату не подлежит.</p>
<p>4.2. Оплата за работы (за исключением предоплаты) производится поэтапно на основании актов выполненных работ (форма КС-2) в течение 2 банковских дней после подписания акта.</p>
<p class="s b">Общая стоимость работ составляет ${fmtN(total)} ₸</p><br>
${sigBlock("Подрядчик:", "Заказчик:")}
</div>`;
    body = `
<p class="t">Договор подряда №${c.number||"___"}</p>
<p class="c b">на выполнение ремонтно-отделочных работ</p>
<p class="city-line">${dt.full} г.&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Караганда</p><br>
${preambula("Подрядчик")}
<p class="s">1. ТЕРМИНЫ И ОПРЕДЕЛЕНИЯ</p>
<p>1.1. Настоящий Договор содержит следующие термины и определения:</p>
<p>1.1.1. Договор – настоящий договор подряда со всеми приложениями и дополнениями к нему, заключенными в период его действия, подписанными Заказчиком и Подрядчиком, и являющимися его неотъемлемой частью.</p>
<p>1.1.2. Объект – ${client?.objectType||"наименование объекта"} по адресу: ${clAddr}, где Подрядчик обязуется выполнить Работы в соответствии с настоящим Договором.</p>
<p>1.1.3. Заказчик – юридическое или физическое лицо, указанное в преамбуле Договора, которое заказывает у Подрядчика выполнение работ.</p>
<p>1.1.4. Подрядчик – юридическое лицо, определенное в преамбуле настоящего Договора, выполняющий подрядные, ремонтно-отделочные работы и иные работы не требующие лицензирование в соответствие с законодательством Республики Казахстан.</p>
<p>1.1.5. Работы – комплекс ремонтно-отделочных и иных работ, установленный в Приложении №1 «Перечень этапов, видов и стоимость работ», который должен быть выполнен в соответствии с условиями настоящего Договора</p>
<p>1.1.6. Субподрядчик – третье лицо, занимающееся предпринимательской деятельностью, привлекаемое Подрядчиком для выполнения части Работ, предусмотренных настоящим Договором. В случае если характер Работ требует наличия лицензии или иных разрешительных документов в соответствии с законодательством Республики Казахстан, Подрядчик обязуется привлекать субподрядчиков, имеющих соответствующие лицензии/разрешения..</p>
<p>1.1.7. Строительная площадка – территория, используемая для размещения Объекта, временных зданий и сооружений, спецтехники, оборудования, складирования материалов, инструментов, инвентаря и оборудования, выполнения Работ.</p>
<p>1.1.8. Временные здания и сооружения – здания, строения и сооружения, необходимые для обеспечения строительства и предназначенные для выполнения производственных процессов, размещения и хранения материальных ценностей или временного пребывания (перемещения) людей, грузов, а также размещения (прокладки, проводки) оборудования или коммуникаций. После окончания строительства временные здания и сооружения подлежат ликвидации. Используемые для строительства здания, сооружения или помещения, входящие в состав Объекта строительства, к временным зданиям (сооружениям) не относятся.</p>
<p>1.1.9. Авторский надзор – правомочия автора по осуществлению контроля за разработкой строительной документации Объекта, а также реализацией проекта строительства.</p>
<p>1.1.10. Проектно-сметная документация – документация, содержащая объемно-планировочные, конструктивные, технологические, инженерные, природоохранные, экономические и иные решения, а также сметные расчеты для организации и ведения строительства.</p>
<p>1.1.11. Исполнительная документация – комплект рабочих чертежей на строительство объекта с надписями о соответствии выполненных в натуре работ этим чертежам или внесенным в них изменениям, сделанными лицами, ответственными за производство работ, сертификаты, технические паспорта и др. документы, удостоверяющие качество материалов, акты об освидетельствовании скрытых работ, журналы работ, акты промежуточной и окончательной приемки, проведенных испытаний систем и др.</p>
<p>1.1.12. Материалы – все строительные материалы, включая технологическое, техническое и инженерное оборудование и системы, детали, элементы и конструкции, которые должны быть использованы для выполнения Работ на Объекте, и соответствовать утвержденной проектной и сметной документации, условиями настоящего Договора, нормативно-правовым и нормативным документам РК (строительные нормы, строительные правила, ГОСТ и др.).</p>
<p>1.1.13. Оборудование Подрядчика – совокупность спецтехники, машин, механизмов, приборов, устройств, инструментов и инвентаря, используемых Подрядчиком для выполнения Работ на Объекте.</p>
<p>1.1.14. Недостатки Работ – все недостатки, недоработки, недоделки, дефекты (в том числе скрытые), допущенные Подрядчиком и выявленные Заказчиком в ходе выполнения Работ, в процессе приемки выполненных Работ, или в гарантийный период. А также любые обязательства, исполненные Подрядчиком с нарушениями или с несоответствием законодательству РК, условиям настоящего Договора, проектно-сметной документации Объекта, и действующим на территории РК нормативным документам, в том числе строительным нормам и техническим регламентам. Подрядчик не несет ответственности за недостатки, возникшие по вине Заказчика, третьих лиц или в результате форс-мажора.</p>
<p>1.1.15. Сроки выполнения Работ – временной период, установленный настоящим Договором, в течение которого Подрядчик обязан выполнить Работы.</p>
<p>1.1.16. Гарантийный срок – период времени, установленный настоящим Договором (1 год), в течение которого Заказчик вправе предъявить Подрядчику претензии в связи с недостатками результатов выполненных им Работ, а Подрядчик обязан в срок, установленный Договором или нормами закона, устранить указанные недостатки, если они возникли по его вине.</p>
<p class="s">2. ПРЕДМЕТ ДОГОВОРА</p>
<p>2.1. По настоящему Договору Подрядчик обязуется по заданию Заказчика выполнить комплекс ремонтно-отделочных[ работ, установленный в Приложении №1 «Перечень видов и этапов работ», а Заказчик обязуется создать Подрядчику необходимые условия для выполнения Работ, принять их результат и уплатить обусловленную цену в соответствии со ст. 651 ГК РК.</p>
<p>2.2. Подрядчик обязан выполнить Работы, предусмотренные настоящим Договором, в соответствии с проектной документацией, определяющей объем и содержание работ и другие предъявляемые к работам требования, и сметой, определяющей цену Работ, действующими нормативно-правовыми и нормативными документами и регламентами, законодательством РК, условиями настоящего Договора и содержанием Приложения №1.</p>
<p>2.3. Подрядчик гарантирует наличие всех полномочий, финансовых, материальных, трудовых и иных ресурсов.</p>
<p class="s">3. ПРАВА И ОБЯЗАННОСТИ СТОРОН</p>
<p class="b">3.1. Заказчик обязан:</p>
<p>3.1.1. Оплачивать Работы в соответствии с условиями настоящего Договора и в установленные сроки.</p>
<p>3.1.2. Принимать выполненные Работы в соответствии с условиями настоящего Договора и требованиями нормативных документов, действующих на территории РК.</p>
<p>3.1.3. Осуществлять контроль и технический надзор за ходом и качеством выполняемых Работ, соблюдением сроков их выполнения, качеством предоставленных Подрядчиком материалов (если подрядчик их предоставляет), не вмешиваясь при этом в оперативно-хозяйственную деятельность Подрядчика.</p>
<p>3.1.4. Обеспечить ведение Авторского надзора за соответствием выполняемых работ проектной документации Объекта.</p>
<p>3.1.5. Немедленно заявлять Подрядчику о выявленных при осуществлении контроля и технического надзора за выполнением Работ отступлениях от условий Договора, которые могут ухудшить качество Работ, или иных их недостатках. Если Заказчик не сделает такого заявления в течение 2 дней, то он теряет право в дальнейшем ссылаться на обнаруженные им недостатки.</p>
<p>3.1.6. Оплатить стоимость выполненных Работ и (или) восстановительных работ в случае разрушения или повреждения Объекта в целом или в части выполняемых Подрядчиком Работ вследствие непреодолимой силы до истечения установленного Договором срока сдачи Работ.</p>
<p>3.1.7. Предоставить Подрядчику беспрепятственный доступ на Строительную площадку и обеспечить необходимые разрешения на работы в охранных зонах инженерных сетей.</p>
<p class="b">3.2. Заказчик вправе:</p>
<p>3.2.1. Требовать внесения изменений в проектно-сметную документацию, не связанных с дополнительными расходами для Подрядчика и увеличением сроков выполнения Работ. Изменения проектно-сметной документации, требующие дополнительных расходов для Подрядчика, осуществляются за счет Заказчика на основе согласованной сторонами дополнительной сметы в течение 5 дней.</p>
<p>3.2.2. Немедленно заявить Подрядчику об обнаружении при осуществлении контроля и надзора за выполнением Работ отступления от условий Договора, которые могут ухудшить качество Работ, или иные недостатки в них.</p>
<p>3.2.3. Требовать от Подрядчика устранения выявленных недостатков Работ на любом этапе: в ходе выполнения Работ, при приемке результатов Работ частями или Объекта в целом, при вводе Объекта в эксплуатацию, а также в гарантийный период, с предоставлением обоснования.</p>
<p class="b">3.3. Подрядчик обязан:</p>
<p>3.3.1. Выполнить Работы с надлежащим качеством, в установленные Договором сроки.</p>
<p>3.3.2. До начала производства Работ назначить и уполномочить соответствующей доверенностью лицо, ответственное за выполнение Подрядчиком Работ на Объекте.</p>
<p>3.3.3. Незамедлительно сообщить Заказчику об обнаружении не учтенных в проектно-сметной документации работ и, в связи с этим, необходимости выполнения дополнительных Работ и, соответственно, увеличения сметной стоимости Работ. При неполучении от Заказчика ответа на свое сообщение в течение 2 дней, Подрядчик вправе приостановить выполнение Работ с отнесением убытков, вызванных простоем (включая оплату простоя работников и оборудования), на счет Заказчика. Подрядчик, не выполнивший обязанности, установленные настоящим пунктом, лишается права требовать от Заказчика оплаты выполненных им дополнительных работ и возмещения вызванных этим убытков, если не докажет необходимости немедленных действий в интересах Заказчика.</p>
<p>3.3.4. Обеспечить выполнение Работ качественными материалами и оборудованием, в том числе деталями и конструкциями, соответствующими требованиям ГОСТ, строительным нормам, строительным правилам, техническим условиям и регламентам, экологическим, противопожарным и другим требованиям, стандартам, нормам и правилам, действующим на территории РК, если заказчик не берет ответственность за материалы и оборудование на себя, в таком случае полную и дальнейшую ответственность несет сам заказчик.</p>
<p>3.3.5. В процессе выполнения Работ осуществлять постоянный входной контроль строительных материалов, оборудования, монтажной оснастки, определяющий их соответствие проектно-сметной документации, а также требованиям распространяющихся на них ГОСТ, строительных норм, иных норм, правил, стандартов и технических условий.</p>
<p>3.3.6. При выполнении Работ соблюдать требования закона и иных правовых актов об охране окружающей среды и о безопасности строительных работ.</p>
<p>3.3.7. Обеспечить соблюдение на Объекте правил техники безопасности, противопожарной безопасности, электробезопасности и промышленной санитарии, своевременный вывоз мусора и соблюдение чистоты, иных правил и регламентов, действующих в РК.</p>
<p>3.3.8. Привлечь к выполнению Работ квалифицированных работников, обеспечить их всеми необходимыми инструментами.</p>
<p>3.3.9. Обеспечить беспрепятственный доступ Заказчика и его уполномоченных представителей, а также представителей технического и авторского надзора к выполняемым Работам.</p>
<p>3.3.10. Исполнять полученные указания Заказчика, если такие указания не противоречат условиям Договора и не представляют собой вмешательство в оперативно-хозяйственную деятельность Подрядчика.</p>
<p>3.3.11. Выполнять Работы в разрешенное законом РК время и без превышения допустимого уровня шума.</p>
<p>3.3.12. При выполнении Работ использовать качественные средства измерения, обеспечивающие максимальную точность и достоверность выполняемых измерений и соответствующие требованиям, предъявляемым к ним нормативными актами РК в части наличия всех необходимых регистраций, поверок, аттестаций.</p>
<p>3.3.13. Уведомлять Заказчика обо всех обстоятельствах, которые могут повлиять на исполнение настоящего Договора, за исключением тех, что вызваны действиями Заказчика.</p>
<p>3.3.14. Безвозмездно, в установленные сроки, устранять выявленные несоответствия Работ на любом этапе: в ходе выполнения Работ, при приемке результатов Работ частями или Объекта в целом, при вводе Объекта в эксплуатацию, а также в гарантийный период, только если недостатки возникли по вине подрядчика.</p>
<p>3.3.15. Выполнять Работы с соблюдением правил проведения работ в охранных зонах инженерных сетей. Согласовать выполнение Работ с владельцами инженерных сетей.</p>
<p>3.3.16. В случаях, когда это предусмотрено законом либо вытекает из характера выполняемых Работ и используемых материалов, обеспечить проведение предварительных испытаний и экспертиз в соответствии с регламентирующими их проведение нормативными документами РК.</p>
<p>3.3.17. После окончания Работ вывезти с территории Объекта оборудование Подрядчика, обеспечить очистку территории производства Работ, сбор и вывоз всех отходов и строительного мусора (если это предусмотрено отдельным соглашением с Заказчиком).</p>
<p>3.3.18. После окончания Работ на Объекте передать Заказчику исполнительную документацию на выполненные Работы в течение 10 дней.</p>
<p class="b">3.4. Подрядчик вправе:</p>
<p>3.4.1. Требовать пересмотра стоимости Работ, если по не зависящим от Подрядчика причинам стоимость Работ превысила смету.</p>
<p>3.4.2. Требовать возмещения расходов, понесенных Подрядчиком в связи с установлением и устранением дефектов в проектно-сметной документации, предоставленной Заказчиком.</p>
<p>3.4.3. Приостановить выполнение Работ в случаях, предусмотренных законами РК и условиями настоящего Договора, с уведомлением Заказчика за 2 дня и отнесением убытков на Заказчика.</p>
<p>3.4.4. Отказаться от выполнения дополнительных работ в случае, когда они не входят в сферу профессиональной деятельности Подрядчика либо не могут быть выполнены Подрядчиком по независящим от него причинам, без ответственности за простои.</p>
<p>3.4.5. Привлекать к исполнению своих обязательств субподрядчиков без предварительного согласия Заказчика.</p>
<p>3.4.6. Расторгнуть Договор и требовать возмещения понесенных убытков в случае нарушения Заказчиком существенных условий настоящего Договора (включая просрочку оплаты более 3 дней), с уведомлением за 2 дня. А также и взыскать неустойку/штраф за просрочку оплаты.</p>
<p class="s">4. СТОИМОСТЬ, СРОКИ И ПОРЯДОК ОПЛАТЫ РАБОТ</p>
<p>4.1. Общая стоимость работ а также сроков и порядок оплаты, определяется в соответствии с Приложением №1 «Перечень видов и этапов работ».</p>
<p>4.2. Стоимость каждой единицы Работ, установленная в Приложении №1 «Перечень видов и этапов работ», является твердой и изменению не подлежит, за исключением случаев, предусмотренных п. 3.4.1.</p>
<p>4.3. Общая сумма Договора складывается из общей стоимости выполненных Подрядчиком и принятых Заказчиком Работ, включает все платежи Подрядчика в бюджет, все расходы Подрядчика, понесенные им в целях исполнения Договора, а также вознаграждение Подрядчика.</p>
<p>4.4. Заказчик оплачивает выполненные Работы по факту их завершения и подписания актов приемки в течение 2 банковских дней на основании подписанных Сторонами актов выполненных работ.</p>
<p>4.5. Все расчеты Сторон по Договору производятся в тенге, в безналичном порядке.</p>
<p>4.6. В случае, если фактические расходы Подрядчика оказались меньше тех, которые учитывались при определении стоимости Работ, Подрядчик сохраняет право на оплату работ по Стоимости, установленной настоящим Договором. Заказчик не вправе требовать снижения цены без доказательства снижения качества.</p>
<p>4.7. Подрядчик предоставляет Заказчику счет-фактуру, а также иные, требуемые правилами бухгалтерского учета, документы.</p>
<p class="s">5. СРОКИ ВЫПОЛНЕНИЯ РАБОТ</p>
<p>5.1. Подрядчик обязан выполнить Работы в соответствии с Приложением №1 «Перечень видов и этапов работ»</p>
<p>5.2. Сроки выполнения Работ могут быть изменены по соглашению Сторон до начала или в процессе производства Работ, с уведомлением. Задержки, вызванные Заказчиком (включая несвоевременную оплату или предоставление документации), продлевают сроки без ответственности Подрядчика.</p>
<p>5.3. Подрядчик несет ответственность за нарушение всех установленных в Договоре сроков выполнения Работ только в случае отсутствия вины Заказчика.</p>
<p class="s">6. ПОРЯДОК ВЫПОЛНЕНИЯ РАБОТ</p>
<p>6.1. Подрядчик выполняет работы поэтапно, в соответствии с Приложением №1 «Перечень видов и этапов работ».</p>
<p>6.2. Заказчик разрешает Подрядчику пользоваться всей территорией Объекта для выполнения Работ по настоящему Договору, включая хранение материалов и оборудования.</p>
<p>6.3. После завершения всех Работ, предусмотренных настоящим Договором, Подрядчик письменно Заказчика о завершении работ и вызывает его для участия в приемке Работ в течение 2 дней.</p>
<p class="s">7. ПОРЯДОК СДАЧИ-ПРИЕМКИ ВЫПОЛНЕННЫХ РАБОТ</p>
<p>7.1. Приемка выполненных Работ осуществляется после завершения Подрядчиком каждого этапа Работ, предусмотренных настоящим Договором.</p>
<p>7.2. Заказчик, получив сообщение Подрядчика о готовности к сдаче Работ, обязан немедленно приступить к приемке их результатов в течение 2 дней.</p>
<p>7.3. Заказчик организует и осуществляет приемку результатов Работ за свой счет.</p>
<p>7.4. Заказчик обязан с участием Подрядчика осмотреть и принять результаты выполненных Работ, а при обнаружении отступлений от Договора, ухудшающих Работы, или иных недостатков немедленно заявить Подрядчику об этом в письменной форме с обоснованием.</p>
<p>7.5. В случаях, когда это предусмотрено законодательными актами либо вытекает из характера Работ, приемке результатов Работ должны предшествовать предварительные испытания. В этих случаях приемка результатов Работ может осуществляться только при положительном результате предварительных испытаний. Испытания должны быть проведены в строгом соответствии с регламентирующими СНиП и ГОСТ РК.</p>
<p>7.6. Сдача результата Работ Подрядчиком и приемка его Заказчиком оформляются актом о приемке выполненных работ, подписываемым обеими Сторонами. При отказе одной из сторон от подписания акта, в нем делается отметка об этом и акт подписывается другой Стороной.</p>
<p>7.7. В случае приемки Заказчиком Работ без проверки, Заказчик лишается права ссылаться на недостатки Работ, которые могли быть установлены при обычном способе их приемки (явные недостатки).</p>
<p>7.8. Подрядчик обязан исправить все выявленные дефекты и недостатки Работ в разумный срок, установленный Подрядчиком и согласованный с Заказчиком.</p>
<p>7.9. Заказчик вправе полностью отказаться от приемки результата Работ в случае обнаружения недостатков, которые исключают возможность его дальнейшей целевой эксплуатации и не могут быть устранены Подрядчиком или Заказчиком (только при наличии заключения независимой экспертизы).</p>
<p>7.10. Заказчик обязан принять результаты Работ и подписать Акт выполненных работ в течение 2 дней, либо дать в те же сроки обоснованный письменный отказ с указанием конкретных недостатков.</p>
<p>7.11. В случае необоснованного отказа Заказчика от приемки результатов выполненных Работ или от подписания акта выполненных работ, либо просрочки Заказчиком подписания акта выполненных работ без уважительных причин более чем на 2 дней, Подрядчик вправе подписать Акт выполненных Работ в одностороннем порядке и приступить к взысканию оплаты (в таком случае акт будет иметь юридическую силу и является основанием для оплаты).</p>
<p>7.12. При возникновении между Сторонами спора по поводу недостатков выполненных Работ или их причин, по требованию любой из Сторон должна быть назначена экспертиза в аккредитованной организации. Расходы по проведению экспертизы несет Заказчик, за исключением случаев, когда экспертизой установлено наличие нарушений Договора или причинной связи между действиями Подрядчика и обнаруженными недостатками. В этих случаях расходы по экспертизе несет Подрядчик, а если экспертиза назначена по соглашению между Сторонами, - обе Стороны поровну.</p>
<p>7.13. Сдача и ввод завершенного строительством Объекта в эксплуатацию производится Сторонами в порядке, установленном законодательством Республики Казахстан об архитектурной, градостроительной и строительной деятельности. Подрядчик передает Заказчику исполнительную документацию в полном объеме.</p>
<p class="s">8. ГАРАНТИИ КАЧЕСТВА</p>
<p>8.1. Подрядчик гарантирует достижение указанных в проектно-сметной документации показателей и возможность эксплуатации результатов Работ на протяжении гарантийного срока. Гарантийный срок составляет 12 месяцев со дня подписания акта окончательной приемки результатов Работ Заказчиком в соответствии со ст. 666 ГК РК.</p>
<p>8.2. Гарантия качества распространяется на все элементы и детали выполненных Работ, включая предоставленные Подрядчиком материалы (если они были предоставлены подрядчиком, в ином случае подрядчик ответственность не несет).</p>
<p>8.3. Подрядчик несет ответственность за недостатки выполненных Работ, обнаруженные в пределах гарантийного срока, если не докажет, что они возникли вследствие нормального износа, неправильной эксплуатации или неправильности инструкций по эксплуатации, разработанных самим Заказчиком или привлеченными им третьими лицами, ненадлежащего ремонта, произведенного самим Заказчиком или привлеченными им третьими лицами, или форс-мажора.</p>
<p>8.4. В случае обнаружения в течение гарантийного срока отступлений в Работах от Договора, или иных недостатков, которые не могли быть установлены при обычном способе приемки (скрытые недостатки), в том числе такие, которые были умышленно скрыты Подрядчиком, Заказчик обязан известить об этом Подрядчика в разумный срок по их обнаружению (не позднее 5 дней).</p>
<p>8.5. Если Работы выполнены Подрядчиком с отступлениями от Договора, ухудшившими Работы, или с иными недостатками, которые делают их непригодными для использования, Заказчик вправе по своему выбору потребовать от Подрядчика:</p>
<p>8.5.1. безвозмездного устранения недостатков Работ в разумный срок;</p>
<p>8.5.2. соразмерного уменьшения установленной стоимости Работ.</p>
<p>8.6. Подрядчик вправе вместо устранения недостатков Работ, за которые он отвечает, безвозмездно выполнить Работы заново, если ему это целесообразно.</p>
<p>8.7. Подрядчик, получив уведомление от Заказчика о недостатках выполненных работ, обязан явиться на Объект в срок до 10 рабочих дней для обследования выявленных недостатков и составления Дефектного акта.</p>
<p class="s">9. ОТВЕТСТВЕННОСТЬ СТОРОН</p>
<p>9.1. Стороны несут ответственность за нарушение условий настоящего Договора в пределах, установленных Законами Республики Казахстан (ст. 651–666 ГК РК) и настоящим Договором.</p>
<p>9.2. За нарушение сроков выполнения Работ Заказчик вправе взыскать с Подрядчика пеню в размере 0,05% от стоимости незавершенных Работ за каждый день просрочки, но не более 5% от общей стоимости Договора.</p>
<p>9.3. Штрафы и пени за каждое нарушение Подрядчиком обязательств по Договору могут быть взысканы Заказчиком в сумме, не превышающей 5% от общей стоимости Работ.</p>
<p>9.4. За нарушение сроков внесения предоплаты (если предусмотрена) Подрядчик вправе взыскать с Заказчика пеню в размере 0,5% от суммы стоимости услуг за каждый день просрочки.</p>
<p>9.5. За нарушение сроков оплаты выполненных Работ Подрядчик вправе взыскать с Заказчика пеню в размере 5% от неоплаченной суммы за каждый день просрочки, а также приостановить работы до оплаты с отнесением убытков на Заказчика.</p>
<p>9.6. За нарушение сроков предоставления Заказчиком материалов или оборудования Подрядчик вправе взыскать с Заказчика пеню в размере 5% от стоимости задержанных работ за каждый день просрочки, а также продлить сроки выполнения.</p>
<p>9.7. За уклонение от приемки выполненных работ Подрядчик вправе взыскать с Заказчика штраф в размере 5% от стоимости работ, а также подписать акт в одностороннем порядке.</p>
<p>9.8. Общая ответственность Подрядчика ограничена 5% от стоимости Договора.</p>
<p class="s">10. ОБСТОЯТЕЛЬСТВА НЕПРЕОДОЛИМОЙ СИЛЫ (ФОРС-МАЖОР)</p>
<p>10.1. Каждая из Сторон настоящего Договора освобождается от ответственности, если докажет, что неисполнение договорных обязательств обусловлено обстоятельствами непреодолимой силы, которые Сторона не могла и не должна была предвидеть или предотвратить — Форс-мажор, в соответствии со ст. 13 ГК РК.</p>
<p>10.2. К обстоятельствам непреодолимой силы относятся: пожары, стихийные бедствия, военные действия, издание актов органов государственной власти или органов местного самоуправления, торговые санкции, иные обстоятельства, если данные обстоятельства непосредственно повлияли на исполнение Сторонами договорных обязательств. Сторона, ссылающаяся на форс-мажор, обязана уведомить другую Сторону в течение 5 дней.</p>
<p>10.3. К обстоятельствам непреодолимой силы не относятся: нарушение обязанностей со стороны контрагентов должника, отсутствие на рынке нужных для исполнения Договора материалов и оборудования, отсутствие у должника необходимых денежных средств.</p>
<p class="s">11. СРОК ДЕЙСТВИЯ ДОГОВОРА</p>
<p>11.1. Договор вступает в силу с момента его подписания и действует до полного исполнения Сторонами своих обязательств, включая гарантийные.</p>
<p>11.2. Стороны пришли к соглашению, что Договор распространяет свое действие на отношения Сторон, возникшие до его заключения, если они связаны с предметом Договора.</p>
<p>11.3. Окончание срока действия Договора или его досрочное расторжение по любой из причин не освобождает Стороны от ответственности за его нарушение.</p>
<p>11.4. Все обязательства Сторон, за исключением гарантийных и финансовых, прекращают свое действие с момента окончания срока действия Договора или его досрочного расторжения по любой из причин. Гарантийные и финансовые обязательства Сторон действуют до полного их исполнения.</p>
<p class="s">12. ПОРЯДОК РАЗРЕШЕНИЯ СПОРОВ</p>
<p>12.1. Применяемое право в отношении настоящего Договора — право Республики Казахстан.</p>
<p>12.2. Стороны обязуются принять все возможные меры по досудебному урегулированию споров и разногласий, связанных с настоящим Договором, включая переписку и встречу представителей в течение 10 дней с момента возникновения спора.</p>
<p>12.3. Любые уведомления, сообщения или претензии, полученные Сторонами в связи с ненадлежащим исполнением Договора, подлежат рассмотрению в течение 15 дней с момента получения.</p>
<p>12.4. Все споры, не урегулированные досудебно, подлежат рассмотрению в суде по месту нахождения Подрядчика в соответствии с законодательством РК.</p>
<p class="s">13. ОБЩИЕ ПОЛОЖЕНИЯ</p>
<p>13.1. Каждая из сторон обязуется информировать вторую Сторону об изменении юридического адреса, почтовых и банковских реквизитов, фактического адреса и другой информации, способной повлиять на выполнение обязательств по Договору, в течение 10 календарных дней. А также нести ответственность за возможные последствия не извещения или несвоевременного извещения.</p>
<p>13.2. Настоящий Договор и приложения к нему составлены в двух подлинных экземплярах, имеющих одинаковую юридическую силу, по одному для каждой из Сторон.</p>
<p>13.3. Все изменения и дополнения к настоящему Договору действительны только в письменной форме и подписываются уполномоченными представителями Сторон.</p>
<p>13.4. Договор составлен в соответствии с ГК РК, Законом РК «Об архитектурной, градостроительной и строительной деятельности» и иными нормативными актами РК.</p>
<p class="s">14. РЕКВИЗИТЫ И ПОДПИСИ СТОРОН</p><br>
${sigBlock("Подрядчик:", "Заказчик:")}
${annex1}`;
  // ─────── 3. ПРИЛОЖЕНИЕ №2/3 (ДОП. РАБОТЫ) ───────
  } else if(type==="annex"){
    const an = c.appendix||2;
    const prevList = Array.from({length:an-1},(_,i)=>`№${i+1}`).join(" и ");
    body = `
<p class="t">Приложение №${an}</p>
<p class="c b">Перечень дополнительных работ и их стоимость</p>
<p class="c">к Договору ремонтно-отделочных работ</p>
<p class="c">№${c.mainNumber||c.number||"___"} от «${dtM.d}» ${dtM.m} ${dtM.y} г.</p>
<br><p class="city-line">г. Караганда ${dtA.full} г.</p><br>
<p class="s">1. Общие положения</p>
<p>1.1. Настоящее Приложение №${an} является неотъемлемой частью Договора ремонтно-отделочных работ №${c.mainNumber||c.number||"___"} от «${dtM.d}» ${dtM.m} ${dtM.y} г. и определяет перечень дополнительных работ, согласованных Сторонами в процессе выполнения Работ.</p>
<p>1.2. Работы, указанные в настоящем Приложении №${an}, выполняются Подрядчиком по заданию Заказчика в рамках предмета Договора и подлежат оплате на условиях, установленных Договором, если иное прямо не предусмотрено настоящим Приложением.</p>
<p>1.3. Стоимость работ по настоящему Приложению №${an} оплачивается Заказчиком дополнительно, увеличивает общую стоимость Договора и не входит в стоимость работ по Приложению ${prevList}.</p>
<p>1.4. Стороны договорились, что настоящее Приложение №${an} является соглашением Сторон о выполнении дополнительных работ в понимании пункта 3.3 Приложения №1 к Договору, оформляет согласование таких работ, их объем, стоимость и сроки и заменяет собой дополнительное соглашение, предусмотренное указанным пунктом.</p><br>
${worksTable()}<br>
${sigBlock("Подрядчик:", "Заказчик:")}`;
  // ─────── 4. СОГЛАШЕНИЕ О ДИЗАЙН-ПРОЕКТЕ ───────
  } else if(type==="design"){
    const adv = c.designAdvance||25000;
    body = `
<p class="t">СОГЛАШЕНИЕ №${c.number||"___"}</p>
<p class="t" style="font-size:13pt">о разработке дизайн проекта</p>
<p class="city-line">${dt.full} г.&nbsp;&nbsp;&nbsp;&nbsp;г. Караганда</p><br>
${preambula("Исполнитель")}
<p class="s">1. Общие положения</p>
<p>1.1. Исполнитель обязуется по заданию Заказчика разработать дизайн проект Объекта, расположенного по адресу: ${clAddr}.</p>
<p>1.2. Под дизайн проектом понимается разработка интерьерных решений (перечень возможных опций): обмерочный план; планировочное решение; концепция интерьера; 3D визуализация; рабочие чертежи для выполнения ремонтных работ; ведомость отделочных материалов.</p>
<p>1.3. Конкретный состав, объем и наполнение дизайн проекта определяется Техническим заданием, оформляемым в виде Приложения №1 к настоящему Соглашению и подписываемого Сторонами. Техническое задание является неотъемлемой частью настоящего Соглашения.</p>
<p class="s">2. Стоимость и порядок оплаты</p>
<p>2.1. Окончательная стоимость дизайн проекта определяется после проведения замеров Объекта и утверждения Технического задания.</p>
<p>2.2. Стоимость может определяться: фиксированной суммой или исходя из площади Объекта стоимостью за 1 кв.м.</p>
<p>2.3. Итоговая стоимость дизайн проекта утверждается Сторонами путем подписания Дополнительного соглашения к настоящему Соглашению после согласования Технического задания. До подписания Дополнительного соглашения стоимость считается несогласованной.</p>
<p>2.4. Заказчик оплатил Исполнителю предоплату в размере ${fmtN(adv)} тенге.</p>
<p>2.5. Указанная сумма засчитывается в общую стоимость дизайн проекта.</p>
<p>2.6. Оставшаяся сумма оплачивается в сроки, согласованные Сторонами дополнительно.</p>
<p>2.7. Внесение Заказчиком изменений в согласованное Техническое задание после подписания Дополнительного соглашения влечет пересмотр сроков и стоимости работ, оформляемый отдельным Дополнительным соглашением.</p>
<p>2.8. В случае если Стороны не достигли соглашения по итоговой стоимости после согласования Технического задания, настоящее Соглашение может быть расторгнуто, при этом предоплата засчитывается в счет фактически выполненных работ.</p>
<p class="s">3. Сроки выполнения</p>
<p>3.1. Срок разработки дизайн проекта определяется и указывается в Приложении №1 к настоящему Соглашению.</p>
<p>3.2. Срок может быть продлен в случае внесения изменений Заказчиком.</p>
<p>3.3. В случае если Заказчик не согласовывает Техническое задание более 10 рабочих дней, Исполнитель вправе приостановить выполнение работ до момента согласования без изменения своих прав на полученную предоплату.</p>
<p>3.4. Моментом начала выполнения работ по проектированию считается дата проведения замеров Объекта либо дата направления Заказчику первых проектных решений, в зависимости от того, что наступит ранее.</p>
<p class="s">4. Порядок сдачи результата</p>
<p>4.1. Результат работ передается Заказчику в электронном виде.</p>
<p>4.2. Проект считается принятым, если в течение 3 рабочих дней Заказчик не направил мотивированные замечания.</p>
<p>4.3. В случае если Заказчик не направил замечания в установленный срок, результат работ считается принятым без замечаний.</p>
<p>4.4. Количество вариантов проектных решений и количество корректировок определяется Техническим заданием. Дополнительные корректировки, не предусмотренные Техническим заданием, выполняются за отдельную оплату.</p>
<p class="s">5. Отказ и возврат средств</p>
<p>5.1. В случае отказа Заказчика от исполнения настоящего Соглашения до начала выполнения работ, предоплата возвращается за вычетом фактически понесенных расходов.</p>
<p>5.2. В случае отказа Заказчика после начала выполнения работ по проектированию, предоплата возврату не подлежит.</p>
<p>5.3. В случае невозможности исполнения по вине Исполнителя предоплата возвращается полностью.</p>
<p class="s">6. Авторские права</p>
<p>6.1. Исполнитель сохраняет авторские права на созданный дизайн проект.</p>
<p>6.2. Заказчик получает право использовать дизайн проект исключительно для проведения ремонтных работ на указанном Объекте.</p>
<p>6.3. Передача Заказчиком дизайн проекта третьим лицам без письменного согласия Исполнителя не допускается.</p>
<p>6.4. Полная передача авторских прав Заказчику производится после полной оплаты всех работ по дизайн проекту и передачи всех рабочих чертежей в полном объеме.</p>
<p class="s">7. Прочие условия</p>
<p>7.1. Настоящее Соглашение вступает в силу с момента подписания.</p>
<p>7.2. Все споры разрешаются в судебном порядке по месту регистрации Исполнителя.</p>
<p>7.3. Соглашение составлено в двух экземплярах, имеющих равную юридическую силу.</p>
<p>7.4. Исполнитель не несет ответственности за получение разрешений, согласование перепланировок, утверждение проектных решений в государственных органах, если иное не предусмотрено отдельным соглашением.</p>
<p>7.5. Исполнитель вправе привлекать к выполнению работ третьих лиц, оставаясь ответственным перед Заказчиком за результат работ.</p>
<p>7.6. Общая ответственность Исполнителя по настоящему Соглашению ограничивается суммой фактически оплаченных Заказчиком денежных средств по настоящему Соглашению.</p>
<p>7.7. Дизайн проект носит концептуальный характер и является основанием для выполнения ремонтных работ при условии соблюдения действующих строительных норм. Окончательные технические решения принимаются Заказчиком.</p><br>
<p class="b">Подписи сторон</p><br>
${sigBlock("Исполнитель:", "Заказчик:")}`;
  // ─────── 5. ДОП. СОГЛАШЕНИЕ К ДИЗАЙН-ПРОЕКТУ ───────
  } else if(type==="design_add"){
    const comp = c.composition||{};
    const COMP = [["plan","Обмерочный план"],["layout","Планировочное решение"],["concept","Концепция интерьера"],["vis3d","3D визуализация"],["drawings","Рабочие чертежи"],["materials","Ведомость отделочных материалов"]];
    const adv = c.designAdvance||25000;
    const tcost = c.priceType==="sqm"
      ? Math.round((c.pricePerSqm||0)*(c.area||0)) || null
      : c.totalCost||null;
    const rem = tcost&&adv ? tcost-adv : null;
    body = `
<p class="t">ДОПОЛНИТЕЛЬНОЕ СОГЛАШЕНИЕ №${c.number||"_______"}</p>
<p class="c b">к Соглашению №${c.mainNumber||"_________"} о разработке дизайн проекта</p>
<p class="city-line">${dt.d==="__"?"":'"'}${dt.d}" ${dt.m} ${dt.y} г.&nbsp;&nbsp;&nbsp;&nbsp;г. Караганда</p><br>
${preambula("Исполнитель")}
<p class="s">1. Техническое задание</p>
<p>1.1. Стороны согласовали следующий состав дизайн проекта:</p>
${COMP.map(([k,l])=>`<p>[${comp[k]?"X":" "}] ${l}</p>`).join("")}
<p>1.2. Площадь Объекта: ${c.area||"________"} кв.м.</p>
<p>1.3. Количество вариантов планировочного решения: ${c.variantsLayout||"________"}.</p>
<p>1.4. Количество раундов корректировок по планировке: ${c.corrLayout||"________"}.</p>
<p>1.5. Количество раундов корректировок по визуализациям: ${c.corrVis||"________"}.</p>
<p>1.6. Дополнительные корректировки оплачиваются отдельно по согласованию Сторон.</p>
<p class="s">2. Стоимость</p>
<p>2.1. Стоимость дизайн проекта определяется:</p>
<p>[${c.priceType==="sqm"?" ":"X"}] фиксированной суммой</p>
<p>или</p>
<p>[${c.priceType==="sqm"?"X":" "}] из расчета ${c.pricePerSqm||"___________"} тенге за 1 кв.м.</p>
<p>2.2. Итоговая стоимость дизайн проекта составляет ${tcost?fmtN(tcost)+" тенге":"_____________________ тенге"}.</p>
<p>2.3. Предоплата ${fmtN(adv)} тенге засчитывается в общую стоимость.</p>
<p>2.4. Оставшаяся сумма к оплате составляет: ${rem!==null?fmtN(rem)+" тенге":"_____________________ тенге"}.</p>
<p class="s">3. Порядок оплаты</p>
<p>3.1. Оплата производится в формате полной предоплаты.</p>
<p>3.2. Передача полного комплекта рабочих чертежей осуществляется после полной оплаты.</p>
<p class="s">4. Сроки</p>
<p>4.1. Срок выполнения работ составляет ${c.deadline||"_________"} рабочих дней.</p>
<p>4.2. Срок исчисляется с даты подписания настоящего Дополнительного соглашения либо с даты выполнения Заказчиком обязанностей по оплате, в зависимости от того, что наступит позднее.</p>
<p>4.3. Срок продлевается в случае внесения изменений Заказчиком.</p>
<p class="s">5. Прочие условия</p>
<p>5.1. Настоящее Дополнительное соглашение является неотъемлемой частью основного Соглашения.</p>
<p>5.2. Все остальные условия основного Соглашения остаются без изменений.</p>
<p>5.3. Дополнительное соглашение вступает в силу с момента подписания Сторонами.</p><br>
${sigBlock("Исполнитель:", "Заказчик:")}`;
  // ─────── 6. СОГЛАШЕНИЕ О РЕЗЕРВИРОВАНИИ ───────
  } else if(type==="reservation"){
    const amt = c.reserveAmount||50000;
    const rsd = c.reserveStartDate ? fmtDate(c.reserveStartDate) : null;
    const rsdStr = rsd ? `«${rsd.d}» ${rsd.m} ${rsd.y} г.` : `"_____" _____________ ${dt.y} г.`;
    body = `
<p class="t">СОГЛАШЕНИЕ №${c.number||"___"}</p>
<p class="t" style="font-size:13pt">о резервировании даты начала ремонтно-строительных работ</p>
<p class="city-line">${dt.full} г.&nbsp;&nbsp;&nbsp;&nbsp;г. Караганда</p><br>
${preambula("Исполнитель")}
<p class="s">1. Общие положения</p>
<p>1.2. Настоящее Соглашение подтверждает намерение сторон заключить договор подряда на выполнение ремонтно-строительных работ. Исполнитель обязуется зарезервировать за Заказчиком производственные ресурсы и ориентировочную дату начала работ.</p>
<p>1.3. Стороны подтверждают, что основной договор подряда будет заключен отдельно после согласования: дизайн-проекта, сметы и технического задания.</p>
<p class="s">2. Предмет Соглашения</p>
<p>2.1. Исполнитель обязуется зарезервировать за Заказчиком производственные ресурсы и ориентировочную дату начала работ с ${rsdStr}</p>
<p>2.2. Под резервированием понимается: включение объекта Заказчика в производственный график; блокировка временного слота бригады; планирование загрузки ресурсов; закрепление за Заказчиком определенного производственного ресурса в рамках внутреннего графика Исполнителя.</p>
<p>2.3. Настоящее Соглашение не определяет объем, стоимость и сроки выполнения ремонтных работ.</p>
<p class="s">3. Стоимость резервирования и порядок оплаты</p>
<p>3.1. За резервирование даты Заказчик оплачивает фиксированный платеж в размере ${fmtN(amt)} тенге.</p>
<p>3.2. Оплата производится Заказчиком в день подписания настоящего Соглашения.</p>
<p>3.3. Соглашение считается заключенным и вступает в силу с момента поступления денежных средств на счет Исполнителя либо с момента фактической передачи денежных средств Исполнителю.</p>
<p>3.4. До момента поступления оплаты Исполнитель не обязан осуществлять резервирование производственных ресурсов и даты начала работ.</p>
<p class="s">4. Правовой статус платежа</p>
<p>4.1. Платеж по настоящему Соглашению является оплатой услуги по резервированию производственного ресурса и услуга по резервированию считается оказанной с момента вступления настоящего Соглашения в силу.</p>
<p>4.2. Указанный платеж не является: авансом; предоплатой; задатком; обеспечительным платежом; оплатой по договору подряда.</p>
<p>4.3. При заключении основного договора подряда сумма резервирования засчитывается в общую стоимость работ.</p>
<p>4.4. До заключения основного договора указанный платеж не создает обязательств Исполнителя по выполнению ремонтных работ.</p>
<p class="s">5. Отказ сторон и возврат средств</p>
<p>5.1. В случае отказа Заказчика после согласования сметы и подготовки к началу работ, сумма резервирования не возвращается.</p>
<p>5.2. В случае одностороннего отказа Заказчика от заключения договора подряда по любым причинам, не связанным с нарушением обязательств Исполнителем, уплаченная сумма за резервирование возврату не подлежит, поскольку услуга по резервированию производственных ресурсов считается оказанной с момента вступления настоящего Соглашения в силу.</p>
<p>5.3. В случае невозможности исполнения настоящего Соглашения по причинам, зависящим исключительно от Исполнителя (невозможность обеспечить бригаду в резервируемую дату), сумма возвращается Заказчику в полном объеме.</p>
<p>5.4. Стороны подтверждают, что размер платежа является разумным и соразмерным последствиям резервирования производственного графика.</p>
<p class="s">6. Перенос даты начала работ</p>
<p>6.1. Заказчик вправе перенести дату начала работ не более одного раза.</p>
<p>6.2. Перенос возможен не менее чем за 30 календарных дней до согласованной даты.</p>
<p>6.3. При переносе менее чем за 30 дней Исполнитель вправе отказать в переносе без возврата суммы резервирования.</p>
<p class="s">7. Обстоятельства, исключающие ответственность</p>
<p>7.1. Стороны освобождаются от ответственности в случае наступления обстоятельств непреодолимой силы.</p>
<p>7.2. К таким обстоятельствам относятся: чрезвычайные ситуации, запреты государственных органов, военные действия, аварии и иные события, находящиеся вне контроля сторон.</p>
<p class="s">8. Срок действия Соглашения</p>
<p>8.1. Соглашение вступает в силу с момента подписания и оплаты.</p>
<p>8.2. Соглашение прекращает действие: при заключении основного договора подряда; при отказе одной из сторон; по истечению 10 календарных дней с даты предполагаемого начала работ.</p>
<p class="s">9. Прочие условия</p>
<p>9.1. Стороны подтверждают добровольность заключения настоящего Соглашения.</p>
<p>9.2. Заказчик подтверждает, что ему разъяснен правовой статус платежа.</p>
<p>9.3. Все споры решаются путем переговоров, при недостижении согласия — в судебном порядке по месту регистрации Исполнителя.</p>
<p>9.4. Соглашение составлено в двух экземплярах, имеющих равную юридическую силу.</p><br>
<p class="b">Подписи сторон</p><br>
${sigBlock("Исполнитель:", "Заказчик:")}`;
  }
  const printBtn = forDocx ? "" : `\n<div class="np" style="margin-top:24px;text-align:center;padding:16px">\n  <button onclick="window.print()" style="padding:12px 36px;background:#2563eb;color:#fff;border:none;border-radius:6px;font-size:14px;cursor:pointer;font-weight:700;font-family:Verdana,sans-serif">🖨 Распечатать / Сохранить PDF</button>\n</div>`;
  // Название документа (номер + клиент + дата, как при скачивании DOCX/GDoc) — иначе при
  // печати/сохранении в PDF браузер подставляет в имя файла голый «Договор №123» без клиента.
  const docLabelT = {repair_fiz:"Договор ремонта",annex:"Приложение",design:"Соглашение о дизайн-проекте",design_add:"Доп соглашение к дизайн-проекту",reservation:"Соглашение о резервировании"}[type] || "Договор";
  const dateStrT = c.date ? c.date.split("-").reverse().join(".") : "";
  // Имя файла (номер + клиент + дата ВПЕРЕДИ, ссылка на договор в конце) — иначе браузер при
  // сохранении PDF обрезает длинную прописную фразу и остаётся «Приложение №3 Перечень доп ра».
  // Тело документа не меняется (там свой полный заголовок «Перечень дополнительных работ»).
  const _clientT = client?.name ? " " + client.name : (c.estClient ? " " + c.estClient : "");
  const docTitle = (type === "annex"
    ? "Приложение №" + (c.appendix || 2) + _clientT + (dateStrT ? " от " + dateStrT : "") + " к дог. №" + (c.mainNumber || c.number || "")
    : docLabelT + " №" + (c.number || "") + _clientT + (dateStrT ? " от " + dateStrT : "")
  ).replace(/[<>:"/\\|?*]/g, "_");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(docTitle)}</title><style>${CSS}</style></head>
<body>${body}${printBtn}
</body></html>`;
  return html;
};

// Адаптер: договор подряда (тип podryad/podryad_annex) из формы редактора → модель для buildPodryadHtml

export const podryadContractToModel = (c, worker, withStamp=false) => ({
  kind: c.type==="podryad" ? "podryad" : "annex",
  number: c.number || "", annexNo: c.appendix || "",
  mainNumber: c.mainNumber || "", mainDate: c.mainDate || "",
  date: c.type==="podryad" ? (c.date||"") : (c.annexDate||c.date||""),
  city: c.city || "Караганда",
  worker: { name: worker?.name||"", iin: worker?.iin||"", doc: worker?.doc||"", docIssuer: worker?.docIssuer||"Выдан МВД РК", address: worker?.address||"", phone: worker?.phone||"", email: worker?.email||"" },
  contragentId: c.contragentId || "",
  objectAddress: c.objectAddress || "",
  // режим цены: per-line (за объём, цена в каждой строке) или lump (одна общая сумма за все работы)
  format: "table", showLinePrice: c.priceMode!=="lump",
  sections: [{ title:"", lumpSum:"", items:(c.works||[]).map(w=>({ name:w.name, qty:w.quantity, unit:w.unit, price:w.price })) }],
  manualTotal: c.priceMode==="lump" ? (c.manualTotal||"") : "",
  avans: c.avans||"", termDays: c.termDays||"", withStamp,
});

export const generateContractDocxLegacy = async (c, client, ca) => {
  const clientName = client?.name || c.estClient || "договор";
  const num = c.number || c.id?.slice(-4) || "б-н";
  const dateStr = c.date ? c.date.split("-").reverse().join(".") : "";
  const isAnnexD = (c.type||"repair_fiz") === "annex";
  const docLabel = {repair_fiz:"Договор ремонта",annex:"Приложение",design:"Соглашение о дизайн-проекте",design_add:"Доп соглашение к дизайн-проекту",reservation:"Соглашение о резервировании"}[c.type||"repair_fiz"] || "Договор";
  const filename = isAnnexD
    ? ("Приложение №"+(c.appendix||2)+" "+clientName+(dateStr?" от "+dateStr:"")+" к дог. №"+(c.mainNumber||num)+".docx").replace(/[<>:"/\\|?*]/g,"_")
    : (docLabel+" №"+num+" "+clientName+(dateStr?" от "+dateStr:"")+".docx").replace(/[<>:"/\\|?*]/g,"_");

  try {
  // Раньше библиотека docx грузилась скриптом с unpkg.com в момент клика — если CDN
  // недоступен (нет интернета, блокировка сетью), генерация DOCX ломалась целиком. Теперь
  // docx — обычная npm-зависимость проекта, Vite выносит её в отдельный чанк и грузит
  // с того же домена, что и остальное приложение (тот же CDN, что и всё остальное, не
  // сторонний unpkg.com) — динамический import(), а не script-инъекция.
  let D;
  try {
    const mod = await import("docx");
    D = mod.Document ? mod : (mod.default && mod.default.Document ? mod.default : mod);
  } catch (loadErr) {
    alert("Не удалось загрузить сервис генерации DOCX.\n\nПроверьте интернет-соединение и попробуйте ещё раз. Если проблема повторяется — воспользуйтесь кнопками 📄 PDF или 📋 GDoc вместо DOCX.");
    return;
  }
  if (!D || !D.Document) { alert("Не удалось загрузить сервис генерации DOCX.\n\nПроверьте интернет-соединение и попробуйте ещё раз. Если проблема повторяется — воспользуйтесь кнопками 📄 PDF или 📋 GDoc вместо DOCX."); return; }
  const TNR = "Times New Roman";
  const mmT = mm => Math.round(mm * 56.692);
  const hp = pt => pt * 2;
  const CONTENT_W = 9356; // twips: A4 - margins 30+15mm
  const col = pct => Math.round(CONTENT_W * pct / 100);

  const isYur = client?.clientType === "yur" || client?.type === "юр";
  const clName = client?.name || "___________________";
  const clIIN = client?.iin || "___________________";
  const clDoc = client?.doc || "___________________";
  const clAddr = client?.address || "___________________";
  const clPhone = client?.phone || "___________________";
  const TITOV = {
    name: ca?.name||'ТОО "TITOVSTROY"',
    bin:  ca?.bin||"231040002769",
    bank: ca?.bank||'АО "Kaspi Bank"',
    bik:  ca?.bik||"CASPKZKA",
    acc:  ca?.account||"KZ38722S000030058973",
    addr: ca?.address||"Казахстан, район им.Казыбек би, улица Кирпичная, дом 8г",
    phone:ca?.phone||"8707 667 8766",
    email:ca?.email||"titovstroy@mail.ru",
    dir:  ca?.director||"Титов В.Е.",
  };
  const clShort = (() => { const p=(clName).split(" "); return isYur?clName:p[0]+" "+(p[1]?p[1][0]+".":"")+(p[2]?p[2][0]+".":""); })();

  const fmtMo = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
  const fmtDate = s => { if(!s) return {d:"__",m:"______",y:"____"}; const [y,m,d]=s.split("-"); return {d:String(Number(d)),m:fmtMo[Number(m)-1]||"",y}; };
  const dt = fmtDate(c.date);
  const fmtN2 = n => Math.round(Number(n)||0).toLocaleString("ru-RU");
  const total = (c.works||[]).reduce((s,w)=>s+lineTotal(w.quantity,w.price),0);
  const adv = c.advancePercent ?? 30;

  const T = (text, opts={}) => new D.TextRun({text:String(text??""), font:TNR, size:hp(opts.sz||11), bold:!!opts.b, italics:!!opts.i, color:opts.col||"000000"});
  const P = (runs, opts={}) => new D.Paragraph({
    children: Array.isArray(runs)?runs:[runs],
    alignment: opts.al || D.AlignmentType.JUSTIFIED,
    spacing: {before: opts.sb??40, after: opts.sa??40},
    pageBreakBefore: !!opts.pb,
  });
  const PC = (runs, opts={}) => P(runs, {...opts, al: D.AlignmentType.CENTER});
  const BORDERS = {top:{style:D.BorderStyle.SINGLE,size:4,color:"000000"},bottom:{style:D.BorderStyle.SINGLE,size:4,color:"000000"},left:{style:D.BorderStyle.SINGLE,size:4,color:"000000"},right:{style:D.BorderStyle.SINGLE,size:4,color:"000000"}};
  const NO_BORDERS = {top:{style:D.BorderStyle.NONE},bottom:{style:D.BorderStyle.NONE},left:{style:D.BorderStyle.NONE},right:{style:D.BorderStyle.NONE}};

  const TC = (text, w, opts={}) => new D.TableCell({
    children:[P([T(text,{sz:opts.sz||8.5,b:opts.b,i:opts.i,col:opts.col})],{al:opts.al||D.AlignmentType.LEFT,sb:20,sa:20})],
    width:{size:col(w),type:D.WidthType.DXA},
    columnSpan:opts.span||1,
    borders:BORDERS,
    shading: opts.bg?{fill:opts.bg,type:"clear",color:opts.bg}:undefined,
    verticalAlign:"center",
    margins:{top:28,bottom:28,left:57,right:57},
  });

  // Таблица работ
  const makeWorksTable = () => {
    const works = c.works||[];
    const catOrder=[], catMap={};
    works.forEach(w=>{
      const cat=w.category||"\u0420\u0430\u0431\u043e\u0442\u044b";
      if(!catMap[cat]){catMap[cat]={total:0,rows:[]};catOrder.push(cat);}
      const sum=w.priceFrom ? 0 : Number(w.quantity||0)*Number(w.price||0);
      catMap[cat].total+=sum; catMap[cat].rows.push(Object.assign({},w,{sum:sum}));
    });
    const rows=[];
    rows.push(new D.TableRow({children:[TC("\u2116",5,{b:true,bg:"DDDDDD",al:D.AlignmentType.CENTER}),TC("\u041d\u0430\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u043d\u0438\u0435 \u0440\u0430\u0431\u043e\u0442",45,{b:true,bg:"DDDDDD"}),TC("\u0415\u0434.",8,{b:true,bg:"DDDDDD",al:D.AlignmentType.CENTER}),TC("\u041e\u0431\u044a\u0451\u043c",8,{b:true,bg:"DDDDDD",al:D.AlignmentType.CENTER}),TC("\u0426\u0435\u043d\u0430 \u0437\u0430 \u0435\u0434.",17,{b:true,bg:"DDDDDD",al:D.AlignmentType.CENTER}),TC("\u0421\u0443\u043c\u043c\u0430",17,{b:true,bg:"DDDDDD",al:D.AlignmentType.CENTER})]}));
    let n=0;
    catOrder.forEach(function(cat){
      const ct=catMap[cat].total, cr=catMap[cat].rows;
      rows.push(new D.TableRow({children:[TC(cat+" \u2014 "+fmtN2(ct)+" \u20b8",100,{span:6,b:true,bg:"2a2a3a",col:"c8a060"})]}));
      var lastSub="";
      cr.forEach(function(w,i){
        if(w.subcategory&&w.subcategory!==lastSub){lastSub=w.subcategory;rows.push(new D.TableRow({children:[TC(w.subcategory,100,{span:6,i:true,bg:"e8e4f0",col:"5a3a8a"})]}));}
        n++;
        var bg=i%2===0?"f8f6f0":"f0ede5";
        rows.push(new D.TableRow({children:[TC(String(n),5,{bg:bg,al:D.AlignmentType.CENTER}),TC(w.name||"",45,{bg:bg}),TC(w.unit||"\u043c\xb2",8,{bg:bg,al:D.AlignmentType.CENTER}),TC(String(w.quantity||""),8,{bg:bg,al:D.AlignmentType.CENTER}),TC(w.priceFrom ? "\u043e\u0442 "+fmtN2(w.priceFrom)+" \u20b8" : fmtN2(w.price)+" \u20b8",17,{bg:bg,al:D.AlignmentType.RIGHT}),TC(w.priceFrom ? "\u0443\u0442\u043e\u0447\u043d\u044f\u0435\u0442\u0441\u044f" : fmtN2(w.sum)+" \u20b8",17,{bg:bg,b:true,al:D.AlignmentType.RIGHT})]}));
      });
      rows.push(new D.TableRow({children:[TC("\u0418\u0442\u043e\u0433\u043e \u043f\u043e \u0440\u0430\u0437\u0434\u0435\u043b\u0443 \u00ab"+cat+"\u00bb:",83,{span:5,i:true,bg:"ede8d5",al:D.AlignmentType.RIGHT}),TC(fmtN2(ct)+" \u20b8",17,{bg:"ede8d5",b:true,al:D.AlignmentType.RIGHT})]}));
    });
    // ИТОГО строка
    // ИТОГО строка — с учётом скидки
    if(c.discount>0){
      const discAmt=Math.round(total*c.discount/100);
      rows.push(new D.TableRow({children:[TC("Скидка "+c.discount+"%:",83,{span:5,i:true,bg:"fce8e8",al:D.AlignmentType.RIGHT}),TC("\u2212 "+fmtN2(discAmt)+" \u20b8",17,{bg:"fce8e8",i:true,al:D.AlignmentType.RIGHT})]}));
      rows.push(new D.TableRow({children:[TC("\u0418\u0422\u041e\u0413\u041e \u0441\u043e \u0441\u043a\u0438\u0434\u043a\u043e\u0439:",83,{span:5,b:true,bg:"e8e0c8",al:D.AlignmentType.RIGHT}),TC(fmtN2(total-discAmt)+" \u20b8",17,{bg:"e8e0c8",b:true,sz:11,al:D.AlignmentType.RIGHT})]}));
    } else {
      if(c.discountApplied>0){
        rows.push(new D.TableRow({children:[TC("\u0412 \u0446\u0435\u043d\u0430\u0445 \u0443\u0447\u0442\u0435\u043d\u0430 \u0441\u043a\u0438\u0434\u043a\u0430 "+c.discountApplied+"%",83,{span:5,i:true,bg:"fce8e8",al:D.AlignmentType.RIGHT}),TC("",17,{bg:"fce8e8",i:true,al:D.AlignmentType.RIGHT})]}));
      }
      rows.push(new D.TableRow({children:[TC("\u0418\u0422\u041e\u0413\u041e:",83,{span:5,b:true,bg:"e8e0c8",al:D.AlignmentType.RIGHT}),TC(fmtN2(total)+" \u20b8",17,{bg:"e8e0c8",b:true,sz:11,al:D.AlignmentType.RIGHT})]}));
    }
    return new D.Table({rows:rows,width:{size:CONTENT_W,type:D.WidthType.DXA}});
  };

  const SC = (lineArr) => new D.TableCell({
    children:lineArr.map(l=>P([T(l.t||"",{sz:10,b:l.b})],{sb:25,sa:25})),
    borders:NO_BORDERS,
    width:{size:col(50),type:D.WidthType.DXA},
    margins:{top:0,bottom:0,left:0,right:200},
  });
  const leftLines = [{t:"Подрядчик:",b:true},{t:""},{t:TITOV.name},{t:"БИН: "+TITOV.bin},{t:"Банк: "+TITOV.bank},{t:"БИК: "+TITOV.bik},{t:"Номер счёта: "+TITOV.acc},{t:"Адрес: "+TITOV.addr},{t:"Тел.: "+TITOV.phone},{t:"Email: "+TITOV.email},{t:""},{t:"Генеральный директор:"},{t:TITOV.dir+" _______________ М.П."}];
  let rightLines;
  if(isYur){
    rightLines=[{t:"Заказчик:",b:true},{t:""},{t:clName},{t:"БИН: "+clIIN}];
    if(client?.bank)rightLines.push({t:"Банк: "+client.bank});
    if(client?.bik)rightLines.push({t:"БИК: "+client.bik});
    if(client?.account)rightLines.push({t:"ИИК: "+client.account});
    rightLines.push({t:"Адрес: "+clAddr},{t:"Тел.: "+clPhone});
    if(client?.email)rightLines.push({t:"Email: "+client.email});
    rightLines.push({t:""},{t:"Директор:"},{t:(client?.directorShort||client?.director||"")+" ____________________  М.П."});
  } else {
    rightLines=[{t:"Заказчик:",b:true},{t:""},{t:"ФИО: "+clName},{t:"ИИН: "+clIIN},{t:"№ документа: "+clDoc},{t:"Адрес: "+clAddr},{t:"Тел.: "+clPhone},{t:""},{t:clShort+" Подпись ___________"}];
  }
  const sigTable = () => new D.Table({rows:[new D.TableRow({children:[SC(leftLines),SC(rightLines)]})],width:{size:CONTENT_W,type:D.WidthType.DXA}});

  // Преамбула
  const preamParas = (role="Подрядчик") => {
    const tit = (ca?.name||'ТОО "TITOVSTROY"')+', БИН '+(ca?.bin||'231040002769')+'  (далее — "'+role+'"), в лице директора '+(ca?.director||'________')+', действующего на основании Устава';
    const tail = 'совместно именуемые "Стороны", а по отдельности – "Сторона", заключили настоящий документ о нижеследующем:';
    if(isYur) return [
      P([T(tit+", с одной стороны, и")]),
      P([T(clName+", БИН "+clIIN+' (далее — "Заказчик") в лице '+(client?.director||"Директора")+", "+(client?.directorShort||client?.director||"")+", действующего на основании Устава, с другой стороны, "+tail)]),
    ];
    return [
      P([T(clName+", ИИН "+clIIN+", № документа "+clDoc+', Выдан МВД РК, (далее — "Заказчик") с одной стороны, и')]),
      P([T(tit+', с другой стороны, '+tail)]),
    ];
  };
  // Приложение №1
  const type = c.type || "repair_fiz";
  const advPct = c.advancePercent ?? 30;

  // helpers to convert HTML text to docx paragraphs
  const s = (text) => P([T(text, {b:true})]);  // section header
  const b = (text) => P([T(text, {b:true})]);  // bold
  const n = (text) => P([T(text)]);             // normal

  let children = [];

  if(type==="repair_fiz"){
    const annex1 = [
      PC([T("Приложение №1",{sz:13,b:true})],{pb:true,sb:0}),
      PC([T("Перечень этапов, видов и стоимость работ",{sz:12,b:true})]),
      PC([T("к Договору ремонтно-отделочных работ")]),
      PC([T("№"+(c.number||"___")+" от «"+dt.d+"» "+dt.m+" "+dt.y+" г.")]),
      P([]),
      s("1. Общие положения"),
      n("1.1. Настоящее Приложение является неотъемлемой частью Договора ремонтно-отделочных работ №"+(c.number||"___")+" от «"+dt.d+"» "+dt.m+" "+dt.y+" г. и определяет этапы, виды и стоимость ремонтно-отделочных работ, выполняемых Подрядчиком на Объекте."),
      s("2. Перечень этапов и видов работ"),
      makeWorksTable(),
      P([]),
      s("3. Условия выполнения работ"),
      n("3.1. В стоимость Работ могут входить расходы Подрядчика на материалы, оборудование, доставку и иные затраты, необходимые для выполнения Работ, если иное прямо указано в договоре. В случае если материалы, оборудование, инструменты, субподряд предоставляет Заказчик, Подрядчик не несет ответственности за их качество, комплектность и соответствие проектным требованиям."),
      n("3.2. Работы выполняются поэтапно в соответствии с указанными сроками."),
      n("3.3. Любые дополнительные работы, не предусмотренные настоящим Приложением, выполняются на основании дополнительного соглашения сторон с корректировкой стоимости и сроков."),
      s("4. Порядок оплаты"),
      n("4.1. При заключении договора заказчик вносит предоплату (аванс) в размере "+advPct+"% ("+fmtN2(Math.round(total*advPct/100))+" тенге), которая идет в зачет основной суммы договора, при расторжении договора предоплата возврату не подлежит."),
      n("4.2. Оплата за работы (за исключением предоплаты) производится поэтапно на основании актов выполненных работ (форма КС-2) в течение 2 банковских дней после подписания акта."),
      s("5. Общая стоимость работ составляет "+fmtN2(total)+" ₸"),
      P([]),
      b("Подписи сторон"),
      P([]),
      sigTable(),
    ];
    children = [
      PC([T("Договор подряда №"+(c.number||"___"),{sz:13,b:true})]),
      PC([T("на выполнение ремонтно-отделочных работ",{sz:12,b:true})]),
      PC([T(dt.full+" г.          г. Караганда")]),
      P([]),
      ...preamParas("Подрядчик"),
      P([]),
      s("1. ТЕРМИНЫ И ОПРЕДЕЛЕНИЯ"),
      n("1.1.1. Договор – настоящий договор подряда со всеми приложениями и дополнениями к нему."),
      n("1.1.2. Объект – "+(client?.objectType||"наименование объекта")+" по адресу: "+clAddr+", где Подрядчик обязуется выполнить Работы."),
      n("1.1.3. Заказчик – юридическое или физическое лицо, указанное в преамбуле Договора."),
      n("1.1.4. Подрядчик – юридическое лицо, определенное в преамбуле настоящего Договора."),
      n("1.1.5. Работы – комплекс ремонтно-отделочных работ, установленный в Приложении №1."),
      n("1.1.6. Субподрядчик – третье лицо, привлекаемое Подрядчиком для выполнения части Работ."),
      n("1.1.7. Материалы – все строительные материалы, которые должны быть использованы для выполнения Работ."),
      n("1.1.10. Недостатки Работ – все недостатки, недоработки, дефекты (в том числе скрытые), допущенные Подрядчиком. Подрядчик не несет ответственности за недостатки по вине Заказчика или форс-мажора."),
      n("1.1.11. Гарантийный срок – 1 год, в течение которого Заказчик вправе предъявить претензии."),
      s("2. ПРЕДМЕТ ДОГОВОРА"),
      n("2.1. По настоящему Договору Подрядчик обязуется по заданию Заказчика выполнить комплекс ремонтно-отделочных работ, установленный в Приложении №1 «Перечень видов и этапов работ», а Заказчик обязуется создать Подрядчику необходимые условия для выполнения Работ, принять их результат и уплатить обусловленную цену в соответствии со ст. 651 ГК РК."),
      n("2.2. Подрядчик обязан выполнить Работы в соответствии с нормативно-правовыми документами РК, условиями Договора и Приложения №1."),
      n("2.3. Подрядчик гарантирует наличие всех полномочий, финансовых, материальных, трудовых и иных ресурсов."),
      s("3. ПРАВА И ОБЯЗАННОСТИ СТОРОН"),
      b("3.1. Заказчик обязан:"),
      n("3.1.1. Оплачивать Работы в соответствии с условиями настоящего Договора и в установленные сроки."),
      n("3.1.2. Принимать выполненные Работы в соответствии с условиями Договора и нормативными документами РК."),
      n("3.1.3. Осуществлять контроль и технический надзор за ходом и качеством выполняемых Работ."),
      n("3.1.5. Немедленно заявлять Подрядчику о выявленных отступлениях. Если Заказчик не сделает заявления в течение 2 дней, он теряет право ссылаться на обнаруженные недостатки."),
      n("3.1.7. Предоставить Подрядчику беспрепятственный доступ на Строительную площадку."),
      b("3.2. Заказчик вправе:"),
      n("3.2.1. Требовать внесения изменений в документацию, не связанных с дополнительными расходами для Подрядчика."),
      n("3.2.3. Требовать от Подрядчика устранения выявленных недостатков на любом этапе, в гарантийный период."),
      b("3.3. Подрядчик обязан:"),
      n("3.3.1. Выполнить Работы с надлежащим качеством, в установленные Договором сроки."),
      n("3.3.3. Незамедлительно сообщить Заказчику об обнаружении не учтенных работ и необходимости дополнительных Работ. При неполучении ответа в течение 2 дней Подрядчик вправе приостановить выполнение Работ."),
      n("3.3.4. Обеспечить выполнение Работ качественными материалами, если заказчик не берет ответственность за материалы на себя."),
      n("3.3.7. Обеспечить соблюдение правил техники безопасности, противопожарной безопасности, своевременный вывоз мусора."),
      n("3.3.12. Безвозмездно устранять выявленные несоответствия Работ, только если недостатки возникли по вине Подрядчика."),
      n("3.3.14. После окончания Работ вывезти оборудование и передать исполнительную документацию в течение 10 дней."),
      b("3.4. Подрядчик вправе:"),
      n("3.4.1. Требовать пересмотра стоимости Работ, если по независящим от Подрядчика причинам стоимость превысила смету."),
      n("3.4.3. Приостановить выполнение Работ в случаях, предусмотренных законами РК, с уведомлением за 2 дня."),
      n("3.4.5. Привлекать к исполнению своих обязательств субподрядчиков без предварительного согласия Заказчика."),
      n("3.4.6. Расторгнуть Договор и требовать возмещения убытков в случае нарушения Заказчиком существенных условий (включая просрочку оплаты более 3 дней), с уведомлением за 2 дня."),
      s("4. СТОИМОСТЬ, СРОКИ И ПОРЯДОК ОПЛАТЫ РАБОТ"),
      n("4.1. Общая стоимость работ, а также сроки и порядок оплаты определяется в соответствии с Приложением №1 «Перечень видов и этапов работ»."),
      n("4.2. Стоимость каждой единицы Работ, установленная в Приложении №1, является твердой и изменению не подлежит, за исключением случаев п. 3.4.1."),
      n("4.4. Заказчик оплачивает выполненные Работы по факту завершения и подписания актов приемки в течение 2 банковских дней."),
      n("4.5. Все расчеты Сторон производятся в тенге, в безналичном порядке."),
      s("5. СРОКИ ВЫПОЛНЕНИЯ РАБОТ"),
      n("5.1. Подрядчик обязан выполнить Работы в соответствии с Приложением №1 «Перечень видов и этапов работ»."),
      n("5.2. Сроки могут быть изменены по соглашению Сторон. Задержки, вызванные Заказчиком, продлевают сроки без ответственности Подрядчика."),
      s("6. ПОРЯДОК ВЫПОЛНЕНИЯ РАБОТ"),
      n("6.1. Подрядчик выполняет работы поэтапно, в соответствии с Приложением №1."),
      n("6.3. После завершения Работ Подрядчик письменно уведомляет Заказчика и вызывает его для приемки в течение 2 дней."),
      s("7. ПОРЯДОК СДАЧИ-ПРИЕМКИ ВЫПОЛНЕННЫХ РАБОТ"),
      n("7.1. Приемка осуществляется после завершения каждого этапа Работ."),
      n("7.2. Заказчик обязан приступить к приемке в течение 2 дней после уведомления."),
      n("7.5. Сдача-приемка оформляется актом, подписываемым обеими Сторонами."),
      n("7.9. Заказчик обязан принять Работы и подписать Акт в течение 2 дней, либо дать обоснованный письменный отказ."),
      n("7.10. При необоснованном отказе Заказчика более чем на 2 дня, Подрядчик вправе подписать Акт в одностороннем порядке."),
      n("7.11. При споре назначается экспертиза. Расходы несет Заказчик, за исключением случаев, когда установлена вина Подрядчика."),
      s("8. ГАРАНТИИ КАЧЕСТВА"),
      n("8.1. Гарантийный срок составляет 12 месяцев со дня подписания акта окончательной приемки в соответствии со ст. 666 ГК РК."),
      n("8.3. Подрядчик несет ответственность за недостатки в пределах гарантийного срока, если не докажет вину Заказчика, нормальный износ или форс-мажор."),
      n("8.6. Подрядчик обязан явиться на Объект в срок до 10 рабочих дней для составления Дефектного акта."),
      s("9. ОТВЕТСТВЕННОСТЬ СТОРОН"),
      n("9.1. Стороны несут ответственность в пределах, установленных законами РК (ст. 651–666 ГК РК)."),
      n("9.2. За нарушение сроков Заказчик вправе взыскать пеню 0,05% от стоимости незавершенных Работ за каждый день, но не более 5% от общей стоимости."),
      n("9.5. За нарушение сроков оплаты Подрядчик вправе взыскать пеню 5% от неоплаченной суммы за каждый день, а также приостановить работы до оплаты."),
      n("9.8. Общая ответственность Подрядчика ограничена 5% от стоимости Договора."),
      s("10. ОБСТОЯТЕЛЬСТВА НЕПРЕОДОЛИМОЙ СИЛЫ (ФОРС-МАЖОР)"),
      n("10.1. Стороны освобождаются от ответственности при форс-мажоре в соответствии со ст. 13 ГК РК."),
      n("10.2. К форс-мажору относятся: пожары, стихийные бедствия, военные действия, акты государственных органов. Сторона, ссылающаяся на форс-мажор, уведомляет другую в течение 5 дней."),
      s("11. СРОК ДЕЙСТВИЯ ДОГОВОРА"),
      n("11.1. Договор вступает в силу с момента подписания и действует до полного исполнения обязательств, включая гарантийные."),
      n("11.3. Окончание срока или расторжение не освобождает Стороны от ответственности за нарушение."),
      s("12. ПОРЯДОК РАЗРЕШЕНИЯ СПОРОВ"),
      n("12.1. Применяемое право – право Республики Казахстан."),
      n("12.2. Стороны принимают меры по досудебному урегулированию споров в течение 10 дней."),
      n("12.4. Все споры рассматриваются в суде по месту нахождения Подрядчика."),
      s("13. ОБЩИЕ ПОЛОЖЕНИЯ"),
      n("13.1. Стороны обязуются информировать друг друга об изменении реквизитов в течение 10 дней."),
      n("13.2. Договор составлен в двух подлинных экземплярах, имеющих одинаковую юридическую силу."),
      n("13.3. Все изменения действительны только в письменной форме."),
      n("13.4. Договор составлен в соответствии с ГК РК и иными нормативными актами РК."),
      s("14. РЕКВИЗИТЫ И ПОДПИСИ СТОРОН"),
      P([]),
      sigTable(),
      ...annex1,
    ];

  } else if(type==="annex"){
    const an = c.appendix||2;
    const prevList = Array.from({length:an-1},(_,i)=>"№"+(i+1)).join(" и ");
    const dtA = fmtDate(c.annexDate||c.date);
    const dtM = fmtDate(c.mainDate||c.date);
    children = [
      PC([T("Приложение №"+an,{sz:13,b:true})]),
      PC([T("Перечень дополнительных работ и их стоимость",{sz:12,b:true})]),
      PC([T("к Договору ремонтно-отделочных работ")]),
      PC([T("№"+(c.mainNumber||c.number||"___")+" от «"+dtM.d+"» "+dtM.m+" "+dtM.y+" г.")]),
      P([]),
      PC([T("г. Караганда "+dtA.full+" г.")]),
      P([]),
      s("1. Общие положения"),
      n("1.1. Настоящее Приложение №"+an+" является неотъемлемой частью Договора ремонтно-отделочных работ №"+(c.mainNumber||c.number||"___")+" от «"+dtM.d+"» "+dtM.m+" "+dtM.y+" г. и определяет перечень дополнительных работ, согласованных Сторонами в процессе выполнения Работ."),
      n("1.2. Работы, указанные в настоящем Приложении №"+an+", выполняются Подрядчиком по заданию Заказчика в рамках предмета Договора и подлежат оплате на условиях, установленных Договором."),
      n("1.3. Стоимость работ по настоящему Приложению №"+an+" оплачивается Заказчиком дополнительно, увеличивает общую стоимость Договора и не входит в стоимость работ по Приложению "+prevList+"."),
      n("1.4. Настоящее Приложение №"+an+" оформляет согласование дополнительных работ, их объем, стоимость и сроки."),
      P([]),
      makeWorksTable(),
      P([]),
      b("Подписи сторон"),
      P([]),
      sigTable(),
    ];

  } else if(type==="design"){
    const advD = c.designAdvance||25000;
    children = [
      PC([T("СОГЛАШЕНИЕ №"+(c.number||"___"),{sz:13,b:true})]),
      PC([T("о разработке дизайн проекта",{sz:12,b:true})]),
      PC([T(dt.full+" г.          г. Караганда")]),
      P([]),
      ...preamParas("Исполнитель"),
      P([]),
      s("1. Общие положения"),
      n("1.1. Исполнитель обязуется по заданию Заказчика разработать дизайн проект Объекта, расположенного по адресу: "+clAddr+"."),
      n("1.2. Под дизайн проектом понимается разработка интерьерных решений (перечень возможных опций): обмерочный план; планировочное решение; концепция интерьера; 3D визуализация; рабочие чертежи для выполнения ремонтных работ; ведомость отделочных материалов."),
      n("1.3. Конкретный состав, объем и наполнение дизайн проекта определяется Техническим заданием, оформляемым в виде Приложения №1 к настоящему Соглашению."),
      s("2. Стоимость и порядок оплаты"),
      n("2.1. Окончательная стоимость дизайн проекта определяется после проведения замеров Объекта и утверждения Технического задания."),
      n("2.2. Стоимость может определяться: фиксированной суммой или исходя из площади Объекта стоимостью за 1 кв.м."),
      n("2.3. Итоговая стоимость утверждается Сторонами путем подписания Дополнительного соглашения после согласования Технического задания."),
      n("2.4. Заказчик оплатил Исполнителю предоплату в размере "+fmtN2(advD)+" тенге."),
      n("2.5. Указанная сумма засчитывается в общую стоимость дизайн проекта."),
      n("2.6. Оставшаяся сумма оплачивается в сроки, согласованные Сторонами дополнительно."),
      n("2.7. Внесение Заказчиком изменений в согласованное Техническое задание после подписания Дополнительного соглашения влечет пересмотр сроков и стоимости."),
      n("2.8. В случае если Стороны не достигли соглашения по итоговой стоимости, настоящее Соглашение может быть расторгнуто, при этом предоплата засчитывается в счет фактически выполненных работ."),
      s("3. Сроки выполнения"),
      n("3.1. Срок разработки дизайн проекта определяется и указывается в Приложении №1 к настоящему Соглашению."),
      n("3.2. Срок может быть продлен в случае внесения изменений Заказчиком."),
      n("3.3. В случае если Заказчик не согласовывает Техническое задание более 10 рабочих дней, Исполнитель вправе приостановить выполнение работ."),
      n("3.4. Моментом начала выполнения работ считается дата проведения замеров либо дата направления первых проектных решений."),
      s("4. Порядок сдачи результата"),
      n("4.1. Результат работ передается Заказчику в электронном виде."),
      n("4.2. Проект считается принятым, если в течение 3 рабочих дней Заказчик не направил мотивированные замечания."),
      n("4.4. Количество вариантов проектных решений и корректировок определяется Техническим заданием. Дополнительные корректировки выполняются за отдельную оплату."),
      s("5. Отказ и возврат средств"),
      n("5.1. В случае отказа Заказчика до начала работ, предоплата возвращается за вычетом фактически понесенных расходов."),
      n("5.2. В случае отказа Заказчика после начала работ, предоплата возврату не подлежит."),
      n("5.3. В случае невозможности исполнения по вине Исполнителя предоплата возвращается полностью."),
      s("6. Авторские права"),
      n("6.1. Исполнитель сохраняет авторские права на созданный дизайн проект."),
      n("6.2. Заказчик получает право использовать дизайн проект исключительно для проведения ремонтных работ на указанном Объекте."),
      n("6.4. Полная передача авторских прав производится после полной оплаты всех работ."),
      s("7. Прочие условия"),
      n("7.1. Настоящее Соглашение вступает в силу с момента подписания."),
      n("7.2. Все споры разрешаются в судебном порядке по месту регистрации Исполнителя."),
      n("7.3. Соглашение составлено в двух экземплярах, имеющих равную юридическую силу."),
      n("7.6. Общая ответственность Исполнителя ограничивается суммой фактически оплаченных Заказчиком средств по настоящему Соглашению."),
      P([]),
      b("Подписи сторон"),
      P([]),
      sigTable(),
    ];

  } else if(type==="design_add"){
    const comp = c.composition||{};
    const COMP = [["plan","Обмерочный план"],["layout","Планировочное решение"],["concept","Концепция интерьера"],["vis3d","3D визуализация"],["drawings","Рабочие чертежи"],["materials","Ведомость отделочных материалов"]];
    const advD = c.designAdvance||25000;
    const tcost = c.priceType==="sqm" ? Math.round((c.pricePerSqm||0)*(c.area||0))||null : c.totalCost||null;
    const rem = (tcost&&advD) ? tcost-advD : null;
    children = [
      PC([T("ДОПОЛНИТЕЛЬНОЕ СОГЛАШЕНИЕ №"+(c.number||"___"),{sz:13,b:true})]),
      PC([T("к Соглашению №"+(c.mainNumber||"___")+" о разработке дизайн проекта",{sz:12,b:true})]),
      PC([T(dt.full+" г.          г. Караганда")]),
      P([]),
      ...preamParas("Исполнитель"),
      P([]),
      s("1. Техническое задание"),
      n("1.1. Стороны согласовали следующий состав дизайн проекта:"),
      ...COMP.map(([k,l])=>n("["+( comp[k]?"X":" ")+"] "+l)),
      n("1.2. Площадь Объекта: "+(c.area||"________")+" кв.м."),
      n("1.3. Количество вариантов планировочного решения: "+(c.variantsLayout||"________")+"."),
      n("1.4. Количество раундов корректировок по планировке: "+(c.corrLayout||"________")+"."),
      n("1.5. Количество раундов корректировок по визуализациям: "+(c.corrVis||"________")+"."),
      n("1.6. Дополнительные корректировки оплачиваются отдельно по согласованию Сторон."),
      s("2. Стоимость"),
      n("2.1. Стоимость дизайн проекта определяется:"),
      n("["+(c.priceType==="sqm"?" ":"X")+"] фиксированной суммой"),
      n("["+( c.priceType==="sqm"?"X":" ")+"] из расчета "+(c.pricePerSqm||"___________")+" тенге за 1 кв.м."),
      n("2.2. Итоговая стоимость дизайн проекта составляет "+(tcost?fmtN2(tcost)+" тенге":"_____________________ тенге")+"."),
      n("2.3. Предоплата "+fmtN2(advD)+" тенге засчитывается в общую стоимость."),
      n("2.4. Оставшаяся сумма к оплате составляет: "+(rem!==null?fmtN2(rem)+" тенге":"_____________________ тенге")+"."),
      s("3. Порядок оплаты"),
      n("3.1. Оплата производится в формате полной предоплаты."),
      n("3.2. Передача полного комплекта рабочих чертежей осуществляется после полной оплаты."),
      s("4. Сроки"),
      n("4.1. Срок выполнения работ составляет "+(c.deadline||"_________")+" рабочих дней."),
      n("4.2. Срок исчисляется с даты подписания настоящего Дополнительного соглашения либо с даты выполнения Заказчиком обязанностей по оплате."),
      n("4.3. Срок продлевается в случае внесения изменений Заказчиком."),
      s("5. Прочие условия"),
      n("5.1. Настоящее Дополнительное соглашение является неотъемлемой частью основного Соглашения."),
      n("5.2. Все остальные условия основного Соглашения остаются без изменений."),
      n("5.3. Дополнительное соглашение вступает в силу с момента подписания Сторонами."),
      P([]),
      b("Подписи сторон"),
      P([]),
      sigTable(),
    ];

  } else if(type==="reservation"){
    const amt = c.reserveAmount||50000;
    const rsd = c.reserveStartDate ? fmtDate(c.reserveStartDate) : null;
    const rsdStr = rsd ? ("«"+rsd.d+"» "+rsd.m+" "+rsd.y+" г.") : ("\"_____\" _____________ "+dt.y+" г.");
    children = [
      PC([T("СОГЛАШЕНИЕ №"+(c.number||"___"),{sz:13,b:true})]),
      PC([T("о резервировании даты начала ремонтно-строительных работ",{sz:12,b:true})]),
      PC([T(dt.full+" г.          г. Караганда")]),
      P([]),
      ...preamParas("Исполнитель"),
      P([]),
      s("1. Общие положения"),
      n("1.2. Настоящее Соглашение подтверждает намерение сторон заключить договор подряда. Исполнитель обязуется зарезервировать за Заказчиком производственные ресурсы и ориентировочную дату начала работ."),
      n("1.3. Основной договор подряда будет заключен отдельно после согласования дизайн-проекта, сметы и технического задания."),
      s("2. Предмет Соглашения"),
      n("2.1. Исполнитель обязуется зарезервировать за Заказчиком производственные ресурсы и дату начала работ с "+rsdStr+"."),
      n("2.2. Под резервированием понимается: включение объекта в производственный график; блокировка временного слота бригады; закрепление производственного ресурса."),
      n("2.3. Настоящее Соглашение не определяет объем, стоимость и сроки выполнения ремонтных работ."),
      s("3. Стоимость резервирования и порядок оплаты"),
      n("3.1. За резервирование даты Заказчик оплачивает фиксированный платеж в размере "+fmtN2(amt)+" тенге."),
      n("3.2. Оплата производится Заказчиком в день подписания настоящего Соглашения."),
      n("3.3. Соглашение вступает в силу с момента поступления денежных средств на счет Исполнителя."),
      s("4. Правовой статус платежа"),
      n("4.1. Платеж является оплатой услуги по резервированию производственного ресурса и считается оказанной с момента вступления Соглашения в силу."),
      n("4.2. Указанный платеж не является: авансом; предоплатой; задатком; обеспечительным платежом; оплатой по договору подряда."),
      n("4.3. При заключении основного договора подряда сумма резервирования засчитывается в общую стоимость работ."),
      s("5. Отказ сторон и возврат средств"),
      n("5.1. В случае отказа Заказчика после согласования сметы и подготовки к началу работ, сумма резервирования не возвращается."),
      n("5.2. В случае одностороннего отказа Заказчика, уплаченная сумма возврату не подлежит, поскольку услуга по резервированию считается оказанной."),
      n("5.3. В случае невозможности исполнения по причинам, зависящим исключительно от Исполнителя, сумма возвращается Заказчику полностью."),
      s("6. Перенос даты начала работ"),
      n("6.1. Заказчик вправе перенести дату начала работ не более одного раза."),
      n("6.2. Перенос возможен не менее чем за 30 календарных дней до согласованной даты."),
      s("7. Срок действия Соглашения"),
      n("8.1. Соглашение вступает в силу с момента подписания и оплаты."),
      n("8.2. Соглашение прекращает действие при заключении основного договора подряда или отказе одной из сторон."),
      s("9. Прочие условия"),
      n("9.1. Стороны подтверждают добровольность заключения настоящего Соглашения."),
      n("9.3. Все споры решаются переговорами, при недостижении согласия — в суде по месту регистрации Исполнителя."),
      n("9.4. Соглашение составлено в двух экземплярах, имеющих равную юридическую силу."),
      P([]),
      b("Подписи сторон"),
      P([]),
      sigTable(),
    ];
  }
  const doc = new D.Document({
    sections:[{
      properties:{page:{size:{width:mmT(210),height:mmT(297),orientation:D.PageOrientation.PORTRAIT},margin:{top:mmT(20),right:mmT(15),bottom:mmT(20),left:mmT(30)}}},
      children,
    }],
  });
  const blob = await D.Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href=url; a.download=filename; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),20000);
  } catch(err) {
    console.error("DOCX generation error:", err);
    alert("Ошибка при создании DOCX: "+err.message);
  }
};

export const generateContractGDocLegacy = async (c, client, ca, workers = [], contragents = []) => {
  const GDOC_CLIENT_ID = "363473710949-d67codd7dq0uk9g4tfl8lhhgecgcqe98.apps.googleusercontent.com";
  const clientName = client?.name || c.estClient || "договор";
  const num = c.number || c.id?.slice(-4) || "б-н";
  const dateStrG = c.date ? c.date.split("-").reverse().join(".") : "";
  const isAnnexG = (c.type||"repair_fiz") === "annex" || c.type==="podryad_annex";
  const docLabelG = {repair_fiz:"Договор ремонта",annex:"Приложение",design:"Соглашение о дизайн-проекте",design_add:"Доп соглашение к дизайн-проекту",reservation:"Соглашение о резервировании",podryad:"Договор подряда",podryad_annex:"Приложение к договору подряда"}[c.type||"repair_fiz"] || "Договор";
  const title = isAnnexG
    ? ("Приложение №"+(c.appendix||2)+" Перечень работ к Договору №"+(c.mainNumber||num)+(dateStrG?" от "+dateStrG:"")).replace(/[<>:"/\\|?*]/g,"_")
    : (docLabelG+" №"+num+" "+clientName+(dateStrG?" от "+dateStrG:"")).replace(/[<>:"/\\|?*]/g,"_");
  const html = (c.type==="podryad"||c.type==="podryad_annex")
    ? buildPodryadHtml(podryadContractToModel(c, workers.find(w=>w.id===c.workerId)||null, false), contragents)
    : buildContractHtml(c, client, ca, true, "");

  // Загружаем Google Identity Services если ещё нет
  const loadGIS = () => new Promise((res, rej) => {
    if (window.google?.accounts?.oauth2) { res(); return; }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.onload = () => res();
    s.onerror = () => rej(new Error("Не удалось загрузить сервис Google (accounts.google.com недоступен). Проверьте интернет-соединение и попробуйте ещё раз, либо воспользуйтесь кнопкой 📄 PDF."));
    document.head.appendChild(s);
  });

  // Получаем access token
  const getToken = () => new Promise((res, rej) => {
    const tc = window.google.accounts.oauth2.initTokenClient({
      client_id: GDOC_CLIENT_ID,
      scope: "https://www.googleapis.com/auth/drive.file",
      callback: (resp) => {
        if (resp.error) rej(new Error("Ошибка авторизации: "+resp.error));
        else res(resp.access_token);
      },
    });
    tc.requestAccessToken({ prompt: "" });
  });

  try {
    await loadGIS();
    const token = await getToken();

    // Создаём Google Doc через Drive API (multipart upload с HTML контентом)
    const boundary = "titov_boundary_gdoc";
    const meta = JSON.stringify({ name: title, mimeType: "application/vnd.google-apps.document" });
    const body = [
      "--"+boundary,
      "Content-Type: application/json; charset=UTF-8",
      "",
      meta,
      "--"+boundary,
      "Content-Type: text/html; charset=UTF-8",
      "",
      html,
      "--"+boundary+"--"
    ].join("\r\n");

    const resp = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
      method: "POST",
      headers: {
        "Authorization": "Bearer "+token,
        "Content-Type": "multipart/related; boundary="+boundary,
      },
      body,
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error("Drive API ошибка "+resp.status+": "+err);
    }

    const data = await resp.json();
    window.open("https://docs.google.com/document/d/"+data.id+"/edit", "_blank");

  } catch(err) {
    console.error("Google Doc error:", err);
    alert("Ошибка создания Google Doc:\n"+err.message);
  }
};
