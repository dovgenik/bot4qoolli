// ─────────────────────────────────────────────────────────────────────────────
// bot.js — ініціалізація бота
// ─────────────────────────────────────────────────────────────────────────────

const { Telegraf, Scenes, session } = require('telegraf');

const { BOT_TOKEN }             = require('./config/config');
const startHandler              = require('./handlers/startHandler');
const messageHandler            = require('./handlers/messageHandler');
const changeLanguageHandler     = require('./handlers/changeLanguageHandler');
const { broadcastStartHandler,
        broadcastListHandler }  = require('./handlers/broadcastHandler');
const { contactsScene }         = require('./scenes/contactsScene');
const { canProceed }            = require('./utils/throttle');
const { logEvent, ACTIONS }     = require('./db/eventService');
const { LANG_KEYBOARD_TEXTS }   = require('./utils/language');
const { getContent }            = require('./db/contentService');

const { ADMIN_TELEGRAM_ID }     = require('./config/config');

const GIFT_COOLDOWN_MS     = 3_000;
const CONTACTS_COOLDOWN_MS = 5_000;

if (!BOT_TOKEN) throw new Error('BOT_TOKEN не знайдений');

const bot = new Telegraf(BOT_TOKEN);

bot.use(session());
bot.use(new Scenes.Stage([contactsScene]).middleware());

bot.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  console.log(`[${new Date().toISOString()}] ${ctx.updateType} — ${Date.now() - start}ms`);
});

// ── Команди ───────────────────────────────────────────────────────────────────

bot.start(startHandler);
bot.command('language', changeLanguageHandler);

// Адмін-команди розсилок
bot.command('broadcast',     broadcastStartHandler);
bot.command('broadcastlist', broadcastListHandler);

// ── Клавіатура ────────────────────────────────────────────────────────────────

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

  const lang    = ctx.match[1];
  // Беремо giftText з БД через contentService (з кешем)
  const content = await getContent(lang);

  await Promise.all([
    logEvent(ctx.from.id, ACTIONS.BTN_GIFT, { lang }),
    ctx.reply(content.giftText),
  ]);
});

bot.catch((err, ctx) => {
  console.error(`[ПОМИЛКА] ${ctx?.updateType}:`, err);
  ctx?.reply('Сталася помилка. Спробуйте ще раз або надішліть /start').catch(() => {});
});

module.exports = bot;