// ─────────────────────────────────────────────────────────────────────────────
// src/server.js — Express-сервер для відстеження кліків по кнопках-посиланнях
//
// Проблема: Telegram не надсилає боту жодної події при натисканні URL-кнопки.
// Рішення: кнопки ведуть не напряму на сайт, а через наш сервер:
//
//   Юзер натискає кнопку
//     → відкривається https://our-domain/r/register?l=uk&u=123456
//     → сервер логує клік у таблицю Event
//     → сервер робить 302 redirect на реальний URL
//     → юзер потрапляє на сайт (без помітної затримки)
//
// Запускається у тому ж процесі що і бот (src/index.js).
// Railway автоматично надає PORT і публічний домен.
// ─────────────────────────────────────────────────────────────────────────────

const express           = require('express');
const { getConfig }     = require('./db/contentService');
const { logEvent, ACTIONS } = require('./db/eventService');

const app = express();

// ─────────────────────────────────────────────────────────────────────────────
// DEDUP — захист від подвійного логування одного кліку
//
// Якщо юзер двічі натиснув кнопку за 10 секунд — логуємо лише перший клік.
// Використовуємо простий in-memory Map (не потребує Redis).
// ─────────────────────────────────────────────────────────────────────────────
const recentClicks = new Map();
const DEDUP_TTL    = 10_000; // 10 секунд

const isDuplicate = (userId, action) => {
  const key      = `${userId}:${action}`;
  const lastTime = recentClicks.get(key);
  if (lastTime && Date.now() - lastTime < DEDUP_TTL) return true;
  recentClicks.set(key, Date.now());

  // Прибираємо старі записи раз на ~100 кліків
  if (Math.random() < 0.01) {
    const cutoff = Date.now() - DEDUP_TTL;
    for (const [k, t] of recentClicks) {
      if (t < cutoff) recentClicks.delete(k);
    }
  }

  return false;
};

// ─────────────────────────────────────────────────────────────────────────────
// Маппінг: action → ключ у таблиці Config
//
// action — ідентифікатор у URL: /r/register, /r/channel, /r/consult
// Значення — ключ у таблиці Config де зберігається реальний URL
// ─────────────────────────────────────────────────────────────────────────────
const ACTION_TO_CONFIG_KEY = {
  register: 'url_site',
  channel:  'url_channel',
  consult:  'url_consult',
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /r/:action — головний redirect endpoint
//
// Параметри query:
//   l  — мова ('uk' | 'ru')
//   u  — Telegram userId (рядок)
//
// ❗ Security note: userId береться з URL і не верифікується.
//    Технічно юзер може підставити чужий ID.
//    Для маркетингової аналітики це прийнятно — ми лише рахуємо кліки.
// ─────────────────────────────────────────────────────────────────────────────
app.get('/r/:action', async (req, res) => {
  const { action }        = req.params;
  const { l: lang = 'uk', u: userId } = req.query;

  // Визначаємо цільовий URL з Config таблиці
  const configKey = ACTION_TO_CONFIG_KEY[action];
  if (!configKey) {
    return res.status(404).send('Not found');
  }

  let targetUrl;
  try {
    const config = await getConfig();
    targetUrl    = config[configKey];
  } catch (err) {
    console.error('[server] getConfig error:', err.message);
  }

  // Fallback: якщо Config порожній або помилка — беремо з .env
  if (!targetUrl) {
    const fallbacks = {
      url_site:    process.env.SITE_URL,
      url_channel: process.env.CHANNEL_URL,
      url_consult: process.env.CONSULT_URL,
    };
    targetUrl = fallbacks[configKey];
  }

  if (!targetUrl) {
    return res.status(502).send('Target URL not configured');
  }

  // Логуємо клік асинхронно — не блокуємо redirect
  const userIdNum = userId && !isNaN(userId) ? userId : null;

  if (userIdNum && !isDuplicate(userIdNum, action)) {
    logEvent(userIdNum, ACTIONS.URL_CLICK, { action, lang })
      .catch((err) =>
        console.error('[server] logEvent error:', err.message)
      );
  }

  // 302 тимчасовий редирект (не 301 — щоб браузери не кешували)
  res.redirect(302, targetUrl);
});

// ─────────────────────────────────────────────────────────────────────────────
// Healthcheck — Railway перевіряє що сервіс живий
// ─────────────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ─────────────────────────────────────────────────────────────────────────────
// startServer — запускає Express на PORT з Railway (або 3000 локально)
// ─────────────────────────────────────────────────────────────────────────────
const startServer = () => {
  const PORT = process.env.PORT || 3000;

  app.listen(PORT, () => {
    console.log(`🌐 Redirect-сервер запущено на порту ${PORT}`);
  });
};

module.exports = { startServer };