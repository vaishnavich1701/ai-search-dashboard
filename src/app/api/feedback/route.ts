import { getTrustedRequestActor } from '@/lib/requestActor';
import { validateFeedbackOwnership, writeQueryFeedback } from '@/lib/feedback';
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
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json(
      { message: 'Invalid feedback payload' },
      { status: 400 },
    );
  }

  const ownership = await validateFeedbackOwnership(
    parsed.data,
    getTrustedRequestActor(req),
  );

  if (!ownership.ok) {
    return Response.json(
      { message: ownership.message },
      { status: ownership.status },
    );
  }

  await writeQueryFeedback(parsed.data);

  return Response.json({ ok: true });
};
