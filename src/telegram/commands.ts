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
      await sendTelegramMessage(chatId, 'Welcome to GiveMePsalms Bot! Send /pause to stop deliveries, /resume to continue, /time to choose a delivery hour in UTC+3, or /chapter to see your current Psalm.');
    } else if (command === '/pause') {
      if (db) {
        await db.update(users)
          .set({ isPaused: true, updatedAt: new Date() })
          .where(eq(users.telegramId, String(chatId)));
      }
      await sendTelegramMessage(chatId, 'Deliveries are now paused.');
    } else if (command === '/resume') {
      if (db) {
        await db.update(users)
          .set({ isPaused: false, updatedAt: new Date() })
          .where(eq(users.telegramId, String(chatId)));
      }
      await sendTelegramMessage(chatId, 'Deliveries are resumed.');
    } else if (command === '/time') {
      const hours = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
      const buttons = hours.map((hour) => {
        const localHour = (hour + 3) % 24;
        const suffix = localHour === 0 ? 12 : localHour > 12 ? localHour - 12 : localHour;
        const ampm = localHour >= 12 ? 'PM' : 'AM';
        return [{ text: `${suffix}${ampm} (${hour} UTC)`, callback_data: `set_time_${hour}` }];
      });

      await sendTelegramMessage(chatId, 'Choose your delivery hour in UTC+3:', {
        inline_keyboard: buttons,
      });
    } else if (command === '/chapter') {
      if (!db) {
        await sendTelegramMessage(chatId, 'Chapter preview is unavailable right now.');
      } else {
        const user = await db.select().from(users).where(eq(users.telegramId, String(chatId))).limit(1);
        const chapterNumber = user[0]?.currentChapter ?? 1;
        const chapter = (psalms as { chapter: number; lines: string[] }[]).find((entry) => entry.chapter === chapterNumber);

        if (!chapter) {
          await sendTelegramMessage(chatId, `Psalm ${chapterNumber} is not available yet.`);
        } else {
          const formatted = formatPsalmChapter(chapter);
          await sendTelegramMessage(chatId, `Psalm ${chapterNumber}\n\n${formatted}`);
        }
      }
    } else {
      await sendTelegramMessage(chatId, 'Send /start to begin, /pause to pause, /resume to resume, /time <hour> to set a delivery hour, or /chapter to see your current Psalm.');
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
  const match = callbackData.match(/^set_time_(\d{1,2})$/);
  if (!match) {
    await sendTelegramMessage(chatId, 'Unsupported action.');
    return;
  }

  const hour = Number(match[1]);
  if (Number.isNaN(hour) || hour < 0 || hour > 23) {
    await sendTelegramMessage(chatId, 'Invalid hour chosen.');
    return;
  }

  try {
    await initializeDatabase();
    const db = await getDb();
    await db.update(users)
      .set({ deliveryHour: hour, updatedAt: new Date() })
      .where(eq(users.telegramId, String(chatId)));

    const confirmation = `Delivery time set to UTC ${hour}:00. (UTC+3: ${(hour + 3) % 24}:00)`;
    await answerTelegramCallbackQuery(callbackQuery.id, confirmation);
    await sendTelegramMessage(chatId, confirmation);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error';
    await answerTelegramCallbackQuery(callbackQuery.id, `Unable to update time: ${reason}`);
    await sendTelegramMessage(chatId, `Unable to update time: ${reason}`);
  }
}
