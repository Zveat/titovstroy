// АДМИНКА → УВЕДОМЛЕНИЯ. Кто, что, по каким объектам и когда получает в Telegram.
//
// Здесь только настройки. Сама рассылка живёт отдельно (GitHub Actions,
// notify/send.mjs) и в приложение не встроена: иначе уведомления приходили бы
// только когда у кого-то открыта вкладка.
//
// ГЛАВНОЕ НА ЭТОМ ЭКРАНЕ — таблица «Кому что». Подписка идёт ПО КАЖДОМУ
// уведомлению отдельно, а не по блоку целиком: «Производство» — это и «завтра
// выходим на объект», и «удалили запись акта». Прорабу нужно первое и не нужно
// второе, руководителю наоборот. Блоки остались только группировкой строк.
//
// Второй по важности — раздел «Объекты». Половина объектов в базе через
// производство ещё не ведётся: это не заброшенная работа, а неначатая. Без
// фильтра сводка вываливала бы по ним «тишина 47 дней».
//
// ЧТО ГДЕ ХРАНИТСЯ:
//   titovstroy-tg-settings  — всё с этого экрана (подписки чата, пороги, объекты)
//   titovstroy-tg-links     — кто к какому чату привязан (пишет ТОЛЬКО рассыльщик)
//   карточка сотрудника     — его подписки (u.tg.subs), вместе с сотрудниками
import { useEffect, useMemo, useState } from "react";
import { storage } from "../cloud/storage.js";
import { logChange } from "../cloud/audit.js";
import { OBJECTS_KEY, TG_LINKS_KEY, TG_SETTINGS_KEY } from "../storageKeys.js";
import {
  NOTIFY_TOPICS, NOTIFY_CATALOG, NOTIFY_REMINDERS, DATE_REMINDERS, OBJECT_MODES,
  reminderOn, reminderNum, reminderDays, objectAllowed,
  isSubscribed, groupSubscribed, subsOf,
  NOTIFY_PRESETS, presetSubs, matchPreset,
  linkUrl, makeLinkCode, userScope,
} from "../notify/notifyModel.js";

const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "18px 20px", marginBottom: 16 };
const h = { fontSize: 15, fontWeight: 800, color: "#0f172a", marginBottom: 4 };
const sub = { fontSize: 12, color: "#64748b", lineHeight: 1.55, marginBottom: 14 };
const KIND_LABEL = { event: "событие", reminder: "напоминание", dates: "по датам", digest: "сводка" };
const DEFAULTS = {
  on: false, botName: "", groupChatId: "", groupSubs: null,
  quietFrom: 22, quietTo: 8, digestHour: 9, repeatAfterDays: 7,
  reminders: {}, objectMode: "all", objectList: [],
};

export function NotifyTab({ users = [], saveUsers, currentUser, readOnly = false, canEdit = false }) {
  const [settings, setSettings] = useState(null);
  const [links, setLinks] = useState({});
  const [objects, setObjects] = useState([]);
  const [msg, setMsg] = useState("");
  const [objQuery, setObjQuery] = useState("");
  const [section, setSection] = useState("matrix");
  const editable = canEdit && !readOnly;

  useEffect(() => {
    (async () => {
      const read = async (key, empty) => {
        try { const r = await storage.get(key); if (r) { const p = JSON.parse(r.value); if (p && typeof p === "object") return p; } }
        catch (e) { /* узла ещё нет или JSON битый — работаем с пустым */ }
        return empty;
      };
      setSettings({ ...DEFAULTS, ...(await read(TG_SETTINGS_KEY, {})) });
      setLinks(await read(TG_LINKS_KEY, {}));
      const objs = await read(OBJECTS_KEY, []);
      setObjects(Array.isArray(objs) ? objs.filter(o => o && !o.deletedAt) : []);
    })();
  }, []);

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(""), 2600); };

  const patch = async (p) => {
    if (!editable) return;
    const next = { ...settings, ...p };
    setSettings(next);
    try { await storage.set(TG_SETTINGS_KEY, JSON.stringify(next)); }
    catch (e) { flash("Не сохранилось: " + (e?.message || "ошибка")); }
  };

  // Подписки живут в карточке сотрудника — сохраняются тем же путём, что имя и
  // роль. Отдельного узла нет намеренно: меньше мест, где данные о человеке
  // могут разойтись.
  const patchUser = async (id, tgPatch, auditNote) => {
    if (!editable) return;
    const before = users.find(u => u.id === id);
    const next = users.map(u => u.id === id ? { ...u, tg: { ...(u.tg || {}), ...tgPatch } } : u);
    if (await saveUsers(next) === false) { flash("Нет права сохранять сотрудников"); return; }
    if (auditNote) {
      logChange(currentUser, { entity: "user", entityId: id, label: before?.name || id,
        field: "уведомления", action: "изменил", old: "", new: auditNote });
    }
  };

  // Поштучные подписки человека. Пока их нет, работает старая настройка по
  // направлениям — поэтому первое же изменение раскрывает её в явный список,
  // иначе одна снятая галочка молча включила бы всё остальное.
  const explicitSubs = (u) => {
    const stored = subsOf(u);
    if (stored) return { ...stored };
    return Object.fromEntries(NOTIFY_CATALOG.map(n => [n.key, isSubscribed(u, n.key)]));
  };
  const toggleUserKey = (u, key) => {
    const subs = explicitSubs(u);
    subs[key] = !subs[key];
    patchUser(u.id, { subs }, `${subs[key] ? "включил" : "выключил"} «${key}»`);
  };
  const setUserAll = (u, keys, on) => {
    const subs = explicitSubs(u);
    for (const k of keys) subs[k] = on;
    patchUser(u.id, { subs }, `${on ? "включил" : "выключил"} ${keys.length} уведомлений`);
  };

  const explicitGroup = () => {
    if (settings.groupSubs) return { ...settings.groupSubs };
    return Object.fromEntries(NOTIFY_CATALOG.map(n => [n.key, groupSubscribed(settings, n.key)]));
  };
  const toggleGroupKey = (key) => {
    const g = explicitGroup(); g[key] = !g[key]; patch({ groupSubs: g });
  };
  const setGroupAll = (keys, on) => {
    const g = explicitGroup(); for (const k of keys) g[k] = on; patch({ groupSubs: g });
  };

  const connect = async (u) => {
    const code = u.tg?.code || makeLinkCode();
    if (!u.tg?.code) await patchUser(u.id, { code });
    const url = linkUrl(settings?.botName, code);
    if (!url) { flash("Сначала укажите имя бота в «Основном»"); return; }
    try { await navigator.clipboard.writeText(url); flash("Ссылка скопирована — отправьте её сотруднику"); }
    catch (e) { window.prompt("Скопируйте ссылку и отправьте сотруднику:", url); }
  };

  const passing = useMemo(
    () => objects.filter(o => objectAllowed(o.id, settings || {})).length,
    [objects, settings]
  );
  const shownObjects = useMemo(() => {
    const q = objQuery.trim().toLowerCase();
    const list = q ? objects.filter(o =>
      `${o.clientName || ""} ${o.address || ""} ${o.phone || ""}`.toLowerCase().includes(q)) : objects;
    return list.slice(0, 300);
  }, [objects, objQuery]);

  if (!settings) return <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Загрузка…</div>;

  const toggleIn = (arr, key) => (arr || []).includes(key)
    ? (arr || []).filter(x => x !== key) : [...(arr || []), key];
  const SECTIONS = [
    ["matrix", "Кому что слать"], ["tuning", "Настройка напоминаний"],
    ["objects", `Объекты (${passing} из ${objects.length})`], ["basic", "Основное"],
  ];

  return (
    <div>
      {msg && <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#065f46",
        borderRadius: 9, padding: "9px 14px", fontSize: 13, marginBottom: 14 }}>{msg}</div>}

      {!settings.on && (
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e",
          borderRadius: 10, padding: "11px 15px", fontSize: 12.5, marginBottom: 14, lineHeight: 1.5 }}>
          Рассылка выключена — ничего не отправляется, даже если люди подключены.
          Настройте всё спокойно и включите в разделе «Основное».
        </div>
      )}

      <div style={{ display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap" }}>
        {SECTIONS.map(([k, label]) => (
          <button key={k} onClick={() => setSection(k)} className="sub-btn"
            style={{ padding: "7px 14px", fontSize: 12.5, fontWeight: 700, borderRadius: 8,
              background: section === k ? "#0f172a" : "#f1f5f9", color: section === k ? "#fff" : "#475569" }}>
            {label}
          </button>
        ))}
      </div>

      {/* ══ МАТРИЦА: КОМУ ЧТО ══ */}
      {section === "matrix" && (
        <div style={card}>
          <div style={h}>Кому что слать</div>
          <div style={sub}>
            Быстрый путь: в шапке столбца выбрать <b>готовый набор</b> — «Прорабу»,
            «Руководителю», «Менеджеру продаж». Он расставит галочки за вас, дальше
            можно поправить руками, тогда в шапке появится «своё».
            <br />Каждое уведомление настраивается отдельно: в общий чат, лично конкретным
            людям, или и то и другое.
            <br />Адресные напоминания («ваши просроченные этапы») в общий чат не уходят
            никогда, даже если галочка стоит: они по определению личные.
          </div>

          <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 10 }}>
            <table style={{ borderCollapse: "collapse", fontSize: 12.5, width: "100%", minWidth: 640 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={{ ...thBase, textAlign: "left", minWidth: 240, position: "sticky", left: 0, background: "#f8fafc", zIndex: 2 }}>
                    Уведомление
                  </th>
                  <th style={{ ...thBase, minWidth: 118 }}>
                    <div>💬 Общий чат</div>
                    <div style={{ fontSize: 10, fontWeight: 500, color: "#94a3b8", textTransform: "none" }}>
                      {settings.groupChatId ? "подключён" : "номер не задан"}
                    </div>
                    {editable && <PresetPick presets={NOTIFY_PRESETS.filter(p => p.forGroup)}
                      current={matchPreset(k => groupSubscribed(settings, k))}
                      onPick={(pk) => patch({ groupSubs: presetSubs(pk) })} />}
                  </th>
                  {users.map(u => (
                    <th key={u.id} style={{ ...thBase, minWidth: 118 }}>
                      <div style={{ color: "#0f172a" }}>{u.name || u.login}</div>
                      <div style={{ fontSize: 10, fontWeight: 500, textTransform: "none",
                        color: links[u.id]?.chatId ? "#059669" : "#cbd5e1" }}>
                        {links[u.id]?.chatId ? "подключён" : "не подключён"}
                      </div>
                      {editable && <PresetPick presets={NOTIFY_PRESETS}
                        current={matchPreset(k => isSubscribed(u, k))}
                        onPick={(pk) => patchUser(u.id, { subs: presetSubs(pk) },
                          `набор «${NOTIFY_PRESETS.find(x => x.key === pk)?.label || pk}»`)} />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {NOTIFY_TOPICS.map(topic => {
                  const rows = NOTIFY_CATALOG.filter(n => n.topic === topic.key);
                  if (!rows.length) return null;
                  const keys = rows.map(n => n.key);
                  // Массив, а не фрагмент: строка-заголовок группы и её строки —
                  // соседи в <tbody>, и каждой нужен свой key.
                  return [
                      <tr key={topic.key} style={{ background: "#f1f5f9" }}>
                        <td colSpan={2 + users.length} style={{ padding: "7px 12px", fontSize: 11.5,
                          fontWeight: 800, color: "#334155", position: "sticky", left: 0 }}>
                          {topic.icon} {topic.label.toUpperCase()}
                          {editable && (
                            <span style={{ marginLeft: 10, fontWeight: 500 }}>
                              <button className="sub-btn" style={bulkBtn}
                                onClick={() => setGroupAll(keys, true)}>всё в чат</button>
                              <button className="sub-btn" style={bulkBtn}
                                onClick={() => setGroupAll(keys, false)}>снять с чата</button>
                            </span>
                          )}
                        </td>
                      </tr>,
                      ...rows.map(n => (
                        <tr key={n.key} style={{ borderTop: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "8px 12px", position: "sticky", left: 0, background: "#fff" }}>
                            <div style={{ fontWeight: 600, color: "#0f172a" }}>{n.icon} {n.label}</div>
                            <div style={{ fontSize: 10.5, color: "#94a3b8" }}>
                              {KIND_LABEL[n.kind]}{n.hint ? ` · ${n.hint}` : ""}
                            </div>
                          </td>
                          <td style={cellStyle}>
                            <input type="checkbox" style={box} disabled={!editable}
                              checked={groupSubscribed(settings, n.key)} onChange={() => toggleGroupKey(n.key)} />
                          </td>
                          {users.map(u => (
                            <td key={u.id} style={cellStyle}>
                              <input type="checkbox" style={box} disabled={!editable}
                                checked={isSubscribed(u, n.key)} onChange={() => toggleUserKey(u, n.key)} />
                            </td>
                          ))}
                        </tr>
                      )),
                  ];
                })}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 10 }}>
            {users.map(u => (
              <div key={u.id} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "9px 13px",
                display: "flex", alignItems: "center", gap: 10, fontSize: 12.5 }}>
                <b style={{ color: "#0f172a" }}>{u.name || u.login}</b>
                {links[u.id]?.chatId
                  ? <span style={{ color: "#059669", fontWeight: 700 }}>✓ подключён</span>
                  : editable
                    ? <button className="btn btn-o" style={{ padding: "4px 11px", fontSize: 11.5 }}
                        onClick={() => connect(u)}>🔗 Подключить</button>
                    : <span style={{ color: "#94a3b8" }}>не подключён</span>}
                <span style={{ color: "#94a3b8" }}>охват</span>
                <select className="fi" style={{ width: 86, fontSize: 11.5, padding: "3px 5px" }}
                  disabled={!editable} value={userScope(u)}
                  onChange={e => patchUser(u.id, { scope: e.target.value })}>
                  <option value="own">свои</option>
                  <option value="all">все</option>
                </select>
              </div>
            ))}
          </div>
          <div style={{ ...sub, marginTop: 10, marginBottom: 0 }}>
            «Охват»: <b>свои</b> — только объекты, где человек ответственный; <b>все</b> — вся компания.
            Общие сводки по компании получают только те, у кого «все».
          </div>
        </div>
      )}

      {/* ══ НАСТРОЙКА НАПОМИНАНИЙ ══ */}
      {section === "tuning" && (<>
        <div style={card}>
          <div style={h}>За сколько дней предупреждать</div>
          <div style={sub}>
            Единственные уведомления, которые способны предотвратить срыв, а не сообщить о нём
            задним числом. «За 3 и за 1» и «за 10, 5 и 2» — разные разговоры: первый про собрать
            бригаду, второй про успеть закрыть хвосты.
          </div>
          {DATE_REMINDERS.map(r => {
            const days = reminderDays(r.key, settings);
            const cfg = settings.reminders?.[r.key] || {};
            const setCfg = (p) => patch({ reminders: { ...settings.reminders, [r.key]: { ...cfg, ...p } } });
            const on = reminderOn(r.key, settings);
            return (
              <div key={r.key} style={{ borderTop: "1px solid #f1f5f9", padding: "12px 0" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8,
                  cursor: editable ? "pointer" : "default" }}>
                  <input type="checkbox" style={box} disabled={!editable} checked={on}
                    onChange={e => setCfg({ on: e.target.checked })} />
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: on ? "#0f172a" : "#94a3b8" }}>
                    {r.icon} {r.label}
                  </span>
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7, opacity: on ? 1 : .4, paddingLeft: 27 }}>
                  {[0, 1, 2, 3, 4, 5, 7, 10, 14, 21, 30].map(d => (
                    <button key={d} type="button" disabled={!editable || !on}
                      onClick={() => setCfg({ days: days.includes(d) ? days.filter(x => x !== d) : [...days, d] })}
                      style={{ border: "1px solid " + (days.includes(d) ? "#93c5fd" : "#e2e8f0"),
                        background: days.includes(d) ? "#eff6ff" : "#fff",
                        color: days.includes(d) ? "#1d4ed8" : "#64748b", fontWeight: days.includes(d) ? 700 : 500,
                        borderRadius: 8, padding: "5px 11px", fontSize: 12, fontFamily: "inherit",
                        cursor: editable && on ? "pointer" : "default" }}>
                      {d === 0 ? "в день" : `за ${d}`}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div style={card}>
          <div style={h}>Пороги: с какого момента считать проблемой</div>
          <div style={sub}>
            Считаются из тех же чисел, что показывает «Главная» — разойтись они не могут.
            Уходят раз в сутки. Пока горит одно и то же, повтора нет; появилось новое — приходит сразу.
          </div>
          {NOTIFY_REMINDERS.map(r => {
            const on = reminderOn(r.key, settings);
            const cfg = settings.reminders?.[r.key] || {};
            const setCfg = (p) => patch({ reminders: { ...settings.reminders, [r.key]: { ...cfg, ...p } } });
            return (
              <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
                borderTop: "1px solid #f1f5f9", padding: "12px 0" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 250,
                  cursor: editable ? "pointer" : "default" }}>
                  <input type="checkbox" style={box} disabled={!editable}
                    checked={on} onChange={e => setCfg({ on: e.target.checked })} />
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: on ? "#0f172a" : "#94a3b8" }}>
                    {r.icon} {r.label}
                  </span>
                </label>
                {r.threshold && (
                  <div style={{ display: "flex", alignItems: "center", gap: 7, opacity: on ? 1 : .4 }}>
                    <span style={{ fontSize: 12, color: "#64748b" }}>{r.threshold.label}</span>
                    <input className="num" style={{ width: 110 }} type="number" min={0} max={r.threshold.max}
                      disabled={!editable || !on} value={reminderNum(r.key, r.threshold.field, settings)}
                      onChange={e => setCfg({ [r.threshold.field]: Math.max(0, Number(e.target.value) || 0) })} />
                    <span style={{ fontSize: 12, color: "#64748b" }}>{r.threshold.unit}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </>)}

      {/* ══ ОБЪЕКТЫ ══ */}
      {section === "objects" && (
        <div style={card}>
          <div style={h}>По каким объектам напоминать</div>
          <div style={sub}>
            Половина объектов в базе через производство ещё не ведётся — это не заброшенная
            работа, а неначатая. Без фильтра сводка вываливала бы по ним «тишина 47 дней»,
            и читать её перестали бы в первую неделю.
            <br />События по объекту (смена статуса, смета, деньги по нему) фильтр тоже глушит.
            А права, сотрудники и бэкапы — нет: у них объекта нет вообще, и случайно
            отключить себе безопасность, отметив один объект, невозможно.
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {OBJECT_MODES.map(m => (
              <label key={m.key} style={{ display: "flex", alignItems: "flex-start", gap: 10,
                border: "1px solid " + (settings.objectMode === m.key ? "#93c5fd" : "#e2e8f0"),
                background: settings.objectMode === m.key ? "#eff6ff" : "#fff",
                borderRadius: 10, padding: "10px 14px", cursor: editable ? "pointer" : "default" }}>
                <input type="radio" name="objmode" disabled={!editable} style={{ marginTop: 3 }}
                  checked={(settings.objectMode || "all") === m.key}
                  onChange={() => patch({ objectMode: m.key })} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{m.label}</div>
                  <div style={{ fontSize: 11.5, color: "#64748b" }}>{m.hint}</div>
                </div>
              </label>
            ))}
          </div>

          <div style={{ background: passing === 0 ? "#fffbeb" : "#f8fafc",
            border: "1px solid " + (passing === 0 ? "#fde68a" : "#e2e8f0"),
            borderRadius: 9, padding: "10px 14px", fontSize: 12.5, marginBottom: 14,
            color: passing === 0 ? "#92400e" : "#475569" }}>
            Сейчас под рассылку попадает <b>{passing}</b> {objects.length ? `из ${objects.length}` : ""} объектов.
            {passing === 0 && " Это полная тишина по объектам — отметьте те, что реально ведёте."}
          </div>

          {settings.objectMode !== "all" && (<>
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              <input className="fi" style={{ maxWidth: 320 }} placeholder="Поиск: клиент, адрес, телефон"
                value={objQuery} onChange={e => setObjQuery(e.target.value)} />
              {editable && (<>
                <button className="btn btn-o" style={{ padding: "7px 14px", fontSize: 12 }}
                  onClick={() => patch({ objectList: [...new Set([...(settings.objectList || []),
                    ...shownObjects.map(o => o.id)])] })}>Отметить показанные</button>
                <button className="btn btn-o" style={{ padding: "7px 14px", fontSize: 12 }}
                  onClick={() => patch({ objectList: [] })}>Снять все</button>
              </>)}
            </div>
            <div style={{ maxHeight: 420, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 10 }}>
              {shownObjects.map(o => {
                const on = (settings.objectList || []).includes(o.id);
                return (
                  <label key={o.id} style={{ display: "flex", alignItems: "center", gap: 10,
                    padding: "9px 14px", borderBottom: "1px solid #f1f5f9", fontSize: 13,
                    background: on ? "#f0f9ff" : "#fff", cursor: editable ? "pointer" : "default" }}>
                    <input type="checkbox" style={box} disabled={!editable} checked={on}
                      onChange={() => patch({ objectList: toggleIn(settings.objectList, o.id) })} />
                    <span style={{ fontWeight: 600, color: "#0f172a", minWidth: 150 }}>
                      {o.clientName || o.address || "Без названия"}
                    </span>
                    <span style={{ fontSize: 11.5, color: "#94a3b8", flex: 1 }}>
                      {[o.address, o.manager].filter(Boolean).join(" · ")}
                    </span>
                  </label>
                );
              })}
              {!shownObjects.length && (
                <div style={{ padding: 20, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                  {objects.length ? "Ничего не найдено" : "Объектов нет"}
                </div>
              )}
            </div>
            {objects.length > shownObjects.length && (
              <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 8 }}>
                Показано {shownObjects.length} из {objects.length} — уточните поиск.
              </div>
            )}
          </>)}
        </div>
      )}

      {/* ══ ОСНОВНОЕ ══ */}
      {section === "basic" && (
        <div style={card}>
          <div style={h}>Рассылка</div>
          <div style={sub}>
            Сообщения собирает и отправляет отдельная служба каждые 15 минут. Она только читает
            данные и никогда их не меняет.
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: editable ? "pointer" : "default" }}>
            <input type="checkbox" checked={!!settings.on} disabled={!editable}
              onChange={e => patch({ on: e.target.checked })} style={{ width: 18, height: 18 }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: settings.on ? "#059669" : "#64748b" }}>
              {settings.on ? "Уведомления включены" : "Уведомления выключены"}
            </span>
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginTop: 16 }}>
            <Field label="Имя бота" hint="без @, как в t.me/…">
              <input className="fi" value={settings.botName || ""} disabled={!editable} placeholder="TitovStroyBot"
                onChange={e => setSettings({ ...settings, botName: e.target.value })}
                onBlur={e => patch({ botName: e.target.value.trim().replace(/^@/, "") })} />
            </Field>
            <Field label="Номер общего чата" hint="бот в группе, команда /id">
              <input className="fi" value={settings.groupChatId || ""} disabled={!editable} placeholder="-1001234567890"
                onChange={e => setSettings({ ...settings, groupChatId: e.target.value })}
                onBlur={e => patch({ groupChatId: e.target.value.trim() })} />
            </Field>
            <Hours label="Сводки и напоминания в" hint="раз в день" value={settings.digestHour ?? 9}
              disabled={!editable} onChange={v => patch({ digestHour: v })} />
            <Hours label="Не беспокоить с" hint="ночью сообщения ждут утра" value={settings.quietFrom ?? 22}
              disabled={!editable} onChange={v => patch({ quietFrom: v })} />
            <Hours label="до" hint="совпадают — тишина выключена" value={settings.quietTo ?? 8}
              disabled={!editable} onChange={v => patch({ quietTo: v })} />
            <Field label="Повтор напоминаний" hint="если ничего не изменилось">
              <select className="fi" value={settings.repeatAfterDays ?? 7} disabled={!editable}
                onChange={e => patch({ repeatAfterDays: Number(e.target.value) })}>
                {[1, 3, 7, 14, 30].map(d => <option key={d} value={d}>раз в {d} дн.</option>)}
                <option value={3650}>не повторять</option>
              </select>
            </Field>
          </div>
          <div style={{ ...sub, marginTop: 16, marginBottom: 0 }}>
            Сводка за неделю приходит по понедельникам, за месяц — 1-го числа.
            <b> Финансы в общий чат лучше не включать: суммы увидят все участники группы.</b>
          </div>
        </div>
      )}
    </div>
  );
}

const thBase = { padding: "9px 8px", textAlign: "center", fontSize: 11, fontWeight: 700,
  color: "#64748b", textTransform: "uppercase", letterSpacing: .3 };
const cellStyle = { padding: "8px 6px", textAlign: "center" };
const box = { width: 16, height: 16 };
const bulkBtn = { fontSize: 10.5, padding: "2px 7px" };

// Готовый набор одним выбором на весь столбец. Расставлять полтора десятка
// галочек каждому вручную никто не станет — а «Прорабу» это один щелчок.
// «своё» показывается, когда после набора что-то поправили руками.
function PresetPick({ presets, current, onPick }) {
  return (
    <select className="fi" value={current === "custom" ? "" : current}
      onChange={e => e.target.value && onPick(e.target.value)}
      style={{ marginTop: 4, width: "100%", fontSize: 10.5, padding: "3px 4px",
        fontWeight: 500, textTransform: "none", color: "#334155" }}>
      <option value="">{current === "custom" ? "своё" : "набор…"}</option>
      {presets.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
    </select>
  );
}
function Field({ label, hint, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", marginBottom: 4 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 10.5, color: "#94a3b8", marginTop: 3 }}>{hint}</div>}
    </div>
  );
}
function Hours({ label, hint, value, disabled, onChange }) {
  return (
    <Field label={label} hint={hint}>
      <select className="fi" value={value} disabled={disabled} onChange={e => onChange(Number(e.target.value))}>
        {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>)}
      </select>
    </Field>
  );
}
