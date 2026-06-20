// ─────────────────────────────────────────────────────────────────────────────
// src/utils/sendContent.js — надсилання основного контенту юзеру
//
// Раніше ця послідовність дублювалась у startHandler і messageHandler.
// Виносимо в окремий модуль — одне місце для змін.
// ─────────────────────────────────────────────────────────────────────────────

const { mainMenuKb } = require('../keyboards/mainMenuKb');

// sendContent — надсилає відео → текст → inline меню
//
// Виклик sequential await обов'язковий:
// Telegram не гарантує порядок якщо надсилати паралельно,
// і відео може прийти після тексту.
//
// @param {object} ctx    — Telegraf context
// @param {object} locale — об'єкт локалі (uk або ru)
//
const sendContent = async (ctx, locale) => {
  await ctx.sendChatAction('upload_video');
  await ctx.sendVideo(locale.videoFileId);
  await ctx.reply(locale.welcomeText);
  await ctx.reply(locale.menuText, mainMenuKb(locale));
};

module.exports = { sendContent };