// ВНЕШНЯЯ КОПИЯ БАЗЫ. Раз в сутки выгружает базу целиком и кладёт её ЗА ПРЕДЕЛЫ
// Firebase.
//
// ЗАЧЕМ. В сервисе есть 17 узлов *-backups — снимки перед каждой записью списка.
// Механизм хороший, но все эти снимки лежат в той же самой базе, которую они
// должны защищать. Удалили проект, кончилась оплата, утёк служебный ключ (он
// обходит правила), запустили кривой restore — и бэкапы уедут вместе с данными.
// Копия снаружи — единственное, что от этого спасает.
//
// ЭТОТ СКРИПТ ТОЛЬКО ЧИТАЕТ. Ни одной записи в базу здесь нет и быть не должно:
// он работает служебным ключом, а тот обходит правила и может переписать что
// угодно. Проверка стоит ниже явно.
import admin from "firebase-admin";
import { gzipSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const FB_DB_URL = process.env.FB_DB_URL || "https://titovstroy-da1cf-default-rtdb.firebaseio.com";
const KEEP_DAYS = Number(process.env.KEEP_DAYS || 60);
const PREFIX = "titovstroy_backup_";

const two = (n) => String(n).padStart(2, "0");
const stamp = (d = new Date()) =>
  `${d.getUTCFullYear()}_${two(d.getUTCMonth() + 1)}_${two(d.getUTCDate())}_${two(d.getUTCHours())}${two(d.getUTCMinutes())}`;
const mb = (n) => (n / 1024 / 1024).toFixed(2) + " МБ";

function initFb() {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!sa || !sa.trim()) throw new Error("Нет секрета FIREBASE_SERVICE_ACCOUNT");
  let cred;
  try { cred = JSON.parse(sa); }
  catch (e) { throw new Error("FIREBASE_SERVICE_ACCOUNT — не валидный JSON: " + e.message); }
  admin.initializeApp({ credential: admin.credential.cert(cred), databaseURL: FB_DB_URL });
}

// ── Google Диск ──────────────────────────────────────────────────────────────
// Через разовую авторизацию владельца, а НЕ служебным ключом. Причина
// техническая: у служебного аккаунта нет собственного места на Диске, и файл,
// который он создаёт в расшаренной папке, упирается в нулевую квоту. Обходится
// либо общим диском (это платный Workspace), либо вот так — refresh-токеном
// живого аккаунта. Как его получить — в README рядом.
const gd = {
  id: process.env.GDRIVE_CLIENT_ID || "",
  secret: process.env.GDRIVE_CLIENT_SECRET || "",
  refresh: process.env.GDRIVE_REFRESH_TOKEN || "",
  folder: process.env.GDRIVE_FOLDER_ID || "",
};
const driveConfigured = () => Boolean(gd.id && gd.secret && gd.refresh && gd.folder);

async function driveToken() {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: gd.id, client_secret: gd.secret,
      refresh_token: gd.refresh, grant_type: "refresh_token",
    }).toString(),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) {
    throw new Error("Google не выдал доступ: " + (j.error_description || j.error || r.status));
  }
  return j.access_token;
}

async function driveUpload(token, name, buf) {
  const meta = JSON.stringify({ name, parents: [gd.folder] });
  const b = "granica" + Date.now();
  const body = Buffer.concat([
    Buffer.from(`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`),
    Buffer.from(`--${b}\r\nContent-Type: application/gzip\r\n\r\n`),
    buf,
    Buffer.from(`\r\n--${b}--\r\n`),
  ]);
  const r = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name", {
    method: "POST",
    headers: { authorization: "Bearer " + token, "content-type": `multipart/related; boundary=${b}` },
    body,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Диск не принял файл: " + (j.error?.message || r.status));
  return j;
}

// Чистим только СВОИ файлы и только в своей папке: чужое на Диске трогать нельзя
// ни при каких условиях, даже если оно там лишнее.
async function drivePrune(token) {
  const q = encodeURIComponent(`'${gd.folder}' in parents and name contains '${PREFIX}' and trashed = false`);
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,createdTime)&pageSize=1000`,
    { headers: { authorization: "Bearer " + token } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { console.warn("Не удалось получить список на Диске:", j.error?.message || r.status); return 0; }
  const edge = Date.now() - KEEP_DAYS * 24 * 3600e3;
  let removed = 0;
  for (const f of j.files || []) {
    if (!f.name.startsWith(PREFIX)) continue;           // страховка поверх запроса
    if (new Date(f.createdTime).getTime() >= edge) continue;
    const d = await fetch("https://www.googleapis.com/drive/v3/files/" + f.id,
      { method: "DELETE", headers: { authorization: "Bearer " + token } });
    if (d.ok) removed += 1;
  }
  return removed;
}

async function main() {
  initFb();
  console.log("Читаю базу целиком…");
  const snap = await admin.database().ref("/").get();
  const data = snap.val();
  if (data === null || data === undefined) {
    throw new Error("База вернула пусто — копию не делаем, чтобы не подменить хорошую пустой");
  }
  const keys = Object.keys(data);
  const json = JSON.stringify(data);
  const gz = gzipSync(Buffer.from(json, "utf8"), { level: 9 });
  console.log(`Узлов: ${keys.length}, объём ${mb(Buffer.byteLength(json))}, в архиве ${mb(gz.length)}`);

  const name = `${PREFIX}${stamp()}.json.gz`;
  writeFileSync(name, gz);
  console.log(`Файл: ${name}`);

  if (!driveConfigured()) {
    console.log("Google Диск не настроен — копия осталась артефактом прогона. "
      + "Как подключить Диск — backup/README.md.");
    return;
  }
  const token = await driveToken();
  const up = await driveUpload(token, name, gz);
  console.log(`На Диск загружено: ${up.name}`);
  const removed = await drivePrune(token);
  console.log(removed ? `Удалено старых копий: ${removed} (старше ${KEEP_DAYS} дней)`
    : `Старых копий на удаление нет (храним ${KEEP_DAYS} дней)`);
}

// Firebase Admin держит открытый сокет — без явного закрытия node не завершается
// и прогон висит до таймаута. Уже ловили это на уведомлениях.
async function shutdown() { try { await admin.app().delete(); } catch (e) {} }

main()
  .then(async () => { await shutdown(); process.exit(0); })
  .catch(async (e) => { console.error("СБОЙ:", e.message); await shutdown(); process.exit(1); });
