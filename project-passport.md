# 🗂 ПАСПОРТ ПРОЕКТУ — Telegram-бот Qoolli Academy

> Оновлюй після кожного спринту розробки.


## 1. Загальна суть проекту

Telegram-бот для власника онлайн-курсів з тестування програмного забезпечення (Qoolli Academy).

**Основні сценарії:**
- Привітання нових юзерів: відео → текст → inline-меню з 5 кнопок
- Збір контактів (телефон + email) через Wizard-сцену
- Автовизначення часового поясу юзера через браузер (`Intl.DateTimeFormat`)
- Трекінг кліків URL-кнопок через redirect-сервер `/r/:action`
- Синхронізація лідів у Uspacy CRM
- Адмін-нотифікації про нові контакти з даними timezone
- Масові розсилки з фільтрами (мова, наявність контактів, теги)
- Двомовний інтерфейс (🇺🇦 UK / 🇷🇺 RU) з автовизначенням мови за Telegram `language_code`


## 2. Технічний стек

| Компонент       | Технологія                                     |
|-----------------|------------------------------------------------|
| Runtime         | Node.js ≥ 18                                   |
| Bot framework   | Telegraf 4.16 (Scenes, session, Markup)        |
| Web server      | Express 5.2                                    |
| ORM             | Prisma 5.22                                    |
| БД              | PostgreSQL                                     |
| Деплой          | Railway (auto-set `RAILWAY_PUBLIC_DOMAIN`)     |
| Timezone detect | geo-tz 8 (координати → IANA) + `Intl` (браузер) |
| CRM             | Uspacy REST API (`/crm/v1/entities/leads`)     |
| Config          | dotenv                                         |
| Dev             | nodemon                                        |


## 3. Структура модулів

```
project/
├── src/
│   ├── index.js                     — точка входу: запуск Express + bot.launch()
│   ├── bot.js                       — ініціалізація Telegraf, реєстрація хендлерів, сцен, callbacks
│   ├── server.js                    — Express: /r/:action (redirect-трекінг), /tz, /tz/save, /health, /admin
│   ├── config/
│   │   └── config.js                — єдина точка конфігурації, валідація обов'язкових env-змінних
│   ├── routes/
│   │   └── adminRoutes.js           — REST API ендпоінти для адмін-панелі з Basic Auth
│   ├── public/                      — статичні файли преміум веб-адмінки (SPA)
│   │   ├── index.html               — структура інтерфейсу адмін-панелі
│   │   ├── style.css                — стилізація інтерфейсу (темна тема, CSS variables)
│   │   └── app.js                   — клієнтська логіка: оновлення DOM, запити до REST API
│   ├── handlers/
│   │   ├── startHandler.js          — /start: автовизначення мови, вітання
│   │   ├── messageHandler.js        — Reply keyboard: обробка вибору мови
│   │   ├── changeLanguageHandler.js — /language: відображення клавіатури вибору мови
│   │   └── broadcastHandler.js      — /broadcast <id>, /broadcastlist: адмін-команди
│   ├── scenes/
│   │   └── contactsScene.js         — Wizard (3 кроки): телефон → email → збереження + CRM + TZ-кнопка
│   ├── keyboards/
│   │   ├── mainMenuKb.js            — inline-меню: 3 URL-кнопки (через /r/) + 2 callback
│   │   └── languageKb.js            — Reply keyboard вибору мови (uk / ru)
│   ├── locales/
│   │   ├── uk.js                    — весь україномовний контент бота (тексти, кнопки, scene-рядки)
│   │   └── ru.js                    — весь російськомовний контент бота
│   ├── db/
│   │   ├── prisma.js                — Prisma singleton (один екземпляр на процес Node.js)
│   │   ├── userService.js           — CRUD юзерів: upsert, updateLanguage, saveContacts, saveTimezone, saveCrmSync + аналітика
│   │   ├── eventService.js          — logEvent, ACTIONS-константи, аналітика конверсій
│   │   ├── contentService.js        — BotContent + Config з in-memory кешем TTL 5 хв, fallback на locale-файли
│   │   └── broadcastService.js      — getAudience за фільтрами, батч-розсилка з rate limiting, cancelBroadcast
│   ├── services/
│   │   └── crmService.js            — createLead у Uspacy CRM (POST /crm/v1/entities/leads)
│   └── utils/
│       ├── timezone.js              — detectTimezoneFromLocation, parseTimeToOffset, getOffsetDiff, formatTimezoneForDisplay
│       ├── language.js              — detectLang, getLocale, getLangByButton, LANG_KEYBOARD_TEXTS
│       ├── throttle.js              — cooldown Map (userId:action → timestamp) від подвійних кліків
│       ├── sendContent.js           — відправка відео → welcomeText → mainMenuKb
│       └── pendingTimezones.js      — TTL Map (userId → msgId) для edit адмін-повідомлення після timezone
├── prisma/
│   ├── schema.prisma                — схема БД (6 моделей)
│   ├── seed.js                      — upsert BotContent з locale-файлів + Config з .env
│   └── migrations/                  — SQL-міграції (init, bigint, phone/email, crm_sync, content/broadcast, timezone)
└── .env                             — секрети (не в репо)
```


## 4. Схема БД

| Таблиця    | Ключові поля                                                                                       |
|------------|----------------------------------------------------------------------------------------------------|
| User       | `id` BigInt PK, `firstName`, `username`, `language`, `phone`, `email`, `timezone`, `crmSynced` bool, `crmLeadId` int |
| Event      | `id`, `userId` FK→User, `action` (ACTIONS), `payload` JSON, `createdAt`                           |
| BotContent | `id`, `lang`, `key`, `value` — unique(`lang`, `key`) — тексти бота, редаговані без деплою         |
| Config     | `key` PK, `value` — URL кнопок, `business_timezone`, `ask_timezone`                               |
| UserTag    | `id`, `userId` FK→User, `tag` — unique(`userId`, `tag`) — для фільтрів розсилок                  |
| Broadcast  | `id`, `title`, `videoFileId`, `text`, `buttons` JSON, `filterLang`, `filterHasContacts`, `filterTags[]`, `status`, `sentCount`, `errorCount` |

**Timezone:** зберігається як IANA (`Europe/Warsaw`) або offset-рядок (`UTC+02:00`), `null` якщо не зібрано.

**Config keys:** `url_site`, `url_channel`, `url_consult`, `business_timezone`, `ask_timezone`

**ACTIONS:** `start`, `lang_select`, `btn_gift`, `contacts_saved`, `contacts_skipped`, `url_click`


## 5. Поточний стан

✅ Реалізовано і працює:

- Welcome-flow: відео → текст → inline-меню (обидві мови)
- Автовизначення мови за `ctx.from.language_code` → fallback на Reply keyboard
- Wizard-сцена збору контактів (phone / skip, email / skip, cancel)
- Timezone detection: браузер відкриває `/tz` → JS читає `Intl` → `fetch /tz/save` → БД + нотифікація юзера та адміна
- Redirect-трекінг: кнопки реєстрація/канал/консультація → `/r/:action` → logEvent → redirect
- Адмін-нотифікації при нових контактах (з полем «Часовий пояс: визначається...»)
- Edit адмін-повідомлення після отримання timezone (через `pendingTimezones.js` TTL Map)
- CRM: createLead з ім'ям, контактами, мовою, timezone у comments
- In-memory кеш контенту (TTL 5 хв) + seed + fallback на locale-файли
- Батч-розсилки: 25 повідомлень / 1100 мс, фільтри по мові / контактах / тегах
- Аналітика: конверсія START → LANG → CONTACTS → URL_CLICK
- Throttle/cooldown для захисту від подвійних кліків


## 6. Відомі проблеми / технічний борг

| #  | Проблема                                                                              | Статус                                                              |
|----|---------------------------------------------------------------------------------------|---------------------------------------------------------------------|
| 1  | Timezone приходила окремим повідомленням → складна кореляція у активних чатах адміна | ✅ Вирішено: `editMessageText` + `pendingTimezones.js` (TTL Map)    |
| 2  | Timezone не писалась у поле comments CRM-ліда                                         | ✅ Вирішено: `updateLead` (PATCH) у `crmService.js`, fire-and-forget |

| 3  | Кнопка timezone не відображається на localhost                                        | By design: перевірка `!SERVER_URL.includes('localhost')`            |


## 7. Задача поточного спринту

- **Створення преміум веб-панелі адміністратора (SPA)**:
  - Реалізовано інтерфейс для моніторингу аналітики (Chart.js, конверсії, події).
  - Створено редактори для контенту бота (`BotContent` для UK/RU) та глобальних налаштувань (`Config`).
  - Реалізовано планувальник та менеджер розсилок із фільтрами по мові, наявності контактів та тегам, а також можливість скасування розсилки в процесі надсилання.
  - Доступ захищено за допомогою Basic Authentication (`ADMIN_USERNAME` та `ADMIN_PASSWORD`).
## 8. Угоди і обмеження

- **BigInt** для `User.id` — Telegram ID перевищує 32-бітний ліміт
- **Singleton Prisma** — один екземпляр через кеш `require()` Node.js; новий `PrismaClient` у кожному модулі вичерпає пул підключень PostgreSQL
- **Fire-and-forget** для CRM-оновлень — `updateLead` без `await`, щоб не затримувати відповідь юзеру
- **SERVER_URL** обов'язковий для timezone-кнопки; Railway встановлює автоматично через `RAILWAY_PUBLIC_DOMAIN`
- **Обов'язкові env-змінні** (перевіряються при старті): `BOT_TOKEN`, `SITE_URL`, `CHANNEL_URL`, `CONSULT_URL`, `ADMIN_TELEGRAM_ID`, `CRM_WEBHOOK_URL`
- **Broadcast rate limit:** 25 повідомлень / 1100 мс ≈ 22.7/с (ліміт Telegram — 30/с)
- **Кеш контенту TTL 5 хв** — після `npx prisma db seed` нові дані підхоплюються без перезапуску бота; fallback на locale-файли поки БД порожня
- **Locale-файли** — джерело scene-текстів (рядки сцени контактів); інший контент (тексти, кнопки, URL) зберігається у БД і редагується без деплою
