const { Telegraf } = require('telegraf');
const { BOT_TOKEN } = require('./config/config');
 
const startHandler   = require('./handlers/startHandler');
const messageHandler = require('./handlers/messageHandler');
 
const uk = require('./locales/uk');
const ru = require('./locales/ru');
 
const { canProceed }  = require('./utils/throttle');
const { logEvent, ACTIONS } = require('./db/eventService');
 
const GIFT_COOLDOWN_MS = 3_000;
 
if (!BOT_TOKEN) {
  throw new Error('BOT_TOKEN не знайдений. Перевірте файл .env');
}
 
const bot = new Telegraf(BOT_TOKEN);
 
bot.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  console.log(`[${new Date().toISOString()}] ${ctx.updateType} — ${Date.now() - start}ms`);
});
 
bot.start(startHandler);
bot.hears(['🇺🇦 Українська', '🇷🇺 Русский'], messageHandler);
 
bot.action(/gift:(uk|ru)/, async (ctx) => {
  // answerCbQuery — завжди першим (прибирає спіннер на кнопці)
  await ctx.answerCbQuery();
 
  if (!canProceed(ctx.from.id, 'gift', GIFT_COOLDOWN_MS)) return;
 
  const lang   = ctx.match[1];
  const locale = lang === 'uk' ? uk : ru;
 
  // Логуємо і відповідаємо паралельно — незалежні операції
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