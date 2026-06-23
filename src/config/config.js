// ─────────────────────────────────────────────────────────────────────────────
// config/config.js — єдина точка конфігурації
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
    missingVars.map((key) => `   - ${key}`).join('\n') + '\n'
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVER_URL — публічна адреса redirect-сервера
//
// Railway автоматично встановлює RAILWAY_PUBLIC_DOMAIN (наприклад:
//   gregarious-rebirth-production.up.railway.app)
// Якщо є SERVER_URL у .env — використовуємо його (для кастомного домену).
// Якщо ні — будуємо з RAILWAY_PUBLIC_DOMAIN.
// null → кнопки меню використовують прямі URL (graceful fallback)
// ─────────────────────────────────────────────────────────────────────────────
const SERVER_URL =
  process.env.SERVER_URL ||
  (process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : null);

if (!SERVER_URL) {
  console.warn(
    '⚠️  SERVER_URL не визначений. ' +
    'Кнопки меню використовуватимуть прямі посилання (кліки не логуються).'
  );
}

module.exports = {
  BOT_TOKEN:         process.env.BOT_TOKEN,
  SITE_URL:          process.env.SITE_URL,
  CHANNEL_URL:       process.env.CHANNEL_URL,
  CONSULT_URL:       process.env.CONSULT_URL,
  ADMIN_TELEGRAM_ID: process.env.ADMIN_TELEGRAM_ID,
  CRM_WEBHOOK_URL:   process.env.CRM_WEBHOOK_URL,
  BUSINESS_TIMEZONE: process.env.BUSINESS_TIMEZONE || 'Europe/Amsterdam',
  SERVER_URL,
  NODE_ENV:          process.env.NODE_ENV || 'development',
  IS_PROD:           process.env.NODE_ENV === 'production',
};