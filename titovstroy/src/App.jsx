import { useState, useMemo, useEffect, useCallback, useRef, Fragment } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, get, set } from "firebase/database";
import ProductionModule from "./production/ProductionModule.jsx";
import { emptyProduction } from "./production/constants.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";

// Debounce hook — задерживает обновление значения, чтобы не тригерить ре-рендер на каждый символ
function useDebounce(value, ms) {
  const [dv, setDv] = useState(value);
  useEffect(() => { const t = setTimeout(() => setDv(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return dv;
}

const firebaseConfig = {
  apiKey:            "AIzaSyCPawCUYGY20SB5cLLszjoNzK5ytew9tCs",
  authDomain:        "titovstroy-da1cf.firebaseapp.com",
  databaseURL:       "https://titovstroy-da1cf-default-rtdb.firebaseio.com",
  projectId:         "titovstroy-da1cf",
  storageBucket:     "titovstroy-da1cf.firebasestorage.app",
  messagingSenderId: "736574510792",
  appId:             "1:736574510792:web:b5d243a051caf4887337fd"
};
let _fbDb = null;
let _fbAuth = null;
// Promise resolves when anonymous auth is ready (or immediately if auth unavailable)
let _fbAuthReady = Promise.resolve();
try {
  const _fbApp = initializeApp(firebaseConfig);
  _fbDb = getDatabase(_fbApp);
  _fbAuth = getAuth(_fbApp);
  _fbAuthReady = new Promise(resolve => {
    const unsub = onAuthStateChanged(_fbAuth, user => {
      unsub();
      if (user) { resolve(); }
      else { signInAnonymously(_fbAuth).then(resolve).catch(resolve); }
    });
  });
} catch(e) {}

const WORKS_DATA = [
  { code:"DEM-001", cat:"Черновые", sub:"Демонтаж", name:"Снятие обоев (не до основания)", unit:"м²", tiers:[], cost:200, margin:0.4, fixedPrice:333 },
  { code:"DEM-002", cat:"Черновые", sub:"Демонтаж", name:"Снятие краски (водоэмульсия / старая побелка)", unit:"м²", tiers:[], cost:700, margin:0.4, fixedPrice:1167 },
  { code:"DEM-003", cat:"Черновые", sub:"Демонтаж", name:"Снятие краски (советская / старая)", unit:"м²", tiers:[], cost:1900, margin:0.4, fixedPrice:3167 },
  { code:"DEM-004", cat:"Черновые", sub:"Демонтаж", name:"Снятие краски (сложный демонтаж)", unit:"м²", tiers:[], cost:4000, margin:0.4, fixedPrice:6667 },
  { code:"DEM-005", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж плитки, керамогранит", unit:"м²", tiers:[], cost:2000, margin:0.4, fixedPrice:3333 },
  { code:"DEM-006", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж декоративных покрытий", unit:"м²", tiers:[], cost:1100, margin:0.4, fixedPrice:1833 },
  { code:"DEM-007", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж гипсокартонных конструкций", unit:"м²", tiers:[], cost:1400, margin:0.4, fixedPrice:2333 },
  { code:"DEM-008", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж натяжных потолков", unit:"м²", tiers:[], cost:300, margin:0.4, fixedPrice:500 },
  { code:"DEM-009", cat:"Черновые", sub:"Демонтаж", name:"Удаление штукатурки", unit:"м²", tiers:[], cost:1900, margin:0.4, fixedPrice:3167 },
  { code:"DEM-010", cat:"Черновые", sub:"Демонтаж", name:"Снятие старой стяжки (пол до основания)", unit:"м²", tiers:[], cost:4500, margin:0.4, fixedPrice:7500 },
  { code:"DEM-011", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж линолеума", unit:"м²", tiers:[], cost:500, margin:0.4, fixedPrice:833 },
  { code:"DEM-012", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж ламината", unit:"м²", tiers:[], cost:450, margin:0.4, fixedPrice:750 },
  { code:"DEM-013", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж паркета", unit:"м²", tiers:[], cost:900, margin:0.4, fixedPrice:1500 },
  { code:"DEM-014", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж плинтусов", unit:"м.п.", tiers:[], cost:200, margin:0.4, fixedPrice:333 },
  { code:"DEM-015", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж галтели", unit:"м.п.", tiers:[], cost:100, margin:0.4, fixedPrice:167 },
  { code:"DEM-016", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж межкомнатных дверей (старые)", unit:"шт", tiers:[], cost:4000, margin:0.4, fixedPrice:6667 },
  { code:"DEM-017", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж межкомнатных дверей (новые)", unit:"шт", tiers:[], cost:3000, margin:0.4, fixedPrice:5000 },
  { code:"DEM-018", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж дверей (железные)", unit:"шт", tiers:[], cost:6000, margin:0.4, fixedPrice:10000 },
  { code:"DEM-019", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж дверей с сохранением для повторной установки", unit:"шт", tiers:[], cost:8000, margin:0.4, fixedPrice:13333 },
  { code:"DEM-020", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж сантехприборов", unit:"шт", tiers:[], cost:2000, margin:0.4, fixedPrice:3333 },
  { code:"DEM-021", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж розеток, выключателей", unit:"шт", tiers:[], cost:300, margin:0.4, fixedPrice:500 },
  { code:"DEM-022", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж перегородок (ГКЛ)", unit:"м²", tiers:[], cost:1400, margin:0.4, fixedPrice:2333 },
  { code:"DEM-023", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж перегородок (монолит)", unit:"м²", tiers:[], cost:12000, margin:0.4, fixedPrice:20000 },
  { code:"DEM-024", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж перегородок (кирпич)", unit:"м²", tiers:[], cost:4000, margin:0.4, fixedPrice:6667 },
  { code:"DEM-025", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж перегородок (газоблок)", unit:"м²", tiers:[], cost:3000, margin:0.4, fixedPrice:5000 },
  { code:"DEM-026", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж радиатора отопления", unit:"шт", tiers:[], cost:5000, margin:0.4, fixedPrice:8333 },
  { code:"DEM-027", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж маяков (стены)", unit:"м²", tiers:[], cost:180, margin:0.4, fixedPrice:300 },
  { code:"DEM-028", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж маяков (пол)", unit:"м²", tiers:[], cost:150, margin:0.4, fixedPrice:250 },
  { code:"MUS-001", cat:"Черновые", sub:"Вынос/мусор", name:"Вынос строительного мусора", unit:"усл.", tiers:[], cost:20000, margin:0.4, fixedPrice:33333 },
  { code:"MUS-002", cat:"Черновые", sub:"Вынос/мусор", name:"Вывоз строительного мусора", unit:"усл.", tiers:[], cost:20000, margin:0.4, fixedPrice:33333 },
  { code:"WALL-001", cat:"Черновые", sub:"Выравнивание стен", name:"Грунтовка основания стен", unit:"м²", tiers:[], cost:200, margin:0.4, fixedPrice:333 },
  { code:"WALL-002", cat:"Черновые", sub:"Выравнивание стен", name:"Монтаж маяков", unit:"м²", tiers:[], cost:450, margin:0.4, fixedPrice:750 },
  { code:"WALL-003", cat:"Черновые", sub:"Выравнивание стен", name:"Штукатурка стен (1–3 см)", unit:"м²", tiers:[], cost:1700, margin:0.4, fixedPrice:2833 },
  { code:"WALL-004", cat:"Черновые", sub:"Выравнивание стен", name:"Штукатурка стен (4–8 см)", unit:"м²", tiers:[], cost:3000, margin:0.4, fixedPrice:5000 },
  { code:"WALL-005", cat:"Черновые", sub:"Выравнивание стен", name:"Армирование сеткой (стены)", unit:"м²", tiers:[], cost:500, margin:0.4, fixedPrice:833 },
  { code:"WALL-006", cat:"Черновые", sub:"Выравнивание стен", name:"Шпаклёвка стен", unit:"м²", tiers:[], cost:1200, margin:0.4, fixedPrice:2000 },
  { code:"WALL-007", cat:"Черновые", sub:"Выравнивание стен", name:"Ошкуривание стен", unit:"м²", tiers:[], cost:400, margin:0.4, fixedPrice:667 },
  { code:"WALL-008", cat:"Черновые", sub:"Выравнивание стен", name:"Восстановление углов", unit:"м.п.", tiers:[], cost:800, margin:0.4, fixedPrice:1333 },
  { code:"WALL-009", cat:"Черновые", sub:"Выравнивание стен", name:"Откосы под окна/двери", unit:"м.п.", tiers:[], cost:1800, margin:0.4, fixedPrice:3000 },
  { code:"FLOOR-001", cat:"Черновые", sub:"Выравнивание пола", name:"Гидроизоляция пола", unit:"м²", tiers:[], cost:500, margin:0.4, fixedPrice:833 },
  { code:"FLOOR-002", cat:"Черновые", sub:"Выравнивание пола", name:"Армирование сеткой (пол)", unit:"м²", tiers:[], cost:600, margin:0.4, fixedPrice:1000 },
  { code:"FLOOR-003", cat:"Черновые", sub:"Выравнивание пола", name:"Монтаж маяков (пол)", unit:"м.п.", tiers:[], cost:450, margin:0.4, fixedPrice:750 },
  { code:"FLOOR-004", cat:"Черновые", sub:"Выравнивание пола", name:"Стяжка ц/п до 80 мм (под керамзит)", unit:"м²", tiers:[], cost:2000, margin:0.4, fixedPrice:3333 },
  { code:"FLOOR-005", cat:"Черновые", sub:"Выравнивание пола", name:"Стяжка ц/п 5–8 см", unit:"м²", tiers:[], cost:3000, margin:0.4, fixedPrice:5000 },
  { code:"FLOOR-006", cat:"Черновые", sub:"Выравнивание пола", name:"Стяжка ц/п 9–12 см", unit:"м²", tiers:[], cost:3900, margin:0.4, fixedPrice:6500 },
  { code:"FLOOR-007", cat:"Черновые", sub:"Выравнивание пола", name:"Засыпка керамзита до 100 мм", unit:"м²", tiers:[], cost:1000, margin:0.4, fixedPrice:1667 },
  { code:"FLOOR-008", cat:"Черновые", sub:"Выравнивание пола", name:"Наливной пол (выравнивание под покрытия)", unit:"м²", tiers:[], cost:1800, margin:0.4, fixedPrice:3000 },
  { code:"EL-001", cat:"Черновые", sub:"Электромонтаж", name:"Составление схемы электрики", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"EL-002", cat:"Черновые", sub:"Электромонтаж", name:"Штробление стен и потолков", unit:"м.п.", tiers:[], cost:null, margin:0.4 },
  { code:"EL-003", cat:"Черновые", sub:"Электромонтаж", name:"Прокладка кабелей", unit:"м.п.", tiers:[], cost:null, margin:0.4 },
  { code:"EL-004", cat:"Черновые", sub:"Электромонтаж", name:"Установка подрозетников", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"EL-005", cat:"Черновые", sub:"Электромонтаж", name:"Прокладка линий под кондиционер", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"EL-006", cat:"Черновые", sub:"Электромонтаж", name:"Монтаж кабеля под интернет/тв", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"ELSH-001", cat:"Черновые", sub:"Электрощит", name:"Сборка электрощита", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"ELSH-002", cat:"Черновые", sub:"Электрощит", name:"Автоматы, УЗО, дифавтоматы", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"ELSH-003", cat:"Черновые", sub:"Электрощит", name:"Распределение групп нагрузки", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"OUT-001", cat:"Черновые", sub:"Выводы", name:"Розетки (вывод)", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"OUT-002", cat:"Черновые", sub:"Выводы", name:"Выключатели (вывод)", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"OUT-003", cat:"Черновые", sub:"Выводы", name:"Выводы под светильники", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"SAN-001", cat:"Черновые", sub:"Водоснабжение", name:"Разводка труб холодной и горячей воды", unit:"м.п.", tiers:[], cost:null, margin:0.4 },
  { code:"SAN-002", cat:"Черновые", sub:"Водоснабжение", name:"Коллекторная система", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"SAN-003", cat:"Черновые", sub:"Водоснабжение", name:"Замена стояков", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"KAN-001", cat:"Черновые", sub:"Канализация", name:"Прокладка канализационных труб", unit:"м.п.", tiers:[], cost:null, margin:0.4 },
  { code:"KAN-002", cat:"Черновые", sub:"Канализация", name:"Выводы под сантехнику", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"SU-001", cat:"Черновые", sub:"Подготовка санузла", name:"Ниши под инсталляцию", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"SU-002", cat:"Черновые", sub:"Подготовка санузла", name:"Перенос точек", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"SU-003", cat:"Черновые", sub:"Подготовка санузла", name:"Выводы под стиральную/посудомоечную машину", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"GID-001", cat:"Черновые", sub:"Гидроизоляция", name:"Поднятие гидроизоляции на стены 20–30 см", unit:"м²", tiers:[], cost:1300, margin:0.4, fixedPrice:2167 },
  { code:"GID-002", cat:"Черновые", sub:"Гидроизоляция", name:"Обработка углов и примыканий", unit:"м.п.", tiers:[], cost:500, margin:0.4, fixedPrice:833 },
  { code:"GID-003", cat:"Черновые", sub:"Гидроизоляция", name:"Гидроизоляция под ванной и душем", unit:"м²", tiers:[], cost:500, margin:0.4, fixedPrice:833 },
  { code:"GID-004", cat:"Черновые", sub:"Гидроизоляция", name:"Герметизация трубных выводов", unit:"шт", tiers:[], cost:600, margin:0.4, fixedPrice:1000 },
  { code:"PREP-001", cat:"Черновые", sub:"Подготовка оснований", name:"Идеальная плоскость под покраску", unit:"м²", tiers:[], cost:2000, margin:0.4, fixedPrice:3333 },
  { code:"PREP-002", cat:"Черновые", sub:"Подготовка оснований", name:"Подготовка под поклейку обоев", unit:"м²", tiers:[], cost:900, margin:0.4, fixedPrice:1500 },
  { code:"PREP-003", cat:"Черновые", sub:"Подготовка оснований", name:"Шпаклёвка потолка", unit:"м²", tiers:[], cost:1300, margin:0.4, fixedPrice:2167 },
  { code:"PREP-004", cat:"Черновые", sub:"Подготовка оснований", name:"Подготовка под натяжной потолок", unit:"м²", tiers:[], cost:500, margin:0.4, fixedPrice:833 },
  { code:"PREP-005", cat:"Черновые", sub:"Подготовка оснований", name:"Выравнивание перепадов пола", unit:"м²", tiers:[], cost:1000, margin:0.4, fixedPrice:1667 },
  { code:"PREP-006", cat:"Черновые", sub:"Подготовка оснований", name:"Ошкуривание потолка", unit:"м²", tiers:[], cost:400, margin:0.4, fixedPrice:667 },
  { code:"PREP-007", cat:"Черновые", sub:"Подготовка оснований", name:"Грунтовка пола", unit:"м²", tiers:[], cost:250, margin:0.4, fixedPrice:417 },
  { code:"PREP-008", cat:"Черновые", sub:"Подготовка оснований", name:"Грунтовка потолка", unit:"м²", tiers:[], cost:250, margin:0.4, fixedPrice:417 },
  { code:"ADD-001", cat:"Черновые", sub:"Дополнительно", name:"Перегородки из ГКЛ (монтаж/перенос)", unit:"м²", tiers:[], cost:4000, margin:0.4, fixedPrice:6667 },
  { code:"ADD-002", cat:"Черновые", sub:"Дополнительно", name:"Перегородки из кирпича (монтаж/перенос)", unit:"м²", tiers:[], cost:5500, margin:0.4, fixedPrice:9167 },
  { code:"ADD-003", cat:"Черновые", sub:"Дополнительно", name:"Перегородки из газоблока (монтаж/перенос)", unit:"м²", tiers:[], cost:3500, margin:0.4, fixedPrice:5833 },
  { code:"ADD-004", cat:"Черновые", sub:"Дополнительно", name:"Шумоизоляция стен и потолков", unit:"м²", tiers:[], cost:1800, margin:0.4, fixedPrice:3000 },
  { code:"ADD-005", cat:"Черновые", sub:"Дополнительно", name:"Утепление лоджий", unit:"м²", tiers:[], cost:1600, margin:0.4, fixedPrice:2667 },
  { code:"ADD-006", cat:"Черновые", sub:"Дополнительно", name:"Подготовка ниш под освещение", unit:"шт", tiers:[], cost:2500, margin:0.4, fixedPrice:4167 },
  { code:"ADD-007", cat:"Черновые", sub:"Дополнительно", name:"Короба и конструкции из ГКЛ", unit:"м.п.", tiers:[], cost:4800, margin:0.4, fixedPrice:8000 },
  { code:"OB-001", cat:"Чистовые", sub:"Стены — Обои", name:"Поклейка обоев", unit:"м²", tiers:[], cost:1200, margin:0.4, fixedPrice:2000 },
  { code:"PA-001", cat:"Чистовые", sub:"Стены — Покраска", name:"Нанесение грунтовки", unit:"м²", tiers:[], cost:300, margin:0.4, fixedPrice:500 },
  { code:"PA-002", cat:"Чистовые", sub:"Стены — Покраска", name:"Покраска в 1 слой", unit:"м²", tiers:[], cost:400, margin:0.4, fixedPrice:667 },
  { code:"PA-003", cat:"Чистовые", sub:"Стены — Покраска", name:"Покраска в 2–3 слоя", unit:"м²", tiers:[], cost:1000, margin:0.4, fixedPrice:1667 },
  { code:"PA-004", cat:"Чистовые", sub:"Стены — Покраска", name:"Окраска откосов и ниш", unit:"м.п.", tiers:[], cost:650, margin:0.4, fixedPrice:1083 },
  { code:"DEC-001", cat:"Чистовые", sub:"Стены — Декоративные", name:"Декоративная штукатурка", unit:"м²", tiers:[], cost:2500, margin:0.4, fixedPrice:4167 },
  { code:"DEC-002", cat:"Чистовые", sub:"Стены — Декоративные", name:"Микробетон", unit:"м²", tiers:[], cost:5000, margin:0.4, fixedPrice:8333 },
  { code:"DEC-003", cat:"Чистовые", sub:"Стены — Декоративные", name:"Венецианка", unit:"м²", tiers:[], cost:6000, margin:0.4, fixedPrice:10000 },
  { code:"DEC-004", cat:"Чистовые", sub:"Стены — Декоративные", name:"Акцентные стены", unit:"м²", tiers:[], cost:2000, margin:0.4, fixedPrice:3333 },
  { code:"PAN-001", cat:"Чистовые", sub:"Стены — Панели", name:"МДФ/ПВХ панели", unit:"м²", tiers:[], cost:1400, margin:0.4, fixedPrice:2333 },
  { code:"PAN-002", cat:"Чистовые", sub:"Стены — Панели", name:"Рейки", unit:"м²", tiers:[], cost:2500, margin:0.4, fixedPrice:4167 },
  { code:"PAN-003", cat:"Чистовые", sub:"Стены — Панели", name:"3D панели", unit:"м²", tiers:[], cost:2000, margin:0.4, fixedPrice:3333 },
  { code:"CEIL-001", cat:"Чистовые", sub:"Потолки", name:"Покраска потолка", unit:"м²", tiers:[], cost:1100, margin:0.4, fixedPrice:1833 },
  { code:"CEIL-002", cat:"Чистовые", sub:"Потолки", name:"Монтаж трековых систем", unit:"м.п.", tiers:[], cost:2500, margin:0.4, fixedPrice:4167 },
  { code:"CEIL-003", cat:"Чистовые", sub:"Потолки", name:"Монтаж световых линий", unit:"м.п.", tiers:[], cost:3500, margin:0.4, fixedPrice:5833 },
  { code:"CEIL-004", cat:"Чистовые", sub:"Потолки", name:"Установка потолочных плинтусов (галтель)", unit:"м.п.", tiers:[], cost:700, margin:0.4, fixedPrice:1167 },
  { code:"CEIL-005", cat:"Чистовые", sub:"Потолки", name:"Монтаж гипсокартонных коробов и ниш", unit:"м²", tiers:[], cost:4800, margin:0.4, fixedPrice:8000 },
  { code:"FLR-001", cat:"Чистовые", sub:"Полы — Покрытия", name:"Укладка линолеума", unit:"м²", tiers:[], cost:1350, margin:0.4, fixedPrice:2250 },
  { code:"FLR-002", cat:"Чистовые", sub:"Полы — Покрытия", name:"Монтаж ламината", unit:"м²", tiers:[], cost:1400, margin:0.4, fixedPrice:2333 },
  { code:"FLR-003", cat:"Чистовые", sub:"Полы — Покрытия", name:"Монтаж кварц-винила", unit:"м²", tiers:[], cost:1700, margin:0.4, fixedPrice:2833 },
  { code:"FLR-004", cat:"Чистовые", sub:"Полы — Покрытия", name:"Монтаж паркетной доски", unit:"м²", tiers:[], cost:2500, margin:0.4, fixedPrice:4167 },
  { code:"FLR-005", cat:"Чистовые", sub:"Полы — Покрытия", name:"Монтаж инженерной доски", unit:"м²", tiers:[], cost:3500, margin:0.4, fixedPrice:5833 },
  { code:"FLR-006", cat:"Чистовые", sub:"Полы — Покрытия", name:"Монтаж керамогранита", unit:"м²", tiers:[], cost:4000, margin:0.4, fixedPrice:6667 },
  { code:"FLR-007", cat:"Чистовые", sub:"Полы — Покрытия", name:"Монтаж плитки (пол)", unit:"м²", tiers:[], cost:3500, margin:0.4, fixedPrice:5833 },
  { code:"FLRA-001", cat:"Чистовые", sub:"Полы — Сопутствующие", name:"Подложка", unit:"м²", tiers:[], cost:180, margin:0.4, fixedPrice:300 },
  { code:"FLRA-002", cat:"Чистовые", sub:"Полы — Сопутствующие", name:"Порожки", unit:"шт", tiers:[], cost:1400, margin:0.4, fixedPrice:2333 },
  { code:"FLRA-003", cat:"Чистовые", sub:"Полы — Сопутствующие", name:"Монтаж плинтусов ПВХ", unit:"м.п.", tiers:[], cost:600, margin:0.4, fixedPrice:1000 },
  { code:"FLRA-004", cat:"Чистовые", sub:"Полы — Сопутствующие", name:"Монтаж плинтусов МДФ", unit:"м.п.", tiers:[], cost:850, margin:0.4, fixedPrice:1417 },
  { code:"FLRA-005", cat:"Чистовые", sub:"Полы — Сопутствующие", name:"Монтаж плинтусов полиуретановых/декор", unit:"м.п.", tiers:[], cost:1000, margin:0.4, fixedPrice:1667 },
  { code:"FLRA-006", cat:"Чистовые", sub:"Полы — Сопутствующие", name:"Монтаж плинтусов деревянных", unit:"м.п.", tiers:[], cost:1200, margin:0.4, fixedPrice:2000 },
  { code:"FLRA-007", cat:"Чистовые", sub:"Полы — Сопутствующие", name:"Герметизация примыканий", unit:"м.п.", tiers:[], cost:500, margin:0.4, fixedPrice:833 },
  { code:"SN-001", cat:"Чистовые", sub:"Сантехника — Установка", name:"Унитаз (вкл. инсталляцию)", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"SN-002", cat:"Чистовые", sub:"Сантехника — Установка", name:"Ванна", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"SN-003", cat:"Чистовые", sub:"Сантехника — Установка", name:"Раковина", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"SN-004", cat:"Чистовые", sub:"Сантехника — Установка", name:"Смесители", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"SN-005", cat:"Чистовые", sub:"Сантехника — Установка", name:"Душевые системы", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"SN-006", cat:"Чистовые", sub:"Сантехника — Установка", name:"Трапы", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"SN-007", cat:"Чистовые", sub:"Сантехника — Установка", name:"Полотенцесушитель", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"SN-008", cat:"Чистовые", sub:"Сантехника — Установка", name:"Монтаж радиатора отопления", unit:"шт", tiers:[], cost:15000, margin:0.4, fixedPrice:25000 },
  { code:"SN-009", cat:"Чистовые", sub:"Сантехника — Установка", name:"Монтаж радиатора (с заменой труб/подводки)", unit:"шт", tiers:[], cost:25000, margin:0.4, fixedPrice:41667 },
  { code:"SNA-001", cat:"Чистовые", sub:"Сантехника — Дополнительно", name:"Монтаж экранов", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"SNA-002", cat:"Чистовые", sub:"Сантехника — Дополнительно", name:"Подключение стиралки/посудомойки", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"ELC-001", cat:"Чистовые", sub:"Электрика чистовая", name:"Установка розеток", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"ELC-002", cat:"Чистовые", sub:"Электрика чистовая", name:"Установка выключателей", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"ELC-003", cat:"Чистовые", sub:"Электрика чистовая", name:"Подключение светильников", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"ELC-004", cat:"Чистовые", sub:"Электрика чистовая", name:"Люстры, бра, треки", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"ELC-005", cat:"Чистовые", sub:"Электрика чистовая", name:"Монтаж точечных светильников", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"ELC-006", cat:"Чистовые", sub:"Электрика чистовая", name:"Подключение вытяжки", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"ELC-007", cat:"Чистовые", sub:"Электрика чистовая", name:"Установка терморегуляторов тёплого пола", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"DR-001", cat:"Чистовые", sub:"Двери и проёмы", name:"Установка межкомнатных дверей (базовые)", unit:"шт", tiers:[], cost:15000, margin:0.4, fixedPrice:25000 },
  { code:"DR-002", cat:"Чистовые", sub:"Двери и проёмы", name:"Установка межкомнатных дверей (скрытый монтаж)", unit:"шт", tiers:[], cost:25000, margin:0.4, fixedPrice:41667 },
  { code:"DR-003", cat:"Чистовые", sub:"Двери и проёмы", name:"Доборы", unit:"шт", tiers:[], cost:2000, margin:0.4, fixedPrice:3333 },
  { code:"DR-004", cat:"Чистовые", sub:"Двери и проёмы", name:"Наличники", unit:"шт", tiers:[], cost:2500, margin:0.4, fixedPrice:4167 },
  { code:"DR-005", cat:"Чистовые", sub:"Двери и проёмы", name:"Установка входной двери", unit:"шт", tiers:[], cost:25000, margin:0.4, fixedPrice:41667 },
  { code:"DR-006", cat:"Чистовые", sub:"Двери и проёмы", name:"Оформление проёмов и порталов", unit:"шт", tiers:[], cost:9000, margin:0.4, fixedPrice:15000 },
  { code:"TL-001", cat:"Чистовые", sub:"Плиточные работы", name:"Укладка плитки на стены", unit:"м²", tiers:[], cost:3200, margin:0.4, fixedPrice:5333 },
  { code:"TL-002", cat:"Чистовые", sub:"Плиточные работы", name:"Укладка плитки на пол", unit:"м²", tiers:[], cost:3200, margin:0.4, fixedPrice:5333 },
  { code:"TL-003", cat:"Чистовые", sub:"Плиточные работы", name:"Раскладка под 45° (запил, диагональ)", unit:"м²", tiers:[], cost:4500, margin:0.4, fixedPrice:7500 },
  { code:"TL-004", cat:"Чистовые", sub:"Плиточные работы", name:"Декоративные вставки", unit:"шт", tiers:[], cost:1000, margin:0.4, fixedPrice:1667 },
  { code:"TL-005", cat:"Чистовые", sub:"Плиточные работы", name:"Затирка швов", unit:"м²", tiers:[], cost:500, margin:0.4, fixedPrice:833 },
  { code:"TL-006", cat:"Чистовые", sub:"Плиточные работы", name:"Монтаж фартука на кухне", unit:"м²", tiers:[], cost:3500, margin:0.4, fixedPrice:5833 },
  { code:"TL-007", cat:"Чистовые", sub:"Плиточные работы", name:"Монтаж декоративных бордюров", unit:"м.п.", tiers:[], cost:1200, margin:0.4, fixedPrice:2000 },
];

// Метки сложности точно как в Google Script
const COMPLEXITY = [
  { label:"Стандарт",              key:"std",  mult:1.0 },
  { label:"Выше среднего + 20%",   key:"mid",  mult:1.2 },
  { label:"Сложно + 50%",          key:"hard", mult:1.5 },
];

const OBJ_TYPES = ["Вторичка","Новостройка","Коммерция"];

const fmt = n => n > 0 ? new Intl.NumberFormat("ru-RU").format(Math.round(n)) : "—";
const today = () => new Date().toLocaleDateString("ru-RU");
const addWorkdays = (date, days) => { let d = new Date(date); let added = 0; while(added < days){ d.setDate(d.getDate()+1); if(d.getDay()!==0&&d.getDay()!==6) added++; } return d; };
const validUntil = () => addWorkdays(new Date(),7).toLocaleDateString("ru-RU",{day:"2-digit",month:"2-digit",year:"numeric"});

// Базовая цена для отображения в колонке (без объёма) — первый диапазон или fixedPrice
// priceOverrides = {code: {fixedPrice?, tiers?}} — загружается из Firebase
let _priceOverrides = {};
function setPriceOverrides(o) { _priceOverrides = o || {}; }

function getEffectiveWork(work) {
  const safe = { ...work, tiers: work.tiers || [] };
  const renamed = _catalogOverrides.renames[safe.code]
    ? { ...safe, name: _catalogOverrides.renames[safe.code] }
    : safe;
  const ov = _priceOverrides[renamed.code];
  if (!ov) return renamed;
  return {
    ...renamed,
    fixedPrice: ov.fixedPrice !== undefined ? ov.fixedPrice : renamed.fixedPrice,
    tiers: ov.tiers !== undefined ? ov.tiers : renamed.tiers,
    cost: ov.cost !== undefined ? ov.cost : renamed.cost,
    margin: ov.margin !== undefined ? ov.margin : renamed.margin,
    priceFrom: ov.priceFrom !== undefined ? ov.priceFrom : renamed.priceFrom,
  };
}

function getBasePrice(work) {
  const w = getEffectiveWork(work);
  if (w.fixedPrice) return w.fixedPrice;
  if (w.tiers && w.tiers.length > 0) return w.tiers[0].price;
  return null;
}

function getPrice(work, qty, complexity, cpxPct) {
  if (!qty || qty <= 0) return null;
  const w = getEffectiveWork(work);
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

function groupData(works) {
  const g = {};
  for (const w of works) {
    if (!g[w.cat]) g[w.cat] = {};
    if (!g[w.cat][w.sub]) g[w.cat][w.sub] = [];
    g[w.cat][w.sub].push(w);
  }
  return g;
}

// G теперь динамический - пересчитывается через getEffectiveCatalog()

// ─── УТИЛИТЫ ────────────────────────────────────────────────────────────────
const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2,6);
// Себестоимость за единицу с учётом разового ручного переопределения в строке сметы
const rowCostPerUnit = (r, w) => (r && r.manualCost !== undefined && r.manualCost !== "" && !isNaN(Number(r.manualCost))) ? Number(r.manualCost) : (Number(w?.cost) || 0);
// Надёжное приведение updatedAt к числу: поддерживает и число (Date.now()), и ISO-строку
const _ts = v => { if (typeof v === "number") return v; const n = new Date(v).getTime(); return isNaN(n) ? 0 : n; };
// Сумма прописью (целые тенге) — для актов выполненных работ
function tengeInWords(num){
  num = Math.round(Math.abs(Number(num)||0));
  if(num===0) return "Ноль тенге";
  const ones=["","один","два","три","четыре","пять","шесть","семь","восемь","девять","десять","одиннадцать","двенадцать","тринадцать","четырнадцать","пятнадцать","шестнадцать","семнадцать","восемнадцать","девятнадцать"];
  const onesF=["","одна","две","три","четыре","пять","шесть","семь","восемь","девять","десять","одиннадцать","двенадцать","тринадцать","четырнадцать","пятнадцать","шестнадцать","семнадцать","восемнадцать","девятнадцать"];
  const tens=["","","двадцать","тридцать","сорок","пятьдесят","шестьдесят","семьдесят","восемьдесят","девяносто"];
  const hund=["","сто","двести","триста","четыреста","пятьсот","шестьсот","семьсот","восемьсот","девятьсот"];
  const triplet=(n,fem)=>{ const s=[]; const h=Math.floor(n/100), t=Math.floor((n%100)/10), o=n%10;
    if(h) s.push(hund[h]);
    if(t>=2){ s.push(tens[t]); if(o) s.push((fem?onesF:ones)[o]); }
    else { const v=t*10+o; if(v) s.push((fem?onesF:ones)[v]); }
    return s.join(" "); };
  const plural=(n,f)=>{ const a=n%10, b=n%100; if(a===1&&b!==11)return f[0]; if(a>=2&&a<=4&&(b<10||b>=20))return f[1]; return f[2]; };
  const res=[];
  const mlrd=Math.floor(num/1e9)%1000, mln=Math.floor(num/1e6)%1000, ths=Math.floor(num/1e3)%1000, rest=num%1000;
  if(mlrd){ res.push(triplet(mlrd,false), plural(mlrd,["миллиард","миллиарда","миллиардов"])); }
  if(mln){ res.push(triplet(mln,false), plural(mln,["миллион","миллиона","миллионов"])); }
  if(ths){ res.push(triplet(ths,true), plural(ths,["тысяча","тысячи","тысяч"])); }
  if(rest){ res.push(triplet(rest,false)); }
  res.push("тенге");
  const str=res.join(" ").replace(/\s+/g," ").trim();
  return str.charAt(0).toUpperCase()+str.slice(1);
}
// Открыть/распечатать готовый HTML-документ. В обычном браузере открываем новую вкладку,
// в PWA (standalone) на iOS новые окна не открываются — печатаем через скрытый iframe.
const openOrPrintHtml = (html, revokeMs = 30000) => {
  const isStandalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
  if (!isStandalone) {
    const blob = new Blob([html], {type:"text/html"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.target = "_blank"; a.rel = "noopener";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), revokeMs);
    return;
  }
  // PWA: печать через скрытый iframe.
  // iOS/Safari в режиме приложения берёт имя PDF из заголовка ВЕРХНЕЙ страницы
  // (а не из iframe), поэтому временно подменяем document.title — чтобы в имя
  // файла попали клиент/адрес/телефон, как на ПК. После печати возвращаем обратно.
  const _tm = html.match(/<title>([\s\S]*?)<\/title>/i);
  const _wantTitle = _tm ? _tm[1].trim() : null;
  const _prevTitle = document.title;
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden","true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none";
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow.document;
  doc.open(); doc.write(html); doc.close();
  const triggerPrint = () => {
    if (_wantTitle) document.title = _wantTitle;
    try { iframe.contentWindow.focus(); iframe.contentWindow.print(); }
    catch(e) { /* ignore */ }
    setTimeout(()=>{ document.title = _prevTitle; }, 8000);
    setTimeout(()=>{ try{ document.body.removeChild(iframe);}catch(e){} }, 60000);
  };
  // Дать времени отрисоваться картинкам (печать/штамп) перед вызовом печати
  setTimeout(triggerPrint, 600);
};
const fmtDate = (ts) => {
  const d = new Date(ts);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const yesterday = new Date(today); yesterday.setDate(today.getDate()-1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleTimeString("ru-RU", {hour:"2-digit",minute:"2-digit"});
  if (isToday) return `Сегодня ${time}`;
  if (isYesterday) return `Вчера ${time}`;
  return d.toLocaleDateString("ru-RU", {day:"numeric",month:"short"}) + " " + time;
};
// Дата + точное время (для статуса онлайн-КП: просмотр/принятие)
const fmtDateTime = (ts) => ts ? new Date(ts).toLocaleString("ru-RU",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"}) : "";
// Текст статуса онлайн-КП по снимку: просмотры (+ время последнего) и принятие (+ время)
const kpStatusText = (d) => {
  if (!d) return "";
  const v = d.viewCount ? ("👁 просмотров: " + d.viewCount + (d.viewedAt ? (" · последний " + fmtDateTime(d.viewedAt)) : "")) : "👁 ещё не открыто клиентом";
  return v + (d.acceptedAt ? (" · ✅ ПРИНЯТО " + fmtDateTime(d.acceptedAt)) : "");
};

const EMPTY_PROJ = { name:"", type:"Вторичка", area:"", address:"", phone:"", manager:"" };

const STATUSES = [
  { key:"new",       label:"Новая",              color:"#2563eb", bg:"#eff6ff"   },
  { key:"progress",  label:"В работе",           color:"#d97706", bg:"rgba(217,119,6,.12)"  },
  { key:"sent",      label:"Отправлено клиенту", color:"#7c3aed", bg:"rgba(124,58,237,.1)"  },
  { key:"agreed",    label:"Согласовано",        color:"#059669", bg:"#eff6ff"  },
  { key:"rejected",  label:"Отказ",              color:"#dc2626", bg:"rgba(220,38,38,.12)"   },
];
const CONTRACT_STATUSES = [
  { key:"draft",   label:"Черновик",     color:"#94a3b8", bg:"#f3f4f6"              },
  { key:"sign",    label:"На подписание", color:"#d97706", bg:"rgba(217,119,6,.12)" },
  { key:"signed",  label:"Заключён",     color:"#059669", bg:"rgba(5,150,105,.1)"   },
  { key:"archive", label:"Архив",        color:"#64748b", bg:"rgba(107,114,128,.12)"},
];
// Объекты — статусы жизненного цикла
const DEAL_STATUSES = [
  { key:"new",      label:"Черновик",                color:"#64748b", bg:"#f3f4f6"              },
  { key:"approval", label:"Согласование с клиентом", color:"#d97706", bg:"rgba(217,119,6,.12)"  },
  { key:"signed",   label:"Договор подписан",        color:"#059669", bg:"rgba(5,150,105,.1)"   },
  { key:"refuse",   label:"Отказ",                   color:"#dc2626", bg:"rgba(220,38,38,.1)"   },
  { key:"archive",  label:"Архив",                   color:"#64748b", bg:"rgba(107,114,128,.12)"},
];
const OBJECTS_KEY         = "titovstroy-objects";
const OBJECTS_BACKUPS_KEY = "titovstroy-objects-backups";
const PRODUCTIONS_KEY         = "titovstroy-productions";   // производственные карточки объектов
const PRODUCTIONS_BACKUPS_KEY = "titovstroy-productions-backups";
const REPORTS_KEY         = "titovstroy-reports";          // отчёты по объектам (АВР, форма Р-1)
const REPORTS_BACKUPS_KEY = "titovstroy-reports-backups";
const WORKERS_KEY         = "titovstroy-workers";          // справочник подрядчиков (рабочих)
const WORKERS_BACKUPS_KEY = "titovstroy-workers-backups";
const PODRYADS_KEY        = "titovstroy-podryads";         // договоры подряда с рабочими + их приложения
const PODRYADS_BACKUPS_KEY= "titovstroy-podryads-backups";
// единый снимок рабочего пространства: объекты + их сметы + их договора
const WORKSPACE_BACKUPS_KEY = "titovstroy-workspace-backups";
// legacy ключ для миграции старых сделок
const DEALS_KEY          = "titovstroy-deals";
const DEALS_BACKUPS_KEY  = "titovstroy-deals-backups";
const STORAGE_KEY        = "titovstroy-estimates";
const BACKUPS_KEY        = "titovstroy-estimates-backups"; // снимки архива для восстановления
const USERS_KEY          = "titovstroy-users";
const SESSION_KEY        = "titovstroy-session";
const PRESENCE_KEY       = "titovstroy-presence"; // { [userId]: lastSeenTs } — кто когда был онлайн
const PRESENCE_ONLINE_MS = 2 * 60 * 1000; // «в сети», если активность была <2 мин назад
const PRICES_KEY         = "titovstroy-prices";  // переопределённые цены {code: {fixedPrice?, tiers?}}
const CATALOG_BACKUPS_KEY= "titovstroy-catalog-backups"; // снимки каталога (последние 10)
const CONTRACTS_BACKUPS_KEY = "titovstroy-contracts-backups";
const CLIENTS_BACKUPS_KEY   = "titovstroy-clients-backups";
const CONTRAGENTS_BACKUPS_KEY = "titovstroy-contragents-backups";
const CATALOG_KEY    = "titovstroy-catalog";
const CONTRACTS_KEY  = "titovstroy-contracts";
const CLIENTS_KEY    = "titovstroy-clients";
const CONTRAGENTS_KEY= "titovstroy-contragents";
// ── ФИНАНСЫ (независимый учёт: ДДС + P&L) ──
const AUDIT_KEY               = "titovstroy-audit";             // журнал действий
const FINANCE_TX_KEY          = "titovstroy-finance-tx";        // массив транзакций
const FINANCE_TX_BACKUPS_KEY  = "titovstroy-finance-tx-backups";
const FINANCE_META_KEY        = "titovstroy-finance-meta";      // {accounts, income, expense}
const FINANCE_META_BACKUPS_KEY= "titovstroy-finance-meta-backups";
const FINANCE_PROJECTS_KEY         = "titovstroy-finance-projects";   // массив проектов
const FINANCE_PROJECTS_BACKUPS_KEY = "titovstroy-finance-projects-backups";
// Справочник финансов по умолчанию (из исходной таблицы)
const DEFAULT_FIN_META = {
  accounts: [
    { id:"acc0", name:"Наличные",    opening:0, accType:"cash" },
    { id:"acc1", name:"KASPI Pay",   opening:0, accType:"bank" },
    { id:"acc2", name:"Учет займов", opening:0, accType:"bank" },
    { id:"acc3", name:"Лч Звеат",    opening:0, accType:"card" },
  ],
  // Реестр статей баланса (вводятся вручную) — основные средства, запасы, займы, кредиторка, капитал
  balanceItems: {
    inventory:0, collateral:0, loansGivenShort:0, transfersInTransit:0,
    faTechnika:0, faMebel:0, faInventar:0, faOborud:0, faTransport:0,
    loansGivenLong:0, financialInvest:0, intangibles:0,
    payablesMoney:0, payablesNonMoney:0, paymentsThirdParty:0, loansTakenShort:0,
    creditsLong:0, loansTakenLong:0,
    foundersContribution:0, otherCapital:0,
  },
  income: [
    { cat:"Основные доходы", subs:["Оплата по договору (вторичка)","Оплата по договору (новостройки)","Оплата по договору  (коммерция)","Частичные работы, услуги"] },
    { cat:"Дополнительные доходы", subs:["Доп. работы по ходу ремонта","Закупка материалов (наценка)"] },
    { cat:"Скрытые/косвенные доходы", subs:["Кэшбэк и бонусы от поставщиков","Бонусы от субподрядчиков (наш %)","Услуги по доставке/подъёму"] },
    { cat:"Финансирование (не выручка)", subs:["Полученный заём (до 1 года)","Полученный заём (от 1 года)","Полученный кредит (от 1 года)","Вклад учредителя"] },
    { cat:"Возврат займов и активов", subs:["Возврат займа выданного (кратк.)","Возврат займа выданного (долг.)","Возврат залогового платежа","Продажа / реализация запасов","Возврат фин. вложений"] },
  ],
  expense: [
    { cat:"Прямые расходы (COGS / себестоимость)", subs:["Зарплаты рабочих / подрядчиков","Аренда инструмента, спецтехника","Вывоз мусора, уборка","Логистика, доставка"] },
    { cat:"Косвенные расходы (OPEX / операционные)", subs:["Аренда офиса","ФОТ Директор по производству","ФОТ Управляющий партнер","ФОТ Прораб","Софт (IT, CRM)","Рекрутинг","Телефония, связь","Маркетинг бюджет контекст","Маркетинг бюджет таргет"] },
    { cat:"Финансовые расходы", subs:["КПН, ИПН","НДС 16%","Налог за сотрудников","Дивиденды учредителям"] },
    { cat:"Финансовая деятельность (не расход)", subs:["Возврат займа (до 1 года)","Возврат займа (от 1 года)","Погашение кредита (от 1 года)","Возврат вклада учредителю"] },
    { cat:"Инвестиции (покупка активов)", subs:["Покупка: Техника","Покупка: Мебель","Покупка: Инвентарь","Покупка: Оборудование","Покупка: Транспорт"] },
    { cat:"Выданные займы и прочие активы", subs:["Выдан займ (до 1 года)","Выдан займ (от 1 года)","Залоговый платёж","Закуп запасов / материалов","Финансовые вложения (долг.)","НМА (нематериальные активы)"] },
  ],
};
// Категории, которые НЕ являются P&L (не выручка / не расход) — финансовая и инвестиционная деятельность
const C_FINANCING_INC = "Финансирование (не выручка)";        // доходы: займы/кредиты/вклады
const C_ASSET_INC     = "Возврат займов и активов";            // доходы: возврат активов — не P&L, инвест. раздел ДДС
const C_FINACT = "Финансовая деятельность (не расход)";        // расходы: возвраты займов/вкладов
const C_INVEST = "Инвестиции (покупка активов)";               // расходы: капвложения в ОС (кассовый метод — расход)
const C_ASSET_OUT     = "Выданные займы и прочие активы";      // расходы: займы выданные, залоги, запасы — не P&L
const FA_SUB_MAP = { "Покупка: Техника":"faTechnika","Покупка: Мебель":"faMebel","Покупка: Инвентарь":"faInventar","Покупка: Оборудование":"faOborud","Покупка: Транспорт":"faTransport" };
// Маппинг подкатегорий C_ASSET_OUT / C_ASSET_INC → ключ баланса
const ASSET_OUT_KEYS = { "Выдан займ (до 1 года)":"loansGivenShort","Выдан займ (от 1 года)":"loansGivenLong","Залоговый платёж":"collateral","Закуп запасов / материалов":"inventory","Финансовые вложения (долг.)":"financialInvest","НМА (нематериальные активы)":"intangibles" };
const ASSET_INC_KEYS = { "Возврат займа выданного (кратк.)":"loansGivenShort","Возврат займа выданного (долг.)":"loansGivenLong","Возврат залогового платежа":"collateral","Продажа / реализация запасов":"inventory","Возврат фин. вложений":"financialInvest" };
// Миграция: дописывает недостающие дефолтные категории/подкатегории в сохранённый meta (не трогая пользовательские)
function mergeFinMeta(saved) {
  const m = { ...saved };
  ["income","expense"].forEach(key => {
    const cur = Array.isArray(m[key]) ? [...m[key]] : [];
    (DEFAULT_FIN_META[key]||[]).forEach(defCat => {
      const ex = cur.find(c => c.cat === defCat.cat);
      if (!ex) { cur.push({ cat: defCat.cat, subs: [...(defCat.subs||[])] }); }
      else { const subs = Array.isArray(ex.subs) ? [...ex.subs] : []; (defCat.subs||[]).forEach(s => { if (!subs.includes(s)) subs.push(s); }); ex.subs = subs; }
    });
    m[key] = cur;
  });
  return m;
}
// {renames:{code:name}, catRenames:{"Черновые":"Новое"}, subRenames:{"Черновые|Демонтаж":"Снос"},
//  hiddenCodes:[], hiddenSubs:["Черновые|Демонтаж"], hiddenCats:["Черновые"],
//  custom:[{code,cat,sub,name,unit,tiers,fixedPrice}]}

let _catalogOverrides = { renames:{}, catRenames:{}, subRenames:{}, hiddenCodes:[], hiddenSubs:[], hiddenCats:[], custom:[] };
let _onCatalogChange = null;
let _catalogCache = null;
function setCatalogOverrides(o) {
  _catalogOverrides = { renames:{}, catRenames:{}, subRenames:{}, hiddenCodes:[], hiddenSubs:[], hiddenCats:[], custom:[], ...(o||{}) };
  _catalogCache = null;
  if (_onCatalogChange) _onCatalogChange();
}
function getEffectiveCatalog() {
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

// Дефолтные пользователи
const DEFAULT_USERS = [
  { id:"1", login:"admin",    password:"titov2024", name:"Василий Титов",   role:"admin"  },
  { id:"2", login:"zamer1",   password:"zamer1",    name:"Замерщик 1",      role:"user"   },
];

// Простой хэш
const simpleHash = (s) => btoa(encodeURIComponent(s)).split("").reverse().join("");

// Аудит: записываем событие {ts, userId, userName, action, entity, entityId, detail}
// Хранится как массив, ограниченный 500 последними записями (ротация).
const writeAudit = async (user, action, entity, entityId, detail="") => {
  try {
    const raw = await storage.get(AUDIT_KEY);
    const prev = raw ? JSON.parse(raw.value) : [];
    const entry = { ts:Date.now(), userId:user?.id||"?", by:user?.name||"?", action, entity, entityId:entityId||"", detail };
    const next = [entry, ...prev].slice(0, 500);
    await storage.set(AUDIT_KEY, JSON.stringify(next));
  } catch(e) { console.warn("audit write failed", e); }
};

// Экспорт в CSV (Excel открывает напрямую; BOM + ; для русской локали)
const downloadCSV = (filename, headers, rows) => {
  const esc = (v) => {
    let s = v===null||v===undefined ? "" : String(v);
    // Защита от инъекции формул в Excel/Sheets: поле, начинающееся с = + - @,
    // предваряем апострофом, чтобы оно не выполнилось как формула
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[";\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
  };
  const lines = [headers.map(esc).join(";"), ...rows.map(r=>r.map(esc).join(";"))];
  const blob = new Blob(["﻿"+lines.join("\r\n")], { type:"text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
};

// ─── ХРАНИЛИЩЕ: Firebase (общая) + localStorage (резерв) ───────────────────
const _mem = {};
const _TIMEOUT = Symbol("timeout");
const _race = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r(_TIMEOUT), ms))]);
const _fbKey = (k) => k.replace(/[^a-zA-Z0-9_]/g, "_"); // Firebase: только буквы/цифры/_
const _TS_SUFFIX = "__wts"; // timestamp последней локальной записи
const _DIRTY_SUFFIX = "__dirty"; // флаг: последняя запись в облако НЕ прошла — локальная копия новее
const storage = {
  // Расширенное чтение: { value, status: 'found'|'empty'|'unavailable' }
  // 'found' — данные есть; 'empty' — источник точно ответил, данных нет;
  // 'unavailable' — Firebase не ответил/ошибка И локальной копии нет (НЕЛЬЗЯ затирать!)
  async getResult(key) {
    // Свежая локальная запись (<30с) — самый надёжный источник
    try {
      const ts = parseInt(localStorage.getItem(key + _TS_SUFFIX) || "0");
      if (Date.now() - ts < 30000) {
        const v = localStorage.getItem(key);
        if (v) return { value: v, status: "found" };
      }
    } catch(e) {}
    // Незасинхронизированные локальные правки: если последняя запись в облако
    // упала — доверяем локальной копии, иначе старое облако перетрёт свежую
    // правку при перезаходе (потеря только что сохранённой сметы/операции).
    try {
      if (localStorage.getItem(key + _DIRTY_SUFFIX)) {
        const v = localStorage.getItem(key);
        if (v) return { value: v, status: "found" };
      }
    } catch(e) {}
    // Firebase (синхронизация между устройствами)
    let fbResponded = !_fbDb; // если FB не сконфигурирован — авторитетен localStorage
    try {
      if (_fbDb) {
        await _fbAuthReady;
        let snap = await _race(get(ref(_fbDb, _fbKey(key))), 8000);
        // Одна повторная попытка при таймауте (сеть могла мигнуть)
        if (snap === _TIMEOUT) {
          await new Promise(r=>setTimeout(r,500));
          snap = await _race(get(ref(_fbDb, _fbKey(key))), 8000);
        }
        if (snap === _TIMEOUT) {
          fbResponded = false; // таймаут — НЕ знаем что в базе
        } else {
          fbResponded = true;
          if (snap && snap.exists()) {
            const v = snap.val();
            // Новый формат — строка JSON; старый — вложенный объект (обратная совместимость)
            return { value: typeof v === "string" ? v : JSON.stringify(v), status: "found" };
          }
        }
      }
    } catch(e) { console.warn("FB get error:", e); fbResponded = false; }
    // Резерв: localStorage любой давности
    try { const v = localStorage.getItem(key); if (v) return { value: v, status: "found" }; } catch(e) {}
    if (_mem[key]) return { value: _mem[key], status: "found" };
    // Ничего не нашли: различаем «точно пусто» и «недоступно»
    return { value: null, status: fbResponded ? "empty" : "unavailable" };
  },
  async get(key) {
    const r = await this.getResult(key);
    return r.status === "found" ? { value: r.value } : null;
  },
  async set(key, value) {
    // Сначала localStorage — всегда надёжно и мгновенно
    try { localStorage.setItem(key, value); localStorage.setItem(key + _TS_SUFFIX, Date.now().toString()); } catch(e) {}
    _mem[key] = value;
    // Firebase — пишем СТРОКУ JSON целиком (а не вложенный объект),
    // иначе ключи с символами / . # $ [ ] (напр. названия работ со слэшем) ломают запись.
    let fbOk = false, fbError = null;
    if (_fbDb) {
      try {
        await _fbAuthReady;
        let res = await _race(set(ref(_fbDb, _fbKey(key)), value), 12000);
        // Одна повторная попытка записи при таймауте/ошибке
        if (res === _TIMEOUT) {
          await new Promise(r=>setTimeout(r,800));
          res = await _race(set(ref(_fbDb, _fbKey(key)), value), 12000);
        }
        if (res === _TIMEOUT) { fbError = "timeout"; }
        else { fbOk = true; }
      } catch(e) {
        fbError = e?.message || String(e); console.warn("FB set error:", e);
        // повтор после ошибки
        try {
          await new Promise(r=>setTimeout(r,800));
          const res2 = await _race(set(ref(_fbDb, _fbKey(key)), value), 12000);
          if (res2 !== _TIMEOUT) { fbOk = true; fbError = null; }
        } catch(e2) { fbError = e2?.message || String(e2); }
      }
    } else {
      fbError = "firebase not configured";
    }
    // Помечаем ключ «грязным», если в облако записать не удалось — тогда при
    // следующей загрузке предпочтём локальную копию (см. getResult). При
    // успешной записи флаг снимаем.
    try {
      if (fbOk) localStorage.removeItem(key + _DIRTY_SUFFIX);
      else if (_fbDb) localStorage.setItem(key + _DIRTY_SUFFIX, Date.now().toString());
    } catch(e) {}
    return { value, fbOk, fbError };
  },
};

// ─── ЭКРАН ВХОДА ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [login, setLogin]   = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const handleLogin = async () => {
    if (loading) return; // защита от двойной отправки
    if (!login.trim() || !password.trim()) { setError("Введите логин и пароль"); return; }
    setLoading(true); setError("");

    // Загружаем пользователей с таймаутом 1.5 сек, иначе используем DEFAULT_USERS
    let users = DEFAULT_USERS;
    try {
      const res = await Promise.race([
        storage.get(USERS_KEY),
        new Promise(resolve => setTimeout(() => resolve(null), 1500))
      ]);
      if (res) users = JSON.parse(res.value);
    } catch(e) {}

    const user = users.find(u =>
      u.login.toLowerCase() === login.trim().toLowerCase() &&
      (u.password === password || u.password === simpleHash(password))
    );

    if (user) {
      const { password: _pw, ...safeUser } = user; // не храним пароль в сессии
      try { localStorage.setItem(SESSION_KEY, JSON.stringify({ user: safeUser, savedAt: Date.now() })); } catch(e) {}
      onLogin(safeUser);
      return; // компонент размонтируется, setLoading вызывать нельзя
    } else {
      setError("Неверный логин или пароль");
    }
    setLoading(false);
  };

  return (
    <div style={{minHeight:"100vh",background:"#f8fafc",display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"'Inter','Segoe UI',sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Poppins:wght@600;700;800;900&display=swap');*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Inter','Segoe UI',sans-serif;-webkit-font-smoothing:antialiased;color:#111827;background:#f8fafc}h1,h2,h3{font-family:'Poppins','Inter',sans-serif;letter-spacing:-.02em}button{font-family:'Inter','Segoe UI',sans-serif}a[x-apple-data-detectors],a[href^="tel"]{color:inherit!important;text-decoration:none!important;pointer-events:none!important;-webkit-text-decoration-color:inherit!important}`}</style>
      <div style={{width:"100%",maxWidth:380}}>
        {/* Лого */}
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{width:56,height:56,borderRadius:8,background:"#2563eb",display:"inline-flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:26,color:"#f3f4f6",marginBottom:12}}>T</div>
          <div style={{fontWeight:900,fontSize:22,color:"#0f172a",letterSpacing:.3}}>TitovStroy</div>
          <div style={{fontSize:12,color:"#94a3b8",marginTop:4}}>Система расчёта смет · Вход</div>
        </div>

        {/* Форма */}
        <div style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:8,padding:"28px 28px"}}>
          <div style={{marginBottom:16}}>
            <div style={{fontSize:11,color:"#94a3b8",marginBottom:6,fontWeight:600,letterSpacing:.5,textTransform:"uppercase"}}>Логин</div>
            <input
              style={{background:"#ffffff",border:"1px solid #e2e8f0",color:"#0f172a",borderRadius:8,padding:"11px 14px",fontFamily:"inherit",fontSize:14,width:"100%",outline:"none",transition:"border .15s"}}
              placeholder="Введите логин"
              value={login}
              onChange={e=>{setLogin(e.target.value);setError("");}}
              onKeyDown={e=>e.key==="Enter"&&handleLogin()}
              autoComplete="username"
            />
          </div>
          <div style={{marginBottom:20}}>
            <div style={{fontSize:11,color:"#94a3b8",marginBottom:6,fontWeight:600,letterSpacing:.5,textTransform:"uppercase"}}>Пароль</div>
            <div style={{position:"relative"}}>
              <input
                style={{background:"#ffffff",border:"1px solid #e2e8f0",color:"#0f172a",borderRadius:8,padding:"11px 40px 11px 14px",fontFamily:"inherit",fontSize:14,width:"100%",outline:"none",transition:"border .15s"}}
                placeholder="Введите пароль"
                type={showPass?"text":"password"}
                value={password}
                onChange={e=>{setPassword(e.target.value);setError("");}}
                onKeyDown={e=>e.key==="Enter"&&handleLogin()}
                autoComplete="current-password"
              />
              <button onClick={()=>setShowPass(p=>!p)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"#94a3b8",fontSize:16}}>
                {showPass?"🙈":"👁"}
              </button>
            </div>
          </div>

          {error && (
            <div style={{background:"rgba(220,38,38,.1)",border:"1px solid rgba(200,60,60,.25)",borderRadius:7,padding:"9px 12px",fontSize:12,color:"#dc2626",marginBottom:16,textAlign:"center"}}>
              {error}
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={loading}
            style={{width:"100%",background:"#2563eb",color:"#f3f4f6",border:"none",cursor:loading?"not-allowed":"pointer",padding:"13px",borderRadius:8,fontFamily:"inherit",fontSize:14,fontWeight:700,opacity:loading?.6:1,transition:"all .2s"}}>
            {loading ? "Проверка..." : "Войти"}
          </button>
        </div>
        <div style={{textAlign:"center",marginTop:16,fontSize:11,color:"#d1d5db"}}>TitovStroy · Только для сотрудников</div>
      </div>
    </div>
  );
}

// PriceWorkCard — not used in new table UI, kept for AdminPanel legacy
function PriceWorkCard({ w, initTiers, initFixed, onRename, onDelete }) {
  return null;
}



function AuditTab() {
  const [auditLog, setAuditLog] = useState([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [filterSection, setFilterSection] = useState("");
  useEffect(()=>{
    (async()=>{
      setAuditLoading(true);
      const r = await storage.get(AUDIT_KEY);
      if(r){ try{ setAuditLog(JSON.parse(r.value)); }catch{} }
      setAuditLoading(false);
    })();
  }, []);

  const SECTION_META = {
    finance_tx: { label:"Финансы",    color:"#059669", bg:"#d1fae5", icon:"💰" },
    object:     { label:"Объекты",    color:"#2563eb", bg:"#dbeafe", icon:"🏗" },
    contract:   { label:"Договора",   color:"#7c3aed", bg:"#ede9fe", icon:"📋" },
    user:       { label:"Польз-ли",   color:"#d97706", bg:"#fef3c7", icon:"👤" },
  };
  const ACTION_META = {
    "создал операцию":      { icon:"➕", color:"#059669" },
    "изменил операцию":     { icon:"✏️", color:"#2563eb" },
    "удалил операцию":      { icon:"🗑", color:"#dc2626" },
    "создал объект":        { icon:"➕", color:"#059669" },
    "изменил объект":       { icon:"✏️", color:"#2563eb" },
    "удалил объект":        { icon:"🗑", color:"#dc2626" },
    "восстановил объект":   { icon:"♻️", color:"#059669" },
    "создал договор":       { icon:"➕", color:"#059669" },
    "изменил договор":      { icon:"✏️", color:"#2563eb" },
    "удалил договор":       { icon:"🗑", color:"#dc2626" },
    "восстановил договор":  { icon:"♻️", color:"#059669" },
    "создал пользователя":  { icon:"➕", color:"#059669" },
    "изменил пользователя": { icon:"✏️", color:"#2563eb" },
  };

  const sections = [...new Set(auditLog.map(e=>e.entity).filter(Boolean))];
  const filtered = filterSection ? auditLog.filter(e=>e.entity===filterSection) : auditLog;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:8}}>
        <div style={{fontWeight:700,fontSize:14,color:"#0f172a"}}>Журнал действий</div>
        <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
          <button onClick={()=>setFilterSection("")} style={{fontSize:11,padding:"3px 10px",borderRadius:20,border:"1px solid #e2e8f0",background:filterSection===""?"#0f172a":"#f8fafc",color:filterSection===""?"#fff":"#64748b",cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>Все</button>
          {sections.map(s=>{ const m=SECTION_META[s]; if(!m) return null; return (
            <button key={s} onClick={()=>setFilterSection(s===filterSection?"":s)} style={{fontSize:11,padding:"3px 10px",borderRadius:20,border:`1px solid ${m.color}40`,background:filterSection===s?m.color:m.bg,color:filterSection===s?"#fff":m.color,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>{m.icon} {m.label}</button>
          );})}
          <span style={{fontSize:11,color:"#94a3b8"}}>{filtered.length} событий</span>
        </div>
      </div>
      {auditLoading && <div style={{color:"#94a3b8",textAlign:"center",padding:"30px 0"}}>Загрузка...</div>}
      {!auditLoading && filtered.length===0 && <div style={{color:"#94a3b8",textAlign:"center",padding:"30px 0"}}>Событий пока нет</div>}
      {filtered.map((e,i)=>{
        const sm = SECTION_META[e.entity]||{ label:e.entity||"—", color:"#64748b", bg:"#f1f5f9", icon:"📝" };
        const am = ACTION_META[e.action]||{ icon:"📝", color:"#64748b" };
        return (
          <div key={i} style={{background:"#fff",border:"1px solid #f1f5f9",borderRadius:10,padding:"10px 14px",display:"flex",gap:10,alignItems:"flex-start"}}>
            <div style={{width:34,height:34,borderRadius:8,background:sm.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{sm.icon}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:3}}>
                <span style={{fontSize:10,fontWeight:700,color:sm.color,background:sm.bg,padding:"1px 7px",borderRadius:20,border:`1px solid ${sm.color}30`}}>{sm.label}</span>
                <span style={{fontSize:12,fontWeight:700,color:am.color}}>{am.icon} {e.action}</span>
              </div>
              <div style={{fontSize:12,color:"#0f172a"}}><b style={{color:"#2563eb"}}>{e.by}</b>{e.detail ? <span style={{color:"#64748b",fontWeight:400}}> · {e.detail}</span> : null}</div>
            </div>
            <div style={{fontSize:11,color:"#94a3b8",whiteSpace:"nowrap",flexShrink:0,textAlign:"right"}}>
              <div>{new Date(e.ts).toLocaleString("ru-RU",{day:"2-digit",month:"2-digit"})}</div>
              <div>{new Date(e.ts).toLocaleString("ru-RU",{hour:"2-digit",minute:"2-digit"})}</div>
            </div>
          </div>
        );
      })}
      {auditLog.length>0&&<button onClick={()=>downloadCSV("audit_"+new Date().toISOString().slice(0,10)+".csv",["Дата","Кто","Раздел","Действие","Детали"],auditLog.map(e=>[new Date(e.ts).toLocaleString("ru-RU"),e.by,SECTION_META[e.entity]?.label||e.entity||"",e.action,e.detail||""]))} style={{alignSelf:"flex-start",background:"#eff6ff",color:"#2563eb",border:"1px solid #bfdbfe",borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>⬇ Экспорт журнала</button>}
    </div>
  );
}

function AdminPanel({ currentUser, onClose }) {
  const [tab, setTab] = useState("users"); // "users" | "prices"
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [newLogin, setNewLogin]   = useState("");
  const [newName, setNewName]     = useState("");
  const [newPass, setNewPass]     = useState("");
  const [newRole, setNewRole]     = useState("user");
  const [editingPass, setEditingPass] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [msg, setMsg] = useState("");
  // Прайс-лист
  const [localPrices, setLocalPrices] = useState(null);
  const [savedOverrides, setSavedOverrides] = useState({});
  const [localCatalog, setLocalCatalog] = useState(null); // {renames, custom, hiddenCodes}
  const [priceSearch, setPriceSearch] = useState("");
  const [priceMsg, setPriceMsg] = useState("");
  const [priceSaving, setPriceSaving] = useState(false);
  // Форма новой позиции
  const [showAddWork, setShowAddWork] = useState(false);
  const [newWork, setNewWork] = useState({cat:"", sub:"", name:"", unit:"м²"});
  // Редактирование категорий/подкатегорий
  const [editingCat, setEditingCat] = useState(null);   // {key, val} — key = оригинальное имя
  const [editingSub, setEditingSub] = useState(null);   // {cat, key, val}

  const _priceAutoSaveModal = useRef(null);
  useEffect(() => {
    if (!localPrices) return;
    if (_priceAutoSaveModal.current) clearTimeout(_priceAutoSaveModal.current);
    _priceAutoSaveModal.current = setTimeout(() => { savePrices(); }, 2000);
    return () => clearTimeout(_priceAutoSaveModal.current);
  }, [localPrices]);

  useEffect(() => {
    (async () => {
      try {
        const res = await storage.get(USERS_KEY);
        setUsers(res ? JSON.parse(res.value) : DEFAULT_USERS);
      } catch { setUsers(DEFAULT_USERS); }
      // Загружаем каталог
      try {
        const cat = await storage.get(CATALOG_KEY);
        if (cat) { const parsed = JSON.parse(cat.value); setCatalogOverrides(parsed); setLocalCatalog(parsed); }
        else setLocalCatalog({ renames:{}, custom:[], hiddenCodes:[] });
      } catch { setLocalCatalog({ renames:{}, custom:[], hiddenCodes:[] }); }
      // Загружаем переопределения цен и инициализируем localPrices
      try {
        const pr = await storage.get(PRICES_KEY);
        const ov = pr ? JSON.parse(pr.value) : {};
        setSavedOverrides(ov);
        const allWorks = getEffectiveCatalog();
        const lp = {};
        for (const w of allWorks) {
          const saved = ov[w.code];
          lp[w.code] = {
            tiers: saved?.tiers !== undefined ? saved.tiers.map(t=>({...t})) : (w.tiers||[]).map(t=>({...t})),
            fixedPrice: saved?.fixedPrice !== undefined ? String(saved.fixedPrice) : w.fixedPrice !== undefined ? String(w.fixedPrice) : ""
          };
        }
        setLocalPrices(lp);
      } catch {}
      setLoading(false);
    })();
  }, []);

  const saveUsers = async (list) => {
    setSaving(true);
    await storage.set(USERS_KEY, JSON.stringify(list));
    setSaving(false);
  };

  const addUser = async () => {
    if (!newLogin.trim() || !newPass.trim() || !newName.trim()) { setMsg("Заполните все поля"); return; }
    if (users.find(u => u.login.toLowerCase() === newLogin.trim().toLowerCase())) { setMsg("Логин уже занят"); return; }
    const u = { id: genId(), login: newLogin.trim(), password: simpleHash(newPass.trim()), name: newName.trim(), role: newRole };
    const updated = [...users, u];
    setUsers(updated);
    await saveUsers(updated);
    setNewLogin(""); setNewName(""); setNewPass(""); setNewRole("user");
    setMsg("✓ Пользователь добавлен");
    setTimeout(() => setMsg(""), 2500);
  };

  const removeUser = async (id) => {
    if (id === currentUser.id) { setMsg("Нельзя удалить себя"); setTimeout(()=>setMsg(""),2000); return; }
    const updated = users.filter(u => u.id !== id);
    setUsers(updated);
    await saveUsers(updated);
  };

  const savePass = async (id) => {
    if (!editingPass?.val?.trim()) return;
    const updated = users.map(u => u.id === id ? {...u, password: simpleHash(editingPass.val.trim())} : u);
    setUsers(updated);
    await saveUsers(updated);
    setEditingPass(null);
    setMsg("✓ Пароль изменён");
    setTimeout(() => setMsg(""), 2500);
  };

  const saveUser = async () => {
    if (!editingUser?.name?.trim() || !editingUser?.login?.trim()) return;
    const conflict = users.find(u => u.id !== editingUser.id && u.login.toLowerCase() === editingUser.login.trim().toLowerCase());
    if (conflict) { setMsg("Логин уже занят"); setTimeout(()=>setMsg(""),2000); return; }
    const updated = users.map(u => u.id === editingUser.id ? {...u, name: editingUser.name.trim(), login: editingUser.login.trim(), role: (editingUser.id===currentUser.id ? u.role : (editingUser.role||u.role||"user"))} : u);
    setUsers(updated);
    await saveUsers(updated);
    setEditingUser(null);
    setMsg("✓ Сохранено");
    setTimeout(() => setMsg(""), 2500);
  };

  const savePrices = async () => {
    setPriceSaving(true);
    // Берём то что уже было сохранено раньше
    const overrides = {...savedOverrides};
    // Применяем ТОЛЬКО то что пользователь реально трогал в этой сессии (из кэша)
    for (const [code, src] of Object.entries(priceCardCache)) {
      const allW = getEffectiveCatalog();
      const w = allW.find(x => x.code === code);
      if (!w) continue;
      const validTiers = (src.tiers||[])
        .filter(t => t.price!==""&&t.price!==undefined&&!isNaN(Number(t.price))&&t.min!==""&&t.max!=="")
        .map(t=>({min:Number(t.min),max:Number(t.max),price:Number(t.price)}));
      if (validTiers.length > 0) {
        overrides[code] = {tiers: validTiers};
      } else if (src.fixedPrice!==""&&src.fixedPrice!==undefined&&!isNaN(Number(src.fixedPrice))) {
        overrides[code] = {fixedPrice: Number(src.fixedPrice), tiers:[]};
      } else {
        delete overrides[code];
      }
    }
    await storage.set(PRICES_KEY, JSON.stringify(overrides));
    setPriceOverrides(overrides);
    setSavedOverrides(overrides);
    Object.keys(priceCardCache).forEach(k => delete priceCardCache[k]);
    setPriceSaving(false);
    setPriceMsg("✓ Прайс сохранён!");
    setTimeout(()=>setPriceMsg(""),3000);
  };

  const saveCatalog = async (cat) => {
    await storage.set(CATALOG_KEY, JSON.stringify(cat));
    setCatalogOverrides(cat);
    setLocalCatalog(cat);
    // Переинициализируем localPrices для новых позиций
    const allWorks = getEffectiveCatalog();
    setLocalPrices(prev => {
      const lp = {...(prev||{})};
      for (const w of allWorks) {
        if (!lp[w.code]) lp[w.code] = { tiers:(w.tiers||[]).map(t=>({...t})), fixedPrice: w.fixedPrice!=null?String(w.fixedPrice):"" };
      }
      return lp;
    });
  };

  const renameWork = async (code, newName) => {
    const cur = _catalogOverrides;
    const next = { renames:{}, catRenames:{}, subRenames:{}, hiddenCodes:[], hiddenSubs:[], hiddenCats:[], custom:[], ...cur,
      renames: { ...(cur.renames||{}), [code]: newName } };
    await saveCatalog(next);
  };

  const addCustomWork = async () => {
    const finalCat = newWork.cat === "__new__" ? (newWork.catNew||"").trim() : newWork.cat.trim();
    const finalSub = newWork.sub === "__new__" ? (newWork.subNew||"").trim() : newWork.sub.trim();
    if (!newWork.name.trim() || !finalCat || !finalSub) return;
    const code = "CUSTOM-" + Date.now();
    const cost = Number(newWork.cost) || 0;
    const marginPct = Math.min(99, Math.max(0, Number(newWork.margin) || 40));
    const fixedPrice = cost > 0 ? Math.round(cost / (1 - marginPct / 100)) : null;
    const work = { code, cat:finalCat, sub:finalSub, name:newWork.name.trim(), unit:newWork.unit||"м²", tiers:[], cost, margin: marginPct/100, fixedPrice };
    const cat = { ...(localCatalog||{}), custom: [...((localCatalog||{}).custom||[]), work] };
    await saveCatalog(cat);
    setNewWork({cat:"", catNew:"", sub:"", subNew:"", name:"", unit:"м²", cost:"", margin:40});
    setShowAddWork(false);
    Object.keys(priceCardCache).forEach(k => delete priceCardCache[k]);
  };

  const deleteCustomWork = async (code) => {
    const cat = { ...(localCatalog||{}), custom: ((localCatalog||{}).custom||[]).filter(w=>w.code!==code) };
    await saveCatalog(cat);
    Object.keys(priceCardCache).forEach(k => delete priceCardCache[k]);
  };

  const renameCat = async (origKey, newCat) => {
    if (!newCat.trim()) return;
    // Читаем напрямую из _catalogOverrides (не из localCatalog — может быть stale)
    const cur = _catalogOverrides;
    const cr = { ...(cur.catRenames||{}), [origKey]: newCat.trim() };
    const currentName = (cur.catRenames||{})[origKey] || origKey;
    const custom = (cur.custom||[]).map(w => w.cat===currentName ? {...w,cat:newCat.trim()} : w);
    const next = { renames:{}, catRenames:{}, subRenames:{}, hiddenCodes:[], hiddenSubs:[], hiddenCats:[], custom:[], ...cur, catRenames:cr, custom };
    await saveCatalog(next);
    setEditingCat(null);
    Object.keys(priceCardCache).forEach(k => delete priceCardCache[k]);
  };

  const renameSub = async (origCatKey, origSubKey, newSub) => {
    if (!newSub.trim()) return;
    const cur = _catalogOverrides;
    const key = origCatKey+"|"+origSubKey;
    const sr = { ...(cur.subRenames||{}), [key]: newSub.trim() };
    const curCat = (cur.catRenames||{})[origCatKey] || origCatKey;
    const curSub = (cur.subRenames||{})[key] || origSubKey;
    const custom = (cur.custom||[]).map(w =>
      w.cat===curCat && w.sub===curSub ? {...w,sub:newSub.trim()} : w
    );
    const next = { renames:{}, catRenames:{}, subRenames:{}, hiddenCodes:[], hiddenSubs:[], hiddenCats:[], custom:[], ...cur, subRenames:sr, custom };
    await saveCatalog(next);
    setEditingSub(null);
    Object.keys(priceCardCache).forEach(k => delete priceCardCache[k]);
  };

  const deleteCat = async (origCatKey) => {
    // origCatKey = original name. hiddenCats stores originals.
    const hc = [...new Set([...((localCatalog||{}).hiddenCats||[]), origCatKey])];
    const curName = (localCatalog?.catRenames||{})[origCatKey] || origCatKey;
    const custom = ((localCatalog||{}).custom||[]).filter(w => w.cat!==curName);
    await saveCatalog({ ...(localCatalog||{}), hiddenCats:hc, custom });
    Object.keys(priceCardCache).forEach(k => delete priceCardCache[k]);
  };

  const deleteSub = async (origCatKey, origSubKey) => {
    const key = origCatKey+"|"+origSubKey;
    const hs = [...new Set([...((localCatalog||{}).hiddenSubs||[]), key])];
    const curCat = (localCatalog?.catRenames||{})[origCatKey] || origCatKey;
    const curSub = (localCatalog?.subRenames||{})[key] || origSubKey;
    const custom = ((localCatalog||{}).custom||[]).filter(w => !(w.cat===curCat && w.sub===curSub));
    await saveCatalog({ ...(localCatalog||{}), hiddenSubs:hs, custom });
    Object.keys(priceCardCache).forEach(k => delete priceCardCache[k]);
  };

  const roleLabel = r => r==="admin"?"👑 Админ":r==="viewer"?"👁 Наблюдатель":r==="manager"?"🧑‍💼 Руководитель":r==="foreman"?"🔨 Прораб":"👤 Замерщик";

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(17,24,39,.4)",backdropFilter:"blur(2px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:400,padding:16,fontFamily:"'Inter','Segoe UI',sans-serif"}}>
      <div style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:12,boxShadow:"0 20px 60px rgba(0,0,0,.12)",padding:"24px 28px",maxWidth:520,width:"100%",height:"88vh",display:"flex",flexDirection:"column",position:"relative"}}>

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontWeight:800,fontSize:16,color:"#0f172a"}}>⚙️ Администрирование</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:20}}>×</button>
        </div>

        {/* Вкладки */}
        <div style={{display:"flex",gap:4,marginBottom:16,background:"#e2e8f0",borderRadius:8,padding:4}}>
          {[["users","👥 Сотрудники"],["prices","💰 Прайс-лист"]].map(([t,label])=>(
            <button key={t} onClick={()=>setTab(t)} style={{
              flex:1,padding:"8px",borderRadius:8,border:"none",cursor:"pointer",
              fontFamily:"inherit",fontSize:12,fontWeight:700,
              background: tab===t ? "#f3f4f6" : "transparent",
              color: tab===t ? "#0f172a" : "#64748b",transition:"all .1s"
            }}>{label}</button>
          ))}
        </div>

        {loading ? <div style={{textAlign:"center",padding:"30px 0",color:"#94a3b8"}}>Загрузка...</div> : tab === "users" ? (
          <div style={{flex:1,overflowY:"auto"}}>
          <>
            {/* Список */}
            <div style={{marginBottom:20}}>
              {users.map(u => (
                <div key={u.id} style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:9,padding:"12px 14px",marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,fontSize:13,color:"#0f172a"}}>{u.name}</div>
                      <div style={{fontSize:12,color:"#94a3b8",marginTop:1}}>
                        @{u.login} · {roleLabel(u.role)}
                        {u.id === currentUser.id && <span style={{color:"#94a3b8",marginLeft:6}}>(вы)</span>}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:6,alignItems:"center"}}>
                      <button
                        onClick={()=>{setEditingUser(editingUser?.id===u.id?null:{id:u.id,name:u.name,login:u.login,role:u.role||"user"});setEditingPass(null);}}
                        style={{background:"#e2e8f0",color:"#94a3b8",border:"1px solid #e2e8f0",borderRadius:8,padding:"4px 10px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>
                        ✏ Изменить
                      </button>
                      <button
                        onClick={()=>{setEditingPass(editingPass?.id===u.id?null:{id:u.id,val:""});setEditingUser(null);}}
                        style={{background:"#e2e8f0",color:"#94a3b8",border:"1px solid #e2e8f0",borderRadius:8,padding:"4px 10px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>
                        🔑
                      </button>
                      {u.id !== currentUser.id && (
                        <button onClick={()=>removeUser(u.id)}
                          style={{background:"rgba(220,38,38,.1)",color:"#dc2626",border:"1px solid rgba(220,38,38,.1)",borderRadius:8,padding:"4px 8px",fontSize:11,cursor:"pointer"}}>✕</button>
                      )}
                    </div>
                  </div>
                  {editingUser?.id === u.id && (
                    <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:8}}>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                        <div>
                          <div style={{fontSize:10,color:"#94a3b8",marginBottom:3}}>Имя</div>
                          <input style={{width:"100%",background:"#f8fafc",border:"1px solid #e2e8f0",color:"#0f172a",borderRadius:8,padding:"7px 10px",fontFamily:"inherit",fontSize:12,outline:"none"}}
                            value={editingUser.name} onChange={e=>setEditingUser(p=>({...p,name:e.target.value}))}/>
                        </div>
                        <div>
                          <div style={{fontSize:10,color:"#94a3b8",marginBottom:3}}>Логин</div>
                          <input style={{width:"100%",background:"#f8fafc",border:"1px solid #e2e8f0",color:"#0f172a",borderRadius:8,padding:"7px 10px",fontFamily:"inherit",fontSize:12,outline:"none"}}
                            value={editingUser.login} onChange={e=>setEditingUser(p=>({...p,login:e.target.value}))}/>
                        </div>
                      </div>
                      <div>
                        <div style={{fontSize:10,color:"#94a3b8",marginBottom:3}}>Роль</div>
                        <select style={{width:"100%",background:"#f8fafc",border:"1px solid #e2e8f0",color:"#0f172a",borderRadius:8,padding:"7px 10px",fontFamily:"inherit",fontSize:12,outline:"none",cursor:"pointer"}}
                          value={editingUser.role||"user"} onChange={e=>setEditingUser(p=>({...p,role:e.target.value}))} disabled={u.id===currentUser.id}>
                          <option value="user">👤 Замерщик</option>
                          <option value="foreman">🔨 Прораб</option>
                          <option value="manager">🧑‍💼 Руководитель</option>
                          <option value="admin">👑 Администратор</option>
                          <option value="viewer">👁 Наблюдатель</option>
                        </select>
                        {u.id===currentUser.id && <div style={{fontSize:10,color:"#94a3b8",marginTop:3}}>Нельзя менять свою роль</div>}
                      </div>
                      <button onClick={saveUser}
                        style={{background:"#2563eb",color:"#f3f4f6",border:"none",borderRadius:8,padding:"8px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                        Сохранить изменения
                      </button>
                    </div>
                  )}
                  {editingPass?.id === u.id && (
                    <div style={{marginTop:10,display:"flex",gap:8}}>
                      <input
                        style={{flex:1,background:"#f8fafc",border:"1px solid #e2e8f0",color:"#0f172a",borderRadius:8,padding:"7px 10px",fontFamily:"inherit",fontSize:12,outline:"none"}}
                        placeholder="Новый пароль"
                        value={editingPass.val}
                        onChange={e=>setEditingPass(p=>({...p,val:e.target.value}))}
                      />
                      <button onClick={()=>savePass(u.id)}
                        style={{background:"#2563eb",color:"#f3f4f6",border:"none",borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                        Сохранить
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Добавить */}
            <div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:9,padding:"14px 16px"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94a3b8",letterSpacing:.8,textTransform:"uppercase",marginBottom:10}}>+ Новый пользователь</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                <input style={{background:"#ffffff",border:"1px solid #e2e8f0",color:"#0f172a",borderRadius:7,padding:"8px 11px",fontFamily:"inherit",fontSize:12,outline:"none"}} placeholder="Имя" value={newName} onChange={e=>setNewName(e.target.value)}/>
                <input style={{background:"#ffffff",border:"1px solid #e2e8f0",color:"#0f172a",borderRadius:7,padding:"8px 11px",fontFamily:"inherit",fontSize:12,outline:"none"}} placeholder="Логин" value={newLogin} onChange={e=>setNewLogin(e.target.value)}/>
                <input style={{background:"#ffffff",border:"1px solid #e2e8f0",color:"#0f172a",borderRadius:7,padding:"8px 11px",fontFamily:"inherit",fontSize:12,outline:"none"}} placeholder="Пароль" value={newPass} onChange={e=>setNewPass(e.target.value)}/>
                <select style={{background:"#ffffff",border:"1px solid #e2e8f0",color:"#94a3b8",borderRadius:7,padding:"8px 11px",fontFamily:"inherit",fontSize:12,outline:"none",cursor:"pointer"}} value={newRole} onChange={e=>setNewRole(e.target.value)}>
                  <option value="user">👤 Замерщик</option>
                  <option value="manager">🧑‍💼 Руководитель</option>
                  <option value="admin">👑 Администратор</option>
                  <option value="viewer">👁 Наблюдатель</option>
                </select>
              </div>
              <button onClick={addUser} className="btn btn-g" style={{width:"100%",marginTop:4}}>
                + Добавить
              </button>
            </div>

            {msg && <div style={{marginTop:12,textAlign:"center",fontSize:12,color: msg.startsWith("✓") ? "#059669" : "#dc2626"}}>{msg}</div>}
            {saving && <div style={{textAlign:"center",fontSize:11,color:"#94a3b8",marginTop:8}}>💾 Сохранение...</div>}
          </>
          </div>
        ) : (
          /* ═══ ВКЛАДКА ПРАЙС-ЛИСТ ═══ */
          <div style={{display:"flex",flexDirection:"column",height:"calc(88vh - 160px)"}}>
            {!localPrices ? <div style={{textAlign:"center",padding:30,color:"#94a3b8"}}>Загрузка...</div> : null}
            {localPrices && <>
              {/* Поиск — фиксированный */}
              <input
                style={{width:"100%",boxSizing:"border-box",background:"#ffffff",border:"1px solid #e2e8f0",color:"#0f172a",borderRadius:7,padding:"8px 12px",fontFamily:"inherit",fontSize:12,outline:"none",marginBottom:8}}
                placeholder="🔍 Поиск по названию..."
                value={priceSearch}
                onChange={e=>setPriceSearch(e.target.value)}
              />
              {/* Список — скроллится */}
              <div className="price-scroll" style={{flex:1,overflowY:"scroll",paddingRight:4,scrollbarWidth:"auto",scrollbarColor:"#d1d5db #f3f4f6"}}>
                <style>{`
                  .price-scroll::-webkit-scrollbar{width:10px}
                  .price-scroll::-webkit-scrollbar-track{background:#e5e7eb;border-radius:5px}
                  .price-scroll::-webkit-scrollbar-thumb{background:#d1d5db;border-radius:5px;min-height:40px}
                  .price-scroll::-webkit-scrollbar-thumb:hover{background:#9ca3af}
                `}</style>
                {(() => {
                  const allWorks = getEffectiveCatalog();
                  const q = priceSearch.toLowerCase();
                  const filtered = allWorks.filter(w =>
                    !q || w.name.toLowerCase().includes(q) || w.sub.toLowerCase().includes(q) || w.cat.toLowerCase().includes(q)
                  );
                  const groups = {};
                  for (const w of filtered) {
                    const key = w.cat + " / " + w.sub;
                    if (!groups[key]) groups[key] = [];
                    groups[key].push(w);
                  }
                  // Группируем по категории отдельно для заголовков кат.
                  // Группируем с сохранением оригинальных ключей
                  const catGroups = {}; // displayCat -> { _origCat, subs: { displaySub -> { _origSub, works[] } } }
                  for (const w of filtered) {
                    if (!catGroups[w.cat]) catGroups[w.cat] = { _origCat: w._origCat||w.cat, subs:{} };
                    if (!catGroups[w.cat].subs[w.sub]) catGroups[w.cat].subs[w.sub] = { _origSub: w._origSub||w.sub, works:[] };
                    catGroups[w.cat].subs[w.sub].works.push(w);
                  }
                  const btnS = {background:"transparent",border:"none",cursor:"pointer",padding:"2px 5px",fontSize:11,lineHeight:1};
                  return Object.entries(catGroups).map(([cat, catData]) => {
                    const origCat = catData._origCat;
                    return (
                    <div key={cat} style={{marginBottom:16}}>
                      {/* Заголовок категории */}
                      {editingCat?.key===origCat ? (
                        <div style={{display:"flex",gap:4,alignItems:"center",marginBottom:6}}>
                          <input autoFocus value={editingCat.val}
                            onChange={e=>setEditingCat(p=>({...p,val:e.target.value}))}
                            onKeyDown={e=>{if(e.key==="Enter")renameCat(origCat,editingCat.val);if(e.key==="Escape")setEditingCat(null);}}
                            style={{flex:1,background:"#f8fafc",border:"1px solid #e2e8f0",color:"#0f172a",borderRadius:5,padding:"3px 8px",fontFamily:"inherit",fontSize:11,fontWeight:700,outline:"none"}}/>
                          <button onClick={()=>renameCat(origCat,editingCat.val)} style={{...btnS,color:"#059669"}}>✓</button>
                          <button onClick={()=>setEditingCat(null)} style={{...btnS,color:"#94a3b8"}}>✕</button>
                        </div>
                      ) : (
                        <div style={{display:"flex",alignItems:"center",gap:4,padding:"4px 0",borderBottom:"1px solid #e2e8f0",marginBottom:6}}>
                          <span style={{fontSize:10,fontWeight:700,color:"#94a3b8",letterSpacing:.8,textTransform:"uppercase",flex:1}}>{cat}</span>
                          <button onClick={()=>setEditingCat({key:origCat,val:cat})} title="Переименовать категорию" style={{...btnS,color:"#94a3b8"}}>✏️</button>
                          <button onClick={()=>{ if(window.confirm(`Удалить всю категорию "${cat}"?`)) deleteCat(origCat); }} title="Удалить категорию" style={{...btnS,color:"#dc2626"}}>🗑</button>
                        </div>
                      )}
                      {/* Подкатегории */}
                      {Object.entries(catData.subs).map(([sub, subData]) => {
                        const origSub = subData._origSub;
                        return (
                        <div key={sub} style={{marginBottom:10}}>
                          {editingSub?.cat===origCat&&editingSub?.key===origSub ? (
                            <div style={{display:"flex",gap:4,alignItems:"center",marginBottom:4,paddingLeft:8}}>
                              <input autoFocus value={editingSub.val}
                                onChange={e=>setEditingSub(p=>({...p,val:e.target.value}))}
                                onKeyDown={e=>{if(e.key==="Enter")renameSub(origCat,origSub,editingSub.val);if(e.key==="Escape")setEditingSub(null);}}
                                style={{flex:1,background:"#f8fafc",border:"1px solid #e2e8f0",color:"#94a3b8",borderRadius:5,padding:"2px 7px",fontFamily:"inherit",fontSize:10,outline:"none"}}/>
                              <button onClick={()=>renameSub(origCat,origSub,editingSub.val)} style={{...btnS,color:"#059669"}}>✓</button>
                              <button onClick={()=>setEditingSub(null)} style={{...btnS,color:"#94a3b8"}}>✕</button>
                            </div>
                          ) : (
                            <div style={{display:"flex",alignItems:"center",gap:3,paddingLeft:8,marginBottom:4}}>
                              <span style={{fontSize:9,fontWeight:700,color:"#94a3b8",letterSpacing:.8,textTransform:"uppercase",flex:1}}>{sub}</span>
                              <button onClick={()=>setEditingSub({cat:origCat,key:origSub,val:sub})} title="Переименовать подкатегорию" style={{...btnS,color:"#334155",fontSize:10}}>✏️</button>
                              <button onClick={()=>{ if(window.confirm(`Удалить подкатегорию "${sub}"?`)) deleteSub(origCat,origSub); }} title="Удалить подкатегорию" style={{...btnS,color:"#dc2626",fontSize:10}}>🗑</button>
                            </div>
                          )}
                          {subData.works.map(w => (
                            <PriceWorkCard key={w.code} w={w}
                              initTiers={localPrices?.[w.code]?.tiers || []}
                              initFixed={localPrices?.[w.code]?.fixedPrice || ""}
                              onRename={newName => renameWork(w.code, newName)}
                              onDelete={()=>{
                                if(w.code.startsWith("CUSTOM-")) deleteCustomWork(w.code);
                                else {
                                  const hc = [...new Set([...((localCatalog||{}).hiddenCodes||[]), w.code])];
                                  saveCatalog({...(localCatalog||{}), hiddenCodes:hc});
                                }
                              }}
                            />
                          ))}
                        </div>
                        );
                      })}
                    </div>
                    );
                  });
                })()}
                {/* Форма добавления новой позиции */}
                <div style={{marginTop:8,border:"1px dashed #eff6ff",borderRadius:8,padding:"10px 12px",marginBottom:8}}>
                  {!showAddWork ? (
                    <button onClick={()=>setShowAddWork(true)} className="btn btn-g" style={{width:"100%"}}>
                      ＋ Добавить позицию в каталог
                    </button>
                  ) : (() => {
                    const allW = getEffectiveCatalog();
                    const cats = [...new Set(allW.map(w=>w.cat))];
                    const subs = newWork.cat ? [...new Set(allW.filter(w=>w.cat===newWork.cat).map(w=>w.sub))] : [];
                    const inpStyle = {background:"#f8fafc",border:"1px solid #e2e8f0",color:"#0f172a",borderRadius:8,padding:"6px 9px",fontFamily:"inherit",fontSize:11,outline:"none",width:"100%",boxSizing:"border-box"};
                    const selStyle = {...inpStyle, cursor:"pointer"};
                    return (
                      <div>
                        <div style={{fontSize:11,fontWeight:600,color:"#334155",marginBottom:10}}>Новая позиция</div>

                        {/* Категория */}
                        <div style={{marginBottom:6}}>
                          <div style={{fontSize:10,color:"#94a3b8",marginBottom:3}}>Категория</div>
                          <select value={newWork.cat} onChange={e=>setNewWork(p=>({...p,cat:e.target.value,sub:""}))} style={selStyle}>
                            <option value="">— выбрать существующую —</option>
                            {cats.map(c=><option key={c} value={c}>{c}</option>)}
                            <option value="__new__">＋ Новая категория...</option>
                          </select>
                          {newWork.cat==="__new__" && (
                            <input autoFocus placeholder="Введите название категории" value={newWork.catNew||""}
                              onChange={e=>setNewWork(p=>({...p,catNew:e.target.value}))}
                              style={{...inpStyle,marginTop:4}}/>
                          )}
                        </div>

                        {/* Подкатегория */}
                        <div style={{marginBottom:6}}>
                          <div style={{fontSize:10,color:"#94a3b8",marginBottom:3}}>Подкатегория</div>
                          <select value={newWork.sub} onChange={e=>setNewWork(p=>({...p,sub:e.target.value}))} style={selStyle}
                            disabled={!newWork.cat||newWork.cat==="__new__"&&!newWork.catNew}>
                            <option value="">— выбрать существующую —</option>
                            {subs.map(s=><option key={s} value={s}>{s}</option>)}
                            <option value="__new__">＋ Новая подкатегория...</option>
                          </select>
                          {newWork.sub==="__new__" && (
                            <input autoFocus placeholder="Введите название подкатегории" value={newWork.subNew||""}
                              onChange={e=>setNewWork(p=>({...p,subNew:e.target.value}))}
                              style={{...inpStyle,marginTop:4}}/>
                          )}
                        </div>

                        {/* Название и единица */}
                        <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:6,marginBottom:10}}>
                          <div>
                            <div style={{fontSize:10,color:"#94a3b8",marginBottom:3}}>Название работы</div>
                            <input placeholder="напр. Укладка паркета" value={newWork.name}
                              onChange={e=>setNewWork(p=>({...p,name:e.target.value}))}
                              style={inpStyle}/>
                          </div>
                          <div>
                            <div style={{fontSize:10,color:"#94a3b8",marginBottom:3}}>Единица</div>
                            <select value={newWork.unit} onChange={e=>setNewWork(p=>({...p,unit:e.target.value}))} style={{...selStyle,width:80}}>
                              {["м²","м.п.","шт","усл.","кг","л"].map(u=><option key={u} value={u}>{u}</option>)}
                            </select>
                          </div>
                        </div>

                        <div style={{display:"flex",gap:6}}>
                          <button onClick={addCustomWork}
                            style={{flex:1,background:"#e2e8f0",color:"#94a3b8",border:"1px solid #e2e8f0",borderRadius:8,padding:"7px",fontFamily:"inherit",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                            ✓ Добавить
                          </button>
                          <button onClick={()=>{setShowAddWork(false);setNewWork({cat:"",sub:"",name:"",unit:"м²"});}}
                            style={{background:"rgba(220,38,38,.1)",color:"#dc2626",border:"1px solid rgba(220,38,38,.1)",borderRadius:8,padding:"7px 12px",fontFamily:"inherit",fontSize:12,cursor:"pointer"}}>
                            Отмена
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
              {/* Индикатор автосохранения */}
              <div style={{paddingTop:10,borderTop:"1px solid #e2e8f0",marginTop:6}}>
                {priceMsg && <div style={{textAlign:"center",fontSize:12,color:"#059669",fontWeight:700,marginBottom:6}}>{priceMsg}</div>}
                {priceSaving && <div style={{textAlign:"center",fontSize:11,color:"#94a3b8"}}>💾 Сохранение...</div>}
              </div>
            </>}
          </div>
        )}
      </div>

    </div>
  );
}

// ─── КОМПОНЕНТ КП (используется в модале и при печати) ───────────────────────
function KPContent({ proj, kpItems, fromItems, discount, discAmt, final, note }) {
  const CONDITIONS = [
    "Стоимость рассчитана исходя из указанных объемов работ без учета НДС.",
    "В стоимость работ могут входить расходы на материалы, оборудование, доставку и иные затраты, необходимые для выполнения работ, если иное прямо указано в договоре.",
    "Оплата производится по факту выполнения работ.",
    "Сроки выполнения указывается дополнительно в основном договоре.",
    "Работы выполняются по договору.",
    "Гарантия на работы составляет 12 месяцев.",
    "Срок действия настоящего предложения — 7 рабочих дней с даты составления.",
  ];
  return (
    <div style={{fontFamily:"'Golos Text','Segoe UI',sans-serif",color:"#1a1a28",background:"#f5f2ec"}}>
      {/* Шапка */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18}}>
        <div>
          <div style={{fontWeight:900,fontSize:22,letterSpacing:-.3}}>Ценовое предложение</div>
          <div style={{fontSize:12,color:"#888",marginTop:3}}>на услуги ремонта и отделки недвижимости</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontWeight:900,fontSize:16,color:"#b8904a"}}>TitovStroy</div>
          <div style={{fontSize:11,color:"#555",marginTop:2}}>БИН 231040002769</div>
          <div style={{fontSize:11,color:"#555"}}>WA: <span style={{color:"#b8904a"}}>+7 707 982 4915</span></div>
        </div>
      </div>

      {/* Блок клиента */}
      <div style={{background:"#e8e4da",borderRadius:10,padding:"13px 16px",marginBottom:16,display:"grid",gridTemplateColumns:"1fr 1fr",gap:"5px 20px",fontSize:13}}>
        {[["Заказчик",proj.name||"—"],["Телефон",proj.phone||"—"],["Объект",proj.type||"—"],["Адрес",proj.address||"—"],["Дата расчёта",today()],["Действует до",validUntil()],["Менеджер",proj.manager||"—"]].map(([k,v])=>(
          <div key={k}><span style={{color:"#888"}}>{k}: </span><strong>{v}</strong></div>
        ))}
      </div>

      {/* Таблица с группировкой по категориям */}
      {(() => {
        const catOrder = [];
        const catMap = {};
        for (const item of kpItems) {
          if (!catMap[item.cat]) { catMap[item.cat] = []; catOrder.push(item.cat); }
          catMap[item.cat].push(item);
        }
        let rowNum = 0;
        return (
          <div style={{marginBottom:14}}>
            {catOrder.map(cat => {
              const items = catMap[cat];
              const catTotal = items.reduce((s,x)=>s+x.total,0);
              return (
                <div key={cat} style={{marginBottom:12}}>
                  {/* Заголовок категории */}
                  <div style={{background:"#1a1a28",color:"#f5f2ec",padding:"8px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",borderRadius:"6px 6px 0 0"}}>
                    <span style={{fontWeight:700,fontSize:13,letterSpacing:.5,textTransform:"uppercase"}}>{cat}</span>
                    <span style={{fontWeight:700,fontSize:13,color:"#b8904a"}}>{fmt(catTotal)} ₸</span>
                  </div>
                  {/* Строки работ */}
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                    <thead>
                      <tr style={{background:"#2a2a3a",color:"#aaa"}}>
                        {["№","Раздел","Наименование","Ед.","Объём","Цена","Сумма"].map(h=>(
                          <th key={h} style={{padding:"6px 8px",textAlign:["№","Ед.","Объём"].includes(h)?"center":"left",fontSize:10,fontWeight:600,letterSpacing:.3}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item,i) => {
                        rowNum++;
                        return (
                          <tr key={i} style={{background:i%2===0?"#f5f2ec":"#ede9e0",borderBottom:"1px solid #ddd9d0"}}>
                            <td style={{padding:"6px 8px",textAlign:"center",color:"#999",fontSize:11}}>{rowNum}</td>
                            <td style={{padding:"6px 8px",color:"#8855aa",fontSize:11,fontWeight:500}}>{item.sub}</td>
                            <td style={{padding:"6px 8px",fontWeight:600,fontSize:12}}>{item.name}</td>
                            <td style={{padding:"6px 8px",textAlign:"center",color:"#888",fontSize:11}}>{item.unit}</td>
                            <td style={{padding:"6px 8px",textAlign:"center",fontWeight:500}}>{item.qty}</td>
                            <td style={{padding:"6px 8px",textAlign:"right",color:"#555"}}>{item.qty > 0 ? (item.total / item.qty).toLocaleString("ru-RU",{minimumFractionDigits:2,maximumFractionDigits:2}) : fmt(item.price)} ₸</td>
                            <td style={{padding:"6px 8px",textAlign:"right",fontWeight:700,fontSize:12}}>{fmt(item.total)} ₸</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{background:"#e8e4da",borderTop:"2px solid #ccc"}}>
                        <td colSpan={6} style={{padding:"7px 8px",fontSize:12,fontWeight:700,color:"#444",textAlign:"right"}}>Итого по разделу «{cat}»:</td>
                        <td style={{padding:"7px 8px",textAlign:"right",fontWeight:800,fontSize:13,color:"#b8904a"}}>{fmt(catTotal)} ₸</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              );
            })}

            {/* Итоговая сводка */}
            <div style={{background:"#e8e4da",borderRadius:8,padding:"12px 16px",marginTop:8,marginBottom:4}}>
              <div style={{fontWeight:700,fontSize:12,color:"#444",marginBottom:8,textTransform:"uppercase",letterSpacing:.5}}>Сводка по разделам</div>
              {catOrder.map(cat => (
                <div key={cat} style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:5,paddingBottom:5,borderBottom:"1px solid #d0ccc0"}}>
                  <span style={{color:"#555"}}>{cat}</span>
                  <span style={{fontWeight:700}}>{fmt(catMap[cat].reduce((s,x)=>s+x.total,0))} ₸</span>
                </div>
              ))}
            </div>

            {/* Позиции "от" — не входят в итог */}
            {fromItems&&fromItems.length>0&&(
              <div style={{marginTop:12,marginBottom:4}}>
                <div style={{background:"#f0ece0",borderRadius:"6px 6px 0 0",padding:"8px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontWeight:700,fontSize:12,color:"#888",letterSpacing:.5,textTransform:"uppercase"}}>Уточняется по факту</span>
                  <span style={{fontSize:11,color:"#aaa"}}>не включено в итог</span>
                </div>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <tbody>
                    {fromItems.map((item,i)=>(
                      <tr key={i} style={{background:i%2===0?"#f5f2ec":"#ede9e0",borderBottom:"1px solid #ddd9d0"}}>
                        <td style={{padding:"6px 8px",color:"#8855aa",fontSize:11,fontWeight:500,width:"18%"}}>{item.sub}</td>
                        <td style={{padding:"6px 8px",fontWeight:600,fontSize:12}}>{item.name}</td>
                        <td style={{padding:"6px 8px",textAlign:"center",color:"#888",fontSize:11,width:"6%"}}>{item.unit}</td>
                        <td style={{padding:"6px 8px",textAlign:"center",fontWeight:500,width:"8%"}}>{item.qty}</td>
                        <td style={{padding:"6px 8px",textAlign:"right",color:"#b8904a",fontWeight:700,whiteSpace:"nowrap",width:"20%"}}>от {fmt(item.priceFrom)} ₸</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Итог */}
            <div style={{background:"#1a1a28",borderRadius:10,padding:"13px 18px",color:"#f5f2ec",marginTop:8}}>
              {discount>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#e07070",marginBottom:6}}><span>Скидка {discount}%</span><span>− {fmt(discAmt)} ₸</span></div>}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:14,fontWeight:600,letterSpacing:.5}}>ИТОГО:</span>
                <span style={{fontSize:28,fontWeight:900,color:"#b8904a",letterSpacing:-.5}}>{fmt(final)} ₸</span>
              </div>
              {proj.area&&Number(proj.area)>0&&(
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:8,paddingTop:8,borderTop:"1px solid rgba(255,255,255,.08)"}}>
                  <span style={{fontSize:12,color:"#888"}}>Цена за м² ({proj.area} м²)</span>
                  <span style={{fontSize:14,fontWeight:700,color:"#d4a85a"}}>≈ {fmt(final/Number(proj.area))} ₸/м²</span>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Примечание */}
      {note&&<div style={{background:"#e8e4da",borderRadius:8,padding:"10px 14px",fontSize:12,color:"#555",marginBottom:14}}>{note}</div>}

      {/* Условия */}
      <div style={{background:"#ece8da",borderRadius:10,padding:"14px 18px",fontSize:12,color:"#444",lineHeight:1.75,marginBottom:20}}>
        <div style={{fontWeight:700,color:"#1a1a28",marginBottom:10,fontSize:13}}>Условия:</div>
        {CONDITIONS.map((text, i) => (
          <div key={i} style={{display:"flex",gap:10,marginBottom:5}}>
            <span style={{color:"#b8904a",fontWeight:700,minWidth:18,flexShrink:0}}>{i+1}.</span>
            <span>{text}</span>
          </div>
        ))}
        <div style={{display:"flex",gap:10,marginTop:5}}>
          <span style={{color:"#b8904a",fontWeight:700,minWidth:18,flexShrink:0}}>7.</span>
          <span>Ссылка для ознакомления с договором (шаблон):{" "}
            <a href="https://drive.google.com/file/d/1qmhQhn6LE3F3lnU_BBEDXqCiyj-LDjSC/view?usp=sharing"
              target="_blank" rel="noreferrer"
              style={{color:"#b8904a",textDecoration:"underline",wordBreak:"break-all"}}>
              https://drive.google.com/file/d/1qmhQhn6LE3F3lnU_BBEDXqCiyj-LDjSC/view
            </a>
          </span>
        </div>
      </div>

      {/* Подписи */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24,marginTop:16}}>
        <div>
          <div style={{fontSize:11,color:"#888",marginBottom:4}}>Заказчик</div>
          <div style={{borderTop:"1px solid #bbb",paddingTop:8,marginTop:32}}/>
          <div style={{fontSize:11,color:"#666"}}>{proj.name||"________________________________"}</div>
          <div style={{fontSize:10,color:"#aaa",marginTop:2}}>М.П.</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
          <img src="/stamp.jpg" alt="Печать TitovStroy" style={{width:200,height:200,objectFit:"contain",opacity:.85,mixBlendMode:"multiply",marginBottom:4}}/>
        </div>
      </div>

    </div>
  );
}


// ─── СТРАНИЦА АДМИНИСТРАТОРА (встроена в основной layout) ────────────────────
function AdminPageContent({ currentUser, presence = {}, onUsersChanged, clients=[], saveClients=()=>{}, clientsRef={current:[]}, contragents=[], saveContragents=()=>{}, contragentsRef={current:[]}, onBackupWorkspace=()=>{} }) {
  const [tab, setTab] = useState("users");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newLogin, setNewLogin] = useState("");
  const [newName, setNewName] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newRole, setNewRole] = useState("user");
  const [editingPass, setEditingPass] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [msg, setMsg] = useState("");
  const [localPrices, setLocalPrices] = useState(null);
  const [savedOverrides, setSavedOverrides] = useState({});
  const [localCatalog, setLocalCatalog] = useState(null);
  const [priceSearch, setPriceSearch] = useState("");
  const [priceMsg, setPriceMsg] = useState("");
  const [priceSaving, setPriceSaving] = useState(false);
  const [showAddWork, setShowAddWork] = useState(false);
  const [newWork, setNewWork] = useState({cat:"", sub:"", name:"", unit:"м²"});
  const [editingCat, setEditingCat] = useState(null);
  const [editingSub, setEditingSub] = useState(null);
  const [catalogBackupsModal, setCatalogBackupsModal] = useState(null);
  const [adminEditItem, setAdminEditItem] = useState(null); // {mode:"newClient"|"editClient"|"newCA"|"editCA", data:{}}
  const [adminSubTab, setAdminSubTab] = useState("list"); // "list"|"clientEditor"|"caEditor"

  const openCatalogBackups = async () => {
    const bRaw = await storage.get(CATALOG_BACKUPS_KEY);
    let bkps = []; try { if (bRaw?.value) bkps = JSON.parse(bRaw.value); } catch {}
    setCatalogBackupsModal(Array.isArray(bkps) ? bkps : []);
  };
  const restoreCatalogBackup = async (snap) => {
    if (!snap?.data) return;
    let cat; try { cat = JSON.parse(snap.data); } catch { window.alert("Бэкап повреждён"); return; }
    if (!window.confirm(`Восстановить каталог на ${new Date(snap.ts).toLocaleString("ru-RU")}?\nТекущий каталог уйдёт в бэкап.`)) return;
    await saveCatalog(cat);
    setCatalogBackupsModal(null);
    window.alert("Каталог восстановлен ✓");
  };

  const _priceAutoSave = useRef(null);
  useEffect(() => {
    if (!localPrices) return;
    if (_priceAutoSave.current) clearTimeout(_priceAutoSave.current);
    _priceAutoSave.current = setTimeout(() => { savePrices(); }, 2000);
    return () => clearTimeout(_priceAutoSave.current);
  }, [localPrices]);

  useEffect(() => {
    (async () => {
      try {
        const [res, cat, pr] = await Promise.all([
          storage.get(USERS_KEY),
          storage.get(CATALOG_KEY),
          storage.get(PRICES_KEY),
        ]);
        try { setUsers(res ? JSON.parse(res.value) : DEFAULT_USERS); } catch { setUsers(DEFAULT_USERS); }
        try {
          if (cat) { const parsed = JSON.parse(cat.value); setCatalogOverrides(parsed); setLocalCatalog(parsed); }
          else setLocalCatalog({ renames:{}, custom:[], hiddenCodes:[] });
        } catch { setLocalCatalog({ renames:{}, custom:[], hiddenCodes:[] }); }
        try {
          const ov = pr ? JSON.parse(pr.value) : {};
          setSavedOverrides(ov);
          const allWorks = getEffectiveCatalog();
          const lp = {};
          for (const w of allWorks) {
            const saved = ov[w.code];
            lp[w.code] = {
              tiers: saved?.tiers !== undefined ? saved.tiers.map(t=>({...t})) : (w.tiers||[]).map(t=>({...t})),
              fixedPrice: saved?.fixedPrice !== undefined ? String(saved.fixedPrice) : w.fixedPrice !== undefined ? String(w.fixedPrice) : "",
              cost: saved?.cost !== undefined ? saved.cost : undefined,
              margin: saved?.margin !== undefined ? saved.margin : undefined,
              priceFrom: saved?.priceFrom !== undefined ? saved.priceFrom : undefined,
            };
          }
          setLocalPrices(lp);
        } catch {}
      } catch {}
      setLoading(false);
    })();
  }, []);

  const saveUsers = async (list) => { setSaving(true); await storage.set(USERS_KEY, JSON.stringify(list)); setSaving(false); };
  const addUser = async () => {
    if (!newLogin.trim() || !newPass.trim() || !newName.trim()) { setMsg("Заполните все поля"); return; }
    if (users.find(u => u.login.toLowerCase() === newLogin.trim().toLowerCase())) { setMsg("Логин уже занят"); return; }
    const u = { id: genId(), login: newLogin.trim(), password: simpleHash(newPass.trim()), name: newName.trim(), role: newRole };
    const updated = [...users, u];
    setUsers(updated); await saveUsers(updated); await onUsersChanged();
    writeAudit(currentUser,"создал пользователя","user",u.id,`${u.name} (${u.role})`);
    setNewLogin(""); setNewName(""); setNewPass(""); setNewRole("user");
    setMsg("✓ Пользователь добавлен"); setTimeout(() => setMsg(""), 2500);
  };
  const removeUser = async (id) => {
    if (id === currentUser.id) { setMsg("Нельзя удалить себя"); setTimeout(()=>setMsg(""),2000); return; }
    const updated = users.filter(u => u.id !== id);
    setUsers(updated); await saveUsers(updated); await onUsersChanged();
  };
  const savePass = async (id) => {
    if (!editingPass?.val?.trim()) return;
    const updated = users.map(u => u.id === id ? {...u, password: simpleHash(editingPass.val.trim())} : u);
    setUsers(updated); await saveUsers(updated);
    setEditingPass(null); setMsg("✓ Пароль изменён"); setTimeout(() => setMsg(""), 2500);
  };
  const saveUser = async () => {
    if (!editingUser?.name?.trim() || !editingUser?.login?.trim()) return;
    const conflict = users.find(u => u.id !== editingUser.id && u.login.toLowerCase() === editingUser.login.trim().toLowerCase());
    if (conflict) { setMsg("Логин уже занят"); setTimeout(()=>setMsg(""),2000); return; }
    const updated = users.map(u => u.id === editingUser.id ? {...u, name: editingUser.name.trim(), login: editingUser.login.trim(), role: (editingUser.id===currentUser.id ? u.role : (editingUser.role||u.role||"user"))} : u);
    setUsers(updated); await saveUsers(updated); await onUsersChanged();
    setEditingUser(null); setMsg("✓ Сохранено"); setTimeout(() => setMsg(""), 2500);
  };
  const savePrices = async () => {
    setPriceSaving(true);
    const overrides = {...savedOverrides};
    for (const [code, src] of Object.entries(priceCardCache)) {
      const allW = getEffectiveCatalog(); const w = allW.find(x => x.code === code); if (!w) continue;
      // New table-based: cost + margin → fixedPrice, optional priceFrom
      if (src.cost !== undefined || src.margin !== undefined || src.priceFrom !== undefined) {
        const cost = src.cost !== null && src.cost !== undefined ? Number(src.cost) : (w.cost ?? null);
        const margin = src.margin !== undefined ? Number(src.margin) : (w.margin ?? 0.4);
        const priceFrom = src.priceFrom !== undefined ? (src.priceFrom ? Number(src.priceFrom) : null) : (w.priceFrom ?? null);
        if (cost !== null && !isNaN(cost) && cost > 0) {
          const safeMargin = Math.min(0.99, Math.max(0, Number(margin) || 0));
          const price = Math.round(cost / (1 - safeMargin));
          overrides[code] = { cost, margin, fixedPrice: price, tiers: [], ...(priceFrom ? {priceFrom} : {}) };
        } else if (priceFrom) {
          overrides[code] = { ...(overrides[code]||{}), priceFrom };
        } else {
          delete overrides[code];
        }
        continue;
      }
      // Legacy tiers support
      const validTiers = (src.tiers||[]).filter(t => t.price!==""&&t.price!==undefined&&!isNaN(Number(t.price))&&t.min!==""&&t.max!=="").map(t=>({min:Number(t.min),max:Number(t.max),price:Number(t.price)}));
      if (validTiers.length > 0) { overrides[code] = {tiers: validTiers}; }
      else if (src.fixedPrice!==""&&src.fixedPrice!==undefined&&!isNaN(Number(src.fixedPrice))) { overrides[code] = {fixedPrice: Number(src.fixedPrice), tiers:[]}; }
      else { delete overrides[code]; }
    }
    await storage.set(PRICES_KEY, JSON.stringify(overrides));
    setPriceOverrides(overrides); setSavedOverrides(overrides);
    // Sync localPrices with saved cost/margin/priceFrom so inputs don't revert to base values
    setLocalPrices(prev => {
      const lp = {...prev};
      for (const [code, entry] of Object.entries(overrides)) {
        lp[code] = { ...(lp[code]||{}), cost: entry.cost, margin: entry.margin, priceFrom: entry.priceFrom };
      }
      return lp;
    });
    Object.keys(priceCardCache).forEach(k => delete priceCardCache[k]);
    setPriceSaving(false); setPriceMsg("✓ Прайс сохранён!"); setTimeout(()=>setPriceMsg(""),3000);
  };
  const saveCatalog = async (cat) => {
    // Авто-бэкап перед каждым сохранением каталога
    try {
      const prev = await storage.get(CATALOG_KEY);
      if (prev && prev.value) {
        const bRaw = await storage.get(CATALOG_BACKUPS_KEY);
        let bkps = []; try { if (bRaw?.value) bkps = JSON.parse(bRaw.value); } catch {}
        if (!Array.isArray(bkps)) bkps = [];
        if (!bkps[0] || bkps[0].data !== prev.value) {
          bkps.unshift({ ts: Date.now(), data: prev.value });
          await storage.set(CATALOG_BACKUPS_KEY, JSON.stringify(bkps.slice(0, 10)));
        }
      }
    } catch(e) { console.warn("catalog backup err", e); }
    await storage.set(CATALOG_KEY, JSON.stringify(cat)); setCatalogOverrides(cat); setLocalCatalog(cat);
    const allWorks = getEffectiveCatalog();
    setLocalPrices(prev => { const lp = {...(prev||{})}; for (const w of allWorks) { if (!lp[w.code]) lp[w.code] = { tiers:(w.tiers||[]).map(t=>({...t})), fixedPrice: w.fixedPrice!=null?String(w.fixedPrice):"" }; } return lp; });
  };
  const renameWork = async (code, newName) => { const cur = _catalogOverrides; await saveCatalog({ renames:{}, catRenames:{}, subRenames:{}, hiddenCodes:[], hiddenSubs:[], hiddenCats:[], custom:[], ...cur, renames: { ...(cur.renames||{}), [code]: newName } }); };
  const addCustomWork = async () => {
    const finalCat = newWork.cat === "__new__" ? (newWork.catNew||"").trim() : newWork.cat.trim();
    const finalSub = newWork.sub === "__new__" ? (newWork.subNew||"").trim() : newWork.sub.trim();
    if (!newWork.name.trim() || !finalCat || !finalSub) return;
    const cost = Number(newWork.cost) || 0;
    const marginPct = Math.min(99, Math.max(0, Number(newWork.margin) || 40));
    const fixedPrice = cost > 0 ? Math.round(cost / (1 - marginPct / 100)) : null;
    const priceFrom = newWork.priceFrom ? (Number(newWork.priceFrom) || null) : null;
    await saveCatalog({ ...(localCatalog||{}), custom: [...((localCatalog||{}).custom||[]), { code:"CUSTOM-"+Date.now(), cat:finalCat, sub:finalSub, name:newWork.name.trim(), unit:newWork.unit||"м²", tiers:[], cost, margin: marginPct/100, fixedPrice, ...(priceFrom ? {priceFrom} : {}) }] });
    setNewWork({cat:"", catNew:"", sub:"", subNew:"", name:"", unit:"м²", cost:"", margin:40, priceFrom:""}); setShowAddWork(false);
    Object.keys(priceCardCache).forEach(k => delete priceCardCache[k]);
  };
  const deleteCustomWork = async (code) => { await saveCatalog({ ...(localCatalog||{}), custom: ((localCatalog||{}).custom||[]).filter(w=>w.code!==code) }); Object.keys(priceCardCache).forEach(k => delete priceCardCache[k]); };
  const renameCat = async (origKey, newCat) => {
    if (!newCat.trim()) return;
    const cur = _catalogOverrides; const cr = { ...(cur.catRenames||{}), [origKey]: newCat.trim() }; const currentName = (cur.catRenames||{})[origKey] || origKey;
    await saveCatalog({ renames:{}, catRenames:{}, subRenames:{}, hiddenCodes:[], hiddenSubs:[], hiddenCats:[], custom:[], ...cur, catRenames:cr, custom:(cur.custom||[]).map(w => w.cat===currentName ? {...w,cat:newCat.trim()} : w) });
    setEditingCat(null); Object.keys(priceCardCache).forEach(k => delete priceCardCache[k]);
  };
  const renameSub = async (origCatKey, origSubKey, newSub) => {
    if (!newSub.trim()) return;
    const cur = _catalogOverrides; const key = origCatKey+"|"+origSubKey; const sr = { ...(cur.subRenames||{}), [key]: newSub.trim() };
    const curCat = (cur.catRenames||{})[origCatKey] || origCatKey; const curSub = (cur.subRenames||{})[key] || origSubKey;
    await saveCatalog({ renames:{}, catRenames:{}, subRenames:{}, hiddenCodes:[], hiddenSubs:[], hiddenCats:[], custom:[], ...cur, subRenames:sr, custom:(cur.custom||[]).map(w => w.cat===curCat && w.sub===curSub ? {...w,sub:newSub.trim()} : w) });
    setEditingSub(null); Object.keys(priceCardCache).forEach(k => delete priceCardCache[k]);
  };
  const deleteCat = async (origCatKey) => {
    const hc = [...new Set([...((localCatalog||{}).hiddenCats||[]), origCatKey])]; const curName = (localCatalog?.catRenames||{})[origCatKey] || origCatKey;
    await saveCatalog({ ...(localCatalog||{}), hiddenCats:hc, custom:((localCatalog||{}).custom||[]).filter(w => w.cat!==curName) }); Object.keys(priceCardCache).forEach(k => delete priceCardCache[k]);
  };
  const deleteSub = async (origCatKey, origSubKey) => {
    const key = origCatKey+"|"+origSubKey; const hs = [...new Set([...((localCatalog||{}).hiddenSubs||[]), key])];
    const curCat = (localCatalog?.catRenames||{})[origCatKey] || origCatKey; const curSub = (localCatalog?.subRenames||{})[key] || origSubKey;
    await saveCatalog({ ...(localCatalog||{}), hiddenSubs:hs, custom:((localCatalog||{}).custom||[]).filter(w => !(w.cat===curCat && w.sub===curSub)) }); Object.keys(priceCardCache).forEach(k => delete priceCardCache[k]);
  };
  const roleLabel = r => r==="admin"?"👑 Администратор":r==="viewer"?"👁 Наблюдатель":r==="manager"?"🧑‍💼 Руководитель":r==="foreman"?"🔨 Прораб":"👤 Замерщик";
  const roleColor = r => r==="admin" ? "#ffffff" : r==="viewer" ? "#94a3b8" : "#94a3b8";
  const PRESENCE_ONLINE = 2 * 60 * 1000;
  const formatLastSeen = (ts) => {
    if (!ts) return "ещё не заходил";
    const diff = Date.now() - ts;
    if (diff < 60 * 1000) return "только что";
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff/60000)} мин назад`;
    const d = new Date(ts), now = new Date();
    const time = d.toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"});
    const sameDay = d.toDateString() === now.toDateString();
    const yest = new Date(now); yest.setDate(now.getDate()-1);
    if (sameDay) return `сегодня в ${time}`;
    if (d.toDateString() === yest.toDateString()) return `вчера в ${time}`;
    return `${d.toLocaleDateString("ru-RU")} в ${time}`;
  };

  return (
    <div className="page">
      <div className="hero" style={{background:"linear-gradient(135deg,#0f172a 0%,#1e293b 70%,#283549 100%)",borderRadius:16,padding:"24px 28px",marginBottom:24,position:"relative",overflow:"hidden",boxShadow:"0 4px 20px rgba(15,23,42,.3)"}}>
        <div style={{position:"absolute",top:-30,right:-30,width:160,height:160,borderRadius:"50%",background:"rgba(59,130,246,.08)"}}/>
        <div style={{position:"relative",zIndex:1}}>
          <h1 style={{margin:0,fontSize:22,fontWeight:900,color:"#fff"}}>⚙️ Администрирование</h1>
          <div style={{fontSize:13,color:"rgba(255,255,255,.75)",marginTop:4}}>Сотрудники и прайс-лист</div>
        </div>
      </div>

      {/* Табы */}
      <div className="admin-tabs" style={{display:"flex",gap:3,marginBottom:24,background:"#f8fafc",borderRadius:10,padding:4,overflowX:"auto"}}>
        {[["users","👥 Сотрудники"],["clients","👥 Клиенты"],["contragents","🏢 Реквизиты"],["prices","💰 Прайс-лист"],["backups","🗄 Бэкапы"],["audit","📋 Журнал"]].map(([t,label])=>(
          <button key={t} onClick={()=>{ setTab(t); setAdminSubTab("list"); }} style={{
            flex:1,padding:"11px",borderRadius:8,border:"none",cursor:"pointer",
            fontFamily:"inherit",fontSize:12,fontWeight:700,whiteSpace:"nowrap",
            background: tab===t ? "#fff" : "transparent",
            color: tab===t ? "#0f172a" : "#64748b",transition:"all .1s"
          }}>{label}</button>
        ))}
      </div>

      {loading ? (
        <div style={{textAlign:"center",padding:"60px 0",color:"#94a3b8"}}>
          <div style={{fontSize:24,marginBottom:8}}>⏳</div>Загрузка...
        </div>
      ) : tab === "users" ? (
        <div>
          {/* Список сотрудников */}
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:20}}>
            {users.map(u => (
              <div key={u.id} style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,padding:"16px 18px"}}>
                <div className="user-row" style={{display:"flex",alignItems:"center",gap:12}}>
                  {/* Аватар */}
                  <div style={{width:42,height:42,borderRadius:10,background:"#eff6ff",border:"1px solid #eff6ff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:18}}>
                    {u.role==="admin"?"👑":u.role==="viewer"?"👁":u.role==="manager"?"🧑‍💼":"👤"}
                  </div>
                  <div style={{flex:1,minWidth:120}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                      <span style={{fontWeight:700,fontSize:14,color:"#0f172a"}}>{u.name}</span>
                      <span style={{fontSize:10,fontWeight:700,color:roleColor(u.role),background:"rgba(0,0,0,.04)",borderRadius:4,padding:"2px 7px",whiteSpace:"nowrap"}}>{roleLabel(u.role)}</span>
                      {u.id === currentUser.id && <span style={{fontSize:10,color:"#94a3b8",background:"#e2e8f0",borderRadius:4,padding:"2px 7px"}}>вы</span>}
                      {(()=>{ const online = (presence[u.id]||0) > Date.now()-PRESENCE_ONLINE; return (
                        <span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:10,fontWeight:700,color:online?"#059669":"#94a3b8",background:online?"rgba(5,150,105,.1)":"rgba(0,0,0,.04)",borderRadius:4,padding:"2px 7px",whiteSpace:"nowrap"}}>
                          <span style={{width:6,height:6,borderRadius:"50%",background:online?"#059669":"#cbd5e1",display:"inline-block"}}/>
                          {online?"В сети":formatLastSeen(presence[u.id])}
                        </span>); })()}
                    </div>
                    <div style={{fontSize:12,color:"#94a3b8",marginTop:1}}>@{u.login}</div>
                  </div>
                  <div className="user-row-btns" style={{display:"flex",gap:6,flexShrink:0}}>
                    <button onClick={()=>{setEditingUser(editingUser?.id===u.id?null:{id:u.id,name:u.name,login:u.login,role:u.role||"user"});setEditingPass(null);}}
                      style={{background:"#e2e8f0",color:"#94a3b8",border:"1px solid #e2e8f0",borderRadius:7,padding:"6px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                      ✏ Изменить
                    </button>
                    <button onClick={()=>{setEditingPass(editingPass?.id===u.id?null:{id:u.id,val:""});setEditingUser(null);}}
                      style={{background:"#e2e8f0",color:"#94a3b8",border:"1px solid #e2e8f0",borderRadius:7,padding:"6px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                      🔑
                    </button>
                    {u.id !== currentUser.id && (
                      <button onClick={()=>removeUser(u.id)}
                        style={{background:"rgba(220,38,38,.1)",color:"#dc2626",border:"1px solid rgba(220,38,38,.1)",borderRadius:7,padding:"6px 10px",fontSize:12,cursor:"pointer"}}>✕</button>
                    )}
                  </div>
                </div>
                {editingUser?.id === u.id && (
                  <div style={{marginTop:14,paddingTop:14,borderTop:"1px solid #e2e8f0",display:"flex",flexDirection:"column",gap:10}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                      <div><div style={{fontSize:10,color:"#94a3b8",marginBottom:4}}>Имя</div><input className="fi" value={editingUser.name} onChange={e=>setEditingUser(p=>({...p,name:e.target.value}))}/></div>
                      <div><div style={{fontSize:10,color:"#94a3b8",marginBottom:4}}>Логин</div><input className="fi" value={editingUser.login} onChange={e=>setEditingUser(p=>({...p,login:e.target.value}))}/></div>
                    </div>
                    <div><div style={{fontSize:10,color:"#94a3b8",marginBottom:4}}>Роль</div>
                      <select className="fi" value={editingUser.role||"user"} onChange={e=>setEditingUser(p=>({...p,role:e.target.value}))} disabled={u.id===currentUser.id}>
                        <option value="user">👤 Замерщик</option>
                        <option value="manager">🧑‍💼 Руководитель</option>
                        <option value="admin">👑 Администратор</option>
                        <option value="viewer">👁 Наблюдатель</option>
                      </select>
                      {u.id===currentUser.id && <div style={{fontSize:10,color:"#94a3b8",marginTop:4}}>Нельзя менять свою роль</div>}
                    </div>
                    <button onClick={saveUser} style={{background:"#2563eb",color:"#f3f4f6",border:"none",borderRadius:8,padding:"10px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                      💾 Сохранить изменения
                    </button>
                  </div>
                )}
                {editingPass?.id === u.id && (
                  <div style={{marginTop:14,paddingTop:14,borderTop:"1px solid #e2e8f0",display:"flex",gap:8}}>
                    <input className="fi" placeholder="Новый пароль" value={editingPass.val} onChange={e=>setEditingPass(p=>({...p,val:e.target.value}))}/>
                    <button onClick={()=>savePass(u.id)} style={{background:"#2563eb",color:"#f3f4f6",border:"none",borderRadius:8,padding:"10px 18px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                      Сохранить
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Добавить нового */}
          <div style={{background:"#f8fafc",border:"1px dashed #eff6ff",borderRadius:8,padding:"20px"}}>
            <div style={{fontSize:12,fontWeight:700,color:"#334155",marginBottom:14,display:"flex",alignItems:"center",gap:6}}>
              <span>＋</span> Новый сотрудник
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10,marginBottom:12}}>
              <div><div style={{fontSize:10,color:"#94a3b8",marginBottom:4}}>Имя</div><input className="fi" placeholder="Иван Иванов" value={newName} onChange={e=>setNewName(e.target.value)}/></div>
              <div><div style={{fontSize:10,color:"#94a3b8",marginBottom:4}}>Логин</div><input className="fi" placeholder="ivanov" value={newLogin} onChange={e=>setNewLogin(e.target.value)}/></div>
              <div><div style={{fontSize:10,color:"#94a3b8",marginBottom:4}}>Пароль</div><input className="fi" placeholder="••••••" value={newPass} onChange={e=>setNewPass(e.target.value)}/></div>
              <div><div style={{fontSize:10,color:"#94a3b8",marginBottom:4}}>Роль</div>
                <select className="fi" value={newRole} onChange={e=>setNewRole(e.target.value)}>
                  <option value="user">👤 Замерщик</option>
                  <option value="manager">🧑‍💼 Руководитель</option>
                  <option value="admin">👑 Администратор</option>
                  <option value="viewer">👁 Наблюдатель</option>
                </select>
              </div>
            </div>
            <button onClick={addUser} className="btn btn-g" style={{width:"100%"}}>
              + Добавить сотрудника
            </button>
          </div>

          {msg && <div style={{marginTop:14,textAlign:"center",fontSize:13,fontWeight:600,color: msg.startsWith("✓") ? "#059669" : "#dc2626",padding:"10px",background:msg.startsWith("✓")?"rgba(76,175,125,.08)":"rgba(220,38,38,.08)",borderRadius:8}}>{msg}</div>}
          {saving && <div style={{textAlign:"center",fontSize:11,color:"#94a3b8",marginTop:8}}>💾 Сохранение...</div>}
        </div>
      ) : tab === "clients" ? (
        /* КЛИЕНТЫ */
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {adminSubTab === "list" && (<>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontWeight:700,color:"#94a3b8",fontSize:12}}>КЛИЕНТЫ ({clients.length})</div>
              {currentUser.role !== "viewer" && (
                <button onClick={()=>{ setAdminEditItem({mode:"newClient",data:{id:Date.now().toString(),name:"",phone:"",address:"",iin:"",doc:"",type:"физ",createdAt:Date.now(),createdById:currentUser.id}}); setAdminSubTab("clientEditor"); }}
                  className="btn btn-g" style={{fontSize:12,padding:"6px 12px"}}>+ Добавить</button>
              )}
            </div>
            {clients.length===0&&<div style={{textAlign:"center",padding:"40px 0",color:"#334155",fontSize:13}}>Клиентов пока нет</div>}
            {clients.map(c=>(
              <div key={c.id} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:10,padding:"14px 16px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:14,color:"#0f172a"}}>{c.name||"Без имени"}</div>
                    <div style={{fontSize:11,color:"#94a3b8",marginTop:3}}>
                      {c.type==="физ"?"👤 Физ. лицо":"🏢 Юр. лицо"}
                      {c.iin&&<span style={{marginLeft:8}}>ИИН: {c.iin}</span>}
                    </div>
                    {c.phone&&<div style={{fontSize:12,color:"#94a3b8",marginTop:1}}>📞 {c.phone}</div>}
                    {c.address&&<div style={{fontSize:12,color:"#94a3b8",marginTop:1}}>📍 {c.address}</div>}
                  </div>
                  <div style={{display:"flex",gap:5}}>
                    {(currentUser.role==="admin"||(currentUser.role==="user"&&c.createdById===currentUser.id))&&(
                      <button onClick={()=>{ setAdminEditItem({mode:"editClient",data:{...c}}); setAdminSubTab("clientEditor"); }}
                        style={{background:"#e2e8f0",color:"#94a3b8",border:"1px solid #e2e8f0",borderRadius:5,padding:"3px 9px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>✎</button>
                    )}
                    {(currentUser.role==="admin"||(currentUser.role==="user"&&c.createdById===currentUser.id))&&(
                      <button onClick={()=>{ if(window.confirm("Удалить клиента?")) saveClients(clientsRef.current.filter(x=>x.id!==c.id),{removedIds:[c.id],allowEmpty:true}); }}
                        style={{background:"rgba(220,38,38,.08)",color:"#dc2626",border:"1px solid rgba(220,38,38,.1)",borderRadius:5,padding:"3px 9px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>🗑</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </>)}
          {adminSubTab === "clientEditor" && adminEditItem && (<>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <button onClick={()=>setAdminSubTab("list")} style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:18}}>←</button>
              <span style={{fontWeight:700,fontSize:15,color:"#0f172a"}}>{adminEditItem.mode==="newClient"?"Новый клиент":"Редактировать клиента"}</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div>
                <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Тип</div>
                <select className="fi" value={adminEditItem.data.type||"физ"} onChange={e=>setAdminEditItem(p=>({...p,data:{...p.data,type:e.target.value}}))}>
                  <option value="физ">Физ. лицо</option>
                  <option value="юр">Юр. лицо</option>
                </select>
              </div>
              {[
                ["ФИО / Название организации","name"],
                ["Телефон","phone"],
                ["Адрес","address"],
                ...(adminEditItem.data.type==="юр"
                  ? [["БИН","iin"],["Директор (полностью)","director"],["Директор (кратко)","directorShort"],["Банк","bank"],["БИК","bik"],["ИИК (номер счёта)","account"],["Почта","email"]]
                  : [["ИИН","iin"],["Документ (уд. личности)","doc"]]
                )
              ].map(([label,field])=>(
                <div key={field}>
                  <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>{label}</div>
                  <input className="fi" value={adminEditItem.data[field]||""} onChange={e=>setAdminEditItem(p=>({...p,data:{...p.data,[field]:e.target.value}}))} placeholder={label}/>
                </div>
              ))}
            </div>
            <button className="btn btn-g" onClick={()=>{
              const d = adminEditItem.data;
              const list = adminEditItem.mode==="newClient" ? [...clients,d] : clients.map(x=>x.id===d.id?d:x);
              saveClients(list);
              setAdminSubTab("list");
            }}>← Готово</button>
          </>)}
        </div>
      ) : tab === "contragents" ? (
        /* РЕКВИЗИТЫ МОЙ ЮР. ЛИЦ */
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {adminSubTab === "list" && (<>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontWeight:700,color:"#94a3b8",fontSize:12}}>МОИ ЮР. ЛИЦА / РЕКВИЗИТЫ ({contragents.length})</div>
              {currentUser.role==="admin" && (
                <button onClick={()=>{ setAdminEditItem({mode:"newCA",data:{id:Date.now().toString(),name:"",bin:"",bank:"",bik:"",account:"",director:"",phone:"",email:"",address:""}}); setAdminSubTab("caEditor"); }}
                  className="btn btn-g" style={{fontSize:12,padding:"6px 12px"}}>+ Добавить</button>
              )}
            </div>
            {contragents.map(c=>(
              <div key={c.id} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:10,padding:"14px 16px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:14,color:"#0f172a"}}>{c.name}</div>
                    <div style={{fontSize:12,color:"#94a3b8",marginTop:1}}>БИН: {c.bin} · {c.bank}</div>
                    <div style={{fontSize:12,color:"#94a3b8",marginTop:1}}>Директор: {c.director} · {c.phone}</div>
                  </div>
                  {currentUser.role==="admin" && (
                    <div style={{display:"flex",gap:5}}>
                      <button onClick={()=>{ setAdminEditItem({mode:"editCA",data:{...c}}); setAdminSubTab("caEditor"); }}
                        style={{background:"#e2e8f0",color:"#94a3b8",border:"1px solid #e2e8f0",borderRadius:5,padding:"3px 9px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>✎</button>
                      {contragents.length>1&&<button onClick={()=>{ if(window.confirm("Удалить?")) saveContragents(contragentsRef.current.filter(x=>x.id!==c.id),{removedIds:[c.id],allowEmpty:true}); }}
                        style={{background:"rgba(220,38,38,.08)",color:"#dc2626",border:"1px solid rgba(220,38,38,.1)",borderRadius:5,padding:"3px 9px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>🗑</button>}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </>)}
          {adminSubTab === "caEditor" && adminEditItem && (<>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <button onClick={()=>setAdminSubTab("list")} style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:18}}>←</button>
              <span style={{fontWeight:700,fontSize:15,color:"#0f172a"}}>{adminEditItem.mode==="newCA"?"Новые реквизиты":"Редактировать реквизиты"}</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div style={{gridColumn:"1/-1"}}>
                <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Файл печати</div>
                <select className="fi" value={adminEditItem.data.stampFile||"stamp.jpg"} onChange={e=>setAdminEditItem(p=>({...p,data:{...p.data,stampFile:e.target.value}}))}>
                  <option value="stamp.jpg">stamp.jpg</option>
                  <option value="stamp2.jpg">stamp2.jpg</option>
                </select>
              </div>
              {[["Название","name"],["БИН","bin"],["Банк","bank"],["БИК","bik"],["Расчётный счёт","account"],["Директор","director"],["Телефон","phone"],["Email","email"],["Адрес","address"]].map(([label,field])=>(
                <div key={field}>
                  <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>{label}</div>
                  <input className="fi" value={adminEditItem.data[field]||""} onChange={e=>setAdminEditItem(p=>({...p,data:{...p.data,[field]:e.target.value}}))} placeholder={label}/>
                </div>
              ))}
            </div>
            <button className="btn btn-g" onClick={()=>{
              const d = adminEditItem.data;
              const list = adminEditItem.mode==="newCA" ? [...contragents,d] : contragents.map(x=>x.id===d.id?d:x);
              saveContragents(list);
              setAdminSubTab("list");
            }}>← Готово</button>
          </>)}
        </div>
      ) : tab === "prices" ? (
        /* ПРАЙС-ЛИСТ */
        <div style={{paddingBottom:90}}>
          {/* Поиск + кнопка добавить */}
          <div style={{display:"flex",gap:10,marginBottom:10,alignItems:"center"}}>
            <input className="fi" placeholder="🔍 Поиск по названию, подкатегории..." value={priceSearch} onChange={e=>setPriceSearch(e.target.value)} style={{flex:1}}/>
            <button onClick={()=>{
              const allW = getEffectiveCatalog();
              const cats = [...new Set(allW.map(w=>w.cat))];
              setNewWork({cat:cats[0]||"",catNew:"",sub:"",subNew:"",name:"",unit:"м²",cost:"",margin:40});
              setShowAddWork(true);
            }} className="btn btn-g" style={{whiteSpace:"nowrap"}}>
              ＋ Добавить позицию
            </button>
            {((localCatalog?.hiddenCats||[]).length > 0 || (localCatalog?.hiddenSubs||[]).length > 0) && (
              <button onClick={async ()=>{
                if (!window.confirm(`Показать все скрытые категории и подкатегории?\nСкрыто категорий: ${(localCatalog?.hiddenCats||[]).length}, подкатегорий: ${(localCatalog?.hiddenSubs||[]).length}`)) return;
                await saveCatalog({...(localCatalog||{}), hiddenCats:[], hiddenSubs:[]});
              }} className="btn btn-o" style={{whiteSpace:"nowrap",color:"#dc2626",borderColor:"#fca5a5"}}>
                👁 Показать скрытые ({(localCatalog?.hiddenCats||[]).length + (localCatalog?.hiddenSubs||[]).length})
              </button>
            )}
            <button onClick={openCatalogBackups}
              style={{background:"rgba(0,0,0,.03)",color:"#64748b",border:"1px solid #e2e8f0",borderRadius:8,padding:"7px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
              🕘 Бэкапы
            </button>
          </div>

          {/* Модал бэкапов каталога */}
          {catalogBackupsModal !== null && (
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:320,padding:16}} onClick={()=>setCatalogBackupsModal(null)}>
              <div style={{background:"#fff",borderRadius:10,padding:"20px 22px",maxWidth:480,width:"100%",maxHeight:"80vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <div style={{fontWeight:800,fontSize:16,color:"#0f172a"}}>🕘 Бэкапы каталога</div>
                  <button onClick={()=>setCatalogBackupsModal(null)} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:"#94a3b8"}}>✕</button>
                </div>
                <div style={{fontSize:12,color:"#94a3b8",marginBottom:14}}>Снимки каталога перед каждым изменением (последние 10). Можно откатиться к любому.</div>
                {catalogBackupsModal.length===0 && <div style={{textAlign:"center",padding:"30px 0",color:"#94a3b8",fontSize:13}}>Бэкапов каталога пока нет — они появятся после первого изменения прайс-листа</div>}
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {catalogBackupsModal.map((snap,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"10px 12px",background:"#f9fafb",border:"1px solid #e2e8f0",borderRadius:8}}>
                      <div>
                        <div style={{fontSize:13,fontWeight:600,color:"#0f172a"}}>{new Date(snap.ts).toLocaleString("ru-RU")}</div>
                        <div style={{fontSize:11,color:"#94a3b8"}}>{i===0?"последний":""}</div>
                      </div>
                      <button onClick={()=>restoreCatalogBackup(snap)}
                        style={{background:"#eff6ff",color:"#2563eb",border:"1px solid rgba(37,99,235,.2)",borderRadius:8,padding:"6px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                        Восстановить
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Быстрая навигация по категориям */}
          {!priceSearch && (()=>{
            const navCats = [...new Set(getEffectiveCatalog().map(w=>w.cat))];
            return navCats.length > 1 ? (
              <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:12,padding:"8px 10px",background:"#f8fafc",borderRadius:8,border:"1px solid #e2e8f0"}}>
                <span style={{fontSize:10,color:"#94a3b8",alignSelf:"center",marginRight:4,whiteSpace:"nowrap"}}>↓ Перейти:</span>
                {navCats.map(cat=>(
                  <button key={cat} onClick={()=>document.getElementById("price-cat-"+cat.replace(/\s/g,"_"))?.scrollIntoView({behavior:"smooth",block:"start"})}
                    style={{fontSize:11,padding:"3px 10px",borderRadius:5,border:"1px solid #e2e8f0",background:"#ffffff",color:"#334155",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                    {cat}
                  </button>
                ))}
              </div>
            ) : null;
          })()}

          {/* Форма добавления */}
          {showAddWork && (()=>{
            const allW = getEffectiveCatalog();
            const cats = [...new Set(allW.map(w=>w.cat))];
            const subs = newWork.cat ? [...new Set(allW.filter(w=>w.cat===newWork.cat).map(w=>w.sub))] : [];
            const inp = {background:"#f8fafc",border:"1px solid #e2e8f0",color:"#0f172a",borderRadius:8,padding:"7px 10px",fontFamily:"inherit",fontSize:12,outline:"none"};
            return (
              <div style={{background:"#f8fafc",border:"1px solid #eff6ff",borderRadius:10,padding:"16px",marginBottom:16}}>
                <div style={{fontSize:13,fontWeight:700,color:"#334155",marginBottom:12}}>Новая позиция</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10,marginBottom:12}}>
                  <div>
                    <div style={{fontSize:10,color:"#94a3b8",marginBottom:4}}>Категория</div>
                    <select value={newWork.cat} onChange={e=>setNewWork(p=>({...p,cat:e.target.value,sub:""}))} style={{...inp,width:"100%",cursor:"pointer"}}>
                      {cats.map(c=><option key={c} value={c}>{c}</option>)}
                      <option value="__new__">＋ Новая категория...</option>
                    </select>
                    {newWork.cat==="__new__"&&<input autoFocus placeholder="Название" value={newWork.catNew||""} onChange={e=>setNewWork(p=>({...p,catNew:e.target.value}))} style={{...inp,width:"100%",marginTop:6}}/>}
                  </div>
                  <div>
                    <div style={{fontSize:10,color:"#94a3b8",marginBottom:4}}>Подкатегория</div>
                    <select value={newWork.sub} onChange={e=>setNewWork(p=>({...p,sub:e.target.value}))} style={{...inp,width:"100%",cursor:"pointer"}} disabled={!newWork.cat}>
                      <option value="">— выбрать —</option>
                      {subs.map(s=><option key={s} value={s}>{s}</option>)}
                      <option value="__new__">＋ Новая подкатегория...</option>
                    </select>
                    {newWork.sub==="__new__"&&<input autoFocus placeholder="Название" value={newWork.subNew||""} onChange={e=>setNewWork(p=>({...p,subNew:e.target.value}))} style={{...inp,width:"100%",marginTop:6}}/>}
                  </div>
                  <div>
                    <div style={{fontSize:10,color:"#94a3b8",marginBottom:4}}>Название работы</div>
                    <input placeholder="напр. Укладка паркета" value={newWork.name} onChange={e=>setNewWork(p=>({...p,name:e.target.value}))} style={{...inp,width:"100%"}}/>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:"#94a3b8",marginBottom:4}}>Ед. измерения</div>
                    <select value={newWork.unit} onChange={e=>setNewWork(p=>({...p,unit:e.target.value}))} style={{...inp,width:"100%",cursor:"pointer"}}>
                      {["м²","м.п.","шт","усл.","кг","л"].map(u=><option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:"#94a3b8",marginBottom:4}}>Себестоимость ₸</div>
                    <input type="number" min="0" placeholder="0" value={newWork.cost||""} onChange={e=>setNewWork(p=>({...p,cost:e.target.value}))} style={{...inp,width:"100%"}}/>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:"#94a3b8",marginBottom:4}}>Маржа %</div>
                    <input type="number" min="0" max="100" placeholder="40" value={newWork.margin||""} onChange={e=>setNewWork(p=>({...p,margin:e.target.value}))} style={{...inp,width:"100%"}}/>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:"#b8904a",marginBottom:4}}>Цена от ₸ <span style={{color:"#94a3b8"}}>(если нет точной)</span></div>
                    <input type="number" min="0" placeholder="необязательно" value={newWork.priceFrom||""} onChange={e=>setNewWork(p=>({...p,priceFrom:e.target.value}))} style={{...inp,width:"100%"}}/>
                  </div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={addCustomWork} style={{flex:1,background:"#e2e8f0",color:"#94a3b8",border:"1px solid #e2e8f0",borderRadius:8,padding:"10px",fontFamily:"inherit",fontSize:13,fontWeight:700,cursor:"pointer"}}>✓ Добавить</button>
                  <button onClick={()=>{setShowAddWork(false);setNewWork({cat:"",sub:"",name:"",unit:"м²"});}} style={{background:"rgba(220,38,38,.1)",color:"#dc2626",border:"1px solid rgba(220,38,38,.1)",borderRadius:8,padding:"10px 16px",fontFamily:"inherit",fontSize:13,cursor:"pointer"}}>Отмена</button>
                </div>
              </div>
            );
          })()}

          {/* Таблица */}
          <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
            <table style={{width:"100%",minWidth:820,borderCollapse:"collapse",fontSize:12,tableLayout:"fixed"}}>
              <colgroup>
                <col style={{width:"13%"}}/>
                <col style={{width:"24%"}}/>
                <col style={{width:"5%"}}/>
                <col style={{width:"11%"}}/>
                <col style={{width:"8%"}}/>
                <col style={{width:"12%"}}/>
                <col style={{width:"11%"}}/>
                <col style={{width:"11%"}}/>
                <col style={{width:"5%"}}/>
              </colgroup>
              <thead>
                <tr style={{background:"#ffffff",position:"sticky",top:0,zIndex:5}}>
                  {["Подкатегория","Название работы","Ед.","Себестоимость ₸","Маржа %","Цена для клиента ₸","Цена от ₸","Валовая прибыль ₸",""].map((h,i)=>(
                    <th key={i} style={{padding:"10px 12px",textAlign:i>=3&&i<=7?"right":"left",fontSize:10,fontWeight:700,color:h==="Цена от ₸"?"#b8904a":"#94a3b8",textTransform:"uppercase",letterSpacing:.5,borderBottom:"2px solid #e5e7eb",whiteSpace:"normal",overflowWrap:"anywhere",wordBreak:"break-word",lineHeight:1.2,verticalAlign:"bottom"}}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(()=>{
                  const allWorks = getEffectiveCatalog();
                  const q = priceSearch.toLowerCase();
                  const filtered = allWorks.filter(w => !q || w.name.toLowerCase().includes(q) || w.sub.toLowerCase().includes(q) || w.cat.toLowerCase().includes(q));
                  const catOrder = []; const catMap = {};
                  for(const w of filtered){
                    if(!catMap[w.cat]){catMap[w.cat]={_origCat:w._origCat||w.cat,works:[]};catOrder.push(w.cat);}
                    catMap[w.cat].works.push(w);
                  }
                  const btnS = {background:"transparent",border:"none",cursor:"pointer",padding:"2px 5px",lineHeight:1};
                  const rows = [];
                  catOrder.forEach(cat=>{
                    const origCat = catMap[cat]._origCat;
                    // Category header
                    rows.push(
                      <tr key={"cat-"+cat} id={"price-cat-"+cat.replace(/\s/g,"_")}>
                        <td colSpan={8} style={{padding:"10px 12px 6px",paddingTop:rows.length===0?10:20}}>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            {editingCat?.key===origCat ? (
                              <>
                                <input autoFocus value={editingCat.val} onChange={e=>setEditingCat(p=>({...p,val:e.target.value}))}
                                  onKeyDown={e=>{if(e.key==="Enter")renameCat(origCat,editingCat.val);if(e.key==="Escape")setEditingCat(null);}}
                                  style={{background:"#f8fafc",border:"1px solid #e2e8f0",color:"#0f172a",borderRadius:5,padding:"3px 10px",fontFamily:"inherit",fontSize:12,fontWeight:800,outline:"none",width:200}}/>
                                <button onClick={()=>renameCat(origCat,editingCat.val)} style={{...btnS,color:"#059669",fontSize:14}}>✓</button>
                                <button onClick={()=>setEditingCat(null)} style={{...btnS,color:"#334155",fontSize:14}}>✕</button>
                              </>
                            ) : (
                              <>
                                <span style={{fontSize:11,fontWeight:700,color:"#334155",letterSpacing:.5,textTransform:"uppercase"}}>{cat}</span>
                                <button onClick={()=>setEditingCat({key:origCat,val:cat})} title="Переименовать" style={{...btnS,color:"#2563eb",opacity:.5,fontSize:11}}>✏️</button>
                                <button onClick={()=>{if(window.confirm(`Удалить категорию "${cat}"?`))deleteCat(origCat);}} title="Удалить" style={{...btnS,color:"#dc2626",opacity:.5,fontSize:11}}>🗑</button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                    // Group by sub within cat
                    const subOrder = []; const subMap = {};
                    catMap[cat].works.forEach(w=>{
                      if(!subMap[w.sub]){subMap[w.sub]={_origSub:w._origSub||w.sub,works:[]};subOrder.push(w.sub);}
                      subMap[w.sub].works.push(w);
                    });
                    subOrder.forEach(sub=>{
                      const origSub = subMap[sub]._origSub;
                      subMap[sub].works.forEach((w,i)=>{
                        const ov = localPrices?.[w.code];
                        const baseCost = w.cost ?? null;
                        const baseMargin = w.margin ?? 0.4;
                        const ovCost = ov?.cost !== undefined ? ov.cost : baseCost;
                        const ovMargin = ov?.margin !== undefined ? ov.margin : baseMargin;
                        const price = (ovCost !== null && ovCost !== "" && Number(ovCost) > 0) ? Math.round(Number(ovCost) / (1 - Math.min(0.99, Math.max(0, Number(ovMargin)||0)))) : (ov?.fixedPrice || w.fixedPrice || null);
                        const profit = (ovCost !== null && ovCost !== "" && Number(ovCost) > 0 && price) ? price - Number(ovCost) : null;
                        const isEven = rows.length % 2 === 0;
                        rows.push(
                          <tr key={w.code} style={{background:isEven?"transparent":"rgba(255,255,255,.015)",borderBottom:"1px solid rgba(0,0,0,.03)"}}>
                            {/* Подкатегория */}
                            <td style={{padding:"8px 12px",verticalAlign:"top",borderRight:"1px solid #e5e7eb",color:i===0?"#94a3b8":"transparent",fontSize:11}}>
                              {i===0 && (
                                <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
                                  {editingSub?.cat===origCat&&editingSub?.key===origSub ? (
                                    <span style={{display:"contents"}}>
                                      <input autoFocus value={editingSub.val} onChange={e=>setEditingSub(p=>({...p,val:e.target.value}))}
                                        onKeyDown={e=>{if(e.key==="Enter")renameSub(origCat,origSub,editingSub.val);if(e.key==="Escape")setEditingSub(null);}}
                                        style={{background:"#f8fafc",border:"1px solid #e2e8f0",color:"#94a3b8",borderRadius:5,padding:"2px 7px",fontFamily:"inherit",fontSize:11,outline:"none",width:120}}/>
                                      <button onClick={()=>renameSub(origCat,origSub,editingSub.val)} style={{...btnS,color:"#059669",fontSize:12}}>✓</button>
                                      <button onClick={()=>setEditingSub(null)} style={{...btnS,color:"#94a3b8",fontSize:12}}>✕</button>
                                    </span>
                                  ) : (
                                    <span style={{display:"contents"}}>
                                      <span style={{color:"#94a3b8",fontSize:11}}>{sub}</span>
                                      <button onClick={()=>setEditingSub({cat:origCat,key:origSub,val:sub})} style={{...btnS,color:"#94a3b8",fontSize:10,opacity:.6}}>✏️</button>
                                      <button onClick={()=>{if(window.confirm("Удалить подкатегорию?"))deleteSub(origCat,origSub);}} style={{...btnS,color:"#dc2626",fontSize:10,opacity:.6}}>🗑</button>
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                            {/* Название работы */}
                            <td style={{padding:"6px 12px"}}>
                              {editingUser?.id===w.code ? (
                                <div style={{display:"flex",gap:4}}>
                                  <input autoFocus value={editingUser.name} onChange={e=>setEditingUser(p=>({...p,name:e.target.value}))}
                                    onKeyDown={e=>{if(e.key==="Enter"){renameWork(w.code,editingUser.name);setEditingUser(null);}if(e.key==="Escape")setEditingUser(null);}}
                                    style={{flex:1,background:"#f8fafc",border:"1px solid #2563eb",color:"#0f172a",borderRadius:5,padding:"3px 8px",fontFamily:"inherit",fontSize:12,outline:"none"}}/>
                                  <button onClick={()=>{renameWork(w.code,editingUser.name);setEditingUser(null);}} style={{...btnS,color:"#059669",fontSize:13}}>✓</button>
                                  <button onClick={()=>setEditingUser(null)} style={{...btnS,color:"#334155",fontSize:13}}>✕</button>
                                </div>
                              ) : (
                                <div style={{display:"flex",alignItems:"center",gap:4}}>
                                  <span style={{color:"#0f172a",flex:1}}>{w.name}</span>
                                  <button onClick={()=>setEditingUser({id:w.code,name:w.name})} style={{...btnS,color:"#94a3b8",fontSize:10,opacity:.5,flexShrink:0}}>✏️</button>
                                </div>
                              )}
                            </td>
                            {/* Ед. */}
                            <td style={{padding:"6px 8px",color:"#94a3b8",textAlign:"center",fontSize:11}}>{w.unit}</td>
                            {/* Себестоимость */}
                            <td style={{padding:"6px 8px",textAlign:"right"}}>
                              <input type="number" min="0"
                                placeholder={baseCost !== null ? String(baseCost) : "—"}
                                value={ovCost !== null && ovCost !== undefined ? ovCost : ""}
                                onChange={e=>{
                                  const val = e.target.value === "" ? null : Number(e.target.value);
                                  setLocalPrices(prev=>({...prev,[w.code]:{...(prev?.[w.code]||{}),cost:val}}));
                                  priceCardCache[w.code] = {...(priceCardCache[w.code]||{}), cost:val, margin:ovMargin};
                                }}
                                style={{width:"100%",background:"#f8fafc",border:"1px solid #e2e8f0",color:"#0f172a",borderRadius:5,padding:"4px 8px",textAlign:"right",fontFamily:"inherit",fontSize:12,outline:"none"}}
                              />
                            </td>
                            {/* Маржа */}
                            <td style={{padding:"6px 8px",textAlign:"right"}}>
                              <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:3}}>
                                <input type="number" min="0" max="100" step="1"
                                  value={Math.round(ovMargin*100)}
                                  onChange={e=>{
                                    const val = e.target.value===""?baseMargin:Math.min(0.99, Math.max(0, Number(e.target.value)/100));
                                    setLocalPrices(prev=>({...prev,[w.code]:{...(prev?.[w.code]||{}),margin:val}}));
                                    priceCardCache[w.code] = {...(priceCardCache[w.code]||{}), margin:val, cost:ovCost};
                                  }}
                                  style={{width:50,background:"#f8fafc",border:"1px solid #e2e8f0",color:"#0f172a",borderRadius:5,padding:"4px 6px",textAlign:"right",fontFamily:"inherit",fontSize:12,outline:"none"}}
                                />
                                <span style={{color:"#94a3b8",fontSize:10}}>%</span>
                              </div>
                            </td>
                            {/* Цена для клиента */}
                            <td style={{padding:"6px 12px",textAlign:"right",fontWeight:700,color:"#0f172a",whiteSpace:"nowrap"}}>
                              {price ? new Intl.NumberFormat("ru-RU").format(price)+" ₸" : "—"}
                            </td>
                            {/* Цена от */}
                            <td style={{padding:"6px 8px",textAlign:"right"}}>
                              <input type="number" min="0"
                                placeholder="—"
                                value={ov?.priceFrom !== undefined ? ov.priceFrom : (w.priceFrom || "")}
                                onChange={e=>{
                                  const val = e.target.value === "" ? undefined : Number(e.target.value);
                                  setLocalPrices(prev=>({...prev,[w.code]:{...(prev?.[w.code]||{}),priceFrom:val}}));
                                  priceCardCache[w.code] = {...(priceCardCache[w.code]||{}), priceFrom:val};
                                }}
                                style={{width:"100%",background:"#fffbf0",border:"1px solid #e5d78e",color:"#92610a",borderRadius:5,padding:"4px 8px",textAlign:"right",fontFamily:"inherit",fontSize:12,outline:"none"}}
                              />
                            </td>
                            {/* Валовая прибыль */}
                            <td style={{padding:"6px 12px",textAlign:"right",color:"#059669",whiteSpace:"nowrap"}}>
                              {profit ? new Intl.NumberFormat("ru-RU").format(Math.round(profit))+" ₸" : "—"}
                            </td>
                            {/* Удалить */}
                            <td style={{padding:"6px 8px",textAlign:"center"}}>
                              <button onClick={()=>{
                                if(!window.confirm(`Удалить "${w.name}"?`))return;
                                if(w.code.startsWith("CUSTOM-")) deleteCustomWork(w.code);
                                else { const hc=[...new Set([...((localCatalog||{}).hiddenCodes||[]),w.code])]; saveCatalog({...(localCatalog||{}),hiddenCodes:hc}); }
                              }} style={{...btnS,color:"#dc2626",fontSize:13}}>🗑</button>
                            </td>
                          </tr>
                        );
                      });
                    });
                  });
                  if(rows.length===0) rows.push(<tr key="empty"><td colSpan={9} style={{textAlign:"center",padding:"40px",color:"#94a3b8"}}>Ничего не найдено</td></tr>);
                  return rows;
                })()}
              </tbody>
            </table>
          </div>

          {/* ↑ Наверх */}
          <button onClick={()=>document.getElementById("price-cat-"+getEffectiveCatalog().map(w=>w.cat)[0]?.replace(/\s/g,"_"))?.scrollIntoView({behavior:"smooth",block:"start"})}
            style={{position:"fixed",bottom:80,right:32,background:"#2563eb",color:"#f3f4f6",border:"none",borderRadius:999,width:40,height:40,fontSize:18,cursor:"pointer",boxShadow:"0 2px 10px rgba(0,0,0,.2)",zIndex:30,display:"flex",alignItems:"center",justifyContent:"center"}}>
            ↑
          </button>

          {/* Индикатор автосохранения */}
          {(priceMsg || priceSaving) && (
            <div style={{position:"fixed",bottom:0,left:"220px",right:0,background:"#f8fafc",borderTop:"1px solid #e2e8f0",padding:"10px 24px",zIndex:20,textAlign:"center"}}>
              {priceMsg && <span style={{fontSize:13,color:"#059669",fontWeight:700}}>{priceMsg}</span>}
              {priceSaving && !priceMsg && <span style={{fontSize:12,color:"#94a3b8"}}>💾 Сохранение...</span>}
            </div>
          )}
        </div>
      ) : null}

      {/* ── БЭКАПЫ ── */}
      {tab === "backups" && (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={{fontWeight:700,color:"#334155",fontSize:14,marginBottom:4}}>Восстановление данных</div>
          <div style={{fontSize:12,color:"#94a3b8",marginBottom:8}}>Снимки рабочего пространства создаются автоматически. Каждый снимок — это все объекты вместе с их сметами и договорами. Восстановление возвращает всё целиком на выбранный момент.</div>
          <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:10,padding:"16px 18px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
            <div>
              <div style={{fontWeight:700,fontSize:14,color:"#0f172a"}}>📦 Объекты, сметы и договора</div>
              <div style={{fontSize:12,color:"#94a3b8",marginTop:2}}>Единый снимок: объекты + вложенные сметы и договора</div>
            </div>
            <button onClick={onBackupWorkspace} style={{background:"rgba(37,99,235,.08)",color:"#2563eb",border:"1px solid rgba(37,99,235,.2)",borderRadius:8,padding:"8px 16px",fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",fontWeight:700}}>
              🕘 Просмотреть бэкапы
            </button>
          </div>
        </div>
      )}

      {tab === "audit" && <AuditTab />}
    </div>
  );
}


// ─── ГЛАВНЫЙ КОМПОНЕНТ ───────────────────────────────────────────────────────

// Типы документов
const DOC_TYPES = [
  { value:"repair_fiz",  label:"Договор ремонта" },
  { value:"annex",       label:"Приложение (доп. работы) №2/3..." },
  { value:"design",      label:"Соглашение о дизайн-проекте" },
  { value:"design_add",  label:"Доп. соглашение к дизайн-проекту" },
  { value:"reservation", label:"Соглашение о резервировании" },
  { value:"podryad",     label:"Договор подряда (с рабочим)" },
  { value:"podryad_annex", label:"Доп. приложение к договору подряда" },
];
const TYPE_LABELS = { repair_fiz:"Договор ремонта", annex:"Приложение", design:"Дизайн-проект", design_add:"Доп. соглашение дизайн", reservation:"Бронь", podryad:"Договор подряда", podryad_annex:"Приложение к подряду" };

function ContractEditor({ contract, clients, contragents, onUpdate, onBack, onSave, onPdf, onGDoc, onAddClientFromEstimate, onUpdateClient, onCreateClient, workers=[], onCreateWorker, importObjects=[], getObjectWorks, currentUserRole, fmt }) {
  const [withStamp, setWithStamp] = useState(true);
  const [showClientForm, setShowClientForm] = useState(false);
  const [showNewClientForm, setShowNewClientForm] = useState(false);
  const [newClientData, setNewClientData] = useState({ name:"", phone:"", type:"физ" });
  const [showNewWorker, setShowNewWorker] = useState(false);
  const [newWorkerData, setNewWorkerData] = useState({ name:"", iin:"", doc:"", phone:"", address:"" });
  const type = contract.type || "repair_fiz";
  const total = (contract.works||[]).reduce((s,w)=>s+(Number(w.quantity)*Number(w.price)||0),0);
  const upd = (patch) => onUpdate(prev=>({...prev,...patch}));

  const isRepair   = type==="repair_fiz";
  const isAnnex    = type==="annex";
  const isDesign   = type==="design";
  const isDesAdd   = type==="design_add";
  const isRes      = type==="reservation";
  const isPodryad  = type==="podryad";
  const isPodAnnex = type==="podryad_annex";
  const isPod      = isPodryad || isPodAnnex;
  const hasWorks   = isRepair || isAnnex || isPod;
  const hasMainRef = isAnnex || isDesAdd || isPodAnnex;

  const fi = {background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,color:"#0f172a",fontSize:13,padding:"8px 10px",fontFamily:"inherit",width:"100%"};

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:18}}>←</button>
        <span style={{fontWeight:700,fontSize:15,color:"#0f172a"}}>{contract.number ? `${TYPE_LABELS[type]||""} №${contract.number}` : "Новый документ"}</span>
      </div>

      {/* Тип документа + статус */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div>
          <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Тип документа</div>
          <select style={fi} value={type} onChange={e=>upd({type:e.target.value})}>
            {DOC_TYPES.map(d=><option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </div>
        <div>
          <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Статус</div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            {CONTRACT_STATUSES.map(s=>(
              <button key={s.key} onClick={()=>upd({contractStatus:s.key})}
                style={{background:(contract.contractStatus||"draft")===s.key?s.bg:"rgba(0,0,0,.03)",color:(contract.contractStatus||"draft")===s.key?s.color:"#94a3b8",border:`1px solid ${(contract.contractStatus||"draft")===s.key?s.color:"#e2e8f0"}`,borderRadius:8,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",transition:"all .15s"}}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Основные поля — номер и дата */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div>
          <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>{(isAnnex||isPodAnnex)?"Приложение №":isDesAdd?"Номер доп. соглашения":"Номер договора/соглашения"}</div>
          {(isAnnex||isPodAnnex)
            ? <input className="fi" type="number" min="2" value={contract.appendix||2} onChange={e=>upd({appendix:parseInt(e.target.value)||2})}/>
            : <input className="fi" value={contract.number||""} onChange={e=>upd({number:e.target.value})} placeholder="0001#202020"/>}
        </div>
        <div>
          <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>{(isAnnex||isPodAnnex)?"Дата приложения":"Дата"}</div>
          <input className="fi" type="date" value={(isAnnex||isPodAnnex)?(contract.annexDate||contract.date||""):(contract.date||"")} onChange={e=>upd((isAnnex||isPodAnnex)?{annexDate:e.target.value}:{date:e.target.value})}/>
        </div>
      </div>

      {/* Ссылка на основной договор (для Приложений и Доп.соглашений) */}
      {hasMainRef && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div>
            <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>{isDesAdd?"Номер соглашения о дизайне":"Номер основного договора"}</div>
            <input className="fi" value={contract.mainNumber||""} onChange={e=>upd({mainNumber:e.target.value})} placeholder="0819#128"/>
          </div>
          <div>
            <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>{isDesAdd?"Дата соглашения о дизайне":"Дата основного договора"}</div>
            <input className="fi" type="date" value={contract.mainDate||""} onChange={e=>upd({mainDate:e.target.value})}/>
          </div>
        </div>
      )}

      {/* Доп поля: резервирование */}
      {isRes && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div>
            <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Сумма резервирования (₸)</div>
            <input className="fi" type="number" value={contract.reserveAmount||50000} onChange={e=>upd({reserveAmount:parseFloat(e.target.value)||0})}/>
          </div>
          <div>
            <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Дата начала работ (п.2.1)</div>
            <input className="fi" type="date" value={contract.reserveStartDate||""} onChange={e=>upd({reserveStartDate:e.target.value})}/>
          </div>
        </div>
      )}

      {/* Доп поля: дизайн */}
      {isDesign && (
        <div>
          <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Предоплата (₸)</div>
          <input className="fi" type="number" value={contract.designAdvance||25000} onChange={e=>upd({designAdvance:parseFloat(e.target.value)||0})}/>
        </div>
      )}

      {/* Доп поля: доп. соглашение к дизайну */}
      {isDesAdd && (<>\
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div>
            <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Площадь объекта (м²)</div>
            <input className="fi" type="number" value={contract.area||""} onChange={e=>upd({area:e.target.value})} placeholder="85"/>
          </div>
          <div>
            <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Срок выполнения (раб. дней)</div>
            <input className="fi" type="number" value={contract.deadline||""} onChange={e=>upd({deadline:e.target.value})} placeholder="30"/>
          </div>
          <div>
            <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Вариантов планировки</div>
            <input className="fi" type="number" min="1" value={contract.variantsLayout||""} onChange={e=>upd({variantsLayout:e.target.value})} placeholder="2"/>
          </div>
          <div>
            <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Раундов корр. планировки</div>
            <input className="fi" type="number" min="0" value={contract.corrLayout||""} onChange={e=>upd({corrLayout:e.target.value})} placeholder="2"/>
          </div>
          <div>
            <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Раундов корр. визуализаций</div>
            <input className="fi" type="number" min="0" value={contract.corrVis||""} onChange={e=>upd({corrVis:e.target.value})} placeholder="2"/>
          </div>
        </div>
        {/* Тип стоимости */}
        <div>
          <div style={{fontSize:11,color:"#94a3b8",marginBottom:6}}>Способ расчёта стоимости</div>
          <div style={{display:"flex",gap:16,marginBottom:8}}>
            <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"#94a3b8",cursor:"pointer"}}>
              <input type="radio" name="priceType" checked={!contract.priceType||contract.priceType==="fixed"}
                onChange={()=>upd({priceType:"fixed"})}/> Фиксированная сумма
            </label>
            <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"#94a3b8",cursor:"pointer"}}>
              <input type="radio" name="priceType" checked={contract.priceType==="sqm"}
                onChange={()=>upd({priceType:"sqm"})}/> За м²
            </label>
          </div>
          {(!contract.priceType||contract.priceType==="fixed") ? (
            <div>
              <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Итоговая стоимость (₸)</div>
              <input className="fi" type="number" value={contract.totalCost||""} onChange={e=>upd({totalCost:parseFloat(e.target.value)||0})} placeholder="170000"/>
            </div>
          ) : (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div>
                <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Цена за м² (₸)</div>
                <input className="fi" type="number" value={contract.pricePerSqm||""} onChange={e=>upd({pricePerSqm:parseFloat(e.target.value)||0})} placeholder="2000"/>
              </div>
              <div>
                <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Итого (авто, ₸)</div>
                <div className="fi" style={{background:"#e2e8f0",color:"#334155",fontWeight:600,display:"flex",alignItems:"center"}}>
                  {fmt(Math.round((contract.pricePerSqm||0)*(contract.area||0)))} ₸
                </div>
              </div>
            </div>
          )}
        </div>
        <div>
          <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Предоплата уже внесена (₸)</div>
          <input className="fi" type="number" value={contract.designAdvance||25000} onChange={e=>upd({designAdvance:parseFloat(e.target.value)||0})}/>
        </div>
        <div>
          <div style={{fontSize:11,color:"#94a3b8",marginBottom:6}}>Состав дизайн-проекта</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            {[["plan","Обмерочный план"],["layout","Планировочное решение"],["concept","Концепция интерьера"],["vis3d","3D визуализация"],["drawings","Рабочие чертежи"],["materials","Ведомость материалов"]].map(([k,l])=>(
              <label key={k} style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"#94a3b8",cursor:"pointer"}}>
                <input type="checkbox" checked={!!(contract.composition||{})[k]} onChange={e=>upd({composition:{...(contract.composition||{}),[k]:e.target.checked}})}/>
                {l}
              </label>
            ))}
          </div>
        </div>
      </>)}

      {/* Подрядчик (рабочий) — из отдельной базы «Подрядчики» — для договоров подряда */}
      {isPod && (
        <div>
          <div style={{fontSize:12,fontWeight:700,color:"#94a3b8",marginBottom:8}}>ПОДРЯДЧИК (рабочий)</div>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <select className="fi" style={{flex:1}} value={contract.workerId||""} onChange={e=>{upd({workerId:e.target.value});setShowNewWorker(false);}}>
              <option value="">— Выбрать подрядчика —</option>
              {workers.map(w=>(<option key={w.id} value={w.id}>{w.name}</option>))}
            </select>
            <button onClick={()=>setShowNewWorker(s=>!s)} style={{background:showNewWorker?"#eff6ff":"#f3f4f6",color:"#059669",border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>+ Новый</button>
          </div>
          {showNewWorker && (
            <div style={{marginTop:8,padding:"12px 14px",background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:8,display:"flex",flexDirection:"column",gap:8}}>
              <div style={{fontSize:11,fontWeight:700,color:"#059669"}}>Новый подрядчик</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <input className="fi" value={newWorkerData.name} onChange={e=>setNewWorkerData(p=>({...p,name:e.target.value}))} placeholder="ФИО *"/>
                <input className="fi" value={newWorkerData.iin} onChange={e=>setNewWorkerData(p=>({...p,iin:e.target.value}))} placeholder="ИИН"/>
                <input className="fi" value={newWorkerData.doc} onChange={e=>setNewWorkerData(p=>({...p,doc:e.target.value}))} placeholder="№ документа"/>
                <input className="fi" value={newWorkerData.phone} onChange={e=>setNewWorkerData(p=>({...p,phone:e.target.value}))} placeholder="Телефон"/>
                <input className="fi" style={{gridColumn:"1 / -1"}} value={newWorkerData.address} onChange={e=>setNewWorkerData(p=>({...p,address:e.target.value}))} placeholder="Адрес"/>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={async()=>{ if(!newWorkerData.name.trim())return; const id=await onCreateWorker({...newWorkerData,name:newWorkerData.name.trim()}); upd({workerId:id}); setShowNewWorker(false); setNewWorkerData({name:"",iin:"",doc:"",phone:"",address:""}); }}
                  style={{background:"#059669",color:"#fff",border:"none",borderRadius:8,padding:"7px 18px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Создать и выбрать</button>
                <button onClick={()=>{setShowNewWorker(false);setNewWorkerData({name:"",iin:"",doc:"",phone:"",address:""});}}
                  style={{background:"#f3f4f6",color:"#64748b",border:"none",borderRadius:8,padding:"7px 14px",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Отмена</button>
              </div>
            </div>
          )}
          {/* Импорт работ из сметы объекта */}
          {getObjectWorks && (
            <div style={{marginTop:10}}>
              <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Подтянуть работы из сметы объекта (суммы потом редактируются)</div>
              <select className="fi" value={contract.objectId||""} onChange={e=>{ const oid=e.target.value; if(!oid){upd({objectId:""});return;} const ws=getObjectWorks(oid); const o=importObjects.find(x=>x.id===oid); upd({objectId:oid, works:ws.length?ws:(contract.works||[]), objectAddress:o?.address||contract.objectAddress||""}); }}>
                <option value="">— объект —</option>
                {importObjects.map(o=>(<option key={o.id} value={o.id}>{o.label}</option>))}
              </select>
            </div>
          )}
        </div>
      )}
      {/* Клиент */}
      {!isPod && (
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div style={{fontSize:12,fontWeight:700,color:"#94a3b8"}}>ЗАКАЗЧИК</div>
          {contract.estClient && !contract.clientId && (
            <div style={{fontSize:11,color:"#d97706"}}>⚠ Из сметы: {contract.estClient}</div>
          )}
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <select className="fi" style={{flex:1}} value={contract.clientId||""} onChange={e=>{upd({clientId:e.target.value});setShowNewClientForm(false);}}>
            <option value="">— Выбрать клиента —</option>
            {clients.map(c=>(<option key={c.id} value={c.id}>{c.name}{c.clientType==="yur" || c.type==="юр" ? " (ЮР)" : ""}</option>))}
          </select>
          {contract.clientId
            ? <button onClick={()=>setShowClientForm(s=>!s)}
                style={{background:showClientForm?"#eff6ff":"#f3f4f6",color:"#2563eb",border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                ✎ Данные
              </button>
            : <button onClick={()=>{setShowNewClientForm(s=>!s);setShowClientForm(false);}}
                style={{background:showNewClientForm?"#eff6ff":"#f3f4f6",color:"#059669",border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                + Новый
              </button>
          }
        </div>
        {showNewClientForm && (
          <div style={{marginTop:8,padding:"12px 14px",background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:8,display:"flex",flexDirection:"column",gap:8}}>
            <div style={{fontSize:11,fontWeight:700,color:"#059669"}}>Новый клиент</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <div>
                <div style={{fontSize:11,color:"#94a3b8",marginBottom:3}}>Тип</div>
                <select className="fi" value={newClientData.type} onChange={e=>setNewClientData(p=>({...p,type:e.target.value}))}>
                  <option value="физ">Физ. лицо</option>
                  <option value="юр">Юр. лицо</option>
                </select>
              </div>
              <div>
                <div style={{fontSize:11,color:"#94a3b8",marginBottom:3}}>ФИО / Название *</div>
                <input className="fi" value={newClientData.name} onChange={e=>setNewClientData(p=>({...p,name:e.target.value}))} placeholder="Иванов Иван Иванович"/>
              </div>
              <div>
                <div style={{fontSize:11,color:"#94a3b8",marginBottom:3}}>Телефон</div>
                <input className="fi" value={newClientData.phone||""} onChange={e=>setNewClientData(p=>({...p,phone:e.target.value}))} placeholder="+7 ..."/>
              </div>
              <div>
                <div style={{fontSize:11,color:"#94a3b8",marginBottom:3}}>Адрес</div>
                <input className="fi" value={newClientData.address||""} onChange={e=>setNewClientData(p=>({...p,address:e.target.value}))} placeholder="г. Алматы ..."/>
              </div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={async ()=>{
                if(!newClientData.name.trim()) return;
                const nc = {id:Date.now().toString(),createdAt:Date.now(),...newClientData,name:newClientData.name.trim()};
                await onCreateClient(nc);
                upd({clientId:nc.id});
                setShowNewClientForm(false);
                setNewClientData({name:"",phone:"",type:"физ"});
                setShowClientForm(true);
              }} style={{background:"#059669",color:"#fff",border:"none",borderRadius:8,padding:"7px 18px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                Создать и выбрать
              </button>
              <button onClick={()=>{setShowNewClientForm(false);setNewClientData({name:"",phone:"",type:"физ"});}}
                style={{background:"#f3f4f6",color:"#64748b",border:"none",borderRadius:8,padding:"7px 14px",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                Отмена
              </button>
            </div>
          </div>
        )}
        {!contract.clientId && !showNewClientForm && contract.estClient && (
          <button onClick={async ()=>{ await onAddClientFromEstimate(); setShowClientForm(true); }}
            style={{marginTop:6,background:"#eff6ff",color:"#059669",border:"1px solid #eff6ff",borderRadius:8,padding:"5px 12px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>
            + Создать клиента из сметы ({contract.estClient})
          </button>
        )}
        {/* Инлайн-форма данных выбранного клиента */}
        {contract.clientId && showClientForm && (() => {
          const cl = clients.find(c=>c.id===contract.clientId);
          if(!cl) return null;
          const updCl = (patch)=>onUpdateClient({...cl,...patch});
          const isYur = cl.type==="юр";
          const fields = isYur
            ? [["ФИО / Название","name"],["Телефон","phone"],["Адрес","address"],["БИН","iin"],["Директор (полностью)","director"],["Директор (кратко)","directorShort"],["Банк","bank"],["БИК","bik"],["ИИК (счёт)","account"],["Почта","email"]]
            : [["ФИО","name"],["Телефон","phone"],["Адрес","address"],["ИИН","iin"],["Документ (уд. личности)","doc"]];
          return (
            <div style={{marginTop:8,padding:"12px 14px",background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div>
                <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Тип</div>
                <select className="fi" value={cl.type||"физ"} onChange={e=>updCl({type:e.target.value})}>
                  <option value="физ">Физ. лицо</option>
                  <option value="юр">Юр. лицо</option>
                </select>
              </div>
              {fields.map(([label,field])=>(
                <div key={field}>
                  <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>{label}</div>
                  <input className="fi" value={cl[field]||""} onChange={e=>updCl({[field]:e.target.value})} placeholder={label}/>
                </div>
              ))}
              <div style={{gridColumn:"1 / -1",fontSize:10,color:"#94a3b8"}}>✓ Изменения сохраняются автоматически в карточку клиента</div>
            </div>
          );
        })()}
      </div>
      )}
      {/* Подрядчик/Заказчик (наше ТОО) */}
      <div>
        <div style={{fontSize:12,fontWeight:700,color:"#94a3b8",marginBottom:8}}>{isPod?"ЗАКАЗЧИК (наше ТОО)":"ПОДРЯДЧИК"}</div>
        <select className="fi" value={contract.contragentId||""} onChange={e=>upd({contragentId:e.target.value})}>
          <option value="">— Выбрать ТОО —</option>
          {contragents.map(c=>(<option key={c.id} value={c.id}>{c.name}</option>))}
        </select>
      </div>
      {/* Доп. поля договора подряда */}
      {isPod && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div style={{gridColumn:"1 / -1"}}>
            <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Адрес проведения работ</div>
            <input className="fi" value={contract.objectAddress||""} onChange={e=>upd({objectAddress:e.target.value})} placeholder="г. Караганда, ..."/>
          </div>
          <div>
            <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Аванс (₸, необязательно)</div>
            <input className="fi" type="number" value={contract.avans||""} onChange={e=>upd({avans:e.target.value})} placeholder="0"/>
          </div>
          <div>
            <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Срок (календарных дней)</div>
            <input className="fi" type="number" value={contract.termDays||""} onChange={e=>upd({termDays:e.target.value})} placeholder="25"/>
          </div>
        </div>
      )}
      {/* Работы — только для ремонта и приложений */}
      {hasWorks && <div>
        <div style={{fontSize:12,fontWeight:700,color:"#94a3b8",marginBottom:8}}>РАБОТЫ ({(contract.works||[]).length})</div>
        <div style={{background:"#f8fafc",borderRadius:8,overflow:"hidden",border:"1px solid #e2e8f0"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 70px 55px 80px 80px 30px",padding:"8px 12px",background:"#f8fafc",fontSize:10,color:"#94a3b8",fontWeight:700}}>
            <span>НАИМЕНОВАНИЕ</span><span style={{textAlign:"center"}}>КОЛ-ВО</span><span style={{textAlign:"center"}}>ЕД.</span><span style={{textAlign:"right"}}>ЦЕНА</span><span style={{textAlign:"right"}}>СУММА</span><span/>
          </div>
          {(contract.works||[]).map((w,i)=>(
            <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 70px 55px 80px 80px 30px",gap:4,padding:"6px 12px",borderTop:"1px solid #e2e8f0",alignItems:"center"}}>
              <input value={w.name||""} onChange={e=>{const ws=[...(contract.works||[])];ws[i]={...ws[i],name:e.target.value};upd({works:ws});}}
                style={{background:"transparent",border:"none",color:"#0f172a",fontSize:12,fontFamily:"inherit",padding:0,outline:"none",width:"100%"}}/>
              <input type="number" value={w.quantity||""} onChange={e=>{const ws=[...(contract.works||[])];ws[i]={...ws[i],quantity:parseFloat(e.target.value)||0};upd({works:ws});}}
                style={{background:"#ffffff",border:"1px solid #e2e8f0",color:"#0f172a",fontSize:11,borderRadius:4,padding:"3px 5px",textAlign:"center",fontFamily:"inherit",width:"100%"}}/>
              <input value={w.unit||"м²"} onChange={e=>{const ws=[...(contract.works||[])];ws[i]={...ws[i],unit:e.target.value};upd({works:ws});}}
                style={{background:"#ffffff",border:"1px solid #e2e8f0",color:"#0f172a",fontSize:11,borderRadius:4,padding:"3px 5px",textAlign:"center",fontFamily:"inherit",width:"100%"}}/>
              <input type="number" value={w.price||""} onChange={e=>{const ws=[...(contract.works||[])];ws[i]={...ws[i],price:parseFloat(e.target.value)||0};upd({works:ws});}}
                style={{background:"#ffffff",border:"1px solid #e2e8f0",color:"#0f172a",fontSize:11,borderRadius:4,padding:"3px 5px",textAlign:"right",fontFamily:"inherit",width:"100%"}}/>
              <div style={{fontSize:12,fontWeight:700,color:"#0f172a",textAlign:"right"}}>{fmt(Number(w.quantity)*Number(w.price)||0)}</div>
              <button onClick={()=>{const ws=(contract.works||[]).filter((_,j)=>j!==i);upd({works:ws});}}
                style={{background:"none",border:"none",color:"#dc2626",cursor:"pointer",fontSize:14,padding:0}}>✕</button>
            </div>
          ))}
          <div style={{padding:"8px 12px",borderTop:"1px solid #e2e8f0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <button onClick={()=>upd({works:[...(contract.works||[]),{name:"",quantity:0,unit:"м²",price:0}]})}
              className="btn btn-g" style={{fontSize:11,padding:"5px 12px"}}>
              + Добавить позицию
            </button>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{display:"flex",alignItems:"center",gap:5,fontSize:12,color:"#94a3b8"}}>
                <span>Скидка</span>
                <input type="number" min="0" max="100" value={contract.discount||0}
                  onChange={e=>upd({discount:Math.min(100,Math.max(0,Number(e.target.value)||0))})}
                  style={{width:46,background:"#f8fafc",border:"1px solid #e2e8f0",color:"#0f172a",borderRadius:4,padding:"3px 6px",fontSize:11,textAlign:"right",fontFamily:"inherit",outline:"none"}}/>
                <span>%</span>
              </div>
              {(contract.discount||0)>0 ? (
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:11,color:"#dc2626"}}>− {fmt(Math.round(total*(contract.discount||0)/100))} ₸</div>
                  <div style={{fontWeight:800,fontSize:16,color:"#0f172a"}}>{fmt(Math.round(total*(1-(contract.discount||0)/100)))} ₸</div>
                </div>
              ) : (
                <div style={{fontWeight:800,fontSize:16,color:"#0f172a"}}>{fmt(total)} ₸</div>
              )}
            </div>
          </div>
        </div>
      </div>}
      {/* Способ указания цены — для договоров подряда */}
      {isPod && (
        <div style={{background:"#faf5ff",border:"1px solid #ede9fe",borderRadius:8,padding:"12px 14px"}}>
          <div style={{fontSize:11,color:"#7c3aed",fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:8}}>Способ указания цены</div>
          <div style={{display:"flex",gap:18,flexWrap:"wrap",marginBottom:(contract.priceMode==="lump")?10:0}}>
            <label style={{display:"flex",alignItems:"center",gap:6,fontSize:13,color:"#334155",cursor:"pointer"}}>
              <input type="radio" name="podPriceMode" checked={(contract.priceMode||"perline")==="perline"} onChange={()=>upd({priceMode:"perline"})}/> Цена за каждую позицию (за объём)
            </label>
            <label style={{display:"flex",alignItems:"center",gap:6,fontSize:13,color:"#334155",cursor:"pointer"}}>
              <input type="radio" name="podPriceMode" checked={contract.priceMode==="lump"} onChange={()=>upd({priceMode:"lump"})}/> Одна сумма за все работы
            </label>
          </div>
          {contract.priceMode==="lump" ? (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,alignItems:"end"}}>
              <div>
                <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Общая сумма работ (₸)</div>
                <input className="fi" type="number" value={contract.manualTotal||""} onChange={e=>upd({manualTotal:e.target.value})} placeholder="800000"/>
              </div>
              <div style={{fontSize:12,color:"#64748b",paddingBottom:8}}>В документе цены по позициям не печатаются — только итоговая сумма и перечень работ.</div>
            </div>
          ) : (
            <div style={{fontSize:12,color:"#64748b"}}>Итог считается по строкам: <b style={{color:"#0f172a"}}>{fmt(total)} ₸</b></div>
          )}
        </div>
      )}
      {/* Предоплата для ремонтных договоров */}
      {isRepair && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div>
            <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Предоплата (%)</div>
            <input className="fi" type="number" min="0" max="100" value={contract.advancePercent??30}
              onChange={e=>upd({advancePercent:parseFloat(e.target.value)||0})} placeholder="30"/>
          </div>
          <div>
            <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Сумма предоплаты (₸)</div>
            <div className="fi" style={{background:"#e2e8f0",color:"#334155",fontWeight:600,display:"flex",alignItems:"center"}}>
              {fmt(Math.round(total*(contract.advancePercent??30)/100))} ₸
            </div>
          </div>
        </div>
      )}
      {/* Примечание */}
      <div>
        <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Примечание</div>
        <textarea className="fi" rows={2} value={contract.note||""} onChange={e=>upd({note:e.target.value})} placeholder="Дополнительные условия..."/>
      </div>
      {/* Кнопки */}
      <div style={{display:"flex",gap:8}}>
        <button className="btn btn-o" style={{flex:1}} onClick={onBack}>← Назад</button>
        <div style={{flex:1,display:"flex",flexDirection:"column",gap:4}}>
          <button onClick={()=>onPdf(withStamp)} className="btn btn-o" style={{width:"100%"}}>
            📄 PDF
          </button>
          <div onClick={()=>setWithStamp(p=>!p)} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",justifyContent:"center"}}>
            <div style={{width:28,height:16,borderRadius:8,background:withStamp?"#2563eb":"#e2e8f0",position:"relative",transition:"background .2s",flexShrink:0}}>
              <div style={{position:"absolute",top:2,left:withStamp?12:2,width:12,height:12,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
            </div>
            <span style={{fontSize:10,color:withStamp?"#2563eb":"#94a3b8"}}>С печатью</span>
          </div>
        </div>
        <button onClick={onGDoc} className="btn btn-o" style={{flex:1}}>
          📋 Google Doc
        </button>
      </div>
    </div>
  );
}

// ── ТЕСТ: Редактор сделки (смета + договор в одной карточке) ──
function DealEditor({ deal, clients, contragents, estimate, onUpdate, onBack, onOpenEstimate, onEstimatePdf, onContractPdf, onAddClient, onUpdateClient, role, fmt }) {
  const [withStamp, setWithStamp] = useState(true);
  const [showClientForm, setShowClientForm] = useState(false);
  const upd = (patch) => onUpdate(prev=>({...prev,...patch}));
  const posCount = estimate ? Object.values(estimate.rows||{}).filter(r=>Number(r?.qty)>0).length : 0;
  const fin = Math.round(estimate?.total || 0);
  const readonly = role==="viewer";
  const client = clients.find(c=>c.id===deal.clientId);
  const stIdx = DEAL_STATUSES.findIndex(s=>s.key===(deal.status||"lead"));

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:18}}>←</button>
        <span style={{fontWeight:700,fontSize:15,color:"#0f172a"}}>{client?.name || "Новая сделка"}</span>
      </div>

      {/* ВОРОНКА СТАТУСОВ */}
      <div>
        <div style={{fontSize:11,color:"#94a3b8",marginBottom:6}}>Этап сделки</div>
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
          {DEAL_STATUSES.map((s,i)=>{
            const active = (deal.status||"lead")===s.key;
            const passed = i<stIdx;
            return (
              <button key={s.key} disabled={readonly} onClick={()=>upd({status:s.key})}
                style={{background:active?s.bg:passed?"rgba(5,150,105,.05)":"rgba(0,0,0,.03)",color:active?s.color:passed?"#059669":"#94a3b8",border:`1px solid ${active?s.color:passed?"rgba(5,150,105,.2)":"#e2e8f0"}`,borderRadius:8,padding:"5px 10px",fontSize:11,fontWeight:active?700:600,cursor:readonly?"default":"pointer",fontFamily:"inherit"}}>
                {passed?"✓ ":""}{s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* КЛИЕНТ */}
      <div>
        <div style={{fontSize:12,fontWeight:700,color:"#94a3b8",marginBottom:8}}>КЛИЕНТ</div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <select className="fi" style={{flex:1}} disabled={readonly} value={deal.clientId||""} onChange={e=>upd({clientId:e.target.value})}>
            <option value="">— Выбрать клиента —</option>
            {clients.map(c=>(<option key={c.id} value={c.id}>{c.name}{c.type==="юр"?" (ЮР)":""}</option>))}
          </select>
          {!readonly && <button onClick={()=>{const n=window.prompt("Имя нового клиента:"); if(n!==null) onAddClient(n);}}
            style={{background:"#eff6ff",color:"#059669",border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>+ Новый</button>}
          {deal.clientId && <button onClick={()=>setShowClientForm(s=>!s)}
            style={{background:showClientForm?"#eff6ff":"#f3f4f6",color:"#2563eb",border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>✎ Данные</button>}
        </div>
        {deal.clientId && showClientForm && client && (() => {
          const updCl=(patch)=>onUpdateClient({...client,...patch});
          const isYur=client.type==="юр";
          const fields = isYur
            ? [["ФИО / Название","name"],["Телефон","phone"],["Адрес","address"],["БИН","iin"],["Директор (полностью)","director"],["Директор (кратко)","directorShort"],["Банк","bank"],["БИК","bik"],["ИИК (счёт)","account"],["Почта","email"]]
            : [["ФИО","name"],["Телефон","phone"],["Адрес","address"],["ИИН","iin"],["Документ","doc"]];
          return (
            <div style={{marginTop:8,padding:"12px 14px",background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div><div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Тип</div>
                <select className="fi" value={client.type||"физ"} onChange={e=>updCl({type:e.target.value})}><option value="физ">Физ. лицо</option><option value="юр">Юр. лицо</option></select></div>
              {fields.map(([label,field])=>(
                <div key={field}><div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>{label}</div>
                  <input className="fi" value={client[field]||""} onChange={e=>updCl({[field]:e.target.value})} placeholder={label}/></div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* ОБЪЕКТ */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
        <div><div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Тип объекта</div>
          <select className="fi" disabled={readonly} value={deal.objType||"Вторичка"} onChange={e=>upd({objType:e.target.value})}>
            <option>Вторичка</option><option>Новостройка</option><option>Коммерция</option>
          </select></div>
        <div><div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Адрес объекта</div>
          <input className="fi" disabled={readonly} value={deal.address||""} onChange={e=>upd({address:e.target.value})} placeholder="ул., дом, кв."/></div>
        <div><div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Площадь, м²</div>
          <input className="fi" type="number" disabled={readonly} value={deal.area||""} onChange={e=>upd({area:e.target.value})} placeholder="0"/></div>
      </div>

      {/* СМЕТА (настоящая, с каталогом) */}
      <div>
        <div style={{fontSize:12,fontWeight:700,color:"#94a3b8",marginBottom:8}}>СМЕТА <span style={{fontWeight:500,color:"#cbd5e1"}}>— заполняется через каталог, как в разделе «Сметы»</span></div>
        <div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,padding:"16px 18px"}}>
          {estimate ? (
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
              <div>
                <div style={{fontSize:13,color:"#0f172a",fontWeight:700}}>{posCount} позиций на {fmt(fin)} ₸</div>
                <div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>Смета заполнена через каталог</div>
              </div>
              {!readonly && <button onClick={onOpenEstimate} className="btn btn-g" style={{fontSize:13,padding:"9px 16px"}}>✏️ Редактировать смету</button>}
            </div>
          ) : (
            <div style={{textAlign:"center",padding:"6px 0"}}>
              <div style={{fontSize:13,color:"#64748b",marginBottom:12}}>Смета ещё не заполнена</div>
              {!readonly && <button onClick={onOpenEstimate} className="btn btn-g" style={{fontSize:13,padding:"10px 20px"}}>📋 Заполнить смету (каталог)</button>}
            </div>
          )}
        </div>
      </div>

      {/* ЮР. ЧАСТЬ (для договора) */}
      <div style={{border:"1px solid #fbcfe8",borderRadius:8,padding:"14px 16px",background:"rgba(219,39,119,.03)"}}>
        <div style={{fontSize:12,fontWeight:700,color:"#db2777",marginBottom:10}}>📄 ДАННЫЕ ДЛЯ ДОГОВОРА</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div><div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Номер договора</div>
            <input className="fi" disabled={readonly} value={deal.contractNumber||""} onChange={e=>upd({contractNumber:e.target.value})}/></div>
          <div><div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Дата договора</div>
            <input className="fi" type="date" disabled={readonly} value={deal.contractDate||""} onChange={e=>upd({contractDate:e.target.value})}/></div>
          <div><div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Подрядчик (ТОО)</div>
            <select className="fi" disabled={readonly} value={deal.contragentId||""} onChange={e=>upd({contragentId:e.target.value})}>
              <option value="">— Выбрать ТОО —</option>
              {contragents.map(c=>(<option key={c.id} value={c.id}>{c.name}</option>))}
            </select></div>
          <div><div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Предоплата (%)</div>
            <input className="fi" type="number" min="0" max="100" disabled={readonly} value={deal.advancePercent??30} onChange={e=>upd({advancePercent:parseFloat(e.target.value)||0})}/></div>
        </div>
      </div>

      {/* Примечание */}
      <div><div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Примечание</div>
        <textarea className="fi" rows={2} disabled={readonly} value={deal.note||""} onChange={e=>upd({note:e.target.value})} placeholder="Доп. условия..."/></div>

      {/* Действия: две печати из одних данных */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <button className="btn btn-o" style={{flex:"1 1 120px"}} onClick={onBack}>← Назад</button>
        <button onClick={onEstimatePdf} className="btn btn-o" style={{flex:"1 1 120px"}}>📄 PDF сметы</button>
        <div style={{flex:"1 1 120px",display:"flex",flexDirection:"column",gap:4}}>
          <button onClick={()=>onContractPdf(withStamp)} className="btn btn-o" style={{width:"100%"}}>📄 PDF договора</button>
          <div onClick={()=>setWithStamp(p=>!p)} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",justifyContent:"center"}}>
            <div style={{width:28,height:16,borderRadius:8,background:withStamp?"#db2777":"#e2e8f0",position:"relative",transition:"background .2s",flexShrink:0}}>
              <div style={{position:"absolute",top:2,left:withStamp?12:2,width:12,height:12,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
            </div>
            <span style={{fontSize:10,color:withStamp?"#db2777":"#94a3b8"}}>С печатью</span>
          </div>
        </div>
      </div>
      <div style={{fontSize:10,color:"#94a3b8",textAlign:"center"}}>✓ Сохраняется автоматически</div>
    </div>
  );
}

// ── Балансовый отчёт (Statement of Financial Position) ──
function BalanceSheet({ assetsSections, liabSections, capitalSection, totalAssets, totalLiab, totalCapital }) {
  const bf = n => new Intl.NumberFormat("ru-RU").format(Math.round(n||0));
  const [collapsed, setCollapsed] = useState(()=>new Set());
  const toggle = k => setCollapsed(s=>{ const n=new Set(s); n.has(k)?n.delete(k):n.add(k); return n; });

  const Node = ({ node, depth }) => {
    const kids = node.children||[];
    const has = kids.length>0;
    const open = !collapsed.has(node.key);
    const isSection = depth===0;
    const isInfo = !!node.info; // справочные строки — серые, курсив, не в итогах
    return (
      <>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:10,
          padding:isSection?"9px 0 5px":"4px 0",
          borderBottom:isSection?"none":"1px solid #f4f6f9",
          opacity:isInfo?0.55:1}}>
          <span style={{display:"flex",alignItems:"center",gap:7,paddingLeft:depth*18,minWidth:0}}>
            {has ? <button onClick={()=>toggle(node.key)} style={{flexShrink:0,width:15,height:15,lineHeight:"13px",textAlign:"center",border:"1px solid #cbd5e1",borderRadius:4,background:"#fff",color:"#64748b",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",padding:0}}>{open?"−":"+"}</button>
              : <span style={{width:15,flexShrink:0}}/>}
            <span style={{fontSize:isSection?13.5:12.5,fontWeight:isSection?800:(depth===1?600:400),fontStyle:isInfo?"italic":"normal",color:isSection?"#0f172a":(depth===1?"#334155":"#64748b"),overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{node.label}</span>
          </span>
          <span style={{fontSize:isSection?13.5:12.5,fontWeight:isSection?800:(depth===1?700:500),fontStyle:isInfo?"italic":"normal",color:isInfo?"#94a3b8":isSection?"#0f172a":"#475569",whiteSpace:"nowrap"}}>{bf(node.value)}</span>
        </div>
        {has && open && kids.map(c=><Node key={c.key} node={c} depth={depth+1}/>)}
      </>
    );
  };

  const Bar = ({ left, right, bg, color }) => (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:bg,color,padding:"12px 16px",fontWeight:800,fontSize:14}}>
      <span>{left}</span><span>{bf(right)}</span>
    </div>
  );

  return (
    <div style={{border:"1px solid #e2e8f0",borderRadius:14,overflow:"hidden",background:"#fff"}}>
      <div style={{textAlign:"center",fontSize:12.5,fontWeight:700,color:"#64748b",padding:"12px 0 4px"}}>Активы = Обязательства + Капитал</div>
      <div className="bal-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:0}}>
        {/* Заголовки-бары */}
        <div style={{borderRight:"1px solid #eef2f7"}}><Bar left="" right={totalAssets} bg="#5b9bb0" color="#fff"/></div>
        <div style={{display:"flex"}}>
          <div style={{flex:1}}><Bar left="" right={totalLiab} bg="#e08a7d" color="#fff"/></div>
          <div style={{flex:1.6}}><Bar left="" right={totalCapital} bg="#3a4759" color="#fff"/></div>
        </div>
        {/* ЛЕВО: Активы */}
        <div style={{padding:"14px 18px",borderRight:"1px solid #eef2f7",minWidth:0}}>
          {assetsSections.map(s=><Node key={s.key} node={s} depth={0}/>)}
          <div style={{marginTop:14,paddingTop:12,borderTop:"2px solid #5b9bb0",display:"flex",justifyContent:"space-between",fontWeight:900,fontSize:15,color:"#0f766e"}}>
            <span>Итого активы</span><span>{bf(totalAssets)}</span>
          </div>
        </div>
        {/* ПРАВО: Обязательства + Капитал */}
        <div style={{padding:"14px 18px",minWidth:0}}>
          {liabSections.map(s=><Node key={s.key} node={s} depth={0}/>)}
          <div style={{marginTop:14,paddingTop:12,borderTop:"2px solid #e08a7d",display:"flex",justifyContent:"space-between",fontWeight:900,fontSize:15,color:"#dc2626"}}>
            <span>Итого обязательства</span><span>{bf(totalLiab)}</span>
          </div>
          <div style={{marginTop:18}}>
            <Node node={capitalSection} depth={0}/>
          </div>
          <div style={{marginTop:14,paddingTop:12,borderTop:"2px solid #3a4759",display:"flex",justifyContent:"space-between",fontWeight:900,fontSize:15,color:"#0f172a"}}>
            <span>Обязательства + Капитал</span><span>{bf(totalLiab+totalCapital)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Генерация договора: HTML / PDF / DOCX / WhatsApp ──

// Обёртка авторизации. MainApp монтируется ТОЛЬКО при наличии currentUser,
// поэтому при входе/выходе он целиком монтируется/размонтируется и порядок
// хуков внутри него всегда стабилен (иначе React падал в белый экран).
// ─── ПУБЛИЧНАЯ СТРАНИЦА КП (по ссылке #/kp/<id>, без входа) ───────────────────
const KP_NODE = (id) => "titovstroy-kp-" + id;
function PublicKP({ id }) {
  const [state, setState] = useState("loading"); // loading | notfound | ok
  const [snap, setSnap] = useState(null);
  const [accepted, setAccepted] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [confirming, setConfirming] = useState(false); // подтверждение перед принятием
  // Адаптив: КП свёрстано под «бумажную» ширину; на узком экране вписываем масштабом
  const outerRef = useRef(null), innerRef = useRef(null);
  const [fit, setFit] = useState({ scale: 1, h: 0 });
  const DESIGN_W = 680; // ширина, при которой таблицы КП не обрезаются
  useEffect(() => {
    if (state !== "ok" || !innerRef.current || !outerRef.current) return;
    const calc = () => {
      const ow = outerRef.current ? outerRef.current.clientWidth : 0;
      if (!ow || !innerRef.current) return;
      const s = Math.min(1, ow / DESIGN_W);
      setFit({ scale: s, h: Math.ceil(innerRef.current.scrollHeight * s) });
    };
    calc();
    let ro; try { ro = new ResizeObserver(calc); ro.observe(innerRef.current); } catch {}
    window.addEventListener("resize", calc);
    return () => { try { ro && ro.disconnect(); } catch {} window.removeEventListener("resize", calc); };
  }, [state, snap]);
  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const r = await storage.getResult(KP_NODE(id));
        if (stop) return;
        if (r.status === "found" && r.value) {
          let data = null; try { data = JSON.parse(r.value); } catch {}
          if (data && Array.isArray(data.kpItems)) {
            setSnap(data); setAccepted(!!data.acceptedAt); setState("ok");
            // отметка просмотра — best-effort, остальные поля сохраняем
            try { storage.set(KP_NODE(id), JSON.stringify({ ...data, viewedAt: Date.now(), viewCount: (data.viewCount || 0) + 1 })); } catch {}
            return;
          }
        }
        setState("notfound");
      } catch { if (!stop) setState("notfound"); }
    })();
    return () => { stop = true; };
  }, [id]);

  const accept = async () => {
    if (!snap || accepting || accepted) return;
    setAccepting(true);
    setAccepted(true); // оптимистично: localStorage пишется синхронно, ответа облака не ждём
    try {
      const r = await storage.getResult(KP_NODE(id));
      let cur = snap; try { if (r.status === "found" && r.value) cur = JSON.parse(r.value); } catch {}
      storage.set(KP_NODE(id), JSON.stringify({ ...cur, acceptedAt: Date.now() })); // в фоне, без await
    } catch {}
    setAccepting(false);
  };

  const wrap = (children) => (
    <div style={{minHeight:"100vh",background:"#e9e4da",padding:"calc(16px + env(safe-area-inset-top,0px)) 12px 40px",boxSizing:"border-box",fontFamily:"'Golos Text','Segoe UI',sans-serif"}}>
      <div style={{maxWidth:760,margin:"0 auto"}}>{children}</div>
    </div>
  );

  if (state === "loading") return wrap(<div style={{textAlign:"center",padding:"90px 0",color:"#8a8472"}}>Загрузка предложения…</div>);
  if (state === "notfound") return wrap(
    <div style={{background:"#fff",borderRadius:14,padding:"44px 24px",textAlign:"center"}}>
      <div style={{fontSize:42,marginBottom:10}}>🔍</div>
      <div style={{fontWeight:800,fontSize:18,color:"#1a1a28",marginBottom:6}}>Предложение не найдено</div>
      <div style={{fontSize:13,color:"#888"}}>Ссылка устарела или КП ещё не опубликовано.<br/>Свяжитесь с менеджером TitovStroy: WA +7 707 982 4915</div>
    </div>
  );
  return wrap(
    <>
      <div ref={outerRef} style={{width:"100%",overflow:"hidden",height:fit.h||undefined}}>
        <div ref={innerRef} style={{width:DESIGN_W,transform:`scale(${fit.scale})`,transformOrigin:"top left"}}>
          <div style={{background:"#f5f2ec",borderRadius:14,padding:"22px 20px",boxShadow:"0 8px 30px rgba(26,26,40,.14)"}}>
            <KPContent proj={snap.proj||{}} kpItems={snap.kpItems||[]} fromItems={snap.fromItems||[]} discount={snap.discount||0} discAmt={snap.discAmt||0} final={snap.final||0} note={snap.note||""}/>
          </div>
        </div>
      </div>
      <div style={{marginTop:16,textAlign:"center"}}>
        {accepted ? (
          <div style={{background:"#ecfdf5",border:"1px solid #a7f3d0",borderRadius:12,padding:"16px 18px",color:"#059669",fontWeight:700,fontSize:15}}>✅ Спасибо! Предложение принято — менеджер свяжется с вами.</div>
        ) : confirming ? (
          <div style={{background:"#fff",border:"1px solid #e7e1d4",borderRadius:14,padding:"18px 18px",maxWidth:420,margin:"0 auto",boxShadow:"0 6px 18px rgba(26,26,40,.1)"}}>
            <div style={{fontSize:15,fontWeight:800,color:"#1a1a28",marginBottom:6}}>Принять это предложение?</div>
            <div style={{fontSize:12,color:"#8a8472",marginBottom:14}}>Менеджер получит уведомление, что вы согласны. Это не договор — он свяжется для оформления.</div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setConfirming(false)} disabled={accepting} style={{flex:1,background:"#f1ede4",color:"#6b6452",border:"none",borderRadius:10,padding:"13px 12px",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Отмена</button>
              <button onClick={accept} disabled={accepting} style={{flex:2,background:"#b8904a",color:"#fff",border:"none",borderRadius:10,padding:"13px 12px",fontSize:14,fontWeight:800,cursor:accepting?"default":"pointer",fontFamily:"inherit"}}>{accepting?"Отправляем…":"✅ Да, принять"}</button>
            </div>
          </div>
        ) : (
          <>
            <button onClick={()=>setConfirming(true)} style={{background:"#b8904a",color:"#fff",border:"none",borderRadius:12,padding:"15px 30px",fontSize:16,fontWeight:800,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 6px 18px rgba(184,144,74,.35)",width:"100%",maxWidth:380}}>✅ Принять предложение</button>
            <div style={{marginTop:10,fontSize:11.5,color:"#8a8472"}}>Нажав «Принять», вы подтвердите согласие с предложением. Это не договор — менеджер свяжется для оформления.</div>
          </>
        )}
        <div style={{marginTop:18,fontSize:11.5,color:"#a39e8e"}}>TitovStroy · ремонт и отделка · WA +7 707 982 4915</div>
      </div>
    </>
  );
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const s = localStorage.getItem(SESSION_KEY);
      if (!s) return null;
      const parsed = JSON.parse(s);
      const user = parsed?.user || parsed;
      const savedAt = parsed?.savedAt || Date.now();
      if (!user?.id) return null;
      if (Date.now() - savedAt > 30 * 24 * 60 * 60 * 1000) { localStorage.removeItem(SESSION_KEY); return null; }
      return user;
    } catch(e) { return null; }
  });
  // Скользящее окно сессии: продлеваем срок при каждом открытии приложения
  useEffect(() => {
    if (!currentUser?.id) return;
    try { localStorage.setItem(SESSION_KEY, JSON.stringify({ user: currentUser, savedAt: Date.now() })); } catch(e) {}
  }, [currentUser?.id]);
  // Публичная страница КП по ссылке #/kp/<id> — открывается без входа
  const _kpId = (() => { const m = (typeof window !== "undefined" ? (window.location.hash || "") : "").match(/^#\/kp\/(.+)$/); return m ? decodeURIComponent(m[1]) : null; })();
  if (_kpId) return <PublicKP id={_kpId} />;
  if (!currentUser) return <LoginScreen onLogin={setCurrentUser} />;
  return <MainApp key={currentUser.id} currentUser={currentUser} setCurrentUser={setCurrentUser} />;
}

// Мигрирует ключи rows со старого формата (name) на новый (code).
// Нужно при открытии смет, созданных до перехода на code-ключи.
function migrateRowsToCodeKeys(rows, catalog) {
  const result = {};
  for (const [key, val] of Object.entries(rows || {})) {
    const byCode = catalog.find(w => w.code === key);
    if (byCode) { result[key] = val; continue; }
    const byName = catalog.find(w => w.name === key);
    result[byName ? byName.code : key] = val;
  }
  return result;
}

function MainApp({ currentUser, setCurrentUser }) {
  const [catalogVersion, setCatalogVersion] = useState(0);
  useEffect(() => {
    _onCatalogChange = () => setCatalogVersion(v => v + 1);
    return () => { _onCatalogChange = null; };
  }, []);
  const Gdyn = useMemo(() => groupData(getEffectiveCatalog()), [catalogVersion]);
  const cats = Object.keys(Gdyn);

  // Авторизация (currentUser приходит пропом из обёртки App — здесь компонент
  // монтируется только когда пользователь уже залогинен, поэтому хуки стабильны)
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const doLogout = () => {
    try{localStorage.removeItem(SESSION_KEY);}catch(e){}
    // чистим глобальный кэш карточек прайса, чтобы данные не «протекли» к другому пользователю
    try{ Object.keys(priceCardCache).forEach(k=>delete priceCardCache[k]); }catch(e){}
    setCurrentUser(null); setLogoutConfirm(false);
  };
  const [loadError, setLoadError] = useState(false); // не удалось загрузить из Firebase — сохранение заблокировано
  const [cloudError, setCloudError] = useState(false); // последнее сохранение не ушло в облако (только локально)
  const [listBackups, setListBackups] = useState(null); // {label, items, onRestore}

  // Экраны: "list" | "editor" | "contracts"
  // Руководитель по умолчанию попадает на финансы
  const [screen, setScreen] = useState(currentUser?.role==="manager" ? "finance" : "dashboard");
  const [navHistory, setNavHistory] = useState([]); // стек навигации для кнопки «Назад»

  const _applyNavState = (s) => {
    if (!s) return;
    if (s.screen !== undefined) setScreen(s.screen);
    if (s.financeTab !== undefined) setFinanceTab(s.financeTab);
    setFinFilterCat(s.finFilterCat || "");
    setFinFilterCategory(s.finFilterCategory || "");
    setFinFilterContract(s.finFilterContract || "");
  };

  const navigate = (newScreen, newFinTab, extraState = {}) => {
    const snapshot = { screen, financeTab, finFilterCat, finFilterCategory, finFilterContract };
    setNavHistory(h => [...h, snapshot]);
    // пушим в браузерную историю
    try { window.history.pushState(snapshot, ""); } catch(e) {}
    if (newScreen !== undefined && newScreen !== screen) setScreen(newScreen);
    if (newFinTab !== undefined && newFinTab !== financeTab) setFinanceTab(newFinTab);
    if (extraState.finFilterCat !== undefined) setFinFilterCat(extraState.finFilterCat);
    if (extraState.finFilterCategory !== undefined) setFinFilterCategory(extraState.finFilterCategory);
    if (extraState.finFilterContract !== undefined) setFinFilterContract(extraState.finFilterContract);
  };

  const goBack = () => {
    setNavHistory(h => {
      if (!h.length) return h;
      const prev = h[h.length - 1];
      _applyNavState(prev);
      return h.slice(0, -1);
    });
  };

  // Браузерная кнопка «Назад» — синхронизируем с нашим стеком
  useEffect(() => {
    const onPopState = (e) => {
      if (e.state) {
        _applyNavState(e.state);
        setNavHistory(h => h.length > 0 ? h.slice(0, -1) : h);
      } else {
        goBack();
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Пользователи для выпадающего списка менеджеров
  const [allUsers, setAllUsers] = useState(DEFAULT_USERS);

  // Присутствие { [userId]: lastSeenTs } — пишет каждый, видит только админ
  const [presence, setPresence] = useState({});
  // Сердцебиение: обновляем свою отметку «был в сети» при активности и раз в минуту
  useEffect(() => {
    if (!currentUser?.id) return;
    let stopped = false;
    const touch = async () => {
      if (stopped || document.visibilityState === "hidden") return;
      try {
        const r = await storage.getResult(PRESENCE_KEY);
        let map = {};
        if (r.status === "found" && r.value) { try { map = JSON.parse(r.value) || {}; } catch {} }
        map[currentUser.id] = Date.now();
        await storage.set(PRESENCE_KEY, JSON.stringify(map));
        if (!stopped) setPresence(map);
      } catch {}
    };
    touch();
    const iv = setInterval(touch, 60 * 1000);
    const onVis = () => { if (document.visibilityState === "visible") touch(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { stopped = true; clearInterval(iv); document.removeEventListener("visibilitychange", onVis); };
  }, [currentUser?.id]);
  // Админ периодически подтягивает чужие отметки для отображения
  useEffect(() => {
    if (currentUser?.role !== "admin") return;
    let stopped = false;
    const pull = async () => {
      try {
        const r = await storage.getResult(PRESENCE_KEY);
        if (!stopped && r.status === "found" && r.value) { try { setPresence(JSON.parse(r.value) || {}); } catch {} }
      } catch {}
    };
    pull();
    const iv = setInterval(pull, 60 * 1000);
    return () => { stopped = true; clearInterval(iv); };
  }, [currentUser?.role]);

  // Список смет { id, proj, rows, discount, note, updatedAt, total }
  const [estimates, setEstimates] = useState([]);
  // Ref всегда держит актуальный список — для автосохранения (избегаем устаревшего замыкания)
  const estimatesRef = useRef([]);
  useEffect(() => { estimatesRef.current = estimates; }, [estimates]);
  const [loadingList, setLoadingList] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncStatus, setSyncStatus] = useState("idle"); // idle | saving | saved | error

  // Текущая смета в редакторе
  const [currentId, setCurrentId] = useState(null);
  const [currentParentId, setCurrentParentId] = useState(null);
  const [currentDsNumber, setCurrentDsNumber] = useState(null);
  const [currentObjectId, setCurrentObjectId] = useState(null); // объект, к которому привязана открытая смета
  const [activeCat, setActiveCat] = useState(cats[0]);
  const [activeSub, setActiveSub] = useState(Object.keys(Gdyn[cats[0]]||{})[0]);
  const [rows, setRows] = useState({});
  const [proj, setProj] = useState({...EMPTY_PROJ});
  const [discount, setDiscount] = useState(0);
  const [markup, setMarkup] = useState(0); // внутреннее повышение цены — клиенту не показывается
  const [note, setNote] = useState("");
  const [showKP, setShowKP] = useState(false);
  const [kpLink, setKpLink] = useState("");        // онлайн-КП: ссылка для клиента
  const [kpPublishing, setKpPublishing] = useState(false);
  const [kpMsg, setKpMsg] = useState("");
  const [kpStat, setKpStat] = useState("");        // статус: открыл/принял ли клиент
  const [kpStale, setKpStale] = useState(false);   // смета изменена после публикации ссылки
  // При открытии модалки КП — подтянуть ссылку и статус, если КП уже публиковалось
  useEffect(() => {
    if (!showKP) return;
    setKpLink(""); setKpStat(""); setKpMsg(""); setKpStale(false); // сброс от предыдущей сметы (всё строго своей сметы)
    if (!currentId) return;
    let stop = false;
    (async () => {
      try {
        const r = await storage.getResult("titovstroy-kp-"+currentId);
        if (stop || !(r.status==="found" && r.value)) return;
        let d = {}; try { d = JSON.parse(r.value); } catch {}
        if (d.publishedAt) {
          setKpLink(window.location.origin + window.location.pathname + "#/kp/" + currentId);
          setKpMsg("Ссылка активна");
          setKpStat(kpStatusText(d));
          // смета изменена после публикации? (сравниваем итог/позиции/скидку со снимком)
          setKpStale(d.final !== final || (d.kpItems||[]).length !== kpItems.length || d.discount !== discount);
        }
      } catch {}
    })();
    return () => { stop = true; };
  }, [showKP, currentId]);
  const [editPrices, setEditPrices] = useState(false);
  const [editingPriceRow, setEditingPriceRow] = useState(null);
  const [showFinancial, setShowFinancial] = useState(true);
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [estStatus, setEstStatus] = useState("new");
  const [estSentAt, setEstSentAt] = useState("");
  const [estComment, setEstComment] = useState("");
  const [showStats, setShowStats] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [statsPeriod, setStatsPeriod] = useState("month"); // all | month | week | 3month
  const [statsManager, setStatsManager] = useState(""); // "" = все
  const [statsDateFrom, setStatsDateFrom] = useState("");
  const [statsDateTo, setStatsDateTo] = useState("");
  // ── Договоры ──
  const [contracts, setContracts] = useState([]);
  const contractsRef = useRef([]);
  useEffect(() => { contractsRef.current = contracts; }, [contracts]);
  const [contractClients, setContractClients] = useState([]);
  const clientsRef = useRef([]);
  useEffect(() => { clientsRef.current = contractClients; }, [contractClients]);
  const [contragents, setContragents] = useState([{id:"1",name:"ТОО TITOVSTROY",bin:"231040002769",bank:'АО "Kaspi Bank"',bik:"CASPKZKA",account:"KZ38722S000030058973",director:"Титов В.Е.",phone:"8707 667 8766",email:"titovstroy@mail.ru",address:"Казахстан, район им.Казыбек би, улица Кирпичная, дом 8г"}]);
  const contragentsRef = useRef([]);
  useEffect(() => { contragentsRef.current = contragents; }, [contragents]);
  const _contractsLoaded = useRef(false);
  const [contractTab, setContractTab] = useState("list"); // list | editor | clients | contragents
  const [currentContract, setCurrentContract] = useState(null);

  // Объекты
  const [objects, setObjects] = useState([]);
  const objectsRef = useRef([]);
  useEffect(() => { objectsRef.current = objects; }, [objects]);

  // Производственные карточки объектов (раздел «Производство»)
  const [productions, setProductions] = useState([]);
  const productionsRef = useRef([]);
  useEffect(() => { productionsRef.current = productions; }, [productions]);

  // Отчёты по объектам (АВР, форма Р-1)
  const [reports, setReports] = useState([]);
  const reportsRef = useRef([]);
  useEffect(() => { reportsRef.current = reports; }, [reports]);
  const [avrModal, setAvrModal] = useState(null); // черновик акта в построителе

  // Подрядчики (рабочие) и договоры подряда с ними
  const [workers, setWorkers] = useState([]);
  const workersRef = useRef([]);
  useEffect(() => { workersRef.current = workers; }, [workers]);
  const [podryads, setPodryads] = useState([]);
  const podryadsRef = useRef([]);
  useEffect(() => { podryadsRef.current = podryads; }, [podryads]);
  const [podryadModal, setPodryadModal] = useState(null); // черновик договора/приложения подряда
  const [newDocMenu, setNewDocMenu] = useState(false); // выпадающий выбор типа документа на «+ Новый»

  // ── ФИНАНСЫ ──
  const [financeTx, setFinanceTx] = useState([]);
  const financeTxRef = useRef([]);
  useEffect(() => { financeTxRef.current = financeTx; }, [financeTx]);
  const [financeMeta, setFinanceMeta] = useState(DEFAULT_FIN_META);
  const financeMetaRef = useRef(DEFAULT_FIN_META);
  useEffect(() => { financeMetaRef.current = financeMeta; }, [financeMeta]);
  const _financeLoaded = useRef(false);
  const [financeTab, setFinanceTab] = useState("dashboard"); // dashboard | ops | ref
  const [finPeriod, setFinPeriod] = useState("month"); // all | month | 3month | year | custom
  const [finFrom, setFinFrom] = useState("");
  const [finTo, setFinTo] = useState("");
  const [finFilterType, setFinFilterType] = useState("");
  const [finFilterAccount, setFinFilterAccount] = useState("");
  const [finFilterCategory, setFinFilterCategory] = useState("");
  const [finFilterContract, setFinFilterContract] = useState(""); // фильтр по проекту/договору
  const [finFilterCat, setFinFilterCat] = useState("");           // фильтр по категории (из ДДС/ОПУ)
  const [finSearch, setFinSearch] = useState("");
  const [finAmtMin, setFinAmtMin] = useState("");
  const [finAmtMax, setFinAmtMax] = useState("");
  const [finTxModal, setFinTxModal] = useState(null); // редактируемая/новая транзакция
  const [finCatSearch, setFinCatSearch] = useState(""); // поиск в поле статьи
  const [finCatOpen, setFinCatOpen] = useState(false);  // дропдаун статьи открыт
  const [finTxProjSearch, setFinTxProjSearch] = useState(""); // поиск в поле проекта (в модале операции)
  const [finTxProjOpen, setFinTxProjOpen] = useState(false);  // дропдаун проекта открыт (в модале операции)
  const [finTxTrash, setFinTxTrash] = useState(false); // корзина операций
  const [finImportBusy, setFinImportBusy] = useState(false);
  const [finProjects, setFinProjects] = useState([]);
  const finProjectsRef = useRef([]);
  useEffect(() => { finProjectsRef.current = finProjects; }, [finProjects]);
  const [finProjModal, setFinProjModal] = useState(null);
  const [finProjSearch, setFinProjSearch] = useState("");
  const [finProjStatusFilter, setFinProjStatusFilter] = useState("в работе");
  const [finProjCatFilter, setFinProjCatFilter] = useState("");

  // ── Связь фин-проектов с объектами (по номеру договора) ──
  // нормализация номера договора для сопоставления: убираем пробелы, № и # — чтобы «№0919#153» и «0919#153» считались одним
  const normCN = (s) => String(s||"").trim().toLowerCase().replace(/[\s№#]/g,"");
  // map: нормализованный № договора → { object, contract, planTotal, planCost, planMargin, planMarginPct }
  const contractLinkMap = useMemo(() => {
    const m = {};
    // справочник для расчёта себестоимости сметы
    const wl = new Map();
    for (const w of getEffectiveCatalog()) { if(w?.name) wl.set(w.name,w); if(w?.code) wl.set(w.code,w); }
    const estCostOf = (e) => {
      let cost = 0;
      for (const [key,r] of Object.entries(e.rows||{})) { const qty=Number(r?.qty||0); if(!qty) continue; const w=wl.get(key); if(w) cost+=rowCostPerUnit(r,w)*qty; }
      return cost;
    };
    // агрегаты смет по объекту (план: выручка + себестоимость)
    const estAgg = {}; // objectId -> {total, cost}
    for (const e of estimates) { if(!e.objectId) continue; const a=estAgg[e.objectId]||(estAgg[e.objectId]={total:0,cost:0}); a.total+=Number(e.total)||0; a.cost+=estCostOf(e); }
    for (const c of contracts) {
      const num = normCN(c.number);
      if (!num) continue;
      const obj = c.objectId ? objects.find(o=>o.id===c.objectId) : null;
      const conTotal = (c.works||[]).reduce((s,w)=>s+((Number(w.quantity)||0)*(Number(w.price)||0)),0);
      const agg = obj ? estAgg[obj.id] : null;
      const planTotal = conTotal>0 ? conTotal : (agg ? agg.total : 0);
      const planCost = agg ? agg.cost : 0;
      const planMargin = planTotal>0 ? planTotal - planCost : 0;
      const planMarginPct = planTotal>0 ? Math.round(planMargin/planTotal*100) : null;
      if (!m[num]) m[num] = { object:obj, contract:c, planTotal, planCost, planMargin, planMarginPct };
    }
    return m;
  }, [contracts, objects, estimates, catalogVersion]);
  const linkForContractNo = (cn) => contractLinkMap[normCN(cn)] || null;
  // открыть объект из финансов
  const openObjectFromFinance = (obj) => { if(!obj) return; setCurrentObject({...obj}); setObjectTab("workspace"); setScreen("objects"); };
  // построить черновик фин-проекта из объекта+договора
  const finProjDraftFromObject = (obj, contract) => {
    const conTotal = (contract?.works||[]).reduce((s,w)=>s+((Number(w.quantity)||0)*(Number(w.price)||0)),0);
    return {
      id:"", contractNo: contract?.number||"",
      client: obj?.clientType==="юр" ? "Юр лицо" : "Физ лицо",
      category: obj?.objType || "Вторичка",
      description: [obj?.clientName, obj?.address, obj?.clientPhone].filter(Boolean).join(" | "),
      budget: conTotal||0,
      status:"активен", rawStatus:"в работе",
      createdAt: contract?.date || new Date().toISOString().slice(0,10),
      closedAt:"", b24:"нет",
      contractSigned: contract ? "да" : "нет",
      avr:"нет", comment:"", objectId: obj?.id||"",
    };
  };
  // завести проект в финансах из объекта (или открыть существующий)
  const startFinProjFromObject = (obj, contract) => {
    const existing = contract ? finProjectsRef.current.find(p=>normCN(p.contractNo)===normCN(contract.number)) : null;
    setScreen("finance"); setFinanceTab("projects");
    setFinProjModal(existing ? {...existing} : finProjDraftFromObject(obj, contract));
  };

  const [objectTab, setObjectTab] = useState("list"); // list | workspace
  const [objInfoCollapsed, setObjInfoCollapsed] = useState(false); // свёрнут ли блок инфо клиента/объекта
  const [currentObject, setCurrentObject] = useState(null);
  const [objectFilterStatus, setObjectFilterStatus] = useState("approval");
  const [objectFilterType, setObjectFilterType] = useState("");
  const [objectFilterManager, setObjectFilterManager] = useState("");
  const [objectDateSort, setObjectDateSort] = useState("new"); // new = сначала новые, old = сначала старые
  const [objectDateFrom, setObjectDateFrom] = useState("");
  const [objectDateTo, setObjectDateTo] = useState("");
  const [objectSearch, setObjectSearch] = useState("");
  const debouncedObjectSearch = useDebounce(objectSearch, 200);
  const [objectReturnId, setObjectReturnId] = useState(null); // id объекта, куда вернуться из редактора сметы/договора
  // legacy deals ref (не используется, но нужен для saveDeals ниже)
  const [deals, setDeals] = useState([]);
  const dealsRef = useRef([]);
  useEffect(() => { dealsRef.current = deals; }, [deals]);
  const [dealTab, setDealTab] = useState("list");
  const [currentDeal, setCurrentDeal] = useState(null);
  const [dealFilterStatus, setDealFilterStatus] = useState("");
  const [dealReturnId, setDealReturnId] = useState(null);
  const [contractClientsTab, setContractClientsTab] = useState("list");
  const [sideCollapsed, setSideCollapsed] = useState(false);
  const [stampsBase64, setStampsBase64] = useState({});
  useEffect(()=>{
    let cancelled = false;
    ["stamp.jpg","stamp2.jpg"].forEach(file=>{
      fetch("/"+file).then(r=>r.blob()).then(blob=>{
        if(cancelled) return;
        const reader = new FileReader();
        reader.onload = e => { if(!cancelled) setStampsBase64(prev=>({...prev,[file]:e.target.result})); };
        reader.readAsDataURL(blob);
      }).catch(()=>{});
    });
    return ()=>{ cancelled = true; };
  },[]);
  const stampBase64 = stampsBase64["stamp.jpg"] || "";
  const [listSearch, setListSearch] = useState("");
  const [backupsModal, setBackupsModal] = useState(null); // null | массив снимков
  const [wsBackupsModal, setWsBackupsModal] = useState(null); // единый бэкап объектов (со сметами/договорами)
  const [importModal, setImportModal] = useState(false);
  const [importText, setImportText] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [listFilter, setListFilter] = useState(""); // "" | "Вторичка" | "Новостройка" | "Коммерция"
  const [listFilterManager, setListFilterManager] = useState(""); // "" = все
  const [listFilterStatus, setListFilterStatus] = useState(""); // "" = все статусы
  const [contractFilterStatus, setContractFilterStatus] = useState(""); // "" = все статусы договоров
  const [listSort, setListSort] = useState("date"); // "date" | "sum" | "name"
  const debouncedListSearch = useDebounce(listSearch, 200);

  const filteredObjects = useMemo(() => {
    const q = debouncedObjectSearch.toLowerCase().trim();
    return [...objects]
      .filter(o=>!o.deletedAt) // скрываем мягко-удалённые из основного списка
      .filter(o=>{
        if(objectFilterStatus && (o.status||"new")!==objectFilterStatus) return false;
        if(objectFilterType && (o.objType||"Вторичка")!==objectFilterType) return false;
        if(objectFilterManager && (o.manager||"")!==objectFilterManager) return false;
        if(objectDateFrom && (o.createdAt||0) < new Date(objectDateFrom).getTime()) return false;
        if(objectDateTo && (o.createdAt||0) > new Date(objectDateTo).getTime()+86399999) return false;
        if(q && !((o.clientName||"").toLowerCase().includes(q)||(o.address||"").toLowerCase().includes(q)||(o.clientPhone||"").toLowerCase().includes(q))) return false;
        return true;
      })
      .sort((a,b)=>{ const da=a.createdAt||0, db=b.createdAt||0; return objectDateSort==="old" ? da-db : db-da; });
  }, [objects, objectFilterStatus, objectFilterType, objectFilterManager, objectDateSort, objectDateFrom, objectDateTo, debouncedObjectSearch]);

  // Только «живые» (не удалённые) объекты — используется в дашборде, аналитике и всех расчётах
  const liveObjects = useMemo(() => objects.filter(o=>!o.deletedAt), [objects]);

  // Объекты «в работе» для раздела «Производство»: только те, по которым заведён
  // проект в Финансах (связь по objectId, либо по номеру договора).
  // Сопоставить финпроект с объектом: по objectId → договору → имени/адресу/телефону (двунаправленно)
  const matchFpToObject = useCallback((p) => {
    if (p.objectId) { const o = liveObjects.find(x => x.id === p.objectId); if (o) return o; }
    const link = p.contractNo ? contractLinkMap[normCN(p.contractNo)] : null;
    if (link?.object) return link.object;
    const _n = s => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
    const hay = _n((p.description || "") + " " + (p.client || "") + " " + (p.comment || ""));
    const hayDigits = hay.replace(/\D/g, "");
    const pd = _n(p.description);
    return liveObjects.find(o => {
      const nm = _n(o.clientName), ad = _n(o.address), ph = String(o.clientPhone || "").replace(/\D/g, "");
      if (nm && nm.length >= 3 && hay.includes(nm)) return true;            // описание содержит имя объекта
      if (ad && ad.length >= 4 && hay.includes(ad)) return true;            // описание содержит адрес объекта
      if (ph && ph.length >= 6 && hayDigits.includes(ph)) return true;      // телефон
      if (pd && pd.length >= 4 && (nm.includes(pd) || ad.includes(pd))) return true; // имя/адрес объекта содержит описание проекта
      return false;
    }) || null;
  }, [liveObjects, contractLinkMap]);

  const productionObjects = useMemo(() => {
    const ids = new Set();
    for (const p of (finProjects || [])) {
      if ((p.rawStatus || p.status) === "отменен") continue; // отменённые не показываем
      const o = matchFpToObject(p);
      if (o) ids.add(o.id);
    }
    // объекты, по которым уже создана карточка производства (в т.ч. добавленные вручную)
    const prodIds = new Set((productions || []).map(p => p.objectId));
    // «В работе» = договор подписан (статус «Заключён») / есть фин-проект / есть карточка
    return liveObjects.filter(o => o.status === "signed" || ids.has(o.id) || prodIds.has(o.id));
  }, [liveObjects, finProjects, productions, matchFpToObject]);

  // Проекты из Финансов, которые НЕ привязаны ни к одному объекту — их тоже можно
  // добавить в производство вручную (разовая миграция текущих работ из Google-таблиц).
  const unlinkedFinProjects = useMemo(() => {
    return (finProjects || []).filter(p => (p.rawStatus || p.status) !== "отменен" && !matchFpToObject(p));
  }, [finProjects, matchFpToObject]);

  // Мемоизированный фильтрованный/сортированный список смет
  const filteredEstimates = useMemo(() => {
    const q = debouncedListSearch.toLowerCase().trim();
    const objIds = new Set(objects.map(o=>o.id));
    return estimates
      // показываем сметы без объекта ИЛИ привязанные к НЕсуществующему объекту (сироты после восстановления)
      .filter(e => !e.objectId || !objIds.has(e.objectId))
      .filter(e => !listFilter || e.proj?.type === listFilter)
      .filter(e => !listFilterManager || (e.proj?.manager||e.createdBy||"") === listFilterManager)
      .filter(e => !listFilterStatus || (e.status||"new") === listFilterStatus)
      .filter(e => !q || [e.proj?.name,e.proj?.address,e.proj?.phone,e.proj?.manager].some(v=>v&&v.toLowerCase().includes(q)))
      .slice()
      .sort((a,b) => {
        if (listSort==="sum") return (b.total||0)-(a.total||0);
        if (listSort==="name") return (a.proj?.name||"").localeCompare(b.proj?.name||"","ru");
        return (b.updatedAt||0)-(a.updatedAt||0);
      });
  }, [estimates, objects, listFilter, listFilterManager, listFilterStatus, debouncedListSearch, listSort]);

  // Когда каталог меняется — синхронизируем activeCat/activeSub
  useEffect(() => {
    if (!Gdyn[activeCat]) {
      const firstCat = Object.keys(Gdyn)[0] || "";
      setActiveCat(firstCat);
      setActiveSub(Object.keys(Gdyn[firstCat]||{})[0] || "");
    } else {
      const subsNow = Object.keys(Gdyn[activeCat]||{});
      if (!subsNow.includes(activeSub)) {
        setActiveSub(subsNow[0] || "");
      }
    }
  }, [catalogVersion]);

  // ── Мини-журнал изменений сметы ──
  // Логируем: создание, смену статуса (всегда), и «редактировал» (коалесцируем 1 запись на 10 мин).
  const _appendHistory = useCallback((exists, updated) => {
    const hist = Array.isArray(exists?.history) ? exists.history.map(h => ({ ...h })) : [];
    const now = Date.now();
    const by = currentUser?.name || "";
    const total = Math.round(updated.total || 0);
    const push = (action) => hist.push({ ts: now, by, action, total });
    if (!exists) { push("создал смету"); return hist.slice(-60); }
    if ((exists.status || "new") !== (updated.status || "new")) {
      const lbl = (STATUSES.find(s => s.key === (updated.status || "new")) || {}).label || updated.status;
      push(`статус → «${lbl}»`);
    }
    const last = hist[hist.length - 1];
    const recentEdit = last && last.by === by && last.action === "редактировал" && (now - last.ts) < 10 * 60 * 1000;
    if (!recentEdit) push("редактировал");
    else { last.ts = now; last.total = total; }
    return hist.slice(-60);
  }, [currentUser]);

  // Автосохранение сметы
  const _autoSaveRef = useRef(null);
  useEffect(() => {
    if (!currentId) return;
    if (_autoSaveRef.current) clearTimeout(_autoSaveRef.current);
    _autoSaveRef.current = setTimeout(() => {
      const cur = estimatesRef.current;
      const exists = cur.find(e => e.id === currentId);
      // ЗАЩИТА: не затирать смету с позициями пустой версией (если не явный сброс)
      if (exists && countFilled(exists.rows) > 0 && countFilled(rows) === 0 && !_allowEmptySave.current) {
        return;
      }
      // parentId/dsNumber берём из стейта (новая ДС) ИЛИ из сохранённой записи (открытая ДС). Игнорируем самоссылку.
      const _ep = exists?.parentId && exists.parentId!==currentId ? exists.parentId : null;
      const pId = currentParentId || _ep;
      const dsN = pId ? (currentDsNumber || exists?.dsNumber) : null;
      const objId = currentObjectId || exists?.objectId || null;
      const updated = { id:currentId, proj, rows, discount, markup, note, status:estStatus, sentAt: estStatus==="sent" ? (estSentAt||exists?.sentAt||new Date().toISOString().slice(0,10)) : (exists?.sentAt||null), comment:estComment, createdAt:exists?.createdAt||Date.now(), createdBy:exists?.createdBy||currentUser?.name, updatedAt:Date.now(), updatedBy:currentUser?.name, total:final, ...(objId ? {objectId:objId} : {}), ...(pId ? {parentId:pId, dsNumber:dsN} : {}) };
      updated.history = _appendHistory(exists, updated);
      const newList = exists ? cur.map(e=>e.id===currentId?updated:e) : [updated,...cur];
      setEstimates(newList);
      saveEstimates(newList);
    }, 1500);
    return () => clearTimeout(_autoSaveRef.current);
  }, [rows, proj, discount, markup, note, estStatus, estSentAt, estComment]);

  // ── Загрузка списка смет из shared storage ──
  const loadContracts = useCallback(async () => {
    let ok = true;
    try {
      const [cr, cl, ca, ob, pd, rp, wk, py] = await Promise.all([storage.getResult(CONTRACTS_KEY), storage.getResult(CLIENTS_KEY), storage.getResult(CONTRAGENTS_KEY), storage.getResult(OBJECTS_KEY), storage.getResult(PRODUCTIONS_KEY), storage.getResult(REPORTS_KEY), storage.getResult(WORKERS_KEY), storage.getResult(PODRYADS_KEY)]);
      // Договоры
      if (cr.status === "found" && cr.value) { try { const p = JSON.parse(cr.value); if (Array.isArray(p)) { setContracts(p); contractsRef.current = p; } } catch {} }
      else if (cr.status === "empty") { setContracts([]); contractsRef.current = []; }
      else { ok = false; } // unavailable — не трогаем
      // Объекты
      if (ob.status === "found" && ob.value) { try { const p = JSON.parse(ob.value); if (Array.isArray(p)) { setObjects(p); objectsRef.current = p; } } catch {} }
      else if (ob.status === "empty") { setObjects([]); objectsRef.current = []; }
      else { ok = false; }
      // Производственные карточки
      if (pd.status === "found" && pd.value) { try { const p = JSON.parse(pd.value); if (Array.isArray(p)) { setProductions(p); productionsRef.current = p; } } catch {} }
      else if (pd.status === "empty") { setProductions([]); productionsRef.current = []; }
      // Отчёты (АВР)
      if (rp.status === "found" && rp.value) { try { const p = JSON.parse(rp.value); if (Array.isArray(p)) { setReports(p); reportsRef.current = p; } } catch {} }
      else if (rp.status === "empty") { setReports([]); reportsRef.current = []; }
      // Подрядчики
      if (wk.status === "found" && wk.value) { try { const p = JSON.parse(wk.value); if (Array.isArray(p)) { setWorkers(p); workersRef.current = p; } } catch {} }
      else if (wk.status === "empty") { setWorkers([]); workersRef.current = []; }
      // Договоры подряда
      if (py.status === "found" && py.value) { try { const p = JSON.parse(py.value); if (Array.isArray(p)) { setPodryads(p); podryadsRef.current = p; } } catch {} }
      else if (py.status === "empty") { setPodryads([]); podryadsRef.current = []; }
      // Клиенты
      if (cl.status === "found" && cl.value) { try { const p = JSON.parse(cl.value); if (Array.isArray(p)) { const cls = p.map(c=>({...c, createdAt:c.createdAt||Date.now()})); setContractClients(cls); clientsRef.current = cls; } } catch {} }
      else if (cl.status === "empty") { setContractClients([]); clientsRef.current = []; }
      else { ok = false; }
      // Контрагенты
      if (ca.status === "found" && ca.value) { try { const p = JSON.parse(ca.value); if (Array.isArray(p)) { setContragents(p); contragentsRef.current = p; } } catch {} }
      // контрагенты: если пусто/недоступно — оставляем дефолтный, не трогаем
    } catch(e) { console.error(e); ok = false; }
    _contractsLoaded.current = ok;
  }, []);

  const saveContracts = async (list, opts = {}) => {
    const r = await saveListProtected(CONTRACTS_KEY, CONTRACTS_BACKUPS_KEY, list, (fl)=>{ contractsRef.current = fl; setContracts(fl); }, { loadedRef: _contractsLoaded, ...opts });
    return r;
  };
  const saveContractClients = async (list, opts = {}) => {
    const patched = list.map(c=>({...c, createdAt: c.createdAt||Date.now()}));
    const r = await saveListProtected(CLIENTS_KEY, CLIENTS_BACKUPS_KEY, patched, (fl)=>{ clientsRef.current = fl; setContractClients(fl); }, { loadedRef: _contractsLoaded, ...opts });
    return r;
  };
  const saveContragents = async (list, opts = {}) => {
    const r = await saveListProtected(CONTRAGENTS_KEY, CONTRAGENTS_BACKUPS_KEY, list, (fl)=>{ contragentsRef.current = fl; setContragents(fl); }, { loadedRef: _contractsLoaded, ...opts });
    return r;
  };
  const saveDeals = async (list, opts = {}) => {
    const r = await saveListProtected(DEALS_KEY, DEALS_BACKUPS_KEY, list, (fl)=>{ dealsRef.current = fl; setDeals(fl); }, { loadedRef: _contractsLoaded, ...opts });
    return r;
  };
  const saveObjects = async (list, opts = {}) => {
    const r = await saveListProtected(OBJECTS_KEY, OBJECTS_BACKUPS_KEY, list, (fl)=>{ objectsRef.current = fl; setObjects(fl); }, { loadedRef: _contractsLoaded, ...opts });
    return r;
  };
  const saveProductions = async (list, opts = {}) => {
    return await saveListProtected(PRODUCTIONS_KEY, PRODUCTIONS_BACKUPS_KEY, list, (fl)=>{ productionsRef.current = fl; setProductions(fl); }, { loadedRef: _contractsLoaded, ...opts });
  };
  const saveReports = async (list, opts = {}) => {
    return await saveListProtected(REPORTS_KEY, REPORTS_BACKUPS_KEY, list, (fl)=>{ reportsRef.current = fl; setReports(fl); }, { loadedRef: _contractsLoaded, ...opts });
  };
  const saveWorkers = async (list, opts = {}) => {
    return await saveListProtected(WORKERS_KEY, WORKERS_BACKUPS_KEY, list, (fl)=>{ workersRef.current = fl; setWorkers(fl); }, { loadedRef: _contractsLoaded, ...opts });
  };
  const savePodryads = async (list, opts = {}) => {
    return await saveListProtected(PODRYADS_KEY, PODRYADS_BACKUPS_KEY, list, (fl)=>{ podryadsRef.current = fl; setPodryads(fl); }, { loadedRef: _contractsLoaded, ...opts });
  };

  // ── АВР (форма Р-1): построитель и печать ──
  // Собрать строки акта из позиций сметы (цена с учётом наценки, без НДС)
  const buildAvrLinesFromEst = (est) => {
    const cat = getEffectiveCatalog();
    const lk = new Map();
    for (const w of cat) { if (w?.name) lk.set(w.name, w); if (w?.code) lk.set(w.code, w); }
    const mm = 1 + (Number(est.markup) || 0) / 100;
    const lines = [];
    for (const [key, r] of Object.entries(est.rows || {})) {
      const qty = Number(r?.qty || 0); if (qty <= 0) continue;
      const w = lk.get(key); if (!w) continue;
      let price;
      if (r.manualPrice !== undefined && r.manualPrice !== "") { const n = Number(r.manualPrice); price = isNaN(n) ? 0 : n; }
      else { const cpxPct = r.cpxPct !== undefined ? Number(r.cpxPct) : undefined; price = getPrice(w, qty, r.complexity || "std", cpxPct) || 0; }
      if (!price) continue; // позиции «цена от» в акт не берём
      const name = r.manualName !== undefined ? r.manualName : w.name;
      const unit = r.manualUnit !== undefined ? r.manualUnit : w.unit;
      lines.push({ cat: w.cat || "", name, unit: unit || "", qty, price: Math.round(price * mm), included: true, doneQty: qty });
    }
    return lines;
  };
  // Открыть построитель акта по объекту и его смете
  const openAvrBuilder = (obj, est) => {
    const lines = buildAvrLinesFromEst(est);
    if (lines.length === 0) { alert("В этой смете нет позиций с точной ценой для акта."); return; }
    const cons = contractsRef.current.filter(c => c.objectId === obj.id && (c.type || "repair_fiz") !== "annex").sort((a, b) => (b.id || 0) - (a.id || 0));
    const con = cons[0];
    const existingNo = reportsRef.current.filter(r => r.objectId === obj.id).length + 1;
    setAvrModal({
      id: null, objectId: obj.id, estId: est.id,
      clientName: obj.clientName || "", clientType: obj.clientType || "физ",
      clientIin: obj.clientIin || "", address: obj.address || "",
      actNo: String(existingNo), actDate: new Date().toISOString().slice(0, 10),
      contractNo: con?.number || "", contractDate: con?.date || "",
      withStamp: false, lines,
    });
  };
  // HTML формы Р-1 (без НДС)
  const buildAvrHtml = (m) => {
    const esc = s => String(s == null ? "" : s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    const P = l => Number(l.price) || 0, Q = l => Number(l.doneQty) || 0;
    const items = (m.lines || []).filter(l => l.included && Q(l) > 0);
    const money = n => Math.round(Number(n) || 0).toLocaleString("ru-RU");
    const total = items.reduce((s, l) => s + Math.round(P(l) * Q(l)), 0);
    const dateStr = m.actDate ? new Date(m.actDate).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }) : "";
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
<title>АВР №${esc(m.actNo)}</title>
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
  const saveAndPrintAvr = async (m) => {
    const items = (m.lines || []).filter(l => l.included && Number(l.doneQty) > 0);
    if (items.length === 0) { alert("Отметьте хотя бы одну позицию с количеством."); return; }
    const total = items.reduce((s, l) => s + Math.round((Number(l.price) || 0) * (Number(l.doneQty) || 0)), 0);
    const id = m.id || genId();
    const record = {
      id, objectId: m.objectId, estId: m.estId, type: "avr",
      actNo: m.actNo || "", actDate: m.actDate || new Date().toISOString().slice(0, 10),
      contractNo: m.contractNo || "", contractDate: m.contractDate || "",
      clientName: m.clientName || "", clientType: m.clientType || "физ", clientIin: m.clientIin || "", address: m.address || "",
      withStamp: !!m.withStamp,
      lines: items.map(l => ({ name: l.name, unit: l.unit, price: Number(l.price) || 0, doneQty: Number(l.doneQty) || 0 })),
      total, createdAt: m.createdAt || Date.now(), updatedAt: Date.now(), createdBy: currentUser?.name || "",
    };
    // merge (replace:false) — акт не перезатирает облако, акты с других устройств сохраняются
    await saveReports([record], { replace: false });
    setAvrModal(null);
    openOrPrintHtml(buildAvrHtml({ ...m, lines: items }));
  };

  // ════════════ ДОГОВОР ПОДРЯДА С РАБОЧИМИ (Прочие документы) ════════════
  // Сумма раздела: ручная сумма за раздел ИЛИ сумма позиций (кол-во × цена)
  const podSectionSum = (sec) => {
    if (sec.lumpSum !== "" && sec.lumpSum != null) return Number(sec.lumpSum) || 0;
    return (sec.items || []).reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.qty) || 0), 0);
  };
  const podTotal = (m) => {
    if (m.manualTotal !== "" && m.manualTotal != null) return Number(m.manualTotal) || 0;
    return (m.sections || []).reduce((s, sec) => s + podSectionSum(sec), 0);
  };
  // Открыть построитель договора подряда / приложения
  const openPodryadBuilder = ({ kind = "podryad", obj = null, est = null, mainNumber = "", mainDate = "", preset = null } = {}) => {
    if (preset) { setPodryadModal({ ...preset, sections: (preset.sections || []).map(s => ({ ...s, items: (s.items || []).map(i => ({ ...i })) })) }); return; }
    let sections;
    if (est) {
      const lines = buildAvrLinesFromEst(est);
      sections = [{ title: "", lumpSum: "", items: lines.map(l => ({ name: l.name, qty: l.qty, unit: l.unit, price: "" })) }];
    } else {
      sections = [{ title: "", lumpSum: "", items: [{ name: "", qty: "", unit: "", price: "" }] }];
    }
    const podCount = podryadsRef.current.filter(p => p.kind === "podryad").length;
    const annexCount = podryadsRef.current.filter(p => p.kind === "annex").length;
    setPodryadModal({
      id: null, kind,
      number: kind === "podryad" ? String(1012 + podCount) : (mainNumber || ""),
      annexNo: kind === "annex" ? String(2 + annexCount) : "",
      mainNumber, mainDate,
      date: new Date().toISOString().slice(0, 10), city: "Караганда",
      workerId: "", worker: { name: "", iin: "", doc: "", docIssuer: "Выдан МВД РК", address: "", phone: "", email: "" },
      contragentId: contragentsRef.current[0]?.id || "",
      objectId: obj?.id || "", objectAddress: obj?.address || "",
      format: kind === "annex" ? "sections" : "table",
      sections, manualTotal: "", avans: "", termDays: "", withStamp: false,
    });
  };
  const savePodryad = async (m) => {
    const id = m.id || genId();
    const record = { ...m, id, total: podTotal(m), createdAt: m.createdAt || Date.now(), updatedAt: Date.now(), createdBy: m.createdBy || currentUser?.name || "" };
    const cur = podryadsRef.current;
    const next = cur.some(p => p.id === id) ? cur.map(p => p.id === id ? record : p) : [record, ...cur];
    await savePodryads(next, { replace: true });
    return record;
  };
  // HTML договора подряда / приложения (юридический текст — дословно из утверждённых образцов)
  const buildPodryadHtml = (m) => {
    const esc = s => String(s == null ? "" : s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    const money = n => Math.round(Number(n) || 0).toLocaleString("ru-RU");
    const ca = contragentsRef.current.find(c => c.id === m.contragentId) || contragentsRef.current[0] || {};
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
    return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${m.kind === "annex" ? "Приложение №" + esc(m.annexNo) : "Договор подряда №" + esc(m.number)}</title><style>${CSS}</style></head><body>${mainBody}${annexBody}
<div class="np"><button onclick="window.print()" style="padding:12px 32px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:15px;cursor:pointer;font-weight:700;font-family:Arial,sans-serif">🖨 Печать / Сохранить PDF</button></div>
</body></html>`;
  };
  // upsert одной производственной карточки (ключ — objectId)
  const onSaveProduction = useCallback(async (record) => {
    const cur = productionsRef.current;
    const exists = cur.some(p => p.objectId === record.objectId);
    const list = exists ? cur.map(p => p.objectId === record.objectId ? record : p) : [...cur, record];
    await saveProductions(list, { replace: true });
  }, []);
  // Удалить производственную карточку по objectId (replace:true — карточки ключуются по objectId, без id)
  const onDeleteProduction = useCallback(async (objectId) => {
    const list = productionsRef.current.filter(p => p.objectId !== objectId);
    await saveProductions(list, { replace: true, allowEmpty: true });
  }, []);

  // Построить этапы из привязанной к объекту сметы: группировка по категориям сметы
  const buildStagesFromEstimate = useCallback((objectId) => {
    const objEsts = estimates.filter(e => e.objectId === objectId);
    if (!objEsts.length) return [];
    const catalog = getEffectiveCatalog();
    // Одна строка = одно НАИМЕНОВАНИЕ работы. Заголовок (cat: Черновые/Чистовые) —
    // это блок для группировки. Одинаковые работы (cat+name) суммируем по qty/сумме.
    const map = {}; // "cat|name" -> { cat, name, unit, qty, priceClient, costPlan }
    const order = [];
    for (const est of objEsts) {
      const mk = 1 + (Number(est.markup) || 0) / 100;
      const disc = 1 - (Number(est.discount) || 0) / 100;
      for (const [key, r] of Object.entries(est.rows || {})) {
        const qty = Number(r?.qty || 0);
        if (qty <= 0) continue;
        const w = catalog.find(x => x.code === key) || catalog.find(x => x.name === key);
        if (!w) continue;
        const cpxPct = r.cpxPct !== undefined ? Number(r.cpxPct) : undefined;
        const raw = (r.manualPrice !== undefined && r.manualPrice !== "") ? Number(r.manualPrice) : getPrice(w, qty, r.complexity || "std", cpxPct);
        const priceClient = (Number(raw) || 0) * mk * disc * qty;
        const costPlan = rowCostPerUnit(r, w) * qty;
        const cat = w.cat || "Прочее";
        const name = w.name || "";
        const k = (cat + "|" + name).toLowerCase();
        if (!map[k]) { map[k] = { cat, name, unit: w.unit || "", qty: 0, priceClient: 0, costPlan: 0 }; order.push(k); }
        map[k].qty += qty;
        map[k].priceClient += priceClient;
        map[k].costPlan += costPlan;
      }
    }
    // Каждая строка = конкретная работа (наименование), cat = блок-заголовок
    return order.map(k => ({ cat: map[k].cat, name: map[k].name, unit: map[k].unit, qty: Math.round(map[k].qty * 100) / 100, priceClient: Math.round(map[k].priceClient), costPlan: Math.round(map[k].costPlan) }));
  }, [estimates]);

  // Миграция: перенести все проекты из Финансов в Производство (один раз)
  // Определён ПОСЛЕ buildStagesFromEstimate чтобы избежать temporal dead zone
  const migrateFinanceToProd = useCallback(async () => {
    const total = finProjectsRef.current.filter(p => (p.rawStatus||p.status) !== "отменен").length;
    if (!window.confirm(`Перенести ${total} проектов из Финансов в Производство? Текущие записи производства будут заменены.`)) return;
    const finStatMap = { "новый":"new","активен":"active","в работе":"active","приостановлен":"паused","выполнен":"done","отменен":"cancel" };
    const stagesFromEst = (objId) => buildStagesFromEstimate(objId).map(s => ({
      id: genId(), cat: s.cat||"Прочее", name: s.name||"", unit: s.unit||"", qty: s.qty||0,
      planStart:"", planEnd:"", factStart:"", factEnd:"",
      status:"todo", responsible:"", note:"", paid:false,
      priceClient: s.priceClient||0, costPlan: s.costPlan||0,
    }));
    const newProds = [];
    const extraObjs = [];
    const seen = new Set();
    const curObjs = objectsRef.current.filter(o => !o.deletedAt);
    for (const fp of finProjectsRef.current) {
      const st = fp.rawStatus || fp.status || "";
      if (st === "отменен") continue;
      let objId = fp.objectId || "";
      if (!objId && fp.contractNo) {
        const link = contractLinkMap[normCN(fp.contractNo)];
        if (link?.object) objId = link.object.id;
      }
      if (!objId) {
        const desc = ((fp.description||"")+" "+(fp.comment||"")).toLowerCase();
        const matched = curObjs.find(o =>
          (o.clientName && o.clientName.length > 2 && desc.includes(o.clientName.toLowerCase())) ||
          (o.clientPhone && o.clientPhone.length > 4 && desc.includes(o.clientPhone.toLowerCase())));
        if (matched) objId = matched.id;
      }
      if (!objId) {
        const parts = (fp.description||"").split("|").map(s=>s.trim());
        const newObj = {
          id: genId(),
          clientName: parts[0] || `Проект №${fp.contractNo}`,
          address: parts[1]||"", clientPhone: parts[2]||"",
          clientType: fp.client==="Юр лицо"?"юр":"физ",
          objType: fp.category||"Вторичка",
          area:"", status:"signed", note:`Договор №${fp.contractNo}`,
          manager:"", createdBy:"migration",
          createdAt: fp.createdAt ? new Date(fp.createdAt).getTime() : Date.now(),
          updatedAt: Date.now(),
        };
        extraObjs.push(newObj); curObjs.push(newObj); objId = newObj.id;
      }
      if (seen.has(objId)) continue;
      seen.add(objId);
      const prod = emptyProduction(objId, genId);
      prod.prodStatus = finStatMap[st]||"active";
      prod.stages = stagesFromEst(objId);
      if (fp.createdAt) prod.startDate = fp.createdAt;
      if (fp.closedAt) prod.factEndDate = fp.closedAt;
      newProds.push(prod);
    }
    if (extraObjs.length > 0) await saveObjects([...objectsRef.current, ...extraObjs], { replace: true });
    await saveProductions(newProds, { replace: true });
    alert(`Перенесено ${newProds.length} объектов.${extraObjs.length ? ` Создано ${extraObjs.length} новых объектов.`:""}`);
  }, [contractLinkMap, genId, buildStagesFromEstimate]);

  // ── ФИНАНСЫ: загрузка/сохранение ──
  const loadFinance = useCallback(async () => {
    try {
      const [tx, mt, pj] = await Promise.all([storage.getResult(FINANCE_TX_KEY), storage.getResult(FINANCE_META_KEY), storage.getResult(FINANCE_PROJECTS_KEY)]);
      let ok = true;
      if (tx.status === "found" && tx.value) { try { const p = JSON.parse(tx.value); if (Array.isArray(p)) { setFinanceTx(p); financeTxRef.current = p; } } catch {} }
      else if (tx.status === "empty") { setFinanceTx([]); financeTxRef.current = []; }
      else ok = false;
      if (mt.status === "found" && mt.value) { try { const p = JSON.parse(mt.value); if (p && p.accounts) { const m = mergeFinMeta(p); setFinanceMeta(m); financeMetaRef.current = m; } } catch {} }
      if (pj.status === "found" && pj.value) { try { const p = JSON.parse(pj.value); if (Array.isArray(p)) {
        const curY = new Date().getFullYear();
        const fixed = p.map(proj => {
          if (!proj.createdAt) return proj;
          const d = new Date(proj.createdAt);
          if (isNaN(d.getTime()) || d.getFullYear() <= curY + 1) return proj;
          // год явно неверный — заменяем на текущий, день/месяц сохраняем
          const corrected = new Date(proj.createdAt);
          corrected.setFullYear(curY);
          return { ...proj, createdAt: corrected.toISOString().slice(0, 10) };
        });
        setFinProjects(fixed); finProjectsRef.current = fixed;
      } } catch {} }
      _financeLoaded.current = ok;
    } catch(e) { console.error(e); }
  }, []);
  const saveFinanceTx = async (list, opts = {}) => {
    return await saveListProtected(FINANCE_TX_KEY, FINANCE_TX_BACKUPS_KEY, list, (fl)=>{ financeTxRef.current = fl; setFinanceTx(fl); }, { loadedRef: _financeLoaded, ...opts });
  };
  const saveFinanceMeta = async (meta) => {
    financeMetaRef.current = meta; setFinanceMeta(meta);
    try {
      const prev = await storage.getResult(FINANCE_META_KEY);
      if (prev.status === "found" && prev.value) {
        const bRaw = await storage.get(FINANCE_META_BACKUPS_KEY); let bk=[];
        try { if (bRaw && bRaw.value) bk = JSON.parse(bRaw.value); } catch {}
        if (!Array.isArray(bk)) bk = [];
        bk.unshift({ ts: Date.now(), by: currentUser?.name||"", data: prev.value });
        await storage.set(FINANCE_META_BACKUPS_KEY, JSON.stringify(bk.slice(0,20)));
      }
      const res = await storage.set(FINANCE_META_KEY, JSON.stringify(meta));
      if (res && res.fbOk === false) setCloudError(true); else setCloudError(false);
    } catch(e) { console.error(e); setCloudError(true); }
  };

  const saveFinanceProjects = async (list, opts = {}) => {
    return await saveListProtected(FINANCE_PROJECTS_KEY, FINANCE_PROJECTS_BACKUPS_KEY, list, (fl)=>{ finProjectsRef.current = fl; setFinProjects(fl); }, { loadedRef: _financeLoaded, ...opts });
  };

  // Бэкапы списков (договоры/клиенты/контрагенты)
  const openListBackups = async (kind) => {
    const cfg = {
      list:        { backupKey: CONTRACTS_BACKUPS_KEY,   label: "договоров",   save: (l)=>saveContracts(l, {replace:true, allowEmpty:true}) },
      contracts:   { backupKey: CONTRACTS_BACKUPS_KEY,   label: "договоров",   save: (l)=>saveContracts(l, {replace:true, allowEmpty:true}) },
      clients:     { backupKey: CLIENTS_BACKUPS_KEY,     label: "клиентов",    save: (l)=>saveContractClients(l, {replace:true, allowEmpty:true}) },
      contragents: { backupKey: CONTRAGENTS_BACKUPS_KEY, label: "контрагентов", save: (l)=>saveContragents(l, {replace:true, allowEmpty:true}) },
      objects:     { backupKey: OBJECTS_BACKUPS_KEY,     label: "объектов",    save: (l)=>saveObjects(l, {replace:true, allowEmpty:true}) },
    }[kind];
    if (!cfg) return;
    const bRaw = await storage.get(cfg.backupKey);
    let items = []; try { if (bRaw?.value) items = JSON.parse(bRaw.value); } catch {}
    setListBackups({
      label: cfg.label,
      items: Array.isArray(items) ? items : [],
      onRestore: async (snap) => {
        if (!snap?.data) return;
        let list; try { list = JSON.parse(snap.data); } catch { window.alert("Бэкап повреждён"); return; }
        if (!Array.isArray(list)) { window.alert("Бэкап повреждён"); return; }
        if (!window.confirm(`Восстановить список ${cfg.label} на ${new Date(snap.ts).toLocaleString("ru-RU")}? Записей: ${list.length}.`)) return;
        await cfg.save(list);
        setListBackups(null);
        window.alert("Восстановлено ✓");
      },
    });
  };

  // Автосохранение договора
  const _contractAutoSave = useRef(null);
  useEffect(() => {
    if (!currentContract || currentContract._mode) return;
    if (_contractAutoSave.current) clearTimeout(_contractAutoSave.current);
    _contractAutoSave.current = setTimeout(async () => {
      const list = contractsRef.current.filter(x=>x.id!==currentContract.id);
      await saveContracts([...list, {...currentContract, updatedAt: Date.now()}]);
    }, 1500);
    return () => clearTimeout(_contractAutoSave.current);
  }, [currentContract]);

  // Автосохранение сделки (тест)
  const _dealAutoSave = useRef(null);
  useEffect(() => {
    if (!currentDeal) return;
    if (_dealAutoSave.current) clearTimeout(_dealAutoSave.current);
    _dealAutoSave.current = setTimeout(async () => {
      const list = dealsRef.current.filter(x=>x.id!==currentDeal.id);
      const total = (currentDeal.works||[]).reduce((s,w)=>s+(Number(w.quantity)*Number(w.price)||0),0);
      await saveDeals([...list, {...currentDeal, total, updatedAt: Date.now()}]);
    }, 1500);
    return () => clearTimeout(_dealAutoSave.current);
  }, [currentDeal]);

  const _estimatesLoaded = useRef(false); // защита: не сохранять пока не загрузились из Firebase
  const _needResaveClean = useRef(null); // результат санитизации, который надо сохранить после снятия блокировки

  // Чистка испорченных смет: parentId не может ссылаться на саму смету или на несуществующую/тоже-дочернюю.
  const sanitizeEstimates = (list) => {
    const byId = {}; list.forEach(e=>{ byId[e.id]=e; });
    return list.map(e=>{
      let pid = e.parentId;
      // самоссылка / отсутствующий родитель / родитель сам является ДС → это основная смета
      if (pid && (pid===e.id || !byId[pid] || byId[pid].parentId)) pid = null;
      if (pid === e.parentId) return e; // ничего не меняли
      const { parentId, dsNumber, ...rest } = e;
      return pid ? { ...rest, parentId: pid, dsNumber } : rest; // снимаем parentId и dsNumber у основной
    });
  };

  const loadEstimates = useCallback(async () => {
    setLoadingList(true);
    let ok = false;
    try {
      const [resR, uR, prR, catR] = await Promise.allSettled([
        storage.getResult(STORAGE_KEY),
        storage.get(USERS_KEY),
        storage.get(PRICES_KEY),
        storage.get(CATALOG_KEY),
      ]);
      // Если основная коллекция не загрузилась — считаем источник недоступным
      const result = resR.status==="fulfilled" ? resR.value : { status:"unavailable" };
      const u   = uR.status==="fulfilled"   ? uR.value   : null;
      const pr  = prR.status==="fulfilled"  ? prR.value  : null;
      const cat = catR.status==="fulfilled" ? catR.value : null;
      if (result.status === "found" && result.value) {
        try {
          const parsed = JSON.parse(result.value);
          if (Array.isArray(parsed)) {
            const clean = sanitizeEstimates(parsed);
            setEstimates(clean); estimatesRef.current = clean; ok = true;
            // если санитизация что-то починила — пометим для сохранения после снятия блокировки
            if (JSON.stringify(clean) !== JSON.stringify(parsed)) { _needResaveClean.current = clean; }
          }
          else console.error("loadEstimates: данные не массив — не трогаем");
        } catch(e) {
          console.error("loadEstimates parse error — данные не тронуты", e);
        }
      } else if (result.status === "empty") {
        // Источник точно ответил и данных нет — корректно показываем пустой список
        setEstimates([]); estimatesRef.current = []; ok = true;
      } else {
        // 'unavailable' — Firebase не ответил, локальной копии нет.
        // НЕ затираем стейт и НЕ разрешаем сохранение (иначе пустой список перетрёт базу).
        console.error("loadEstimates: данные недоступны (Firebase не ответил) — сохранение заблокировано до перезагрузки");
        setLoadError(true);
      }
      try { if (u) {
        const uList=JSON.parse(u.value); setAllUsers(uList);
        // синхронизируем роль текущего пользователя если она изменилась в Firebase
        setCurrentUser(prev=>{
          if(!prev) return prev;
          const fresh=uList.find(x=>x.id===prev.id);
          if(!fresh || (fresh.role===prev.role && fresh.name===prev.name)) return prev;
          const updated={...prev,...fresh};
          try{ localStorage.setItem(SESSION_KEY,JSON.stringify({user:updated,savedAt:Date.now()})); }catch(e){}
          return updated;
        });
      }} catch {}
      try { if (pr) setPriceOverrides(JSON.parse(pr.value)); } catch {}
      try { if (cat) setCatalogOverrides(JSON.parse(cat.value)); } catch {}
    } catch(e) {
      console.error("loadEstimates error — данные не тронуты", e);
    }
    // Разрешаем запись ТОЛЬКО если успешно подтвердили состояние базы
    _estimatesLoaded.current = ok;
    // теперь, когда запись разрешена, сохраняем результат санитизации (если что-то чинили)
    if (ok && _needResaveClean.current) { const c = _needResaveClean.current; _needResaveClean.current = null; saveEstimates(c, { replace: true }); }
    setLoadingList(false);
  }, []);

  useEffect(() => { loadEstimates(); loadContracts(); }, []);
  // Финансы грузим для админа и руководителя
  useEffect(() => { if (currentUser?.role === "admin" || currentUser?.role === "manager") loadFinance(); }, [currentUser?.role, loadFinance]);

  // ── Сохранение списка смет с защитой от рассинхрона ──
  // opts.replace=true — записать ровно `list` (восстановление из бэкапа)
  // opts.removedIds — id, которые нужно удалить из объединённого набора (явное удаление)
  const saveEstimates = useCallback(async (list, opts = {}) => {
    if (!_estimatesLoaded.current) { console.warn("saveEstimates заблокирован: данные ещё не загружены/недоступны"); return; }
    if (!Array.isArray(list)) { console.error("saveEstimates: список не массив — отмена"); return; }
    const { replace = false, removedIds = [] } = opts;

    // Читаем актуальное состояние базы (могли изменить другие устройства)
    let stored = [];
    let prevValue = null, prevStatus = "empty";
    try {
      const prevCheck = await storage.getResult(STORAGE_KEY);
      prevStatus = prevCheck.status; prevValue = prevCheck.value;
      if (prevCheck.status === "found" && prevCheck.value) {
        try { const p = JSON.parse(prevCheck.value); if (Array.isArray(p)) stored = p; } catch {}
      } else if (prevCheck.status === "unavailable") {
        // База недоступна — не рискуем перезаписывать, чтобы не затереть чужие данные
        console.error("saveEstimates ЗАБЛОКИРОВАН: база недоступна");
        setCloudError(true);
        return;
      }
    } catch(e) { console.warn("guard check err", e); }

    // СЛИЯНИЕ: объединяем по id, для общих id берём запись с более свежим updatedAt.
    // Сметы из базы, которых нет в текущем списке, СОХРАНЯЕМ (другое устройство их добавило).
    let finalList;
    if (replace) {
      finalList = list;
    } else {
      const map = new Map();
      for (const e of stored) if (e && e.id) map.set(e.id, e);
      for (const e of list) {
        if (!e || !e.id) continue;
        const ex = map.get(e.id);
        if (!ex) map.set(e.id, e);
        else map.set(e.id, _ts(e.updatedAt) >= _ts(ex.updatedAt) ? e : ex);
      }
      for (const id of removedIds) map.delete(id);
      finalList = [...map.values()];
    }

    // ФИНАЛЬНЫЙ ПРЕДОХРАНИТЕЛЬ: не затирать непустую базу пустым результатом без явного разрешения
    if (stored.length > 0 && finalList.length === 0 && !_allowEmptySave.current) {
      console.error("saveEstimates ЗАБЛОКИРОВАН: результат пустой поверх", stored.length, "смет");
      return;
    }

    // Синхронизируем UI с объединённым набором (чтобы не потерять подтянутые чужие сметы)
    estimatesRef.current = finalList;
    setEstimates(finalList);

    setSaving(true);
    setSyncStatus("saving");
    try {
      // Авто-бэкап предыдущего состояния (последние 20)
      try {
        if (prevStatus === "found" && prevValue) {
          const bRaw = await storage.get(BACKUPS_KEY);
          let backups = [];
          try { if (bRaw && bRaw.value) backups = JSON.parse(bRaw.value); } catch {}
          if (!Array.isArray(backups)) backups = [];
          const last = backups[0];
          if (!last || last.data !== prevValue) {
            backups.unshift({ ts: Date.now(), by: currentUser?.name || "", count: stored.length, data: prevValue });
            backups = backups.slice(0, 20);
            await storage.set(BACKUPS_KEY, JSON.stringify(backups));
          }
        }
      } catch(e) { console.warn("backup err", e); }
      const res = await storage.set(STORAGE_KEY, JSON.stringify(finalList));
      if (res && res.fbOk === false) { console.error("Firebase save FAILED:", res.fbError); setCloudError(true); setSyncStatus("error"); }
      else { setCloudError(false); setSyncStatus("saved"); setTimeout(()=>setSyncStatus("idle"), 3000); }
    } catch(e) { console.error(e); setCloudError(true); setSyncStatus("error"); }
    setSaving(false);
  }, [currentUser]);

  // ── УНИВЕРСАЛЬНОЕ защищённое сохранение списка (договоры, клиенты, контрагенты) ──
  // Та же логика, что у смет: слияние по id, бэкап, защита от затирания, баннер при сбое облака.
  const saveListProtected = useCallback(async (key, backupKey, list, applyState, opts = {}) => {
    if (!Array.isArray(list)) { console.error("saveListProtected: не массив", key); return; }
    const { replace = false, removedIds = [], allowEmpty = false, loadedRef = null } = opts;
    if (loadedRef && !loadedRef.current) { console.warn("saveListProtected заблокирован: не загружено", key); return; }

    let stored = [], prevValue = null, prevStatus = "empty";
    try {
      const prevCheck = await storage.getResult(key);
      prevStatus = prevCheck.status; prevValue = prevCheck.value;
      if (prevCheck.status === "found" && prevCheck.value) {
        try { const p = JSON.parse(prevCheck.value); if (Array.isArray(p)) stored = p; } catch {}
      } else if (prevCheck.status === "unavailable") {
        console.error("saveListProtected ЗАБЛОКИРОВАН: база недоступна", key);
        setCloudError(true);
        return;
      }
    } catch(e) { console.warn("guard check err", e); }

    let finalList;
    if (replace) finalList = list;
    else {
      const map = new Map();
      for (const e of stored) if (e && e.id) map.set(e.id, e);
      for (const e of list) {
        if (!e || !e.id) continue;
        const ex = map.get(e.id);
        if (!ex) map.set(e.id, e);
        else map.set(e.id, _ts(e.updatedAt) >= _ts(ex.updatedAt) ? e : ex);
      }
      for (const id of removedIds) map.delete(id);
      finalList = [...map.values()];
    }

    if (stored.length > 0 && finalList.length === 0 && !allowEmpty) {
      console.error("saveListProtected ЗАБЛОКИРОВАН: пусто поверх", stored.length, key);
      return;
    }

    if (applyState) applyState(finalList);

    try {
      if (prevStatus === "found" && prevValue) {
        const bRaw = await storage.get(backupKey);
        let backups = [];
        try { if (bRaw && bRaw.value) backups = JSON.parse(bRaw.value); } catch {}
        if (!Array.isArray(backups)) backups = [];
        if (!backups[0] || backups[0].data !== prevValue) {
          backups.unshift({ ts: Date.now(), by: currentUser?.name || "", count: stored.length, data: prevValue });
          await storage.set(backupKey, JSON.stringify(backups.slice(0, 20)));
        }
      }
      const res = await storage.set(key, JSON.stringify(finalList));
      if (res && res.fbOk === false) { console.error("Firebase save FAILED:", key, res.fbError); setCloudError(true); }
      else { setCloudError(false); }
    } catch(e) { console.error(e); setCloudError(true); }
    return finalList;
  }, [currentUser]);

  // Сколько позиций (с qty>0) в наборе rows
  const countFilled = (rws) => Object.values(rws||{}).filter(r => Number(r?.qty) > 0).length;
  const _allowEmptySave = useRef(false); // явное разрешение сохранить пустую смету (Сбросить позиции)

  // ── Бэкапы / восстановление ──
  const openBackups = async () => {
    try {
      const bRaw = await storage.get(BACKUPS_KEY);
      let backups = [];
      try { if (bRaw && bRaw.value) backups = JSON.parse(bRaw.value); } catch {}
      if (!Array.isArray(backups)) backups = [];
      setBackupsModal(backups);
    } catch(e) { setBackupsModal([]); }
  };
  const restoreBackup = async (snap) => {
    if (!snap || !snap.data) return;
    let list;
    try { list = JSON.parse(snap.data); } catch { window.alert("Не удалось прочитать бэкап"); return; }
    if (!Array.isArray(list)) { window.alert("Бэкап повреждён"); return; }
    // Отфильтровываем мусор (null/undefined/без id), чтобы не записать битые записи
    list = list.filter(e => e && typeof e==="object" && e.id);
    if (!window.confirm(`Восстановить архив на момент ${new Date(snap.ts).toLocaleString("ru-RU")}?\nСметы: ${list.length}. Текущая версия уйдёт в бэкап и её можно вернуть обратно.`)) return;
    _allowEmptySave.current = true; // восстановление может заменить на меньший набор
    estimatesRef.current = list;
    setEstimates(list);
    await saveEstimates(list, { replace: true }); // ровно снимок, текущая версия уйдёт в бэкап
    setTimeout(() => { _allowEmptySave.current = false; }, 1500);
    setBackupsModal(null);
    const objIds = new Set(objectsRef.current.map(o=>o.id));
    const inObjects = list.filter(e=>e.objectId && objIds.has(e.objectId)).length;
    const standalone = list.length - inObjects;
    window.alert(`Восстановлено смет: ${list.length}\n• в объектах: ${inObjects}\n• в общем списке «Сметы»: ${standalone}`);
  };

  // ── Единый бэкап рабочего пространства: объекты + сметы + договора + финансовые операции ──
  const _wsSnapTimer = useRef(null);
  useEffect(() => {
    if (!_estimatesLoaded.current || !_contractsLoaded.current || !_financeLoaded.current) return;
    if (_wsSnapTimer.current) clearTimeout(_wsSnapTimer.current);
    _wsSnapTimer.current = setTimeout(async () => {
      try {
        const snap = {
          ts: Date.now(),
          by: currentUser?.name || "",
          objects: objectsRef.current,
          estimates: estimatesRef.current,
          contracts: contractsRef.current,
          financeTx: financeTxRef.current,
          counts: {
            o: objectsRef.current.length,
            e: estimatesRef.current.length,
            c: contractsRef.current.length,
            f: financeTxRef.current.length,
          },
        };
        const raw = await storage.get(WORKSPACE_BACKUPS_KEY);
        let arr = []; try { if (raw?.value) arr = JSON.parse(raw.value); } catch {}
        if (!Array.isArray(arr)) arr = [];
        const prev = arr[0];
        const sig = `${snap.counts.o}|${snap.counts.e}|${snap.counts.c}|${snap.counts.f}`;
        if (prev && prev._sig === sig) return;
        snap._sig = sig;
        arr = [snap, ...arr].slice(0, 30);
        await storage.set(WORKSPACE_BACKUPS_KEY, JSON.stringify(arr));
      } catch (e) { console.warn("ws snapshot err", e); }
    }, 8000);
    return () => { if (_wsSnapTimer.current) clearTimeout(_wsSnapTimer.current); };
  }, [objects, estimates, contracts, financeTx]);

  const openWorkspaceBackups = async () => {
    try {
      const raw = await storage.get(WORKSPACE_BACKUPS_KEY);
      let arr = []; try { if (raw?.value) arr = JSON.parse(raw.value); } catch {}
      setWsBackupsModal(Array.isArray(arr) ? arr : []);
    } catch { setWsBackupsModal([]); }
  };

  const restoreWorkspace = async (snap) => {
    if (!snap) return;
    const o = Array.isArray(snap.objects) ? snap.objects : [];
    const e = Array.isArray(snap.estimates) ? snap.estimates : [];
    const c = Array.isArray(snap.contracts) ? snap.contracts : [];
    const f = Array.isArray(snap.financeTx) ? snap.financeTx : [];
    if (!window.confirm(`Восстановить рабочее пространство на ${new Date(snap.ts).toLocaleString("ru-RU")}?\n\nОбъектов: ${o.length}\nСмет: ${e.length}\nДоговоров: ${c.length}\nФин. операций: ${f.length}\n\nТекущее состояние уйдёт в бэкап.`)) return;
    _allowEmptySave.current = true;
    objectsRef.current = o; setObjects(o);
    estimatesRef.current = e; setEstimates(e);
    contractsRef.current = c; setContracts(c);
    if (f.length > 0) { financeTxRef.current = f; setFinanceTx(f); }
    await saveObjects(o, { replace: true, allowEmpty: true });
    await saveEstimates(e, { replace: true });
    await saveContracts(c, { replace: true, allowEmpty: true });
    if (f.length > 0) await saveFinanceTx(f, { replace: true });
    setTimeout(() => { _allowEmptySave.current = false; }, 1500);
    setWsBackupsModal(null);
    window.alert(`Восстановлено ✓\nОбъектов: ${o.length} · Смет: ${e.length} · Договоров: ${c.length} · Фин. операций: ${f.length}`);
  };

  // ── Импорт смет из JSON (восстановление из PDF) ──
  const runImport = async () => {
    let payload;
    try { payload = JSON.parse(importText); }
    catch { window.alert("Не удалось прочитать JSON. Проверьте, что вставлен корректный текст."); return; }
    const incoming = Array.isArray(payload) ? payload
      : Array.isArray(payload?.estimates) ? payload.estimates : null;
    if (!incoming || incoming.length === 0) { window.alert("В JSON нет смет для импорта."); return; }
    const customWorks = Array.isArray(payload?.customWorks) ? payload.customWorks : [];
    if (!window.confirm(`Импортировать ${incoming.length} смет(ы)?${customWorks.length?`\nБудет добавлено пользовательских позиций в каталог: ${customWorks.length}.`:""}\nТекущий архив уйдёт в бэкап — откат доступен.`)) return;
    setImportBusy(true);
    try {
      // 1) Добавляем пользовательские позиции в каталог (без дублей по коду)
      if (customWorks.length) {
        const cur = _catalogOverrides;
        const existing = cur.custom || [];
        const codes = new Set(existing.map(w=>w.code));
        const merged = [...existing, ...customWorks.filter(w => !codes.has(w.code))];
        const nextCat = { renames:{}, catRenames:{}, subRenames:{}, hiddenCodes:[], hiddenSubs:[], hiddenCats:[], custom:[], ...cur, custom: merged };
        await storage.set(CATALOG_KEY, JSON.stringify(nextCat));
        setCatalogOverrides(nextCat);            // обновляем _catalogOverrides (для getEffectiveCatalog/getPrice)
        setCatalogVersion(v => v + 1);           // пересобираем Gdyn, чтобы суммы посчитались
      }
      // 2) Добавляем сметы (без дублей по id)
      const cur = estimatesRef.current;
      const existIds = new Set(cur.map(e=>e.id));
      const toAdd = incoming
        // валидируем структуру: объект с id и корректным rows (объект, не массив/строка)
        .filter(e => e && typeof e==="object" && e.id && !existIds.has(e.id)
          && (e.rows===undefined || (typeof e.rows==="object" && !Array.isArray(e.rows))))
        .map(e => ({ ...e, rows: (e.rows && typeof e.rows==="object" && !Array.isArray(e.rows)) ? e.rows : {}, createdAt: e.createdAt||Date.now(), updatedAt: e.updatedAt||Date.now() }));
      if (!toAdd.length) { window.alert("Все сметы из JSON уже есть в архиве (совпадение по id)."); setImportBusy(false); return; }
      const newList = [...toAdd, ...cur];
      estimatesRef.current = newList;
      setEstimates(newList);
      await saveEstimates(newList);
      setImportBusy(false);
      setImportModal(false);
      setImportText("");
      window.alert(`Импортировано смет: ${toAdd.length} ✓`);
    } catch(e) {
      console.error(e);
      setImportBusy(false);
      window.alert("Ошибка импорта: " + (e?.message||e));
    }
  };

  // ── Вычисления текущей сметы ──
  const setRow = useCallback((name, field, val) =>
    setRows(p => ({ ...p, [name]: { ...p[name], [field]: val } })), []);

  const rowPrice = (work) => {
    const r = rows[work.code] || rows[work.name] || {};
    if (r.manualPrice !== undefined && r.manualPrice !== "") { const n = Number(r.manualPrice); return isNaN(n) ? null : n; }
    const cpxPct = r.cpxPct !== undefined ? Number(r.cpxPct) : undefined;
    return getPrice(work, Number(r.qty || 0), r.complexity || "std", cpxPct);
  };
  const rowTotal = (work) => {
    const qty = Number((rows[work.code] || rows[work.name] || {}).qty || 0);
    const price = rowPrice(work);
    return qty > 0 && price ? qty * price : 0;
  };
  // Возвращает "цену от" если у работы нет точной цены (не идёт в расчёт)
  const rowPriceFrom = (work) => {
    const r = rows[work.code] || rows[work.name] || {};
    if (r.manualPrice !== undefined && r.manualPrice !== "") return null; // ручная цена — точная
    const w = getEffectiveWork(work);
    if (w.fixedPrice || (w.tiers && w.tiers.length > 0) || w.cost) return null; // есть точная цена
    return w.priceFrom || null;
  };
  // Единый проход по каталогу — вычисляет все суммы за O(n) один раз при изменении rows
  const allSumMap = useMemo(() => {
    const subMap = {};
    const catMap = {};
    let grandTotal = 0;
    for (const cat of Object.keys(Gdyn)) {
      let catTotal = 0;
      for (const sub of Object.keys(Gdyn[cat]||{})) {
        let subTotal = 0;
        for (const w of (Gdyn[cat][sub]||[])) {
          const r = rows[w.code] || rows[w.name] || {};
          const qty = Number(r.qty || 0);
          if (!qty) continue;
          const cpxPct = r.cpxPct !== undefined ? Number(r.cpxPct) : undefined;
          const mp = Number(r.manualPrice);
          const price = (r.manualPrice !== undefined && r.manualPrice !== "" && !isNaN(mp))
            ? mp
            : getPrice(w, qty, r.complexity || "std", cpxPct);
          if (price) subTotal += qty * price;
        }
        subMap[cat+"||"+sub] = subTotal;
        catTotal += subTotal;
      }
      catMap[cat] = catTotal;
      grandTotal += catTotal;
    }
    return { subMap, catMap, grand: grandTotal };
  }, [rows, catalogVersion]);
  const subSum = (cat, sub) => allSumMap.subMap[cat+"||"+sub] || 0;
  const catSum = (cat) => allSumMap.catMap[cat] || 0;
  const grand = Number(allSumMap.grand) || 0;
  const _markup = Number(markup) || 0;
  const _discount = Number(discount) || 0;
  const markupAmt = grand * _markup / 100;
  const grandWithMarkup = grand + markupAmt; // база для клиента (markup скрыт)
  const discAmt = grandWithMarkup * _discount / 100;
  const final = Math.round(grandWithMarkup - discAmt); // округляем итог, чтобы не копилась дробная погрешность в сохранённом total
  const kpData = useMemo(() => {
    const mm = 1 + markup / 100;
    const out = [];
    const fromOut = [];
    for (const cat of cats) for (const sub of Object.keys(Gdyn[cat]||{})) for (const w of Gdyn[cat]?.[sub]||[]) {
      const qty = Number((rows[w.code]||rows[w.name]||{}).qty||0);
      if (qty <= 0) continue;
      const r = rows[w.code]||rows[w.name]||{};
      const displayName = r.manualName !== undefined ? r.manualName : w.name;
      const displayUnit = r.manualUnit !== undefined ? r.manualUnit : w.unit;
      const price = rowPrice(w);
      if (price) {
        out.push({ ...w, name: displayName, unit: displayUnit, qty, price: price * mm, total: qty * price * mm });
      } else {
        const pf = rowPriceFrom(w);
        if (pf) fromOut.push({ ...w, name: displayName, unit: displayUnit, qty, priceFrom: pf });
      }
    }
    return { items: out, fromItems: fromOut };
  }, [rows, markup]);
  const kpItems = kpData.items;
  const kpFromItems = kpData.fromItems;
  const filledCount = useMemo(() => Object.values(rows).filter(r => Number(r?.qty) > 0).length, [rows]);
  const nonViewerUsers = useMemo(() => allUsers.filter(u => u.role !== "viewer"), [allUsers]);
  const debouncedSearch = useDebounce(search, 250);
  const searchResults = useMemo(() => {
    if (!debouncedSearch.trim()) return [];
    const q = debouncedSearch.toLowerCase();
    return getEffectiveCatalog().filter(w =>
      w.name.toLowerCase().includes(q) || w.sub.toLowerCase().includes(q) || w.cat.toLowerCase().includes(q)
    );
  }, [debouncedSearch, catalogVersion]);
  const isSearching = search.trim().length > 0;
  // Мемоизированные вычисления аналитики — пересчитываются только при изменении данных
  const analyticsData = useMemo(() => {
    const now = Date.now();
    let fromTs = 0, toTs = now;
    if(statsPeriod==="custom"){
      fromTs = statsDateFrom ? new Date(statsDateFrom).getTime() : 0;
      toTs   = statsDateTo   ? new Date(statsDateTo).getTime()+86399999 : now;
    } else if(statsPeriod==="all") {
      fromTs = 0;
    } else {
      const nd = new Date();
      if(statsPeriod==="week") { nd.setDate(nd.getDate()-6); fromTs = nd.getTime(); }
      else { // month, 3month — считаем от 1-го числа
        const d = new Date(nd.getFullYear(), nd.getMonth(), 1);
        if(statsPeriod==="3month") d.setMonth(d.getMonth()-2);
        fromTs = d.getTime();
      }
    }
    const inRange = ts => (ts||0) >= fromTs && (ts||0) <= toTs;
    const catalogForStats = getEffectiveCatalog();
    // Карта работ по имени и коду (строки смет ключуются по name, старые иногда по code)
    const workLookup = new Map();
    for(const w of catalogForStats){ if(w?.name) workLookup.set(w.name, w); if(w?.code) workLookup.set(w.code, w); }
    // Себестоимость одной сметы по заполненным позициям
    const estCost = (e) => {
      let cost = 0;
      for(const [key,r] of Object.entries(e.rows||{})){
        const qty = Number(r?.qty||0); if(!qty) continue;
        const w = workLookup.get(key);
        if(w) cost += rowCostPerUnit(r,w)*qty;
      }
      return cost;
    };

    // ── ОБЪЕКТ-ЦЕНТРИЧНАЯ МОДЕЛЬ ──
    // Единица учёта — ОБЪЕКТ (сделка). Стоимость объекта = сумма всех его смет (основная + доп. сметы).
    const estByObj = {}; // objectId -> [сметы]
    for(const e of estimates){ if(e.objectId){ (estByObj[e.objectId]||(estByObj[e.objectId]=[])).push(e); } }
    const objVal  = (o) => (estByObj[o.id]||[]).reduce((s,e)=>s+(e.total||0),0);
    const objCost = (o) => (estByObj[o.id]||[]).reduce((s,e)=>s+estCost(e),0);
    const objType = (o) => o.objType || "—";

    const baseObjsAll = liveObjects
      // импортированные миграцией объекты не имеют реальной даты создания (финансы→объекты) — учитываем их только во «Всё время»
      .filter(o => statsPeriod==="all" || o.createdBy!=="migration")
      .filter(o => inRange(o.createdAt||0))   // когорта строго по дате СОЗДАНИЯ (без отката на updatedAt — иначе правка/архивация тянет объект в период)
      .filter(o => !statsManager || (o.manager||"")===statsManager);
    // Рабочее множество — БЕЗ архива (как на дашборде); архив виден только в разбивке «по статусам»
    const baseObjs = baseObjsAll.filter(o => o.status!=="archive");
    // Договора, сформированные ВНУТРИ объектов (привязаны к объекту), без «Прочих договоров»
    const baseCon = contracts
      .filter(c => !c.deletedAt)
      .filter(c => c.objectId)
      .filter(c => inRange(new Date(c.date||0).getTime()))
      .filter(c => (c.works||[]).reduce((s,w)=>s+(w.quantity*w.price||0),0)>0)
      .filter(c => !statsManager || (c.manager||"")=== statsManager);

    // Сводка по объектам (заменяет старые «сметы»)
    const totalEst = baseObjs.length;
    const withSumEst = baseObjs.filter(o=>objVal(o)>0);
    const totalSumEst = withSumEst.reduce((s,o)=>s+objVal(o),0);
    const avgEst = withSumEst.length ? Math.round(totalSumEst/withSumEst.length) : 0;
    const totalCon = baseCon.length;
    const totalSumCon = baseCon.reduce((s,c)=>s+(c.works||[]).reduce((ss,w)=>ss+(w.quantity*w.price||0),0),0);
    const avgCon = totalCon ? Math.round(totalSumCon/totalCon) : 0;
    const byStatus = {}; for(const s of DEAL_STATUSES) byStatus[s.key]=baseObjsAll.filter(o=>(o.status||"new")===s.key).length;
    const byType = {}; for(const o of baseObjs){ const t=objType(o); byType[t]=(byType[t]||0)+1; }

    // ── A. Финансовый обзор — по ПОДПИСАННЫМ объектам (статус объекта = источник правды) ──
    const signedObjsFin = baseObjs.filter(o=>o.status==="signed"&&objVal(o)>0);
    const wonRevenue  = signedObjsFin.reduce((s,o)=>s+objVal(o),0);
    const wonCost     = signedObjsFin.reduce((s,o)=>s+objCost(o),0);
    const wonProfit   = wonRevenue - wonCost;
    const wonMargin   = wonRevenue>0 ? Math.round(wonProfit/wonRevenue*100) : 0;
    // Потенциал — все активные объекты с суммой (кроме архива)
    const potentialObjs = baseObjs.filter(o=>o.status!=="archive"&&objVal(o)>0);
    const allRevenue  = potentialObjs.reduce((s,o)=>s+objVal(o),0);
    const allCost     = potentialObjs.reduce((s,o)=>s+objCost(o),0);
    const allProfit   = allRevenue - allCost;
    const allMargin   = allRevenue>0 ? Math.round(allProfit/allRevenue*100) : 0;

    // ── B. Воронка сделок по статусам ОБЪЕКТОВ (архив — терминал, не стадия) ──
    const funnelStatusesAn = DEAL_STATUSES.filter(s=>s.key!=="archive");
    const funnel = funnelStatusesAn.map(s=>{
      const list = baseObjs.filter(o=>(o.status||"new")===s.key);
      const sum  = list.reduce((a,o)=>a+objVal(o),0);
      const cost = list.reduce((a,o)=>a+objCost(o),0);
      return { key:s.key, label:s.label, color:s.color, bg:s.bg, count:list.length, sum, profit:sum-cost };
    });
    const signedB = funnel.find(f=>f.key==="signed") || {count:0,sum:0,profit:0};
    const refuseB = funnel.find(f=>f.key==="refuse") || {count:0,sum:0,profit:0};
    const activeObjsCount = baseObjs.filter(o=>o.status!=="archive").length;
    // Общая конверсия = подписано / все активные объекты
    const winRateOverall = activeObjsCount>0 ? Math.round(signedB.count/activeObjsCount*100) : 0;
    // Close-rate = подписано / решённые (подписано + отказ)
    const winRateSent    = (signedB.count+refuseB.count)>0 ? Math.round(signedB.count/(signedB.count+refuseB.count)*100) : 0;

    // ── D. Рентабельность по категориям (по сметам объектов в периоде) ──
    const objIdSet = new Set(baseObjs.map(o=>o.id));
    const estForCats = estimates.filter(e=>e.objectId && objIdSet.has(e.objectId));
    const catFin = {};
    for(const e of estForCats){
      for(const [key,r] of Object.entries(e.rows||{})){
        const qty=Number(r?.qty||0); if(!qty) continue;
        const w=workLookup.get(key); if(!w) continue;
        const mp = Number(r.manualPrice);
        const price = (r.manualPrice!==undefined&&r.manualPrice!==""&&!isNaN(mp)) ? mp : getPrice(w, qty, r.complexity||"std", r.cpxPct!==undefined?Number(r.cpxPct):undefined);
        const c = w.cat||"—";
        if(!catFin[c]) catFin[c]={cat:c, revenue:0, cost:0};
        if(price) catFin[c].revenue += price*qty;
        catFin[c].cost += rowCostPerUnit(r,w)*qty;
      }
    }
    const catProfit = Object.values(catFin)
      .map(c=>({...c, profit:c.revenue-c.cost, margin:c.revenue>0?Math.round((c.revenue-c.cost)/c.revenue*100):0}))
      .sort((a,b)=>b.profit-a.profit).slice(0,8);
    const topCats = catProfit.slice(0,5).map(c=>[c.cat, c.revenue]); // совместимость

    // ── C. Менеджеры: объекты, оборот, прибыль, маржа, % сдачи ──
    const validManagerNames = new Set(nonViewerUsers.map(u=>u.name));
    const managers = [...new Set(liveObjects.map(o=>o.manager||"").filter(m=>m&&validManagerNames.has(m)))];
    const managerStats = managers.map(m=>{
      const mos = baseObjs.filter(o=>(o.manager||"")===m);
      const withSum = mos.filter(o=>objVal(o)>0);
      const sum = withSum.reduce((s,o)=>s+objVal(o),0);
      const cost = withSum.reduce((s,o)=>s+objCost(o),0);
      const profit = sum-cost;
      const inwork = mos.filter(o=>o.status==="approval").length;
      const done = mos.filter(o=>o.status==="signed").length;
      const activeLeads = mos.filter(o=>o.status!=="archive").length;
      const conv = activeLeads>0 ? Math.round(done/activeLeads*100) : 0;
      return {name:m, count:mos.length, sum, profit, margin: sum>0?Math.round(profit/sum*100):0, sent:inwork, agreed:done, conv};
    }).sort((a,b)=>b.profit-a.profit);

    // ── E. Динамика по месяцам (по объектам, их сумме и конверсии) ──
    const monthMap = {};
    for(const o of baseObjs){
      if(o.status==="archive") continue;
      const d = new Date(o.createdAt||o.updatedAt||0);
      const key = d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");
      if(!monthMap[key]) monthMap[key]={key, revenue:0, cost:0, total:0, signed:0};
      monthMap[key].revenue += objVal(o);
      monthMap[key].cost += objCost(o);
      monthMap[key].total += 1;
      if(o.status==="signed") monthMap[key].signed += 1;
    }
    const MONTH_RU = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];
    const monthly = Object.values(monthMap).sort((a,b)=>a.key.localeCompare(b.key)).slice(-12).map(m=>{
      const [y,mo]=m.key.split("-");
      return {...m, label: MONTH_RU[Number(mo)-1]+" "+y.slice(2), profit:m.revenue-m.cost, conv:m.total>0?Math.round(m.signed/m.total*100):0};
    });

    // ── F. «Зависшие» объекты в работе (без движения 14+ дней) ──
    const STALE_DAYS = 14;
    const nowMs = Date.now();
    const staleSent = objects
      .filter(o=>o.status==="approval")
      .map(o=>({e:{id:o.id, proj:{name:o.clientName||o.address||"Объект", phone:o.clientPhone}, total:objVal(o), _obj:o}, days: Math.floor((nowMs-(o.updatedAt||0))/864e5)}))
      .filter(x=>x.days>=STALE_DAYS)
      .sort((a,b)=>b.days-a.days)
      .slice(0,10);
    const TYPE_L2 = {repair_fiz:"Договор ремонта",annex:"Приложение",design:"Дизайн-проект",design_add:"Доп. соглашение",reservation:"Бронирование"};
    const byConType = {}; for(const c of baseCon){ const t=TYPE_L2[c.type||"repair_fiz"]||"--"; byConType[t]=(byConType[t]||0)+1; }

    // ── G. Средний цикл сделки (от создания до подписания, в днях) ──
    const signedObjs = baseObjs.filter(o=>o.status==="signed"&&o.createdAt&&o.updatedAt&&o.updatedAt>o.createdAt);
    const avgDealDays = signedObjs.length>0 ? Math.round(signedObjs.reduce((s,o)=>s+Math.floor((o.updatedAt-o.createdAt)/864e5),0)/signedObjs.length) : null;
    // Среднее время «зависания» открытых сделок в согласовании (от создания до сейчас)
    const approvalOpen = liveObjects.filter(o=>o.status==="approval"&&(!statsManager||(o.manager||"")===statsManager));
    const avgApprovalDays = approvalOpen.length>0 ? Math.round(approvalOpen.reduce((s,o)=>s+Math.floor((nowMs-(o.createdAt||o.updatedAt||nowMs))/864e5),0)/approvalOpen.length) : null;

    // ── H. Конверсия по типу объекта (архив не в знаменателе — искажал бы конверсию) ──
    const convByType = {};
    for(const o of baseObjs){
      if(o.status==="archive") continue;
      const t = o.objType||"Вторичка";
      if(!convByType[t]) convByType[t]={total:0,signed:0,sumAll:0,sumSigned:0};
      convByType[t].total++;
      convByType[t].sumAll += objVal(o);
      if(o.status==="signed"){ convByType[t].signed++; convByType[t].sumSigned+=objVal(o); }
    }

    // ── I. Топ-5 объектов периода по сумме ──
    const topObjects = [...withSumEst].sort((a,b)=>objVal(b)-objVal(a)).slice(0,5);

    return { baseEst: baseObjs, baseCon, totalEst, withSumEst, totalSumEst, avgEst, totalCon, totalSumCon, avgCon, byStatus, byType, topCats, managers, managerStats, byConType, TYPE_L2,
      wonRevenue, wonCost, wonProfit, wonMargin, allRevenue, allCost, allProfit, allMargin,
      funnel, winRateOverall, winRateSent, signedB, refuseB, catProfit, monthly, staleSent,
      avgDealDays, avgApprovalDays, signedObjsCount: signedObjs.length, convByType, topObjects, objVal };
  }, [estimates, contracts, objects, statsPeriod, statsDateFrom, statsDateTo, statsManager, allUsers, catalogVersion]);

  // Защита от краша: если activeCat не в Gdyn — берём первый
  const safeCat = Gdyn[activeCat] ? activeCat : (Object.keys(Gdyn)[0]||"");
  const subs = Object.keys(Gdyn[safeCat] || {});
  const safeActiveSub = subs.includes(activeSub) ? activeSub : (subs[0]||"");

  // ── Перенести смету (и её доп. сметы) в новый объект ──
  const moveEstimateToObject = async (est) => {
    if (est.objectId) { window.alert("Эта смета уже привязана к объекту"); return; }
    const p = est.proj || {};
    if (!window.confirm(`Создать объект из сметы «${p.name||"Без названия"}» и перенести её туда?`)) return;
    const objId = genId();
    const newObj = {
      id: objId,
      clientId:"", clientName: p.name||"", clientPhone: p.phone||"", clientType:"физ",
      clientIin:"", clientDoc:"", address: p.address||"", objType: p.type||"Вторичка",
      area: p.area||"", status:"approval", note:"",
      manager: est.proj?.manager || currentUser.name,
      createdBy: est.createdBy || currentUser.name, createdById: currentUser.id,
      createdAt: est.createdAt || Date.now(), updatedAt: Date.now(),
    };
    // привязываем смету + все её доп. сметы
    const childIds = new Set(estimatesRef.current.filter(e=>e.parentId===est.id).map(e=>e.id));
    const newList = estimatesRef.current.map(e=>{
      if (e.id===est.id || childIds.has(e.id)) return {...e, objectId: objId};
      return e;
    });
    await saveObjects([newObj, ...objectsRef.current]);
    await saveEstimates(newList, { replace:true });
    window.alert(`Объект создан ✓ Смета перенесена в «Объекты»`);
  };

  // ── Открыть смету на редактирование ──
  const openEstimate = (est) => {
    setCurrentId(est.id);
    setCurrentParentId(est.parentId || null);
    setCurrentDsNumber(est.dsNumber || null);
    setCurrentObjectId(est.objectId || null);
    const validNames = new Set(nonViewerUsers.map(u=>u.name));
    const p = est.proj || {...EMPTY_PROJ};
    setProj({...p, manager: validNames.has(p.manager||"") ? p.manager : ""});
    setRows(migrateRowsToCodeKeys(est.rows || {}, getEffectiveCatalog()));
    setDiscount(est.discount || 0);
    setMarkup(est.markup || 0);
    setNote(est.note || "");
    setEstStatus(est.status || "new");
    setEstSentAt(est.sentAt || "");
    setEstComment(est.comment || "");
    setSearch("");
    setActiveCat(cats[0]);
    setActiveSub(Object.keys(Gdyn[cats[0]]||{})[0]);
    setScreen("editor");
  };

  // ── Новая смета ──
  const newEstimate = () => {
    const id = genId();
    setCurrentId(id);
    setCurrentParentId(null);
    setCurrentDsNumber(null);
    setCurrentObjectId(null);
    setProj({...EMPTY_PROJ, manager: currentUser.name, _createdBy: currentUser.name, _createdById: currentUser.id});
    setRows({});
    setDiscount(0);
    setMarkup(0);
    setNote("");
    setEstStatus("new");
    setEstSentAt("");
    setEstComment("");
    setSearch("");
    setActiveCat(cats[0]);
    setActiveSub(Object.keys(Gdyn[cats[0]]||{})[0]);
    setScreen("editor");
  };

  // ── Сохранить текущую и вернуться к списку ──
  // Вернуться из редактора сметы туда, откуда пришли (к объекту или в список смет)
  const _backFromEditor = () => {
    const retObjId = objectReturnId || currentObjectId;
    if (retObjId) {
      const obj = objectsRef.current.find(x=>x.id===retObjId);
      setObjectReturnId(null);
      setObjectTab("workspace");
      setScreen("objects");
      if (obj) setCurrentObject({...obj});
      return;
    }
    if (dealReturnId) {
      const dl = dealsRef.current.find(x=>x.id===dealReturnId);
      setDealReturnId(null);
      if (dl) { setCurrentDeal({...dl}); setDealTab("editor"); setScreen("deals"); return; }
    }
    setScreen("list");
  };
  const saveAndBack = async () => {
    const cur = estimatesRef.current;
    const exists = cur.find(e => e.id === currentId);
    // ЗАЩИТА: не затирать смету с позициями пустой версией (если не явный сброс)
    if (exists && countFilled(exists.rows) > 0 && countFilled(rows) === 0 && !_allowEmptySave.current) {
      if (_autoSaveRef.current) clearTimeout(_autoSaveRef.current);
      _backFromEditor();
      return;
    }
    const _ep = exists?.parentId && exists.parentId!==currentId ? exists.parentId : null;
    const pId = currentParentId || _ep;
    const dsN = pId ? (currentDsNumber || exists?.dsNumber) : null;
    const updated = {
      id: currentId,
      proj, rows, discount, markup, note,
      status: estStatus,
      sentAt: estStatus === "sent" ? (estSentAt || exists?.sentAt || new Date().toISOString().slice(0,10)) : (exists?.sentAt || null),
      comment: estComment,
      createdAt: exists?.createdAt || Date.now(),
      createdBy: exists?.createdBy || currentUser.name,
      updatedAt: Date.now(),
      updatedBy: currentUser.name,
      total: final,
      ...((currentObjectId || exists?.objectId) ? {objectId: currentObjectId || exists.objectId} : {}),
      ...(pId ? {parentId:pId, dsNumber:dsN} : {}),
    };
    updated.history = _appendHistory(exists, updated);
    const newList = exists
      ? cur.map(e => e.id === currentId ? updated : e)
      : [updated, ...cur];
    if (_autoSaveRef.current) clearTimeout(_autoSaveRef.current);
    estimatesRef.current = newList;
    setEstimates(newList);
    // Навигируем сразу (не ждём облако), сохраняем в фоне — иначе кнопка «не нажимается» при медленном сохранении
    const retObj = objectReturnId;
    const retDeal = dealReturnId;
    _backFromEditor();
    saveEstimates(newList);
    // если редактировали смету объекта — обновляем updatedAt объекта (фон)
    if (retObj) {
      const obj = objectsRef.current.find(x=>x.id===retObj);
      if (obj) {
        const updObj = {...obj, updatedAt: Date.now()};
        const rest = objectsRef.current.filter(x=>x.id!==obj.id);
        saveObjects([...rest, updObj]);
      }
    }
    // если редактировали смету сделки — синхронизируем итог обратно в сделку (фон)
    if (retDeal) {
      const dl = dealsRef.current.find(x=>x.id===retDeal);
      if (dl) {
        const updDeal = {...dl, estId: currentId, total: final, updatedAt: Date.now()};
        const rest = dealsRef.current.filter(x=>x.id!==dl.id);
        saveDeals([...rest, updDeal]);
      }
    }
  };

  // ── Новая доп. смета (ДС) к существующей ──
  const newSupplementaryEstimate = (parentEst) => {
    const cur = estimatesRef.current;
    const siblings = cur.filter(e => e.parentId === parentEst.id);
    const dsNumber = siblings.length + 1;
    const id = genId();
    setCurrentId(id);
    setCurrentParentId(parentEst.id);
    setCurrentDsNumber(dsNumber);
    setCurrentObjectId(parentEst.objectId || null);
    setProj({...(parentEst.proj||EMPTY_PROJ), manager: currentUser.name});
    setRows({});
    setDiscount(0);
    setMarkup(parentEst.markup||0);
    setNote("");
    setEstStatus("new");
    setEstSentAt("");
    setEstComment("");
    setSearch("");
    setActiveCat(cats[0]);
    setActiveSub(Object.keys(Gdyn[cats[0]]||{})[0]);
    // Сохраняем parentId до открытия редактора — автосохранение подхватит
    const newEst = {id, parentId: parentEst.id, dsNumber, ...(parentEst.objectId?{objectId:parentEst.objectId}:{}), proj:{...(parentEst.proj||EMPTY_PROJ)}, rows:{}, discount:0, markup:parentEst.markup||0, note:"", status:"new", comment:"", createdAt:Date.now(), createdBy:currentUser.name, updatedAt:Date.now(), updatedBy:currentUser.name, total:0};
    const newList = [newEst, ...cur];
    estimatesRef.current = newList;
    setEstimates(newList);
    saveEstimates(newList);
    setScreen("editor");
  };

  // ── Удалить смету ──
  const deleteEstimate = async (id) => {
    const newList = estimatesRef.current.filter(e => e.id !== id);
    estimatesRef.current = newList;
    setEstimates(newList);
    // явное удаление — разрешаем пустой результат и удаляем по id из объединённого набора
    _allowEmptySave.current = true;
    await saveEstimates(newList, { removedIds: [id] });
    setTimeout(() => { _allowEmptySave.current = false; }, 1000);
    setDeleteConfirm(null);
  };



  // ── Генерация HTML договора ──
  const buildContractHtml = (c, client, ca, forDocx=false, stamp=stampBase64) => {
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
    const total = (c.works||[]).reduce((s,w)=>s+(Number(w.quantity)*Number(w.price)||0),0);
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
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Договор №${c.number||""}</title><style>${CSS}</style></head>
  <body>${body}${printBtn}
  </body></html>`;
    return html;
  };

  // Адаптер: договор подряда (тип podryad/podryad_annex) из формы редактора → модель для buildPodryadHtml
  const podryadContractToModel = (c, worker, withStamp=false) => ({
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
  const generateContractPdf = (c, client, ca, withStamp=true) => {
    if (c.type==="podryad" || c.type==="podryad_annex") {
      const worker = workersRef.current.find(w=>w.id===c.workerId) || null;
      openOrPrintHtml(buildPodryadHtml(podryadContractToModel(c, worker, withStamp)), 20000);
      return;
    }
    const stampFile = ca?.stampFile || "stamp.jpg";
    const stamp = withStamp ? (stampsBase64[stampFile] || stampBase64) : "";
    const html = buildContractHtml(c, client, ca, false, stamp);
    openOrPrintHtml(html, 20000);
  };

  // ТЕСТ: смета сделки = настоящая смета (estId). Работы для договора/печати берём из неё.
  const estimateToWorks = (est) => {
    if (!est) return [];
    const catalog = getEffectiveCatalog();
    const mm = 1 + (est.markup||0)/100;
    return Object.entries(est.rows||{}).filter(([,r])=>Number(r?.qty)>0).map(([key,r])=>{
      const w = catalog.find(x=>x.name===key)||catalog.find(x=>x.code===key);
      if(!w) return null;
      const qty = Number(r.qty||0);
      const cpxPct = r.cpxPct!==undefined ? Number(r.cpxPct) : undefined;
      const rawPrice = r.manualPrice!==undefined && r.manualPrice!=="" ? Number(r.manualPrice) : getPrice(w, qty, r.complexity||"std", cpxPct);
      const price = rawPrice ? rawPrice*mm : 0;
      const displayName = r.manualName!==undefined ? r.manualName : w.name;
      const displayUnit = r.manualUnit!==undefined ? r.manualUnit : (w.unit||"м²");
      return {name:displayName,quantity:qty,unit:displayUnit,price:price?Math.round(price):0};
    }).filter(Boolean);
  };
  const dealEstimate = (deal) => estimatesRef.current.find(e=>e.id===deal.estId) || null;
  const dealToContract = (deal) => {
    const est = dealEstimate(deal);
    return {
      type:"repair_fiz", number:deal.contractNumber||"", date:deal.contractDate||new Date().toISOString().slice(0,10),
      clientId:deal.clientId, contragentId:deal.contragentId, works:estimateToWorks(est), discount:(est?.discount)||0,
      advancePercent:deal.advancePercent??30, note:deal.note||"",
    };
  };
  // Открыть/создать настоящую смету для сделки (полный редактор с каталогом)
  const openDealEstimate = (deal) => {
    setDealReturnId(deal.id);
    let est = dealEstimate(deal);
    if (!est) {
      const cl = contractClients.find(x=>x.id===deal.clientId);
      const id = genId();
      est = {
        id, proj:{...EMPTY_PROJ, name:cl?.name||"", phone:cl?.phone||"", address:deal.address||cl?.address||"", type:deal.objType||"Вторичка", area:deal.area||"", manager:deal.manager||currentUser.name},
        rows:{}, discount:0, markup:0, note:"", status:"new", comment:"", _dealId:deal.id,
        createdAt:Date.now(), createdBy:currentUser.name, updatedAt:Date.now(), updatedBy:currentUser.name, total:0,
      };
      const newList = [est, ...estimatesRef.current];
      estimatesRef.current = newList; setEstimates(newList); saveEstimates(newList);
      const upd = {...deal, estId:id};
      setCurrentDeal(upd);
      const dl = dealsRef.current.filter(x=>x.id!==deal.id);
      saveDeals([...dl, upd]);
    }
    openEstimate(est);
  };
  const generateDealContractPdf = (deal, withStamp=true) => {
    const client = contractClients.find(x=>x.id===deal.clientId);
    const ca = contragents.find(x=>x.id===deal.contragentId);
    generateContractPdf(dealToContract(deal), client, ca, withStamp);
  };
  const generateDealEstimatePdf = (deal) => {
    const client = contractClients.find(x=>x.id===deal.clientId);
    const est = dealEstimate(deal);
    const works = estimateToWorks(est).filter(w=>w.name);
    const total = works.reduce((s,w)=>s+(Number(w.quantity)*Number(w.price)||0),0);
    const dPct = est?.discount||0;
    const disc = Math.round(total*dPct/100);
    const final = total - disc;
    const esc = s => String(s||"").replace(/[&<>]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[m]));
    const rows = works.map((w,i)=>`<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${i+1}</td><td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(w.name)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center">${w.quantity||0}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center">${esc(w.unit||"м²")}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${fmt(w.price||0)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;font-weight:600">${fmt((Number(w.quantity)*Number(w.price))||0)}</td></tr>`).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Смета ${esc(client?.name||deal.address||"")}</title>
    <style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Inter',sans-serif;color:#111827;padding:28px}@page{margin:10mm;size:A4 portrait}h1{font-size:20px}table{width:100%;border-collapse:collapse;font-size:13px;margin-top:14px}th{background:#f3f4f6;padding:8px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase}.no-print{margin-top:20px;text-align:center}@media print{.no-print{display:none}}</style></head><body>
    <h1>Смета на ремонтные работы</h1>
    <div style="color:#6b7280;font-size:13px;margin-top:6px;line-height:1.6">
      ${client?.name?`Заказчик: <b>${esc(client.name)}</b><br>`:""}
      ${deal.address?`Объект: ${esc(deal.address)}<br>`:""}
      Дата: ${new Date().toLocaleDateString("ru-RU")}
    </div>
    <table><thead><tr><th>№</th><th>Наименование</th><th style="text-align:center">Кол-во</th><th style="text-align:center">Ед.</th><th style="text-align:right">Цена</th><th style="text-align:right">Сумма</th></tr></thead><tbody>${rows}</tbody></table>
    <div style="margin-top:16px;text-align:right;font-size:14px">
      ${disc>0?`Сумма: ${fmt(total)} ₸<br><span style="color:#dc2626">Скидка ${dPct}%: −${fmt(disc)} ₸</span><br>`:""}
      <div style="font-size:20px;font-weight:800;margin-top:6px">Итого: ${fmt(final)} ₸</div>
    </div>
    <div class="no-print"><button onclick="window.print()" style="padding:12px 32px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:15px;cursor:pointer;font-weight:700;font-family:inherit">🖨 Сохранить PDF</button></div>
    </body></html>`;
    openOrPrintHtml(html, 30000);
  };

  const generateContractDocx = async (c, client, ca) => {
    const clientName = client?.name || c.estClient || "договор";
    const num = c.number || c.id?.slice(-4) || "б-н";
    const dateStr = c.date ? c.date.split("-").reverse().join(".") : "";
    const isAnnexD = (c.type||"repair_fiz") === "annex";
    const docLabel = {repair_fiz:"Договор ремонта",annex:"Приложение",design:"Соглашение о дизайн-проекте",design_add:"Доп соглашение к дизайн-проекту",reservation:"Соглашение о резервировании"}[c.type||"repair_fiz"] || "Договор";
    const filename = isAnnexD
      ? ("Приложение №"+(c.appendix||2)+" Перечень доп работ к Договору №"+(c.mainNumber||num)+(dateStr?" от "+dateStr:"")+".docx").replace(/[<>:"/\\|?*]/g,"_")
      : (docLabel+" №"+num+" "+clientName+(dateStr?" от "+dateStr:"")+".docx").replace(/[<>:"/\\|?*]/g,"_");

    try {
    if (!window.docx) {
      await new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = "https://unpkg.com/docx@7.8.2/build/index.js";
        s.onload = () => { if(window.docx) res(); else rej(new Error("docx not in window")); };
        s.onerror = () => rej(new Error("Failed to load docx.js"));
        document.head.appendChild(s);
      });
    }
    const D = window.docx;
    if (!D || !D.Document) { alert("Ошибка загрузки библиотеки DOCX. Проверьте интернет."); return; }
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
    const total = (c.works||[]).reduce((s,w)=>s+(Number(w.quantity||0)*Number(w.price||0)),0);
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

  const generateContractGDoc = async (c, client, ca) => {
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
      ? buildPodryadHtml(podryadContractToModel(c, workersRef.current.find(w=>w.id===c.workerId)||null, false))
      : buildContractHtml(c, client, ca, true, "");

    // Загружаем Google Identity Services если ещё нет
    const loadGIS = () => new Promise((res, rej) => {
      if (window.google?.accounts?.oauth2) { res(); return; }
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.onload = () => res();
      s.onerror = () => rej(new Error("Не удалось загрузить Google API"));
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

  const sendContractWhatsApp = async (c, client, ca) => {
    const clientName = client?.name || c.estClient || "договор";
    const num = c.number || c.id?.slice(-4) || "б-н";
    const dateStr2 = c.date ? c.date.split("-").reverse().join(".") : "";
    const docLabel2 = {repair_fiz:"Договор ремонта",annex:"Приложение",design:"Соглашение о дизайн-проекте",design_add:"Доп соглашение к дизайн-проекту",reservation:"Соглашение о резервировании"}[c.type||"repair_fiz"] || "Договор";
    const safeName = (docLabel2+" №"+num+" "+clientName+(dateStr2?" от "+dateStr2:"")).replace(/[<>:"/\\|?*]/g,"_");
    const phone = (client?.phone||"").replace(/\D/g,"");

    // Пробуем Web Share API (работает на мобильных)
    if(navigator.canShare) {
      try {
        // Генерируем PDF blob через html-docx или просто HTML
        const html = buildContractHtml(c, client, ca, true, "");
        let fileToShare = null;
        const docBlob = new Blob([html], {type:"application/msword;charset=utf-8"});
        fileToShare = new File([docBlob], safeName+".doc", {type:"application/msword"});
        if(navigator.canShare({files:[fileToShare]})) {
          await navigator.share({files:[fileToShare], title:`Договор №${num}`, text:`Договор для ${clientName}`});
          return;
        }
      } catch(e) {
        if(e.name==="AbortError") return; // пользователь отменил
        // fallback ниже
      }
    }
    // Fallback: скачать DOC + открыть WhatsApp
    {
      const html = buildContractHtml(c, client, ca, true, "");
      const docBlob = new Blob([html], {type:"application/msword;charset=utf-8"});
      const url = URL.createObjectURL(docBlob);
      const a = document.createElement("a");
      a.href = url; a.download = safeName+".doc"; a.click();
      setTimeout(()=>URL.revokeObjectURL(url),20000);
    }
    // Открываем WhatsApp с коротким сообщением
    const msg = encodeURIComponent(`Договор №${num} для ${clientName} — файл отправлен отдельно`);
    const waUrl = phone ? `https://wa.me/${phone}?text=${msg}` : `https://wa.me/?text=${msg}`;
    setTimeout(()=>window.open(waUrl,"_blank"), 500);
  };

  // ── Экспорт сметы в JSON ──
  const exportJSON = (est) => {
    const catalog = getEffectiveCatalog();
    const works = [];
    const rows = est.rows || {};
    for (const [key, r] of Object.entries(rows)) {
      const qty = Number(r.qty || 0);
      if (qty <= 0) continue;
      const w = catalog.find(x => x.name === key) || catalog.find(x => x.code === key);
      if (!w) continue;
      const price = getPrice(w, qty, r.complexity || "std");
      works.push({
        code: w.code || null,
        name: w.name,
        category: w.cat,
        subcategory: w.sub,
        quantity: qty,
        unit: w.unit || "м²",
        pricePerUnit: price ? Math.round(price) : 0,
        total: price ? Math.round(price * qty) : 0,
      });
    }
    const totalAmount = est.total || 0; // est.total already has discount applied
    const json = {
      estimateInfo: {
        id: est.id,
        name: est.proj?.name || "Без названия",
        date: new Date(est.createdAt || Date.now()).toISOString().split("T")[0],
        client: est.proj?.name || null,
        clientPhone: est.proj?.phone || null,
        manager: est.proj?.manager || est.createdBy || null,
        objectType: est.proj?.type || null,
        address: est.proj?.address || null,
        area: est.proj?.area ? Number(est.proj.area) : null,
        notes: est.note || null,
        discount: est.discount || 0,
      },
      works,
      summary: {
        totalItems: works.length,
        totalQuantity: Math.round(works.reduce((s, w) => s + w.quantity, 0) * 100) / 100,
        subtotal: est.total || 0,
        discount: est.discount || 0,
        totalAmount,
        currency: "KZT",
      },
      exportDate: new Date().toISOString(),
      version: "1.0",
    };
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const clientSlug = (est.proj?.name || "смета").toLowerCase().replace(/\s+/g, "-").replace(/[^a-zа-яё0-9-]/gi, "");
    const dateSlug = new Date(est.createdAt || Date.now()).toISOString().split("T")[0];
    a.href = url;
    a.download = `смета-${clientSlug}-${dateSlug}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  // ── Следующий свободный номер договора ──
  // Берём максимальный числовой префикс из номеров существующих договоров и +1.
  const nextContractNumber = useCallback(() => {
    let max = 0;
    for (const c of (contractsRef.current || [])) {
      const m = String(c.number || "").match(/\d+/);   // первая группа цифр
      if (m) { const n = parseInt(m[0], 10); if (n > max) max = n; }
    }
    return String(max + 1).padStart(4, "0");           // напр. "0007"
  }, []);

  // ── Дублировать смету ──
  const duplicateEstimate = async (est) => {
    const id = genId();
    const copy = {
      ...est,
      id,
      proj: { ...est.proj, name: (est.proj?.name || "Без названия") + " (копия)" },
      createdAt: Date.now(),
      createdBy: currentUser.name,
      updatedAt: Date.now(),
      updatedBy: currentUser.name,
    };
    // Копия не должна оставаться ДС того же родителя (иначе дубль dsNumber)
    delete copy.parentId;
    delete copy.dsNumber;
    const cur = estimatesRef.current;
    const newList = [copy, ...cur];
    estimatesRef.current = newList;
    setEstimates(newList);
    await saveEstimates(newList);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // РЕНДЕР
  // ─────────────────────────────────────────────────────────────────────────
  const NAV_ITEMS = useMemo(() => {
    const r = currentUser.role;
    const isAdmin = r === "admin", isMgr = r === "manager", isForeman = r === "foreman", isUser = r === "user", isViewer = r === "viewer";
    return [
      ...(isAdmin||isMgr||isUser ? [{ id:"dashboard", icon:"⌂",  label:"Главная" }] : []),
      { id:"objects", icon:"📦", label:"Объекты" },
      ...(isAdmin||isMgr||isForeman ? [{ id:"production", icon:"🏗", label:"Производство" }] : []),
      ...(!isViewer&&!isForeman ? [{ id:"contracts", icon:"📄", label:"Прочие документы", short:"Документы" }] : []),
      ...(isAdmin||isMgr ? [{ id:"analytics", icon:"📊", label:"Аналитика" }] : []),
      ...(isAdmin||isMgr ? [{ id:"finance", icon:"💰", label:"Финансы" }] : []),
      ...(isAdmin ? [{ id:"admin", icon:"⚙️", label:"Админка" }] : []),
    ];
  }, [currentUser.role]);

  // Роли доступа
  const _r = currentUser.role;
  const _isAdmin = _r === "admin", _isMgr = _r === "manager", _isForeman = _r === "foreman", _isUser = _r === "user", _isViewer = _r === "viewer";
  // Эффективный экран с учётом ограничений роли
  const effScreen = (() => {
    if (_isViewer && (screen==="dashboard"||screen==="analytics"||screen==="admin"||screen==="deals"||screen==="finance"||screen==="production")) return "objects";
    if (_isForeman && (screen==="analytics"||screen==="finance"||screen==="contracts"||screen==="dashboard"||screen==="admin")) return "production";
    if (_isUser && (screen==="analytics"||screen==="finance"||screen==="production"||screen==="admin")) return "objects";
    if (!_isAdmin && !_isMgr && screen==="finance") return "objects";
    if (!_isAdmin && screen==="admin") return "objects";
    return screen;
  })();
  // Руководитель видит финансы только для чтения
  const finReadonly = _isMgr;

  return (
    <div style={{fontFamily:"'Inter','Segoe UI',sans-serif",background:"#f8fafc",minHeight:"100vh",color:"#0f172a",display:"flex",flexDirection:"column"}}>
      {/* Баннер: данные не загрузились — редактирование опасно */}
      {loadError && (
        <div style={{position:"fixed",top:0,left:0,right:0,zIndex:500,background:"#dc2626",color:"#fff",padding:"10px 16px",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:12,boxShadow:"0 2px 8px rgba(0,0,0,.2)"}}>
          ⚠️ Не удалось загрузить данные из базы. НЕ редактируйте сметы — сохранение отключено для защиты данных.
          <button onClick={()=>window.location.reload()} style={{background:"#fff",color:"#dc2626",border:"none",borderRadius:8,padding:"5px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Обновить</button>
        </div>
      )}
      {!loadError && cloudError && (
        <div style={{position:"fixed",top:0,left:0,right:0,zIndex:500,background:"#d97706",color:"#fff",padding:"10px 16px",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:12,boxShadow:"0 2px 8px rgba(0,0,0,.2)"}}>
          ⚠️ Данные сохранены ТОЛЬКО на этом устройстве — облако недоступно. На других устройствах изменений не будет. Проверьте интернет/правила Firebase.
          <button onClick={()=>setCloudError(false)} style={{background:"#fff",color:"#d97706",border:"none",borderRadius:8,padding:"5px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Скрыть</button>
        </div>
      )}
      {/* Панель администратора */}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Poppins:wght@600;700;800;900&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        html,body{background:#f8fafc;overflow-x:hidden;width:100%;font-family:'Inter','Segoe UI',sans-serif;color:#0f172a}
        h1,h2,h3{font-family:'Poppins','Inter',sans-serif;letter-spacing:-.02em;color:#0f172a}
        input,select,textarea{outline:none}
        ::-webkit-scrollbar{width:5px}
        ::-webkit-scrollbar-track{background:#f1f5f9}
        ::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:4px}
        ::-webkit-scrollbar-thumb:hover{background:#94a3b8}
        .fi{background:#ffffff;border:1px solid #e2e8f0;color:#0f172a;border-radius:8px;padding:9px 13px;font-family:inherit;font-size:14px;width:100%;box-sizing:border-box;transition:border-color .15s,box-shadow .15s;outline:none}
        .fi:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.12)}
        .fi::placeholder{color:#94a3b8}
        .tab-btn{background:none;border:none;cursor:pointer;padding:7px 16px;border-radius:8px;font-family:inherit;font-size:13px;font-weight:500;color:#64748b;transition:all .15s;white-space:nowrap}
        .tab-btn:hover{color:#0f172a;background:#f1f5f9}
        .tab-btn.active{background:#eff6ff;color:#2563eb;font-weight:600}
        .sub-btn{background:none;border:none;cursor:pointer;padding:5px 10px;border-radius:6px;font-family:inherit;font-size:11.5px;color:#475569;transition:all .15s;white-space:nowrap}
        .sub-btn:hover{color:#0f172a;background:#f1f5f9}
        .sub-btn.active{background:#e2e8f0;color:#0f172a;font-weight:600}
        .wrow{display:grid;align-items:start;padding:9px 14px;border-radius:8px;gap:8px;transition:background .12s;min-width:0}
        .wrow:hover{background:#f8fafc}
        .wrow.on{background:#eff6ff}
        .num{background:#ffffff;border:1px solid #e2e8f0;color:#0f172a;border-radius:8px;padding:6px 8px;text-align:right;font-family:inherit;font-size:13px;transition:border-color .15s,box-shadow .15s;outline:none}
        .num:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.12)}
        .num::placeholder{color:#94a3b8}
        .cpx-sel{background:#ffffff;border:1px solid #e2e8f0;color:#334155;border-radius:8px;padding:4px 6px;font-family:inherit;font-size:11px;margin-top:4px;cursor:pointer;width:auto;max-width:130px;transition:border-color .15s}
        .cpx-sel:focus{border-color:#2563eb}
        .card{background:#ffffff;box-shadow:0 1px 3px rgba(15,23,42,.07),0 4px 16px rgba(15,23,42,.04);border:1px solid #e2e8f0;border-radius:12px;overflow:hidden}
        .btn{border:none;cursor:pointer;padding:10px 20px;border-radius:8px;font-family:inherit;font-size:13px;font-weight:600;transition:all .15s;letter-spacing:.1px}
        .btn-g{background:#2563eb;color:#ffffff;box-shadow:0 1px 2px rgba(37,99,235,.3)}
        .btn-g:hover{background:#1d4ed8;box-shadow:0 4px 12px rgba(37,99,235,.35);transform:translateY(-1px)}
        .btn-g:active{transform:translateY(0)}
        .btn-g:disabled{opacity:.4;cursor:not-allowed;transform:none;box-shadow:none}
        .btn-o{background:#ffffff;color:#334155;border:1px solid #e2e8f0;box-shadow:0 1px 2px rgba(15,23,42,.05)}
        .btn-o:hover{background:#f8fafc;color:#0f172a;border-color:#cbd5e1;box-shadow:0 2px 6px rgba(15,23,42,.08)}
        .btn-red{background:rgba(220,38,38,.07);color:#dc2626;border:1px solid rgba(220,38,38,.15)}
        .btn-red:hover{background:rgba(220,38,38,.14);border-color:rgba(220,38,38,.3)}
        .badge{background:#eff6ff;color:#2563eb;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:600;border:1px solid rgba(37,99,235,.15)}
        @keyframes up{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .up{animation:up .2s ease forwards}
        .page{max-width:960px;margin:0 auto;padding:32px 36px 80px}
        @media(min-width:900px){.main-grid{grid-template-columns:minmax(0,1fr) 295px!important}}
        @media(max-width:700px){
          .editor-header{gap:6px!important;padding:8px 12px!important;top:env(safe-area-inset-top,0px)!important;flex-wrap:wrap!important;row-gap:6px!important}
          .editor-header-right .proj-name{display:none}
          .tab-btn{padding:5px 10px;font-size:12px}
          .sub-btn{padding:4px 8px;font-size:11px}
          .wrow{grid-template-columns:1fr auto!important;gap:4px 10px!important;padding:10px 12px!important;align-items:center!important}
          .wrow-desk{display:none!important}
          .wrow-mob-extra{display:flex!important}
          .wrow-th{grid-template-columns:1fr auto!important}
          .cpx-sel{font-size:10px!important;padding:3px 4px!important;max-width:110px!important}
        }
        @media print{
          body *{display:none!important}
          #kp-print-portal{display:block!important;position:fixed;inset:0;background:#ffffff;padding:24px;z-index:9999;font-family:'Inter','Segoe UI',sans-serif}
          #kp-print-portal *{display:revert!important}
          .kp-no-print{display:none!important}
          @page{margin:10mm;size:A4 portrait}
        }
        .est-card{background:#ffffff;border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(15,23,42,.06);border-radius:12px;padding:16px 18px;cursor:pointer;transition:all .15s;position:relative}
        .est-card:hover{border-color:#93c5fd;background:#ffffff;box-shadow:0 6px 20px rgba(37,99,235,.1);transform:translateY(-2px)}
        .est-card:active{transform:scale(.99);box-shadow:0 1px 3px rgba(15,23,42,.06)}
        .sidebar{width:248px;background:#1e293b;border-right:1px solid #0f172a;display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;z-index:50;transition:width .2s ease}
        .sidebar.collapsed{width:64px}
        .nav-item{display:flex;align-items:center;gap:11px;padding:9px 13px;border-radius:9px;cursor:pointer;margin:2px 10px;transition:all .15s;position:relative}
        .nav-item:hover{background:rgba(148,163,184,.12)}
        .nav-item.active{background:linear-gradient(90deg,rgba(37,99,235,.25),rgba(37,99,235,.1))}
        .nav-item.active::before{content:"";position:absolute;left:-10px;top:7px;bottom:7px;width:3px;border-radius:0 3px 3px 0;background:#3b82f6}
        .nav-item .nav-ico{color:#94a3b8;transition:color .15s}
        .nav-item.active .nav-ico{color:#60a5fa}
        .nav-label{font-size:13.5px;font-weight:500;white-space:nowrap;overflow:hidden;transition:opacity .1s,width .1s;color:#94a3b8}
        .nav-item:hover .nav-label{color:#e2e8f0}
        .nav-item.active .nav-label{color:#f1f5f9;font-weight:600}
        .sidebar.collapsed .nav-label{opacity:0;width:0;pointer-events:none}
        .sidebar-content{margin-left:248px;transition:margin-left .22s cubic-bezier(.4,0,.2,1);min-height:100vh;background:#f8fafc}
        .sidebar-content.collapsed{margin-left:64px}
        @media(max-width:700px){
          .sidebar{display:none!important}
          .sidebar-content{margin-left:0!important;padding-top:env(safe-area-inset-top,0px)!important;padding-bottom:calc(68px + env(safe-area-inset-bottom,0px))!important}
          .mob-nav{display:flex!important}
          .page{padding:18px 14px 84px!important}
          .list-header,.contracts-header{padding:10px 14px!important;top:env(safe-area-inset-top,0px)!important}
          .list-pad{padding:16px 14px 0!important}
          .contracts-pad{padding:16px 14px!important}
          .an-filters{padding:14px!important}
          .an-row-fixed{flex-wrap:wrap!important}
          .btn{padding:10px 16px!important}
          .an-bar-label{width:104px!important;font-size:11px!important}
          .an-bar-right{width:88px!important;font-size:10px!important}
          .an-mtable-num{width:auto!important;min-width:48px!important}
          .user-row{flex-wrap:wrap!important}
          .user-row-btns{width:100%!important;justify-content:flex-end!important;margin-top:8px!important}
          /* Hero-баннеры: меньше отступов, скругление, без обрезки текста */
          .hero{padding:18px 18px!important;border-radius:14px!important;margin-bottom:16px!important}
          .hero h1{font-size:18px!important}
          /* KPI: ровно 2 колонки на телефоне */
          .kpi-grid{grid-template-columns:1fr 1fr!important;gap:10px!important}
          .kpi-grid>div{padding:14px 13px!important;border-radius:14px!important;min-width:0!important}
          .kpi-val{font-size:18px!important;overflow-wrap:anywhere!important}
          /* Категории работ: имя на отдельной строке, цифры ниже */
          .an-catrow{flex-wrap:wrap!important;row-gap:4px!important}
          .an-catrow .an-cat-name{flex:1 1 100%!important;white-space:normal!important;order:-1}
          .an-catrow>span:not(.an-cat-name){width:auto!important;flex:1!important;text-align:left!important;font-size:11px!important}
          /* Финансы: карточки и сетки в одну колонку */
          .fin-cards{grid-template-columns:1fr!important}
          .fin-dash-cards{grid-template-columns:1fr!important}
          .fin-tiles{grid-template-columns:1fr 1fr!important}
          .bal-grid{grid-template-columns:1fr!important}
          .bal-grid>div{border-right:none!important}
          .fin-tabs{overflow-x:auto!important;flex-wrap:nowrap!important;-webkit-overflow-scrolling:touch;padding-bottom:4px}
          .fin-tabs button{flex:0 0 auto!important}
          .fin-hero-stats{width:100%!important;justify-content:space-between!important;gap:14px!important}
          /* ДДС/ОПУ: корректный скролл на мобиле со sticky первой колонкой */
          .rep-wrap{
            -webkit-overflow-scrolling:touch!important;
            overflow-x:auto!important;
            overflow-y:auto!important;
            max-height:62vh!important;
            border-radius:10px!important;
          }
          .rep-table{font-size:11.5px!important;min-width:480px!important}
          .rep-table th,.rep-table td{padding:7px 8px!important;white-space:nowrap!important}
          .rep-table tbody td:first-child,.rep-table tbody th:first-child{position:sticky!important;left:0!important;z-index:2!important;background:#fff!important;min-width:130px!important;max-width:170px!important;white-space:normal!important;word-break:break-word!important}
          .rep-table thead th:first-child{position:sticky!important;left:0!important;z-index:6!important;min-width:130px!important}
        }
        @media(max-width:380px){
          .kpi-grid{grid-template-columns:1fr!important}
        }
        .mob-nav{display:none;position:fixed;bottom:0;left:0;right:0;background:#ffffff;border-top:1px solid #e2e8f0;z-index:50;box-shadow:0 -4px 16px rgba(15,23,42,.06);padding-bottom:env(safe-area-inset-bottom,0px)}
        .mob-nav-item{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px 4px;cursor:pointer;gap:3px;border-top:2px solid transparent;transition:all .15s}
        .mob-nav-item.active{border-top-color:#2563eb;background:rgba(37,99,235,.06)}
        .fin-row:hover{background:#f8fafc}
        .fin-row:hover{box-shadow:0 8px 24px rgba(15,23,42,.10)!important;transform:translateY(-2px)}
        /* ── rep-table: ДДС и ОПУ ─────────────────────────────── */
        .rep-wrap{width:100%;overflow:auto;max-height:calc(100vh - 200px);border:1px solid #e2e8f0;border-radius:12px;background:#fff}
        .rep-table{border-collapse:collapse;font-size:13px;width:100%;min-width:700px;background:#fff}
        /* Заголовок */
        .rep-table thead th{
          position:sticky;top:0;z-index:5;
          background:#fff;color:#64748b;
          font-size:11px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;
          padding:10px 16px;white-space:nowrap;
          border-bottom:2px solid #e2e8f0;
          text-align:right
        }
        .rep-table thead th:first-child{left:0;z-index:6;text-align:left;min-width:220px;max-width:280px}
        .rep-table thead th.colTot{background:#f8fafc;color:#0f172a;font-weight:700;border-left:1px solid #e2e8f0}
        /* Тело — базовые ячейки */
        .rep-table td{padding:9px 16px;white-space:nowrap;font-size:13px;border-bottom:1px solid #f1f5f9;text-align:right;color:#1e293b;background:#fff}
        .rep-table td:first-child{text-align:left;white-space:normal;word-break:break-word;min-width:220px;max-width:280px}
        /* sticky первая колонка */
        .rep-table tbody td:first-child,.rep-table tbody th:first-child{position:sticky;left:0;z-index:2}
        /* hover */
        .rep-table tbody tr:hover td{background:#f8fafc!important}
        /* итоговая колонка */
        .rep-table .colTot{background:#f8fafc;border-left:1px solid #e2e8f0}
        .rep-table tbody tr:hover .colTot{background:#f1f5f9!important}
        /* секционный заголовок-разделитель */
        .rep-section td{padding:8px 16px 6px!important;font-size:10.5px!important;font-weight:700!important;letter-spacing:.8px!important;text-transform:uppercase!important;color:#94a3b8!important;background:#f8fafc!important;border-top:1px solid #e2e8f0!important;border-bottom:1px solid #e2e8f0!important}
        /* строка итога секции */
        .rep-metric td{padding:11px 16px!important;font-weight:700!important;font-size:13.5px!important;background:#fff!important;border-top:2px solid #e2e8f0!important}
        .rep-metric td:first-child{font-weight:800!important}
        /* строка процента */
        .rep-pct td{padding:2px 16px 8px!important;font-size:11.5px!important;font-style:italic!important;color:#94a3b8!important;background:#fff!important;border-bottom:none!important}
        /* nostick */
        .rep-table.nostick tbody td:first-child{position:static}
        .rep-table.nostick thead th:first-child{left:auto}
      `}</style>

      {/* ── SIDEBAR (десктоп) ── */}
      <div className={"sidebar"+(sideCollapsed?" collapsed":"")}>
        {/* Лого */}
        <div style={{padding:"18px 16px",display:"flex",alignItems:"center",gap:11,borderBottom:"1px solid rgba(148,163,184,.12)",minHeight:64}}>
          <div style={{width:34,height:34,borderRadius:9,background:"linear-gradient(135deg,#3b82f6,#2563eb)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:15,color:"#ffffff",flexShrink:0,boxShadow:"0 3px 10px rgba(37,99,235,.5)"}}>T</div>
          <div className="nav-label" style={{lineHeight:1.25}}>
            <div style={{fontWeight:700,fontSize:15,color:"#f8fafc",fontFamily:"'Poppins',sans-serif"}}>TitovStroy</div>
            <div style={{fontSize:11,color:"#64748b"}}>{currentUser.name}</div>
          </div>
        </div>
        {/* Nav */}
        <nav style={{flex:1,padding:"12px 0",overflowY:"auto"}}>
          {NAV_ITEMS.map(item=>{
            const isActiveEst = effScreen==="editor" && !objectReturnId && item.id==="list";
            const isActiveObjEst = effScreen==="editor" && !!objectReturnId && item.id==="objects";
            const isActive = effScreen===item.id || isActiveEst || isActiveObjEst;
            return (
            <div key={item.id} className={"nav-item"+(isActive?" active":"")}
              onClick={()=>{ setDealReturnId(null); setObjectReturnId(null); navigate(item.id, undefined); }}>
              <span className="nav-ico" style={{fontSize:18,flexShrink:0,lineHeight:1}}>{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </div>
            );
          })}
        </nav>
        {/* Collapse + Выйти */}
        <div style={{borderTop:"1px solid rgba(148,163,184,.12)",padding:"10px 0"}}>
          <div className="nav-item" onClick={()=>{ setLogoutConfirm(true); }}>
            <span className="nav-ico" style={{fontSize:16,flexShrink:0}}>🚪</span>
            <span className="nav-label" style={{fontSize:13}}>Выйти</span>
          </div>
          <div className="nav-item" onClick={()=>setSideCollapsed(p=>!p)} style={{justifyContent:"center",marginTop:4}}>
            <span style={{fontSize:13,color:"#64748b"}}>{sideCollapsed?"▶":"◀"}</span>
          </div>
        </div>
      </div>

      {/* ── МОБИЛЬНАЯ НАВИГАЦИЯ ── */}
      <div className="mob-nav">
        {NAV_ITEMS.map(item=>{
          const isActiveEst = effScreen==="editor" && !objectReturnId && item.id==="list";
          const isActiveObjEst = effScreen==="editor" && !!objectReturnId && item.id==="objects";
          const isActive = effScreen===item.id || isActiveEst || isActiveObjEst;
          return (
          <div key={item.id} className={"mob-nav-item"+(isActive?" active":"")}
            onClick={()=>{ setDealReturnId(null); setObjectReturnId(null); navigate(item.id, undefined); }}>
            <span style={{fontSize:20}}>{item.icon}</span>
            <span style={{fontSize:9.5,color:isActive?"#2563eb":"#64748b",fontWeight:600,whiteSpace:"nowrap"}}>{item.short||item.label}</span>
          </div>
          );
        })}
      </div>

      {/* ── КОНТЕНТ ── */}
      <div className={"sidebar-content"+(sideCollapsed?" collapsed":"")}>

      {/* ═══════════════════════════════════════════════════════════════════
          ЭКРАН 0: ДАШБОРД
      ═══════════════════════════════════════════════════════════════════ */}
      {effScreen === "dashboard" && (()=>{
        const thisMonth = new Date().getMonth();
        const thisYear = new Date().getFullYear();
        const _inMonth = ts => { const d=new Date(ts||0); return d.getMonth()===thisMonth&&d.getFullYear()===thisYear; };
        // объекты и их суммы
        const _estByObjId = {}; for(const e of estimates){ if(e.objectId){ (_estByObjId[e.objectId]||(_estByObjId[e.objectId]=[])).push(e); } }
        const _objVal = o => (_estByObjId[o.id]||[]).reduce((s,e)=>s+(e.total||0),0);
        const _objCost = o => { const cat = getEffectiveCatalog(); const lk = new Map(); for(const w of cat){ if(w?.name)lk.set(w.name,w); if(w?.code)lk.set(w.code,w); } let c=0; for(const e of (_estByObjId[o.id]||[])){ for(const [k,r] of Object.entries(e.rows||{})){ const q=Number(r?.qty||0); if(!q) continue; const w=lk.get(k); if(w)c+=rowCostPerUnit(r,w)*q; } } return c; };
        // Только реально созданные в этом месяце объекты (импортированные миграцией исключаем — у них дата создания искусственная)
        const objectsThisMonth = liveObjects.filter(o=>o.status!=="archive"&&o.createdBy!=="migration"&&_inMonth(o.createdAt||0));
        const objectsWithSum = objectsThisMonth.filter(o=>_objVal(o)>0);
        const totalSumMonth = objectsWithSum.reduce((s,o)=>s+_objVal(o), 0);
        // Прибыль/маржа — по сделкам, ПОДПИСАННЫМ в этом месяце (updatedAt ≈ дата подписания);
        // импортированные миграцией исключаем — их updatedAt = дата импорта, а не реального подписания
        const signedMonth = liveObjects.filter(o=>o.status==="signed"&&o.createdBy!=="migration"&&_inMonth(o.updatedAt||o.createdAt||0)&&_objVal(o)>0);
        const signedRevMonth = signedMonth.reduce((s,o)=>s+_objVal(o), 0);
        const signedCostMonth = signedMonth.reduce((s,o)=>s+_objCost(o), 0);
        const profitMonth = signedRevMonth - signedCostMonth;
        const marginMonth = signedRevMonth>0 ? Math.round(profitMonth/signedRevMonth*100) : 0;
        const approvalObjs = liveObjects.filter(o=>o.status==="approval");
        const signedObjs = liveObjects.filter(o=>o.status==="signed");
        const pipelineSum = approvalObjs.reduce((s,o)=>s+_objVal(o), 0);
        const now = Date.now();
        const staleObjs = approvalObjs.filter(o=>(now-(o.updatedAt||o.createdAt||0))>14*864e5);
        const recentObjects = [...liveObjects].sort((a,b)=>(b.updatedAt||b.createdAt||0)-(a.updatedAt||a.createdAt||0)).slice(0,6);
        const recentContracts = [...contracts].filter(c=>(c.works||[]).reduce((s,w)=>s+(w.quantity*w.price||0),0)>0).sort((a,b)=>Number(b.id||0)-Number(a.id||0)).slice(0,5);
        const monthName = new Date().toLocaleDateString("ru-RU",{month:"long"});
        // ── Finance KPIs (только для admin/manager) ──
        const _finKpi = (_isAdmin||_isMgr) ? (() => {
          const active = (finProjects||[]).filter(p=>(p.rawStatus||p.status)!=="отменен");
          const txMap = {}; for(const t of (financeTx||[])){if(t.deletedAt||t.included===false) continue; const cn=normCN(t.contractNo); if(!txMap[cn])txMap[cn]={inc:0,exp:0}; if(t.type==="income")txMap[cn].inc+=(Number(t.amount)||0); else txMap[cn].exp+=(Number(t.amount)||0); }
          // ВСЁ считаем по АКТИВНЫМ проектам — иначе числа не бьются (расходы завершённых проектов искажают маржу)
          const totalInc = active.reduce((s,p)=>s+(txMap[normCN(p.contractNo)]?.inc||0),0);
          const totalExp = active.reduce((s,p)=>s+(txMap[normCN(p.contractNo)]?.exp||0),0);
          const totalBudget = active.reduce((s,p)=>s+(Number(p.budget)||0),0);
          const totalDebt = active.reduce((s,p)=>{const inc=txMap[normCN(p.contractNo)]?.inc||0; return s+Math.max(0,(Number(p.budget)||0)-inc);},0);
          // маржа по бюджету активных: (бюджет − расходы по активным) / бюджет
          const margin = totalBudget>0?Math.round((totalBudget-totalExp)/totalBudget*100):null;
          const incMonth = (financeTx||[]).filter(t=>!t.deletedAt&&t.included!==false&&t.type==="income"&&_inMonth(t.date?new Date(t.date).getTime():0)).reduce((s,t)=>s+(Number(t.amount)||0),0);
          return {count:active.length,totalInc,totalDebt,totalBudget,margin,incMonth};
        })() : null;
        // ── Production KPIs (только для admin/manager) ──
        const _prodKpi = (_isAdmin||_isMgr) ? (() => {
          const _ds = d => { const x=new Date(d); x.setHours(0,0,0,0); return x.getTime(); };
          const prods = productions||[];
          const today = _ds(new Date());
          const inWork = prods.filter(p=>p.prodStatus==="active").length;
          const overdue = prods.filter(p=>p.prodStatus==="active"&&p.planEndDate&&_ds(p.planEndDate)<today&&!p.factEndDate).length;
          const doneMonth = prods.filter(p=>p.factEndDate&&_inMonth(new Date(p.factEndDate).getTime())).length;
          const defects = prods.reduce((s,p)=>s+((p.defects||[]).filter(d=>!d.done).length),0);
          return {inWork,overdue,doneMonth,defects};
        })() : null;
        return (
        <div className="page" style={{background:"#f1f5f9",minHeight:"100vh",paddingBottom:40}}>

          {/* Заголовок — Hero Banner */}
          <div className="hero" style={{background:"linear-gradient(135deg,#0f172a 0%,#1e293b 70%,#283549 100%)",borderRadius:16,padding:"28px 32px",marginBottom:24,position:"relative",overflow:"hidden",boxShadow:"0 4px 20px rgba(15,23,42,.3)"}}>
            <div style={{position:"absolute",top:-30,right:-30,width:180,height:180,borderRadius:"50%",background:"rgba(59,130,246,.08)"}}/>
            <div style={{position:"absolute",bottom:-50,right:60,width:120,height:120,borderRadius:"50%",background:"rgba(59,130,246,.05)"}}/>
            <div style={{position:"relative",zIndex:1,display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
              <div>
                <div style={{fontSize:22,fontWeight:900,color:"#fff",letterSpacing:-.5,marginBottom:4,fontFamily:"'Poppins',sans-serif"}}>
                  TitovStroy <span style={{opacity:.6,fontWeight:600}}>CRM</span>
                </div>
                <div style={{fontSize:13,color:"rgba(255,255,255,.75)"}}>
                  {new Date().toLocaleDateString("ru-RU",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}
                  {" · "}<span style={{color:"#bfdbfe",fontWeight:600}}>{currentUser.role==="admin"?"Администратор":currentUser.role==="viewer"?"Просмотр":currentUser.name}</span>
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                {navHistory.length > 0 && <button onClick={goBack} style={{background:"none",border:"1px solid #ccc",borderRadius:6,padding:"4px 12px",cursor:"pointer",marginRight:8,fontSize:14,color:"#fff",borderColor:"rgba(255,255,255,.4)"}}>← Назад</button>}
                {staleObjs.length>0&&<span style={{background:"rgba(251,191,36,.2)",color:"#fde68a",border:"1px solid rgba(251,191,36,.3)",borderRadius:20,padding:"4px 12px",fontSize:11,fontWeight:700}}>⚠ {staleObjs.length} требуют внимания</span>}
                <span style={{fontSize:11,fontWeight:600,display:"flex",alignItems:"center",gap:5,padding:"4px 12px",borderRadius:20,background:"rgba(255,255,255,.15)",color:"rgba(255,255,255,.9)",backdropFilter:"blur(4px)"}}>
                  {syncStatus==="saving"?"⏳ Сохраняю...":syncStatus==="saved"?"✓ Сохранено":syncStatus==="error"?"⚠ Ошибка":"☁ Синк"}
                </span>
                <button onClick={()=>{ setLogoutConfirm(true); }}
                  style={{background:"rgba(255,255,255,.12)",border:"1px solid rgba(255,255,255,.25)",borderRadius:20,padding:"4px 12px",fontSize:11,fontWeight:600,cursor:"pointer",color:"rgba(255,255,255,.9)",fontFamily:"inherit"}}>
                  🚪 Выйти
                </button>
              </div>
            </div>
            {/* Мини-метрики в баннере */}
            <div style={{display:"flex",gap:24,marginTop:20,flexWrap:"wrap"}}>
              {[
                {label:"Активных объектов",  val:liveObjects.filter(o=>o.status!=="archive"&&o.status!=="refuse").length},
                {label:"В согласовании", val:approvalObjs.length},
                {label:"Договоров",       val:signedObjs.length},
              ].map((m,i)=>(
                <div key={i} style={{textAlign:"center"}}>
                  <div style={{fontSize:26,fontWeight:900,color:"#fff",lineHeight:1}}>{m.val}</div>
                  <div style={{fontSize:11,color:"rgba(255,255,255,.6)",marginTop:3}}>{m.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* KPI карточки */}
          <div className="kpi-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:14,marginBottom:24}}>
            {[
              {label:"Объектов за "+monthName, value:objectsThisMonth.length, sub:"активность месяца", icon:"📋", accent:"#2563eb"},
              {label:"Объём за "+monthName, value:fmt(Math.round(totalSumMonth))+" ₸", sub:"сумма смет", icon:"💰", accent:"#059669"},
              {label:"Прибыль за "+monthName, value:fmt(Math.round(profitMonth))+" ₸", sub:"по подписанным", icon:"📈", accent:profitMonth>0?"#059669":"#ef4444"},
              {label:"Маржа за "+monthName, value:marginMonth+"%", sub:"рентабельность", icon:"🎯", accent:marginMonth>=35?"#059669":marginMonth>=20?"#d97706":"#ef4444"},
              {label:"Пайплайн (согласование)", value:fmt(Math.round(pipelineSum))+" ₸", sub:approvalObjs.length+" объектов", icon:"🔄", accent:"#d97706"},
              {label:"Договоров подписано", value:signedObjs.length, sub:"из "+liveObjects.filter(o=>o.status!=="archive"&&o.status!=="refuse").length+" активных", icon:"✅", accent:"#059669"},
            ].map((s,i)=>(
              <div key={i} style={{background:"#ffffff",border:"1px solid #eef2f7",borderRadius:16,padding:"18px 20px",boxShadow:"0 1px 2px rgba(15,23,42,.04),0 10px 30px -12px rgba(15,23,42,.12)",transition:"transform .18s ease,box-shadow .18s ease",position:"relative",overflow:"hidden"}}
                onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow="0 1px 2px rgba(15,23,42,.04),0 18px 40px -14px rgba(15,23,42,.22)";}}
                onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="0 1px 2px rgba(15,23,42,.04),0 10px 30px -12px rgba(15,23,42,.12)";}}>
                <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:s.accent,opacity:.85}}/>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                  <div style={{fontSize:12,color:"#64748b",fontWeight:600,lineHeight:1.3,flex:1,paddingRight:8}}>{s.label}</div>
                  <span style={{width:38,height:38,borderRadius:11,background:s.accent+"15",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{s.icon}</span>
                </div>
                <div className="kpi-val" style={{fontSize:26,fontWeight:800,color:"#0f172a",lineHeight:1,marginBottom:6,letterSpacing:-.5}}>{s.value}</div>
                <div style={{fontSize:11.5,color:"#94a3b8",fontWeight:500}}>{s.sub}</div>
              </div>
            ))}
          </div>

          {/* ── Finance KPIs (admin/manager) ── */}
          {_finKpi&&(
            <div style={{marginBottom:24}}>
              <div style={{fontSize:12,fontWeight:700,color:"#64748b",marginBottom:10,textTransform:"uppercase",letterSpacing:".05em"}}>💰 Финансы по проектам</div>
              <div className="kpi-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:14}}>
                {[
                  {label:"Активных проектов", value:_finKpi.count, sub:"не отменены", icon:"📁", accent:"#2563eb"},
                  {label:"Выручка за "+monthName, value:fmt(_finKpi.incMonth)+" ₸", sub:"оплачено факт", icon:"💵", accent:"#059669"},
                  {label:"Дебиторка", value:fmt(_finKpi.totalDebt)+" ₸", sub:"долги клиентов", icon:"⏳", accent:_finKpi.totalDebt>0?"#dc2626":"#059669"},
                  {label:"Маржа план", value:_finKpi.margin!=null?_finKpi.margin+"%":"—", sub:"бюджет минус расходы", icon:"📊", accent:_finKpi.margin!=null&&_finKpi.margin>=30?"#059669":_finKpi.margin!=null&&_finKpi.margin>=0?"#d97706":"#dc2626"},
                ].map((s,i)=>(
                  <div key={i} style={{background:"#ffffff",border:"1px solid #eef2f7",borderRadius:16,padding:"18px 20px",boxShadow:"0 1px 2px rgba(15,23,42,.04),0 10px 30px -12px rgba(15,23,42,.12)",transition:"transform .18s ease,box-shadow .18s ease",position:"relative",overflow:"hidden",cursor:"pointer"}}
                    onClick={()=>setScreen("finance")}
                    onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow="0 1px 2px rgba(15,23,42,.04),0 18px 40px -14px rgba(15,23,42,.22)";}}
                    onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="0 1px 2px rgba(15,23,42,.04),0 10px 30px -12px rgba(15,23,42,.12)";}}>
                    <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:s.accent,opacity:.85}}/>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                      <div style={{fontSize:12,color:"#64748b",fontWeight:600,lineHeight:1.3,flex:1,paddingRight:8}}>{s.label}</div>
                      <span style={{width:38,height:38,borderRadius:11,background:s.accent+"15",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{s.icon}</span>
                    </div>
                    <div className="kpi-val" style={{fontSize:26,fontWeight:800,color:"#0f172a",lineHeight:1,marginBottom:6,letterSpacing:-.5}}>{s.value}</div>
                    <div style={{fontSize:11.5,color:"#94a3b8",fontWeight:500}}>{s.sub}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Production KPIs (admin/manager) ── */}
          {_prodKpi&&(
            <div style={{marginBottom:24}}>
              <div style={{fontSize:12,fontWeight:700,color:"#64748b",marginBottom:10,textTransform:"uppercase",letterSpacing:".05em"}}>🏗 Производство</div>
              <div className="kpi-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:14}}>
                {[
                  {label:"В работе", value:_prodKpi.inWork, sub:"активных производств", icon:"🔨", accent:"#2563eb"},
                  {label:"Просрочено", value:_prodKpi.overdue, sub:"плановый срок истёк", icon:"🚨", accent:_prodKpi.overdue>0?"#dc2626":"#059669"},
                  {label:"Сдано за "+monthName, value:_prodKpi.doneMonth, sub:"фактически завершено", icon:"✅", accent:"#059669"},
                  {label:"Открытых замечаний", value:_prodKpi.defects, sub:"незакрытые дефекты", icon:"⚠️", accent:_prodKpi.defects>0?"#d97706":"#059669"},
                ].map((s,i)=>(
                  <div key={i} style={{background:"#ffffff",border:"1px solid #eef2f7",borderRadius:16,padding:"18px 20px",boxShadow:"0 1px 2px rgba(15,23,42,.04),0 10px 30px -12px rgba(15,23,42,.12)",transition:"transform .18s ease,box-shadow .18s ease",position:"relative",overflow:"hidden",cursor:"pointer"}}
                    onClick={()=>setScreen("production")}
                    onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow="0 1px 2px rgba(15,23,42,.04),0 18px 40px -14px rgba(15,23,42,.22)";}}
                    onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="0 1px 2px rgba(15,23,42,.04),0 10px 30px -12px rgba(15,23,42,.12)";}}>
                    <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:s.accent,opacity:.85}}/>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                      <div style={{fontSize:12,color:"#64748b",fontWeight:600,lineHeight:1.3,flex:1,paddingRight:8}}>{s.label}</div>
                      <span style={{width:38,height:38,borderRadius:11,background:s.accent+"15",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{s.icon}</span>
                    </div>
                    <div className="kpi-val" style={{fontSize:26,fontWeight:800,color:"#0f172a",lineHeight:1,marginBottom:6,letterSpacing:-.5}}>{s.value}</div>
                    <div style={{fontSize:11.5,color:"#94a3b8",fontWeight:500}}>{s.sub}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Требуют внимания */}
          {staleObjs.length>0&&(
            <div style={{background:"linear-gradient(135deg,#fffbeb,#fef3c7)",border:"1px solid rgba(217,119,6,.25)",borderRadius:12,padding:"16px 20px",marginBottom:24,boxShadow:"0 1px 4px rgba(217,119,6,.1)"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                <span style={{fontSize:16}}>⚠️</span>
                <span style={{fontWeight:700,fontSize:14,color:"#92400e"}}>Требуют внимания — {staleObjs.length} объект{staleObjs.length===1?"":"ов"} без движения 14+ дней</span>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {staleObjs.slice(0,4).map(o=>{
                  const days = Math.floor((now-(o.updatedAt||o.createdAt||0))/864e5);
                  const val = _objVal(o);
                  return (
                    <div key={o.id} onClick={()=>{ setCurrentObject(o); setObjectTab("info"); setScreen("objects"); }}
                      style={{display:"flex",alignItems:"center",gap:10,background:"rgba(255,255,255,.7)",borderRadius:8,padding:"8px 12px",cursor:"pointer",transition:"background .1s"}}
                      onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,.95)"}
                      onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,.7)"}>
                      <div style={{width:8,height:8,borderRadius:"50%",background:"#f59e0b",flexShrink:0}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <span style={{fontWeight:600,fontSize:13,color:"#0f172a"}}>{o.clientName||"Без клиента"}</span>
                        {o.address&&<span style={{fontSize:12,color:"#64748b",marginLeft:6}}>{o.address}</span>}
                      </div>
                      <span style={{fontSize:11,color:"#b45309",fontWeight:600,flexShrink:0}}>{days} дн.</span>
                      {val>0&&<span style={{fontSize:12,fontWeight:700,color:"#0f172a",flexShrink:0}}>{fmt(Math.round(val))} ₸</span>}
                    </div>
                  );
                })}
                {staleObjs.length>4&&<div style={{fontSize:12,color:"#b45309",paddingLeft:4}}>+{staleObjs.length-4} ещё — <span style={{cursor:"pointer",textDecoration:"underline"}} onClick={()=>setScreen("objects")}>смотреть все</span></div>}
              </div>
            </div>
          )}

          {/* Воронка + Последние объекты */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:16,marginBottom:24}}>

            {/* Воронка по статусам */}
            {liveObjects.length>0&&(()=>{
              // Архив — терминальное хранилище, не стадия воронки; не показываем его баром
              const funnelStatuses = DEAL_STATUSES.filter(s=>s.key!=="archive");
              const maxCount = Math.max(1,...funnelStatuses.map(s=>liveObjects.filter(o=>(o.status||"new")===s.key).length));
              const signedCount = liveObjects.filter(o=>o.status==="signed").length;
              const nonArchive = liveObjects.filter(o=>o.status!=="archive").length;
              const convToSigned = nonArchive>0?Math.round(signedCount/nonArchive*100):0;
              return (
                <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,padding:"20px 22px",boxShadow:"0 1px 3px rgba(15,23,42,.07),0 4px 12px rgba(15,23,42,.04)"}}>
                  <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",flexWrap:"wrap",gap:8,marginBottom:16}}>
                    <span style={{fontWeight:700,fontSize:14,color:"#0f172a"}}>📊 Воронка объектов</span>
                    <span style={{fontSize:12,color:"#64748b"}}>
                      <b style={{color:"#059669"}}>{convToSigned}%</b> подписано
                    </span>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    {funnelStatuses.map(s=>{
                      const list = liveObjects.filter(o=>(o.status||"new")===s.key);
                      const sum = list.reduce((acc,o)=>acc+(_estByObjId[o.id]||[]).reduce((ss,e)=>ss+(e.total||0),0),0);
                      const w = Math.round((list.length/maxCount)*100);
                      return (
                        <div key={s.key} onClick={()=>{ setObjectFilterStatus(s.key); setScreen("objects"); }}
                          style={{cursor:"pointer"}}
                          title={"Показать: "+s.label}>
                          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
                            <span style={{fontSize:11,fontWeight:700,color:s.color,width:130,flexShrink:0}}>{s.label}</span>
                            <span style={{fontSize:11,color:"#94a3b8",flex:1,textAlign:"right"}}>{sum>0?fmt(Math.round(sum))+" ₸":"—"}</span>
                          </div>
                          <div style={{background:"#f8fafc",borderRadius:8,height:22,position:"relative",overflow:"hidden"}}>
                            <div style={{width:`${w}%`,minWidth:list.length>0?32:0,height:"100%",background:s.bg,borderLeft:`3px solid ${s.color}`,transition:"width .3s",borderRadius:"0 4px 4px 0"}}/>
                            <span style={{position:"absolute",left:10,top:0,height:"100%",display:"flex",alignItems:"center",fontSize:12,fontWeight:800,color:s.color}}>{list.length}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Последние объекты */}
            {recentObjects.length>0&&(
              <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,padding:"20px 22px",boxShadow:"0 1px 3px rgba(15,23,42,.07),0 4px 12px rgba(15,23,42,.04)"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
                  <span style={{fontWeight:700,fontSize:14,color:"#0f172a"}}>🕐 Последние объекты</span>
                  <span onClick={()=>setScreen("objects")} style={{color:"#2563eb",cursor:"pointer",fontSize:11,fontWeight:600}}>все →</span>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:1}}>
                  {recentObjects.map((o,i,arr)=>{
                    const st = DEAL_STATUSES.find(s=>s.key===(o.status||"new"))||DEAL_STATUSES[0];
                    const val = _objVal(o);
                    return (
                      <div key={o.id} onClick={()=>{ setCurrentObject(o); setObjectTab("info"); setScreen("objects"); }}
                        style={{display:"flex",alignItems:"center",gap:10,padding:"9px 10px",borderRadius:8,cursor:"pointer",transition:"background .1s",borderBottom:i<arr.length-1?"1px solid #f3f4f6":"none"}}
                        onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"}
                        onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                        <div style={{width:6,height:6,borderRadius:"50%",background:st.color,flexShrink:0}}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:600,fontSize:13,color:"#0f172a",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{o.clientName||"Без клиента"}</div>
                          <div style={{fontSize:11,color:"#94a3b8",display:"flex",gap:6,alignItems:"center",marginTop:1}}>
                            <span style={{color:st.color,fontWeight:600}}>{st.label}</span>
                            {o.address&&<span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{o.address}</span>}
                          </div>
                        </div>
                        {val>0&&<div style={{fontSize:12,fontWeight:700,color:"#0f172a",flexShrink:0}}>{fmt(Math.round(val))} ₸</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

        </div>
        );
      })()}

      {/* ═══════════════════════════════════════════════════════════════════
          ЭКРАН 1: СПИСОК СМЕТ
      {/* ═══════════════════════════════════════════════════════════════════
          ЭКРАН 1: СПИСОК СМЕТ
      ═══════════════════════════════════════════════════════════════════ */}
      {effScreen === "list" && (
        <div style={{maxWidth:960,margin:"0 auto",padding:"0 0 40px",minHeight:"100vh"}}>
          {/* Шапка */}
          <div className="list-header" style={{background:"linear-gradient(135deg,#0f172a,#1e293b)",borderBottom:"1px solid #0f172a",padding:"14px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:10,boxShadow:"0 2px 12px rgba(15,23,42,.2)"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,flex:1,minWidth:0}}>
              <div style={{width:28,height:28,borderRadius:8,background:"linear-gradient(135deg,#3b82f6,#2563eb)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:13,color:"#ffffff",flexShrink:0,boxShadow:"0 2px 8px rgba(37,99,235,.45)"}}>T</div>
              <div style={{minWidth:0}}>
                <div style={{fontWeight:800,fontSize:13,whiteSpace:"nowrap",color:"#f1f5f9"}}>TitovStroy</div>
                <div style={{fontSize:10,color:"#94a3b8",whiteSpace:"nowrap"}}>
                  <span style={{color:"#2563eb"}}>{currentUser.role==="admin"?"👑":currentUser.role==="viewer"?"👁":"👤"}</span>{" "}{currentUser.name}
                </div>
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
              {navHistory.length > 0 && <button onClick={goBack} style={{background:"none",border:"1px solid rgba(255,255,255,.4)",borderRadius:6,padding:"4px 12px",cursor:"pointer",fontSize:14,color:"#fff"}}>← Назад</button>}
              {saving && <span style={{fontSize:11,color:"#94a3b8"}}>💾</span>}
              <button className="btn btn-o" style={{padding:"6px 9px",fontSize:14}} onClick={()=>setScreen("analytics")} title="Статистика">📊</button>
              {currentUser.role !== "viewer" && (
                <button className="btn btn-g" style={{padding:"7px 14px",fontSize:12,whiteSpace:"nowrap"}} onClick={newEstimate}>+ Новая</button>
              )}
            </div>
          </div>

          <div className="list-pad" style={{padding:"20px 24px 0"}}>
            {loadingList ? (
              <div style={{textAlign:"center",padding:"60px 0",color:"#94a3b8"}}>
                <div style={{fontSize:24,marginBottom:10}}>⏳</div>
                <div style={{fontSize:13}}>Загрузка смет...</div>
              </div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {/* Заголовок */}
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:2}}>
                  <div>
                    <div style={{fontWeight:800,fontSize:17,color:"#0f172a"}}>📁 Архив смет</div>
                    <div style={{fontSize:11,color:"#94a3b8",marginTop:1}}>Все расчёты и коммерческие предложения</div>
                  </div>
                  {currentUser.role==="admin" && (
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={()=>setImportModal(true)}
                        style={{background:"rgba(0,0,0,.03)",color:"#64748b",border:"1px solid #e2e8f0",borderRadius:8,padding:"7px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                        ⬆ Импорт
                      </button>
                      <button onClick={openBackups}
                        style={{background:"rgba(0,0,0,.03)",color:"#64748b",border:"1px solid #e2e8f0",borderRadius:8,padding:"7px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                        🕘 Бэкапы
                      </button>
                    </div>
                  )}
                </div>
                {/* Поиск и фильтры */}
                {estimates.length > 0 && (
                  <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:2}}>
                    <input
                      style={{background:"#ffffff",border:"1px solid #e2e8f0",color:"#0f172a",borderRadius:8,padding:"9px 14px",fontFamily:"inherit",fontSize:13,outline:"none",width:"100%"}}
                      placeholder="🔍 Поиск по клиенту, адресу, телефону..."
                      value={listSearch}
                      onChange={e=>setListSearch(e.target.value)}
                    />
                    <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                      {/* Фильтр по типу */}
                      {["","Вторичка","Новостройка","Коммерция"].map(t=>(
                        <button key={t} onClick={()=>setListFilter(t)}
                          style={{background:listFilter===t?"#eff6ff":"rgba(0,0,0,.03)",color:listFilter===t?"#2563eb":"#94a3b8",border:`1px solid ${listFilter===t?"rgba(184,144,74,.4)":"#e2e8f0"}`,borderRadius:8,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                          {t||"Все типы"}
                        </button>
                      ))}
                    </div>
                    {/* Фильтр по статусу */}
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      <button onClick={()=>setListFilterStatus("")}
                        style={{background:!listFilterStatus?"rgba(0,0,0,.04)":"rgba(0,0,0,.03)",color:!listFilterStatus?"#ffffff":"#94a3b8",border:`1px solid ${!listFilterStatus?"rgba(255,255,255,.15)":"#e2e8f0"}`,borderRadius:8,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                        Все статусы
                      </button>
                      {STATUSES.map(s=>(
                        <button key={s.key} onClick={()=>setListFilterStatus(s.key)}
                          style={{background:listFilterStatus===s.key?s.bg:"rgba(0,0,0,.03)",color:listFilterStatus===s.key?s.color:"#94a3b8",border:`1px solid ${listFilterStatus===s.key?s.color:"#e2e8f0"}`,borderRadius:8,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                          {s.label}
                        </button>
                      ))}
                    </div>
                    {/* Фильтр по сотруднику */}
                    {nonViewerUsers.length > 1 && (
                      <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                        <button onClick={()=>setListFilterManager("")}
                          style={{background:!listFilterManager?"#eff6ff":"rgba(0,0,0,.03)",color:!listFilterManager?"#2563eb":"#94a3b8",border:`1px solid ${!listFilterManager?"rgba(136,136,204,.4)":"#e2e8f0"}`,borderRadius:8,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                          Все сотрудники
                        </button>
                        {nonViewerUsers.map(u=>(
                          <button key={u.id} onClick={()=>setListFilterManager(u.name)}
                            style={{background:listFilterManager===u.name?"#eff6ff":"rgba(0,0,0,.03)",color:listFilterManager===u.name?"#2563eb":"#94a3b8",border:`1px solid ${listFilterManager===u.name?"rgba(136,136,204,.4)":"#e2e8f0"}`,borderRadius:8,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                            👤 {u.name}
                          </button>
                        ))}
                      </div>
                    )}
                    <div style={{display:"flex",gap:6,alignItems:"center"}}>
                      <div style={{flex:1}}/>
                      {/* Сортировка */}
                      <select value={listSort} onChange={e=>setListSort(e.target.value)}
                        style={{background:"#ffffff",border:"1px solid #e2e8f0",color:"#94a3b8",borderRadius:8,padding:"4px 8px",fontSize:11,fontFamily:"inherit",cursor:"pointer",outline:"none"}}>
                        <option value="date">По дате</option>
                        <option value="sum">По сумме</option>
                        <option value="name">По имени</option>
                      </select>
                    </div>
                  </div>
                )}

                {estimates.length === 0 ? (
                  <div style={{textAlign:"center",padding:"80px 0"}}>
                    <div style={{fontSize:40,marginBottom:16}}>📋</div>
                    <div style={{fontWeight:700,fontSize:16,marginBottom:8}}>Смет пока нет</div>
                    <div style={{fontSize:13,color:"#334155",marginBottom:24}}>Нажмите «+ Новая смета» чтобы начать</div>
                    {currentUser.role !== "viewer" && (
                      <button className="btn btn-g" onClick={newEstimate}>+ Создать первую смету</button>
                    )}
                  </div>
                ) : (() => {
                  const filtered = filteredEstimates;
                  // Группировка: строим из ВСЕХ смет, фильтрованные определяют видимость
                  const filteredIds = new Set(filtered.map(e=>e.id));
                  const dsMap = {}; // parentId -> [child, ...]
                  const estById = {};
                  estimates.forEach(e=>{ estById[e.id]=e; if(e.parentId){ (dsMap[e.parentId]||(dsMap[e.parentId]=[])).push(e); } });
                  // Корневые сметы из filtered (без parentId)
                  const roots = filtered.filter(e=>!e.parentId);
                  // ДС из filtered у которых родитель НЕ в filtered — показываем как корень
                  const orphanDs = filtered.filter(e=>e.parentId && !filteredIds.has(e.parentId) && !roots.find(r=>r.id===e.id));
                  const visibleRoots = [...roots, ...orphanDs];

                  const renderCard = (est, isChild=false) => {
                    const author = est.updatedBy&&est.updatedBy!==est.createdBy ? est.updatedBy : est.createdBy;
                    // ДС наследует актуальные данные клиента из родителя (имя, тип, площадь, адрес)
                    const parentProj = est.parentId ? estById[est.parentId]?.proj : null;
                    const dProj = parentProj ? {...(est.proj||{}), name:parentProj.name, type:parentProj.type, area:parentProj.area, address:parentProj.address, phone:parentProj.phone} : (est.proj||{});
                    return (
                      <div key={est.id}>
                        {isChild && <div style={{display:"flex",alignItems:"center",gap:6,marginLeft:16,marginBottom:2,marginTop:4}}>
                          <div style={{width:2,height:14,background:"#e2e8f0",borderRadius:2,flexShrink:0}}/>
                          <span style={{fontSize:10,color:"#059669",fontWeight:700,background:"rgba(5,150,105,.08)",borderRadius:3,padding:"1px 6px"}}>ДС-{est.dsNumber||"?"}</span>
                        </div>}
                        <div className="est-card up" style={{padding:"10px 14px",marginLeft:isChild?16:0,borderLeft:isChild?"3px solid #d1fae5":"none"}}
                          onClick={() => { if(currentUser.role==="viewer") return; openEstimate(est); }}>
                          {/* Строка 1: имя + сумма */}
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            {(() => { const s=STATUSES.find(x=>x.key===(est.status||"new"))||STATUSES[0]; return <span style={{fontSize:10,fontWeight:700,color:s.color,background:s.bg,borderRadius:4,padding:"1px 7px",flexShrink:0,whiteSpace:"nowrap"}}>{s.label}</span>; })()}
                            <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                              <span style={{fontWeight:700,fontSize:14,color:"#0f172a"}}>{dProj?.name || <span style={{color:"#94a3b8",fontStyle:"italic"}}>Без названия</span>}</span>
                              {dProj?.address && <span style={{fontSize:12,color:"#64748b",fontWeight:500}}> · 📍 {dProj.address}</span>}
                              {dProj?.phone && <span style={{fontSize:12,color:"#64748b",fontWeight:500}}> · 📞 {dProj.phone}</span>}
                            </span>
                            {est.total>0
                              ? <span style={{fontSize:14,fontWeight:800,color:"#2563eb",flexShrink:0}}>{fmt(est.total)} ₸</span>
                              : <span style={{fontSize:11,color:"#94a3b8",fontStyle:"italic",flexShrink:0}}>черновик</span>}
                          </div>
                          {est.comment&&<div style={{fontSize:11,color:"#94a3b8",marginTop:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>💬 {est.comment}</div>}
                          {est.status==="sent"&&est.sentAt&&<div style={{fontSize:11,color:"#7c3aed",marginTop:2,fontWeight:600}}>📤 Отправлено {new Date(est.sentAt).toLocaleDateString("ru-RU")}</div>}
                          {/* Строка 2: мета + дата + кнопки */}
                          <div style={{display:"flex",alignItems:"center",gap:6,marginTop:5}} onClick={e=>e.stopPropagation()}>
                            <span style={{fontSize:11,color:"#94a3b8",background:"rgba(0,0,0,.03)",borderRadius:4,padding:"1px 6px"}}>{dProj?.type||"—"}</span>
                            {dProj?.area&&<span style={{fontSize:11,color:"#94a3b8"}}>{dProj.area} м²</span>}
                            <span style={{flex:1}}/>
                            <span style={{fontSize:10,color:"#94a3b8",whiteSpace:"nowrap"}}>{fmtDate(est.updatedAt)}</span>
                            {author&&<span style={{fontSize:10,color:"#94a3b8",whiteSpace:"nowrap"}}>· {author}</span>}
                            <button onClick={()=>{
                              const catalog = getEffectiveCatalog();
                              const mm = 1 + (est.markup||0) / 100;
                              const works = Object.entries(est.rows||{}).filter(([,r])=>Number(r?.qty)>0).map(([key,r])=>{
                                const w = catalog.find(x=>x.name===key)||catalog.find(x=>x.code===key);
                                if(!w) return null;
                                const qty = Number(r.qty||0);
                                const cpxPct = r.cpxPct !== undefined ? Number(r.cpxPct) : undefined;
                                const rawPrice = r.manualPrice !== undefined && r.manualPrice !== ""
                                  ? Number(r.manualPrice)
                                  : getPrice(w, qty, r.complexity||"std", cpxPct);
                                const price = rawPrice ? rawPrice * mm : null;
                                const ew = getEffectiveWork(w);
                                const pf = (!price && ew.priceFrom) ? Math.round(ew.priceFrom * mm) : null;
                                const displayName = r.manualName !== undefined ? r.manualName : w.name;
                                const displayUnit = r.manualUnit !== undefined ? r.manualUnit : (w.unit||"м²");
                                return {name:displayName,category:w.cat||"",subcategory:w.sub||"",quantity:qty,unit:displayUnit,price:price?Math.round(price):0,priceFrom:pf||undefined};
                              }).filter(Boolean);
                              const isDs = !!est.parentId;
                              // ДС → тип annex, номер приложения = dsNumber+1 (т.к. №1 — основное)
                              const sibCount = isDs ? (dsMap[est.parentId]||[]).filter(e=>e.dsNumber<=(est.dsNumber||1)).length : 0;
                              const annexNum = isDs ? (est.dsNumber||1) + 1 : 1;
                              // Для приложения подтягиваем номер основного договора из договора родительской сметы
                              const parentContract = isDs ? contracts.find(c=>c.estId===est.parentId && (c.type||"repair_fiz")!=="annex") : null;
                              const mainNumber = parentContract?.number || "";
                              const mainDate = parentContract?.date || "";
                              const newContract = {id:Date.now().toString(),number:"",date:new Date().toISOString().split("T")[0],clientId:parentContract?.clientId||"",contragentId:parentContract?.contragentId||contragents[0]?.id||"",works,discount:est.discount||0,appendix:annexNum,estId:est.id,estClient:dProj?.name||"",estPhone:dProj?.phone||"",estAddress:dProj?.address||"",note:"",type:isDs?"annex":"repair_fiz",...(isDs?{mainNumber,mainDate}:{})};
                              setCurrentContract(newContract);
                              setContractTab("editor");
                              setScreen("contracts");
                            }} title={est.parentId?"Создать приложение":"Создать договор"}
                              style={{background:"rgba(184,144,74,.08)",color:"#2563eb",border:"1px solid #eff6ff",borderRadius:4,padding:"2px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>
                              📄
                            </button>
                            {currentUser.role !== "viewer" && !isChild && !est.objectId && (
                              <button onClick={()=>moveEstimateToObject(est)}
                                title="Создать объект из этой сметы и перенести в раздел Объекты"
                                style={{background:"rgba(37,99,235,.08)",color:"#2563eb",border:"1px solid rgba(37,99,235,.2)",borderRadius:4,padding:"2px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit",flexShrink:0,fontWeight:700}}>
                                📦 В объект
                              </button>
                            )}
                            {currentUser.role !== "viewer" && !isChild && (
                              <button onClick={()=>newSupplementaryEstimate(est)}
                                title="Создать доп. смету (ДС)"
                                style={{background:"rgba(5,150,105,.08)",color:"#059669",border:"1px solid rgba(5,150,105,.2)",borderRadius:4,padding:"2px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit",flexShrink:0,fontWeight:700}}>
                                +ДС
                              </button>
                            )}
                            {currentUser.role !== "viewer" && (
                              <button onClick={()=>duplicateEstimate(est)}
                                style={{background:"#eff6ff",color:"#2563eb",border:"1px solid rgba(100,100,200,.15)",borderRadius:4,padding:"2px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>
                                ⧉
                              </button>
                            )}
                            {(currentUser.role==="admin" || (currentUser.role==="user" && est.createdBy===currentUser.name)) && (
                              <button onClick={()=>setDeleteConfirm(est.id)}
                                style={{background:"rgba(220,38,38,.08)",color:"#dc2626",border:"1px solid rgba(220,38,38,.1)",borderRadius:4,padding:"2px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>
                                🗑
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  };

                  return (
                    <>
                      <div style={{fontSize:11,color:"#94a3b8",marginBottom:2}}>
                        {(() => {
                          const totalRoots = estimates.filter(e=>!e.parentId).length;
                          const foundRoots = filtered.filter(e=>!e.parentId).length;
                          return foundRoots !== totalRoots ? `Найдено: ${foundRoots}` : `Всего смет: ${totalRoots}`;
                        })()}
                      </div>
                      {visibleRoots.length === 0 && (
                        <div style={{textAlign:"center",padding:"40px 0",color:"#334155",fontSize:13}}>Ничего не найдено</div>
                      )}
                      {visibleRoots.map(est => (
                        <div key={est.id}>
                          {renderCard(est, false)}
                          {(dsMap[est.id]||[]).sort((a,b)=>(a.dsNumber||0)-(b.dsNumber||0)).map(child => renderCard(child, true))}
                        </div>
                      ))}
                    </>
                  );
                })()}
              </div>
            )}
          </div>

        </div>
      )}

      {/* Подтверждение удаления */}
      {deleteConfirm && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,padding:20}}
          onClick={() => setDeleteConfirm(null)}>
          <div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,padding:"24px 28px",maxWidth:340,width:"100%",textAlign:"center"}}
            onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:32,marginBottom:12}}>🗑️</div>
            <div style={{fontWeight:700,fontSize:15,marginBottom:8}}>Удалить смету?</div>
            <div style={{fontSize:12,color:"#94a3b8",marginBottom:20}}>Это действие нельзя отменить</div>
            <div style={{display:"flex",gap:10,justifyContent:"center"}}>
              <button className="btn btn-o" style={{padding:"9px 20px"}} onClick={() => setDeleteConfirm(null)}>Отмена</button>
              <button className="btn btn-red" style={{padding:"9px 20px"}} onClick={() => deleteEstimate(deleteConfirm)}>Удалить</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          ЭКРАН 2: РЕДАКТОР СМЕТЫ
      ═══════════════════════════════════════════════════════════════════ */}
      {screen === "editor" && (
        <div>
          {/* HEADER */}
          <div className="editor-header" style={{background:"#ffffff",borderBottom:"1px solid #e2e8f0",padding:"11px 22px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:10,gap:8}}>
            <div className="editor-header-left" style={{display:"flex",alignItems:"center",gap:8,flex:1,minWidth:0}}>
              <button className="btn btn-o" style={{padding:"7px 11px",fontSize:12,flexShrink:0}} onClick={saveAndBack}>
                ← Сметы
              </button>
              <div style={{fontSize:13,fontWeight:600,color:"#94a3b8",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0}}>
                {proj.name || "Новая смета"}
              </div>
            </div>
            <div className="editor-header-right" style={{display:"flex",alignItems:"center",gap:8}}>
              {saving && <span style={{fontSize:11,color:"#94a3b8"}}>💾</span>}
              {filledCount > 0 && (
                <button onClick={()=>setShowSelectedOnly(s=>!s)}
                  style={{fontSize:11,padding:"6px 12px",background:showSelectedOnly?"#f0fdf4":"",border:`1px solid ${showSelectedOnly?"#059669":"#e2e8f0"}`,borderRadius:8,color:showSelectedOnly?"#059669":"#94a3b8",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                  {showSelectedOnly ? `✓ Выбранные (${filledCount})` : `📋 Выбранные (${filledCount})`}
                </button>
              )}
              {currentUser.role !== "viewer" && (
                <button className="btn btn-o" style={{fontSize:11,padding:"6px 12px",background:showFinancial?"#eff6ff":"",borderColor:showFinancial?"#2563eb":""}} onClick={()=>setShowFinancial(m=>!m)}>
                  {showFinancial ? "💰 Финансы вкл" : "💰 Финансы"}
                </button>
              )}
              {currentUser.role === "viewer" && (
                <span style={{fontSize:11,color:"#94a3b8",background:"rgba(0,0,0,.04)",borderRadius:5,padding:"4px 10px"}}>👁 Только просмотр</span>
              )}
              <span className="proj-name" style={{fontSize:11,color:"#94a3b8"}}>
                {currentUser.role==="admin"?"👑":currentUser.role==="viewer"?"👁":"👤"} {currentUser.name}
              </span>
              <button className="btn btn-o" style={{padding:"8px 16px",fontSize:13}} onClick={saveAndBack}>← Назад</button>
              {saving && <span style={{fontSize:11,color:"#94a3b8"}}>💾</span>}
            </div>
          </div>

          <div style={{maxWidth:1160,margin:"0 auto",padding:"18px 18px"}}>
            {/* ОБЪЕКТ — скрываем, если смета привязана к объекту (поля ведутся в объекте) */}
            {!currentObjectId && (
            <div className="card up" style={{padding:"16px 20px",marginBottom:16}}>
              <div style={{fontSize:10,fontWeight:700,color:"#2563eb",letterSpacing:1.5,textTransform:"uppercase",marginBottom:11}}>Информация об объекте</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:10}}>
                {[["Клиент / Объект","name","Иванов — Бухар-Жырау 45","text"],
                  ["Тип","type","","objtype"],
                  ["Площадь, м²","area","75","text"],
                  ["Менеджер","manager","","manager"],
                  ["Телефон клиента","phone","+7 707...","text"],
                  ["Адрес","address","ул. Бухар-Жырау, 45","text"],
                ].map(([lbl,f,ph,ftype])=>(
                  <div key={f}>
                    <div style={{fontSize:10,color:"#94a3b8",marginBottom:4}}>{lbl}</div>
                    {ftype==="objtype" ? (
                      <select className="fi" value={proj.type} onChange={e=>setProj(p=>({...p,type:e.target.value}))}>
                        {OBJ_TYPES.map(t=><option key={t}>{t}</option>)}
                      </select>
                    ) : ftype==="manager" ? (
                      <select className="fi" value={proj.manager||""} onChange={e=>setProj(p=>({...p,manager:e.target.value}))}>
                        <option value="">— выбрать —</option>
                        {nonViewerUsers.map(u=>(
                          <option key={u.id} value={u.name}>{u.name}</option>
                        ))}
                      </select>
                    ) : (
                      <input className="fi" placeholder={ph} value={proj[f]||""} onChange={e=>setProj(p=>({...p,[f]:e.target.value}))}
                        disabled={currentUser.role==="viewer"} style={{opacity:currentUser.role==="viewer"?.6:1}}/>
                    )}
                  </div>
                ))}
              </div>
            </div>
            )}

            <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr)",gap:16,alignItems:"start"}} className="main-grid">
              {/* ТОЛЬКО ВЫБРАННЫЕ */}
              {showSelectedOnly && (() => {
                const selectedWorks = [];
                for (const cat of cats) for (const sub of Object.keys(Gdyn[cat]||{})) for (const w of Gdyn[cat]?.[sub]||[]) {
                  const r = rows[w.code]||rows[w.name]||{};
                  if (Number(r.qty||0) > 0) selectedWorks.push({...w, cat, sub});
                }
                return (
                  <div className="card up">
                    <div style={{padding:"12px 16px",borderBottom:"1px solid #e2e8f0",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <span style={{fontWeight:700,fontSize:13,color:"#0f172a"}}>Выбранные позиции ({selectedWorks.length})</span>
                      <button onClick={()=>setShowSelectedOnly(false)} style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>✕ Закрыть</button>
                    </div>
                    <div className="wrow-th" style={{display:"grid",gridTemplateColumns:"1fr 50px 120px 76px 90px",padding:"8px 16px",fontSize:11,color:"#64748b",fontWeight:600,letterSpacing:".04em",textTransform:"uppercase",borderBottom:"1px solid #e2e8f0",background:"#f9fafb"}}>
                      <span>Наименование</span>
                      <span className="wrow-desk" style={{textAlign:"center"}}>Ед.</span>
                      <span className="wrow-desk" style={{textAlign:"right"}}>Цена за ед., ₸</span>
                      <span className="wrow-desk" style={{textAlign:"right"}}>Объём</span>
                      <span className="wrow-desk" style={{textAlign:"right"}}>Итого, ₸</span>
                    </div>
                    <div style={{padding:"4px 0"}}>
                      {selectedWorks.map(work => {
                        const r = rows[work.code]||rows[work.name]||{};
                        const qty = Number(r.qty||0);
                        const price = rowPrice(work);
                        const total = rowTotal(work);
                        const displayName = r.manualName !== undefined ? r.manualName : work.name;
                        const displayUnit = r.manualUnit !== undefined ? r.manualUnit : (work.unit||"м²");
                        return (
                          <div key={work.name} className="wrow" style={{display:"grid",gridTemplateColumns:"1fr 50px 120px 76px 90px",gap:4,padding:"8px 16px",borderBottom:"1px solid #f3f4f6",alignItems:"center"}}>
                            <div style={{minWidth:0}}>
                              {r.editingName ? (
                                <div style={{display:"flex",alignItems:"center",gap:4}}>
                                  <input autoFocus style={{fontSize:13,background:"#f8fafc",border:"1px solid #2563eb",color:"#0f172a",borderRadius:5,padding:"2px 7px",fontFamily:"inherit",outline:"none",width:"100%",minWidth:0}}
                                    value={r.manualName !== undefined ? r.manualName : work.name}
                                    onChange={e=>setRow(work.code || work.name,"manualName",e.target.value)}
                                    onBlur={()=>setRow(work.code || work.name,"editingName",false)}
                                    onKeyDown={e=>{if(e.key==="Enter"||e.key==="Escape")setRow(work.code || work.name,"editingName",false);}}/>
                                  {r.manualName !== undefined && <span onClick={()=>{setRow(work.code || work.name,"manualName",undefined);setRow(work.code || work.name,"editingName",false);}} title="Сбросить" style={{cursor:"pointer",fontSize:10,color:"#ef4444",flexShrink:0}}>✕</span>}
                                </div>
                              ) : (
                                <div style={{display:"flex",alignItems:"center",gap:4}}>
                                  <span style={{fontSize:13,color:"#0f172a",fontWeight:500}}>{displayName}</span>
                                  {currentUser.role!=="viewer" && <span onClick={()=>setRow(work.code || work.name,"editingName",true)} title="Изменить название" style={{cursor:"pointer",fontSize:10,color:"#94a3b8",opacity:.6,flexShrink:0,lineHeight:1}}>✏</span>}
                                </div>
                              )}
                              <div style={{fontSize:10,color:"#94a3b8"}}>{work.cat} · {work.sub}</div>
                              {showFinancial && currentUser.role!=="viewer" && qty > 0 && (() => {
                                const costPerUnit = rowCostPerUnit(r, work);
                                const dp = price ?? getBasePrice(work);
                                const marginPct = dp && dp > 0 && costPerUnit > 0 ? Math.round((dp - costPerUnit) / dp * 100) : null;
                                const grossProfit = dp != null && costPerUnit > 0 ? (dp - costPerUnit) * qty : null;
                                return (
                                  <div style={{display:"flex",flexWrap:"wrap",gap:"4px 12px",marginTop:3,fontSize:10,color:"#64748b",alignItems:"center"}}>
                                    <span style={{display:"inline-flex",alignItems:"center",gap:3}}>Себест/ед:
                                      <input type="number" min="0" placeholder={String(Number(work.cost)||0)}
                                        value={r.manualCost!==undefined?r.manualCost:(work.cost||"")}
                                        onChange={e=>setRow(work.code || work.name,"manualCost",e.target.value===""?undefined:Number(e.target.value))}
                                        style={{width:64,border:"1px solid #e2e8f0",borderRadius:4,padding:"1px 5px",fontSize:11,textAlign:"right",fontFamily:"inherit",background:"#fff",color:r.manualCost!==undefined?"#2563eb":"#334155",fontWeight:r.manualCost!==undefined?700:400}}/>
                                      {r.manualCost!==undefined && <span onClick={()=>setRow(work.code || work.name,"manualCost",undefined)} title="Сбросить" style={{cursor:"pointer",color:"#ef4444"}}>✕</span>}
                                    </span>
                                    {costPerUnit > 0 && <span>Себест: <b style={{color:"#334155"}}>{fmt(costPerUnit * qty)} ₸</b></span>}
                                    {marginPct !== null && <span>Маржа: <b style={{color: marginPct>=35?"#059669":marginPct>=20?"#d97706":"#ef4444"}}>{marginPct}%</b></span>}
                                    {grossProfit !== null && grossProfit > 0 && <span>Прибыль: <b style={{color:"#059669"}}>{fmt(Math.round(grossProfit))} ₸</b></span>}
                                  </div>
                                );
                              })()}
                              {/* Mobile: qty + price + total */}
                              <div className="wrow-mob-extra" style={{flexDirection:"column",alignItems:"flex-start",gap:3,display:"none",marginTop:4}}>
                                <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                                  <span style={{fontSize:11,color:"#94a3b8"}}>Цена:</span>
                                  <input type="number" min="0"
                                    value={r.manualPrice !== undefined ? r.manualPrice : (price||"")}
                                    onChange={e=>setRow(work.code || work.name,"manualPrice",e.target.value===""?undefined:Number(e.target.value))}
                                    style={{width:80,border:"1px solid #e2e8f0",borderRadius:4,padding:"2px 5px",fontSize:12,textAlign:"right",fontFamily:"inherit",background:"#fff"}}/>
                                  <span style={{fontSize:11,color:"#94a3b8"}}>Объём:</span>
                                  <input type="number" min="0"
                                    value={r.qty||""}
                                    onChange={e=>setRow(work.code || work.name,"qty",e.target.value)}
                                    style={{width:60,border:"1px solid #e2e8f0",borderRadius:4,padding:"2px 5px",fontSize:12,textAlign:"right",fontFamily:"inherit",background:"#fff"}}/>
                                </div>
                                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%"}}>
                                  <span style={{fontSize:13,fontWeight:700,color:total>0?"#2563eb":"#94a3b8"}}>{total>0?fmt(total)+" ₸":"—"}</span>
                                  <button onClick={()=>setRow(work.code || work.name,"qty","")} title="Убрать из сметы"
                                    style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:14,padding:0,lineHeight:1}}>✕</button>
                                </div>
                              </div>
                            </div>
                            <div className="wrow-desk" style={{textAlign:"center"}}>
                              <input value={displayUnit}
                                onChange={e=>setRow(work.code || work.name,"manualUnit",e.target.value===(work.unit||"м²")?undefined:e.target.value)}
                                style={{width:"100%",border:"1px solid #e2e8f0",borderRadius:4,padding:"3px 4px",fontSize:11,textAlign:"center",fontFamily:"inherit",background:"#fff"}}/>
                            </div>
                            <div className="wrow-desk" style={{textAlign:"right"}}>
                              <input type="number" min="0"
                                value={r.manualPrice !== undefined ? r.manualPrice : (price||"")}
                                onChange={e=>setRow(work.code || work.name,"manualPrice",e.target.value===""?undefined:Number(e.target.value))}
                                style={{width:"100%",border:"1px solid #e2e8f0",borderRadius:4,padding:"3px 6px",fontSize:12,textAlign:"right",fontFamily:"inherit",background:"#fff"}}/>
                            </div>
                            <div className="wrow-desk" style={{textAlign:"right"}}>
                              <input type="number" min="0"
                                value={r.qty||""}
                                onChange={e=>setRow(work.code || work.name,"qty",e.target.value)}
                                style={{width:"100%",border:"1px solid #e2e8f0",borderRadius:4,padding:"3px 6px",fontSize:12,textAlign:"right",fontFamily:"inherit",background:"#fff"}}/>
                            </div>
                            <div className="wrow-desk" style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:6}}>
                              <span style={{fontSize:13,fontWeight:700,color:total>0?"#2563eb":"#94a3b8"}}>{total>0?fmt(total):"—"}</span>
                              <button onClick={()=>setRow(work.code || work.name,"qty","")} title="Убрать из сметы"
                                style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:14,padding:0,lineHeight:1}}>✕</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{padding:"12px 16px",borderTop:"1px solid #e2e8f0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontSize:12,color:"#94a3b8"}}>Итого по выбранным позициям</span>
                      <span style={{fontSize:15,fontWeight:800,color:"#2563eb"}}>{fmt(grand)} ₸</span>
                    </div>
                  </div>
                );
              })()}

              {/* РАБОТЫ */}
              <div className="card up" style={{display:showSelectedOnly?"none":"block"}}>
                {/* Поиск */}
                <div style={{padding:"10px 12px",borderBottom:"1px solid #e2e8f0",position:"relative"}}>
                  <input className="fi" placeholder="🔍  Поиск по работам... (например: штукатурка, плитка, розетки)"
                    value={search} onChange={e=>setSearch(e.target.value)}
                    style={{paddingLeft:14,paddingRight:search?32:14}}/>
                  {search && (
                    <button onClick={()=>setSearch("")} style={{position:"absolute",right:20,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"#94a3b8",fontSize:16,lineHeight:1}}>×</button>
                  )}
                </div>

                {/* Категории */}
                {!isSearching && <div style={{display:"flex",gap:3,padding:"10px 10px 0",borderBottom:"1px solid #e2e8f0"}}>
                  {cats.map(cat=>(
                    <button key={cat} className={`tab-btn ${activeCat===cat?"active":""}`}
                      onClick={()=>{ const s=Object.keys(Gdyn[cat]||{}); setActiveCat(cat); setActiveSub(s[0]||""); }}>
                      {cat}{catSum(cat)>0&&<span style={{marginLeft:4,fontSize:9,color:"#2563eb"}}>●</span>}
                    </button>
                  ))}
                </div>}

                {/* Подкатегории */}
                {!isSearching && <div style={{display:"flex",flexWrap:"wrap",gap:3,padding:"8px 10px",borderBottom:"1px solid #e2e8f0",background:"rgba(0,0,0,.12)"}}>
                  {subs.map(sub=>(
                    <button key={sub} className={`sub-btn ${safeActiveSub===sub?"active":""}`} onClick={()=>setActiveSub(sub)}>
                      {sub}{subSum(safeCat,sub)>0&&<span style={{marginLeft:3,color:"#2563eb",fontSize:8}}>●</span>}
                    </button>
                  ))}
                </div>}

                {/* Шапка таблицы */}
                <div className="wrow-th" style={{display:"grid",gridTemplateColumns:"1fr 50px 120px 76px 90px",padding:"8px 16px",fontSize:11,color:"#64748b",fontWeight:600,letterSpacing:".04em",textTransform:"uppercase",borderBottom:"1px solid #e2e8f0",background:"#f9fafb"}}>
                  <span>Наименование</span>
                  <span className="wrow-desk" style={{textAlign:"center"}}>Ед.</span>
                  <span className="wrow-desk" style={{textAlign:"right"}}>Цена за ед., ₸</span>
                  <span className="wrow-desk" style={{textAlign:"right"}}>Объём</span>
                  <span className="wrow-desk" style={{textAlign:"right"}}>Итого, ₸</span>
                  <span className="wrow-mob-extra" style={{textAlign:"right",display:"none"}}>Цена · Объём · Итого</span>
                </div>

                {/* Строки работ */}
                <div style={{padding:"4px 0"}}>
                  {isSearching && searchResults.length === 0 && (
                    <div style={{textAlign:"center",padding:"32px 0",color:"#94a3b8"}}>
                      <div style={{fontSize:22,marginBottom:8}}>🔍</div>
                      <div style={{fontSize:13}}>Ничего не найдено</div>
                    </div>
                  )}
                  {isSearching && searchResults.length > 0 && (
                    <div style={{padding:"4px 8px 2px",fontSize:10,color:"#94a3b8",borderBottom:"1px solid #e2e8f0",marginBottom:2}}>
                      Найдено: {searchResults.length} работ
                    </div>
                  )}
                  {(isSearching ? searchResults : (Gdyn[safeCat]?.[safeActiveSub]||[])).map(work=>{
                    const r = rows[work.code]||rows[work.name]||{};
                    const qty = Number(r.qty||0);
                    const cpx = r.complexity||"std";
                    const cpxPct = r.cpxPct !== undefined ? Number(r.cpxPct) : (cpx==="mid"?20:cpx==="hard"?50:0);
                    const price = rowPrice(work);
                    const basePrice = getBasePrice(work);
                    const displayPrice = price ?? basePrice;
                    const total = rowTotal(work);
                    const filled = qty > 0 && price;
                    const showBreadcrumb = isSearching;
                    const tierHint = (work.tiers||[]).length > 1
                      ? (work.tiers||[]).map(t=>`${t.min}–${t.max}: ${fmt(t.price)} ₸`).join(" · ")
                      : null;
                    const isEditingThisPrice = editingPriceRow === work.name || editPrices;
                    const costPerUnit = rowCostPerUnit(r, work);
                    const marginPct = displayPrice && displayPrice > 0 && costPerUnit > 0
                      ? Math.round((displayPrice - costPerUnit) / displayPrice * 100)
                      : null;
                    const grossProfit = qty > 0 && displayPrice != null && costPerUnit > 0
                      ? (displayPrice - costPerUnit) * qty : null;
                    const priceCell = isEditingThisPrice ? (
                      <div style={{display:"flex",alignItems:"center",gap:4}}>
                        <input className="num" style={{width:90}} type="number" min="0" placeholder="Цена"
                          autoFocus={editingPriceRow===work.name}
                          value={r.manualPrice!==undefined ? r.manualPrice : (price||"")}
                          onChange={e=>setRow(work.code || work.name,"manualPrice",e.target.value===""?undefined:Number(e.target.value))}
                          onBlur={()=>{ if(!editPrices) setEditingPriceRow(null); }}
                          onKeyDown={e=>{ if(e.key==="Enter"||e.key==="Escape"){ if(!editPrices) setEditingPriceRow(null); } }}/>
                        {r.manualPrice!==undefined && <span onClick={()=>setRow(work.code || work.name,"manualPrice",undefined)} title="Сбросить" style={{cursor:"pointer",fontSize:10,color:"#ef4444",marginLeft:2}}>✕</span>}
                      </div>
                    ) : displayPrice != null ? (
                      <div style={{display:"flex",alignItems:"center",gap:4,justifyContent:"flex-end"}}>
                        <span style={{fontSize:12,color:r.manualPrice!==undefined?"#2563eb":"#334155",fontWeight:r.manualPrice!==undefined?700:400}}>{fmt(displayPrice)}</span>
                        {currentUser.role!=="viewer" && <span onClick={()=>setEditingPriceRow(work.name)} title="Изменить цену" style={{cursor:"pointer",fontSize:10,color:"#94a3b8",opacity:.7,lineHeight:1}}>✏</span>}
                      </div>
                    ) : rowPriceFrom(work) ? (
                      <div style={{display:"flex",alignItems:"center",gap:4,justifyContent:"flex-end"}}>
                        <span style={{fontSize:11,color:"#b8904a",fontStyle:"italic"}}>от {fmt(rowPriceFrom(work))}</span>
                        {currentUser.role!=="viewer" && <span onClick={()=>setEditingPriceRow(work.name)} title="Ввести точную цену" style={{cursor:"pointer",fontSize:10,color:"#94a3b8"}}>✏</span>}
                      </div>
                    ) : (
                      <div style={{display:"flex",alignItems:"center",gap:4,justifyContent:"flex-end"}}>
                        <span style={{fontSize:10,color:"#94a3b8",fontStyle:"italic"}}>нет цены</span>
                        {currentUser.role!=="viewer" && <span onClick={()=>setEditingPriceRow(work.name)} title="Ввести цену" style={{cursor:"pointer",fontSize:10,color:"#94a3b8"}}>✏</span>}
                      </div>
                    );
                    const qtyInput = <input className="num" style={{width:70,textAlign:"center",opacity:currentUser.role==="viewer"?.4:1}} type="number" min="0" placeholder="0" disabled={currentUser.role==="viewer"}
                      value={r.qty||""} onChange={e=>setRow(work.code || work.name,"qty",e.target.value)}/>;
                    const nameBlock = (
                      <div style={{minWidth:0}}>
                        {showBreadcrumb && <div style={{fontSize:10,color:"#334155",marginBottom:2}}>{work.cat} › {work.sub}</div>}
                        {r.editingName ? (
                          <div style={{display:"flex",alignItems:"center",gap:4}}>
                            <input autoFocus style={{fontSize:13,background:"#f8fafc",border:"1px solid #2563eb",color:"#0f172a",borderRadius:5,padding:"2px 7px",fontFamily:"inherit",outline:"none",width:"100%",minWidth:0}}
                              value={r.manualName !== undefined ? r.manualName : work.name}
                              onChange={e=>setRow(work.code || work.name,"manualName",e.target.value)}
                              onBlur={()=>setRow(work.code || work.name,"editingName",false)}
                              onKeyDown={e=>{if(e.key==="Enter"||e.key==="Escape")setRow(work.code || work.name,"editingName",false);}}/>
                            {r.manualName !== undefined && <span onClick={()=>{setRow(work.code || work.name,"manualName",undefined);setRow(work.code || work.name,"editingName",false);}} title="Сбросить" style={{cursor:"pointer",fontSize:10,color:"#ef4444",flexShrink:0}}>✕</span>}
                          </div>
                        ) : (
                          <div style={{display:"flex",alignItems:"center",gap:4}}>
                            <span style={{fontSize:13,color:filled?"#0f172a":"#94a3b8",lineHeight:1.3}}>{r.manualName !== undefined ? r.manualName : work.name}</span>
                            {currentUser.role!=="viewer" && <span onClick={()=>setRow(work.code || work.name,"editingName",true)} title="Изменить название" style={{cursor:"pointer",fontSize:10,color:"#94a3b8",opacity:.6,flexShrink:0,lineHeight:1}}>✏</span>}
                          </div>
                        )}
                        {tierHint && <div style={{fontSize:10,color:"#334155",marginTop:1}}>{tierHint}</div>}
                        {qty > 0 && currentUser.role!=="viewer" && (
                          <div style={{display:"flex",alignItems:"center",gap:4,marginTop:4}}>
                            <span style={{fontSize:10,color:"#94a3b8"}}>Надбавка:</span>
                            <input className="num" type="number" min="-50" max="300" step="5"
                              style={{width:52,fontSize:11,padding:"2px 6px",textAlign:"right"}}
                              value={cpxPct}
                              onChange={e=>{setRow(work.code || work.name,"cpxPct",Number(e.target.value));setRow(work.code || work.name,"manualPrice",undefined);}}/>
                            <span style={{fontSize:10,color:"#94a3b8"}}>%</span>
                          </div>
                        )}
                        {showFinancial && currentUser.role!=="viewer" && qty > 0 && (
                          <div style={{display:"flex",flexWrap:"wrap",gap:"4px 12px",marginTop:4,fontSize:10,color:"#64748b",alignItems:"center"}}>
                            <span style={{display:"inline-flex",alignItems:"center",gap:3}}>Себест/ед:
                              <input type="number" min="0" placeholder={String(Number(work.cost)||0)}
                                value={r.manualCost!==undefined?r.manualCost:(work.cost||"")}
                                onChange={e=>setRow(work.code || work.name,"manualCost",e.target.value===""?undefined:Number(e.target.value))}
                                style={{width:64,border:"1px solid #e2e8f0",borderRadius:4,padding:"1px 5px",fontSize:11,textAlign:"right",fontFamily:"inherit",background:"#fff",color:r.manualCost!==undefined?"#2563eb":"#334155",fontWeight:r.manualCost!==undefined?700:400}}/>
                              {r.manualCost!==undefined && <span onClick={()=>setRow(work.code || work.name,"manualCost",undefined)} title="Сбросить" style={{cursor:"pointer",color:"#ef4444"}}>✕</span>}
                            </span>
                            {costPerUnit > 0 && <span>Себест: <b style={{color:"#334155"}}>{fmt(costPerUnit * qty)} ₸</b></span>}
                            {marginPct !== null && (
                              <span>Маржа: <b style={{color: marginPct>=35?"#059669":marginPct>=20?"#d97706":"#ef4444"}}>{marginPct}%</b></span>
                            )}
                            {grossProfit !== null && grossProfit > 0 && (
                              <span>Прибыль: <b style={{color:"#059669"}}>{fmt(Math.round(grossProfit))} ₸</b></span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                    return (
                      <div key={work.name} className={`wrow ${filled?"on":""}`}>
                        {/* Desktop: 5 cols via CSS class; Mobile: overridden to 2 cols */}
                        <style>{`@media(min-width:701px){.wrow{grid-template-columns:1fr 50px 120px 76px 90px}}.wrow-mob-extra{display:none}@media(max-width:700px){.wrow{grid-template-columns:1fr auto!important}.wrow-mob-extra{display:flex!important}}`}</style>
                        {nameBlock}
                        <div className="wrow-desk" style={{textAlign:"center",fontSize:12,paddingTop:3,display:"flex",alignItems:"center",justifyContent:"center",gap:3}}>
                          {r.editingUnit ? (
                            <div style={{display:"flex",alignItems:"center",gap:3}}>
                              <input autoFocus style={{width:46,background:"#f8fafc",border:"1px solid #2563eb",borderRadius:4,padding:"2px 5px",fontSize:11,fontFamily:"inherit",outline:"none",textAlign:"center",color:"#0f172a"}}
                                value={r.manualUnit !== undefined ? r.manualUnit : work.unit}
                                onChange={e=>setRow(work.code || work.name,"manualUnit",e.target.value)}
                                onBlur={()=>setRow(work.code || work.name,"editingUnit",false)}
                                onKeyDown={e=>{if(e.key==="Enter"||e.key==="Escape")setRow(work.code || work.name,"editingUnit",false);}}/>
                              {r.manualUnit !== undefined && <span onClick={()=>{setRow(work.code || work.name,"manualUnit",undefined);setRow(work.code || work.name,"editingUnit",false);}} title="Сбросить" style={{cursor:"pointer",fontSize:10,color:"#ef4444"}}>✕</span>}
                            </div>
                          ) : (
                            <>
                              <span style={{color:r.manualUnit!==undefined?"#2563eb":"#94a3b8",fontWeight:r.manualUnit!==undefined?700:400}}>{r.manualUnit !== undefined ? r.manualUnit : work.unit}</span>
                              {currentUser.role!=="viewer" && <span onClick={()=>setRow(work.code || work.name,"editingUnit",true)} title="Изменить ед. изм." style={{cursor:"pointer",fontSize:10,color:"#94a3b8",opacity:.6,lineHeight:1}}>✏</span>}
                            </>
                          )}
                        </div>
                        <div className="wrow-desk" style={{textAlign:"right",paddingTop:2}}>{priceCell}</div>
                        <div className="wrow-desk" style={{textAlign:"right"}}>{qtyInput}</div>
                        <div className="wrow-desk" style={{textAlign:"right",paddingTop:3}}>
                          {total>0 ? <span style={{fontSize:13,fontWeight:700,color:"#2563eb"}}>{fmt(total)}</span>
                                   : <span style={{color:"#94a3b8",fontSize:12}}>—</span>}
                        </div>
                        {/* Mobile right column: цена/ед · поле · итог */}
                        <div className="wrow-mob-extra" style={{flexDirection:"column",alignItems:"flex-end",gap:3,display:"none",paddingTop:2,minWidth:90}}>
                          <span style={{fontSize:11,color:"#94a3b8",whiteSpace:"nowrap"}}>
                            {displayPrice!=null ? fmt(displayPrice)+" ₸/ед" : <span style={{fontStyle:"italic",fontSize:10}}>нет цены</span>}
                          </span>
                          <input className="num" style={{width:82,textAlign:"center",fontSize:16,padding:"7px 10px",fontWeight:700}} type="number" min="0" placeholder="0"
                            value={r.qty||""} onChange={e=>setRow(work.code || work.name,"qty",e.target.value)}/>
                          {total>0
                            ? <span style={{fontSize:12,fontWeight:800,color:"#0f172a",whiteSpace:"nowrap"}}>{fmt(total)} ₸</span>
                            : <span style={{fontSize:10,color:"#334155"}}>—</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {!isSearching && subSum(safeCat,safeActiveSub)>0&&(
                  <div style={{borderTop:"1px solid #e2e8f0",padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,flexWrap:"wrap"}}>
                    <span style={{fontSize:11,color:"#94a3b8"}}>Итого по разделу «{safeActiveSub}»</span>
                    <div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
                      {showFinancial && currentUser.role!=="viewer" && (() => {
                        const subWorks = (Gdyn[safeCat]?.[safeActiveSub]||[]);
                        let subCost=0, subProfit=0;
                        for(const w of subWorks){
                          const rr=rows[w.code]||rows[w.name]||{};
                          const qty=Number(rr.qty||0);
                          const p=rowPrice(w); const bp=getBasePrice(w);
                          const dp=p??bp;
                          const cpu=rowCostPerUnit(rr,w);
                          subCost+=cpu*qty;
                          if(qty>0&&dp!=null) subProfit+=(dp-cpu)*qty;
                        }
                        return subCost>0 ? (
                          <span style={{fontSize:11,color:"#64748b"}}>
                            Себест: <b style={{color:"#334155"}}>{fmt(Math.round(subCost))} ₸</b>
                            {subProfit>0 && <> · Прибыль: <b style={{color:"#059669"}}>{fmt(Math.round(subProfit))} ₸</b></>}
                          </span>
                        ) : null;
                      })()}
                      <span style={{fontSize:15,fontWeight:700,color:"#2563eb"}}>{fmt(subSum(safeCat,safeActiveSub))} ₸</span>
                    </div>
                  </div>
                )}
                {isSearching && searchResults.length > 0 && (() => {
                  const searchTotal = searchResults.reduce((s,w) => s + rowTotal(w), 0);
                  return searchTotal > 0 ? (
                    <div style={{borderTop:"1px solid #e2e8f0",padding:"10px 14px",display:"flex",justifyContent:"space-between"}}>
                      <span style={{fontSize:11,color:"#94a3b8"}}>Итого по найденным работам</span>
                      <span style={{fontSize:15,fontWeight:700,color:"#2563eb"}}>{fmt(searchTotal)} ₸</span>
                    </div>
                  ) : null;
                })()}
              </div>

              {/* ПРАВАЯ ПАНЕЛЬ */}
              <div id="summary-panel" style={{display:"flex",flexDirection:"column",gap:14}}>
                <div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,padding:18}} className="up">
                  <div style={{fontSize:10,fontWeight:700,color:"#2563eb",letterSpacing:1.5,textTransform:"uppercase",marginBottom:14}}>Смета</div>
                  {cats.map(cat=>{
                    const cs = catSum(cat);
                    if(!cs) return null;
                    return (
                      <div key={cat} style={{marginBottom:8}}>
                        <div style={{fontSize:10,color:"#94a3b8",fontWeight:700,textTransform:"uppercase",letterSpacing:.7,padding:"5px 0 3px",borderBottom:"1px solid #e2e8f0"}}>{cat}</div>
                        {Object.keys(Gdyn[cat]||{}).map(sub=>{
                          const ss = subSum(cat,sub);
                          if(!ss) return null;
                          return (
                            <div key={sub} style={{display:"flex",justifyContent:"space-between",padding:"4px 0 4px 6px",fontSize:12,borderBottom:"1px solid #f3f4f6"}}>
                              <span style={{color:"#94a3b8"}}>{sub}</span>
                              <span style={{color:"#94a3b8"}}>{fmt(ss)} ₸</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                  {grand===0&&<div style={{textAlign:"center",padding:"22px 0",color:"#94a3b8",fontSize:12}}>Введите объёмы →</div>}
                  {grand>0&&(
                    <>
                      <div style={{marginTop:10,paddingTop:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{fontSize:12,color:"#94a3b8"}}>Скидка %</span>
                        <input className="num" style={{width:54}} type="number" min="0" max="100"
                          value={discount} onChange={e=>setDiscount(Math.min(100,Math.max(0,Number(e.target.value))))}/>
                      </div>
                      {discount>0&&(
                        <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#dc2626",marginTop:6}}>
                          <span>Скидка {discount}%</span><span>− {fmt(discAmt)} ₸</span>
                        </div>
                      )}
                      {currentUser.role!=="viewer" && (
                        <div style={{marginTop:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                          <span style={{fontSize:12,color:"#94a3b8"}}>Повышение % <span style={{fontSize:10,color:"#d97706"}}>🔒</span></span>
                          <input className="num" style={{width:54}} type="number" min="0" max="300"
                            value={markup} onChange={e=>setMarkup(Math.max(0,Number(e.target.value)))}/>
                        </div>
                      )}
                      {markup>0&&currentUser.role!=="viewer"&&(
                        <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#d97706",marginTop:4}}>
                          <span>Повышение {markup}%</span><span>+ {fmt(markupAmt)} ₸</span>
                        </div>
                      )}
                      <div style={{borderTop:"1px solid #e2e8f0",marginTop:12,paddingTop:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{fontSize:12,color:"#2563eb"}}>Итого</span>
                        <span style={{fontSize:22,fontWeight:900,color:"#2563eb"}}>{fmt(final)} ₸</span>
                      </div>
                      {proj.area&&Number(proj.area)>0&&(
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:6,padding:"5px 8px",background:"#eff6ff",borderRadius:8}}>
                          <span style={{fontSize:11,color:"#d97706"}}>Цена за м²</span>
                          <span style={{fontSize:13,fontWeight:700,color:"#2563eb"}}>≈ {fmt(final/Number(proj.area))} ₸</span>
                        </div>
                      )}
                      {showFinancial && currentUser.role!=="viewer" && (() => {
                        const allFilled = getEffectiveCatalog().filter(w => Number((rows[w.code]||rows[w.name]||{}).qty||0) > 0);
                        let totalCost=0, totalRevenue=0;
                        for(const w of allFilled){
                          const rr=rows[w.code]||rows[w.name]||{};
                          const qty=Number(rr.qty||0);
                          const p=rowPrice(w); const bp=getBasePrice(w); const dp=p??bp;
                          totalCost += rowCostPerUnit(rr,w)*qty;
                          if(dp!=null) totalRevenue += dp*qty;
                        }
                        const revenueAfterDiscount = final; // уже с учётом скидки
                        const totalProfit = revenueAfterDiscount - totalCost;
                        const avgMargin = revenueAfterDiscount > 0 ? Math.round(totalProfit/revenueAfterDiscount*100) : 0;
                        return totalCost > 0 ? (
                          <div style={{marginTop:10,padding:"10px 12px",background:"#f0fdf4",borderRadius:8,border:"1px solid #bbf7d0"}}>
                            <div style={{fontSize:10,color:"#059669",fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>Финансы (внутренние)</div>
                            <div style={{display:"flex",flexDirection:"column",gap:5,fontSize:12}}>
                              <div style={{display:"flex",justifyContent:"space-between"}}>
                                <span style={{color:"#64748b"}}>Себестоимость</span>
                                <span style={{fontWeight:600,color:"#334155"}}>{fmt(Math.round(totalCost))} ₸</span>
                              </div>
                              <div style={{display:"flex",justifyContent:"space-between"}}>
                                <span style={{color:"#64748b"}}>Цена клиента{discount>0?` (−${discount}%)`:""}</span>
                                <span style={{fontWeight:600,color:"#334155"}}>{fmt(Math.round(revenueAfterDiscount))} ₸</span>
                              </div>
                              <div style={{display:"flex",justifyContent:"space-between",borderTop:"1px solid #bbf7d0",paddingTop:5,marginTop:2}}>
                                <span style={{color:"#059669",fontWeight:700}}>Валовая прибыль</span>
                                <span style={{fontWeight:800,color:"#059669"}}>{fmt(Math.round(totalProfit))} ₸</span>
                              </div>
                              <div style={{display:"flex",justifyContent:"space-between"}}>
                                <span style={{color:"#64748b"}}>Маржа</span>
                                <span style={{fontWeight:700,color:avgMargin>=35?"#059669":avgMargin>=20?"#d97706":"#ef4444"}}>{avgMargin}%</span>
                              </div>
                            </div>
                          </div>
                        ) : null;
                      })()}
                    </>
                  )}
                </div>
                {/* Статус сметы */}
                <div className="card" style={{padding:14}}>
                  <div style={{fontSize:10,color:"#94a3b8",fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",marginBottom:8}}>Статус</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {STATUSES.map(s=>(
                      <button key={s.key} onClick={()=>{setEstStatus(s.key);if(s.key==="sent"&&!estSentAt)setEstSentAt(new Date().toISOString().slice(0,10));}}
                        style={{fontSize:11,fontWeight:700,padding:"4px 12px",borderRadius:8,cursor:"pointer",fontFamily:"inherit",border:`1px solid ${estStatus===s.key?s.color:"rgba(0,0,0,.04)"}`,background:estStatus===s.key?s.bg:"transparent",color:estStatus===s.key?s.color:"#94a3b8",transition:"all .15s"}}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                  {estStatus==="sent" && (
                    <div style={{marginTop:8,display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:11,color:"#7c3aed",fontWeight:600}}>Дата отправки:</span>
                      <input type="date" className="fi" value={estSentAt} onChange={e=>setEstSentAt(e.target.value)}
                        style={{fontSize:12,padding:"3px 8px",borderRadius:8,border:"1px solid rgba(124,58,237,.3)",width:150,color:"#7c3aed",fontFamily:"inherit"}}/>
                    </div>
                  )}
                </div>
                {/* История изменений */}
                {(() => {
                  const rec = estimates.find(e => e.id === currentId);
                  const hist = Array.isArray(rec?.history) ? rec.history : [];
                  if (hist.length === 0) return null;
                  return (
                    <div className="card" style={{padding:14}}>
                      <div onClick={()=>setShowHistory(v=>!v)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer"}}>
                        <span style={{fontSize:10,color:"#94a3b8",fontWeight:700,letterSpacing:1.2,textTransform:"uppercase"}}>История изменений ({hist.length})</span>
                        <span style={{fontSize:12,color:"#94a3b8"}}>{showHistory?"▲":"▼"}</span>
                      </div>
                      {showHistory && (
                        <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:0,maxHeight:240,overflowY:"auto"}}>
                          {[...hist].reverse().map((h,i)=>(
                            <div key={i} style={{display:"flex",gap:8,padding:"6px 0",borderTop:i>0?"1px solid rgba(0,0,0,.05)":"none",fontSize:12}}>
                              <span style={{color:"#94a3b8",whiteSpace:"nowrap",flexShrink:0,fontSize:11}}>{fmtDate(h.ts)}</span>
                              <span style={{flex:1,color:"#334155"}}><b style={{color:"#0f172a"}}>{h.by||"?"}</b> · {h.action}{h.total>0?<span style={{color:"#94a3b8"}}> · {fmt(h.total)} ₸</span>:null}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
                {/* Комментарий для менеджера */}
                <div className="card" style={{padding:14}}>
                  <div style={{fontSize:10,color:"#94a3b8",fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",marginBottom:7}}>Комментарий</div>
                  <textarea className="fi" rows={3} style={{resize:"vertical",minHeight:60,overflowY:"auto"}} placeholder="Заметка для менеджера..." value={estComment} onChange={e=>setEstComment(e.target.value)}/>
                </div>
                <div className="card" style={{padding:14}}>
                  <div style={{fontSize:10,color:"#94a3b8",fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",marginBottom:7}}>Примечание в КП</div>
                  <textarea className="fi" rows={3} style={{resize:"vertical",minHeight:60,overflowY:"auto"}} placeholder="Доп. условия для клиента..." value={note} onChange={e=>setNote(e.target.value)}/>
                </div>
                <button className="btn btn-g" disabled={kpItems.length===0} onClick={()=>setShowKP(true)}>
                  Сформировать КП
                </button>

                <button className="btn btn-o" onClick={()=>{
                  if(countFilled(rows)===0 || window.confirm("Очистить все позиции этой сметы? Действие можно откатить через «Бэкапы».")){
                    _allowEmptySave.current = true;
                    setRows({});setDiscount(0);setNote("");
                    setTimeout(()=>{ _allowEmptySave.current = false; }, 3000);
                  }
                }}>
                  Сбросить позиции
                </button>
              </div>
            </div>
          </div>

          {/* Плавающая кнопка итога */}
          {screen === "editor" && grand > 0 && (
            <div style={{position:"fixed",bottom:22,right:18,zIndex:50}}>
              <button
                onClick={()=>{
                  const el = document.getElementById("summary-panel");
                  if(el) {
                    const rect = el.getBoundingClientRect();
                    if(rect.top > window.innerHeight*0.8) {
                      el.scrollIntoView({behavior:"smooth",block:"start"});
                    } else {
                      window.scrollTo({top:0,behavior:"smooth"});
                    }
                  }
                }}
                style={{
                  background:"#2563eb",
                  color:"#f3f4f6",border:"none",borderRadius:30,
                  padding:"11px 18px",fontFamily:"inherit",fontWeight:800,
                  fontSize:14,cursor:"pointer",
                  boxShadow:"0 4px 24px rgba(184,144,74,.55)",
                  display:"flex",alignItems:"center",gap:8,whiteSpace:"nowrap"
                }}>
                <span>⇅</span>
                <span>{fmt(final)} ₸</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          КП МОДАЛ
      ═══════════════════════════════════════════════════════════════════ */}
      {listBackups !== null && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:320,padding:16}} onClick={()=>setListBackups(null)}>
          <div style={{background:"#fff",borderRadius:10,padding:"20px 22px",maxWidth:480,width:"100%",maxHeight:"80vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <div style={{fontWeight:800,fontSize:16,color:"#0f172a"}}>🕘 Бэкапы {listBackups.label}</div>
              <button onClick={()=>setListBackups(null)} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:"#94a3b8"}}>✕</button>
            </div>
            <div style={{fontSize:12,color:"#94a3b8",marginBottom:14}}>Снимки перед каждым изменением (последние 20). Можно откатиться к любому.</div>
            {listBackups.items.length===0 && <div style={{textAlign:"center",padding:"30px 0",color:"#94a3b8",fontSize:13}}>Бэкапов пока нет — появятся после первого изменения</div>}
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {listBackups.items.map((snap,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"10px 12px",background:"#f9fafb",border:"1px solid #e2e8f0",borderRadius:8}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:"#0f172a"}}>{new Date(snap.ts).toLocaleString("ru-RU")}</div>
                    <div style={{fontSize:11,color:"#94a3b8"}}>Записей: {snap.count}{snap.by?` · ${snap.by}`:""}{i===0?" · последний":""}</div>
                  </div>
                  <button onClick={()=>listBackups.onRestore(snap)}
                    style={{background:"#eff6ff",color:"#2563eb",border:"1px solid rgba(37,99,235,.2)",borderRadius:8,padding:"6px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                    Восстановить
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {backupsModal!==null && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:320,padding:16}}
          onClick={()=>setBackupsModal(null)}>
          <div style={{background:"#fff",borderRadius:10,padding:"20px 22px",maxWidth:520,width:"100%",maxHeight:"80vh",overflowY:"auto"}}
            onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <div style={{fontWeight:800,fontSize:16,color:"#0f172a"}}>🕘 Бэкапы архива</div>
              <button onClick={()=>setBackupsModal(null)} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:"#94a3b8"}}>✕</button>
            </div>
            <div style={{fontSize:12,color:"#94a3b8",marginBottom:14}}>Снимки архива перед каждой записью (последние 20). Можно откатиться к любому.</div>
            {backupsModal.length===0 && <div style={{textAlign:"center",padding:"30px 0",color:"#94a3b8",fontSize:13}}>Бэкапов пока нет</div>}
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {backupsModal.map((snap,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"10px 12px",background:"#f9fafb",border:"1px solid #e2e8f0",borderRadius:8}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:"#0f172a"}}>{new Date(snap.ts).toLocaleString("ru-RU")}</div>
                    <div style={{fontSize:11,color:"#94a3b8"}}>Смет: {snap.count}{snap.by?` · ${snap.by}`:""}{i===0?" · последний":""}</div>
                  </div>
                  <button onClick={()=>restoreBackup(snap)}
                    style={{background:"#eff6ff",color:"#2563eb",border:"1px solid rgba(37,99,235,.2)",borderRadius:8,padding:"6px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                    Восстановить
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Единый бэкап рабочего пространства */}
      {wsBackupsModal!==null && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:320,padding:16}}
          onClick={()=>setWsBackupsModal(null)}>
          <div style={{background:"#fff",borderRadius:10,padding:"20px 22px",maxWidth:520,width:"100%",maxHeight:"80vh",overflowY:"auto"}}
            onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <div style={{fontWeight:800,fontSize:16,color:"#0f172a"}}>🕘 Бэкапы рабочего пространства</div>
              <button onClick={()=>setWsBackupsModal(null)} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:"#94a3b8"}}>✕</button>
            </div>
            <div style={{fontSize:12,color:"#94a3b8",marginBottom:14}}>Каждый снимок — объекты, сметы, договоры + финансовые операции (последние 30). Восстановление вернёт всё целиком.</div>
            {wsBackupsModal.length===0 && <div style={{textAlign:"center",padding:"30px 0",color:"#94a3b8",fontSize:13}}>Снимков пока нет — появятся автоматически после изменений</div>}
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {wsBackupsModal.map((snap,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"10px 12px",background:"#f9fafb",border:"1px solid #e2e8f0",borderRadius:8}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:"#0f172a"}}>{new Date(snap.ts).toLocaleString("ru-RU")}</div>
                    <div style={{fontSize:11,color:"#94a3b8"}}>📦 {snap.counts?.o??(snap.objects?.length||0)} · 📋 {snap.counts?.e??(snap.estimates?.length||0)} · 📄 {snap.counts?.c??(snap.contracts?.length||0)} · 💰 {snap.counts?.f??(snap.financeTx?.length||0)} оп.{snap.by?` · ${snap.by}`:""}{i===0?" · последний":""}</div>
                  </div>
                  <button onClick={()=>restoreWorkspace(snap)}
                    style={{background:"#eff6ff",color:"#2563eb",border:"1px solid rgba(37,99,235,.2)",borderRadius:8,padding:"6px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                    Восстановить
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {importModal && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:320,padding:16}}
          onClick={()=>!importBusy && setImportModal(false)}>
          <div style={{background:"#fff",borderRadius:10,padding:"20px 22px",maxWidth:560,width:"100%",maxHeight:"85vh",overflowY:"auto"}}
            onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <div style={{fontWeight:800,fontSize:16,color:"#0f172a"}}>⬆ Импорт смет из JSON</div>
              <button onClick={()=>!importBusy && setImportModal(false)} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:"#94a3b8"}}>✕</button>
            </div>
            <div style={{fontSize:12,color:"#94a3b8",marginBottom:12}}>Вставьте JSON, полученный для восстановления смет. Текущий архив уйдёт в бэкап — откат доступен через «Бэкапы».</div>
            <textarea
              value={importText}
              onChange={e=>setImportText(e.target.value)}
              placeholder='{"customWorks":[...],"estimates":[...]}'
              style={{width:"100%",minHeight:200,resize:"vertical",background:"#f9fafb",border:"1px solid #e2e8f0",borderRadius:8,padding:"10px 12px",fontFamily:"monospace",fontSize:12,color:"#0f172a",outline:"none"}}/>
            <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:14}}>
              <button onClick={()=>!importBusy && setImportModal(false)}
                style={{background:"#e2e8f0",color:"#64748b",border:"none",cursor:"pointer",padding:"9px 16px",borderRadius:7,fontFamily:"inherit",fontSize:13,fontWeight:600}}>Отмена</button>
              <button onClick={runImport} disabled={importBusy||!importText.trim()}
                style={{background:importBusy||!importText.trim()?"#93c5fd":"#2563eb",color:"#fff",border:"none",cursor:importBusy||!importText.trim()?"default":"pointer",padding:"9px 18px",borderRadius:7,fontFamily:"inherit",fontSize:13,fontWeight:700}}>
                {importBusy?"Импорт…":"Импортировать"}</button>
            </div>
          </div>
        </div>
      )}

      {showKP&&(
        <>
          {/* Overlay + modal для экрана */}
          <div className="kp-no-print" style={{position:"fixed",inset:0,background:"rgba(0,0,0,.78)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,padding:16}}
            onClick={()=>{ setShowKP(false); setKpLink(""); setKpStat(""); setKpMsg(""); setKpStale(false); }}>
            <div style={{background:"#ffffff",color:"#0f172a",borderRadius:8,padding:"24px 28px",maxWidth:700,width:"100%",maxHeight:"90vh",overflowY:"auto",fontFamily:"'Inter','Segoe UI',sans-serif"}}
              onClick={e=>e.stopPropagation()}>
              <KPContent proj={proj} kpItems={kpItems} fromItems={kpFromItems} discount={discount} discAmt={discAmt} final={final} note={note}/>
              <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:20,flexWrap:"wrap"}}>
                <button style={{background:"#e2e8f0",color:"#94a3b8",border:"none",cursor:"pointer",padding:"10px 18px",borderRadius:7,fontFamily:"inherit",fontSize:13,fontWeight:600}} onClick={()=>{ setShowKP(false); setKpLink(""); setKpMsg(""); setKpStat(""); setKpStale(false); }}>Закрыть</button>
                <button disabled={kpPublishing||!currentId} title="Опубликовать КП и получить ссылку для клиента" style={{background:"#b8904a",color:"#fff",border:"none",cursor:(kpPublishing||!currentId)?"default":"pointer",opacity:!currentId?0.6:1,padding:"10px 18px",borderRadius:7,fontFamily:"inherit",fontSize:13,fontWeight:700}} onClick={async ()=>{
                  if(!currentId){ setKpMsg("Сначала сохраните смету"); return; }
                  setKpPublishing(true); setKpMsg("");
                  try {
                    // сохраняем отметки клиента (просмотры/принятие) при переотправке
                    let prev = {}; try { const pr = await storage.getResult("titovstroy-kp-"+currentId); if (pr.status==="found" && pr.value) prev = JSON.parse(pr.value); } catch {}
                    const snap = { proj, kpItems, fromItems:kpFromItems, discount, discAmt, final, note, publishedAt:Date.now(), viewedAt:prev.viewedAt, viewCount:prev.viewCount, acceptedAt:prev.acceptedAt };
                    const res = await storage.set("titovstroy-kp-"+currentId, JSON.stringify(snap));
                    const link = window.location.origin + window.location.pathname + "#/kp/" + currentId;
                    setKpLink(link);
                    try { await navigator.clipboard.writeText(link); } catch {}
                    setKpMsg(res && res.fbOk===false ? "⚠ Опубликовано локально (облако недоступно)" : "✓ Ссылка скопирована");
                    setKpStale(false);
                    if (prev.viewCount || prev.acceptedAt) setKpStat(kpStatusText(prev));
                  } catch(e) { setKpMsg("Ошибка публикации — проверьте интернет"); }
                  setKpPublishing(false);
                }}>{kpPublishing?"Публикуем…":"🔗 Ссылка клиенту"}</button>
                <button style={{background:"#2563eb",color:"#f3f4f6",border:"none",cursor:"pointer",padding:"10px 20px",borderRadius:7,fontFamily:"inherit",fontSize:13,fontWeight:700}} onClick={async ()=>{
                const el = document.getElementById("kp-print-portal");
                // Конвертируем /stamp.jpg в base64 чтобы работало в blob-окне
                let stampB64 = "";
                try {
                  const resp = await fetch("/stamp.jpg");
                  const blob = await resp.blob();
                  stampB64 = await new Promise(res => {
                    const r = new FileReader();
                    r.onload = () => res(r.result);
                    r.readAsDataURL(blob);
                  });
                } catch(e) {}
                const css = [
                  "@import url('https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700;900&display=swap');",
                  "*{box-sizing:border-box;margin:0;padding:0}",
                  "body{font-family:'Inter','Segoe UI',sans-serif;background:#ffffff;color:#111827;padding:24px;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact}",
                  "table{width:100%;border-collapse:collapse}",
                  "@page{margin:8mm;size:A4 portrait}",
                  "@media print{.no-print{display:none!important}body{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}}"
                ].join(" ");
                let innerHTML = el.innerHTML;
                if (stampB64) innerHTML = innerHTML.replace(/src="\/stamp\.jpg"/g, `src="${stampB64}"`);
                const docParts = [proj.name, proj.phone, proj.address, today()].filter(Boolean);
                const docTitle = docParts.length ? "КП " + docParts.join(" — ") : "КП TitovStroy";
                const html = "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>" + docTitle + "</title><style>" + css + "</style></head><body>" + innerHTML + "<div class=\"no-print\" style=\"margin-top:24px;text-align:center\"><button onclick=\"window.print()\" style=\"padding:12px 32px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:15px;cursor:pointer;font-weight:700;font-family:inherit\">🖨 Сохранить PDF</button></div></body></html>";
                openOrPrintHtml(html, 30000);
              }}>Печать / PDF</button>
              </div>
              {kpLink && (
                <div style={{marginTop:14,background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:8,padding:"12px 14px"}}>
                  <div style={{fontSize:12,color:"#059669",fontWeight:700,marginBottom:7}}>{kpMsg||"Ссылка готова"} — отправьте клиенту:</div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                    <input readOnly value={kpLink} onFocus={e=>e.target.select()} style={{flex:1,minWidth:160,border:"1px solid #cbd5e1",borderRadius:6,padding:"8px 10px",fontSize:12,fontFamily:"inherit",color:"#0f172a",background:"#fff"}}/>
                    <a href={"https://wa.me/?text="+encodeURIComponent("Ценовое предложение от TitovStroy: "+kpLink)} target="_blank" rel="noopener" style={{background:"#25D366",color:"#fff",textDecoration:"none",padding:"9px 14px",borderRadius:6,fontSize:12,fontWeight:700,whiteSpace:"nowrap"}}>📲 WhatsApp</a>
                  </div>
                  <div style={{display:"flex",gap:8,alignItems:"center",marginTop:9,flexWrap:"wrap"}}>
                    <button onClick={async ()=>{ setKpStat("проверяю…"); try { const r=await storage.getResult("titovstroy-kp-"+currentId); let d={}; try{ if(r.status==="found"&&r.value) d=JSON.parse(r.value); }catch{} setKpStat(kpStatusText(d)); } catch { setKpStat("не удалось проверить"); } }}
                      style={{background:"#fff",border:"1px solid #cbd5e1",borderRadius:6,padding:"7px 12px",fontSize:11.5,fontWeight:600,color:"#475569",cursor:"pointer",fontFamily:"inherit"}}>🔄 Статус у клиента</button>
                    {kpStat && <span style={{fontSize:11.5,color:kpStat.includes("ПРИНЯТО")?"#059669":"#475569",fontWeight:kpStat.includes("ПРИНЯТО")?700:400}}>{kpStat}</span>}
                  </div>
                  {kpStale && <div style={{marginTop:9,background:"#fffbeb",border:"1px solid #fde68a",borderRadius:6,padding:"8px 10px",fontSize:11.5,color:"#b45309",fontWeight:600}}>⚠ Смета изменена после публикации — клиент по ссылке видит старую версию. Нажмите «🔗 Ссылка клиенту», чтобы обновить.</div>}
                  <div style={{fontSize:10.5,color:"#94a3b8",marginTop:7}}>Клиент откроет КП по ссылке и сможет нажать «Принять». При правках сметы опубликуйте заново.</div>
                </div>
              )}
            </div>
          </div>
          {/* Портал для печати — точная копия, отображается только при print */}
          <div id="kp-print-portal" style={{display:"none",fontFamily:"'Inter','Segoe UI',sans-serif",background:"#ffffff",padding:"20px 24px",color:"#0f172a"}}>
            <KPContent proj={proj} kpItems={kpItems} fromItems={kpFromItems} discount={discount} discAmt={discAmt} final={final} note={note}/>
          </div>
        </>
      )}

      {/* ЭКРАН: АНАЛИТИКА */}
      {effScreen === "analytics" && (()=>{
        const { baseEst, baseCon, totalEst, withSumEst, totalSumEst, avgEst, totalCon, totalSumCon, avgCon, byStatus, byType, topCats, managers, managerStats, byConType, TYPE_L2,
          wonRevenue, wonCost, wonProfit, wonMargin, allRevenue, allCost, allProfit, allMargin, funnel, winRateOverall, winRateSent, catProfit, monthly, staleSent,
          avgDealDays, avgApprovalDays, signedObjsCount, convByType, topObjects, objVal } = analyticsData;
        const PERIOD_BTNS = [["all","Всё время"],["month","Месяц"],["3month","3 месяца"],["week","Неделя"],["custom","Вручную"]];
        return (
          <div className="page">
            <div className="hero" style={{background:"linear-gradient(135deg,#0f172a 0%,#1e293b 70%,#283549 100%)",borderRadius:16,padding:"24px 28px",marginBottom:24,position:"relative",overflow:"hidden",boxShadow:"0 4px 20px rgba(15,23,42,.3)"}}>
              <div style={{position:"absolute",top:-30,right:-30,width:160,height:160,borderRadius:"50%",background:"rgba(59,130,246,.08)"}}/>
              <div style={{position:"relative",zIndex:1}}>
                <h1 style={{margin:0,fontSize:22,fontWeight:900,color:"#fff"}}>📊 Аналитика</h1>
                <div style={{fontSize:13,color:"rgba(255,255,255,.75)",marginTop:4}}>Статистика по объектам и договорам</div>
              </div>
            </div>
            <div className="an-filters" style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,padding:"16px 18px",marginBottom:20,display:"flex",flexWrap:"wrap",gap:16}}>
              <div style={{flex:"1 1 300px"}}>
                <div style={{fontSize:10,color:"#94a3b8",textTransform:"uppercase",letterSpacing:1,marginBottom:8,fontWeight:700}}>Период</div>
                <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                  {PERIOD_BTNS.map(([k,l])=>(
                    <button key={k} onClick={()=>setStatsPeriod(k)}
                      style={{fontSize:11,fontWeight:600,padding:"5px 12px",borderRadius:7,cursor:"pointer",fontFamily:"inherit",
                        border:"1px solid "+(statsPeriod===k?"#2563eb":"rgba(0,0,0,.04)"),
                        background:statsPeriod===k?"#eff6ff":"transparent",
                        color:statsPeriod===k?"#2563eb":"#94a3b8"}}>{l}</button>
                  ))}
                </div>
                {statsPeriod==="custom" && (
                  <div style={{display:"flex",gap:10,marginTop:10,flexWrap:"wrap"}}>
                    <div><div style={{fontSize:10,color:"#94a3b8",marginBottom:4}}>С</div><input type="date" className="fi" style={{width:"auto"}} value={statsDateFrom} onChange={e=>setStatsDateFrom(e.target.value)}/></div>
                    <div><div style={{fontSize:10,color:"#94a3b8",marginBottom:4}}>По</div><input type="date" className="fi" style={{width:"auto"}} value={statsDateTo} onChange={e=>setStatsDateTo(e.target.value)}/></div>
                  </div>
                )}
              </div>
              <div style={{flex:"1 1 200px"}}>
                <div style={{fontSize:10,color:"#94a3b8",textTransform:"uppercase",letterSpacing:1,marginBottom:8,fontWeight:700}}>Менеджер</div>
                <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                  <button onClick={()=>setStatsManager("")} style={{fontSize:11,fontWeight:600,padding:"5px 12px",borderRadius:7,cursor:"pointer",fontFamily:"inherit",border:"1px solid "+(!statsManager?"#2563eb":"rgba(0,0,0,.04)"),background:!statsManager?"rgba(136,136,204,.15)":"transparent",color:!statsManager?"#2563eb":"#94a3b8"}}>🏢 Все</button>
                  {managers.map(m=>(<button key={m} onClick={()=>setStatsManager(m)} style={{fontSize:11,fontWeight:600,padding:"5px 12px",borderRadius:7,cursor:"pointer",fontFamily:"inherit",border:"1px solid "+(statsManager===m?"#2563eb":"rgba(0,0,0,.04)"),background:statsManager===m?"rgba(136,136,204,.15)":"transparent",color:statsManager===m?"#2563eb":"#94a3b8"}}>👤 {m}</button>))}
                </div>
              </div>
            </div>
            <div className="kpi-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:14,marginBottom:20}}>
              {[["Создано объектов",totalEst,"в периоде, без архива","#2563eb","📋"],["Объём объектов",fmt(totalSumEst)+" ₸","сумма смет","#2563eb","💰"],["Ср. чек",fmt(avgEst)+" ₸","на объект","#059669","🎯"],["Договоров",totalCon,"по объектам","#2563eb","📄"],["Объём договоров",fmt(totalSumCon)+" ₸","сумма договоров","#2563eb","🧾"],["Средний договор",fmt(avgCon)+" ₸","на договор","#059669","📊"]].map(([l,v,s,c,ic],i)=>(
                <div key={i} style={{background:"#ffffff",border:"1px solid #eef2f7",borderRadius:16,padding:"16px 18px",boxShadow:"0 1px 2px rgba(15,23,42,.04),0 10px 30px -12px rgba(15,23,42,.12)",position:"relative",overflow:"hidden",transition:"transform .18s ease,box-shadow .18s ease"}}
                  onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow="0 1px 2px rgba(15,23,42,.04),0 18px 40px -14px rgba(15,23,42,.22)";}}
                  onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="0 1px 2px rgba(15,23,42,.04),0 10px 30px -12px rgba(15,23,42,.12)";}}>
                  <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:c,opacity:.85}}/>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                    <div style={{fontSize:11.5,color:"#64748b",fontWeight:600,lineHeight:1.3,flex:1,paddingRight:8}}>{l}</div>
                    <span style={{width:34,height:34,borderRadius:10,background:c+"15",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{ic}</span>
                  </div>
                  <div className="kpi-val" style={{fontSize:21,fontWeight:800,color:"#0f172a",lineHeight:1,marginBottom:5,letterSpacing:-.5}}>{v}</div>
                  <div style={{fontSize:11,color:"#94a3b8",fontWeight:500}}>{s}</div>
                </div>
              ))}
            </div>

            {/* ── A. Финансовый обзор ── */}
            <div style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:10,padding:"18px 20px",marginBottom:16,boxShadow:"0 1px 3px rgba(15,23,42,.06)"}}>
              <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",flexWrap:"wrap",gap:8,marginBottom:14}}>
                <span style={{fontSize:11,color:"#059669",textTransform:"uppercase",letterSpacing:1,fontWeight:700}}>💰 Финансы — подписанные договоры (заработано)</span>
                <span style={{fontSize:11,color:"#94a3b8"}}>в выбранном периоде</span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10}}>
                {[
                  ["Выручка", fmt(Math.round(wonRevenue))+" ₸", "#2563eb"],
                  ["Себестоимость", fmt(Math.round(wonCost))+" ₸", "#64748b"],
                  ["Валовая прибыль", fmt(Math.round(wonProfit))+" ₸", "#059669"],
                  ["Средняя маржа", wonMargin+"%", wonMargin>=35?"#059669":wonMargin>=20?"#d97706":"#ef4444"],
                ].map(([l,v,c],i)=>(
                  <div key={i} style={{padding:"12px 14px",background:"#f9fafb",borderRadius:8,borderLeft:`3px solid ${c}`}}>
                    <div style={{fontSize:9,color:"#94a3b8",textTransform:"uppercase",letterSpacing:.8,marginBottom:6}}>{l}</div>
                    <div style={{fontSize:19,fontWeight:900,color:c,lineHeight:1}}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{marginTop:12,paddingTop:12,borderTop:"1px dashed #e5e7eb",display:"flex",gap:18,flexWrap:"wrap",fontSize:12,color:"#64748b"}}>
                <span>Потенциал (все активные объекты с суммой): <b style={{color:"#334155"}}>{fmt(Math.round(allRevenue))} ₸</b> выручка · прибыль <b style={{color:"#059669"}}>{fmt(Math.round(allProfit))} ₸</b> · маржа <b style={{color:"#334155"}}>{allMargin}%</b></span>
              </div>
            </div>

            {/* ── B. Воронка с деньгами и конверсией ── */}
            <div style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:10,padding:"18px 20px",marginBottom:16,boxShadow:"0 1px 3px rgba(15,23,42,.06)"}}>
              <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",flexWrap:"wrap",gap:8,marginBottom:14}}>
                <span style={{fontSize:11,color:"#7c3aed",textTransform:"uppercase",letterSpacing:1,fontWeight:700}}>🪜 Воронка сделок (объекты)</span>
                <span style={{fontSize:12,color:"#64748b"}}>Конверсия: <b style={{color:"#059669"}}>{winRateOverall}%</b> от всех · <b style={{color:"#7c3aed"}}>{winRateSent}%</b> из решённых</span>
              </div>
              {(() => {
                const maxSum = Math.max(1, ...funnel.map(f=>f.sum));
                return (
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {funnel.map(f=>(
                      <div key={f.key} style={{display:"flex",alignItems:"center",gap:12}}>
                        <span className="an-bar-label" style={{fontSize:12,fontWeight:600,color:f.color,width:140,flexShrink:0}}>{f.label}</span>
                        <div style={{flex:1,minWidth:60,background:"rgba(0,0,0,.04)",borderRadius:8,height:26,position:"relative",overflow:"hidden"}}>
                          <div style={{width:`${Math.round(f.sum/maxSum*100)}%`,minWidth:f.count>0?2:0,height:"100%",background:f.bg,borderLeft:`3px solid ${f.color}`}}/>
                          <span style={{position:"absolute",left:10,top:0,height:"100%",display:"flex",alignItems:"center",gap:8,fontSize:11,fontWeight:700,color:f.color}}>{f.count} шт · {fmt(Math.round(f.sum))} ₸</span>
                        </div>
                        <span className="an-bar-right" style={{fontSize:11,color:"#059669",width:130,textAlign:"right",flexShrink:0}}>{f.profit>0?"приб. "+fmt(Math.round(f.profit))+" ₸":"—"}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* ── B2. Финансы и производство — текущий снимок (по всей компании) ── */}
            {(()=>{
              const _norm = s => String(s||"").replace(/[№#\s]/g,"").toLowerCase();
              const _inM = ts => { const d=new Date(ts||0); const n=new Date(); return d.getMonth()===n.getMonth()&&d.getFullYear()===n.getFullYear(); };
              const _ds = d => { const x=new Date(d); x.setHours(0,0,0,0); return x.getTime(); };
              const activeFp = (finProjects||[]).filter(p=>(p.rawStatus||p.status)!=="отменен");
              const txMap = {}; for(const t of (financeTx||[])){ if(t.deletedAt||t.included===false) continue; const cn=_norm(t.contractNo); if(!txMap[cn])txMap[cn]={inc:0,exp:0}; if(t.type==="income")txMap[cn].inc+=(Number(t.amount)||0); else txMap[cn].exp+=(Number(t.amount)||0); }
              // ВСЁ по АКТИВНЫМ проектам — числа сходятся: Бюджет = Получено + Дебиторка
              const totalBudget = activeFp.reduce((s,p)=>s+(Number(p.budget)||0),0);
              const totalInc = activeFp.reduce((s,p)=>s+(txMap[_norm(p.contractNo)]?.inc||0),0);
              const totalExp = activeFp.reduce((s,p)=>s+(txMap[_norm(p.contractNo)]?.exp||0),0);
              const totalDebt = activeFp.reduce((s,p)=>{const inc=txMap[_norm(p.contractNo)]?.inc||0; return s+Math.max(0,(Number(p.budget)||0)-inc);},0);
              const recvPct = totalBudget>0?Math.round(totalInc/totalBudget*100):0;
              const planMargin = totalBudget>0?Math.round((totalBudget-totalExp)/totalBudget*100):null;
              const incMonth = (financeTx||[]).filter(t=>!t.deletedAt&&t.included!==false&&t.type==="income"&&_inM(t.date?new Date(t.date).getTime():0)).reduce((s,t)=>s+(Number(t.amount)||0),0);
              const expMonth = (financeTx||[]).filter(t=>!t.deletedAt&&t.included!==false&&t.type==="expense"&&_inM(t.date?new Date(t.date).getTime():0)).reduce((s,t)=>s+(Number(t.amount)||0),0);
              const prods = productions||[];
              const today = _ds(new Date());
              const prodActive = prods.filter(p=>p.prodStatus==="active").length;
              const prodOverdue = prods.filter(p=>p.prodStatus==="active"&&p.planEndDate&&_ds(p.planEndDate)<today&&!p.factEndDate).length;
              const prodDoneMonth = prods.filter(p=>p.factEndDate&&_inM(new Date(p.factEndDate).getTime())).length;
              const prodDefects = prods.reduce((s,p)=>s+((p.defects||[]).filter(d=>!d.done).length),0);
              if(activeFp.length===0 && prods.length===0) return null;
              const finCards = [
                ["Сумма контрактов", fmt(Math.round(totalBudget))+" ₸", activeFp.length+" активных проектов", "#2563eb"],
                ["Получено", fmt(Math.round(totalInc))+" ₸", recvPct+"% от контрактов", "#059669"],
                ["Дебиторка", fmt(Math.round(totalDebt))+" ₸", "осталось получить", totalDebt>0?"#dc2626":"#059669"],
                ["Расходы", fmt(Math.round(totalExp))+" ₸", "по активным проектам", "#64748b"],
                ["Маржа план", planMargin!=null?planMargin+"%":"—", "контракты − расходы", planMargin!=null&&planMargin>=30?"#059669":planMargin!=null&&planMargin>=0?"#d97706":"#dc2626"],
                ["Денежный поток за месяц", fmt(Math.round(incMonth-expMonth))+" ₸", "приход "+fmt(Math.round(incMonth))+" − расход "+fmt(Math.round(expMonth)), incMonth-expMonth>=0?"#059669":"#dc2626"],
              ];
              const prodCards = [
                ["В работе", prodActive, "активных производств", "#2563eb"],
                ["Просрочено", prodOverdue, "срок истёк", prodOverdue>0?"#dc2626":"#059669"],
                ["Сдано за месяц", prodDoneMonth, "фактически завершено", "#059669"],
                ["Открытых замечаний", prodDefects, "незакрытые дефекты", prodDefects>0?"#d97706":"#059669"],
              ];
              const Card = ([l,v,s,c],i)=>(
                <div key={i} style={{padding:"12px 14px",background:"#f9fafb",borderRadius:8,borderLeft:`3px solid ${c}`}}>
                  <div style={{fontSize:9,color:"#94a3b8",textTransform:"uppercase",letterSpacing:.8,marginBottom:6}}>{l}</div>
                  <div style={{fontSize:17,fontWeight:900,color:c,lineHeight:1.1}}>{v}</div>
                  <div style={{fontSize:10,color:"#94a3b8",marginTop:4}}>{s}</div>
                </div>
              );
              return (
                <div style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:10,padding:"18px 20px",marginBottom:16,boxShadow:"0 1px 3px rgba(15,23,42,.06)"}}>
                  <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",flexWrap:"wrap",gap:8,marginBottom:14}}>
                    <span style={{fontSize:11,color:"#2563eb",textTransform:"uppercase",letterSpacing:1,fontWeight:700}}>💼 Финансы и производство</span>
                    <span style={{fontSize:11,color:"#94a3b8"}}>текущий снимок · не зависит от периода</span>
                  </div>
                  {activeFp.length>0 && <>
                    <div style={{fontSize:10,color:"#059669",textTransform:"uppercase",letterSpacing:1,marginBottom:8,fontWeight:700}}>💰 Финансы по проектам</div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10,marginBottom:prods.length>0?16:0}}>{finCards.map(Card)}</div>
                  </>}
                  {prods.length>0 && <>
                    <div style={{fontSize:10,color:"#d97706",textTransform:"uppercase",letterSpacing:1,marginBottom:8,fontWeight:700}}>🏗 Производство</div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10}}>{prodCards.map(Card)}</div>
                  </>}
                </div>
              );
            })()}

            {/* ── E. Динамика по месяцам ── */}
            {monthly.length>0 && (
              <div style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:10,padding:"18px 20px",marginBottom:16,boxShadow:"0 1px 3px rgba(15,23,42,.06)"}}>
                <div style={{fontSize:11,color:"#2563eb",textTransform:"uppercase",letterSpacing:1,fontWeight:700,marginBottom:16}}>📈 Динамика по месяцам</div>
                {(() => {
                  const maxRev = Math.max(1, ...monthly.map(m=>m.revenue));
                  return (
                    <div style={{display:"flex",alignItems:"flex-end",gap:10,height:160,overflowX:"auto",paddingBottom:4}}>
                      {monthly.map(m=>(
                        <div key={m.key} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6,minWidth:46,flex:"1 0 46px"}}>
                          <div style={{fontSize:9,color:"#059669",fontWeight:700,whiteSpace:"nowrap"}}>{m.profit>0?Math.round(m.profit/1000)+"k":""}</div>
                          <div style={{display:"flex",alignItems:"flex-end",gap:2,height:110,width:"100%",justifyContent:"center"}}>
                            <div title={"Выручка: "+fmt(Math.round(m.revenue))+" ₸"} style={{width:14,height:`${Math.max(2,Math.round(m.revenue/maxRev*110))}px`,background:"#93c5fd",borderRadius:"3px 3px 0 0"}}/>
                            <div title={"Прибыль: "+fmt(Math.round(m.profit))+" ₸"} style={{width:14,height:`${Math.max(2,Math.round(Math.max(0,m.profit)/maxRev*110))}px`,background:"#059669",borderRadius:"3px 3px 0 0"}}/>
                          </div>
                          <div style={{fontSize:9,fontWeight:700,color:m.conv>=40?"#059669":m.conv>=20?"#d97706":"#94a3b8",whiteSpace:"nowrap"}} title="Конверсия в подписанные">{m.total>0?m.conv+"%":""}</div>
                          <div style={{fontSize:10,color:"#94a3b8",whiteSpace:"nowrap"}}>{m.label}</div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                <div style={{display:"flex",gap:16,marginTop:10,fontSize:11,color:"#94a3b8"}}>
                  <span><span style={{display:"inline-block",width:10,height:10,background:"#93c5fd",borderRadius:2,marginRight:5}}/>Выручка</span>
                  <span><span style={{display:"inline-block",width:10,height:10,background:"#059669",borderRadius:2,marginRight:5}}/>Прибыль</span>
                  <span>% — конверсия в подписанные за месяц</span>
                </div>
              </div>
            )}

            {/* ── F. «Зависшие» объекты в работе ── */}
            {staleSent.length>0 && (
              <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:10,padding:"18px 20px",marginBottom:16}}>
                <div style={{fontSize:11,color:"#b45309",textTransform:"uppercase",letterSpacing:1,fontWeight:700,marginBottom:12}}>⏰ На согласовании без движения 14+ дней</div>
                <div style={{display:"flex",flexDirection:"column",gap:5}}>
                  {staleSent.map(({e,days})=>(
                    <div key={e.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"rgba(255,255,255,.6)",borderRadius:8,cursor:currentUser.role!=="viewer"?"pointer":"default"}} onClick={()=>{ if(currentUser.role!=="viewer"&&e._obj){ setCurrentObject({...e._obj}); setObjectTab("workspace"); setScreen("objects"); } }}>
                      <span style={{fontSize:13,color:"#0f172a",flex:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{e.proj?.name||"Объект"}{e.proj?.phone?` · 📞 ${e.proj.phone}`:""}</span>
                      {e.total>0&&<span style={{fontSize:12,fontWeight:700,color:"#2563eb"}}>{fmt(e.total)} ₸</span>}
                      <span style={{fontSize:11,fontWeight:700,color:"#dc2626",whiteSpace:"nowrap"}}>{days} дн.</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(380px,1fr))",gap:16,marginBottom:16}}>
              <div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,padding:"18px"}}>
                <div style={{fontSize:11,color:"#d97706",textTransform:"uppercase",letterSpacing:1,fontWeight:700,marginBottom:14}}>Объекты</div>
                <div style={{fontSize:10,color:"#94a3b8",textTransform:"uppercase",letterSpacing:1,marginBottom:8,fontWeight:700}}>По статусам</div>
                <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:14}}>
                  {DEAL_STATUSES.map(s=>(
                    <div key={s.key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",background:"rgba(0,0,0,.02)",borderRadius:8}}>
                      <span style={{fontSize:12,color:s.color,fontWeight:600}}>{s.label}</span>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <div style={{width:80,height:4,background:"rgba(255,255,255,.06)",borderRadius:2,overflow:"hidden"}}>
                          <div style={{width:totalEst?(byStatus[s.key]/totalEst*100)+"%":"0%",height:"100%",background:s.color,borderRadius:2}}/>
                        </div>
                        <span style={{fontSize:13,fontWeight:700,color:"#0f172a",minWidth:20,textAlign:"right"}}>{byStatus[s.key]}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {Object.keys(byType).length>0 && <><div style={{fontSize:10,color:"#94a3b8",textTransform:"uppercase",letterSpacing:1,marginBottom:8,fontWeight:700}}>По типу объекта</div><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{Object.entries(byType).sort((a,b)=>b[1]-a[1]).map(([t,n])=>(<span key={t} style={{fontSize:11,padding:"3px 10px",borderRadius:4,background:"rgba(0,0,0,.04)",color:"#94a3b8"}}>{t}: <strong style={{color:"#0f172a"}}>{n}</strong></span>))}</div></>}
              </div>
              <div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,padding:"18px"}}>
                <div style={{fontSize:11,color:"#d97706",textTransform:"uppercase",letterSpacing:1,fontWeight:700,marginBottom:14}}>Договора по объектам</div>
                {Object.keys(byConType).length>0 && <><div style={{fontSize:10,color:"#94a3b8",textTransform:"uppercase",letterSpacing:1,marginBottom:8,fontWeight:700}}>По типам</div><div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:14}}>{Object.entries(byConType).sort((a,b)=>b[1]-a[1]).map(([t,n])=>(<div key={t} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",background:"rgba(0,0,0,.02)",borderRadius:8}}><span style={{fontSize:12,color:"#94a3b8"}}>{t}</span><span style={{fontSize:13,fontWeight:700,color:"#2563eb"}}>{n}</span></div>))}</div></>}
                {baseCon.length>0 && <><div style={{fontSize:10,color:"#94a3b8",textTransform:"uppercase",letterSpacing:1,marginBottom:8,fontWeight:700}}>Договора в периоде</div><div style={{display:"flex",flexDirection:"column",gap:3}}>{[...baseCon].sort((a,b)=>Number(b.id||0)-Number(a.id||0)).slice(0,6).map(c=>{const obj=objects.find(o=>o.id===c.objectId);const sum=(c.works||[]).reduce((s,w)=>s+(w.quantity*w.price||0),0);return(<div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",background:"rgba(0,0,0,.02)",borderRadius:8,cursor:"pointer"}} onClick={()=>{if(obj){setCurrentObject({...obj});setObjectTab("workspace");setScreen("objects");}}}><div style={{minWidth:0}}><div style={{fontSize:12,color:"#0f172a",fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{TYPE_L2[c.type||"repair_fiz"]} #{c.number||"--"}</div><div style={{fontSize:10,color:"#94a3b8"}}>{obj?.clientName||"--"}</div></div><span style={{fontSize:12,fontWeight:700,color:"#2563eb",flexShrink:0,marginLeft:8}}>{fmt(sum)} ₸</span></div>);})}</div></>}
                {totalCon===0 && <div style={{textAlign:"center",color:"#334155",fontSize:13,padding:"30px 0"}}>Нет договоров по объектам за период</div>}
              </div>
            </div>
            {/* ── C. Менеджеры по прибыли ── */}
            {!statsManager && managerStats.length>0 && (
              <div style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:10,padding:"18px 20px",marginBottom:16,boxShadow:"0 1px 3px rgba(15,23,42,.06)"}}>
                <div style={{fontSize:11,color:"#2563eb",textTransform:"uppercase",letterSpacing:1,fontWeight:700,marginBottom:12}}>👥 Менеджеры — прибыль и конверсия</div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,padding:"0 12px",fontSize:9,color:"#94a3b8",textTransform:"uppercase",letterSpacing:.5}}>
                    <span style={{flex:1}}>Менеджер</span>
                    <span style={{width:70,textAlign:"right"}}>Оборот</span>
                    <span style={{width:70,textAlign:"right"}}>Прибыль</span>
                    <span style={{width:46,textAlign:"right"}}>Маржа</span>
                    <span style={{width:54,textAlign:"right"}}>Конв.</span>
                  </div>
                  {managerStats.map(m=>(
                    <div key={m.name} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:"#f9fafb",borderRadius:8,cursor:"pointer"}} onClick={()=>setStatsManager(m.name)}>
                      <span style={{fontSize:13,color:"#0f172a",flex:1,fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>👤 {m.name} <span style={{fontSize:10,color:"#94a3b8"}}>· {m.count}</span></span>
                      <span style={{fontSize:12,fontWeight:600,color:"#334155",width:70,textAlign:"right"}}>{fmt(Math.round(m.sum/1000))}k</span>
                      <span style={{fontSize:12,fontWeight:700,color:"#059669",width:70,textAlign:"right"}}>{fmt(Math.round(m.profit/1000))}k</span>
                      <span style={{fontSize:12,fontWeight:700,width:46,textAlign:"right",color:m.margin>=35?"#059669":m.margin>=20?"#d97706":"#ef4444"}}>{m.margin}%</span>
                      <span style={{fontSize:12,fontWeight:700,color:"#7c3aed",width:54,textAlign:"right"}}>{m.conv}%</span>
                    </div>
                  ))}
                </div>
                <div style={{fontSize:10,color:"#94a3b8",marginTop:8}}>Оборот/прибыль — в тыс. ₸. Конверсия = подписано / активные объекты (кроме архива).</div>
              </div>
            )}

            {/* ── G+H. Цикл сделки + Конверсия по типу ── */}
            {(avgDealDays!==null || avgApprovalDays!==null || Object.keys(convByType).length>0) && (
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:16,marginBottom:16}}>
                {avgDealDays!==null && (
                  <div style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:10,padding:"18px 20px",boxShadow:"0 1px 3px rgba(15,23,42,.06)"}}>
                    <div style={{fontSize:11,color:"#7c3aed",textTransform:"uppercase",letterSpacing:1,fontWeight:700,marginBottom:14}}>⏱ Средний цикл сделки</div>
                    <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:8}}>
                      <span style={{fontSize:36,fontWeight:900,color:"#0f172a"}}>{avgDealDays}</span>
                      <span style={{fontSize:14,color:"#64748b"}}>дней</span>
                      {avgApprovalDays!==null && <span style={{fontSize:12,color:"#94a3b8",marginLeft:"auto"}}>в согласовании сейчас: <b style={{color:avgApprovalDays>14?"#dc2626":"#0f172a"}}>{avgApprovalDays} дн.</b></span>}
                    </div>
                    <div style={{fontSize:12,color:"#94a3b8"}}>от создания объекта до подписания договора</div>
                    <div style={{fontSize:12,color:"#94a3b8",marginTop:4}}>по {signedObjsCount} подписанным договорам в периоде</div>
                  </div>
                )}
                {avgDealDays===null && avgApprovalDays!==null && (
                  <div style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:10,padding:"18px 20px",boxShadow:"0 1px 3px rgba(15,23,42,.06)"}}>
                    <div style={{fontSize:11,color:"#d97706",textTransform:"uppercase",letterSpacing:1,fontWeight:700,marginBottom:14}}>⏳ Среднее время в согласовании</div>
                    <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:8}}>
                      <span style={{fontSize:36,fontWeight:900,color:avgApprovalDays>14?"#dc2626":"#0f172a"}}>{avgApprovalDays}</span>
                      <span style={{fontSize:14,color:"#64748b"}}>дней</span>
                    </div>
                    <div style={{fontSize:12,color:"#94a3b8"}}>открытые сделки в статусе «Согласование»</div>
                  </div>
                )}
                {Object.keys(convByType).length>0 && (
                  <div style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:10,padding:"18px 20px",boxShadow:"0 1px 3px rgba(15,23,42,.06)"}}>
                    <div style={{fontSize:11,color:"#059669",textTransform:"uppercase",letterSpacing:1,fontWeight:700,marginBottom:14}}>🏠 Конверсия по типу объекта</div>
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      {Object.entries(convByType).sort((a,b)=>b[1].total-a[1].total).map(([t,d])=>{
                        const conv = d.total>0 ? Math.round(d.signed/d.total*100) : 0;
                        return (
                          <div key={t} style={{display:"flex",alignItems:"center",gap:10}}>
                            <span style={{fontSize:12,color:"#334155",width:100,flexShrink:0}}>{t}</span>
                            <div style={{flex:1,background:"rgba(0,0,0,.04)",borderRadius:4,height:20,position:"relative",overflow:"hidden"}}>
                              <div style={{width:conv+"%",height:"100%",background:"rgba(5,150,105,.15)",borderLeft:"3px solid #059669"}}/>
                              <span style={{position:"absolute",left:8,top:0,height:"100%",display:"flex",alignItems:"center",fontSize:11,fontWeight:700,color:"#059669"}}>{d.signed}/{d.total}</span>
                            </div>
                            <span style={{fontSize:12,fontWeight:700,color:conv>=50?"#059669":conv>=25?"#d97706":"#64748b",width:36,textAlign:"right"}}>{conv}%</span>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{fontSize:10,color:"#94a3b8",marginTop:8}}>подписано / всего объектов</div>
                  </div>
                )}
              </div>
            )}

            {/* ── I. Топ объектов по сумме ── */}
            {topObjects.length>0 && (
              <div style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:10,padding:"18px 20px",marginBottom:16,boxShadow:"0 1px 3px rgba(15,23,42,.06)"}}>
                <div style={{fontSize:11,color:"#2563eb",textTransform:"uppercase",letterSpacing:1,fontWeight:700,marginBottom:12}}>🏆 Топ объектов периода по сумме</div>
                <div style={{display:"flex",flexDirection:"column",gap:5}}>
                  {topObjects.map((o,i)=>{
                    const v = objVal(o);
                    const st = DEAL_STATUSES.find(s=>s.key===(o.status||"new"))||DEAL_STATUSES[0];
                    return (
                      <div key={o.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",background:"#f9fafb",borderRadius:8,cursor:"pointer"}}
                        onClick={()=>{setCurrentObject({...o});setObjectTab("workspace");setScreen("objects");}}>
                        <span style={{fontSize:11,color:"#94a3b8",minWidth:18,fontWeight:700}}>#{i+1}</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,color:"#0f172a",fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{o.clientName||"Без клиента"}</div>
                          <div style={{display:"flex",alignItems:"center",gap:6,marginTop:2,flexWrap:"wrap"}}>
                            <span style={{fontSize:10,fontWeight:700,color:st.color,background:st.bg,borderRadius:4,padding:"1px 6px"}}>{st.label}</span>
                            <span style={{fontSize:11,color:"#94a3b8",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{o.objType||"Вторичка"}{o.address?` · ${o.address}`:""}</span>
                          </div>
                        </div>
                        <span style={{fontSize:13,fontWeight:800,color:"#0f172a",flexShrink:0}}>{fmt(v)} ₸</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── D. Рентабельность по категориям ── */}
            {catProfit.length>0 && (
              <div style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:10,padding:"18px 20px",boxShadow:"0 1px 3px rgba(15,23,42,.06)"}}>
                <div style={{fontSize:11,color:"#2563eb",textTransform:"uppercase",letterSpacing:1,fontWeight:700,marginBottom:12}}>🏗 Рентабельность по категориям работ</div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {catProfit.map((c,i)=>(
                    <div key={c.cat} className="an-catrow" style={{display:"flex",alignItems:"center",gap:10,fontSize:12,padding:"9px 12px",background:"#f9fafb",borderRadius:8}}>
                      <span style={{fontSize:10,color:"#94a3b8",minWidth:16}}>{i+1}.</span>
                      <span className="an-cat-name" style={{color:"#0f172a",fontWeight:500,flex:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.cat}</span>
                      <span style={{color:"#64748b",width:90,textAlign:"right"}}>выр. {fmt(Math.round(c.revenue/1000))}k</span>
                      <span style={{color:"#059669",fontWeight:700,width:90,textAlign:"right"}}>приб. {fmt(Math.round(c.profit/1000))}k</span>
                      <span style={{fontWeight:700,width:46,textAlign:"right",color:c.margin>=35?"#059669":c.margin>=20?"#d97706":"#ef4444"}}>{c.margin}%</span>
                    </div>
                  ))}
                </div>
                <div style={{fontSize:10,color:"#94a3b8",marginTop:8}}>По ценам позиций до скидки. Суммы в тыс. ₸.</div>
              </div>
            )}
            {totalEst===0&&<div style={{textAlign:"center",color:"#334155",fontSize:13,padding:"60px 0"}}><div style={{fontSize:32,marginBottom:12}}>📊</div>Нет данных за выбранный период</div>}
          </div>
        );
      })()}

      {/* ── ЭКРАН: ФИНАНСЫ (независимый учёт ДДС + P&L) ── */}
      {effScreen === "finance" && (()=>{
        const fM = n => new Intl.NumberFormat("ru-RU").format(Math.round(n||0));
        const now = new Date();
        const periodStart = (()=>{
          if (finPeriod==="all") return 0;
          if (finPeriod==="custom") return finFrom ? new Date(finFrom).getTime() : 0;
          const d = new Date(now.getFullYear(), now.getMonth(), 1); // 1-е число текущего месяца
          if (finPeriod==="month") return d.getTime();
          if (finPeriod==="3month") { d.setMonth(d.getMonth()-2); return d.getTime(); }
          if (finPeriod==="year") { d.setMonth(d.getMonth()-11); return d.getTime(); }
          return d.getTime();
        })();
        const periodEnd = (finPeriod==="custom" && finTo) ? new Date(finTo).getTime()+86400000 : Infinity;
        const inPeriod = ts => ts>=periodStart && ts<periodEnd;
        const accounts = financeMeta.accounts||[];

        // Остатки по счетам (за всё время)
        const balances = {};
        accounts.forEach(a=>{ balances[a.name] = Number(a.opening)||0; });
        for (const t of financeTx) {
          if (t.deletedAt || t.included===false) continue;
          const amt = Number(t.amount)||0;
          if (t.type==="income") balances[t.account] = (balances[t.account]||0)+amt;
          else if (t.type==="expense") balances[t.account] = (balances[t.account]||0)-amt;
          else if (t.type==="transfer") { balances[t.account]=(balances[t.account]||0)-amt; balances[t.accountTo]=(balances[t.accountTo]||0)+amt; }
        }
        const totalBalance = Object.values(balances).reduce((s,v)=>s+v,0);

        // Показатели за период (без переводов)
        const periodTx = financeTx.filter(t=>!t.deletedAt && t.included!==false && inPeriod(t.date||t.createdAt||0));
        const incomeSum = periodTx.filter(t=>t.type==="income").reduce((s,t)=>s+(Number(t.amount)||0),0);
        const expenseSum = periodTx.filter(t=>t.type==="expense").reduce((s,t)=>s+(Number(t.amount)||0),0);
        const profit = incomeSum-expenseSum;
        const margin = incomeSum>0 ? Math.round(profit/incomeSum*100) : 0;

        // P&L: расходы по группам (категориям)
        const expByCat = {};
        periodTx.filter(t=>t.type==="expense").forEach(t=>{ const k=t.category||"Без категории"; expByCat[k]=(expByCat[k]||0)+(Number(t.amount)||0); });
        const expCats = Object.entries(expByCat).sort((a,b)=>b[1]-a[1]);
        const incByCat = {};
        periodTx.filter(t=>t.type==="income").forEach(t=>{ const k=t.category||"Без категории"; incByCat[k]=(incByCat[k]||0)+(Number(t.amount)||0); });
        const incCats = Object.entries(incByCat).sort((a,b)=>b[1]-a[1]);

        // Динамика по месяцам (выручка / вал.прибыль / чистая прибыль)
        const _C_COGS="Прямые расходы (COGS / себестоимость)";
        const _C_FIN="Финансовые расходы"; const _S_DIV="Дивиденды учредителям";
        const monthMap = {};
        // Считаем за ВСЁ время для полноты картины, но берём только период
        financeTx.forEach(t=>{
          if (t.deletedAt||t.included===false||t.type==="transfer") return;
          const ts=t.date||t.createdAt||0; if(!inPeriod(ts)) return;
          const d=new Date(ts); const key=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");
          if(!monthMap[key]) monthMap[key]={inc:0,cogs:0,exp:0};
          const amt=Number(t.amount)||0;
          if(t.type==="income") monthMap[key].inc+=amt;
          else if(t.type==="expense"){
            monthMap[key].exp+=amt;
            if(t.category===_C_COGS) monthMap[key].cogs+=amt;
          }
        });
        const months = Object.keys(monthMap).sort().slice(-24);
        const maxMonth = Math.max(1,...months.map(m=>Math.max(monthMap[m].inc, monthMap[m].inc-monthMap[m].cogs, monthMap[m].inc-monthMap[m].exp)));
        const MNAMES=["Янв","Фев","Мар","Апр","Май","Июн","Июл","Авг","Сен","Окт","Ноя","Дек"];

        // Список операций (фильтры + поиск)
        const fq = finSearch.toLowerCase().trim();
        const opsList = financeTx
          .filter(t=>!t.deletedAt) // скрываем мягко-удалённые
          .filter(t=>inPeriod(t.date||t.createdAt||0))
          .filter(t=>!finFilterType || t.type===finFilterType)
          .filter(t=>!finFilterAccount || t.account===finFilterAccount || t.accountTo===finFilterAccount)
          .filter(t=>finAmtMin===""||(Number(t.amount)||0)>=Number(finAmtMin))
          .filter(t=>finAmtMax===""||(Number(t.amount)||0)<=Number(finAmtMax))
          .filter(t=>!finFilterCategory || t.subcategory===finFilterCategory)
          .filter(t=>!finFilterContract || (t.contractNo||"").trim()===finFilterContract.trim())
          .filter(t=>!finFilterCat || t.category===finFilterCat)
          .filter(t=>!fq || [t.category,t.subcategory,t.note,t.contractNo,t.account].some(v=>v&&String(v).toLowerCase().includes(fq)))
          .sort((a,b)=>(b.date||b.createdAt||0)-(a.date||a.createdAt||0));

        const PERIODS=[["all","Всё"],["month","Месяц"],["3month","3 мес"],["year","Год"],["custom","Период"]];
        const TYPE_LABEL={income:"Доход",expense:"Расход",transfer:"Перевод"};
        const TYPE_COLOR={income:"#059669",expense:"#dc2626",transfer:"#7c3aed"};

        const openNewTx = (type="income") => { setFinCatSearch(""); setFinCatOpen(false); setFinTxProjSearch(""); setFinTxProjOpen(false); setFinTxModal({ id:null, type, date:new Date().toISOString().slice(0,10), amount:"", account:accounts[0]?.name||"", accountTo:accounts[1]?.name||"", category:"", subcategory:"", note:"", contractNo:"" }); };
        const openEditTx = (t) => { setFinCatSearch(t.subcategory||t.category||""); setFinCatOpen(false); setFinTxProjSearch(t.contractNo||""); setFinTxProjOpen(false); setFinTxModal({ ...t, date:new Date(t.date||t.createdAt||Date.now()).toISOString().slice(0,10) }); };

        return (
          <div className="page" style={{maxWidth:1600}}>
            {/* Hero */}
            <div className="hero" style={{background:"linear-gradient(135deg,#0f172a 0%,#1e293b 70%,#283549 100%)",borderRadius:16,padding:"24px 28px",marginBottom:20,position:"relative",overflow:"hidden",boxShadow:"0 4px 20px rgba(15,23,42,.3)"}}>
              <div style={{position:"absolute",top:-30,right:-30,width:160,height:160,borderRadius:"50%",background:"rgba(16,185,129,.10)"}}/>
              <div style={{position:"relative",zIndex:1,display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
                <div>
                  <h1 style={{margin:0,fontSize:22,fontWeight:900,color:"#fff"}}>💰 Финансы</h1>
                  <div style={{fontSize:13,color:"rgba(255,255,255,.75)",marginTop:4}}>Учёт доходов, расходов и движения денег</div>
                  {finReadonly && <div style={{display:"inline-block",marginTop:6,background:"rgba(251,191,36,.18)",border:"1px solid rgba(251,191,36,.4)",borderRadius:6,padding:"2px 10px",fontSize:11,fontWeight:700,color:"#fbbf24"}}>👁 Только просмотр</div>}
                </div>
                <div className="fin-hero-stats" style={{display:"flex",gap:24,alignItems:"flex-end",flexWrap:"wrap"}}>
                  {navHistory.length > 0 && <button onClick={goBack} style={{background:"none",border:"1px solid rgba(255,255,255,.4)",borderRadius:6,padding:"4px 12px",cursor:"pointer",fontSize:14,color:"#fff",alignSelf:"center"}}>← Назад</button>}
                  {(()=>{
                    const projIncH={};
                    for(const t of financeTx){ if(t.included===false)continue; const cn=(t.contractNo||"").trim(); if(!cn)continue; if(t.type==="income") projIncH[cn]=(projIncH[cn]||0)+(Number(t.amount)||0); }
                    const debtH = finProjects.filter(p=>(p.rawStatus||p.status)!=="отменен").reduce((s,p)=>s+Math.max(0,(Number(p.budget)||0)-(projIncH[p.contractNo]||0)),0);
                    return <>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:11,color:"rgba(255,255,255,.6)"}}>Дебиторка (по проектам)</div>
                        <div style={{fontSize:20,fontWeight:900,color:"#fbbf24"}}>{fM(Math.round(debtH))} ₸</div>
                      </div>
                      <div style={{width:1,height:36,background:"rgba(255,255,255,.15)"}}/>
                    </>;
                  })()}
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:11,color:"rgba(255,255,255,.6)"}}>Всего на счетах</div>
                    <div style={{fontSize:24,fontWeight:900,color:totalBalance>=0?"#34d399":"#f87171"}}>{fM(totalBalance)} ₸</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Табы */}
            <div className="fin-tabs" style={{display:"flex",gap:6,marginBottom:18,flexWrap:"wrap"}}>
              {[["dashboard","📊 Дашборд"],["dds","💸 ДДС месяц"],["opu","📈 ОПУ месяц"],["balance","⚖️ Баланс"],["ops","📋 Операции"],["projects","🏗 Проекты"],...(finReadonly?[]:[ ["ref","⚙️ Справочник"] ])].map(([k,l])=>(
                <button key={k} onClick={()=>navigate(undefined, k)} style={{fontSize:13,fontWeight:700,padding:"9px 16px",borderRadius:10,cursor:"pointer",fontFamily:"inherit",border:"1px solid "+(financeTab===k?"#2563eb":"#e2e8f0"),background:financeTab===k?"#2563eb":"#fff",color:financeTab===k?"#fff":"#64748b"}}>{l}</button>
              ))}
            </div>

            {/* Фильтр периода (для дашборда и операций) */}
            {financeTab!=="ref" && financeTab!=="projects" && (
              <div style={{display:"flex",gap:8,marginBottom:18,flexWrap:"wrap",alignItems:"center"}}>
                {PERIODS.map(([k,l])=>(
                  <button key={k} onClick={()=>setFinPeriod(k)} style={{fontSize:12,fontWeight:600,padding:"6px 13px",borderRadius:8,cursor:"pointer",fontFamily:"inherit",border:"1px solid "+(finPeriod===k?"#2563eb":"#e2e8f0"),background:finPeriod===k?"#eff6ff":"#fff",color:finPeriod===k?"#2563eb":"#94a3b8"}}>{l}</button>
                ))}
                {finPeriod==="custom" && (<>
                  <input type="date" className="fi" style={{width:"auto"}} value={finFrom} onChange={e=>setFinFrom(e.target.value)}/>
                  <input type="date" className="fi" style={{width:"auto"}} value={finTo} onChange={e=>setFinTo(e.target.value)}/>
                </>)}
              </div>
            )}

            {/* ───── ДАШБОРД ───── */}
            {financeTab==="dashboard" && (()=>{
              // ── P&L (совпадает с ОПУ) ──
              const S_DIV="Дивиденды учредителям";
              const divTx = periodTx.filter(t=>t.type==="expense"&&t.subcategory===S_DIV);
              const divSum = divTx.reduce((s,t)=>s+(Number(t.amount)||0),0);
              const divByRecipient = {};
              divTx.forEach(t=>{ const r=t.recipient||"Не указан"; divByRecipient[r]=(divByRecipient[r]||0)+(Number(t.amount)||0); });
              // Выручка без авансов и без финансирования (займы/вклады/возврат активов — не выручка)
              const incSumNoAdv = periodTx.filter(t=>t.type==="income"&&!t.isAdvance&&t.category!==C_FINANCING_INC&&t.category!==C_ASSET_INC).reduce((s,t)=>s+(Number(t.amount)||0),0);
              // Расходы P&L: без дивидендов, без финансовой деятельности и выданных займов/активов (они не расход); CapEx — расход кассовым методом
              const expNoDivSum = periodTx.filter(t=>t.type==="expense"&&t.subcategory!==S_DIV&&t.category!==C_FINACT&&t.category!==C_ASSET_OUT).reduce((s,t)=>s+(Number(t.amount)||0),0);
              const netP = incSumNoAdv - expNoDivSum;
              const rentab = incSumNoAdv>0?Math.round(netP/incSumNoAdv*100):0;

              // ── Доходы по категориям объектов (для кругового) ──
              const incBySub = {};
              periodTx.filter(t=>t.type==="income"&&!t.isAdvance).forEach(t=>{
                const k = t.subcategory||t.category||"Прочее";
                incBySub[k]=(incBySub[k]||0)+(Number(t.amount)||0);
              });
              const incSlices=Object.entries(incBySub).sort((a,b)=>b[1]-a[1]);

              // ── Расходы по подкатегориям (дивиденды разбиваем по получателям) ──
              const expBySub = {};
              periodTx.filter(t=>t.type==="expense").forEach(t=>{
                if(t.subcategory==="Дивиденды учредителям" && t.recipient){
                  const k="Дивиденды: "+t.recipient;
                  expBySub[k]=(expBySub[k]||0)+(Number(t.amount)||0);
                } else {
                  const k = t.subcategory||t.category||"Прочее";
                  expBySub[k]=(expBySub[k]||0)+(Number(t.amount)||0);
                }
              });
              const expSlices=Object.entries(expBySub).sort((a,b)=>b[1]-a[1]);

              // ── Кольцевая диаграмма (donut) ──
              const PIE_COLORS=["#2563eb","#059669","#f59e0b","#8b5cf6","#dc2626","#0891b2","#d97706","#e11d48","#84cc16","#06b6d4","#ec4899","#14b8a6"];
              const Donut=({slices,total,size=170,thickness=24,centerLabel})=>{
                const r=(size-thickness)/2, cx=size/2, circ=2*Math.PI*r;
                if(!total||slices.length===0) return <div style={{width:size,height:size,borderRadius:"50%",border:"24px solid #f1f5f9",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#cbd5e1",boxSizing:"border-box"}}>нет данных</div>;
                let offset=0;
                return (
                  <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{flexShrink:0}}>
                    <circle cx={cx} cy={cx} r={r} fill="none" stroke="#f1f5f9" strokeWidth={thickness}/>
                    <g transform={`rotate(-90 ${cx} ${cx})`}>
                      {slices.slice(0,12).map(([label,v],i)=>{
                        const len=(v/total)*circ;
                        const el=<circle key={label} cx={cx} cy={cx} r={r} fill="none" stroke={PIE_COLORS[i%PIE_COLORS.length]} strokeWidth={thickness} strokeDasharray={`${len} ${circ-len}`} strokeDashoffset={-offset} strokeLinecap="butt"><title>{label}: {fM(v)} ₸</title></circle>;
                        offset+=len; return el;
                      })}
                    </g>
                    <text x={cx} y={cx-2} textAnchor="middle" fontSize={size>150?16:13} fontWeight="800" fill="#0f172a">{fM(total)}</text>
                    <text x={cx} y={cx+15} textAnchor="middle" fontSize={10} fill="#94a3b8">{centerLabel||"₸ всего"}</text>
                  </svg>
                );
              };

              const cardSt={background:"#fff",border:"1px solid #eef2f7",borderRadius:18,boxShadow:"0 1px 2px rgba(15,23,42,.04),0 12px 32px -16px rgba(15,23,42,.14)"};
              const CardSection=({title,accent,children,full})=>(
                <div style={{...cardSt,overflow:"hidden",gridColumn:full?"1 / -1":"auto"}}>
                  <div style={{height:4,background:accent||"#2563eb"}}/>
                  <div style={{padding:"16px 20px"}}>
                    <div style={{fontSize:13.5,fontWeight:800,color:"#0f172a",marginBottom:14,letterSpacing:-.2}}>{title}</div>
                    {children}
                  </div>
                </div>
              );
              const KpiRow=({label,val,color,bold,big})=>(
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",padding:bold?"9px 0":"6px 0",borderBottom:"1px solid #f5f7fa",gap:8}}>
                  <span style={{fontSize:bold?13:12.5,color:bold?"#0f172a":"#64748b",fontWeight:bold?700:500}}>{label}</span>
                  <span style={{fontSize:big?20:(bold?15:13.5),fontWeight:bold?800:600,color:color||"#0f172a",whiteSpace:"nowrap"}}>
                    {typeof val==="number"?fM(val)+" ₸":val}
                  </span>
                </div>
              );
              const LegendItem=({label,val,total,color})=>{ const p=total>0?Math.round(val/total*100):0; return (
                <div style={{marginBottom:9}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:3,gap:8}}>
                    <span style={{display:"flex",alignItems:"center",gap:7,color:"#334155",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}><span style={{width:9,height:9,borderRadius:3,background:color,flexShrink:0}}/>{label}</span>
                    <span style={{fontWeight:700,color:"#0f172a",whiteSpace:"nowrap"}}>{fM(val)} <span style={{color,fontSize:11}}>· {p}%</span></span>
                  </div>
                  <div style={{height:5,background:"#f1f5f9",borderRadius:5}}><div style={{height:"100%",width:p+"%",background:color,borderRadius:5,transition:"width .4s"}}/></div>
                </div>
              );};

              return (
                <div style={{marginBottom:20}}>
                  {/* ── Верхний ряд: 3 сводных карточки ── */}
                  <div className="fin-dash-cards" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:16,marginBottom:16}}>
                    {/* Прибыль */}
                    <CardSection title="💎 Прибыль, ₸" accent="#2563eb">
                      <KpiRow label="Выручка (без авансов)" val={incSumNoAdv} color="#059669"/>
                      <KpiRow label="Расходы (без дивид.)" val={expNoDivSum} color="#dc2626"/>
                      <KpiRow label="Дивиденды" val={divSum} color="#d97706"/>
                      {Object.entries(divByRecipient).filter(([r])=>r!=="Не указан").map(([r,v])=>(
                        <div key={r} style={{display:"flex",justifyContent:"space-between",padding:"3px 0 3px 14px",borderBottom:"1px solid #f5f7fa",gap:8}}>
                          <span style={{fontSize:11.5,color:"#94a3b8"}}>↳ {r}</span>
                          <span style={{fontSize:12,fontWeight:600,color:"#d97706",whiteSpace:"nowrap"}}>{fM(v)} ₸</span>
                        </div>
                      ))}
                      <KpiRow label="Чистая прибыль" val={netP} color={netP>=0?"#2563eb":"#dc2626"} bold big/>
                      <KpiRow label="Рентабельность" val={rentab+"%"} color={rentab>=0?"#7c3aed":"#dc2626"} bold/>
                    </CardSection>

                    {/* Денежный поток */}
                    <CardSection title="💸 Денежный поток, ₸" accent="#0891b2">
                      <KpiRow label="Поступления (вкл. авансы)" val={incomeSum} color="#059669"/>
                      <KpiRow label="Выплаты" val={expenseSum} color="#dc2626"/>
                      <KpiRow label="Разница" val={incomeSum-expenseSum} color={(incomeSum-expenseSum)>=0?"#0891b2":"#dc2626"} bold big/>
                      <div style={{marginTop:12,padding:"10px 12px",background:"#f8fafc",borderRadius:10,fontSize:11.5,color:"#64748b",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span>Сальдо по всем счетам</span><b style={{color:"#0f172a",fontSize:13}}>{fM(totalBalance)} ₸</b>
                      </div>
                    </CardSection>

                    {/* Остатки */}
                    <CardSection title="💳 Остатки на счетах, ₸" accent="#7c3aed">
                      {accounts.map(a=>(
                        <div key={a.id} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #f5f7fa"}}>
                          <span style={{fontSize:12.5,color:"#64748b"}}>{a.name}</span>
                          <span style={{fontSize:13.5,fontWeight:700,color:(balances[a.name]||0)>=0?"#0f172a":"#dc2626"}}>{fM(balances[a.name]||0)} ₸</span>
                        </div>
                      ))}
                      <div style={{display:"flex",justifyContent:"space-between",paddingTop:10}}>
                        <span style={{fontSize:13,fontWeight:700,color:"#0f172a"}}>ИТОГО</span>
                        <span style={{fontSize:20,fontWeight:800,color:totalBalance>=0?"#7c3aed":"#dc2626"}}>{fM(totalBalance)} ₸</span>
                      </div>
                    </CardSection>
                  </div>

                  {/* ── Структура платежей: Доходы (отдельный ряд) ── */}
                  <div style={{marginBottom:16}}>
                    <CardSection title="📊 Структура платежей — Доходы, ₸" accent="#059669" full>
                      <div style={{display:"flex",gap:28,alignItems:"center",flexWrap:"wrap"}}>
                        <Donut slices={incSlices} total={incomeSum} centerLabel="доходы"/>
                        <div style={{flex:1,minWidth:280,display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:"0 28px"}}>
                          {incSlices.slice(0,12).map(([k,v],i)=><LegendItem key={k} label={k} val={v} total={incomeSum} color={PIE_COLORS[i%PIE_COLORS.length]}/>)}
                        </div>
                      </div>
                    </CardSection>
                  </div>

                  {/* ── Структура платежей: Расходы (отдельный ряд) ── */}
                  <div style={{marginBottom:16}}>
                    <CardSection title="📊 Структура платежей — Расходы, ₸" accent="#dc2626" full>
                      <div style={{display:"flex",gap:28,alignItems:"center",flexWrap:"wrap"}}>
                        <Donut slices={expSlices} total={expenseSum} centerLabel="расходы"/>
                        <div style={{flex:1,minWidth:280,display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:"0 28px"}}>
                          {expSlices.slice(0,12).map(([k,v],i)=><LegendItem key={k} label={k} val={v} total={expenseSum} color={PIE_COLORS[i%PIE_COLORS.length]}/>)}
                        </div>
                      </div>
                    </CardSection>
                  </div>

                  {/* ── Динамика по месяцам (линейный график) ── */}
                  <div style={{background:"#0f172a",borderRadius:16,padding:"16px 18px",marginBottom:12,boxShadow:"0 8px 32px rgba(0,0,0,.25)"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8,marginBottom:14}}>
                      <div style={{fontSize:11,color:"#94a3b8",fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>📈 Динамика по месяцам</div>
                      <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                        {[["#10b981","Выручка"],["#0891b2","Вал. приб."],["#8b5cf6","Чистая приб."]].map(([c,l])=>(
                          <span key={l} style={{display:"flex",alignItems:"center",gap:5,fontSize:10,color:"#64748b"}}>
                            <span style={{width:16,height:2,background:c,borderRadius:2,display:"inline-block"}}/>
                            <span style={{color:"#64748b"}}>{l}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                    {months.length===0 && <div style={{color:"#334155",fontSize:13,padding:"24px 0",textAlign:"center"}}>Нет данных за период</div>}
                    {months.length>0 && (()=>{
                      const W=720, H=160, PL=56, PR=16, PT=12, PB=28;
                      const cW=W-PL-PR, cH=H-PT-PB, n=months.length;
                      const fmtY = v => v>=1000000?(v/1000000).toFixed(1)+"M":v>=1000?Math.round(v/1000)+"k":"0";
                      const xOf = i => PL+(n===1?cW/2:i/(n-1)*cW);
                      const yOf = v => PT+cH-(Math.max(0,v)/maxMonth)*cH;
                      const mkBezier = pts => {
                        if(!pts.length) return "";
                        if(pts.length===1) return `M${pts[0][0]},${pts[0][1]}`;
                        let d=`M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
                        for(let i=0;i<pts.length-1;i++){
                          const [x0,y0]=pts[i],[x1,y1]=pts[i+1],cpx=(x0+x1)/2;
                          d+=` C${cpx.toFixed(1)},${y0.toFixed(1)} ${cpx.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
                        }
                        return d;
                      };
                      const LINES=[
                        {fn:d=>d.inc,       color:"#10b981", gid:"lg1", op1:.3, op2:.02},
                        {fn:d=>d.inc-d.cogs,color:"#38bdf8", gid:"lg2", op1:.2, op2:.0},
                        {fn:d=>d.inc-d.exp, color:"#a78bfa", gid:"lg3", op1:.2, op2:.0},
                      ];
                      const yTicks=[0,.25,.5,.75,1].map(r=>({y:PT+cH*(1-r),v:Math.round(maxMonth*r)}));
                      return (
                        <div style={{overflowX:"auto"}}>
                          <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",minWidth:280,display:"block"}}>
                            <defs>
                              {LINES.map(({color,gid,op1,op2})=>(
                                <linearGradient key={gid} id={gid} x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor={color} stopOpacity={op1}/>
                                  <stop offset="100%" stopColor={color} stopOpacity={op2}/>
                                </linearGradient>
                              ))}
                            </defs>
                            {/* grid */}
                            {yTicks.map((t,i)=>(
                              <g key={i}>
                                <line x1={PL} y1={t.y} x2={W-PR} y2={t.y} stroke={i===0?"#1e293b":"#172033"} strokeWidth="1" strokeDasharray={i===0?"":"4 4"}/>
                                <text x={PL-6} y={t.y+4} fontSize="10" fill="#475569" textAnchor="end">{fmtY(t.v)}</text>
                              </g>
                            ))}
                            {/* area fills */}
                            {LINES.map(({fn,gid},li)=>{
                              const pts=months.map((m,i)=>[xOf(i),yOf(fn(monthMap[m]))]);
                              const bp=mkBezier(pts);
                              if(!bp) return null;
                              const area=bp+` L${xOf(n-1).toFixed(1)},${PT+cH} L${xOf(0).toFixed(1)},${PT+cH} Z`;
                              return <path key={li} d={area} fill={`url(#${gid})`}/>;
                            })}
                            {/* lines */}
                            {LINES.map(({fn,color},li)=>{
                              const pts=months.map((m,i)=>[xOf(i),yOf(fn(monthMap[m]))]);
                              return <path key={li} d={mkBezier(pts)} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"/>;
                            })}
                            {/* dots */}
                            {LINES.map(({fn,color},li)=>months.map((m,i)=>{
                              const v=fn(monthMap[m]); const [yr,mo]=m.split("-");
                              return <circle key={`${li}-${i}`} cx={xOf(i)} cy={yOf(v)} r="3" fill={color} stroke="#0f172a" strokeWidth="1.5">
                                <title>{MNAMES[parseInt(mo)-1]} {yr}: {fM(Math.round(v))} ₸</title>
                              </circle>;
                            }))}
                            {/* x labels */}
                            {months.map((m,i)=>{
                              const [yr,mo]=m.split("-");
                              return <text key={m} x={xOf(i)} y={H-4} fontSize="10" fill="#475569" textAnchor="middle">{MNAMES[parseInt(mo)-1]} {yr.slice(2)}</text>;
                            })}
                          </svg>
                        </div>
                      );
                    })()}
                  </div>

                  {/* ── График по проектам ── */}
                  <div style={{background:"#0f172a",borderRadius:16,padding:"16px 18px",marginBottom:12,boxShadow:"0 8px 32px rgba(0,0,0,.25)"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8,marginBottom:14}}>
                      <div style={{fontSize:11,color:"#94a3b8",fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>📦 Проекты по месяцам</div>
                      <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                        {[["#3b82f6","План"],["#10b981","Факт"],["#f59e0b","Вал. приб."]].map(([c,l])=>(
                          <span key={l} style={{display:"flex",alignItems:"center",gap:5,fontSize:10}}>
                            <span style={{width:10,height:10,background:c,borderRadius:2,display:"inline-block",opacity:.9}}/>
                            <span style={{color:"#64748b"}}>{l}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                    {(()=>{
                      const _now = Date.now(), _maxTs = _now + 90*24*3600*1000, _minTs = _now - 3*365*24*3600*1000;
                      const pmKey = p => {
                        const ts = p.createdAt ? new Date(p.createdAt).getTime() : 0;
                        if(!ts||ts>_maxTs||ts<_minTs) return null;
                        const d=new Date(ts); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");
                      };
                      const _normCn = s => (s||"").replace(/[№\s]/g,"").trim();
                      const txByContract = {};
                      financeTx.forEach(t=>{ if(t.deletedAt||t.included===false||t.type==="transfer"||!t.contractNo) return;
                        const k=_normCn(t.contractNo);
                        if(!txByContract[k]) txByContract[k]={inc:0,cogs:0};
                        const amt=Number(t.amount)||0;
                        if(t.type==="income") txByContract[k].inc+=amt;
                        else if(t.type==="expense"&&t.category===_C_COGS) txByContract[k].cogs+=amt;
                      });
                      const pMonthMap = {};
                      finProjects.filter(p=>(p.rawStatus||p.status)!=="отменен").forEach(p=>{ const k=pmKey(p); if(!k) return;
                        if(!pMonthMap[k]) pMonthMap[k]={count:0,budget:0,inc:0,gross:0};
                        const cx = txByContract[_normCn(p.contractNo)] || {inc:0,cogs:0};
                        pMonthMap[k].count++;
                        pMonthMap[k].budget+=(Number(p.budget)||0);
                        pMonthMap[k].inc+=cx.inc;
                        pMonthMap[k].gross+=Math.max(0,cx.inc-cx.cogs);
                      });
                      const pMonths = Object.keys(pMonthMap).sort().slice(-18);
                      if(pMonths.length===0) return <div style={{color:"#334155",fontSize:13,padding:"32px 0",textAlign:"center"}}>Нет данных по проектам</div>;
                      const pMax = Math.max(1,...pMonths.map(m=>Math.max(pMonthMap[m].budget,pMonthMap[m].inc)));
                      const fmtM = v => v>=1000000?(v/1000000).toFixed(1)+"M":v>=1000?Math.round(v/1000)+"k":"0";
                      const W=720, H=160, PL=56, PR=16, PT=10, PB=28;
                      const cW=W-PL-PR, cH=H-PT-PB, nm=pMonths.length;
                      const slotW=cW/nm;
                      const BAR_W=Math.max(8,Math.min(28,slotW*0.28));
                      const yOf=v=>PT+cH-(Math.max(0,v)/pMax)*cH;
                      const yTicks=[0,.25,.5,.75,1].map(r=>({y:PT+cH*(1-r),v:Math.round(pMax*r)}));
                      return (
                        <div style={{overflowX:"auto"}}>
                          <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",minWidth:360,display:"block"}}>
                            <defs>
                              <linearGradient id="pg1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b82f6" stopOpacity=".9"/><stop offset="100%" stopColor="#1d4ed8" stopOpacity=".7"/></linearGradient>
                              <linearGradient id="pg2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#34d399" stopOpacity=".9"/><stop offset="100%" stopColor="#059669" stopOpacity=".7"/></linearGradient>
                              <linearGradient id="pg3" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#fbbf24" stopOpacity=".9"/><stop offset="100%" stopColor="#d97706" stopOpacity=".7"/></linearGradient>
                            </defs>
                            {/* grid */}
                            {yTicks.map((t,i)=>(
                              <g key={i}>
                                <line x1={PL} y1={t.y} x2={W-PR} y2={t.y} stroke={i===0?"#1e293b":"#172033"} strokeWidth="1" strokeDasharray={i===0?"":"4 4"}/>
                                <text x={PL-6} y={t.y+4} fontSize="10" fill="#475569" textAnchor="end">{fmtM(t.v)}</text>
                              </g>
                            ))}
                            {/* bars */}
                            {pMonths.map((m,idx)=>{
                              const d=pMonthMap[m]; const [yr,mo]=m.split("-");
                              const cx=PL+idx*slotW+slotW/2;
                              const bud=d.budget, inc=d.inc, gro=d.gross;
                              const yB=yOf(bud), yI=yOf(inc), yG=yOf(gro);
                              const hB=Math.max(1,PT+cH-yB), hI=Math.max(0,PT+cH-yI), hG=Math.max(0,PT+cH-yG);
                              const offsets=[-BAR_W-2, 0, BAR_W+2];
                              return (
                                <g key={m}>
                                  {/* budget bar */}
                                  <rect x={cx+offsets[0]-BAR_W/2} y={yB} width={BAR_W} height={hB} rx="3" fill="url(#pg1)">
                                    <title>Объём продаж: {fM(Math.round(bud))} ₸</title>
                                  </rect>
                                  {/* income bar */}
                                  {hI>0&&<rect x={cx+offsets[1]-BAR_W/2} y={yI} width={BAR_W} height={hI} rx="3" fill="url(#pg2)">
                                    <title>Факт: {fM(Math.round(inc))} ₸</title>
                                  </rect>}
                                  {/* gross bar */}
                                  {hG>0&&<rect x={cx+offsets[2]-BAR_W/2} y={yG} width={BAR_W} height={hG} rx="3" fill="url(#pg3)">
                                    <title>Вал. прибыль: {fM(Math.round(gro))} ₸</title>
                                  </rect>}
                                  {/* count badge */}
                                  <text x={cx} y={Math.min(yB,yI>0?yI:yB)-6} fontSize="9.5" fill="#64748b" textAnchor="middle" fontWeight="600">{d.count} пр.</text>
                                  {/* x label */}
                                  <text x={cx} y={H-4} fontSize="10" fill="#475569" textAnchor="middle">{MNAMES[parseInt(mo)-1]} {yr.slice(2)}</text>
                                </g>
                              );
                            })}
                          </svg>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              );
            })()}

            {/* ───── ДДС: ОТЧЁТ О ДВИЖЕНИИ ДЕНЕЖНЫХ СРЕДСТВ ───── */}
            {financeTab==="dds" && (()=>{
              const MN=["Янв","Фев","Мар","Апр","Май","Июн","Июл","Авг","Сен","Окт","Ноя","Дек"];
              const tsKey = ts => { const d=new Date(ts); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"); };
              const mLabel = k => { const [y,m]=k.split("-"); return MN[parseInt(m)-1]+" "+y.slice(2); };
              // месяцы внутри выбранного периода
              const monthsSet={};
              financeTx.forEach(t=>{ if(t.deletedAt||t.included===false)return; const ts=t.date||t.createdAt||0; if(inPeriod(ts)) monthsSet[tsKey(ts)]=true; });
              const months=Object.keys(monthsSet).sort();
              // САЛЬДО НАЧАЛЬНОЕ на старте периода = opening + чистый поток всех операций до первого месяца
              const startBal0 = accounts.reduce((s,a)=>s+(Number(a.opening)||0),0);
              const firstMonth = months[0];
              let saldoStart = startBal0;
              if(firstMonth){
                financeTx.forEach(t=>{ if(t.deletedAt||t.included===false)return; const ts=t.date||t.createdAt||0; if(tsKey(ts) < firstMonth){ if(t.type==="income") saldoStart+=Number(t.amount)||0; else if(t.type==="expense") saldoStart-=Number(t.amount)||0; } });
              }
              // агрегатор: по типу/категории/подкатегории и по месяцам
              const agg = (pred) => { const byM={}; let tot=0; months.forEach(m=>byM[m]=0);
                financeTx.forEach(t=>{ if(t.deletedAt||t.included===false)return; const ts=t.date||t.createdAt||0; if(!inPeriod(ts)||!pred(t))return; const m=tsKey(ts); if(m in byM){byM[m]+=Number(t.amount)||0; tot+=Number(t.amount)||0;} });
                return {byM,tot};
              };
              const incTotal = agg(t=>t.type==="income");
              const expTotal = agg(t=>t.type==="expense");
              // ── классификация операций по видам деятельности (IAS 7) ──
              const S_DIV="Дивиденды учредителям";
              const actOf = t => {
                const s=((t.subcategory||"")+" "+(t.category||""));
                // Инвестиционный поток: ОС, долгосрочные активы (НМА, долг займы, фин вложения)
                if(t.category===C_INVEST || /оборудован|основн\w* средств|покупка авто|автомобил|капитальн|станок|техник|мебел|инвентар|транспорт/i.test(s)) return "inv";
                if(t.category===C_ASSET_INC || t.category===C_ASSET_OUT) {
                  // Долгосрочные вложения → инвест; краткосрочные и залоги → операц
                  const sub=t.subcategory||"";
                  if(/долг|от 1 года|фин.*влож|нма|нематериальн/i.test(sub)) return "inv";
                  return "op";
                }
                // Финансовый поток: займы полученные/возвраты, кредиты, вклады учредителей, дивиденды
                if(t.category===C_FINANCING_INC || t.category===C_FINACT || t.subcategory===S_DIV || /займ|кредит|ссуд|учредител|дивиденд|вклад/i.test(s)) return "fin";
                return "op";
              };
              const incCats=(financeMeta.income||[]), expCats=(financeMeta.expense||[]);
              const actInc=(act)=>agg(t=>t.type==="income"&&actOf(t)===act);
              const actExp=(act)=>agg(t=>t.type==="expense"&&actOf(t)===act);
              const actNet=(act)=>{const i=actInc(act),e=actExp(act);const byM={};months.forEach(m=>byM[m]=(i.byM[m]||0)-(e.byM[m]||0));return {byM,tot:i.tot-e.tot};};
              const ACTS=[
                {key:"op",label:"Операционная деятельность",desc:"клиенты, поставщики, зарплаты, налоги",color:"#0891b2",bg:"#ecfeff"},
                {key:"inv",label:"Инвестиционная деятельность",desc:"покупка / продажа оборудования и активов",color:"#7c3aed",bg:"#f5f3ff"},
                {key:"fin",label:"Финансовая деятельность",desc:"займы, дивиденды, вклады учредителей",color:"#d97706",bg:"#fffbeb"},
              ];
              const nCols=months.length+2;
              // нарастающее сальдо конечное
              const saldoEnd={}; let run=saldoStart;
              months.forEach(m=>{ run+=(incTotal.byM[m]||0)-(expTotal.byM[m]||0); saldoEnd[m]=run; });
              const fmt = v => v ? fM(v) : "—";
              const sumStyle=(v)=>({textAlign:"right",fontWeight:700,color:v>=0?"#0f172a":"#dc2626"});
              // строки-помощники
              const goOps=(cat,sub)=>{ navigate(undefined,"ops",{finFilterCat:cat||"",finFilterCategory:sub||"",finFilterContract:""}); };
              const groupRow=(label,ser,color,cat)=>(
                <tr key={"g-"+label} onClick={()=>goOps(cat||label,"")} style={{borderBottom:"1px solid #f1f5f9",cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                  <td style={{paddingLeft:24,fontWeight:700,color:"#334155"}}>{label} <span style={{fontSize:9,color:"#cbd5e1",marginLeft:4}}>↗</span></td>
                  {months.map(m=><td key={m} style={{textAlign:"right",color,fontWeight:600}}>{fmt(ser.byM[m])}</td>)}
                  <td className="colTot" style={{textAlign:"right",fontWeight:800,color}}>{fmt(ser.tot)}</td>
                </tr>
              );
              const subRow=(label,ser,cat)=>(
                <tr key={"s-"+label} onClick={()=>goOps(cat||"",label)} style={{cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                  <td style={{paddingLeft:40,color:"#64748b",fontSize:11.5}}>{label} <span style={{fontSize:9,color:"#cbd5e1",marginLeft:4}}>↗</span></td>
                  {months.map(m=><td key={m} style={{textAlign:"right",color:"#94a3b8",fontSize:11.5}}>{fmt(ser.byM[m])}</td>)}
                  <td className="colTot" style={{textAlign:"right",color:"#64748b",fontSize:11.5}}>{fmt(ser.tot)}</td>
                </tr>
              );
              return (
                <div className="card" style={{padding:"18px 20px",width:"100%",boxSizing:"border-box"}}>
                  <div style={{fontSize:15,fontWeight:800,color:"#0f172a",marginBottom:4}}>💸 Отчёт о движении денежных средств (ДДС)</div>
                  <div style={{fontSize:12,color:"#94a3b8",marginBottom:16}}>Прямой метод · кассовый принцип · разбивка по видам деятельности (IAS 7) · {months.length} мес.</div>
                  {months.length===0 ? <div style={{color:"#94a3b8",textAlign:"center",padding:30}}>Нет данных за период</div> : (
                  <div className="rep-wrap">
                  <table className="rep-table">
                    <thead><tr>
                      <th>Статья</th>
                      {months.map(m=><th key={m} style={{textAlign:"right"}}>{mLabel(m)}</th>)}
                      <th className="colTot" style={{textAlign:"right"}}>Итого</th>
                    </tr></thead>
                    <tbody>
                      <tr onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"} onMouseLeave={e=>e.currentTarget.style.background=""}><td style={{fontWeight:700,color:"#475569"}}>Сальдо на начало</td>{months.map((m,i)=><td key={m} style={sumStyle(i===0?saldoStart:saldoEnd[months[i-1]])}>{fM(i===0?saldoStart:saldoEnd[months[i-1]])}</td>)}<td className="colTot" style={sumStyle(saldoStart)}>{fM(saldoStart)}</td></tr>
                      {ACTS.map(act=>{
                        const inc=actInc(act.key), exp=actExp(act.key), net=actNet(act.key);
                        if(inc.tot===0 && exp.tot===0) return null;
                        const incG=incCats.map(c=>({cat:c.cat,subs:c.subs||[],...agg(t=>t.type==="income"&&t.category===c.cat&&actOf(t)===act.key)})).filter(g=>g.tot!==0);
                        const expG=expCats.map(c=>({cat:c.cat,subs:c.subs||[],...agg(t=>t.type==="expense"&&t.category===c.cat&&actOf(t)===act.key)})).filter(g=>g.tot!==0);
                        return (<Fragment key={act.key}>
                          <tr className="rep-section"><td colSpan={nCols}>{act.label} <span style={{fontWeight:400,letterSpacing:0,textTransform:"none",fontSize:11,color:"#cbd5e1"}}>· {act.desc}</span></td></tr>
                          {incG.length>0 && <tr><td colSpan={nCols} style={{paddingLeft:18,paddingTop:4,paddingBottom:2,fontWeight:600,color:"#64748b",fontSize:11.5}}>Поступления</td></tr>}
                          {incG.map(g=>(<Fragment key={g.cat}>{groupRow(g.cat,g,"#1e293b",g.cat)}{g.subs.map(sub=>{const s=agg(t=>t.type==="income"&&t.category===g.cat&&t.subcategory===sub&&actOf(t)===act.key); return s.tot===0?null:subRow(sub,s,g.cat);})}</Fragment>))}
                          {expG.length>0 && <tr><td colSpan={nCols} style={{paddingLeft:18,paddingTop:4,paddingBottom:2,fontWeight:600,color:"#64748b",fontSize:11.5}}>Платежи</td></tr>}
                          {expG.map(g=>(<Fragment key={g.cat}>{groupRow(g.cat,g,"#dc2626",g.cat)}{g.subs.map(sub=>{const s=agg(t=>t.type==="expense"&&t.category===g.cat&&t.subcategory===sub&&actOf(t)===act.key); if(s.tot===0)return null; if(sub===S_DIV){const drec={}; financeTx.filter(t=>!t.deletedAt&&t.included!==false&&t.type==="expense"&&t.subcategory===S_DIV&&t.recipient&&actOf(t)===act.key).forEach(t=>{const r=t.recipient,m=tsKey(t.date||t.createdAt||0);if(!months.includes(m))return;if(!drec[r]){drec[r]={byM:{},tot:0};months.forEach(mo=>{drec[r].byM[mo]=0;});}drec[r].byM[m]=(drec[r].byM[m]||0)+(Number(t.amount)||0);drec[r].tot+=(Number(t.amount)||0);}); return(<Fragment key={sub}>{subRow(sub,s,g.cat)}{Object.entries(drec).map(([r,ser])=>(<tr key={"dr-"+r}><td style={{paddingLeft:56,color:"#94a3b8",fontSize:11}}>↳ {r}</td>{months.map(m=><td key={m} style={{textAlign:"right",color:"#94a3b8",fontSize:11}}>{ser.byM[m]>0?fmt(ser.byM[m]):"—"}</td>)}<td className="colTot" style={{textAlign:"right",color:"#94a3b8",fontSize:11}}>{fmt(ser.tot)}</td></tr>))}</Fragment>);} return subRow(sub,s,g.cat);})}</Fragment>))}
                          <tr className="rep-metric"><td>Чистый поток · {act.label.toLowerCase()}</td>{months.map(m=><td key={m} style={{color:(net.byM[m]||0)<0?"#dc2626":undefined}}>{(net.byM[m]||0)>=0?"+":""}{fmt(net.byM[m])}</td>)}<td className="colTot" style={{color:net.tot<0?"#dc2626":undefined}}>{net.tot>=0?"+":""}{fmt(net.tot)}</td></tr>
                        </Fragment>);
                      })}
                      <tr className="rep-metric" style={{borderTop:"2px solid #cbd5e1"}}><td style={{fontWeight:900}}>ЧИСТЫЙ ДЕНЕЖНЫЙ ПОТОК</td>{months.map(m=>{const v=(incTotal.byM[m]||0)-(expTotal.byM[m]||0);return <td key={m} style={{color:v<0?"#dc2626":undefined}}>{v>=0?"+":""}{fmt(v)}</td>;})}<td className="colTot" style={{color:(incTotal.tot-expTotal.tot)<0?"#dc2626":undefined}}>{(incTotal.tot-expTotal.tot)>=0?"+":""}{fmt(incTotal.tot-expTotal.tot)}</td></tr>
                      <tr className="rep-metric"><td style={{fontWeight:900}}>Сальдо на конец</td>{months.map(m=><td key={m} style={{...sumStyle(saldoEnd[m])}}>{fM(saldoEnd[m])}</td>)}<td className="colTot" style={{...sumStyle(run)}}>{fM(run)}</td></tr>
                    </tbody>
                  </table>
                  </div>)}
                </div>
              );
            })()}

            {/* ───── ОПУ: ОТЧЁТ О ПРИБЫЛЯХ И УБЫТКАХ ───── */}
            {financeTab==="opu" && (()=>{
              const MN=["Янв","Фев","Мар","Апр","Май","Июн","Июл","Авг","Сен","Окт","Ноя","Дек"];
              const mLabel=k=>{const[y,m]=k.split("-");return MN[parseInt(m)-1]+" "+y.slice(2);};
              const ymOf = d => { if(!d) return null; const dt=new Date(d); if(isNaN(dt)) return null; return dt.getFullYear()+"-"+String(dt.getMonth()+1).padStart(2,"0"); };
              // ── ДОХОД (признание по этапам): оплата клиента = сдача этапа, в месяце оплаты ──
              const opMonth = t => { const d=new Date(t.date||t.createdAt||0); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"); };
              const inPM = m => m && inPeriod(new Date(m+"-01").getTime());
              // единый список строк ОПУ: доходы и расходы по дате операции (этап сдан / расход понесён)
              // финансирование (займы/вклады) и возвраты займов/активов — НЕ P&L, исключаем из ОПУ
              // CapEx (покупка ОС) — кассовый метод: расход в ОПУ; выданные займы/залоги — актив, не расход
              const isFinInc = t => t.category===C_FINANCING_INC || t.category===C_ASSET_INC;
              const isNonPL = t => t.category===C_FINACT || t.category===C_ASSET_OUT;
              const opuRows=[
                ...financeTx.filter(t=>!t.deletedAt&&t.included!==false&&t.type==="income"&&!t.isAdvance&&!isFinInc(t)).map(t=>({type:"income",category:t.category,subcategory:t.subcategory,amount:Number(t.amount)||0,month:opMonth(t)})),
                ...financeTx.filter(t=>!t.deletedAt&&t.included!==false&&t.type==="income"&&(t.isAdvance||isFinInc(t))).map(t=>({type:"advance",category:t.category,subcategory:t.subcategory,amount:Number(t.amount)||0,month:opMonth(t)})),
                ...financeTx.filter(t=>!t.deletedAt&&t.included!==false&&t.type==="expense"&&!isNonPL(t)).map(t=>({type:"expense",category:t.category,subcategory:t.subcategory,amount:Number(t.amount)||0,month:opMonth(t)})),
              ];
              const monthsSet={};
              opuRows.forEach(r=>{ if(inPM(r.month)) monthsSet[r.month]=true; });
              const months=Object.keys(monthsSet).sort();
              const agg=(pred)=>{ const byM={}; let tot=0; months.forEach(m=>byM[m]=0);
                opuRows.forEach(r=>{ if(!inPM(r.month)||!pred(r))return; if(r.month in byM){byM[r.month]+=r.amount; tot+=r.amount;} });
                return {byM,tot};
              };
              const income=agg(t=>t.type==="income");
              const adv=agg(t=>t.type==="advance");
              const expTotalA=agg(t=>t.type==="expense");
              const incGroups=(financeMeta.income||[]).map(c=>({cat:c.cat,subs:c.subs||[],...agg(t=>t.type==="income"&&t.category===c.cat)}));
              const expGroups=(financeMeta.expense||[]).map(c=>({cat:c.cat,subs:c.subs||[],...agg(t=>t.type==="expense"&&t.category===c.cat)}));
              const profitByM={}; months.forEach(m=>profitByM[m]=(income.byM[m]||0)-(expTotalA.byM[m]||0));
              const totProfit=income.tot-expTotalA.tot;
              // ── метрики P&L по международным стандартам ──
              const C_COGS="Прямые расходы (COGS / себестоимость)", C_OPEX="Косвенные расходы (OPEX / операционные)", C_FIN="Финансовые расходы";
              const S_DIV="Дивиденды учредителям"; // распределение прибыли, не расход
              const cogs=agg(t=>t.type==="expense"&&t.category===C_COGS);
              const opex=agg(t=>t.type==="expense"&&t.category===C_OPEX);
              const finc=agg(t=>t.type==="expense"&&t.category===C_FIN&&t.subcategory!==S_DIV); // фин.расходы без дивидендов
              const div=agg(t=>t.type==="expense"&&t.category===C_FIN&&t.subcategory===S_DIV);  // дивиденды
              // разбивка дивидендов по получателям для ОПиУ
              const divByRecOpu = {};
              financeTx.filter(t=>!t.deletedAt&&t.included!==false&&t.type==="expense"&&t.subcategory===S_DIV&&t.recipient).forEach(t=>{
                const r=t.recipient; const m=opMonth(t); if(!inPM(m)) return;
                if(!divByRecOpu[r]){divByRecOpu[r]={byM:{},tot:0}; months.forEach(mo=>{divByRecOpu[r].byM[mo]=0;});}
                divByRecOpu[r].byM[m]=(divByRecOpu[r].byM[m]||0)+(Number(t.amount)||0);
                divByRecOpu[r].tot+=(Number(t.amount)||0);
              });
              const sub=(a,b)=>{ const byM={}; months.forEach(m=>byM[m]=(a.byM[m]||0)-(b.byM[m]||0)); return {byM,tot:a.tot-b.tot}; };
              const gross=sub(income,cogs);          // Валовая прибыль = Выручка − COGS
              const ebitda=sub(gross,opex);          // EBITDA / Операционная прибыль = ВП − OPEX
              const net=sub(ebitda,finc);            // Чистая прибыль = EBITDA − Фин.расходы
              const retained=sub(net,div);           // Нераспределённая прибыль = Чистая − Дивиденды
              const pctRow=(num)=>{ const byM={}; months.forEach(m=>byM[m]=income.byM[m]>0?Math.round(num.byM[m]/income.byM[m]*100):null); return {byM,tot:income.tot>0?Math.round(num.tot/income.tot*100):null}; };
              const grossM=pctRow(gross), ebitdaM=pctRow(ebitda), netM=pctRow(net);
              const fmt=v=>v?fM(v):"—";
              const fpct=v=>v===null?"—":v+"%";
              const HCell={padding:"7px 9px",textAlign:"right",color:"#64748b",fontWeight:700,whiteSpace:"nowrap",fontSize:11.5};
              // строка-метрика (subtotal) и строка-процент
              // строка итога секции (крупная, цветной фон)
              const MetricRow=({label,ser})=>(<tr className="rep-metric">
                <td>{label}</td>
                {months.map(m=>{const v=ser.byM[m]||0;return <td key={m} style={{color:v<0?"#dc2626":undefined}}>{v?fM(v):"—"}</td>;})}
                <td className="colTot" style={{color:ser.tot<0?"#dc2626":undefined}}>{ser.tot?fM(ser.tot):"—"}</td>
              </tr>);
              const PctRow=({label,ser})=>(<tr className="rep-pct">
                <td>{label}</td>
                {months.map(m=><td key={m}>{fpct(ser.byM[m])}</td>)}
                <td className="colTot">{fpct(ser.tot)}</td>
              </tr>);
              const goOps=(cat,sub)=>{ navigate(undefined,"ops",{finFilterCat:cat||"",finFilterCategory:sub||"",finFilterContract:""}); };
              // группа расходов: категория + подкатегории
              const ExpGroupRows=({cat,exclude=[]})=>{
                const meta=(financeMeta.expense||[]).find(c=>c.cat===cat); if(!meta)return null;
                const gt=agg(t=>t.type==="expense"&&t.category===cat&&!exclude.includes(t.subcategory)); if(gt.tot===0)return null;
                return (<Fragment>
                  <tr onClick={()=>goOps(cat,"")} style={{cursor:"pointer",borderTop:"1px solid #e2e8f0"}} onMouseEnter={e=>e.currentTarget.style.background="#fff7ed"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                    <td style={{padding:"8px 14px",fontWeight:700,color:"#1e293b",fontSize:13}}>{cat} <span style={{fontSize:9,color:"#cbd5e1"}}>↗</span></td>
                    {months.map(m=><td key={m} style={{padding:"8px 14px",textAlign:"right",color:"#dc2626",fontWeight:600}}>{gt.byM[m]?fM(gt.byM[m]):"—"}</td>)}
                    <td className="colTot" style={{padding:"8px 14px",textAlign:"right",fontWeight:800,color:"#dc2626"}}>{gt.tot?fM(gt.tot):"—"}</td>
                  </tr>
                  {(meta.subs||[]).filter(s2=>!exclude.includes(s2)).map(s2=>{
                    const s=agg(t=>t.type==="expense"&&t.category===cat&&t.subcategory===s2); if(s.tot===0)return null;
                    return (<tr key={s2} onClick={()=>goOps(cat,s2)} style={{cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background="#fef9f0"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                      <td style={{padding:"5px 14px 5px 28px",color:"#64748b",fontSize:12}}>· {s2} <span style={{fontSize:9,color:"#cbd5e1"}}>↗</span></td>
                      {months.map(m=><td key={m} style={{padding:"5px 14px",textAlign:"right",color:"#94a3b8",fontSize:12}}>{s.byM[m]?fM(s.byM[m]):"—"}</td>)}
                      <td className="colTot" style={{padding:"5px 14px",textAlign:"right",color:"#64748b",fontSize:12}}>{s.tot?fM(s.tot):"—"}</td>
                    </tr>);
                  })}
                </Fragment>);
              };
              return (
                <div className="card" style={{padding:"18px 20px",width:"100%",boxSizing:"border-box"}}>
                  <div style={{fontSize:15,fontWeight:800,color:"#0f172a",marginBottom:4}}>📈 Отчёт о прибылях и убытках (ОПУ / P&L)</div>
                  <div style={{fontSize:12,color:"#94a3b8",marginBottom:16}}>Признание по этапам: выручка = <b>оплата сданного этапа</b> в месяце сдачи (= дата оплаты клиентом), расходы — по дате операции · {months.length} мес.</div>
                  {months.length===0 ? <div style={{color:"#94a3b8",textAlign:"center",padding:30}}>Нет данных за период</div> : (<>
                  <div className="rep-wrap">
                  <table className="rep-table">
                    <thead><tr>
                      <th>Статья</th>
                      {months.map(m=><th key={m} style={{textAlign:"right"}}>{mLabel(m)}</th>)}
                      <th className="colTot" style={{textAlign:"right"}}>Итого</th>
                    </tr></thead>
                    <tbody>
                      {/* ── Доходы ── */}
                      <tr className="rep-section"><td colSpan={months.length+2}>Доходы</td></tr>
                      {incGroups.filter(g=>g.tot!==0).map(g=>(<Fragment key={g.cat}>
                        <tr onClick={()=>goOps(g.cat,"")} style={{cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                          <td style={{fontWeight:700,color:"#1e293b"}}>{g.cat} <span style={{fontSize:9,color:"#cbd5e1"}}>↗</span></td>
                          {months.map(m=><td key={m} style={{fontWeight:600}}>{g.byM[m]?fM(g.byM[m]):"—"}</td>)}
                          <td className="colTot" style={{fontWeight:800}}>{g.tot?fM(g.tot):"—"}</td>
                        </tr>
                        {g.subs.map(sub=>{ const s=agg(t=>t.type==="income"&&t.category===g.cat&&t.subcategory===sub); if(s.tot===0)return null; return (
                          <tr key={sub} onClick={()=>goOps(g.cat,sub)} style={{cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                            <td style={{paddingLeft:28,color:"#64748b",fontSize:12}}>· {sub} <span style={{fontSize:9,color:"#cbd5e1"}}>↗</span></td>
                            {months.map(m=><td key={m} style={{color:"#94a3b8",fontSize:12}}>{s.byM[m]?fM(s.byM[m]):"—"}</td>)}
                            <td className="colTot" style={{color:"#64748b",fontSize:12}}>{s.tot?fM(s.tot):"—"}</td>
                          </tr>
                        );})}
                      </Fragment>))}
                      <MetricRow label="Выручка (Revenue)" ser={income}/>
                      {adv.tot!==0 && (<tr className="rep-pct"><td style={{paddingLeft:28}} title="Авансы — обязательство, не входят в выручку и прибыль">· Справочно: авансы полученные (обязательство)</td>{months.map(m=><td key={m}>{adv.byM[m]?fM(adv.byM[m]):"—"}</td>)}<td className="colTot">{adv.tot?fM(adv.tot):"—"}</td></tr>)}
                      {/* ── Себестоимость ── */}
                      <tr className="rep-section"><td colSpan={months.length+2}>Себестоимость (COGS)</td></tr>
                      <ExpGroupRows cat={C_COGS}/>
                      <MetricRow label="ВАЛОВАЯ ПРИБЫЛЬ" ser={gross}/>
                      <PctRow label="Валовая маржинальность" ser={grossM}/>
                      {/* ── OPEX ── */}
                      <tr className="rep-section"><td colSpan={months.length+2}>Операционные расходы (OPEX)</td></tr>
                      <ExpGroupRows cat={C_OPEX}/>
                      <MetricRow label="EBITDA / Операционная прибыль" ser={ebitda}/>
                      <PctRow label="Операционная рентабельность" ser={ebitdaM}/>
                      {/* ── Финансовые расходы ── */}
                      <tr className="rep-section"><td colSpan={months.length+2}>Финансовые расходы (налоги, комиссии)</td></tr>
                      <ExpGroupRows cat={C_FIN} exclude={[S_DIV]}/>
                      <MetricRow label="ЧИСТАЯ ПРИБЫЛЬ" ser={net}/>
                      <PctRow label="Рентабельность по чистой прибыли" ser={netM}/>
                      {div.tot!==0 && (<>
                        <tr className="rep-section"><td colSpan={months.length+2}>Распределение прибыли</td></tr>
                        <tr onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"} onMouseLeave={e=>e.currentTarget.style.background=""}><td style={{paddingLeft:28,color:"#64748b",fontSize:12}}>− Дивиденды учредителям</td>{months.map(m=><td key={m} style={{color:"#94a3b8",fontSize:12}}>{fmt(div.byM[m])}</td>)}<td className="colTot" style={{color:"#64748b",fontSize:12}}>{fmt(div.tot)}</td></tr>
                        {Object.entries(divByRecOpu).map(([r,ser])=>(
                          <tr key={r} onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"} onMouseLeave={e=>e.currentTarget.style.background=""}><td style={{paddingLeft:40,color:"#94a3b8",fontSize:11}}>↳ {r}</td>{months.map(m=><td key={m} style={{color:"#94a3b8",fontSize:11}}>{ser.byM[m]>0?fmt(ser.byM[m]):"—"}</td>)}<td className="colTot" style={{color:"#94a3b8",fontSize:11}}>{fmt(ser.tot)}</td></tr>
                        ))}
                        <MetricRow label="НЕРАСПРЕДЕЛЁННАЯ ПРИБЫЛЬ" ser={retained}/>
                      </>)}
                    </tbody>
                  </table>
                  </div>
                  <div style={{marginTop:16,display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10}}>
                    {[
                      ["Выручка",fM(income.tot)+" ₸",null,"#059669","#f0fdf4"],
                      ["Валовая прибыль",fM(gross.tot)+" ₸",grossM.tot,"#0891b2","#ecfeff"],
                      ["EBITDA",fM(ebitda.tot)+" ₸",ebitdaM.tot,"#7c3aed","#f5f3ff"],
                      ["Чистая прибыль",fM(net.tot)+" ₸",netM.tot,"#2563eb","#eff6ff"],
                    ].map(([l,v,pc,c,bg])=>(
                      <div key={l} style={{background:bg,borderRadius:12,padding:"12px 14px",border:"1px solid "+c+"22"}}>
                        <div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:3}}>{l}</div>
                        <div style={{fontSize:16,fontWeight:800,color:c}}>{v}</div>
                        {pc!==null&&<div style={{fontSize:11,color:c,marginTop:2,fontWeight:600}}>{pc}% от выручки</div>}
                      </div>
                    ))}
                  </div>
                  </>)}
                </div>
              );
            })()}

            {/* ───── БАЛАНС (IFRS / Statement of Financial Position) ───── */}
            {financeTab==="balance" && (()=>{
              const bi = financeMeta.balanceItems || {};
              const n = v => Number(v)||0;
              // приход по проектам (для дебиторки)
              const projInc={};
              for(const t of financeTx){ if(t.included===false)continue; const cn=(t.contractNo||"").trim(); if(!cn)continue; if(t.type==="income") projInc[cn]=(projInc[cn]||0)+(Number(t.amount)||0); }
              // ── Денежные средства по типам счетов ──
              const byType = { cash:0, bank:0, card:0, ewallet:0 };
              accounts.forEach(a=>{ const tp=a.accType||"bank"; byType[tp]=(byType[tp]||0)+(balances[a.name]||0); });
              const cash = byType.cash+byType.bank+byType.card+byType.ewallet;
              // Дебиторка (денежная — клиенты должны оплатить деньгами по проектам)
              const receivablesMoney = finProjects.filter(p=>(p.rawStatus||p.status)!=="отменен").reduce((s,p)=>s+Math.max(0,(Number(p.budget)||0)-(projInc[p.contractNo]||0)),0);
              // Авансы клиентов (обязательство)
              const advances = financeTx.filter(t=>!t.deletedAt&&t.included!==false&&t.type==="income"&&t.isAdvance).reduce((s,t)=>s+(Number(t.amount)||0),0);

              // ── Авто-расчёт из операций (все статьи баланса — только из транзакций) ──
              const sumTx = pred => financeTx.filter(t=>!t.deletedAt&&t.included!==false&&pred(t)).reduce((s,t)=>s+(Number(t.amount)||0),0);
              const subEq = (t,name) => t.subcategory===name;
              // полученные займы (до года) = получено − возвращено
              const autoLoanShort = sumTx(t=>t.type==="income"&&subEq(t,"Полученный заём (до 1 года)")) - sumTx(t=>t.type==="expense"&&subEq(t,"Возврат займа (до 1 года)"));
              const autoLoanLong = sumTx(t=>t.type==="income"&&subEq(t,"Полученный заём (от 1 года)")) - sumTx(t=>t.type==="expense"&&subEq(t,"Возврат займа (от 1 года)"));
              const autoCreditLong = sumTx(t=>t.type==="income"&&subEq(t,"Полученный кредит (от 1 года)")) - sumTx(t=>t.type==="expense"&&subEq(t,"Погашение кредита (от 1 года)"));
              const autoFounders = sumTx(t=>t.type==="income"&&subEq(t,"Вклад учредителя")) - sumTx(t=>t.type==="expense"&&subEq(t,"Возврат вклада учредителю"));
              // покупка основных средств по типам (накопленные капвложения)
              const autoFA = {};
              Object.entries(FA_SUB_MAP).forEach(([sub,key])=>{ autoFA[key]=sumTx(t=>t.type==="expense"&&subEq(t,sub)); });
              // прочие активы из C_ASSET_OUT минус возвраты из C_ASSET_INC
              const autoAsset = {};
              financeTx.filter(t=>!t.deletedAt&&t.included!==false&&t.type==="expense"&&t.category===C_ASSET_OUT).forEach(t=>{ const k=ASSET_OUT_KEYS[t.subcategory]; if(k) autoAsset[k]=(autoAsset[k]||0)+(Number(t.amount)||0); });
              financeTx.filter(t=>!t.deletedAt&&t.included!==false&&t.type==="income"&&t.category===C_ASSET_INC).forEach(t=>{ const k=ASSET_INC_KEYS[t.subcategory]; if(k) autoAsset[k]=(autoAsset[k]||0)-(Number(t.amount)||0); });
              const ag = k => Math.max(0, autoAsset[k]||0);

              // ── АКТИВЫ ──
              // recv (дебиторка) — только информационно, в кассовом учёте не актив (выручка не признана)
              const recv = receivablesMoney;
              const collateral = ag("collateral");
              const loansGivenShort = ag("loansGivenShort");
              const inventory = ag("inventory");
              const otherCurrent = collateral + loansGivenShort;
              const currentAssets = cash + inventory + otherCurrent; // recv НЕ включается — кассовый метод
              const fa = { faTechnika:autoFA.faTechnika||0, faMebel:autoFA.faMebel||0, faInventar:autoFA.faInventar||0, faOborud:autoFA.faOborud||0, faTransport:autoFA.faTransport||0 };
              const fixedAssets = fa.faTechnika+fa.faMebel+fa.faInventar+fa.faOborud+fa.faTransport;
              const loansGivenLong = ag("loansGivenLong");
              const financialInvest = ag("financialInvest");
              const intangibles = ag("intangibles");
              const otherNonCurrent = loansGivenLong + financialInvest + intangibles;
              const nonCurrentAssets = fixedAssets + otherNonCurrent;
              const totalAssets = currentAssets + nonCurrentAssets;

              // ── ОБЯЗАТЕЛЬСТВА ──
              const payables = 0; // кредиторка — в кассовом учёте = 0 (все фактические оплаты уже в расходах)
              const loansShort = autoLoanShort;
              const otherShort = loansShort + advances;
              const shortLiab = payables + otherShort;
              const creditsLong = autoCreditLong;
              const loansLong = autoLoanLong;
              const longLiab = creditsLong + loansLong;
              const totalLiab = shortLiab + longLiab;

              // ── КАПИТАЛ ── (нераспределённая прибыль = накопленная чистая прибыль из ОПУ за всё время)
              const S_DIV_BAL = "Дивиденды учредителям";
              const allTimeInc  = sumTx(t => t.type==="income"  && !t.isAdvance && t.category!==C_FINANCING_INC && t.category!==C_ASSET_INC);
              const allTimeExp  = sumTx(t => t.type==="expense" && t.subcategory!==S_DIV_BAL && t.category!==C_FINACT && t.category!==C_ASSET_OUT);
              const allTimeDivs = sumTx(t => t.type==="expense" && t.subcategory===S_DIV_BAL);
              const retained    = allTimeInc - allTimeExp - allTimeDivs;
              const founders    = accounts.reduce((s,a)=>s+(Number(a.opening)||0),0) + autoFounders;
              const otherCap    = 0;
              const totalCapital = founders + otherCap + retained;

              const assetsSections = [
                { key:"ca", label:"Оборотные активы", value:currentAssets, children:[
                  // recv — дебиторка показана справочно ниже, не включена в активы (кассовый метод)
                  { key:"recv", label:"Дебиторка (справочно, не актив)", value:recv, info:true, children:[
                    { key:"recv-m", label:"Денежная", value:recv },
                  ]},
                  { key:"cash", label:"Денежные средства", value:cash, children:[
                    { key:"cash-c", label:"Наличные", value:byType.cash },
                    { key:"cash-b", label:"Безналичные (банк)", value:byType.bank },
                    { key:"cash-k", label:"Карты", value:byType.card },
                    { key:"cash-e", label:"Электронные кошельки", value:byType.ewallet },
                  ]},
                  { key:"inv", label:"Запасы", value:inventory },
                  { key:"oc", label:"Другие оборотные", value:otherCurrent, children:[
                    { key:"oc-col", label:"Залоговые платежи", value:collateral },
                    { key:"oc-l", label:"Выданные займы (до 1 года)", value:loansGivenShort },
                  ]},
                ]},
                { key:"nca", label:"Внеоборотные активы", value:nonCurrentAssets, children:[
                  { key:"fa", label:"Основные средства", value:fixedAssets, children:[
                    { key:"fa-t", label:"Техника", value:fa.faTechnika },
                    { key:"fa-m", label:"Мебель", value:fa.faMebel },
                    { key:"fa-i", label:"Инвентарь", value:fa.faInventar },
                    { key:"fa-o", label:"Оборудование", value:fa.faOborud },
                    { key:"fa-tr", label:"Транспорт", value:fa.faTransport },
                  ]},
                  { key:"onc", label:"Другие внеоборотные", value:otherNonCurrent, children:[
                    { key:"onc-l", label:"Выданные займы (от 1 года)", value:loansGivenLong },
                    { key:"onc-f", label:"Финансовые вложения", value:financialInvest },
                    { key:"onc-i", label:"Нематериальные активы", value:intangibles },
                  ]},
                ]},
              ];
              const liabSections = [
                { key:"sl", label:"Краткосрочные обязательства", value:shortLiab, children:[
                  { key:"pay", label:"Кредиторская задолженность", value:payables, children:[
                    { key:"pay-m", label:"Денежная", value:0 },
                    { key:"pay-n", label:"Неденежная", value:0 },
                  ]},
                  { key:"os", label:"Другие краткосрочные", value:otherShort, children:[
                    { key:"os-adv", label:"Авансы клиентов (предоплата)", value:advances },
                    { key:"os-l", label:"Полученные займы (до 1 года)", value:loansShort },
                  ]},
                ]},
                { key:"ll", label:"Долгосрочные обязательства", value:longLiab, children:[
                  { key:"ll-c", label:"Кредиты", value:creditsLong },
                  { key:"ll-o", label:"Другие долгосрочные", value:loansLong, children:[
                    { key:"ll-o-l", label:"Полученные займы (от 1 года)", value:loansLong },
                  ]},
                ]},
              ];
              const capitalSection = { key:"cap", label:"Капитал", value:totalCapital, children:[
                { key:"cap-f", label:"Вложения учредителей", value:founders },
                { key:"cap-r", label:"Нераспределённая прибыль", value:retained },
              ]};

              const diff = totalAssets - (totalLiab + totalCapital);
              return (
                <div className="card" style={{padding:"20px 22px",width:"100%",boxSizing:"border-box"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                    <div style={{fontSize:15,fontWeight:800,color:"#0f172a"}}>⚖️ Балансовый отчёт</div>
                    <span style={{fontSize:10.5,fontWeight:700,color:"#64748b",background:"#f1f5f9",borderRadius:6,padding:"2px 8px"}}>KZT</span>
                  </div>
                  <div style={{fontSize:12,color:"#94a3b8",marginBottom:16}}>Управленческий баланс (IFRS) на текущую дату · нераспределённая прибыль — балансирующая статья</div>
                  <BalanceSheet
                    assetsSections={assetsSections}
                    liabSections={liabSections}
                    capitalSection={capitalSection}
                    totalAssets={totalAssets}
                    totalLiab={totalLiab}
                    totalCapital={totalCapital}
                  />
                  <div style={{marginTop:14,padding:"10px 14px",borderRadius:10,background:Math.abs(diff)<1?"#f0fdf4":"#fef2f2",border:"1px solid "+(Math.abs(diff)<1?"#bbf7d0":"#fecaca")}}>
                    <span style={{fontSize:12.5,fontWeight:700,color:Math.abs(diff)<1?"#059669":"#dc2626"}}>{Math.abs(diff)<1?"✓ Баланс сходится":"⚠ Расхождение "+fM(diff)+" ₸"}: Активы {fM(totalAssets)} = Обязательства+Капитал {fM(totalLiab+totalCapital)}</span>
                  </div>
                  <div style={{marginTop:10,fontSize:11,color:"#94a3b8",lineHeight:1.6}}>
                    Денежные средства разбиты по типам счетов (задаётся в Справочнике). Основные средства, запасы, займы и кредиторку вводите вручную в Справочнике → «Статьи баланса». Дебиторка — автоматически по проектам (стоимость − оплачено), авансы клиентов — из операций с флагом «Аванс».
                  </div>
                </div>
              );
            })()}

            {/* ───── ОПЕРАЦИИ ───── */}
            {financeTab==="ops" && (<>
              <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
                {!finReadonly && <button onClick={()=>openNewTx("income")} style={{background:"#059669",color:"#fff",border:"none",borderRadius:9,padding:"9px 15px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>+ Доход</button>}
                {!finReadonly && <button onClick={()=>openNewTx("expense")} style={{background:"#dc2626",color:"#fff",border:"none",borderRadius:9,padding:"9px 15px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>+ Расход</button>}
                {!finReadonly && <button onClick={()=>openNewTx("transfer")} style={{background:"#7c3aed",color:"#fff",border:"none",borderRadius:9,padding:"9px 15px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>+ Перевод</button>}
                <div style={{flex:1}}/>
                <button onClick={()=>downloadCSV(
                  "operations_"+new Date().toISOString().slice(0,10)+".csv",
                  ["Дата","Тип","Сумма","Счёт","Счёт (куда)","Категория","Подкатегория","Договор","Комментарий","Учитывается"],
                  opsList.map(t=>[
                    new Date(t.date||t.createdAt||0).toLocaleDateString("ru-RU"),
                    TYPE_LABEL[t.type]||t.type,
                    Math.round(Number(t.amount)||0),
                    t.account||"", t.accountTo||"", t.category||"", t.subcategory||"",
                    t.contractNo||"", t.note||"", t.included===false?"нет":"да",
                  ])
                )} style={{background:"#eff6ff",color:"#2563eb",border:"1px solid #bfdbfe",borderRadius:9,padding:"9px 14px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>⬇ Excel (CSV)</button>
                {!finReadonly && (()=>{const td=financeTx.filter(t=>t.deletedAt); return td.length>0&&(<button onClick={()=>setFinTxTrash(true)} style={{background:"rgba(220,38,38,.1)",color:"#dc2626",border:"1px solid rgba(220,38,38,.18)",borderRadius:9,padding:"9px 14px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>🗑 {td.length}</button>);})()}
                <span style={{fontSize:12,color:"#94a3b8"}}>Операций: <b style={{color:"#334155"}}>{opsList.length}</b></span>
              </div>
              {(finFilterContract || finFilterCat || finFilterCategory) && (
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,flexWrap:"wrap"}}>
                  {finFilterContract && <div style={{display:"flex",alignItems:"center",gap:6,background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:9,padding:"7px 12px"}}>
                    <span style={{fontSize:12,fontWeight:700,color:"#2563eb"}}>📋 Проект: {finFilterContract}</span>
                    <button onClick={()=>setFinFilterContract("")} style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:16,lineHeight:1,padding:0}}>✕</button>
                  </div>}
                  {finFilterCat && <div style={{display:"flex",alignItems:"center",gap:6,background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:9,padding:"7px 12px"}}>
                    <span style={{fontSize:12,fontWeight:700,color:"#059669"}}>📂 {finFilterCat}</span>
                    <button onClick={()=>setFinFilterCat("")} style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:16,lineHeight:1,padding:0}}>✕</button>
                  </div>}
                  {finFilterCategory && <div style={{display:"flex",alignItems:"center",gap:6,background:"#fefce8",border:"1px solid #fef08a",borderRadius:9,padding:"7px 12px"}}>
                    <span style={{fontSize:12,fontWeight:700,color:"#ca8a04"}}>📌 {finFilterCategory}</span>
                    <button onClick={()=>setFinFilterCategory("")} style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:16,lineHeight:1,padding:0}}>✕</button>
                  </div>}
                </div>
              )}
              <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
                <input className="fi" placeholder="🔍 Поиск по статье, комментарию, договору..." value={finSearch} onChange={e=>setFinSearch(e.target.value)} style={{flex:"1 1 240px"}}/>
                <select className="fi" style={{width:"auto"}} value={finFilterType} onChange={e=>setFinFilterType(e.target.value)}>
                  <option value="">Все типы</option><option value="income">Доходы</option><option value="expense">Расходы</option><option value="transfer">Переводы</option>
                </select>
                <select className="fi" style={{width:"auto"}} value={finFilterAccount} onChange={e=>setFinFilterAccount(e.target.value)}>
                  <option value="">Все счета</option>{accounts.map(a=><option key={a.id} value={a.name}>{a.name}</option>)}
                </select>
                {(()=>{
                  const cats = [...new Set(financeTx.filter(t=>!t.deletedAt && t.subcategory).map(t=>t.subcategory))].sort();
                  return cats.length>0 ? (
                    <select className="fi" style={{width:"auto"}} value={finFilterCategory} onChange={e=>setFinFilterCategory(e.target.value)}>
                      <option value="">Все подкатегории</option>{cats.map(c=><option key={c} value={c}>{c}</option>)}
                    </select>
                  ) : null;
                })()}
                <input className="fi" type="number" placeholder="Сумма от" value={finAmtMin} onChange={e=>setFinAmtMin(e.target.value)} style={{width:110}}/>
                <input className="fi" type="number" placeholder="до" value={finAmtMax} onChange={e=>setFinAmtMax(e.target.value)} style={{width:90}}/>
              </div>
              <div className="card" style={{overflow:"hidden"}}>
                {opsList.length===0 && <div style={{textAlign:"center",color:"#94a3b8",fontSize:13,padding:"40px 0"}}>Нет операций</div>}
                {opsList.map(t=>(
                  <div key={t.id} onClick={()=>{ if(!finReadonly) openEditTx(t); }} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderBottom:"1px solid #f1f5f9",cursor:finReadonly?"default":"pointer",opacity:t.included===false?0.5:1}} className="fin-row">
                    <span style={{width:8,height:8,borderRadius:"50%",background:TYPE_COLOR[t.type],flexShrink:0}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,color:"#0f172a",fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                        {t.included===false?<span title="Не учитывается в балансе" style={{color:"#dc2626",fontWeight:700}}>⊘ </span>:null}{t.type==="transfer" ? (t.account+" → "+t.accountTo) : (t.category||"—")}{t.subcategory?<span style={{color:"#94a3b8",fontWeight:400}}> · {t.subcategory}</span>:null}
                      </div>
                      <div style={{fontSize:11,color:"#94a3b8",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                        {new Date(t.date||t.createdAt||0).toLocaleDateString("ru-RU")} · {t.account}{t.contractNo?" · "+t.contractNo:""}{t.note?" · "+t.note:""}
                      </div>
                    </div>
                    <div style={{fontSize:14,fontWeight:800,color:TYPE_COLOR[t.type],whiteSpace:"nowrap"}}>{t.type==="expense"?"−":t.type==="income"?"+":""}{fM(t.amount)} ₸</div>
                  </div>
                ))}
              </div>
            </>)}

            {/* ───── ПРОЕКТЫ ───── */}
            {financeTab==="projects" && (()=>{
              const projStats = {};
              for (const t of financeTx) {
                if (t.included===false) continue;
                const cn = (t.contractNo||"").trim();
                if (!cn) continue;
                if (!projStats[cn]) projStats[cn] = { income:0, expense:0 };
                if (t.type==="income") projStats[cn].income += t.amount||0;
                else if (t.type==="expense") projStats[cn].expense += t.amount||0;
              }
              const sorted = [...finProjects].sort((a,b)=>(a.createdAt||"").localeCompare(b.createdAt||""));
              const allStatuses = [...new Set(sorted.map(p=>p.rawStatus||p.status).filter(Boolean))];
              const allCats = [...new Set(sorted.map(p=>p.category).filter(Boolean))];
              const q = finProjSearch.toLowerCase();
              const filtered = sorted
                .filter(p=>!finProjStatusFilter || (p.rawStatus||p.status)===finProjStatusFilter)
                .filter(p=>!finProjCatFilter || p.category===finProjCatFilter)
                .filter(p=>!q || (p.contractNo||"").toLowerCase().includes(q)||(p.description||"").toLowerCase().includes(q)||(p.client||"").toLowerCase().includes(q)||(p.comment||"").toLowerCase().includes(q));
              const STATUS_COL = { активен:"#2563eb", выполнен:"#059669", отменен:"#94a3b8", приостановлен:"#f59e0b", новый:"#7c3aed" };
              const days = (a,b) => { if(!a||!b) return null; const d=Math.round((new Date(b)-new Date(a))/86400000); return d>=0?d:null; };
              const yesno = v => v==="да"||v==="yes"||v===true||v==="1"||v==="Да"||v==="ДА";
              const yn = v => <span style={{color:yesno(v)?"#059669":"#dc2626",fontWeight:700}}>{yesno(v)?"✓":"✗"}</span>;
              const thS = {padding:"8px 10px",fontWeight:700,fontSize:11,color:"#64748b",background:"#f8fafc",whiteSpace:"nowrap",textAlign:"right",borderBottom:"1px solid #e2e8f0"};
              const thSL = {...thS,textAlign:"left"};
              const tdS = {padding:"8px 10px",fontSize:12,whiteSpace:"nowrap",borderBottom:"1px solid #f1f5f9",textAlign:"right",color:"#0f172a"};
              const tdSL = {...tdS,textAlign:"left"};
              // totals
              const totBudget = filtered.reduce((s,p)=>s+(Number(p.budget)||0),0);
              const totIncome = filtered.reduce((s,p)=>s+(projStats[p.contractNo]?.income||0),0);
              const totExpense = filtered.reduce((s,p)=>s+(projStats[p.contractNo]?.expense||0),0);
              const totDebt = filtered.reduce((s,p)=>s+Math.max(0,(Number(p.budget)||0)-(projStats[p.contractNo]?.income||0)),0);
              const totMargin = totIncome>0 ? Math.round((totIncome-totExpense)/totIncome*100) : 0;
              return (
                <div>
                  {/* Заголовок + кнопка */}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,gap:10,flexWrap:"wrap"}}>
                    <div style={{display:"flex",alignItems:"baseline",gap:10}}>
                      <h2 style={{margin:0,fontSize:18,fontWeight:800,color:"#0f172a"}}>🏗 Проекты</h2>
                      <span style={{fontSize:13,color:"#94a3b8",fontWeight:600}}>{filtered.length} из {finProjects.length}</span>
                    </div>
                    {!finReadonly && <button onClick={()=>setFinProjModal({id:"",contractNo:"",client:"Физ лицо",category:"Вторичка",description:"",budget:0,status:"активен",createdAt:"",closedAt:"",b24:"нет",contractSigned:"нет",avr:"нет",comment:""})}
                      style={{background:"#059669",color:"#fff",border:"none",borderRadius:10,padding:"10px 20px",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 2px 8px rgba(5,150,105,.3)"}}>+ Проект</button>}
                  </div>
                  {/* Фильтры */}
                  <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
                    <input className="fi" style={{flex:"1 1 180px",maxWidth:260}} value={finProjSearch} onChange={e=>setFinProjSearch(e.target.value)} placeholder="🔍 Поиск..."/>
                    {[["","Все статусы"],...allStatuses.map(s=>[s,s])].map(([v,l])=>{
                      const col=STATUS_COL[v]||"#64748b";
                      const on=finProjStatusFilter===v;
                      return <button key={v} onClick={()=>setFinProjStatusFilter(v)} style={{fontSize:12,fontWeight:700,padding:"6px 12px",borderRadius:8,cursor:"pointer",fontFamily:"inherit",border:"1px solid "+(on?(v?col:"#2563eb"):"#e2e8f0"),background:on?(v?col+"18":"#eff6ff"):"#fff",color:on?(v?col:"#2563eb"):"#94a3b8"}}>{l}</button>;
                    })}
                    {allCats.length>1 && <select className="fi" style={{width:"auto",minWidth:130}} value={finProjCatFilter} onChange={e=>setFinProjCatFilter(e.target.value)}>
                      <option value="">Все типы</option>
                      {allCats.map(c=><option key={c} value={c}>{c}</option>)}
                    </select>}
                  </div>
                  {/* Итого-плитки */}
                  {filtered.length>0 && (()=>{
                    const tiles=[
                      ["Объём продаж",fM(totBudget)+" ₸","#0f172a","#f1f5f9"],
                      ["Оплачено факт",fM(totIncome)+" ₸","#059669","#f0fdf4"],
                      ["Дебиторка",totDebt>0?fM(totDebt)+" ₸":"—",totDebt>0?"#dc2626":"#94a3b8","#fef2f2"],
                      ["Расходы",fM(totExpense)+" ₸","#dc2626","#fef2f2"],
                      ["Валовая прибыль",fM(totIncome-totExpense)+" ₸",(totIncome-totExpense)>=0?"#059669":"#dc2626","#f0fdf4"],
                      ["Маржа",totMargin+"%",totMargin>=30?"#059669":totMargin>=0?"#f59e0b":"#dc2626","#fffbeb"],
                    ];
                    return <div className="fin-tiles" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,marginBottom:16}}>
                      {tiles.map(([l,v,c,bg])=>(
                        <div key={l} style={{background:bg,borderRadius:12,padding:"12px 14px",border:"1px solid "+c+"22"}}>
                          <div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:3}}>{l}</div>
                          <div style={{fontSize:17,fontWeight:800,color:c}}>{v}</div>
                        </div>
                      ))}
                    </div>;
                  })()}
                  {/* Карточки проектов */}
                  <div className="fin-cards" style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14}}>
                    {filtered.map(p=>{
                      const st = projStats[p.contractNo]||{income:0,expense:0};
                      const income = st.income;
                      const expense = st.expense;
                      const debt = Math.max(0,(Number(p.budget)||0)-income);
                      const marginVal = income-expense;
                      const marginPct = income>0 ? Math.round(marginVal/income*100) : null;
                      const col = STATUS_COL[p.rawStatus||p.status]||"#64748b";
                      const dur = days(p.createdAt, p.closedAt);
                      const budgetFill = p.budget>0 ? Math.min(100,Math.round(income/p.budget*100)) : 0;
                      const mCol = marginPct===null?"#94a3b8":marginPct>=30?"#059669":marginPct>=0?"#f59e0b":"#dc2626";
                      const mBg  = marginPct===null?"#f8fafc":marginPct>=30?"#f0fdf4":marginPct>=0?"#fffbeb":"#fef2f2";
                      const link = linkForContractNo(p.contractNo);
                      return (
                        <div key={p.id||p.contractNo} onClick={()=>{ if(!finReadonly) setFinProjModal({...p}); }}
                          style={{background:"#fff",border:"1px solid #eef2f7",borderRadius:16,cursor:finReadonly?"default":"pointer",boxShadow:"0 1px 3px rgba(15,23,42,.07)",transition:"box-shadow .15s,transform .15s",overflow:"hidden",display:"flex",flexDirection:"column"}}
                          className="fin-row">
                          {/* Цветная полоса статуса */}
                          <div style={{height:4,background:`linear-gradient(90deg,${col},${col}99)`,flexShrink:0}}/>
                          <div style={{padding:"14px 16px 16px",flex:1,display:"flex",flexDirection:"column"}}>
                            {/* Шапка */}
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8,gap:8}}>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontSize:14,fontWeight:800,color:"#0f172a",letterSpacing:"-.2px",lineHeight:1.3,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{p.description||p.comment||"—"}</div>
                                <div style={{fontSize:11,color:"#94a3b8",marginTop:3}}>{String(p.contractNo||"").replace(/^№+/,"№")}</div>
                              </div>
                              <span style={{fontSize:10,fontWeight:700,padding:"3px 9px",borderRadius:20,background:col+"18",color:col,whiteSpace:"nowrap",flexShrink:0,lineHeight:1.6}}>{p.rawStatus||p.status}</span>
                            </div>
                            {/* Мета-чипы */}
                            <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:12,fontSize:10,alignItems:"center",minHeight:22}}>
                              {[p.client,p.category].filter(Boolean).map((m,i)=><span key={i} style={{color:"#64748b",background:"#f1f5f9",borderRadius:6,padding:"2px 7px",fontWeight:600}}>{m}</span>)}
                              {p.createdAt&&<span style={{color:"#94a3b8"}}>🤝 {p.createdAt}</span>}
                              {p.startDate&&<span style={{color:"#94a3b8"}}>🔨 {p.startDate}</span>}
                              {p.closedAt&&<span style={{color:"#94a3b8"}}>✓ {p.closedAt}{dur!==null?` · ${dur}д.`:""}</span>}
                              {link?.object && <button onClick={e=>{ e.stopPropagation(); openObjectFromFinance(link.object); }} title="Открыть объект" style={{background:"#eff6ff",color:"#2563eb",border:"1px solid #bfdbfe",borderRadius:6,padding:"2px 7px",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>↗</button>}
                            </div>
                            {/* Прогресс оплаты */}
                            <div style={{marginBottom:12}}>
                              {p.budget>0 ? <>
                                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:5}}>
                                  <span style={{fontSize:16,fontWeight:800,color:"#059669"}}>{fM(income)} <span style={{fontSize:11,fontWeight:600,color:"#94a3b8"}}>из {fM(p.budget)} ₸</span></span>
                                  <span style={{fontSize:12,fontWeight:800,color:budgetFill>=100?"#059669":"#2563eb"}}>{budgetFill}%</span>
                                </div>
                                <div style={{height:6,background:"#f1f5f9",borderRadius:4,overflow:"hidden"}}>
                                  <div style={{height:"100%",width:budgetFill+"%",background:budgetFill>=100?"linear-gradient(90deg,#059669,#34d399)":"linear-gradient(90deg,#2563eb,#60a5fa)",borderRadius:4,transition:"width .3s"}}/>
                                </div>
                              </> : <div>
                                <span style={{fontSize:16,fontWeight:800,color:"#059669"}}>{income>0?fM(income)+" ₸":"—"}</span>
                                <span style={{fontSize:10,color:"#94a3b8",marginLeft:7}}>бюджет не указан</span>
                              </div>}
                            </div>
                            {/* Финансовые строки */}
                            <div style={{borderTop:"1px solid #f1f5f9"}}>
                              {[
                                ["Долг", debt>0?fM(debt)+" ₸":"—", debt>0?"#dc2626":"#94a3b8"],
                                ["Расходы", expense>0?fM(expense)+" ₸":"—", expense>0?"#dc2626":"#94a3b8"],
                              ].map(([l,v,c])=>(
                                <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:"1px solid #f1f5f9"}}>
                                  <span style={{fontSize:11,color:"#64748b",fontWeight:600}}>{l}</span>
                                  <span style={{fontSize:13,fontWeight:700,color:c}}>{v}</span>
                                </div>
                              ))}
                            </div>
                            {/* Нижняя часть: маржа + флаги — прижата к низу карточки */}
                            <div style={{marginTop:"auto",paddingTop:10}}>
                              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:mBg,borderRadius:10,padding:"8px 12px",marginBottom:10}}>
                                <span style={{fontSize:11,fontWeight:700,color:"#475569"}}>Маржа</span>
                                <span style={{display:"flex",alignItems:"center",gap:7}}>
                                  <span style={{fontSize:14,fontWeight:800,color:mCol}}>{income>0?fM(marginVal)+" ₸":"—"}</span>
                                  {marginPct!==null&&<span style={{fontSize:10,fontWeight:800,color:"#fff",background:mCol,borderRadius:6,padding:"2px 7px"}}>{marginPct}%</span>}
                                </span>
                              </div>
                              <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
                                {[["Б24",p.b24],["Договор",p.contractSigned],["АВР",p.avr]].map(([l,v])=>(
                                  <span key={l} style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:6,background:yesno(v)?"#f0fdf4":"#fef2f2",color:yesno(v)?"#059669":"#dc2626",display:"inline-flex",alignItems:"center",gap:3}}>{yesno(v)?"✓":"✗"} {l}</span>
                                ))}
                                {p.contractNo && <button onClick={e=>{ e.stopPropagation(); navigate(undefined,"ops",{finFilterContract:p.contractNo}); }} style={{marginLeft:"auto",background:"#eff6ff",color:"#2563eb",border:"1px solid #bfdbfe",borderRadius:7,padding:"4px 9px",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>📋 Операции</button>}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {filtered.length===0 && <div style={{color:"#94a3b8",textAlign:"center",padding:40,fontSize:14,gridColumn:"1/-1"}}>Проекты не найдены</div>}
                  </div>
                  {/* Модалка проекта */}
                  {finProjModal !== null && (()=>{
                    const mp = finProjModal;
                    const setp = (k,v) => setFinProjModal(p=>({...p,[k]:v}));
                    const savep = async () => {
                      const proj = {...mp, id: mp.id||genId(), budget:Number(mp.budget)||0, paidFact:Number(mp.paidFact)||0, expenses:Number(mp.expenses)||0, updatedAt:Date.now()};
                      const cur = finProjectsRef.current;
                      const list = mp.id ? cur.map(x=>x.id===mp.id?proj:x) : [proj,...cur];
                      await saveFinanceProjects(list);
                      setFinProjModal(null);
                    };
                    const delp = async () => {
                      if (!mp.id) return; if (!confirm("Удалить проект?")) return;
                      // removedIds обязательно — иначе merge при сохранении вернёт удалённый проект из облака
                      await saveFinanceProjects(finProjectsRef.current.filter(x=>x.id!==mp.id), {removedIds:[mp.id], allowEmpty:true});
                      setFinProjModal(null);
                    };
                    return (
                      <div onClick={()=>setFinProjModal(null)} style={{position:"fixed",inset:0,background:"rgba(15,23,42,.55)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
                        <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,padding:"22px 24px",width:"100%",maxWidth:720,maxHeight:"92vh",overflowY:"auto",overflowX:"hidden",boxSizing:"border-box",boxShadow:"0 20px 60px rgba(0,0,0,.3)"}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                            <h3 style={{margin:0,fontSize:17,fontWeight:800,color:"#0f172a"}}>{mp.id?"Редактировать":"Новый"} проект</h3>
                            <button onClick={()=>setFinProjModal(null)} style={{background:"none",border:"none",fontSize:20,color:"#94a3b8",cursor:"pointer"}}>✕</button>
                          </div>
                          {/* показываем расчётные цифры если проект существует */}
                          {mp.id && (()=>{ const st=projStats[mp.contractNo]||{income:0,expense:0}; const debt=Math.max(0,(Number(mp.budget)||0)-st.income); const mrg=st.income>0?Math.round((st.income-st.expense)/st.income*100):null;
                            const link=linkForContractNo(mp.contractNo); const plan=link?.planTotal||0; const pCost=link?.planCost||0; const pMrgPct=link?.planMarginPct;
                            const Cell=({l,v,c})=><div><div style={{fontSize:10,color:"#94a3b8"}}>{l}</div><div style={{fontWeight:800,color:c}}>{v}</div></div>;
                            return <>
                              {/* ФАКТ (по ДДС) */}
                              <div style={{background:"#f8fafc",borderRadius:10,padding:"10px 14px",marginBottom:plan>0?6:12}}>
                                <div style={{fontSize:10,fontWeight:800,color:"#0f172a",marginBottom:6}}>📊 ФАКТ (по оплатам)</div>
                                <div style={{display:"flex",gap:20,flexWrap:"wrap"}}>
                                  <Cell l="ОПЛАЧЕНО" v={fM(st.income)+" ₸"} c="#059669"/>
                                  <Cell l="ДОЛГ" v={debt>0?fM(debt)+" ₸":"—"} c={debt>0?"#dc2626":"#94a3b8"}/>
                                  <Cell l="РАСХОДЫ" v={fM(st.expense)+" ₸"} c="#dc2626"/>
                                  <Cell l="МАРЖА" v={mrg===null?"—":fM(st.income-st.expense)+" ₸ / "+mrg+"%"} c={mrg===null?"#94a3b8":mrg>=30?"#059669":mrg>=0?"#f59e0b":"#dc2626"}/>
                                </div>
                              </div>
                              {/* ПЛАН (по смете) */}
                              {plan>0 && <div style={{background:"#eff6ff",borderRadius:10,padding:"10px 14px",marginBottom:12,border:"1px solid #dbeafe"}}>
                                <div style={{fontSize:10,fontWeight:800,color:"#1e40af",marginBottom:6}}>📐 ПЛАН (по смете объекта)</div>
                                <div style={{display:"flex",gap:20,flexWrap:"wrap"}}>
                                  <Cell l="ВЫРУЧКА" v={fM(plan)+" ₸"} c="#2563eb"/>
                                  {pCost>0&&<Cell l="СЕБЕСТОИМОСТЬ" v={fM(pCost)+" ₸"} c="#dc2626"/>}
                                  {pCost>0&&<Cell l="МАРЖА ПЛАН" v={fM(plan-pCost)+" ₸"+(pMrgPct!==null?" / "+pMrgPct+"%":"")} c={pMrgPct>=30?"#059669":pMrgPct>=0?"#f59e0b":"#dc2626"}/>}
                                  <Cell l="ВЫПОЛНЕНО" v={plan>0?Math.round(st.income/plan*100)+"%":"—"} c="#7c3aed"/>
                                </div>
                              </div>}
                            </>;
                          })()}
                          {/* Связь с объектом / выбор объекта */}
                          {(()=>{
                            const link = linkForContractNo(mp.contractNo);
                            const linkedObj = link?.object;
                            const plan = link?.planTotal||0;
                            // список объектов с договорами для выбора
                            const objOpts = contracts.filter(c=>c.number&&c.objectId).map(c=>{
                              const o=objects.find(x=>x.id===c.objectId);
                              return {num:c.number, label:`${c.number} — ${o?.address||o?.clientName||"объект"}`};
                            });
                            const seen=new Set(); const uniqOpts=objOpts.filter(o=>{const k=normCN(o.num); if(seen.has(k))return false; seen.add(k); return true;});
                            return <div style={{background:linkedObj?"#eff6ff":"#fafafa",border:"1px solid "+(linkedObj?"#bfdbfe":"#eee"),borderRadius:10,padding:"10px 14px",marginBottom:11}}>
                              <div style={{fontSize:11,color:"#64748b",fontWeight:700,marginBottom:6}}>🔗 Связь с объектом</div>
                              {!mp.id && <select className="fi" style={{marginBottom:linkedObj?8:0}} value="" onChange={e=>{ const opt=uniqOpts.find(o=>o.num===e.target.value); if(opt){ const c=contracts.find(x=>x.number===opt.num&&x.objectId); const o=objects.find(x=>x.id===c?.objectId); const d=finProjDraftFromObject(o,c); setFinProjModal(p=>({...p,...d,id:p.id})); } }}>
                                <option value="">— выбрать объект (подтянет № / бюджет) —</option>
                                {uniqOpts.map(o=><option key={o.num} value={o.num}>{o.label}</option>)}
                              </select>}
                              {linkedObj ? <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                                <div style={{fontSize:12,color:"#1e40af"}}>📍 {linkedObj.address||linkedObj.clientName||"объект"}{plan>0&&<span style={{color:"#64748b"}}> · смета (план): <b>{fM(plan)} ₸</b></span>}</div>
                                <button onClick={()=>{ setFinProjModal(null); openObjectFromFinance(linkedObj); }} style={{background:"#2563eb",color:"#fff",border:"none",borderRadius:7,padding:"5px 12px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>↗ Открыть объект</button>
                              </div> : <div style={{fontSize:11,color:"#94a3b8"}}>Объект с таким № договора не найден. Введите № вручную или выберите выше.</div>}
                            </div>;
                          })()}
                          <div style={{display:"grid",gap:11}}>
                            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                              <div><div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>№ договора *</div><input className="fi" value={mp.contractNo} onChange={e=>setp("contractNo",e.target.value)} placeholder="0918#1002"/></div>
                              <div><div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Заказчик</div>
                                <select className="fi" value={mp.client||"Физ лицо"} onChange={e=>setp("client",e.target.value)}>
                                  {["Физ лицо","Юр лицо"].map(c=><option key={c} value={c}>{c}</option>)}
                                </select>
                              </div>
                            </div>
                            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                              <div><div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Категория</div>
                                <select className="fi" value={mp.category||""} onChange={e=>setp("category",e.target.value)}>
                                  <option value="">— не указана —</option>
                                  {["Вторичка","Коммерческие объекты","Частичные работы, услуги","Новостройки","Другое"].map(c=><option key={c} value={c}>{c}</option>)}
                                </select>
                              </div>
                              <div><div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Статус</div>
                                <select className="fi" value={mp.rawStatus||mp.status||"в работе"} onChange={e=>{ const raw=e.target.value; const mapped={выполнен:"выполнен",отменен:"отменен","в работе":"активен",новый:"активен"}; setp("rawStatus",raw); setp("status",mapped[raw]||"активен"); }}>
                                  {["в работе","новый","выполнен","отменен"].map(s=><option key={s} value={s}>{s}</option>)}
                                </select>
                              </div>
                            </div>
                            <div><div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Описание работ</div><input className="fi" value={mp.description||""} onChange={e=>setp("description",e.target.value)}/></div>
                            <div><div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Стоимость проекта, ₸</div><input type="number" className="fi" value={mp.budget||0} onChange={e=>setp("budget",e.target.value)}/></div>
                            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10}}>
                              <div><div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Дата продажи</div><input type="date" className="fi" value={mp.createdAt||""} onChange={e=>setp("createdAt",e.target.value)}/></div>
                              <div><div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Дата начала работ</div><input type="date" className="fi" value={mp.startDate||""} onChange={e=>setp("startDate",e.target.value)}/></div>
                              <div><div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Дата закрытия</div><input type="date" className="fi" value={mp.closedAt||""} onChange={e=>setp("closedAt",e.target.value)}/></div>
                            </div>
                            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10}}>
                              {[["b24","B24 внесён?"],["contractSigned","Договор заключён?"],["avr","АВР?"]].map(([k,l])=>(
                                <div key={k}><div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>{l}</div>
                                  <select className="fi" value={mp[k]||"нет"} onChange={e=>setp(k,e.target.value)}>
                                    <option value="да">да</option><option value="нет">нет</option>
                                  </select>
                                </div>
                              ))}
                            </div>
                            <div><div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Комментарий</div><input className="fi" value={mp.comment||""} onChange={e=>setp("comment",e.target.value)}/></div>
                          </div>
                          <div style={{display:"flex",gap:8,marginTop:18}}>
                            {mp.id && <button onClick={delp} style={{background:"#fef2f2",color:"#dc2626",border:"1px solid #fecaca",borderRadius:9,padding:"10px 16px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Удалить</button>}
                            <div style={{flex:1}}/>
                            <button onClick={()=>setFinProjModal(null)} style={{background:"#fff",color:"#64748b",border:"1px solid #e2e8f0",borderRadius:9,padding:"10px 18px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Отмена</button>
                            <button onClick={savep} style={{background:"#059669",color:"#fff",border:"none",borderRadius:9,padding:"10px 22px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Сохранить</button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })()}

            {/* ───── СПРАВОЧНИК ───── */}
            {financeTab==="ref" && (()=>{
              const meta = financeMeta;
              const upd = (m)=>saveFinanceMeta(m);
              return (
                <div style={{display:"grid",gap:18}}>
                  {/* Счета */}
                  <div className="card" style={{padding:"18px 20px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                      <div style={{fontSize:14,fontWeight:800,color:"#0f172a"}}>💳 Счета</div>
                      <button onClick={()=>upd({...meta,accounts:[...meta.accounts,{id:genId(),name:"Новый счёт",opening:0,accType:"bank"}]})} style={{background:"#eff6ff",color:"#2563eb",border:"1px solid #bfdbfe",borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>+ Счёт</button>
                    </div>
                    {meta.accounts.map((a,i)=>(
                      <div key={a.id} style={{display:"flex",gap:8,alignItems:"center",marginBottom:8,flexWrap:"wrap"}}>
                        <input className="fi" style={{flex:"1 1 140px"}} value={a.name} onChange={e=>{const acc=[...meta.accounts];acc[i]={...a,name:e.target.value};upd({...meta,accounts:acc});}}/>
                        <select className="fi" style={{width:"auto",minWidth:130}} value={a.accType||"bank"} onChange={e=>{const acc=[...meta.accounts];acc[i]={...a,accType:e.target.value};upd({...meta,accounts:acc});}}>
                          {[["cash","Наличные"],["bank","Безналичные"],["card","Карта физлица"],["ewallet","Электронный"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}
                        </select>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span style={{fontSize:11,color:"#94a3b8"}}>остаток на начало</span>
                          <input className="fi" type="number" style={{width:110}} value={a.opening} onChange={e=>{const acc=[...meta.accounts];acc[i]={...a,opening:Number(e.target.value)||0};upd({...meta,accounts:acc});}}/>
                        </div>
                        <button onClick={()=>{if(confirm("Удалить счёт «"+a.name+"»?")){upd({...meta,accounts:meta.accounts.filter(x=>x.id!==a.id)});}}} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:16}}>✕</button>
                      </div>
                    ))}
                  </div>
                  {/* Статьи баланса теперь полностью выводятся из операций — ручной ввод не нужен */}
                  <div className="card" style={{padding:"16px 20px",background:"#f0fdf4",border:"1px solid #bbf7d0"}}>
                    <div style={{fontSize:13,fontWeight:700,color:"#166534",marginBottom:6}}>✅ Баланс автоматически из операций</div>
                    <div style={{fontSize:12,color:"#15803d",lineHeight:1.6}}>
                      Все статьи баланса формируются из операций:<br/>
                      • <b>Основные средства</b> — расходы категории «Инвестиции (покупка активов)»<br/>
                      • <b>Займы выданные, залоги, запасы</b> — расходы категории «Выданные займы и прочие активы»<br/>
                      • <b>Займы полученные, кредиты, вклады</b> — доходы/расходы категории «Финансирование»<br/>
                      • <b>Денежные средства</b> — остатки по всем счетам<br/>
                      • <b>Дебиторка</b> — разница бюджета проектов и полученных оплат
                    </div>
                  </div>
                  {/* Категории доходов и расходов */}
                  {[["income","Доходы","#059669"],["expense","Расходы","#dc2626"]].map(([key,lbl,col])=>(
                    <div key={key} className="card" style={{padding:"18px 20px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                        <div style={{fontSize:14,fontWeight:800,color:col}}>{key==="income"?"📈":"📉"} Категории: {lbl}</div>
                        <button onClick={()=>upd({...meta,[key]:[...meta[key],{cat:"Новая категория",subs:[]}]})} style={{background:col+"12",color:col,border:"1px solid "+col+"33",borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>+ Категория</button>
                      </div>
                      {meta[key].map((c,ci)=>(
                        <div key={ci} style={{marginBottom:14,paddingBottom:12,borderBottom:"1px solid #f1f5f9"}}>
                          <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}>
                            <input className="fi" style={{flex:1,fontWeight:700}} value={c.cat} onChange={e=>{const arr=[...meta[key]];arr[ci]={...c,cat:e.target.value};upd({...meta,[key]:arr});}}/>
                            <button onClick={()=>{const arr=[...meta[key]];arr[ci]={...c,subs:[...(c.subs||[]),"Новая подкатегория"]};upd({...meta,[key]:arr});}} style={{background:"#f1f5f9",border:"none",borderRadius:7,padding:"6px 10px",fontSize:11,cursor:"pointer",fontFamily:"inherit",color:"#475569",whiteSpace:"nowrap"}}>+ подкат.</button>
                            <button onClick={()=>{if(confirm("Удалить категорию «"+c.cat+"»?")){const arr=meta[key].filter((_,x)=>x!==ci);upd({...meta,[key]:arr});}}} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:15}}>✕</button>
                          </div>
                          <div style={{paddingLeft:14,display:"flex",flexDirection:"column",gap:5}}>
                            {(c.subs||[]).map((s,si)=>(
                              <div key={si} style={{display:"flex",gap:6,alignItems:"center"}}>
                                <span style={{color:"#cbd5e1"}}>•</span>
                                <input className="fi" style={{flex:1,fontSize:12,padding:"5px 9px"}} value={s} onChange={e=>{const arr=[...meta[key]];const subs=[...c.subs];subs[si]=e.target.value;arr[ci]={...c,subs};upd({...meta,[key]:arr});}}/>
                                <button onClick={()=>{const arr=[...meta[key]];arr[ci]={...c,subs:c.subs.filter((_,x)=>x!==si)};upd({...meta,[key]:arr});}} style={{background:"none",border:"none",color:"#cbd5e1",cursor:"pointer",fontSize:13}}>✕</button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                  {/* Импорт / экспорт */}
                  <div className="card" style={{padding:"18px 20px"}}>
                    <div style={{fontSize:14,fontWeight:800,color:"#0f172a",marginBottom:6}}>📥 Импорт / экспорт данных</div>
                    <div style={{fontSize:12,color:"#94a3b8",marginBottom:14}}>Импорт перезапишет операции, проекты и справочник. Файл JSON со структурой {`{meta, transactions, projects}`}.</div>
                    <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
                      <label style={{background:"#2563eb",color:"#fff",borderRadius:9,padding:"9px 16px",fontSize:13,fontWeight:700,cursor:finImportBusy?"wait":"pointer",fontFamily:"inherit",opacity:finImportBusy?.6:1}}>
                        {finImportBusy?"Импорт...":"📂 Импортировать JSON"}
                        <input type="file" accept=".json,application/json" style={{display:"none"}} disabled={finImportBusy}
                          onChange={async e=>{
                            const file=e.target.files?.[0]; if(!file) return; setFinImportBusy(true);
                            try {
                              const txt=await file.text(); const data=JSON.parse(txt);
                              if(data.meta && data.meta.accounts) await saveFinanceMeta(data.meta);
                              if(Array.isArray(data.transactions)){
                                const norm=data.transactions.map(t=>({...t,id:t.id||genId(),updatedAt:Date.now()}));
                                await saveFinanceTx(norm,{replace:false,allowEmpty:true});
                              }
                              if(Array.isArray(data.projects)){
                                const norm=data.projects.map(p=>({...p,id:p.id||genId()}));
                                await saveFinanceProjects(norm);
                              }
                              alert("Импортировано операций: "+(data.transactions?.length||0)+(data.projects?" | проектов: "+data.projects.length:""));
                            } catch(err){ alert("Ошибка импорта: "+err.message); }
                            setFinImportBusy(false); e.target.value="";
                          }}/>
                      </label>
                      <button onClick={()=>{
                        const data={meta:financeMeta,transactions:financeTx,projects:finProjects};
                        const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
                        const url=URL.createObjectURL(blob); const a=document.createElement("a");
                        a.href=url; a.download="titovstroy-finance-"+new Date().toISOString().slice(0,10)+".json";
                        document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(()=>URL.revokeObjectURL(url),5000);
                      }} style={{background:"#fff",color:"#475569",border:"1px solid #e2e8f0",borderRadius:9,padding:"9px 16px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>💾 Экспорт ({financeTx.length})</button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* ───── КОРЗИНА ОПЕРАЦИЙ ───── */}
            {finTxTrash && (
              <div onClick={()=>setFinTxTrash(false)} style={{position:"fixed",inset:0,background:"rgba(15,23,42,.55)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
                <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,padding:"22px 24px",width:"100%",maxWidth:520,maxHeight:"85vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,.3)"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                    <h3 style={{margin:0,fontSize:16,fontWeight:800,color:"#0f172a"}}>🗑 Корзина операций</h3>
                    <button onClick={()=>setFinTxTrash(false)} style={{background:"none",border:"none",fontSize:20,color:"#94a3b8",cursor:"pointer"}}>✕</button>
                  </div>
                  {financeTx.filter(t=>t.deletedAt).sort((a,b)=>b.deletedAt-a.deletedAt).map(t=>{
                    const TYPE_COLOR={income:"#059669",expense:"#dc2626",transfer:"#7c3aed"};
                    const TYPE_LABEL={income:"Доход",expense:"Расход",transfer:"Перевод"};
                    const daysLeft=Math.max(0,Math.ceil((30*864e5-(Date.now()-(t.deletedAt||0)))/864e5));
                    return (
                      <div key={t.id} style={{borderBottom:"1px solid #f1f5f9",padding:"12px 0",display:"flex",alignItems:"center",gap:12}}>
                        <span style={{width:8,height:8,borderRadius:"50%",background:TYPE_COLOR[t.type]||"#94a3b8",flexShrink:0}}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:600,color:"#0f172a"}}>{TYPE_LABEL[t.type]} · {new Intl.NumberFormat("ru-RU").format(Math.round(Number(t.amount)||0))} ₸</div>
                          <div style={{fontSize:11,color:"#94a3b8"}}>{t.category||""}{t.note?" · "+t.note:""} · {new Date(t.date||t.createdAt||0).toLocaleDateString("ru-RU")}</div>
                          <div style={{fontSize:11,color:daysLeft<=3?"#dc2626":"#f59e0b",fontWeight:600}}>осталось {daysLeft} дн.</div>
                        </div>
                        <button onClick={async()=>{await saveFinanceTx([{...t,deletedAt:undefined,updatedAt:Date.now()}],{replace:false}); }}
                          style={{background:"#f0fdf4",color:"#059669",border:"1px solid #bbf7d0",borderRadius:7,padding:"5px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>↩</button>
                        <button onClick={async()=>{if(confirm("Удалить безвозвратно?")) await saveFinanceTx([],{replace:false,removedIds:[t.id],allowEmpty:true}); }}
                          style={{background:"rgba(220,38,38,.1)",color:"#dc2626",border:"1px solid rgba(220,38,38,.2)",borderRadius:7,padding:"5px 10px",fontSize:12,cursor:"pointer"}}>✕</button>
                      </div>
                    );
                  })}
                  {financeTx.filter(t=>t.deletedAt).length===0 && <div style={{textAlign:"center",color:"#94a3b8",padding:"30px 0"}}>Корзина пуста</div>}
                </div>
              </div>
            )}

            {/* ───── МОДАЛКА: операция ───── */}
            {finTxModal && (()=>{
              const m = finTxModal;
              const set = (k,v)=>setFinTxModal(p=>({...p,[k]:v}));
              const catSource = m.type==="income" ? financeMeta.income : m.type==="expense" ? financeMeta.expense : [];
              const subSource = catSource.find(c=>c.cat===m.category)?.subs || [];
              const save = ()=>{
                const amt=Number(m.amount)||0;
                if(amt<=0){ alert("Укажите сумму"); return; }
                if(m.type==="transfer" && m.account===m.accountTo){ alert("Счета должны отличаться"); return; }
                const ts=m.date?new Date(m.date).getTime():Date.now();
                const tx={ id:m.id||genId(), type:m.type, date:ts, amount:amt, account:m.account, accountTo:m.type==="transfer"?m.accountTo:undefined,
                  category:m.type==="transfer"?"Перевод":m.category, subcategory:m.type==="transfer"?"":m.subcategory, note:m.note||"", contractNo:m.contractNo||"",
                  recipient:m.recipient||"",
                  isAdvance:m.type==="income"?!!m.isAdvance:false,
                  included:m.included!==false, opuMonth:m.opuMonth, createdAt:m.createdAt||ts, updatedAt:Date.now() };
                const isNew = !m.id;
                setFinTxModal(null);
                // merge (replace:false) — не перезатираем облако: операции с других устройств не теряются
                saveFinanceTx([tx],{replace:false});
                writeAudit(currentUser, isNew?"создал операцию":"изменил операцию", "finance_tx", tx.id, `${tx.type} ${Math.round(tx.amount)} ₸ ${tx.category||""}`);
              };
              const del = ()=>{
                if(!m.id) return; if(!confirm("Переместить операцию в корзину?")) return;
                const ex=financeTxRef.current.find(x=>x.id===m.id); if(!ex){ setFinTxModal(null); return; }
                const deleted={...ex,deletedAt:Date.now(),updatedAt:Date.now()};
                setFinTxModal(null);
                saveFinanceTx([deleted],{replace:false});
                writeAudit(currentUser,"удалил операцию","finance_tx",m.id,`${m.type} ${Math.round(Number(m.amount)||0)} ₸`);
              };
              return (
                <div onClick={()=>{setFinCatOpen(false);setFinTxModal(null);}} style={{position:"fixed",inset:0,background:"rgba(15,23,42,.55)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
                  <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,padding:"22px 24px",width:"100%",maxWidth:440,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,.3)"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                      <h3 style={{margin:0,fontSize:17,fontWeight:800,color:"#0f172a"}}>{m.id?"Изменить":"Новая"} операция</h3>
                      <button onClick={()=>setFinTxModal(null)} style={{background:"none",border:"none",fontSize:20,color:"#94a3b8",cursor:"pointer"}}>✕</button>
                    </div>
                    {/* Тип */}
                    <div style={{display:"flex",gap:6,marginBottom:14}}>
                      {[["income","Доход","#059669"],["expense","Расход","#dc2626"],["transfer","Перевод","#7c3aed"]].map(([k,l,c])=>(
                        <button key={k} onClick={()=>set("type",k)} style={{flex:1,padding:"8px 0",borderRadius:9,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",border:"1px solid "+(m.type===k?c:"#e2e8f0"),background:m.type===k?c:"#fff",color:m.type===k?"#fff":"#94a3b8"}}>{l}</button>
                      ))}
                    </div>
                    <div style={{display:"grid",gap:12}}>
                      <div><div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Дата</div><input type="date" className="fi" value={m.date} onChange={e=>set("date",e.target.value)}/></div>
                      <div><div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Сумма, ₸</div><input type="number" className="fi" value={m.amount} onChange={e=>set("amount",e.target.value)} placeholder="0"/></div>
                      {m.type==="transfer" ? (<>
                        <div><div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Со счёта</div><select className="fi" value={m.account} onChange={e=>set("account",e.target.value)}>{financeMeta.accounts.map(a=><option key={a.id} value={a.name}>{a.name}</option>)}</select></div>
                        <div><div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>На счёт</div><select className="fi" value={m.accountTo} onChange={e=>set("accountTo",e.target.value)}>{financeMeta.accounts.map(a=><option key={a.id} value={a.name}>{a.name}</option>)}</select></div>
                      </>) : (<>
                        <div><div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Счёт</div><select className="fi" value={m.account} onChange={e=>set("account",e.target.value)}>{financeMeta.accounts.map(a=><option key={a.id} value={a.name}>{a.name}</option>)}</select></div>
                        {(()=>{
                          const q = finCatSearch.toLowerCase();
                          // строим плоский список с заголовками категорий
                          const rows = [];
                          for (const grp of catSource) {
                            const matchedSubs = grp.subs.filter(s => !q || s.toLowerCase().includes(q) || grp.cat.toLowerCase().includes(q));
                            if (!matchedSubs.length && q && !grp.cat.toLowerCase().includes(q)) continue;
                            rows.push({ kind:"header", cat:grp.cat });
                            for (const s of matchedSubs) rows.push({ kind:"sub", cat:grp.cat, sub:s });
                          }
                          const selectItem = (cat, sub) => {
                            set("category", cat);
                            set("subcategory", sub||"");
                            setFinCatSearch(sub||cat);
                            setFinCatOpen(false);
                          };
                          const displayVal = finCatSearch;
                          return (
                            <div style={{position:"relative"}} onClick={e=>e.stopPropagation()}>
                              <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Статья</div>
                              <div style={{position:"relative",display:"flex",alignItems:"center"}}>
                                <input className="fi" style={{paddingRight:28}} value={displayVal}
                                  onFocus={()=>setFinCatOpen(true)}
                                  onBlur={()=>setTimeout(()=>setFinCatOpen(false),180)}
                                  onChange={e=>{ setFinCatSearch(e.target.value); setFinCatOpen(true); set("category",e.target.value); set("subcategory",""); }}
                                  placeholder="— начните вводить или выберите —"/>
                                {displayVal && <span onMouseDown={e=>{e.preventDefault();setFinCatSearch("");set("category","");set("subcategory","");setFinCatOpen(false);}} style={{position:"absolute",right:8,cursor:"pointer",color:"#94a3b8",fontSize:14,lineHeight:1}}>✕</span>}
                              </div>
                              {finCatOpen && rows.length>0 && (
                                <div style={{position:"absolute",zIndex:999,top:"100%",left:0,right:0,background:"#fff",border:"1px solid #e2e8f0",borderRadius:10,boxShadow:"0 8px 24px rgba(0,0,0,.13)",maxHeight:260,overflowY:"auto",marginTop:2}}>
                                  {rows.map((r,i)=> r.kind==="header"
                                    ? <div key={i} style={{padding:"8px 14px 4px",fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:.5,background:"#f8fafc",borderBottom:"1px solid #f1f5f9",position:"sticky",top:0}}>{r.cat}</div>
                                    : <div key={i} onMouseDown={e=>{e.preventDefault();selectItem(r.cat,r.sub);}}
                                        style={{padding:"8px 14px 8px 24px",fontSize:13,color:"#0f172a",cursor:"pointer",transition:"background .1s",background: m.subcategory===r.sub&&m.category===r.cat ? "#eff6ff" : "transparent"}}
                                        onMouseEnter={e=>e.currentTarget.style.background="#f1f5f9"}
                                        onMouseLeave={e=>e.currentTarget.style.background=m.subcategory===r.sub&&m.category===r.cat?"#eff6ff":"transparent"}
                                      >{r.sub}</div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </>)}
                      {(()=>{
                        const pq = finTxProjSearch.toLowerCase();
                        const projRows = finProjects.filter(p=>!pq || (p.contractNo||"").toLowerCase().includes(pq) || (p.description||"").toLowerCase().includes(pq) || (p.comment||"").toLowerCase().includes(pq));
                        return (
                          <div style={{position:"relative"}} onClick={e=>e.stopPropagation()}>
                            <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Проект / № договора</div>
                            <div style={{position:"relative",display:"flex",alignItems:"center"}}>
                              <input className="fi" style={{paddingRight:28}} value={finTxProjSearch}
                                onFocus={()=>setFinTxProjOpen(true)}
                                onBlur={()=>setTimeout(()=>setFinTxProjOpen(false),180)}
                                onChange={e=>{ setFinTxProjSearch(e.target.value); setFinTxProjOpen(true); set("contractNo",e.target.value); }}
                                placeholder="— без проекта —"/>
                              {finTxProjSearch && <span onMouseDown={e=>{e.preventDefault();setFinTxProjSearch("");set("contractNo","");setFinTxProjOpen(false);}} style={{position:"absolute",right:8,cursor:"pointer",color:"#94a3b8",fontSize:14,lineHeight:1}}>✕</span>}
                            </div>
                            {finTxProjOpen && (
                              <div style={{position:"absolute",zIndex:999,top:"100%",left:0,right:0,background:"#fff",border:"1px solid #e2e8f0",borderRadius:10,boxShadow:"0 8px 24px rgba(0,0,0,.13)",maxHeight:220,overflowY:"auto",marginTop:2}}>
                                <div onMouseDown={e=>{e.preventDefault();setFinTxProjSearch("");set("contractNo","");setFinTxProjOpen(false);}} style={{padding:"9px 14px",fontSize:12,color:"#94a3b8",cursor:"pointer",borderBottom:"1px solid #f1f5f9"}}
                                  onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"} onMouseLeave={e=>e.currentTarget.style.background=""}>— без проекта —</div>
                                {projRows.map((p,i)=>(
                                  <div key={i} onMouseDown={e=>{e.preventDefault();setFinTxProjSearch(p.contractNo||"");set("contractNo",p.contractNo||"");setFinTxProjOpen(false);}}
                                    style={{padding:"9px 14px",fontSize:13,color:"#0f172a",cursor:"pointer",background:m.contractNo===p.contractNo?"#eff6ff":"transparent",borderBottom:"1px solid #f8fafc"}}
                                    onMouseEnter={e=>e.currentTarget.style.background="#f1f5f9"} onMouseLeave={e=>e.currentTarget.style.background=m.contractNo===p.contractNo?"#eff6ff":"transparent"}>
                                    <span style={{fontWeight:700}}>{p.contractNo}</span>
                                    {p.description&&<span style={{color:"#64748b",marginLeft:6,fontSize:12}}>{p.description.slice(0,50)}</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      {m.subcategory==="Дивиденды учредителям" && (
                        <div>
                          <div style={{fontSize:11,color:"#d97706",marginBottom:4,fontWeight:700}}>👤 Получатель (учредитель)</div>
                          <input className="fi" value={m.recipient||""} onChange={e=>set("recipient",e.target.value)} placeholder="Имя учредителя"/>
                        </div>
                      )}
                      <div><div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Комментарий</div><input className="fi" value={m.note} onChange={e=>set("note",e.target.value)} placeholder="комментарий"/></div>
                      {m.type==="income" && (
                        <label style={{display:"flex",alignItems:"flex-start",gap:8,fontSize:12,color:"#475569",cursor:"pointer",fontWeight:600,background:"#fffbeb",border:"1px solid #fde68a",borderRadius:9,padding:"9px 11px"}}>
                          <input type="checkbox" checked={!!m.isAdvance} onChange={e=>set("isAdvance",e.target.checked)} style={{width:16,height:16,cursor:"pointer",marginTop:1}}/>
                          <span>Аванс (предоплата) — <b>обязательство, не выручка</b>. Учтётся в ДДС как приход, но в ОПиУ не попадёт в доход. Снимите галочку, когда работа сдана.</span>
                        </label>
                      )}
                      <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"#475569",cursor:"pointer",fontWeight:600}}>
                        <input type="checkbox" checked={m.included!==false} onChange={e=>set("included",e.target.checked)} style={{width:16,height:16,cursor:"pointer"}}/>
                        Учитывать в балансе и отчётах
                      </label>
                    </div>
                    <div style={{display:"flex",gap:8,marginTop:18,flexWrap:"wrap"}}>
                      {m.id && <button onClick={del} style={{background:"#fef2f2",color:"#dc2626",border:"1px solid #fecaca",borderRadius:9,padding:"10px 16px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>🗑</button>}
                      {m.id && <button onClick={()=>{ const copy={...m,id:null,createdAt:undefined,updatedAt:undefined,date:new Date().toISOString().slice(0,10)}; setFinCatSearch(copy.subcategory||copy.category||""); setFinTxProjSearch(copy.contractNo||""); setFinTxModal(copy); }} style={{background:"#f8fafc",color:"#475569",border:"1px solid #e2e8f0",borderRadius:9,padding:"10px 16px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>📋 Копия</button>}
                      <div style={{flex:1}}/>
                      <button onClick={()=>setFinTxModal(null)} style={{background:"#fff",color:"#64748b",border:"1px solid #e2e8f0",borderRadius:9,padding:"10px 18px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Отмена</button>
                      <button onClick={save} style={{background:"#2563eb",color:"#fff",border:"none",borderRadius:9,padding:"10px 22px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Сохранить</button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })()}

      {/* ── ТЕСТ: СДЕЛКИ (смета+договор в одной карточке) ── */}
      {effScreen === "objects" && (()=>{
        // Данные клиента берём прямо из объекта (inline-поля)
        const objProj = (obj) => ({
          ...EMPTY_PROJ,
          name: obj.clientName || "",
          phone: obj.clientPhone || "",
          address: obj.address || "",
          type: obj.objType || "Вторичка",
          area: obj.area || "",
          manager: obj.manager || currentUser.name,
        });
        // Авто-синхронизация скрытой записи клиента (нужна договорам/PDF). Возвращает clientId.
        const ensureObjClient = async (obj) => {
          const isYur = obj.clientType==="юр";
          const cdata = { name: obj.clientName||"", phone: obj.clientPhone||"", address: obj.address||"", iin: obj.clientIin||"", doc: obj.clientDoc||"", type: obj.clientType||"физ",
            ...(isYur ? { director: obj.clientDirector||"", directorShort: obj.clientDirectorShort||"", bank: obj.clientBank||"", bik: obj.clientBik||"", account: obj.clientAccount||"", email: obj.clientEmail||"" } : {}) };
          let clientId = obj.clientId;
          const list = clientsRef.current;
          if (clientId && list.find(c=>c.id===clientId)) {
            await saveContractClients(list.map(c=>c.id===clientId?{...c,...cdata}:c));
          } else {
            clientId = Date.now().toString();
            await saveContractClients([...list, { id:clientId, ...cdata, createdAt:Date.now(), createdById:currentUser.id, _fromObject:obj.id }]);
            const updObj = {...obj, clientId, updatedAt:Date.now()};
            await saveObjects(objectsRef.current.map(x=>x.id===obj.id?updObj:x));
            setCurrentObject(updObj);
          }
          return clientId;
        };

        // Конвертация строк сметы в позиции договора (как кнопка 📄 в разделе Сметы)
        const estToContractWorks = (est) => {
          const catalog = getEffectiveCatalog();
          const mm = 1 + (est.markup||0)/100;
          return Object.entries(est.rows||{}).filter(([,r])=>Number(r?.qty)>0).map(([key,r])=>{
            const w = catalog.find(x=>x.name===key)||catalog.find(x=>x.code===key);
            if(!w) return null;
            const qty = Number(r.qty||0);
            const cpxPct = r.cpxPct !== undefined ? Number(r.cpxPct) : undefined;
            const rawPrice = r.manualPrice !== undefined && r.manualPrice !== "" ? Number(r.manualPrice) : getPrice(w, qty, r.complexity||"std", cpxPct);
            const price = rawPrice ? rawPrice * mm : null;
            const ew = getEffectiveWork(w);
            const pf = (!price && ew.priceFrom) ? Math.round(ew.priceFrom * mm) : null;
            const displayName = r.manualName !== undefined ? r.manualName : w.name;
            const displayUnit = r.manualUnit !== undefined ? r.manualUnit : (w.unit||"м²");
            return {name:displayName,category:w.cat||"",subcategory:w.sub||"",quantity:qty,unit:displayUnit,price:price?Math.round(price):0,priceFrom:pf||undefined};
          }).filter(Boolean);
        };
        // ── Вспомогательные функции для workspace ──
        const openObjectEstimate = (obj) => {
          const id = genId();
          const cats2 = Object.keys(Gdyn);
          const newEst = {
            id,
            objectId: obj.id,
            proj: objProj(obj),
            rows: {}, discount: 0, markup: 0, note: "", status: "new", comment: "",
            createdAt: Date.now(), createdBy: currentUser.name, updatedAt: Date.now(), updatedBy: currentUser.name, total: 0,
          };
          const newList = [newEst, ...estimatesRef.current];
          estimatesRef.current = newList;
          setEstimates(newList);
          saveEstimates(newList);
          setObjectReturnId(obj.id);
          setCurrentObjectId(obj.id);
          setCurrentParentId(null);
          setCurrentDsNumber(null);
          setCurrentId(id);
          setProj(newEst.proj);
          setRows({});
          setDiscount(0);
          setMarkup(0);
          setNote("");
          setEstStatus("new");
          setEstSentAt("");
          setEstComment("");
          setSearch("");
          setActiveCat(cats2[0]);
          setActiveSub(Object.keys(Gdyn[cats2[0]]||{})[0]);
          setScreen("editor");
        };

        const openObjectEstimateEdit = (est, obj) => {
          setObjectReturnId(obj.id);
          setCurrentObjectId(obj.id);
          const _validParent = est.parentId && est.parentId!==est.id ? est.parentId : null;
          setCurrentParentId(_validParent);
          setCurrentDsNumber(_validParent ? (est.dsNumber||null) : null);
          setCurrentId(est.id);
          // proj синхронизируем из объекта (клиент/адрес ведутся в объекте)
          setProj({...(est.proj||EMPTY_PROJ), ...objProj(obj)});
          setRows(est.rows||{});
          setDiscount(est.discount||0);
          setMarkup(est.markup||0);
          setNote(est.note||"");
          setEstStatus(est.status||"new");
          setEstSentAt(est.sentAt||"");
          setEstComment(est.comment||"");
          setSearch("");
          const cats2 = Object.keys(Gdyn);
          setActiveCat(cats2[0]);
          setActiveSub(Object.keys(Gdyn[cats2[0]]||{})[0]);
          setScreen("editor");
        };

        const openObjectContract = async (obj, fromEst=null) => {
          const clientId = await ensureObjClient(obj);
          const works = fromEst ? estToContractWorks(fromEst) : [];
          const isDs = !!(fromEst && fromEst.parentId && fromEst.parentId!==fromEst.id);
          const siblings = fromEst ? estimatesRef.current.filter(e=>e.parentId===fromEst.parentId) : [];
          const annexNum = isDs ? (fromEst.dsNumber||1)+1 : 1;
          const parentContract = isDs ? contractsRef.current.find(c=>c.estId===fromEst.parentId && (c.type||"repair_fiz")!=="annex") : null;
          const newC = {
            id: Date.now().toString(),
            objectId: obj.id,
            number: fromEst && !isDs ? nextContractNumber() : (isDs ? "" : nextContractNumber()),
            date: new Date().toISOString().split("T")[0],
            clientId,
            estClient: obj.clientName||"",
            estPhone: obj.clientPhone||"",
            estAddress: obj.address||"",
            contragentId: contragents[0]?.id||"",
            works,
            discount: fromEst?.discount||0,
            appendix: annexNum,
            estId: fromEst?.id||"",
            note: "",
            type: isDs ? "annex" : "repair_fiz",
            ...(isDs && parentContract ? {mainNumber: parentContract.number||"", mainDate: parentContract.date||""} : {}),
            createdBy: currentUser.name,
            createdById: currentUser.id,
          };
          setCurrentContract(newC);
          setObjectReturnId(obj.id);
          setContractTab("editor");
          setScreen("contracts");
        };

        const saveObjField = async (obj, patch) => {
          const updated = {...obj, ...patch, updatedAt: Date.now()};
          const list = objectsRef.current.map(x=>x.id===obj.id?updated:x);
          await saveObjects(list);
          setCurrentObject(updated);
          // При подписании договора (статус «Заключён») автоматически заводим
          // проект в Финансах — объект становится «в работе» и появляется в Производстве.
          if (patch.status === "signed") {
            const cur = finProjectsRef.current;
            const exists = cur.some(p => p.objectId === obj.id
              || (p.contractNo && contractsRef.current.some(c => c.objectId === obj.id && normCN(c.number) === normCN(p.contractNo))));
            if (!exists) {
              const contract = contractsRef.current.find(c => c.objectId === obj.id) || null;
              const estTotal = estimates.filter(e => e.objectId === obj.id).reduce((s, e) => s + (Number(e.total) || 0), 0);
              const draft = finProjDraftFromObject(updated, contract);
              const proj = { ...draft, id: genId(), budget: draft.budget || estTotal || 0, status: "новый", rawStatus: "новый" };
              await saveFinanceProjects([...cur, proj]);
            }
            // Авто-создать карточку производства со статусом «новый»
            const hasProd = productionsRef.current.some(p => p.objectId === obj.id);
            if (!hasProd) {
              const prod = emptyProduction(obj.id, genId);
              prod.prodStatus = "new";
              await saveProductions([...productionsRef.current, prod], { replace: true });
            }
          }
        };

        return (
        <div className="page" style={{maxWidth:960,minHeight:"100vh"}}>
          {/* Шапка */}
          <div className="hero" style={{background:"linear-gradient(135deg,#0f172a 0%,#1e293b 70%,#283549 100%)",borderRadius:16,padding:"22px 26px",marginBottom:20,position:"relative",overflow:"hidden",boxShadow:"0 4px 20px rgba(15,23,42,.3)"}}>
            <div style={{position:"absolute",top:-30,right:-30,width:160,height:160,borderRadius:"50%",background:"rgba(59,130,246,.08)"}}/>
            <div style={{position:"relative",zIndex:1,display:"flex",alignItems:"center",gap:13,flexWrap:"wrap"}}>
              {objectTab==="workspace" && (
                <button onClick={()=>{ setObjectTab("list"); setCurrentObject(null); }} style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:22,lineHeight:1,padding:"0 4px"}}>←</button>
              )}
              <div style={{width:40,height:40,borderRadius:11,background:"linear-gradient(135deg,#3b82f6,#2563eb)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,boxShadow:"0 3px 12px rgba(37,99,235,.5)"}}>📦</div>
              <div style={{minWidth:0}}>
                <h1 style={{margin:0,fontSize:21,fontWeight:900,color:"#fff",lineHeight:1.1}}>{objectTab==="workspace" && currentObject ? (currentObject.clientName||"Новый объект") : "Объекты"}</h1>
                <div style={{fontSize:12,color:"rgba(255,255,255,.7)",marginTop:3}}>{objectTab==="workspace" ? "Карточка объекта · сметы и договора" : "Клиенты, сметы и договора"}</div>
              </div>
              <div style={{flex:1}}/>
              {objectTab==="list" && currentUser.role!=="viewer" && (<>
                {(()=>{const trashed=objectsRef.current.filter(o=>o.deletedAt); return trashed.length>0&&(<button onClick={()=>setObjectTab("trash")} style={{background:"rgba(220,38,38,.12)",color:"#dc2626",border:"1px solid rgba(220,38,38,.2)",borderRadius:8,padding:"7px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginRight:4}}>🗑 Корзина ({trashed.length})</button>);})()}
                <button className="btn btn-g" style={{fontSize:13,padding:"9px 16px"}} onClick={async ()=>{
                  const newObj = {id:genId(),clientId:"",clientName:"",clientPhone:"",clientType:"физ",clientIin:"",clientDoc:"",address:"",objType:"Вторичка",area:"",status:"new",note:"",manager:currentUser.name,createdBy:currentUser.name,createdById:currentUser.id,createdAt:Date.now(),updatedAt:Date.now()};
                  await saveObjects([newObj, ...objectsRef.current]);
                  writeAudit(currentUser,"создал объект","object",newObj.id,"Новый объект");
                  setCurrentObject(newObj);
                  setObjectTab("workspace");
                }}>+ Новый объект</button>
              </>)}
            </div>
          </div>

          {/* Список объектов */}
          {objectTab==="list" && (
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {/* Поиск + сортировка + экспорт */}
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <input value={objectSearch} onChange={e=>setObjectSearch(e.target.value)} placeholder="🔍 Поиск по клиенту, телефону, адресу..."
                  style={{border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontSize:13,flex:1,minWidth:200,boxSizing:"border-box",outline:"none",fontFamily:"inherit"}}/>
                <label style={{display:"flex",alignItems:"center",gap:4,border:"1px solid #e2e8f0",borderRadius:8,padding:"0 6px 0 9px",fontSize:11,fontWeight:600,color:"#94a3b8",background:"#fff",whiteSpace:"nowrap",flexShrink:0,fontFamily:"inherit"}} title="Дата от">с
                  <input type="date" value={objectDateFrom} onChange={e=>setObjectDateFrom(e.target.value)}
                    style={{border:"none",padding:"8px 0",fontSize:12,outline:"none",fontFamily:"inherit",background:"transparent",color:objectDateFrom?"#0f172a":"#94a3b8"}}/></label>
                <label style={{display:"flex",alignItems:"center",gap:4,border:"1px solid #e2e8f0",borderRadius:8,padding:"0 6px 0 9px",fontSize:11,fontWeight:600,color:"#94a3b8",background:"#fff",whiteSpace:"nowrap",flexShrink:0,fontFamily:"inherit"}} title="Дата до">по
                  <input type="date" value={objectDateTo} onChange={e=>setObjectDateTo(e.target.value)}
                    style={{border:"none",padding:"8px 0",fontSize:12,outline:"none",fontFamily:"inherit",background:"transparent",color:objectDateTo?"#0f172a":"#94a3b8"}}/></label>
                {(objectDateFrom||objectDateTo) && <button onClick={()=>{setObjectDateFrom("");setObjectDateTo("");}} style={{background:"none",border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 10px",fontSize:12,cursor:"pointer",color:"#94a3b8",fontFamily:"inherit"}}>✕ дата</button>}
                <button onClick={()=>downloadCSV(
                  "objects_"+new Date().toISOString().slice(0,10)+".csv",
                  ["Статус","Клиент","Телефон","Адрес","Тип","Площадь","Менеджер","Дата создания","Смет (шт)","Сумма смет","Договоров"],
                  filteredObjects.map(o=>{
                    const ests=estimates.filter(e=>e.objectId===o.id);
                    const cons=contracts.filter(c=>c.objectId===o.id);
                    const st=DEAL_STATUSES.find(s=>s.key===(o.status||"new"))||DEAL_STATUSES[0];
                    return [st.label,o.clientName||"",o.clientPhone||"",o.address||"",o.objType||"",o.area||"",o.manager||"",o.createdAt?new Date(o.createdAt).toLocaleDateString("ru-RU"):"",ests.length,Math.round(ests.reduce((s,e)=>s+(e.total||0),0)),cons.length];
                  })
                )} title="Экспорт в Excel" style={{background:"#eff6ff",color:"#2563eb",border:"1px solid #bfdbfe",borderRadius:8,padding:"8px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",flexShrink:0}}>⬇ Excel</button>
                <button onClick={()=>setObjectDateSort(v=>v==="new"?"old":"new")}
                  title={objectDateSort==="new"?"Сначала новые (нажмите для старых)":"Сначала старые (нажмите для новых)"}
                  style={{display:"flex",alignItems:"center",gap:5,border:"1px solid #e2e8f0",background:"#fff",borderRadius:8,padding:"8px 11px",fontSize:12,fontWeight:600,color:"#475569",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",flexShrink:0}}>
                  <span style={{fontSize:10,color:"#94a3b8"}}>дата</span>
                  <span style={{fontSize:13,color:"#2563eb"}}>{objectDateSort==="new"?"↓":"↑"}</span>
                </button>
              </div>
              {/* Фильтр по статусу */}
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                <button onClick={()=>setObjectFilterStatus("")}
                  style={{background:!objectFilterStatus?"#2563eb":"rgba(0,0,0,.03)",color:!objectFilterStatus?"#fff":"#94a3b8",border:`1px solid ${!objectFilterStatus?"#2563eb":"#e2e8f0"}`,borderRadius:8,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Все ({objects.length})</button>
                {DEAL_STATUSES.map(s=>{
                  const cnt = objects.filter(o=>(o.status||"new")===s.key).length;
                  if(!cnt && objectFilterStatus!==s.key) return null;
                  return (
                    <button key={s.key} onClick={()=>setObjectFilterStatus(v=>v===s.key?"":s.key)}
                      style={{background:objectFilterStatus===s.key?s.bg:"rgba(0,0,0,.03)",color:objectFilterStatus===s.key?s.color:"#94a3b8",border:`1px solid ${objectFilterStatus===s.key?s.color:"#e2e8f0"}`,borderRadius:8,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                      {s.label} {cnt>0&&<span style={{opacity:.6}}>({cnt})</span>}
                    </button>
                  );
                })}
              </div>
              {/* Фильтр по типу объекта */}
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {["","Вторичка","Новостройка","Коммерция"].map(t=>(
                  <button key={t||"all"} onClick={()=>setObjectFilterType(t)}
                    style={{background:objectFilterType===t?"#eff6ff":"rgba(0,0,0,.03)",color:objectFilterType===t?"#2563eb":"#94a3b8",border:`1px solid ${objectFilterType===t?"rgba(37,99,235,.4)":"#e2e8f0"}`,borderRadius:8,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                    {t||"Все типы"}
                  </button>
                ))}
              </div>
              {/* Фильтр по сотруднику */}
              {nonViewerUsers.length>1 && (
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  <button onClick={()=>setObjectFilterManager("")}
                    style={{background:!objectFilterManager?"#eff6ff":"rgba(0,0,0,.03)",color:!objectFilterManager?"#2563eb":"#94a3b8",border:`1px solid ${!objectFilterManager?"rgba(37,99,235,.4)":"#e2e8f0"}`,borderRadius:8,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Все сотрудники</button>
                  {nonViewerUsers.map(u=>(
                    <button key={u.id} onClick={()=>setObjectFilterManager(v=>v===u.name?"":u.name)}
                      style={{background:objectFilterManager===u.name?"#eff6ff":"rgba(0,0,0,.03)",color:objectFilterManager===u.name?"#2563eb":"#94a3b8",border:`1px solid ${objectFilterManager===u.name?"rgba(37,99,235,.4)":"#e2e8f0"}`,borderRadius:8,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                      👤 {u.name}
                    </button>
                  ))}
                </div>
              )}

              {objects.length===0 && (
                <div style={{textAlign:"center",padding:"60px 0",color:"#94a3b8"}}>
                  <div style={{fontSize:48,marginBottom:12}}>📦</div>
                  <div style={{fontWeight:700,marginBottom:6}}>Объектов пока нет</div>
                  <div style={{fontSize:12}}>Каждый объект — это папка с клиентом, сметами и договорами</div>
                </div>
              )}

              {filteredObjects.map(obj=>{
                const st = DEAL_STATUSES.find(s=>s.key===(obj.status||"new"))||DEAL_STATUSES[0];
                const objEsts = estimates.filter(e=>e.objectId===obj.id);
                const objCons = contracts.filter(c=>c.objectId===obj.id);
                // сумма объекта = все сметы (основная + доп. сметы)
                const total = objEsts.reduce((s,e)=>s+(e.total||0),0);
                return (
                  <div key={obj.id} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,padding:"14px 18px",cursor:"pointer",transition:"all .15s"}}
                    onClick={()=>{ setCurrentObject({...obj}); setObjectTab("workspace"); }}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                      <div style={{minWidth:0,flex:1}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                          <span style={{fontWeight:700,fontSize:14,color:"#0f172a"}}>{obj.clientName||<span style={{color:"#94a3b8",fontStyle:"italic",fontWeight:400}}>Без клиента</span>}</span>
                          {obj.clientPhone&&<span style={{fontSize:12,color:"#64748b",fontWeight:500}}>📞 {obj.clientPhone}</span>}
                          <span style={{fontSize:10,fontWeight:700,color:st.color,background:st.bg,borderRadius:4,padding:"1px 7px",whiteSpace:"nowrap"}}>{st.label}</span>
                        </div>
                        <div style={{fontSize:12,color:"#94a3b8",marginTop:3}}>
                          {obj.objType||"Вторичка"}{obj.address?` · 📍 ${obj.address}`:""}
                          {obj.area?` · ${obj.area} м²`:""}
                        </div>
                        <div style={{fontSize:11,color:"#94a3b8",marginTop:3,display:"flex",gap:10,flexWrap:"wrap"}}>
                          {obj.createdAt&&<span>📅 {fmtDate(obj.createdAt)}</span>}
                          <span>📋 {objEsts.length} смет</span>
                          <span>📄 {objCons.length} договоров</span>
                          {obj.manager&&<span>👤 {obj.manager}</span>}
                        </div>
                      </div>
                      <div style={{textAlign:"right",flexShrink:0}}>
                        {total>0&&<div style={{fontWeight:800,fontSize:16,color:"#0f172a"}}>{fmt(total)} ₸</div>}
                        {(currentUser.role==="admin"||(currentUser.role==="user"&&obj.createdById===currentUser.id)) && (
                          <button onClick={e=>{e.stopPropagation(); if(window.confirm("Переместить объект в корзину?")){ saveObjects(objectsRef.current.map(x=>x.id===obj.id?{...x,deletedAt:Date.now()}:x)); writeAudit(currentUser,"удалил объект","object",obj.id,obj.clientName||obj.address||obj.objType||""); }}}
                            title="В корзину (можно восстановить)" style={{marginTop:6,background:"rgba(220,38,38,.08)",color:"#dc2626",border:"1px solid rgba(220,38,38,.1)",borderRadius:5,padding:"3px 9px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>🗑</button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Workspace объекта */}
          {objectTab==="trash" && (()=>{
            const trashed = objectsRef.current.filter(o=>o.deletedAt).sort((a,b)=>b.deletedAt-a.deletedAt);
            const KEEP_MS = 30*24*60*60*1000;
            return (
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
                  <button onClick={()=>setObjectTab("list")} style={{background:"none",border:"1px solid #e2e8f0",borderRadius:8,padding:"6px 14px",fontSize:13,cursor:"pointer",color:"#64748b",fontFamily:"inherit"}}>← Назад</button>
                  <span style={{fontSize:13,color:"#94a3b8"}}>Объекты в корзине · хранятся 30 дней</span>
                </div>
                {trashed.length===0 && <div style={{textAlign:"center",color:"#94a3b8",padding:"60px 0",fontSize:14}}>Корзина пуста</div>}
                {trashed.map(obj=>{
                  const daysLeft = Math.max(0,Math.ceil((KEEP_MS-(Date.now()-(obj.deletedAt||0)))/86400000));
                  return (
                    <div key={obj.id} style={{background:"#fff",border:"1px solid #fecaca",borderRadius:10,padding:"14px 18px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                      <div style={{flex:1,minWidth:160}}>
                        <div style={{fontWeight:700,fontSize:14,color:"#0f172a"}}>{obj.clientName||"Без имени"}</div>
                        <div style={{fontSize:12,color:"#94a3b8",marginTop:2}}>{obj.address||""} · удалён {new Date(obj.deletedAt||0).toLocaleDateString("ru-RU")}</div>
                        <div style={{fontSize:11,color:daysLeft<=5?"#dc2626":"#f59e0b",marginTop:2,fontWeight:600}}>{daysLeft>0?`Осталось ${daysLeft} дн. до окончательного удаления`:"Истёк срок хранения"}</div>
                      </div>
                      <div style={{display:"flex",gap:8}}>
                        <button onClick={()=>saveObjects(objectsRef.current.map(x=>x.id===obj.id?{...x,deletedAt:undefined}:x))}
                          style={{background:"#f0fdf4",color:"#059669",border:"1px solid #bbf7d0",borderRadius:8,padding:"7px 14px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>↩ Восстановить</button>
                        {currentUser.role==="admin" && <button onClick={()=>{if(confirm("Удалить безвозвратно?")) saveObjects(objectsRef.current.filter(x=>x.id!==obj.id),{removedIds:[obj.id],allowEmpty:true});}}
                          style={{background:"rgba(220,38,38,.1)",color:"#dc2626",border:"1px solid rgba(220,38,38,.2)",borderRadius:8,padding:"7px 12px",fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>✕ Удалить</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {objectTab==="workspace" && currentObject && (()=>{
            const obj = currentObject;
            const st = DEAL_STATUSES.find(s=>s.key===(obj.status||"new"))||DEAL_STATUSES[0];
            const _allEsts = estimates.filter(e=>e.objectId===obj.id);
            const _allCons = contracts.filter(c=>c.objectId===obj.id);
            // Дерево смет: основная смета → под ней доп. сметы (ДС). parentId===id (битая ссылка) трактуем как основную.
            const _estIsMain = (e) => !e.parentId || e.parentId===e.id;
            const _estMains = _allEsts.filter(_estIsMain).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
            const objEsts = [];
            _estMains.forEach(m=>{
              objEsts.push(m);
              _allEsts.filter(e=>!_estIsMain(e) && e.parentId===m.id).sort((a,b)=>(a.dsNumber||0)-(b.dsNumber||0)).forEach(ch=>objEsts.push(ch));
            });
            // осиротевшие ДС (родитель удалён) — показываем в конце
            _allEsts.filter(e=>!_estIsMain(e) && !_estMains.some(m=>m.id===e.parentId)).forEach(ch=>objEsts.push(ch));
            // Дерево договоров: основной договор → под ним доп. соглашения (приложения)
            const _conMains = _allCons.filter(c=>(c.type||"repair_fiz")!=="annex").sort((a,b)=>(b.id||0)-(a.id||0));
            const objCons = [];
            _conMains.forEach(m=>{
              objCons.push(m);
              _allCons.filter(c=>c.type==="annex" && c.mainNumber && c.mainNumber===m.number).sort((a,b)=>(a.appendix||0)-(b.appendix||0)).forEach(ch=>objCons.push(ch));
            });
            _allCons.filter(c=>c.type==="annex" && !(c.mainNumber && _conMains.some(m=>m.number===c.mainNumber))).forEach(ch=>objCons.push(ch));
            const canEdit = currentUser.role==="admin"||(currentUser.role==="user"&&obj.createdById===currentUser.id);
            // Текст печатаем локально (отзывчиво), сохраняем на blur. Синхронизируем скрытую запись клиента.
            const setObjLocal = (patch) => setCurrentObject(p=>({...p,...patch}));
            const persistObj = () => setCurrentObject(p=>{
              const isYurP = p.clientType==="юр";
              const cdata = { name:p.clientName||"", phone:p.clientPhone||"", address:p.address||"", iin:p.clientIin||"", doc:p.clientDoc||"", type:p.clientType||"физ",
                ...(isYurP ? { director:p.clientDirector||"", directorShort:p.clientDirectorShort||"", bank:p.clientBank||"", bik:p.clientBik||"", account:p.clientAccount||"", email:p.clientEmail||"" } : {}) };
              let clientId = p.clientId;
              const cl = clientId && clientsRef.current.find(c=>c.id===clientId);
              if (cl) {
                // обновляем связанную запись клиента
                saveContractClients(clientsRef.current.map(c=>c.id===clientId?{...c,...cdata}:c));
              } else if ((p.clientName||"").trim()) {
                // имя введено, но клиент не связан — создаём запись (появится в списке, нужна договорам)
                clientId = Date.now().toString();
                saveContractClients([...clientsRef.current, { id:clientId, ...cdata, createdAt:Date.now(), createdById:currentUser.id, _fromObject:p.id }]);
              }
              const upd = {...p, clientId: clientId||"", updatedAt: Date.now()};
              saveObjects(objectsRef.current.map(x=>x.id===p.id?upd:x));
              return upd;
            });

            return (
              <div>
                {/* Карточка объекта — компактная */}
                <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:10,padding:"14px 16px",display:"flex",flexDirection:"column",gap:10}}>
                  {/* Статус */}
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    {DEAL_STATUSES.map(s=>(
                      <button key={s.key} disabled={!canEdit} onClick={()=>saveObjField(obj,{status:s.key})}
                        style={{background:obj.status===s.key?s.bg:"rgba(0,0,0,.03)",color:obj.status===s.key?s.color:"#94a3b8",border:`1px solid ${obj.status===s.key?s.color:"#e2e8f0"}`,borderRadius:8,padding:"3px 9px",fontSize:11,fontWeight:600,cursor:canEdit?"pointer":"default",fontFamily:"inherit",transition:"all .12s"}}>
                        {s.label}
                      </button>
                    ))}
                  </div>

                  {/* Сводка клиента/объекта + сворачивание */}
                  <div onClick={()=>setObjInfoCollapsed(v=>!v)} style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",padding:"2px 0",userSelect:"none"}}>
                    <span style={{fontSize:11,color:"#2563eb",fontWeight:700,letterSpacing:.5,textTransform:"uppercase"}}>👤 Клиент и объект</span>
                    {objInfoCollapsed && (
                      <span style={{fontSize:12,color:"#64748b",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>
                        {[obj.clientName, obj.clientPhone, obj.address].filter(Boolean).join(" · ")||"не заполнено"}
                      </span>
                    )}
                    <span style={{marginLeft:objInfoCollapsed?0:"auto",fontSize:12,color:"#94a3b8",fontWeight:600}}>{objInfoCollapsed?"▼ развернуть":"▲ свернуть"}</span>
                  </div>

                  {/* Клиент + Объект — одна сетка */}
                  {!objInfoCollapsed && (
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                    <div>
                      <input className="fi" style={{fontSize:12}} value={obj.clientName||""} readOnly={!canEdit}
                        onChange={e=>setObjLocal({clientName:e.target.value})} onBlur={persistObj}
                        placeholder="ФИО / Название" />
                    </div>
                    <div>
                      <input className="fi" style={{fontSize:12}} value={obj.clientPhone||""} readOnly={!canEdit}
                        onChange={e=>setObjLocal({clientPhone:e.target.value})} onBlur={persistObj}
                        placeholder="Телефон" />
                    </div>
                    <div>
                      <select className="fi" style={{fontSize:12}} value={obj.clientType||"физ"} disabled={!canEdit}
                        onChange={e=>{ setObjLocal({clientType:e.target.value}); setTimeout(persistObj,0); }}>
                        <option value="физ">Физ. лицо</option>
                        <option value="юр">Юр. лицо</option>
                      </select>
                    </div>
                    <div>
                      <input className="fi" style={{fontSize:12}} value={obj.clientIin||""} readOnly={!canEdit}
                        onChange={e=>setObjLocal({clientIin:e.target.value})} onBlur={persistObj}
                        placeholder={obj.clientType==="юр"?"БИН":"ИИН"} />
                    </div>
                    <div style={{gridColumn:"2 / -1"}}>
                      <input className="fi" style={{fontSize:12}} value={obj.clientDoc||""} readOnly={!canEdit}
                        onChange={e=>setObjLocal({clientDoc:e.target.value})} onBlur={persistObj}
                        placeholder={obj.clientType==="юр"?"Устав / доверенность":"Документ (уд. личности №...)"} />
                    </div>
                    {obj.clientType==="юр" && (<>
                      <div style={{gridColumn:"1 / -1"}}>
                        <input className="fi" style={{fontSize:12}} value={obj.clientDirector||""} readOnly={!canEdit}
                          onChange={e=>setObjLocal({clientDirector:e.target.value})} onBlur={persistObj}
                          placeholder="Директор (полностью, напр. Иванов Иван Иванович)" />
                      </div>
                      <div>
                        <input className="fi" style={{fontSize:12}} value={obj.clientDirectorShort||""} readOnly={!canEdit}
                          onChange={e=>setObjLocal({clientDirectorShort:e.target.value})} onBlur={persistObj}
                          placeholder="Директор кратко (Иванов И.И.)" />
                      </div>
                      <div>
                        <input className="fi" style={{fontSize:12}} value={obj.clientEmail||""} readOnly={!canEdit}
                          onChange={e=>setObjLocal({clientEmail:e.target.value})} onBlur={persistObj}
                          placeholder="Email" />
                      </div>
                      <div>
                        <input className="fi" style={{fontSize:12}} value={obj.clientBank||""} readOnly={!canEdit}
                          onChange={e=>setObjLocal({clientBank:e.target.value})} onBlur={persistObj}
                          placeholder="Банк" />
                      </div>
                      <div>
                        <input className="fi" style={{fontSize:12}} value={obj.clientBik||""} readOnly={!canEdit}
                          onChange={e=>setObjLocal({clientBik:e.target.value})} onBlur={persistObj}
                          placeholder="БИК" />
                      </div>
                      <div>
                        <input className="fi" style={{fontSize:12}} value={obj.clientAccount||""} readOnly={!canEdit}
                          onChange={e=>setObjLocal({clientAccount:e.target.value})} onBlur={persistObj}
                          placeholder="ИИК (расчётный счёт)" />
                      </div>
                    </>)}
                    <div style={{gridColumn:"1 / -1"}}>
                      <input className="fi" style={{fontSize:12}} value={obj.address||""} readOnly={!canEdit}
                        onChange={e=>setObjLocal({address:e.target.value})} onBlur={persistObj}
                        placeholder="📍 Адрес объекта" />
                    </div>
                    <div>
                      <select className="fi" style={{fontSize:12}} value={obj.objType||"Вторичка"} disabled={!canEdit}
                        onChange={e=>{ setObjLocal({objType:e.target.value}); setTimeout(persistObj,0); }}>
                        {["Вторичка","Новостройка","Коммерция","Частный дом","Другое"].map(t=><option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <input className="fi" style={{fontSize:12}} value={obj.area||""} readOnly={!canEdit} type="number"
                        onChange={e=>setObjLocal({area:e.target.value})} onBlur={persistObj}
                        placeholder="Площадь, м²" />
                    </div>
                    <div>
                      <input className="fi" style={{fontSize:12}} value={obj.manager||""} readOnly={!canEdit}
                        onChange={e=>setObjLocal({manager:e.target.value})} onBlur={persistObj}
                        placeholder="Менеджер" />
                    </div>
                    <div style={{gridColumn:"1 / -1"}}>
                      <textarea className="fi" rows={2} style={{fontSize:12,resize:"vertical",minHeight:44}} value={obj.note||""} readOnly={!canEdit}
                        onChange={e=>setObjLocal({note:e.target.value})} onBlur={persistObj}
                        placeholder="Заметка..." />
                    </div>
                  </div>
                  )}
                </div>

                {/* Сметы объекта */}
                <div style={{marginTop:24}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                    <div style={{fontWeight:700,fontSize:14,color:"#0f172a"}}>📋 Сметы ({objEsts.length})</div>
                    {currentUser.role!=="viewer" && (
                      <button className="btn btn-g" style={{fontSize:12,padding:"6px 14px"}} onClick={()=>openObjectEstimate(obj)}>+ Новая смета</button>
                    )}
                  </div>
                  {objEsts.length===0 && (
                    <div style={{textAlign:"center",padding:"28px 0",color:"#94a3b8",background:"#f9fafb",borderRadius:8,border:"1px dashed #e5e7eb",fontSize:13}}>
                      Смет пока нет — нажмите «+ Новая смета»
                    </div>
                  )}
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {objEsts.map((est,estIdx)=>{
                      const isChild = !_estIsMain(est);
                      const estNum = isChild ? (est.dsNumber||1)+1 : 1;
                      const posCount = Object.values(est.rows||{}).filter(r=>Number(r?.qty)>0).length;
                      const stEst = STATUSES.find(s=>s.key===(est.status||"new"))||STATUSES[0];
                      return (
                        <div key={est.id} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,padding:"12px 16px",cursor:"pointer",marginLeft:isChild?16:0,borderLeft:isChild?"3px solid #d1fae5":"1px solid #e5e7eb"}}
                          onClick={()=>openObjectEstimateEdit(est, obj)}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                            <div style={{minWidth:0,flex:1}}>
                              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                                <span style={{fontSize:10,fontWeight:700,color:isChild?"#059669":"#2563eb",background:isChild?"rgba(5,150,105,.08)":"#eff6ff",borderRadius:3,padding:"1px 6px"}}>Смета {estNum}</span>
                                <span style={{fontWeight:600,fontSize:13,color:"#0f172a"}}>{est.proj?.name||obj.clientName||obj.address||"Новая смета"}</span>
                                <span style={{fontSize:10,fontWeight:700,color:stEst.color,background:stEst.bg,borderRadius:4,padding:"1px 6px"}}>{stEst.label}</span>
                              </div>
                              <div style={{fontSize:11,color:"#94a3b8",marginTop:3}}>
                                {posCount} позиций · {new Date(est.updatedAt||est.createdAt||0).toLocaleDateString("ru-RU")}
                                {est.createdBy&&` · ${est.createdBy}`}
                              </div>
                            </div>
                            <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6,flexShrink:0}}>
                              <div style={{fontWeight:800,fontSize:15,color:"#0f172a"}}>{fmt(est.total||0)} ₸</div>
                              <div style={{display:"flex",gap:4}} onClick={e=>e.stopPropagation()}>
                                <button title={isChild?"Создать доп. соглашение из этой доп. сметы":"Создать договор из сметы"} onClick={()=>openObjectContract(obj,est)}
                                  style={{background:"rgba(184,144,74,.08)",color:"#2563eb",border:"1px solid #eff6ff",borderRadius:4,padding:"2px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>📄 {isChild?"Доп. соглашение":"Договор"}</button>
                                {currentUser.role!=="viewer" && (
                                  <button title="Сформировать акт выполненных работ (Р-1) по этой смете" onClick={()=>openAvrBuilder(obj,est)}
                                    style={{background:"rgba(124,58,237,.08)",color:"#7c3aed",border:"1px solid rgba(124,58,237,.2)",borderRadius:4,padding:"2px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>📋 Акт</button>
                                )}
                                {currentUser.role!=="viewer" && !isChild && (
                                  <button title="Договор подряда с рабочим (работы из этой сметы, суммы редактируются)" onClick={()=>{
                                    const ws = estimateToWorks(est);
                                    const podCount = contractsRef.current.filter(c=>c.type==="podryad").length;
                                    setObjectReturnId(obj.id);
                                    setCurrentContract({id:Date.now().toString(),type:"podryad",number:String(1012+podCount),date:new Date().toISOString().slice(0,10),city:"Караганда",clientId:"",contragentId:contragentsRef.current[0]?.id||"",works:ws,objectId:obj.id,objectAddress:obj.address||"",appendix:1,note:"",createdBy:currentUser.name,createdById:currentUser.id});
                                    setContractTab("editor"); setScreen("contracts");
                                  }}
                                    style={{background:"rgba(124,58,237,.08)",color:"#7c3aed",border:"1px solid rgba(124,58,237,.2)",borderRadius:4,padding:"2px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>👷 Подряд</button>
                                )}
                                {currentUser.role!=="viewer" && !isChild && (
                                  <button title="Создать доп. смету к этой смете" onClick={()=>{ setObjectReturnId(obj.id); newSupplementaryEstimate(est); }}
                                    style={{background:"rgba(5,150,105,.08)",color:"#059669",border:"1px solid rgba(5,150,105,.2)",borderRadius:4,padding:"2px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>+ Доп. смета</button>
                                )}
                                {currentUser.role!=="viewer" && (
                                  <button title="Дублировать" onClick={()=>duplicateEstimate(est)}
                                    style={{background:"#eff6ff",color:"#2563eb",border:"1px solid rgba(100,100,200,.15)",borderRadius:4,padding:"2px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>⧉</button>
                                )}
                                {(currentUser.role==="admin"||(currentUser.role==="user"&&est.createdBy===currentUser.name)) && (
                                  <button title="Удалить смету" onClick={()=>{ if(window.confirm("Удалить смету?")) deleteEstimate(est.id); }}
                                    style={{background:"rgba(220,38,38,.08)",color:"#dc2626",border:"1px solid rgba(220,38,38,.1)",borderRadius:4,padding:"2px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>🗑</button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Договоры объекта */}
                <div style={{marginTop:24}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                    <div style={{fontWeight:700,fontSize:14,color:"#0f172a"}}>📄 Договоры ({objCons.length})</div>
                  </div>
                  {objCons.length===0 && (
                    <div style={{textAlign:"center",padding:"28px 0",color:"#94a3b8",background:"#f9fafb",borderRadius:8,border:"1px dashed #e5e7eb",fontSize:13}}>
                      Договоров пока нет<br/>
                      <span style={{fontSize:11,color:"#d1d5db"}}>Создайте смету выше и нажмите <b>📄</b> на её карточке — договор сформируется со всеми позициями</span>
                    </div>
                  )}
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {objCons.map(c=>{
                      const cl2 = contractClients.find(x=>x.id===c.clientId);
                      const ca2 = contragents.find(x=>x.id===c.contragentId);
                      const total = (c.works||[]).reduce((s,w)=>s+(w.quantity*w.price||0),0);
                      const stC = CONTRACT_STATUSES.find(x=>x.key===(c.contractStatus||"draft"))||CONTRACT_STATUSES[0];
                      const TLABEL = {repair_fiz:"Договор",annex:"Доп. соглашение",design:"Дизайн-проект",design_add:"Доп. соглашение",reservation:"Бронь"};
                      const isAnnex = c.type==="annex";
                      const conTitle = isAnnex ? `Доп. соглашение №${c.appendix||2}`+(c.mainNumber?` к договору №${c.mainNumber}`:"") : `${TLABEL[c.type||"repair_fiz"]||"Договор"} №${c.number||"б/н"}`;
                      return (
                        <div key={c.id} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,padding:"12px 16px",cursor:"pointer",transition:"all .12s",marginLeft:isAnnex?16:0,borderLeft:isAnnex?"3px solid #ede9fe":"1px solid #e5e7eb"}}
                          onClick={()=>{ setCurrentContract({...c}); setObjectReturnId(obj.id); setContractTab("editor"); setScreen("contracts"); }}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                            <div style={{minWidth:0,flex:1}}>
                              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                                {isAnnex && <span style={{fontSize:10,fontWeight:700,color:"#7c3aed",background:"rgba(124,58,237,.08)",borderRadius:3,padding:"1px 6px"}}>Доп. согл.</span>}
                                <span style={{fontWeight:600,fontSize:13,color:"#0f172a"}}>{conTitle}</span>
                                <span style={{fontSize:10,fontWeight:700,color:stC.color,background:stC.bg,borderRadius:4,padding:"1px 6px"}}>{stC.label}</span>
                              </div>
                              <div style={{fontSize:11,color:"#94a3b8",marginTop:3}}>
                                {cl2?.name||c.estClient||"Клиент не выбран"} · {new Date(c.date||Date.now()).toLocaleDateString("ru-RU")} · {(c.works||[]).length} позиций
                              </div>
                            </div>
                            <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6,flexShrink:0}}>
                              <div style={{fontWeight:800,fontSize:15,color:"#0f172a"}}>{fmt(total)} ₸</div>
                              <div style={{display:"flex",gap:4}} onClick={e=>e.stopPropagation()}>
                                <button onClick={()=>generateContractPdf(c,cl2,ca2)}
                                  style={{background:"#e2e8f0",color:"#334155",border:"1px solid #e2e8f0",borderRadius:4,padding:"2px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>📄 PDF</button>
                                <button onClick={()=>generateContractGDoc(c,cl2,ca2)}
                                  style={{background:"#eff6ff",color:"#2563eb",border:"1px solid rgba(66,133,244,.2)",borderRadius:4,padding:"2px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>📋 GDoc</button>
                                {currentUser.role==="admin" && (()=>{ const exists=finProjectsRef.current.find(p=>normCN(p.contractNo)===normCN(c.number));
                                  return <button onClick={()=>startFinProjFromObject(obj,c)} title={exists?"Открыть проект в финансах":"Завести проект в финансах"}
                                    style={{background:exists?"#f0fdf4":"rgba(5,150,105,.1)",color:"#059669",border:"1px solid rgba(5,150,105,.2)",borderRadius:4,padding:"2px 8px",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>💰 {exists?"В финансах ✓":"В финансы"}</button>;
                                })()}
                                {(currentUser.role==="admin"||(currentUser.role==="user"&&c.createdBy===currentUser.name)) && (
                                  <button onClick={()=>{ if(window.confirm("Удалить договор?")) saveContracts(contractsRef.current.filter(x=>x.id!==c.id),{removedIds:[c.id],allowEmpty:true}); }}
                                    style={{background:"rgba(220,38,38,.08)",color:"#dc2626",border:"1px solid rgba(220,38,38,.1)",borderRadius:4,padding:"2px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>🗑</button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Отчёты объекта (АВР, форма Р-1) */}
                {(()=>{
                  const objReports = reports.filter(r=>r.objectId===obj.id).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
                  const mainEst = objEsts.find(_estIsMain) || objEsts[0];
                  return (
                    <div style={{marginTop:24}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                        <div style={{fontWeight:700,fontSize:14,color:"#0f172a"}}>📑 Отчёты ({objReports.length})</div>
                        {currentUser.role!=="viewer" && (
                          <button className="btn btn-g" style={{fontSize:12,padding:"6px 14px"}}
                            onClick={()=>{ if(!mainEst){ alert("Сначала создайте смету — акт формируется из её позиций."); return; } openAvrBuilder(obj,mainEst); }}>
                            + Сформировать АВР
                          </button>
                        )}
                      </div>
                      {objReports.length===0 && (
                        <div style={{textAlign:"center",padding:"28px 0",color:"#94a3b8",background:"#f9fafb",borderRadius:8,border:"1px dashed #e5e7eb",fontSize:13}}>
                          Отчётов пока нет<br/>
                          <span style={{fontSize:11,color:"#d1d5db"}}>Нажмите <b>📋 Акт</b> на карточке сметы или «+ Сформировать АВР» — выберите работы и распечатайте акт по форме Р-1</span>
                        </div>
                      )}
                      <div style={{display:"flex",flexDirection:"column",gap:8}}>
                        {objReports.map(r=>(
                          <div key={r.id} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,padding:"12px 16px",borderLeft:"3px solid #ede9fe"}}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                              <div style={{minWidth:0,flex:1}}>
                                <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                                  <span style={{fontSize:10,fontWeight:700,color:"#7c3aed",background:"rgba(124,58,237,.08)",borderRadius:3,padding:"1px 6px"}}>АВР · Р-1</span>
                                  <span style={{fontWeight:600,fontSize:13,color:"#0f172a"}}>Акт №{r.actNo||"б/н"}</span>
                                </div>
                                <div style={{fontSize:11,color:"#94a3b8",marginTop:3}}>
                                  {new Date(r.actDate||r.createdAt||0).toLocaleDateString("ru-RU")}
                                  {r.contractNo?` · договор №${r.contractNo}`:""} · {(r.lines||[]).length} позиций
                                  {r.createdBy?` · ${r.createdBy}`:""}
                                </div>
                              </div>
                              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6,flexShrink:0}}>
                                <div style={{fontWeight:800,fontSize:15,color:"#0f172a"}}>{fmt(r.total||0)} ₸</div>
                                <div style={{display:"flex",gap:4}}>
                                  <button title="Печать / PDF" onClick={()=>openOrPrintHtml(buildAvrHtml({...r, lines:(r.lines||[]).map(l=>({...l,included:true,doneQty:l.doneQty}))}))}
                                    style={{background:"#e2e8f0",color:"#334155",border:"1px solid #e2e8f0",borderRadius:4,padding:"2px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>🖨 Печать</button>
                                  {currentUser.role!=="viewer" && (
                                    <button title="Редактировать акт" onClick={()=>setAvrModal({ ...r, lines:(r.lines||[]).map(l=>({...l,included:true,doneQty:l.doneQty})) })}
                                      style={{background:"#eff6ff",color:"#2563eb",border:"1px solid rgba(66,133,244,.2)",borderRadius:4,padding:"2px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>✎</button>
                                  )}
                                  {(currentUser.role==="admin"||(currentUser.role==="user"&&r.createdBy===currentUser.name)) && (
                                    <button title="Удалить акт" onClick={()=>{ if(window.confirm("Удалить акт?")) saveReports(reportsRef.current.filter(x=>x.id!==r.id),{removedIds:[r.id],allowEmpty:true}); }}
                                      style={{background:"rgba(220,38,38,.08)",color:"#dc2626",border:"1px solid rgba(220,38,38,.1)",borderRadius:4,padding:"2px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>🗑</button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })()}
        </div>
        );
      })()}

      {effScreen === "contracts" && (
        <div className="page" style={{maxWidth:960,minHeight:"100vh"}}>
          {/* Шапка + табы — скрываем в режиме редактора договора (у него своя шапка) */}
          {contractTab !== "editor" && (<>
          <div className="hero" style={{background:"linear-gradient(135deg,#0f172a 0%,#1e293b 70%,#283549 100%)",borderRadius:16,padding:"22px 26px",marginBottom:20,position:"relative",overflow:"hidden",boxShadow:"0 4px 20px rgba(15,23,42,.3)"}}>
            <div style={{position:"absolute",top:-30,right:-30,width:160,height:160,borderRadius:"50%",background:"rgba(59,130,246,.08)"}}/>
            <div style={{position:"relative",zIndex:1,display:"flex",alignItems:"center",gap:13,flexWrap:"wrap"}}>
              <button onClick={()=>setScreen("dashboard")} style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:22,lineHeight:1,padding:"0 4px"}}>←</button>
              <div style={{width:40,height:40,borderRadius:11,background:"linear-gradient(135deg,#3b82f6,#2563eb)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,boxShadow:"0 3px 12px rgba(37,99,235,.5)"}}>📄</div>
              <div style={{minWidth:0}}>
                <h1 style={{margin:0,fontSize:21,fontWeight:900,color:"#fff",lineHeight:1.1}}>Прочие документы</h1>
                <div style={{fontSize:12,color:"rgba(255,255,255,.7)",marginTop:3}}>Документы вне объектов · клиенты и контрагенты</div>
              </div>
              <div style={{flex:1}}/>
              {["list","clients","contragents"].includes(contractTab) && currentUser.role === "admin" && (
                <button onClick={()=>openListBackups(contractTab)}
                  style={{background:"rgba(255,255,255,.08)",color:"#cbd5e1",border:"1px solid rgba(255,255,255,.15)",borderRadius:8,padding:"8px 13px",fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                  🕘 Бэкапы
                </button>
              )}
              {contractTab === "list" && (()=>{
                const trashedCount = contracts.filter(c=>c.deletedAt).length;
                return (<>
                  {trashedCount>0 && <button onClick={()=>setContractTab("trash")} style={{background:"rgba(220,38,38,.12)",color:"#ef4444",border:"1px solid rgba(220,38,38,.2)",borderRadius:8,padding:"8px 13px",fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>🗑 Корзина ({trashedCount})</button>}
                  {currentUser.role !== "viewer" && <button className="btn btn-g" style={{fontSize:13,padding:"9px 16px"}} onClick={()=>{ setCurrentContract({id:Date.now().toString(),number:nextContractNumber(),date:new Date().toISOString().split("T")[0],clientId:"",contragentId:contragents[0]?.id||"",works:[],appendix:1,note:"",createdBy:currentUser.name,createdById:currentUser.id}); setContractTab("editor"); }}>+ Новый</button>}
                </>);
              })()}
            </div>
          </div>

          </>)}

          <div style={{paddingTop:0}}>

            {/* ── СПИСОК ДОГОВОРОВ ── */}
            {contractTab === "list" && (
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {/* Фильтр по статусу */}
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:2}}>
                  <button onClick={()=>setContractFilterStatus("")}
                    style={{background:!contractFilterStatus?"#2563eb":"rgba(0,0,0,.03)",color:!contractFilterStatus?"#fff":"#94a3b8",border:`1px solid ${!contractFilterStatus?"#2563eb":"#e2e8f0"}`,borderRadius:8,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Все</button>
                  {CONTRACT_STATUSES.map(s=>(
                    <button key={s.key} onClick={()=>setContractFilterStatus(v=>v===s.key?"":s.key)}
                      style={{background:contractFilterStatus===s.key?s.bg:"rgba(0,0,0,.03)",color:contractFilterStatus===s.key?s.color:"#94a3b8",border:`1px solid ${contractFilterStatus===s.key?s.color:"#e2e8f0"}`,borderRadius:8,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{s.label}</button>
                  ))}
                </div>
                {contracts.length === 0 && (
                  <div style={{textAlign:"center",padding:"60px 0",color:"#94a3b8"}}>
                    <div style={{fontSize:40,marginBottom:12}}>📋</div>
                    <div style={{fontWeight:700,marginBottom:6}}>Договоров пока нет</div>
                    <div style={{fontSize:12}}>Создайте новый или используйте кнопку 📄 на карточке сметы</div>
                  </div>
                )}
                {(() => {
                  const TLABEL = {repair_fiz:"Договор",annex:"Приложение",design:"Дизайн-проект",design_add:"Доп. соглашение",reservation:"Бронь",podryad:"Договор подряда",podryad_annex:"Приложение подряда"};
                  const contractTitle = (c) => {
                    const t = c.type||"repair_fiz";
                    if(t==="annex"||t==="podryad_annex") return `${t==="podryad_annex"?"Приложение подряда":"Приложение"} №${c.appendix||2}`+(c.mainNumber?` к №${c.mainNumber}`:"");
                    const lbl = TLABEL[t]||"Договор";
                    return c.number ? `${lbl} №${c.number}` : `${lbl} (без номера)`;
                  };
                  // дочерние = приложения/доп.соглашения, ссылающиеся на номер существующего договора
                  const isChildType = (c) => (c.type==="annex"||c.type==="design_add"||c.type==="podryad_annex");
                  const numMap = {}; // number -> contract
                  contracts.forEach(c=>{ if(c.number && !isChildType(c)) numMap[c.number]=c; });
                  const childMap = {}; // parentId -> [child]
                  contracts.forEach(c=>{ if(isChildType(c) && c.mainNumber && numMap[c.mainNumber]){ const pid=numMap[c.mainNumber].id; (childMap[pid]||(childMap[pid]=[])).push(c); } });
                  const childIds = new Set(Object.values(childMap).flat().map(c=>c.id));
                  const _objIds = new Set(objects.map(o=>o.id));
                  // показываем договоры без объекта ИЛИ привязанные к несуществующему объекту (сироты), без удалённых
                  const roots = contracts.filter(c=>!c.deletedAt && !childIds.has(c.id) && (!c.objectId || !_objIds.has(c.objectId)) && (!contractFilterStatus || (c.contractStatus||"draft")===contractFilterStatus));

                  const renderContractCard = (c, isChild=false) => {
                    const client = contractClients.find(x=>x.id===c.clientId);
                    const ca = contragents.find(x=>x.id===c.contragentId);
                    const total = (c.works||[]).reduce((s,w)=>s+(w.quantity*w.price||0),0);
                    return (
                      <div key={c.id}>
                        {isChild && <div style={{display:"flex",alignItems:"center",gap:6,marginLeft:16,marginBottom:2,marginTop:4}}>
                          <div style={{width:2,height:14,background:"#e2e8f0",borderRadius:2,flexShrink:0}}/>
                          <span style={{fontSize:10,color:"#7c3aed",fontWeight:700,background:"rgba(124,58,237,.08)",borderRadius:3,padding:"1px 6px"}}>Приложение №{c.appendix||2}</span>
                        </div>}
                        <div style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:8,padding:"14px 18px",cursor:"pointer",transition:"all .15s",marginLeft:isChild?16:0,borderLeft:isChild?"3px solid #ede9fe":"1px solid #e5e7eb"}}
                          onClick={()=>{ setCurrentContract({...c}); setContractTab("editor"); }}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                            <div style={{minWidth:0,flex:1}}>
                              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                                <div style={{fontWeight:700,fontSize:14,color:"#0f172a"}}>
                                  {contractTitle(c)}
                                </div>
                                {(()=>{ const s=CONTRACT_STATUSES.find(x=>x.key===(c.contractStatus||"draft"))||CONTRACT_STATUSES[0]; return <span style={{fontSize:10,fontWeight:700,color:s.color,background:s.bg,borderRadius:4,padding:"1px 7px",flexShrink:0,whiteSpace:"nowrap"}}>{s.label}</span>; })()}
                              </div>
                              <div style={{fontSize:12,color:"#94a3b8",marginTop:3}}>
                                {client ? `👤 ${client.name}` : c.estClient ? `👤 ${c.estClient} (не добавлен)` : "Клиент не выбран"}
                                {ca && <span style={{marginLeft:8}}>· {ca.name}</span>}
                              </div>
                              <div style={{fontSize:11,color:"#94a3b8",marginTop:3}}>
                                {new Date(c.date||Date.now()).toLocaleDateString("ru-RU")} · {(c.works||[]).length} позиций
                              </div>
                            </div>
                            <div style={{textAlign:"right",flexShrink:0}}>
                              <div style={{fontWeight:800,fontSize:16,color:"#0f172a"}}>{fmt(total)} ₸</div>
                              <div style={{display:"flex",gap:5,marginTop:6}}>
                                <button onClick={e=>{e.stopPropagation();
                                  const cl = contractClients.find(x=>x.id===c.clientId);
                                  const ca2 = contragents.find(x=>x.id===c.contragentId);
                                  generateContractPdf(c, cl, ca2);
                                }} style={{background:"#e2e8f0",color:"#94a3b8",border:"1px solid #e2e8f0",borderRadius:5,padding:"3px 9px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>📄 PDF</button>
                                <button onClick={e=>{e.stopPropagation();
                                  const cl = contractClients.find(x=>x.id===c.clientId);
                                  const ca2 = contragents.find(x=>x.id===c.contragentId);
                                  generateContractGDoc(c, cl, ca2);
                                }} style={{background:"#eff6ff",color:"#2563eb",border:"1px solid rgba(66,133,244,.2)",borderRadius:5,padding:"3px 9px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>📋 GDoc</button>
                                {(currentUser.role==="admin" || (currentUser.role==="user" && c.createdBy===currentUser.name)) && (
                                  <button onClick={e=>{e.stopPropagation(); if(window.confirm("Переместить в корзину?")){ saveContracts(contractsRef.current.map(x=>x.id===c.id?{...x,deletedAt:Date.now()}:x)); writeAudit(currentUser,"удалил договор","contract",c.id,c.contractNo||c.objectName||""); }}}
                                    style={{background:"rgba(220,38,38,.08)",color:"#dc2626",border:"1px solid rgba(220,38,38,.1)",borderRadius:5,padding:"3px 9px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>🗑</button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  };

                  return roots.map(c=>(
                    <div key={c.id}>
                      {renderContractCard(c,false)}
                      {(childMap[c.id]||[]).sort((a,b)=>(a.appendix||0)-(b.appendix||0)).map(ch=>renderContractCard(ch,true))}
                    </div>
                  ));
                })()}
              </div>
            )}

            {/* ── КОРЗИНА ДОГОВОРОВ ── */}
            {contractTab === "trash" && (
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
                  <button onClick={()=>setContractTab("list")} style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:18,lineHeight:1,padding:"0 4px"}}>←</button>
                  <span style={{fontWeight:700,fontSize:15,color:"#0f172a"}}>🗑 Корзина договоров</span>
                </div>
                {contracts.filter(c=>c.deletedAt).length===0 ? (
                  <div style={{textAlign:"center",padding:"60px 0",color:"#94a3b8"}}>
                    <div style={{fontSize:40,marginBottom:12}}>🗑</div>
                    <div style={{fontWeight:700}}>Корзина пуста</div>
                  </div>
                ) : contracts.filter(c=>c.deletedAt).sort((a,b)=>b.deletedAt-a.deletedAt).map(c=>{
                  const client = contractClients.find(x=>x.id===c.clientId);
                  const total = (c.works||[]).reduce((s,w)=>s+(w.quantity*w.price||0),0);
                  const TLABEL2 = {repair_fiz:"Договор",annex:"Приложение",design:"Дизайн-проект",design_add:"Доп. соглашение",reservation:"Бронь"};
                  const title = c.number ? `${TLABEL2[c.type||"repair_fiz"]||"Договор"} №${c.number}` : (TLABEL2[c.type||"repair_fiz"]||"Договор")+" (без номера)";
                  return (
                    <div key={c.id} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,padding:"14px 18px",opacity:.7}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                        <div>
                          <div style={{fontWeight:700,fontSize:13,color:"#0f172a",textDecoration:"line-through"}}>{title}</div>
                          <div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>{client?`👤 ${client.name}`:""} · Удалён {new Date(c.deletedAt).toLocaleDateString("ru-RU")}</div>
                        </div>
                        <div style={{display:"flex",gap:6,alignItems:"center"}}>
                          <span style={{fontWeight:700,fontSize:14,color:"#64748b"}}>{fmt(total)} ₸</span>
                          <button onClick={()=>saveContracts(contractsRef.current.map(x=>x.id===c.id?{...x,deletedAt:undefined}:x))}
                            style={{background:"rgba(5,150,105,.08)",color:"#059669",border:"1px solid rgba(5,150,105,.2)",borderRadius:5,padding:"4px 10px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>↩ Восстановить</button>
                          {currentUser.role==="admin" && <button onClick={()=>{ if(window.confirm("Удалить навсегда?")) saveContracts(contractsRef.current.filter(x=>x.id!==c.id),{removedIds:[c.id],allowEmpty:true}); }}
                            style={{background:"rgba(220,38,38,.08)",color:"#dc2626",border:"1px solid rgba(220,38,38,.1)",borderRadius:5,padding:"4px 10px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>✕ Удалить</button>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── РЕДАКТОР ДОГОВОРА ── */}
            {contractTab === "editor" && currentContract && !currentContract._mode && (
              <ContractEditor
                contract={currentContract}
                clients={contractClients}
                contragents={contragents}
                onUpdate={setCurrentContract}
                onBack={()=>{
                  if (objectReturnId) {
                    const obj = objectsRef.current.find(x=>x.id===objectReturnId);
                    setObjectReturnId(null);
                    if (obj) { setCurrentObject({...obj}); setObjectTab("workspace"); setScreen("objects"); return; }
                  }
                  setContractTab("list");
                }}
                onSave={async ()=>{
                  const isNewContract = !contracts.find(x=>x.id===currentContract.id);
                  const list = contracts.filter(x=>x.id!==currentContract.id);
                  await saveContracts([...list, currentContract]);
                  writeAudit(currentUser, isNewContract?"создал договор":"изменил договор", "contract", currentContract.id, currentContract.contractNo||currentContract.number||currentContract.objectName||"");
                  if (objectReturnId) {
                    const obj = objectsRef.current.find(x=>x.id===objectReturnId);
                    setObjectReturnId(null);
                    if (obj) { setCurrentObject({...obj}); setObjectTab("workspace"); setScreen("objects"); return; }
                  }
                  setContractTab("list");
                }}
                onPdf={(withStamp)=>{
                  const cl = contractClients.find(x=>x.id===currentContract.clientId);
                  const ca = contragents.find(x=>x.id===currentContract.contragentId);
                  generateContractPdf(currentContract, cl, ca, withStamp);
                }}
                onGDoc={()=>{
                  const cl = contractClients.find(x=>x.id===currentContract.clientId);
                  const ca = contragents.find(x=>x.id===currentContract.contragentId);
                  generateContractGDoc(currentContract, cl, ca);
                }}
                onAddClientFromEstimate={async ()=>{
                  const newClient = {id:Date.now().toString(),name:currentContract.estClient||"",phone:currentContract.estPhone||"",address:currentContract.estAddress||"",iin:"",doc:"",type:"физ",createdAt:Date.now()};
                  const list=[...contractClients,newClient];
                  await saveContractClients(list);
                  setCurrentContract(prev=>({...prev,clientId:newClient.id}));
                }}
                onUpdateClient={(updated)=>{
                  saveContractClients(contractClients.map(x=>x.id===updated.id?updated:x));
                }}
                onCreateClient={async (newClient)=>{
                  await saveContractClients([...contractClients, newClient]);
                }}
                workers={workers}
                onCreateWorker={async (w)=>{
                  const rec = { id:w.id||genId(), ...w };
                  const cur = workersRef.current;
                  const next = cur.some(x=>x.id===rec.id) ? cur.map(x=>x.id===rec.id?rec:x) : [rec,...cur];
                  await saveWorkers(next,{replace:false});
                  return rec.id;
                }}
                importObjects={objects.filter(o=>!o.deletedAt).map(o=>({id:o.id,label:o.clientName||o.address||o.id,address:o.address||""}))}
                getObjectWorks={(objId)=>{ const ests=estimates.filter(e=>e.objectId===objId); const main=ests.find(e=>!e.parentId||e.parentId===e.id)||ests[0]; return main?estimateToWorks(main):[]; }}
                currentUserRole={currentUser.role}
                fmt={fmt}
              />
            )}

          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          ЭКРАН 4: АДМИНКА
      ═══════════════════════════════════════════════════════════════════ */}
      {effScreen === "admin" && currentUser.role === "admin" && (
        <AdminPageContent
          currentUser={currentUser}
          presence={presence}
          onUsersChanged={async ()=>{
            const u=await storage.get(USERS_KEY);
            if(!u) return;
            const list=JSON.parse(u.value);
            setAllUsers(list);
            // обновляем currentUser если его роль/имя изменились
            const me=list.find(x=>x.id===currentUser.id);
            if(me && (me.role!==currentUser.role || me.name!==currentUser.name)){
              const updated={...currentUser,...me};
              setCurrentUser(updated);
              try{ localStorage.setItem(SESSION_KEY,JSON.stringify({user:updated,savedAt:Date.now()})); }catch(e){}
            }
          }}
          clients={contractClients}
          saveClients={saveContractClients}
          clientsRef={clientsRef}
          contragents={contragents}
          saveContragents={saveContragents}
          contragentsRef={contragentsRef}
          onBackupWorkspace={openWorkspaceBackups}
        />
      )}

      {/* ── ЭКРАН: ПРОИЗВОДСТВО ── */}
      {effScreen === "production" && (
        <div style={{padding:"20px 16px 90px"}}>
          {/* Производство обновляется автоматически: показываются объекты с подписанным договором /
              финпроектом / карточкой. Ручной массовый импорт убран — он заменял все карточки и плодил дубли. */}
          <ProductionModule
            objects={productionObjects}
            allObjects={objects}
            unlinkedProjects={unlinkedFinProjects}
            estimates={estimates}
            contracts={contracts}
            productions={productions}
            onSaveProduction={onSaveProduction}
            onDeleteProduction={onDeleteProduction}
            buildStagesFromEstimate={buildStagesFromEstimate}
            finProjects={finProjects}
            financeTx={financeTx}
            fmt={fmt}
            genId={genId}
            currentUser={currentUser}
          />
        </div>
      )}

      </div>

      {/* Модал подтверждения выхода */}
      {/* ── Построитель АВР (форма Р-1) ── */}
      {avrModal && (()=>{
        const m = avrModal;
        const upd = patch => setAvrModal(p=>({...p,...patch}));
        const updLine = (i,patch) => setAvrModal(p=>({...p, lines:p.lines.map((l,idx)=>idx===i?{...l,...patch}:l)}));
        const selected = m.lines.filter(l=>l.included && Number(l.doneQty)>0);
        const total = selected.reduce((s,l)=>s+Math.round((Number(l.price)||0)*(Number(l.doneQty)||0)),0);
        const allOn = m.lines.length>0 && m.lines.every(l=>l.included);
        const addLine = ()=>setAvrModal(p=>({...p, lines:[...p.lines, {cat:"",name:"",unit:"",qty:0,price:0,included:true,doneQty:1}]}));
        return (
        <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.6)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setAvrModal(null)}>
          <div style={{background:"#fff",borderRadius:14,width:"100%",maxWidth:760,maxHeight:"92vh",display:"flex",flexDirection:"column",boxShadow:"0 24px 70px rgba(0,0,0,.3)",overflow:"hidden"}} onClick={e=>e.stopPropagation()}>
            {/* шапка */}
            <div style={{padding:"16px 20px",borderBottom:"1px solid #eef2f7",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
              <div>
                <div style={{fontSize:16,fontWeight:800,color:"#0f172a"}}>📋 Акт выполненных работ (Р-1)</div>
                <div style={{fontSize:12,color:"#94a3b8",marginTop:2}}>Отметьте работы и при необходимости скорректируйте выполненное количество</div>
              </div>
              <button onClick={()=>setAvrModal(null)} style={{background:"none",border:"none",fontSize:24,color:"#94a3b8",cursor:"pointer",lineHeight:1}}>×</button>
            </div>
            {/* реквизиты акта */}
            <div style={{padding:"14px 20px",borderBottom:"1px solid #f1f5f9",display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10}}>
              <label style={{fontSize:11,color:"#64748b",fontWeight:600}}>№ акта<input className="fi" style={{marginTop:4}} value={m.actNo} onChange={e=>upd({actNo:e.target.value})}/></label>
              <label style={{fontSize:11,color:"#64748b",fontWeight:600}}>Дата акта<input type="date" className="fi" style={{marginTop:4}} value={m.actDate} onChange={e=>upd({actDate:e.target.value})}/></label>
              <label style={{fontSize:11,color:"#64748b",fontWeight:600}}>Договор №<input className="fi" style={{marginTop:4}} value={m.contractNo} onChange={e=>upd({contractNo:e.target.value})} placeholder="—"/></label>
              <label style={{fontSize:11,color:"#64748b",fontWeight:600}}>Дата договора<input type="date" className="fi" style={{marginTop:4}} value={m.contractDate||""} onChange={e=>upd({contractDate:e.target.value})}/></label>
              <label style={{fontSize:11,color:"#64748b",fontWeight:600,gridColumn:"1 / -1"}}>Заказчик<input className="fi" style={{marginTop:4}} value={m.clientName} onChange={e=>upd({clientName:e.target.value})} placeholder="ФИО / Название"/></label>
              <label style={{fontSize:12.5,color:"#475569",fontWeight:600,gridColumn:"1 / -1",display:"flex",alignItems:"center",gap:8,cursor:"pointer",marginTop:2}}>
                <input type="checkbox" checked={!!m.withStamp} onChange={e=>upd({withStamp:e.target.checked})} style={{width:16,height:16,cursor:"pointer"}}/>
                🔖 Вставить печать ТОО в акт
              </label>
            </div>
            {/* список работ */}
            <div style={{padding:"8px 20px",borderBottom:"1px solid #f1f5f9",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <button onClick={()=>setAvrModal(p=>({...p, lines:p.lines.map(l=>({...l,included:!allOn}))}))}
                style={{background:"none",border:"1px solid #e2e8f0",borderRadius:7,padding:"5px 11px",fontSize:11,fontWeight:600,color:"#475569",cursor:"pointer",fontFamily:"inherit"}}>
                {allOn?"☐ Снять все":"☑ Выбрать все"}
              </button>
              <span style={{fontSize:12,color:"#64748b"}}>Выбрано: <b>{selected.length}</b> из {m.lines.length}</span>
            </div>
            <div style={{overflowY:"auto",flex:1,padding:"6px 12px"}}>
              {m.lines.map((l,i)=>(
                <div key={i} style={{padding:"10px 8px",borderBottom:"1px solid #f1f5f9",opacity:l.included?1:.5}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                    <input type="checkbox" checked={l.included} onChange={e=>updLine(i,{included:e.target.checked})} style={{width:16,height:16,flexShrink:0,cursor:"pointer"}}/>
                    <input value={l.name} onChange={e=>updLine(i,{name:e.target.value})} placeholder="Наименование работ"
                      style={{flex:1,minWidth:0,padding:"6px 8px",border:"1px solid #e2e8f0",borderRadius:7,fontSize:13,fontFamily:"inherit",fontWeight:500}}/>
                    <div style={{width:92,textAlign:"right",fontSize:13,fontWeight:700,color:l.included?"#0f172a":"#cbd5e1",flexShrink:0}}>{fmt(Math.round((Number(l.price)||0)*(Number(l.doneQty)||0)))} ₸</div>
                    <button title="Удалить строку" onClick={()=>setAvrModal(p=>({...p,lines:p.lines.filter((_,idx)=>idx!==i)}))}
                      style={{background:"none",border:"none",color:"#cbd5e1",cursor:"pointer",fontSize:18,flexShrink:0,lineHeight:1,padding:0}}>×</button>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:7,paddingLeft:24,flexWrap:"wrap"}}>
                    <span style={{fontSize:11,color:"#94a3b8"}}>Кол-во</span>
                    <input type="number" min="0" step="any" value={l.doneQty} disabled={!l.included} onChange={e=>updLine(i,{doneQty:e.target.value})}
                      style={{width:70,padding:"5px 7px",border:"1px solid #e2e8f0",borderRadius:6,fontSize:12,textAlign:"right",fontFamily:"inherit"}}/>
                    <input value={l.unit} onChange={e=>updLine(i,{unit:e.target.value})} placeholder="ед."
                      style={{width:58,padding:"5px 7px",border:"1px solid #e2e8f0",borderRadius:6,fontSize:12,fontFamily:"inherit"}}/>
                    <span style={{fontSize:11,color:"#94a3b8",marginLeft:6}}>Цена</span>
                    <input type="number" min="0" step="any" value={l.price} disabled={!l.included} onChange={e=>updLine(i,{price:e.target.value})}
                      style={{width:98,padding:"5px 7px",border:"1px solid #e2e8f0",borderRadius:6,fontSize:12,textAlign:"right",fontFamily:"inherit"}}/>
                    <span style={{fontSize:11,color:"#94a3b8"}}>₸/{l.unit||"ед."}</span>
                  </div>
                </div>
              ))}
              <button onClick={addLine} style={{margin:"10px 8px 4px",background:"rgba(124,58,237,.06)",color:"#7c3aed",border:"1px dashed rgba(124,58,237,.35)",borderRadius:8,padding:"8px 14px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>+ Добавить строку</button>
            </div>
            {/* подвал */}
            <div style={{padding:"14px 20px",borderTop:"1px solid #eef2f7",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
              <div>
                <div style={{fontSize:12,color:"#64748b"}}>Итого по акту (без НДС)</div>
                <div style={{fontSize:22,fontWeight:900,color:"#0f172a"}}>{fmt(total)} ₸</div>
              </div>
              <div style={{display:"flex",gap:10}}>
                <button onClick={()=>setAvrModal(null)} style={{padding:"11px 18px",borderRadius:10,border:"1px solid #e2e8f0",background:"#f8fafc",color:"#475569",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Отмена</button>
                <button disabled={selected.length===0} onClick={()=>saveAndPrintAvr(m)}
                  style={{padding:"11px 20px",borderRadius:10,border:"none",background:selected.length===0?"#cbd5e1":"#7c3aed",color:"#fff",fontSize:14,fontWeight:700,cursor:selected.length===0?"default":"pointer",fontFamily:"inherit"}}>
                  🖨 Сохранить и печать
                </button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {logoutConfirm && (
        <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.55)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setLogoutConfirm(false)}>
          <div style={{background:"#fff",borderRadius:16,padding:"28px 24px",maxWidth:320,width:"100%",boxShadow:"0 20px 60px rgba(0,0,0,.25)",textAlign:"center"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:36,marginBottom:12}}>🚪</div>
            <div style={{fontSize:17,fontWeight:700,color:"#0f172a",marginBottom:8}}>Выйти из аккаунта?</div>
            <div style={{fontSize:13,color:"#64748b",marginBottom:24}}>Вы будете перенаправлены на экран входа</div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setLogoutConfirm(false)} style={{flex:1,padding:"11px",borderRadius:10,border:"1px solid #e2e8f0",background:"#f8fafc",color:"#475569",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Отмена</button>
              <button onClick={doLogout} style={{flex:1,padding:"11px",borderRadius:10,border:"none",background:"#ef4444",color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Выйти</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ПАНЕЛЬ АДМИНИСТРАТОРА (управление пользователями) ───────────────────────
// Прайс редактор — карточки ниже

// Карточка с полностью локальным состоянием — изолирована от родителя
// Принимает начальные данные ОДИН РАЗ, дальше живёт сама
// При размонтировании сохраняет данные в priceCardCache
const priceCardCache = {};
