# GiveMePsalms Bot

A Telegram bot that delivers daily Psalms using Vercel serverless functions, Drizzle ORM, and PostgreSQL.

## Features

- `/start` — start the bot and view help.
- `/pause` — pause daily Psalm deliveries.
- `/resume` — resume daily Psalm deliveries.
- `/time` — choose a delivery hour using a UTC+3 inline picker.
- `/chapter` — show the user’s current saved Psalm chapter.
- `/chapter <number>` — preview a specific Psalm without changing the saved chapter.

## Project Structure

- `api/`
  - `webhook.ts` — Telegram webhook handler.
  - `cron.ts` — scheduled Psalm delivery handler.
- `src/`
  - `db/` — database connection and schema.
  - `psalms/` — Psalm formatting logic.
  - `telegram/commands.ts` — command and callback handling.
- `assets/` — Psalm JSON data.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Set environment variables:

- `TELEGRAM_BOT_TOKEN` — Telegram bot token.
- `DATABASE_URL` — PostgreSQL connection string.

3. Build the project:

```bash
npm run build
```

4. Deploy to Vercel or run locally with a compatible Vercel development flow.

## Notes

- The bot stores users in PostgreSQL and tracks current Psalm chapter and selected delivery hour.
- `/chapter <number>` previews a Psalm without updating the saved chapter.
- The `/time` command uses UTC+3 labels for user-friendly time selection.

## Commands

- `/start`
- `/pause`
- `/resume`
- `/time`
- `/chapter`
- `/chapter <number>`
