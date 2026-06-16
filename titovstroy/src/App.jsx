import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, get, set } from "firebase/database";

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
try { _fbDb = getDatabase(initializeApp(firebaseConfig)); } catch(e) {}

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
    if (price === null) price = w.tiers[w.tiers.length - 1].price;
  } else if (w.fixedPrice) {
    price = w.fixedPrice;
  }
  return price !== null ? price * mult : null;
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

const EMPTY_PROJ = { name:"", type:"Вторичка", area:"", address:"", phone:"", manager:"" };

const STATUSES = [
  { key:"new",       label:"Новая",              color:"#2563eb", bg:"#eff6ff"   },
  { key:"progress",  label:"В работе",           color:"#d97706", bg:"rgba(217,119,6,.12)"  },
  { key:"sent",      label:"Отправлено клиенту", color:"#7c3aed", bg:"rgba(124,58,237,.1)"  },
  { key:"agreed",    label:"Согласовано",        color:"#059669", bg:"#eff6ff"  },
  { key:"rejected",  label:"Отказ",              color:"#dc2626", bg:"rgba(220,38,38,.12)"   },
];
const CONTRACT_STATUSES = [
  { key:"draft",   label:"Черновик",     color:"#9ca3af", bg:"#f3f4f6"              },
  { key:"sign",    label:"На подписание", color:"#d97706", bg:"rgba(217,119,6,.12)" },
  { key:"signed",  label:"Заключён",     color:"#059669", bg:"rgba(5,150,105,.1)"   },
  { key:"archive", label:"Архив",        color:"#6b7280", bg:"rgba(107,114,128,.12)"},
];
// Объекты — статусы жизненного цикла
const DEAL_STATUSES = [
  { key:"new",      label:"Черновик",                color:"#6b7280", bg:"#f3f4f6"              },
  { key:"approval", label:"Согласование с клиентом", color:"#d97706", bg:"rgba(217,119,6,.12)"  },
  { key:"signed",   label:"Договор подписан",        color:"#059669", bg:"rgba(5,150,105,.1)"   },
  { key:"archive",  label:"Архив",                   color:"#6b7280", bg:"rgba(107,114,128,.12)"},
];
const OBJECTS_KEY         = "titovstroy-objects";
const OBJECTS_BACKUPS_KEY = "titovstroy-objects-backups";
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

// ─── ХРАНИЛИЩЕ: Firebase (общая) + localStorage (резерв) ───────────────────
const _mem = {};
const _TIMEOUT = Symbol("timeout");
const _race = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r(_TIMEOUT), ms))]);
const _fbKey = (k) => k.replace(/[^a-zA-Z0-9_]/g, "_"); // Firebase: только буквы/цифры/_
const _TS_SUFFIX = "__wts"; // timestamp последней локальной записи
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
    // Firebase (синхронизация между устройствами)
    let fbResponded = !_fbDb; // если FB не сконфигурирован — авторитетен localStorage
    try {
      if (_fbDb) {
        const snap = await _race(get(ref(_fbDb, _fbKey(key))), 8000);
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
        const res = await _race(set(ref(_fbDb, _fbKey(key)), value), 12000);
        if (res === _TIMEOUT) { fbError = "timeout"; }
        else { fbOk = true; }
      } catch(e) { fbError = e?.message || String(e); console.warn("FB set error:", e); }
    } else {
      fbError = "firebase not configured";
    }
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
      try { localStorage.setItem(SESSION_KEY, JSON.stringify({ user, savedAt: Date.now() })); } catch(e) {}
      onLogin(user);
    } else {
      setError("Неверный логин или пароль");
    }
    setLoading(false);
  };

  return (
    <div style={{minHeight:"100vh",background:"#f3f4f6",display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"'Inter','Segoe UI',sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Inter','Segoe UI',sans-serif;-webkit-font-smoothing:antialiased;color:#111827}h1,h2,h3{letter-spacing:-.02em}button{font-family:'Inter','Segoe UI',sans-serif}`}</style>
      <div style={{width:"100%",maxWidth:380}}>
        {/* Лого */}
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{width:56,height:56,borderRadius:8,background:"#2563eb",display:"inline-flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:26,color:"#f3f4f6",marginBottom:12}}>T</div>
          <div style={{fontWeight:900,fontSize:22,color:"#111827",letterSpacing:.3}}>TitovStroy</div>
          <div style={{fontSize:12,color:"#9ca3af",marginTop:4}}>Система расчёта смет · Вход</div>
        </div>

        {/* Форма */}
        <div style={{background:"#ffffff",border:"1px solid #e5e7eb",borderRadius:8,padding:"28px 28px"}}>
          <div style={{marginBottom:16}}>
            <div style={{fontSize:11,color:"#9ca3af",marginBottom:6,fontWeight:600,letterSpacing:.5,textTransform:"uppercase"}}>Логин</div>
            <input
              style={{background:"#ffffff",border:"1px solid #e5e7eb",color:"#111827",borderRadius:8,padding:"11px 14px",fontFamily:"inherit",fontSize:14,width:"100%",outline:"none",transition:"border .15s"}}
              placeholder="Введите логин"
              value={login}
              onChange={e=>{setLogin(e.target.value);setError("");}}
              onKeyDown={e=>e.key==="Enter"&&handleLogin()}
              autoComplete="username"
            />
          </div>
          <div style={{marginBottom:20}}>
            <div style={{fontSize:11,color:"#9ca3af",marginBottom:6,fontWeight:600,letterSpacing:.5,textTransform:"uppercase"}}>Пароль</div>
            <div style={{position:"relative"}}>
              <input
                style={{background:"#ffffff",border:"1px solid #e5e7eb",color:"#111827",borderRadius:8,padding:"11px 40px 11px 14px",fontFamily:"inherit",fontSize:14,width:"100%",outline:"none",transition:"border .15s"}}
                placeholder="Введите пароль"
                type={showPass?"text":"password"}
                value={password}
                onChange={e=>{setPassword(e.target.value);setError("");}}
                onKeyDown={e=>e.key==="Enter"&&handleLogin()}
                autoComplete="current-password"
              />
              <button onClick={()=>setShowPass(p=>!p)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"#9ca3af",fontSize:16}}>
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
    const u = { id: genId(), login: newLogin.trim(), password: newPass.trim(), name: newName.trim(), role: newRole };
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
    const updated = users.map(u => u.id === id ? {...u, password: editingPass.val.trim()} : u);
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
    const updated = users.map(u => u.id === editingUser.id ? {...u, name: editingUser.name.trim(), login: editingUser.login.trim()} : u);
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

  const roleLabel = r => r==="admin" ? "👑 Админ" : r==="viewer" ? "👁 Наблюдатель" : "👤 Замерщик";

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(17,24,39,.4)",backdropFilter:"blur(2px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:400,padding:16,fontFamily:"'Inter','Segoe UI',sans-serif"}}>
      <div style={{background:"#ffffff",border:"1px solid #e5e7eb",borderRadius:12,boxShadow:"0 20px 60px rgba(0,0,0,.12)",padding:"24px 28px",maxWidth:520,width:"100%",height:"88vh",display:"flex",flexDirection:"column",position:"relative"}}>

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontWeight:800,fontSize:16,color:"#111827"}}>⚙️ Администрирование</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#9ca3af",cursor:"pointer",fontSize:20}}>×</button>
        </div>

        {/* Вкладки */}
        <div style={{display:"flex",gap:4,marginBottom:16,background:"#e5e7eb",borderRadius:8,padding:4}}>
          {[["users","👥 Сотрудники"],["prices","💰 Прайс-лист"]].map(([t,label])=>(
            <button key={t} onClick={()=>setTab(t)} style={{
              flex:1,padding:"8px",borderRadius:6,border:"none",cursor:"pointer",
              fontFamily:"inherit",fontSize:12,fontWeight:700,
              background: tab===t ? "#f3f4f6" : "transparent",
              color: tab===t ? "#111827" : "#6b7280",transition:"all .1s"
            }}>{label}</button>
          ))}
        </div>

        {loading ? <div style={{textAlign:"center",padding:"30px 0",color:"#9ca3af"}}>Загрузка...</div> : tab === "users" ? (
          <div style={{flex:1,overflowY:"auto"}}>
          <>
            {/* Список */}
            <div style={{marginBottom:20}}>
              {users.map(u => (
                <div key={u.id} style={{background:"#ffffff",border:"1px solid #e5e7eb",borderRadius:9,padding:"12px 14px",marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,fontSize:13,color:"#111827"}}>{u.name}</div>
                      <div style={{fontSize:12,color:"#9ca3af",marginTop:1}}>
                        @{u.login} · {roleLabel(u.role)}
                        {u.id === currentUser.id && <span style={{color:"#9ca3af",marginLeft:6}}>(вы)</span>}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:6,alignItems:"center"}}>
                      <button
                        onClick={()=>{setEditingUser(editingUser?.id===u.id?null:{id:u.id,name:u.name,login:u.login});setEditingPass(null);}}
                        style={{background:"#e5e7eb",color:"#9ca3af",border:"1px solid #e5e7eb",borderRadius:6,padding:"4px 10px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>
                        ✏ Изменить
                      </button>
                      <button
                        onClick={()=>{setEditingPass(editingPass?.id===u.id?null:{id:u.id,val:""});setEditingUser(null);}}
                        style={{background:"#e5e7eb",color:"#9ca3af",border:"1px solid #e5e7eb",borderRadius:6,padding:"4px 10px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>
                        🔑
                      </button>
                      {u.id !== currentUser.id && (
                        <button onClick={()=>removeUser(u.id)}
                          style={{background:"rgba(220,38,38,.1)",color:"#dc2626",border:"1px solid rgba(220,38,38,.1)",borderRadius:6,padding:"4px 8px",fontSize:11,cursor:"pointer"}}>✕</button>
                      )}
                    </div>
                  </div>
                  {editingUser?.id === u.id && (
                    <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:8}}>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                        <div>
                          <div style={{fontSize:10,color:"#9ca3af",marginBottom:3}}>Имя</div>
                          <input style={{width:"100%",background:"#f3f4f6",border:"1px solid #e5e7eb",color:"#111827",borderRadius:6,padding:"7px 10px",fontFamily:"inherit",fontSize:12,outline:"none"}}
                            value={editingUser.name} onChange={e=>setEditingUser(p=>({...p,name:e.target.value}))}/>
                        </div>
                        <div>
                          <div style={{fontSize:10,color:"#9ca3af",marginBottom:3}}>Логин</div>
                          <input style={{width:"100%",background:"#f3f4f6",border:"1px solid #e5e7eb",color:"#111827",borderRadius:6,padding:"7px 10px",fontFamily:"inherit",fontSize:12,outline:"none"}}
                            value={editingUser.login} onChange={e=>setEditingUser(p=>({...p,login:e.target.value}))}/>
                        </div>
                      </div>
                      <button onClick={saveUser}
                        style={{background:"#2563eb",color:"#f3f4f6",border:"none",borderRadius:6,padding:"8px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                        Сохранить изменения
                      </button>
                    </div>
                  )}
                  {editingPass?.id === u.id && (
                    <div style={{marginTop:10,display:"flex",gap:8}}>
                      <input
                        style={{flex:1,background:"#f3f4f6",border:"1px solid #e5e7eb",color:"#111827",borderRadius:6,padding:"7px 10px",fontFamily:"inherit",fontSize:12,outline:"none"}}
                        placeholder="Новый пароль"
                        value={editingPass.val}
                        onChange={e=>setEditingPass(p=>({...p,val:e.target.value}))}
                      />
                      <button onClick={()=>savePass(u.id)}
                        style={{background:"#2563eb",color:"#f3f4f6",border:"none",borderRadius:6,padding:"7px 14px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                        Сохранить
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Добавить */}
            <div style={{background:"#f3f4f6",border:"1px solid #e5e7eb",borderRadius:9,padding:"14px 16px"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#9ca3af",letterSpacing:.8,textTransform:"uppercase",marginBottom:10}}>+ Новый пользователь</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                <input style={{background:"#ffffff",border:"1px solid #e5e7eb",color:"#111827",borderRadius:7,padding:"8px 11px",fontFamily:"inherit",fontSize:12,outline:"none"}} placeholder="Имя" value={newName} onChange={e=>setNewName(e.target.value)}/>
                <input style={{background:"#ffffff",border:"1px solid #e5e7eb",color:"#111827",borderRadius:7,padding:"8px 11px",fontFamily:"inherit",fontSize:12,outline:"none"}} placeholder="Логин" value={newLogin} onChange={e=>setNewLogin(e.target.value)}/>
                <input style={{background:"#ffffff",border:"1px solid #e5e7eb",color:"#111827",borderRadius:7,padding:"8px 11px",fontFamily:"inherit",fontSize:12,outline:"none"}} placeholder="Пароль" value={newPass} onChange={e=>setNewPass(e.target.value)}/>
                <select style={{background:"#ffffff",border:"1px solid #e5e7eb",color:"#9ca3af",borderRadius:7,padding:"8px 11px",fontFamily:"inherit",fontSize:12,outline:"none",cursor:"pointer"}} value={newRole} onChange={e=>setNewRole(e.target.value)}>
                  <option value="user">👤 Замерщик</option>
                  <option value="admin">👑 Администратор</option>
                  <option value="viewer">👁 Наблюдатель</option>
                </select>
              </div>
              <button onClick={addUser} className="btn btn-g" style={{width:"100%",marginTop:4}}>
                + Добавить
              </button>
            </div>

            {msg && <div style={{marginTop:12,textAlign:"center",fontSize:12,color: msg.startsWith("✓") ? "#059669" : "#dc2626"}}>{msg}</div>}
            {saving && <div style={{textAlign:"center",fontSize:11,color:"#9ca3af",marginTop:8}}>💾 Сохранение...</div>}
          </>
          </div>
        ) : (
          /* ═══ ВКЛАДКА ПРАЙС-ЛИСТ ═══ */
          <div style={{display:"flex",flexDirection:"column",height:"calc(88vh - 160px)"}}>
            {!localPrices ? <div style={{textAlign:"center",padding:30,color:"#9ca3af"}}>Загрузка...</div> : null}
            {localPrices && <>
              {/* Поиск — фиксированный */}
              <input
                style={{width:"100%",boxSizing:"border-box",background:"#ffffff",border:"1px solid #e5e7eb",color:"#111827",borderRadius:7,padding:"8px 12px",fontFamily:"inherit",fontSize:12,outline:"none",marginBottom:8}}
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
                            style={{flex:1,background:"#f3f4f6",border:"1px solid #e5e7eb",color:"#111827",borderRadius:5,padding:"3px 8px",fontFamily:"inherit",fontSize:11,fontWeight:700,outline:"none"}}/>
                          <button onClick={()=>renameCat(origCat,editingCat.val)} style={{...btnS,color:"#059669"}}>✓</button>
                          <button onClick={()=>setEditingCat(null)} style={{...btnS,color:"#9ca3af"}}>✕</button>
                        </div>
                      ) : (
                        <div style={{display:"flex",alignItems:"center",gap:4,padding:"4px 0",borderBottom:"1px solid #e5e7eb",marginBottom:6}}>
                          <span style={{fontSize:10,fontWeight:700,color:"#9ca3af",letterSpacing:.8,textTransform:"uppercase",flex:1}}>{cat}</span>
                          <button onClick={()=>setEditingCat({key:origCat,val:cat})} title="Переименовать категорию" style={{...btnS,color:"#9ca3af"}}>✏️</button>
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
                                style={{flex:1,background:"#f3f4f6",border:"1px solid #e5e7eb",color:"#9ca3af",borderRadius:5,padding:"2px 7px",fontFamily:"inherit",fontSize:10,outline:"none"}}/>
                              <button onClick={()=>renameSub(origCat,origSub,editingSub.val)} style={{...btnS,color:"#059669"}}>✓</button>
                              <button onClick={()=>setEditingSub(null)} style={{...btnS,color:"#9ca3af"}}>✕</button>
                            </div>
                          ) : (
                            <div style={{display:"flex",alignItems:"center",gap:3,paddingLeft:8,marginBottom:4}}>
                              <span style={{fontSize:9,fontWeight:700,color:"#9ca3af",letterSpacing:.8,textTransform:"uppercase",flex:1}}>{sub}</span>
                              <button onClick={()=>setEditingSub({cat:origCat,key:origSub,val:sub})} title="Переименовать подкатегорию" style={{...btnS,color:"#374151",fontSize:10}}>✏️</button>
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
                    const inpStyle = {background:"#f3f4f6",border:"1px solid #e5e7eb",color:"#111827",borderRadius:6,padding:"6px 9px",fontFamily:"inherit",fontSize:11,outline:"none",width:"100%",boxSizing:"border-box"};
                    const selStyle = {...inpStyle, cursor:"pointer"};
                    return (
                      <div>
                        <div style={{fontSize:11,fontWeight:600,color:"#374151",marginBottom:10}}>Новая позиция</div>

                        {/* Категория */}
                        <div style={{marginBottom:6}}>
                          <div style={{fontSize:10,color:"#9ca3af",marginBottom:3}}>Категория</div>
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
                          <div style={{fontSize:10,color:"#9ca3af",marginBottom:3}}>Подкатегория</div>
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
                            <div style={{fontSize:10,color:"#9ca3af",marginBottom:3}}>Название работы</div>
                            <input placeholder="напр. Укладка паркета" value={newWork.name}
                              onChange={e=>setNewWork(p=>({...p,name:e.target.value}))}
                              style={inpStyle}/>
                          </div>
                          <div>
                            <div style={{fontSize:10,color:"#9ca3af",marginBottom:3}}>Единица</div>
                            <select value={newWork.unit} onChange={e=>setNewWork(p=>({...p,unit:e.target.value}))} style={{...selStyle,width:80}}>
                              {["м²","м.п.","шт","усл.","кг","л"].map(u=><option key={u} value={u}>{u}</option>)}
                            </select>
                          </div>
                        </div>

                        <div style={{display:"flex",gap:6}}>
                          <button onClick={addCustomWork}
                            style={{flex:1,background:"#e5e7eb",color:"#9ca3af",border:"1px solid #e5e7eb",borderRadius:6,padding:"7px",fontFamily:"inherit",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                            ✓ Добавить
                          </button>
                          <button onClick={()=>{setShowAddWork(false);setNewWork({cat:"",sub:"",name:"",unit:"м²"});}}
                            style={{background:"rgba(220,38,38,.1)",color:"#dc2626",border:"1px solid rgba(220,38,38,.1)",borderRadius:6,padding:"7px 12px",fontFamily:"inherit",fontSize:12,cursor:"pointer"}}>
                            Отмена
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
              {/* Индикатор автосохранения */}
              <div style={{paddingTop:10,borderTop:"1px solid #e5e7eb",marginTop:6}}>
                {priceMsg && <div style={{textAlign:"center",fontSize:12,color:"#059669",fontWeight:700,marginBottom:6}}>{priceMsg}</div>}
                {priceSaving && <div style={{textAlign:"center",fontSize:11,color:"#9ca3af"}}>💾 Сохранение...</div>}
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
    const u = { id: genId(), login: newLogin.trim(), password: newPass.trim(), name: newName.trim(), role: newRole };
    const updated = [...users, u];
    setUsers(updated); await saveUsers(updated); await onUsersChanged();
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
    const updated = users.map(u => u.id === id ? {...u, password: editingPass.val.trim()} : u);
    setUsers(updated); await saveUsers(updated);
    setEditingPass(null); setMsg("✓ Пароль изменён"); setTimeout(() => setMsg(""), 2500);
  };
  const saveUser = async () => {
    if (!editingUser?.name?.trim() || !editingUser?.login?.trim()) return;
    const conflict = users.find(u => u.id !== editingUser.id && u.login.toLowerCase() === editingUser.login.trim().toLowerCase());
    if (conflict) { setMsg("Логин уже занят"); setTimeout(()=>setMsg(""),2000); return; }
    const updated = users.map(u => u.id === editingUser.id ? {...u, name: editingUser.name.trim(), login: editingUser.login.trim()} : u);
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
  const roleLabel = r => r==="admin" ? "👑 Администратор" : r==="viewer" ? "👁 Наблюдатель" : "👤 Замерщик";
  const roleColor = r => r==="admin" ? "#ffffff" : r==="viewer" ? "#9ca3af" : "#9ca3af";
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
      <div style={{marginBottom:24}}>
        <h1 style={{margin:0,fontSize:22,fontWeight:900,color:"#111827"}}>⚙️ Администрирование</h1>
        <div style={{fontSize:12,color:"#9ca3af",marginTop:4}}>Сотрудники и прайс-лист</div>
      </div>

      {/* Табы */}
      <div style={{display:"flex",gap:3,marginBottom:24,background:"#f3f4f6",borderRadius:10,padding:4}}>
        {[["users","👥 Сотрудники"],["clients","👥 Клиенты"],["contragents","🏢 Реквизиты"],["prices","💰 Прайс-лист"],["backups","🗄 Бэкапы"]].map(([t,label])=>(
          <button key={t} onClick={()=>{ setTab(t); setAdminSubTab("list"); }} style={{
            flex:1,padding:"11px",borderRadius:8,border:"none",cursor:"pointer",
            fontFamily:"inherit",fontSize:12,fontWeight:700,
            background: tab===t ? "#fff" : "transparent",
            color: tab===t ? "#111827" : "#6b7280",transition:"all .1s"
          }}>{label}</button>
        ))}
      </div>

      {loading ? (
        <div style={{textAlign:"center",padding:"60px 0",color:"#9ca3af"}}>
          <div style={{fontSize:24,marginBottom:8}}>⏳</div>Загрузка...
        </div>
      ) : tab === "users" ? (
        <div>
          {/* Список сотрудников */}
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:20}}>
            {users.map(u => (
              <div key={u.id} style={{background:"#f3f4f6",border:"1px solid #e5e7eb",borderRadius:6,padding:"16px 18px"}}>
                <div className="user-row" style={{display:"flex",alignItems:"center",gap:12}}>
                  {/* Аватар */}
                  <div style={{width:42,height:42,borderRadius:10,background:"#eff6ff",border:"1px solid #eff6ff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:18}}>
                    {u.role==="admin"?"👑":u.role==="viewer"?"👁":"👤"}
                  </div>
                  <div style={{flex:1,minWidth:120}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                      <span style={{fontWeight:700,fontSize:14,color:"#111827"}}>{u.name}</span>
                      <span style={{fontSize:10,fontWeight:700,color:roleColor(u.role),background:"rgba(0,0,0,.04)",borderRadius:4,padding:"2px 7px",whiteSpace:"nowrap"}}>{roleLabel(u.role)}</span>
                      {u.id === currentUser.id && <span style={{fontSize:10,color:"#9ca3af",background:"#e5e7eb",borderRadius:4,padding:"2px 7px"}}>вы</span>}
                      {(()=>{ const online = (presence[u.id]||0) > Date.now()-PRESENCE_ONLINE; return (
                        <span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:10,fontWeight:700,color:online?"#059669":"#9ca3af",background:online?"rgba(5,150,105,.1)":"rgba(0,0,0,.04)",borderRadius:4,padding:"2px 7px",whiteSpace:"nowrap"}}>
                          <span style={{width:6,height:6,borderRadius:"50%",background:online?"#059669":"#cbd5e1",display:"inline-block"}}/>
                          {online?"В сети":formatLastSeen(presence[u.id])}
                        </span>); })()}
                    </div>
                    <div style={{fontSize:12,color:"#9ca3af",marginTop:1}}>@{u.login}</div>
                  </div>
                  <div className="user-row-btns" style={{display:"flex",gap:6,flexShrink:0}}>
                    <button onClick={()=>{setEditingUser(editingUser?.id===u.id?null:{id:u.id,name:u.name,login:u.login});setEditingPass(null);}}
                      style={{background:"#e5e7eb",color:"#9ca3af",border:"1px solid #e5e7eb",borderRadius:7,padding:"6px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                      ✏ Изменить
                    </button>
                    <button onClick={()=>{setEditingPass(editingPass?.id===u.id?null:{id:u.id,val:""});setEditingUser(null);}}
                      style={{background:"#e5e7eb",color:"#9ca3af",border:"1px solid #e5e7eb",borderRadius:7,padding:"6px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                      🔑
                    </button>
                    {u.id !== currentUser.id && (
                      <button onClick={()=>removeUser(u.id)}
                        style={{background:"rgba(220,38,38,.1)",color:"#dc2626",border:"1px solid rgba(220,38,38,.1)",borderRadius:7,padding:"6px 10px",fontSize:12,cursor:"pointer"}}>✕</button>
                    )}
                  </div>
                </div>
                {editingUser?.id === u.id && (
                  <div style={{marginTop:14,paddingTop:14,borderTop:"1px solid #e5e7eb",display:"flex",flexDirection:"column",gap:10}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                      <div><div style={{fontSize:10,color:"#9ca3af",marginBottom:4}}>Имя</div><input className="fi" value={editingUser.name} onChange={e=>setEditingUser(p=>({...p,name:e.target.value}))}/></div>
                      <div><div style={{fontSize:10,color:"#9ca3af",marginBottom:4}}>Логин</div><input className="fi" value={editingUser.login} onChange={e=>setEditingUser(p=>({...p,login:e.target.value}))}/></div>
                    </div>
                    <button onClick={saveUser} style={{background:"#2563eb",color:"#f3f4f6",border:"none",borderRadius:8,padding:"10px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                      💾 Сохранить изменения
                    </button>
                  </div>
                )}
                {editingPass?.id === u.id && (
                  <div style={{marginTop:14,paddingTop:14,borderTop:"1px solid #e5e7eb",display:"flex",gap:8}}>
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
          <div style={{background:"#f3f4f6",border:"1px dashed #eff6ff",borderRadius:6,padding:"20px"}}>
            <div style={{fontSize:12,fontWeight:700,color:"#374151",marginBottom:14,display:"flex",alignItems:"center",gap:6}}>
              <span>＋</span> Новый сотрудник
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10,marginBottom:12}}>
              <div><div style={{fontSize:10,color:"#9ca3af",marginBottom:4}}>Имя</div><input className="fi" placeholder="Иван Иванов" value={newName} onChange={e=>setNewName(e.target.value)}/></div>
              <div><div style={{fontSize:10,color:"#9ca3af",marginBottom:4}}>Логин</div><input className="fi" placeholder="ivanov" value={newLogin} onChange={e=>setNewLogin(e.target.value)}/></div>
              <div><div style={{fontSize:10,color:"#9ca3af",marginBottom:4}}>Пароль</div><input className="fi" placeholder="••••••" value={newPass} onChange={e=>setNewPass(e.target.value)}/></div>
              <div><div style={{fontSize:10,color:"#9ca3af",marginBottom:4}}>Роль</div>
                <select className="fi" value={newRole} onChange={e=>setNewRole(e.target.value)}>
                  <option value="user">👤 Замерщик</option>
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
          {saving && <div style={{textAlign:"center",fontSize:11,color:"#9ca3af",marginTop:8}}>💾 Сохранение...</div>}
        </div>
      ) : tab === "clients" ? (
        /* КЛИЕНТЫ */
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {adminSubTab === "list" && (<>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontWeight:700,color:"#9ca3af",fontSize:12}}>КЛИЕНТЫ ({clients.length})</div>
              {currentUser.role !== "viewer" && (
                <button onClick={()=>{ setAdminEditItem({mode:"newClient",data:{id:Date.now().toString(),name:"",phone:"",address:"",iin:"",doc:"",type:"физ",createdAt:Date.now(),createdById:currentUser.id}}); setAdminSubTab("clientEditor"); }}
                  className="btn btn-g" style={{fontSize:12,padding:"6px 12px"}}>+ Добавить</button>
              )}
            </div>
            {clients.length===0&&<div style={{textAlign:"center",padding:"40px 0",color:"#374151",fontSize:13}}>Клиентов пока нет</div>}
            {clients.map(c=>(
              <div key={c.id} style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:10,padding:"14px 16px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:14,color:"#111827"}}>{c.name||"Без имени"}</div>
                    <div style={{fontSize:11,color:"#9ca3af",marginTop:3}}>
                      {c.type==="физ"?"👤 Физ. лицо":"🏢 Юр. лицо"}
                      {c.iin&&<span style={{marginLeft:8}}>ИИН: {c.iin}</span>}
                    </div>
                    {c.phone&&<div style={{fontSize:12,color:"#9ca3af",marginTop:1}}>📞 {c.phone}</div>}
                    {c.address&&<div style={{fontSize:12,color:"#9ca3af",marginTop:1}}>📍 {c.address}</div>}
                  </div>
                  <div style={{display:"flex",gap:5}}>
                    {(currentUser.role==="admin"||(currentUser.role==="user"&&c.createdById===currentUser.id))&&(
                      <button onClick={()=>{ setAdminEditItem({mode:"editClient",data:{...c}}); setAdminSubTab("clientEditor"); }}
                        style={{background:"#e5e7eb",color:"#9ca3af",border:"1px solid #e5e7eb",borderRadius:5,padding:"3px 9px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>✎</button>
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
              <button onClick={()=>setAdminSubTab("list")} style={{background:"none",border:"none",color:"#9ca3af",cursor:"pointer",fontSize:18}}>←</button>
              <span style={{fontWeight:700,fontSize:15,color:"#111827"}}>{adminEditItem.mode==="newClient"?"Новый клиент":"Редактировать клиента"}</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div>
                <div style={{fontSize:11,color:"#9ca3af",marginBottom:4}}>Тип</div>
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
                  <div style={{fontSize:11,color:"#9ca3af",marginBottom:4}}>{label}</div>
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
              <div style={{fontWeight:700,color:"#9ca3af",fontSize:12}}>МОИ ЮР. ЛИЦА / РЕКВИЗИТЫ ({contragents.length})</div>
              {currentUser.role==="admin" && (
                <button onClick={()=>{ setAdminEditItem({mode:"newCA",data:{id:Date.now().toString(),name:"",bin:"",bank:"",bik:"",account:"",director:"",phone:"",email:"",address:""}}); setAdminSubTab("caEditor"); }}
                  className="btn btn-g" style={{fontSize:12,padding:"6px 12px"}}>+ Добавить</button>
              )}
            </div>
            {contragents.map(c=>(
              <div key={c.id} style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:10,padding:"14px 16px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:14,color:"#111827"}}>{c.name}</div>
                    <div style={{fontSize:12,color:"#9ca3af",marginTop:1}}>БИН: {c.bin} · {c.bank}</div>
                    <div style={{fontSize:12,color:"#9ca3af",marginTop:1}}>Директор: {c.director} · {c.phone}</div>
                  </div>
                  {currentUser.role==="admin" && (
                    <div style={{display:"flex",gap:5}}>
                      <button onClick={()=>{ setAdminEditItem({mode:"editCA",data:{...c}}); setAdminSubTab("caEditor"); }}
                        style={{background:"#e5e7eb",color:"#9ca3af",border:"1px solid #e5e7eb",borderRadius:5,padding:"3px 9px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>✎</button>
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
              <button onClick={()=>setAdminSubTab("list")} style={{background:"none",border:"none",color:"#9ca3af",cursor:"pointer",fontSize:18}}>←</button>
              <span style={{fontWeight:700,fontSize:15,color:"#111827"}}>{adminEditItem.mode==="newCA"?"Новые реквизиты":"Редактировать реквизиты"}</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div style={{gridColumn:"1/-1"}}>
                <div style={{fontSize:11,color:"#9ca3af",marginBottom:4}}>Файл печати</div>
                <select className="fi" value={adminEditItem.data.stampFile||"stamp.jpg"} onChange={e=>setAdminEditItem(p=>({...p,data:{...p.data,stampFile:e.target.value}}))}>
                  <option value="stamp.jpg">stamp.jpg</option>
                  <option value="stamp2.jpg">stamp2.jpg</option>
                </select>
              </div>
              {[["Название","name"],["БИН","bin"],["Банк","bank"],["БИК","bik"],["Расчётный счёт","account"],["Директор","director"],["Телефон","phone"],["Email","email"],["Адрес","address"]].map(([label,field])=>(
                <div key={field}>
                  <div style={{fontSize:11,color:"#9ca3af",marginBottom:4}}>{label}</div>
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
              style={{background:"rgba(0,0,0,.03)",color:"#6b7280",border:"1px solid #e5e7eb",borderRadius:8,padding:"7px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
              🕘 Бэкапы
            </button>
          </div>

          {/* Модал бэкапов каталога */}
          {catalogBackupsModal !== null && (
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:320,padding:16}} onClick={()=>setCatalogBackupsModal(null)}>
              <div style={{background:"#fff",borderRadius:10,padding:"20px 22px",maxWidth:480,width:"100%",maxHeight:"80vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <div style={{fontWeight:800,fontSize:16,color:"#111827"}}>🕘 Бэкапы каталога</div>
                  <button onClick={()=>setCatalogBackupsModal(null)} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:"#9ca3af"}}>✕</button>
                </div>
                <div style={{fontSize:12,color:"#9ca3af",marginBottom:14}}>Снимки каталога перед каждым изменением (последние 10). Можно откатиться к любому.</div>
                {catalogBackupsModal.length===0 && <div style={{textAlign:"center",padding:"30px 0",color:"#9ca3af",fontSize:13}}>Бэкапов каталога пока нет — они появятся после первого изменения прайс-листа</div>}
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {catalogBackupsModal.map((snap,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"10px 12px",background:"#f9fafb",border:"1px solid #e5e7eb",borderRadius:8}}>
                      <div>
                        <div style={{fontSize:13,fontWeight:600,color:"#111827"}}>{new Date(snap.ts).toLocaleString("ru-RU")}</div>
                        <div style={{fontSize:11,color:"#9ca3af"}}>{i===0?"последний":""}</div>
                      </div>
                      <button onClick={()=>restoreCatalogBackup(snap)}
                        style={{background:"#eff6ff",color:"#2563eb",border:"1px solid rgba(37,99,235,.2)",borderRadius:6,padding:"6px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
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
              <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:12,padding:"8px 10px",background:"#f3f4f6",borderRadius:8,border:"1px solid #e5e7eb"}}>
                <span style={{fontSize:10,color:"#9ca3af",alignSelf:"center",marginRight:4,whiteSpace:"nowrap"}}>↓ Перейти:</span>
                {navCats.map(cat=>(
                  <button key={cat} onClick={()=>document.getElementById("price-cat-"+cat.replace(/\s/g,"_"))?.scrollIntoView({behavior:"smooth",block:"start"})}
                    style={{fontSize:11,padding:"3px 10px",borderRadius:5,border:"1px solid #e5e7eb",background:"#ffffff",color:"#374151",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
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
            const inp = {background:"#f3f4f6",border:"1px solid #e5e7eb",color:"#111827",borderRadius:6,padding:"7px 10px",fontFamily:"inherit",fontSize:12,outline:"none"};
            return (
              <div style={{background:"#f3f4f6",border:"1px solid #eff6ff",borderRadius:10,padding:"16px",marginBottom:16}}>
                <div style={{fontSize:13,fontWeight:700,color:"#374151",marginBottom:12}}>Новая позиция</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10,marginBottom:12}}>
                  <div>
                    <div style={{fontSize:10,color:"#9ca3af",marginBottom:4}}>Категория</div>
                    <select value={newWork.cat} onChange={e=>setNewWork(p=>({...p,cat:e.target.value,sub:""}))} style={{...inp,width:"100%",cursor:"pointer"}}>
                      {cats.map(c=><option key={c} value={c}>{c}</option>)}
                      <option value="__new__">＋ Новая категория...</option>
                    </select>
                    {newWork.cat==="__new__"&&<input autoFocus placeholder="Название" value={newWork.catNew||""} onChange={e=>setNewWork(p=>({...p,catNew:e.target.value}))} style={{...inp,width:"100%",marginTop:6}}/>}
                  </div>
                  <div>
                    <div style={{fontSize:10,color:"#9ca3af",marginBottom:4}}>Подкатегория</div>
                    <select value={newWork.sub} onChange={e=>setNewWork(p=>({...p,sub:e.target.value}))} style={{...inp,width:"100%",cursor:"pointer"}} disabled={!newWork.cat}>
                      <option value="">— выбрать —</option>
                      {subs.map(s=><option key={s} value={s}>{s}</option>)}
                      <option value="__new__">＋ Новая подкатегория...</option>
                    </select>
                    {newWork.sub==="__new__"&&<input autoFocus placeholder="Название" value={newWork.subNew||""} onChange={e=>setNewWork(p=>({...p,subNew:e.target.value}))} style={{...inp,width:"100%",marginTop:6}}/>}
                  </div>
                  <div>
                    <div style={{fontSize:10,color:"#9ca3af",marginBottom:4}}>Название работы</div>
                    <input placeholder="напр. Укладка паркета" value={newWork.name} onChange={e=>setNewWork(p=>({...p,name:e.target.value}))} style={{...inp,width:"100%"}}/>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:"#9ca3af",marginBottom:4}}>Ед. измерения</div>
                    <select value={newWork.unit} onChange={e=>setNewWork(p=>({...p,unit:e.target.value}))} style={{...inp,width:"100%",cursor:"pointer"}}>
                      {["м²","м.п.","шт","усл.","кг","л"].map(u=><option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:"#9ca3af",marginBottom:4}}>Себестоимость ₸</div>
                    <input type="number" min="0" placeholder="0" value={newWork.cost||""} onChange={e=>setNewWork(p=>({...p,cost:e.target.value}))} style={{...inp,width:"100%"}}/>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:"#9ca3af",marginBottom:4}}>Маржа %</div>
                    <input type="number" min="0" max="100" placeholder="40" value={newWork.margin||""} onChange={e=>setNewWork(p=>({...p,margin:e.target.value}))} style={{...inp,width:"100%"}}/>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:"#b8904a",marginBottom:4}}>Цена от ₸ <span style={{color:"#9ca3af"}}>(если нет точной)</span></div>
                    <input type="number" min="0" placeholder="необязательно" value={newWork.priceFrom||""} onChange={e=>setNewWork(p=>({...p,priceFrom:e.target.value}))} style={{...inp,width:"100%"}}/>
                  </div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={addCustomWork} style={{flex:1,background:"#e5e7eb",color:"#9ca3af",border:"1px solid #e5e7eb",borderRadius:8,padding:"10px",fontFamily:"inherit",fontSize:13,fontWeight:700,cursor:"pointer"}}>✓ Добавить</button>
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
                    <th key={i} style={{padding:"10px 12px",textAlign:i>=3&&i<=7?"right":"left",fontSize:10,fontWeight:700,color:h==="Цена от ₸"?"#b8904a":"#9ca3af",textTransform:"uppercase",letterSpacing:.5,borderBottom:"2px solid #e5e7eb",whiteSpace:"normal",overflowWrap:"anywhere",wordBreak:"break-word",lineHeight:1.2,verticalAlign:"bottom"}}>
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
                                  style={{background:"#f3f4f6",border:"1px solid #e5e7eb",color:"#111827",borderRadius:5,padding:"3px 10px",fontFamily:"inherit",fontSize:12,fontWeight:800,outline:"none",width:200}}/>
                                <button onClick={()=>renameCat(origCat,editingCat.val)} style={{...btnS,color:"#059669",fontSize:14}}>✓</button>
                                <button onClick={()=>setEditingCat(null)} style={{...btnS,color:"#374151",fontSize:14}}>✕</button>
                              </>
                            ) : (
                              <>
                                <span style={{fontSize:11,fontWeight:700,color:"#374151",letterSpacing:.5,textTransform:"uppercase"}}>{cat}</span>
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
                            <td style={{padding:"8px 12px",verticalAlign:"top",borderRight:"1px solid #e5e7eb",color:i===0?"#9ca3af":"transparent",fontSize:11}}>
                              {i===0 && (
                                <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
                                  {editingSub?.cat===origCat&&editingSub?.key===origSub ? (
                                    <span style={{display:"contents"}}>
                                      <input autoFocus value={editingSub.val} onChange={e=>setEditingSub(p=>({...p,val:e.target.value}))}
                                        onKeyDown={e=>{if(e.key==="Enter")renameSub(origCat,origSub,editingSub.val);if(e.key==="Escape")setEditingSub(null);}}
                                        style={{background:"#f3f4f6",border:"1px solid #e5e7eb",color:"#9ca3af",borderRadius:5,padding:"2px 7px",fontFamily:"inherit",fontSize:11,outline:"none",width:120}}/>
                                      <button onClick={()=>renameSub(origCat,origSub,editingSub.val)} style={{...btnS,color:"#059669",fontSize:12}}>✓</button>
                                      <button onClick={()=>setEditingSub(null)} style={{...btnS,color:"#9ca3af",fontSize:12}}>✕</button>
                                    </span>
                                  ) : (
                                    <span style={{display:"contents"}}>
                                      <span style={{color:"#9ca3af",fontSize:11}}>{sub}</span>
                                      <button onClick={()=>setEditingSub({cat:origCat,key:origSub,val:sub})} style={{...btnS,color:"#9ca3af",fontSize:10,opacity:.6}}>✏️</button>
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
                                    style={{flex:1,background:"#f3f4f6",border:"1px solid #2563eb",color:"#111827",borderRadius:5,padding:"3px 8px",fontFamily:"inherit",fontSize:12,outline:"none"}}/>
                                  <button onClick={()=>{renameWork(w.code,editingUser.name);setEditingUser(null);}} style={{...btnS,color:"#059669",fontSize:13}}>✓</button>
                                  <button onClick={()=>setEditingUser(null)} style={{...btnS,color:"#374151",fontSize:13}}>✕</button>
                                </div>
                              ) : (
                                <div style={{display:"flex",alignItems:"center",gap:4}}>
                                  <span style={{color:"#111827",flex:1}}>{w.name}</span>
                                  <button onClick={()=>setEditingUser({id:w.code,name:w.name})} style={{...btnS,color:"#9ca3af",fontSize:10,opacity:.5,flexShrink:0}}>✏️</button>
                                </div>
                              )}
                            </td>
                            {/* Ед. */}
                            <td style={{padding:"6px 8px",color:"#9ca3af",textAlign:"center",fontSize:11}}>{w.unit}</td>
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
                                style={{width:"100%",background:"#f3f4f6",border:"1px solid #e5e7eb",color:"#111827",borderRadius:5,padding:"4px 8px",textAlign:"right",fontFamily:"inherit",fontSize:12,outline:"none"}}
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
                                  style={{width:50,background:"#f3f4f6",border:"1px solid #e5e7eb",color:"#111827",borderRadius:5,padding:"4px 6px",textAlign:"right",fontFamily:"inherit",fontSize:12,outline:"none"}}
                                />
                                <span style={{color:"#9ca3af",fontSize:10}}>%</span>
                              </div>
                            </td>
                            {/* Цена для клиента */}
                            <td style={{padding:"6px 12px",textAlign:"right",fontWeight:700,color:"#111827",whiteSpace:"nowrap"}}>
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
                  if(rows.length===0) rows.push(<tr key="empty"><td colSpan={9} style={{textAlign:"center",padding:"40px",color:"#9ca3af"}}>Ничего не найдено</td></tr>);
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
            <div style={{position:"fixed",bottom:0,left:"220px",right:0,background:"#f3f4f6",borderTop:"1px solid #e5e7eb",padding:"10px 24px",zIndex:20,textAlign:"center"}}>
              {priceMsg && <span style={{fontSize:13,color:"#059669",fontWeight:700}}>{priceMsg}</span>}
              {priceSaving && !priceMsg && <span style={{fontSize:12,color:"#9ca3af"}}>💾 Сохранение...</span>}
            </div>
          )}
        </div>
      ) : null}

      {/* ── БЭКАПЫ ── */}
      {tab === "backups" && (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={{fontWeight:700,color:"#374151",fontSize:14,marginBottom:4}}>Восстановление данных</div>
          <div style={{fontSize:12,color:"#9ca3af",marginBottom:8}}>Снимки рабочего пространства создаются автоматически. Каждый снимок — это все объекты вместе с их сметами и договорами. Восстановление возвращает всё целиком на выбранный момент.</div>
          <div style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:10,padding:"16px 18px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
            <div>
              <div style={{fontWeight:700,fontSize:14,color:"#111827"}}>📦 Объекты, сметы и договора</div>
              <div style={{fontSize:12,color:"#9ca3af",marginTop:2}}>Единый снимок: объекты + вложенные сметы и договора</div>
            </div>
            <button onClick={onBackupWorkspace} style={{background:"rgba(37,99,235,.08)",color:"#2563eb",border:"1px solid rgba(37,99,235,.2)",borderRadius:8,padding:"8px 16px",fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",fontWeight:700}}>
              🕘 Просмотреть бэкапы
            </button>
          </div>
        </div>
      )}
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
];
const TYPE_LABELS = { repair_fiz:"Договор ремонта", annex:"Приложение", design:"Дизайн-проект", design_add:"Доп. соглашение дизайн", reservation:"Бронь" };

function ContractEditor({ contract, clients, contragents, onUpdate, onBack, onSave, onPdf, onGDoc, onAddClientFromEstimate, onUpdateClient, currentUserRole, fmt }) {
  const [withStamp, setWithStamp] = useState(true);
  const [showClientForm, setShowClientForm] = useState(false);
  const type = contract.type || "repair_fiz";
  const total = (contract.works||[]).reduce((s,w)=>s+(Number(w.quantity)*Number(w.price)||0),0);
  const upd = (patch) => onUpdate(prev=>({...prev,...patch}));

  const isRepair   = type==="repair_fiz";
  const isAnnex    = type==="annex";
  const isDesign   = type==="design";
  const isDesAdd   = type==="design_add";
  const isRes      = type==="reservation";
  const hasWorks   = isRepair || isAnnex;
  const hasMainRef = isAnnex || isDesAdd;

  const fi = {background:"#f3f4f6",border:"1px solid #e5e7eb",borderRadius:6,color:"#111827",fontSize:13,padding:"8px 10px",fontFamily:"inherit",width:"100%"};

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:"#9ca3af",cursor:"pointer",fontSize:18}}>←</button>
        <span style={{fontWeight:700,fontSize:15,color:"#111827"}}>{contract.number ? `${TYPE_LABELS[type]||""} №${contract.number}` : "Новый документ"}</span>
      </div>

      {/* Тип документа + статус */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div>
          <div style={{fontSize:11,color:"#9ca3af",marginBottom:4}}>Тип документа</div>
          <select style={fi} value={type} onChange={e=>upd({type:e.target.value})}>
            {DOC_TYPES.map(d=><option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </div>
        <div>
          <div style={{fontSize:11,color:"#9ca3af",marginBottom:4}}>Статус</div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            {CONTRACT_STATUSES.map(s=>(
              <button key={s.key} onClick={()=>upd({contractStatus:s.key})}
                style={{background:(contract.contractStatus||"draft")===s.key?s.bg:"rgba(0,0,0,.03)",color:(contract.contractStatus||"draft")===s.key?s.color:"#9ca3af",border:`1px solid ${(contract.contractStatus||"draft")===s.key?s.color:"#e5e7eb"}`,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",transition:"all .15s"}}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Основные поля — номер и дата */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div>
          <div style={{fontSize:11,color:"#9ca3af",marginBottom:4}}>{isAnnex?"Приложение №":isDesAdd?"Номер доп. соглашения":"Номер договора/соглашения"}</div>
          {isAnnex
            ? <input className="fi" type="number" min="2" value={contract.appendix||2} onChange={e=>upd({appendix:parseInt(e.target.value)||2})}/>
            : <input className="fi" value={contract.number||""} onChange={e=>upd({number:e.target.value})} placeholder="0001#202020"/>}
        </div>
        <div>
          <div style={{fontSize:11,color:"#9ca3af",marginBottom:4}}>{isAnnex?"Дата приложения":"Дата"}</div>
          <input className="fi" type="date" value={isAnnex?(contract.annexDate||contract.date||""):(contract.date||"")} onChange={e=>upd(isAnnex?{annexDate:e.target.value}:{date:e.target.value})}/>
        </div>
      </div>

      {/* Ссылка на основной договор (для Приложений и Доп.соглашений) */}
      {hasMainRef && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div>
            <div style={{fontSize:11,color:"#9ca3af",marginBottom:4}}>{isDesAdd?"Номер соглашения о дизайне":"Номер основного договора"}</div>
            <input className="fi" value={contract.mainNumber||""} onChange={e=>upd({mainNumber:e.target.value})} placeholder="0819#128"/>
          </div>
          <div>
            <div style={{fontSize:11,color:"#9ca3af",marginBottom:4}}>{isDesAdd?"Дата соглашения о дизайне":"Дата основного договора"}</div>
            <input className="fi" type="date" value={contract.mainDate||""} onChange={e=>upd({mainDate:e.target.value})}/>
          </div>
        </div>
      )}

      {/* Доп поля: резервирование */}
      {isRes && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div>
            <div style={{fontSize:11,color:"#9ca3af",marginBottom:4}}>Сумма резервирования (₸)</div>
            <input className="fi" type="number" value={contract.reserveAmount||50000} onChange={e=>upd({reserveAmount:parseFloat(e.target.value)||0})}/>
          </div>
          <div>
            <div style={{fontSize:11,color:"#9ca3af",marginBottom:4}}>Дата начала работ (п.2.1)</div>
            <input className="fi" type="date" value={contract.reserveStartDate||""} onChange={e=>upd({reserveStartDate:e.target.value})}/>
          </div>
        </div>
      )}

      {/* Доп поля: дизайн */}
      {isDesign && (
        <div>
          <div style={{fontSize:11,color:"#9ca3af",marginBottom:4}}>Предоплата (₸)</div>
          <input className="fi" type="number" value={contract.designAdvance||25000} onChange={e=>upd({designAdvance:parseFloat(e.target.value)||0})}/>
        </div>
      )}

      {/* Доп поля: доп. соглашение к дизайну */}
      {isDesAdd && (<>\
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div>
            <div style={{fontSize:11,color:"#9ca3af",marginBottom:4}}>Площадь объекта (м²)</div>
            <input className="fi" type="number" value={contract.area||""} onChange={e=>upd({area:e.target.value})} placeholder="85"/>
          </div>
          <div>
            <div style={{fontSize:11,color:"#9ca3af",marginBottom:4}}>Срок выполнения (раб. дней)</div>
            <input className="fi" type="number" value={contract.deadline||""} onChange={e=>upd({deadline:e.target.value})} placeholder="30"/>
          </div>
          <div>
            <div style={{fontSize:11,color:"#9ca3af",marginBottom:4}}>Вариантов планировки</div>
            <input className="fi" type="number" min="1" value={contract.variantsLayout||""} onChange={e=>upd({variantsLayout:e.target.value})} placeholder="2"/>
          </div>
          <div>
            <div style={{fontSize:11,color:"#9ca3af",marginBottom:4}}>Раундов корр. планировки</div>
            <input className="fi" type="number" min="0" value={contract.corrLayout||""} onChange={e=>upd({corrLayout:e.target.value})} placeholder="2"/>
          </div>
          <div>
            <div style={{fontSize:11,color:"#9ca3af",marginBottom:4}}>Раундов корр. визуализаций</div>
            <input className="fi" type="number" min="0" value={contract.corrVis||""} onChange={e=>upd({corrVis:e.target.value})} placeholder="2"/>
          </div>
        </div>
        {/* Тип стоимости */}
        <div>
          <div style={{fontSize:11,color:"#9ca3af",marginBottom:6}}>Способ расчёта стоимости</div>
          <div style={{display:"flex",gap:16,marginBottom:8}}>
            <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"#9ca3af",cursor:"pointer"}}>
              <input type="radio" name="priceType" checked={!contract.priceType||contract.priceType==="fixed"}
                onChange={()=>upd({priceType:"fixed"})}/> Фиксированная сумма
            </label>
            <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"#9ca3af",cursor:"pointer"}}>
              <input type="radio" name="priceType" checked={contract.priceType==="sqm"}
                onChange={()=>upd({priceType:"sqm"})}/> За м²
            </label>
          </div>
          {(!contract.priceType||contract.priceType==="fixed") ? (
            <div>
              <div style={{fontSize:11,color:"#9ca3af",marginBottom:4}}>Итоговая стоимость (₸)</div>
              <input className="fi" type="number" value={contract.totalCost||""} onChange={e=>upd({totalCost:parseFloat(e.target.value)||0})} placeholder="170000"/>
            </div>
          ) : (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div>
                <div style={{fontSize:11,color:"#9ca3af",marginBottom:4}}>Цена за м² (₸)</div>
                <input className="fi" type="number" value={contract.pricePerSqm||""} onChange={e=>upd({pricePerSqm:parseFloat(e.target.value)||0})} placeholder="2000"/>
              </div>
              <div>
                <div style={{fontSize:11,color:"#9ca3af",marginBottom:4}}>Итого (авто, ₸)</div>
                <div className="fi" style={{background:"#e5e7eb",color:"#374151",fontWeight:600,display:"flex",alignItems:"center"}}>
                  {fmt(Math.round((contract.pricePerSqm||0)*(contract.area||0)))} ₸
                </div>
              </div>
            </div>
          )}
        </div>
        <div>
          <div style={{fontSize:11,color:"#9ca3af",marginBottom:4}}>Предоплата уже внесена (₸)</div>
          <input className="fi" type="number" value={contract.designAdvance||25000} onChange={e=>upd({designAdvance:parseFloat(e.target.value)||0})}/>
        </div>
        <div>
          <div style={{fontSize:11,color:"#9ca3af",marginBottom:6}}>Состав дизайн-проекта</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            {[["plan","Обмерочный план"],["layout","Планировочное решение"],["concept","Концепция интерьера"],["vis3d","3D визуализация"],["drawings","Рабочие чертежи"],["materials","Ведомость материалов"]].map(([k,l])=>(
              <label key={k} style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"#9ca3af",cursor:"pointer"}}>
                <input type="checkbox" checked={!!(contract.composition||{})[k]} onChange={e=>upd({composition:{...(contract.composition||{}),[k]:e.target.checked}})}/>
                {l}
              </label>
            ))}
          </div>
        </div>
      </>)}

      {/* Клиент */}
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div style={{fontSize:12,fontWeight:700,color:"#9ca3af"}}>ЗАКАЗЧИК</div>
          {contract.estClient && !contract.clientId && (
            <div style={{fontSize:11,color:"#d97706"}}>⚠ Из сметы: {contract.estClient}</div>
          )}
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <select className="fi" style={{flex:1}} value={contract.clientId||""} onChange={e=>upd({clientId:e.target.value})}>
            <option value="">— Выбрать клиента —</option>
            {clients.map(c=>(<option key={c.id} value={c.id}>{c.name}{c.clientType==="yur" || c.type==="юр" ? " (ЮР)" : ""}</option>))}
          </select>
          {contract.clientId && (
            <button onClick={()=>setShowClientForm(s=>!s)}
              style={{background:showClientForm?"#eff6ff":"#f3f4f6",color:"#2563eb",border:"1px solid #e5e7eb",borderRadius:6,padding:"8px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
              ✎ Данные
            </button>
          )}
        </div>
        {!contract.clientId && contract.estClient && (
          <button onClick={async ()=>{ await onAddClientFromEstimate(); setShowClientForm(true); }}
            style={{marginTop:6,background:"#eff6ff",color:"#059669",border:"1px solid #eff6ff",borderRadius:6,padding:"5px 12px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>
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
            <div style={{marginTop:8,padding:"12px 14px",background:"#f3f4f6",border:"1px solid #e5e7eb",borderRadius:8,display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div>
                <div style={{fontSize:11,color:"#9ca3af",marginBottom:4}}>Тип</div>
                <select className="fi" value={cl.type||"физ"} onChange={e=>updCl({type:e.target.value})}>
                  <option value="физ">Физ. лицо</option>
                  <option value="юр">Юр. лицо</option>
                </select>
              </div>
              {fields.map(([label,field])=>(
                <div key={field}>
                  <div style={{fontSize:11,color:"#9ca3af",marginBottom:4}}>{label}</div>
                  <input className="fi" value={cl[field]||""} onChange={e=>updCl({[field]:e.target.value})} placeholder={label}/>
                </div>
              ))}
              <div style={{gridColumn:"1 / -1",fontSize:10,color:"#9ca3af"}}>✓ Изменения сохраняются автоматически в карточку клиента</div>
            </div>
          );
        })()}
      </div>
      {/* Подрядчик */}
      <div>
        <div style={{fontSize:12,fontWeight:700,color:"#9ca3af",marginBottom:8}}>ПОДРЯДЧИК</div>
        <select className="fi" value={contract.contragentId||""} onChange={e=>upd({contragentId:e.target.value})}>
          <option value="">— Выбрать ТОО —</option>
          {contragents.map(c=>(<option key={c.id} value={c.id}>{c.name}</option>))}
        </select>
      </div>
      {/* Работы — только для ремонта и приложений */}
      {hasWorks && <div>
        <div style={{fontSize:12,fontWeight:700,color:"#9ca3af",marginBottom:8}}>РАБОТЫ ({(contract.works||[]).length})</div>
        <div style={{background:"#f3f4f6",borderRadius:8,overflow:"hidden",border:"1px solid #e5e7eb"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 70px 55px 80px 80px 30px",padding:"8px 12px",background:"#f3f4f6",fontSize:10,color:"#9ca3af",fontWeight:700}}>
            <span>НАИМЕНОВАНИЕ</span><span style={{textAlign:"center"}}>КОЛ-ВО</span><span style={{textAlign:"center"}}>ЕД.</span><span style={{textAlign:"right"}}>ЦЕНА</span><span style={{textAlign:"right"}}>СУММА</span><span/>
          </div>
          {(contract.works||[]).map((w,i)=>(
            <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 70px 55px 80px 80px 30px",gap:4,padding:"6px 12px",borderTop:"1px solid #e5e7eb",alignItems:"center"}}>
              <input value={w.name||""} onChange={e=>{const ws=[...(contract.works||[])];ws[i]={...ws[i],name:e.target.value};upd({works:ws});}}
                style={{background:"transparent",border:"none",color:"#111827",fontSize:12,fontFamily:"inherit",padding:0,outline:"none",width:"100%"}}/>
              <input type="number" value={w.quantity||""} onChange={e=>{const ws=[...(contract.works||[])];ws[i]={...ws[i],quantity:parseFloat(e.target.value)||0};upd({works:ws});}}
                style={{background:"#ffffff",border:"1px solid #e5e7eb",color:"#111827",fontSize:11,borderRadius:4,padding:"3px 5px",textAlign:"center",fontFamily:"inherit",width:"100%"}}/>
              <input value={w.unit||"м²"} onChange={e=>{const ws=[...(contract.works||[])];ws[i]={...ws[i],unit:e.target.value};upd({works:ws});}}
                style={{background:"#ffffff",border:"1px solid #e5e7eb",color:"#111827",fontSize:11,borderRadius:4,padding:"3px 5px",textAlign:"center",fontFamily:"inherit",width:"100%"}}/>
              <input type="number" value={w.price||""} onChange={e=>{const ws=[...(contract.works||[])];ws[i]={...ws[i],price:parseFloat(e.target.value)||0};upd({works:ws});}}
                style={{background:"#ffffff",border:"1px solid #e5e7eb",color:"#111827",fontSize:11,borderRadius:4,padding:"3px 5px",textAlign:"right",fontFamily:"inherit",width:"100%"}}/>
              <div style={{fontSize:12,fontWeight:700,color:"#111827",textAlign:"right"}}>{fmt(Number(w.quantity)*Number(w.price)||0)}</div>
              <button onClick={()=>{const ws=(contract.works||[]).filter((_,j)=>j!==i);upd({works:ws});}}
                style={{background:"none",border:"none",color:"#dc2626",cursor:"pointer",fontSize:14,padding:0}}>✕</button>
            </div>
          ))}
          <div style={{padding:"8px 12px",borderTop:"1px solid #e5e7eb",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <button onClick={()=>upd({works:[...(contract.works||[]),{name:"",quantity:0,unit:"м²",price:0}]})}
              className="btn btn-g" style={{fontSize:11,padding:"5px 12px"}}>
              + Добавить позицию
            </button>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{display:"flex",alignItems:"center",gap:5,fontSize:12,color:"#9ca3af"}}>
                <span>Скидка</span>
                <input type="number" min="0" max="100" value={contract.discount||0}
                  onChange={e=>upd({discount:Math.min(100,Math.max(0,Number(e.target.value)||0))})}
                  style={{width:46,background:"#f3f4f6",border:"1px solid #e5e7eb",color:"#111827",borderRadius:4,padding:"3px 6px",fontSize:11,textAlign:"right",fontFamily:"inherit",outline:"none"}}/>
                <span>%</span>
              </div>
              {(contract.discount||0)>0 ? (
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:11,color:"#dc2626"}}>− {fmt(Math.round(total*(contract.discount||0)/100))} ₸</div>
                  <div style={{fontWeight:800,fontSize:16,color:"#111827"}}>{fmt(Math.round(total*(1-(contract.discount||0)/100)))} ₸</div>
                </div>
              ) : (
                <div style={{fontWeight:800,fontSize:16,color:"#111827"}}>{fmt(total)} ₸</div>
              )}
            </div>
          </div>
        </div>
      </div>}
      {/* Предоплата для ремонтных договоров */}
      {isRepair && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div>
            <div style={{fontSize:11,color:"#9ca3af",marginBottom:4}}>Предоплата (%)</div>
            <input className="fi" type="number" min="0" max="100" value={contract.advancePercent??30}
              onChange={e=>upd({advancePercent:parseFloat(e.target.value)||0})} placeholder="30"/>
          </div>
          <div>
            <div style={{fontSize:11,color:"#9ca3af",marginBottom:4}}>Сумма предоплаты (₸)</div>
            <div className="fi" style={{background:"#e5e7eb",color:"#374151",fontWeight:600,display:"flex",alignItems:"center"}}>
              {fmt(Math.round(total*(contract.advancePercent??30)/100))} ₸
            </div>
          </div>
        </div>
      )}
      {/* Примечание */}
      <div>
        <div style={{fontSize:11,color:"#9ca3af",marginBottom:4}}>Примечание</div>
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
            <div style={{width:28,height:16,borderRadius:8,background:withStamp?"#2563eb":"#e5e7eb",position:"relative",transition:"background .2s",flexShrink:0}}>
              <div style={{position:"absolute",top:2,left:withStamp?12:2,width:12,height:12,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
            </div>
            <span style={{fontSize:10,color:withStamp?"#2563eb":"#9ca3af"}}>С печатью</span>
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
        <button onClick={onBack} style={{background:"none",border:"none",color:"#9ca3af",cursor:"pointer",fontSize:18}}>←</button>
        <span style={{fontWeight:700,fontSize:15,color:"#111827"}}>{client?.name || "Новая сделка"}</span>
      </div>

      {/* ВОРОНКА СТАТУСОВ */}
      <div>
        <div style={{fontSize:11,color:"#9ca3af",marginBottom:6}}>Этап сделки</div>
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
          {DEAL_STATUSES.map((s,i)=>{
            const active = (deal.status||"lead")===s.key;
            const passed = i<stIdx;
            return (
              <button key={s.key} disabled={readonly} onClick={()=>upd({status:s.key})}
                style={{background:active?s.bg:passed?"rgba(5,150,105,.05)":"rgba(0,0,0,.03)",color:active?s.color:passed?"#059669":"#9ca3af",border:`1px solid ${active?s.color:passed?"rgba(5,150,105,.2)":"#e5e7eb"}`,borderRadius:6,padding:"5px 10px",fontSize:11,fontWeight:active?700:600,cursor:readonly?"default":"pointer",fontFamily:"inherit"}}>
                {passed?"✓ ":""}{s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* КЛИЕНТ */}
      <div>
        <div style={{fontSize:12,fontWeight:700,color:"#9ca3af",marginBottom:8}}>КЛИЕНТ</div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <select className="fi" style={{flex:1}} disabled={readonly} value={deal.clientId||""} onChange={e=>upd({clientId:e.target.value})}>
            <option value="">— Выбрать клиента —</option>
            {clients.map(c=>(<option key={c.id} value={c.id}>{c.name}{c.type==="юр"?" (ЮР)":""}</option>))}
          </select>
          {!readonly && <button onClick={()=>{const n=window.prompt("Имя нового клиента:"); if(n!==null) onAddClient(n);}}
            style={{background:"#eff6ff",color:"#059669",border:"1px solid #e5e7eb",borderRadius:6,padding:"8px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>+ Новый</button>}
          {deal.clientId && <button onClick={()=>setShowClientForm(s=>!s)}
            style={{background:showClientForm?"#eff6ff":"#f3f4f6",color:"#2563eb",border:"1px solid #e5e7eb",borderRadius:6,padding:"8px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>✎ Данные</button>}
        </div>
        {deal.clientId && showClientForm && client && (() => {
          const updCl=(patch)=>onUpdateClient({...client,...patch});
          const isYur=client.type==="юр";
          const fields = isYur
            ? [["ФИО / Название","name"],["Телефон","phone"],["Адрес","address"],["БИН","iin"],["Директор (полностью)","director"],["Директор (кратко)","directorShort"],["Банк","bank"],["БИК","bik"],["ИИК (счёт)","account"],["Почта","email"]]
            : [["ФИО","name"],["Телефон","phone"],["Адрес","address"],["ИИН","iin"],["Документ","doc"]];
          return (
            <div style={{marginTop:8,padding:"12px 14px",background:"#f3f4f6",border:"1px solid #e5e7eb",borderRadius:8,display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div><div style={{fontSize:11,color:"#9ca3af",marginBottom:4}}>Тип</div>
                <select className="fi" value={client.type||"физ"} onChange={e=>updCl({type:e.target.value})}><option value="физ">Физ. лицо</option><option value="юр">Юр. лицо</option></select></div>
              {fields.map(([label,field])=>(
                <div key={field}><div style={{fontSize:11,color:"#9ca3af",marginBottom:4}}>{label}</div>
                  <input className="fi" value={client[field]||""} onChange={e=>updCl({[field]:e.target.value})} placeholder={label}/></div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* ОБЪЕКТ */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
        <div><div style={{fontSize:11,color:"#9ca3af",marginBottom:4}}>Тип объекта</div>
          <select className="fi" disabled={readonly} value={deal.objType||"Вторичка"} onChange={e=>upd({objType:e.target.value})}>
            <option>Вторичка</option><option>Новостройка</option><option>Коммерция</option>
          </select></div>
        <div><div style={{fontSize:11,color:"#9ca3af",marginBottom:4}}>Адрес объекта</div>
          <input className="fi" disabled={readonly} value={deal.address||""} onChange={e=>upd({address:e.target.value})} placeholder="ул., дом, кв."/></div>
        <div><div style={{fontSize:11,color:"#9ca3af",marginBottom:4}}>Площадь, м²</div>
          <input className="fi" type="number" disabled={readonly} value={deal.area||""} onChange={e=>upd({area:e.target.value})} placeholder="0"/></div>
      </div>

      {/* СМЕТА (настоящая, с каталогом) */}
      <div>
        <div style={{fontSize:12,fontWeight:700,color:"#9ca3af",marginBottom:8}}>СМЕТА <span style={{fontWeight:500,color:"#cbd5e1"}}>— заполняется через каталог, как в разделе «Сметы»</span></div>
        <div style={{background:"#f3f4f6",border:"1px solid #e5e7eb",borderRadius:8,padding:"16px 18px"}}>
          {estimate ? (
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
              <div>
                <div style={{fontSize:13,color:"#111827",fontWeight:700}}>{posCount} позиций на {fmt(fin)} ₸</div>
                <div style={{fontSize:11,color:"#9ca3af",marginTop:2}}>Смета заполнена через каталог</div>
              </div>
              {!readonly && <button onClick={onOpenEstimate} className="btn btn-g" style={{fontSize:13,padding:"9px 16px"}}>✏️ Редактировать смету</button>}
            </div>
          ) : (
            <div style={{textAlign:"center",padding:"6px 0"}}>
              <div style={{fontSize:13,color:"#6b7280",marginBottom:12}}>Смета ещё не заполнена</div>
              {!readonly && <button onClick={onOpenEstimate} className="btn btn-g" style={{fontSize:13,padding:"10px 20px"}}>📋 Заполнить смету (каталог)</button>}
            </div>
          )}
        </div>
      </div>

      {/* ЮР. ЧАСТЬ (для договора) */}
      <div style={{border:"1px solid #fbcfe8",borderRadius:8,padding:"14px 16px",background:"rgba(219,39,119,.03)"}}>
        <div style={{fontSize:12,fontWeight:700,color:"#db2777",marginBottom:10}}>📄 ДАННЫЕ ДЛЯ ДОГОВОРА</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div><div style={{fontSize:11,color:"#9ca3af",marginBottom:4}}>Номер договора</div>
            <input className="fi" disabled={readonly} value={deal.contractNumber||""} onChange={e=>upd({contractNumber:e.target.value})}/></div>
          <div><div style={{fontSize:11,color:"#9ca3af",marginBottom:4}}>Дата договора</div>
            <input className="fi" type="date" disabled={readonly} value={deal.contractDate||""} onChange={e=>upd({contractDate:e.target.value})}/></div>
          <div><div style={{fontSize:11,color:"#9ca3af",marginBottom:4}}>Подрядчик (ТОО)</div>
            <select className="fi" disabled={readonly} value={deal.contragentId||""} onChange={e=>upd({contragentId:e.target.value})}>
              <option value="">— Выбрать ТОО —</option>
              {contragents.map(c=>(<option key={c.id} value={c.id}>{c.name}</option>))}
            </select></div>
          <div><div style={{fontSize:11,color:"#9ca3af",marginBottom:4}}>Предоплата (%)</div>
            <input className="fi" type="number" min="0" max="100" disabled={readonly} value={deal.advancePercent??30} onChange={e=>upd({advancePercent:parseFloat(e.target.value)||0})}/></div>
        </div>
      </div>

      {/* Примечание */}
      <div><div style={{fontSize:11,color:"#9ca3af",marginBottom:4}}>Примечание</div>
        <textarea className="fi" rows={2} disabled={readonly} value={deal.note||""} onChange={e=>upd({note:e.target.value})} placeholder="Доп. условия..."/></div>

      {/* Действия: две печати из одних данных */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <button className="btn btn-o" style={{flex:"1 1 120px"}} onClick={onBack}>← Назад</button>
        <button onClick={onEstimatePdf} className="btn btn-o" style={{flex:"1 1 120px"}}>📄 PDF сметы</button>
        <div style={{flex:"1 1 120px",display:"flex",flexDirection:"column",gap:4}}>
          <button onClick={()=>onContractPdf(withStamp)} className="btn btn-o" style={{width:"100%"}}>📄 PDF договора</button>
          <div onClick={()=>setWithStamp(p=>!p)} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",justifyContent:"center"}}>
            <div style={{width:28,height:16,borderRadius:8,background:withStamp?"#db2777":"#e5e7eb",position:"relative",transition:"background .2s",flexShrink:0}}>
              <div style={{position:"absolute",top:2,left:withStamp?12:2,width:12,height:12,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
            </div>
            <span style={{fontSize:10,color:withStamp?"#db2777":"#9ca3af"}}>С печатью</span>
          </div>
        </div>
      </div>
      <div style={{fontSize:10,color:"#9ca3af",textAlign:"center"}}>✓ Сохраняется автоматически</div>
    </div>
  );
}

// ── Генерация договора: HTML / PDF / DOCX / WhatsApp ──

export default function App() {
  const [catalogVersion, setCatalogVersion] = useState(0);
  useEffect(() => {
    _onCatalogChange = () => setCatalogVersion(v => v + 1);
    return () => { _onCatalogChange = null; };
  }, []);
  const Gdyn = useMemo(() => groupData(getEffectiveCatalog()), [catalogVersion]);
  const cats = Object.keys(Gdyn);

  // Авторизация
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const s = localStorage.getItem(SESSION_KEY);
      if (!s) return null;
      const parsed = JSON.parse(s);
      // Support both old format (user object directly) and new format ({user, savedAt})
      const user = parsed?.user || parsed;
      const savedAt = parsed?.savedAt || Date.now();
      if (!user?.id) return null;
      if (Date.now() - savedAt > 30 * 24 * 60 * 60 * 1000) { localStorage.removeItem(SESSION_KEY); return null; }
      return user;
    } catch(e) { return null; }
  });
  const [showAdmin, setShowAdmin] = useState(false);
  const [loadError, setLoadError] = useState(false); // не удалось загрузить из Firebase — сохранение заблокировано
  const [cloudError, setCloudError] = useState(false); // последнее сохранение не ушло в облако (только локально)
  const [listBackups, setListBackups] = useState(null); // {label, items, onRestore}

  // Экраны: "list" | "editor" | "contracts"
  const [screen, setScreen] = useState("dashboard");

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
  const [statsPeriod, setStatsPeriod] = useState("all"); // all | month | week | 3month
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
  const [objectTab, setObjectTab] = useState("list"); // list | workspace
  const [objInfoCollapsed, setObjInfoCollapsed] = useState(false); // свёрнут ли блок инфо клиента/объекта
  const [currentObject, setCurrentObject] = useState(null);
  const [objectFilterStatus, setObjectFilterStatus] = useState("");
  const [objectFilterType, setObjectFilterType] = useState("");
  const [objectFilterManager, setObjectFilterManager] = useState("");
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
    ["stamp.jpg","stamp2.jpg"].forEach(file=>{
      fetch("/"+file).then(r=>r.blob()).then(blob=>{
        const reader = new FileReader();
        reader.onload = e => setStampsBase64(prev=>({...prev,[file]:e.target.result}));
        reader.readAsDataURL(blob);
      }).catch(()=>{});
    });
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
      .filter(o=>{
        if(objectFilterStatus && (o.status||"new")!==objectFilterStatus) return false;
        if(objectFilterType && (o.objType||"Вторичка")!==objectFilterType) return false;
        if(objectFilterManager && (o.manager||"")!==objectFilterManager) return false;
        if(q && !((o.clientName||"").toLowerCase().includes(q)||(o.address||"").toLowerCase().includes(q)||(o.clientPhone||"").toLowerCase().includes(q))) return false;
        return true;
      })
      .sort((a,b)=>(b.updatedAt||b.createdAt||0)-(a.updatedAt||a.createdAt||0));
  }, [objects, objectFilterStatus, objectFilterType, objectFilterManager, debouncedObjectSearch]);

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
      const [cr, cl, ca, ob] = await Promise.all([storage.getResult(CONTRACTS_KEY), storage.getResult(CLIENTS_KEY), storage.getResult(CONTRAGENTS_KEY), storage.getResult(OBJECTS_KEY)]);
      // Договоры
      if (cr.status === "found" && cr.value) { try { const p = JSON.parse(cr.value); if (Array.isArray(p)) { setContracts(p); contractsRef.current = p; } } catch {} }
      else if (cr.status === "empty") { setContracts([]); contractsRef.current = []; }
      else { ok = false; } // unavailable — не трогаем
      // Объекты
      if (ob.status === "found" && ob.value) { try { const p = JSON.parse(ob.value); if (Array.isArray(p)) { setObjects(p); objectsRef.current = p; } } catch {} }
      else if (ob.status === "empty") { setObjects([]); objectsRef.current = []; }
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
      const [result, u, pr, cat] = await Promise.all([
        storage.getResult(STORAGE_KEY),
        storage.get(USERS_KEY),
        storage.get(PRICES_KEY),
        storage.get(CATALOG_KEY),
      ]);
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
      try { if (u) setAllUsers(JSON.parse(u.value)); } catch {}
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
        else map.set(e.id, (e.updatedAt || 0) >= (ex.updatedAt || 0) ? e : ex);
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
        else map.set(e.id, (e.updatedAt || 0) >= (ex.updatedAt || 0) ? e : ex);
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

  // ── Единый бэкап рабочего пространства: объекты + их сметы + их договора ──
  const _wsSnapTimer = useRef(null);
  useEffect(() => {
    // снимок делаем только когда всё загружено (иначе запишем пустоту)
    if (!_estimatesLoaded.current || !_contractsLoaded.current) return;
    if (_wsSnapTimer.current) clearTimeout(_wsSnapTimer.current);
    _wsSnapTimer.current = setTimeout(async () => {
      try {
        const snap = {
          ts: Date.now(),
          by: currentUser?.name || "",
          objects: objectsRef.current,
          estimates: estimatesRef.current,
          contracts: contractsRef.current,
          counts: { o: objectsRef.current.length, e: estimatesRef.current.length, c: contractsRef.current.length },
        };
        const raw = await storage.get(WORKSPACE_BACKUPS_KEY);
        let arr = []; try { if (raw?.value) arr = JSON.parse(raw.value); } catch {}
        if (!Array.isArray(arr)) arr = [];
        // не плодим одинаковые подряд снимки
        const prev = arr[0];
        const sig = JSON.stringify(snap.counts) + "|" + JSON.stringify(snap.objects).length + JSON.stringify(snap.estimates).length;
        if (prev && prev._sig === sig) return;
        snap._sig = sig;
        arr = [snap, ...arr].slice(0, 20);
        await storage.set(WORKSPACE_BACKUPS_KEY, JSON.stringify(arr));
      } catch (e) { console.warn("ws snapshot err", e); }
    }, 8000);
    return () => { if (_wsSnapTimer.current) clearTimeout(_wsSnapTimer.current); };
  }, [objects, estimates, contracts]);

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
    if (!window.confirm(`Восстановить рабочее пространство на ${new Date(snap.ts).toLocaleString("ru-RU")}?\n\nОбъектов: ${o.length}\nСмет: ${e.length}\nДоговоров: ${c.length}\n\nТекущее состояние уйдёт в бэкап.`)) return;
    _allowEmptySave.current = true;
    objectsRef.current = o; setObjects(o);
    estimatesRef.current = e; setEstimates(e);
    contractsRef.current = c; setContracts(c);
    await saveObjects(o, { replace: true, allowEmpty: true });
    await saveEstimates(e, { replace: true });
    await saveContracts(c, { replace: true, allowEmpty: true });
    setTimeout(() => { _allowEmptySave.current = false; }, 1500);
    setWsBackupsModal(null);
    window.alert(`Восстановлено ✓\nОбъектов: ${o.length} · Смет: ${e.length} · Договоров: ${c.length}`);
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
      const toAdd = incoming.filter(e => e && e.id && !existIds.has(e.id))
        .map(e => ({ ...e, createdAt: e.createdAt||Date.now(), updatedAt: e.updatedAt||Date.now() }));
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
    const r = rows[work.name] || {};
    if (r.manualPrice !== undefined && r.manualPrice !== "") { const n = Number(r.manualPrice); return isNaN(n) ? null : n; }
    const cpxPct = r.cpxPct !== undefined ? Number(r.cpxPct) : undefined;
    return getPrice(work, Number(r.qty || 0), r.complexity || "std", cpxPct);
  };
  const rowTotal = (work) => {
    const qty = Number((rows[work.name] || {}).qty || 0);
    const price = rowPrice(work);
    return qty > 0 && price ? qty * price : 0;
  };
  // Возвращает "цену от" если у работы нет точной цены (не идёт в расчёт)
  const rowPriceFrom = (work) => {
    const r = rows[work.name] || {};
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
          const r = rows[w.name] || {};
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
  const grand = allSumMap.grand;
  const markupAmt = grand * markup / 100;
  const grandWithMarkup = grand + markupAmt; // база для клиента (markup скрыт)
  const discAmt = grandWithMarkup * discount / 100;
  const final = grandWithMarkup - discAmt;
  const kpData = useMemo(() => {
    const mm = 1 + markup / 100;
    const out = [];
    const fromOut = [];
    for (const cat of cats) for (const sub of Object.keys(Gdyn[cat]||{})) for (const w of Gdyn[cat]?.[sub]||[]) {
      const qty = Number((rows[w.name]||{}).qty||0);
      if (qty <= 0) continue;
      const r = rows[w.name]||{};
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
    const periodMs = {all:Infinity, month:30*864e5, week:7*864e5, "3month":90*864e5};
    let fromTs = 0, toTs = now;
    if(statsPeriod==="custom"){
      fromTs = statsDateFrom ? new Date(statsDateFrom).getTime() : 0;
      toTs   = statsDateTo   ? new Date(statsDateTo).getTime()+86399999 : now;
    } else {
      const ms = periodMs[statsPeriod]||Infinity;
      fromTs = ms===Infinity ? 0 : now - ms;
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
        if(w) cost += (Number(w.cost)||0)*qty;
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

    const baseObjs = objects
      .filter(o => inRange(o.updatedAt||o.createdAt||0))
      .filter(o => !statsManager || (o.manager||"")===statsManager);
    // сметы в периоде (для финансового блока «согласованные сметы», как было раньше)
    const baseEstimates = estimates
      .filter(e => inRange(e.updatedAt||e.createdAt||0))
      .filter(e => !statsManager || (e.proj?.manager||"")===statsManager);
    const baseCon = contracts
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
    const byStatus = {}; for(const s of DEAL_STATUSES) byStatus[s.key]=baseObjs.filter(o=>(o.status||"new")===s.key).length;
    const byType = {}; for(const o of baseObjs){ const t=objType(o); byType[t]=(byType[t]||0)+1; }

    // ── A. Финансовый обзор (по согласованным сметам — как было раньше) ──
    const agreedEst   = baseEstimates.filter(e=>e.status==="agreed"&&(e.total||0)>0);
    const wonRevenue  = agreedEst.reduce((s,e)=>s+(e.total||0),0);
    const wonCost     = agreedEst.reduce((s,e)=>s+estCost(e),0);
    const wonProfit   = wonRevenue - wonCost;
    const wonMargin   = wonRevenue>0 ? Math.round(wonProfit/wonRevenue*100) : 0;
    const withSumEstimates = baseEstimates.filter(e=>(e.total||0)>0);
    const allRevenue  = withSumEstimates.reduce((s,e)=>s+(e.total||0),0);
    const allCost     = withSumEstimates.reduce((s,e)=>s+estCost(e),0);
    const allProfit   = allRevenue - allCost;
    const allMargin   = allRevenue>0 ? Math.round(allProfit/allRevenue*100) : 0;

    // ── B. Воронка с деньгами и прибылью + конверсия (по сметам, как было) ──
    const funnel = STATUSES.map(s=>{
      const list = baseEstimates.filter(e=>(e.status||"new")===s.key);
      const sum  = list.reduce((a,e)=>a+(e.total||0),0);
      const cost = list.reduce((a,e)=>a+estCost(e),0);
      return { key:s.key, label:s.label, color:s.color, bg:s.bg, count:list.length, sum, profit:sum-cost };
    });
    const sentB   = funnel.find(f=>f.key==="sent")   || {count:0,sum:0,profit:0};
    const agreedB = funnel.find(f=>f.key==="agreed") || {count:0,sum:0,profit:0};
    const winRateOverall = baseEstimates.length>0 ? Math.round(agreedB.count/baseEstimates.length*100) : 0;
    const winRateSent    = (sentB.count+agreedB.count)>0 ? Math.round(agreedB.count/(sentB.count+agreedB.count)*100) : 0;

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
        catFin[c].cost += (Number(w.cost)||0)*qty;
      }
    }
    const catProfit = Object.values(catFin)
      .map(c=>({...c, profit:c.revenue-c.cost, margin:c.revenue>0?Math.round((c.revenue-c.cost)/c.revenue*100):0}))
      .sort((a,b)=>b.profit-a.profit).slice(0,8);
    const topCats = catProfit.slice(0,5).map(c=>[c.cat, c.revenue]); // совместимость

    // ── C. Менеджеры: объекты, оборот, прибыль, маржа, % сдачи ──
    const validManagerNames = new Set(nonViewerUsers.map(u=>u.name));
    const managers = [...new Set(objects.map(o=>o.manager||"").filter(m=>m&&validManagerNames.has(m)))];
    const managerStats = managers.map(m=>{
      const mos = baseObjs.filter(o=>(o.manager||"")===m);
      const withSum = mos.filter(o=>objVal(o)>0);
      const sum = withSum.reduce((s,o)=>s+objVal(o),0);
      const cost = withSum.reduce((s,o)=>s+objCost(o),0);
      const profit = sum-cost;
      const inwork = mos.filter(o=>o.status==="approval").length;
      const done = mos.filter(o=>o.status==="signed").length;
      const conv = (done+inwork)>0 ? Math.round(done/(done+inwork)*100) : 0;
      return {name:m, count:mos.length, sum, profit, margin: sum>0?Math.round(profit/sum*100):0, sent:inwork, agreed:done, conv};
    }).sort((a,b)=>b.profit-a.profit);

    // ── E. Динамика по месяцам (по объектам и их сумме) ──
    const monthMap = {};
    for(const o of withSumEst){
      const d = new Date(o.updatedAt||o.createdAt||0);
      const key = d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");
      if(!monthMap[key]) monthMap[key]={key, revenue:0, cost:0};
      monthMap[key].revenue += objVal(o);
      monthMap[key].cost += objCost(o);
    }
    const MONTH_RU = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];
    const monthly = Object.values(monthMap).sort((a,b)=>a.key.localeCompare(b.key)).slice(-12).map(m=>{
      const [y,mo]=m.key.split("-");
      return {...m, label: MONTH_RU[Number(mo)-1]+" "+y.slice(2), profit:m.revenue-m.cost};
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
    return { baseEst: baseObjs, baseCon, totalEst, withSumEst, totalSumEst, avgEst, totalCon, totalSumCon, avgCon, byStatus, byType, topCats, managers, managerStats, byConType, TYPE_L2,
      wonRevenue, wonCost, wonProfit, wonMargin, allRevenue, allCost, allProfit, allMargin,
      funnel, winRateOverall, winRateSent, agreedB, sentB, catProfit, monthly, staleSent };
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
    setRows(est.rows || {});
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
    const clName = client?.name||"___________________";
    const clIIN = client?.iin||"___________________";
    const clDoc = client?.doc||"___________________";
    const clDir = client?.director||"";
    const clAddr = client?.address||"___________________";
    const clPhone = client?.phone||"___________________";
    const clShort = (() => {
      if(!client?.name) return "___";
      const parts=(client.name||"").split(" ");
      if(isYur) return client.name;
      return parts[0]+" "+(parts[1]?parts[1][0]+".":"")+(parts[2]?parts[2][0]+".":"");
    })();
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
    const sigBlock = (role1="Подрядчик:", role2="Заказчик:") => {
      let clSigRight = "";
      if(isYur){
        clSigRight = "<b>"+role2+"</b><br><br>"+clName+"<br>БИН: "+clIIN;
        if(client?.bank) clSigRight += "<br>Банк: "+client.bank;
        if(client?.bik)  clSigRight += "<br>БИК: "+client.bik;
        if(client?.account) clSigRight += "<br>ИИК: "+client.account;
        if(clAddr)  clSigRight += "<br>Юр.Адрес: "+clAddr;
        if(clPhone) clSigRight += "<br>Тел.: "+clPhone;
        if(client?.email) clSigRight += "<br>Почта: "+client.email;
        if(client?.director) clSigRight += "<br><br>Директор:<br>"+(client.directorShort||client.director)+" ____________________  М.П.";
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
          + cat + " \u2014 " + fmtN(catTotal) + " \u20b8</td></tr>";
        let lastSub = "";
        rows.forEach(function(w,i){
          if(w.subcategory && w.subcategory !== lastSub){
            lastSub = w.subcategory;
            html += "<tr><td colspan=\"6\" style=\"background:#e5e7eb;color:#2563eb;font-style:italic;font-size:8.5pt;padding:2pt 5pt\">"
              + w.subcategory + "</td></tr>";
          }
          globalNum++;
          const bg = i%2===0 ? "#f3f4f6" : "#e5e7eb";
          const tdS = forDocx ? ";line-height:1.1;mso-line-height-rule:exactly" : "";
          html += "<tr style=\"background:" + bg + "\">"
            + (forDocx ? '<td width="5%"' : '<td') + ' class="tc" style="font-size:8pt'+tdS+'">' + globalNum + "</td>"
            + (forDocx ? '<td width="45%"' : '<td') + ' style="font-size:8pt'+tdS+'">' + (w.name||"") + "</td>"
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
      const tit = (ca?.name||"ТОО TITOVSTROY")+", БИН "+(ca?.bin||"231040002769")+" (далее — \""+role+"\"), в лице директора "+(ca?.director||"Василия Титова")+", действующего на основании Устава";
      const tail = "совместно именуемые \"Стороны\", а по отдельности – \"Сторона\", заключили настоящий документ о нижеследующем:";
      if(isYur){
        const clLine = clName+", БИН "+clIIN+" (далее — \"Заказчик\") в лице "+(client?.director||"Директора")+", "+(client?.directorShort||clDir)+", действующего на основании Устава, с другой стороны, "+tail;
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

  const generateContractPdf = (c, client, ca, withStamp=true) => {
    const stampFile = ca?.stampFile || "stamp.jpg";
    const stamp = withStamp ? (stampsBase64[stampFile] || stampBase64) : "";
    const html = buildContractHtml(c, client, ca, false, stamp);
    const blob = new Blob([html],{type:"text/html"});
    const url = URL.createObjectURL(blob);
    window.open(url,"_blank");
    setTimeout(()=>URL.revokeObjectURL(url),20000);
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
    const blob = new Blob([html],{type:"text/html"});
    const url = URL.createObjectURL(blob);
    window.open(url,"_blank");
    setTimeout(()=>URL.revokeObjectURL(url),30000);
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
      const tit = (ca?.name||'ТОО "TITOVSTROY"')+', БИН '+(ca?.bin||'231040002769')+'  (далее — "'+role+'"), в лице директора '+(ca?.director||'Василия Титова')+', действующего на основании Устава';
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
    const isAnnexG = (c.type||"repair_fiz") === "annex";
    const docLabelG = {repair_fiz:"Договор ремонта",annex:"Приложение",design:"Соглашение о дизайн-проекте",design_add:"Доп соглашение к дизайн-проекту",reservation:"Соглашение о резервировании"}[c.type||"repair_fiz"] || "Договор";
    const title = isAnnexG
      ? ("Приложение №"+(c.appendix||2)+" Перечень доп работ к Договору №"+(c.mainNumber||num)+(dateStrG?" от "+dateStrG:"")).replace(/[<>:"/\\|?*]/g,"_")
      : (docLabelG+" №"+num+" "+clientName+(dateStrG?" от "+dateStrG:"")).replace(/[<>:"/\\|?*]/g,"_");
    const html = buildContractHtml(c, client, ca, true, "");

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
      if (!Number(r?.qty) > 0 && Number(r?.qty) !== 0) continue;
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
        pricePerUnit: price ? Math.round(price / qty) : 0,
        total: price ? Math.round(price) : 0,
      });
    }
    const totalAmount = Math.round((est.total || 0) * (1 - (est.discount || 0) / 100));
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
  // Показать экран входа если не авторизован
  if (!currentUser) return <LoginScreen onLogin={setCurrentUser} />;

  const NAV_ITEMS = useMemo(() => [
    ...(currentUser.role !== "viewer" ? [{ id:"dashboard", icon:"⌂",  label:"Главная" }] : []),
    { id:"objects",   icon:"📦", label:"Объекты" },
    { id:"contracts", icon:"📄", label:"Прочие договора" },
    ...(currentUser.role !== "viewer" ? [{ id:"analytics", icon:"📊", label:"Аналитика" }] : []),
    ...(currentUser.role==="admin" ? [{ id:"admin", icon:"⚙️", label:"Админка" }] : []),
  ], [currentUser.role]);

  // Наблюдатель не имеет доступа к дашборду/аналитике/админке — показываем объекты.
  // Вычисляем эффективный экран без setState во время рендера (иначе нарушаются правила хуков).
  const effScreen = (currentUser.role === "viewer" && (screen === "dashboard" || screen === "analytics" || screen === "admin" || screen === "deals")) ? "objects" : screen;

  return (
    <div style={{fontFamily:"'Inter','Segoe UI',sans-serif",background:"#f3f4f6",minHeight:"100vh",color:"#111827",display:"flex",flexDirection:"column"}}>
      {/* Баннер: данные не загрузились — редактирование опасно */}
      {loadError && (
        <div style={{position:"fixed",top:0,left:0,right:0,zIndex:500,background:"#dc2626",color:"#fff",padding:"10px 16px",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:12,boxShadow:"0 2px 8px rgba(0,0,0,.2)"}}>
          ⚠️ Не удалось загрузить данные из базы. НЕ редактируйте сметы — сохранение отключено для защиты данных.
          <button onClick={()=>window.location.reload()} style={{background:"#fff",color:"#dc2626",border:"none",borderRadius:6,padding:"5px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Обновить</button>
        </div>
      )}
      {!loadError && cloudError && (
        <div style={{position:"fixed",top:0,left:0,right:0,zIndex:500,background:"#d97706",color:"#fff",padding:"10px 16px",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:12,boxShadow:"0 2px 8px rgba(0,0,0,.2)"}}>
          ⚠️ Данные сохранены ТОЛЬКО на этом устройстве — облако недоступно. На других устройствах изменений не будет. Проверьте интернет/правила Firebase.
          <button onClick={()=>setCloudError(false)} style={{background:"#fff",color:"#d97706",border:"none",borderRadius:6,padding:"5px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Скрыть</button>
        </div>
      )}
      {/* Панель администратора */}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700;900&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        html,body{background:#f3f4f6;overflow-x:hidden;width:100%}
        input,select,textarea{outline:none}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-thumb{background:#d1d5db;border-radius:2px}
        .fi{background:#ffffff;border:1px solid #e5e7eb;color:#111827;border-radius:6px;padding:8px 12px;font-family:inherit;font-size:14px;width:100%;transition:border .1s;outline:none}
        .fi:focus{border-color:#9ca3af}
        .fi::placeholder{color:#b0b7c3}
        .tab-btn{background:none;border:none;cursor:pointer;padding:7px 16px;border-radius:6px;font-family:inherit;font-size:13px;font-weight:500;color:#6b7280;transition:all .1s;white-space:nowrap}
        .tab-btn:hover{color:#374151;background:#f3f4f6}
        .tab-btn.active{background:#eff6ff;color:#2563eb;font-weight:600}
        .sub-btn{background:none;border:none;cursor:pointer;padding:5px 10px;border-radius:5px;font-family:inherit;font-size:11.5px;color:#374151;transition:all .15s;white-space:nowrap}
        .sub-btn:hover{color:#374151;background:#f3f4f6}
        .sub-btn.active{background:#e5e7eb;color:#111827;font-weight:600}
        .wrow{display:grid;align-items:start;padding:9px 14px;border-radius:7px;gap:8px;transition:background .12s;min-width:0}
        .wrow:hover{background:#f9fafb}
        .wrow.on{background:#eff6ff}
        .num{background:#ffffff;border:1px solid #e5e7eb;color:#111827;border-radius:6px;padding:6px 8px;text-align:right;font-family:inherit;font-size:13px;transition:border .1s;outline:none}
        .num:focus{border-color:#9ca3af}
        .num::placeholder{color:#9ca3af}
        .cpx-sel{background:#ffffff;border:1px solid #e5e7eb;color:#374151;border-radius:6px;padding:4px 6px;font-family:inherit;font-size:11px;margin-top:4px;cursor:pointer;width:auto;max-width:130px}
        .cpx-sel:focus{border-color:#9ca3af}
        .card{background:#ffffff;box-shadow:0 1px 3px rgba(0,0,0,.08),0 4px 12px rgba(0,0,0,.04);border:1px solid #e5e7eb;border-radius:6px;overflow:hidden}
        .btn{border:none;cursor:pointer;padding:11px 22px;border-radius:8px;font-family:inherit;font-size:13px;font-weight:700;transition:all .2s;letter-spacing:.2px}
        .btn-g{background:#2563eb;color:#ffffff}
        .btn-g:hover{background:#1d4ed8}
        .btn-g:disabled{opacity:.35;cursor:not-allowed;transform:none;box-shadow:none}
        .btn-o{background:#ffffff;color:#374151;border:1px solid #e5e7eb}
        .btn-o:hover{background:#f9fafb;color:#111827}
        .btn-red{background:rgba(220,38,38,.1);color:#dc2626;border:1px solid rgba(220,38,38,.1)}
        .btn-red:hover{background:rgba(200,60,60,.22);color:#dc2626}
        .badge{background:#eff6ff;color:#2563eb;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600}
        @keyframes up{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:translateY(0)}}
        .up{animation:up .22s ease forwards}
        .page{max-width:960px;margin:0 auto;padding:40px 40px 80px}
        @media(min-width:900px){.main-grid{grid-template-columns:minmax(0,1fr) 295px!important}}
        @media(max-width:700px){
          .editor-header{gap:6px!important;padding:8px 12px!important}
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
        .est-card{background:#ffffff;border:1px solid #e5e7eb;box-shadow:0 1px 4px rgba(26,31,54,.06);border-radius:6px;padding:16px 18px;cursor:pointer;transition:all .15s;position:relative}
        .est-card:hover{border-color:#9ca3af;background:#f7f8fa}
        .est-card:active{transform:scale(.99)}
        .sidebar{width:240px;background:#f7f8fa;border-right:1px solid #e5e7eb;display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;z-index:50;transition:width .2s ease}
        .sidebar.collapsed{width:60px}
        .nav-item{display:flex;align-items:center;gap:10px;padding:7px 12px;border-radius:6px;cursor:pointer;margin:1px 6px;transition:background .1s;font-size:13.5px}
        .nav-item:hover{background:#e5e7eb}
        .nav-item.active{background:#e5e7eb}
        .nav-label{font-size:13px;font-weight:400;white-space:nowrap;overflow:hidden;transition:opacity .1s,width .1s;color:#374151}
        .sidebar.collapsed .nav-label{opacity:0;width:0;pointer-events:none}
        .sidebar-content{margin-left:240px;transition:margin-left .22s cubic-bezier(.4,0,.2,1);min-height:100vh}
        .sidebar-content.collapsed{margin-left:60px}
        @media(max-width:700px){
          .sidebar{display:none!important}
          .sidebar-content{margin-left:0!important;padding-bottom:68px!important}
          .mob-nav{display:flex!important}
          .page{padding:18px 14px 84px!important}
          .list-header,.contracts-header{padding:10px 14px!important}
          .list-pad{padding:16px 14px 0!important}
          .contracts-pad{padding:16px 14px!important}
          .an-filters{padding:14px!important}
          .an-row-fixed{flex-wrap:wrap!important}
          .btn{padding:10px 16px!important}
          /* фикс-ширины в аналитике → тянутся по экрану, цифры не режем */
          .an-bar-label{width:104px!important;font-size:11px!important}
          .an-bar-right{width:88px!important;font-size:10px!important}
          .an-mtable-num{width:auto!important;min-width:48px!important}
          .user-row{flex-wrap:wrap!important}
          .user-row-btns{width:100%!important;justify-content:flex-end!important;margin-top:8px!important}
        }
        .mob-nav{display:none;position:fixed;bottom:0;left:0;right:0;background:#ffffff;border-top:1px solid #e5e7eb;z-index:50}
        .mob-nav-item{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px 4px;cursor:pointer;gap:3px;border-top:2px solid transparent;transition:all .15s}
        .mob-nav-item.active{border-top-color:#ffffff;background:rgba(0,0,0,.04)}
      `}</style>

      {/* ── SIDEBAR (десктоп) ── */}
      <div className={"sidebar"+(sideCollapsed?" collapsed":"")}>
        {/* Лого */}
        <div style={{padding:"16px 14px",display:"flex",alignItems:"center",gap:10,borderBottom:"1px solid #e5e7eb",minHeight:60}}>
          <div style={{width:32,height:32,borderRadius:6,background:"#2563eb",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:14,color:"#ffffff",flexShrink:0}}>T</div>
          <div className="nav-label" style={{lineHeight:1.2}}>
            <div style={{fontWeight:700,fontSize:14,color:"#111827"}}>TitovStroy</div>
            <div style={{fontSize:12,color:"#6b7280"}}>{currentUser.name}</div>
          </div>
        </div>
        {/* Nav */}
        <nav style={{flex:1,padding:"10px 0",overflowY:"auto"}}>
          {NAV_ITEMS.map(item=>{
            const isActiveEst = effScreen==="editor" && !objectReturnId && item.id==="list";
            const isActiveObjEst = effScreen==="editor" && !!objectReturnId && item.id==="objects";
            const isActive = effScreen===item.id || isActiveEst || isActiveObjEst;
            return (
            <div key={item.id} className={"nav-item"+(isActive?" active":"")}
              onClick={()=>{ setDealReturnId(null); setObjectReturnId(null); setScreen(item.id); }}>
              <span style={{fontSize:18,flexShrink:0,lineHeight:1}}>{item.icon}</span>
              <span className="nav-label" style={{color:isActive?"#2563eb":"#9ca3af",fontWeight:isActive?600:400}}>{item.label}</span>
            </div>
            );
          })}
        </nav>
        {/* Collapse + Выйти */}
        <div style={{borderTop:"1px solid #e5e7eb",padding:"8px 0"}}>
          <div className="nav-item" onClick={()=>{ try{localStorage.removeItem(SESSION_KEY);}catch(e){} setCurrentUser(null); }}>
            <span style={{fontSize:16,flexShrink:0}}>🚪</span>
            <span className="nav-label" style={{color:"#6b7280",fontSize:13}}>Выйти</span>
          </div>
          <div className="nav-item" onClick={()=>setSideCollapsed(p=>!p)} style={{justifyContent:"center",marginTop:4}}>
            <span style={{fontSize:13,color:"#374151"}}>{sideCollapsed?"▶":"◀"}</span>
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
            onClick={()=>{ setDealReturnId(null); setObjectReturnId(null); setScreen(item.id); }}>
            <span style={{fontSize:20}}>{item.icon}</span>
            <span style={{fontSize:9,color:isActive?"#2563eb":"#9ca3af",fontWeight:600}}>{item.label}</span>
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
        const estimatesThisMonth = estimates.filter(e=>_inMonth(e.updatedAt||e.createdAt||0));
        const contractsThisMonth = contracts.filter(c=>_inMonth(c.date||0));
        const clientsThisMonth = contractClients.filter(c=>c.createdAt && _inMonth(c.createdAt));
        const newClientsCount = clientsThisMonth.length;
        // объекты и их суммы (сумма объекта = все его сметы)
        const _estByObjId = {}; for(const e of estimates){ if(e.objectId){ (_estByObjId[e.objectId]||(_estByObjId[e.objectId]=[])).push(e); } }
        const _objVal = o => (_estByObjId[o.id]||[]).reduce((s,e)=>s+(e.total||0),0);
        const objectsThisMonth = objects.filter(o=>_inMonth(o.updatedAt||o.createdAt||0));
        const totalSumMonth = objectsThisMonth.reduce((s,o)=>s+_objVal(o), 0);
        const recentContracts = [...contracts].filter(c=>(c.works||[]).reduce((s,w)=>s+(w.quantity*w.price||0),0)>0).sort((a,b)=>Number(b.id||0)-Number(a.id||0)).slice(0,5);
        const recentEstimates = [...estimates].filter(e=>(e.total||0)>0).sort((a,b)=>(b.updatedAt||b.createdAt||0)-(a.updatedAt||a.createdAt||0)).slice(0,5);
        // Финансы за месяц (по согласованным сметам)
        const _dashCat = getEffectiveCatalog();
        const _dashLook = new Map(); for(const w of _dashCat){ if(w?.name)_dashLook.set(w.name,w); if(w?.code)_dashLook.set(w.code,w); }
        const _dashCost = e=>{ let c=0; for(const [k,r] of Object.entries(e.rows||{})){ const q=Number(r?.qty||0); if(!q) continue; const w=_dashLook.get(k); if(w)c+=(Number(w.cost)||0)*q; } return c; };
        const agreedMonth = estimatesThisMonth.filter(e=>e.status==="agreed"&&(e.total||0)>0);
        const revMonth = agreedMonth.reduce((s,e)=>s+(e.total||0),0);
        const profitMonth = revMonth - agreedMonth.reduce((s,e)=>s+_dashCost(e),0);
        const marginMonth = revMonth>0 ? Math.round(profitMonth/revMonth*100) : 0;
        return (
        <div className="page">
          {/* Заголовок */}
          <div style={{marginBottom:32,display:"flex",alignItems:"flex-end",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
            <div>
              <h1 style={{margin:0,fontSize:26,fontWeight:900,color:"#111827",letterSpacing:-.5}}>
                TitovStroy <span style={{color:"#2563eb"}}>CRM</span>
              </h1>
              <div style={{fontSize:13,color:"#6b7280",marginTop:4}}>
                {new Date().toLocaleDateString("ru-RU",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}
                {" · "}<span style={{color:"#2563eb"}}>{currentUser.role==="admin"?"Администратор":currentUser.role==="viewer"?"Просмотр":currentUser.name}</span>
              </div>
            </div>
            <span style={{fontSize:11,fontWeight:600,display:"flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:20,background: syncStatus==="saving"?"rgba(37,99,235,.08)":syncStatus==="saved"?"rgba(5,150,105,.08)":syncStatus==="error"?"rgba(220,38,38,.08)":"rgba(0,0,0,.04)",color:syncStatus==="saving"?"#2563eb":syncStatus==="saved"?"#059669":syncStatus==="error"?"#dc2626":"#9ca3af",transition:"all .3s"}}>
              {syncStatus==="saving"?"⏳ Сохраняю...":syncStatus==="saved"?"☁ Сохранено":syncStatus==="error"?"⚠ Ошибка синка":"☁ Синк"}
            </span>
          </div>

          {/* Статы */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:10,marginBottom:32}}>
            {[
              {label:"Объектов за месяц", value:objectsThisMonth.length,  sub:"из "+objects.length+" всего", color:"#2563eb"},
              {label:"Договоров за месяц",value:contractsThisMonth.filter(c=>(c.works||[]).reduce((s,w)=>s+(w.quantity*w.price||0),0)>0).length, sub:"из "+contracts.filter(c=>(c.works||[]).reduce((s,w)=>s+(w.quantity*w.price||0),0)>0).length+" с суммой всего", color:"#2563eb"},
              {label:"Объём за месяц",   value:fmt(Math.round(totalSumMonth))+" ₸", sub:"сумма объектов за месяц",                          color:"#059669"},
              {label:"Прибыль за месяц", value:fmt(Math.round(profitMonth))+" ₸", sub:"по согласованным сметам", color:"#059669"},
              {label:"Маржа за месяц",   value:marginMonth+"%", sub:"согласованные сметы", color:marginMonth>=35?"#059669":marginMonth>=20?"#d97706":"#ef4444"},
              {label:"Клиентов за месяц",value:clientsThisMonth.length,    sub:"из "+contractClients.length+" всего", color:"#2563eb"},
            ].map((s,i)=>(
              <div key={i} style={{background:"#ffffff",border:"1px solid #e5e7eb",borderRadius:8,padding:"18px 18px 16px",boxShadow:"0 1px 3px rgba(0,0,0,.06)"}}>
                
                <div style={{fontSize:11,color:"#9ca3af",fontWeight:500,marginBottom:8}}>{s.label}</div>
                <div style={{fontSize:28,fontWeight:800,color:"#111827",lineHeight:1,marginBottom:6}}>{s.value}</div>
                {s.sub && <div style={{fontSize:11,color:"#9ca3af",marginTop:4}}>{s.sub}</div>}
              </div>
            ))}
          </div>

          {/* Разделы */}
          <div style={{fontSize:13,color:"#111827",fontWeight:700,marginBottom:14}}>Разделы</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:12,marginBottom:36}}>
            {[
              {id:"objects",   icon:"▦",title:"Объекты",     desc:"Клиенты, сметы, договора", stat:objects.length+" объектов",   color:"#2563eb",bg:"#ffffff",border:"#e5e7eb"},
              {id:"contracts", icon:"◻",title:"Прочие договора", desc:"Договора вне объектов",  stat:contracts.length+" договоров", color:"#2563eb",bg:"#ffffff",border:"#e5e7eb"},
              {id:"analytics", icon:"↗",title:"Аналитика",  desc:"Статистика и отчёты",    stat:"За "+new Date().toLocaleDateString("ru-RU",{month:"long"}), color:"#2563eb",bg:"#ffffff",border:"#e5e7eb"},
            ].map(card=>(
              <div key={card.id} onClick={()=>{ setScreen(card.id); }}
                style={{background:"#ffffff",border:"1px solid #e5e7eb",borderRadius:8,padding:"24px",cursor:"pointer",transition:"background .1s,border-color .1s,box-shadow .1s",boxShadow:"0 1px 2px rgba(0,0,0,.04)"}}
                onMouseEnter={e=>{e.currentTarget.style.backgroundColor="#f3f4f6";}}
                onMouseLeave={e=>{e.currentTarget.style.boxShadow="none";e.currentTarget.style.borderColor="#e5e7eb";}}>
                <div style={{fontSize:22,marginBottom:14,color:"#9ca3af",fontWeight:300,lineHeight:1}}>{card.icon}</div>
                <div style={{fontWeight:700,fontSize:15,color:"#111827",marginBottom:5}}>{card.title}</div>
                <div style={{fontSize:12,color:"#9ca3af",marginBottom:14}}>{card.desc}</div>
                <div style={{display:"inline-block",background:"#e5e7eb",border:"1px solid #e5e7eb",color:"#9ca3af",borderRadius:4,padding:"3px 10px",fontSize:11,fontWeight:600}}>{card.stat}</div>
              </div>
            ))}
          </div>

          {/* Воронка по статусам */}
          {(() => {
            const real = estimates.filter(e => (e.total||0) > 0 || (e.status&&e.status!=="new"));
            const byKey = {};
            for (const s of STATUSES) byKey[s.key] = { count:0, sum:0 };
            for (const e of real) { const k=(e.status||"new"); if(!byKey[k]) byKey[k]={count:0,sum:0}; byKey[k].count++; byKey[k].sum+=(e.total||0); }
            const totalCount = real.length;
            if (totalCount === 0) return null;
            const maxCount = Math.max(1, ...STATUSES.map(s=>byKey[s.key]?.count||0));
            const sentN = byKey.sent?.count||0, agreedN = byKey.agreed?.count||0;
            const convOverall = totalCount>0 ? Math.round(agreedN/totalCount*100) : 0;
            const convSent = (sentN+agreedN)>0 ? Math.round(agreedN/(sentN+agreedN)*100) : 0;
            return (
              <div style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:8,padding:"20px 22px",marginBottom:36,boxShadow:"0 1px 2px rgba(0,0,0,.04)"}}>
                <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",flexWrap:"wrap",gap:8,marginBottom:16}}>
                  <span style={{fontWeight:700,fontSize:15,color:"#111827"}}>Воронка по статусам</span>
                  <span style={{fontSize:12,color:"#6b7280"}}>
                    Конверсия в согласование: <b style={{color:"#059669"}}>{convOverall}%</b>
                    {(sentN+agreedN)>0 && <span style={{color:"#9ca3af"}}> · из отправленных <b style={{color:"#7c3aed"}}>{convSent}%</b></span>}
                  </span>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {STATUSES.map(s=>{
                    const d = byKey[s.key]||{count:0,sum:0};
                    const w = Math.round((d.count/maxCount)*100);
                    return (
                      <div key={s.key} style={{display:"flex",alignItems:"center",gap:12}}>
                        <span className="an-bar-label" style={{fontSize:12,fontWeight:600,color:s.color,width:140,flexShrink:0}}>{s.label}</span>
                        <div style={{flex:1,minWidth:60,background:"rgba(0,0,0,.04)",borderRadius:6,height:24,position:"relative",overflow:"hidden"}}>
                          <div style={{width:`${w}%`,minWidth:d.count>0?28:0,height:"100%",background:s.bg,borderLeft:`3px solid ${s.color}`,transition:"width .3s"}}/>
                          <span style={{position:"absolute",left:8,top:0,height:"100%",display:"flex",alignItems:"center",fontSize:12,fontWeight:700,color:s.color}}>{d.count}</span>
                        </div>
                        <span className="an-bar-right" style={{fontSize:12,color:"#6b7280",width:130,textAlign:"right",flexShrink:0}}>{d.sum>0?fmt(Math.round(d.sum))+" ₸":"—"}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Лента активности */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",gap:16}}>
            {/* Последние сметы */}
            {recentEstimates.length>0 && (
              <div>
                <div style={{fontSize:13,color:"#111827",fontWeight:700,marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span>Последние сметы</span>
                  <span onClick={()=>setScreen("list")} style={{color:"#2563eb",cursor:"pointer",textTransform:"none",fontSize:11,letterSpacing:0}}>все →</span>
                </div>
                <div style={{background:"#ffffff",border:"1px solid #e5e7eb",borderRadius:6,overflow:"hidden"}}>
                  {recentEstimates.map((est,i,arr)=>{
                    const total = est.total || 0;
                    return (
                      <div key={est.id} onClick={()=>openEstimate(est)}
                        style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderBottom:i<arr.length-1?"1px solid #e5e7eb":"none",cursor:"pointer",transition:"background .1s"}}
                        onMouseEnter={e=>e.currentTarget.style.background="#ffffff"}
                        onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                        <div style={{width:3,height:3,borderRadius:"50%",background:"#d1d5db",flexShrink:0,marginTop:5}}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,color:"#111827",fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{est.proj?.name||"Без названия"}</div>
                          <div style={{fontSize:12,color:"#9ca3af",marginTop:1}}>{est.updatedAt?new Date(est.updatedAt).toLocaleDateString("ru-RU"):""}</div>
                        </div>
                        {total>0 && <div style={{fontSize:13,fontWeight:700,color:"#111827",flexShrink:0}}>{fmt(total)} ₸</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {/* Последние договора */}
            {recentContracts.length>0 && (
              <div>
                <div style={{fontSize:13,color:"#111827",fontWeight:700,marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span>Последние договора</span>
                  <span onClick={()=>setScreen("contracts")} style={{color:"#2563eb",cursor:"pointer",textTransform:"none",fontSize:11,letterSpacing:0}}>все →</span>
                </div>
                <div style={{background:"#ffffff",border:"1px solid #e5e7eb",borderRadius:6,overflow:"hidden"}}>
                  {recentContracts.map((c,i,arr)=>{
                    const cl = contractClients.find(x=>x.id===c.clientId);
                    const total = (c.works||[]).reduce((s,w)=>s+(w.quantity*w.price||0),0);
                    const TYPE_L = {repair_fiz:"Договор ремонта",annex:"Приложение",design:"Дизайн",design_add:"Доп. дизайн",reservation:"Бронь"};
                    return (
                      <div key={c.id} onClick={()=>{ setCurrentContract({...c}); setContractTab("editor"); setScreen("contracts"); }}
                        style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderBottom:i<arr.length-1?"1px solid #e5e7eb":"none",cursor:"pointer",transition:"background .1s"}}
                        onMouseEnter={e=>e.currentTarget.style.background="#ffffff"}
                        onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                        <div style={{width:7,height:7,borderRadius:"50%",background:"#d1d5db",flexShrink:0}}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,color:"#111827",fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{TYPE_L[c.type||"repair_fiz"]||"Договор"} №{c.number||"—"}</div>
                          <div style={{fontSize:12,color:"#9ca3af",marginTop:1}}>{cl?.name||c.estClient||"Клиент не выбран"}</div>
                        </div>
                        {total>0 && <div style={{fontSize:13,fontWeight:700,color:"#111827",flexShrink:0}}>{fmt(total)} ₸</div>}
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
          <div className="list-header" style={{background:"#f3f4f6",borderBottom:"1px solid #e5e7eb",padding:"12px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:10}}>
            <div style={{display:"flex",alignItems:"center",gap:10,flex:1,minWidth:0}}>
              <div style={{width:28,height:28,borderRadius:6,background:"#2563eb",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:13,color:"#ffffff",flexShrink:0}}>T</div>
              <div style={{minWidth:0}}>
                <div style={{fontWeight:800,fontSize:13,whiteSpace:"nowrap",color:"#111827"}}>TitovStroy</div>
                <div style={{fontSize:10,color:"#9ca3af",whiteSpace:"nowrap"}}>
                  <span style={{color:"#2563eb"}}>{currentUser.role==="admin"?"👑":currentUser.role==="viewer"?"👁":"👤"}</span>{" "}{currentUser.name}
                </div>
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
              {saving && <span style={{fontSize:11,color:"#9ca3af"}}>💾</span>}
              <button className="btn btn-o" style={{padding:"6px 9px",fontSize:14}} onClick={()=>setScreen("analytics")} title="Статистика">📊</button>
              {currentUser.role !== "viewer" && (
                <button className="btn btn-g" style={{padding:"7px 14px",fontSize:12,whiteSpace:"nowrap"}} onClick={newEstimate}>+ Новая</button>
              )}
            </div>
          </div>

          <div className="list-pad" style={{padding:"20px 24px 0"}}>
            {loadingList ? (
              <div style={{textAlign:"center",padding:"60px 0",color:"#9ca3af"}}>
                <div style={{fontSize:24,marginBottom:10}}>⏳</div>
                <div style={{fontSize:13}}>Загрузка смет...</div>
              </div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {/* Заголовок */}
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:2}}>
                  <div>
                    <div style={{fontWeight:800,fontSize:17,color:"#111827"}}>📁 Архив смет</div>
                    <div style={{fontSize:11,color:"#9ca3af",marginTop:1}}>Все расчёты и коммерческие предложения</div>
                  </div>
                  {currentUser.role==="admin" && (
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={()=>setImportModal(true)}
                        style={{background:"rgba(0,0,0,.03)",color:"#6b7280",border:"1px solid #e5e7eb",borderRadius:8,padding:"7px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                        ⬆ Импорт
                      </button>
                      <button onClick={openBackups}
                        style={{background:"rgba(0,0,0,.03)",color:"#6b7280",border:"1px solid #e5e7eb",borderRadius:8,padding:"7px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                        🕘 Бэкапы
                      </button>
                    </div>
                  )}
                </div>
                {/* Поиск и фильтры */}
                {estimates.length > 0 && (
                  <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:2}}>
                    <input
                      style={{background:"#ffffff",border:"1px solid #e5e7eb",color:"#111827",borderRadius:8,padding:"9px 14px",fontFamily:"inherit",fontSize:13,outline:"none",width:"100%"}}
                      placeholder="🔍 Поиск по клиенту, адресу, телефону..."
                      value={listSearch}
                      onChange={e=>setListSearch(e.target.value)}
                    />
                    <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                      {/* Фильтр по типу */}
                      {["","Вторичка","Новостройка","Коммерция"].map(t=>(
                        <button key={t} onClick={()=>setListFilter(t)}
                          style={{background:listFilter===t?"#eff6ff":"rgba(0,0,0,.03)",color:listFilter===t?"#2563eb":"#9ca3af",border:`1px solid ${listFilter===t?"rgba(184,144,74,.4)":"#e5e7eb"}`,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                          {t||"Все типы"}
                        </button>
                      ))}
                    </div>
                    {/* Фильтр по статусу */}
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      <button onClick={()=>setListFilterStatus("")}
                        style={{background:!listFilterStatus?"rgba(0,0,0,.04)":"rgba(0,0,0,.03)",color:!listFilterStatus?"#ffffff":"#9ca3af",border:`1px solid ${!listFilterStatus?"rgba(255,255,255,.15)":"#e5e7eb"}`,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                        Все статусы
                      </button>
                      {STATUSES.map(s=>(
                        <button key={s.key} onClick={()=>setListFilterStatus(s.key)}
                          style={{background:listFilterStatus===s.key?s.bg:"rgba(0,0,0,.03)",color:listFilterStatus===s.key?s.color:"#9ca3af",border:`1px solid ${listFilterStatus===s.key?s.color:"#e5e7eb"}`,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                          {s.label}
                        </button>
                      ))}
                    </div>
                    {/* Фильтр по сотруднику */}
                    {nonViewerUsers.length > 1 && (
                      <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                        <button onClick={()=>setListFilterManager("")}
                          style={{background:!listFilterManager?"#eff6ff":"rgba(0,0,0,.03)",color:!listFilterManager?"#2563eb":"#9ca3af",border:`1px solid ${!listFilterManager?"rgba(136,136,204,.4)":"#e5e7eb"}`,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                          Все сотрудники
                        </button>
                        {nonViewerUsers.map(u=>(
                          <button key={u.id} onClick={()=>setListFilterManager(u.name)}
                            style={{background:listFilterManager===u.name?"#eff6ff":"rgba(0,0,0,.03)",color:listFilterManager===u.name?"#2563eb":"#9ca3af",border:`1px solid ${listFilterManager===u.name?"rgba(136,136,204,.4)":"#e5e7eb"}`,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                            👤 {u.name}
                          </button>
                        ))}
                      </div>
                    )}
                    <div style={{display:"flex",gap:6,alignItems:"center"}}>
                      <div style={{flex:1}}/>
                      {/* Сортировка */}
                      <select value={listSort} onChange={e=>setListSort(e.target.value)}
                        style={{background:"#ffffff",border:"1px solid #e5e7eb",color:"#9ca3af",borderRadius:6,padding:"4px 8px",fontSize:11,fontFamily:"inherit",cursor:"pointer",outline:"none"}}>
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
                    <div style={{fontSize:13,color:"#374151",marginBottom:24}}>Нажмите «+ Новая смета» чтобы начать</div>
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
                          <div style={{width:2,height:14,background:"#e5e7eb",borderRadius:2,flexShrink:0}}/>
                          <span style={{fontSize:10,color:"#059669",fontWeight:700,background:"rgba(5,150,105,.08)",borderRadius:3,padding:"1px 6px"}}>ДС-{est.dsNumber||"?"}</span>
                        </div>}
                        <div className="est-card up" style={{padding:"10px 14px",marginLeft:isChild?16:0,borderLeft:isChild?"3px solid #d1fae5":"none"}}
                          onClick={() => { if(currentUser.role==="viewer") return; openEstimate(est); }}>
                          {/* Строка 1: имя + сумма */}
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            {(() => { const s=STATUSES.find(x=>x.key===(est.status||"new"))||STATUSES[0]; return <span style={{fontSize:10,fontWeight:700,color:s.color,background:s.bg,borderRadius:4,padding:"1px 7px",flexShrink:0,whiteSpace:"nowrap"}}>{s.label}</span>; })()}
                            <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                              <span style={{fontWeight:700,fontSize:14,color:"#111827"}}>{dProj?.name || <span style={{color:"#9ca3af",fontStyle:"italic"}}>Без названия</span>}</span>
                              {dProj?.address && <span style={{fontSize:12,color:"#6b7280",fontWeight:500}}> · 📍 {dProj.address}</span>}
                              {dProj?.phone && <span style={{fontSize:12,color:"#6b7280",fontWeight:500}}> · 📞 {dProj.phone}</span>}
                            </span>
                            {est.total>0
                              ? <span style={{fontSize:14,fontWeight:800,color:"#2563eb",flexShrink:0}}>{fmt(est.total)} ₸</span>
                              : <span style={{fontSize:11,color:"#9ca3af",fontStyle:"italic",flexShrink:0}}>черновик</span>}
                          </div>
                          {est.comment&&<div style={{fontSize:11,color:"#9ca3af",marginTop:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>💬 {est.comment}</div>}
                          {est.status==="sent"&&est.sentAt&&<div style={{fontSize:11,color:"#7c3aed",marginTop:2,fontWeight:600}}>📤 Отправлено {new Date(est.sentAt).toLocaleDateString("ru-RU")}</div>}
                          {/* Строка 2: мета + дата + кнопки */}
                          <div style={{display:"flex",alignItems:"center",gap:6,marginTop:5}} onClick={e=>e.stopPropagation()}>
                            <span style={{fontSize:11,color:"#9ca3af",background:"rgba(0,0,0,.03)",borderRadius:4,padding:"1px 6px"}}>{dProj?.type||"—"}</span>
                            {dProj?.area&&<span style={{fontSize:11,color:"#9ca3af"}}>{dProj.area} м²</span>}
                            <span style={{flex:1}}/>
                            <span style={{fontSize:10,color:"#9ca3af",whiteSpace:"nowrap"}}>{fmtDate(est.updatedAt)}</span>
                            {author&&<span style={{fontSize:10,color:"#9ca3af",whiteSpace:"nowrap"}}>· {author}</span>}
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
                      <div style={{fontSize:11,color:"#9ca3af",marginBottom:2}}>
                        {(() => {
                          const totalRoots = estimates.filter(e=>!e.parentId).length;
                          const foundRoots = filtered.filter(e=>!e.parentId).length;
                          return foundRoots !== totalRoots ? `Найдено: ${foundRoots}` : `Всего смет: ${totalRoots}`;
                        })()}
                      </div>
                      {visibleRoots.length === 0 && (
                        <div style={{textAlign:"center",padding:"40px 0",color:"#374151",fontSize:13}}>Ничего не найдено</div>
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
          <div style={{background:"#f3f4f6",border:"1px solid #e5e7eb",borderRadius:6,padding:"24px 28px",maxWidth:340,width:"100%",textAlign:"center"}}
            onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:32,marginBottom:12}}>🗑️</div>
            <div style={{fontWeight:700,fontSize:15,marginBottom:8}}>Удалить смету?</div>
            <div style={{fontSize:12,color:"#9ca3af",marginBottom:20}}>Это действие нельзя отменить</div>
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
          <div className="editor-header" style={{background:"#f3f4f6",borderBottom:"1px solid #e5e7eb",padding:"11px 22px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:10,gap:8}}>
            <div className="editor-header-left" style={{display:"flex",alignItems:"center",gap:8,flex:1,minWidth:0}}>
              <button className="btn btn-o" style={{padding:"7px 11px",fontSize:12,flexShrink:0}} onClick={saveAndBack}>
                ← Сметы
              </button>
              <div style={{fontSize:13,fontWeight:600,color:"#9ca3af",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0}}>
                {proj.name || "Новая смета"}
              </div>
            </div>
            <div className="editor-header-right" style={{display:"flex",alignItems:"center",gap:8}}>
              {saving && <span style={{fontSize:11,color:"#9ca3af"}}>💾</span>}
              {filledCount > 0 && (
                <button onClick={()=>setShowSelectedOnly(s=>!s)}
                  style={{fontSize:11,padding:"6px 12px",background:showSelectedOnly?"#f0fdf4":"",border:`1px solid ${showSelectedOnly?"#059669":"#e5e7eb"}`,borderRadius:6,color:showSelectedOnly?"#059669":"#9ca3af",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                  {showSelectedOnly ? `✓ Выбранные (${filledCount})` : `📋 Выбранные (${filledCount})`}
                </button>
              )}
              {currentUser.role !== "viewer" && (
                <button className="btn btn-o" style={{fontSize:11,padding:"6px 12px",background:showFinancial?"#eff6ff":"",borderColor:showFinancial?"#2563eb":""}} onClick={()=>setShowFinancial(m=>!m)}>
                  {showFinancial ? "💰 Финансы вкл" : "💰 Финансы"}
                </button>
              )}
              {currentUser.role === "viewer" && (
                <span style={{fontSize:11,color:"#9ca3af",background:"rgba(0,0,0,.04)",borderRadius:5,padding:"4px 10px"}}>👁 Только просмотр</span>
              )}
              <span className="proj-name" style={{fontSize:11,color:"#9ca3af"}}>
                {currentUser.role==="admin"?"👑":currentUser.role==="viewer"?"👁":"👤"} {currentUser.name}
              </span>
              <button className="btn btn-o" style={{padding:"8px 16px",fontSize:13}} onClick={saveAndBack}>← Назад</button>
              {saving && <span style={{fontSize:11,color:"#9ca3af"}}>💾</span>}
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
                    <div style={{fontSize:10,color:"#9ca3af",marginBottom:4}}>{lbl}</div>
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
                  const r = rows[w.name]||{};
                  if (Number(r.qty||0) > 0) selectedWorks.push({...w, cat, sub});
                }
                return (
                  <div className="card up">
                    <div style={{padding:"12px 16px",borderBottom:"1px solid #e5e7eb",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <span style={{fontWeight:700,fontSize:13,color:"#111827"}}>Выбранные позиции ({selectedWorks.length})</span>
                      <button onClick={()=>setShowSelectedOnly(false)} style={{background:"none",border:"none",color:"#9ca3af",cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>✕ Закрыть</button>
                    </div>
                    <div className="wrow-th" style={{display:"grid",gridTemplateColumns:"1fr 50px 120px 76px 90px",padding:"8px 16px",fontSize:11,color:"#6b7280",fontWeight:600,letterSpacing:".04em",textTransform:"uppercase",borderBottom:"1px solid #e5e7eb",background:"#f9fafb"}}>
                      <span>Наименование</span>
                      <span className="wrow-desk" style={{textAlign:"center"}}>Ед.</span>
                      <span className="wrow-desk" style={{textAlign:"right"}}>Цена за ед., ₸</span>
                      <span className="wrow-desk" style={{textAlign:"right"}}>Объём</span>
                      <span className="wrow-desk" style={{textAlign:"right"}}>Итого, ₸</span>
                    </div>
                    <div style={{padding:"4px 0"}}>
                      {selectedWorks.map(work => {
                        const r = rows[work.name]||{};
                        const qty = Number(r.qty||0);
                        const price = rowPrice(work);
                        const total = rowTotal(work);
                        const displayName = r.manualName !== undefined ? r.manualName : work.name;
                        const displayUnit = r.manualUnit !== undefined ? r.manualUnit : (work.unit||"м²");
                        return (
                          <div key={work.name} style={{display:"grid",gridTemplateColumns:"1fr 50px 120px 76px 90px",gap:4,padding:"8px 16px",borderBottom:"1px solid #f3f4f6",alignItems:"center"}}>
                            <div>
                              <div style={{fontSize:13,color:"#111827",fontWeight:500}}>{displayName}</div>
                              <div style={{fontSize:10,color:"#9ca3af"}}>{work.cat} · {work.sub}</div>
                              {showFinancial && currentUser.role!=="viewer" && qty > 0 && (() => {
                                const costPerUnit = work.cost || 0;
                                const dp = price ?? getBasePrice(work);
                                const marginPct = dp && dp > 0 && costPerUnit > 0 ? Math.round((dp - costPerUnit) / dp * 100) : null;
                                const grossProfit = dp != null && costPerUnit > 0 ? (dp - costPerUnit) * qty : null;
                                return (costPerUnit > 0) ? (
                                  <div style={{display:"flex",flexWrap:"wrap",gap:"4px 12px",marginTop:3,fontSize:10,color:"#6b7280"}}>
                                    <span>Себест: <b style={{color:"#374151"}}>{fmt(costPerUnit * qty)} ₸</b></span>
                                    {marginPct !== null && <span>Маржа: <b style={{color: marginPct>=35?"#059669":marginPct>=20?"#d97706":"#ef4444"}}>{marginPct}%</b></span>}
                                    {grossProfit !== null && grossProfit > 0 && <span>Прибыль: <b style={{color:"#059669"}}>{fmt(Math.round(grossProfit))} ₸</b></span>}
                                  </div>
                                ) : null;
                              })()}
                            </div>
                            <div style={{textAlign:"center"}}>
                              <input value={displayUnit}
                                onChange={e=>setRow(work.name,"manualUnit",e.target.value===(work.unit||"м²")?undefined:e.target.value)}
                                style={{width:"100%",border:"1px solid #e5e7eb",borderRadius:4,padding:"3px 4px",fontSize:11,textAlign:"center",fontFamily:"inherit",background:"#fff"}}/>
                            </div>
                            <div style={{textAlign:"right"}}>
                              <input type="number" min="0"
                                value={r.manualPrice !== undefined ? r.manualPrice : (price||"")}
                                onChange={e=>setRow(work.name,"manualPrice",e.target.value===""?undefined:Number(e.target.value))}
                                style={{width:"100%",border:"1px solid #e5e7eb",borderRadius:4,padding:"3px 6px",fontSize:12,textAlign:"right",fontFamily:"inherit",background:"#fff"}}/>
                            </div>
                            <div style={{textAlign:"right"}}>
                              <input type="number" min="0"
                                value={r.qty||""}
                                onChange={e=>setRow(work.name,"qty",e.target.value)}
                                style={{width:"100%",border:"1px solid #e5e7eb",borderRadius:4,padding:"3px 6px",fontSize:12,textAlign:"right",fontFamily:"inherit",background:"#fff"}}/>
                            </div>
                            <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:6}}>
                              <span style={{fontSize:13,fontWeight:700,color:total>0?"#2563eb":"#9ca3af"}}>{total>0?fmt(total):"—"}</span>
                              <button onClick={()=>setRow(work.name,"qty","")} title="Убрать из сметы"
                                style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:14,padding:0,lineHeight:1}}>✕</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{padding:"12px 16px",borderTop:"1px solid #e5e7eb",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontSize:12,color:"#9ca3af"}}>Итого по выбранным позициям</span>
                      <span style={{fontSize:15,fontWeight:800,color:"#2563eb"}}>{fmt(grand)} ₸</span>
                    </div>
                  </div>
                );
              })()}

              {/* РАБОТЫ */}
              <div className="card up" style={{display:showSelectedOnly?"none":"block"}}>
                {/* Поиск */}
                <div style={{padding:"10px 12px",borderBottom:"1px solid #e5e7eb",position:"relative"}}>
                  <input className="fi" placeholder="🔍  Поиск по работам... (например: штукатурка, плитка, розетки)"
                    value={search} onChange={e=>setSearch(e.target.value)}
                    style={{paddingLeft:14,paddingRight:search?32:14}}/>
                  {search && (
                    <button onClick={()=>setSearch("")} style={{position:"absolute",right:20,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"#9ca3af",fontSize:16,lineHeight:1}}>×</button>
                  )}
                </div>

                {/* Категории */}
                {!isSearching && <div style={{display:"flex",gap:3,padding:"10px 10px 0",borderBottom:"1px solid #e5e7eb"}}>
                  {cats.map(cat=>(
                    <button key={cat} className={`tab-btn ${activeCat===cat?"active":""}`}
                      onClick={()=>{ const s=Object.keys(Gdyn[cat]||{}); setActiveCat(cat); setActiveSub(s[0]||""); }}>
                      {cat}{catSum(cat)>0&&<span style={{marginLeft:4,fontSize:9,color:"#2563eb"}}>●</span>}
                    </button>
                  ))}
                </div>}

                {/* Подкатегории */}
                {!isSearching && <div style={{display:"flex",flexWrap:"wrap",gap:3,padding:"8px 10px",borderBottom:"1px solid #e5e7eb",background:"rgba(0,0,0,.12)"}}>
                  {subs.map(sub=>(
                    <button key={sub} className={`sub-btn ${safeActiveSub===sub?"active":""}`} onClick={()=>setActiveSub(sub)}>
                      {sub}{subSum(safeCat,sub)>0&&<span style={{marginLeft:3,color:"#2563eb",fontSize:8}}>●</span>}
                    </button>
                  ))}
                </div>}

                {/* Шапка таблицы */}
                <div className="wrow-th" style={{display:"grid",gridTemplateColumns:"1fr 50px 120px 76px 90px",padding:"8px 16px",fontSize:11,color:"#6b7280",fontWeight:600,letterSpacing:".04em",textTransform:"uppercase",borderBottom:"1px solid #e5e7eb",background:"#f9fafb"}}>
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
                    <div style={{textAlign:"center",padding:"32px 0",color:"#9ca3af"}}>
                      <div style={{fontSize:22,marginBottom:8}}>🔍</div>
                      <div style={{fontSize:13}}>Ничего не найдено</div>
                    </div>
                  )}
                  {isSearching && searchResults.length > 0 && (
                    <div style={{padding:"4px 8px 2px",fontSize:10,color:"#9ca3af",borderBottom:"1px solid #e5e7eb",marginBottom:2}}>
                      Найдено: {searchResults.length} работ
                    </div>
                  )}
                  {(isSearching ? searchResults : (Gdyn[safeCat]?.[safeActiveSub]||[])).map(work=>{
                    const r = rows[work.name]||{};
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
                    const costPerUnit = work.cost || 0;
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
                          onChange={e=>setRow(work.name,"manualPrice",e.target.value===""?undefined:Number(e.target.value))}
                          onBlur={()=>{ if(!editPrices) setEditingPriceRow(null); }}
                          onKeyDown={e=>{ if(e.key==="Enter"||e.key==="Escape"){ if(!editPrices) setEditingPriceRow(null); } }}/>
                        {r.manualPrice!==undefined && <span onClick={()=>setRow(work.name,"manualPrice",undefined)} title="Сбросить" style={{cursor:"pointer",fontSize:10,color:"#ef4444",marginLeft:2}}>✕</span>}
                      </div>
                    ) : displayPrice != null ? (
                      <div style={{display:"flex",alignItems:"center",gap:4,justifyContent:"flex-end"}}>
                        <span style={{fontSize:12,color:r.manualPrice!==undefined?"#2563eb":"#374151",fontWeight:r.manualPrice!==undefined?700:400}}>{fmt(displayPrice)}</span>
                        {currentUser.role!=="viewer" && <span onClick={()=>setEditingPriceRow(work.name)} title="Изменить цену" style={{cursor:"pointer",fontSize:10,color:"#9ca3af",opacity:.7,lineHeight:1}}>✏</span>}
                      </div>
                    ) : rowPriceFrom(work) ? (
                      <div style={{display:"flex",alignItems:"center",gap:4,justifyContent:"flex-end"}}>
                        <span style={{fontSize:11,color:"#b8904a",fontStyle:"italic"}}>от {fmt(rowPriceFrom(work))}</span>
                        {currentUser.role!=="viewer" && <span onClick={()=>setEditingPriceRow(work.name)} title="Ввести точную цену" style={{cursor:"pointer",fontSize:10,color:"#9ca3af"}}>✏</span>}
                      </div>
                    ) : (
                      <div style={{display:"flex",alignItems:"center",gap:4,justifyContent:"flex-end"}}>
                        <span style={{fontSize:10,color:"#9ca3af",fontStyle:"italic"}}>нет цены</span>
                        {currentUser.role!=="viewer" && <span onClick={()=>setEditingPriceRow(work.name)} title="Ввести цену" style={{cursor:"pointer",fontSize:10,color:"#9ca3af"}}>✏</span>}
                      </div>
                    );
                    const qtyInput = <input className="num" style={{width:70,textAlign:"center",opacity:currentUser.role==="viewer"?.4:1}} type="number" min="0" placeholder="0" disabled={currentUser.role==="viewer"}
                      value={r.qty||""} onChange={e=>setRow(work.name,"qty",e.target.value)}/>;
                    const nameBlock = (
                      <div style={{minWidth:0}}>
                        {showBreadcrumb && <div style={{fontSize:10,color:"#374151",marginBottom:2}}>{work.cat} › {work.sub}</div>}
                        {r.editingName ? (
                          <div style={{display:"flex",alignItems:"center",gap:4}}>
                            <input autoFocus style={{fontSize:13,background:"#f3f4f6",border:"1px solid #2563eb",color:"#111827",borderRadius:5,padding:"2px 7px",fontFamily:"inherit",outline:"none",width:"100%",minWidth:0}}
                              value={r.manualName !== undefined ? r.manualName : work.name}
                              onChange={e=>setRow(work.name,"manualName",e.target.value)}
                              onBlur={()=>setRow(work.name,"editingName",false)}
                              onKeyDown={e=>{if(e.key==="Enter"||e.key==="Escape")setRow(work.name,"editingName",false);}}/>
                            {r.manualName !== undefined && <span onClick={()=>{setRow(work.name,"manualName",undefined);setRow(work.name,"editingName",false);}} title="Сбросить" style={{cursor:"pointer",fontSize:10,color:"#ef4444",flexShrink:0}}>✕</span>}
                          </div>
                        ) : (
                          <div style={{display:"flex",alignItems:"center",gap:4}}>
                            <span style={{fontSize:13,color:filled?"#111827":"#9ca3af",lineHeight:1.3}}>{r.manualName !== undefined ? r.manualName : work.name}</span>
                            {currentUser.role!=="viewer" && <span onClick={()=>setRow(work.name,"editingName",true)} title="Изменить название" style={{cursor:"pointer",fontSize:10,color:"#9ca3af",opacity:.6,flexShrink:0,lineHeight:1}}>✏</span>}
                          </div>
                        )}
                        {tierHint && <div style={{fontSize:10,color:"#374151",marginTop:1}}>{tierHint}</div>}
                        {qty > 0 && currentUser.role!=="viewer" && (
                          <div style={{display:"flex",alignItems:"center",gap:4,marginTop:4}}>
                            <span style={{fontSize:10,color:"#9ca3af"}}>Надбавка:</span>
                            <input className="num" type="number" min="-50" max="300" step="5"
                              style={{width:52,fontSize:11,padding:"2px 6px",textAlign:"right"}}
                              value={cpxPct}
                              onChange={e=>{setRow(work.name,"cpxPct",Number(e.target.value));setRow(work.name,"manualPrice",undefined);}}/>
                            <span style={{fontSize:10,color:"#9ca3af"}}>%</span>
                          </div>
                        )}
                        {showFinancial && currentUser.role!=="viewer" && qty > 0 && (
                          <div style={{display:"flex",flexWrap:"wrap",gap:"4px 12px",marginTop:4,fontSize:10,color:"#6b7280"}}>
                            {costPerUnit > 0 && <span>Себест: <b style={{color:"#374151"}}>{fmt(costPerUnit * qty)} ₸</b></span>}
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
                              <input autoFocus style={{width:46,background:"#f3f4f6",border:"1px solid #2563eb",borderRadius:4,padding:"2px 5px",fontSize:11,fontFamily:"inherit",outline:"none",textAlign:"center",color:"#111827"}}
                                value={r.manualUnit !== undefined ? r.manualUnit : work.unit}
                                onChange={e=>setRow(work.name,"manualUnit",e.target.value)}
                                onBlur={()=>setRow(work.name,"editingUnit",false)}
                                onKeyDown={e=>{if(e.key==="Enter"||e.key==="Escape")setRow(work.name,"editingUnit",false);}}/>
                              {r.manualUnit !== undefined && <span onClick={()=>{setRow(work.name,"manualUnit",undefined);setRow(work.name,"editingUnit",false);}} title="Сбросить" style={{cursor:"pointer",fontSize:10,color:"#ef4444"}}>✕</span>}
                            </div>
                          ) : (
                            <>
                              <span style={{color:r.manualUnit!==undefined?"#2563eb":"#9ca3af",fontWeight:r.manualUnit!==undefined?700:400}}>{r.manualUnit !== undefined ? r.manualUnit : work.unit}</span>
                              {currentUser.role!=="viewer" && <span onClick={()=>setRow(work.name,"editingUnit",true)} title="Изменить ед. изм." style={{cursor:"pointer",fontSize:10,color:"#9ca3af",opacity:.6,lineHeight:1}}>✏</span>}
                            </>
                          )}
                        </div>
                        <div className="wrow-desk" style={{textAlign:"right",paddingTop:2}}>{priceCell}</div>
                        <div className="wrow-desk" style={{textAlign:"right"}}>{qtyInput}</div>
                        <div className="wrow-desk" style={{textAlign:"right",paddingTop:3}}>
                          {total>0 ? <span style={{fontSize:13,fontWeight:700,color:"#2563eb"}}>{fmt(total)}</span>
                                   : <span style={{color:"#9ca3af",fontSize:12}}>—</span>}
                        </div>
                        {/* Mobile right column: цена/ед · поле · итог */}
                        <div className="wrow-mob-extra" style={{flexDirection:"column",alignItems:"flex-end",gap:3,display:"none",paddingTop:2,minWidth:90}}>
                          <span style={{fontSize:11,color:"#9ca3af",whiteSpace:"nowrap"}}>
                            {displayPrice!=null ? fmt(displayPrice)+" ₸/ед" : <span style={{fontStyle:"italic",fontSize:10}}>нет цены</span>}
                          </span>
                          <input className="num" style={{width:82,textAlign:"center",fontSize:16,padding:"7px 10px",fontWeight:700}} type="number" min="0" placeholder="0"
                            value={r.qty||""} onChange={e=>setRow(work.name,"qty",e.target.value)}/>
                          {total>0
                            ? <span style={{fontSize:12,fontWeight:800,color:"#111827",whiteSpace:"nowrap"}}>{fmt(total)} ₸</span>
                            : <span style={{fontSize:10,color:"#374151"}}>—</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {!isSearching && subSum(safeCat,safeActiveSub)>0&&(
                  <div style={{borderTop:"1px solid #e5e7eb",padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,flexWrap:"wrap"}}>
                    <span style={{fontSize:11,color:"#9ca3af"}}>Итого по разделу «{safeActiveSub}»</span>
                    <div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
                      {showFinancial && currentUser.role!=="viewer" && (() => {
                        const subWorks = (Gdyn[safeCat]?.[safeActiveSub]||[]);
                        let subCost=0, subProfit=0;
                        for(const w of subWorks){
                          const qty=Number((rows[w.name]||{}).qty||0);
                          const p=rowPrice(w); const bp=getBasePrice(w);
                          const dp=p??bp;
                          const c=(w.cost||0)*qty;
                          subCost+=c;
                          if(qty>0&&dp!=null) subProfit+=(dp-(w.cost||0))*qty;
                        }
                        return subCost>0 ? (
                          <span style={{fontSize:11,color:"#6b7280"}}>
                            Себест: <b style={{color:"#374151"}}>{fmt(Math.round(subCost))} ₸</b>
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
                    <div style={{borderTop:"1px solid #e5e7eb",padding:"10px 14px",display:"flex",justifyContent:"space-between"}}>
                      <span style={{fontSize:11,color:"#9ca3af"}}>Итого по найденным работам</span>
                      <span style={{fontSize:15,fontWeight:700,color:"#2563eb"}}>{fmt(searchTotal)} ₸</span>
                    </div>
                  ) : null;
                })()}
              </div>

              {/* ПРАВАЯ ПАНЕЛЬ */}
              <div id="summary-panel" style={{display:"flex",flexDirection:"column",gap:14}}>
                <div style={{background:"#f3f4f6",border:"1px solid #e5e7eb",borderRadius:6,padding:18}} className="up">
                  <div style={{fontSize:10,fontWeight:700,color:"#2563eb",letterSpacing:1.5,textTransform:"uppercase",marginBottom:14}}>Смета</div>
                  {cats.map(cat=>{
                    const cs = catSum(cat);
                    if(!cs) return null;
                    return (
                      <div key={cat} style={{marginBottom:8}}>
                        <div style={{fontSize:10,color:"#9ca3af",fontWeight:700,textTransform:"uppercase",letterSpacing:.7,padding:"5px 0 3px",borderBottom:"1px solid #e5e7eb"}}>{cat}</div>
                        {Object.keys(Gdyn[cat]||{}).map(sub=>{
                          const ss = subSum(cat,sub);
                          if(!ss) return null;
                          return (
                            <div key={sub} style={{display:"flex",justifyContent:"space-between",padding:"4px 0 4px 6px",fontSize:12,borderBottom:"1px solid #f3f4f6"}}>
                              <span style={{color:"#9ca3af"}}>{sub}</span>
                              <span style={{color:"#9ca3af"}}>{fmt(ss)} ₸</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                  {grand===0&&<div style={{textAlign:"center",padding:"22px 0",color:"#9ca3af",fontSize:12}}>Введите объёмы →</div>}
                  {grand>0&&(
                    <>
                      <div style={{marginTop:10,paddingTop:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{fontSize:12,color:"#9ca3af"}}>Скидка %</span>
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
                          <span style={{fontSize:12,color:"#9ca3af"}}>Повышение % <span style={{fontSize:10,color:"#d97706"}}>🔒</span></span>
                          <input className="num" style={{width:54}} type="number" min="0" max="300"
                            value={markup} onChange={e=>setMarkup(Math.max(0,Number(e.target.value)))}/>
                        </div>
                      )}
                      {markup>0&&currentUser.role!=="viewer"&&(
                        <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#d97706",marginTop:4}}>
                          <span>Повышение {markup}%</span><span>+ {fmt(markupAmt)} ₸</span>
                        </div>
                      )}
                      <div style={{borderTop:"1px solid #e5e7eb",marginTop:12,paddingTop:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{fontSize:12,color:"#2563eb"}}>Итого</span>
                        <span style={{fontSize:22,fontWeight:900,color:"#2563eb"}}>{fmt(final)} ₸</span>
                      </div>
                      {proj.area&&Number(proj.area)>0&&(
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:6,padding:"5px 8px",background:"#eff6ff",borderRadius:6}}>
                          <span style={{fontSize:11,color:"#d97706"}}>Цена за м²</span>
                          <span style={{fontSize:13,fontWeight:700,color:"#2563eb"}}>≈ {fmt(final/Number(proj.area))} ₸</span>
                        </div>
                      )}
                      {showFinancial && currentUser.role!=="viewer" && (() => {
                        const allFilled = getEffectiveCatalog().filter(w => Number((rows[w.name]||{}).qty||0) > 0);
                        let totalCost=0, totalRevenue=0;
                        for(const w of allFilled){
                          const qty=Number((rows[w.name]||{}).qty||0);
                          const p=rowPrice(w); const bp=getBasePrice(w); const dp=p??bp;
                          totalCost += (w.cost||0)*qty;
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
                                <span style={{color:"#6b7280"}}>Себестоимость</span>
                                <span style={{fontWeight:600,color:"#374151"}}>{fmt(Math.round(totalCost))} ₸</span>
                              </div>
                              <div style={{display:"flex",justifyContent:"space-between"}}>
                                <span style={{color:"#6b7280"}}>Цена клиента{discount>0?` (−${discount}%)`:""}</span>
                                <span style={{fontWeight:600,color:"#374151"}}>{fmt(Math.round(revenueAfterDiscount))} ₸</span>
                              </div>
                              <div style={{display:"flex",justifyContent:"space-between",borderTop:"1px solid #bbf7d0",paddingTop:5,marginTop:2}}>
                                <span style={{color:"#059669",fontWeight:700}}>Валовая прибыль</span>
                                <span style={{fontWeight:800,color:"#059669"}}>{fmt(Math.round(totalProfit))} ₸</span>
                              </div>
                              <div style={{display:"flex",justifyContent:"space-between"}}>
                                <span style={{color:"#6b7280"}}>Маржа</span>
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
                  <div style={{fontSize:10,color:"#9ca3af",fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",marginBottom:8}}>Статус</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {STATUSES.map(s=>(
                      <button key={s.key} onClick={()=>{setEstStatus(s.key);if(s.key==="sent"&&!estSentAt)setEstSentAt(new Date().toISOString().slice(0,10));}}
                        style={{fontSize:11,fontWeight:700,padding:"4px 12px",borderRadius:6,cursor:"pointer",fontFamily:"inherit",border:`1px solid ${estStatus===s.key?s.color:"rgba(0,0,0,.04)"}`,background:estStatus===s.key?s.bg:"transparent",color:estStatus===s.key?s.color:"#9ca3af",transition:"all .15s"}}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                  {estStatus==="sent" && (
                    <div style={{marginTop:8,display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:11,color:"#7c3aed",fontWeight:600}}>Дата отправки:</span>
                      <input type="date" className="fi" value={estSentAt} onChange={e=>setEstSentAt(e.target.value)}
                        style={{fontSize:12,padding:"3px 8px",borderRadius:6,border:"1px solid rgba(124,58,237,.3)",width:150,color:"#7c3aed",fontFamily:"inherit"}}/>
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
                        <span style={{fontSize:10,color:"#9ca3af",fontWeight:700,letterSpacing:1.2,textTransform:"uppercase"}}>История изменений ({hist.length})</span>
                        <span style={{fontSize:12,color:"#9ca3af"}}>{showHistory?"▲":"▼"}</span>
                      </div>
                      {showHistory && (
                        <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:0,maxHeight:240,overflowY:"auto"}}>
                          {[...hist].reverse().map((h,i)=>(
                            <div key={i} style={{display:"flex",gap:8,padding:"6px 0",borderTop:i>0?"1px solid rgba(0,0,0,.05)":"none",fontSize:12}}>
                              <span style={{color:"#9ca3af",whiteSpace:"nowrap",flexShrink:0,fontSize:11}}>{fmtDate(h.ts)}</span>
                              <span style={{flex:1,color:"#374151"}}><b style={{color:"#111827"}}>{h.by||"?"}</b> · {h.action}{h.total>0?<span style={{color:"#9ca3af"}}> · {fmt(h.total)} ₸</span>:null}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
                {/* Комментарий для менеджера */}
                <div className="card" style={{padding:14}}>
                  <div style={{fontSize:10,color:"#9ca3af",fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",marginBottom:7}}>Комментарий</div>
                  <textarea className="fi" rows={3} style={{resize:"vertical",minHeight:60,overflowY:"auto"}} placeholder="Заметка для менеджера..." value={estComment} onChange={e=>setEstComment(e.target.value)}/>
                </div>
                <div className="card" style={{padding:14}}>
                  <div style={{fontSize:10,color:"#9ca3af",fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",marginBottom:7}}>Примечание в КП</div>
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
              <div style={{fontWeight:800,fontSize:16,color:"#111827"}}>🕘 Бэкапы {listBackups.label}</div>
              <button onClick={()=>setListBackups(null)} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:"#9ca3af"}}>✕</button>
            </div>
            <div style={{fontSize:12,color:"#9ca3af",marginBottom:14}}>Снимки перед каждым изменением (последние 20). Можно откатиться к любому.</div>
            {listBackups.items.length===0 && <div style={{textAlign:"center",padding:"30px 0",color:"#9ca3af",fontSize:13}}>Бэкапов пока нет — появятся после первого изменения</div>}
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {listBackups.items.map((snap,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"10px 12px",background:"#f9fafb",border:"1px solid #e5e7eb",borderRadius:8}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:"#111827"}}>{new Date(snap.ts).toLocaleString("ru-RU")}</div>
                    <div style={{fontSize:11,color:"#9ca3af"}}>Записей: {snap.count}{snap.by?` · ${snap.by}`:""}{i===0?" · последний":""}</div>
                  </div>
                  <button onClick={()=>listBackups.onRestore(snap)}
                    style={{background:"#eff6ff",color:"#2563eb",border:"1px solid rgba(37,99,235,.2)",borderRadius:6,padding:"6px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
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
              <div style={{fontWeight:800,fontSize:16,color:"#111827"}}>🕘 Бэкапы архива</div>
              <button onClick={()=>setBackupsModal(null)} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:"#9ca3af"}}>✕</button>
            </div>
            <div style={{fontSize:12,color:"#9ca3af",marginBottom:14}}>Снимки архива перед каждой записью (последние 20). Можно откатиться к любому.</div>
            {backupsModal.length===0 && <div style={{textAlign:"center",padding:"30px 0",color:"#9ca3af",fontSize:13}}>Бэкапов пока нет</div>}
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {backupsModal.map((snap,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"10px 12px",background:"#f9fafb",border:"1px solid #e5e7eb",borderRadius:8}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:"#111827"}}>{new Date(snap.ts).toLocaleString("ru-RU")}</div>
                    <div style={{fontSize:11,color:"#9ca3af"}}>Смет: {snap.count}{snap.by?` · ${snap.by}`:""}{i===0?" · последний":""}</div>
                  </div>
                  <button onClick={()=>restoreBackup(snap)}
                    style={{background:"#eff6ff",color:"#2563eb",border:"1px solid rgba(37,99,235,.2)",borderRadius:6,padding:"6px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
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
              <div style={{fontWeight:800,fontSize:16,color:"#111827"}}>🕘 Бэкапы рабочего пространства</div>
              <button onClick={()=>setWsBackupsModal(null)} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:"#9ca3af"}}>✕</button>
            </div>
            <div style={{fontSize:12,color:"#9ca3af",marginBottom:14}}>Каждый снимок — объекты вместе со сметами и договорами (последние 20). Восстановление вернёт всё целиком.</div>
            {wsBackupsModal.length===0 && <div style={{textAlign:"center",padding:"30px 0",color:"#9ca3af",fontSize:13}}>Снимков пока нет — появятся автоматически после изменений</div>}
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {wsBackupsModal.map((snap,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"10px 12px",background:"#f9fafb",border:"1px solid #e5e7eb",borderRadius:8}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:"#111827"}}>{new Date(snap.ts).toLocaleString("ru-RU")}</div>
                    <div style={{fontSize:11,color:"#9ca3af"}}>📦 {snap.counts?.o??(snap.objects?.length||0)} · 📋 {snap.counts?.e??(snap.estimates?.length||0)} · 📄 {snap.counts?.c??(snap.contracts?.length||0)}{snap.by?` · ${snap.by}`:""}{i===0?" · последний":""}</div>
                  </div>
                  <button onClick={()=>restoreWorkspace(snap)}
                    style={{background:"#eff6ff",color:"#2563eb",border:"1px solid rgba(37,99,235,.2)",borderRadius:6,padding:"6px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
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
              <div style={{fontWeight:800,fontSize:16,color:"#111827"}}>⬆ Импорт смет из JSON</div>
              <button onClick={()=>!importBusy && setImportModal(false)} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:"#9ca3af"}}>✕</button>
            </div>
            <div style={{fontSize:12,color:"#9ca3af",marginBottom:12}}>Вставьте JSON, полученный для восстановления смет. Текущий архив уйдёт в бэкап — откат доступен через «Бэкапы».</div>
            <textarea
              value={importText}
              onChange={e=>setImportText(e.target.value)}
              placeholder='{"customWorks":[...],"estimates":[...]}'
              style={{width:"100%",minHeight:200,resize:"vertical",background:"#f9fafb",border:"1px solid #e5e7eb",borderRadius:8,padding:"10px 12px",fontFamily:"monospace",fontSize:12,color:"#111827",outline:"none"}}/>
            <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:14}}>
              <button onClick={()=>!importBusy && setImportModal(false)}
                style={{background:"#e5e7eb",color:"#6b7280",border:"none",cursor:"pointer",padding:"9px 16px",borderRadius:7,fontFamily:"inherit",fontSize:13,fontWeight:600}}>Отмена</button>
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
            onClick={()=>setShowKP(false)}>
            <div style={{background:"#ffffff",color:"#111827",borderRadius:8,padding:"24px 28px",maxWidth:700,width:"100%",maxHeight:"90vh",overflowY:"auto",fontFamily:"'Inter','Segoe UI',sans-serif"}}
              onClick={e=>e.stopPropagation()}>
              <KPContent proj={proj} kpItems={kpItems} fromItems={kpFromItems} discount={discount} discAmt={discAmt} final={final} note={note}/>
              <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:20}}>
                <button style={{background:"#e5e7eb",color:"#9ca3af",border:"none",cursor:"pointer",padding:"10px 18px",borderRadius:7,fontFamily:"inherit",fontSize:13,fontWeight:600}} onClick={()=>setShowKP(false)}>Закрыть</button>
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
                const blob = new Blob([html], {type:"text/html"});
                const url = URL.createObjectURL(blob);
                window.open(url, "_blank");
                setTimeout(()=>URL.revokeObjectURL(url), 30000);
              }}>Печать / PDF</button>
              </div>
            </div>
          </div>
          {/* Портал для печати — точная копия, отображается только при print */}
          <div id="kp-print-portal" style={{display:"none",fontFamily:"'Inter','Segoe UI',sans-serif",background:"#ffffff",padding:"20px 24px",color:"#111827"}}>
            <KPContent proj={proj} kpItems={kpItems} fromItems={kpFromItems} discount={discount} discAmt={discAmt} final={final} note={note}/>
          </div>
        </>
      )}

      {/* ЭКРАН: АНАЛИТИКА */}
      {effScreen === "analytics" && (()=>{
        const { baseEst, baseCon, totalEst, withSumEst, totalSumEst, avgEst, totalCon, totalSumCon, avgCon, byStatus, byType, topCats, managers, managerStats, byConType, TYPE_L2,
          wonRevenue, wonCost, wonProfit, wonMargin, allRevenue, allCost, allProfit, allMargin, funnel, winRateOverall, winRateSent, agreedB, sentB, catProfit, monthly, staleSent } = analyticsData;
        const PERIOD_BTNS = [["all","Всё время"],["month","Месяц"],["3month","3 месяца"],["week","Неделя"],["custom","Вручную"]];
        return (
          <div className="page">
            <div style={{marginBottom:24}}>
              <h1 style={{margin:0,fontSize:22,fontWeight:900,color:"#111827"}}>📊 Аналитика</h1>
              <div style={{fontSize:12,color:"#9ca3af",marginTop:4}}>Статистика по объектам и договорам</div>
            </div>
            <div className="an-filters" style={{background:"#f3f4f6",border:"1px solid #e5e7eb",borderRadius:6,padding:"16px 18px",marginBottom:20,display:"flex",flexWrap:"wrap",gap:16}}>
              <div style={{flex:"1 1 300px"}}>
                <div style={{fontSize:10,color:"#9ca3af",textTransform:"uppercase",letterSpacing:1,marginBottom:8,fontWeight:700}}>Период</div>
                <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                  {PERIOD_BTNS.map(([k,l])=>(
                    <button key={k} onClick={()=>setStatsPeriod(k)}
                      style={{fontSize:11,fontWeight:600,padding:"5px 12px",borderRadius:7,cursor:"pointer",fontFamily:"inherit",
                        border:"1px solid "+(statsPeriod===k?"#2563eb":"rgba(0,0,0,.04)"),
                        background:statsPeriod===k?"#eff6ff":"transparent",
                        color:statsPeriod===k?"#2563eb":"#9ca3af"}}>{l}</button>
                  ))}
                </div>
                {statsPeriod==="custom" && (
                  <div style={{display:"flex",gap:10,marginTop:10,flexWrap:"wrap"}}>
                    <div><div style={{fontSize:10,color:"#9ca3af",marginBottom:4}}>С</div><input type="date" className="fi" style={{width:"auto"}} value={statsDateFrom} onChange={e=>setStatsDateFrom(e.target.value)}/></div>
                    <div><div style={{fontSize:10,color:"#9ca3af",marginBottom:4}}>По</div><input type="date" className="fi" style={{width:"auto"}} value={statsDateTo} onChange={e=>setStatsDateTo(e.target.value)}/></div>
                  </div>
                )}
              </div>
              <div style={{flex:"1 1 200px"}}>
                <div style={{fontSize:10,color:"#9ca3af",textTransform:"uppercase",letterSpacing:1,marginBottom:8,fontWeight:700}}>Менеджер</div>
                <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                  <button onClick={()=>setStatsManager("")} style={{fontSize:11,fontWeight:600,padding:"5px 12px",borderRadius:7,cursor:"pointer",fontFamily:"inherit",border:"1px solid "+(!statsManager?"#2563eb":"rgba(0,0,0,.04)"),background:!statsManager?"rgba(136,136,204,.15)":"transparent",color:!statsManager?"#2563eb":"#9ca3af"}}>🏢 Все</button>
                  {managers.map(m=>(<button key={m} onClick={()=>setStatsManager(m)} style={{fontSize:11,fontWeight:600,padding:"5px 12px",borderRadius:7,cursor:"pointer",fontFamily:"inherit",border:"1px solid "+(statsManager===m?"#2563eb":"rgba(0,0,0,.04)"),background:statsManager===m?"rgba(136,136,204,.15)":"transparent",color:statsManager===m?"#2563eb":"#9ca3af"}}>👤 {m}</button>))}
                </div>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10,marginBottom:20}}>
              {[["Объектов",totalEst,"в периоде","#2563eb"],["Объём",fmt(totalSumEst)+" ₸","сумма смет","#2563eb"],["Ср. чек",fmt(avgEst)+" ₸","на объект","#059669"],["Договоров",totalCon,"в периоде","#2563eb"],["Объём дог.",fmt(totalSumCon)+" ₸","сумма","#2563eb"],["Ср. дог.",fmt(avgCon)+" ₸","по договорам","#059669"]].map(([l,v,s,c],i)=>(
                <div key={i} style={{background:"#f3f4f6",border:"1px solid #e5e7eb",borderRadius:10,padding:"14px 14px 12px",position:"relative",overflow:"hidden"}}>
                  <div style={{position:"absolute",top:0,left:0,width:3,height:"100%",background:c,borderRadius:"3px 0 0 3px"}}/>
                  <div style={{fontSize:9,color:"#9ca3af",textTransform:"uppercase",letterSpacing:.8,marginBottom:6}}>{l}</div>
                  <div style={{fontSize:20,fontWeight:900,color:c,lineHeight:1,marginBottom:4}}>{v}</div>
                  <div style={{fontSize:10,color:"#9ca3af"}}>{s}</div>
                </div>
              ))}
            </div>

            {/* ── A. Финансовый обзор ── */}
            <div style={{background:"#ffffff",border:"1px solid #e5e7eb",borderRadius:10,padding:"18px 20px",marginBottom:16,boxShadow:"0 1px 2px rgba(0,0,0,.04)"}}>
              <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",flexWrap:"wrap",gap:8,marginBottom:14}}>
                <span style={{fontSize:11,color:"#059669",textTransform:"uppercase",letterSpacing:1,fontWeight:700}}>💰 Финансы — согласованные сметы (заработано)</span>
                <span style={{fontSize:11,color:"#9ca3af"}}>в выбранном периоде</span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10}}>
                {[
                  ["Выручка", fmt(Math.round(wonRevenue))+" ₸", "#2563eb"],
                  ["Себестоимость", fmt(Math.round(wonCost))+" ₸", "#6b7280"],
                  ["Валовая прибыль", fmt(Math.round(wonProfit))+" ₸", "#059669"],
                  ["Средняя маржа", wonMargin+"%", wonMargin>=35?"#059669":wonMargin>=20?"#d97706":"#ef4444"],
                ].map(([l,v,c],i)=>(
                  <div key={i} style={{padding:"12px 14px",background:"#f9fafb",borderRadius:8,borderLeft:`3px solid ${c}`}}>
                    <div style={{fontSize:9,color:"#9ca3af",textTransform:"uppercase",letterSpacing:.8,marginBottom:6}}>{l}</div>
                    <div style={{fontSize:19,fontWeight:900,color:c,lineHeight:1}}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{marginTop:12,paddingTop:12,borderTop:"1px dashed #e5e7eb",display:"flex",gap:18,flexWrap:"wrap",fontSize:12,color:"#6b7280"}}>
                <span>Потенциал (все сметы с суммой): <b style={{color:"#374151"}}>{fmt(Math.round(allRevenue))} ₸</b> выручка · прибыль <b style={{color:"#059669"}}>{fmt(Math.round(allProfit))} ₸</b> · маржа <b style={{color:"#374151"}}>{allMargin}%</b></span>
              </div>
            </div>

            {/* ── B. Воронка с деньгами и конверсией ── */}
            <div style={{background:"#ffffff",border:"1px solid #e5e7eb",borderRadius:10,padding:"18px 20px",marginBottom:16,boxShadow:"0 1px 2px rgba(0,0,0,.04)"}}>
              <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",flexWrap:"wrap",gap:8,marginBottom:14}}>
                <span style={{fontSize:11,color:"#7c3aed",textTransform:"uppercase",letterSpacing:1,fontWeight:700}}>🪜 Воронка продаж (деньги)</span>
                <span style={{fontSize:12,color:"#6b7280"}}>Win-rate: <b style={{color:"#059669"}}>{winRateOverall}%</b> от всех · <b style={{color:"#7c3aed"}}>{winRateSent}%</b> от отправленных</span>
              </div>
              {(() => {
                const maxSum = Math.max(1, ...funnel.map(f=>f.sum));
                return (
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {funnel.map(f=>(
                      <div key={f.key} style={{display:"flex",alignItems:"center",gap:12}}>
                        <span className="an-bar-label" style={{fontSize:12,fontWeight:600,color:f.color,width:140,flexShrink:0}}>{f.label}</span>
                        <div style={{flex:1,minWidth:60,background:"rgba(0,0,0,.04)",borderRadius:6,height:26,position:"relative",overflow:"hidden"}}>
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

            {/* ── E. Динамика по месяцам ── */}
            {monthly.length>0 && (
              <div style={{background:"#ffffff",border:"1px solid #e5e7eb",borderRadius:10,padding:"18px 20px",marginBottom:16,boxShadow:"0 1px 2px rgba(0,0,0,.04)"}}>
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
                          <div style={{fontSize:10,color:"#9ca3af",whiteSpace:"nowrap"}}>{m.label}</div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                <div style={{display:"flex",gap:16,marginTop:10,fontSize:11,color:"#9ca3af"}}>
                  <span><span style={{display:"inline-block",width:10,height:10,background:"#93c5fd",borderRadius:2,marginRight:5}}/>Выручка</span>
                  <span><span style={{display:"inline-block",width:10,height:10,background:"#059669",borderRadius:2,marginRight:5}}/>Прибыль</span>
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
                      <span style={{fontSize:13,color:"#111827",flex:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{e.proj?.name||"Объект"}{e.proj?.phone?` · 📞 ${e.proj.phone}`:""}</span>
                      {e.total>0&&<span style={{fontSize:12,fontWeight:700,color:"#2563eb"}}>{fmt(e.total)} ₸</span>}
                      <span style={{fontSize:11,fontWeight:700,color:"#dc2626",whiteSpace:"nowrap"}}>{days} дн.</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(380px,1fr))",gap:16,marginBottom:16}}>
              <div style={{background:"#f3f4f6",border:"1px solid #e5e7eb",borderRadius:6,padding:"18px"}}>
                <div style={{fontSize:11,color:"#d97706",textTransform:"uppercase",letterSpacing:1,fontWeight:700,marginBottom:14}}>Объекты</div>
                <div style={{fontSize:10,color:"#9ca3af",textTransform:"uppercase",letterSpacing:1,marginBottom:8,fontWeight:700}}>По статусам</div>
                <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:14}}>
                  {DEAL_STATUSES.map(s=>(
                    <div key={s.key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",background:"rgba(0,0,0,.02)",borderRadius:6}}>
                      <span style={{fontSize:12,color:s.color,fontWeight:600}}>{s.label}</span>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <div style={{width:80,height:4,background:"rgba(255,255,255,.06)",borderRadius:2,overflow:"hidden"}}>
                          <div style={{width:totalEst?(byStatus[s.key]/totalEst*100)+"%":"0%",height:"100%",background:s.color,borderRadius:2}}/>
                        </div>
                        <span style={{fontSize:13,fontWeight:700,color:"#111827",minWidth:20,textAlign:"right"}}>{byStatus[s.key]}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {Object.keys(byType).length>0 && <><div style={{fontSize:10,color:"#9ca3af",textTransform:"uppercase",letterSpacing:1,marginBottom:8,fontWeight:700}}>По типу объекта</div><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{Object.entries(byType).sort((a,b)=>b[1]-a[1]).map(([t,n])=>(<span key={t} style={{fontSize:11,padding:"3px 10px",borderRadius:4,background:"rgba(0,0,0,.04)",color:"#9ca3af"}}>{t}: <strong style={{color:"#111827"}}>{n}</strong></span>))}</div></>}
              </div>
              <div style={{background:"#f3f4f6",border:"1px solid #e5e7eb",borderRadius:6,padding:"18px"}}>
                <div style={{fontSize:11,color:"#d97706",textTransform:"uppercase",letterSpacing:1,fontWeight:700,marginBottom:14}}>Договора</div>
                {Object.keys(byConType).length>0 && <><div style={{fontSize:10,color:"#9ca3af",textTransform:"uppercase",letterSpacing:1,marginBottom:8,fontWeight:700}}>По типам</div><div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:14}}>{Object.entries(byConType).sort((a,b)=>b[1]-a[1]).map(([t,n])=>(<div key={t} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",background:"rgba(0,0,0,.02)",borderRadius:6}}><span style={{fontSize:12,color:"#9ca3af"}}>{t}</span><span style={{fontSize:13,fontWeight:700,color:"#2563eb"}}>{n}</span></div>))}</div></>}
                {baseCon.length>0 && <><div style={{fontSize:10,color:"#9ca3af",textTransform:"uppercase",letterSpacing:1,marginBottom:8,fontWeight:700}}>Договора в периоде</div><div style={{display:"flex",flexDirection:"column",gap:3}}>{[...baseCon].sort((a,b)=>Number(b.id||0)-Number(a.id||0)).slice(0,6).map(c=>{const cl=contractClients.find(x=>x.id===c.clientId);const sum=(c.works||[]).reduce((s,w)=>s+(w.quantity*w.price||0),0);return(<div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",background:"rgba(0,0,0,.02)",borderRadius:6,cursor:"pointer"}} onClick={()=>{setCurrentContract({...c});setContractTab("editor");setScreen("contracts");}}><div style={{minWidth:0}}><div style={{fontSize:12,color:"#111827",fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{TYPE_L2[c.type||"repair_fiz"]} #{c.number||"--"}</div><div style={{fontSize:10,color:"#9ca3af"}}>{cl?.name||c.estClient||"--"}</div></div><span style={{fontSize:12,fontWeight:700,color:"#2563eb",flexShrink:0,marginLeft:8}}>{fmt(sum)} </span></div>);})}</div></>}
                {totalCon===0 && <div style={{textAlign:"center",color:"#374151",fontSize:13,padding:"30px 0"}}>Нет договоров за период</div>}
              </div>
            </div>
            {/* ── C. Менеджеры по прибыли ── */}
            {!statsManager && managerStats.length>0 && (
              <div style={{background:"#ffffff",border:"1px solid #e5e7eb",borderRadius:10,padding:"18px 20px",marginBottom:16,boxShadow:"0 1px 2px rgba(0,0,0,.04)"}}>
                <div style={{fontSize:11,color:"#2563eb",textTransform:"uppercase",letterSpacing:1,fontWeight:700,marginBottom:12}}>👥 Менеджеры — прибыль и конверсия</div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,padding:"0 12px",fontSize:9,color:"#9ca3af",textTransform:"uppercase",letterSpacing:.5}}>
                    <span style={{flex:1}}>Менеджер</span>
                    <span style={{width:70,textAlign:"right"}}>Оборот</span>
                    <span style={{width:70,textAlign:"right"}}>Прибыль</span>
                    <span style={{width:46,textAlign:"right"}}>Маржа</span>
                    <span style={{width:54,textAlign:"right"}}>Конв.</span>
                  </div>
                  {managerStats.map(m=>(
                    <div key={m.name} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:"#f9fafb",borderRadius:8,cursor:"pointer"}} onClick={()=>setStatsManager(m.name)}>
                      <span style={{fontSize:13,color:"#111827",flex:1,fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>👤 {m.name} <span style={{fontSize:10,color:"#9ca3af"}}>· {m.count}</span></span>
                      <span style={{fontSize:12,fontWeight:600,color:"#374151",width:70,textAlign:"right"}}>{fmt(Math.round(m.sum/1000))}k</span>
                      <span style={{fontSize:12,fontWeight:700,color:"#059669",width:70,textAlign:"right"}}>{fmt(Math.round(m.profit/1000))}k</span>
                      <span style={{fontSize:12,fontWeight:700,width:46,textAlign:"right",color:m.margin>=35?"#059669":m.margin>=20?"#d97706":"#ef4444"}}>{m.margin}%</span>
                      <span style={{fontSize:12,fontWeight:700,color:"#7c3aed",width:54,textAlign:"right"}}>{m.conv}%</span>
                    </div>
                  ))}
                </div>
                <div style={{fontSize:10,color:"#9ca3af",marginTop:8}}>Оборот/прибыль — в тыс. ₸. Конверсия = согласовано / (отправлено + согласовано).</div>
              </div>
            )}

            {/* ── D. Рентабельность по категориям ── */}
            {catProfit.length>0 && (
              <div style={{background:"#ffffff",border:"1px solid #e5e7eb",borderRadius:10,padding:"18px 20px",boxShadow:"0 1px 2px rgba(0,0,0,.04)"}}>
                <div style={{fontSize:11,color:"#2563eb",textTransform:"uppercase",letterSpacing:1,fontWeight:700,marginBottom:12}}>🏗 Рентабельность по категориям работ</div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {catProfit.map((c,i)=>(
                    <div key={c.cat} style={{display:"flex",alignItems:"center",gap:10,fontSize:12,padding:"9px 12px",background:"#f9fafb",borderRadius:8}}>
                      <span style={{fontSize:10,color:"#9ca3af",minWidth:16}}>{i+1}.</span>
                      <span style={{color:"#111827",fontWeight:500,flex:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.cat}</span>
                      <span style={{color:"#6b7280",width:90,textAlign:"right"}}>выр. {fmt(Math.round(c.revenue/1000))}k</span>
                      <span style={{color:"#059669",fontWeight:700,width:90,textAlign:"right"}}>приб. {fmt(Math.round(c.profit/1000))}k</span>
                      <span style={{fontWeight:700,width:46,textAlign:"right",color:c.margin>=35?"#059669":c.margin>=20?"#d97706":"#ef4444"}}>{c.margin}%</span>
                    </div>
                  ))}
                </div>
                <div style={{fontSize:10,color:"#9ca3af",marginTop:8}}>По ценам позиций до скидки. Суммы в тыс. ₸.</div>
              </div>
            )}
            {totalEst===0&&totalCon===0&&<div style={{textAlign:"center",color:"#374151",fontSize:13,padding:"60px 0"}}><div style={{fontSize:32,marginBottom:12}}>📊</div>Нет данных за выбранный период</div>}
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
        };

        return (
        <div style={{maxWidth:960,margin:"0 auto",padding:"0 0 40px",minHeight:"100vh"}}>
          {/* Шапка */}
          <div className="contracts-header" style={{background:"#f3f4f6",borderBottom:"1px solid #e5e7eb",padding:"12px 24px",display:"flex",alignItems:"center",gap:10,position:"sticky",top:0,zIndex:10}}>
            {objectTab==="workspace" && (
              <button onClick={()=>{ setObjectTab("list"); setCurrentObject(null); }} style={{background:"none",border:"none",color:"#9ca3af",cursor:"pointer",fontSize:20,lineHeight:1,padding:"0 4px"}}>←</button>
            )}
            <div style={{width:28,height:28,borderRadius:6,background:"#2563eb",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:13,color:"#fff"}}>📦</div>
            <div style={{fontWeight:800,fontSize:14,color:"#111827"}}>{objectTab==="workspace" && currentObject ? (currentObject.clientName||"Новый объект") : "Объекты"}</div>
            <div style={{flex:1}}/>
            {objectTab==="list" && currentUser.role!=="viewer" && (
              <button className="btn btn-g" style={{fontSize:12,padding:"7px 14px"}} onClick={async ()=>{
                const newObj = {id:genId(),clientId:"",clientName:"",clientPhone:"",clientType:"физ",clientIin:"",clientDoc:"",address:"",objType:"Вторичка",area:"",status:"new",note:"",manager:currentUser.name,createdBy:currentUser.name,createdById:currentUser.id,createdAt:Date.now(),updatedAt:Date.now()};
                await saveObjects([newObj, ...objectsRef.current]);
                setCurrentObject(newObj);
                setObjectTab("workspace");
              }}>+ Новый объект</button>
            )}
          </div>

          {/* Список объектов */}
          {objectTab==="list" && (
            <div className="contracts-pad" style={{padding:"20px 24px",display:"flex",flexDirection:"column",gap:10}}>
              {/* Поиск */}
              <input value={objectSearch} onChange={e=>setObjectSearch(e.target.value)} placeholder="🔍 Поиск по клиенту, телефону, адресу..."
                style={{border:"1px solid #e5e7eb",borderRadius:7,padding:"7px 12px",fontSize:13,width:"100%",boxSizing:"border-box",outline:"none",fontFamily:"inherit"}}/>
              {/* Фильтр по статусу */}
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                <button onClick={()=>setObjectFilterStatus("")}
                  style={{background:!objectFilterStatus?"#2563eb":"rgba(0,0,0,.03)",color:!objectFilterStatus?"#fff":"#9ca3af",border:`1px solid ${!objectFilterStatus?"#2563eb":"#e5e7eb"}`,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Все ({objects.length})</button>
                {DEAL_STATUSES.map(s=>{
                  const cnt = objects.filter(o=>(o.status||"new")===s.key).length;
                  if(!cnt && objectFilterStatus!==s.key) return null;
                  return (
                    <button key={s.key} onClick={()=>setObjectFilterStatus(v=>v===s.key?"":s.key)}
                      style={{background:objectFilterStatus===s.key?s.bg:"rgba(0,0,0,.03)",color:objectFilterStatus===s.key?s.color:"#9ca3af",border:`1px solid ${objectFilterStatus===s.key?s.color:"#e5e7eb"}`,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                      {s.label} {cnt>0&&<span style={{opacity:.6}}>({cnt})</span>}
                    </button>
                  );
                })}
              </div>
              {/* Фильтр по типу объекта */}
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {["","Вторичка","Новостройка","Коммерция"].map(t=>(
                  <button key={t||"all"} onClick={()=>setObjectFilterType(t)}
                    style={{background:objectFilterType===t?"#eff6ff":"rgba(0,0,0,.03)",color:objectFilterType===t?"#2563eb":"#9ca3af",border:`1px solid ${objectFilterType===t?"rgba(37,99,235,.4)":"#e5e7eb"}`,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                    {t||"Все типы"}
                  </button>
                ))}
              </div>
              {/* Фильтр по сотруднику */}
              {nonViewerUsers.length>1 && (
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  <button onClick={()=>setObjectFilterManager("")}
                    style={{background:!objectFilterManager?"#eff6ff":"rgba(0,0,0,.03)",color:!objectFilterManager?"#2563eb":"#9ca3af",border:`1px solid ${!objectFilterManager?"rgba(37,99,235,.4)":"#e5e7eb"}`,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Все сотрудники</button>
                  {nonViewerUsers.map(u=>(
                    <button key={u.id} onClick={()=>setObjectFilterManager(v=>v===u.name?"":u.name)}
                      style={{background:objectFilterManager===u.name?"#eff6ff":"rgba(0,0,0,.03)",color:objectFilterManager===u.name?"#2563eb":"#9ca3af",border:`1px solid ${objectFilterManager===u.name?"rgba(37,99,235,.4)":"#e5e7eb"}`,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                      👤 {u.name}
                    </button>
                  ))}
                </div>
              )}

              {objects.length===0 && (
                <div style={{textAlign:"center",padding:"60px 0",color:"#9ca3af"}}>
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
                  <div key={obj.id} style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:8,padding:"14px 18px",cursor:"pointer",transition:"all .15s"}}
                    onClick={()=>{ setCurrentObject({...obj}); setObjectTab("workspace"); }}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                      <div style={{minWidth:0,flex:1}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                          <span style={{fontWeight:700,fontSize:14,color:"#111827"}}>{obj.clientName||<span style={{color:"#9ca3af",fontStyle:"italic",fontWeight:400}}>Без клиента</span>}</span>
                          {obj.clientPhone&&<span style={{fontSize:12,color:"#6b7280",fontWeight:500}}>📞 {obj.clientPhone}</span>}
                          <span style={{fontSize:10,fontWeight:700,color:st.color,background:st.bg,borderRadius:4,padding:"1px 7px",whiteSpace:"nowrap"}}>{st.label}</span>
                        </div>
                        <div style={{fontSize:12,color:"#9ca3af",marginTop:3}}>
                          {obj.objType||"Вторичка"}{obj.address?` · 📍 ${obj.address}`:""}
                          {obj.area?` · ${obj.area} м²`:""}
                        </div>
                        <div style={{fontSize:11,color:"#9ca3af",marginTop:3,display:"flex",gap:10}}>
                          <span>📋 {objEsts.length} смет</span>
                          <span>📄 {objCons.length} договоров</span>
                          {obj.manager&&<span>👤 {obj.manager}</span>}
                        </div>
                      </div>
                      <div style={{textAlign:"right",flexShrink:0}}>
                        {total>0&&<div style={{fontWeight:800,fontSize:16,color:"#111827"}}>{fmt(total)} ₸</div>}
                        {(currentUser.role==="admin"||(currentUser.role==="user"&&obj.createdById===currentUser.id)) && (
                          <button onClick={e=>{e.stopPropagation(); if(window.confirm("Удалить объект?")) saveObjects(objectsRef.current.filter(x=>x.id!==obj.id),{removedIds:[obj.id],allowEmpty:true});}}
                            style={{marginTop:6,background:"rgba(220,38,38,.08)",color:"#dc2626",border:"1px solid rgba(220,38,38,.1)",borderRadius:5,padding:"3px 9px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>🗑</button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Workspace объекта */}
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
              <div style={{padding:"0 24px 40px"}}>
                {/* Карточка объекта — компактная */}
                <div style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:10,padding:"14px 16px",marginTop:16,display:"flex",flexDirection:"column",gap:10}}>
                  {/* Статус */}
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    {DEAL_STATUSES.map(s=>(
                      <button key={s.key} disabled={!canEdit} onClick={()=>saveObjField(obj,{status:s.key})}
                        style={{background:obj.status===s.key?s.bg:"rgba(0,0,0,.03)",color:obj.status===s.key?s.color:"#9ca3af",border:`1px solid ${obj.status===s.key?s.color:"#e5e7eb"}`,borderRadius:6,padding:"3px 9px",fontSize:11,fontWeight:600,cursor:canEdit?"pointer":"default",fontFamily:"inherit",transition:"all .12s"}}>
                        {s.label}
                      </button>
                    ))}
                  </div>

                  {/* Сводка клиента/объекта + сворачивание */}
                  <div onClick={()=>setObjInfoCollapsed(v=>!v)} style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",padding:"2px 0",userSelect:"none"}}>
                    <span style={{fontSize:11,color:"#2563eb",fontWeight:700,letterSpacing:.5,textTransform:"uppercase"}}>👤 Клиент и объект</span>
                    {objInfoCollapsed && (
                      <span style={{fontSize:12,color:"#6b7280",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>
                        {[obj.clientName, obj.clientPhone, obj.address].filter(Boolean).join(" · ")||"не заполнено"}
                      </span>
                    )}
                    <span style={{marginLeft:objInfoCollapsed?0:"auto",fontSize:12,color:"#9ca3af",fontWeight:600}}>{objInfoCollapsed?"▼ развернуть":"▲ свернуть"}</span>
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
                    <div style={{fontWeight:700,fontSize:14,color:"#111827"}}>📋 Сметы ({objEsts.length})</div>
                    {currentUser.role!=="viewer" && (
                      <button className="btn btn-g" style={{fontSize:12,padding:"6px 14px"}} onClick={()=>openObjectEstimate(obj)}>+ Новая смета</button>
                    )}
                  </div>
                  {objEsts.length===0 && (
                    <div style={{textAlign:"center",padding:"28px 0",color:"#9ca3af",background:"#f9fafb",borderRadius:8,border:"1px dashed #e5e7eb",fontSize:13}}>
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
                        <div key={est.id} style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:8,padding:"12px 16px",cursor:"pointer",marginLeft:isChild?16:0,borderLeft:isChild?"3px solid #d1fae5":"1px solid #e5e7eb"}}
                          onClick={()=>openObjectEstimateEdit(est, obj)}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                            <div style={{minWidth:0,flex:1}}>
                              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                                <span style={{fontSize:10,fontWeight:700,color:isChild?"#059669":"#2563eb",background:isChild?"rgba(5,150,105,.08)":"#eff6ff",borderRadius:3,padding:"1px 6px"}}>Смета {estNum}</span>
                                <span style={{fontWeight:600,fontSize:13,color:"#111827"}}>{est.proj?.name||obj.clientName||obj.address||"Новая смета"}</span>
                                <span style={{fontSize:10,fontWeight:700,color:stEst.color,background:stEst.bg,borderRadius:4,padding:"1px 6px"}}>{stEst.label}</span>
                              </div>
                              <div style={{fontSize:11,color:"#9ca3af",marginTop:3}}>
                                {posCount} позиций · {new Date(est.updatedAt||est.createdAt||0).toLocaleDateString("ru-RU")}
                                {est.createdBy&&` · ${est.createdBy}`}
                              </div>
                            </div>
                            <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6,flexShrink:0}}>
                              <div style={{fontWeight:800,fontSize:15,color:"#111827"}}>{fmt(est.total||0)} ₸</div>
                              <div style={{display:"flex",gap:4}} onClick={e=>e.stopPropagation()}>
                                <button title={isChild?"Создать доп. соглашение из этой доп. сметы":"Создать договор из сметы"} onClick={()=>openObjectContract(obj,est)}
                                  style={{background:"rgba(184,144,74,.08)",color:"#2563eb",border:"1px solid #eff6ff",borderRadius:4,padding:"2px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>📄 {isChild?"Доп. соглашение":"Договор"}</button>
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
                    <div style={{fontWeight:700,fontSize:14,color:"#111827"}}>📄 Договоры ({objCons.length})</div>
                  </div>
                  {objCons.length===0 && (
                    <div style={{textAlign:"center",padding:"28px 0",color:"#9ca3af",background:"#f9fafb",borderRadius:8,border:"1px dashed #e5e7eb",fontSize:13}}>
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
                        <div key={c.id} style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:8,padding:"12px 16px",cursor:"pointer",transition:"all .12s",marginLeft:isAnnex?16:0,borderLeft:isAnnex?"3px solid #ede9fe":"1px solid #e5e7eb"}}
                          onClick={()=>{ setCurrentContract({...c}); setObjectReturnId(obj.id); setContractTab("editor"); setScreen("contracts"); }}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                            <div style={{minWidth:0,flex:1}}>
                              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                                {isAnnex && <span style={{fontSize:10,fontWeight:700,color:"#7c3aed",background:"rgba(124,58,237,.08)",borderRadius:3,padding:"1px 6px"}}>Доп. согл.</span>}
                                <span style={{fontWeight:600,fontSize:13,color:"#111827"}}>{conTitle}</span>
                                <span style={{fontSize:10,fontWeight:700,color:stC.color,background:stC.bg,borderRadius:4,padding:"1px 6px"}}>{stC.label}</span>
                              </div>
                              <div style={{fontSize:11,color:"#9ca3af",marginTop:3}}>
                                {cl2?.name||c.estClient||"Клиент не выбран"} · {new Date(c.date||Date.now()).toLocaleDateString("ru-RU")} · {(c.works||[]).length} позиций
                              </div>
                            </div>
                            <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6,flexShrink:0}}>
                              <div style={{fontWeight:800,fontSize:15,color:"#111827"}}>{fmt(total)} ₸</div>
                              <div style={{display:"flex",gap:4}} onClick={e=>e.stopPropagation()}>
                                <button onClick={()=>generateContractPdf(c,cl2,ca2)}
                                  style={{background:"#e5e7eb",color:"#374151",border:"1px solid #e5e7eb",borderRadius:4,padding:"2px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>📄 PDF</button>
                                <button onClick={()=>generateContractGDoc(c,cl2,ca2)}
                                  style={{background:"#eff6ff",color:"#2563eb",border:"1px solid rgba(66,133,244,.2)",borderRadius:4,padding:"2px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>📋 GDoc</button>
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
              </div>
            );
          })()}
        </div>
        );
      })()}

      {effScreen === "contracts" && (
        <div style={{maxWidth:960,margin:"0 auto",padding:"0 0 40px",minHeight:"100vh"}}>
          {/* Шапка + табы — скрываем в режиме редактора договора (у него своя шапка) */}
          {contractTab !== "editor" && (<>
          <div className="contracts-header" style={{background:"#f3f4f6",borderBottom:"1px solid #e5e7eb",padding:"12px 24px",display:"flex",alignItems:"center",gap:10,position:"sticky",top:0,zIndex:10}}>
            <button onClick={()=>setScreen("dashboard")} style={{background:"none",border:"none",color:"#9ca3af",cursor:"pointer",fontSize:20,lineHeight:1,padding:"0 4px"}}>←</button>
            <div style={{width:28,height:28,borderRadius:6,background:"#2563eb",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:13,color:"#f3f4f6"}}>T</div>
            <div style={{fontWeight:800,fontSize:14,color:"#111827"}}>Прочие договора</div>
            <div style={{flex:1}}/>
            {["list","clients","contragents"].includes(contractTab) && currentUser.role === "admin" && (
              <button onClick={()=>openListBackups(contractTab)}
                style={{background:"rgba(0,0,0,.03)",color:"#6b7280",border:"1px solid #e5e7eb",borderRadius:8,padding:"7px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                🕘 Бэкапы
              </button>
            )}
            {contractTab === "list" && currentUser.role !== "viewer" && (
              <button className="btn btn-g" style={{fontSize:12,padding:"7px 14px"}} onClick={()=>{ setCurrentContract({id:Date.now().toString(),number:nextContractNumber(),date:new Date().toISOString().split("T")[0],clientId:"",contragentId:contragents[0]?.id||"",works:[],appendix:1,note:"",createdBy:currentUser.name,createdById:currentUser.id}); setContractTab("editor"); }}>+ Новый</button>
            )}
          </div>

          </>)}

          <div className="contracts-pad" style={{padding:"20px 24px"}}>

            {/* ── СПИСОК ДОГОВОРОВ ── */}
            {contractTab === "list" && (
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {/* Фильтр по статусу */}
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:2}}>
                  <button onClick={()=>setContractFilterStatus("")}
                    style={{background:!contractFilterStatus?"#2563eb":"rgba(0,0,0,.03)",color:!contractFilterStatus?"#fff":"#9ca3af",border:`1px solid ${!contractFilterStatus?"#2563eb":"#e5e7eb"}`,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Все</button>
                  {CONTRACT_STATUSES.map(s=>(
                    <button key={s.key} onClick={()=>setContractFilterStatus(v=>v===s.key?"":s.key)}
                      style={{background:contractFilterStatus===s.key?s.bg:"rgba(0,0,0,.03)",color:contractFilterStatus===s.key?s.color:"#9ca3af",border:`1px solid ${contractFilterStatus===s.key?s.color:"#e5e7eb"}`,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{s.label}</button>
                  ))}
                </div>
                {contracts.length === 0 && (
                  <div style={{textAlign:"center",padding:"60px 0",color:"#9ca3af"}}>
                    <div style={{fontSize:40,marginBottom:12}}>📋</div>
                    <div style={{fontWeight:700,marginBottom:6}}>Договоров пока нет</div>
                    <div style={{fontSize:12}}>Создайте новый или используйте кнопку 📄 на карточке сметы</div>
                  </div>
                )}
                {(() => {
                  const TLABEL = {repair_fiz:"Договор",annex:"Приложение",design:"Дизайн-проект",design_add:"Доп. соглашение",reservation:"Бронь"};
                  const contractTitle = (c) => {
                    const t = c.type||"repair_fiz";
                    if(t==="annex") return `Приложение №${c.appendix||2}`+(c.mainNumber?` к №${c.mainNumber}`:"");
                    const lbl = TLABEL[t]||"Договор";
                    return c.number ? `${lbl} №${c.number}` : `${lbl} (без номера)`;
                  };
                  // дочерние = приложения/доп.соглашения, ссылающиеся на номер существующего договора
                  const isChildType = (c) => (c.type==="annex"||c.type==="design_add");
                  const numMap = {}; // number -> contract
                  contracts.forEach(c=>{ if(c.number && !isChildType(c)) numMap[c.number]=c; });
                  const childMap = {}; // parentId -> [child]
                  contracts.forEach(c=>{ if(isChildType(c) && c.mainNumber && numMap[c.mainNumber]){ const pid=numMap[c.mainNumber].id; (childMap[pid]||(childMap[pid]=[])).push(c); } });
                  const childIds = new Set(Object.values(childMap).flat().map(c=>c.id));
                  const _objIds = new Set(objects.map(o=>o.id));
                  // показываем договоры без объекта ИЛИ привязанные к несуществующему объекту (сироты)
                  const roots = contracts.filter(c=>!childIds.has(c.id) && (!c.objectId || !_objIds.has(c.objectId)) && (!contractFilterStatus || (c.contractStatus||"draft")===contractFilterStatus));

                  const renderContractCard = (c, isChild=false) => {
                    const client = contractClients.find(x=>x.id===c.clientId);
                    const ca = contragents.find(x=>x.id===c.contragentId);
                    const total = (c.works||[]).reduce((s,w)=>s+(w.quantity*w.price||0),0);
                    return (
                      <div key={c.id}>
                        {isChild && <div style={{display:"flex",alignItems:"center",gap:6,marginLeft:16,marginBottom:2,marginTop:4}}>
                          <div style={{width:2,height:14,background:"#e5e7eb",borderRadius:2,flexShrink:0}}/>
                          <span style={{fontSize:10,color:"#7c3aed",fontWeight:700,background:"rgba(124,58,237,.08)",borderRadius:3,padding:"1px 6px"}}>Приложение №{c.appendix||2}</span>
                        </div>}
                        <div style={{background:"#ffffff",border:"1px solid #e5e7eb",borderRadius:6,padding:"14px 18px",cursor:"pointer",transition:"all .15s",marginLeft:isChild?16:0,borderLeft:isChild?"3px solid #ede9fe":"1px solid #e5e7eb"}}
                          onClick={()=>{ setCurrentContract({...c}); setContractTab("editor"); }}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                            <div style={{minWidth:0,flex:1}}>
                              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                                <div style={{fontWeight:700,fontSize:14,color:"#111827"}}>
                                  {contractTitle(c)}
                                </div>
                                {(()=>{ const s=CONTRACT_STATUSES.find(x=>x.key===(c.contractStatus||"draft"))||CONTRACT_STATUSES[0]; return <span style={{fontSize:10,fontWeight:700,color:s.color,background:s.bg,borderRadius:4,padding:"1px 7px",flexShrink:0,whiteSpace:"nowrap"}}>{s.label}</span>; })()}
                              </div>
                              <div style={{fontSize:12,color:"#9ca3af",marginTop:3}}>
                                {client ? `👤 ${client.name}` : c.estClient ? `👤 ${c.estClient} (не добавлен)` : "Клиент не выбран"}
                                {ca && <span style={{marginLeft:8}}>· {ca.name}</span>}
                              </div>
                              <div style={{fontSize:11,color:"#9ca3af",marginTop:3}}>
                                {new Date(c.date||Date.now()).toLocaleDateString("ru-RU")} · {(c.works||[]).length} позиций
                              </div>
                            </div>
                            <div style={{textAlign:"right",flexShrink:0}}>
                              <div style={{fontWeight:800,fontSize:16,color:"#111827"}}>{fmt(total)} ₸</div>
                              <div style={{display:"flex",gap:5,marginTop:6}}>
                                <button onClick={e=>{e.stopPropagation();
                                  const cl = contractClients.find(x=>x.id===c.clientId);
                                  const ca2 = contragents.find(x=>x.id===c.contragentId);
                                  generateContractPdf(c, cl, ca2);
                                }} style={{background:"#e5e7eb",color:"#9ca3af",border:"1px solid #e5e7eb",borderRadius:5,padding:"3px 9px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>📄 PDF</button>
                                <button onClick={e=>{e.stopPropagation();
                                  const cl = contractClients.find(x=>x.id===c.clientId);
                                  const ca2 = contragents.find(x=>x.id===c.contragentId);
                                  generateContractGDoc(c, cl, ca2);
                                }} style={{background:"#eff6ff",color:"#2563eb",border:"1px solid rgba(66,133,244,.2)",borderRadius:5,padding:"3px 9px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>📋 GDoc</button>
                                {(currentUser.role==="admin" || (currentUser.role==="user" && c.createdBy===currentUser.name)) && (
                                  <button onClick={e=>{e.stopPropagation(); if(window.confirm("Удалить документ?")) saveContracts(contractsRef.current.filter(x=>x.id!==c.id), {removedIds:[c.id], allowEmpty:true});}}
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
                  const list = contracts.filter(x=>x.id!==currentContract.id);
                  await saveContracts([...list, currentContract]);
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
          onUsersChanged={async ()=>{ const u=await storage.get(USERS_KEY); if(u) setAllUsers(JSON.parse(u.value)); }}
          clients={contractClients}
          saveClients={saveContractClients}
          clientsRef={clientsRef}
          contragents={contragents}
          saveContragents={saveContragents}
          contragentsRef={contragentsRef}
          onBackupWorkspace={openWorkspaceBackups}
        />
      )}

      </div>{/* /sidebar-content */}
    </div>
  );
}

// ─── ПАНЕЛЬ АДМИНИСТРАТОРА (управление пользователями) ───────────────────────
// Прайс редактор — карточки ниже

// Карточка с полностью локальным состоянием — изолирована от родителя
// Принимает начальные данные ОДИН РАЗ, дальше живёт сама
// При размонтировании сохраняет данные в priceCardCache
const priceCardCache = {};
