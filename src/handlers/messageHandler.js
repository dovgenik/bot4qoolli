// ─────────────────────────────────────────────────────────────────────────────
// handlers/messageHandler.js — обробник вибору мови через клавіатуру
//
// Спрацьовує коли юзер натискає кнопку мови (🇺🇦 Українська / 🇷🇺 Русский).
// Використовує спільні утиліти language.js і sendContent.js.
// ─────────────────────────────────────────────────────────────────────────────

const { updateLanguage }              = require('../db/userService');
const { logEvent, ACTIONS }           = require('../db/eventService');
const { canProceed }                  = require('../utils/throttle');
const { getLangByButton, getLocale }  = require('../utils/language');
const { sendContent }                 = require('../utils/sendContent');

const COOLDOWN_MS = 8_000;

module.exports = async (ctx) => {

  if (!canProceed(ctx.from.id, 'lang_select', COOLDOWN_MS)) return;

  // getLangByButton визначає мову за текстом кнопки через BUTTON_LANG_MAP
  const lang = getLangByButton(ctx.message.text);
  if (!lang) return;

  const locale = getLocale(lang);

  // Зберігаємо мову і логуємо подію паралельно.
  // Помилка БД не ламає UX — обгортаємо у catch.
  Promise.all([
    updateLanguage(ctx.from.id, lang),
    logEvent(ctx.from.id, ACTIONS.LANG_SELECT, { lang }),
  ]).catch((err) =>
    console.error('[messageHandler] помилка запису у БД:', err.message)
  );

  await sendContent(ctx, locale);
};