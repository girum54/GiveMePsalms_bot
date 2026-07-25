import { eq } from 'drizzle-orm';
import { getDb, initializeDatabase, users } from '../db/index.js';
import { formatPsalmChapter } from '../psalms/format.js';
import psalms from '../../assets/psalms.json' with { type: 'json' };

export type TelegramMessage = {
  chat?: { id?: number; username?: string; first_name?: string; last_name?: string };
  text?: string;
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

async function sendTelegramMessage(chatId: number, text: string): Promise<TelegramSendMessageResponse> {
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  }

  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });

  const payload = await response.json() as TelegramSendMessageResponse;
  if (!payload.ok) {
    throw new Error(payload.description ?? 'Telegram send failed');
  }

  return payload;
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
      await sendTelegramMessage(chatId, 'Welcome to GiveMePsalms Bot! Send /pause to stop deliveries, /resume to continue, or /time &lt;hour&gt; to choose an hourly delivery time in UTC.');
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
      const hourArg = arg?.trim();
      const hour = hourArg && /^[0-9]{1,2}$/.test(hourArg) ? Number(hourArg) : NaN;
      if (Number.isNaN(hour) || hour < 0 || hour > 23) {
        await sendTelegramMessage(chatId, 'Please provide a valid UTC hour between 0 and 23. Example: /time 6');
      } else {
        if (db) {
          await db.update(users)
            .set({ deliveryHour: hour, updatedAt: new Date() })
            .where(eq(users.telegramId, String(chatId)));
        }
        await sendTelegramMessage(chatId, `Delivery time set to UTC ${hour}:00.`);
      }
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
