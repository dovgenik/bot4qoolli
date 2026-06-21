// ─────────────────────────────────────────────────────────────────────────────
// handlers/messageHandler.js — обробник вибору мови через клавіатуру
// Зміна: getLocale() замінено на getContent() з contentService
// ─────────────────────────────────────────────────────────────────────────────

const { updateLanguage }              = require('../db/userService');
const { logEvent, ACTIONS }           = require('../db/eventService');
const { canProceed }                  = require('../utils/throttle');
const { getLangByButton }             = require('../utils/language');
const { getContent }                  = require('../db/contentService');
const { sendContent }                 = require('../utils/sendContent');

const COOLDOWN_MS = 8_000;

module.exports = async (ctx) => {

  if (!canProceed(ctx.from.id, 'lang_select', COOLDOWN_MS)) return;

  const lang = getLangByButton(ctx.message.text);
  if (!lang) return;

  // getContent читає з кешу або БД — async, але завдяки кешу майже без затримки
  const content = await getContent(lang);

  Promise.all([
    updateLanguage(ctx.from.id, lang),
    logEvent(ctx.from.id, ACTIONS.LANG_SELECT, { lang }),
  ]).catch((err) =>
    console.error('[messageHandler] помилка запису у БД:', err.message)
  );

  await sendContent(ctx, content);
};