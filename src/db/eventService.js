// ─────────────────────────────────────────────────────────────────────────────
// src/db/eventService.js — логування подій та аналітика
// ─────────────────────────────────────────────────────────────────────────────
 
const { prisma } = require('./prisma');
 
const ACTIONS = Object.freeze({
  START:       'start',
  LANG_SELECT: 'lang_select',
  BTN_GIFT:    'btn_gift',
});
 
const logEvent = async (userId, action, payload = null) => {
  try {
    await prisma.event.create({
      data: {
        // userId — BigInt у схемі, тому конвертуємо явно.
        // userId завжди приходить як звичайне JS number з ctx.from.id
        userId: BigInt(userId),
        action,
        payload,
      },
    });
  } catch (err) {
    console.error(`[eventService] не вдалося записати подію "${action}" для ${userId}:`, err.message);
  }
};
 
// ── Аналітика ─────────────────────────────────────────────────────────────────
 
const countByAction = async () => {
  return prisma.event.groupBy({
    by:     ['action'],
    _count: { _all: true },
    orderBy: { _count: { action: 'desc' } },
  });
};
 
const getConversionRate = async () => {
  const [starts, langPicks] = await Promise.all([
    prisma.event.count({ where: { action: ACTIONS.START } }),
    prisma.event.count({ where: { action: ACTIONS.LANG_SELECT } }),
  ]);
 
  const rate = starts > 0
    ? ((langPicks / starts) * 100).toFixed(1)
    : '0.0';
 
  return { starts, langPicks, rate: `${rate}%` };
};
 
const getDailyActivity = async (days = 7) => {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return prisma.$queryRaw`
    SELECT
      DATE(created_at) AS day,
      COUNT(*)::int    AS count
    FROM "Event"
    WHERE created_at >= ${since}
    GROUP BY DATE(created_at)
    ORDER BY day DESC
  `;
};
 
module.exports = { ACTIONS, logEvent, countByAction, getConversionRate, getDailyActivity };