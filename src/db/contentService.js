// ─────────────────────────────────────────────────────────────────────────────
// src/db/contentService.js — завантаження контенту бота з БД з кешем
//
// Два рівні:
//   1. In-memory кеш (TTL 5 хвилин) — уникаємо зайвих запитів до БД
//   2. БД (BotContent + Config) — джерело правди
//   3. Fallback на locale-файли — якщо БД порожня (до першого seed)
//
// Структура об'єкта що повертається відповідає locale-файлам +
// додатковий об'єкт urls — щоб решта коду майже не змінювалась.
// ─────────────────────────────────────────────────────────────────────────────

const { prisma } = require('./prisma');

const uk = require('../locales/uk');
const ru = require('../locales/ru');

// ── Кеш ───────────────────────────────────────────────────────────────────────
//
// Простий Map: ключ → { data, ts }
// Ключі: 'content:uk', 'content:ru', 'config'
//
// TTL 5 хвилин — достатньо для контенту що рідко змінюється.
// При зміні контенту через адмінку — викликайте invalidateCache().
//
const cache  = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 хвилин у мілісекундах

const isFresh = (entry) => entry && Date.now() - entry.ts < CACHE_TTL;

// ─────────────────────────────────────────────────────────────────────────────
// getConfig — завантажує URL та інші глобальні налаштування з таблиці Config
// ─────────────────────────────────────────────────────────────────────────────

const getConfig = async () => {
  const cached = cache.get('config');
  if (isFresh(cached)) return cached.data;

  const rows = await prisma.config.findMany();

  // Якщо Config порожній — fallback на .env (до запуску seed)
  if (rows.length === 0) {
    const data = {
      url_site:    process.env.SITE_URL    ?? '',
      url_channel: process.env.CHANNEL_URL ?? '',
      url_consult: process.env.CONSULT_URL ?? '',
    };
    cache.set('config', { data, ts: Date.now() });
    return data;
  }

  const data = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  cache.set('config', { data, ts: Date.now() });
  return data;
};

// ─────────────────────────────────────────────────────────────────────────────
// getContent — завантажує контент для конкретної мови
//
// @param {string} lang — 'uk' | 'ru' | ...
// @returns {object} — об'єкт з тими ж полями що і locale-файл + urls
// ─────────────────────────────────────────────────────────────────────────────

const getContent = async (lang) => {
  const cacheKey = `content:${lang}`;
  const cached   = cache.get(cacheKey);
  if (isFresh(cached)) return cached.data;

  // Завантажуємо контент і конфіг паралельно
  const [rows, config] = await Promise.all([
    prisma.botContent.findMany({ where: { lang } }),
    getConfig(),
  ]);

  // ── Fallback на locale-файл якщо БД порожня ───────────────────────────────
  //
  // Це дозволяє деплоїти оновлений код ДО запуску seed —
  // бот продовжить працювати з locale-файлами.
  //
  if (rows.length === 0) {
    console.warn(
      `[contentService] BotContent порожній для "${lang}", використовую locale-файл`
    );
    const localeFallback = lang === 'ru' ? ru : uk;
    const data = {
      ...localeFallback,
      urls: {
        site:    config.url_site,
        channel: config.url_channel,
        consult: config.url_consult,
      },
    };
    // Не кешуємо fallback — щоб після seed одразу підхопили БД-дані
    return data;
  }

  // ── Будуємо об'єкт контенту з рядків БД ──────────────────────────────────
  const c = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  const data = {
    lang,
    videoFileId: c.video_file_id,
    welcomeText: c.welcome_text,
    menuText:    c.menu_text,
    giftText:    c.gift_text,

    buttons: {
      register: c.btn_register,
      contacts: c.btn_contacts,
      channel:  c.btn_channel,
      consult:  c.btn_consult,
      gift:     c.btn_gift,
    },

    // urls — з Config таблиці (незалежно від мови)
    urls: {
      site:    config.url_site,
      channel: config.url_channel,
      consult: config.url_consult,
    },

    // scene-тексти залишаються у locale-файлах (рідко змінюються)
    scene: lang === 'ru' ? ru.scene : uk.scene,
  };

  cache.set(cacheKey, { data, ts: Date.now() });
  return data;
};

// ─────────────────────────────────────────────────────────────────────────────
// invalidateCache — скидає кеш після зміни контенту
//
// Викликати з адмін-панелі після збереження змін.
// lang = null → скидає весь кеш
// lang = 'uk' → скидає лише кеш для UK
// lang = 'config' → скидає лише кеш URL-ів
// ─────────────────────────────────────────────────────────────────────────────

const invalidateCache = (lang = null) => {
  if (!lang) {
    cache.clear();
    console.log('[contentService] Весь кеш скинуто');
  } else if (lang === 'config') {
    cache.delete('config');
  } else {
    cache.delete(`content:${lang}`);
  }
};

module.exports = { getContent, getConfig, invalidateCache };