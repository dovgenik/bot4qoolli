// ─────────────────────────────────────────────────────────────────────────────
// src/db/broadcastService.js — управління розсилками
//
// Відповідає за:
//   - формування аудиторії за фільтрами
//   - відправку повідомлень з rate limiting
//   - оновлення статусу та прогресу розсилки
// ─────────────────────────────────────────────────────────────────────────────

const { prisma } = require('./prisma');

// ── Константи rate limiting ───────────────────────────────────────────────────
//
// Telegram дозволяє максимум 30 повідомлень/секунду у різні чати.
// Ми відправляємо батчами по 25 з паузою 1100мс між батчами:
//   25 / 1.1с ≈ 22.7 повідомлень/с — безпечний запас.
//
const BATCH_SIZE  = 25;
const BATCH_DELAY = 1100; // мс

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ─────────────────────────────────────────────────────────────────────────────
// getAudience — повертає масив userId за фільтрами розсилки
// ─────────────────────────────────────────────────────────────────────────────

const getAudience = async (broadcast) => {
  const where = {};

  // Фільтр по мові
  if (broadcast.filterLang) {
    where.language = broadcast.filterLang;
  }

  // Фільтр по наявності контактів
  if (broadcast.filterHasContacts) {
    where.phone = { not: null };
  }

  // Фільтр по тегах: юзер має хоча б один із вказаних тегів
  if (broadcast.filterTags?.length > 0) {
    where.tags = {
      some: { tag: { in: broadcast.filterTags } },
    };
  }

  return prisma.user.findMany({
    where,
    select: { id: true }, // беремо лише id — не тягнемо зайві дані
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// buildInlineKeyboard — будує об'єкт inline keyboard з JSON-масиву кнопок
//
// Формат buttons у БД: [{"text": "Перейти", "url": "https://..."}]
// Кожна кнопка — у окремому рядку (одна кнопка на рядок).
// ─────────────────────────────────────────────────────────────────────────────

const buildInlineKeyboard = (buttons) => {
  if (!buttons || !Array.isArray(buttons) || buttons.length === 0) return undefined;

  return {
    inline_keyboard: buttons.map((btn) => [{ text: btn.text, url: btn.url }]),
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// sendToUser — відправляє одне повідомлення розсилки одному юзеру
//
// @param {object} telegram  — ctx.telegram або bot.telegram
// @param {BigInt} userId    — Telegram user ID
// @param {object} broadcast — запис з таблиці Broadcast
// ─────────────────────────────────────────────────────────────────────────────

const sendToUser = async (telegram, userId, broadcast) => {
  // BigInt → string: telegram API приймає chatId як рядок або число
  const chatId   = userId.toString();
  const keyboard = buildInlineKeyboard(broadcast.buttons);
  const extra    = keyboard ? { reply_markup: keyboard } : {};

  if (broadcast.videoFileId && broadcast.text) {
    // Відео з підписом-текстом
    await telegram.sendVideo(chatId, broadcast.videoFileId, {
      caption: broadcast.text,
      ...extra,
    });
  } else if (broadcast.videoFileId) {
    // Лише відео (без тексту)
    await telegram.sendVideo(chatId, broadcast.videoFileId, extra);
  } else if (broadcast.text) {
    // Лише текст
    await telegram.sendMessage(chatId, broadcast.text, extra);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// sendBroadcast — основна функція запуску розсилки
//
// Запускається у фоні (без await у handler-і).
// Після завершення надсилає звіт адміну.
//
// @param {object} telegram         — bot.telegram або ctx.telegram
// @param {number} broadcastId      — ID розсилки у БД
// @param {string} adminTelegramId  — ID адміна для фінального звіту
// ─────────────────────────────────────────────────────────────────────────────

const sendBroadcast = async (telegram, broadcastId, adminTelegramId) => {
  // Завантажуємо розсилку з БД
  const broadcast = await prisma.broadcast.findUnique({
    where: { id: broadcastId },
  });

  if (!broadcast) {
    throw new Error(`Розсилку #${broadcastId} не знайдено`);
  }

  if (broadcast.status !== 'draft') {
    throw new Error(`Розсилка #${broadcastId} має статус "${broadcast.status}", очікується "draft"`);
  }

  // Формуємо аудиторію
  const users      = await getAudience(broadcast);
  const totalCount = users.length;

  // Оновлюємо статус: draft → sending
  await prisma.broadcast.update({
    where: { id: broadcastId },
    data: {
      status:     'sending',
      totalCount,
      startedAt:  new Date(),
    },
  });

  console.log(`[broadcast #${broadcastId}] Починаємо: ${totalCount} юзерів`);

  let sentCount  = 0;
  let errorCount = 0;

  // ── Відправка батчами ───────────────────────────────────────────────────
  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);

    // Відправляємо батч паралельно
    const results = await Promise.allSettled(
      batch.map((user) => sendToUser(telegram, user.id, broadcast))
    );

    // Підраховуємо результати батчу
    for (const result of results) {
      if (result.status === 'fulfilled') {
        sentCount++;
      } else {
        errorCount++;
        // Логуємо помилку але не зупиняємо розсилку
        console.error(
          `[broadcast #${broadcastId}] Помилка для юзера:`,
          result.reason?.message ?? result.reason
        );
      }
    }

    // Зберігаємо прогрес кожні 5 батчів (кожні 125 юзерів)
    if ((i / BATCH_SIZE) % 5 === 0) {
      await prisma.broadcast.update({
        where: { id: broadcastId },
        data:  { sentCount, errorCount },
      }).catch(() => {}); // помилка оновлення прогресу не зупиняє розсилку
    }

    // Пауза між батчами (крім останнього)
    if (i + BATCH_SIZE < users.length) {
      await delay(BATCH_DELAY);
    }
  }

  // ── Фінальне оновлення статусу ──────────────────────────────────────────
  const finalStatus = errorCount === totalCount ? 'error' : 'done';

  await prisma.broadcast.update({
    where: { id: broadcastId },
    data: {
      status:     finalStatus,
      sentCount,
      errorCount,
      finishedAt: new Date(),
    },
  });

  console.log(
    `[broadcast #${broadcastId}] Завершено: ` +
    `відправлено ${sentCount}, помилок ${errorCount} з ${totalCount}`
  );

  // ── Звіт адміну ─────────────────────────────────────────────────────────
  const statusEmoji = finalStatus === 'done' ? '✅' : '⚠️';
  const report =
    `${statusEmoji} Розсилка #${broadcastId} "${broadcast.title}" завершена\n\n` +
    `📊 Всього: ${totalCount}\n` +
    `✉️ Відправлено: ${sentCount}\n` +
    `❌ Помилок: ${errorCount}`;

  await telegram.sendMessage(adminTelegramId, report).catch(() => {});
};

// ─────────────────────────────────────────────────────────────────────────────
// getBroadcastList — список розсилок зі статусом (для /broadcastlist)
// ─────────────────────────────────────────────────────────────────────────────

const getBroadcastList = async () => {
  return prisma.broadcast.findMany({
    orderBy: { createdAt: 'desc' },
    take:    10, // останні 10
    select: {
      id:         true,
      title:      true,
      status:     true,
      totalCount: true,
      sentCount:  true,
      createdAt:  true,
    },
  });
};

module.exports = { sendBroadcast, getBroadcastList, getAudience };