// ─────────────────────────────────────────────────────────────────────────────
// src/services/crmService.js — інтеграція з Uspacy CRM
// Зміна: timezone додається до поля comments
// ─────────────────────────────────────────────────────────────────────────────

const { CRM_WEBHOOK_URL }            = require('../config/config');
const { formatTimezoneForDisplay }   = require('../utils/timezone');

// ─────────────────────────────────────────────────────────────────────────────
// createLead
//
// @param {{ firstName, lastName, phone, email, lang, timezone }} params
// @returns {number|null} — ID ліда або null при помилці
// ─────────────────────────────────────────────────────────────────────────────
const createLead = async ({ firstName, lastName, phone, email, lang, timezone }) => {
  try {
    const langLabel = lang === 'uk' ? '🇺🇦 UK' : '🇷🇺 RU';

    // Формуємо рядок коментаря з усіма доступними даними
    const tzDisplay = formatTimezoneForDisplay(timezone);
    const comments  =
      `Користувач залишив контакти із ТГ бота\n` +
      (timezone ? `Часовий пояс: ${tzDisplay}` : 'Часовий пояс: не вказано');

    const body = {
      title:     `Нова заявка з Telegram-бота [${langLabel}]`,
      firstName,
      ...(lastName && { lastName }),
      ...(phone    && { phone: [{ value: phone }] }),
      ...(email    && { email: [{ value: email }] }),
      comments,
    };

    const url      = `${CRM_WEBHOOK_URL}/crm/v1/entities/leads`;
    const response = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error(`[crmService] CRM відповів ${response.status}:`, errorText);
      return null;
    }

    const data = await response.json();
    console.log(`[crmService] ✅ Лід створено, ID: ${data.id}`);
    return data.id ?? null;

  } catch (err) {
    console.error('[crmService] ❌ Не вдалось створити лід:', err.message);
    return null;
  }
};

module.exports = { createLead };