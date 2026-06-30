require('dotenv').config();

const { Bot } = require('grammy');
const axios = require('axios');
const {
  identifyPlant,
  identifyDisease,
  formatHeader,
  formatAlternates,
  formatDiseaseResults,
  NOT_FOUND_MESSAGE,
  DISEASE_NOT_FOUND_MESSAGE,
  escapeMd,
} = require('./plantnet');
const { generateDescription, answerPlantQuestion } = require('./ai');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PLANTNET_API_KEY = process.env.PLANTNET_API_KEY;

if (!TELEGRAM_BOT_TOKEN) {
  console.error('Missing TELEGRAM_BOT_TOKEN in .env — get one from @BotFather on Telegram.');
  process.exit(1);
}
if (!PLANTNET_API_KEY) {
  console.error('Missing PLANTNET_API_KEY in .env — get one free at https://my.plantnet.org/');
  process.exit(1);
}

const bot = new Bot(TELEGRAM_BOT_TOKEN);

// Tracks which chats are waiting for a disease-check photo
const diseaseModeChats = new Set();

const GREETING_REGEX = /^(hi|hello|hey|howdy|hiya|good\s*(morning|afternoon|evening|day|night)|greetings|what'?s\s*up|sup|yo)\b/i;

function buildGreeting(firstName) {
  return (
    `🌿 Good day, <b>${firstName}</b>!\n\n` +
    `I'm <b>Flora Scan</b>, built by <b>Aliu Johnson Temitope</b>, a fellow of the <b>3MTT Airtel NextGen Program</b> with fellow ID <b>FE/23/24184818</b>.\n\n` +
    `<b>Here's what I can do for you:</b>\n\n` +
    `📸 <b>Identify plants from photos</b> — send any clear plant image\n` +
    `🌱 <b>Common &amp; scientific names</b> — know exactly what plant you're looking at\n` +
    `🏷️ <b>Family &amp; confidence score</b> — with possible alternate matches\n` +
    `📖 <b>Detailed plant profile</b> — habitat, uses, and care tips\n` +
    `🔬 <b>Disease identification</b> — use /checkdisease then send a photo\n` +
    `❓ <b>Answer plant questions</b> — ask me anything about plants\n\n` +
    `<i>Send me a plant photo or ask a plant question to get started!</i>`
  );
}

const OFFTOPIC_REPLY =
  "🌿 I'm Flora Scan, a plant identification assistant. I can only help with plant-related questions.\n\n" +
  'Try asking me about a plant, or send me a photo to identify it!';

// ── Commands ──────────────────────────────────────────────────────────────────

bot.command('start', (ctx) => {
  const name = ctx.from?.first_name || 'there';
  return ctx.reply(buildGreeting(name), { parse_mode: 'HTML' });
});

bot.command('help', (ctx) =>
  ctx.reply(
    'Here is what I can do:\n\n' +
      '📸 Send a plant photo → I will identify it\n' +
      '🔬 /checkdisease → then send a photo to scan for diseases\n' +
      '❓ Ask any plant question → I will answer it\n\n' +
      'Photo tips for best results:\n' +
      '• Get close to a single leaf, flower, or affected area\n' +
      '• Use good natural light\n' +
      '• Avoid blurry or shadowed photos'
  )
);

bot.command('checkdisease', (ctx) => {
  diseaseModeChats.add(ctx.chat.id);
  return ctx.reply(
    '🔬 <b>Disease Check Mode activated!</b>\n\n' +
      'Now send me a clear photo of the affected plant part (leaf spots, discolouration, lesions, etc.) and I will analyse it for diseases.\n\n' +
      '<i>Mode auto-clears after you send the photo.</i>',
    { parse_mode: 'HTML' }
  );
});

// ── Photo handlers ─────────────────────────────────────────────────────────────

bot.on('message:photo', async (ctx) => {
  const fileId = ctx.message.photo.at(-1).file_id;
  if (diseaseModeChats.has(ctx.chat.id)) {
    diseaseModeChats.delete(ctx.chat.id);
    await handleDiseaseImage(ctx, fileId);
  } else {
    await handleIncomingImage(ctx, fileId);
  }
});

bot.on('message:document', async (ctx) => {
  const doc = ctx.message.document;
  if (doc.mime_type && doc.mime_type.startsWith('image/')) {
    if (diseaseModeChats.has(ctx.chat.id)) {
      diseaseModeChats.delete(ctx.chat.id);
      await handleDiseaseImage(ctx, doc.file_id, doc.mime_type);
    } else {
      await handleIncomingImage(ctx, doc.file_id, doc.mime_type);
    }
  } else {
    await ctx.reply('Please send an image file of a plant.');
  }
});

// ── Text handler ───────────────────────────────────────────────────────────────

bot.on('message:text', async (ctx) => {
  const text = ctx.message.text.trim();
  const firstName = ctx.from?.first_name || 'there';

  if (GREETING_REGEX.test(text)) {
    return ctx.reply(buildGreeting(firstName), { parse_mode: 'HTML' });
  }

  await ctx.replyWithChatAction('typing');
  try {
    const answer = await answerPlantQuestion(text);

    if (!answer) {
      return ctx.reply(
        "🌿 I couldn't find an answer right now. Try rephrasing your plant question, or send me a photo to identify a plant!"
      );
    }

    if (answer.offTopic) {
      return ctx.reply(OFFTOPIC_REPLY);
    }

    return ctx.reply(`🌿 ${answer.text}`);
  } catch (err) {
    console.error('Error answering question:', err.message);
    return ctx.reply('⚠️ Something went wrong. Please try again.');
  }
});

// ── Image processing functions ─────────────────────────────────────────────────

async function handleIncomingImage(ctx, fileId, mimeType = 'image/jpeg') {
  const chatId = ctx.chat.id;
  try {
    await ctx.replyWithChatAction('typing');
    const statusMsg = await ctx.reply('🔍 Identifying your plant, one moment...');

    const file = await ctx.api.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    const { data: imageBuffer } = await axios.get(fileUrl, { responseType: 'arraybuffer' });

    const matches = await identifyPlant(imageBuffer, mimeType);

    if (!matches) {
      await ctx.api.editMessageText(chatId, statusMsg.message_id, NOT_FOUND_MESSAGE).catch(() => {});
      return;
    }

    const top = matches[0];

    await ctx.api
      .editMessageText(chatId, statusMsg.message_id, formatHeader(top) + formatAlternates(matches), {
        parse_mode: 'MarkdownV2',
      })
      .catch(async () => {
        await ctx.reply(formatHeader(top) + formatAlternates(matches));
      });

    await ctx.replyWithChatAction('typing');
    const description = await generateDescription({
      scientificName: top.scientificName,
      commonName: top.commonNames[0],
      family: top.family,
      genus: top.genus,
    });

    if (description) {
      await ctx.reply(`📖 *About this plant:*\n\n${escapeMd(description.text)}`, {
        parse_mode: 'MarkdownV2',
      });
    } else {
      await ctx.reply(
        "Couldn't fetch extra details right now, but the identification above is solid. Try again later for the full description."
      );
    }
  } catch (err) {
    console.error('Error handling image:', err.response?.data || err.message);
    await ctx.reply('⚠️ Something went wrong identifying that plant. Please try again with a clearer photo.');
  }
}

async function handleDiseaseImage(ctx, fileId, mimeType = 'image/jpeg') {
  const chatId = ctx.chat.id;
  try {
    await ctx.replyWithChatAction('typing');
    const statusMsg = await ctx.reply('🔬 Analysing for diseases, one moment...');

    const file = await ctx.api.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    const { data: imageBuffer } = await axios.get(fileUrl, { responseType: 'arraybuffer' });

    const results = await identifyDisease(imageBuffer, mimeType);

    if (!results) {
      await ctx.api
        .editMessageText(chatId, statusMsg.message_id, DISEASE_NOT_FOUND_MESSAGE)
        .catch(() => ctx.reply(DISEASE_NOT_FOUND_MESSAGE));
      return;
    }

    await ctx.api
      .editMessageText(chatId, statusMsg.message_id, formatDiseaseResults(results), { parse_mode: 'HTML' })
      .catch(async () => {
        await ctx.reply(formatDiseaseResults(results), { parse_mode: 'HTML' });
      });
  } catch (err) {
    console.error('Error handling disease image:', err.response?.data || err.message);
    await ctx.reply('⚠️ Something went wrong during disease analysis. Please try again with a clearer photo of the affected area.');
  }
}

// ── Bot error handler & startup ────────────────────────────────────────────────

bot.catch((err) => {
  console.error('Bot error:', err);
});

// Clear any existing webhook so long polling works uninterrupted
axios
  .post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook`, { drop_pending_updates: false })
  .then(() => console.log('✅ Webhook cleared.'))
  .catch((err) => console.warn('Could not clear webhook:', err.message));

bot.start();
console.log('✅ Telegram plant ID bot is running.');
