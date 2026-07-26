import { and, eq, isNotNull } from 'drizzle-orm';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb, initializeDatabase, users } from '../src/db/index.js';
import { formatPsalmChapter } from '../src/psalms/format.js';
import psalms from '../assets/psalms.json' with { type: 'json' };

type PsalmChapter = {
  chapter: number;
  lines: string[];
};

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAPTER_COUNT = 150;
const psalmsData = psalms as PsalmChapter[];

function formatChapter(chapter: PsalmChapter): string {
  return formatPsalmChapter(chapter);
}

async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  }

  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Telegram send failed: ${response.status}`);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const utcHour = Number(req.query.hour ?? new Date().getUTCHours());
  const debugMode = String(req.query.debug ?? '').toLowerCase() === 'true' || String(req.query.debug ?? '') === '1';
  await initializeDatabase();
  const db = await getDb();

  try {
    let debugInfo: Record<string, unknown> | undefined;
    if (debugMode) {
      const activeUsers = await db
        .select()
        .from(users)
        .where(isNotNull(users.deliveryHour));

      const hourCounts = activeUsers.reduce<Record<string, number>>((counts, user) => {
        const hourKey = user.deliveryHour === null ? 'null' : String(user.deliveryHour);
        counts[hourKey] = (counts[hourKey] ?? 0) + 1;
        return counts;
      }, {});

      debugInfo = {
        activeDeliveryUsers: activeUsers.length,
        hourCounts,
      };
    }

    const scheduledUsers = await db
      .select()
      .from(users)
      .where(and(
        eq(users.isPaused, false),
        isNotNull(users.deliveryHour),
        eq(users.deliveryHour, utcHour),
      ));

    const results: Array<{ telegramId: string; deliveryHour: number | null; success: boolean; error?: string }> = [];

    for (const user of scheduledUsers) {
      const deliveryHour = user.deliveryHour ?? null;
      if (deliveryHour === null || deliveryHour !== utcHour) {
        results.push({ telegramId: user.telegramId, deliveryHour, success: false, error: 'hour-mismatch' });
        continue;
      }

      const chapterNumber = user.currentChapter && user.currentChapter > 0 ? user.currentChapter : 1;
      const chapter = psalmsData.find((entry) => entry.chapter === chapterNumber);
      const text = chapter
        ? `Psalm ${chapterNumber}\n\n${formatChapter(chapter)}`
        : `Psalm ${chapterNumber} is not available yet.`;

      try {
        await sendTelegramMessage(user.telegramId, text);

        const nextChapter = chapterNumber >= CHAPTER_COUNT ? 1 : chapterNumber + 1;
        await db.update(users)
          .set({ currentChapter: nextChapter, updatedAt: new Date() })
          .where(eq(users.telegramId, user.telegramId));

        results.push({ telegramId: user.telegramId, deliveryHour, success: true });
      } catch (sendError) {
        const errMsg = sendError instanceof Error ? sendError.message : String(sendError);
        results.push({ telegramId: user.telegramId, deliveryHour, success: false, error: errMsg });
        // continue to next user without failing the whole run
      }
    }

    const deliveredCount = results.filter((r) => r.success).length;
    res.status(200).json({ ok: true, delivered: deliveredCount, hour: utcHour, matchedUsers: scheduledUsers.length, results, debug: debugInfo });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ ok: false, error: messageText });
  }
}
