const axios = require('axios');
const FormData = require('form-data');

const PLANTNET_API_KEY = process.env.PLANTNET_API_KEY;
const PLANTNET_PROJECT = process.env.PLANTNET_PROJECT || 'all';

/**
 * Identifies a plant from an image buffer using the PlantNet API.
 * Returns an array of up to 3 candidate matches, or null if nothing was matched.
 */
async function identifyPlant(imageBuffer) {
  const form = new FormData();
  // "organs" tells PlantNet what part of the plant is in the photo.
  // "auto" lets PlantNet figure it out; you can also hint with 'leaf', 'flower', 'fruit', 'bark'.
  form.append('images', imageBuffer, { filename: 'plant.jpg', contentType: 'image/jpeg' });
  form.append('organs', 'auto');

  const url = `https://my-api.plantnet.org/v2/identify/${PLANTNET_PROJECT}?api-key=${PLANTNET_API_KEY}&include-related-images=false&no-reject=false`;

  let data;
  try {
    const response = await axios.post(url, form, {
      headers: form.getHeaders(),
      timeout: 20000,
    });
    data = response.data;
  } catch (err) {
    if (err.response?.status === 404) {
      return null;
    }
    throw err;
  }

  if (!data.results || data.results.length === 0) {
    return null;
  }

  return data.results.slice(0, 3).map((r) => ({
    score: (r.score * 100).toFixed(1),
    scientificName: r.species.scientificNameWithoutAuthor,
    commonNames: r.species.commonNames || [],
    family: r.species.family?.scientificNameWithoutAuthor,
    genus: r.species.genus?.scientificNameWithoutAuthor,
  }));
}

function formatHeader(top) {
  const commonName = top.commonNames[0] || 'No common name found';
  let reply = `🌿 *Plant identified\\!*\n\n`;
  reply += `*Name:* ${escapeMd(commonName)}\n`;
  reply += `*Scientific name:* _${escapeMd(top.scientificName)}_\n`;
  if (top.family) reply += `*Family:* ${escapeMd(top.family)}\n`;
  reply += `*Confidence:* ${escapeMd(String(top.score))}%\n`;

  if (top.commonNames.length > 1) {
    reply += `*Also known as:* ${escapeMd(top.commonNames.slice(1, 4).join(', '))}\n`;
  }
  return reply;
}

function formatAlternates(matches) {
  if (matches.length <= 1) return '';
  let reply = `\n_Other possible matches:_\n`;
  matches.slice(1).forEach((m) => {
    reply += `• ${escapeMd(m.commonNames[0] || m.scientificName)} \\(${escapeMd(String(m.score))}%\\)\n`;
  });
  return reply;
}

// Telegram MarkdownV2 requires escaping these reserved characters
function escapeMd(text = '') {
  return text.replace(/[_*\[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

const NOT_FOUND_MESSAGE =
  "I couldn't confidently identify this plant. 🌱\n\n" +
  'Tips for a better shot:\n' +
  '• Get close to a single leaf or flower\n' +
  '• Use good natural light\n' +
  '• Avoid blurry or shadowed photos\n\n' +
  'Try sending another photo!';

module.exports = { identifyPlant, formatHeader, formatAlternates, NOT_FOUND_MESSAGE, escapeMd };
