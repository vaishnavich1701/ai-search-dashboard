import db from '@/lib/db';
import { messages, queryAnalytics } from '@/lib/db/schema';
import { RequestActor } from '@/lib/requestActor';
import { and, eq } from 'drizzle-orm';

export type FeedbackInput = {
  chatId: string;
  messageId: string;
  rating: number;
  text?: string;
};

export const writeQueryFeedback = async (input: FeedbackInput) => {
  await db
    .update(queryAnalytics)
    .set({
      feedbackRating: input.rating,
      feedbackText: input.text?.trim() ? input.text.trim() : null,
    })
    .where(
      and(
        eq(queryAnalytics.chatId, input.chatId),
        eq(queryAnalytics.messageId, input.messageId),
      ),
    )
    .execute();
};

export const validateFeedbackOwnership = async (
  input: Pick<FeedbackInput, 'chatId' | 'messageId'>,
  actor: RequestActor,
  options: { requireActorMatch?: boolean } = { requireActorMatch: true },
) => {
  const message = await db.query.messages.findFirst({
    where: and(
      eq(messages.chatId, input.chatId),
      eq(messages.messageId, input.messageId),
    ),
  });

  if (!message) {
    return { ok: false as const, status: 404, message: 'Message not found' };
  }

  if (message.status !== 'completed') {
    return {
      ok: false as const,
      status: 409,
      message: 'Feedback can only be recorded for completed answers',
    };
  }

  const analyticsRow = await db.query.queryAnalytics.findFirst({
    where: and(
      eq(queryAnalytics.chatId, input.chatId),
      eq(queryAnalytics.messageId, input.messageId),
    ),
  });

  if (!analyticsRow) {
    return {
      ok: false as const,
      status: 404,
      message: 'Analytics record not found',
    };
  }

  if (
    options.requireActorMatch !== false &&
    analyticsRow.userId &&
    analyticsRow.userId !== actor.userId
  ) {
    return { ok: false as const, status: 403, message: 'Forbidden' };
  }

  if (
    options.requireActorMatch !== false &&
    analyticsRow.organizationId &&
    analyticsRow.organizationId !== actor.organizationId
  ) {
    return { ok: false as const, status: 403, message: 'Forbidden' };
  }

  return { ok: true as const };
};
