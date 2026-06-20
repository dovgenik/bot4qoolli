// ─────────────────────────────────────────────────────────────────────────────
// index.js — точка входу застосунку
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config();

const bot = require('./bot');

bot.launch()
  .then(async () => {
    console.log('✅ Бот запущений');
    console.log(`📌 Режим: ${process.env.NODE_ENV || 'development'}`);

    // Реєструємо команди у Telegram — з'являються у меню "/" біля поля вводу.
    // /language — дозволяє змінити мову юзеру у будь-який момент.
    await bot.telegram.setMyCommands([
      { command: 'start',    description: 'Запустити бота / Запустить бота' },
      { command: 'language', description: 'Змінити мову / Изменить язык' },
    ]);

    console.log('📋 Команди зареєстровано');
  })
  .catch((err) => {
    console.error('❌ Помилка запуску:', err.message);
    process.exit(1);
  });

process.once('SIGINT',  () => { console.log('\n⏹ Зупинка...'); bot.stop('SIGINT');  });
process.once('SIGTERM', () => { console.log('\n⏹ Зупинка...'); bot.stop('SIGTERM'); });