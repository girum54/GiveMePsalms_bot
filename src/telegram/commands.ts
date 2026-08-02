import { eq } from 'drizzle-orm';
import { getDb, initializeDatabase, users } from '../db/index.js';
import { formatPsalmChapter } from '../psalms/format.js';
import psalms from '../../assets/psalms.json' with { type: 'json' };

export type TelegramMessage = {
  chat?: { id?: number; username?: string; first_name?: string; last_name?: string };
  text?: string;
};

export type TelegramCallbackQuery = {
  id: string;
  data?: string;
  message?: { chat?: { id?: number } };
};

type TelegramSendMessageResponse = {
  ok?: boolean;
  result?: unknown;
  description?: string;
};

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

function getCommand(text: string): { command: string; arg?: string } {
  const trimmed = text.trim();
  if (!trimmed) return { command: '' };

  const [command, ...rest] = trimmed.split(/\s+/);
  if (command.startsWith('/')) {
    return { command: command.toLowerCase(), arg: rest.join(' ').trim() };
  }

  return { command: '' };
}

async function sendTelegramMessage(chatId: number, text: string, replyMarkup?: unknown): Promise<TelegramSendMessageResponse> {
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  }

  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  };

  if (replyMarkup) {
    body.reply_markup = replyMarkup;
  }

  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const payload = await response.json() as TelegramSendMessageResponse;
  if (!payload.ok) {
    throw new Error(payload.description ?? 'Telegram send failed');
  }

  return payload;
}

async function answerTelegramCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  }

  const body: Record<string, unknown> = {
    callback_query_id: callbackQueryId,
  };

  if (text) {
    body.text = text;
    body.show_alert = false;
  }

  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const payload = await response.json() as TelegramSendMessageResponse;
  if (!payload.ok) {
    throw new Error(payload.description ?? 'Telegram answerCallbackQuery failed');
  }
}

export async function upsertUserFromMessage(message: TelegramMessage | undefined, db?: Awaited<ReturnType<typeof getDb>>): Promise<void> {
  const chatId = message?.chat?.id;
  const username = message?.chat?.username ?? message?.chat?.first_name ?? 'unknown';

  if (!chatId || !db) return;

  await db.insert(users)
    .values({
      telegramId: String(chatId),
      username,
      currentChapter: 1,
      deliveryHour: null,
      isPaused: false,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: users.telegramId,
      set: {
        username,
        updatedAt: new Date(),
      },
    });
}

export async function upsertUserFromCallback(callbackQuery: TelegramCallbackQuery, db?: Awaited<ReturnType<typeof getDb>>): Promise<void> {
  const chatId = callbackQuery.message?.chat?.id;
  if (!chatId || !db) return;

  await db.insert(users)
    .values({
      telegramId: String(chatId),
      username: 'unknown',
      currentChapter: 1,
      deliveryHour: null,
      isPaused: false,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: users.telegramId,
      set: {
        updatedAt: new Date(),
      },
    });
}

export async function handleTelegramCommand(message: TelegramMessage | undefined): Promise<void> {
  const chatId = message?.chat?.id;
  if (!chatId) return;

  let db: Awaited<ReturnType<typeof getDb>> | undefined;

  try {
    await initializeDatabase();
    db = await getDb();
  } catch {
    db = undefined;
  }

  await upsertUserFromMessage(message, db);

  const text = message?.text ?? '';
  const { command, arg } = getCommand(text);

  try {
    if (command === '/start') {
      await sendTelegramMessage(chatId, 'Welcome to GiveMePsalms Bot. Read the Psalms as poems with gentle rhythm and thoughtful pauses. Use /pause to stop daily readings, /resume to continue, or /chapter to read your current Psalm.');
    } else if (command === '/pause') {
      if (db) {
        await db.update(users)
          .set({ isPaused: true, updatedAt: new Date() })
          .where(eq(users.telegramId, String(chatId)));
      }
      await sendTelegramMessage(chatId, 'Your daily Psalm reading is paused. Send /resume whenever you are ready to continue.');
    } else if (command === '/resume') {
      if (db) {
        await db.update(users)
          .set({ isPaused: false, updatedAt: new Date() })
          .where(eq(users.telegramId, String(chatId)));
      }
      await sendTelegramMessage(chatId, 'Daily Psalm readings are resumed. Your Psalm sequence will continue from where it left off.');
    } else if (command === '/time') {
      await sendTelegramMessage(chatId, 'The /time feature is temporarily unavailable. Psalm readings continue once each day on the fixed schedule.');
    } else if (command === '/chapter') {
      if (!db) {
        await sendTelegramMessage(chatId, 'Chapter preview is unavailable right now.');
      } else {
        const user = await db.select().from(users).where(eq(users.telegramId, String(chatId))).limit(1);
        const currentChapter = user[0]?.currentChapter ?? 1;
        const requestedChapter = arg && /^[0-9]+$/.test(arg.trim()) ? Number(arg.trim()) : undefined;
        const chapterNumber = requestedChapter ?? currentChapter;
        const chapter = (psalms as { chapter: number; lines: string[] }[]).find((entry) => entry.chapter === chapterNumber);

        if (!chapter) {
          if (requestedChapter) {
            await sendTelegramMessage(chatId, `Psalm ${requestedChapter} is not available yet.`);
          } else {
            await sendTelegramMessage(chatId, `Psalm ${chapterNumber} is not available yet.`);
          }
        } else {
          const formatted = formatPsalmChapter(chapter);
          const previewLabel = requestedChapter ? `Previewing Psalm ${chapterNumber}` : `Psalm ${chapterNumber}`;
          await sendTelegramMessage(chatId, `${previewLabel}\n\n${formatted}`);
        }
      }
    } else if (command === '/status') {
      if (!db) {
        await sendTelegramMessage(chatId, 'Status is unavailable right now.');
      } else {
        const user = await db.select().from(users).where(eq(users.telegramId, String(chatId))).limit(1);
        const u = user[0];
        const chapterNum = u?.currentChapter ?? 1;
        const paused = u?.isPaused ? 'yes' : 'no';
        await sendTelegramMessage(chatId, `Status:\nCurrent chapter: ${chapterNum}\nSchedule: one daily Psalm reading\nPaused: ${paused}`);
      }
    } else {
      await sendTelegramMessage(chatId, 'Send /start to begin, /pause to pause, /resume to resume, or /chapter to see your current Psalm.');
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error';
    await sendTelegramMessage(chatId, `Bot error: ${reason}`);
  }
}

export async function handleTelegramCallback(callbackQuery: TelegramCallbackQuery): Promise<void> {
  const chatId = callbackQuery.message?.chat?.id;
  if (!chatId) return;

  const callbackData = callbackQuery.data ?? '';
  if (callbackData.startsWith('set_time_')) {
    await answerTelegramCallbackQuery(callbackQuery.id, 'The time-setting feature is temporarily disabled.');
    await sendTelegramMessage(chatId, 'The time-setting feature is temporarily disabled. Psalm readings continue once each day on the fixed schedule.');
    return;
  }

  await sendTelegramMessage(chatId, 'Unsupported action.');
}
