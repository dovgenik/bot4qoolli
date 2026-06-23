// ─────────────────────────────────────────────────────────────────────────────
// index.js — точка входу застосунку
// Зміна: запускаємо Express redirect-сервер разом з ботом
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config();

const bot              = require('./bot');
const { startServer }  = require('./server');

// Запускаємо Express redirect-сервер.
// Він слухає на process.env.PORT (Railway надає автоматично).
// Бот і сервер працюють в одному Node.js-процесі — окремий сервіс не потрібен.
startServer();

bot.launch()
  .then(async () => {
    console.log('✅ Бот запущений');
    console.log(`📌 Режим: ${process.env.NODE_ENV || 'development'}`);

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