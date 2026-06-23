// ─────────────────────────────────────────────────────────────────────────────
// src/services/crmService.js — інтеграція з Uspacy CRM
// Зміна: timezone додається до поля comments
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// createLead
//
// @param {{ firstName, lastName, phone, email, lang, timezone }} params
// @returns {number|null} — ID ліда або null при помилці
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// src/services/crmService.js — інтеграція з Uspacy CRM
// ─────────────────────────────────────────────────────────────────────────────

const { CRM_WEBHOOK_URL }          = require('../config/config');
const { formatTimezoneForDisplay } = require('../utils/timezone');

// ─────────────────────────────────────────────────────────────────────────────
// createLead
//
// @param {{ firstName, lastName, phone, email, lang, timezone, businessTimezone }} params
// @returns {number|null}
// ─────────────────────────────────────────────────────────────────────────────
const createLead = async ({
  firstName, lastName, phone, email,
  lang, timezone, businessTimezone,
}) => {
  try {
    const langLabel = lang === 'uk' ? '🇺🇦 UK' : '🇷🇺 RU';
    const tzDisplay = formatTimezoneForDisplay(timezone, businessTimezone);

    const comments =
      `Користувач залишив контакти із ТГ бота\n` +
      `Часовий пояс: ${tzDisplay}`;

    const body = {
      title:     `Нова заявка з Telegram-бота [${langLabel}]`,
      firstName,
      ...(lastName && { lastName }),
      ...(phone    && { phone: [{ value: phone }] }),
      ...(email    && { email: [{ value: email }] }),
      comments,
    };

    const response = await fetch(`${CRM_WEBHOOK_URL}/crm/v1/entities/leads`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => '');
      console.error(`[crmService] CRM відповів ${response.status}:`, err);
      return null;
    }

    const data = await response.json();
    console.log(`[crmService] ✅ Лід ID: ${data.id}`);
    return data.id ?? null;

  } catch (err) {
    console.error('[crmService] ❌ Помилка:', err.message);
    return null;
  }
};

module.exports = { createLead };