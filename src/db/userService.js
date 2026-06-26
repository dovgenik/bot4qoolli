// ─────────────────────────────────────────────────────────────────────────────
// src/db/userService.js
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
  prisma.user.update({ where: { id: BigInt(userId) }, data: { language: lang } });

const getUserById = async (userId) =>
  prisma.user.findUnique({ where: { id: BigInt(userId) } });

const saveContacts = async (userId, { phone, email, timezone }) =>
  prisma.user.update({
    where: { id: BigInt(userId) },
    data: {
      ...(phone    !== undefined && { phone }),
      ...(email    !== undefined && { email }),
      ...(timezone !== undefined && { timezone }),
    },
  });

// ─────────────────────────────────────────────────────────────────────────────
// saveTimezone — зберігає timezone отриманий з браузера юзера
//
// Викликається з server.js ендпоінту GET /tz/save після того як
// Intl.DateTimeFormat().resolvedOptions().timeZone повернув результат у браузері.
//
// @param {string|number} userId  — Telegram user ID (рядок з query param)
// @param {string}        timezone — IANA timezone, наприклад 'Europe/Warsaw'
// ─────────────────────────────────────────────────────────────────────────────
const saveTimezone = async (userId, timezone) =>
  prisma.user.update({
    where: { id: BigInt(userId) },
    data:  { timezone },
  });

const saveCrmSync = async (userId, crmLeadId) =>
  prisma.user.update({
    where: { id: BigInt(userId) },
    data: { crmSynced: crmLeadId !== null, crmLeadId: crmLeadId ?? null },
  });

// ── Аналітика ─────────────────────────────────────────────────────────────────

const countUsers        = async () => prisma.user.count();
const countByLanguage   = async () =>
  prisma.user.groupBy({ by: ['language'], _count: { _all: true }, orderBy: { _count: { language: 'desc' } } });
const countNewUsers     = async (days = 7) => {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return prisma.user.count({ where: { createdAt: { gte: since } } });
};
const countWithContacts = async () => prisma.user.count({ where: { phone: { not: null } } });
const countCrmSynced    = async () => prisma.user.count({ where: { crmSynced: true } });
const countWithTimezone = async () => prisma.user.count({ where: { timezone: { not: null } } });

module.exports = {
  upsertUser, updateLanguage, getUserById,
  saveContacts, saveTimezone, saveCrmSync,
  countUsers, countByLanguage, countNewUsers,
  countWithContacts, countCrmSynced, countWithTimezone,
};