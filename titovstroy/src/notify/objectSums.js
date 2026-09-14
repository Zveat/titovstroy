// СКОЛЬКО СТОИТ ОБЪЕКТ — ДЛЯ УВЕДОМЛЕНИЯ «ДОГОВОР ПОДПИСАН».
//
// Владелец: «сумма нужна же». Она и правда одна цифра, но собрать её надо правильно.
//
// ОТКУДА БЕРЁМ. Сначала договоры: подписали именно их, и в договоре уже учтена скидка.
// Приложения к договору идут в ту же сумму — по тексту самого приложения они
// «увеличивают общую стоимость Договора». Договора нет (бывает: статус переключили
// раньше, чем оформили) — считаем по сметам объекта, это то же число, из которого
// договор и собирают.
//
// ЧТО НЕ БЕРЁМ И ПОЧЕМУ ЭТО ВАЖНО. Договоры подряда (podryad, podryad_annex) — это
// СЕБЕСТОИМОСТЬ, сколько мы платим бригаде. Сообщение уходит в общий чат, где сидит
// вся команда, поэтому подряд сюда попасть не должен ни при каких условиях. Типы
// перечислены СПИСКОМ РАЗРЕШЁННЫХ, а не запрещённых: появится новый тип договора —
// он не попадёт в сумму молча, а будет виден как отсутствие суммы.
import { contractNetTotal, estimatesForObject } from "../utils.js";

export const CLIENT_CONTRACT_TYPES = Object.freeze([
  "repair_fiz", "annex", "design", "design_add", "reservation",
]);

export function buildObjectSums(contracts = [], estimates = []) {
  const allowed = new Set(CLIENT_CONTRACT_TYPES);
  const out = {};

  for (const c of Array.isArray(contracts) ? contracts : []) {
    if (!c || c.deletedAt || !c.objectId) continue;
    if (!allowed.has(c.type || "repair_fiz")) continue;
    const total = Number(contractNetTotal(c)) || 0;
    if (total > 0) out[c.objectId] = (out[c.objectId] || 0) + total;
  }

  const list = Array.isArray(estimates) ? estimates : [];
  const objectIds = new Set();
  for (const e of list) if (e && !e.deletedAt && e.objectId) objectIds.add(e.objectId);
  for (const objectId of objectIds) {
    if (out[objectId]) continue;                    // договор уже дал сумму, она точнее
    const total = estimatesForObject(list, objectId)
      .reduce((sum, e) => sum + (Number(e?.total) || 0), 0);
    if (total > 0) out[objectId] = total;
  }
  return out;
}
