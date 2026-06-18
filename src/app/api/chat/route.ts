import { z } from 'zod';
import ModelRegistry from '@/lib/models/registry';
import { ModelWithProvider } from '@/lib/models/types';
import SearchAgent from '@/lib/agents/search';
import SessionManager from '@/lib/session';
import { ChatTurnMessage } from '@/lib/types';
import { SearchSources } from '@/lib/agents/search/types';
import db from '@/lib/db';
import { and, eq } from 'drizzle-orm';
import { chats, messages } from '@/lib/db/schema';
import UploadManager from '@/lib/uploads/manager';
import { getTrustedRequestActor } from '@/lib/requestActor';
import { recordQueryAnalytics } from '@/lib/analytics';
import { getConfiguredModelProviderById } from '@/lib/config/serverRegistry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const messageSchema = z.object({
  messageId: z.string().min(1, 'Message ID is required'),
  chatId: z.string().min(1, 'Chat ID is required'),
  content: z.string().min(1, 'Message content is required'),
});

const chatModelSchema: z.ZodType<ModelWithProvider> = z.object({
  providerId: z.string({ message: 'Chat model provider id must be provided' }),
  key: z.string({ message: 'Chat model key must be provided' }),
});

const embeddingModelSchema: z.ZodType<ModelWithProvider> = z.object({
  providerId: z.string({
    message: 'Embedding model provider id must be provided',
  }),
  key: z.string({ message: 'Embedding model key must be provided' }),
});

const analyticsLocationSchema = z.object({
  city: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  timezone: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
});

const bodySchema = z.object({
  message: messageSchema,
  optimizationMode: z.enum(['speed', 'balanced', 'quality'], {
    message: 'Optimization mode must be one of: speed, balanced, quality',
  }),
  sources: z.array(z.string()).optional().default([]),
  history: z
    .array(z.tuple([z.string(), z.string()]))
    .optional()
    .default([]),
  files: z.array(z.string()).optional().default([]),
  chatModel: chatModelSchema,
  embeddingModel: embeddingModelSchema,
  systemInstructions: z.string().nullable().optional().default(''),
  analyticsLocation: analyticsLocationSchema.nullable().optional(),
});

type Body = z.infer<typeof bodySchema>;

const normalizeProviderError = (err: unknown) => {
  const rawMessage = err instanceof Error ? err.message : String(err);
  const message =
    rawMessage || 'An error occurred while processing chat request';
  const lower = message.toLowerCase();

  if (
    lower.includes('only supports chat') ||
    lower.includes('unsupported model') ||
    lower.includes('model not compatible') ||
    lower.includes('does not support chat') ||
    lower.includes('provider does not support')
  ) {
    return {
      code: 'MODEL_UNSUPPORTED',
      message:
        'This model only supports Chat Completions. Please select a supported chat model or update your provider settings.',
      details: message,
    };
  }

  return {
    code: 'CHAT_REQUEST_FAILED',
    message,
  };
};

const getHeaderLocation = (req: Request) => {
  const city = req.headers.get('x-vercel-ip-city');
  const region = req.headers.get('x-vercel-ip-country-region');
  const country =
    req.headers.get('x-vercel-ip-country') || req.headers.get('cf-ipcountry');
  const latitude = Number(req.headers.get('x-vercel-ip-latitude'));
  const longitude = Number(req.headers.get('x-vercel-ip-longitude'));
  const timezone = req.headers.get('x-vercel-ip-timezone');

  if (!city && !region && !country && !Number.isFinite(latitude)) return null;

  return {
    city: city ? decodeURIComponent(city) : null,
    region: region ? decodeURIComponent(region) : null,
    country: country || null,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    timezone: timezone || null,
    source: 'request-headers',
  };
};

const safeValidateBody = (data: unknown) => {
  const result = bodySchema.safeParse(data);

  if (!result.success) {
    return {
      success: false,
      error: result.error.issues.map((e: any) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    };
  }

  return {
    success: true,
    data: result.data,
  };
};

const getProviderAnalyticsKey = (providerId: string) =>
  getConfiguredModelProviderById(providerId)?.type ?? providerId;

const ensureChatExists = async (input: {
  id: string;
  sources: SearchSources[];
  query: string;
  fileIds: string[];
}) => {
  try {
    const exists = await db.query.chats
      .findFirst({
        where: eq(chats.id, input.id),
      })
      .execute();

    if (!exists) {
      await db.insert(chats).values({
        id: input.id,
        createdAt: new Date().toISOString(),
        sources: input.sources,
        title: input.query,
        files: input.fileIds.map((id) => {
          return {
            fileId: id,
            name: UploadManager.getFile(id)?.name || 'Uploaded File',
          };
        }),
      });
    }
  } catch (err) {
    console.error('Failed to check/save chat:', err);
  }
};

export const POST = async (req: Request) => {
  let bodyForErrorLogging: Body | null = null;
  const requestStartedAt = new Date();

  try {
    const reqBody = (await req.json()) as Body;

    const parseBody = safeValidateBody(reqBody);

    if (!parseBody.success) {
      return Response.json(
        { message: 'Invalid request body', error: parseBody.error },
        { status: 400 },
      );
    }

    const body = parseBody.data as Body;
    bodyForErrorLogging = body;
    const { message } = body;

    if (message.content === '') {
      return Response.json(
        {
          message: 'Please provide a message to process',
        },
        { status: 400 },
      );
    }

    const registry = new ModelRegistry();

    const analyticsProvider = getProviderAnalyticsKey(
      body.chatModel.providerId,
    );

    const [llm, embedding] = await Promise.all([
      registry.loadChatModel(body.chatModel.providerId, body.chatModel.key),
      registry.loadEmbeddingModel(
        body.embeddingModel.providerId,
        body.embeddingModel.key,
      ),
    ]);

    const history: ChatTurnMessage[] = body.history.map((msg) => {
      if (msg[0] === 'human') {
        return {
          role: 'user',
          content: msg[1],
        };
      } else {
        return {
          role: 'assistant',
          content: msg[1],
        };
      }
    });

    const agent = new SearchAgent();
    const session = SessionManager.createSession();
    const requestActor = getTrustedRequestActor(req);
    const requestLocation = body.analyticsLocation || getHeaderLocation(req);

    const responseStream = new TransformStream();
    const writer = responseStream.writable.getWriter();
    const encoder = new TextEncoder();

    const disconnect = session.subscribe((event: string, data: any) => {
      if (event === 'data') {
        if (data.type === 'block') {
          writer.write(
            encoder.encode(
              JSON.stringify({
                type: 'block',
                block: data.block,
              }) + '\n',
            ),
          );
        } else if (data.type === 'updateBlock') {
          writer.write(
            encoder.encode(
              JSON.stringify({
                type: 'updateBlock',
                blockId: data.blockId,
                patch: data.patch,
              }) + '\n',
            ),
          );
        } else if (data.type === 'researchComplete') {
          writer.write(
            encoder.encode(
              JSON.stringify({
                type: 'researchComplete',
              }) + '\n',
            ),
          );
        }
      } else if (event === 'end') {
        writer.write(
          encoder.encode(
            JSON.stringify({
              type: 'messageEnd',
            }) + '\n',
          ),
        );
        writer.close();
        session.removeAllListeners();
      } else if (event === 'error') {
        writer.write(
          encoder.encode(
            JSON.stringify({
              type: 'error',
              data: data.data,
            }) + '\n',
          ),
        );
        writer.close();
        session.removeAllListeners();
      }
    });

    agent
      .searchAsync(session, {
        chatHistory: history,
        followUp: message.content,
        chatId: body.message.chatId,
        messageId: body.message.messageId,
        analytics: {
          startedAt: new Date(),
          provider: analyticsProvider,
          model: body.chatModel.key,
          userId: requestActor.userId,
          organizationId: requestActor.organizationId,
          optimizationMode: body.optimizationMode,
          sources: body.sources,
          location: requestLocation,
        },
        config: {
          llm,
          embedding: embedding,
          sources: body.sources as SearchSources[],
          mode: body.optimizationMode,
          fileIds: body.files,
          systemInstructions: body.systemInstructions || 'None',
        },
      })
      .catch(async (err) => {
        const providerError = normalizeProviderError(err);
        console.error('Search agent failed:', err);
        session.emit('error', {
          data: providerError.message,
          error: providerError,
        });

        await db
          .update(messages)
          .set({ status: 'error' })
          .where(
            and(
              eq(messages.chatId, body.message.chatId),
              eq(messages.messageId, body.message.messageId),
            ),
          )
          .execute()
          .catch((updateErr) => {
            console.error('Failed to mark errored message:', updateErr);
          });
      });

    ensureChatExists({
      id: body.message.chatId,
      sources: body.sources as SearchSources[],
      fileIds: body.files,
      query: body.message.content,
    });

    req.signal.addEventListener('abort', () => {
      disconnect();
      writer.close();
    });

    return new Response(responseStream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache, no-transform',
      },
    });
  } catch (err) {
    const providerError = normalizeProviderError(err);
    console.error('An error occurred while processing chat request:', err);

    if (bodyForErrorLogging) {
      const requestActor = getTrustedRequestActor(req);
      await recordQueryAnalytics({
        queryText: bodyForErrorLogging.message.content,
        model: bodyForErrorLogging.chatModel.key,
        provider: getProviderAnalyticsKey(
          bodyForErrorLogging.chatModel.providerId,
        ),
        status: 'error',
        errorMessage:
          'details' in providerError
            ? providerError.details
            : providerError.message,
        startedAt: requestStartedAt,
        completedAt: new Date(),
        messageId: bodyForErrorLogging.message.messageId,
        chatId: bodyForErrorLogging.message.chatId,
        userId: requestActor.userId,
        organizationId: requestActor.organizationId,
        optimizationMode: bodyForErrorLogging.optimizationMode,
        sources: bodyForErrorLogging.sources,
        location:
          bodyForErrorLogging.analyticsLocation || getHeaderLocation(req),
      }).catch((analyticsErr) => {
        console.error(
          'Failed to record chat request error analytics:',
          analyticsErr,
        );
      });
    }

    return Response.json(
      { message: providerError.message, error: providerError },
      { status: providerError.code === 'MODEL_UNSUPPORTED' ? 400 : 500 },
    );
  }
};
