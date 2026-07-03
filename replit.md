# Flora Scan — Telegram Plant ID Bot

A Telegram bot that identifies plants from photos using the PlantNet API, with AI-generated descriptions via Groq (falling back to Nvidia NIM).

## How to run

```
npm start
```

The bot uses long-polling (`bot.start()` from grammY), so no webhook setup is needed.

## Required secrets

| Secret | Description |
|---|---|
| `TELEGRAM_BOT_TOKEN` | From [@BotFather](https://t.me/BotFather) on Telegram |
| `PLANTNET_API_KEY` | Free at https://my.plantnet.org/ |
| `GROQ_API_KEY` | Free at https://console.groq.com/keys (optional but recommended) |
| `NVIDIA_API_KEY` | Free at https://build.nvidia.com/ (optional fallback AI) |

## Stack

- **grammy** — Telegram bot framework
- **PlantNet API** — plant identification from photos
- **Groq / Nvidia NIM** — LLM providers for plant descriptions and Q&A
- **sharp** — image processing
- **axios** — HTTP client

## File layout

- `index.js` — bot entry point; handles commands, photo, and text messages
- `plantnet.js` — PlantNet API integration and result formatting
- `ai.js` — Groq/Nvidia LLM calls for descriptions, Q&A, and disease reports

## User preferences

<!-- Add user preferences here -->
