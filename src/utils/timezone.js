// ─────────────────────────────────────────────────────────────────────────────
// src/utils/timezone.js — утиліти для роботи з часовими поясами
//
// Три джерела даних:
//   1. geo-tz (координати → IANA-назва, наприклад 'Europe/Warsaw')
//   2. Ручний ввід юзера ("14:30" → обчислюємо offset → 'UTC+02:00')
//   3. null — якщо юзер пропустив
//
// Для відображення поточного місцевого часу використовуємо вбудований
// Intl.DateTimeFormat — без зовнішніх залежностей.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// detectTimezoneFromLocation — координати → IANA timezone
//
// Використовує бібліотеку geo-tz.
// Встановлення: npm install geo-tz
//
// @param {number} latitude
// @param {number} longitude
// @returns {string|null} — наприклад 'Europe/Warsaw' або null при помилці
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// src/utils/timezone.js — утиліти для роботи з часовими поясами
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// detectTimezoneFromLocation — координати → IANA timezone
// ─────────────────────────────────────────────────────────────────────────────
const detectTimezoneFromLocation = (latitude, longitude) => {
  try {
    const { find } = require('geo-tz');
    const timezones = find(latitude, longitude);
    return timezones?.[0] ?? null;
  } catch (err) {
    console.error('[timezone] geo-tz error:', err.message);
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// parseTimeToOffset — "14:30" → "UTC+02:00" відносно поточного UTC серверу
// ─────────────────────────────────────────────────────────────────────────────
const parseTimeToOffset = (timeStr) => {
  if (!timeStr) return null;

  const match = timeStr.trim().match(/^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/);
  if (!match) return null;

  const userHours   = parseInt(match[1], 10);
  const userMinutes = parseInt(match[2], 10);

  const now = new Date();
  const serverUTCMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const userTotalMinutes = userHours * 60 + userMinutes;

  let offsetMinutes = userTotalMinutes - serverUTCMinutes;
  if (offsetMinutes > 720)  offsetMinutes -= 1440;
  if (offsetMinutes < -720) offsetMinutes += 1440;

  const sign    = offsetMinutes >= 0 ? '+' : '-';
  const absOff  = Math.abs(offsetMinutes);
  const hours   = Math.floor(absOff / 60);
  const minutes = absOff % 60;

  return `UTC${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// getUTCOffsetMinutes — повертає UTC offset у хвилинах для заданого timezone
//
// Підтримує обидва формати:
//   IANA:   'Europe/Warsaw'  → через Intl (враховує DST автоматично)
//   Offset: 'UTC+02:00'     → парсимо вручну
//
// @param {string} timezone
// @returns {number} — наприклад 120 для UTC+02:00
// ─────────────────────────────────────────────────────────────────────────────
const getUTCOffsetMinutes = (timezone) => {
  if (!timezone) return 0;

  try {
    if (timezone.startsWith('UTC')) {
      // Offset-формат: парсимо вручну
      const match = timezone.match(/^UTC([+-])(\d{2}):(\d{2})$/);
      if (!match) return 0;
      const sign = match[1] === '+' ? 1 : -1;
      return sign * (parseInt(match[2], 10) * 60 + parseInt(match[3], 10));
    }

    // IANA-формат: обчислюємо різницю між локальним і UTC часом
    // toLocaleString повертає час у заданому timezone, new Date парсить як локальний
    const now     = new Date();
    const utcStr  = now.toLocaleString('en-US', { timeZone: 'UTC' });
    const tzStr   = now.toLocaleString('en-US', { timeZone: timezone });
    const diffMs  = new Date(tzStr) - new Date(utcStr);
    return Math.round(diffMs / 60000); // мілісекунди → хвилини
  } catch (err) {
    console.error('[timezone] getUTCOffsetMinutes error:', err.message);
    return 0;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// getOffsetDiff — різниця між timezone юзера і timezone замовника
//
// Повертає рядок виду '+1 год', '-3 год', '0 год' (без десяткових)
// або '+1.5 год' якщо різниця нецілочислена (наприклад UTC+05:30 vs UTC+04:00)
//
// @param {string|null} userTimezone     — timezone юзера
// @param {string}      businessTimezone — timezone замовника (з Config або .env)
// @returns {string|null} — рядок різниці або null якщо timezone юзера невідомий
// ─────────────────────────────────────────────────────────────────────────────
const getOffsetDiff = (userTimezone, businessTimezone) => {
  if (!userTimezone || !businessTimezone) return null;

  try {
    const userOffset = getUTCOffsetMinutes(userTimezone);
    const bizOffset  = getUTCOffsetMinutes(businessTimezone);
    const diffMinutes = userOffset - bizOffset;
    const diffHours   = diffMinutes / 60;

    // Форматуємо зі знаком
    const sign     = diffHours > 0 ? '+' : '';
    const formatted = Number.isInteger(diffHours)
      ? `${sign}${diffHours} год`
      : `${sign}${diffHours.toFixed(1)} год`;

    return formatted;
  } catch (err) {
    console.error('[timezone] getOffsetDiff error:', err.message);
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// getCurrentLocalTime — поточний час у заданому timezone
// ─────────────────────────────────────────────────────────────────────────────
const getCurrentLocalTime = (timezone) => {
  if (!timezone) return null;

  try {
    if (timezone.startsWith('UTC')) {
      const match = timezone.match(/^UTC([+-])(\d{2}):(\d{2})$/);
      if (!match) return null;
      const sign          = match[1] === '+' ? 1 : -1;
      const offsetMinutes = sign * (parseInt(match[2], 10) * 60 + parseInt(match[3], 10));
      const local         = new Date(Date.now() + offsetMinutes * 60 * 1000);
      return `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`;
    }

    return new Intl.DateTimeFormat('uk-UA', {
      timeZone: timezone,
      hour:     '2-digit',
      minute:   '2-digit',
      hour12:   false,
    }).format(new Date());
  } catch (err) {
    console.error('[timezone] getCurrentLocalTime error:', err.message);
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// formatTimezoneForDisplay — повний рядок для нотифікації
//
// @param {string|null} userTimezone
// @param {string|null} businessTimezone — якщо передано, додає різницю
// @returns {string} — 'Europe/Warsaw (~14:30, +1 год від вас)' або '—'
// ─────────────────────────────────────────────────────────────────────────────
const formatTimezoneForDisplay = (userTimezone, businessTimezone = null) => {
  if (!userTimezone) return '—';

  const localTime = getCurrentLocalTime(userTimezone);
  const diff      = businessTimezone
    ? getOffsetDiff(userTimezone, businessTimezone)
    : null;

  let result = userTimezone;
  if (localTime) result += ` (~${localTime}`;
  if (diff)      result += `, ${diff} від вас`;
  if (localTime) result += ')';

  return result;
};

module.exports = {
  detectTimezoneFromLocation,
  parseTimeToOffset,
  getUTCOffsetMinutes,
  getOffsetDiff,
  getCurrentLocalTime,
  formatTimezoneForDisplay,
};