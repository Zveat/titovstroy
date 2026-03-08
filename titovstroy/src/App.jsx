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

const STATUSES = [
  { key:"new",       label:"Новая",       color:"#5577cc", bg:"rgba(85,119,204,.15)"  },
  { key:"progress",  label:"В работе",    color:"#d4a84a", bg:"rgba(212,168,74,.15)"  },
  { key:"agreed",    label:"Согласовано", color:"#4caf7d", bg:"rgba(76,175,125,.15)"  },
  { key:"rejected",  label:"Отказ",       color:"#c05050", bg:"rgba(192,80,80,.15)"   },
];
const STORAGE_KEY    = "titovstroy-estimates";
const USERS_KEY      = "titovstroy-users";
const SESSION_KEY    = "titovstroy-session";
const PRICES_KEY     = "titovstroy-prices";  // переопределённые цены {code: {fixedPrice?, tiers?}}
const CATALOG_KEY    = "titovstroy-catalog";
const CONTRACTS_KEY  = "titovstroy-contracts";
const CLIENTS_KEY    = "titovstroy-clients";
const CONTRAGENTS_KEY= "titovstroy-contragents";
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
      try { localStorage.setItem(SESSION_KEY, JSON.stringify({ user, savedAt: Date.now() })); } catch(e) {}
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

function ContractEditor({ contract, clients, contragents, onUpdate, onBack, onSave, onPdf, onGDoc, onAddClientFromEstimate, currentUserRole, allUsers=[], fmt }) {
  const [withStamp, setWithStamp] = useState(true);
  const type = contract.type || "repair_fiz";
  const total = (contract.works||[]).reduce((s,w)=>s+(Number(w.quantity)*Number(w.price)||0),0);
  const upd = (patch) => onUpdate(prev=>({...prev,...patch}));

  const isRepair = type==="repair_fiz";
  const isAnnex  = type==="annex";
  const isDesign = type==="design";
  const isDesAdd = type==="design_add";
  const isRes    = type==="reservation";
  const hasWorks = isRepair || isAnnex;
  const hasMainRef = isAnnex || isDesAdd; // ссылка на основной договор

  const fi = {background:"#11152a",border:"1px solid #20243a",borderRadius:6,color:"#ddd8ce",fontSize:13,padding:"8px 10px",fontFamily:"inherit",width:"100%"};

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:"#555575",cursor:"pointer",fontSize:18}}>←</button>
        <span style={{fontWeight:700,fontSize:15,color:"#e2ddd4"}}>{contract.number ? `${TYPE_LABELS[type]||""} №${contract.number}` : "Новый документ"}</span>
      </div>

      {/* Тип документа */}
      <div>
        <div style={{fontSize:11,color:"#555575",marginBottom:4}}>Тип документа</div>
        <select style={fi} value={type} onChange={e=>upd({type:e.target.value})}>
          {DOC_TYPES.map(d=><option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
      </div>

      {/* Основные поля — номер и дата */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div>
          <div style={{fontSize:11,color:"#555575",marginBottom:4}}>{isDesAdd?"Номер доп. соглашения":"Номер договора/соглашения"}</div>
          <input className="fi" value={contract.number||""} onChange={e=>upd({number:e.target.value})} placeholder="0001#2026"/>
        </div>
        <div>
          <div style={{fontSize:11,color:"#555575",marginBottom:4}}>Дата</div>
          <input className="fi" type="date" value={contract.date||""} onChange={e=>upd({date:e.target.value})}/>
        </div>
      </div>

      {/* Ссылка на основной договор (для Приложений и Доп.соглашений) */}
      {hasMainRef && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div>
            <div style={{fontSize:11,color:"#555575",marginBottom:4}}>{isDesAdd?"Номер соглашения о дизайне":"Номер основного договора"}</div>
            <input className="fi" value={contract.mainNumber||""} onChange={e=>upd({mainNumber:e.target.value})} placeholder="0819#128"/>
          </div>
          <div>
            <div style={{fontSize:11,color:"#555575",marginBottom:4}}>{isDesAdd?"Дата соглашения о дизайне":"Дата основного договора"}</div>
            <input className="fi" type="date" value={contract.mainDate||""} onChange={e=>upd({mainDate:e.target.value})}/>
          </div>
        </div>
      )}

      {/* Номер приложения для Annex */}
      {isAnnex && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div>
            <div style={{fontSize:11,color:"#555575",marginBottom:4}}>Приложение №</div>
            <input className="fi" type="number" min="2" value={contract.appendix||2} onChange={e=>upd({appendix:parseInt(e.target.value)||2})}/>
          </div>
          <div>
            <div style={{fontSize:11,color:"#555575",marginBottom:4}}>Дата приложения</div>
            <input className="fi" type="date" value={contract.annexDate||contract.date||""} onChange={e=>upd({annexDate:e.target.value})}/>
          </div>
        </div>
      )}

      {/* Доп поля: резервирование */}
      {isRes && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div>
            <div style={{fontSize:11,color:"#555575",marginBottom:4}}>Сумма резервирования (₸)</div>
            <input className="fi" type="number" value={contract.reserveAmount||50000} onChange={e=>upd({reserveAmount:parseFloat(e.target.value)||0})}/>
          </div>
          <div>
            <div style={{fontSize:11,color:"#555575",marginBottom:4}}>Дата начала работ (п.2.1)</div>
            <input className="fi" type="date" value={contract.reserveStartDate||""} onChange={e=>upd({reserveStartDate:e.target.value})}/>
          </div>
        </div>
      )}

      {/* Доп поля: дизайн */}
      {isDesign && (
        <div>
          <div style={{fontSize:11,color:"#555575",marginBottom:4}}>Предоплата (₸)</div>
          <input className="fi" type="number" value={contract.designAdvance||25000} onChange={e=>upd({designAdvance:parseFloat(e.target.value)||0})}/>
        </div>
      )}

      {/* Доп поля: доп. соглашение к дизайну */}
      {isDesAdd && (<>\
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div>
            <div style={{fontSize:11,color:"#555575",marginBottom:4}}>Площадь объекта (м²)</div>
            <input className="fi" type="number" value={contract.area||""} onChange={e=>upd({area:e.target.value})} placeholder="85"/>
          </div>
          <div>
            <div style={{fontSize:11,color:"#555575",marginBottom:4}}>Срок выполнения (раб. дней)</div>
            <input className="fi" type="number" value={contract.deadline||""} onChange={e=>upd({deadline:e.target.value})} placeholder="30"/>
          </div>
          <div>
            <div style={{fontSize:11,color:"#555575",marginBottom:4}}>Вариантов планировки</div>
            <input className="fi" type="number" min="1" value={contract.variantsLayout||""} onChange={e=>upd({variantsLayout:e.target.value})} placeholder="2"/>
          </div>
          <div>
            <div style={{fontSize:11,color:"#555575",marginBottom:4}}>Раундов корр. планировки</div>
            <input className="fi" type="number" min="0" value={contract.corrLayout||""} onChange={e=>upd({corrLayout:e.target.value})} placeholder="2"/>
          </div>
          <div>
            <div style={{fontSize:11,color:"#555575",marginBottom:4}}>Раундов корр. визуализаций</div>
            <input className="fi" type="number" min="0" value={contract.corrVis||""} onChange={e=>upd({corrVis:e.target.value})} placeholder="2"/>
          </div>
        </div>
        {/* Тип стоимости */}
        <div>
          <div style={{fontSize:11,color:"#555575",marginBottom:6}}>Способ расчёта стоимости</div>
          <div style={{display:"flex",gap:16,marginBottom:8}}>
            <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"#aaa",cursor:"pointer"}}>
              <input type="radio" name="priceType" checked={!contract.priceType||contract.priceType==="fixed"}
                onChange={()=>upd({priceType:"fixed"})}/> Фиксированная сумма
            </label>
            <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"#aaa",cursor:"pointer"}}>
              <input type="radio" name="priceType" checked={contract.priceType==="sqm"}
                onChange={()=>upd({priceType:"sqm"})}/> За м²
            </label>
          </div>
          {(!contract.priceType||contract.priceType==="fixed") ? (
            <div>
              <div style={{fontSize:11,color:"#555575",marginBottom:4}}>Итоговая стоимость (₸)</div>
              <input className="fi" type="number" value={contract.totalCost||""} onChange={e=>upd({totalCost:parseFloat(e.target.value)||0})} placeholder="170000"/>
            </div>
          ) : (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div>
                <div style={{fontSize:11,color:"#555575",marginBottom:4}}>Цена за м² (₸)</div>
                <input className="fi" type="number" value={contract.pricePerSqm||""} onChange={e=>upd({pricePerSqm:parseFloat(e.target.value)||0})} placeholder="2000"/>
              </div>
              <div>
                <div style={{fontSize:11,color:"#555575",marginBottom:4}}>Итого (авто, ₸)</div>
                <div className="fi" style={{background:"rgba(184,144,74,.07)",color:"#b8904a",fontWeight:700,display:"flex",alignItems:"center"}}>
                  {fmt(Math.round((contract.pricePerSqm||0)*(contract.area||0)))} ₸
                </div>
              </div>
            </div>
          )}
        </div>
        <div>
          <div style={{fontSize:11,color:"#555575",marginBottom:4}}>Предоплата уже внесена (₸)</div>
          <input className="fi" type="number" value={contract.designAdvance||25000} onChange={e=>upd({designAdvance:parseFloat(e.target.value)||0})}/>
        </div>
        <div>
          <div style={{fontSize:11,color:"#555575",marginBottom:6}}>Состав дизайн-проекта</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            {[["plan","Обмерочный план"],["layout","Планировочное решение"],["concept","Концепция интерьера"],["vis3d","3D визуализация"],["drawings","Рабочие чертежи"],["materials","Ведомость материалов"]].map(([k,l])=>(
              <label key={k} style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"#aaa",cursor:"pointer"}}>
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
          <div style={{fontSize:12,fontWeight:700,color:"#888"}}>ЗАКАЗЧИК</div>
          {contract.estClient && !contract.clientId && (
            <div style={{fontSize:11,color:"#b8904a"}}>⚠ Из сметы: {contract.estClient}</div>
          )}
        </div>
        <select className="fi" value={contract.clientId||""} onChange={e=>upd({clientId:e.target.value})}>
          <option value="">— Выбрать клиента —</option>
          {clients.map(c=>(<option key={c.id} value={c.id}>{c.name}{c.clientType==="yur" || c.type==="юр" ? " (ЮР)" : ""}</option>))}
        </select>
        {!contract.clientId && contract.estClient && (
          <button onClick={onAddClientFromEstimate}
            style={{marginTop:6,background:"rgba(76,175,125,.1)",color:"#4caf7d",border:"1px solid rgba(76,175,125,.2)",borderRadius:6,padding:"5px 12px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>
            + Создать клиента из сметы ({contract.estClient})
          </button>
        )}
      </div>
      {/* Подрядчик */}
      <div>
        <div style={{fontSize:12,fontWeight:700,color:"#888",marginBottom:8}}>ПОДРЯДЧИК</div>
        <select className="fi" value={contract.contragentId||""} onChange={e=>upd({contragentId:e.target.value})}>
          <option value="">— Выбрать ТОО —</option>
          {contragents.map(c=>(<option key={c.id} value={c.id}>{c.name}</option>))}
        </select>
      </div>
      {/* Работы — только для ремонта и приложений */}
      {hasWorks && <div>
        <div style={{fontSize:12,fontWeight:700,color:"#888",marginBottom:8}}>РАБОТЫ ({(contract.works||[]).length})</div>
        <div style={{background:"#0d1020",borderRadius:8,overflow:"hidden",border:"1px solid #1c2035"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 70px 55px 80px 80px 30px",padding:"8px 12px",background:"#161929",fontSize:10,color:"#454560",fontWeight:700}}>
            <span>НАИМЕНОВАНИЕ</span><span style={{textAlign:"center"}}>КОЛ-ВО</span><span style={{textAlign:"center"}}>ЕД.</span><span style={{textAlign:"right"}}>ЦЕНА</span><span style={{textAlign:"right"}}>СУММА</span><span/>
          </div>
          {(contract.works||[]).map((w,i)=>(
            <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 70px 55px 80px 80px 30px",gap:4,padding:"6px 12px",borderTop:"1px solid #181c2e",alignItems:"center"}}>
              <input value={w.name||""} onChange={e=>{const ws=[...(contract.works||[])];ws[i]={...ws[i],name:e.target.value};upd({works:ws});}}
                style={{background:"transparent",border:"none",color:"#ddd8ce",fontSize:12,fontFamily:"inherit",padding:0,outline:"none",width:"100%"}}/>
              <input type="number" value={w.quantity||""} onChange={e=>{const ws=[...(contract.works||[])];ws[i]={...ws[i],quantity:parseFloat(e.target.value)||0};upd({works:ws});}}
                style={{background:"#14172a",border:"1px solid #20243a",color:"#ddd8ce",fontSize:11,borderRadius:4,padding:"3px 5px",textAlign:"center",fontFamily:"inherit",width:"100%"}}/>
              <input value={w.unit||"м²"} onChange={e=>{const ws=[...(contract.works||[])];ws[i]={...ws[i],unit:e.target.value};upd({works:ws});}}
                style={{background:"#14172a",border:"1px solid #20243a",color:"#ddd8ce",fontSize:11,borderRadius:4,padding:"3px 5px",textAlign:"center",fontFamily:"inherit",width:"100%"}}/>
              <input type="number" value={w.price||""} onChange={e=>{const ws=[...(contract.works||[])];ws[i]={...ws[i],price:parseFloat(e.target.value)||0};upd({works:ws});}}
                style={{background:"#14172a",border:"1px solid #20243a",color:"#ddd8ce",fontSize:11,borderRadius:4,padding:"3px 5px",textAlign:"right",fontFamily:"inherit",width:"100%"}}/>
              <div style={{fontSize:12,fontWeight:700,color:"#b8904a",textAlign:"right"}}>{fmt(Number(w.quantity)*Number(w.price)||0)}</div>
              <button onClick={()=>{const ws=(contract.works||[]).filter((_,j)=>j!==i);upd({works:ws});}}
                style={{background:"none",border:"none",color:"#c06060",cursor:"pointer",fontSize:14,padding:0}}>✕</button>
            </div>
          ))}
          <div style={{padding:"8px 12px",borderTop:"1px solid #181c2e",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <button onClick={()=>upd({works:[...(contract.works||[]),{name:"",quantity:0,unit:"м²",price:0}]})}
              style={{background:"rgba(136,136,204,.1)",color:"#8888cc",border:"1px solid rgba(136,136,204,.2)",borderRadius:6,padding:"5px 12px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>
              + Добавить позицию
            </button>
            <div style={{fontWeight:800,fontSize:16,color:"#b8904a"}}>{fmt(total)} ₸</div>
          </div>
        </div>
      </div>}
      {/* Предоплата для ремонтных договоров */}
      {isRepair && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div>
            <div style={{fontSize:11,color:"#555575",marginBottom:4}}>Предоплата (%)</div>
            <input className="fi" type="number" min="0" max="100" value={contract.advancePercent??30}
              onChange={e=>upd({advancePercent:parseFloat(e.target.value)||0})} placeholder="30"/>
          </div>
          <div>
            <div style={{fontSize:11,color:"#555575",marginBottom:4}}>Сумма предоплаты (₸)</div>
            <div className="fi" style={{background:"rgba(184,144,74,.07)",color:"#b8904a",fontWeight:700,display:"flex",alignItems:"center"}}>
              {fmt(Math.round(total*(contract.advancePercent??30)/100))} ₸
            </div>
          </div>
        </div>
      )}
      {/* Менеджер */}
      <div>
        <div style={{fontSize:11,color:"#555575",marginBottom:4}}>Менеджер</div>
        <select className="fi" value={contract.manager||""} onChange={e=>upd({manager:e.target.value})}>
          <option value="">— выбрать —</option>
          {allUsers.filter(u=>u.role!=="viewer").map(u=>(
            <option key={u.id} value={u.name}>{u.name}</option>
          ))}
        </select>
      </div>
      {/* Примечание */}
      <div>
        <div style={{fontSize:11,color:"#555575",marginBottom:4}}>Примечание</div>
        <textarea className="fi" rows={2} value={contract.note||""} onChange={e=>upd({note:e.target.value})} placeholder="Дополнительные условия..."/>
      </div>
      {/* Кнопки */}
      <div style={{display:"flex",gap:8}}>
        <button className="btn btn-g" style={{flex:1}} onClick={onSave}>💾 Сохранить</button>
        <div style={{flex:1,display:"flex",flexDirection:"column",gap:4}}>
          <button onClick={()=>onPdf(withStamp)} style={{width:"100%",background:"rgba(184,144,74,.1)",color:"#b8904a",border:"1px solid rgba(184,144,74,.3)",borderRadius:8,padding:"10px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
            📄 PDF
          </button>
          <div onClick={()=>setWithStamp(p=>!p)} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",justifyContent:"center"}}>
            <div style={{width:28,height:16,borderRadius:8,background:withStamp?"#b8904a":"#2a2a3a",position:"relative",transition:"background .2s",flexShrink:0}}>
              <div style={{position:"absolute",top:2,left:withStamp?12:2,width:12,height:12,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
            </div>
            <span style={{fontSize:10,color:withStamp?"#b8904a":"#555575"}}>С печатью</span>
          </div>
        </div>
        <button onClick={onGDoc} style={{flex:1,background:"rgba(66,133,244,.1)",color:"#4285f4",border:"1px solid rgba(66,133,244,.3)",borderRadius:8,padding:"10px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
          📋 Google Doc
        </button>
      </div>
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

  // Экраны: "list" | "editor" | "contracts"
  const [screen, setScreen] = useState("dashboard");

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
  const [estStatus, setEstStatus] = useState("new");
  const [estComment, setEstComment] = useState("");
  const [showStats, setShowStats] = useState(false);
  const [statsPeriod, setStatsPeriod] = useState("month"); // all | month | week | 3month | custom
  const [statsManager, setStatsManager] = useState(""); // "" = все
  const [statsDateFrom, setStatsDateFrom] = useState("");
  const [statsDateTo, setStatsDateTo] = useState("");
  // ── Договоры ──
  const [contracts, setContracts] = useState([]);
  const [contractClients, setContractClients] = useState([]);
  const [contragents, setContragents] = useState([{id:"1",name:"ТОО TITOVSTROY",bin:"231040002769",bank:'АО "Kaspi Bank"',bik:"CASPKZKA",account:"KZ38722S000030058973",director:"Титов В.Е.",phone:"8707 667 8766",email:"titovstroy@mail.ru",address:"Казахстан, район им.Казыбек би, улица Кирпичная, дом 8г"}]);
  const [contractTab, setContractTab] = useState("list"); // list | editor | clients | contragents
  const [currentContract, setCurrentContract] = useState(null);
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
  const [listFilter, setListFilter] = useState(""); // "" | "Вторичка" | "Новостройка" | "Коммерция"
  const [listFilterManager, setListFilterManager] = useState(""); // "" = все
  const [listFilterStatus, setListFilterStatus] = useState(""); // "" = все статусы
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
  const loadContracts = useCallback(async () => {
    try {
      const [cr, cl, ca] = await Promise.all([storage.get(CONTRACTS_KEY), storage.get(CLIENTS_KEY), storage.get(CONTRAGENTS_KEY)]);
      if (cr) setContracts(JSON.parse(cr.value));
      if (cl) { const cls = JSON.parse(cl.value); setContractClients(cls.map(c=>({...c, createdAt: c.createdAt||Date.now()}))); }
      if (ca) setContragents(JSON.parse(ca.value));
    } catch(e) { console.error(e); }
  }, []);

  const saveContracts = async (list) => { setContracts(list); await storage.set(CONTRACTS_KEY, JSON.stringify(list)); };
  const saveContractClients = async (list) => { const patched = list.map(c=>({...c, createdAt: c.createdAt||Date.now()})); setContractClients(patched); await storage.set(CLIENTS_KEY, JSON.stringify(patched)); };
  const saveContragents = async (list) => { setContragents(list); await storage.set(CONTRAGENTS_KEY, JSON.stringify(list)); };

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

  useEffect(() => { loadEstimates(); loadContracts(); }, []);

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
    const validNames = new Set(allUsers.filter(u=>u.role!=="viewer").map(u=>u.name));
    const p = est.proj || {...EMPTY_PROJ};
    setProj({...p, manager: validNames.has(p.manager||"") ? p.manager : ""});
    setRows(est.rows || {});
    setDiscount(est.discount || 0);
    setNote(est.note || "");
    setEstStatus(est.status || "new");
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
    setProj({...EMPTY_PROJ, manager: currentUser.name, _createdBy: currentUser.name, _createdById: currentUser.id});
    setRows({});
    setDiscount(0);
    setNote("");
    setEstStatus("new");
    setEstComment("");
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
      status: estStatus,
      comment: estComment,
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
  th{background:#ddd;font-weight:bold;text-align:center;font-size:8pt}
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
  th{background:#ddd;font-weight:bold;text-align:center;font-size:8pt}
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
        const sum = Number(w.quantity||0)*Number(w.price||0);
        catMap[cat].total += sum;
        catMap[cat].rows.push(Object.assign({},w,{sum:sum}));
      });
      const multiCat = catOrder.length > 1;
      // For DOCX: use width="" attribute which html-docx-js respects
      const thW = forDocx
        ? (w,txt,align) => "<th width=\""+w+"\" style=\"width:"+w+";font-size:7.5pt;background:#ddd;font-weight:bold;text-align:"+(align||"center")+";border:1px solid #000;padding:2pt 3pt\">"+txt+"</th>"
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
        html += "<tr><td colspan=\"6\" style=\"background:#2a2a3a;color:#c8a060;font-weight:bold;font-size:9pt;padding:3pt 5pt\">"
          + cat + " \u2014 " + fmtN(catTotal) + " \u20b8</td></tr>";
        let lastSub = "";
        rows.forEach(function(w,i){
          if(w.subcategory && w.subcategory !== lastSub){
            lastSub = w.subcategory;
            html += "<tr><td colspan=\"6\" style=\"background:#e8e4f0;color:#5a3a8a;font-style:italic;font-size:8.5pt;padding:2pt 5pt\">"
              + w.subcategory + "</td></tr>";
          }
          globalNum++;
          const bg = i%2===0 ? "#f8f6f0" : "#f0ede5";
          const tdS = forDocx ? ";line-height:1.1;mso-line-height-rule:exactly" : "";
          html += "<tr style=\"background:" + bg + "\">"
            + (forDocx ? '<td width="5%"' : '<td') + ' class="tc" style="font-size:8pt'+tdS+'">' + globalNum + "</td>"
            + (forDocx ? '<td width="45%"' : '<td') + ' style="font-size:8pt'+tdS+'">' + (w.name||"") + "</td>"
            + (forDocx ? '<td width="8%"' : '<td') + ' class="tc" style="font-size:8pt'+tdS+'">' + (w.unit||"\u043c\xb2") + "</td>"
            + (forDocx ? '<td width="8%"' : '<td') + ' class="tc" style="font-size:8pt'+tdS+'">' + (w.quantity||"") + "</td>"
            + (forDocx ? '<td width="17%"' : '<td') + ' class="tr" style="font-size:8pt'+tdS+'">' + fmtN(w.price) + " \u20b8</td>"
            + (forDocx ? '<td width="17%"' : '<td') + ' class="tr" style="font-size:8pt;font-weight:bold'+tdS+'">' + fmtN(w.sum) + " \u20b8</td>"
            + "</tr>";
        });
        html += "<tr style=\"background:#ede8d5\">"
          + "<td colspan=\"5\" class=\"tr\" style=\"font-style:italic;font-size:9pt\">\u0418\u0442\u043e\u0433\u043e \u043f\u043e \u0440\u0430\u0437\u0434\u0435\u043b\u0443 \u00ab" + cat + "\u00bb:</td>"
          + "<td class=\"tr\" style=\"font-weight:bold\">" + fmtN(catTotal) + " \u20b8</td>"
          + "</tr>";
      });
      html += "</tbody></table>";
      if(multiCat){
        html += "<table style=\"margin-top:6pt;width:60%;margin-left:40%\"><tbody>";
        html += "<tr><td colspan=\"2\" style=\"background:#e8e4d8;font-weight:bold;font-size:9pt\">\u0421\u0432\u043e\u0434\u043a\u0430 \u043f\u043e \u0440\u0430\u0437\u0434\u0435\u043b\u0430\u043c</td></tr>";
        catOrder.forEach(function(cat){
          html += "<tr><td style=\"font-size:9pt\">" + cat + "</td><td class=\"tr\" style=\"font-weight:bold;font-size:9pt\">" + fmtN(catMap[cat].total) + " \u20b8</td></tr>";
        });
        html += "<tr style=\"background:#e8e0c8\"><td style=\"font-weight:bold\">\u0418\u0422\u041e\u0413\u041e:</td>"
          + "<td class=\"tr\" style=\"font-weight:bold;font-size:11pt\">" + fmtN(total) + " \u20b8</td></tr>";
        html += "</tbody></table>";
      } else {
        html += "<p class=\"tr\" style=\"font-weight:bold;font-size:11pt;padding-top:4pt\">\u0418\u0422\u041e\u0413\u041e: " + fmtN(total) + " \u20b8</p>";
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
    const printBtn = forDocx ? "" : `\n<div class="np" style="margin-top:24px;text-align:center;padding:16px">\n  <button onclick="window.print()" style="padding:12px 36px;background:#b8904a;color:#fff;border:none;border-radius:6px;font-size:14px;cursor:pointer;font-weight:700;font-family:Verdana,sans-serif">🖨 Распечатать / Сохранить PDF</button>\n</div>`;
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
        const sum=Number(w.quantity||0)*Number(w.price||0);
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
          rows.push(new D.TableRow({children:[TC(String(n),5,{bg:bg,al:D.AlignmentType.CENTER}),TC(w.name||"",45,{bg:bg}),TC(w.unit||"\u043c\xb2",8,{bg:bg,al:D.AlignmentType.CENTER}),TC(String(w.quantity||""),8,{bg:bg,al:D.AlignmentType.CENTER}),TC(fmtN2(w.price)+" \u20b8",17,{bg:bg,al:D.AlignmentType.RIGHT}),TC(fmtN2(w.sum)+" \u20b8",17,{bg:bg,b:true,al:D.AlignmentType.RIGHT})]}));
        });
        rows.push(new D.TableRow({children:[TC("\u0418\u0442\u043e\u0433\u043e \u043f\u043e \u0440\u0430\u0437\u0434\u0435\u043b\u0443 \u00ab"+cat+"\u00bb:",83,{span:5,i:true,bg:"ede8d5",al:D.AlignmentType.RIGHT}),TC(fmtN2(ct)+" \u20b8",17,{bg:"ede8d5",b:true,al:D.AlignmentType.RIGHT})]}));
      });
      // ИТОГО строка
      rows.push(new D.TableRow({children:[TC("\u0418\u0422\u041e\u0413\u041e:",83,{span:5,b:true,bg:"e8e0c8",al:D.AlignmentType.RIGHT}),TC(fmtN2(total)+" \u20b8",17,{bg:"e8e0c8",b:true,sz:11,al:D.AlignmentType.RIGHT})]}));
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

  const NAV_ITEMS = [
    { id:"dashboard", icon:"⌂",  label:"Главная" },
    { id:"list",      icon:"📋", label:"Сметы" },
    { id:"contracts", icon:"📄", label:"Договора" },
    { id:"analytics", icon:"📊", label:"Аналитика" },
    ...(currentUser.role==="admin" ? [{ id:"admin", icon:"⚙️", label:"Админка" }] : []),
  ];

  return (
    <div style={{fontFamily:"'Golos Text','Segoe UI',sans-serif",background:"#0c0e1a",minHeight:"100vh",color:"#ddd8ce",display:"flex",flexDirection:"column"}}>
      {/* Панель администратора */}
      {showAdmin && <AdminPanel currentUser={currentUser} onClose={async ()=>{ setShowAdmin(false); const u=await storage.get(USERS_KEY); if(u) setAllUsers(JSON.parse(u.value)); }}/>}
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
        .sidebar{width:220px;background:#0a0c18;border-right:1px solid #161929;display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;z-index:50;transition:width .22s cubic-bezier(.4,0,.2,1)}
        .sidebar.collapsed{width:60px}
        .nav-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;cursor:pointer;margin:2px 6px;transition:all .15s;border-left:2px solid transparent}
        .nav-item:hover{background:rgba(255,255,255,.04)}
        .nav-item.active{background:rgba(184,144,74,.1);border-left-color:#b8904a}
        .nav-label{font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;transition:opacity .15s,width .15s}
        .sidebar.collapsed .nav-label{opacity:0;width:0;pointer-events:none}
        .sidebar-content{margin-left:220px;transition:margin-left .22s cubic-bezier(.4,0,.2,1);min-height:100vh}
        .sidebar-content.collapsed{margin-left:60px}
        @media(max-width:700px){
          .sidebar{display:none!important}
          .sidebar-content{margin-left:0!important;padding-bottom:68px!important}
          .mob-nav{display:flex!important}
        }
        .mob-nav{display:none;position:fixed;bottom:0;left:0;right:0;background:#0a0c18;border-top:1px solid #161929;z-index:50}
        .mob-nav-item{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px 4px;cursor:pointer;gap:3px;border-top:2px solid transparent;transition:all .15s}
        .mob-nav-item.active{border-top-color:#b8904a;background:rgba(184,144,74,.07)}
      `}</style>

      {/* ── SIDEBAR (десктоп) ── */}
      <div className={"sidebar"+(sideCollapsed?" collapsed":"")}>
        {/* Лого */}
        <div style={{padding:"20px 14px 16px",display:"flex",alignItems:"center",gap:10,borderBottom:"1px solid #161929",minHeight:64}}>
          <div style={{width:34,height:34,borderRadius:9,background:"linear-gradient(135deg,#b8904a,#d4a85a)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:16,color:"#0c0e1a",flexShrink:0}}>T</div>
          <div className="nav-label" style={{lineHeight:1.2}}>
            <div style={{fontWeight:800,fontSize:13,color:"#e2ddd4"}}>TitovStroy</div>
            <div style={{fontSize:10,color:"#454560"}}>{currentUser.name}</div>
          </div>
        </div>
        {/* Nav */}
        <nav style={{flex:1,padding:"10px 0",overflowY:"auto"}}>
          {NAV_ITEMS.map(item=>(
            <div key={item.id} className={"nav-item"+(screen===item.id||(!["dashboard","list","contracts"].includes(screen)&&item.id==="list")?"":"")+((screen===item.id||(screen==="editor"&&item.id==="list"))?" active":"")}
              onClick={()=>{ if(item.id==="admin"){setShowAdmin(true);}else if(item.id==="analytics"){setScreen("analytics");}else{setScreen(item.id);} }}>
              <span style={{fontSize:18,flexShrink:0,lineHeight:1}}>{item.icon}</span>
              <span className="nav-label" style={{color:screen===item.id||(screen==="editor"&&item.id==="list")?"#b8904a":"#888"}}>{item.label}</span>
            </div>
          ))}
        </nav>
        {/* Collapse + Выйти */}
        <div style={{borderTop:"1px solid #161929",padding:"10px 0"}}>
          <div className="nav-item" onClick={()=>{ try{localStorage.removeItem(SESSION_KEY);}catch(e){} setCurrentUser(null); }}>
            <span style={{fontSize:16,flexShrink:0}}>🚪</span>
            <span className="nav-label" style={{color:"#555575",fontSize:12}}>Выйти</span>
          </div>
          <div className="nav-item" onClick={()=>setSideCollapsed(p=>!p)} style={{justifyContent:"center",marginTop:4}}>
            <span style={{fontSize:13,color:"#333350"}}>{sideCollapsed?"▶":"◀"}</span>
          </div>
        </div>
      </div>

      {/* ── МОБИЛЬНАЯ НАВИГАЦИЯ ── */}
      <div className="mob-nav">
        {NAV_ITEMS.map(item=>(
          <div key={item.id} className={"mob-nav-item"+(screen===item.id||(screen==="editor"&&item.id==="list")?" active":"")}
            onClick={()=>{ if(item.id==="admin"){setShowAdmin(true);}else if(item.id==="analytics"){setScreen("analytics");}else{setScreen(item.id);} }}>
            <span style={{fontSize:20}}>{item.icon}</span>
            <span style={{fontSize:9,color:screen===item.id||(screen==="editor"&&item.id==="list")?"#b8904a":"#454560",fontWeight:600}}>{item.label}</span>
          </div>
        ))}
      </div>

      {/* ── КОНТЕНТ ── */}
      <div className={"sidebar-content"+(sideCollapsed?" collapsed":"")}>

      {/* ═══════════════════════════════════════════════════════════════════
          ЭКРАН 0: ДАШБОРД
      ═══════════════════════════════════════════════════════════════════ */}
      {screen === "dashboard" && (()=>{
        const thisMonth = new Date().getMonth();
        const thisYear = new Date().getFullYear();
        const estimatesThisMonth = estimates.filter(e=>{ const d=new Date(e.updatedAt||e.createdAt||0); return d.getMonth()===thisMonth&&d.getFullYear()===thisYear; });
        const contractsThisMonth = contracts.filter(c=>{ const d=new Date(c.date||0); return d.getMonth()===thisMonth&&d.getFullYear()===thisYear; });
        const clientsThisMonth = contractClients.filter(c=>{ const d=new Date(c.createdAt||0); return c.createdAt && d.getMonth()===thisMonth&&d.getFullYear()===thisYear; });
        const newClientsCount = clientsThisMonth.length;
        const totalSumMonth = estimatesThisMonth.filter(e=>(e.total||0)>0).reduce((s,e)=> s + (e.total||0), 0);
        const recentContracts = [...contracts].filter(c=>(c.works||[]).reduce((s,w)=>s+(w.quantity*w.price||0),0)>0).sort((a,b)=>Number(b.id||0)-Number(a.id||0)).slice(0,5);
        const recentEstimates = [...estimates].filter(e=>(e.total||0)>0).sort((a,b)=>(b.updatedAt||b.createdAt||0)-(a.updatedAt||a.createdAt||0)).slice(0,5);
        return (
        <div style={{maxWidth:960,margin:"0 auto",padding:"28px 24px 80px"}}>
          {/* Заголовок */}
          <div style={{marginBottom:32,display:"flex",alignItems:"flex-end",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
            <div>
              <h1 style={{margin:0,fontSize:26,fontWeight:900,color:"#e2ddd4",letterSpacing:-.5}}>
                TitovStroy <span style={{color:"#b8904a"}}>CRM</span>
              </h1>
              <div style={{fontSize:12,color:"#454560",marginTop:6}}>
                {new Date().toLocaleDateString("ru-RU",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}
                {" · "}<span style={{color:"#b8904a"}}>{currentUser.role==="admin"?"👑 Администратор":currentUser.role==="viewer"?"👁 Просмотр":"👤 "+currentUser.name}</span>
              </div>
            </div>
            {saving && <span style={{fontSize:11,color:"#555575"}}>💾 Сохранение...</span>}
          </div>

          {/* Статы */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:10,marginBottom:32}}>
            {[
              {label:"Смет за месяц",    value:estimatesThisMonth.filter(e=>(e.total||0)>0).length,  sub:"из "+estimates.filter(e=>(e.total||0)>0).length+" с суммой всего", color:"#8888cc"},
              {label:"Договоров за месяц",value:contractsThisMonth.filter(c=>(c.works||[]).reduce((s,w)=>s+(w.quantity*w.price||0),0)>0).length, sub:"из "+contracts.filter(c=>(c.works||[]).reduce((s,w)=>s+(w.quantity*w.price||0),0)>0).length+" с суммой всего", color:"#b8904a"},
              {label:"Объём за месяц",   value:fmt(Math.round(totalSumMonth))+" ₸", sub:"сумма смет за месяц",                          color:"#4caf7d"},
              {label:"Клиентов за месяц",value:clientsThisMonth.length,    sub:"из "+contractClients.length+" всего", color:"#4285f4"},
            ].map((s,i)=>(
              <div key={i} style={{background:"#0f1120",border:"1px solid #161929",borderRadius:13,padding:"18px 18px 16px",position:"relative",overflow:"hidden"}}>
                <div style={{position:"absolute",top:0,left:0,width:3,height:"100%",background:s.color,borderRadius:"3px 0 0 3px"}}/>
                <div style={{fontSize:10,color:"#454560",textTransform:"uppercase",letterSpacing:.8,marginBottom:10}}>{s.label}</div>
                <div style={{fontSize:30,fontWeight:900,color:s.color,lineHeight:1,marginBottom:6}}>{s.value}</div>
                {s.sub && <div style={{fontSize:11,color:"#333350"}}>{s.sub}</div>}
              </div>
            ))}
          </div>

          {/* Разделы */}
          <div style={{fontSize:10,color:"#333350",textTransform:"uppercase",letterSpacing:1.2,marginBottom:12,fontWeight:700}}>Разделы</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:12,marginBottom:36}}>
            {[
              {id:"list",      icon:"📋",title:"Сметы",      desc:"Расчёт и архив смет",    stat:estimates.length+" смет",      color:"#8888cc",bg:"rgba(136,136,204,.07)",border:"rgba(136,136,204,.2)"},
              {id:"contracts", icon:"📄",title:"Договора",   desc:"Договора и соглашения",  stat:contracts.length+" договоров", color:"#b8904a",bg:"rgba(184,144,74,.07)",  border:"rgba(184,144,74,.2)"},
              {id:"analytics", icon:"📊",title:"Аналитика",  desc:"Статистика и отчёты",    stat:"За "+new Date().toLocaleDateString("ru-RU",{month:"long"}), color:"#4285f4",bg:"rgba(66,133,244,.07)",   border:"rgba(66,133,244,.2)"},
            ].map(card=>(
              <div key={card.id} onClick={()=>{ if(card.id==="analytics") setScreen("analytics"); else setScreen(card.id); }}
                style={{background:card.bg,border:`1px solid ${card.border}`,borderRadius:14,padding:"22px 20px",cursor:"pointer",transition:"transform .15s,box-shadow .15s"}}
                onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow=`0 10px 30px ${card.border}`;}}
                onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="none";}}>
                <div style={{fontSize:30,marginBottom:12}}>{card.icon}</div>
                <div style={{fontWeight:700,fontSize:15,color:"#e2ddd4",marginBottom:5}}>{card.title}</div>
                <div style={{fontSize:12,color:"#555575",marginBottom:14}}>{card.desc}</div>
                <div style={{display:"inline-block",background:card.bg,border:`1px solid ${card.border}`,color:card.color,borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:600}}>{card.stat}</div>
              </div>
            ))}
          </div>

          {/* Лента активности */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",gap:16}}>
            {/* Последние сметы */}
            {recentEstimates.length>0 && (
              <div>
                <div style={{fontSize:10,color:"#333350",textTransform:"uppercase",letterSpacing:1.2,marginBottom:12,fontWeight:700,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span>Последние сметы</span>
                  <span onClick={()=>setScreen("list")} style={{color:"#8888cc",cursor:"pointer",textTransform:"none",fontSize:11,letterSpacing:0}}>все →</span>
                </div>
                <div style={{background:"#0f1120",border:"1px solid #161929",borderRadius:12,overflow:"hidden"}}>
                  {recentEstimates.map((est,i,arr)=>{
                    const total = est.total || 0;
                    return (
                      <div key={est.id} onClick={()=>openEstimate(est)}
                        style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderBottom:i<arr.length-1?"1px solid #161929":"none",cursor:"pointer",transition:"background .1s"}}
                        onMouseEnter={e=>e.currentTarget.style.background="#14172a"}
                        onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                        <div style={{width:7,height:7,borderRadius:"50%",background:"#8888cc",flexShrink:0}}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,color:"#e2ddd4",fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{est.proj?.name||"Без названия"}</div>
                          <div style={{fontSize:11,color:"#454560",marginTop:2}}>{est.updatedAt?new Date(est.updatedAt).toLocaleDateString("ru-RU"):""}</div>
                        </div>
                        {total>0 && <div style={{fontSize:13,fontWeight:700,color:"#b8904a",flexShrink:0}}>{fmt(total)} ₸</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {/* Последние договора */}
            {recentContracts.length>0 && (
              <div>
                <div style={{fontSize:10,color:"#333350",textTransform:"uppercase",letterSpacing:1.2,marginBottom:12,fontWeight:700,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span>Последние договора</span>
                  <span onClick={()=>setScreen("contracts")} style={{color:"#b8904a",cursor:"pointer",textTransform:"none",fontSize:11,letterSpacing:0}}>все →</span>
                </div>
                <div style={{background:"#0f1120",border:"1px solid #161929",borderRadius:12,overflow:"hidden"}}>
                  {recentContracts.map((c,i,arr)=>{
                    const cl = contractClients.find(x=>x.id===c.clientId);
                    const total = (c.works||[]).reduce((s,w)=>s+(w.quantity*w.price||0),0);
                    const TYPE_L = {repair_fiz:"Договор ремонта",annex:"Приложение",design:"Дизайн",design_add:"Доп. дизайн",reservation:"Бронь"};
                    return (
                      <div key={c.id} onClick={()=>{ setCurrentContract({...c}); setContractTab("editor"); setScreen("contracts"); }}
                        style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderBottom:i<arr.length-1?"1px solid #161929":"none",cursor:"pointer",transition:"background .1s"}}
                        onMouseEnter={e=>e.currentTarget.style.background="#14172a"}
                        onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                        <div style={{width:7,height:7,borderRadius:"50%",background:"#b8904a",flexShrink:0}}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,color:"#e2ddd4",fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{TYPE_L[c.type||"repair_fiz"]||"Договор"} №{c.number||"—"}</div>
                          <div style={{fontSize:11,color:"#454560",marginTop:2}}>{cl?.name||c.estClient||"Клиент не выбран"}</div>
                        </div>
                        {total>0 && <div style={{fontSize:13,fontWeight:700,color:"#b8904a",flexShrink:0}}>{fmt(total)} ₸</div>}
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
              <button className="btn btn-o" style={{padding:"6px 9px",fontSize:14}} onClick={()=>setScreen("analytics")} title="Статистика">📊</button>
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
                    </div>
                    {/* Фильтр по статусу */}
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      <button onClick={()=>setListFilterStatus("")}
                        style={{background:!listFilterStatus?"rgba(255,255,255,.08)":"rgba(255,255,255,.04)",color:!listFilterStatus?"#e2ddd4":"#555575",border:`1px solid ${!listFilterStatus?"rgba(255,255,255,.15)":"#1c2035"}`,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                        Все статусы
                      </button>
                      {STATUSES.map(s=>(
                        <button key={s.key} onClick={()=>setListFilterStatus(s.key)}
                          style={{background:listFilterStatus===s.key?s.bg:"rgba(255,255,255,.04)",color:listFilterStatus===s.key?s.color:"#555575",border:`1px solid ${listFilterStatus===s.key?s.color:"#1c2035"}`,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                          {s.label}
                        </button>
                      ))}
                    </div>
                    {/* Фильтр по сотруднику */}
                    {allUsers.filter(u=>u.role!=="viewer").length > 1 && (
                      <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                        <button onClick={()=>setListFilterManager("")}
                          style={{background:!listFilterManager?"rgba(136,136,204,.2)":"rgba(255,255,255,.04)",color:!listFilterManager?"#8888cc":"#555575",border:`1px solid ${!listFilterManager?"rgba(136,136,204,.4)":"#1c2035"}`,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                          Все сотрудники
                        </button>
                        {allUsers.filter(u=>u.role!=="viewer").map(u=>(
                          <button key={u.id} onClick={()=>setListFilterManager(u.name)}
                            style={{background:listFilterManager===u.name?"rgba(136,136,204,.2)":"rgba(255,255,255,.04)",color:listFilterManager===u.name?"#8888cc":"#555575",border:`1px solid ${listFilterManager===u.name?"rgba(136,136,204,.4)":"#1c2035"}`,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                            👤 {u.name}
                          </button>
                        ))}
                      </div>
                    )}
                    <div style={{display:"flex",gap:6,alignItems:"center"}}>
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
                    .filter(e => !listFilterManager || (e.proj?.manager||e.createdBy||"")=== listFilterManager)
                    .filter(e => !listFilterStatus || (e.status||"new") === listFilterStatus)
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
                            {/* Строка 1: имя + сумма */}
                            <div style={{display:"flex",alignItems:"center",gap:8}}>
                              {(() => { const s=STATUSES.find(x=>x.key===(est.status||"new"))||STATUSES[0]; return <span style={{fontSize:10,fontWeight:700,color:s.color,background:s.bg,borderRadius:4,padding:"1px 7px",flexShrink:0,whiteSpace:"nowrap"}}>{s.label}</span>; })()}
                              <span style={{fontWeight:700,fontSize:14,color:"#e2ddd4",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                                {est.proj?.name || <span style={{color:"#454560",fontStyle:"italic"}}>Без названия</span>}
                              </span>
                              {est.total>0
                                ? <span style={{fontSize:14,fontWeight:800,color:"#b8904a",flexShrink:0}}>{fmt(est.total)} ₸</span>
                                : <span style={{fontSize:11,color:"#454560",fontStyle:"italic",flexShrink:0}}>черновик</span>}
                            </div>
                            {est.comment&&<div style={{fontSize:11,color:"#555575",marginTop:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>💬 {est.comment}</div>}
                            {/* Строка 2: мета + дата + кнопки */}
                            <div style={{display:"flex",alignItems:"center",gap:6,marginTop:5}} onClick={e=>e.stopPropagation()}>
                              <span style={{fontSize:11,color:"#555575",background:"rgba(255,255,255,.04)",borderRadius:4,padding:"1px 6px"}}>{est.proj?.type||"—"}</span>
                              {est.proj?.area&&<span style={{fontSize:11,color:"#454560"}}>{est.proj.area} м²</span>}
                              {est.proj?.address&&<span style={{fontSize:11,color:"#404058",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:160}}>{est.proj.address}</span>}
                              <span style={{flex:1}}/>
                              <span style={{fontSize:10,color:"#353550",whiteSpace:"nowrap"}}>{fmtDate(est.updatedAt)}</span>
                              {author&&<span style={{fontSize:10,color:"#353550",whiteSpace:"nowrap"}}>· {author}</span>}
                              <button onClick={()=>exportJSON(est)} title="Экспорт JSON"
                                style={{background:"rgba(74,175,125,.08)",color:"#4caf7d",border:"1px solid rgba(74,175,125,.15)",borderRadius:4,padding:"2px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>
                                📥
                              </button>
                              <button onClick={()=>{
                                const catalog = getEffectiveCatalog();
                                const works = Object.entries(est.rows||{}).filter(([,r])=>Number(r?.qty)>0).map(([key,r])=>{
                                  const w = catalog.find(x=>x.name===key)||catalog.find(x=>x.code===key);
                                  if(!w) return null;
                                  const qty = Number(r.qty||0);
                                  const price = getPrice(w,qty,r.complexity||"std");
                                  return {name:w.name,category:w.cat||"",subcategory:w.sub||"",quantity:qty,unit:w.unit||"м²",price:price?Math.round(price):0};
                                }).filter(Boolean);
                                const newContract = {id:Date.now().toString(),number:"",date:new Date().toISOString().split("T")[0],clientId:"",contragentId:contragents[0]?.id||"",works,appendix:1,estId:est.id,estClient:est.proj?.name||"",estPhone:est.proj?.phone||"",estAddress:est.proj?.address||"",note:""};
                                setCurrentContract(newContract);
                                setContractTab("editor");
                                setScreen("contracts");
                              }} title="Создать договор"
                                style={{background:"rgba(184,144,74,.08)",color:"#b8904a",border:"1px solid rgba(184,144,74,.2)",borderRadius:4,padding:"2px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>
                                📄
                              </button>
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
                      {proj.area&&Number(proj.area)>0&&(
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:6,padding:"5px 8px",background:"rgba(184,144,74,.07)",borderRadius:6}}>
                          <span style={{fontSize:11,color:"#6060a0"}}>Цена за м²</span>
                          <span style={{fontSize:13,fontWeight:700,color:"#b8904a"}}>≈ {fmt(final/Number(proj.area))} ₸</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
                {/* Статус сметы */}
                <div className="card" style={{padding:14}}>
                  <div style={{fontSize:10,color:"#353550",fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",marginBottom:8}}>Статус</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {STATUSES.map(s=>(
                      <button key={s.key} onClick={()=>setEstStatus(s.key)}
                        style={{fontSize:11,fontWeight:700,padding:"4px 12px",borderRadius:6,cursor:"pointer",fontFamily:"inherit",border:`1px solid ${estStatus===s.key?s.color:"rgba(255,255,255,.08)"}`,background:estStatus===s.key?s.bg:"transparent",color:estStatus===s.key?s.color:"#454560",transition:"all .15s"}}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Комментарий для менеджера */}
                <div className="card" style={{padding:14}}>
                  <div style={{fontSize:10,color:"#353550",fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",marginBottom:7}}>Комментарий</div>
                  <textarea className="fi" rows={2} style={{resize:"none"}} placeholder="Заметка для менеджера..." value={estComment} onChange={e=>setEstComment(e.target.value)}/>
                </div>
                <div className="card" style={{padding:14}}>
                  <div style={{fontSize:10,color:"#353550",fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",marginBottom:7}}>Примечание в КП</div>
                  <textarea className="fi" rows={3} style={{resize:"none"}} placeholder="Доп. условия для клиента..." value={note} onChange={e=>setNote(e.target.value)}/>
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
                const css = [
                  "@import url('https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700;900&display=swap');",
                  "*{box-sizing:border-box;margin:0;padding:0}",
                  "body{font-family:'Golos Text','Segoe UI',sans-serif;background:#f5f2ec;color:#1a1a28;padding:24px;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact}",
                  "table{width:100%;border-collapse:collapse}",
                  "@page{margin:8mm;size:A4 portrait}",
                  "@media print{.no-print{display:none!important}body{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}}"
                ].join(" ");
                const html = "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>КП TitovStroy</title><style>" + css + "</style></head><body>" + el.innerHTML + "<div class=\"no-print\" style=\"margin-top:24px;text-align:center\"><button onclick=\"window.print()\" style=\"padding:12px 32px;background:#b8904a;color:#fff;border:none;border-radius:8px;font-size:15px;cursor:pointer;font-weight:700;font-family:inherit\">🖨 Сохранить PDF</button></div></body></html>";
                const blob = new Blob([html], {type:"text/html"});
                const url = URL.createObjectURL(blob);
                window.open(url, "_blank");
                setTimeout(()=>URL.revokeObjectURL(url), 10000);
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

      {/* ═══════════════════ СТАТИСТИКА ═══════════════════ */}
      {screen === "analytics" && (()=>{
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
        const inRange = (ts) => (ts||0) >= fromTs && (ts||0) <= toTs;
        const baseEst = estimates
          .filter(e => inRange(e.updatedAt||e.createdAt||0))
          .filter(e => !statsManager || (e.proj?.manager||"")=== statsManager);
        const baseCon = contracts
          .filter(c => inRange(new Date(c.date||0).getTime()))
          .filter(c => (c.works||[]).reduce((s,w)=>s+(w.quantity*w.price||0),0)>0)
          .filter(c => !statsManager || (c.manager||"")=== statsManager);
        const totalEst = baseEst.length;
        const withSumEst = baseEst.filter(e=>e.total>0);
        const totalSumEst = withSumEst.reduce((s,e)=>s+e.total,0);
        const avgEst = withSumEst.length ? Math.round(totalSumEst/withSumEst.length) : 0;
        const totalCon = baseCon.length;
        const totalSumCon = baseCon.reduce((s,c)=>s+(c.works||[]).reduce((ss,w)=>ss+(w.quantity*w.price||0),0),0);
        const avgCon = totalCon ? Math.round(totalSumCon/totalCon) : 0;
        const byStatus = {}; for(const s of STATUSES) byStatus[s.key]=baseEst.filter(e=>(e.status||"new")===s.key).length;
        const byType = {}; for(const e of baseEst){ const t=e.proj?.type||"—"; byType[t]=(byType[t]||0)+1; }
        const catSums = {};
        for(const e of baseEst){
          const items = e.rows ? Object.entries(e.rows).filter(([,r])=>Number(r?.qty)>0) : [];
          for(const [code,] of items){ const w=getEffectiveCatalog().find(x=>x.code===code); if(w){catSums[w.cat]=(catSums[w.cat]||0)+1;} }
        }
        const topCats = Object.entries(catSums).sort((a,b)=>b[1]-a[1]).slice(0,5);
        const validManagerNames = new Set(allUsers.filter(u=>u.role!=="viewer").map(u=>u.name));
        const managers = [...new Set(estimates.map(e=>e.proj?.manager||"").filter(m=>m&&validManagerNames.has(m)))];
        const managerStats = managers.map(m=>{
          const mes = baseEst.filter(e=>(e.proj?.manager||"")===m);
          return {name:m, count:mes.length, sum:mes.filter(e=>e.total>0).reduce((s,e)=>s+e.total,0), agreed:mes.filter(e=>e.status==="agreed").length};
        }).sort((a,b)=>b.sum-a.sum);
        const TYPE_L = {repair_fiz:"Договор ремонта",annex:"Приложение",design:"Дизайн-проект",design_add:"Доп. соглашение",reservation:"Бронирование"};
        const byConType = {}; for(const c of baseCon){ const t=TYPE_L[c.type||"repair_fiz"]||"—"; byConType[t]=(byConType[t]||0)+1; }
        const PERIOD_BTNS = [["all","Всё время"],["month","Месяц"],["3month","3 месяца"],["week","Неделя"],["custom","Вручную"]];
        return (
          <div style={{maxWidth:900,margin:"0 auto",padding:"28px 24px 80px"}}>
            {/* Заголовок */}
            <div style={{marginBottom:24,display:"flex",alignItems:"center",gap:12}}>
              <div>
                <h1 style={{margin:0,fontSize:22,fontWeight:900,color:"#e2ddd4"}}>📊 Аналитика</h1>
                <div style={{fontSize:12,color:"#454560",marginTop:4}}>Статистика по сметам и договорам</div>
              </div>
            </div>

            {/* Период */}
            <div style={{background:"#0f1120",border:"1px solid #161929",borderRadius:12,padding:"16px 18px",marginBottom:20}}>
              <div style={{fontSize:10,color:"#454560",textTransform:"uppercase",letterSpacing:1,marginBottom:10,fontWeight:700}}>Период</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom: statsPeriod==="custom"?12:0}}>
                {PERIOD_BTNS.map(([k,l])=>(
                  <button key={k} onClick={()=>setStatsPeriod(k)}
                    style={{fontSize:12,fontWeight:600,padding:"5px 14px",borderRadius:7,cursor:"pointer",fontFamily:"inherit",
                      border:`1px solid ${statsPeriod===k?"#b8904a":"rgba(255,255,255,.08)"}`,
                      background:statsPeriod===k?"rgba(184,144,74,.15)":"transparent",
                      color:statsPeriod===k?"#b8904a":"#555575"}}>
                    {l}
                  </button>
                ))}
              </div>
              {statsPeriod==="custom" && (
                <div style={{display:"flex",gap:10,alignItems:"center",marginTop:10,flexWrap:"wrap"}}>
                  <div>
                    <div style={{fontSize:10,color:"#555575",marginBottom:4}}>С</div>
                    <input type="date" className="fi" style={{width:"auto"}} value={statsDateFrom} onChange={e=>setStatsDateFrom(e.target.value)}/>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:"#555575",marginBottom:4}}>По</div>
                    <input type="date" className="fi" style={{width:"auto"}} value={statsDateTo} onChange={e=>setStatsDateTo(e.target.value)}/>
                  </div>
                </div>
              )}
            </div>

            {/* Менеджеры */}
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:20}}>
              <button onClick={()=>setStatsManager("")}
                style={{fontSize:12,fontWeight:600,padding:"5px 14px",borderRadius:7,cursor:"pointer",fontFamily:"inherit",
                  border:`1px solid ${!statsManager?"#8888cc":"rgba(255,255,255,.08)"}`,
                  background:!statsManager?"rgba(136,136,204,.15)":"transparent",
                  color:!statsManager?"#8888cc":"#555575"}}>🏢 Компания</button>
              {managers.map(m=>(
                <button key={m} onClick={()=>setStatsManager(m)}
                  style={{fontSize:12,fontWeight:600,padding:"5px 14px",borderRadius:7,cursor:"pointer",fontFamily:"inherit",
                    border:`1px solid ${statsManager===m?"#8888cc":"rgba(255,255,255,.08)"}`,
                    background:statsManager===m?"rgba(136,136,204,.15)":"transparent",
                    color:statsManager===m?"#8888cc":"#555575"}}>👤 {m}</button>
              ))}
            </div>

            {/* Две колонки: Сметы + Договора */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(380px,1fr))",gap:16,marginBottom:20}}>

              {/* ── СМЕТЫ ── */}
              <div style={{background:"#0f1120",border:"1px solid #161929",borderRadius:12,padding:"18px"}}>
                <div style={{fontSize:11,color:"#8888cc",textTransform:"uppercase",letterSpacing:1,fontWeight:700,marginBottom:14}}>📋 Сметы</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:16}}>
                  {[["Смет",totalEst,"#8888cc"],["Объём",fmt(totalSumEst)+" ₸","#b8904a"],["Средний чек",fmt(avgEst)+" ₸","#4caf7d"]].map(([l,v,c])=>(
                    <div key={l} style={{background:"rgba(255,255,255,.03)",borderRadius:8,padding:"10px 8px",textAlign:"center"}}>
                      <div style={{fontSize:16,fontWeight:800,color:c,lineHeight:1.2}}>{v}</div>
                      <div style={{fontSize:10,color:"#454560",marginTop:3}}>{l}</div>
                    </div>
                  ))}
                </div>
                {/* По статусам */}
                <div style={{fontSize:10,color:"#333350",textTransform:"uppercase",letterSpacing:1,marginBottom:8,fontWeight:700}}>По статусам</div>
                <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:14}}>
                  {STATUSES.map(s=>(
                    <div key={s.key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 8px",background:"rgba(255,255,255,.02)",borderRadius:5}}>
                      <span style={{fontSize:12,color:s.color,fontWeight:600}}>{s.label}</span>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{width:60,height:3,background:"rgba(255,255,255,.06)",borderRadius:2,overflow:"hidden"}}>
                          <div style={{width:totalEst?`${(byStatus[s.key]/totalEst)*100}%`:"0%",height:"100%",background:s.color,borderRadius:2}}/>
                        </div>
                        <span style={{fontSize:12,fontWeight:700,color:"#e2ddd4",minWidth:16,textAlign:"right"}}>{byStatus[s.key]}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {/* По типу объекта */}
                {Object.keys(byType).length>0 && (
                  <>
                    <div style={{fontSize:10,color:"#333350",textTransform:"uppercase",letterSpacing:1,marginBottom:8,fontWeight:700}}>По типу объекта</div>
                    <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                      {Object.entries(byType).sort((a,b)=>b[1]-a[1]).map(([t,n])=>(
                        <span key={t} style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:"rgba(255,255,255,.05)",color:"#8888aa"}}>{t}: <strong style={{color:"#e2ddd4"}}>{n}</strong></span>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* ── ДОГОВОРА ── */}
              <div style={{background:"#0f1120",border:"1px solid #161929",borderRadius:12,padding:"18px"}}>
                <div style={{fontSize:11,color:"#b8904a",textTransform:"uppercase",letterSpacing:1,fontWeight:700,marginBottom:14}}>📄 Договора</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:16}}>
                  {[["Договоров",totalCon,"#b8904a"],["Объём",fmt(totalSumCon)+" ₸","#4caf7d"],["Средний",fmt(avgCon)+" ₸","#4285f4"]].map(([l,v,c])=>(
                    <div key={l} style={{background:"rgba(255,255,255,.03)",borderRadius:8,padding:"10px 8px",textAlign:"center"}}>
                      <div style={{fontSize:16,fontWeight:800,color:c,lineHeight:1.2}}>{v}</div>
                      <div style={{fontSize:10,color:"#454560",marginTop:3}}>{l}</div>
                    </div>
                  ))}
                </div>
                {/* По типам договоров */}
                {Object.keys(byConType).length>0 && (
                  <>
                    <div style={{fontSize:10,color:"#333350",textTransform:"uppercase",letterSpacing:1,marginBottom:8,fontWeight:700}}>По типам</div>
                    <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:14}}>
                      {Object.entries(byConType).sort((a,b)=>b[1]-a[1]).map(([t,n])=>(
                        <div key={t} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 8px",background:"rgba(255,255,255,.02)",borderRadius:5}}>
                          <span style={{fontSize:12,color:"#aaa"}}>{t}</span>
                          <span style={{fontSize:12,fontWeight:700,color:"#b8904a"}}>{n}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {/* Последние договора в периоде */}
                {baseCon.length>0 && (
                  <>
                    <div style={{fontSize:10,color:"#333350",textTransform:"uppercase",letterSpacing:1,marginBottom:8,fontWeight:700}}>Договора в периоде</div>
                    <div style={{display:"flex",flexDirection:"column",gap:3}}>
                      {[...baseCon].sort((a,b)=>Number(b.id||0)-Number(a.id||0)).slice(0,5).map(c=>{
                        const cl = contractClients.find(x=>x.id===c.clientId);
                        const sum = (c.works||[]).reduce((s,w)=>s+(w.quantity*w.price||0),0);
                        return (
                          <div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 8px",background:"rgba(255,255,255,.02)",borderRadius:5,cursor:"pointer"}}
                            onClick={()=>{ setCurrentContract({...c}); setContractTab("editor"); setScreen("contracts"); }}>
                            <div style={{minWidth:0}}>
                              <div style={{fontSize:12,color:"#e2ddd4",fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{TYPE_L[c.type||"repair_fiz"]} №{c.number||"—"}</div>
                              <div style={{fontSize:10,color:"#454560"}}>{cl?.name||c.estClient||"—"}</div>
                            </div>
                            <span style={{fontSize:12,fontWeight:700,color:"#b8904a",flexShrink:0,marginLeft:8}}>{fmt(sum)} ₸</span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
                {totalCon===0 && <div style={{textAlign:"center",color:"#353550",fontSize:13,padding:"20px 0"}}>Нет договоров за период</div>}
              </div>
            </div>

            {/* По менеджерам */}
            {!statsManager && managerStats.length>0 && (
              <div style={{background:"#0f1120",border:"1px solid #161929",borderRadius:12,padding:"18px"}}>
                <div style={{fontSize:10,color:"#454560",textTransform:"uppercase",letterSpacing:1,fontWeight:700,marginBottom:12}}>По менеджерам</div>
                <div style={{display:"flex",flexDirection:"column",gap:5}}>
                  {managerStats.map(m=>(
                    <div key={m.name} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",background:"rgba(255,255,255,.03)",borderRadius:7,cursor:"pointer"}}
                      onClick={()=>setStatsManager(m.name)}>
                      <span style={{fontSize:13,color:"#aaa",flex:1}}>👤 {m.name}</span>
                      <span style={{fontSize:11,color:"#555575"}}>{m.count} смет</span>
                      <span style={{fontSize:13,fontWeight:700,color:"#b8904a"}}>{fmt(m.sum)} ₸</span>
                      {m.agreed>0&&<span style={{fontSize:10,color:"#4caf7d",background:"rgba(76,175,125,.1)",borderRadius:4,padding:"2px 8px"}}>✓{m.agreed}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Топ категорий */}
            {topCats.length>0 && (
              <div style={{background:"#0f1120",border:"1px solid #161929",borderRadius:12,padding:"18px",marginTop:16}}>
                <div style={{fontSize:10,color:"#454560",textTransform:"uppercase",letterSpacing:1,fontWeight:700,marginBottom:12}}>Топ категорий работ</div>
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  {topCats.map(([cat,n])=>(
                    <div key={cat} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"6px 10px",background:"rgba(255,255,255,.03)",borderRadius:6}}>
                      <span style={{color:"#888"}}>{cat}</span>
                      <span style={{fontWeight:700,color:"#b8904a"}}>{n} смет</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {totalEst===0&&totalCon===0&&<div style={{textAlign:"center",color:"#353550",fontSize:13,padding:"40px 0"}}>Нет данных за выбранный период</div>}
          </div>
        );
      })()}

      {/* ═══════════════════════════════════════════════════════════════════
          ЭКРАН 3: ДОГОВОРЫ
      ═══════════════════════════════════════════════════════════════════ */}
      {screen === "contracts" && (
        <div style={{maxWidth:860,margin:"0 auto",padding:"0 0 40px",minHeight:"100vh"}}>
          {/* Шапка */}
          <div style={{background:"#0e1122",borderBottom:"1px solid #181c2e",padding:"12px 20px",display:"flex",alignItems:"center",gap:10,position:"sticky",top:0,zIndex:10}}>
            <button onClick={()=>setScreen("dashboard")} style={{background:"none",border:"none",color:"#555575",cursor:"pointer",fontSize:20,lineHeight:1,padding:"0 4px"}}>←</button>
            <div style={{width:28,height:28,borderRadius:6,background:"linear-gradient(135deg,#b8904a,#d4a85a)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:13,color:"#0c0e1a"}}>T</div>
            <div style={{fontWeight:800,fontSize:14,color:"#e2ddd4"}}>Договоры</div>
            <div style={{flex:1}}/>
            {contractTab === "list" && currentUser.role !== "viewer" && (
              <button className="btn btn-g" style={{fontSize:12,padding:"7px 14px"}} onClick={()=>{ setCurrentContract({id:Date.now().toString(),number:"",date:new Date().toISOString().split("T")[0],clientId:"",contragentId:contragents[0]?.id||"",works:[],appendix:1,note:""}); setContractTab("editor"); }}>+ Новый</button>
            )}
          </div>

          {/* Табы */}
          <div style={{display:"flex",gap:4,padding:"12px 20px 0",borderBottom:"1px solid #181c2e",background:"#0e1122"}}>
            {[["list","📋 Список"],["clients","👥 Клиенты"],["contragents","🏢 ТОО"]].map(([k,l])=>(
              <button key={k} onClick={()=>setContractTab(k)}
                style={{background:"none",border:"none",borderBottom:`2px solid ${contractTab===k?"#b8904a":"transparent"}`,color:contractTab===k?"#b8904a":"#555575",cursor:"pointer",padding:"8px 14px",fontSize:13,fontWeight:600,fontFamily:"inherit",transition:"all .15s"}}>
                {l}
              </button>
            ))}
          </div>

          <div style={{padding:"20px"}}>

            {/* ── СПИСОК ДОГОВОРОВ ── */}
            {contractTab === "list" && (
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {contracts.length === 0 && (
                  <div style={{textAlign:"center",padding:"60px 0",color:"#454560"}}>
                    <div style={{fontSize:40,marginBottom:12}}>📋</div>
                    <div style={{fontWeight:700,marginBottom:6}}>Договоров пока нет</div>
                    <div style={{fontSize:12}}>Создайте новый или используйте кнопку 📄 на карточке сметы</div>
                  </div>
                )}
                {contracts.map(c=>{
                  const client = contractClients.find(x=>x.id===c.clientId);
                  const ca = contragents.find(x=>x.id===c.contragentId);
                  const total = (c.works||[]).reduce((s,w)=>s+(w.quantity*w.price||0),0);
                  return (
                    <div key={c.id} style={{background:"#111425",border:"1px solid #1c2035",borderRadius:11,padding:"14px 18px",cursor:"pointer",transition:"all .15s"}}
                      onClick={()=>{ setCurrentContract({...c}); setContractTab("editor"); }}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                        <div>
                          <div style={{fontWeight:700,fontSize:14,color:"#e2ddd4"}}>
                            {c.number ? `Договор №${c.number}` : "Без номера"}
                          </div>
                          <div style={{fontSize:12,color:"#555575",marginTop:3}}>
                            {client ? `👤 ${client.name}` : c.estClient ? `👤 ${c.estClient} (не добавлен)` : "Клиент не выбран"}
                            {ca && <span style={{marginLeft:8}}>· {ca.name}</span>}
                          </div>
                          <div style={{fontSize:11,color:"#454560",marginTop:3}}>
                            {new Date(c.date||Date.now()).toLocaleDateString("ru-RU")} · {(c.works||[]).length} позиций
                            {c.manager && <span style={{marginLeft:6,color:"#8888cc"}}>· 👤 {c.manager}</span>}
                          </div>
                        </div>
                        <div style={{textAlign:"right",flexShrink:0}}>
                          <div style={{fontWeight:800,fontSize:16,color:"#b8904a"}}>{fmt(total)} ₸</div>
                          <div style={{display:"flex",gap:5,marginTop:6}}>
                            <button onClick={e=>{e.stopPropagation();
                              const cl = contractClients.find(x=>x.id===c.clientId);
                              const ca2 = contragents.find(x=>x.id===c.contragentId);
                              generateContractPdf(c, cl, ca2);
                            }} style={{background:"rgba(184,144,74,.1)",color:"#b8904a",border:"1px solid rgba(184,144,74,.2)",borderRadius:5,padding:"3px 9px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>📄 PDF</button>
                            <button onClick={e=>{e.stopPropagation();
                              const cl = contractClients.find(x=>x.id===c.clientId);
                              const ca2 = contragents.find(x=>x.id===c.contragentId);
                              generateContractGDoc(c, cl, ca2);
                            }} style={{background:"rgba(66,133,244,.1)",color:"#4285f4",border:"1px solid rgba(66,133,244,.2)",borderRadius:5,padding:"3px 9px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>📋 GDoc</button>
                            {currentUser.role==="admin" && (
                              <button onClick={e=>{e.stopPropagation(); if(window.confirm("Удалить договор?")) saveContracts(contracts.filter(x=>x.id!==c.id));}}
                                style={{background:"rgba(200,60,60,.08)",color:"#c06060",border:"1px solid rgba(200,60,60,.15)",borderRadius:5,padding:"3px 9px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>🗑</button>
                            )}
                          </div>
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
                onBack={()=>setContractTab("list")}
                onSave={async ()=>{
                  const list = contracts.filter(x=>x.id!==currentContract.id);
                  await saveContracts([...list, currentContract]);
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
                currentUserRole={currentUser.role}
                allUsers={allUsers}
                fmt={fmt}
              />
            )}

            {/* ── КЛИЕНТЫ ── */}
            {contractTab === "clients" && (
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{fontWeight:700,color:"#888",fontSize:12}}>КЛИЕНТЫ ({contractClients.length})</div>
                  <button onClick={()=>{ setCurrentContract({id:Date.now().toString(),name:"",phone:"",address:"",iin:"",doc:"",type:"физ",createdAt:Date.now(),_mode:"newClient"}); setContractTab("clientEditor"); }}
                    className="btn btn-g" style={{fontSize:12,padding:"6px 12px"}}>+ Добавить</button>
                </div>
                {contractClients.length===0&&<div style={{textAlign:"center",padding:"40px 0",color:"#454560",fontSize:13}}>Клиентов пока нет</div>}
                {contractClients.map(c=>(
                  <div key={c.id} style={{background:"#111425",border:"1px solid #1c2035",borderRadius:10,padding:"14px 16px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div>
                        <div style={{fontWeight:700,fontSize:14,color:"#e2ddd4"}}>{c.name||"Без имени"}</div>
                        <div style={{fontSize:11,color:"#555575",marginTop:3}}>
                          {c.type==="физ"?"👤 Физ. лицо":"🏢 Юр. лицо"}
                          {c.iin&&<span style={{marginLeft:8}}>ИИН: {c.iin}</span>}
                        </div>
                        {c.phone&&<div style={{fontSize:11,color:"#454560",marginTop:2}}>📞 {c.phone}</div>}
                        {c.address&&<div style={{fontSize:11,color:"#454560",marginTop:2}}>📍 {c.address}</div>}
                      </div>
                      <div style={{display:"flex",gap:5}}>
                        <button onClick={()=>{ setCurrentContract({...c,_mode:"editClient"}); setContractTab("clientEditor"); }}
                          style={{background:"rgba(184,144,74,.1)",color:"#b8904a",border:"1px solid rgba(184,144,74,.2)",borderRadius:5,padding:"3px 9px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>✎</button>
                        {currentUser.role==="admin"&&<button onClick={()=>{ if(window.confirm("Удалить клиента?")) saveContractClients(contractClients.filter(x=>x.id!==c.id)); }}
                          style={{background:"rgba(200,60,60,.08)",color:"#c06060",border:"1px solid rgba(200,60,60,.15)",borderRadius:5,padding:"3px 9px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>🗑</button>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── РЕДАКТОР КЛИЕНТА ── */}
            {contractTab === "clientEditor" && currentContract?._mode?.includes("Client") && (
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <button onClick={()=>setContractTab("clients")} style={{background:"none",border:"none",color:"#555575",cursor:"pointer",fontSize:18}}>←</button>
                  <span style={{fontWeight:700,fontSize:15,color:"#e2ddd4"}}>{currentContract._mode==="newClient"?"Новый клиент":"Редактировать клиента"}</span>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <div>
                    <div style={{fontSize:11,color:"#555575",marginBottom:4}}>Тип</div>
                    <select className="fi" value={currentContract.type||"физ"} onChange={e=>setCurrentContract(p=>({...p,type:e.target.value}))}>
                      <option value="физ">Физ. лицо</option>
                      <option value="юр">Юр. лицо</option>
                    </select>
                  </div>
                  {[
                    ["ФИО / Название организации","name"],
                    ["Телефон","phone"],
                    ["Адрес","address"],
                    ...(currentContract.type==="юр"
                      ? [["БИН","iin"],["Директор (полностью)","director"],["Директор (кратко, напр. Багаутдинов Н.Р.)","directorShort"],["Банк","bank"],["БИК","bik"],["ИИК (номер счёта)","account"],["Почта","email"]]
                      : [["ИИН","iin"],["Документ (уд. личности)","doc"]]
                    )
                  ].map(([label,field])=>(
                    <div key={field}>
                      <div style={{fontSize:11,color:"#555575",marginBottom:4}}>{label}</div>
                      <input className="fi" value={currentContract[field]||""} onChange={e=>setCurrentContract(p=>({...p,[field]:e.target.value}))} placeholder={label}/>
                    </div>
                  ))}
                </div>
                <button className="btn btn-g" onClick={()=>{
                  const {_mode,...clientData} = currentContract;
                  const list = _mode==="newClient" ? [...contractClients,clientData] : contractClients.map(x=>x.id===clientData.id?clientData:x);
                  saveContractClients(list);
                  setContractTab("clients");
                }}>💾 Сохранить</button>
              </div>
            )}

            {/* ── ТОО ── */}
            {contractTab === "contragents" && (
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{fontWeight:700,color:"#888",fontSize:12}}>ТОО / ПОДРЯДЧИКИ ({contragents.length})</div>
                  <button onClick={()=>{ setCurrentContract({id:Date.now().toString(),name:"",bin:"",bank:"",bik:"",account:"",director:"",phone:"",email:"",address:"",_mode:"newCA"}); setContractTab("caEditor"); }}
                    className="btn btn-g" style={{fontSize:12,padding:"6px 12px"}}>+ Добавить</button>
                </div>
                {contragents.map(c=>(
                  <div key={c.id} style={{background:"#111425",border:"1px solid #1c2035",borderRadius:10,padding:"14px 16px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div>
                        <div style={{fontWeight:700,fontSize:14,color:"#e2ddd4"}}>{c.name}</div>
                        <div style={{fontSize:11,color:"#555575",marginTop:2}}>БИН: {c.bin} · {c.bank}</div>
                        <div style={{fontSize:11,color:"#454560",marginTop:2}}>Директор: {c.director} · {c.phone}</div>
                      </div>
                      <div style={{display:"flex",gap:5}}>
                        <button onClick={()=>{ setCurrentContract({...c,_mode:"editCA"}); setContractTab("caEditor"); }}
                          style={{background:"rgba(184,144,74,.1)",color:"#b8904a",border:"1px solid rgba(184,144,74,.2)",borderRadius:5,padding:"3px 9px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>✎</button>
                        {currentUser.role==="admin"&&contragents.length>1&&<button onClick={()=>{ if(window.confirm("Удалить?")) saveContragents(contragents.filter(x=>x.id!==c.id)); }}
                          style={{background:"rgba(200,60,60,.08)",color:"#c06060",border:"1px solid rgba(200,60,60,.15)",borderRadius:5,padding:"3px 9px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>🗑</button>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── РЕДАКТОР ТОО ── */}
            {contractTab === "caEditor" && currentContract?._mode?.includes("CA") && (
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <button onClick={()=>setContractTab("contragents")} style={{background:"none",border:"none",color:"#555575",cursor:"pointer",fontSize:18}}>←</button>
                  <span style={{fontWeight:700,fontSize:15,color:"#e2ddd4"}}>{currentContract._mode==="newCA"?"Новое ТОО":"Редактировать ТОО"}</span>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <div style={{gridColumn:"1/-1"}}>
                    <div style={{fontSize:11,color:"#555575",marginBottom:4}}>Файл печати</div>
                    <select className="fi" value={currentContract.stampFile||"stamp.jpg"} onChange={e=>setCurrentContract(p=>({...p,stampFile:e.target.value}))}>
                      <option value="stamp.jpg">stamp.jpg</option>
                      <option value="stamp2.jpg">stamp2.jpg</option>
                    </select>
                  </div>
                  {[["Название","name"],["БИН","bin"],["Банк","bank"],["БИК","bik"],["Расчётный счёт","account"],["Директор","director"],["Телефон","phone"],["Email","email"],["Адрес","address"]].map(([label,field])=>(
                    <div key={field}>
                      <div style={{fontSize:11,color:"#555575",marginBottom:4}}>{label}</div>
                      <input className="fi" value={currentContract[field]||""} onChange={e=>setCurrentContract(p=>({...p,[field]:e.target.value}))} placeholder={label}/>
                    </div>
                  ))}
                </div>
                <button className="btn btn-g" onClick={()=>{
                  const {_mode,...caData} = currentContract;
                  const list = _mode==="newCA" ? [...contragents,caData] : contragents.map(x=>x.id===caData.id?caData:x);
                  saveContragents(list);
                  setContractTab("contragents");
                }}>💾 Сохранить</button>
              </div>
            )}

          </div>
        </div>
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
