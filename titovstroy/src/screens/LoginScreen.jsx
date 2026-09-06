// Экран входа. Перенос из App.jsx.
import { useState } from "react";
import { lockoutMessage, requestServerLogin } from "../auth/loginClient.js";
import { clearLoginAttempts, getLoginLockout, registerFailedLogin, verifyPassword } from "../auth/loginGuard.js";
import { logChange } from "../cloud/audit.js";
import { signInAsStaff, storage } from "../cloud/storage.js";
import { DEFAULT_USERS } from "../constants.js";
import { SESSION_KEY, USERS_KEY } from "../storageKeys.js";

// ─── ЭКРАН ВХОДА ─────────────────────────────────────────────────────────────
export function LoginScreen({ onLogin, notice = "" }) {
  const [login, setLogin]   = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const handleLogin = async () => {
    if (loading) return; // защита от двойной отправки
    if (!login.trim() || !password.trim()) { setError("Введите логин и пароль"); return; }
    // Блокировка после серии неверных попыток — защита от простого перебора пароля.
    const lockUntil = getLoginLockout(login.trim());
    if (lockUntil) {
      const minLeft = Math.max(1, Math.ceil((lockUntil - Date.now()) / 60000));
      setError(`Слишком много неверных попыток. Попробуйте снова через ${minLeft} мин.`);
      return;
    }
    setLoading(true); setError("");

    // Общий хвост удачного входа — один и для серверной проверки, и для запасной
    // браузерной: сессия, журнал, переход в приложение.
    const finishLogin = (user) => {
      clearLoginAttempts(login.trim());
      const { password: _pw, ...safeUser } = user; // не храним пароль в сессии
      const sessUser = { ...safeUser, authAt: Date.now() }; // время входа — для инвалидации сессии при смене пароля
      try { localStorage.setItem(SESSION_KEY, JSON.stringify({ user: sessUser, savedAt: Date.now() })); } catch(e) {}
      // Вход в систему — базовое событие журнала: без него нельзя понять, кто вообще
      // мог что-то сделать в конкретный день, и не заходил ли уволенный сотрудник.
      logChange(sessUser, { entity: "session", entityId: sessUser.id, label: sessUser.name || sessUser.login,
        field: "вход", action: "вошёл в систему", old: "", new: sessUser.role || "" });
      onLogin(sessUser);
    };
    const failLogin = (message) => {
      registerFailedLogin(login.trim());
      // Неудачные попытки тоже пишем: подбор пароля должен быть виден.
      logChange({ id: "?", name: login.trim() }, { entity: "session", entityId: "",
        label: login.trim(), field: "вход", action: "неудачная попытка входа", old: "", new: "" });
      setError(message);
      setLoading(false);
    };

    // ── ОСНОВНОЙ ПУТЬ: пароль проверяет сервер ──
    // Он же выдаёт кастомный токен Firebase с claims {staff:true, role}. Только после
    // этого правила базы могут отличить сотрудника от постороннего, а список
    // пользователей (с хэшами паролей) браузеру читать больше не нужно.
    const server = await requestServerLogin(login.trim(), password);
    if (server.status === "locked") { setError(lockoutMessage(server.retryAfterMs)); setLoading(false); return; }
    if (server.status === "invalid") { failLogin("Неверный логин или пароль"); return; }
    if (server.status === "ok") {
      if (!(await signInAsStaff(server.token))) {
        setError("Пароль верный, но войти в облако не удалось. Проверьте интернет и попробуйте снова.");
        setLoading(false);
        return;
      }
      finishLogin(server.user);
      return; // компонент размонтируется, setLoading вызывать нельзя
    }

    // ── ЗАПАСНОЙ ПУТЬ: сервер входа ещё не настроен ──
    // Работает ровно до того момента, пока правила базы открыты. Как только их закрутят,
    // titovstroy-users перестанет читаться из браузера, и этот путь отомрёт сам. Нужен
    // он только на время выкатки: код уезжает раньше, чем проставлены ключи функции, и
    // без запасного пути обновление заперло бы снаружи всех, включая владельца.

    // Загружаем пользователей. КРИТИЧНО различать "база подтверждённо пуста" (первый
    // запуск — можно войти дефолтным admin) и "база недоступна" (сеть моргнула) — раньше
    // оба случая тихо падали на DEFAULT_USERS по таймауту в 1.5с, а значит логин/пароль
    // из бандла (admin/titov2024) реально пускал в систему при любом сетевом сбое, даже
    // если настоящий пароль давно сменили. Теперь при "unavailable" — честная ошибка,
    // без входа по дефолтным кредам.
    let users, loadedFromStorage = false;
    const res = await storage.getResult(USERS_KEY);
    if (res.status === "found") {
      // Повреждённый JSON (не распарсился/не массив) — это НЕ «базы нет», список
      // пользователей реально существует и в нём чужие пароли. Раньше это тихо падало
      // на DEFAULT_USERS — вход по вшитым в бандл admin/titov2024 прошёл бы, даже если
      // реальные пароли давно другие. Теперь — честная блокировка входа, не бэкдор.
      try {
        const parsed = JSON.parse(res.value);
        if (!Array.isArray(parsed)) throw new Error("users is not an array");
        users = parsed; loadedFromStorage = true;
      } catch(e) {
        setError("Список пользователей повреждён — вход заблокирован для безопасности. Обратитесь к администратору.");
        setLoading(false);
        return;
      }
    } else if (res.status === "empty") {
      users = DEFAULT_USERS;
    } else {
      setError("Не удалось подключиться к базе. Проверьте интернет и попробуйте снова.");
      setLoading(false);
      return;
    }

    const candidate = users.find(u => u.login.toLowerCase() === login.trim().toLowerCase());
    const ok = candidate ? await verifyPassword(password, candidate.password) : false;

    if (ok) {
      // Пароль не мигрируем ДО получения editor-lock: экран входа не имеет права менять общую
      // базу, пока другая вкладка может быть активным редактором. Миграция выполняется только
      // при следующей явной смене пароля из авторизованной вкладки.
      finishLogin(candidate);
      return; // компонент размонтируется, setLoading вызывать нельзя
    }
    failLogin("Неверный логин или пароль");
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

          {/* notice — объяснение, почему человека вернуло на вход (устаревшая сессия).
              Это не ошибка ввода, поэтому и выглядит иначе: спокойно, без красного. */}
          {notice && !error && (
            <div style={{background:"rgba(180,83,9,.1)",border:"1px solid rgba(180,83,9,.25)",borderRadius:7,padding:"9px 12px",fontSize:12,color:"#b45309",marginBottom:16,textAlign:"center"}}>
              {notice}
            </div>
          )}
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
