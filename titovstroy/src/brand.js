// ОФОРМЛЕНИЕ КОМПАНИИ: название, логотип, цвет, WhatsApp, печать.
//
// ЗАЧЕМ ОТДЕЛЬНЫЙ МОДУЛЬ. Сервис готовится работать не только у TitovStroy:
// название и логотип должны задаваться в админке, а не лежать в коде. Раньше
// «TitovStroy» было вписано в 14 местах — на входе, в трёх шапках, в кабинете
// клиента, в КП и в заголовке вкладки; поменять компанию значило пройти их все
// и что-нибудь пропустить.
//
// РЕКВИЗИТЫ ЗДЕСЬ НЕ ЖИВУТ. БИН, банк, счёт и директор уже настраиваются в
// карточках контрагентов (Админка → Реквизиты), и договоры берут их оттуда.
// Дублировать их сюда нельзя: разойдутся, и в документе окажется одно, а на
// экране другое. Здесь только оформление.
//
// ГДЕ ЧИТАЕТСЯ. И в самом ERP, и на публичных страницах (КП, кабинет клиента),
// а туда клиент заходит без учётной записи. Поэтому узел titovstroy_brand в
// правилах базы открыт на ЧТЕНИЕ всем вошедшим (публичные страницы входят
// анонимно), а на ЗАПИСЬ — только сотруднику с правом на пользователей.
// Секретного в названии и логотипе нет: клиент и так видит их на своей
// странице.
import { useEffect, useState } from "react";
import { storage } from "./cloud/storage.js";
import { BRAND_KEY } from "./storageKeys.js";

// Значения по умолчанию — нынешние, TitovStroy. Так сделано СОЗНАТЕЛЬНО: пока
// узел не заполнен или база не ответила, боевой сервис обязан выглядеть как
// раньше, а не как «Моя компания». Когда появится мастер первого запуска, он
// будет спрашивать название при установке, и умолчания станут нейтральными.
export const BRAND_DEFAULT = Object.freeze({
  name: "TitovStroy",                                  // короткое имя в шапках
  tagline: "ремонт и отделка",                         // подпись на страницах клиента
  appTitle: "Цифровая система управления ремонтами",   // заголовок вкладки
  logo: "",                                            // картинка data:… ; пусто — рисуем букву
  accent: "#b8904a",                                   // фирменный цвет
  whatsapp: "77079824915",                             // только цифры, для wa.me
  stamp: "/stamp.jpg",                                 // печать в КП и актах
  kpContragentId: "",                                  // от какого юрлица выходит КП; пусто — первое
});

const S = (v) => (v == null ? "" : String(v));

export function normalizeBrand(raw) {
  const b = raw && typeof raw === "object" ? raw : {};
  const out = { ...BRAND_DEFAULT };
  for (const k of Object.keys(BRAND_DEFAULT)) {
    const v = S(b[k]).trim();
    if (v) out[k] = v;                     // пустое поле = «оставить как по умолчанию»
  }
  // Цвет попадает в style и в разметку favicon — пускаем только настоящий hex,
  // иначе кривое значение молча ломает вёрстку страницы клиента.
  if (!/^#[0-9a-fA-F]{3,8}$/.test(out.accent)) out.accent = BRAND_DEFAULT.accent;
  out.whatsapp = out.whatsapp.replace(/\D/g, "");
  return out;
}

// Первая буква для плитки-логотипа, когда картинки нет.
export const brandLetter = (b) => (S(b?.name).trim()[0] || "T").toUpperCase();
export const waLink = (b, text) =>
  `https://wa.me/${S(b?.whatsapp)}${text ? "?text=" + encodeURIComponent(text) : ""}`;

// ─── ЗАГРУЗКА ────────────────────────────────────────────────────────────────
// Модуль ESM один на всё приложение, поэтому кеш и подписчики живут прямо тут:
// публичная страница КП и главный экран получают одно и то же значение и не
// читают базу дважды.
let _brand = { ...BRAND_DEFAULT };
let _loaded = false;
let _inflight = null;
const _subs = new Set();

export const getBrand = () => _brand;

export function setBrandLocal(next) {
  _brand = normalizeBrand(next);
  _loaded = true;
  applyDocumentBrand(_brand);
  for (const fn of _subs) fn(_brand);
}

export function loadBrand({ force = false } = {}) {
  if (_loaded && !force) return Promise.resolve(_brand);
  if (_inflight && !force) return _inflight;
  _inflight = (async () => {
    try {
      const r = await storage.get(BRAND_KEY);
      if (r?.value) {
        const parsed = JSON.parse(r.value);
        if (parsed && typeof parsed === "object") setBrandLocal(parsed);
        else _loaded = true;
      } else _loaded = true;
    } catch (e) {
      // Узла ещё нет, правила не пустили или сети нет — остаёмся на умолчаниях.
      // Оформление никогда не повод показать пользователю ошибку.
      _loaded = true;
    }
    _inflight = null;
    applyDocumentBrand(_brand);
    return _brand;
  })();
  return _inflight;
}

export function useBrand() {
  const [b, setB] = useState(_brand);
  useEffect(() => {
    _subs.add(setB);
    loadBrand().then((v) => setB(v));
    return () => { _subs.delete(setB); };
  }, []);
  return b;
}

// ─── ВКЛАДКА БРАУЗЕРА ────────────────────────────────────────────────────────
// Заголовок и значок вкладки лежат в index.html и в сборку попадают одни на
// всех. Переписываем их на ходу: так одна и та же сборка обслуживает разные
// компании, и пересобирать под каждую не нужно.
export function applyDocumentBrand(b = _brand) {
  if (typeof document === "undefined") return;
  const name = S(b.name).trim() || BRAND_DEFAULT.name;
  document.title = b.appTitle ? `${name} — ${b.appTitle}` : name;
  const meta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (meta) meta.setAttribute("content", name);
  const icon = document.querySelector('link[rel="icon"]');
  if (icon) {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>`
      + `<rect width='100' height='100' rx='20' fill='${b.accent}'/>`
      + `<text y='.9em' font-size='70' x='15' font-weight='900' fill='#0c0e1a'>${brandLetter(b)}</text></svg>`;
    icon.setAttribute("href", "data:image/svg+xml," + encodeURIComponent(svg));
  }
}

// ─── КАРТИНКА ЛОГОТИПА ───────────────────────────────────────────────────────
// Логотип хранится прямо в базе строкой data:…, потому что отдельного файлового
// хранилища у сервиса нет, а узел читают и публичные страницы. Отсюда жёсткое
// правило: картинку СНАЧАЛА уменьшаем и только потом сохраняем. Без этого
// первый же логотип «с телефона» на 4 МБ прилетал бы клиенту при каждом
// открытии КП — это и деньги за трафик, и заметная задержка.
export function fileToLogo(file, { maxSide = 320, maxBytes = 120 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error("Файл не выбран"));
    if (!/^image\//.test(file.type)) return reject(new Error("Это не картинка"));
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("Не удалось прочитать файл"));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Не удалось открыть картинку"));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        // PNG держит прозрачность (логотипы почти всегда с ней), но бывает
        // тяжёлым; если не уложились — пробуем JPEG с белой подложкой.
        let out = c.toDataURL("image/png");
        if (out.length * 0.75 > maxBytes) {
          const c2 = document.createElement("canvas");
          c2.width = w; c2.height = h;
          const ctx = c2.getContext("2d");
          ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          out = c2.toDataURL("image/jpeg", 0.85);
        }
        if (out.length * 0.75 > maxBytes) {
          return reject(new Error("Картинка слишком тяжёлая даже после сжатия — возьмите проще"));
        }
        resolve(out);
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
