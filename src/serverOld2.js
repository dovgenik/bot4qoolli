// ─────────────────────────────────────────────────────────────────────────────
// src/server.js — Express-сервер для відстеження кліків по кнопках
// ─────────────────────────────────────────────────────────────────────────────

const express               = require('express');
const { getConfig }         = require('./db/contentService');
const { logEvent, ACTIONS } = require('./db/eventService');

const app = express();

// ── Dedup ─────────────────────────────────────────────────────────────────────
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

// ── Маппінг action → Config key ───────────────────────────────────────────────
const ACTION_TO_CONFIG_KEY = {
  register: 'url_site',
  channel:  'url_channel',
  consult:  'url_consult',
};

// ─────────────────────────────────────────────────────────────────────────────
// getTelegramAppUrl — https://t.me/... → tg:// deep link
//
// Публічний:  https://t.me/mychannel     → tg://resolve?domain=mychannel
// Приватний:  https://t.me/+InviteABC   → tg://join?invite=InviteABC
// ─────────────────────────────────────────────────────────────────────────────
const getTelegramAppUrl = (tmeUrl) => {
  const path = tmeUrl.replace(/^https?:\/\/t\.me\//, '');
  return path.startsWith('+')
    ? `tg://join?invite=${path.substring(1)}`
    : `tg://resolve?domain=${path}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// buildTelegramPage — HTML для t.me посилань замість 302 redirect
//
// Чому HTML замість redirect:
//   302 → браузер відкривається і залишається відкритим
//   HTML з tg:// → браузер відкривається, JS одразу запускає Telegram Desktop,
//                  браузерна вкладка закривається сама (на більшості систем)
//
// Логіка:
//   1. JS одразу: window.location = tg://resolve?domain=channel
//      → Telegram Desktop перехоплює, відкривається канал
//   2. Через 1.5с fallback: window.location = https://t.me/channel
//      → для тих у кого Telegram не встановлений
// ─────────────────────────────────────────────────────────────────────────────
const buildTelegramPage = (tmeUrl) => {
  const tgUrl = getTelegramAppUrl(tmeUrl);
  return `<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Відкриваємо Telegram...</title>
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
         display:flex;align-items:center;justify-content:center;
         min-height:100vh;margin:0;background:#f0f2f5;}
    .card{background:#fff;border-radius:12px;padding:32px 40px;
          text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.1);}
    .icon{font-size:48px;margin-bottom:16px;}
    h2{margin:0 0 8px;font-size:20px;}
    p{margin:0 0 20px;color:#666;font-size:14px;}
    a{display:inline-block;background:#2AABEE;color:#fff;text-decoration:none;
      padding:10px 24px;border-radius:8px;font-size:15px;}
  </style>
  <script>
    window.location.href = '${tgUrl}';
    setTimeout(function(){ window.location.href = '${tmeUrl}'; }, 1500);
  </script>
</head>
<body>
  <div class="card">
    <div class="icon">✈️</div>
    <h2>Відкриваємо Telegram...</h2>
    <p>Якщо нічого не відбулось — натисніть кнопку нижче</p>
    <a href="${tmeUrl}">Відкрити в Telegram</a>
  </div>
</body>
</html>`;
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /r/:action
// ─────────────────────────────────────────────────────────────────────────────
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
    console.error('[server] getConfig error:', err.message);
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

  // Логуємо клік (не блокуємо відповідь)
  const userIdStr = userId && !isNaN(userId) ? userId : null;
  if (userIdStr && !isDuplicate(userIdStr, action)) {
    logEvent(userIdStr, ACTIONS.URL_CLICK, { action, lang })
      .catch((err) => console.error('[server] logEvent error:', err.message));
  }

  // t.me → HTML з tg:// deep link (уникаємо відкритого браузера)
  // Звичайний сайт → стандартний 302
  if (targetUrl.includes('t.me')) {
    return res.send(buildTelegramPage(targetUrl));
  }

  res.redirect(302, targetUrl);
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const startServer = () => {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`🌐 Redirect-сервер запущено на порту ${PORT}`));
};

module.exports = { startServer };