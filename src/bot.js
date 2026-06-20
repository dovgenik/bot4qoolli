// ─────────────────────────────────────────────────────────────────────────────
// bot.js — ініціалізація бота
// ─────────────────────────────────────────────────────────────────────────────

const { Telegraf, Scenes, session } = require('telegraf');

const { BOT_TOKEN }                  = require('./config/config');
const startHandler                   = require('./handlers/startHandler');
const messageHandler                 = require('./handlers/messageHandler');
const changeLanguageHandler          = require('./handlers/changeLanguageHandler');
const { contactsScene }              = require('./scenes/contactsScene');
const { canProceed }                 = require('./utils/throttle');
const { logEvent, ACTIONS }          = require('./db/eventService');
const { LANG_KEYBOARD_TEXTS }        = require('./utils/language');

const uk = require('./locales/uk');
const ru = require('./locales/ru');

const GIFT_COOLDOWN_MS     = 3_000;
const CONTACTS_COOLDOWN_MS = 5_000;

if (!BOT_TOKEN) {
  throw new Error('BOT_TOKEN не знайдений. Перевірте файл .env');
}

const bot = new Telegraf(BOT_TOKEN);

bot.use(session());

const stage = new Scenes.Stage([contactsScene]);
bot.use(stage.middleware());

bot.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  console.log(`[${new Date().toISOString()}] ${ctx.updateType} — ${Date.now() - start}ms`);
});

// ── Команди ───────────────────────────────────────────────────────────────────

bot.start(startHandler);

// /language — дозволяє змінити мову у будь-який момент.
// Корисно для юзерів з непідтримуваною Telegram-мовою
// або якщо хочуть іншу мову ніж автовизначена.
bot.command('language', changeLanguageHandler);

// ── Клавіатура мови ───────────────────────────────────────────────────────────
//
// LANG_KEYBOARD_TEXTS — масив текстів кнопок з language.js.
// При додаванні нової мови — bot.hears оновлюється автоматично.
// Раніше: bot.hears(['🇺🇦 Українська', '🇷🇺 Русский'], messageHandler)
// Тепер:  bot.hears(LANG_KEYBOARD_TEXTS, messageHandler)
//
bot.hears(LANG_KEYBOARD_TEXTS, messageHandler);

// ── Callbacks ─────────────────────────────────────────────────────────────────

bot.action(/contacts:(uk|ru)/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!canProceed(ctx.from.id, 'contacts', CONTACTS_COOLDOWN_MS)) return;
  await ctx.scene.enter('contacts', { lang: ctx.match[1] });
});

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

bot.catch((err, ctx) => {
  console.error(`[ПОМИЛКА] ${ctx?.updateType}:`, err);
  ctx?.reply('Сталася помилка. Спробуйте ще раз або надішліть /start').catch(() => {});
});

module.exports = bot;