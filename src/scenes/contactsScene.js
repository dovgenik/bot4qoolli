// ─────────────────────────────────────────────────────────────────────────────
// src/scenes/contactsScene.js — сцена збору контактів з CRM-інтеграцією
//
// Flow:
//   Крок 0 → перевірки, запит телефону
//   Крок 1 → отримання телефону (або skip), запит email
//   Крок 2 → отримання email (або skip), логіка збереження:
//
//     ┌─ обидва null ──→ bothSkipped повідомлення, лог CONTACTS_SKIPPED
//     └─ хоча б один ─→ saveContacts + notifyAdmin + createLead + saveCrmSync
// ─────────────────────────────────────────────────────────────────────────────

const { Scenes, Markup }                  = require('telegraf');
const { getUserById, saveContacts,
        saveCrmSync }                     = require('../db/userService');
const { logEvent, ACTIONS }              = require('../db/eventService');
const { createLead }                     = require('../services/crmService');
const { ADMIN_TELEGRAM_ID }              = require('../config/config');

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
// notifyAdmin — надсилає нотифікацію адміну
//
// Два режими:
//   skipped: true  — юзер нічого не надав (коротке повідомлення)
//   skipped: false — є хоча б один контакт (повне повідомлення)
// ─────────────────────────────────────────────────────────────────────────────

const notifyAdmin = async (ctx, { phone, email, lang, skipped = false }) => {
  try {
    const { first_name, last_name, username } = ctx.from;
    const langLabel = lang === 'uk' ? '🇺🇦 Українська' : '🇷🇺 Русский';

    const fullName = [first_name, last_name].filter(Boolean).join(' ');

    let text;

    if (skipped) {
      text =
        `⚠️ Юзер відвідав сцену контактів, але нічого не надав\n\n` +
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
        `📧 Email:   ${email ?? '—'}`;
    }

    await ctx.telegram.sendMessage(ADMIN_TELEGRAM_ID, text);
  } catch (err) {
    console.error('[contactsScene] не вдалось надіслати нотифікацію адміну:', err.message);
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
  // КРОК 1 — Телефон або пропуск
  // ══════════════════════════════════════════════════════════════════════════
  async (ctx) => {
    const locale = getLocale(ctx.wizard.state.lang);
    const text   = ctx.message?.text;

    if (text === locale.scene.contacts.cancel) {
      await ctx.reply(locale.scene.contacts.cancelled, Markup.removeKeyboard());
      return ctx.scene.leave();
    }

    if (text === locale.scene.contacts.skip) {
      // Зберігаємо null і показуємо інший текст переходу до email
      ctx.wizard.state.phone = null;
      await ctx.reply(locale.scene.contacts.askEmailAfterSkip, emailKeyboard(locale));
    } else if (ctx.message?.contact) {
      ctx.wizard.state.phone = ctx.message.contact.phone_number;
      await ctx.reply(locale.scene.contacts.askEmail, emailKeyboard(locale));
    } else {
      await ctx.reply(locale.scene.contacts.useButton, phoneKeyboard(locale));
      return; // залишаємось на кроці 1
    }

    return ctx.wizard.next();
  },

  // ══════════════════════════════════════════════════════════════════════════
  // КРОК 2 — Email або пропуск, збереження, CRM
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
      return; // залишаємось на кроці 2
    }

    const { phone, lang } = ctx.wizard.state;
    const bothSkipped     = phone === null && email === null;

    if (bothSkipped) {
      // ── Обидва пропущені ─────────────────────────────────────────────────
      //
      // Зберігаємо факт відвідування сцени через подію CONTACTS_SKIPPED.
      // НЕ викликаємо saveContacts (нічого зберігати) і НЕ надсилаємо в CRM.
      // Адміна повідомляємо скороченим повідомленням.
      //
      await Promise.all([
        logEvent(ctx.from.id, ACTIONS.CONTACTS_SKIPPED, { lang }),
        notifyAdmin(ctx, { phone: null, email: null, lang, skipped: true }),
        ctx.reply(locale.scene.contacts.bothSkipped, Markup.removeKeyboard()),
      ]);

      return ctx.scene.leave();
    }

    // ── Є хоча б один контакт ─────────────────────────────────────────────

    const { first_name, last_name } = ctx.from;

    // 1. Зберігаємо контакти у БД — першим, щоб дані були в БД навіть
    //    якщо наступні кроки (CRM, нотифікація) не пройдуть.
    await saveContacts(ctx.from.id, { phone, email });

    // 2. Паралельно: CRM + нотифікація адміна + підтвердження юзеру
    const [crmLeadId] = await Promise.all([
      // createLead повертає ID або null — не кидає помилку
      createLead({ firstName: first_name, lastName: last_name, phone, email, lang }),
      notifyAdmin(ctx, { phone, email, lang, skipped: false }),
      logEvent(ctx.from.id, ACTIONS.CONTACTS, {
        lang,
        hasPhone: !!phone,
        hasEmail: !!email,
      }),
      ctx.reply(locale.scene.contacts.success, Markup.removeKeyboard()),
    ]);

    // 3. Зберігаємо результат CRM-синхронізації.
    //    Робимо окремо після Promise.all — crmLeadId відомий лише після createLead.
    //    Помилка тут не критична — обгортаємо у catch.
    await saveCrmSync(ctx.from.id, crmLeadId).catch((err) =>
      console.error('[contactsScene] не вдалось зберегти CRM sync:', err.message)
    );

    return ctx.scene.leave();
  }
);

contactsScene.leave((ctx) => { ctx.wizard.state = {}; });

module.exports = { contactsScene };