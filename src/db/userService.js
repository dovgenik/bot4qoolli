// ─────────────────────────────────────────────────────────────────────────────
// src/db/userService.js — операції з таблицею User
// ─────────────────────────────────────────────────────────────────────────────

const { prisma } = require('./prisma');

const upsertUser = async (telegramUser) => {
  const { id, first_name, username } = telegramUser;
  return prisma.user.upsert({
    where:  { id: BigInt(id) },
    update: { firstName: first_name, username: username ?? null },
    create: { id: BigInt(id), firstName: first_name, username: username ?? null, language: 'uk' },
  });
};

const updateLanguage = async (userId, lang) =>
  prisma.user.update({
    where: { id: BigInt(userId) },
    data:  { language: lang },
  });

const getUserById = async (userId) =>
  prisma.user.findUnique({ where: { id: BigInt(userId) } });

// ─────────────────────────────────────────────────────────────────────────────
// saveContacts — зберігає телефон, email і часовий пояс
//
// Всі три поля nullable і зберігаються лише якщо передані (не undefined).
// undefined у Prisma = "не чіпати поле"
// null             = "записати NULL"
//
// @param {BigInt|number} userId
// @param {{ phone?: string|null, email?: string|null, timezone?: string|null }}
// ─────────────────────────────────────────────────────────────────────────────
const saveContacts = async (userId, { phone, email, timezone }) => {
  return prisma.user.update({
    where: { id: BigInt(userId) },
    data: {
      ...(phone    !== undefined && { phone }),
      ...(email    !== undefined && { email }),
      ...(timezone !== undefined && { timezone }),
    },
  });
};

const saveCrmSync = async (userId, crmLeadId) =>
  prisma.user.update({
    where: { id: BigInt(userId) },
    data: {
      crmSynced: crmLeadId !== null,
      crmLeadId: crmLeadId ?? null,
    },
  });

// ── Аналітика ─────────────────────────────────────────────────────────────────

const countUsers        = async () => prisma.user.count();

const countByLanguage   = async () =>
  prisma.user.groupBy({
    by: ['language'], _count: { _all: true },
    orderBy: { _count: { language: 'desc' } },
  });

const countNewUsers = async (days = 7) => {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return prisma.user.count({ where: { createdAt: { gte: since } } });
};

const countWithContacts = async () =>
  prisma.user.count({ where: { phone: { not: null } } });

const countCrmSynced    = async () =>
  prisma.user.count({ where: { crmSynced: true } });

// Скільки юзерів вказали часовий пояс
const countWithTimezone = async () =>
  prisma.user.count({ where: { timezone: { not: null } } });

module.exports = {
  upsertUser, updateLanguage, getUserById,
  saveContacts, saveCrmSync,
  countUsers, countByLanguage, countNewUsers,
  countWithContacts, countCrmSynced, countWithTimezone,
};