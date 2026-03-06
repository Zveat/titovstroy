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

const EMPTY_PROJ = { name:"", type:"Вторичка", area:"", address:"", phone:"", manager:"Василий Титов" };
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
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24,marginTop:10}}>
        <div>
          <div style={{borderTop:"1px solid #bbb",paddingTop:8,marginTop:20}}/>
          <div style={{fontSize:11,color:"#666"}}>Заказчик / {proj.name||"________________"}</div>
        </div>
        <div>
          <div style={{borderTop:"1px solid #bbb",paddingTop:8,marginTop:20}}/>
          <div style={{fontSize:11,color:"#666"}}>Менеджер / {proj.manager||"Василий Титов"}</div>
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
    setProj({...EMPTY_PROJ, _createdBy: currentUser.name, _createdById: currentUser.id});
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
                {[["Клиент / Объект","name","Иванов — Бухар-Жырау 45",false],
                  ["Тип","type","",true],
                  ["Площадь, м²","area","75",false],
                  ["Менеджер","manager","Василий Титов",false],
                  ["Телефон клиента","phone","+7 707...",false],
                  ["Адрес","address","ул. Бухар-Жырау, 45",false],
                ].map(([lbl,f,ph,isSel])=>(
                  <div key={f}>
                    <div style={{fontSize:10,color:"#353550",marginBottom:4}}>{lbl}</div>
                    {isSel ? (
                      <select className="fi" value={proj.type} onChange={e=>setProj(p=>({...p,type:e.target.value}))}>
                        {OBJ_TYPES.map(t=><option key={t}>{t}</option>)}
                      </select>
                    ):(
                      <input className="fi" placeholder={ph} value={proj[f]} onChange={e=>setProj(p=>({...p,[f]:e.target.value}))}/>
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
