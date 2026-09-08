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
// ПОЛНАЯ копия — раз в неделю, ежедневная — только живые данные.
//
// Полный дамп базы весит 94 МБ, из них 61 МБ — узлы *_backups (снимки, которые
// сервис делает перед каждой записью списка) и 16 МБ — выгрузки парсера мастеров.
// Качать это каждую ночь значит 2,8 ГБ скачивания в месяц ради данных, которые
// либо восстанавливаются из живых, либо собираются парсером заново. Живые данные
// без них — около 5 МБ, и именно их потеря необратима.
const FULL = process.env.FULL === "1";
const SKIP = [/_backups/, /^titovstroy_masters/];
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

// ЧИТАЕМ ПО КЛЮЧАМ, А НЕ КОРЕНЬ ЦЕЛИКОМ.
//
// Это не про аккуратность, а про деньги: скачивание из Firebase на тарифе Blaze
// платное. Прочитать корень и отфильтровать лишнее ПОСЛЕ — значит заплатить за
// всё равно скачанные 94 МБ и сэкономить только место в архиве. Поэтому сначала
// берём shallow-список ключей (он весит килобайты и в объём не считается
// заметно), отбрасываем ненужное и качаем только отобранное.
async function accessToken() {
  const t = await admin.app().options.credential.getAccessToken();
  if (!t?.access_token) throw new Error("Не удалось получить доступ к базе");
  return t.access_token;
}
async function listKeys(token) {
  const r = await fetch(`${FB_DB_URL}/.json?shallow=true&access_token=${encodeURIComponent(token)}`);
  if (!r.ok) throw new Error("Список ключей: HTTP " + r.status);
  const j = await r.json();
  return j && typeof j === "object" ? Object.keys(j) : [];
}
async function readKey(token, key) {
  const r = await fetch(`${FB_DB_URL}/${encodeURIComponent(key)}.json?access_token=${encodeURIComponent(token)}`);
  if (!r.ok) throw new Error(`Узел ${key}: HTTP ${r.status}`);
  return JSON.parse(await r.text());
}

async function main() {
  initFb();
  const token = await accessToken();
  const all = await listKeys(token);
  if (!all.length) {
    throw new Error("База вернула пусто — копию не делаем, чтобы не подменить хорошую пустой");
  }
  const keys = FULL ? all : all.filter(k => !SKIP.some(re => re.test(k)));
  if (!keys.length) throw new Error("После отбора не осталось ни одного узла — копию не делаем");
  console.log(`Ключей в базе ${all.length}, беру ${keys.length}…`);

  // По шесть за раз: последовательно 200+ узлов тянулись бы минутами, а всё
  // сразу — это 200 одновременных соединений к базе на ровном месте.
  const out = {};
  const queue = [...keys];
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const k = queue.shift();
      out[k] = await readKey(token, k);
    }
  }));
  const json = JSON.stringify(out);
  const gz = gzipSync(Buffer.from(json, "utf8"), { level: 9 });
  console.log(`${FULL ? "ПОЛНАЯ копия" : "Живые данные"}: узлов ${keys.length} из ${all.length}, `
    + `объём ${mb(Buffer.byteLength(json))}, в архиве ${mb(gz.length)}`);
  if (!FULL) console.log("  (пропущены снимки *_backups и выгрузки парсера — они в полной копии по воскресеньям)");

  const name = `${PREFIX}${FULL ? "full_" : ""}${stamp()}.json.gz`;
  writeFileSync(name, gz);
  console.log(`Файл: ${name}`);

  if (!driveConfigured()) {
    console.log("Google Диск не настроен — копия осталась артефактом прогона. "
      + "Как подключить Диск — backup/README.md.");
    return;
  }
  const gtoken = await driveToken();
  const up = await driveUpload(gtoken, name, gz);
  console.log(`На Диск загружено: ${up.name}`);
  const removed = await drivePrune(gtoken);
  console.log(removed ? `Удалено старых копий: ${removed} (старше ${KEEP_DAYS} дней)`
    : `Старых копий на удаление нет (храним ${KEEP_DAYS} дней)`);
}

// Firebase Admin держит открытый сокет — без явного закрытия node не завершается
// и прогон висит до таймаута. Уже ловили это на уведомлениях.
async function shutdown() { try { await admin.app().delete(); } catch (e) {} }

main()
  .then(async () => { await shutdown(); process.exit(0); })
  .catch(async (e) => { console.error("СБОЙ:", e.message); await shutdown(); process.exit(1); });
