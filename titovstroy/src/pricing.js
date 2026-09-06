// Цены и каталог: переопределения прайса, эффективный каталог, расчёт цены строки.
// Модуль ESM — один экземпляр на приложение, поэтому module-scope состояние
// (_priceOverrides / _catalogOverrides / _catalogCache) ведёт себя ровно как раньше.
import { WORKS_DATA } from "./catalog/worksData.js";
import { COMPLEXITY } from "./constants.js";
import { CATALOG_DEFAULTS, applyWorkPricingOverride, resolveEstimateRowWork, withCatalogOverrides } from "./utils.js";

// Базовая цена для отображения в колонке (без объёма) — первый диапазон или fixedPrice
// priceOverrides = {code: {fixedPrice?, tiers?}} — загружается из Firebase
export let _priceOverrides = {};
export function setPriceOverrides(o) {
  _priceOverrides = o || {};
  if (_onCatalogChange) _onCatalogChange();
}

export function getEffectiveWork(work) {
  const safe = { ...work, tiers: work.tiers || [] };
  const renamed = _catalogOverrides.renames[safe.code]
    ? { ...safe, name: _catalogOverrides.renames[safe.code] }
    : safe;
  return applyWorkPricingOverride(renamed, _priceOverrides[renamed.code]);
}

export function getBasePrice(work) {
  const w = getEffectiveWork(work);
  if (w.fixedPrice) return w.fixedPrice;
  if (w.tiers && w.tiers.length > 0) return w.tiers[0].price;
  return null;
}

export function getResolvedPrice(work, qty, complexity, cpxPct) {
  if (!qty || qty <= 0) return null;
  const w = work || {};
  const mult = cpxPct !== undefined && cpxPct !== null
    ? 1 + cpxPct / 100
    : (COMPLEXITY.find(c => c.key === complexity)?.mult || 1);
  let price = null;
  if (w.tiers && w.tiers.length > 0) {
    for (const t of w.tiers) {
      if (qty >= t.min && qty <= t.max) { price = t.price; break; }
    }
    if (price === null) price = w.tiers[w.tiers.length - 1]?.price ?? null;
  } else if (w.fixedPrice) {
    price = w.fixedPrice;
  }
  return (price !== null && !isNaN(Number(price))) ? Number(price) * mult : null;
}

export function getPrice(work, qty, complexity, cpxPct) {
  return getResolvedPrice(getEffectiveWork(work), qty, complexity, cpxPct);
}

export function getEstimateRowPrice(row, work, qty, complexity, cpxPct) {
  if (row?.manualPrice !== undefined && row.manualPrice !== "") {
    const value = Number(row.manualPrice);
    return Number.isNaN(value) ? null : value;
  }
  return getResolvedPrice(resolveEstimateRowWork(getEffectiveWork(work), row), qty, complexity, cpxPct);
}

// Себестоимость за единицу с учётом разового ручного переопределения в строке сметы
export const rowCostPerUnit = (r, w) => {
  if (r && r.manualCost !== undefined && r.manualCost !== "" && !isNaN(Number(r.manualCost))) return Number(r.manualCost);
  return Number(resolveEstimateRowWork(getEffectiveWork(w), r).cost) || 0;
};

// normCN, CATALOG_DEFAULTS, withCatalogOverrides импортированы из ./utils.js
// Форма переопределений каталога (лежит в titovstroy-catalog):
// {renames:{code:name}, catRenames:{"Черновые":"Новое"}, subRenames:{"Черновые|Демонтаж":"Снос"},
//  hiddenCodes:[], hiddenSubs:["Черновые|Демонтаж"], hiddenCats:["Черновые"],
//  custom:[{code,cat,sub,name,unit,tiers,fixedPrice}]}
export let _catalogOverrides = { ...CATALOG_DEFAULTS };
export let _onCatalogChange = null;
// App.jsx раньше присваивал _onCatalogChange напрямую. Импортированной привязке
// присвоить нельзя, поэтому подписка ставится через сеттер — поведение то же.
export function setOnCatalogChange(cb) { _onCatalogChange = cb || null; }
export let _catalogCache = null;
export function setCatalogOverrides(o) {
  _catalogOverrides = withCatalogOverrides(o);
  _catalogCache = null;
  if (_onCatalogChange) _onCatalogChange();
}
export function getEffectiveCatalog() {
  if (_catalogCache) return _catalogCache;
  const hc = _catalogOverrides.hiddenCats||[];
  const hs = _catalogOverrides.hiddenSubs||[];
  const base = WORKS_DATA
    .filter(w => !(_catalogOverrides.hiddenCodes||[]).includes(w.code))
    .filter(w => !hc.includes(w.cat))
    .filter(w => !hs.includes(w.cat+"|"+w.sub))
    .map(w => {
      let r = {...w, tiers: w.tiers||[], _origCat: w.cat, _origSub: w.sub};
      if (_catalogOverrides.renames[r.code]) r = {...r, name: _catalogOverrides.renames[r.code]};
      if (_catalogOverrides.catRenames[w.cat]) r = {...r, cat: _catalogOverrides.catRenames[w.cat]};
      if (_catalogOverrides.subRenames[w.cat+"|"+w.sub]) r = {...r, sub: _catalogOverrides.subRenames[w.cat+"|"+w.sub]};
      return r;
    });
  const custom = (_catalogOverrides.custom||[])
    .filter(w => !(_catalogOverrides.hiddenCodes||[]).includes(w.code))
    .map(w => {
      let r = {...w, tiers: w.tiers||[], _origCat: w.cat, _origSub: w.sub};
      if (_catalogOverrides.renames[r.code]) r = {...r, name: _catalogOverrides.renames[r.code]};
      return r;
    });
  _catalogCache = [...base, ...custom];
  return _catalogCache;
}
