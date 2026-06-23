// ─────────────────────────────────────────────────────────────────────────────
// prisma/seed.js — початкове наповнення БД контентом
//
// Запуск: npx prisma db seed
// Або:    node prisma/seed.js
//
// Що робить:
//   1. Заповнює BotContent текстами з locale-файлів
//   2. Заповнює Config URL-адресами з .env
//
// Використовує upsert — безпечно запускати повторно:
// існуючі записи оновляться, нові — створяться.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// prisma/seed.js — початкове наповнення БД контентом
//
// Запуск: npx prisma db seed  або  node prisma/seed.js
// Використовує upsert — безпечно запускати повторно.
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const uk     = require('../src/locales/uk');
const ru     = require('../src/locales/ru');

const upsertContent = (lang, key, value) =>
  prisma.botContent.upsert({
    where:  { lang_key: { lang, key } },
    update: { value },
    create: { lang, key, value },
  });

const upsertConfig = (key, value) =>
  prisma.config.upsert({
    where:  { key },
    update: { value },
    create: { key, value },
  });

async function main() {
  console.log('🌱 Починаємо seed...');

  // ── BotContent ─────────────────────────────────────────────────────────────
  for (const locale of [uk, ru]) {
    const { lang, videoFileId, welcomeText, menuText, giftText, buttons } = locale;
    await Promise.all([
      upsertContent(lang, 'video_file_id', videoFileId),
      upsertContent(lang, 'welcome_text',  welcomeText),
      upsertContent(lang, 'menu_text',     menuText),
      upsertContent(lang, 'gift_text',     giftText),
      upsertContent(lang, 'btn_register',  buttons.register),
      upsertContent(lang, 'btn_contacts',  buttons.contacts),
      upsertContent(lang, 'btn_channel',   buttons.channel),
      upsertContent(lang, 'btn_consult',   buttons.consult),
      upsertContent(lang, 'btn_gift',      buttons.gift),
    ]);
    console.log(`  ✅ BotContent для "${lang}"`);
  }

  // ── Config — URL та налаштування ───────────────────────────────────────────
  const configEntries = {
    // URL-адреси кнопок (переносимо з .env у БД)
    url_site:    process.env.SITE_URL,
    url_channel: process.env.CHANNEL_URL,
    url_consult: process.env.CONSULT_URL,

    // Часовий пояс замовника — для відображення різниці у повідомленнях адміну.
    // Змінювати через pgAdmin або адмін-панель (поле: business_timezone).
    // IANA-формат: 'Europe/Amsterdam', 'Europe/Kyiv', 'America/New_York' тощо.
    business_timezone: process.env.BUSINESS_TIMEZONE || 'Europe/Amsterdam',

    // Флаг запиту часового поясу у юзера під час сцени контактів.
    // 'true'  — крок із запитом timezone показується
    // 'false' — крок пропускається, timezone не збирається
    // Змінювати через pgAdmin або адмін-панель (поле: ask_timezone).
    ask_timezone: 'true',
  };

  for (const [key, value] of Object.entries(configEntries)) {
    if (!value) {
      console.warn(`  ⚠️  Значення для "${key}" відсутнє, пропускаємо`);
      continue;
    }
    await upsertConfig(key, value);
  }

  console.log('  ✅ Config — URL, business_timezone, ask_timezone збережені');
  console.log('\n✅ Seed завершено!');
}

main()
  .catch((err) => { console.error('❌ Помилка seed:', err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });