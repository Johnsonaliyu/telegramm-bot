require('dotenv').config();

const { Bot } = require('grammy');
const axios = require('axios');
const { identifyPlant, formatHeader, formatAlternates, NOT_FOUND_MESSAGE, escapeMd } = require('./plantnet');
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

const GREETING_REGEX = /^(hi|hello|hey|howdy|hiya|good\s*(morning|afternoon|evening|day|night)|greetings|what'?s\s*up|sup|yo)\b/i;

function buildGreeting(firstName) {
  return (
    `🌿 Good day, ${firstName}!\n\n` +
    `I'm *Flora Scan*, built by *Aliu Johnson Temitope*, a fellow of the *3MTT Airtel NextGen Program* with fellow ID *FE/23/24184818*.\n\n` +
    `Here's what I can do for you:\n\n` +
    `📸 *Identify plants from photos* — send any clear plant image\n` +
    `🌱 *Common & scientific names* — know exactly what plant you're looking at\n` +
    `🏷️ *Family & confidence score* — with possible alternate matches\n` +
    `📖 *Detailed plant profile* — habitat, uses, and care tips\n` +
    `❓ *Answer plant questions* — ask me anything about plants\n\n` +
    `_Send me a plant photo or ask a plant question to get started\\!_`
  );
}

const OFFTOPIC_REPLY =
  "🌿 I'm Flora Scan, a plant identification assistant. I can only help with plant-related questions.\n\n" +
  'Try asking me about a plant, or send me a photo and I will identify it for you!';

bot.command('start', (ctx) => {
  const name = ctx.from?.first_name || 'there';
  return ctx.reply(buildGreeting(name), { parse_mode: 'MarkdownV2' });
});

bot.command('help', (ctx) =>
  ctx.reply(
    'Here are tips for best results:\n\n' +
      '📸 *Sending photos:*\n' +
      '• Get close to a single leaf, flower, or fruit\n' +
      '• Use good natural light\n' +
      '• Avoid blurry or shadowed photos\n\n' +
      '❓ *Asking questions:*\n' +
      '• Ask anything about plants — care, uses, diseases, names, and more',
    { parse_mode: 'MarkdownV2' }
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

// Handle all text messages
bot.on('message:text', async (ctx) => {
  const text = ctx.message.text.trim();
  const firstName = ctx.from?.first_name || 'there';

  // Greetings
  if (GREETING_REGEX.test(text)) {
    return ctx.reply(buildGreeting(firstName), { parse_mode: 'MarkdownV2' });
  }

  // Plant questions — route to AI
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
