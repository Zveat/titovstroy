import { useState, useMemo, useEffect, useCallback } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, get, set } from "firebase/database";

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
  // ─── ДЕМОНТАЖ ────────────────────────────────────────────────────────────
  { code:"CH-DEM-OB",  cat:"Черновые", sub:"Демонтаж", name:"Снятие обоев",                              unit:"м²",   tiers:[{min:10,max:30,price:550},{min:31,max:80,price:450},{min:81,max:200,price:400}] },
  { code:"CH-DEM-KR",  cat:"Черновые", sub:"Демонтаж", name:"Снятие краски",                             unit:"м²",   tiers:[{min:5,max:15,price:5000},{min:16,max:40,price:4500},{min:41,max:80,price:4000}] },
  { code:"CH-DEM-PL",  cat:"Черновые", sub:"Демонтаж", name:"Демонтаж плитки",                           unit:"м²",   tiers:[{min:1,max:10,price:5000},{min:11,max:40,price:4500},{min:41,max:120,price:4000}] },
  { code:"CH-DEM-DK",  cat:"Черновые", sub:"Демонтаж", name:"Демонтаж декоративных покрытий",            unit:"м²",   tiers:[{min:1,max:20,price:1900},{min:21,max:80,price:1600},{min:81,max:160,price:1400}] },
  { code:"CH-DEM-GK",  cat:"Черновые", sub:"Демонтаж", name:"Демонтаж гипсокартонных конструкций",       unit:"м²",   tiers:[{min:1,max:20,price:2500},{min:21,max:80,price:2200},{min:81,max:160,price:2000}] },
  { code:"CH-DEM-NP",  cat:"Черновые", sub:"Демонтаж", name:"Демонтаж натяжных потолков",                unit:"м²",   tiers:[], fixedPrice:400 },
  { code:"CH-DEM-STU", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж штукатурки",                       unit:"м²",   tiers:[{min:1,max:20,price:1900},{min:21,max:80,price:1600},{min:81,max:160,price:1400}] },
  { code:"CH-DEM-ST",  cat:"Черновые", sub:"Демонтаж", name:"Снятие старой стяжки",                      unit:"м²",   tiers:[{min:1,max:10,price:4000},{min:11,max:40,price:3500},{min:41,max:120,price:3000}] },
  { code:"CH-DEM-LN",  cat:"Черновые", sub:"Демонтаж", name:"Демонтаж линолеума",                        unit:"м²",   tiers:[{min:1,max:20,price:800},{min:21,max:60,price:600},{min:61,max:120,price:400}] },
  { code:"CH-DEM-LAM", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж ламината",                         unit:"м²",   tiers:[{min:1,max:30,price:1900},{min:31,max:80,price:1600},{min:81,max:200,price:1300}] },
  { code:"CH-DEM-PAR", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж паркета",                          unit:"м²",   tiers:[{min:1,max:30,price:4500},{min:31,max:80,price:4000},{min:81,max:120,price:3500}] },
  { code:"CH-DEM-PLI", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж плинтусов",                        unit:"м.п.", tiers:[], fixedPrice:800 },
  { code:"CH-DEM-DV1", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж дверей дерево (новые)",            unit:"шт",   tiers:[], fixedPrice:3000 },
  { code:"CH-DEM-DV2", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж дверей дерево (старые)",           unit:"шт",   tiers:[], fixedPrice:4000 },
  { code:"CH-DEM-DV3", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж дверей железо",                    unit:"шт",   tiers:[], fixedPrice:30000 },
  { code:"CH-DEM-ROZ", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж розеток, выключателей",            unit:"шт",   tiers:[], fixedPrice:1500 },
  { code:"CH-DEM-PG1", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж перегородок ГКЛ",                  unit:"м²",   tiers:[{min:1,max:10,price:3000},{min:11,max:60,price:2500},{min:61,max:200,price:2000}] },
  { code:"CH-DEM-PG2", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж перегородок монолит",              unit:"м²",   tiers:[], fixedPrice:30000 },
  { code:"CH-DEM-PG3", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж перегородок кирпич",               unit:"м²",   tiers:[{min:1,max:10,price:2500},{min:11,max:30,price:2000},{min:31,max:150,price:1800}] },
  { code:"CH-DEM-PG4", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж перегородок газоблок",             unit:"м²",   tiers:[{min:1,max:10,price:2500},{min:11,max:30,price:2000},{min:31,max:150,price:1800}] },
  { code:"CH-DEM-SAN", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж сантехприборов",                   unit:"шт",   tiers:[] },
  // ─── ВЫНОС / ВЫВОЗ ───────────────────────────────────────────────────────
  { code:"CH-MUS",     cat:"Черновые", sub:"Вынос/мусор", name:"Вынос строительного мусора",             unit:"усл.", tiers:[], fixedPrice:15000 },
  { code:"CH-MUSS",    cat:"Черновые", sub:"Вынос/мусор", name:"Вывоз строительного мусора",             unit:"усл.", tiers:[], fixedPrice:33000 },
  // ─── ВЫРАВНИВАНИЕ СТЕН ───────────────────────────────────────────────────
  { code:"CH-WALL-GR1",cat:"Черновые", sub:"Выравнивание стен", name:"Грунтовка стен",                   unit:"м²",   tiers:[{min:1,max:50,price:400},{min:51,max:200,price:350}] },
  { code:"CH-WALL-GR2",cat:"Черновые", sub:"Выравнивание стен", name:"Грунтовка потолка",                unit:"м²",   tiers:[{min:1,max:50,price:800},{min:51,max:200,price:750}] },
  { code:"CH-WALL-MB", cat:"Черновые", sub:"Выравнивание стен", name:"Монтаж маяков (стены)",            unit:"м²",   tiers:[{min:1,max:20,price:1200},{min:21,max:80,price:1000}] },
  { code:"CH-WALL-SH1",cat:"Черновые", sub:"Выравнивание стен", name:"Штукатурка стен (слой 0–3 см)",    unit:"м²",   tiers:[{min:1,max:20,price:3300},{min:21,max:80,price:3000},{min:81,max:200,price:2800}] },
  { code:"CH-WALL-SH2",cat:"Черновые", sub:"Выравнивание стен", name:"Штукатурка стен (слой 4–8 см)",    unit:"м²",   tiers:[{min:1,max:20,price:4200},{min:21,max:80,price:3900},{min:81,max:200,price:3600}] },
  { code:"CH-WALL-ARM",cat:"Черновые", sub:"Выравнивание стен", name:"Армирование сеткой (стены)",       unit:"м²",   tiers:[], fixedPrice:1200 },
  { code:"CH-WALL-CH", cat:"Черновые", sub:"Выравнивание стен", name:"Черновая шпаклевка",               unit:"м²",   tiers:[{min:1,max:30,price:2000},{min:31,max:80,price:1500},{min:81,max:200,price:1200}] },
  { code:"CH-WALL-FIN",cat:"Черновые", sub:"Выравнивание стен", name:"Финишная шпаклевка",               unit:"м²",   tiers:[{min:1,max:30,price:1800},{min:31,max:80,price:1300},{min:81,max:200,price:1000}] },
  { code:"CH-WALL-FG", cat:"Черновые", sub:"Выравнивание стен", name:"Финальная грунтовка",              unit:"м²",   tiers:[], fixedPrice:350 },
  { code:"CH-WALL-UGL",cat:"Черновые", sub:"Выравнивание стен", name:"Восстановление углов",             unit:"м.п.", tiers:[], fixedPrice:3000 },
  { code:"CH-WALL-OTK",cat:"Черновые", sub:"Выравнивание стен", name:"Откосы под окна/двери",            unit:"м.п.", tiers:[], fixedPrice:3000 },
  // ─── ВЫРАВНИВАНИЕ ПОЛА ───────────────────────────────────────────────────
  { code:"CH-FLOOR-GR",cat:"Черновые", sub:"Выравнивание пола", name:"Грунтовка пола",                   unit:"м²",   tiers:[{min:1,max:50,price:600},{min:51,max:200,price:550}] },
  { code:"CH-FLOOR-GI",cat:"Черновые", sub:"Выравнивание пола", name:"Гидроизоляция пола",               unit:"м²",   tiers:[], fixedPrice:800 },
  { code:"CH-FLOOR-AR",cat:"Черновые", sub:"Выравнивание пола", name:"Армирование сеткой (пол)",         unit:"м²",   tiers:[], fixedPrice:1200 },
  { code:"CH-FLOOR-MB",cat:"Черновые", sub:"Выравнивание пола", name:"Монтаж маяков (пол)",              unit:"м.п.", tiers:[{min:1,max:10,price:2500},{min:11,max:60,price:1800},{min:61,max:200,price:1200}] },
  { code:"CH-FLOOR-C1",cat:"Черновые", sub:"Выравнивание пола", name:"Стяжка цементно-песчаная (5–8 см)",unit:"м²",   tiers:[{min:1,max:15,price:5500},{min:16,max:40,price:5000},{min:41,max:150,price:4500}] },
  { code:"CH-FLOOR-C2",cat:"Черновые", sub:"Выравнивание пола", name:"Стяжка цементно-песчаная (9–12 см)",unit:"м²",  tiers:[] },
  { code:"CH-FLOOR-PS",cat:"Черновые", sub:"Выравнивание пола", name:"Полусухая стяжка",                 unit:"м²",   tiers:[] },
  { code:"CH-FLOOR-NP",cat:"Черновые", sub:"Выравнивание пола", name:"Наливной пол",                     unit:"м²",   tiers:[] },
  { code:"CH-FLOOR-UV",cat:"Черновые", sub:"Выравнивание пола", name:"Проверка уровней и перепадов",     unit:"м²",   tiers:[] },
  { code:"CH-FLOOR-PP",cat:"Черновые", sub:"Выравнивание пола", name:"Подготовка под плитку/ламинат",    unit:"м²",   tiers:[] },
  { code:"CH-EL-01",   cat:"Черновые", sub:"Электромонтаж",         name:"Составление схемы электрики",                  unit:"шт",   tiers:[] },
  { code:"CH-EL-02",   cat:"Черновые", sub:"Электромонтаж",         name:"Штробление стен и потолков",                   unit:"м.п.", tiers:[] },
  { code:"CH-EL-03",   cat:"Черновые", sub:"Электромонтаж",         name:"Прокладка кабелей",                            unit:"м.п.", tiers:[] },
  { code:"CH-EL-04",   cat:"Черновые", sub:"Электромонтаж",         name:"Установка подрозетников",                      unit:"шт",   tiers:[] },
  { code:"CH-EL-05",   cat:"Черновые", sub:"Электромонтаж",         name:"Прокладка линий под кондиционер",              unit:"шт",   tiers:[] },
  { code:"CH-EL-06",   cat:"Черновые", sub:"Электромонтаж",         name:"Монтаж кабеля под интернет/тв",                unit:"шт",   tiers:[] },
  { code:"CH-EL-SH1",  cat:"Черновые", sub:"Электрощит",            name:"Сборка электрощита",                           unit:"шт",   tiers:[] },
  { code:"CH-EL-SH2",  cat:"Черновые", sub:"Электрощит",            name:"Автоматы, УЗО, дифавтоматы",                   unit:"шт",   tiers:[] },
  { code:"CH-EL-SH3",  cat:"Черновые", sub:"Электрощит",            name:"Распределение групп нагрузки",                 unit:"шт",   tiers:[] },
  { code:"CH-EL-OUT1", cat:"Черновые", sub:"Выводы",                name:"Розетки (вывод)",                              unit:"шт",   tiers:[] },
  { code:"CH-EL-OUT2", cat:"Черновые", sub:"Выводы",                name:"Выключатели (вывод)",                          unit:"шт",   tiers:[] },
  { code:"CH-EL-OUT3", cat:"Черновые", sub:"Выводы",                name:"Выводы под светильники",                       unit:"шт",   tiers:[] },
  { code:"CH-SAN-01",  cat:"Черновые", sub:"Водоснабжение",         name:"Разводка труб холодной и горячей воды",        unit:"м.п.", tiers:[] },
  { code:"CH-SAN-02",  cat:"Черновые", sub:"Водоснабжение",         name:"Коллекторная система",                         unit:"шт",   tiers:[] },
  { code:"CH-SAN-03",  cat:"Черновые", sub:"Водоснабжение",         name:"Замена стояков",                               unit:"шт",   tiers:[] },
  { code:"CH-SAN-04",  cat:"Черновые", sub:"Канализация",           name:"Прокладка канализационных труб",               unit:"м.п.", tiers:[] },
  { code:"CH-SAN-05",  cat:"Черновые", sub:"Канализация",           name:"Выводы под сантехнику",                        unit:"шт",   tiers:[] },
  { code:"CH-SAN-06",  cat:"Черновые", sub:"Подготовка санузла",    name:"Ниши под инсталляцию",                         unit:"шт",   tiers:[] },
  { code:"CH-SAN-07",  cat:"Черновые", sub:"Подготовка санузла",    name:"Перенос точек",                                unit:"шт",   tiers:[] },
  { code:"CH-SAN-08",  cat:"Черновые", sub:"Подготовка санузла",    name:"Выводы под стиральную/посудомоечные машины",   unit:"шт",   tiers:[] },
  { code:"CH-GID-01",  cat:"Черновые", sub:"Гидроизоляция",         name:"Гидроизоляция пола (гид.)",                    unit:"м²",   tiers:[] },
  { code:"CH-GID-02",  cat:"Черновые", sub:"Гидроизоляция",         name:"Поднятие на стены 20–30 см",                   unit:"м²",   tiers:[] },
  { code:"CH-GID-03",  cat:"Черновые", sub:"Гидроизоляция",         name:"Обработка углов и примыканий",                 unit:"м.п.", tiers:[] },
  { code:"CH-GID-04",  cat:"Черновые", sub:"Гидроизоляция",         name:"Гидроизоляция под ванной и душем",             unit:"м²",   tiers:[] },
  { code:"CH-GID-05",  cat:"Черновые", sub:"Гидроизоляция",         name:"Герметизация трубных выводов",                 unit:"шт",   tiers:[] },
  { code:"CH-PREP-01", cat:"Черновые", sub:"Подготовка оснований",  name:"Финишная шпаклевка стен",                      unit:"м²",   tiers:[] },
  { code:"CH-PREP-02", cat:"Черновые", sub:"Подготовка оснований",  name:"Идеальная плоскость под покраску",             unit:"м²",   tiers:[] },
  { code:"CH-PREP-03", cat:"Черновые", sub:"Подготовка оснований",  name:"Подготовка под поклейку обоев",                unit:"м²",   tiers:[] },
  { code:"CH-PREP-04", cat:"Черновые", sub:"Подготовка оснований",  name:"Шпаклевка потолка",                            unit:"м²",   tiers:[] },
  { code:"CH-PREP-05", cat:"Черновые", sub:"Подготовка оснований",  name:"Подготовка под натяжной потолок",              unit:"м²",   tiers:[] },
  { code:"CH-PREP-06", cat:"Черновые", sub:"Подготовка оснований",  name:"Выравнивание перепадов пола",                  unit:"м²",   tiers:[] },
  { code:"CH-PREP-07", cat:"Черновые", sub:"Подготовка оснований",  name:"Грунтовка пола",                               unit:"м²",   tiers:[] },
  { code:"CH-PREP-08", cat:"Черновые", sub:"Подготовка оснований",  name:"Подготовка под финишное покрытие",             unit:"м²",   tiers:[] },
  { code:"CH-ADD-01",  cat:"Черновые", sub:"Дополнительно",         name:"Перенос/монтаж новых перегородок",             unit:"м²",   tiers:[] },
  { code:"CH-ADD-02",  cat:"Черновые", sub:"Дополнительно",         name:"Шумоизоляция стен и потолков",                 unit:"м²",   tiers:[] },
  { code:"CH-ADD-03",  cat:"Черновые", sub:"Дополнительно",         name:"Утепление лоджий",                             unit:"м²",   tiers:[] },
  { code:"CH-ADD-04",  cat:"Черновые", sub:"Дополнительно",         name:"Подготовка ниш под освещение",                 unit:"шт",   tiers:[] },
  { code:"CH-ADD-05",  cat:"Черновые", sub:"Дополнительно",         name:"Короба и конструкции из ГКЛ",                  unit:"м.п.", tiers:[] },
  // ЧИСТОВЫЕ
  { code:"FIN-WALL-OB1",cat:"Чистовые", sub:"Стены — Обои",           name:"Поклейка флизелиновых",                    unit:"м²",   tiers:[] },
  { code:"FIN-WALL-OB2",cat:"Чистовые", sub:"Стены — Обои",           name:"Поклейка виниловых",                       unit:"м²",   tiers:[] },
  { code:"FIN-WALL-OB3",cat:"Чистовые", sub:"Стены — Обои",           name:"Поклейка текстурных",                      unit:"м²",   tiers:[] },
  { code:"FIN-WALL-OB4",cat:"Чистовые", sub:"Стены — Обои",           name:"Поклейка под покраску",                    unit:"м²",   tiers:[] },
  { code:"FIN-WALL-PA1",cat:"Чистовые", sub:"Стены — Покраска",       name:"Нанесение грунта",                         unit:"м²",   tiers:[] },
  { code:"FIN-WALL-PA2",cat:"Чистовые", sub:"Стены — Покраска",       name:"Покраска в 1–3 слоя",                      unit:"м²",   tiers:[] },
  { code:"FIN-WALL-PA3",cat:"Чистовые", sub:"Стены — Покраска",       name:"Окраска откосов и ниш",                    unit:"м.п.", tiers:[] },
  { code:"FIN-WALL-DC1",cat:"Чистовые", sub:"Стены — Декоративные",   name:"Декоративная штукатурка",                  unit:"м²",   tiers:[] },
  { code:"FIN-WALL-DC2",cat:"Чистовые", sub:"Стены — Декоративные",   name:"Микробетон",                               unit:"м²",   tiers:[] },
  { code:"FIN-WALL-DC3",cat:"Чистовые", sub:"Стены — Декоративные",   name:"Венецианка",                               unit:"м²",   tiers:[] },
  { code:"FIN-WALL-DC4",cat:"Чистовые", sub:"Стены — Декоративные",   name:"Акцентные стены",                          unit:"м²",   tiers:[] },
  { code:"FIN-WALL-PN1",cat:"Чистовые", sub:"Стены — Панели",         name:"МДФ панели",                               unit:"м²",   tiers:[] },
  { code:"FIN-WALL-PN2",cat:"Чистовые", sub:"Стены — Панели",         name:"Рейки",                                    unit:"м²",   tiers:[] },
  { code:"FIN-WALL-PN3",cat:"Чистовые", sub:"Стены — Панели",         name:"3D панели",                                unit:"м²",   tiers:[] },
  { code:"FIN-CEIL-01", cat:"Чистовые", sub:"Потолки",                 name:"Покраска потолка",                         unit:"м²",   tiers:[] },
  { code:"FIN-CEIL-02", cat:"Чистовые", sub:"Потолки",                 name:"Установка натяжных потолков",              unit:"м²",   tiers:[] },
  { code:"FIN-CEIL-03", cat:"Чистовые", sub:"Потолки",                 name:"Монтаж трековых систем",                   unit:"м.п.", tiers:[] },
  { code:"FIN-CEIL-04", cat:"Чистовые", sub:"Потолки",                 name:"Монтаж световых линий",                    unit:"м.п.", tiers:[] },
  { code:"FIN-CEIL-05", cat:"Чистовые", sub:"Потолки",                 name:"Установка потолочных плинтусов",           unit:"м.п.", tiers:[] },
  { code:"FIN-CEIL-06", cat:"Чистовые", sub:"Потолки",                 name:"Монтаж гипсокартонных коробов и ниш",      unit:"м²",   tiers:[] },
  { code:"FIN-FLR-LAM", cat:"Чистовые", sub:"Полы — Покрытия",        name:"Ламинат",                                  unit:"м²",   tiers:[] },
  { code:"FIN-FLR-KV",  cat:"Чистовые", sub:"Полы — Покрытия",        name:"Кварц-винил",                              unit:"м²",   tiers:[] },
  { code:"FIN-FLR-PAR", cat:"Чистовые", sub:"Полы — Покрытия",        name:"Паркетная доска",                          unit:"м²",   tiers:[] },
  { code:"FIN-FLR-INZ", cat:"Чистовые", sub:"Полы — Покрытия",        name:"Инженерная доска",                         unit:"м²",   tiers:[] },
  { code:"FIN-FLR-KER", cat:"Чистовые", sub:"Полы — Покрытия",        name:"Керамогранит",                             unit:"м²",   tiers:[] },
  { code:"FIN-FLR-PLT", cat:"Чистовые", sub:"Полы — Покрытия",        name:"Плитка (пол)",                             unit:"м²",   tiers:[] },
  { code:"FIN-FLR-AD1", cat:"Чистовые", sub:"Полы — Сопутствующие",   name:"Подложка",                                 unit:"м²",   tiers:[] },
  { code:"FIN-FLR-AD2", cat:"Чистовые", sub:"Полы — Сопутствующие",   name:"Порожки",                                  unit:"шт",   tiers:[] },
  { code:"FIN-FLR-AD3", cat:"Чистовые", sub:"Полы — Сопутствующие",   name:"Монтаж плинтусов (МДФ, ПВХ, алюминий)",   unit:"м.п.", tiers:[] },
  { code:"FIN-FLR-AD4", cat:"Чистовые", sub:"Полы — Сопутствующие",   name:"Герметизация примыканий",                  unit:"м.п.", tiers:[] },
  { code:"FIN-SAN-01",  cat:"Чистовые", sub:"Сантехника — Установка", name:"Унитаз (вкл. инсталляцию)",                unit:"шт",   tiers:[] },
  { code:"FIN-SAN-02",  cat:"Чистовые", sub:"Сантехника — Установка", name:"Ванна",                                    unit:"шт",   tiers:[] },
  { code:"FIN-SAN-03",  cat:"Чистовые", sub:"Сантехника — Установка", name:"Раковина",                                 unit:"шт",   tiers:[] },
  { code:"FIN-SAN-04",  cat:"Чистовые", sub:"Сантехника — Установка", name:"Смесители",                                unit:"шт",   tiers:[] },
  { code:"FIN-SAN-05",  cat:"Чистовые", sub:"Сантехника — Установка", name:"Душевые системы",                          unit:"шт",   tiers:[] },
  { code:"FIN-SAN-06",  cat:"Чистовые", sub:"Сантехника — Установка", name:"Трапы",                                    unit:"шт",   tiers:[] },
  { code:"FIN-SAN-07",  cat:"Чистовые", sub:"Сантехника — Установка", name:"Полотенцесушитель",                        unit:"шт",   tiers:[] },
  { code:"FIN-SAN-AD1", cat:"Чистовые", sub:"Сантехника — Доп.",      name:"Монтаж экранов",                           unit:"шт",   tiers:[] },
  { code:"FIN-SAN-AD2", cat:"Чистовые", sub:"Сантехника — Доп.",      name:"Подключение стиралки/посудомойки",          unit:"шт",   tiers:[] },
  { code:"FIN-EL-01",   cat:"Чистовые", sub:"Электрика чистовая",     name:"Установка розеток",                        unit:"шт",   tiers:[] },
  { code:"FIN-EL-02",   cat:"Чистовые", sub:"Электрика чистовая",     name:"Установка выключателей",                   unit:"шт",   tiers:[] },
  { code:"FIN-EL-03",   cat:"Чистовые", sub:"Электрика чистовая",     name:"Подключение светильников",                 unit:"шт",   tiers:[] },
  { code:"FIN-EL-04",   cat:"Чистовые", sub:"Электрика чистовая",     name:"Люстры, бра, треки",                       unit:"шт",   tiers:[] },
  { code:"FIN-EL-05",   cat:"Чистовые", sub:"Электрика чистовая",     name:"Монтаж точечных светильников",             unit:"шт",   tiers:[] },
  { code:"FIN-EL-06",   cat:"Чистовые", sub:"Электрика чистовая",     name:"Подключение вытяжки",                      unit:"шт",   tiers:[] },
  { code:"FIN-EL-07",   cat:"Чистовые", sub:"Электрика чистовая",     name:"Установка терморегуляторов теплого пола",  unit:"шт",   tiers:[] },
  { code:"FIN-DOOR-01", cat:"Чистовые", sub:"Двери и проемы",         name:"Установка межкомнатных дверей",            unit:"шт",   tiers:[] },
  { code:"FIN-DOOR-02", cat:"Чистовые", sub:"Двери и проемы",         name:"Доборы",                                   unit:"шт",   tiers:[] },
  { code:"FIN-DOOR-03", cat:"Чистовые", sub:"Двери и проемы",         name:"Наличники",                                unit:"шт",   tiers:[] },
  { code:"FIN-DOOR-04", cat:"Чистовые", sub:"Двери и проемы",         name:"Скрытые двери",                            unit:"шт",   tiers:[] },
  { code:"FIN-DOOR-05", cat:"Чистовые", sub:"Двери и проемы",         name:"Монтаж входной двери",                     unit:"шт",   tiers:[] },
  { code:"FIN-DOOR-06", cat:"Чистовые", sub:"Двери и проемы",         name:"Оформление проемов и порталов",            unit:"шт",   tiers:[] },
  { code:"FIN-TILE-01", cat:"Чистовые", sub:"Плиточные работы",       name:"Укладка плитки на стены",                  unit:"м²",   tiers:[] },
  { code:"FIN-TILE-02", cat:"Чистовые", sub:"Плиточные работы",       name:"Укладка плитки на пол",                    unit:"м²",   tiers:[] },
  { code:"FIN-TILE-03", cat:"Чистовые", sub:"Плиточные работы",       name:"Раскладка «под 45» (запил)",               unit:"м²",   tiers:[] },
  { code:"FIN-TILE-04", cat:"Чистовые", sub:"Плиточные работы",       name:"Декоративные вставки",                     unit:"шт",   tiers:[] },
  { code:"FIN-TILE-05", cat:"Чистовые", sub:"Плиточные работы",       name:"Затирка швов",                             unit:"м²",   tiers:[] },
  { code:"FIN-TILE-06", cat:"Чистовые", sub:"Плиточные работы",       name:"Монтаж декоративных бордюров",             unit:"м.п.", tiers:[] },
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
  };
}

function getBasePrice(work) {
  const w = getEffectiveWork(work);
  if (w.tiers && w.tiers.length > 0) return w.tiers[0].price;
  if (w.fixedPrice) return w.fixedPrice;
  return null;
}

function getPrice(work, qty, complexity) {
  if (!qty || qty <= 0) return null;
  const w = getEffectiveWork(work);
  const mult = COMPLEXITY.find(c => c.key === complexity)?.mult || 1;
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
const STORAGE_KEY    = "titovstroy-estimates";
const USERS_KEY      = "titovstroy-users";
const SESSION_KEY    = "titovstroy-session";
const PRICES_KEY     = "titovstroy-prices";  // переопределённые цены {code: {fixedPrice?, tiers?}}
const CATALOG_KEY    = "titovstroy-catalog";
// {renames:{code:name}, catRenames:{"Черновые":"Новое"}, subRenames:{"Черновые|Демонтаж":"Снос"},
//  hiddenCodes:[], hiddenSubs:["Черновые|Демонтаж"], hiddenCats:["Черновые"],
//  custom:[{code,cat,sub,name,unit,tiers,fixedPrice}]}

let _catalogOverrides = { renames:{}, catRenames:{}, subRenames:{}, hiddenCodes:[], hiddenSubs:[], hiddenCats:[], custom:[] };
let _onCatalogChange = null;
function setCatalogOverrides(o) {
  _catalogOverrides = { renames:{}, catRenames:{}, subRenames:{}, hiddenCodes:[], hiddenSubs:[], hiddenCats:[], custom:[], ...(o||{}) };
  if (_onCatalogChange) _onCatalogChange();
}
function getEffectiveCatalog() {
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
  return [...base, ...custom];
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
const _race = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]);
const _fbKey = (k) => k.replace(/[^a-zA-Z0-9_]/g, "_"); // Firebase: только буквы/цифры/_
const storage = {
  async get(key) {
    try {
      if (_fbDb) {
        const snap = await _race(get(ref(_fbDb, _fbKey(key))), 5000);
        if (snap && snap.exists()) return { value: JSON.stringify(snap.val()) };
      }
    } catch(e) { console.warn("FB get error:", e); }
    try { const v = localStorage.getItem(key); if (v) return { value: v }; } catch(e) {}
    return _mem[key] ? { value: _mem[key] } : null;
  },
  async set(key, value) {
    const parsed = (() => { try { return JSON.parse(value); } catch { return value; } })();
    try {
      if (_fbDb) {
        await _race(set(ref(_fbDb, _fbKey(key)), parsed), 5000);
        console.log("FB saved:", _fbKey(key));
      }
    } catch(e) { console.warn("FB set error:", e); }
    try { localStorage.setItem(key, value); } catch(e) {}
    _mem[key] = value;
    return { value };
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
      onLogin(user);
    } else {
      setError("Неверный логин или пароль");
    }
    setLoading(false);
  };

  return (
    <div style={{minHeight:"100vh",background:"#0c0e1a",display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"'Golos Text','Segoe UI',sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;600;700;900&display=swap');*{box-sizing:border-box;margin:0;padding:0}`}</style>
      <div style={{width:"100%",maxWidth:380}}>
        {/* Лого */}
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{width:56,height:56,borderRadius:14,background:"linear-gradient(135deg,#b8904a,#d4a85a)",display:"inline-flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:26,color:"#0c0e1a",marginBottom:12}}>T</div>
          <div style={{fontWeight:900,fontSize:22,color:"#e2ddd4",letterSpacing:.3}}>TitovStroy</div>
          <div style={{fontSize:12,color:"#454560",marginTop:4}}>Система расчёта смет · Вход</div>
        </div>

        {/* Форма */}
        <div style={{background:"#111425",border:"1px solid #1c2035",borderRadius:14,padding:"28px 28px"}}>
          <div style={{marginBottom:16}}>
            <div style={{fontSize:11,color:"#454560",marginBottom:6,fontWeight:600,letterSpacing:.5,textTransform:"uppercase"}}>Логин</div>
            <input
              style={{background:"#14172a",border:"1px solid #20243a",color:"#ddd8ce",borderRadius:8,padding:"11px 14px",fontFamily:"inherit",fontSize:14,width:"100%",outline:"none",transition:"border .15s"}}
              placeholder="Введите логин"
              value={login}
              onChange={e=>{setLogin(e.target.value);setError("");}}
              onKeyDown={e=>e.key==="Enter"&&handleLogin()}
              autoComplete="username"
            />
          </div>
          <div style={{marginBottom:20}}>
            <div style={{fontSize:11,color:"#454560",marginBottom:6,fontWeight:600,letterSpacing:.5,textTransform:"uppercase"}}>Пароль</div>
            <div style={{position:"relative"}}>
              <input
                style={{background:"#14172a",border:"1px solid #20243a",color:"#ddd8ce",borderRadius:8,padding:"11px 40px 11px 14px",fontFamily:"inherit",fontSize:14,width:"100%",outline:"none",transition:"border .15s"}}
                placeholder="Введите пароль"
                type={showPass?"text":"password"}
                value={password}
                onChange={e=>{setPassword(e.target.value);setError("");}}
                onKeyDown={e=>e.key==="Enter"&&handleLogin()}
                autoComplete="current-password"
              />
              <button onClick={()=>setShowPass(p=>!p)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"#555575",fontSize:16}}>
                {showPass?"🙈":"👁"}
              </button>
            </div>
          </div>

          {error && (
            <div style={{background:"rgba(200,60,60,.12)",border:"1px solid rgba(200,60,60,.25)",borderRadius:7,padding:"9px 12px",fontSize:12,color:"#e07070",marginBottom:16,textAlign:"center"}}>
              {error}
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={loading}
            style={{width:"100%",background:"linear-gradient(135deg,#b8904a,#d4a85a)",color:"#0c0e1a",border:"none",cursor:loading?"not-allowed":"pointer",padding:"13px",borderRadius:8,fontFamily:"inherit",fontSize:14,fontWeight:700,opacity:loading?.6:1,transition:"all .2s"}}>
            {loading ? "Проверка..." : "Войти"}
          </button>
        </div>
        <div style={{textAlign:"center",marginTop:16,fontSize:11,color:"#2a2a40"}}>TitovStroy · Только для сотрудников</div>
      </div>
    </div>
  );
}

// ─── ПАНЕЛЬ АДМИНИСТРАТОРА (управление пользователями) ───────────────────────
// Прайс редактор — карточки ниже

// Карточка с полностью локальным состоянием — изолирована от родителя
// Принимает начальные данные ОДИН РАЗ, дальше живёт сама
// При размонтировании сохраняет данные в priceCardCache
const priceCardCache = {};

function PriceWorkCard({ w, initTiers, initFixed, onRename, onDelete }) {
  const code = w.code;
  const baseTiers = w.tiers || [];

  const [tiers, setTiers] = useState(() => {
    if (priceCardCache[code]) return priceCardCache[code].tiers;
    return initTiers;
  });
  const [fixedVal, setFixed] = useState(() => {
    if (priceCardCache[code]) return priceCardCache[code].fixedPrice;
    return initFixed;
  });

  // Синхронизируем кэш при каждом изменении
  const updTiers = (t) => { priceCardCache[code] = {tiers:t, fixedPrice:fixedVal}; setTiers(t); };
  const updFixed = (v) => { priceCardCache[code] = {tiers, fixedPrice:v}; setFixed(v); };

  const showTiers = tiers.length > 0;
  const hasChange = !!priceCardCache[code];
  const s = (extra) => ({background:"#0c0e1a",color:"#ddd8ce",borderRadius:5,padding:"5px 8px",fontFamily:"inherit",fontSize:12,outline:"none",width:"100%",...extra});

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(w.name);

  const submitRename = () => {
    if (editName.trim() && editName.trim() !== w.name) onRename(editName.trim());
    setEditing(false);
  };

  return (
    <div style={{background:hasChange?"rgba(184,144,74,.05)":"transparent",border:`1px solid ${hasChange?"rgba(184,144,74,.25)":"#1a1e30"}`,borderRadius:8,padding:"10px 12px",marginBottom:6}}>
      <div style={{marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
        {editing ? (
          <>
            <input autoFocus value={editName} onChange={e=>setEditName(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter")submitRename();if(e.key==="Escape")setEditing(false);}}
              style={{flex:1,background:"#0c0e1a",border:"1px solid #b8904a",color:"#ddd8ce",borderRadius:5,padding:"3px 8px",fontFamily:"inherit",fontSize:13,fontWeight:600,outline:"none"}}/>
            <button onClick={submitRename} style={{background:"rgba(76,175,125,.15)",color:"#4caf7d",border:"none",borderRadius:5,padding:"3px 8px",cursor:"pointer",fontSize:12}}>✓</button>
            <button onClick={()=>setEditing(false)} style={{background:"transparent",color:"#555575",border:"none",cursor:"pointer",fontSize:14}}>✕</button>
          </>
        ) : (
          <>
            <span style={{fontSize:13,fontWeight:600,color:hasChange?"#ddd8ce":"#9090b0",flex:1}}>{w.name}</span>
            <span style={{fontSize:10,color:"#454560"}}>{w.unit}</span>
            <button onClick={()=>{setEditName(w.name);setEditing(true);}} title="Переименовать"
              style={{background:"transparent",color:"#454560",border:"none",cursor:"pointer",fontSize:11,padding:"2px 4px",lineHeight:1}}>✏️</button>
            {onDelete && <button onClick={onDelete} title="Удалить позицию"
              style={{background:"transparent",color:"#e07070",border:"none",cursor:"pointer",fontSize:11,padding:"2px 4px",lineHeight:1}}>🗑</button>}
          </>
        )}
      </div>
      {showTiers ? (
        <div>
          <div style={{display:"grid",gridTemplateColumns:"70px 70px 1fr 28px",gap:4,marginBottom:4}}>
            {["ОТ","ДО","ЦЕНА (₸)",""].map((h,i)=>(<div key={i} style={{fontSize:9,color:"#454560",textAlign:i===2?"right":"center",fontWeight:700}}>{h}</div>))}
          </div>
          {tiers.map((t,ti)=>(
            <div key={ti} style={{display:"grid",gridTemplateColumns:"70px 70px 1fr 28px",gap:4,marginBottom:3,alignItems:"center"}}>
              <input type="number" min="0" value={t.min}
                onChange={e=>updTiers(tiers.map((x,i)=>i===ti?{...x,min:e.target.value===""?"":Number(e.target.value)}:x))}
                style={s({border:"1px solid #20243a",color:"#9090b0",textAlign:"center"})}/>
              <input type="number" min="0" value={t.max}
                onChange={e=>updTiers(tiers.map((x,i)=>i===ti?{...x,max:e.target.value===""?"":Number(e.target.value)}:x))}
                style={s({border:"1px solid #20243a",color:"#9090b0",textAlign:"center"})}/>
              <input type="number" min="0" value={t.price} placeholder={String(baseTiers[ti]?.price??"")}
                onChange={e=>updTiers(tiers.map((x,i)=>i===ti?{...x,price:e.target.value===""?"":Number(e.target.value)}:x))}
                style={s({border:`1px solid ${t.price!==""?"#b8904a":"#20243a"}`,textAlign:"right"})}/>
              <button onClick={()=>updTiers(tiers.filter((_,i)=>i!==ti))}
                style={{background:"rgba(200,60,60,.15)",color:"#e07070",border:"none",borderRadius:5,padding:"5px",cursor:"pointer",fontSize:11}}>✕</button>
            </div>
          ))}
          <button onClick={()=>{const last=tiers[tiers.length-1];const m=last?(Number(last.max)||0)+1:1;updTiers([...tiers,{min:m,max:m+49,price:""}]);}}
            style={{marginTop:4,background:"rgba(184,144,74,.08)",color:"#b8904a",border:"1px dashed rgba(184,144,74,.3)",borderRadius:6,padding:"5px 10px",fontSize:11,cursor:"pointer",fontFamily:"inherit",width:"100%"}}>
            + Добавить диапазон
          </button>
        </div>
      ) : (
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <input type="number" min="0" placeholder={w.fixedPrice!=null?String(w.fixedPrice):"нет цены"}
            value={fixedVal} onChange={e=>updFixed(e.target.value)}
            style={{background:"#0c0e1a",border:`1px solid ${fixedVal!==""?"#b8904a":"#20243a"}`,color:"#ddd8ce",borderRadius:6,padding:"6px 10px",fontFamily:"inherit",fontSize:13,outline:"none",width:150,textAlign:"right"}}/>
          <span style={{fontSize:11,color:"#454560"}}>₸</span>
          <button onClick={()=>updTiers([{min:1,max:50,price:""}])}
            style={{marginLeft:"auto",background:"rgba(184,144,74,.08)",color:"#b8904a",border:"1px dashed rgba(184,144,74,.3)",borderRadius:6,padding:"5px 12px",fontSize:11,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
            + Диапазоны
          </button>
        </div>
      )}
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
    const work = { code, cat:finalCat, sub:finalSub, name:newWork.name.trim(), unit:newWork.unit||"м²", tiers:[], fixedPrice:null };
    const cat = { ...(localCatalog||{}), custom: [...((localCatalog||{}).custom||[]), work] };
    await saveCatalog(cat);
    setNewWork({cat:"", catNew:"", sub:"", subNew:"", name:"", unit:"м²"});
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
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.8)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:400,padding:16,fontFamily:"'Golos Text','Segoe UI',sans-serif"}}>
      <div style={{background:"#111425",border:"1px solid #1c2035",borderRadius:14,padding:"24px 28px",maxWidth:520,width:"100%",height:"88vh",display:"flex",flexDirection:"column",position:"relative"}}>

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontWeight:800,fontSize:16,color:"#e2ddd4"}}>⚙️ Администрирование</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#555575",cursor:"pointer",fontSize:20}}>×</button>
        </div>

        {/* Вкладки */}
        <div style={{display:"flex",gap:4,marginBottom:16,background:"#0c0e1a",borderRadius:8,padding:4}}>
          {[["users","👥 Сотрудники"],["prices","💰 Прайс-лист"]].map(([t,label])=>(
            <button key={t} onClick={()=>setTab(t)} style={{
              flex:1,padding:"8px",borderRadius:6,border:"none",cursor:"pointer",
              fontFamily:"inherit",fontSize:12,fontWeight:700,
              background: tab===t ? "linear-gradient(135deg,#b8904a,#d4a85a)" : "transparent",
              color: tab===t ? "#0c0e1a" : "#555575",transition:"all .15s"
            }}>{label}</button>
          ))}
        </div>

        {loading ? <div style={{textAlign:"center",padding:"30px 0",color:"#454560"}}>Загрузка...</div> : tab === "users" ? (
          <div style={{flex:1,overflowY:"auto"}}>
          <>
            {/* Список */}
            <div style={{marginBottom:20}}>
              {users.map(u => (
                <div key={u.id} style={{background:"#14172a",border:"1px solid #1e2238",borderRadius:9,padding:"12px 14px",marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,fontSize:13,color:"#ddd8ce"}}>{u.name}</div>
                      <div style={{fontSize:11,color:"#555575",marginTop:2}}>
                        @{u.login} · {roleLabel(u.role)}
                        {u.id === currentUser.id && <span style={{color:"#b8904a",marginLeft:6}}>(вы)</span>}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:6,alignItems:"center"}}>
                      <button
                        onClick={()=>{setEditingUser(editingUser?.id===u.id?null:{id:u.id,name:u.name,login:u.login});setEditingPass(null);}}
                        style={{background:"rgba(100,100,200,.1)",color:"#8888cc",border:"1px solid rgba(100,100,200,.2)",borderRadius:6,padding:"4px 10px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>
                        ✏ Изменить
                      </button>
                      <button
                        onClick={()=>{setEditingPass(editingPass?.id===u.id?null:{id:u.id,val:""});setEditingUser(null);}}
                        style={{background:"rgba(184,144,74,.1)",color:"#b8904a",border:"1px solid rgba(184,144,74,.2)",borderRadius:6,padding:"4px 10px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>
                        🔑
                      </button>
                      {u.id !== currentUser.id && (
                        <button onClick={()=>removeUser(u.id)}
                          style={{background:"rgba(200,60,60,.1)",color:"#e07070",border:"1px solid rgba(200,60,60,.2)",borderRadius:6,padding:"4px 8px",fontSize:11,cursor:"pointer"}}>✕</button>
                      )}
                    </div>
                  </div>
                  {editingUser?.id === u.id && (
                    <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:8}}>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                        <div>
                          <div style={{fontSize:10,color:"#555575",marginBottom:3}}>Имя</div>
                          <input style={{width:"100%",background:"#0c0e1a",border:"1px solid #20243a",color:"#ddd8ce",borderRadius:6,padding:"7px 10px",fontFamily:"inherit",fontSize:12,outline:"none"}}
                            value={editingUser.name} onChange={e=>setEditingUser(p=>({...p,name:e.target.value}))}/>
                        </div>
                        <div>
                          <div style={{fontSize:10,color:"#555575",marginBottom:3}}>Логин</div>
                          <input style={{width:"100%",background:"#0c0e1a",border:"1px solid #20243a",color:"#ddd8ce",borderRadius:6,padding:"7px 10px",fontFamily:"inherit",fontSize:12,outline:"none"}}
                            value={editingUser.login} onChange={e=>setEditingUser(p=>({...p,login:e.target.value}))}/>
                        </div>
                      </div>
                      <button onClick={saveUser}
                        style={{background:"linear-gradient(135deg,#b8904a,#d4a85a)",color:"#0c0e1a",border:"none",borderRadius:6,padding:"8px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                        Сохранить изменения
                      </button>
                    </div>
                  )}
                  {editingPass?.id === u.id && (
                    <div style={{marginTop:10,display:"flex",gap:8}}>
                      <input
                        style={{flex:1,background:"#0c0e1a",border:"1px solid #20243a",color:"#ddd8ce",borderRadius:6,padding:"7px 10px",fontFamily:"inherit",fontSize:12,outline:"none"}}
                        placeholder="Новый пароль"
                        value={editingPass.val}
                        onChange={e=>setEditingPass(p=>({...p,val:e.target.value}))}
                      />
                      <button onClick={()=>savePass(u.id)}
                        style={{background:"linear-gradient(135deg,#b8904a,#d4a85a)",color:"#0c0e1a",border:"none",borderRadius:6,padding:"7px 14px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                        Сохранить
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Добавить */}
            <div style={{background:"#0e1122",border:"1px solid #1a1e30",borderRadius:9,padding:"14px 16px"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#b8904a",letterSpacing:1,textTransform:"uppercase",marginBottom:10}}>+ Новый пользователь</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                <input style={{background:"#14172a",border:"1px solid #20243a",color:"#ddd8ce",borderRadius:7,padding:"8px 11px",fontFamily:"inherit",fontSize:12,outline:"none"}} placeholder="Имя" value={newName} onChange={e=>setNewName(e.target.value)}/>
                <input style={{background:"#14172a",border:"1px solid #20243a",color:"#ddd8ce",borderRadius:7,padding:"8px 11px",fontFamily:"inherit",fontSize:12,outline:"none"}} placeholder="Логин" value={newLogin} onChange={e=>setNewLogin(e.target.value)}/>
                <input style={{background:"#14172a",border:"1px solid #20243a",color:"#ddd8ce",borderRadius:7,padding:"8px 11px",fontFamily:"inherit",fontSize:12,outline:"none"}} placeholder="Пароль" value={newPass} onChange={e=>setNewPass(e.target.value)}/>
                <select style={{background:"#14172a",border:"1px solid #20243a",color:"#9090b0",borderRadius:7,padding:"8px 11px",fontFamily:"inherit",fontSize:12,outline:"none",cursor:"pointer"}} value={newRole} onChange={e=>setNewRole(e.target.value)}>
                  <option value="user">👤 Замерщик</option>
                  <option value="admin">👑 Администратор</option>
                  <option value="viewer">👁 Наблюдатель</option>
                </select>
              </div>
              <button onClick={addUser}
                style={{width:"100%",background:"rgba(184,144,74,.12)",color:"#b8904a",border:"1px solid rgba(184,144,74,.25)",borderRadius:7,padding:"9px",fontFamily:"inherit",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                + Добавить
              </button>
            </div>

            {msg && <div style={{marginTop:12,textAlign:"center",fontSize:12,color: msg.startsWith("✓") ? "#4caf7d" : "#e07070"}}>{msg}</div>}
            {saving && <div style={{textAlign:"center",fontSize:11,color:"#454560",marginTop:8}}>💾 Сохранение...</div>}
          </>
          </div>
        ) : (
          /* ═══ ВКЛАДКА ПРАЙС-ЛИСТ ═══ */
          <div style={{display:"flex",flexDirection:"column",height:"calc(88vh - 160px)"}}>
            {!localPrices ? <div style={{textAlign:"center",padding:30,color:"#454560"}}>Загрузка...</div> : null}
            {localPrices && <>
              {/* Поиск — фиксированный */}
              <input
                style={{width:"100%",boxSizing:"border-box",background:"#14172a",border:"1px solid #20243a",color:"#ddd8ce",borderRadius:7,padding:"8px 12px",fontFamily:"inherit",fontSize:12,outline:"none",marginBottom:8}}
                placeholder="🔍 Поиск по названию..."
                value={priceSearch}
                onChange={e=>setPriceSearch(e.target.value)}
              />
              {/* Список — скроллится */}
              <div className="price-scroll" style={{flex:1,overflowY:"scroll",paddingRight:4,scrollbarWidth:"auto",scrollbarColor:"#b8904a #1a1e30"}}>
                <style>{`
                  .price-scroll::-webkit-scrollbar{width:10px}
                  .price-scroll::-webkit-scrollbar-track{background:#1a1e30;border-radius:5px}
                  .price-scroll::-webkit-scrollbar-thumb{background:#b8904a;border-radius:5px;min-height:40px}
                  .price-scroll::-webkit-scrollbar-thumb:hover{background:#d4a85a}
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
                            style={{flex:1,background:"#0c0e1a",border:"1px solid #b8904a",color:"#b8904a",borderRadius:5,padding:"3px 8px",fontFamily:"inherit",fontSize:11,fontWeight:700,outline:"none"}}/>
                          <button onClick={()=>renameCat(origCat,editingCat.val)} style={{...btnS,color:"#4caf7d"}}>✓</button>
                          <button onClick={()=>setEditingCat(null)} style={{...btnS,color:"#555575"}}>✕</button>
                        </div>
                      ) : (
                        <div style={{display:"flex",alignItems:"center",gap:4,padding:"4px 0",borderBottom:"1px solid #1c2035",marginBottom:6}}>
                          <span style={{fontSize:10,fontWeight:700,color:"#b8904a",letterSpacing:1,textTransform:"uppercase",flex:1}}>{cat}</span>
                          <button onClick={()=>setEditingCat({key:origCat,val:cat})} title="Переименовать категорию" style={{...btnS,color:"#555575"}}>✏️</button>
                          <button onClick={()=>{ if(window.confirm(`Удалить всю категорию "${cat}"?`)) deleteCat(origCat); }} title="Удалить категорию" style={{...btnS,color:"#c84848"}}>🗑</button>
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
                                style={{flex:1,background:"#0c0e1a",border:"1px solid #6060a0",color:"#9090c0",borderRadius:5,padding:"2px 7px",fontFamily:"inherit",fontSize:10,outline:"none"}}/>
                              <button onClick={()=>renameSub(origCat,origSub,editingSub.val)} style={{...btnS,color:"#4caf7d"}}>✓</button>
                              <button onClick={()=>setEditingSub(null)} style={{...btnS,color:"#555575"}}>✕</button>
                            </div>
                          ) : (
                            <div style={{display:"flex",alignItems:"center",gap:3,paddingLeft:8,marginBottom:4}}>
                              <span style={{fontSize:9,fontWeight:700,color:"#555575",letterSpacing:.8,textTransform:"uppercase",flex:1}}>{sub}</span>
                              <button onClick={()=>setEditingSub({cat:origCat,key:origSub,val:sub})} title="Переименовать подкатегорию" style={{...btnS,color:"#404058",fontSize:10}}>✏️</button>
                              <button onClick={()=>{ if(window.confirm(`Удалить подкатегорию "${sub}"?`)) deleteSub(origCat,origSub); }} title="Удалить подкатегорию" style={{...btnS,color:"#7a3030",fontSize:10}}>🗑</button>
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
                <div style={{marginTop:8,border:"1px dashed rgba(184,144,74,.3)",borderRadius:8,padding:"10px 12px",marginBottom:8}}>
                  {!showAddWork ? (
                    <button onClick={()=>setShowAddWork(true)}
                      style={{width:"100%",background:"transparent",color:"#b8904a",border:"none",padding:"6px",fontFamily:"inherit",fontSize:12,cursor:"pointer",fontWeight:700}}>
                      ＋ Добавить позицию в каталог
                    </button>
                  ) : (() => {
                    const allW = getEffectiveCatalog();
                    const cats = [...new Set(allW.map(w=>w.cat))];
                    const subs = newWork.cat ? [...new Set(allW.filter(w=>w.cat===newWork.cat).map(w=>w.sub))] : [];
                    const inpStyle = {background:"#0c0e1a",border:"1px solid #20243a",color:"#ddd8ce",borderRadius:6,padding:"6px 9px",fontFamily:"inherit",fontSize:11,outline:"none",width:"100%",boxSizing:"border-box"};
                    const selStyle = {...inpStyle, cursor:"pointer"};
                    return (
                      <div>
                        <div style={{fontSize:11,fontWeight:700,color:"#b8904a",marginBottom:10}}>Новая позиция</div>

                        {/* Категория */}
                        <div style={{marginBottom:6}}>
                          <div style={{fontSize:10,color:"#555575",marginBottom:3}}>Категория</div>
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
                          <div style={{fontSize:10,color:"#555575",marginBottom:3}}>Подкатегория</div>
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
                            <div style={{fontSize:10,color:"#555575",marginBottom:3}}>Название работы</div>
                            <input placeholder="напр. Укладка паркета" value={newWork.name}
                              onChange={e=>setNewWork(p=>({...p,name:e.target.value}))}
                              style={inpStyle}/>
                          </div>
                          <div>
                            <div style={{fontSize:10,color:"#555575",marginBottom:3}}>Единица</div>
                            <select value={newWork.unit} onChange={e=>setNewWork(p=>({...p,unit:e.target.value}))} style={{...selStyle,width:80}}>
                              {["м²","м.п.","шт","усл.","кг","л"].map(u=><option key={u} value={u}>{u}</option>)}
                            </select>
                          </div>
                        </div>

                        <div style={{display:"flex",gap:6}}>
                          <button onClick={addCustomWork}
                            style={{flex:1,background:"rgba(184,144,74,.15)",color:"#b8904a",border:"1px solid rgba(184,144,74,.3)",borderRadius:6,padding:"7px",fontFamily:"inherit",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                            ✓ Добавить
                          </button>
                          <button onClick={()=>{setShowAddWork(false);setNewWork({cat:"",sub:"",name:"",unit:"м²"});}}
                            style={{background:"rgba(200,60,60,.1)",color:"#e07070",border:"1px solid rgba(200,60,60,.2)",borderRadius:6,padding:"7px 12px",fontFamily:"inherit",fontSize:12,cursor:"pointer"}}>
                            Отмена
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
              {/* Кнопка сохранить — фиксирована снизу */}
              <div style={{paddingTop:10,borderTop:"1px solid #1c2035",marginTop:6}}>
                {priceMsg && <div style={{textAlign:"center",fontSize:12,color:"#4caf7d",fontWeight:700,marginBottom:6}}>{priceMsg}</div>}
                <button onClick={savePrices} disabled={priceSaving}
                  style={{width:"100%",background:"linear-gradient(135deg,#b8904a,#d4a85a)",color:"#0c0e1a",border:"none",borderRadius:8,padding:"11px",fontFamily:"inherit",fontSize:13,fontWeight:800,cursor:"pointer"}}>
                  {priceSaving ? "💾 Сохранение..." : "💾 Сохранить прайс"}
                </button>
              </div>
            </>}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── КОМПОНЕНТ КП (используется в модале и при печати) ───────────────────────
function KPContent({ proj, kpItems, discount, discAmt, final, note }) {
  const CONDITIONS = [
    "Стоимость рассчитана исходя из указанных объемов работ без учета НДС.",
    "В стоимость работ могут входить расходы на материалы, оборудование, доставку и иные затраты, необходимые для выполнения работ, если иное прямо указано в договоре.",
    "Оплата производится по факту выполнения работ.",
    "Сроки выполнения указывается дополнительно в основном договоре.",
    "Работы выполняются по договору.",
    "Гарантия на работы составляет 12 месяцев.",
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
        {[["Заказчик",proj.name||"—"],["Телефон",proj.phone||"—"],["Объект",proj.type||"—"],["Адрес",proj.address||"—"],["Дата расчёта",today()],["Менеджер",proj.manager||"—"]].map(([k,v])=>(
          <div key={k}><span style={{color:"#888"}}>{k}: </span><strong>{v}</strong></div>
        ))}
      </div>

      {/* Таблица с группировкой по категориям */}
      {(() => {
        // Группируем по категории
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
                        {["№","Раздел","Наименование","Ед.","Объём","Слож.","Цена","Сумма"].map(h=>(
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
                            <td style={{padding:"6px 8px",fontSize:11,color:"#888"}}>{COMPLEXITY.find(c=>c.key===item.cpx)?.label.split(" ")[0]||"Стандарт"}</td>
                            <td style={{padding:"6px 8px",textAlign:"right",color:"#555"}}>{fmt(item.price)} ₸</td>
                            <td style={{padding:"6px 8px",textAlign:"right",fontWeight:700,fontSize:12}}>{fmt(item.total)} ₸</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{background:"#e8e4da",borderTop:"2px solid #ccc"}}>
                        <td colSpan={7} style={{padding:"7px 8px",fontSize:12,fontWeight:700,color:"#444",textAlign:"right"}}>Итого по разделу «{cat}»:</td>
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

            {/* Итог */}
            <div style={{background:"#1a1a28",borderRadius:10,padding:"13px 18px",color:"#f5f2ec",marginTop:8}}>
              {discount>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#e07070",marginBottom:6}}><span>Скидка {discount}%</span><span>− {fmt(discAmt)} ₸</span></div>}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:14,fontWeight:600,letterSpacing:.5}}>ИТОГО:</span>
                <span style={{fontSize:28,fontWeight:900,color:"#b8904a",letterSpacing:-.5}}>{fmt(final)} ₸</span>
              </div>
              {proj.area&&Number(proj.area)>0&&<div style={{textAlign:"right",fontSize:11,color:"#666",marginTop:3}}>{fmt(final/Number(proj.area))} ₸/м²</div>}
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
          <img src="data:image/jpeg;base64,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" alt="Печать TitovStroy"
            style={{width:120,height:120,objectFit:"contain",opacity:.85,mixBlendMode:"multiply",marginBottom:4}}/>
        </div>
      </div>
    </div>
  );
}

// ─── ГЛАВНЫЙ КОМПОНЕНТ ───────────────────────────────────────────────────────
export default function App() {
  const [catalogVersion, setCatalogVersion] = useState(0);
  useEffect(() => {
    _onCatalogChange = () => setCatalogVersion(v => v + 1);
    return () => { _onCatalogChange = null; };
  }, []);
  const Gdyn = useMemo(() => groupData(getEffectiveCatalog()), [catalogVersion]);
  const cats = Object.keys(Gdyn);

  // Авторизация
  const [currentUser, setCurrentUser] = useState(null);
  const [showAdmin, setShowAdmin] = useState(false);

  // Экраны: "list" | "editor"
  const [screen, setScreen] = useState("list");

  // Пользователи для выпадающего списка менеджеров
  const [allUsers, setAllUsers] = useState(DEFAULT_USERS);

  // Список смет { id, proj, rows, discount, note, updatedAt, total }
  const [estimates, setEstimates] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [saving, setSaving] = useState(false);

  // Текущая смета в редакторе
  const [currentId, setCurrentId] = useState(null);
  const [activeCat, setActiveCat] = useState(cats[0]);
  const [activeSub, setActiveSub] = useState(Object.keys(Gdyn[cats[0]]||{})[0]);
  const [rows, setRows] = useState({});
  const [proj, setProj] = useState({...EMPTY_PROJ});
  const [discount, setDiscount] = useState(0);
  const [note, setNote] = useState("");
  const [showKP, setShowKP] = useState(false);
  const [editPrices, setEditPrices] = useState(false);
  const [search, setSearch] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [listSearch, setListSearch] = useState("");
  const [listFilter, setListFilter] = useState(""); // "" | "Вторичка" | "Новостройка" | "Коммерция"
  const [listSort, setListSort] = useState("date"); // "date" | "sum" | "name"

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

  // ── Загрузка списка смет из shared storage ──
  const loadEstimates = useCallback(async () => {
    setLoadingList(true);
    try {
      const result = await storage.get(STORAGE_KEY);
      if (result) setEstimates(JSON.parse(result.value));
    } catch(e) {
      setEstimates([]);
    }
    // Загружаем пользователей для списка менеджеров
    try {
      const u = await storage.get(USERS_KEY);
      if (u) setAllUsers(JSON.parse(u.value));
    } catch {}
    // Загружаем переопределения цен
    try {
      const pr = await storage.get(PRICES_KEY);
      if (pr) setPriceOverrides(JSON.parse(pr.value));
      // Загружаем каталог
      try {
        const cat = await storage.get(CATALOG_KEY);
        if (cat) setCatalogOverrides(JSON.parse(cat.value));
      } catch {}
    } catch {}
    setLoadingList(false);
  }, []);

  useEffect(() => { loadEstimates(); }, []);

  // ── Сохранение всего списка ──
  const saveEstimates = useCallback(async (list) => {
    setSaving(true);
    try {
      await storage.set(STORAGE_KEY, JSON.stringify(list));
    } catch(e) { console.error(e); }
    setSaving(false);
  }, []);

  // ── Вычисления текущей сметы ──
  const setRow = (name, field, val) =>
    setRows(p => ({ ...p, [name]: { ...p[name], [field]: val } }));

  const rowPrice = (work) => {
    const r = rows[work.name] || {};
    if (r.manualPrice !== undefined && r.manualPrice !== "") return Number(r.manualPrice);
    return getPrice(work, Number(r.qty || 0), r.complexity || "std");
  };
  const rowTotal = (work) => {
    const qty = Number((rows[work.name] || {}).qty || 0);
    const price = rowPrice(work);
    return qty > 0 && price ? qty * price : 0;
  };
  const subSum = (cat, sub) => (Gdyn[cat]?.[sub] || []).reduce((s,w) => s + rowTotal(w), 0);
  const catSum = (cat) => Object.keys(Gdyn[cat]||{}).reduce((s,sub) => s + subSum(cat,sub), 0);
  const grand = useMemo(() => {
    let s = 0;
    for (const cat of cats) for (const sub of Object.keys(Gdyn[cat]||{})) for (const w of Gdyn[cat]?.[sub]||[]) s += rowTotal(w);
    return s;
  }, [rows]);
  const discAmt = grand * discount / 100;
  const final = grand - discAmt;
  const kpItems = useMemo(() => {
    const out = [];
    for (const cat of cats) for (const sub of Object.keys(Gdyn[cat]||{})) for (const w of Gdyn[cat]?.[sub]||[]) {
      const qty = Number((rows[w.name]||{}).qty||0);
      const price = rowPrice(w);
      if (qty > 0 && price) out.push({ ...w, qty, price, total: qty * price, cpx: (rows[w.name]||{}).complexity||"std" });
    }
    return out;
  }, [rows]);
  const filledCount = Object.values(rows).filter(r => Number(r?.qty) > 0).length;
  const searchResults = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return getEffectiveCatalog().filter(w =>
      w.name.toLowerCase().includes(q) || w.sub.toLowerCase().includes(q) || w.cat.toLowerCase().includes(q)
    );
  }, [search]);
  const isSearching = search.trim().length > 0;
  // Защита от краша: если activeCat не в Gdyn — берём первый
  const safeCat = Gdyn[activeCat] ? activeCat : (Object.keys(Gdyn)[0]||"");
  const subs = Object.keys(Gdyn[safeCat] || {});
  const safeActiveSub = subs.includes(activeSub) ? activeSub : (subs[0]||"");

  // ── Открыть смету на редактирование ──
  const openEstimate = (est) => {
    setCurrentId(est.id);
    setProj(est.proj || {...EMPTY_PROJ});
    setRows(est.rows || {});
    setDiscount(est.discount || 0);
    setNote(est.note || "");
    setSearch("");
    setActiveCat(cats[0]);
    setActiveSub(Object.keys(Gdyn[cats[0]]||{})[0]);
    setScreen("editor");
  };

  // ── Новая смета ──
  const newEstimate = () => {
    const id = genId();
    setCurrentId(id);
    setProj({...EMPTY_PROJ, manager: currentUser.name, _createdBy: currentUser.name, _createdById: currentUser.id});
    setRows({});
    setDiscount(0);
    setNote("");
    setSearch("");
    setActiveCat(cats[0]);
    setActiveSub(Object.keys(Gdyn[cats[0]]||{})[0]);
    setScreen("editor");
  };

  // ── Сохранить текущую и вернуться к списку ──
  const saveAndBack = async () => {
    const exists = estimates.find(e => e.id === currentId);
    const updated = {
      id: currentId,
      proj, rows, discount, note,
      createdAt: exists?.createdAt || Date.now(),
      createdBy: exists?.createdBy || currentUser.name,
      updatedAt: Date.now(),
      updatedBy: currentUser.name,
      total: final,
    };
    const newList = exists
      ? estimates.map(e => e.id === currentId ? updated : e)
      : [updated, ...estimates];
    setEstimates(newList);
    await saveEstimates(newList);
    setScreen("list");
  };

  // ── Удалить смету ──
  const deleteEstimate = async (id) => {
    const newList = estimates.filter(e => e.id !== id);
    setEstimates(newList);
    await saveEstimates(newList);
    setDeleteConfirm(null);
  };

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
    const newList = [copy, ...estimates];
    setEstimates(newList);
    await saveEstimates(newList);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // РЕНДЕР
  // ─────────────────────────────────────────────────────────────────────────
  // Показать экран входа если не авторизован
  if (!currentUser) return <LoginScreen onLogin={setCurrentUser} />;

  return (
    <div style={{fontFamily:"'Golos Text','Segoe UI',sans-serif",background:"#0c0e1a",minHeight:"100vh",color:"#ddd8ce"}}>
      {/* Панель администратора */}
      {showAdmin && <AdminPanel currentUser={currentUser} onClose={()=>setShowAdmin(false)}/>}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700;900&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        html,body{background:#0c0e1a;overflow-x:hidden;width:100%}
        input,select,textarea{outline:none}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-thumb{background:#b8904a;border-radius:2px}
        .fi{background:#14172a;border:1px solid #20243a;color:#ddd8ce;border-radius:7px;padding:8px 12px;font-family:inherit;font-size:13px;width:100%;transition:border .15s}
        .fi:focus{border-color:#b8904a}
        .fi::placeholder{color:#33364d}
        .tab-btn{background:none;border:none;cursor:pointer;padding:7px 14px;border-radius:6px;font-family:inherit;font-size:13px;font-weight:600;color:#555570;transition:all .15s;white-space:nowrap}
        .tab-btn:hover{color:#b8b0a0;background:rgba(184,144,74,.08)}
        .tab-btn.active{background:rgba(184,144,74,.18);color:#b8904a}
        .sub-btn{background:none;border:none;cursor:pointer;padding:5px 10px;border-radius:5px;font-family:inherit;font-size:11.5px;color:#45455e;transition:all .15s;white-space:nowrap}
        .sub-btn:hover{color:#9090b0;background:rgba(255,255,255,.04)}
        .sub-btn.active{background:rgba(255,255,255,.07);color:#b0b0c8;font-weight:600}
        .wrow{display:grid;align-items:start;padding:9px 14px;border-radius:7px;gap:8px;transition:background .12s;min-width:0}
        .wrow:hover{background:rgba(255,255,255,.02)}
        .wrow.on{background:rgba(184,144,74,.06)}
        .num{background:#14172a;border:1px solid #20243a;color:#ddd8ce;border-radius:6px;padding:6px 8px;text-align:right;font-family:inherit;font-size:13px;transition:border .15s}
        .num:focus{border-color:#b8904a}
        .num::placeholder{color:#33364d}
        .cpx-sel{background:#14172a;border:1px solid #20243a;color:#7070a0;border-radius:6px;padding:4px 6px;font-family:inherit;font-size:11px;margin-top:4px;cursor:pointer;width:auto;max-width:130px}
        .cpx-sel:focus{border-color:#b8904a}
        .card{background:#111425;border:1px solid #1c2035;border-radius:12px;overflow:hidden}
        .btn{border:none;cursor:pointer;padding:11px 22px;border-radius:8px;font-family:inherit;font-size:13px;font-weight:700;transition:all .2s;letter-spacing:.2px}
        .btn-g{background:linear-gradient(135deg,#b8904a,#d4a85a);color:#0c0e1a}
        .btn-g:hover{transform:translateY(-1px);box-shadow:0 5px 20px rgba(184,144,74,.4)}
        .btn-g:disabled{opacity:.35;cursor:not-allowed;transform:none;box-shadow:none}
        .btn-o{background:rgba(255,255,255,.05);color:#707090;border:1px solid #1c2035}
        .btn-o:hover{background:rgba(255,255,255,.08);color:#b0b0c8}
        .btn-red{background:rgba(200,60,60,.12);color:#e07070;border:1px solid rgba(200,60,60,.2)}
        .btn-red:hover{background:rgba(200,60,60,.22);color:#f09090}
        .badge{background:rgba(184,144,74,.15);color:#b8904a;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:700}
        @keyframes up{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:translateY(0)}}
        .up{animation:up .22s ease forwards}
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
          #kp-print-portal{display:block!important;position:fixed;inset:0;background:#f5f2ec;padding:24px;z-index:9999;font-family:'Golos Text','Segoe UI',sans-serif}
          #kp-print-portal *{display:revert!important}
          .kp-no-print{display:none!important}
          @page{margin:10mm;size:A4 portrait}
        }
        .est-card{background:#111425;border:1px solid #1c2035;border-radius:11px;padding:16px 18px;cursor:pointer;transition:all .15s;position:relative}
        .est-card:hover{border-color:#b8904a;background:#14172e}
        .est-card:active{transform:scale(.99)}
      `}</style>

      {/* ═══════════════════════════════════════════════════════════════════
          ЭКРАН 1: СПИСОК СМЕТ
      ═══════════════════════════════════════════════════════════════════ */}
      {screen === "list" && (
        <div style={{maxWidth:720,margin:"0 auto",padding:"0 0 40px",minHeight:"100vh"}}>
          {/* Шапка */}
          <div className="list-header" style={{background:"#0e1122",borderBottom:"1px solid #181c2e",padding:"12px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:10}}>
            <div style={{display:"flex",alignItems:"center",gap:10,flex:1,minWidth:0}}>
              <div style={{width:30,height:30,borderRadius:7,background:"linear-gradient(135deg,#b8904a,#d4a85a)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:14,color:"#0c0e1a",flexShrink:0}}>T</div>
              <div style={{minWidth:0}}>
                <div style={{fontWeight:800,fontSize:13,whiteSpace:"nowrap",color:"#e2ddd4"}}>TitovStroy</div>
                <div style={{fontSize:10,color:"#454560",whiteSpace:"nowrap"}}>
                  <span style={{color:"#b8904a"}}>{currentUser.role==="admin"?"👑":currentUser.role==="viewer"?"👁":"👤"}</span>{" "}{currentUser.name}
                </div>
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
              {saving && <span style={{fontSize:11,color:"#555575"}}>💾</span>}
              {currentUser.role === "admin" && (
                <button className="btn btn-o" style={{padding:"6px 9px",fontSize:14}} onClick={()=>setShowAdmin(true)}>⚙️</button>
              )}
              <button className="btn btn-o" style={{padding:"6px 9px",fontSize:11}} onClick={()=>setCurrentUser(null)}>Выйти</button>
              {currentUser.role !== "viewer" && (
                <button className="btn btn-g" style={{padding:"7px 14px",fontSize:12,whiteSpace:"nowrap"}} onClick={newEstimate}>+ Новая</button>
              )}
            </div>
          </div>

          <div style={{padding:"20px 20px 0"}}>
            {loadingList ? (
              <div style={{textAlign:"center",padding:"60px 0",color:"#353550"}}>
                <div style={{fontSize:24,marginBottom:10}}>⏳</div>
                <div style={{fontSize:13}}>Загрузка смет...</div>
              </div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {/* Заголовок */}
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:2}}>
                  <div>
                    <div style={{fontWeight:800,fontSize:17,color:"#e2ddd4"}}>📁 Архив смет</div>
                    <div style={{fontSize:11,color:"#353550",marginTop:1}}>Все расчёты и коммерческие предложения</div>
                  </div>
                </div>
                {/* Поиск и фильтры */}
                {estimates.length > 0 && (
                  <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:2}}>
                    <input
                      style={{background:"#14172a",border:"1px solid #20243a",color:"#ddd8ce",borderRadius:8,padding:"9px 14px",fontFamily:"inherit",fontSize:13,outline:"none",width:"100%"}}
                      placeholder="🔍 Поиск по клиенту, адресу, телефону..."
                      value={listSearch}
                      onChange={e=>setListSearch(e.target.value)}
                    />
                    <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                      {/* Фильтр по типу */}
                      {["","Вторичка","Новостройка","Коммерция"].map(t=>(
                        <button key={t} onClick={()=>setListFilter(t)}
                          style={{background:listFilter===t?"rgba(184,144,74,.2)":"rgba(255,255,255,.04)",color:listFilter===t?"#b8904a":"#555575",border:`1px solid ${listFilter===t?"rgba(184,144,74,.4)":"#1c2035"}`,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                          {t||"Все типы"}
                        </button>
                      ))}
                      <div style={{flex:1}}/>
                      {/* Сортировка */}
                      <select value={listSort} onChange={e=>setListSort(e.target.value)}
                        style={{background:"#14172a",border:"1px solid #20243a",color:"#555575",borderRadius:6,padding:"4px 8px",fontSize:11,fontFamily:"inherit",cursor:"pointer",outline:"none"}}>
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
                    <div style={{fontSize:13,color:"#454560",marginBottom:24}}>Нажмите «+ Новая смета» чтобы начать</div>
                    {currentUser.role !== "viewer" && (
                      <button className="btn btn-g" onClick={newEstimate}>+ Создать первую смету</button>
                    )}
                  </div>
                ) : (() => {
                  const q = listSearch.toLowerCase().trim();
                  const filtered = estimates
                    .filter(e => !listFilter || e.proj?.type === listFilter)
                    .filter(e => !q || [e.proj?.name,e.proj?.address,e.proj?.phone,e.proj?.manager].some(v=>v&&v.toLowerCase().includes(q)))
                    .slice()
                    .sort((a,b) => {
                      if (listSort==="sum") return (b.total||0)-(a.total||0);
                      if (listSort==="name") return (a.proj?.name||"").localeCompare(b.proj?.name||"","ru");
                      return (b.updatedAt||0)-(a.updatedAt||0);
                    });
                  return (
                    <>
                      <div style={{fontSize:11,color:"#454560",marginBottom:2}}>
                        {filtered.length !== estimates.length
                          ? `Найдено: ${filtered.length} из ${estimates.length}`
                          : `Всего смет: ${estimates.length}`}
                      </div>
                      {filtered.length === 0 && (
                        <div style={{textAlign:"center",padding:"40px 0",color:"#353550",fontSize:13}}>Ничего не найдено</div>
                      )}
                      {filtered.map((est, i) => {
                        const hasItems = est.rows && Object.values(est.rows).some(r => Number(r?.qty) > 0);
                        const status = !hasItems ? "draft" : est.total > 0 ? "done" : "draft";
                        const author = est.updatedBy&&est.updatedBy!==est.createdBy ? est.updatedBy : est.createdBy;
                        return (
                          <div key={est.id} className="est-card up" style={{animationDelay:`${i*0.04}s`,padding:"10px 14px"}}
                            onClick={() => { if(currentUser.role==="viewer") return; openEstimate(est); }}
                            >
                            {/* Строка 1: статус + имя + сумма */}
                            <div style={{display:"flex",alignItems:"center",gap:8}}>
                              <span style={{width:7,height:7,borderRadius:"50%",flexShrink:0,background:status==="done"?"#4caf7d":"#555",boxShadow:status==="done"?"0 0 5px #4caf7d":"none"}}/>
                              <span style={{fontWeight:700,fontSize:14,color:"#e2ddd4",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                                {est.proj?.name || <span style={{color:"#454560",fontStyle:"italic"}}>Без названия</span>}
                              </span>
                              {est.total>0
                                ? <span style={{fontSize:14,fontWeight:800,color:"#b8904a",flexShrink:0}}>{fmt(est.total)} ₸</span>
                                : <span style={{fontSize:11,color:"#454560",fontStyle:"italic",flexShrink:0}}>черновик</span>}
                            </div>
                            {/* Строка 2: мета + дата + кнопки */}
                            <div style={{display:"flex",alignItems:"center",gap:6,marginTop:5}} onClick={e=>e.stopPropagation()}>
                              <span style={{fontSize:11,color:"#555575",background:"rgba(255,255,255,.04)",borderRadius:4,padding:"1px 6px"}}>{est.proj?.type||"—"}</span>
                              {est.proj?.area&&<span style={{fontSize:11,color:"#454560"}}>{est.proj.area} м²</span>}
                              {est.proj?.address&&<span style={{fontSize:11,color:"#404058",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:160}}>{est.proj.address}</span>}
                              <span style={{flex:1}}/>
                              <span style={{fontSize:10,color:"#353550",whiteSpace:"nowrap"}}>{fmtDate(est.updatedAt)}</span>
                              {author&&<span style={{fontSize:10,color:"#353550",whiteSpace:"nowrap"}}>· {author}</span>}
                              {currentUser.role !== "viewer" && (
                                <button onClick={()=>duplicateEstimate(est)}
                                  style={{background:"rgba(100,100,200,.1)",color:"#7777bb",border:"1px solid rgba(100,100,200,.15)",borderRadius:4,padding:"2px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>
                                  ⧉
                                </button>
                              )}
                              {currentUser.role==="admin" && (
                                <button onClick={()=>setDeleteConfirm(est.id)}
                                  style={{background:"rgba(200,60,60,.08)",color:"#c06060",border:"1px solid rgba(200,60,60,.15)",borderRadius:4,padding:"2px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>
                                  🗑
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
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
          <div style={{background:"#161929",border:"1px solid #2a2d3e",borderRadius:12,padding:"24px 28px",maxWidth:340,width:"100%",textAlign:"center"}}
            onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:32,marginBottom:12}}>🗑️</div>
            <div style={{fontWeight:700,fontSize:15,marginBottom:8}}>Удалить смету?</div>
            <div style={{fontSize:12,color:"#555575",marginBottom:20}}>Это действие нельзя отменить</div>
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
          <div className="editor-header" style={{background:"#0e1122",borderBottom:"1px solid #181c2e",padding:"11px 22px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:10,gap:8}}>
            <div className="editor-header-left" style={{display:"flex",alignItems:"center",gap:8,flex:1,minWidth:0}}>
              <button className="btn btn-o" style={{padding:"7px 11px",fontSize:12,flexShrink:0}} onClick={saveAndBack}>
                ← Сметы
              </button>
              <div style={{fontSize:13,fontWeight:600,color:"#9090b0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0}}>
                {proj.name || "Новая смета"}
              </div>
            </div>
            <div className="editor-header-right" style={{display:"flex",alignItems:"center",gap:8}}>
              {saving && <span style={{fontSize:11,color:"#555575"}}>💾</span>}
              {filledCount > 0 && <span className="badge">{filledCount} позиций</span>}
              {currentUser.role !== "viewer" && (
                <button className="btn btn-o" style={{fontSize:11,padding:"6px 12px"}} onClick={()=>setEditPrices(m=>!m)}>
                  {editPrices ? "✓" : "✏"}
                </button>
              )}
              {currentUser.role === "viewer" && (
                <span style={{fontSize:11,color:"#555575",background:"rgba(255,255,255,.05)",borderRadius:5,padding:"4px 10px"}}>👁 Только просмотр</span>
              )}
              <span className="proj-name" style={{fontSize:11,color:"#454560"}}>
                {currentUser.role==="admin"?"👑":currentUser.role==="viewer"?"👁":"👤"} {currentUser.name}
              </span>
              {currentUser.role !== "viewer"
                ? <button className="btn btn-g" style={{padding:"8px 16px",fontSize:13}} onClick={saveAndBack}>💾 Сохранить</button>
                : <button className="btn btn-o" style={{padding:"8px 16px",fontSize:13}} onClick={saveAndBack}>← Назад</button>
              }
            </div>
          </div>

          <div style={{maxWidth:1160,margin:"0 auto",padding:"18px 18px"}}>
            {/* ОБЪЕКТ */}
            <div className="card up" style={{padding:"16px 20px",marginBottom:16}}>
              <div style={{fontSize:10,fontWeight:700,color:"#b8904a",letterSpacing:1.5,textTransform:"uppercase",marginBottom:11}}>Информация об объекте</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:10}}>
                {[["Клиент / Объект","name","Иванов — Бухар-Жырау 45","text"],
                  ["Тип","type","","objtype"],
                  ["Площадь, м²","area","75","text"],
                  ["Менеджер","manager","","manager"],
                  ["Телефон клиента","phone","+7 707...","text"],
                  ["Адрес","address","ул. Бухар-Жырау, 45","text"],
                ].map(([lbl,f,ph,ftype])=>(
                  <div key={f}>
                    <div style={{fontSize:10,color:"#353550",marginBottom:4}}>{lbl}</div>
                    {ftype==="objtype" ? (
                      <select className="fi" value={proj.type} onChange={e=>setProj(p=>({...p,type:e.target.value}))}>
                        {OBJ_TYPES.map(t=><option key={t}>{t}</option>)}
                      </select>
                    ) : ftype==="manager" ? (
                      <select className="fi" value={proj.manager||""} onChange={e=>setProj(p=>({...p,manager:e.target.value}))}>
                        <option value="">— выбрать —</option>
                        {allUsers.filter(u=>u.role!=="viewer").map(u=>(
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

            <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr)",gap:16,alignItems:"start"}} className="main-grid">
              {/* РАБОТЫ */}
              <div className="card up">
                {/* Поиск */}
                <div style={{padding:"10px 12px",borderBottom:"1px solid #181c2e",position:"relative"}}>
                  <input className="fi" placeholder="🔍  Поиск по работам... (например: штукатурка, плитка, розетки)"
                    value={search} onChange={e=>setSearch(e.target.value)}
                    style={{paddingLeft:14,paddingRight:search?32:14}}/>
                  {search && (
                    <button onClick={()=>setSearch("")} style={{position:"absolute",right:20,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"#555575",fontSize:16,lineHeight:1}}>×</button>
                  )}
                </div>

                {/* Категории */}
                {!isSearching && <div style={{display:"flex",gap:3,padding:"10px 10px 0",borderBottom:"1px solid #181c2e"}}>
                  {cats.map(cat=>(
                    <button key={cat} className={`tab-btn ${activeCat===cat?"active":""}`}
                      onClick={()=>{ const s=Object.keys(Gdyn[cat]||{}); setActiveCat(cat); setActiveSub(s[0]||""); }}>
                      {cat}{catSum(cat)>0&&<span style={{marginLeft:4,fontSize:9,color:"#b8904a"}}>●</span>}
                    </button>
                  ))}
                </div>}

                {/* Подкатегории */}
                {!isSearching && <div style={{display:"flex",flexWrap:"wrap",gap:3,padding:"8px 10px",borderBottom:"1px solid #181c2e",background:"rgba(0,0,0,.12)"}}>
                  {subs.map(sub=>(
                    <button key={sub} className={`sub-btn ${safeActiveSub===sub?"active":""}`} onClick={()=>setActiveSub(sub)}>
                      {sub}{subSum(safeCat,sub)>0&&<span style={{marginLeft:3,color:"#b8904a",fontSize:8}}>●</span>}
                    </button>
                  ))}
                </div>}

                {/* Шапка таблицы */}
                <div className="wrow-th" style={{display:"grid",gridTemplateColumns:"1fr 50px 120px 76px 90px",padding:"6px 14px 7px",fontSize:10,color:"#353550",fontWeight:700,letterSpacing:.8,textTransform:"uppercase",borderBottom:"1px solid #181c2e"}}>
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
                    <div style={{textAlign:"center",padding:"32px 0",color:"#353550"}}>
                      <div style={{fontSize:22,marginBottom:8}}>🔍</div>
                      <div style={{fontSize:13}}>Ничего не найдено</div>
                    </div>
                  )}
                  {isSearching && searchResults.length > 0 && (
                    <div style={{padding:"4px 8px 2px",fontSize:10,color:"#555575",borderBottom:"1px solid #181c2e",marginBottom:2}}>
                      Найдено: {searchResults.length} работ
                    </div>
                  )}
                  {(isSearching ? searchResults : (Gdyn[safeCat]?.[safeActiveSub]||[])).map(work=>{
                    const r = rows[work.name]||{};
                    const qty = Number(r.qty||0);
                    const cpx = r.complexity||"std";
                    const price = rowPrice(work);
                    const basePrice = getBasePrice(work);
                    const displayPrice = price ?? basePrice;
                    const total = rowTotal(work);
                    const filled = qty > 0 && price;
                    const showBreadcrumb = isSearching;
                    const tierHint = (work.tiers||[]).length > 1
                      ? (work.tiers||[]).map(t=>`${t.min}–${t.max}: ${fmt(t.price)} ₸`).join(" · ")
                      : null;
                    const priceCell = editPrices ? (
                      <input className="num" style={{width:110}} type="number" min="0" placeholder="Введите цену"
                        value={r.manualPrice!==undefined ? r.manualPrice : (price||"")}
                        onChange={e=>setRow(work.name,"manualPrice",e.target.value===""?undefined:Number(e.target.value))}/>
                    ) : displayPrice != null ? (
                      <span style={{fontSize:12,color:filled?"#b8a880":"#555575"}}>{fmt(displayPrice)}</span>
                    ) : <span style={{fontSize:10,color:"#353550",fontStyle:"italic"}}>нет цены</span>;
                    const qtyInput = <input className="num" style={{width:70,textAlign:"center",opacity:currentUser.role==="viewer"?.4:1}} type="number" min="0" placeholder="0" disabled={currentUser.role==="viewer"}
                      value={r.qty||""} onChange={e=>setRow(work.name,"qty",e.target.value)}/>;
                    const nameBlock = (
                      <div style={{minWidth:0}}>
                        {showBreadcrumb && <div style={{fontSize:10,color:"#454568",marginBottom:2}}>{work.cat} › {work.sub}</div>}
                        <div style={{fontSize:13,color:filled?"#ddd8ce":"#707090",lineHeight:1.3}}>{work.name}</div>
                        {tierHint && <div style={{fontSize:10,color:"#444460",marginTop:1}}>{tierHint}</div>}
                        {qty > 0 && (
                          <select className="cpx-sel" value={cpx}
                            onChange={e=>{setRow(work.name,"complexity",e.target.value);setRow(work.name,"manualPrice",undefined);}}>
                            {COMPLEXITY.map(c=><option key={c.key} value={c.key}>{c.label}</option>)}
                          </select>
                        )}
                      </div>
                    );
                    return (
                      <div key={work.name} className={`wrow ${filled?"on":""}`}>
                        {/* Desktop: 5 cols via CSS class; Mobile: overridden to 2 cols */}
                        <style>{`@media(min-width:701px){.wrow{grid-template-columns:1fr 50px 120px 76px 90px}}.wrow-mob-extra{display:none}@media(max-width:700px){.wrow{grid-template-columns:1fr auto!important}.wrow-mob-extra{display:flex!important}}`}</style>
                        {nameBlock}
                        <div className="wrow-desk" style={{textAlign:"center",fontSize:12,color:"#454560",paddingTop:3}}>{work.unit}</div>
                        <div className="wrow-desk" style={{textAlign:"right",paddingTop:2}}>{priceCell}</div>
                        <div className="wrow-desk" style={{textAlign:"right"}}>{qtyInput}</div>
                        <div className="wrow-desk" style={{textAlign:"right",paddingTop:3}}>
                          {total>0 ? <span style={{fontSize:13,fontWeight:700,color:"#b8904a"}}>{fmt(total)}</span>
                                   : <span style={{color:"#252535",fontSize:12}}>—</span>}
                        </div>
                        {/* Mobile right column: цена/ед · поле · итог */}
                        <div className="wrow-mob-extra" style={{flexDirection:"column",alignItems:"flex-end",gap:3,display:"none",paddingTop:2,minWidth:90}}>
                          <span style={{fontSize:11,color:"#555575",whiteSpace:"nowrap"}}>
                            {displayPrice!=null ? fmt(displayPrice)+" ₸/ед" : <span style={{fontStyle:"italic",fontSize:10}}>нет цены</span>}
                          </span>
                          <input className="num" style={{width:82,textAlign:"center",fontSize:16,padding:"7px 10px",fontWeight:700}} type="number" min="0" placeholder="0"
                            value={r.qty||""} onChange={e=>setRow(work.name,"qty",e.target.value)}/>
                          {total>0
                            ? <span style={{fontSize:12,fontWeight:800,color:"#b8904a",whiteSpace:"nowrap"}}>{fmt(total)} ₸</span>
                            : <span style={{fontSize:10,color:"#333345"}}>—</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {!isSearching && subSum(safeCat,safeActiveSub)>0&&(
                  <div style={{borderTop:"1px solid #181c2e",padding:"10px 14px",display:"flex",justifyContent:"space-between"}}>
                    <span style={{fontSize:11,color:"#454560"}}>Итого по разделу «{safeActiveSub}»</span>
                    <span style={{fontSize:15,fontWeight:700,color:"#b8904a"}}>{fmt(subSum(safeCat,safeActiveSub))} ₸</span>
                  </div>
                )}
                {isSearching && searchResults.length > 0 && (() => {
                  const searchTotal = searchResults.reduce((s,w) => s + rowTotal(w), 0);
                  return searchTotal > 0 ? (
                    <div style={{borderTop:"1px solid #181c2e",padding:"10px 14px",display:"flex",justifyContent:"space-between"}}>
                      <span style={{fontSize:11,color:"#454560"}}>Итого по найденным работам</span>
                      <span style={{fontSize:15,fontWeight:700,color:"#b8904a"}}>{fmt(searchTotal)} ₸</span>
                    </div>
                  ) : null;
                })()}
              </div>

              {/* ПРАВАЯ ПАНЕЛЬ */}
              <div id="summary-panel" style={{display:"flex",flexDirection:"column",gap:14}}>
                <div style={{background:"linear-gradient(145deg,#13162a,#111424)",border:"1px solid #1c2035",borderRadius:12,padding:18}} className="up">
                  <div style={{fontSize:10,fontWeight:700,color:"#b8904a",letterSpacing:1.5,textTransform:"uppercase",marginBottom:14}}>Смета</div>
                  {cats.map(cat=>{
                    const cs = catSum(cat);
                    if(!cs) return null;
                    return (
                      <div key={cat} style={{marginBottom:8}}>
                        <div style={{fontSize:10,color:"#454560",fontWeight:700,textTransform:"uppercase",letterSpacing:.7,padding:"5px 0 3px",borderBottom:"1px solid #181c2e"}}>{cat}</div>
                        {Object.keys(Gdyn[cat]||{}).map(sub=>{
                          const ss = subSum(cat,sub);
                          if(!ss) return null;
                          return (
                            <div key={sub} style={{display:"flex",justifyContent:"space-between",padding:"4px 0 4px 6px",fontSize:12,borderBottom:"1px solid #10132a"}}>
                              <span style={{color:"#5a5a78"}}>{sub}</span>
                              <span style={{color:"#a0987a"}}>{fmt(ss)} ₸</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                  {grand===0&&<div style={{textAlign:"center",padding:"22px 0",color:"#252535",fontSize:12}}>Введите объёмы →</div>}
                  {grand>0&&(
                    <>
                      <div style={{marginTop:10,paddingTop:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{fontSize:12,color:"#454560"}}>Скидка %</span>
                        <input className="num" style={{width:54}} type="number" min="0" max="100"
                          value={discount} onChange={e=>setDiscount(Math.min(100,Math.max(0,Number(e.target.value))))}/>
                      </div>
                      {discount>0&&(
                        <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#c84848",marginTop:6}}>
                          <span>Скидка {discount}%</span><span>− {fmt(discAmt)} ₸</span>
                        </div>
                      )}
                      <div style={{borderTop:"1px solid #1c2035",marginTop:12,paddingTop:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{fontSize:12,color:"#6060a0"}}>Итого</span>
                        <span style={{fontSize:22,fontWeight:900,color:"#b8904a"}}>{fmt(final)} ₸</span>
                      </div>
                      {proj.area&&<div style={{textAlign:"right",fontSize:10,color:"#353550",marginTop:3}}>≈ {fmt(final/Number(proj.area))} ₸/м²</div>}
                    </>
                  )}
                </div>
                <div className="card" style={{padding:14}}>
                  <div style={{fontSize:10,color:"#353550",fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",marginBottom:7}}>Примечание</div>
                  <textarea className="fi" rows={3} style={{resize:"none"}} placeholder="Доп. условия..." value={note} onChange={e=>setNote(e.target.value)}/>
                </div>
                <button className="btn btn-g" disabled={kpItems.length===0} onClick={()=>setShowKP(true)}>
                  Сформировать КП
                </button>
                <button className="btn btn-o" onClick={()=>{setRows({});setDiscount(0);setNote("");}}>
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
                  background:"linear-gradient(135deg,#b8904a,#d4a85a)",
                  color:"#0c0e1a",border:"none",borderRadius:30,
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
      {showKP&&(
        <>
          {/* Overlay + modal для экрана */}
          <div className="kp-no-print" style={{position:"fixed",inset:0,background:"rgba(0,0,0,.78)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,padding:16}}
            onClick={()=>setShowKP(false)}>
            <div style={{background:"#f5f2ec",color:"#1a1a28",borderRadius:14,padding:"24px 28px",maxWidth:700,width:"100%",maxHeight:"90vh",overflowY:"auto",fontFamily:"'Golos Text','Segoe UI',sans-serif"}}
              onClick={e=>e.stopPropagation()}>
              <KPContent proj={proj} kpItems={kpItems} discount={discount} discAmt={discAmt} final={final} note={note}/>
              <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:20}}>
                <button style={{background:"#ddd",color:"#555",border:"none",cursor:"pointer",padding:"10px 18px",borderRadius:7,fontFamily:"inherit",fontSize:13,fontWeight:600}} onClick={()=>setShowKP(false)}>Закрыть</button>
                <button style={{background:"linear-gradient(135deg,#b8904a,#d4a85a)",color:"#0c0e1a",border:"none",cursor:"pointer",padding:"10px 20px",borderRadius:7,fontFamily:"inherit",fontSize:13,fontWeight:700}} onClick={()=>{
                const el = document.getElementById("kp-print-portal");
                const css = `
                  @import url('https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700;900&display=swap');
                  *{box-sizing:border-box;margin:0;padding:0}
                  body{font-family:'Golos Text','Segoe UI',sans-serif;background:#f5f2ec;color:#1a1a28;padding:24px;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact}
                  table{width:100%;border-collapse:collapse}
                  @page{margin:8mm;size:A4 portrait}
                  @media print{.no-print{display:none!important}body{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}}
                `;
                const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>КП TitovStroy</title><style>' + css + '</style></head><body>' + el.innerHTML + '<div class="no-print" style="margin-top:24px;text-align:center"><button onclick="window.print()" style="padding:12px 32px;background:#b8904a;color:#fff;border:none;border-radius:8px;font-size:15px;cursor:pointer;font-weight:700;font-family:inherit">🖨 Сохранить PDF</button></div></body></html>';
                const w = window.open("","_blank","width=960,height=800");
                w.document.open();
                w.document.write(html);
                w.document.close();
                setTimeout(()=>w.focus(),300);
              }}>Печать / PDF</button>
              </div>
            </div>
          </div>
          {/* Портал для печати — точная копия, отображается только при print */}
          <div id="kp-print-portal" style={{display:"none",fontFamily:"'Golos Text','Segoe UI',sans-serif",background:"#f5f2ec",padding:"20px 24px",color:"#1a1a28"}}>
            <KPContent proj={proj} kpItems={kpItems} discount={discount} discAmt={discAmt} final={final} note={note}/>
          </div>
        </>
      )}
    </div>
  );
}
