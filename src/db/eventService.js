// ─────────────────────────────────────────────────────────────────────────────
// src/db/eventService.js — логування подій та аналітика
// ─────────────────────────────────────────────────────────────────────────────

const { prisma } = require('./prisma');

const ACTIONS = Object.freeze({
  START:            'start',
  LANG_SELECT:      'lang_select',
  BTN_GIFT:         'btn_gift',
  CONTACTS:         'contacts_saved',
  CONTACTS_SKIPPED: 'contacts_skipped',

  // Клік по URL-кнопці через redirect-сервер.
  // payload: { action: 'register'|'channel'|'consult', lang: 'uk'|'ru' }
  URL_CLICK:        'url_click',
});

const logEvent = async (userId, action, payload = null) => {
  try {
    await prisma.event.create({
      data: { userId: BigInt(userId), action, payload },
    });
  } catch (err) {
    console.error(
      `[eventService] не вдалося записати "${action}" для ${userId}:`,
      err.message
    );
  }
};

// ── Аналітика ─────────────────────────────────────────────────────────────────

const countByAction = async () =>
  prisma.event.groupBy({
    by:      ['action'],
    _count:  { _all: true },
    orderBy: { _count: { action: 'desc' } },
  });

// Кліки по URL-кнопках з розбивкою по action
const countUrlClicks = async () =>
  prisma.event.findMany({
    where:   { action: ACTIONS.URL_CLICK },
    select:  { payload: true, createdAt: true },
  }).then((rows) => {
    const counts = { register: 0, channel: 0, consult: 0 };
    for (const row of rows) {
      const action = row.payload?.action;
      if (action && counts[action] !== undefined) counts[action]++;
    }
    return counts;
  });

const getConversionRate = async () => {
  const [starts, langPicks, contacts, urlClicks] = await Promise.all([
    prisma.event.count({ where: { action: ACTIONS.START } }),
    prisma.event.count({ where: { action: ACTIONS.LANG_SELECT } }),
    prisma.event.count({ where: { action: ACTIONS.CONTACTS } }),
    prisma.event.count({ where: { action: ACTIONS.URL_CLICK } }),
  ]);

  const rate = (n) =>
    starts > 0 ? ((n / starts) * 100).toFixed(1) + '%' : '0.0%';

  return {
    starts,
    langPicks,  toLang:     rate(langPicks),
    contacts,   toContacts: rate(contacts),
    urlClicks,  toClick:    rate(urlClicks),
  };
};

const getDailyActivity = async (days = 7) => {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return prisma.$queryRaw`
    SELECT DATE(created_at) AS day, COUNT(*)::int AS count
    FROM "Event"
    WHERE created_at >= ${since}
    GROUP BY DATE(created_at)
    ORDER BY day DESC
  `;
};

module.exports = {
  ACTIONS, logEvent,
  countByAction, countUrlClicks,
  getConversionRate, getDailyActivity,
};