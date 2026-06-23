// ─────────────────────────────────────────────────────────────────────────────
// config/config.js — єдина точка конфігурації застосунку
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config();

const REQUIRED_VARS = [
  'BOT_TOKEN',
  'SITE_URL',
  'CHANNEL_URL',
  'CONSULT_URL',
  'ADMIN_TELEGRAM_ID',
  'CRM_WEBHOOK_URL',
];

const missingVars = REQUIRED_VARS.filter((key) => !process.env[key]);

if (missingVars.length > 0) {
  throw new Error(
    `\n❌ Відсутні обов'язкові змінні середовища:\n` +
    missingVars.map((key) => `   - ${key}`).join('\n') +
    `\n\nДодайте їх у файл .env\n`
  );
}

module.exports = {
  BOT_TOKEN:         process.env.BOT_TOKEN,
  SITE_URL:          process.env.SITE_URL,
  CHANNEL_URL:       process.env.CHANNEL_URL,
  CONSULT_URL:       process.env.CONSULT_URL,
  ADMIN_TELEGRAM_ID: process.env.ADMIN_TELEGRAM_ID,
  CRM_WEBHOOK_URL:   process.env.CRM_WEBHOOK_URL,

  // IANA-назва часового поясу замовника.
  // Використовується для обчислення різниці між часом юзера і часом замовника.
  // Після першого seed — зберігається у Config таблиці і керується через адмінку.
  // Fallback на env-змінну якщо таблиця ще не наповнена.
  //
  // Приклад .env: BUSINESS_TIMEZONE=Europe/Amsterdam
  BUSINESS_TIMEZONE: process.env.BUSINESS_TIMEZONE || 'Europe/Amsterdam',

  NODE_ENV: process.env.NODE_ENV || 'development',
  IS_PROD:  process.env.NODE_ENV === 'production',
};