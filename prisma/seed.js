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

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const uk     = require('../src/locales/uk');
const ru     = require('../src/locales/ru');

// ─────────────────────────────────────────────────────────────────────────────
// Допоміжна функція — upsert одного запису BotContent
// ─────────────────────────────────────────────────────────────────────────────
const upsertContent = (lang, key, value) =>
  prisma.botContent.upsert({
    where:  { lang_key: { lang, key } },
    update: { value },
    create: { lang, key, value },
  });

// ─────────────────────────────────────────────────────────────────────────────
// Допоміжна функція — upsert одного запису Config
// ─────────────────────────────────────────────────────────────────────────────
const upsertConfig = (key, value) =>
  prisma.config.upsert({
    where:  { key },
    update: { value },
    create: { key, value },
  });

// ─────────────────────────────────────────────────────────────────────────────
// SEED
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🌱 Починаємо seed...');

  // ── BotContent для кожної мови ─────────────────────────────────────────────
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

    console.log(`  ✅ BotContent для "${lang}" — ${9} записів`);
  }

  // ── Config — URL з .env ────────────────────────────────────────────────────
  //
  // Після першого seed URL-и живуть у БД.
  // .env залишається як резервний fallback (дивіться contentService.js).
  // Змінювати URL надалі — через Prisma Studio або pgAdmin.
  //
  const urls = {
    url_site:    process.env.SITE_URL,
    url_channel: process.env.CHANNEL_URL,
    url_consult: process.env.CONSULT_URL,
  };

  for (const [key, value] of Object.entries(urls)) {
    if (!value) {
      console.warn(`  ⚠️  Змінна середовища для "${key}" не знайдена, пропускаємо`);
      continue;
    }
    await upsertConfig(key, value);
  }

  console.log('  ✅ Config — URL-адреси збережені');
  console.log('\n✅ Seed завершено успішно!');
  console.log('💡 Щоб оновити контент надалі — використовуйте Prisma Studio або pgAdmin');
}

main()
  .catch((err) => {
    console.error('❌ Помилка seed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });