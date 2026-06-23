// ─────────────────────────────────────────────────────────────────────────────
// keyboards/mainMenuKb.js — inline-меню з п'яти кнопок
//
// Зміна відносно попередньої версії:
//   URL-адреси більше не імпортуються з config.js —
//   вони передаються через content.urls (з contentService → БД).
//   Це дозволяє змінювати посилання через адмінку без перезапуску бота.
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// keyboards/mainMenuKb.js — inline-меню з п'яти кнопок
//
// URL-кнопки (register, channel, consult) тепер ведуть через redirect-сервер.
// Callback-кнопки (contacts, gift) — без змін.
//
// Якщо SERVER_URL не налаштований — graceful fallback на прямі URL.
// ─────────────────────────────────────────────────────────────────────────────

const { Markup }    = require('telegraf');
const { SERVER_URL } = require('../config/config');

// ─────────────────────────────────────────────────────────────────────────────
// buildUrl — будує redirect URL або прямий URL (fallback)
//
// Redirect: https://domain.up.railway.app/r/register?l=uk&u=123456789
// Fallback: https://your-site.com/register  (якщо SERVER_URL відсутній)
//
// @param {string} action     — 'register' | 'channel' | 'consult'
// @param {string} lang       — 'uk' | 'ru'
// @param {number|BigInt} userId
// @param {string} directUrl  — резервне пряме посилання
// ─────────────────────────────────────────────────────────────────────────────
const buildUrl = (action, lang, userId, directUrl) => {
  if (!SERVER_URL) return directUrl;
  return `${SERVER_URL}/r/${action}?l=${lang}&u=${userId}`;
};

// content — об'єкт з contentService:
//   content.buttons.* — підписи кнопок
//   content.urls.*    — прямі URL (fallback)
//   content.lang      — код мови
//
// userId — ctx.from.id, потрібен для персоналізованого трекінгу
//
const mainMenuKb = (content, userId) =>
  Markup.inlineKeyboard([

    // URL-кнопки — через redirect-сервер для трекінгу кліків
    [Markup.button.url(
      content.buttons.register,
      buildUrl('register', content.lang, userId, content.urls.site)
    )],

    // Callback — входить у сцену збору контактів (не URL, трекінг не потрібен)
    [Markup.button.callback(content.buttons.contacts, `contacts:${content.lang}`)],

    [Markup.button.url(
      content.buttons.channel,
      buildUrl('channel', content.lang, userId, content.urls.channel)
    )],

    [Markup.button.url(
      content.buttons.consult,
      buildUrl('consult', content.lang, userId, content.urls.consult)
    )],

    // Callback — текстова відповідь (трекінг вже є через BTN_GIFT)
    [Markup.button.callback(content.buttons.gift, `gift:${content.lang}`)],

  ]);

module.exports = { mainMenuKb };