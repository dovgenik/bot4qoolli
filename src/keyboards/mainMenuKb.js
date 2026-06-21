// ─────────────────────────────────────────────────────────────────────────────
// keyboards/mainMenuKb.js — inline-меню з п'яти кнопок
//
// Зміна відносно попередньої версії:
//   URL-адреси більше не імпортуються з config.js —
//   вони передаються через content.urls (з contentService → БД).
//   Це дозволяє змінювати посилання через адмінку без перезапуску бота.
// ─────────────────────────────────────────────────────────────────────────────

const { Markup } = require('telegraf');

// content — об'єкт з contentService, містить:
//   content.buttons.* — підписи кнопок
//   content.urls.*    — URL-адреси (з Config таблиці)
//   content.lang      — код мови для callback_data
const mainMenuKb = (content) =>
  Markup.inlineKeyboard([
    [Markup.button.url(content.buttons.register, content.urls.site)],
    [Markup.button.callback(content.buttons.contacts, `contacts:${content.lang}`)],
    [Markup.button.url(content.buttons.channel, content.urls.channel)],
    [Markup.button.url(content.buttons.consult,  content.urls.consult)],
    [Markup.button.callback(content.buttons.gift, `gift:${content.lang}`)],
  ]);

module.exports = { mainMenuKb };