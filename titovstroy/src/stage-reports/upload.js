// Сжатие и отправка файлов в Firebase Storage. Вынесено из model.js, чтобы там
// осталась чистая логика: её гоняют тесты, а здесь canvas и сеть, которых в
// тестовой среде нет.
import { getApp } from "firebase/app";
import {
  FULL_MAX_SIDE, FULL_QUALITY, THUMB_MAX_SIDE, THUMB_QUALITY, fitSize, makeId,
} from "./model.js";

// Storage грузим по требованию: большинство экранов фото не открывает, и тянуть
// ради них лишний кусок бандла в каждый вход не за что.
let _storagePromise = null;
const storageApi = () => (_storagePromise ||= import("firebase/storage"));

// Путь обязан укладываться в один сегмент имени файла: правила доступа заданы
// как objects/{objectId}/stages/{stageId}/{file}, и вложенная папка под ними уже
// не подойдёт. Поэтому чеки различаются суффиксом имени, а не подпапкой.
export function storagePath(objectId, stageId, id, { thumb = false, receipt = false } = {}) {
  const safe = (value) => String(value ?? "").replace(/[^a-zA-Z0-9_-]/g, "_") || "_";
  const suffix = `${receipt ? "rc_" : ""}${thumb ? "thumb" : "full"}`;
  return `objects/${safe(objectId)}/stages/${safe(stageId)}/${safe(id)}_${suffix}.jpg`;
}

function readImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Не удалось прочитать изображение")); };
    image.src = url;
  });
}

export async function compressImage(file, maxSide, quality) {
  const image = await readImage(file);
  const size = fitSize(image.naturalWidth || image.width, image.naturalHeight || image.height, maxSide);
  const canvas = document.createElement("canvas");
  canvas.width = size.width; canvas.height = size.height;
  const context = canvas.getContext("2d");
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, size.width, size.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("Не удалось сжать изображение");
  return { blob, width: size.width, height: size.height };
}

// Один снимок = два файла: полный и превью. Лента показывает превью (~30 КБ),
// полный открывается только по нажатию.
export async function prepareEntry(file, meta = {}) {
  const full = await compressImage(file, FULL_MAX_SIDE, FULL_QUALITY);
  const thumb = await compressImage(file, THUMB_MAX_SIDE, THUMB_QUALITY);
  return {
    id: makeId(meta.receipt ? "rc" : "ph"),
    ...meta,
    fullBlob: full.blob, thumbBlob: thumb.blob,
    width: full.width, height: full.height, size: full.blob.size,
    createdAt: Date.now(),
  };
}

async function putFile(path, blob) {
  const { getStorage, ref, uploadBytes, getDownloadURL } = await storageApi();
  const fileRef = ref(getStorage(getApp()), path);
  await uploadBytes(fileRef, blob, { contentType: "image/jpeg", cacheControl: "public,max-age=31536000" });
  return getDownloadURL(fileRef);
}

// Отправка одной подготовленной записи. Ссылки возвращаются только когда ОБА
// файла легли в хранилище: запись с превью, но без полного снимка выглядела бы
// в базе целой, а по нажатию открывалась бы пустота.
export async function uploadEntry(entry) {
  const receipt = !!entry.receipt;
  const [url, thumbUrl] = await Promise.all([
    putFile(storagePath(entry.objectId, entry.stageId, entry.id, { receipt }), entry.fullBlob),
    putFile(storagePath(entry.objectId, entry.stageId, entry.id, { receipt, thumb: true }), entry.thumbBlob),
  ]);
  return {
    id: entry.id, objectId: entry.objectId, stageId: entry.stageId,
    kind: entry.kind, url, thumbUrl,
    width: entry.width, height: entry.height, size: entry.size,
    note: entry.note || "", showClient: entry.showClient !== false,
    author: entry.author || "", authorId: entry.authorId || "",
    createdAt: entry.createdAt || Date.now(),
    receipt, reportDraftId: entry.reportDraftId || "",
  };
}
