// ─────────────────────────────────────────────────────────────────────────────
// handlers/startHandler.js — обробник /start з автовизначенням мови
// Зміна: getLocale() замінено на getContent() з contentService
// ─────────────────────────────────────────────────────────────────────────────

const { languageKb }                = require('../keyboards/languageKb');
const { upsertUser, updateLanguage,
        getUserById }               = require('../db/userService');
const { logEvent, ACTIONS }         = require('../db/eventService');
const { detectLang }               = require('../utils/language');
const { getContent }               = require('../db/contentService');
const { sendContent }              = require('../utils/sendContent');

module.exports = async (ctx) => {

  // 1. upsertUser — обов'язково першим (FK для Event)
  await upsertUser(ctx.from);
  await logEvent(ctx.from.id, ACTIONS.START);

  // 2. Рівень 1: автовизначення мови за Telegram language_code
  const detectedLang = detectLang(ctx.from.language_code);

  if (detectedLang) {
    await updateLanguage(ctx.from.id, detectedLang);
    // getContent завантажує з БД (або fallback на locale-файл) з кешем
    const content = await getContent(detectedLang);
    return sendContent(ctx, content);
  }

  // 3. Рівень 2: перевірка збереженої мови в БД
  const user              = await getUserById(ctx.from.id);
  const hasChosenLanguage = await hasPreviousLangSelect(ctx.from.id);

  if (hasChosenLanguage && user?.language) {
    const content = await getContent(user.language);
    return sendContent(ctx, content);
  }

  // 4. Новий юзер з непідтримуваною мовою → клавіатура вибору
  await ctx.reply('Оберіть мову / Выберите язык:', languageKb);
};

const { prisma } = require('../db/prisma');

const hasPreviousLangSelect = async (userId) => {
  const event = await prisma.event.findFirst({
    where:  { userId: BigInt(userId), action: ACTIONS.LANG_SELECT },
    select: { id: true },
  });
  return event !== null;
};