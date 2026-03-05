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
  { code:"CH-EL",      cat:"Черновые", sub:"Электромонтаж",         name:"Составление схемы электрики",                  unit:"шт",   tiers:[] },
  { code:"CH-EL",      cat:"Черновые", sub:"Электромонтаж",         name:"Штробление стен и потолков",                   unit:"м.п.", tiers:[] },
  { code:"CH-EL",      cat:"Черновые", sub:"Электромонтаж",         name:"Прокладка кабелей",                            unit:"м.п.", tiers:[] },
  { code:"CH-EL",      cat:"Черновые", sub:"Электромонтаж",         name:"Установка подрозетников",                      unit:"шт",   tiers:[] },
  { code:"CH-EL",      cat:"Черновые", sub:"Электромонтаж",         name:"Прокладка линий под кондиционер",              unit:"шт",   tiers:[] },
  { code:"CH-EL",      cat:"Черновые", sub:"Электромонтаж",         name:"Монтаж кабеля под интернет/тв",                unit:"шт",   tiers:[] },
  { code:"CH-EL-SH",   cat:"Черновые", sub:"Электрощит",            name:"Сборка электрощита",                           unit:"шт",   tiers:[] },
  { code:"CH-EL-SH",   cat:"Черновые", sub:"Электрощит",            name:"Автоматы, УЗО, дифавтоматы",                   unit:"шт",   tiers:[] },
  { code:"CH-EL-SH",   cat:"Черновые", sub:"Электрощит",            name:"Распределение групп нагрузки",                 unit:"шт",   tiers:[] },
  { code:"CH-EL-OUT",  cat:"Черновые", sub:"Выводы",                name:"Розетки (вывод)",                              unit:"шт",   tiers:[] },
  { code:"CH-EL-OUT",  cat:"Черновые", sub:"Выводы",                name:"Выключатели (вывод)",                          unit:"шт",   tiers:[] },
  { code:"CH-EL-OUT",  cat:"Черновые", sub:"Выводы",                name:"Выводы под светильники",                       unit:"шт",   tiers:[] },
  { code:"CH-SAN",     cat:"Черновые", sub:"Водоснабжение",         name:"Разводка труб холодной и горячей воды",        unit:"м.п.", tiers:[] },
  { code:"CH-SAN",     cat:"Черновые", sub:"Водоснабжение",         name:"Коллекторная система",                         unit:"шт",   tiers:[] },
  { code:"CH-SAN",     cat:"Черновые", sub:"Водоснабжение",         name:"Замена стояков",                               unit:"шт",   tiers:[] },
  { code:"CH-SAN",     cat:"Черновые", sub:"Канализация",           name:"Прокладка канализационных труб",               unit:"м.п.", tiers:[] },
  { code:"CH-SAN",     cat:"Черновые", sub:"Канализация",           name:"Выводы под сантехнику",                        unit:"шт",   tiers:[] },
  { code:"CH-SAN",     cat:"Черновые", sub:"Подготовка санузла",    name:"Ниши под инсталляцию",                         unit:"шт",   tiers:[] },
  { code:"CH-SAN",     cat:"Черновые", sub:"Подготовка санузла",    name:"Перенос точек",                                unit:"шт",   tiers:[] },
  { code:"CH-SAN",     cat:"Черновые", sub:"Подготовка санузла",    name:"Выводы под стиральную/посудомоечные машины",   unit:"шт",   tiers:[] },
  { code:"CH-GID",     cat:"Черновые", sub:"Гидроизоляция",         name:"Гидроизоляция пола (гид.)",                    unit:"м²",   tiers:[] },
  { code:"CH-GID",     cat:"Черновые", sub:"Гидроизоляция",         name:"Поднятие на стены 20–30 см",                   unit:"м²",   tiers:[] },
  { code:"CH-GID",     cat:"Черновые", sub:"Гидроизоляция",         name:"Обработка углов и примыканий",                 unit:"м.п.", tiers:[] },
  { code:"CH-GID",     cat:"Черновые", sub:"Гидроизоляция",         name:"Гидроизоляция под ванной и душем",             unit:"м²",   tiers:[] },
  { code:"CH-GID",     cat:"Черновые", sub:"Гидроизоляция",         name:"Герметизация трубных выводов",                 unit:"шт",   tiers:[] },
  { code:"CH-PREP",    cat:"Черновые", sub:"Подготовка оснований",  name:"Финишная шпаклевка стен",                      unit:"м²",   tiers:[] },
  { code:"CH-PREP",    cat:"Черновые", sub:"Подготовка оснований",  name:"Идеальная плоскость под покраску",             unit:"м²",   tiers:[] },
  { code:"CH-PREP",    cat:"Черновые", sub:"Подготовка оснований",  name:"Подготовка под поклейку обоев",                unit:"м²",   tiers:[] },
  { code:"CH-PREP",    cat:"Черновые", sub:"Подготовка оснований",  name:"Шпаклевка потолка",                            unit:"м²",   tiers:[] },
  { code:"CH-PREP",    cat:"Черновые", sub:"Подготовка оснований",  name:"Подготовка под натяжной потолок",              unit:"м²",   tiers:[] },
  { code:"CH-PREP",    cat:"Черновые", sub:"Подготовка оснований",  name:"Выравнивание перепадов пола",                  unit:"м²",   tiers:[] },
  { code:"CH-PREP",    cat:"Черновые", sub:"Подготовка оснований",  name:"Грунтовка пола",                               unit:"м²",   tiers:[] },
  { code:"CH-PREP",    cat:"Черновые", sub:"Подготовка оснований",  name:"Подготовка под финишное покрытие",             unit:"м²",   tiers:[] },
  { code:"CH-ADD",     cat:"Черновые", sub:"Дополнительно",         name:"Перенос/монтаж новых перегородок",             unit:"м²",   tiers:[] },
  { code:"CH-ADD",     cat:"Черновые", sub:"Дополнительно",         name:"Шумоизоляция стен и потолков",                 unit:"м²",   tiers:[] },
  { code:"CH-ADD",     cat:"Черновые", sub:"Дополнительно",         name:"Утепление лоджий",                             unit:"м²",   tiers:[] },
  { code:"CH-ADD",     cat:"Черновые", sub:"Дополнительно",         name:"Подготовка ниш под освещение",                 unit:"шт",   tiers:[] },
  { code:"CH-ADD",     cat:"Черновые", sub:"Дополнительно",         name:"Короба и конструкции из ГКЛ",                  unit:"м.п.", tiers:[] },
  // ЧИСТОВЫЕ
  { code:"FIN-WALL-OB",  cat:"Чистовые", sub:"Стены — Обои",           name:"Поклейка флизелиновых",                    unit:"м²",   tiers:[] },
  { code:"FIN-WALL-OB",  cat:"Чистовые", sub:"Стены — Обои",           name:"Поклейка виниловых",                       unit:"м²",   tiers:[] },
  { code:"FIN-WALL-OB",  cat:"Чистовые", sub:"Стены — Обои",           name:"Поклейка текстурных",                      unit:"м²",   tiers:[] },
  { code:"FIN-WALL-OB",  cat:"Чистовые", sub:"Стены — Обои",           name:"Поклейка под покраску",                    unit:"м²",   tiers:[] },
  { code:"FIN-WALL-PA",  cat:"Чистовые", sub:"Стены — Покраска",       name:"Нанесение грунта",                         unit:"м²",   tiers:[] },
  { code:"FIN-WALL-PA",  cat:"Чистовые", sub:"Стены — Покраска",       name:"Покраска в 1–3 слоя",                      unit:"м²",   tiers:[] },
  { code:"FIN-WALL-PA",  cat:"Чистовые", sub:"Стены — Покраска",       name:"Окраска откосов и ниш",                    unit:"м.п.", tiers:[] },
  { code:"FIN-WALL-DEC", cat:"Чистовые", sub:"Стены — Декоративные",   name:"Декоративная штукатурка",                  unit:"м²",   tiers:[] },
  { code:"FIN-WALL-DEC", cat:"Чистовые", sub:"Стены — Декоративные",   name:"Микробетон",                               unit:"м²",   tiers:[] },
  { code:"FIN-WALL-DEC", cat:"Чистовые", sub:"Стены — Декоративные",   name:"Венецианка",                               unit:"м²",   tiers:[] },
  { code:"FIN-WALL-DEC", cat:"Чистовые", sub:"Стены — Декоративные",   name:"Акцентные стены",                          unit:"м²",   tiers:[] },
  { code:"FIN-WALL-PAN", cat:"Чистовые", sub:"Стены — Панели",         name:"МДФ панели",                               unit:"м²",   tiers:[] },
  { code:"FIN-WALL-PAN", cat:"Чистовые", sub:"Стены — Панели",         name:"Рейки",                                    unit:"м²",   tiers:[] },
  { code:"FIN-WALL-PAN", cat:"Чистовые", sub:"Стены — Панели",         name:"3D панели",                                unit:"м²",   tiers:[] },
  { code:"FIN-CEIL",     cat:"Чистовые", sub:"Потолки",                 name:"Покраска потолка",                         unit:"м²",   tiers:[] },
  { code:"FIN-CEIL",     cat:"Чистовые", sub:"Потолки",                 name:"Установка натяжных потолков",              unit:"м²",   tiers:[] },
  { code:"FIN-CEIL",     cat:"Чистовые", sub:"Потолки",                 name:"Монтаж трековых систем",                   unit:"м.п.", tiers:[] },
  { code:"FIN-CEIL",     cat:"Чистовые", sub:"Потолки",                 name:"Монтаж световых линий",                    unit:"м.п.", tiers:[] },
  { code:"FIN-CEIL",     cat:"Чистовые", sub:"Потолки",                 name:"Установка потолочных плинтусов",           unit:"м.п.", tiers:[] },
  { code:"FIN-CEIL",     cat:"Чистовые", sub:"Потолки",                 name:"Монтаж гипсокартонных коробов и ниш",      unit:"м²",   tiers:[] },
  { code:"FIN-FLOOR-FIN",cat:"Чистовые", sub:"Полы — Покрытия",        name:"Ламинат",                                  unit:"м²",   tiers:[] },
  { code:"FIN-FLOOR-FIN",cat:"Чистовые", sub:"Полы — Покрытия",        name:"Кварц-винил",                              unit:"м²",   tiers:[] },
  { code:"FIN-FLOOR-FIN",cat:"Чистовые", sub:"Полы — Покрытия",        name:"Паркетная доска",                          unit:"м²",   tiers:[] },
  { code:"FIN-FLOOR-FIN",cat:"Чистовые", sub:"Полы — Покрытия",        name:"Инженерная доска",                         unit:"м²",   tiers:[] },
  { code:"FIN-FLOOR-FIN",cat:"Чистовые", sub:"Полы — Покрытия",        name:"Керамогранит",                             unit:"м²",   tiers:[] },
  { code:"FIN-FLOOR-FIN",cat:"Чистовые", sub:"Полы — Покрытия",        name:"Плитка (пол)",                             unit:"м²",   tiers:[] },
  { code:"FIN-FLOOR-ADD",cat:"Чистовые", sub:"Полы — Сопутствующие",   name:"Подложка",                                 unit:"м²",   tiers:[] },
  { code:"FIN-FLOOR-ADD",cat:"Чистовые", sub:"Полы — Сопутствующие",   name:"Порожки",                                  unit:"шт",   tiers:[] },
  { code:"FIN-FLOOR-ADD",cat:"Чистовые", sub:"Полы — Сопутствующие",   name:"Монтаж плинтусов (МДФ, ПВХ, алюминий)",   unit:"м.п.", tiers:[] },
  { code:"FIN-FLOOR-ADD",cat:"Чистовые", sub:"Полы — Сопутствующие",   name:"Герметизация примыканий",                  unit:"м.п.", tiers:[] },
  { code:"FIN-SAN",      cat:"Чистовые", sub:"Сантехника — Установка", name:"Унитаз (вкл. инсталляцию)",                unit:"шт",   tiers:[] },
  { code:"FIN-SAN",      cat:"Чистовые", sub:"Сантехника — Установка", name:"Ванна",                                    unit:"шт",   tiers:[] },
  { code:"FIN-SAN",      cat:"Чистовые", sub:"Сантехника — Установка", name:"Раковина",                                 unit:"шт",   tiers:[] },
  { code:"FIN-SAN",      cat:"Чистовые", sub:"Сантехника — Установка", name:"Смесители",                                unit:"шт",   tiers:[] },
  { code:"FIN-SAN",      cat:"Чистовые", sub:"Сантехника — Установка", name:"Душевые системы",                          unit:"шт",   tiers:[] },
  { code:"FIN-SAN",      cat:"Чистовые", sub:"Сантехника — Установка", name:"Трапы",                                    unit:"шт",   tiers:[] },
  { code:"FIN-SAN",      cat:"Чистовые", sub:"Сантехника — Установка", name:"Полотенцесушитель",                        unit:"шт",   tiers:[] },
  { code:"FIN-SAN-ADD",  cat:"Чистовые", sub:"Сантехника — Доп.",      name:"Монтаж экранов",                           unit:"шт",   tiers:[] },
  { code:"FIN-SAN-ADD",  cat:"Чистовые", sub:"Сантехника — Доп.",      name:"Подключение стиралки/посудомойки",          unit:"шт",   tiers:[] },
  { code:"FIN-EL",       cat:"Чистовые", sub:"Электрика чистовая",     name:"Установка розеток",                        unit:"шт",   tiers:[] },
  { code:"FIN-EL",       cat:"Чистовые", sub:"Электрика чистовая",     name:"Установка выключателей",                   unit:"шт",   tiers:[] },
  { code:"FIN-EL",       cat:"Чистовые", sub:"Электрика чистовая",     name:"Подключение светильников",                 unit:"шт",   tiers:[] },
  { code:"FIN-EL",       cat:"Чистовые", sub:"Электрика чистовая",     name:"Люстры, бра, треки",                       unit:"шт",   tiers:[] },
  { code:"FIN-EL",       cat:"Чистовые", sub:"Электрика чистовая",     name:"Монтаж точечных светильников",             unit:"шт",   tiers:[] },
  { code:"FIN-EL",       cat:"Чистовые", sub:"Электрика чистовая",     name:"Подключение вытяжки",                      unit:"шт",   tiers:[] },
  { code:"FIN-EL",       cat:"Чистовые", sub:"Электрика чистовая",     name:"Установка терморегуляторов теплого пола",  unit:"шт",   tiers:[] },
  { code:"FIN-DOOR",     cat:"Чистовые", sub:"Двери и проемы",         name:"Установка межкомнатных дверей",            unit:"шт",   tiers:[] },
  { code:"FIN-DOOR",     cat:"Чистовые", sub:"Двери и проемы",         name:"Доборы",                                   unit:"шт",   tiers:[] },
  { code:"FIN-DOOR",     cat:"Чистовые", sub:"Двери и проемы",         name:"Наличники",                                unit:"шт",   tiers:[] },
  { code:"FIN-DOOR",     cat:"Чистовые", sub:"Двери и проемы",         name:"Скрытые двери",                            unit:"шт",   tiers:[] },
  { code:"FIN-DOOR",     cat:"Чистовые", sub:"Двери и проемы",         name:"Монтаж входной двери",                     unit:"шт",   tiers:[] },
  { code:"FIN-DOOR",     cat:"Чистовые", sub:"Двери и проемы",         name:"Оформление проемов и порталов",            unit:"шт",   tiers:[] },
  { code:"FIN-TILE",     cat:"Чистовые", sub:"Плиточные работы",       name:"Укладка плитки на стены",                  unit:"м²",   tiers:[] },
  { code:"FIN-TILE",     cat:"Чистовые", sub:"Плиточные работы",       name:"Укладка плитки на пол",                    unit:"м²",   tiers:[] },
  { code:"FIN-TILE",     cat:"Чистовые", sub:"Плиточные работы",       name:"Раскладка «под 45» (запил)",               unit:"м²",   tiers:[] },
  { code:"FIN-TILE",     cat:"Чистовые", sub:"Плиточные работы",       name:"Декоративные вставки",                     unit:"шт",   tiers:[] },
  { code:"FIN-TILE",     cat:"Чистовые", sub:"Плиточные работы",       name:"Затирка швов",                             unit:"м²",   tiers:[] },
  { code:"FIN-TILE",     cat:"Чистовые", sub:"Плиточные работы",       name:"Монтаж декоративных бордюров",             unit:"м.п.", tiers:[] },
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
function getBasePrice(work) {
  if (work.tiers.length > 0) return work.tiers[0].price;
  if (work.fixedPrice) return work.fixedPrice;
  return null;
}

// Логика точно повторяет Google Apps Script onEdit:
// 1. Есть диапазоны -> ищем подходящий по объёму
// 2. Нет диапазонов, но есть fixedPrice -> берём его
// 3. Иначе -> null (нужно вводить вручную)
function getPrice(work, qty, complexity) {
  if (!qty || qty <= 0) return null;
  const mult = COMPLEXITY.find(c => c.key === complexity)?.mult || 1;
  let price = null;
  if (work.tiers.length > 0) {
    for (const t of work.tiers) {
      if (qty >= t.min && qty <= t.max) { price = t.price; break; }
    }
    if (price === null) price = work.tiers[work.tiers.length - 1].price;
  } else if (work.fixedPrice) {
    price = work.fixedPrice;
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

const G = groupData(WORKS_DATA);

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
const storage = {
  async get(key) {
    try {
      if (_fbDb) {
        const snap = await _race(get(ref(_fbDb, key.replace(/[.#$/[\]]/g,"_"))), 4000);
        if (snap && snap.exists()) return { value: JSON.stringify(snap.val()) };
      }
    } catch(e) {}
    try { const v = localStorage.getItem(key); if (v) return { value: v }; } catch(e) {}
    return _mem[key] ? { value: _mem[key] } : null;
  },
  async set(key, value) {
    const parsed = (() => { try { return JSON.parse(value); } catch { return value; } })();
    try {
      if (_fbDb) await _race(set(ref(_fbDb, key.replace(/[.#$/[\]]/g,"_")), parsed), 4000);
    } catch(e) {}
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
function AdminPanel({ currentUser, onClose }) {
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [newLogin, setNewLogin]   = useState("");
  const [newName, setNewName]     = useState("");
  const [newPass, setNewPass]     = useState("");
  const [newRole, setNewRole]     = useState("user");
  const [editingPass, setEditingPass] = useState(null); // {id, val}
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await storage.get(USERS_KEY);
        setUsers(res ? JSON.parse(res.value) : DEFAULT_USERS);
      } catch { setUsers(DEFAULT_USERS); }
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

  const roleLabel = r => r === "admin" ? "👑 Админ" : "👤 Замерщик";

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.8)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:400,padding:16,fontFamily:"'Golos Text','Segoe UI',sans-serif"}}
      onClick={onClose}>
      <div style={{background:"#111425",border:"1px solid #1c2035",borderRadius:14,padding:"24px 28px",maxWidth:520,width:"100%",maxHeight:"88vh",overflowY:"auto"}}
        onClick={e=>e.stopPropagation()}>

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div style={{fontWeight:800,fontSize:16,color:"#e2ddd4"}}>👥 Управление пользователями</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#555575",cursor:"pointer",fontSize:20}}>×</button>
        </div>

        {loading ? <div style={{textAlign:"center",padding:"30px 0",color:"#454560"}}>Загрузка...</div> : (
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
                        onClick={()=>setEditingPass(editingPass?.id===u.id ? null : {id:u.id,val:""})}
                        style={{background:"rgba(184,144,74,.1)",color:"#b8904a",border:"1px solid rgba(184,144,74,.2)",borderRadius:6,padding:"4px 10px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>
                        🔑 Пароль
                      </button>
                      {u.id !== currentUser.id && (
                        <button onClick={()=>removeUser(u.id)}
                          style={{background:"rgba(200,60,60,.1)",color:"#e07070",border:"1px solid rgba(200,60,60,.2)",borderRadius:6,padding:"4px 8px",fontSize:11,cursor:"pointer"}}>✕</button>
                      )}
                    </div>
                  </div>
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

      {/* Таблица */}
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,marginBottom:14}}>
        <thead>
          <tr style={{background:"#1a1a28",color:"#f5f2ec"}}>
            {["№","Раздел","Наименование","Ед.","Объём","Слож.","Цена","Сумма"].map(h=>(
              <th key={h} style={{padding:"9px 8px",textAlign:["№","Ед.","Объём"].includes(h)?"center":"left",fontSize:11,fontWeight:600,letterSpacing:.3}}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {kpItems.map((item,i)=>(
            <tr key={i} style={{background:i%2===0?"#f5f2ec":"#ede9e0",borderBottom:"1px solid #ddd9d0"}}>
              <td style={{padding:"7px 8px",textAlign:"center",color:"#999",fontSize:11}}>{i+1}</td>
              <td style={{padding:"7px 8px",color:"#8855aa",fontSize:11,fontWeight:500}}>{item.sub}</td>
              <td style={{padding:"7px 8px",fontWeight:600,fontSize:13}}>{item.name}</td>
              <td style={{padding:"7px 8px",textAlign:"center",color:"#888",fontSize:11}}>{item.unit}</td>
              <td style={{padding:"7px 8px",textAlign:"center",fontWeight:500}}>{item.qty}</td>
              <td style={{padding:"7px 8px",fontSize:11,color:"#888"}}>{COMPLEXITY.find(c=>c.key===item.cpx)?.label.split(" ")[0]||"Стандарт"}</td>
              <td style={{padding:"7px 8px",textAlign:"right",color:"#555"}}>{fmt(item.price)} ₸</td>
              <td style={{padding:"7px 8px",textAlign:"right",fontWeight:700,fontSize:13}}>{fmt(item.total)} ₸</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Итог */}
      <div style={{background:"#1a1a28",borderRadius:10,padding:"13px 18px",color:"#f5f2ec",marginBottom:14}}>
        {discount>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#e07070",marginBottom:6}}><span>Скидка {discount}%</span><span>− {fmt(discAmt)} ₸</span></div>}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:14,fontWeight:600,letterSpacing:.5}}>ИТОГО:</span>
          <span style={{fontSize:28,fontWeight:900,color:"#b8904a",letterSpacing:-.5}}>{fmt(final)} ₸</span>
        </div>
        {proj.area&&Number(proj.area)>0&&<div style={{textAlign:"right",fontSize:11,color:"#666",marginTop:3}}>{fmt(final/Number(proj.area))} ₸/м²</div>}
      </div>

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
  const cats = Object.keys(G);

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
  const [activeSub, setActiveSub] = useState(Object.keys(G[cats[0]])[0]);
  const [rows, setRows] = useState({});
  const [proj, setProj] = useState({...EMPTY_PROJ});
  const [discount, setDiscount] = useState(0);
  const [note, setNote] = useState("");
  const [showKP, setShowKP] = useState(false);
  const [editPrices, setEditPrices] = useState(false);
  const [search, setSearch] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // ── Загрузка списка смет из shared storage ──
  const loadEstimates = useCallback(async () => {
    setLoadingList(true);
    try {
      const result = await storage.get(STORAGE_KEY);
      if (result) setEstimates(JSON.parse(result.value));
    } catch(e) {
      setEstimates([]);
    }
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
  const subSum = (cat, sub) => (G[cat]?.[sub] || []).reduce((s,w) => s + rowTotal(w), 0);
  const catSum = (cat) => Object.keys(G[cat]||{}).reduce((s,sub) => s + subSum(cat,sub), 0);
  const grand = useMemo(() => {
    let s = 0;
    for (const cat of cats) for (const sub of Object.keys(G[cat])) for (const w of G[cat][sub]) s += rowTotal(w);
    return s;
  }, [rows]);
  const discAmt = grand * discount / 100;
  const final = grand - discAmt;
  const kpItems = useMemo(() => {
    const out = [];
    for (const cat of cats) for (const sub of Object.keys(G[cat])) for (const w of G[cat][sub]) {
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
    return WORKS_DATA.filter(w =>
      w.name.toLowerCase().includes(q) || w.sub.toLowerCase().includes(q) || w.cat.toLowerCase().includes(q)
    );
  }, [search]);
  const isSearching = search.trim().length > 0;
  const subs = Object.keys(G[activeCat] || {});

  // ── Открыть смету на редактирование ──
  const openEstimate = (est) => {
    setCurrentId(est.id);
    setProj(est.proj || {...EMPTY_PROJ});
    setRows(est.rows || {});
    setDiscount(est.discount || 0);
    setNote(est.note || "");
    setSearch("");
    setActiveCat(cats[0]);
    setActiveSub(Object.keys(G[cats[0]])[0]);
    setScreen("editor");
  };

  // ── Новая смета ──
  const newEstimate = () => {
    const id = genId();
    setCurrentId(id);
    setProj({...EMPTY_PROJ});
    setRows({});
    setDiscount(0);
    setNote("");
    setSearch("");
    setActiveCat(cats[0]);
    setActiveSub(Object.keys(G[cats[0]])[0]);
    setScreen("editor");
  };

  // ── Сохранить текущую и вернуться к списку ──
  const saveAndBack = async () => {
    const updated = {
      id: currentId,
      proj, rows, discount, note,
      updatedAt: Date.now(),
      total: final,
    };
    const exists = estimates.find(e => e.id === currentId);
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
        .wrow{display:grid;align-items:start;padding:9px 14px;border-radius:7px;gap:8px;transition:background .12s}
        .wrow:hover{background:rgba(255,255,255,.02)}
        .wrow.on{background:rgba(184,144,74,.06)}
        .num{background:#14172a;border:1px solid #20243a;color:#ddd8ce;border-radius:6px;padding:6px 8px;text-align:right;font-family:inherit;font-size:13px;transition:border .15s}
        .num:focus{border-color:#b8904a}
        .num::placeholder{color:#33364d}
        .cpx-sel{background:#14172a;border:1px solid #20243a;color:#7070a0;border-radius:6px;padding:4px 6px;font-family:inherit;font-size:11px;margin-top:4px;cursor:pointer}
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
        @media(max-width:600px){
          .wrow{grid-template-columns:1fr 50px 90px 60px 80px!important;font-size:12px}
          .tab-btn{padding:5px 9px;font-size:12px}
          .sub-btn{padding:4px 7px;font-size:11px}
        }
        @media print{
          body>*{display:none!important}
          #kp-print-portal{display:block!important;position:fixed;inset:0;z-index:99999;background:#fff;overflow:auto}
          .kp-no-print{display:none!important}
          @page{margin:14mm 12mm;size:A4}
        }
        .est-card{background:#111425;border:1px solid #1c2035;border-radius:11px;padding:16px 18px;cursor:pointer;transition:all .15s;position:relative}
        .est-card:hover{border-color:#b8904a;background:#14172e}
        .est-card:active{transform:scale(.99)}
      `}</style>

      {/* ═══════════════════════════════════════════════════════════════════
          ЭКРАН 1: СПИСОК СМЕТ
      ═══════════════════════════════════════════════════════════════════ */}
      {screen === "list" && (
        <div style={{maxWidth:720,margin:"0 auto",padding:"0 0 40px"}}>
          {/* Шапка */}
          <div style={{background:"#0e1122",borderBottom:"1px solid #181c2e",padding:"14px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:10}}>
            <div style={{display:"flex",alignItems:"center",gap:11}}>
              <div style={{width:33,height:33,borderRadius:8,background:"linear-gradient(135deg,#b8904a,#d4a85a)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:15,color:"#0c0e1a"}}>T</div>
              <div>
                <div style={{fontWeight:800,fontSize:14}}>TitovStroy</div>
                <div style={{fontSize:10,color:"#353550"}}>Сметы · Общая база</div>
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              {saving && <span style={{fontSize:11,color:"#555575"}}>💾</span>}
              {/* Имя пользователя */}
              <div style={{fontSize:12,color:"#555575",display:"flex",alignItems:"center",gap:6}}>
                <span style={{color:"#b8904a"}}>{currentUser.role==="admin"?"👑":"👤"}</span>
                <span>{currentUser.name}</span>
              </div>
              {/* Кнопка управления пользователями — только для админа */}
              {currentUser.role === "admin" && (
                <button className="btn btn-o" style={{padding:"7px 12px",fontSize:11}} onClick={()=>setShowAdmin(true)}>
                  👥 Сотрудники
                </button>
              )}
              {/* Выйти */}
              <button className="btn btn-o" style={{padding:"7px 12px",fontSize:11}} onClick={()=>setCurrentUser(null)}>
                Выйти
              </button>
              <button className="btn btn-g" style={{padding:"8px 16px",fontSize:13}} onClick={newEstimate}>
                + Новая смета
              </button>
            </div>
          </div>

          <div style={{padding:"20px 20px 0"}}>
            {loadingList ? (
              <div style={{textAlign:"center",padding:"60px 0",color:"#353550"}}>
                <div style={{fontSize:24,marginBottom:10}}>⏳</div>
                <div style={{fontSize:13}}>Загрузка смет...</div>
              </div>
            ) : estimates.length === 0 ? (
              <div style={{textAlign:"center",padding:"80px 0"}}>
                <div style={{fontSize:40,marginBottom:16}}>📋</div>
                <div style={{fontWeight:700,fontSize:16,marginBottom:8}}>Смет пока нет</div>
                <div style={{fontSize:13,color:"#454560",marginBottom:24}}>Нажмите «+ Новая смета» чтобы начать</div>
                <button className="btn btn-g" onClick={newEstimate}>+ Создать первую смету</button>
              </div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <div style={{fontSize:11,color:"#454560",marginBottom:4}}>
                  Всего смет: {estimates.length} · Общий замерщик видит все
                </div>
                {estimates
                  .slice()
                  .sort((a,b) => (b.updatedAt||0) - (a.updatedAt||0))
                  .map((est, i) => {
                    const hasItems = est.rows && Object.values(est.rows).some(r => Number(r?.qty) > 0);
                    const status = !hasItems ? "draft" : est.total > 0 ? "done" : "draft";
                    return (
                      <div key={est.id} className="est-card up" style={{animationDelay:`${i*0.04}s`}}
                        onClick={() => openEstimate(est)}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
                              <span style={{
                                width:8,height:8,borderRadius:"50%",flexShrink:0,
                                background: status==="done" ? "#4caf7d" : "#888",
                                boxShadow: status==="done" ? "0 0 6px #4caf7d" : "none"
                              }}/>
                              <span style={{fontWeight:700,fontSize:15,color:"#e2ddd4",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                                {est.proj?.name || <span style={{color:"#454560",fontStyle:"italic"}}>Без названия</span>}
                              </span>
                            </div>
                            <div style={{display:"flex",gap:10,fontSize:12,color:"#555575",flexWrap:"wrap"}}>
                              <span>{est.proj?.type || "—"}</span>
                              {est.proj?.area && <span>{est.proj.area} м²</span>}
                              {est.proj?.address && <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:200}}>{est.proj.address}</span>}
                            </div>
                            {est.proj?.phone && (
                              <div style={{fontSize:11,color:"#454560",marginTop:3}}>{est.proj.phone}</div>
                            )}
                          </div>
                          <div style={{textAlign:"right",flexShrink:0}}>
                            {est.total > 0 ? (
                              <div style={{fontSize:16,fontWeight:800,color:"#b8904a"}}>{fmt(est.total)} ₸</div>
                            ) : (
                              <div style={{fontSize:12,color:"#454560",fontStyle:"italic"}}>черновик</div>
                            )}
                            <div style={{fontSize:10,color:"#353550",marginTop:3}}>{fmtDate(est.updatedAt)}</div>
                          </div>
                        </div>
                        {/* Кнопка удаления */}
                        <button
                          className="btn btn-red"
                          style={{position:"absolute",top:12,right:12,padding:"3px 9px",fontSize:11,borderRadius:5,opacity:0.6}}
                          onClick={e => { e.stopPropagation(); setDeleteConfirm(est.id); }}>
                          ✕
                        </button>
                      </div>
                    );
                  })}
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
          <div style={{background:"#0e1122",borderBottom:"1px solid #181c2e",padding:"11px 22px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:10}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <button className="btn btn-o" style={{padding:"7px 13px",fontSize:12}} onClick={saveAndBack}>
                ← Сметы
              </button>
              <div style={{fontSize:13,fontWeight:600,color:"#9090b0",maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {proj.name || "Новая смета"}
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              {saving && <span style={{fontSize:11,color:"#555575"}}>💾</span>}
              {filledCount > 0 && <span className="badge">{filledCount} позиций</span>}
              <button className="btn btn-o" style={{fontSize:11,padding:"6px 12px"}} onClick={()=>setEditPrices(m=>!m)}>
                {editPrices ? "✓ Готово" : "✏ Цены"}
              </button>
              <span style={{fontSize:11,color:"#454560"}}>
                {currentUser.role==="admin"?"👑":"👤"} {currentUser.name}
              </span>
              <button className="btn btn-g" style={{padding:"8px 16px",fontSize:13}} onClick={saveAndBack}>
                💾 Сохранить
              </button>
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
                      onClick={()=>{setActiveCat(cat);setActiveSub(Object.keys(G[cat])[0]);}}>
                      {cat}{catSum(cat)>0&&<span style={{marginLeft:4,fontSize:9,color:"#b8904a"}}>●</span>}
                    </button>
                  ))}
                </div>}

                {/* Подкатегории */}
                {!isSearching && <div style={{display:"flex",flexWrap:"wrap",gap:3,padding:"8px 10px",borderBottom:"1px solid #181c2e",background:"rgba(0,0,0,.12)"}}>
                  {subs.map(sub=>(
                    <button key={sub} className={`sub-btn ${activeSub===sub?"active":""}`} onClick={()=>setActiveSub(sub)}>
                      {sub}{subSum(activeCat,sub)>0&&<span style={{marginLeft:3,color:"#b8904a",fontSize:8}}>●</span>}
                    </button>
                  ))}
                </div>}

                {/* Шапка таблицы */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 60px 120px 76px 90px",padding:"6px 14px 7px",fontSize:10,color:"#353550",fontWeight:700,letterSpacing:.8,textTransform:"uppercase",borderBottom:"1px solid #181c2e"}}>
                  <span>Наименование</span><span style={{textAlign:"center"}}>Ед.</span>
                  <span style={{textAlign:"right"}}>Цена за ед., ₸</span>
                  <span style={{textAlign:"right"}}>Объём</span>
                  <span style={{textAlign:"right"}}>Итого, ₸</span>
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
                  {(isSearching ? searchResults : (G[activeCat]?.[activeSub]||[])).map(work=>{
                    const r = rows[work.name]||{};
                    const qty = Number(r.qty||0);
                    const cpx = r.complexity||"std";
                    const price = rowPrice(work);
                    const basePrice = getBasePrice(work);
                    const displayPrice = price ?? basePrice;
                    const total = rowTotal(work);
                    const filled = qty > 0 && price;
                    const showBreadcrumb = isSearching;
                    const tierHint = work.tiers.length > 1
                      ? work.tiers.map(t=>`${t.min}–${t.max}: ${fmt(t.price)} ₸`).join(" · ")
                      : null;
                    return (
                      <div key={work.name} className={`wrow ${filled?"on":""}`}
                        style={{gridTemplateColumns:"1fr 60px 120px 76px 90px"}}>
                        <div>
                          {showBreadcrumb && <div style={{fontSize:10,color:"#454568",marginBottom:2}}>{work.cat} › {work.sub}</div>}
                          <div style={{fontSize:13,color:filled?"#ddd8ce":"#707090"}}>{work.name}</div>
                          {tierHint && <div style={{fontSize:10,color:"#444460",marginTop:1}}>{tierHint}</div>}
                          {qty > 0 && (
                            <select className="cpx-sel" value={cpx}
                              onChange={e=>{setRow(work.name,"complexity",e.target.value);setRow(work.name,"manualPrice",undefined);}}>
                              {COMPLEXITY.map(c=><option key={c.key} value={c.key}>{c.label}</option>)}
                            </select>
                          )}
                        </div>
                        <div style={{textAlign:"center",fontSize:12,color:"#454560",paddingTop:3}}>{work.unit}</div>
                        <div style={{textAlign:"right",paddingTop:2}}>
                          {editPrices ? (
                            <input className="num" style={{width:110}} type="number" min="0" placeholder="Введите цену"
                              value={r.manualPrice!==undefined ? r.manualPrice : (price||"")}
                              onChange={e=>setRow(work.name,"manualPrice",e.target.value===""?undefined:Number(e.target.value))}/>
                          ) : displayPrice !== null && displayPrice !== undefined ? (
                            <div>
                              <span style={{fontSize:12,color:filled?"#b8a880":"#555575"}}>{fmt(displayPrice)}</span>
                              {filled && work.tiers.length > 1 && (
                                <div style={{fontSize:9,color:"#454560",marginTop:1}}>
                                  {work.tiers.find(t=>qty>=t.min&&qty<=t.max) ? `диапазон ${work.tiers.find(t=>qty>=t.min&&qty<=t.max).min}–${work.tiers.find(t=>qty>=t.min&&qty<=t.max).max}` : "макс. диапазон"}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span style={{fontSize:10,color:"#353550",fontStyle:"italic"}}>нет цены</span>
                          )}
                        </div>
                        <div style={{textAlign:"right"}}>
                          <input className="num" style={{width:70}} type="number" min="0" placeholder="0"
                            value={r.qty||""} onChange={e=>setRow(work.name,"qty",e.target.value)}/>
                        </div>
                        <div style={{textAlign:"right",paddingTop:3}}>
                          {total>0
                            ? <span style={{fontSize:13,fontWeight:700,color:"#b8904a"}}>{fmt(total)}</span>
                            : <span style={{color:"#252535",fontSize:12}}>—</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {!isSearching && subSum(activeCat,activeSub)>0&&(
                  <div style={{borderTop:"1px solid #181c2e",padding:"10px 14px",display:"flex",justifyContent:"space-between"}}>
                    <span style={{fontSize:11,color:"#454560"}}>Итого по разделу «{activeSub}»</span>
                    <span style={{fontSize:15,fontWeight:700,color:"#b8904a"}}>{fmt(subSum(activeCat,activeSub))} ₸</span>
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
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                <div style={{background:"linear-gradient(145deg,#13162a,#111424)",border:"1px solid #1c2035",borderRadius:12,padding:18}} className="up">
                  <div style={{fontSize:10,fontWeight:700,color:"#b8904a",letterSpacing:1.5,textTransform:"uppercase",marginBottom:14}}>Смета</div>
                  {cats.map(cat=>{
                    const cs = catSum(cat);
                    if(!cs) return null;
                    return (
                      <div key={cat} style={{marginBottom:8}}>
                        <div style={{fontSize:10,color:"#454560",fontWeight:700,textTransform:"uppercase",letterSpacing:.7,padding:"5px 0 3px",borderBottom:"1px solid #181c2e"}}>{cat}</div>
                        {Object.keys(G[cat]).map(sub=>{
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
                <button style={{background:"linear-gradient(135deg,#b8904a,#d4a85a)",color:"#0c0e1a",border:"none",cursor:"pointer",padding:"10px 20px",borderRadius:7,fontFamily:"inherit",fontSize:13,fontWeight:700}} onClick={()=>window.print()}>Печать / PDF</button>
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
