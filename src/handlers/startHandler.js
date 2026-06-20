// ─────────────────────────────────────────────────────────────────────────────
// handlers/startHandler.js — обробник /start з автовизначенням мови
//
// Логіка визначення мови (два рівні):
//
//   Рівень 1 — Telegram language_code
//     ctx.from.language_code містить мову інтерфейсу Telegram на пристрої юзера.
//     Якщо ця мова підтримується ботом → одразу показуємо контент.
//     Більшість цільових юзерів (uk/ru) пройдуть тут — без жодного кліку.
//
//   Рівень 2 — Збережена мова в БД
//     Якщо Telegram-мова не підтримується (en, de...) →
//     перевіряємо чи юзер уже обирав мову раніше через клавіатуру.
//     Якщо так → показуємо контент збереженою мовою (не показуємо клавіатуру знову).
//     Якщо ні (новий юзер) → показуємо клавіатуру вибору.
// ─────────────────────────────────────────────────────────────────────────────

const { languageKb }                   = require('../keyboards/languageKb');
const { upsertUser, updateLanguage,
        getUserById }                   = require('../db/userService');
const { logEvent, ACTIONS }            = require('../db/eventService');
const { detectLang, getLocale }        = require('../utils/language');
const { sendContent }                  = require('../utils/sendContent');

module.exports = async (ctx) => {

  // ── 1. Upsert юзера — обов'язково першим (FK constraint для Event) ────────
  await upsertUser(ctx.from);

  // ── 2. Логування — після upsert, бо Event → FK → User ────────────────────
  await logEvent(ctx.from.id, ACTIONS.START);

  // ── 3. Рівень 1: Telegram language_code ──────────────────────────────────
  //
  // detectLang бере первинний субтег: 'uk-UA' → 'uk', 'ru-RU' → 'ru'.
  // Повертає код мови або null якщо не підтримується.
  //
  const detectedLang = detectLang(ctx.from.language_code);

  if (detectedLang) {
    // Мова знайдена — зберігаємо у БД і показуємо контент
    await updateLanguage(ctx.from.id, detectedLang);
    return sendContent(ctx, getLocale(detectedLang));
  }

  // ── 4. Рівень 2: перевірка збереженої мови в БД ───────────────────────────
  //
  // Телеграм-мова юзера не підтримується (наприклад, 'en').
  // Перевіряємо чи він вже обирав мову через клавіатуру раніше.
  //
  // Ознака "юзер вже обирав мову" — наявність події LANG_SELECT у БД.
  // Але простіший підхід: перевірити поле languageSetByUser або
  // просто перевірити чи є у юзера мова відмінна від дефолту.
  //
  // ❗ Проблема: upsertUser встановлює language='uk' за замовчуванням.
  //    Тому ми не знаємо — юзер сам обрав 'uk' чи це дефолт.
  //
  // Рішення: перевіряємо чи є у юзера хоч одна подія LANG_SELECT.
  //    Якщо так → він обирав мову свідомо → використовуємо збережену.
  //    Якщо ні → новий юзер з непідтримуваною мовою → показуємо клавіатуру.
  //
  const user = await getUserById(ctx.from.id);

  const hasChosenLanguage = await hasPreviousLangSelect(ctx.from.id);

  if (hasChosenLanguage && user?.language) {
    // Юзер уже обирав мову раніше — показуємо контент збереженою мовою
    return sendContent(ctx, getLocale(user.language));
  }

  // Новий юзер з непідтримуваною мовою Telegram → показуємо клавіатуру
  await ctx.reply('Оберіть мову / Выберите язык:', languageKb);
};

// ─────────────────────────────────────────────────────────────────────────────
// hasPreviousLangSelect — перевіряє чи юзер хоч раз обирав мову через кнопку
// ─────────────────────────────────────────────────────────────────────────────

const { prisma } = require('../db/prisma');

const hasPreviousLangSelect = async (userId) => {
  const event = await prisma.event.findFirst({
    where: {
      userId: BigInt(userId),
      action: ACTIONS.LANG_SELECT,
    },
    select: { id: true }, // беремо лише id — нам потрібно лише знати чи є запис
  });
  return event !== null;
};