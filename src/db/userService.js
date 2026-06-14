// ─────────────────────────────────────────────────────────────────────────────
// src/db/userService.js — операції з таблицею User
// ─────────────────────────────────────────────────────────────────────────────
 
const { prisma } = require('./prisma');
 
// ─────────────────────────────────────────────────────────────────────────────
// Навіщо BigInt(id) скрізь?
//
// ctx.from.id у Telegraf — звичайне JavaScript number (float64).
// Поле id у схемі — BigInt (PostgreSQL INT8).
// Prisma 5 суворо перевіряє типи: якщо передати звичайне число у BigInt-поле —
// кине помилку. Явне BigInt() конвертує number → bigint.
//
// BigInt(5766631147) → 5766631147n (з суфіксом n — так позначається bigint у JS)
//
// Для аналітичних функцій де id не передається — BigInt не потрібен.
// ─────────────────────────────────────────────────────────────────────────────
 
const upsertUser = async (telegramUser) => {
  const { id, first_name, username } = telegramUser;
 
  return prisma.user.upsert({
    where:  { id: BigInt(id) },
    update: {
      firstName: first_name,
      username:  username ?? null,
    },
    create: {
      id:        BigInt(id),
      firstName: first_name,
      username:  username ?? null,
      language:  'uk',
    },
  });
};
 
const updateLanguage = async (userId, lang) => {
  return prisma.user.update({
    where: { id: BigInt(userId) },
    data:  { language: lang },
  });
};
 
// ── Аналітика ─────────────────────────────────────────────────────────────────
 
const countUsers = async () => {
  return prisma.user.count();
};
 
const countByLanguage = async () => {
  return prisma.user.groupBy({
    by:     ['language'],
    _count: { _all: true },
    orderBy: { _count: { language: 'desc' } },
  });
};
 
const countNewUsers = async (days = 7) => {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return prisma.user.count({
    where: { createdAt: { gte: since } },
  });
};
 
module.exports = { upsertUser, updateLanguage, countUsers, countByLanguage, countNewUsers };