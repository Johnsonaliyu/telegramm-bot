const axios = require('axios');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const NVIDIA_MODEL = process.env.NVIDIA_MODEL || 'meta/llama-3.1-70b-instruct';

const DESCRIPTION_SYSTEM_PROMPT = `You are a knowledgeable botanist writing short, friendly plant profiles for a Telegram bot.
Given a plant's scientific name, common name, and family, write a concise description covering:
- A 1-2 sentence overview of what the plant is
- Native region / typical habitat
- Notable uses (medicinal, culinary, ornamental, etc.) if any are well known
- One basic care or growing tip if it's commonly cultivated

Keep it under 120 words total. Do not use markdown headers. Write in plain conversational sentences,
short paragraphs are fine. If you are not confident about a specific fact, omit it rather than guessing.`;

const PLANT_QA_SYSTEM_PROMPT = `You are Flora Scan, an expert botanist assistant inside a Telegram bot.
Your job is ONLY to answer questions about plants — including identification, care, uses, diseases, growing tips, classification, and any other plant-related topics.

Rules:
- If the question is about plants, answer accurately and helpfully in plain conversational sentences. Keep answers concise (under 150 words).
- If the question is NOT about plants (e.g. coding, politics, general knowledge, personal advice, etc.), respond ONLY with this exact text: OFFTOPIC
- Do not use markdown headers or bullet points. Write naturally.
- Do not guess; if you are unsure about a fact, say so.`;

function buildDescriptionPrompt({ scientificName, commonName, family, genus }) {
  return (
    `Plant details:\n` +
    `Scientific name: ${scientificName}\n` +
    `Common name: ${commonName || 'unknown'}\n` +
    `Family: ${family || 'unknown'}\n` +
    `Genus: ${genus || 'unknown'}\n\n` +
    `Write the description now.`
  );
}

async function callGroq(messages, maxTokens = 300) {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');

  const { data } = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: GROQ_MODEL,
      messages,
      temperature: 0.4,
      max_tokens: maxTokens,
    },
    {
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 20000,
    }
  );

  return data.choices?.[0]?.message?.content?.trim();
}

async function callNvidia(messages, maxTokens = 300) {
  if (!NVIDIA_API_KEY) throw new Error('NVIDIA_API_KEY not set');

  const { data } = await axios.post(
    'https://integrate.api.nvidia.com/v1/chat/completions',
    {
      model: NVIDIA_MODEL,
      messages,
      temperature: 0.4,
      max_tokens: maxTokens,
    },
    {
      headers: {
        Authorization: `Bearer ${NVIDIA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 25000,
    }
  );

  return data.choices?.[0]?.message?.content?.trim();
}

async function callAI(messages, maxTokens = 300) {
  try {
    const result = await callGroq(messages, maxTokens);
    if (result) return result;
  } catch (err) {
    console.error('Groq failed:', err.response?.data?.error?.message || err.message);
  }

  try {
    const result = await callNvidia(messages, maxTokens);
    if (result) return result;
  } catch (err) {
    console.error('Nvidia failed:', err.response?.data?.error?.message || err.message);
  }

  return null;
}

/**
 * Generates a natural-language plant description after photo identification.
 * Returns null if both AI providers fail or are unconfigured.
 */
async function generateDescription(plantInfo) {
  const messages = [
    { role: 'system', content: DESCRIPTION_SYSTEM_PROMPT },
    { role: 'user', content: buildDescriptionPrompt(plantInfo) },
  ];

  const result = await callAI(messages, 300);
  return result ? { text: result } : null;
}

/**
 * Answers a plant-related question from the user.
 * Returns { text, offTopic: false } for plant questions,
 * { offTopic: true } for unrelated questions,
 * or null if AI is unavailable.
 */
async function answerPlantQuestion(question) {
  const messages = [
    { role: 'system', content: PLANT_QA_SYSTEM_PROMPT },
    { role: 'user', content: question },
  ];

  const result = await callAI(messages, 250);
  if (!result) return null;
  if (result.trim() === 'OFFTOPIC') return { offTopic: true };
  return { text: result, offTopic: false };
}

const DISEASE_REPORT_SYSTEM_PROMPT = `You are an expert plant pathologist and agronomist providing practical guidance to farmers and gardeners.
Given a plant disease name or EPPO code, write a clear, structured report covering exactly these five sections in order:

1. About the Disease — 2-3 sentences explaining what it is and what plants it affects.
2. Possible Causes — list 2-4 main causes or conditions that trigger it.
3. Treatment Options — list 3-5 practical treatment steps (chemical, biological, or cultural).
4. Preventive Measures — list 3-4 steps to prevent the disease from occurring.
5. Best Farming Practices — 2-3 general good-practice tips relevant to this disease.

Format rules:
- Use plain text only. No markdown symbols (* # _ etc.).
- Separate each section with a blank line.
- Start each section heading with its number and name exactly as listed above, followed by a colon.
- Keep the entire response under 350 words.
- Be specific and actionable. If you are unsure of a fact, omit it.`;

/**
 * Generates a comprehensive disease report including causes, treatment, prevention, and farming practices.
 * Returns { text } or null if AI is unavailable.
 */
async function generateDiseaseReport(eppoCode, description) {
  const prompt = `Plant disease detected:\nEPPO Code: ${eppoCode}\nDescription: ${description}\n\nWrite the full disease report now.`;

  const messages = [
    { role: 'system', content: DISEASE_REPORT_SYSTEM_PROMPT },
    { role: 'user', content: prompt },
  ];

  const result = await callAI(messages, 600);
  return result ? { text: result } : null;
}

module.exports = { generateDescription, answerPlantQuestion, generateDiseaseReport };
