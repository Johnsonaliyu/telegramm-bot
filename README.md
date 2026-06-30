# Telegram Plant ID Bot

Same plant-identification flow as the WhatsApp bot, built for Telegram with grammY. Send a photo, get the plant's name (PlantNet) and a rich AI description (Groq, falling back to Nvidia NIM).

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Create a bot with [@BotFather](https://t.me/BotFather) on Telegram:
   - Send `/newbot`, follow the prompts, copy the token it gives you

3. Get API keys:
   - PlantNet (free): https://my.plantnet.org/
   - Groq (free): https://console.groq.com/keys
   - Nvidia NIM (free): https://build.nvidia.com/

4. Copy `.env.example` to `.env` and fill in your keys:
   ```
   cp .env.example .env
   ```

5. Run the bot:
   ```
   npm start
   ```

6. Open your bot in Telegram (the link BotFather gave you), send `/start`, then send a plant photo.

## How it works

- `plantnet.js` — sends the photo to PlantNet, returns up to 3 candidate matches with confidence scores, formats the WhatsApp-style identification message (escaped for Telegram's MarkdownV2)
- `ai.js` — identical module to the WhatsApp bot: tries Groq first (`GROQ_MODEL`), falls back to Nvidia NIM (`NVIDIA_MODEL`) if Groq fails or isn't configured, generates a short botanist-style description (overview, habitat, uses, care tip)
- `index.js` — grammY bot: listens for photos and image documents, downloads via Telegram's file API, runs identification, edits the "Identifying..." message with the result, then sends a follow-up message with the AI description

The bot never blocks identification on the AI step — if both Groq and Nvidia fail, it still shows the PlantNet result and just skips the extra description.

## Notes

- Telegram compresses photos sent normally in chat; if a user wants full-resolution identification, they can send the image as a "file"/document instead — the bot handles both.
- PlantNet's free tier has a daily request quota (500/day at last check).
- Deploys the same way as your other bots — Railway, Replit, etc. Long-polling (`bot.start()`) works anywhere; switch to webhooks later if you want lower latency at scale.
- No "pairing code" step needed here — Telegram bots authenticate purely with the bot token, so there's nothing else to link.
