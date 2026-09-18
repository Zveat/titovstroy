// Конфигурация Firebase и признак окружения. Вынесено из App.jsx без изменений:
// на проде переменных окружения нет, поэтому берётся зашитый _FB_PROD.

// Боевая база (по умолчанию). НЕ меняется — на продакшне переменных окружения нет,
// поэтому используется именно этот конфиг, как раньше.
export const _FB_PROD = {
  apiKey:            "AIzaSyCPawCUYGY20SB5cLLszjoNzK5ytew9tCs",
  authDomain:        "titovstroy-da1cf.firebaseapp.com",
  databaseURL:       "https://titovstroy-da1cf-default-rtdb.firebaseio.com",
  projectId:         "titovstroy-da1cf",
  storageBucket:     "titovstroy-da1cf.firebasestorage.app",
  messagingSenderId: "736574510792",
  appId:             "1:736574510792:web:b5d243a051caf4887337fd"
};
// Конфиг из окружения (Vercel: разные значения для Production/Preview). Если задан
// VITE_FB_DATABASE_URL — используем его (dev-база на превью-ветке), иначе — боевую.
export const _env = (typeof import.meta !== "undefined" && import.meta.env) ? import.meta.env : {};
export const _FB_ENV = {
  apiKey:            _env.VITE_FB_API_KEY,
  authDomain:        _env.VITE_FB_AUTH_DOMAIN,
  databaseURL:       _env.VITE_FB_DATABASE_URL,
  projectId:         _env.VITE_FB_PROJECT_ID,
  storageBucket:     _env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: _env.VITE_FB_SENDER_ID,
  appId:             _env.VITE_FB_APP_ID,
};
// ДВА РАЗНЫХ ВОПРОСА, КОТОРЫЕ РАНЬШЕ БЫЛИ ОДНИМ.
//
// Первый: КАКОЙ БАЗОЙ пользоваться. Заданы переменные — берём их, нет — зашитую.
// Второй: ЭТО ПЕСОЧНИЦА ИЛИ БОЕВАЯ УСТАНОВКА КОМПАНИИ. От него зависит метка
// «🧪 ТЕСТ» в шапке, предупреждение перед опасными операциями, авто-миграции
// (они разрешены только в песочнице) и уведомления в Telegram.
//
// Раньше ответ был один на оба: «есть переменные — значит песочница». Для одной
// компании это работало, но система готовится к установке у других: у них
// переменные будут заданы ОБЯЗАТЕЛЬНО (своя база), и они увидели бы у себя
// «ТЕСТ · dev-база», а уведомления бы молчали.
//
// Теперь вид установки задаётся явно переменной VITE_APP_ENV = prod | dev.
// Не задана — старое поведение, чтобы ничего не сломать у нас: есть переменные
// значит песочница. Умолчание намеренно осторожное: незаполненная настройка
// приводит к лишней метке, а не к молчаливой работе на чужих боевых данных.
export const HAS_ENV_CONFIG = !!_FB_ENV.databaseURL;
export const firebaseConfig = HAS_ENV_CONFIG ? _FB_ENV : _FB_PROD;
export const IS_DEV_ENV = (() => {
  const kind = String(_env.VITE_APP_ENV || "").trim().toLowerCase();
  if (kind === "prod") return false;
  if (kind === "dev") return true;
  return HAS_ENV_CONFIG;
})();
// Обёртка над window.confirm для опасных массовых операций (восстановление бэкапа,
// импорт JSON и т.п.): на боевой базе добавляет явное предупреждение перед вопросом,
// чтобы не восстановить/импортировать что-то не туда по рассеянности.
export const confirmDangerous = (message) => {
  const prefix = IS_DEV_ENV ? "" : "⚠️ ВЫ В БОЕВОЙ БАЗЕ (реальные данные компании).\n\n";
  return window.confirm(prefix + message);
};
