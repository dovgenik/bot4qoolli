// ─────────────────────────────────────────────────────────────────────────────
// src/scenes/contactsScene.js — сцена збору телефону і email
//
// Запускається з bot.js через ctx.scene.enter('contacts') коли юзер
// натискає callback-кнопку "Залишити контакти".
//
// Мова: передається через callback_data ('contacts:uk' / 'contacts:ru')
// і зберігається у ctx.wizard.state.lang з першого кроку.
//
// Flow:
//   Крок 0 → запит телефону (contactRequest кнопка)
//   Крок 1 → отримання телефону, запит email (з опцією "Пропустити")
//   Крок 2 → отримання email, збереження у БД, нотифікація адміна
// ─────────────────────────────────────────────────────────────────────────────

const { Scenes, Markup } = require('telegraf');
const { getUserById, saveContacts } = require('../db/userService');
const { logEvent, ACTIONS }         = require('../db/eventService');
const { ADMIN_TELEGRAM_ID }         = require('../config/config');

const uk = require('../locales/uk');
const ru = require('../locales/ru');

// ─────────────────────────────────────────────────────────────────────────────
// Хелпери
// ─────────────────────────────────────────────────────────────────────────────

const getLocale = (lang) => lang === 'ru' ? ru : uk;

// Валідація email — базовий regex, відсіює очевидні помилки
const isValidEmail = (str) =>
  typeof str === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str.trim());

// Reply keyboard для кроку з телефоном
const phoneKeyboard = (locale) =>
  Markup.keyboard([
    [Markup.button.contactRequest(locale.scene.contacts.sharePhone)],
    [locale.scene.contacts.skip],
    [locale.scene.contacts.cancel],
  ]).resize().oneTime();

// Reply keyboard для кроку з email
const emailKeyboard = (locale) =>
  Markup.keyboard([
    [locale.scene.contacts.skip],
    [locale.scene.contacts.cancel],
  ]).resize().oneTime();

// ─────────────────────────────────────────────────────────────────────────────
// Нотифікація адміна
// ─────────────────────────────────────────────────────────────────────────────
//
// Надсилаємо через ctx.telegram.sendMessage — доступний у будь-якому
// кроці сцени без імпорту екземпляра бота.
//
// Обгортаємо у try/catch: помилка нотифікації не повинна ламати UX.
// Якщо адмін заблокував бота або ID неправильний — юзер все одно
// отримає підтвердження, а помилка піде у консоль.
//
const notifyAdmin = async (ctx, { phone, email, lang }) => {
  try {
    const { first_name, username } = ctx.from;
    const langLabel = lang === 'uk' ? '🇺🇦 Українська' : '🇷🇺 Русский';

    const text =
      `🆕 Нова реєстрація контактів\n\n` +
      `👤 Ім'я: ${first_name}\n` +
      (username ? `🔗 Username: @${username}\n` : ``) +
      `🌐 Мова: ${langLabel}\n` +
      `📱 Телефон: ${phone  ?? '—'}\n` +
      `📧 Email:   ${email  ?? '—'}`;

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
  // КРОК 0 — Перевірка, ініціалізація, запит телефону
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Викликається при ctx.scene.enter('contacts').
  // ctx тут містить оригінальний callback_query від кнопки меню.
  //
  async (ctx) => {
    // Мова передана у callback_data: 'contacts:uk' або 'contacts:ru'.
    // ctx.match встановлюється у bot.action() і передається у сцену
    // через ctx.scene.enter('contacts', { lang }) — дивіться bot.js.
    const lang   = ctx.scene.state?.lang || 'uk';
    const locale = getLocale(lang);

    // Зберігаємо мову у стані wizard-а — доступна на всіх наступних кроках
    ctx.wizard.state.lang = lang;

    // Перевіряємо чи юзер вже залишав контакти
    const user = await getUserById(ctx.from.id);
    if (user?.phone) {
      await ctx.reply(locale.scene.contacts.alreadyDone);
      return ctx.scene.leave();
    }

    await ctx.reply(locale.scene.contacts.askPhone, phoneKeyboard(locale));
    return ctx.wizard.next();
  },

  // ══════════════════════════════════════════════════════════════════════════
  // КРОК 1 — Отримання телефону, запит email
  // ══════════════════════════════════════════════════════════════════════════
  async (ctx) => {
    const locale = getLocale(ctx.wizard.state.lang);
    const text   = ctx.message?.text;

    // Скасування
    if (text === locale.scene.contacts.cancel) {
      await ctx.reply(locale.scene.contacts.cancelled, Markup.removeKeyboard());
      return ctx.scene.leave();
    }

    // Юзер натиснув "Пропустити" — phone залишається undefined
    if (text === locale.scene.contacts.skip) {
      ctx.wizard.state.phone = null; // явно null — щоб знати що пропущено
    } else if (ctx.message?.contact) {
      // Отримали верифікований контакт від Telegram
      ctx.wizard.state.phone = ctx.message.contact.phone_number;
    } else {
      // Юзер написав текст замість натискання кнопки
      await ctx.reply(locale.scene.contacts.useButton, phoneKeyboard(locale));
      return; // залишаємось на кроці 1
    }

    await ctx.reply(locale.scene.contacts.askEmail, emailKeyboard(locale));
    return ctx.wizard.next();
  },

  // ══════════════════════════════════════════════════════════════════════════
  // КРОК 2 — Отримання email, збереження, нотифікація адміна
  // ══════════════════════════════════════════════════════════════════════════
  async (ctx) => {
    const locale = getLocale(ctx.wizard.state.lang);
    const text   = ctx.message?.text?.trim();

    // Скасування
    if (text === locale.scene.contacts.cancel) {
      await ctx.reply(locale.scene.contacts.cancelled, Markup.removeKeyboard());
      return ctx.scene.leave();
    }

    let email;

    if (text === locale.scene.contacts.skip) {
      // Юзер пропустив email
      email = null;
    } else if (isValidEmail(text)) {
      email = text;
    } else {
      // Невірний формат — залишаємось на кроці 2
      await ctx.reply(locale.scene.contacts.invalidEmail, emailKeyboard(locale));
      return;
    }

    const { phone, lang } = ctx.wizard.state;

    // Зберігаємо у БД і логуємо подію — паралельно, незалежні операції.
    // Збереження виконуємо перед нотифікацією — дані мають бути в БД
    // навіть якщо нотифікація не пройде.
    await saveContacts(ctx.from.id, { phone, email });

    // Запускаємо нотифікацію і підтвердження юзеру паралельно.
    // logEvent загорнутий у try/catch всередині — не ламає flow.
    await Promise.all([
      notifyAdmin(ctx, { phone, email, lang }),
      logEvent(ctx.from.id, ACTIONS.CONTACTS, {
        lang,
        hasPhone: !!phone,
        hasEmail: !!email,
      }),
      ctx.reply(locale.scene.contacts.success, Markup.removeKeyboard()),
    ]);

    return ctx.scene.leave();
  }
);

// Очищаємо стан при виході (і при успіху, і при скасуванні)
contactsScene.leave((ctx) => { ctx.wizard.state = {}; });

module.exports = { contactsScene };