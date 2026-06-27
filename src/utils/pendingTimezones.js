// ─────────────────────────────────────────────────────────────────────────────
// src/utils/pendingTimezones.js — тимчасове сховище message_id для редагування
//
// Проблема: коли timezone визначається через браузер, між першим повідомленням
// адміну ("контакти збережено") і другим ("timezone визначено") можуть
// вклинитися повідомлення від інших юзерів.
//
// Рішення: зберігаємо message_id першого повідомлення → редагуємо його,
// коли timezone надходить з /tz/save.
//
// Чому in-memory, а не БД?
//   Timezone приходить за секунди після надсилання повідомлення.
//   Додаткова колонка в БД — надмірність для таких коротких TTL.
//   При перезапуску сервера → graceful fallback на окреме повідомлення.
//
// Node.js кешує require() — обидва файли (contactsScene + server)
// отримають той самий екземпляр Map. Це і є ціль.
// ─────────────────────────────────────────────────────────────────────────────

const TTL = 30 * 60 * 1000; // 30 хвилин — з великим запасом

/**
 * @typedef {Object} PendingEntry
 * @property {number}      messageId  — message_id надісланого повідомлення адміну
 * @property {string}      fullName   — ім'я юзера
 * @property {string|null} username   — @username або null
 * @property {string}      langLabel  — '🇺🇦 Українська' | '🇷🇺 Русский'
 * @property {string}      phone      — телефон або '—'
 * @property {string}      email      — email або '—'
 * @property {number}      sentAt     — timestamp надсилання (для TTL)
 */

/** @type {Map<string, PendingEntry>} */
const pending = new Map();

/**
 * Зберігає дані нотифікації адміна для подальшого редагування.
 * Викликається з contactsScene.js після notifyAdmin.
 *
 * @param {string|number} userId
 * @param {Omit<PendingEntry, 'sentAt'>} data
 */
const set = (userId, data) => {
  // Lazy cleanup: час від часу прибираємо прострочені записи
  if (Math.random() < 0.1) pruneExpired();
  pending.set(String(userId), { ...data, sentAt: Date.now() });
};

/**
 * Повертає збережені дані або null якщо не знайдено / прострочено.
 * Викликається з server.js у /tz/save.
 *
 * @param {string|number} userId
 * @returns {PendingEntry|null}
 */
const get = (userId) => {
  const entry = pending.get(String(userId));
  if (!entry) return null;

  if (Date.now() - entry.sentAt > TTL) {
    pending.delete(String(userId));
    return null;
  }

  return entry;
};

/**
 * Видаляє запис після успішного редагування.
 *
 * @param {string|number} userId
 */
const del = (userId) => pending.delete(String(userId));

/**
 * Прибирає прострочені записи з Map.
 * Викликається ліниво з set() — не блокує event loop.
 */
const pruneExpired = () => {
  const cutoff = Date.now() - TTL;
  for (const [key, entry] of pending) {
    if (entry.sentAt < cutoff) pending.delete(key);
  }
};

module.exports = { set, get, del };