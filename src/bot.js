// ─────────────────────────────────────────────────────────────────────────────
// bot.js — ініціалізація бота зі сценою збору контактів
// ─────────────────────────────────────────────────────────────────────────────

const { Telegraf, Scenes, session } = require('telegraf');

const { BOT_TOKEN }             = require('./config/config');
const startHandler              = require('./handlers/startHandler');
const messageHandler            = require('./handlers/messageHandler');
const { contactsScene }         = require('./scenes/contactsScene');
const { canProceed }            = require('./utils/throttle');
const { logEvent, ACTIONS }     = require('./db/eventService');

const uk = require('./locales/uk');
const ru = require('./locales/ru');

const GIFT_COOLDOWN_MS     = 3_000;
const CONTACTS_COOLDOWN_MS = 5_000;

if (!BOT_TOKEN) {
  throw new Error('BOT_TOKEN не знайдений. Перевірте файл .env');
}

const bot = new Telegraf(BOT_TOKEN);

// ─────────────────────────────────────────────────────────────────────────────
// SESSION — зберігає стан між апдейтами (обов'язково перед Stage)
// ─────────────────────────────────────────────────────────────────────────────
bot.use(session());

// ─────────────────────────────────────────────────────────────────────────────
// STAGE — реєстр сцен (обов'язково після session)
// ─────────────────────────────────────────────────────────────────────────────
const stage = new Scenes.Stage([contactsScene]);
bot.use(stage.middleware());

// ─────────────────────────────────────────────────────────────────────────────
// MIDDLEWARE — логування часу обробки
// ─────────────────────────────────────────────────────────────────────────────
bot.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  console.log(`[${new Date().toISOString()}] ${ctx.updateType} — ${Date.now() - start}ms`);
});

// ─────────────────────────────────────────────────────────────────────────────
// КОМАНДИ
// ─────────────────────────────────────────────────────────────────────────────
bot.start(startHandler);

// ─────────────────────────────────────────────────────────────────────────────
// РЕАКЦІЯ НА ТЕКСТ КЛАВІАТУРИ
// ─────────────────────────────────────────────────────────────────────────────
bot.hears(['🇺🇦 Українська', '🇷🇺 Русский'], messageHandler);

// ─────────────────────────────────────────────────────────────────────────────
// CALLBACK — кнопка "Залишити контакти"
// ─────────────────────────────────────────────────────────────────────────────
//
// callback_data: 'contacts:uk' або 'contacts:ru'
// ctx.match[1] — код мови з RegExp capture group
//
bot.action(/contacts:(uk|ru)/, async (ctx) => {
  await ctx.answerCbQuery(); // прибираємо спіннер — завжди першим

console.log("START CTX: ", ctx, ": END CTX.");

  if (!canProceed(ctx.from.id, 'contacts', CONTACTS_COOLDOWN_MS)) return;

  const lang = ctx.match[1];

  // Передаємо мову у сцену через ctx.scene.state.
  // Другий аргумент ctx.scene.enter() — початковий стан сцени:
  // contactsScene отримає його у ctx.scene.state на кроці 0.
  await ctx.scene.enter('contacts', { lang });
});

// ─────────────────────────────────────────────────────────────────────────────
// CALLBACK — кнопка "Подарунок"
// ─────────────────────────────────────────────────────────────────────────────
bot.action(/gift:(uk|ru)/, async (ctx) => {
  await ctx.answerCbQuery();

  if (!canProceed(ctx.from.id, 'gift', GIFT_COOLDOWN_MS)) return;

  const lang   = ctx.match[1];
  const locale = lang === 'uk' ? uk : ru;

  await Promise.all([
    logEvent(ctx.from.id, ACTIONS.BTN_GIFT, { lang }),
    ctx.reply(locale.giftText),
  ]);
});

// ─────────────────────────────────────────────────────────────────────────────
// ГЛОБАЛЬНИЙ ОБРОБНИК ПОМИЛОК
// ─────────────────────────────────────────────────────────────────────────────
bot.catch((err, ctx) => {
  console.error(`[ПОМИЛКА] ${ctx?.updateType}:`, err);
  ctx?.reply('Сталася помилка. Спробуйте ще раз або надішліть /start').catch(() => {});
});

module.exports = bot;