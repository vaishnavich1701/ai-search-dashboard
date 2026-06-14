import searchImages from '@/lib/agents/media/image';
import ModelRegistry from '@/lib/models/registry';
import { ModelWithProvider } from '@/lib/models/types';

const getMediaSearchErrorMessage = (err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);

  if (message.toLowerCase().includes('rate limit')) {
    return `Rate limit reached for the selected model/provider. Please try again in a few seconds or choose another model. Details: ${message}`;
  }

  return message || 'An error occurred while searching media';
};

interface ImageSearchBody {
  query: string;
  chatHistory: any[];
  chatModel: ModelWithProvider;
}

export const POST = async (req: Request) => {
  try {
    const body: ImageSearchBody = await req.json();

    const registry = new ModelRegistry();

    const llm = await registry.loadChatModel(
      body.chatModel.providerId,
      body.chatModel.key,
    );

    const images = await searchImages(
      {
        chatHistory: body.chatHistory.map(([role, content]) => ({
          role: role === 'human' ? 'user' : 'assistant',
          content,
        })),
        query: body.query,
      },
      llm,
    );

    return Response.json({ images }, { status: 200 });
  } catch (err) {
    const message = getMediaSearchErrorMessage(err);
    console.error(`An error occurred while searching images: ${err}`);
    return Response.json(
      { message, error: { code: 'MEDIA_SEARCH_FAILED', message } },
      { status: 500 },
    );
  }
};
