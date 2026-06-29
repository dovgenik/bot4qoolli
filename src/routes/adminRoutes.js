// ─────────────────────────────────────────────────────────────────────────────
// src/routes/adminRoutes.js — REST API для адмін-панелі
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const { prisma } = require('../db/prisma');
const { invalidateCache } = require('../db/contentService');
const { sendBroadcast, cancelBroadcast } = require('../db/broadcastService');
const {
  countUsers,
  countByLanguage,
  countNewUsers,
  countWithContacts,
  countCrmSynced,
  countWithTimezone,
} = require('../db/userService');
const {
  getConversionRate,
  getDailyActivity,
  countUrlClicks,
} = require('../db/eventService');
const { ADMIN_TELEGRAM_ID } = require('../config/config');

const router = express.Router();

// Helper для серіалізації BigInt у JSON
const serializeBigInt = (obj) => {
  return JSON.parse(
    JSON.stringify(obj, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    )
  );
};

// Рекурсивне очищення рядків від битих/одиночних Unicode-сурогатів (toWellFormed)
const sanitizeStrings = (val) => {
  if (typeof val === 'string') {
    return val.toWellFormed();
  }
  if (Array.isArray(val)) {
    return val.map(sanitizeStrings);
  }
  if (val !== null && typeof val === 'object') {
    const res = {};
    for (const [key, kVal] of Object.entries(val)) {
      res[key] = sanitizeStrings(kVal);
    }
    return res;
  }
  return val;
};

const adminRouterSetup = (bot) => {
  // Middleware для автоматичного очищення вхідних рядків від битих сурогатів
  router.use((req, res, next) => {
    if (req.body) {
      req.body = sanitizeStrings(req.body);
    }
    next();
  });

  // ── GET /api/admin/dashboard — статистика та аналітика ─────────────────────
  router.get('/dashboard', async (req, res) => {
    try {
      const [
        totalUsers,
        newUsers7d,
        withContacts,
        crmSynced,
        withTimezone,
        langSplit,
        conversion,
        dailyActivity,
        urlClicks,
        recentEvents,
      ] = await Promise.all([
        countUsers(),
        countNewUsers(7),
        countWithContacts(),
        countCrmSynced(),
        countWithTimezone(),
        countByLanguage(),
        getConversionRate(),
        getDailyActivity(7),
        countUrlClicks(),
        prisma.event.findMany({
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: {
            user: {
              select: {
                firstName: true,
                username: true,
              },
            },
          },
        }),
      ]);

      const data = {
        stats: {
          totalUsers,
          newUsers7d,
          withContacts,
          crmSynced,
          withTimezone,
        },
        langSplit,
        conversion,
        dailyActivity,
        urlClicks,
        recentEvents,
      };

      res.json(serializeBigInt(data));
    } catch (err) {
      console.error('[adminRoutes /dashboard] Помилка:', err.message);
      res.status(500).json({ error: 'Внутрішня помилка сервера' });
    }
  });

  // ── GET /api/admin/content — отримання BotContent ───────────────────────────
  router.get('/content', async (req, res) => {
    try {
      const rows = await prisma.botContent.findMany();
      // Перетворюємо у зручну структуру: { uk: { key: value }, ru: { key: value } }
      const data = { uk: {}, ru: {} };
      for (const row of rows) {
        if (data[row.lang]) {
          data[row.lang][row.key] = row.value;
        }
      }
      res.json(data);
    } catch (err) {
      console.error('[adminRoutes /content] Помилка:', err.message);
      res.status(500).json({ error: 'Внутрішня помилка сервера' });
    }
  });

  // ── POST /api/admin/content — оновлення BotContent ─────────────────────────
  router.post('/content', async (req, res) => {
    try {
      const { uk, ru } = req.body;
      if (!uk || !ru) {
        return res.status(400).json({ error: 'Дані uk або ru відсутні' });
      }

      const updateContentForLang = async (lang, contentObj) => {
        for (const [key, value] of Object.entries(contentObj)) {
          await prisma.botContent.upsert({
            where: { lang_key: { lang, key } },
            update: { value: String(value) },
            create: { lang, key, value: String(value) },
          });
        }
        invalidateCache(lang);
      };

      await Promise.all([
        updateContentForLang('uk', uk),
        updateContentForLang('ru', ru),
      ]);

      res.json({ ok: true });
    } catch (err) {
      console.error('[adminRoutes /content POST] Помилка:', err.message);
      res.status(500).json({ error: 'Внутрішня помилка сервера' });
    }
  });

  // ── GET /api/admin/config — отримання Config ───────────────────────────────
  router.get('/config', async (req, res) => {
    try {
      const rows = await prisma.config.findMany();
      const data = Object.fromEntries(rows.map((r) => [r.key, r.value]));
      res.json(data);
    } catch (err) {
      console.error('[adminRoutes /config] Помилка:', err.message);
      res.status(500).json({ error: 'Внутрішня помилка сервера' });
    }
  });

  // ── POST /api/admin/config — оновлення Config ───────────────────────────────
  router.post('/config', async (req, res) => {
    try {
      const configObj = req.body;

      for (const [key, value] of Object.entries(configObj)) {
        await prisma.config.upsert({
          where: { key },
          update: { value: String(value) },
          create: { key, value: String(value) },
        });
      }

      invalidateCache('config');
      res.json({ ok: true });
    } catch (err) {
      console.error('[adminRoutes /config POST] Помилка:', err.message);
      res.status(500).json({ error: 'Внутрішня помилка сервера' });
    }
  });

  // ── GET /api/admin/broadcasts — список розсилок ────────────────────────────
  router.get('/broadcasts', async (req, res) => {
    try {
      const broadcasts = await prisma.broadcast.findMany({
        orderBy: { createdAt: 'desc' },
      });
      res.json(serializeBigInt(broadcasts));
    } catch (err) {
      console.error('[adminRoutes /broadcasts] Помилка:', err.message);
      res.status(500).json({ error: 'Внутрішня помилка сервера' });
    }
  });

  // ── POST /api/admin/broadcasts — створення розсилки ────────────────────────
  router.post('/broadcasts', async (req, res) => {
    try {
      const {
        title,
        videoFileId,
        text,
        buttons,
        filterLang,
        filterHasContacts,
        filterTags,
      } = req.body;

      if (!title) {
        return res.status(400).json({ error: 'Назва розсилки обов’язкова' });
      }

      const broadcast = await prisma.broadcast.create({
        data: {
          title,
          videoFileId: videoFileId || null,
          text: text || null,
          buttons: buttons || null,
          filterLang: filterLang || null,
          filterHasContacts: filterHasContacts === true || filterHasContacts === 'true',
          filterTags: Array.isArray(filterTags) ? filterTags : [],
          status: 'draft',
        },
      });

      res.json(serializeBigInt(broadcast));
    } catch (err) {
      console.error('[adminRoutes /broadcasts POST] Помилка:', err.message);
      res.status(500).json({ error: 'Внутрішня помилка сервера' });
    }
  });

  // ── PUT /api/admin/broadcasts/:id — редагування розсилки ───────────────────
  router.put('/broadcasts/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Некоректний ID' });

      const broadcast = await prisma.broadcast.findUnique({
        where: { id },
      });

      if (!broadcast) {
        return res.status(404).json({ error: 'Розсилку не знайдено' });
      }

      if (broadcast.status !== 'draft') {
        return res.status(400).json({ error: 'Редагувати можна лише чернетки' });
      }

      const {
        title,
        videoFileId,
        text,
        buttons,
        filterLang,
        filterHasContacts,
        filterTags,
      } = req.body;

      if (!title) {
        return res.status(400).json({ error: 'Назва розсилки обов’язкова' });
      }

      const updatedBroadcast = await prisma.broadcast.update({
        where: { id },
        data: {
          title,
          videoFileId: videoFileId || null,
          text: text || null,
          buttons: buttons || null,
          filterLang: filterLang || null,
          filterHasContacts: filterHasContacts === true || filterHasContacts === 'true',
          filterTags: Array.isArray(filterTags) ? filterTags : [],
        },
      });

      res.json(serializeBigInt(updatedBroadcast));
    } catch (err) {
      console.error('[adminRoutes /broadcasts/:id PUT] Помилка:', err.message);
      res.status(500).json({ error: 'Внутрішня помилка сервера' });
    }
  });

  // ── DELETE /api/admin/broadcasts/:id — видалення розсилки ──────────────────
  router.delete('/broadcasts/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Некоректний ID' });

      const broadcast = await prisma.broadcast.findUnique({
        where: { id },
      });

      if (!broadcast) {
        return res.status(404).json({ error: 'Розсилку не знайдено' });
      }

      if (broadcast.status === 'sending') {
        return res.status(400).json({ error: 'Не можна видалити розсилку, яка надсилається' });
      }

      await prisma.broadcast.delete({
        where: { id },
      });

      res.json({ ok: true });
    } catch (err) {
      console.error('[adminRoutes /broadcasts/:id DELETE] Помилка:', err.message);
      res.status(500).json({ error: 'Внутрішня помилка сервера' });
    }
  });

  // ── POST /api/admin/broadcasts/:id/start — запуск розсилки ──────────────────
  router.post('/broadcasts/:id/start', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Некоректний ID' });

      // Запускаємо розсилку у фоні
      sendBroadcast(bot.telegram, id, ADMIN_TELEGRAM_ID).catch((err) => {
        console.error(`[adminRoutes /broadcasts/${id}/start] Помилка:`, err.message);
      });

      res.json({ ok: true, status: 'sending' });
    } catch (err) {
      console.error('[adminRoutes /broadcasts/:id/start] Помилка:', err.message);
      res.status(500).json({ error: 'Внутрішня помилка сервера' });
    }
  });

  // ── POST /api/admin/broadcasts/:id/cancel — скасування розсилки ────────────
  router.post('/broadcasts/:id/cancel', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Некоректний ID' });

      await cancelBroadcast(id);
      res.json({ ok: true, status: 'cancelled' });
    } catch (err) {
      console.error('[adminRoutes /broadcasts/:id/cancel] Помилка:', err.message);
      res.status(500).json({ error: 'Внутрішня помилка сервера' });
    }
  });

  // ── GET /api/admin/tags — отримання унікальних тегів юзерів ──────────────────
  router.get('/tags', async (req, res) => {
    try {
      const tags = await prisma.userTag.findMany({
        select: { tag: true },
        distinct: ['tag'],
      });
      res.json(tags.map((t) => t.tag));
    } catch (err) {
      console.error('[adminRoutes /tags] Помилка:', err.message);
      res.status(500).json({ error: 'Внутрішня помилка сервера' });
    }
  });

  return router;
};

module.exports = adminRouterSetup;
