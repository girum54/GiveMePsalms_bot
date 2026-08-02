# GiveMePsalms Bot

A Telegram bot that shares Psalms as daily readings using Vercel serverless functions, Drizzle ORM, and PostgreSQL.

## Features

- `/start` — start the bot and view help.
- `/pause` — pause daily Psalm readings.
- `/resume` — resume daily Psalm readings.
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

- The bot stores users in PostgreSQL and tracks the current Psalm chapter.
- Psalm readings are sent once per day on a fixed schedule.
- `/chapter <number>` previews a Psalm without updating the saved chapter.

## Commands

- `/start`
- `/pause`
- `/resume`
- `/chapter`
- `/chapter <number>`
