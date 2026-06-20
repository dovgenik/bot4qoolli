// ─────────────────────────────────────────────────────────────────────────────
// src/services/crmService.js — інтеграція з Uspacy CRM
//
// Відповідає за створення ліда у CRM через вебхук.
// Повертає ID ліда при успіху або null при помилці.
// Помилки не кидаємо далі — CRM-збій не повинен ламати UX бота.
// ─────────────────────────────────────────────────────────────────────────────

const { CRM_WEBHOOK_URL } = require('../config/config');

// ─────────────────────────────────────────────────────────────────────────────
// createLead — надсилає POST-запит у CRM і повертає ID ліда
//
// @param {object} params
// @param {string}      params.firstName  — ім'я з Telegram (ctx.from.first_name)
// @param {string|null} params.lastName   — прізвище з Telegram (ctx.from.last_name)
// @param {string|null} params.phone      — телефон або null якщо пропущено
// @param {string|null} params.email      — email або null якщо пропущено
// @param {string}      params.lang       — код мови ('uk' | 'ru')
//
// @returns {number|null} — ID ліда у CRM або null якщо не вдалось
// ─────────────────────────────────────────────────────────────────────────────

const createLead = async ({ firstName, lastName, phone, email, lang }) => {
  try {
    // Формуємо мовну мітку для поля title — щоб у CRM одразу видно звідки лід
    const langLabel = lang === 'uk' ? '🇺🇦 UK' : '🇷🇺 RU';

    // Будуємо тіло запиту.
    // Поля phone і email — масиви об'єктів (формат Uspacy API).
    // Передаємо лише якщо значення є — не надсилаємо порожні масиви.
    const body = {
      title:     `Нова заявка з Telegram-бота [${langLabel}]`,
      firstName,

      // lastName може бути undefined — оператор ?. та ?? дають безпечний доступ
      ...(lastName  && { lastName }),
      ...(phone     && { phone: [{ value: phone }] }),
      ...(email     && { email: [{ value: email }] }),

      comments: 'Користувач залишив контакти із ТГ бота',
    };

    // URL вебхука: CRM_WEBHOOK_URL + шлях до ендпоінту лідів
    // Приклад: https://qoolli-academy.uspacy.ua/company/v1/incoming_webhooks/run/KEY/crm/v1/entities/leads
    const url = `${CRM_WEBHOOK_URL}/crm/v1/entities/leads`;

    // fetch — вбудований у Node.js 18+.
    // Якщо отримаєте "fetch is not defined" — встановіть: npm install node-fetch
    // і додайте: const fetch = require('node-fetch');
    const response = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });

    if (!response.ok) {
      // Логуємо тіло відповіді для діагностики
      const errorText = await response.text().catch(() => '');
      console.error(
        `[crmService] CRM відповів статусом ${response.status}:`,
        errorText
      );
      return null;
    }

    const data = await response.json();

    // Повертаємо числовий ID ліда — збережемо у БД у полі User.crmLeadId
    console.log(`[crmService] ✅ Лід створено, ID: ${data.id}`);
    return data.id ?? null;

  } catch (err) {
    // Мережева помилка, таймаут тощо — не кидаємо далі
    console.error('[crmService] ❌ Не вдалось створити лід:', err.message);
    return null;
  }
};

module.exports = { createLead };