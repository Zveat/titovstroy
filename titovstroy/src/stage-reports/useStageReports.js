// Связка «база + очередь отправки + состояние экрана» для отчётов по этапу.
// Вся запись идёт через storage.mutateTransaction — тот же механизм, которым
// пишется производство: два устройства не затрут друг друга.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  stageReportsKey, normalizeStageReports, emptyStageReports, PHOTO_KINDS, findRecord,
  reportStatusMeta, paymentDeviation, paymentAmount, paymentLines, unallocated,
  editPaymentReport,
  makePhotoRecord, addPhoto, patchPhoto, reviewPhoto as reviewPhotoIn, removeRecord,
  makePaymentReport, addPaymentReport, patchPaymentReport, reviewPaymentReport,
  countAwaitingReview, summarizePayments,
} from "./model.js";
import { createQueue, indexedDbBackend, flushQueue } from "./queue.js";

// Очередь одна на приложение: у неё своя база в браузере, и заводить по
// экземпляру на каждый объект незачем.
let _queue = null;
const sharedQueue = () => (_queue ||= createQueue(indexedDbBackend()));

export function useStageReports({ objectId, storage, currentUser, canReview = false, readOnly = false,
  queue = null, onChanged = null, onAudit = null, stageName = null, allowSelfReview = false }) {
  const bag = queue || sharedQueue();
  const [list, setList] = useState(emptyStageReports);
  const [pending, setPending] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef(list);
  listRef.current = list;
  // Журнал изменений объекта. Фото и расчёты — такие же действия людей, как
  // смена срока или суммы: без записи в журнал непонятно, кто добавил снимок
  // и кто решил показать его клиенту.
  const workOf = useCallback((stageId) => {
    const name = stageName?.(stageId);
    return name ? `работа: ${name}` : "";
  }, [stageName]);
  const audit = useCallback((event) => { try { onAudit?.(event); } catch { /* журнал не должен ломать действие */ } }, [onAudit]);
  const kindLabel = (kind) => PHOTO_KINDS.find((item) => item.key === kind)?.label || kind || "";
  const key = objectId ? stageReportsKey(objectId) : "";

  const refreshQueue = useCallback(async () => {
    if (!objectId) return;
    try { setPending(await bag.forObject(objectId)); } catch { /* очередь недоступна — не повод падать */ }
  }, [bag, objectId]);

  const reload = useCallback(async () => {
    if (!key || !storage) return;
    try {
      const result = await storage.getResult(key);
      let parsed = [];
      if (result?.status === "found" && result.value) {
        try { parsed = JSON.parse(result.value); } catch { parsed = []; }
      }
      setList(normalizeStageReports(parsed));
    } catch { /* офлайн — оставляем то, что уже показано */ }
  }, [key, storage]);

  useEffect(() => { setList(emptyStageReports()); setError(""); reload(); refreshQueue(); }, [reload, refreshQueue]);

  // Правка базы. Локальное состояние обновляем сразу же от текущего списка,
  // чтобы экран не ждал сети, а в облако уходит транзакция от РЕАЛЬНОГО
  // значения на сервере — иначе правка с другого устройства потерялась бы.
  const commit = useCallback(async (mutator) => {
    if (readOnly || !key || !storage) return null;
    const next = mutator(listRef.current);
    if (!Array.isArray(next)) return null;
    setList(next);
    try {
      const result = await storage.mutateTransaction(key, (current) => mutator(normalizeStageReports(current)));
      if (result && result.committed === false) setError("Не сохранилось в облаке — проверьте связь");
      else { setError(""); onChanged?.(objectId); }
    } catch (failure) {
      setError(failure?.message || "Не сохранилось в облаке");
    }
    return next;
  }, [key, storage, readOnly, onChanged, objectId]);

  const author = useMemo(() => ({
    author: currentUser?.name || "",
    authorId: String(currentUser?.id || ""),
  }), [currentUser?.name, currentUser?.id]);

  // ── ФОТО ──────────────────────────────────────────────────────────────────
  const send = useCallback(async (entry) => {
    const { uploadEntry } = await import("./upload.js");
    return uploadEntry(entry);
  }, []);

  const flush = useCallback(async () => {
    if (!objectId || readOnly) return;
    setBusy(true);
    try {
      const result = await flushQueue(bag, send, {
        objectId,
        onActive: setActiveId,
        onChange: refreshQueue,
        // Запись в базу только после успешной отправки: фото без файла в базе
        // выглядело бы сделанной работой, которой нет.
        onUploaded: (uploaded) => {
          if (uploaded.receipt) return; // чеки прикрепляет форма отчёта, не лента
          commit((current) => {
            try { return addPhoto(current, makePhotoRecord(uploaded)); }
            catch { return current; } // упёрлись в лимит на тип — молча не добавляем
          });
          audit({ entity: "stage", field: "фотоотчёт", action: "добавил фото",
            old: "—", new: kindLabel(uploaded.kind), detail: workOf(uploaded.stageId) });
        },
      });
      setError(result.failed ? "Фото не уходит — проверьте связь" : "");
    } finally {
      setBusy(false);
      setActiveId(null);
      refreshQueue();
    }
  }, [bag, objectId, readOnly, send, commit, refreshQueue, audit, workOf]);

  const addPhotos = useCallback(async (stageId, kind, files, options = {}) => {
    if (readOnly || !objectId || !files?.length) return;
    setError("");
    setBusy(true);
    try {
      const { prepareEntry } = await import("./upload.js");
      for (const file of files) {
        try {
          const entry = await prepareEntry(file, {
            objectId, stageId, kind, ...author,
            note: options.note || "", showClient: options.showClient !== false,
          });
          // В очередь ДО отправки: на слабой связи иначе жмёшь «снять» и минуту
          // ничего не происходит, а снимок ещё и теряется при закрытии вкладки.
          await bag.add(entry);
        } catch (failure) {
          setError(failure?.message || "Не удалось подготовить фото");
        }
      }
      await refreshQueue();
    } finally { setBusy(false); }
    await flush();
  }, [readOnly, objectId, author, bag, refreshQueue, flush]);

  // Досылка сама: сеть вернулась или человек вернулся во вкладку.
  useEffect(() => {
    if (!objectId || readOnly) return undefined;
    const wake = () => { if (navigator.onLine !== false) flush(); };
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [objectId, readOnly, flush]);

  const setPhotoClientVisible = useCallback((photoId, showClient) => {
    const photo = findRecord(listRef.current, photoId);
    audit({ entity: "stage", field: "фото для клиента", action: "изменил",
      old: photo?.showClient === false ? "скрыто" : "показывается",
      new: showClient ? "показывается" : "скрыто", detail: workOf(photo?.stageId) });
    return commit((current) => patchPhoto(current, photoId, { showClient: !!showClient }));
  }, [commit, audit, workOf]);

  const setPhotoNote = useCallback((photoId, note) =>
    commit((current) => patchPhoto(current, photoId, { note: String(note || "") })), [commit]);

  const decidePhoto = useCallback((photoId, verdict) => {
    if (!canReview) return null;
    const photo = findRecord(listRef.current, photoId);
    audit({ entity: "stage", field: "фотоотчёт",
      action: verdict === "approved" ? "подтвердил фото" : verdict === "rejected" ? "отклонил фото" : "вернул фото на проверку",
      old: kindLabel(photo?.kind), new: verdict === "approved" ? "видно клиенту" : "клиенту не видно",
      detail: workOf(photo?.stageId) });
    return commit((current) => reviewPhotoIn(current, photoId, verdict, currentUser || {}));
  }, [commit, canReview, currentUser, audit, workOf]);

  const dropPhoto = useCallback((photoId) => {
    const photo = findRecord(listRef.current, photoId);
    audit({ entity: "stage", field: "фотоотчёт", action: "удалил фото",
      old: kindLabel(photo?.kind), new: "—", detail: workOf(photo?.stageId) });
    return commit((current) => removeRecord(current, photoId));
  }, [commit, audit, workOf]);

  const dropQueued = useCallback(async (entryId) => {
    await bag.remove(entryId);
    await refreshQueue();
  }, [bag, refreshQueue]);

  // ── РАСЧЁТ С РАБОЧИМИ ─────────────────────────────────────────────────────
  // Чеки грузятся сразу и напрямую: отчёт без чека отправлять можно, а вот
  // «отчёт есть, чек где-то в очереди» — состояние, которое некому объяснить.
  const uploadReceipts = useCallback(async (stageId, files) => {
    if (!files?.length || !objectId) return [];
    const { prepareEntry, uploadEntry } = await import("./upload.js");
    const out = [];
    for (const file of files) {
      const entry = await prepareEntry(file, { objectId, stageId, receipt: true, ...author });
      const uploaded = await uploadEntry(entry);
      out.push({ id: uploaded.id, url: uploaded.url, thumbUrl: uploaded.thumbUrl, size: uploaded.size });
    }
    return out;
  }, [objectId, author]);

  const savePayment = useCallback(async (input) => {
    if (readOnly) return null;
    const report = makePaymentReport({ ...input, objectId, ...author });
    await commit((current) => addPaymentReport(current, report));
    const delta = paymentDeviation(report);
    const rest = unallocated(report);
    const works = paymentLines(report).map((line) => stageName?.(line.stageId)).filter(Boolean);
    audit({ entity: "object", field: "взаиморасчёт с мастером", action: "завёл выплату",
      old: report.payee,
      new: `${paymentAmount(report).toLocaleString("ru-RU")} ₸${delta > 0 ? ` (выше сметы на ${delta.toLocaleString("ru-RU")})` : ""}${rest > 0 ? `, не распределено ${rest.toLocaleString("ru-RU")}` : ""}`,
      detail: works.length ? `работы: ${works.join(", ")}` : "" });
    return report;
  }, [readOnly, objectId, author, commit, audit, stageName]);

  const updatePayment = useCallback((reportId, patch) =>
    commit((current) => patchPaymentReport(current, reportId, patch)), [commit]);

  // Правка сумм возвращает выплату на проверку — иначе подпись руководителя
  // стояла бы под цифрами, которых он не видел.
  const editPayment = useCallback(async (reportId, input) => {
    const before = findRecord(listRef.current, reportId);
    const next = await commit((current) => editPaymentReport(current, reportId, input));
    const saved = findRecord(next, reportId);
    audit({ entity: "object", field: "взаиморасчёт с мастером", action: "исправил выплату",
      old: `${paymentAmount(before).toLocaleString("ru-RU")} ₸`,
      new: `${paymentAmount(saved).toLocaleString("ru-RU")} ₸`,
      detail: saved?.payee || before?.payee || "" });
    return next;
  }, [commit, audit]);

  const decidePayment = useCallback((reportId, verdict, comment) => {
    if (!canReview) return null;
    const report = findRecord(listRef.current, reportId);
    audit({ entity: "object", field: "взаиморасчёт с мастером", action: "проверил выплату",
      old: reportStatusMeta(report?.status).label, new: reportStatusMeta(verdict).label,
      detail: [report?.payee, comment].filter(Boolean).join(" · ") });
    return commit((current) => reviewPaymentReport(current, reportId, verdict, currentUser || {}, comment));
  }, [commit, canReview, currentUser, audit, workOf]);

  // Удаление обязательно в журнале: выплата — про деньги, и «была запись, а
  // теперь нет» без следа означало бы, что её можно тихо убрать.
  const dropPayment = useCallback((reportId) => {
    const report = findRecord(listRef.current, reportId);
    const works = paymentLines(report).map((line) => stageName?.(line.stageId)).filter(Boolean);
    audit({ entity: "object", field: "взаиморасчёт с мастером", action: "удалил выплату",
      old: `${paymentAmount(report).toLocaleString("ru-RU")} ₸ · ${report?.payee || "—"}`, new: "—",
      detail: works.length ? `работы: ${works.join(", ")}` : "" });
    return commit((current) => removeRecord(current, reportId));
  }, [commit, audit, stageName]);

  const summary = useMemo(() => ({
    awaitingPhotos: countAwaitingReview(list),
    payments: summarizePayments(list),
  }), [list]);

  return {
    list, pending, activeId, error, busy, summary, canReview, readOnly, allowSelfReview, objectId,
    reload, retry: flush,
    addPhotos, setPhotoClientVisible, setPhotoNote, decidePhoto, dropPhoto, dropQueued,
    uploadReceipts, savePayment, updatePayment, editPayment, decidePayment, dropPayment,
  };
}
