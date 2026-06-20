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

  // URL вебхука CRM до (не включно) шляху /crm/v1/entities/leads.
  // Формат у .env:
  //   CRM_WEBHOOK_URL=https://qoolli-academy.uspacy.ua/company/v1/incoming_webhooks/run/ВАШ_КЛЮЧ
  //
  // crmService.js додасть /crm/v1/entities/leads самостійно.
  CRM_WEBHOOK_URL:   process.env.CRM_WEBHOOK_URL,

  NODE_ENV: process.env.NODE_ENV || 'development',
  IS_PROD:  process.env.NODE_ENV === 'production',
};