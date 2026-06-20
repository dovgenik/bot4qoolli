// ─────────────────────────────────────────────────────────────────────────────
// src/db/userService.js — операції з таблицею User
// ─────────────────────────────────────────────────────────────────────────────

const { prisma } = require('./prisma');

// ─────────────────────────────────────────────────────────────────────────────

const upsertUser = async (telegramUser) => {
  const { id, first_name, username } = telegramUser;

  return prisma.user.upsert({
    where:  { id: BigInt(id) },
    update: { firstName: first_name, username: username ?? null },
    create: {
      id:        BigInt(id),
      firstName: first_name,
      username:  username ?? null,
      language:  'uk',
    },
  });
};

// ─────────────────────────────────────────────────────────────────────────────

const updateLanguage = async (userId, lang) => {
  return prisma.user.update({
    where: { id: BigInt(userId) },
    data:  { language: lang },
  });
};

// ─────────────────────────────────────────────────────────────────────────────

const getUserById = async (userId) => {
  return prisma.user.findUnique({
    where: { id: BigInt(userId) },
  });
};

// ─────────────────────────────────────────────────────────────────────────────

const saveContacts = async (userId, { phone, email }) => {
  return prisma.user.update({
    where: { id: BigInt(userId) },
    data: {
      ...(phone !== undefined && { phone }),
      ...(email !== undefined && { email }),
    },
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// saveCrmSync — зберігає результат синхронізації з CRM
//
// Викликається після спроби createLead у crmService:
//   - якщо CRM повернув ID → crmSynced=true, crmLeadId=ID
//   - якщо CRM не відповів або помилка → crmSynced=false, crmLeadId=null
//
// Загортаємо виклик у try/catch у сцені — помилка запису не ламає flow.
//
const saveCrmSync = async (userId, crmLeadId) => {
  return prisma.user.update({
    where: { id: BigInt(userId) },
    data: {
      crmSynced: crmLeadId !== null,  // true якщо отримали ID
      crmLeadId: crmLeadId ?? null,
    },
  });
};

// ── Аналітика ─────────────────────────────────────────────────────────────────

const countUsers       = async () => prisma.user.count();

const countByLanguage  = async () =>
  prisma.user.groupBy({
    by:      ['language'],
    _count:  { _all: true },
    orderBy: { _count: { language: 'desc' } },
  });

const countNewUsers = async (days = 7) => {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return prisma.user.count({ where: { createdAt: { gte: since } } });
};

const countWithContacts = async () =>
  prisma.user.count({ where: { phone: { not: null } } });

// Скільки юзерів успішно синхронізовані з CRM
const countCrmSynced = async () =>
  prisma.user.count({ where: { crmSynced: true } });

module.exports = {
  upsertUser,
  updateLanguage,
  getUserById,
  saveContacts,
  saveCrmSync,
  countUsers,
  countByLanguage,
  countNewUsers,
  countWithContacts,
  countCrmSynced,
};