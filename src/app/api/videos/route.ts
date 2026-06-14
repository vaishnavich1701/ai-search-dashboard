import handleVideoSearch from '@/lib/agents/media/video';
import ModelRegistry from '@/lib/models/registry';
import { ModelWithProvider } from '@/lib/models/types';

const getMediaSearchErrorMessage = (err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);

  if (message.toLowerCase().includes('rate limit')) {
    return `Rate limit reached for the selected model/provider. Please try again in a few seconds or choose another model. Details: ${message}`;
  }

  return message || 'An error occurred while searching media';
};

interface VideoSearchBody {
  query: string;
  chatHistory: any[];
  chatModel: ModelWithProvider;
}

export const POST = async (req: Request) => {
  try {
    const body: VideoSearchBody = await req.json();

    const registry = new ModelRegistry();

    const llm = await registry.loadChatModel(
      body.chatModel.providerId,
      body.chatModel.key,
    );

    const videos = await handleVideoSearch(
      {
        chatHistory: body.chatHistory.map(([role, content]) => ({
          role: role === 'human' ? 'user' : 'assistant',
          content,
        })),
        query: body.query,
      },
      llm,
    );

    return Response.json({ videos }, { status: 200 });
  } catch (err) {
    const message = getMediaSearchErrorMessage(err);
    console.error(`An error occurred while searching videos: ${err}`);
    return Response.json(
      { message, error: { code: 'MEDIA_SEARCH_FAILED', message } },
      { status: 500 },
    );
  }
};
