// ─────────────────────────────────────────────────────────────────────────────
// index.js — точка входу застосунку
//
// Зміна відносно попередньої версії:
//   startServer(bot) — передаємо екземпляр бота у сервер.
//   Це потрібно щоб /tz/save міг надсилати повідомлення юзеру та адміну
//   через bot.telegram.sendMessage() без circular dependency.
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config();

const bot             = require('./bot');
const { startServer } = require('./server');

// Передаємо bot у сервер — він буде доступний у /tz/save через closure.
// startServer реєструє ендпоінти і запускає Express на process.env.PORT.
startServer(bot);

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