// Публичный кабинет клиента «Прогресс объекта» (#/progress/<токен>, без входа).
// ВНИМАНИЕ: страница клиентская — себестоимость, маржа и подрядчики сюда не выводятся.
// Перенос из App.jsx.
import { useCallback, useEffect, useRef, useState } from "react";
import { storage } from "../cloud/storage.js";
import { COMPANY_WA, DOCS_NODE, PROGRESS_NODE, _PROG_ST } from "../constants.js";
import { fmt } from "../format.js";
import { ClientPhotoReport, ClientTabs, PhotoLightbox, stagesWithPhotos } from "../stage-reports/ClientPhotos.jsx";
import { startPublicProgressAutoRefresh } from "../utils.js";

export function PublicProgress({ token }) {
  const [state, setState] = useState("loading"); // loading | notfound | ok
  const [s, setS] = useState(null);
  const [rmText, setRmText] = useState("");
  const [rmBusy, setRmBusy] = useState(false);
  const [rmSent, setRmSent] = useState(false);
  const [docs, setDocs] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  // Просмотр фото на весь экран: {list, i}. Держим индекс, а не само фото —
  // из полноэкранного режима клиент листает соседние снимки той же работы.
  const [lb, setLb] = useState(null);
  const [photosAll, setPhotosAll] = useState(true);
  // Кабинет разбит на вкладки, как карточка объекта внутри системы. Одной
  // лентой фотоотчёт тонул между готовностью и оплатой, а ради него клиент
  // страницу и открывает.
  const [tab, setTab] = useState("work");
  // Когда последний раз читали ноду документов — см. комментарий в load().
  const _docsReadAt = useRef(0);
  // Загрузка снимка прогресса + документов. isRefresh: не сбрасываем страницу в
  // "недоступно" и не накручиваем счётчик просмотров при ручном обновлении.
  const load = useCallback(async (opts = {}) => {
    const isRefresh = !!opts.isRefresh;
    const readFresh = async (key) => {
      if (isRefresh) {
        const cloud = await storage.getCloudResult(key);
        if (cloud.status !== "unavailable") return cloud;
      }
      return storage.getResult(key);
    };
    let ok = false;
    try {
      // opts.value — значение, которое уже принесла подписка. Второй раз его не запрашиваем:
      // иначе каждое изменение стоило бы двух скачиваний узла вместо одного.
      const r = opts.value !== undefined
        ? { status: opts.value ? "found" : "empty", value: opts.value }
        : await readFresh(PROGRESS_NODE(token));
      if (r.status === "found" && r.value) {
        let data = null; try { data = JSON.parse(r.value); } catch {}
        if (data && data.expiresAt && Date.now() > data.expiresAt) {
          if (!isRefresh) setState("expired");
          return;
        }
        if (data && !data.revoked && Array.isArray(data.stages)) {
          setS(data); setState("ok"); ok = true;
          if (!isRefresh) { try { storage.set(PROGRESS_NODE(token), JSON.stringify({ ...data, viewedAt: Date.now(), viewCount: (data.viewCount || 0) + 1 })); } catch {} }
        }
      }
    } catch {}
    if (!ok && !isRefresh) setState("notfound");
    // Документы клиента (договоры/акты) из отдельной ноды. НЕ на каждом автообновлении:
    // нода весит под сотню килобайт, а страница обновляется раз в 10 секунд — это 30 МБ
    // в час с одной открытой вкладки клиента. Документы меняются раз в недели, поэтому
    // читаем их при открытии страницы и не чаще раза в 10 минут при обновлениях.
    const docsFresh = Date.now() - _docsReadAt.current < 600_000;
    if (!isRefresh || !docsFresh) {
      _docsReadAt.current = Date.now();
      try { const r2 = await readFresh(DOCS_NODE(token)); if (r2.status === "found" && r2.value) { try { setDocs(JSON.parse(r2.value)); } catch {} } } catch {}
    }
  }, [token]);
  useEffect(() => {
    // ПОДПИСКА вместо опроса. Раньше страница перечитывала свой узел каждые 10 секунд — 360
    // полных скачиваний в час с каждой открытой вкладки, круглосуточно, даже когда на объекте
    // неделями ничего не меняется. Клиент оставил кабинет открытым на телефоне — и он один
    // давал гигабайты в сутки. Теперь узел приходит один раз при открытии, дальше — только
    // когда прораб реально что-то обновил. И это ещё и БЫСТРЕЕ прежнего: изменения видны
    // сразу, а не через десять секунд.
    // Первичное чтение оставляем: подписка живёт поверх WebSocket, а он у части клиентов
    // закрыт корпоративной сетью или мобильным оператором. Тогда onValue просто никогда не
    // сработает, и страница осталась бы пустой — а load умеет упасть на REST-фолбэк.
    load();
    const stop = storage.watch(PROGRESS_NODE(token), (value) => {
      load({ isRefresh: true, value: value == null ? "" : value });
    });
    if (stop) return stop;
    // SDK недоступен вовсе — остаёмся на опросе, но редком: две минуты вместо десяти секунд.
    return startPublicProgressAutoRefresh(load, {
      doc: typeof document !== "undefined" ? document : null,
      intervalMs: 120000,
    });
  }, [load, token]);
  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try { await load({ isRefresh: true }); } catch {}
    setRefreshing(false);
  };
  const openHtml = (html) => {
    if (!html) return;
    try { const blob = new Blob([html], { type: "text/html" }); const url = URL.createObjectURL(blob); window.open(url, "_blank"); setTimeout(() => URL.revokeObjectURL(url), 60000); }
    catch (e) { try { const w = window.open("", "_blank"); if (w) { w.document.write(html); w.document.close(); } } catch (e2) {} }
  };

  const fmt = (n) => (Math.round(Number(n) || 0)).toLocaleString("ru-RU");
  const dt = (d) => d ? new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }) : "";
  const submitRemark = async () => {
    const t = rmText.trim(); if (!t || rmBusy) return;
    setRmBusy(true);
    try {
      const r = await storage.getResult(PROGRESS_NODE(token));
      let node = s || {}; try { if (r.status === "found" && r.value) node = JSON.parse(r.value); } catch {}
      const list = Array.isArray(node.clientRemarks) ? node.clientRemarks : [];
      const nrm = { id: "cr" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text: t, ts: Date.now(), done: false };
      const updated = { ...node, clientRemarks: [...list, nrm] };
      await storage.set(PROGRESS_NODE(token), JSON.stringify(updated));
      setS(updated); setRmText(""); setRmSent(true); setTimeout(() => setRmSent(false), 4000);
    } catch (e) {}
    setRmBusy(false);
  };
  const wrap = (children) => (
    <div style={{ minHeight: "100vh", width: "100%", overflowX: "hidden", background: "linear-gradient(180deg,#f2f4f8 0%,#e8ebf0 100%)", padding: "0 0 32px", boxSizing: "border-box", fontFamily: "'Golos Text','Segoe UI',sans-serif", color: "#0f172a", WebkitFontSmoothing: "antialiased" }}>
      <div style={{ maxWidth: 600, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>{children}</div>
    </div>
  );

  if (state === "loading") return wrap(<div style={{ textAlign: "center", padding: "90px 0", color: "#94a3b8" }}>Загрузка…</div>);
  if (state === "notfound") return wrap(
    <div style={{ textAlign: "center", padding: "70px 20px", margin: "20px 12px", background: "#fff", borderRadius: 16 }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
      <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>Ссылка недоступна</div>
      <div style={{ fontSize: 13, color: "#64748b" }}>Возможно, доступ закрыт. Свяжитесь с менеджером: <a href={"https://wa.me/" + COMPANY_WA} style={{ color: "#059669" }}>WhatsApp</a></div>
    </div>
  );
  if (state === "expired") return wrap(
    <div style={{ textAlign: "center", padding: "70px 20px", margin: "20px 12px", background: "#fff", borderRadius: 16 }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
      <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>Срок действия ссылки истёк</div>
      <div style={{ fontSize: 13, color: "#64748b" }}>Свяжитесь с менеджером, чтобы получить новую ссылку: <a href={"https://wa.me/" + COMPANY_WA} style={{ color: "#059669" }}>WhatsApp</a></div>
    </div>
  );

  // Процент считаем прямо из этапов снимка — чтобы всегда совпадал с производством
  // (по количеству готовых этапов), независимо от того, какая версия кода публиковала снимок.
  const _stg = Array.isArray(s.stages) ? s.stages : [];
  const _doneN = _stg.filter(st => (st.status || "todo") === "done").length;
  const pct = _stg.length ? Math.round(_doneN / _stg.length * 100) : Math.max(0, Math.min(100, Number(s.progressPct) || 0));
  const pay = s.payment || {};
  const remarks = Array.isArray(s.clientRemarks) ? s.clientRemarks : [];
  const daysLeft = (s.planEndDate && !s.factEndDate) ? Math.ceil((new Date(s.planEndDate).getTime() - Date.now()) / 86400000) : null;
  // Настройки видимости (старые снимки без vis → показываем всё, как раньше)
  const vis = s.vis || {};
  const showStages = vis.stages !== false, showPay = vis.payments !== false, showRemarks = vis.remarks !== false;
  const showPhotos = vis.photos !== false;
  // Фотоотчёт по работам. Снимок уже вычищен (скрытые и недогруженные не приходят),
  // здесь только раскладываем по работам и стадиям: до → скрытые работы → после.
  const photoStages = (showStages && showPhotos) ? stagesWithPhotos(_stg) : [];
  const photoOf = (st) => (photoStages.find(g => g.stage === st) || {}).list || [];
  // Вкладки кабинета. Показываем только то, что реально есть: пустая вкладка
  // «Документы» у объекта без документов — обещание, которого никто не давал.
  const _docsCount = docs ? ((docs.contracts || []).length + (docs.acts || []).length + (docs.estimates || []).length) : 0;
  const tabItems = [
    ["work", "Ход работ", "🔨", showStages || history.length > 0],
    ["photos", "Фотоотчёт", "📷", photoStages.length > 0],
    ["pay", "Оплата", "💳", showPay && !!s.payment],
    ["docs", "Документы", "📄", vis.docs !== false && _docsCount > 0],
    ["notes", "Замечания", "💬", showRemarks],
  ].filter(item => item[3]);
  // Выбранная вкладка могла пропасть между обновлениями снимка — тогда страница
  // осталась бы пустой без единого объяснения.
  const activeTab = tabItems.some(([key]) => key === tab) ? tab : (tabItems[0]?.[0] || "work");
  // Работы идут ПАРАЛЛЕЛЬНО и НЕ по порядку списка. Поэтому «сейчас в работе» — это ВСЕ этапы
  // со статусом progress, а «задержки» — delayed. Никакой ложной последовательности «текущий→следующий».
  const inWork = _stg.filter(st => (st.status || "todo") === "progress");
  const delayedStages = _stg.filter(st => (st.status || "todo") === "delayed");
  // Группировка этапов по категории (черновые / чистовые / санузел …)
  const groups = []; const gmap = {};
  for (const st of (s.stages || [])) { const c = st.cat || "Работы"; if (!gmap[c]) { gmap[c] = { cat: c, items: [] }; groups.push(gmap[c]); } gmap[c].items.push(st); }
  // ── Премиальная палитра/стили публичной страницы ──
  const BRASS = "#b8904a", INK = "#0f172a", MUT = "#64748b", FAINT = "#94a3b8", GREEN = "#059669", BLUE = "#2563eb";
  const card = { background: "#fff", borderRadius: 20, padding: "18px 20px", margin: "0 14px 14px", boxShadow: "0 6px 22px -12px rgba(15,23,42,.16)", border: "1px solid rgba(15,23,42,.04)", boxSizing: "border-box" };
  const h = { fontWeight: 800, fontSize: 15.5, marginBottom: 12, letterSpacing: "-.01em", color: INK };
  const docBtn = { display: "flex", alignItems: "center", gap: 12, width: "100%", boxSizing: "border-box", background: "#f8fafc", border: "1px solid #eef1f5", borderRadius: 13, padding: "11px 12px", cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "background .15s,border-color .15s" };
  // Кольцо прогресса (SVG)
  const _R = 42, _C = 2 * Math.PI * _R;
  const Ring = () => (
    <div style={{ position: "relative", width: 104, height: 104, flexShrink: 0 }}>
      <svg width="104" height="104" viewBox="0 0 104 104">
        <circle cx="52" cy="52" r={_R} fill="none" stroke="#eef1f5" strokeWidth="9" />
        <circle cx="52" cy="52" r={_R} fill="none" stroke="url(#pg)" strokeWidth="9" strokeLinecap="round"
          strokeDasharray={_C} strokeDashoffset={_C * (1 - pct / 100)} transform="rotate(-90 52 52)" style={{ transition: "stroke-dashoffset .6s ease" }} />
        <defs><linearGradient id="pg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#34d399" /><stop offset="1" stopColor={GREEN} /></linearGradient></defs>
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 27, fontWeight: 900, color: INK, lineHeight: 1, letterSpacing: "-.02em" }}>{pct}<span style={{ fontSize: 14 }}>%</span></div>
        <div style={{ fontSize: 10, color: FAINT, fontWeight: 600, marginTop: 2 }}>готово</div>
      </div>
    </div>
  );
  // Узел таймлайна этапа (готов / в работе / задержка / предстоит) — по статусу, без «порядка»
  const stageNode = (status) => {
    if (status === "done") return { bg: BRASS, brd: BRASS, mark: "✓", ring: "none" };
    if (status === "progress") return { bg: BLUE, brd: BLUE, mark: "", ring: "0 0 0 4px rgba(37,99,235,.16)" };
    if (status === "delayed") return { bg: "#dc2626", brd: "#dc2626", mark: "!", ring: "0 0 0 4px rgba(220,38,38,.14)" };
    return { bg: "#fff", brd: "#cbd5e1", mark: "", ring: "none" };
  };

  // ── История для клиента: безопасная лента событий (только клиентские факты из снимка) ──
  const _tsOf = (d) => { if (!d) return 0; const t = (typeof d === "number") ? d : new Date(d).getTime(); return isNaN(t) ? 0 : t; };
  const history = [];
  if (s.startDate) history.push({ ts: _tsOf(s.startDate), icon: "🚀", color: BLUE, text: "Работы начаты" });
  if (showStages) for (const st of _stg) { if ((st.status || "todo") === "done" && st.factEnd) history.push({ ts: _tsOf(st.factEnd), icon: "✅", color: GREEN, text: `Этап «${st.name}» завершён` }); }
  if (showPay) for (const p of (Array.isArray(s.payments) ? s.payments : [])) { const t = _tsOf(p.date); if (t) history.push({ ts: t, icon: "💰", color: BRASS, text: "Оплата принята", amount: p.amount }); }
  if (showRemarks) for (const rm of remarks) { if (rm.done && rm.text) history.push({ ts: _tsOf(rm.ts), icon: "💬", color: GREEN, text: `Замечание выполнено: «${rm.text}»` }); }
  if (s.factEndDate) history.push({ ts: _tsOf(s.factEndDate), icon: "🏁", color: GREEN, text: "Объект сдан" });
  if (s.clientMessage && s.clientMessage.updatedAt) history.push({ ts: _tsOf(s.clientMessage.updatedAt), icon: "📣", color: BRASS, text: "Обновлено сообщение от компании" });
  history.sort((a, b) => (b.ts || 0) - (a.ts || 0));

  return wrap(<>
    {/* Шапка */}
    <div style={{ background: "linear-gradient(135deg,#0f172a 0%,#1e293b 62%,#2a3446 100%)", color: "#fff", padding: "22px 22px 24px", margin: "14px 14px 14px", borderRadius: 22, position: "relative", overflow: "hidden", boxShadow: "0 12px 32px -14px rgba(15,23,42,.55)" }}>
      <div style={{ position: "absolute", top: -45, right: -35, width: 160, height: 160, borderRadius: "50%", background: "radial-gradient(circle, rgba(184,144,74,.24), transparent 70%)" }} />
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 11, marginBottom: 18 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: BRASS, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 21, fontWeight: 900, color: "#0c0e1a", boxShadow: "0 4px 14px rgba(184,144,74,.45)" }}>T</div>
        <div style={{ fontSize: 17, fontWeight: 800, flex: 1, minWidth: 0, letterSpacing: "-.01em" }}>TitovStroy</div>
        <button onClick={refresh} disabled={refreshing} title="Обновить"
          style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.16)", color: "#e2e8f0", borderRadius: 10, padding: "7px 12px", fontSize: 12.5, fontWeight: 700, cursor: refreshing ? "default" : "pointer", fontFamily: "inherit", flexShrink: 0 }}>
          <span style={{ display: "inline-block", transition: "transform .6s ease", transform: refreshing ? "rotate(360deg)" : "none" }}>⟳</span>{refreshing ? "" : "Обновить"}
        </button>
      </div>
      <div style={{ position: "relative", fontSize: 10.5, color: FAINT, marginBottom: 5, textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 700 }}>Ваш объект</div>
      <div style={{ position: "relative", fontSize: 22, fontWeight: 900, lineHeight: 1.15, letterSpacing: "-.02em" }}>{s.objectAddress || s.clientName || "Ремонт"}</div>
      {s.managerName && <div style={{ position: "relative", fontSize: 12.5, color: "#cbd5e1", marginTop: 13, display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 20, padding: "5px 12px" }}>Менеджер: <b style={{ color: "#fff" }}>{s.managerName}</b></div>}
    </div>

    {/* Сообщение от компании */}
    {s.clientMessage && s.clientMessage.text && (
      <div style={{ ...card, borderLeft: `4px solid ${BRASS}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 15 }}>💬</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: INK }}>Сообщение от компании</span>
          {s.clientMessage.updatedAt && <span style={{ fontSize: 11, color: FAINT, marginLeft: "auto" }}>{new Date(s.clientMessage.updatedAt).toLocaleDateString("ru-RU")}</span>}
        </div>
        <div style={{ fontSize: 14, color: "#334155", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{s.clientMessage.text}</div>
      </div>
    )}

    {/* Готовность — кольцо + факты */}
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <Ring />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15.5, fontWeight: 800, color: INK, marginBottom: 9, letterSpacing: "-.01em" }}>Готовность объекта</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5, color: MUT }}>
            {(_stg.length > 0) && <div>Этапов готово: <b style={{ color: INK }}>{_doneN} из {_stg.length}</b></div>}
            {s.startDate && <div>Старт: <b style={{ color: INK }}>{dt(s.startDate)}</b></div>}
            {s.planEndDate && <div>План сдачи: <b style={{ color: INK }}>{dt(s.planEndDate)}</b></div>}
            {s.factEndDate ? <div style={{ color: GREEN, fontWeight: 700 }}>✓ Сдан {dt(s.factEndDate)}</div>
              : daysLeft != null && <div style={{ color: daysLeft < 0 ? "#dc2626" : INK, fontWeight: daysLeft < 0 ? 700 : 400 }}>{daysLeft < 0 ? `Просрочка ${-daysLeft} дн.` : `Осталось ~${daysLeft} дн.`}</div>}
          </div>
        </div>
      </div>
    </div>

    <ClientTabs items={tabItems} active={activeTab} onPick={setTab} ui={{ INK, MUT }}
      badges={{ photos: photoStages.reduce((n, g) => n + g.list.length, 0) }} />

    {/* Сейчас в работе — ВСЕ параллельные этапы (progress) + задержки. Без ложного «далее». */}
    {activeTab === "work" && showStages && !s.factEndDate && (inWork.length > 0 || delayedStages.length > 0) && (
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 15 }}>🔨</span>
          <span style={{ fontSize: 15.5, fontWeight: 800, color: INK, letterSpacing: "-.01em" }}>Сейчас в работе</span>
          <span style={{ fontSize: 11, color: FAINT, marginLeft: "auto" }}>работы идут параллельно</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {inWork.map((st, i) => (
            <div key={"w" + i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 13px", background: "linear-gradient(135deg,#eff6ff,#f7faff)", border: "1px solid #dbeafe", borderRadius: 14, boxSizing: "border-box" }}>
              <span style={{ width: 30, height: 30, borderRadius: 9, background: BLUE, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0, boxShadow: "0 4px 12px -4px rgba(37,99,235,.5)" }}>🔨</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: INK, lineHeight: 1.25, overflowWrap: "break-word" }}>{st.name}</div>
                <div style={{ fontSize: 11.5, color: MUT, marginTop: 2 }}>{st.cat}{st.planEnd ? ` · до ${dt(st.planEnd)}` : ""}</div>
              </div>
            </div>
          ))}
          {delayedStages.map((st, i) => (
            <div key={"d" + i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 13px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 14, boxSizing: "border-box" }}>
              <span style={{ width: 30, height: 30, borderRadius: 9, background: "#dc2626", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 900, flexShrink: 0 }}>!</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: INK, lineHeight: 1.25, overflowWrap: "break-word" }}>{st.name}</div>
                <div style={{ fontSize: 11.5, color: "#dc2626", fontWeight: 700, marginTop: 2 }}>Задержка{st.planEnd ? ` · срок был ${dt(st.planEnd)}` : ""}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )}

    {/* Фотоотчёт — доказательство работ. Клиент видит, что было до, что спрятано
        внутри конструкции (каркас, утеплитель, разводка) и что получилось. */}
    {activeTab === "photos" && <ClientPhotoReport groups={photoStages} ui={{ card, INK, BRASS, FAINT, BLUE }}
      expanded={photosAll} onExpand={setPhotosAll} onOpen={setLb} />}

    {/* Ход работ — таймлайн */}
    {activeTab === "work" && showStages && (
    <div style={card}>
      <div style={h}>Ход работ</div>
      {groups.length === 0 && <div style={{ color: FAINT, fontSize: 13, padding: "8px 0" }}>Этапы появятся по мере старта работ.</div>}
      {groups.map((g, gi) => {
        const dn = g.items.filter(x => (x.status || "todo") === "done").length;
        return (
          <div key={gi} style={{ marginBottom: gi < groups.length - 1 ? 18 : 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 11.5, fontWeight: 800, color: BRASS, textTransform: "uppercase", letterSpacing: ".05em" }}>{g.cat}</span>
              <span style={{ fontSize: 11, color: FAINT, fontWeight: 700, background: "#f8fafc", borderRadius: 20, padding: "2px 9px" }}>{dn}/{g.items.length}</span>
            </div>
            <div style={{ position: "relative" }}>
              <div style={{ position: "absolute", left: 10, top: 14, bottom: 14, width: 2, background: "#eef1f5" }} />
              {g.items.map((st, i) => {
                const status = st.status || "todo";
                const isCur = status === "progress";
                const nd = stageNode(status);
                const cfg = _PROG_ST[status] || _PROG_ST.todo;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 13, padding: "7px 0", position: "relative" }}>
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: nd.bg, border: `2px solid ${nd.brd}`, boxShadow: nd.ring, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#fff", fontWeight: 900, zIndex: 1 }}>{nd.mark}</div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: isCur ? 800 : 600, color: status === "done" ? "#475569" : INK }}>{st.name}</div>
                      <div style={{ fontSize: 11, color: cfg.c, fontWeight: 700, marginTop: 1 }}>{cfg.l}{st.planEnd ? ` · до ${dt(st.planEnd)}` : ""}</div>
                    </div>
                    {photoOf(st).length > 0 && (
                      <button onClick={() => setLb({ list: photoOf(st), i: 0, title: st.name })}
                        style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#f8fafc", border: "1px solid #eef1f5", borderRadius: 20, padding: "4px 9px", fontSize: 11.5, fontWeight: 800, color: BLUE, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                        📷 {photoOf(st).length}
                      </button>
                    )}
                    {Number(st.priceClient) > 0 && <div style={{ fontSize: 12.5, fontWeight: 800, color: MUT, flexShrink: 0 }}>{fmt(st.priceClient)} ₸</div>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
    )}

    {/* Оплата */}
    {activeTab === "pay" && showPay && s.payment && (() => {
      const fill = pay.budget > 0 ? Math.min(100, Math.round((pay.paid || 0) / pay.budget * 100)) : 0;
      return (
      <div style={card}>
        <div style={h}>Оплата по договору</div>
        {pay.budget > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7 }}>
              <span style={{ fontSize: 19, fontWeight: 900, color: GREEN, letterSpacing: "-.01em" }}>{fmt(pay.paid)} <span style={{ fontSize: 12, fontWeight: 600, color: FAINT }}>из {fmt(pay.budget)} ₸</span></span>
              <span style={{ fontSize: 13, fontWeight: 800, color: fill >= 100 ? GREEN : BLUE }}>{fill}%</span>
            </div>
            <div style={{ height: 9, background: "#eef1f5", borderRadius: 6, overflow: "hidden" }}>
              <div style={{ width: fill + "%", height: "100%", background: `linear-gradient(90deg,#34d399,${GREEN})`, borderRadius: 6, transition: "width .5s" }} />
            </div>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 13.5, paddingTop: pay.budget > 0 ? 12 : 0, borderTop: pay.budget > 0 ? "1px solid #f1f5f9" : "none" }}>
          <span style={{ color: MUT }}>Остаток к оплате</span><b style={{ color: pay.remaining > 0 ? "#dc2626" : GREEN, fontSize: 15.5 }}>{fmt(pay.remaining)} ₸</b>
        </div>
      </div>
      );
    })()}

    {/* Документы (сметы + договоры + акты) */}
    {activeTab === "docs" && vis.docs !== false && docs && ((docs.contracts || []).length > 0 || (docs.acts || []).length > 0 || (docs.estimates || []).length > 0) && (
      <div style={card}>
        <div style={h}>Документы</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            ...(docs.estimates || []).map(d => ({ ...d, ic: "📋" })),
            ...(docs.contracts || []).map(d => ({ ...d, ic: "📄" })),
            ...(docs.acts || []).map(d => ({ ...d, ic: "🧾" })),
          ].map((d, i) => (
            <button key={i} onClick={() => openHtml(d.html)} style={docBtn}
              onMouseEnter={e => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#cbd5e1"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#eef1f5"; }}>
              <span style={{ width: 36, height: 36, borderRadius: 10, background: "#fff", border: "1px solid #eef1f5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>{d.ic}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: INK, display: "block" }}>{d.title}</span>
                {d.total > 0 && <span style={{ fontSize: 11, color: MUT }}>{fmt(d.total)} ₸{d.date ? ` · ${new Date(d.date).toLocaleDateString("ru-RU")}` : ""}</span>}
              </span>
              <span style={{ fontSize: 11.5, color: BLUE, fontWeight: 700, flexShrink: 0 }}>Открыть ↗</span>
            </button>
          ))}
        </div>
      </div>
    )}

    {/* Замечания от клиента */}
    {activeTab === "notes" && showRemarks && (
    <div style={card}>
      <div style={h}>Замечания и пожелания</div>
      <div style={{ fontSize: 12.5, color: FAINT, marginBottom: 12, lineHeight: 1.45 }}>Напишите, если что-то нужно поправить или уточнить — замечание попадёт прорабу.</div>
      <textarea value={rmText} onChange={e => setRmText(e.target.value)} placeholder="Например: в спальне переделать угол у окна…" rows={2}
        style={{ width: "100%", boxSizing: "border-box", border: "1px solid #e2e8f0", borderRadius: 13, padding: "11px 13px", fontSize: 13.5, fontFamily: "inherit", outline: "none", resize: "vertical", marginBottom: 10 }} />
      <button onClick={submitRemark} disabled={!rmText.trim() || rmBusy}
        style={{ width: "100%", boxSizing: "border-box", background: (!rmText.trim() || rmBusy) ? "#cbd5e1" : `linear-gradient(135deg,${BLUE},#1d4ed8)`, color: "#fff", border: "none", borderRadius: 13, padding: "12px", fontSize: 14, fontWeight: 800, cursor: (!rmText.trim() || rmBusy) ? "default" : "pointer", fontFamily: "inherit", boxShadow: (!rmText.trim() || rmBusy) ? "none" : "0 8px 20px -10px rgba(37,99,235,.6)" }}>
        {rmBusy ? "Отправляю…" : "Отправить замечание"}
      </button>
      {rmSent && <div style={{ fontSize: 12.5, color: GREEN, fontWeight: 700, marginTop: 10, textAlign: "center" }}>✓ Замечание отправлено, спасибо!</div>}
      {remarks.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
          {remarks.slice().reverse().map((rm, i) => (
            <div key={rm.id || i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 12px", background: rm.done ? "#f0fdf4" : "#f8fafc", borderRadius: 12, border: "1px solid " + (rm.done ? "#bbf7d0" : "#eef1f5") }}>
              <span style={{ fontSize: 14, flexShrink: 0, color: rm.done ? GREEN : "#f59e0b", marginTop: 1 }}>{rm.done ? "✓" : "⏳"}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, color: INK, lineHeight: 1.4 }}>{rm.text}</div>
                <div style={{ fontSize: 10.5, color: rm.done ? GREEN : "#f59e0b", fontWeight: 700, marginTop: 3 }}>{rm.done ? "Выполнено" : "В работе"}{rm.ts ? ` · ${new Date(rm.ts).toLocaleDateString("ru-RU")}` : ""}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
    )}

    {/* История — безопасная лента событий по объекту */}
    {activeTab === "work" && history.length > 0 && (
      <div style={card}>
        <div style={h}>История</div>
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", left: 15, top: 14, bottom: 14, width: 2, background: "#eef1f5" }} />
          {history.map((ev, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "8px 0", position: "relative" }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: "#fff", border: `1px solid ${ev.color}30`, boxShadow: `0 2px 8px -3px ${ev.color}55`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, zIndex: 1 }}>{ev.icon}</div>
              <div style={{ minWidth: 0, flex: 1, paddingTop: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: INK, lineHeight: 1.35, overflowWrap: "break-word" }}>
                  {ev.text}{ev.amount ? <b style={{ color: BRASS }}> {fmt(ev.amount)} ₸</b> : null}
                </div>
                {ev.ts ? <div style={{ fontSize: 11.5, color: FAINT, fontWeight: 600, marginTop: 2 }}>{dt(ev.ts)}</div> : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    )}

    <div style={{ textAlign: "center", fontSize: 11.5, color: FAINT, marginTop: 20, paddingBottom: 4 }}>TitovStroy · ремонт и отделка{s.publishedAt ? ` · обновлено ${new Date(s.publishedAt).toLocaleDateString("ru-RU")}` : ""}</div>

    <PhotoLightbox value={lb} onChange={setLb} onClose={() => setLb(null)} />
  </>);
}
