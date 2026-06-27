// ─────────────────────────────────────────────────────────────────────────────
// src/scenes/contactsScene.js
//
// Flow (спрощений — без кроку 3):
//   Крок 0 → перевірки, запит телефону
//   Крок 1 → телефон або skip, запит email
//   Крок 2 → email або skip:
//              обидва null           → bothSkipped → вихід
//              ask_timezone = false  → зберігаємо, надсилаємо success, вихід
//              ask_timezone = true   → зберігаємо, надсилаємо success +
//                                      inline-кнопку з посиланням на /tz
//                                      → вихід (timezone прийде окремо через браузер)
//
// Зміна: notifyAdmin тепер повертає { messageId, ... } — дані для редагування.
// saveAndFinish зберігає їх у pendingTimezones, щоб /tz/save міг відредагувати
// повідомлення адміну замість надсилання нового.
// ─────────────────────────────────────────────────────────────────────────────

const { Scenes, Markup }            = require('telegraf');
const { getUserById, saveContacts,
        saveCrmSync }               = require('../db/userService');
const { logEvent, ACTIONS }        = require('../db/eventService');
const { createLead }               = require('../services/crmService');
const { getConfig }                = require('../db/contentService');
const { ADMIN_TELEGRAM_ID,
        BUSINESS_TIMEZONE,
        SERVER_URL }               = require('../config/config');
const { formatTimezoneForDisplay } = require('../utils/timezone');
const pendingTimezones             = require('../utils/pendingTimezones');

const uk = require('../locales/uk');
const ru = require('../locales/ru');

// ─────────────────────────────────────────────────────────────────────────────
// Хелпери
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

// ─────────────────────────────────────────────────────────────────────────────
// getBusinessTimezone — timezone замовника з Config або .env
// ─────────────────────────────────────────────────────────────────────────────
const getBusinessTimezone = async () => {
  const config = await getConfig();
  return config.business_timezone || BUSINESS_TIMEZONE;
};

// ─────────────────────────────────────────────────────────────────────────────
// isAskTimezoneEnabled — читає флаг з Config
// ─────────────────────────────────────────────────────────────────────────────
const isAskTimezoneEnabled = async () => {
  const config = await getConfig();
  return config.ask_timezone !== 'false';
};

// ─────────────────────────────────────────────────────────────────────────────
// notifyAdmin — нотифікація про нові контакти
//
// Зміна: тепер повертає об'єкт з message_id і даними повідомлення.
// Це дозволяє /tz/save відредагувати це повідомлення, замість надсилання
// нового, коли timezone визначається через браузер юзера.
//
// Повертає null для skipped-кейсу або при помилці надсилання.
// ─────────────────────────────────────────────────────────────────────────────
const notifyAdmin = async (ctx, { phone, email, lang, skipped = false }) => {
  try {
    const { first_name, last_name, username } = ctx.from;
    const langLabel = lang === 'uk' ? '🇺🇦 Українська' : '🇷🇺 Русский';
    const fullName  = [first_name, last_name].filter(Boolean).join(' ');

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
        `📱 Телефон: ${phone ?? '—'}\n` +
        `📧 Email:   ${email ?? '—'}\n` +
        `🕐 Часовий пояс: визначається...`;
    }

    const sent = await ctx.telegram.sendMessage(ADMIN_TELEGRAM_ID, text);

    // Для skipped-кейсу timezone не запитується → редагування не потрібне
    if (skipped) return null;

    // Повертаємо все необхідне для подальшого редагування повідомлення
    return {
      messageId: sent.message_id,
      fullName,
      username:  username ?? null,
      langLabel,
      phone:     phone ?? '—',
      email:     email ?? '—',
    };
  } catch (err) {
    console.error('[contactsScene] помилка нотифікації:', err.message);
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// saveAndFinish — зберігає контакти, CRM, нотифікація, кнопка timezone
//
// Зміна: зберігаємо результат notifyAdmin у pendingTimezones.
// Це дозволяє server.js відредагувати повідомлення адміну, коли
// timezone прийде з браузера — замість надсилання другого повідомлення.
// ─────────────────────────────────────────────────────────────────────────────
const saveAndFinish = async (ctx) => {
  const { phone, email, lang } = ctx.wizard.state;
  const { first_name, last_name } = ctx.from;
  const locale     = getLocale(lang);
  const businessTz = await getBusinessTimezone();

  // Зберігаємо контакти (без timezone)
  await saveContacts(ctx.from.id, { phone, email });

  // Паралельно: CRM + нотифікація адміна + лог
  // notifyAdmin тепер повертає { messageId, fullName, ... } або null
  const [crmLeadId, notifyResult] = await Promise.all([
    createLead({
      firstName: first_name, lastName: last_name,
      phone, email, lang,
      timezone: null, businessTimezone: businessTz,
    }),
    notifyAdmin(ctx, { phone, email, lang }),
    logEvent(ctx.from.id, ACTIONS.CONTACTS, {
      lang, hasPhone: !!phone, hasEmail: !!email,
    }),
  ]);

  await saveCrmSync(ctx.from.id, crmLeadId).catch((err) =>
    console.error('[contactsScene] saveCrmSync error:', err.message)
  );

  // Зберігаємо дані повідомлення для редагування коли прийде timezone.
  // server.js отримає той самий Map (Node кешує require).
  if (notifyResult?.messageId) {
    pendingTimezones.set(ctx.from.id, notifyResult);
  }

  // Підтвердження юзеру (прибираємо Reply keyboard)
  await ctx.reply(locale.scene.contacts.success, Markup.removeKeyboard());

  // ── Кнопка timezone ─────────────────────────────────────────────────────
  const askTz    = await isAskTimezoneEnabled();
  const isPublic = SERVER_URL && !SERVER_URL.includes('localhost');

  if (askTz && isPublic) {
    const tzUrl = `${SERVER_URL}/tz?u=${ctx.from.id}&l=${lang}`;
    await ctx.reply(
      locale.scene.contacts.askTzLink,
      Markup.inlineKeyboard([
        [Markup.button.url(locale.scene.contacts.tzButton, tzUrl)],
      ])
    );
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// СЦЕНА — 3 кроки (0, 1, 2)
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
  // КРОК 1 — Телефон або skip
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
  // КРОК 2 — Email або skip → зберігаємо і виходимо
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

    // Обидва null
    if (phone === null && email === null) {
      await Promise.all([
        logEvent(ctx.from.id, ACTIONS.CONTACTS_SKIPPED, { lang: ctx.wizard.state.lang }),
        notifyAdmin(ctx, { phone: null, email: null, lang: ctx.wizard.state.lang, skipped: true }),
        ctx.reply(locale.scene.contacts.bothSkipped, Markup.removeKeyboard()),
      ]);
      return ctx.scene.leave();
    }

    ctx.wizard.state.email = email;

    await saveAndFinish(ctx);
    return ctx.scene.leave();
  }
);

contactsScene.leave((ctx) => { ctx.wizard.state = {}; });

module.exports = { contactsScene };