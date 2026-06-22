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
const detectTimezoneFromLocation = (latitude, longitude) => {
  try {
    // geo-tz повертає масив можливих timezone (зазвичай один елемент)
    const { find } = require('geo-tz');
    const timezones = find(latitude, longitude);
    return timezones?.[0] ?? null;
  } catch (err) {
    console.error('[timezone] geo-tz error:', err.message);
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// parseTimeToOffset — рядок часу → UTC offset
//
// Юзер вводить свій поточний час ("14:30").
// Ми знаємо поточний UTC час сервера.
// Різниця = offset юзера.
//
// @param {string} timeStr — "14:30" або "9:05"
// @returns {string|null} — 'UTC+02:00', 'UTC-05:00' або null якщо невірний формат
// ─────────────────────────────────────────────────────────────────────────────
const parseTimeToOffset = (timeStr) => {
  if (!timeStr) return null;

  // Підтримуємо формати: "14:30", "9:05", "09:05"
  const match = timeStr.trim().match(/^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/);
  if (!match) return null;

  const userHours   = parseInt(match[1], 10);
  const userMinutes = parseInt(match[2], 10);

  const now = new Date();
  const serverUTCMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const userTotalMinutes = userHours * 60 + userMinutes;

  // Обчислюємо різницю
  let offsetMinutes = userTotalMinutes - serverUTCMinutes;

  // Обробляємо перехід через північ:
  // якщо різниця > 12 годин — скоріше за все наступний/попередній день
  if (offsetMinutes > 720)  offsetMinutes -= 1440;
  if (offsetMinutes < -720) offsetMinutes += 1440;

  const sign    = offsetMinutes >= 0 ? '+' : '-';
  const absOff  = Math.abs(offsetMinutes);
  const hours   = Math.floor(absOff / 60);
  const minutes = absOff % 60;

  return `UTC${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// getCurrentLocalTime — поточний час у заданому часовому поясі
//
// Підтримує обидва формати:
//   IANA:   'Europe/Warsaw' → через Intl.DateTimeFormat
//   Offset: 'UTC+02:00'    → вручну через арифметику
//
// @param {string} timezone
// @returns {string|null} — '14:30' або null при помилці
// ─────────────────────────────────────────────────────────────────────────────
const getCurrentLocalTime = (timezone) => {
  if (!timezone) return null;

  try {
    if (timezone.startsWith('UTC')) {
      // Offset-формат: парсимо вручну
      const match = timezone.match(/^UTC([+-])(\d{2}):(\d{2})$/);
      if (!match) return null;

      const sign          = match[1] === '+' ? 1 : -1;
      const offsetMinutes = sign * (parseInt(match[2], 10) * 60 + parseInt(match[3], 10));

      const now     = new Date();
      const localMs = now.getTime() + offsetMinutes * 60 * 1000;
      const local   = new Date(localMs);

      return `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`;
    } else {
      // IANA-формат: використовуємо вбудований Intl
      return new Intl.DateTimeFormat('uk-UA', {
        timeZone: timezone,
        hour:     '2-digit',
        minute:   '2-digit',
        hour12:   false,
      }).format(new Date());
    }
  } catch (err) {
    console.error('[timezone] formatTime error:', err.message);
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// formatTimezoneForDisplay — форматує timezone для показу у повідомленнях
//
// @param {string|null} timezone
// @returns {string} — 'Europe/Warsaw (~14:30 за місцевим)' або '—'
// ─────────────────────────────────────────────────────────────────────────────
const formatTimezoneForDisplay = (timezone) => {
  if (!timezone) return '—';

  const localTime = getCurrentLocalTime(timezone);
  return localTime
    ? `${timezone} (~${localTime} за місцевим)`
    : timezone;
};

module.exports = {
  detectTimezoneFromLocation,
  parseTimeToOffset,
  getCurrentLocalTime,
  formatTimezoneForDisplay,
};