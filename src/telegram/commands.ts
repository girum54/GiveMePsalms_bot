import { eq } from 'drizzle-orm';
import { db, users } from '../db/index.js';

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

  return response.json() as Promise<TelegramSendMessageResponse>;
}

export async function upsertUserFromMessage(message: TelegramMessage | undefined): Promise<void> {
  const chatId = message?.chat?.id;
  const username = message?.chat?.username ?? message?.chat?.first_name ?? 'unknown';

  if (!chatId) return;

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

  await upsertUserFromMessage(message);

  const text = message?.text ?? '';
  const { command, arg } = getCommand(text);

  if (command === '/start') {
    await sendTelegramMessage(chatId, 'Welcome to GiveMePsalms Bot! Send /pause to stop deliveries, /resume to continue, or /time <hour> to choose an hourly delivery time in UTC.');
  } else if (command === '/pause') {
    await db.update(users)
      .set({ isPaused: true, updatedAt: new Date() })
      .where(eq(users.telegramId, String(chatId)));
    await sendTelegramMessage(chatId, 'Deliveries are now paused.');
  } else if (command === '/resume') {
    await db.update(users)
      .set({ isPaused: false, updatedAt: new Date() })
      .where(eq(users.telegramId, String(chatId)));
    await sendTelegramMessage(chatId, 'Deliveries are resumed.');
  } else if (command === '/time') {
    const hour = Number(arg);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      await sendTelegramMessage(chatId, 'Please provide a UTC hour between 0 and 23. Example: /time 6');
    } else {
      await db.update(users)
        .set({ deliveryHour: hour, updatedAt: new Date() })
        .where(eq(users.telegramId, String(chatId)));
      await sendTelegramMessage(chatId, `Delivery time set to UTC ${hour}:00.`);
    }
  } else {
    await sendTelegramMessage(chatId, 'Send /start to begin, /pause to pause, /resume to resume, or /time <hour> to set a delivery hour.');
  }
}
