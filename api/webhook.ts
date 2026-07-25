import type { IncomingMessage, ServerResponse } from 'http';
import { handleTelegramCommand } from '../src/telegram/commands.js';

export type VercelRequest = IncomingMessage & {
  query?: Record<string, string | string[]>;
  cookies?: Record<string, string>;
  body?: unknown;
};

export type VercelResponse = ServerResponse & {
  send: (body: unknown) => VercelResponse;
  json: (jsonBody: unknown) => VercelResponse;
  status: (statusCode: number) => VercelResponse;
  redirect: (statusOrUrl: string | number, url?: string) => VercelResponse;
};

type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id?: number;
    chat?: { id?: number; username?: string; first_name?: string; last_name?: string };
    text?: string;
    date?: number;
  };
};

function isValidTelegramMessage(update: TelegramUpdate | undefined): update is TelegramUpdate & { message: NonNullable<TelegramUpdate['message']> } {
  return Boolean(update?.message?.chat?.id && update.message.text);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  if (req.method === 'GET') {
    res.status(200).json({ ok: true, message: 'Webhook is alive' });
    return;
  }

  const update = req.body as TelegramUpdate;

  if (!isValidTelegramMessage(update)) {
    res.status(200).json({ ok: true });
    return;
  }

  const message = update.message;
  const chatId = message.chat?.id;
  const text = message.text ?? '';

  try {
    await handleTelegramCommand(message);

    res.status(200).json({ ok: true });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ ok: false, error: messageText });
  }
}
