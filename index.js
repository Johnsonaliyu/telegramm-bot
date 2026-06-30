require('dotenv').config();

const { Bot, InputFile } = require('grammy');
const axios = require('axios');
const { identifyPlant, formatHeader, formatAlternates, NOT_FOUND_MESSAGE, escapeMd } = require('./plantnet');
const { generateDescription } = require('./ai');

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

bot.command('start', (ctx) =>
  ctx.reply(
    '🌱 Hi! Send me a clear photo of a plant (leaf, flower, or fruit) and I will identify it and tell you about it.'
  )
);

bot.command('help', (ctx) =>
  ctx.reply(
    'Just send a photo of a plant. For best results:\n' +
      '• Get close to a single leaf or flower\n' +
      '• Use good natural light\n' +
      '• Avoid blurry photos'
  )
);

// Handle photos (compressed images Telegram sends in chat)
bot.on('message:photo', async (ctx) => {
  await handleIncomingImage(ctx, ctx.message.photo.at(-1).file_id);
});

// Handle images sent as uncompressed "documents" (image/* mime types)
bot.on('message:document', async (ctx) => {
  const doc = ctx.message.document;
  if (doc.mime_type && doc.mime_type.startsWith('image/')) {
    await handleIncomingImage(ctx, doc.file_id, doc.mime_type);
  } else {
    await ctx.reply('Please send an image file of a plant.');
  }
});

// Fallback for plain text
bot.on('message:text', (ctx) =>
  ctx.reply('🌱 Send me a plant photo and I will identify it for you!')
);

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
        // Fall back to plain text if MarkdownV2 parsing ever fails on odd characters
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
