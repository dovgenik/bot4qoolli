// ─────────────────────────────────────────────────────────────────────────────
// handlers/broadcastHandler.js — адмін-команди для розсилок
//
// Команди (лише для адміна):
//   /broadcast <id>     — запустити розсилку з вказаним ID
//   /broadcastlist      — переглянути останні 10 розсилок
//
// Розсилку зі статусом і контентом створюють через Prisma Studio або pgAdmin.
// Адмін лише запускає готову розсилку командою /broadcast <id>.
// ─────────────────────────────────────────────────────────────────────────────

const { sendBroadcast, getBroadcastList } = require('../db/broadcastService');
const { ADMIN_TELEGRAM_ID }              = require('../config/config');

// ─────────────────────────────────────────────────────────────────────────────
// Перевірка що команду надіслав адмін
// ─────────────────────────────────────────────────────────────────────────────

const isAdmin = (ctx) => String(ctx.from.id) === String(ADMIN_TELEGRAM_ID);

// ─────────────────────────────────────────────────────────────────────────────
// broadcastStartHandler — /broadcast <id>
//
// Запускає розсилку у фоні (не блокує event loop).
// Адмін отримає звіт після завершення.
// ─────────────────────────────────────────────────────────────────────────────

const broadcastStartHandler = async (ctx) => {
  if (!isAdmin(ctx)) return; // мовчки ігноруємо не-адмінів

  // Витягуємо ID з тексту команди: '/broadcast 5' → 5
  const parts = ctx.message.text.trim().split(/\s+/);
  const id    = parseInt(parts[1], 10);

  if (!id || isNaN(id)) {
    return ctx.reply(
      '❗ Вкажіть ID розсилки.\n' +
      'Використання: /broadcast <id>\n\n' +
      'Список розсилок: /broadcastlist'
    );
  }

  await ctx.reply(`⏳ Запускаємо розсилку #${id}...\nЗвіт надійде після завершення.`);

  // Запускаємо у фоні — не чекаємо завершення.
  // Broadcast може тривати хвилини для великої аудиторії.
  sendBroadcast(ctx.telegram, id, ADMIN_TELEGRAM_ID)
    .catch(async (err) => {
      console.error(`[broadcastHandler] Помилка розсилки #${id}:`, err.message);
      await ctx.reply(`❌ Помилка розсилки #${id}: ${err.message}`).catch(() => {});
    });
};

// ─────────────────────────────────────────────────────────────────────────────
// broadcastListHandler — /broadcastlist
//
// Показує останні 10 розсилок зі статусами.
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_EMOJI = {
  draft:   '📝',
  sending: '⏳',
  done:    '✅',
  error:   '❌',
};

const broadcastListHandler = async (ctx) => {
  if (!isAdmin(ctx)) return;

  const list = await getBroadcastList();

  if (list.length === 0) {
    return ctx.reply(
      '📭 Розсилок ще немає.\n\n' +
      'Створіть розсилку через Prisma Studio або pgAdmin:\n' +
      'таблиця Broadcast, статус "draft"'
    );
  }

  const lines = list.map((b) => {
    const emoji = STATUS_EMOJI[b.status] ?? '❓';
    const progress = b.totalCount > 0
      ? ` (${b.sentCount}/${b.totalCount})`
      : '';
    return `${emoji} #${b.id} — ${b.title}${progress}`;
  });

  await ctx.reply(
    `📋 Останні розсилки:\n\n${lines.join('\n')}\n\n` +
    `Запуск: /broadcast <id>`
  );
};

module.exports = { broadcastStartHandler, broadcastListHandler };