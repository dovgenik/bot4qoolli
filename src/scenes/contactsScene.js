// ─────────────────────────────────────────────────────────────────────────────
// src/scenes/contactsScene.js — сцена збору контактів і часового поясу
//
// Flow:
//   Крок 0 → перевірки, запит телефону
//   Крок 1 → телефон або skip, запит email
//   Крок 2 → email або skip:
//              обидва null → bothSkipped → вихід
//              хоча б один → запит timezone (крок 3)
//   Крок 3 → timezone (локація / ручний ввід / skip) → збереження → CRM → нотифікація
// ─────────────────────────────────────────────────────────────────────────────

const { Scenes, Markup }                  = require('telegraf');
const { getUserById, saveContacts,
        saveCrmSync }                     = require('../db/userService');
const { logEvent, ACTIONS }              = require('../db/eventService');
const { createLead }                     = require('../services/crmService');
const { ADMIN_TELEGRAM_ID }              = require('../config/config');
const {
  detectTimezoneFromLocation,
  parseTimeToOffset,
  formatTimezoneForDisplay,
}                                        = require('../utils/timezone');

const uk = require('../locales/uk');
const ru = require('../locales/ru');

// ─────────────────────────────────────────────────────────────────────────────
// Хелпери клавіатур
// ─────────────────────────────────────────────────────────────────────────────

const getLocale = (lang) => lang === 'ru' ? ru : uk;

const isValidEmail = (str) =>
  typeof str === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str.trim());

const phoneKeyboard = (locale) =>
  Markup.keyboard([
    [Markup.button.contactRequest(locale.scene.contacts.sharePhone)],
    [locale.scene.contacts.skip],
    [locale.scene.contacts.cancel],
  ]).resize().oneTime();

const emailKeyboard = (locale) =>
  Markup.keyboard([
    [locale.scene.contacts.skip],
    [locale.scene.contacts.cancel],
  ]).resize().oneTime();

// Клавіатура кроку timezone:
// Кнопка геолокації + Пропустити.
// Юзер також може просто написати час текстом — це теж обробляється.
const timezoneKeyboard = (locale) =>
  Markup.keyboard([
    [Markup.button.locationRequest(locale.scene.contacts.shareLocation)],
    [locale.scene.contacts.skip],
    [locale.scene.contacts.cancel],
  ]).resize().oneTime();

// ─────────────────────────────────────────────────────────────────────────────
// notifyAdmin
// ─────────────────────────────────────────────────────────────────────────────

const notifyAdmin = async (ctx, { phone, email, timezone, lang, skipped = false }) => {
  try {
    const { first_name, last_name, username } = ctx.from;
    const langLabel = lang === 'uk' ? '🇺🇦 Українська' : '🇷🇺 Русский';
    const fullName  = [first_name, last_name].filter(Boolean).join(' ');
    const tzDisplay = formatTimezoneForDisplay(timezone);

    let text;

    if (skipped) {
      text =
        `⚠️ Юзер відвідав сцену, але нічого не надав\n\n` +
        `👤 Ім'я: ${fullName}\n` +
        (username ? `🔗 @${username}\n` : '') +
        `🌐 Мова: ${langLabel}`;
    } else {
      text =
        `🆕 Нові контакти з Telegram-бота\n\n` +
        `👤 Ім'я: ${fullName}\n` +
        (username ? `🔗 @${username}\n` : '') +
        `🌐 Мова: ${langLabel}\n` +
        `📱 Телефон: ${phone    ?? '—'}\n` +
        `📧 Email:   ${email    ?? '—'}\n` +
        `🕐 Часовий пояс: ${tzDisplay}`;
    }

    await ctx.telegram.sendMessage(ADMIN_TELEGRAM_ID, text);
  } catch (err) {
    console.error('[contactsScene] помилка нотифікації адміна:', err.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// СЦЕНА
// ─────────────────────────────────────────────────────────────────────────────

const contactsScene = new Scenes.WizardScene(
  'contacts',

  // ══════════════════════════════════════════════════════════════════════════
  // КРОК 0 — Перевірки, запит телефону
  // ══════════════════════════════════════════════════════════════════════════
  async (ctx) => {
    const lang   = ctx.scene.state?.lang || 'uk';
    const locale = getLocale(lang);

    ctx.wizard.state.lang = lang;

    const user = await getUserById(ctx.from.id);
    if (user?.phone) {
      await ctx.reply(locale.scene.contacts.alreadyDone);
      return ctx.scene.leave();
    }

    await ctx.reply(locale.scene.contacts.askPhone, phoneKeyboard(locale));
    return ctx.wizard.next();
  },

  // ══════════════════════════════════════════════════════════════════════════
  // КРОК 1 — Телефон або skip, запит email
  // ══════════════════════════════════════════════════════════════════════════
  async (ctx) => {
    const locale = getLocale(ctx.wizard.state.lang);
    const text   = ctx.message?.text;

    if (text === locale.scene.contacts.cancel) {
      await ctx.reply(locale.scene.contacts.cancelled, Markup.removeKeyboard());
      return ctx.scene.leave();
    }

    if (text === locale.scene.contacts.skip) {
      ctx.wizard.state.phone = null;
      await ctx.reply(locale.scene.contacts.askEmailAfterSkip, emailKeyboard(locale));
    } else if (ctx.message?.contact) {
      ctx.wizard.state.phone = ctx.message.contact.phone_number;
      await ctx.reply(locale.scene.contacts.askEmail, emailKeyboard(locale));
    } else {
      await ctx.reply(locale.scene.contacts.useButton, phoneKeyboard(locale));
      return;
    }

    return ctx.wizard.next();
  },

  // ══════════════════════════════════════════════════════════════════════════
  // КРОК 2 — Email або skip
  // Якщо обидва null → bothSkipped
  // Якщо є хоча б один → запит timezone
  // ══════════════════════════════════════════════════════════════════════════
  async (ctx) => {
    const locale = getLocale(ctx.wizard.state.lang);
    const text   = ctx.message?.text?.trim();

    if (text === locale.scene.contacts.cancel) {
      await ctx.reply(locale.scene.contacts.cancelled, Markup.removeKeyboard());
      return ctx.scene.leave();
    }

    let email;

    if (text === locale.scene.contacts.skip) {
      email = null;
    } else if (isValidEmail(text)) {
      email = text;
    } else {
      await ctx.reply(locale.scene.contacts.invalidEmail, emailKeyboard(locale));
      return;
    }

    const { phone } = ctx.wizard.state;

    // Обидва null — юзер нічого не надав
    if (phone === null && email === null) {
      await Promise.all([
        logEvent(ctx.from.id, ACTIONS.CONTACTS_SKIPPED, { lang: ctx.wizard.state.lang }),
        notifyAdmin(ctx, { phone: null, email: null, timezone: null, lang: ctx.wizard.state.lang, skipped: true }),
        ctx.reply(locale.scene.contacts.bothSkipped, Markup.removeKeyboard()),
      ]);
      return ctx.scene.leave();
    }

    // Є контакт — зберігаємо email і переходимо до кроку timezone
    ctx.wizard.state.email = email;

    // Запитуємо timezone з parse_mode HTML для відображення <code> тегів
    await ctx.reply(locale.scene.contacts.askTimezone, {
      parse_mode:   'HTML',
      reply_markup: timezoneKeyboard(locale).reply_markup,
    });

    return ctx.wizard.next();
  },

  // ══════════════════════════════════════════════════════════════════════════
  // КРОК 3 — Timezone (локація / ручний ввід / skip) → збереження
  // ══════════════════════════════════════════════════════════════════════════
  async (ctx) => {
    const locale = getLocale(ctx.wizard.state.lang);
    const text   = ctx.message?.text?.trim();

    if (text === locale.scene.contacts.cancel) {
      await ctx.reply(locale.scene.contacts.cancelled, Markup.removeKeyboard());
      return ctx.scene.leave();
    }

    let timezone = undefined; // undefined = не передавати в saveContacts

    if (text === locale.scene.contacts.skip) {
      // Юзер пропустив — timezone залишається null у БД
      timezone = null;

    } else if (ctx.message?.location) {
      // Отримали геолокацію → точний IANA timezone через geo-tz
      const { latitude, longitude } = ctx.message.location;
      timezone = detectTimezoneFromLocation(latitude, longitude);

      if (!timezone) {
        // geo-tz не знайшов timezone (дуже рідко) — просимо повторити
        await ctx.reply(locale.scene.contacts.invalidTime, {
          parse_mode:   'HTML',
          reply_markup: timezoneKeyboard(locale).reply_markup,
        });
        return;
      }

    } else if (text) {
      // Юзер ввів час вручну → парсимо в UTC offset
      timezone = parseTimeToOffset(text);

      if (!timezone) {
        await ctx.reply(locale.scene.contacts.invalidTime, {
          parse_mode:   'HTML',
          reply_markup: timezoneKeyboard(locale).reply_markup,
        });
        return; // залишаємось на кроці 3
      }

    } else {
      // Незрозумілий ввід
      await ctx.reply(locale.scene.contacts.invalidTime, {
        parse_mode:   'HTML',
        reply_markup: timezoneKeyboard(locale).reply_markup,
      });
      return;
    }

    // ── Збереження всіх даних ─────────────────────────────────────────────
    const { phone, email, lang } = ctx.wizard.state;
    const { first_name, last_name } = ctx.from;

    // 1. Спочатку зберігаємо у БД
    await saveContacts(ctx.from.id, { phone, email, timezone });

    // 2. Паралельно: CRM + нотифікація адміна + лог + підтвердження юзеру
    const [crmLeadId] = await Promise.all([
      createLead({ firstName: first_name, lastName: last_name, phone, email, lang, timezone }),
      notifyAdmin(ctx, { phone, email, timezone, lang, skipped: false }),
      logEvent(ctx.from.id, ACTIONS.CONTACTS, {
        lang,
        hasPhone:    !!phone,
        hasEmail:    !!email,
        hasTimezone: !!timezone,
      }),
      ctx.reply(locale.scene.contacts.success, Markup.removeKeyboard()),
    ]);

    // 3. Зберігаємо результат CRM
    await saveCrmSync(ctx.from.id, crmLeadId).catch((err) =>
      console.error('[contactsScene] saveCrmSync error:', err.message)
    );

    return ctx.scene.leave();
  }
);

contactsScene.leave((ctx) => { ctx.wizard.state = {}; });

module.exports = { contactsScene };