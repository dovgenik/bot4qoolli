// ─────────────────────────────────────────────────────────────────────────────
// src/utils/sendContent.js — надсилання основного контенту юзеру
//
// Раніше ця послідовність дублювалась у startHandler і messageHandler.
// Виносимо в окремий модуль — одне місце для змін.
// ─────────────────────────────────────────────────────────────────────────────


// sendContent — надсилає відео → текст → inline меню
//
// Виклик sequential await обов'язковий:
// Telegram не гарантує порядок якщо надсилати паралельно,
// і відео може прийти після тексту.
//
// @param {object} ctx    — Telegraf context
// @param {object} locale — об'єкт локалі (uk або ru)
//

// ─────────────────────────────────────────────────────────────────────────────
// src/utils/sendContent.js — надсилання основного контенту юзеру
//
// Сигнатура не змінилась: sendContent(ctx, content)
// Різниця: тепер content приходить з contentService (БД),
// а не з locale-файлів напряму.
// Структура об'єкта однакова — решта коду без змін.
// ─────────────────────────────────────────────────────────────────────────────

const { mainMenuKb } = require('../keyboards/mainMenuKb');

const sendContent = async (ctx, content) => {
  await ctx.sendChatAction('upload_video');
  await ctx.sendVideo(content.videoFileId);
  await ctx.reply(content.welcomeText);
  await ctx.reply(content.menuText, mainMenuKb(content));
};

module.exports = { sendContent };