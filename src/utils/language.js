// ─────────────────────────────────────────────────────────────────────────────
// src/utils/language.js — визначення мови і реєстр локалей
//
// Єдине місце де описані підтримувані мови.
// Щоб додати нову мову — достатньо:
//   1. Створити src/locales/en.js
//   2. Додати рядок у LOCALES і LANG_CODE_MAP
//   3. Додати кнопку у languageKb.js і рядок у BUTTON_LANG_MAP
//   Решта коду (startHandler, messageHandler, bot.js) — без змін.
// ─────────────────────────────────────────────────────────────────────────────

const uk = require('../locales/uk');
const ru = require('../locales/ru');

// ── Реєстр локалей ────────────────────────────────────────────────────────────
//
// Ключ — внутрішній код мови бота (те, що зберігається у User.language).
// Значення — об'єкт локалі з усіма текстами.
//
const LOCALES = {
  uk,
  ru,
  // en: require('../locales/en'),  // ← приклад додавання нової мови
};

// ── Маппінг: Telegram language_code → код мови бота ──────────────────────────
//
// ctx.from.language_code — IETF-тег, який Telegram надсилає у кожному апдейті.
// Це мова інтерфейсу Telegram-додатку на пристрої юзера.
//
// Формат: 'uk', 'uk-UA', 'ru', 'ru-RU', 'en', 'en-US', 'de', тощо.
// Ми беремо лише первинний субтег (до дефіса): 'uk-UA' → 'uk'.
//
// Якщо language_code відсутній або не знайдений — повертаємо null
// (бот покаже клавіатуру вибору мови).
//
const LANG_CODE_MAP = {
  uk: 'uk',  // Українська
  ru: 'ru',  // Русский
  // en: 'en',  // ← додайте тут
  // de: 'de',
};

// ── Маппінг: текст кнопки клавіатури → код мови ──────────────────────────────
//
// Використовується у messageHandler для визначення яку мову обрав юзер.
// Тексти мають точно збігатись з кнопками у languageKb.js.
//
const BUTTON_LANG_MAP = {
  '🇺🇦 Українська': 'uk',
  '🇷🇺 Русский':    'ru',
  // '🇬🇧 English': 'en',  // ← додайте тут
};

// ─────────────────────────────────────────────────────────────────────────────
// detectLang — автовизначає мову зі встановлень Telegram юзера
//
// Повертає код мови ('uk', 'ru'...) або null якщо мова не підтримується.
//
// @param {string|undefined} languageCode — ctx.from.language_code
// @returns {string|null}
//
const detectLang = (languageCode) => {
  if (!languageCode) return null;

  // Беремо лише первинний субтег: 'uk-UA' → 'uk', 'en-US' → 'en'
  const primary = languageCode.split('-')[0].toLowerCase();

  return LANG_CODE_MAP[primary] ?? null;
};

// ─────────────────────────────────────────────────────────────────────────────
// getLocale — повертає об'єкт локалі за кодом мови
//
// Fallback на українську якщо переданий код невідомий.
// Це захист від ситуації коли у БД є застарілий код мови.
//
// @param {string} lang — код мови ('uk', 'ru'...)
// @returns {object} — locale object з текстами бота
//
const getLocale = (lang) => LOCALES[lang] ?? uk;

// ─────────────────────────────────────────────────────────────────────────────
// getLangByButton — визначає мову за текстом натиснутої кнопки клавіатури
//
// @param {string} text — ctx.message.text
// @returns {string|null}
//
const getLangByButton = (text) => BUTTON_LANG_MAP[text] ?? null;

// ─────────────────────────────────────────────────────────────────────────────
// LANG_KEYBOARD_TEXTS — всі тексти кнопок для bot.hears()
//
// bot.js використовує цей масив замість хардкоду:
//   bot.hears(LANG_KEYBOARD_TEXTS, messageHandler)
//
// При додаванні нової мови — bot.hears оновлюється автоматично.
//
const LANG_KEYBOARD_TEXTS = Object.keys(BUTTON_LANG_MAP);

module.exports = { detectLang, getLocale, getLangByButton, LANG_KEYBOARD_TEXTS };