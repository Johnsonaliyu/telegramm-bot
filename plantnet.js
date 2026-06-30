const axios = require('axios');
const FormData = require('form-data');
const sharp = require('sharp');

const PLANTNET_API_KEY = process.env.PLANTNET_API_KEY;
const PLANTNET_PROJECT = process.env.PLANTNET_PROJECT || 'all';

const SUPPORTED_TYPES = ['image/jpeg', 'image/png'];

/**
 * Converts unsupported image formats (e.g. WebP) to JPEG.
 */
async function toSupportedBuffer(imageBuffer, mimeType) {
  if (SUPPORTED_TYPES.includes(mimeType)) {
    return { buffer: imageBuffer, mime: mimeType };
  }
  const buffer = await sharp(imageBuffer).jpeg({ quality: 90 }).toBuffer();
  return { buffer, mime: 'image/jpeg' };
}

/**
 * Identifies a plant from an image buffer using the PlantNet API.
 * Returns an array of up to 3 candidate matches, or null if nothing was matched.
 */
async function identifyPlant(imageBuffer, mimeType = 'image/jpeg') {
  const { buffer, mime } = await toSupportedBuffer(imageBuffer, mimeType);

  const form = new FormData();
  form.append('images', buffer, { filename: 'plant.jpg', contentType: mime });
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
    if (err.response?.status === 404) return null;
    throw err;
  }

  if (!data.results || data.results.length === 0) return null;

  return data.results.slice(0, 3).map((r) => ({
    score: (r.score * 100).toFixed(1),
    scientificName: r.species.scientificNameWithoutAuthor,
    commonNames: r.species.commonNames || [],
    family: r.species.family?.scientificNameWithoutAuthor,
    genus: r.species.genus?.scientificNameWithoutAuthor,
  }));
}

/**
 * Identifies plant diseases from an image buffer using the PlantNet diseases API.
 * Returns an array of up to 3 disease matches, or null if none found.
 */
async function identifyDisease(imageBuffer, mimeType = 'image/jpeg') {
  const { buffer, mime } = await toSupportedBuffer(imageBuffer, mimeType);

  const form = new FormData();
  form.append('images', buffer, { filename: 'plant.jpg', contentType: mime });
  form.append('organs', 'auto');

  const url = `https://my-api.plantnet.org/v2/diseases/identify?api-key=${PLANTNET_API_KEY}&include-related-images=false&no-reject=false&nb-results=3`;

  let data;
  try {
    const response = await axios.post(url, form, {
      headers: form.getHeaders(),
      timeout: 20000,
    });
    data = response.data;
  } catch (err) {
    if (err.response?.status === 404) return null;
    throw err;
  }

  if (!data.results || data.results.length === 0) return null;

  return data.results.map((r) => ({
    eppoCode: r.name,
    score: (r.score * 100).toFixed(1),
    description: r.description || r.name,
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

function formatDiseaseResults(results) {
  const top = results[0];
  let reply = `🔬 <b>Disease analysis complete!</b>\n\n`;
  reply += `<b>Most likely issue:</b> ${top.description}\n`;
  reply += `<b>Confidence:</b> ${top.score}%\n`;
  reply += `<b>EPPO Code:</b> <code>${top.eppoCode}</code>\n`;

  if (results.length > 1) {
    reply += `\n<b>Other possibilities:</b>\n`;
    results.slice(1).forEach((r) => {
      reply += `• ${r.description} (${r.score}%)\n`;
    });
  }

  reply += `\n<i>Note: Disease identification covers a limited set of species and pathologies. For serious plant health concerns, consult an agronomist.</i>`;
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

const DISEASE_NOT_FOUND_MESSAGE =
  "🔬 I couldn't detect a known disease in this photo.\n\n" +
  'Tips for better disease detection:\n' +
  '• Focus on the affected area (leaf spots, discolouration, lesions)\n' +
  '• Use good natural light\n' +
  '• Avoid blurry photos\n\n' +
  'Note: Disease identification covers a limited range of species and conditions.';

module.exports = {
  identifyPlant,
  identifyDisease,
  formatHeader,
  formatAlternates,
  formatDiseaseResults,
  NOT_FOUND_MESSAGE,
  DISEASE_NOT_FOUND_MESSAGE,
  escapeMd,
};
