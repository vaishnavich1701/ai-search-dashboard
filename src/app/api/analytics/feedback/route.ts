import db from '@/lib/db';
import { messages, queryAnalytics } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import {
  feedbackUnauthorizedResponse,
  isFeedbackAuthorized,
} from '@/lib/feedbackAuth';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  chatId: z.string().min(1),
  messageId: z.string().min(1),
  rating: z.number().int().min(-1).max(1),
  text: z.string().max(2000).optional(),
});

export const POST = async (req: Request) => {
  if (!isFeedbackAuthorized(req)) return feedbackUnauthorizedResponse();

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json(
      { message: 'Invalid feedback payload' },
      { status: 400 },
    );
  }

  const message = await db.query.messages.findFirst({
    where: and(
      eq(messages.chatId, parsed.data.chatId),
      eq(messages.messageId, parsed.data.messageId),
    ),
  });

  if (!message) {
    return Response.json({ message: 'Message not found' }, { status: 404 });
  }

  await db
    .update(queryAnalytics)
    .set({
      feedbackRating: parsed.data.rating,
      feedbackText: parsed.data.text ?? null,
    })
    .where(
      and(
        eq(queryAnalytics.chatId, parsed.data.chatId),
        eq(queryAnalytics.messageId, parsed.data.messageId),
      ),
    )
    .execute();

  return Response.json({ ok: true });
};
