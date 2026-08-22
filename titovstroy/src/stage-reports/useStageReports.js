// Связка «база + очередь отправки + состояние экрана» для отчётов по этапу.
// Вся запись идёт через storage.mutateTransaction — тот же механизм, которым
// пишется производство: два устройства не затрут друг друга.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  stageReportsKey, normalizeStageReports, emptyStageReports,
  makePhotoRecord, addPhoto, patchPhoto, reviewPhoto as reviewPhotoIn, removeRecord,
  makePaymentReport, addPaymentReport, patchPaymentReport, reviewPaymentReport,
  countAwaitingReview, summarizePayments,
} from "./model.js";
import { createQueue, indexedDbBackend, flushQueue } from "./queue.js";

// Очередь одна на приложение: у неё своя база в браузере, и заводить по
// экземпляру на каждый объект незачем.
let _queue = null;
const sharedQueue = () => (_queue ||= createQueue(indexedDbBackend()));

export function useStageReports({ objectId, storage, currentUser, canReview = false, readOnly = false, queue = null, onChanged = null }) {
  const bag = queue || sharedQueue();
  const [list, setList] = useState(emptyStageReports);
  const [pending, setPending] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef(list);
  listRef.current = list;
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
        },
      });
      setError(result.failed ? "Фото не уходит — проверьте связь" : "");
    } finally {
      setBusy(false);
      setActiveId(null);
      refreshQueue();
    }
  }, [bag, objectId, readOnly, send, commit, refreshQueue]);

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

  const setPhotoClientVisible = useCallback((photoId, showClient) =>
    commit((current) => patchPhoto(current, photoId, { showClient: !!showClient })), [commit]);

  const setPhotoNote = useCallback((photoId, note) =>
    commit((current) => patchPhoto(current, photoId, { note: String(note || "") })), [commit]);

  const decidePhoto = useCallback((photoId, verdict) => {
    if (!canReview) return null;
    return commit((current) => reviewPhotoIn(current, photoId, verdict, currentUser || {}));
  }, [commit, canReview, currentUser]);

  const dropPhoto = useCallback((photoId) =>
    commit((current) => removeRecord(current, photoId)), [commit]);

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
    return report;
  }, [readOnly, objectId, author, commit]);

  const updatePayment = useCallback((reportId, patch) =>
    commit((current) => patchPaymentReport(current, reportId, patch)), [commit]);

  const decidePayment = useCallback((reportId, verdict, comment) => {
    if (!canReview) return null;
    return commit((current) => reviewPaymentReport(current, reportId, verdict, currentUser || {}, comment));
  }, [commit, canReview, currentUser]);

  const dropPayment = useCallback((reportId) =>
    commit((current) => removeRecord(current, reportId)), [commit]);

  const summary = useMemo(() => ({
    awaitingPhotos: countAwaitingReview(list),
    payments: summarizePayments(list),
  }), [list]);

  return {
    list, pending, activeId, error, busy, summary, canReview, readOnly,
    reload, retry: flush,
    addPhotos, setPhotoClientVisible, setPhotoNote, decidePhoto, dropPhoto, dropQueued,
    uploadReceipts, savePayment, updatePayment, decidePayment, dropPayment,
  };
}
