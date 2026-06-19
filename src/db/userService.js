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
// getUserById — повертає запис юзера або null якщо не знайдено.
//
// Використовується у contactsScene для:
//   1. Перевірки чи юзер вже залишав контакти (phone/email не null)
//   2. Отримання мови (user.language) для вибору локалі сцени
//
const getUserById = async (userId) => {
  return prisma.user.findUnique({
    where: { id: BigInt(userId) },
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// saveContacts — зберігає телефон і/або email після проходження сцени.
//
// Обидва параметри nullable — юзер міг пропустити email.
// Передаємо лише те, що реально ввів юзер.
//
const saveContacts = async (userId, { phone, email }) => {
  return prisma.user.update({
    where: { id: BigInt(userId) },
    data: {
      // Оновлюємо лише якщо значення є.
      // undefined у Prisma = "не чіпати поле", null = "записати NULL".
      // Якщо phone = undefined → поле не зміниться в БД.
      ...(phone !== undefined && { phone }),
      ...(email !== undefined && { email }),
    },
  });
};

// ── Аналітика ─────────────────────────────────────────────────────────────────

const countUsers = async () => prisma.user.count();

const countByLanguage = async () =>
  prisma.user.groupBy({
    by:      ['language'],
    _count:  { _all: true },
    orderBy: { _count: { language: 'desc' } },
  });

const countNewUsers = async (days = 7) => {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return prisma.user.count({ where: { createdAt: { gte: since } } });
};

// Скільки юзерів залишили хоча б телефон
const countWithContacts = async () =>
  prisma.user.count({ where: { phone: { not: null } } });

module.exports = {
  upsertUser,
  updateLanguage,
  getUserById,
  saveContacts,
  countUsers,
  countByLanguage,
  countNewUsers,
  countWithContacts,
};