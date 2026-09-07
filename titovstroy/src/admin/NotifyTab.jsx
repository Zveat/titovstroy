// АДМИНКА → УВЕДОМЛЕНИЯ. Кто, что и куда получает в Telegram.
//
// Здесь только настройки. Сама рассылка живёт отдельно (GitHub Actions,
// notify/send.mjs) и в приложение не лезет: приложение не умеет и не должно
// уметь отправлять — иначе уведомления зависели бы от того, открыта ли у
// кого-то вкладка.
//
// ЧТО ГДЕ ХРАНИТСЯ:
//   titovstroy-tg-settings  — общие настройки (эта страница их пишет)
//   titovstroy-tg-links     — кто к какому чату привязан (пишет ТОЛЬКО рассыльщик)
//   карточка сотрудника     — его направления (u.tg), пишется вместе с сотрудниками
import { useEffect, useState } from "react";
import { storage } from "../cloud/storage.js";
import { logChange } from "../cloud/audit.js";
import { TG_LINKS_KEY, TG_SETTINGS_KEY } from "../storageKeys.js";
import { NOTIFY_TOPICS, linkUrl, makeLinkCode, userTopics, userScope } from "../notify/notifyModel.js";

const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "18px 20px", marginBottom: 16 };
const h = { fontSize: 15, fontWeight: 800, color: "#0f172a", marginBottom: 4 };
const sub = { fontSize: 12, color: "#64748b", lineHeight: 1.55, marginBottom: 14 };

export function NotifyTab({ users = [], saveUsers, currentUser, readOnly = false, canEdit = false }) {
  const [settings, setSettings] = useState(null);
  const [links, setLinks] = useState({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const editable = canEdit && !readOnly;

  useEffect(() => {
    (async () => {
      const read = async (key, empty) => {
        try { const r = await storage.get(key); if (r) { const p = JSON.parse(r.value); if (p && typeof p === "object") return p; } }
        catch (e) { /* нет узла или битый JSON — работаем с пустым */ }
        return empty;
      };
      setSettings(await read(TG_SETTINGS_KEY, {
        on: false, botName: "", groupChatId: "", groupTopics: ["sales", "production"],
        quietFrom: 22, quietTo: 8, digestHour: 9,
      }));
      setLinks(await read(TG_LINKS_KEY, {}));
    })();
  }, []);

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(""), 2600); };

  const patchSettings = async (patch) => {
    if (!editable) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    setBusy(true);
    try {
      await storage.set(TG_SETTINGS_KEY, JSON.stringify(next));
      flash("✓ Сохранено");
    } catch (e) { flash("Не сохранилось: " + (e?.message || "ошибка")); }
    setBusy(false);
  };

  // Подписки живут в карточке сотрудника — сохраняются вместе со списком
  // сотрудников тем же путём, что имя и роль. Отдельного узла нет намеренно:
  // меньше мест, где данные о человеке могут разойтись.
  const patchUser = async (id, tgPatch) => {
    if (!editable) return;
    const before = users.find(u => u.id === id);
    const next = users.map(u => u.id === id ? { ...u, tg: { ...(u.tg || {}), ...tgPatch } } : u);
    const okSaved = await saveUsers(next);
    if (okSaved === false) { flash("Нет права сохранять сотрудников"); return; }
    if (tgPatch.topics) {
      logChange(currentUser, { entity: "user", entityId: id, label: before?.name || id,
        field: "уведомления", action: "изменил", old: userTopics(before).join(", ") || "—",
        new: tgPatch.topics.join(", ") || "—" });
    }
    flash("✓ Сохранено");
  };

  const connect = async (u) => {
    // Код рождается здесь и живёт в карточке. Сотруднику остаётся открыть
    // ссылку и нажать «Запустить» — ничего вводить руками не надо.
    const code = u.tg?.code || makeLinkCode();
    if (!u.tg?.code) await patchUser(u.id, { code });
    const url = linkUrl(settings?.botName, code);
    if (!url) { flash("Сначала укажите имя бота выше"); return; }
    try { await navigator.clipboard.writeText(url); flash("Ссылка скопирована — отправьте её сотруднику"); }
    catch (e) { window.prompt("Скопируйте ссылку и отправьте сотруднику:", url); }
  };

  if (!settings) return <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Загрузка…</div>;

  const linked = (u) => !!links[u.id]?.chatId;
  const toggleTopic = (u, key) => {
    const cur = userTopics(u);
    patchUser(u.id, { topics: cur.includes(key) ? cur.filter(t => t !== key) : [...cur, key] });
  };
  const toggleGroupTopic = (key) => {
    const cur = Array.isArray(settings.groupTopics) ? settings.groupTopics : [];
    patchSettings({ groupTopics: cur.includes(key) ? cur.filter(t => t !== key) : [...cur, key] });
  };

  return (
    <div>
      {msg && <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#065f46",
        borderRadius: 9, padding: "9px 14px", fontSize: 13, marginBottom: 14 }}>{msg}</div>}

      {/* ── Включение ── */}
      <div style={card}>
        <div style={h}>Рассылка</div>
        <div style={sub}>
          Сообщения собирает и отправляет отдельная служба по расписанию, каждые 15 минут.
          Она только читает данные и никогда их не меняет. Пока переключатель выключен —
          не отправляется ничего, даже если люди подключены.
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: editable ? "pointer" : "default" }}>
          <input type="checkbox" checked={!!settings.on} disabled={!editable || busy}
            onChange={e => patchSettings({ on: e.target.checked })} style={{ width: 18, height: 18 }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: settings.on ? "#059669" : "#64748b" }}>
            {settings.on ? "Уведомления включены" : "Уведомления выключены"}
          </span>
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12, marginTop: 16 }}>
          <Field label="Имя бота" hint="без @, как в t.me/…">
            <input className="fi" value={settings.botName || ""} disabled={!editable}
              placeholder="TitovStroyBot"
              onChange={e => setSettings({ ...settings, botName: e.target.value })}
              onBlur={e => patchSettings({ botName: e.target.value.trim().replace(/^@/, "") })} />
          </Field>
          <Field label="Сводка по просрочкам" hint="во сколько присылать, раз в день">
            <select className="fi" value={settings.digestHour ?? 9} disabled={!editable}
              onChange={e => patchSettings({ digestHour: Number(e.target.value) })}>
              {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>)}
            </select>
          </Field>
          <Field label="Не беспокоить с" hint="ночью сообщения ждут утра">
            <select className="fi" value={settings.quietFrom ?? 22} disabled={!editable}
              onChange={e => patchSettings({ quietFrom: Number(e.target.value) })}>
              {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>)}
            </select>
          </Field>
          <Field label="до" hint="совпадают — тишина выключена">
            <select className="fi" value={settings.quietTo ?? 8} disabled={!editable}
              onChange={e => patchSettings({ quietTo: Number(e.target.value) })}>
              {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>)}
            </select>
          </Field>
        </div>
      </div>

      {/* ── Общий чат ── */}
      <div style={card}>
        <div style={h}>Общий рабочий чат</div>
        <div style={sub}>
          Добавьте бота в группу и отправьте там команду <b>/id</b> — он ответит номером чата.
          Вставьте номер сюда. В общий чат уходят только командные новости, без адресных
          напоминаний «твой этап просрочен» — те приходят человеку лично.
          <b> Финансы сюда лучше не включать: суммы увидят все, кто есть в группе.</b>
        </div>
        <div style={{ maxWidth: 280, marginBottom: 14 }}>
          <Field label="Номер чата" hint="обычно начинается с минуса">
            <input className="fi" value={settings.groupChatId || ""} disabled={!editable}
              placeholder="-1001234567890"
              onChange={e => setSettings({ ...settings, groupChatId: e.target.value })}
              onBlur={e => patchSettings({ groupChatId: e.target.value.trim() })} />
          </Field>
        </div>
        <TopicChecks topics={NOTIFY_TOPICS} selected={settings.groupTopics || []}
          disabled={!editable} onToggle={toggleGroupTopic} />
      </div>

      {/* ── Сотрудники ── */}
      <div style={card}>
        <div style={h}>Сотрудники</div>
        <div style={sub}>
          Отметьте, кому какие направления нужны, и нажмите «Подключить» — скопируется личная
          ссылка. Сотрудник открывает её, жмёт в Telegram «Запустить», и всё: вводить ничего не надо.
          Отключиться он может сам командой <b>/stop</b>.
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 720 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <Th>Сотрудник</Th>
                <Th>Telegram</Th>
                {NOTIFY_TOPICS.map(t => <Th key={t.key} center title={t.hint}>{t.icon}<br />{t.label.split(" ")[0]}</Th>)}
                <Th center title="Все объекты компании или только те, где человек ответственный">Охват</Th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ fontWeight: 700, color: "#0f172a" }}>{u.name || u.login}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>{u.role}</div>
                  </td>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                    {linked(u) ? (
                      <span style={{ color: "#059669", fontWeight: 700, fontSize: 12 }}>
                        ✓ подключён{links[u.id]?.tgName ? ` · ${links[u.id].tgName}` : ""}
                      </span>
                    ) : editable ? (
                      <button className="btn btn-o" style={{ padding: "5px 12px", fontSize: 12 }}
                        onClick={() => connect(u)}>🔗 Подключить</button>
                    ) : <span style={{ color: "#94a3b8", fontSize: 12 }}>не подключён</span>}
                  </td>
                  {NOTIFY_TOPICS.map(t => (
                    <td key={t.key} style={{ padding: "10px 6px", textAlign: "center" }}>
                      <input type="checkbox" style={{ width: 17, height: 17 }} disabled={!editable}
                        checked={userTopics(u).includes(t.key)} onChange={() => toggleTopic(u, t.key)} />
                    </td>
                  ))}
                  <td style={{ padding: "10px 6px", textAlign: "center" }}>
                    <select className="fi" style={{ width: 108, fontSize: 12, padding: "5px 6px" }}
                      disabled={!editable} value={userScope(u)}
                      onChange={e => patchUser(u.id, { scope: e.target.value })}>
                      <option value="own">свои</option>
                      <option value="all">все</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ ...card, background: "#f8fafc" }}>
        <div style={h}>Что именно приходит</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14 }}>
          {NOTIFY_TOPICS.map(t => (
            <div key={t.key}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 3 }}>{t.icon} {t.label}</div>
              <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>{t.hint}</div>
            </div>
          ))}
        </div>
        <div style={{ ...sub, marginTop: 14, marginBottom: 0 }}>
          Обычные входы в систему, фотоотчёты и галочки чек-листов не рассылаются: их десятки
          за смену, и канал перестали бы читать. Правка прав роли приходит одним сообщением
          на всю пачку, а не тридцатью подряд.
        </div>
      </div>
    </div>
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
function Th({ children, center, title }) {
  return <th title={title} style={{ padding: "9px 10px", textAlign: center ? "center" : "left",
    fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: .4 }}>{children}</th>;
}
function TopicChecks({ topics, selected, disabled, onToggle }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
      {topics.map(t => (
        <label key={t.key} title={t.hint} style={{ display: "flex", alignItems: "center", gap: 7,
          border: "1px solid #e2e8f0", borderRadius: 9, padding: "7px 12px", fontSize: 12.5,
          background: selected.includes(t.key) ? "#eff6ff" : "#fff", cursor: disabled ? "default" : "pointer" }}>
          <input type="checkbox" checked={selected.includes(t.key)} disabled={disabled}
            onChange={() => onToggle(t.key)} style={{ width: 16, height: 16 }} />
          <span>{t.icon} {t.label}</span>
        </label>
      ))}
    </div>
  );
}
