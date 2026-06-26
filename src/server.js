// ─────────────────────────────────────────────────────────────────────────────
// src/server.js — Express-сервер: redirect-трекінг + timezone detection
// ─────────────────────────────────────────────────────────────────────────────

const express               = require('express');
const { getConfig }         = require('./db/contentService');
const { logEvent, ACTIONS } = require('./db/eventService');
const { saveTimezone,
        getUserById }       = require('./db/userService');
const { ADMIN_TELEGRAM_ID,
        BUSINESS_TIMEZONE } = require('./config/config');
const { formatTimezoneForDisplay } = require('./utils/timezone');

const uk = require('./locales/uk');
const ru = require('./locales/ru');

const app = express();

// ── Dedup для redirect-кліків ─────────────────────────────────────────────────
const recentClicks = new Map();
const DEDUP_TTL    = 10_000;

const isDuplicate = (userId, action) => {
  const key      = `${userId}:${action}`;
  const lastTime = recentClicks.get(key);
  if (lastTime && Date.now() - lastTime < DEDUP_TTL) return true;
  recentClicks.set(key, Date.now());
  if (Math.random() < 0.01) {
    const cutoff = Date.now() - DEDUP_TTL;
    for (const [k, t] of recentClicks) if (t < cutoff) recentClicks.delete(k);
  }
  return false;
};

// ── Маппінг redirect action → Config key ─────────────────────────────────────
const ACTION_TO_CONFIG_KEY = {
  register: 'url_site',
  channel:  'url_channel',
  consult:  'url_consult',
};

// ─────────────────────────────────────────────────────────────────────────────
// getTelegramAppUrl — https://t.me/... → tg:// deep link
// ─────────────────────────────────────────────────────────────────────────────
const getTelegramAppUrl = (tmeUrl) => {
  const path = tmeUrl.replace(/^https?:\/\/t\.me\//, '');
  return path.startsWith('+')
    ? `tg://join?invite=${path.substring(1)}`
    : `tg://resolve?domain=${path}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// buildTelegramPage — HTML для t.me посилань
// ─────────────────────────────────────────────────────────────────────────────
const buildTelegramPage = (tmeUrl) => {
  const tgUrl = getTelegramAppUrl(tmeUrl);
  return `<!DOCTYPE html>
<html lang="uk"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Відкриваємо Telegram...</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f0f2f5;}
.card{background:#fff;border-radius:12px;padding:32px 40px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.1);}
.icon{font-size:48px;margin-bottom:16px;}h2{margin:0 0 8px;font-size:20px;}
p{margin:0 0 20px;color:#666;font-size:14px;}
a{display:inline-block;background:#2AABEE;color:#fff;text-decoration:none;padding:10px 24px;border-radius:8px;font-size:15px;}</style>
<script>window.location.href='${tgUrl}';setTimeout(function(){window.location.href='${tmeUrl}';},1500);</script>
</head><body><div class="card"><div class="icon">✈️</div>
<h2>Відкриваємо Telegram...</h2>
<p>Якщо нічого не відбулось — натисніть кнопку нижче</p>
<a href="${tmeUrl}">Відкрити в Telegram</a></div></body></html>`;
};

// ─────────────────────────────────────────────────────────────────────────────
// buildTimezonePage — HTML-сторінка для автовизначення timezone
//
// Що відбувається:
//   1. Сторінка відкривається у браузері юзера
//   2. JS одразу читає Intl.DateTimeFormat().resolvedOptions().timeZone
//      → повертає точний IANA timezone ('Europe/Warsaw', 'America/New_York'...)
//   3. fetch надсилає timezone на /tz/save
//   4. Сервер зберігає у БД і надсилає підтвердження юзеру через бота
//   5. Сторінка показує "✅ Готово!"
//
// @param {string} userId — Telegram user ID
// @param {string} lang   — 'uk' | 'ru'
// ─────────────────────────────────────────────────────────────────────────────
const buildTimezonePage = (userId, lang) => {
  const texts = {
    uk: {
      title:    'Визначаємо часовий пояс...',
      loading:  'Будь ласка, зачекайте...',
      success:  '✅ Готово! Можна закрити цю вкладку.',
      error:    '❌ Помилка. Спробуйте ще раз.',
    },
    ru: {
      title:    'Определяем часовой пояс...',
      loading:  'Пожалуйста, подождите...',
      success:  '✅ Готово! Можно закрыть эту вкладку.',
      error:    '❌ Ошибка. Попробуйте ещё раз.',
    },
  };

  const t = texts[lang] || texts.uk;

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${t.title}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: #f0f2f5;
    }
    .card {
      background: #fff;
      border-radius: 16px;
      padding: 40px 48px;
      text-align: center;
      box-shadow: 0 4px 20px rgba(0,0,0,.08);
      max-width: 380px;
      width: 90%;
    }
    .icon { font-size: 56px; margin-bottom: 20px; }
    h2 { margin: 0 0 10px; font-size: 22px; color: #111; }
    p  { margin: 0; color: #666; font-size: 15px; line-height: 1.5; }
    .spinner {
      display: inline-block;
      width: 28px; height: 28px;
      border: 3px solid #e0e0e0;
      border-top-color: #2AABEE;
      border-radius: 50%;
      animation: spin .8s linear infinite;
      margin-bottom: 16px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="card">
    <div id="spinner" class="spinner"></div>
    <div id="icon" class="icon" style="display:none">✅</div>
    <h2 id="title">${t.title}</h2>
    <p  id="text">${t.loading}</p>
  </div>

  <script>
    (function() {
      // Читаємо timezone прямо зі системних налаштувань пристрою.
      // Intl.DateTimeFormat підтримується у всіх сучасних браузерах.
      // Повертає IANA-рядок: 'Europe/Warsaw', 'America/New_York' тощо.
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

      // Надсилаємо на сервер
      fetch('/tz/save?tz=' + encodeURIComponent(tz) + '&u=${userId}&l=${lang}')
        .then(function(r) { return r.json(); })
        .then(function() {
          document.getElementById('spinner').style.display = 'none';
          document.getElementById('icon').style.display    = 'block';
          document.getElementById('title').textContent     = '${t.success}';
          document.getElementById('text').textContent      = '';
        })
        .catch(function() {
          document.getElementById('spinner').style.display = 'none';
          document.getElementById('title').textContent     = '${t.error}';
        });
    })();
  </script>
</body>
</html>`;
};

// ─────────────────────────────────────────────────────────────────────────────
// ЕНДПОІНТИ
// ─────────────────────────────────────────────────────────────────────────────

// ── GET /r/:action — redirect-трекінг кліків по кнопках ──────────────────────
app.get('/r/:action', async (req, res) => {
  const { action }                    = req.params;
  const { l: lang = 'uk', u: userId } = req.query;

  const configKey = ACTION_TO_CONFIG_KEY[action];
  if (!configKey) return res.status(404).send('Not found');

  let targetUrl;
  try {
    const config = await getConfig();
    targetUrl    = config[configKey];
  } catch (err) {
    console.error('[server /r] getConfig error:', err.message);
  }

  if (!targetUrl) {
    const fallbacks = {
      url_site:    process.env.SITE_URL,
      url_channel: process.env.CHANNEL_URL,
      url_consult: process.env.CONSULT_URL,
    };
    targetUrl = fallbacks[configKey];
  }

  if (!targetUrl) return res.status(502).send('Target URL not configured');

  const userIdStr = userId && !isNaN(userId) ? userId : null;
  if (userIdStr && !isDuplicate(userIdStr, action)) {
    logEvent(userIdStr, ACTIONS.URL_CLICK, { action, lang })
      .catch((err) => console.error('[server /r] logEvent error:', err.message));
  }

  return targetUrl.includes('t.me')
    ? res.send(buildTelegramPage(targetUrl))
    : res.redirect(302, targetUrl);
});

// ── GET /tz — відкриває сторінку визначення timezone ─────────────────────────
//
// Параметри: u=userId, l=lang
// Викликається з inline-кнопки "🕐 Визначити мій часовий пояс" у боті.
//
app.get('/tz', (req, res) => {
  const { u: userId, l: lang = 'uk' } = req.query;

  if (!userId) return res.status(400).send('Missing user ID');

  res.send(buildTimezonePage(userId, lang));
});

// ── GET /tz/save — зберігає timezone і сповіщає юзера через бота ─────────────
//
// Параметри: tz=timezone, u=userId, l=lang
// Викликається fetch()-запитом зі сторінки /tz.
//
// ❗ bot передається у startServer(bot) і доступний через closure.
//
const setupTzSave = (bot) => {
  app.get('/tz/save', async (req, res) => {
    const { tz: timezone, u: userId, l: lang = 'uk' } = req.query;

    if (!userId || !timezone) {
      return res.status(400).json({ error: 'Missing params' });
    }

    try {
      // 1. Зберігаємо timezone у БД
      await saveTimezone(userId, timezone);

      // 2. Отримуємо дані юзера для нотифікації
      const user       = await getUserById(userId);
      const businessTz = (await getConfig().catch(() => ({}))).business_timezone
        || BUSINESS_TIMEZONE;
      const tzDisplay  = formatTimezoneForDisplay(timezone, businessTz);

      // 3. Надсилаємо підтвердження юзеру через бота
      const locale = lang === 'ru' ? ru : uk;
      await bot.telegram.sendMessage(userId, locale.scene.contacts.tzSuccess)
        .catch((err) => console.error('[server /tz/save] sendMessage error:', err.message));

      // 4. Надсилаємо оновлення адміну
      const fullName = [user?.firstName].filter(Boolean).join(' ');
      await bot.telegram.sendMessage(
        ADMIN_TELEGRAM_ID,
        `🕐 Часовий пояс визначено\n\n` +
        `👤 ${fullName || 'Юзер'} (ID: ${userId})\n` +
        `📍 ${tzDisplay}`
      ).catch((err) => console.error('[server /tz/save] adminNotify error:', err.message));

      res.json({ ok: true });

    } catch (err) {
      console.error('[server /tz/save] error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });
};

// ── Healthcheck ───────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ─────────────────────────────────────────────────────────────────────────────
// startServer — запускає Express
//
// @param {object} bot — екземпляр Telegraf (з index.js)
//   Потрібен для надсилання повідомлень юзеру та адміну з /tz/save.
// ─────────────────────────────────────────────────────────────────────────────
const startServer = (bot) => {
  setupTzSave(bot); // реєструємо /tz/save з доступом до bot

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🌐 Сервер запущено на порту ${PORT}`);
  });
};

module.exports = { startServer };