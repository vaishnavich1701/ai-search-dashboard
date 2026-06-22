import { ResearcherOutput, SearchAgentInput } from './types';
import SessionManager from '@/lib/session';
import { classify } from './classifier';
import Researcher from './researcher';
import { getWriterPrompt } from '@/lib/prompts/search/writer';
import { WidgetExecutor } from './widgets';
import db from '@/lib/db';
import { messages } from '@/lib/db/schema';
import { and, eq, gt } from 'drizzle-orm';
import { Block, Chunk, TextBlock } from '@/lib/types';
import { recordQueryAnalytics } from '@/lib/analytics';
import {
  buildGroundedFallbackAnswer,
  buildGroundedSearchContext,
  countInlineCitations,
  sourceDebugSummary,
} from './grounding';

const getErrorMessage = (err: unknown) =>
  err instanceof Error ? err.message : String(err || 'Unknown chat error');

const logQueryRuntime = (
  message: string,
  metadata?: Record<string, unknown>,
) => {
  if (process.env.NODE_ENV === 'production') return;
  console.info(`[query] ${message}`, metadata ?? '');
};

const getSourceMetadata = (blocks: Block[]): Chunk[] => {
  const sourceBlocks = blocks
    .filter(
      (block): block is Extract<Block, { type: 'source' }> =>
        block.type === 'source',
    )
    .flatMap((block) => (Array.isArray(block.data) ? block.data : []));

  if (sourceBlocks.length > 0) return sourceBlocks;

  return blocks.flatMap((block) => {
    if (block.type !== 'research') return [];

    return block.data.subSteps.flatMap((step) => {
      if (step.type === 'search_results') return step.reading;
      if (step.type === 'upload_search_results') return step.results;
      return [];
    });
  });
};

const ensureSourceBlock = (blocks: Block[], sources: Chunk[]): Block[] => {
  if (sources.length === 0) return blocks;

  const hasSourceBlock = blocks.some(
    (block) => block.type === 'source' && Array.isArray(block.data),
  );

  if (hasSourceBlock) return blocks;

  return [
    ...blocks,
    {
      id: crypto.randomUUID(),
      type: 'source',
      data: sources,
    },
  ];
};

class SearchAgent {
  async searchAsync(session: SessionManager, input: SearchAgentInput) {
    const analyticsStartedAt = input.analytics?.startedAt ?? new Date();
    let retrievedSources: Chunk[] = [];

    logQueryRuntime('query started', {
      query: input.followUp,
      model: input.analytics?.model,
      provider: input.analytics?.provider,
    });
    const exists = await db.query.messages.findFirst({
      where: and(
        eq(messages.chatId, input.chatId),
        eq(messages.messageId, input.messageId),
      ),
    });

    if (!exists) {
      await db.insert(messages).values({
        chatId: input.chatId,
        messageId: input.messageId,
        backendId: session.id,
        query: input.followUp,
        createdAt: new Date().toISOString(),
        status: 'answering',
        responseBlocks: [],
      });
    } else {
      await db
        .delete(messages)
        .where(
          and(eq(messages.chatId, input.chatId), gt(messages.id, exists.id)),
        )
        .execute();
      await db
        .update(messages)
        .set({
          status: 'answering',
          backendId: session.id,
          responseBlocks: [],
        })
        .where(
          and(
            eq(messages.chatId, input.chatId),
            eq(messages.messageId, input.messageId),
          ),
        )
        .execute();
    }

    try {
      const classification = await classify({
        chatHistory: input.chatHistory,
        enabledSources: input.config.sources,
        query: input.followUp,
        llm: input.config.llm,
      });

      const widgetPromise = WidgetExecutor.executeAll({
        classification,
        chatHistory: input.chatHistory,
        followUp: input.followUp,
        llm: input.config.llm,
      }).then((widgetOutputs) => {
        widgetOutputs.forEach((o) => {
          session.emitBlock({
            id: crypto.randomUUID(),
            type: 'widget',
            data: {
              widgetType: o.type,
              params: o.data,
            },
          });
        });
        return widgetOutputs;
      });

      let searchPromise: Promise<ResearcherOutput> | null = null;

      if (!classification.classification.skipSearch) {
        const researcher = new Researcher();
        logQueryRuntime('search started', { query: input.followUp });
        searchPromise = researcher
          .research(session, {
            chatHistory: input.chatHistory,
            followUp: input.followUp,
            classification: classification,
            config: input.config,
          })
          .catch((err) => {
            logQueryRuntime('search failed', {
              query: input.followUp,
              error: getErrorMessage(err),
            });
            throw err;
          });
      }

      const [widgetOutputs, searchResults] = await Promise.all([
        widgetPromise,
        searchPromise,
      ]);

      session.emit('data', {
        type: 'researchComplete',
      });

      const searchWasAttempted = searchPromise !== null;
      retrievedSources = searchResults?.searchFindings ?? [];
      if (searchWasAttempted) {
        logQueryRuntime('search succeeded', {
          query: input.followUp,
          sourceCount: retrievedSources.length,
        });
      }
      let finalContext = searchWasAttempted
        ? '<Search was attempted but returned no usable text results. Do not answer from stale general knowledge for current/source-backed questions; use the no-results fallback instead.>'
        : '<Search not made because the query was classified as answerable without web results. Answer from general knowledge and do not use the no-results fallback solely because search was skipped.>';

      if (
        searchWasAttempted &&
        (!searchResults || searchResults.searchFindings.length === 0)
      ) {
        logQueryRuntime('search failed', {
          query: input.followUp,
          error: 'Search completed but returned no usable sources.',
        });
        throw new Error(
          'Search completed but returned no usable sources. Try rephrasing the query or selecting another source.',
        );
      }

      let sourceContextLength = 0;
      let generatedWithSourceContext = false;

      if (searchResults && searchResults.searchFindings.length > 0) {
        const groundedContext = buildGroundedSearchContext(
          searchResults.searchFindings,
        );
        finalContext = groundedContext.context;
        sourceContextLength = groundedContext.length;
        generatedWithSourceContext = groundedContext.sourceCount > 0;

        logQueryRuntime('search grounding context prepared', {
          query: input.followUp,
          retrievedSourceCount: searchResults.searchFindings.length,
          contextSourceCount: groundedContext.sourceCount,
          topSources: sourceDebugSummary(searchResults.searchFindings),
          sourceContextLength,
        });
      }

      const widgetContext = widgetOutputs
        .map((o) => {
          return `<result>${o.llmContext}</result>`;
        })
        .join('\n-------------\n');

      const finalContextWithWidgets = `<search_results note="These are the search results and assistant can cite these">\n${finalContext}\n</search_results>\n<widgets_result noteForAssistant="Its output is already showed to the user, assistant can use this information to answer the query but do not CITE this as a souce">\n${widgetContext}\n</widgets_result>`;

      const writerPrompt = getWriterPrompt(
        finalContextWithWidgets,
        input.config.systemInstructions,
        input.config.mode,
      );

      logQueryRuntime('generation started', {
        model: input.analytics?.model,
        provider: input.analytics?.provider,
        retrievedSourceCount: retrievedSources.length,
        sourceContextLength,
        generatedWithSourceContext,
      });

      const answerStream = input.config.llm.streamText({
        messages: [
          {
            role: 'system',
            content: writerPrompt,
          },
          ...input.chatHistory,
          {
            role: 'user',
            content: input.followUp,
          },
        ],
      });

      let responseBlockId = '';

      for await (const chunk of answerStream) {
        if (!responseBlockId) {
          const block: TextBlock = {
            id: crypto.randomUUID(),
            type: 'text',
            data: chunk.contentChunk,
          };

          session.emitBlock(block);

          responseBlockId = block.id;
        } else {
          const block = session.getBlock(responseBlockId) as TextBlock | null;

          if (!block) {
            continue;
          }

          block.data += chunk.contentChunk;

          session.updateBlock(block.id, [
            {
              op: 'replace',
              path: '/data',
              value: block.data,
            },
          ]);
        }
      }

      const currentBlocks = session.getAllBlocks();
      const answerBlock = responseBlockId
        ? (session.getBlock(responseBlockId) as TextBlock | null)
        : null;
      const finalInlineCitationCount = countInlineCitations(
        answerBlock?.data ?? '',
      );

      if (
        generatedWithSourceContext &&
        retrievedSources.length > 0 &&
        finalInlineCitationCount === 0
      ) {
        const fallbackAnswer = buildGroundedFallbackAnswer(
          input.followUp,
          retrievedSources,
        );

        logQueryRuntime('ungrounded answer fallback applied', {
          query: input.followUp,
          retrievedSourceCount: retrievedSources.length,
          sourceContextLength,
          finalCitationCount: finalInlineCitationCount,
        });

        if (answerBlock) {
          answerBlock.data = fallbackAnswer;
          session.updateBlock(answerBlock.id, [
            {
              op: 'replace',
              path: '/data',
              value: fallbackAnswer,
            },
          ]);
        } else {
          session.emitBlock({
            id: crypto.randomUUID(),
            type: 'text',
            data: fallbackAnswer,
          });
        }
      }

      if (
        getSourceMetadata(currentBlocks).length === 0 &&
        retrievedSources.length > 0
      ) {
        session.emitBlock({
          id: crypto.randomUUID(),
          type: 'source',
          data: retrievedSources,
        });
      }

      const responseBlocks = ensureSourceBlock(
        session.getAllBlocks(),
        retrievedSources.length > 0
          ? retrievedSources
          : getSourceMetadata(session.getAllBlocks()),
      );
      const attachedSources = getSourceMetadata(responseBlocks);

      session.emit('end', {});

      logQueryRuntime('generation succeeded', {
        query: input.followUp,
        retrievedSourceCount: retrievedSources.length,
        attachedSourceCount: attachedSources.length,
        sourceContextLength,
        generatedWithSourceContext,
        finalCitationCount: countInlineCitations(
          responseBlocks
            .filter((block): block is TextBlock => block.type === 'text')
            .map((block) => block.data)
            .join('\n'),
        ),
      });

      await db
        .update(messages)
        .set({
          status: 'completed',
          responseBlocks,
        })
        .where(
          and(
            eq(messages.chatId, input.chatId),
            eq(messages.messageId, input.messageId),
          ),
        )
        .execute();

      recordQueryAnalytics({
        queryText: input.followUp,
        model: input.analytics?.model,
        provider: input.analytics?.provider,
        status: 'success',
        startedAt: analyticsStartedAt,
        completedAt: new Date(),
        responseBlocks,
        responseId: session.id,
        messageId: input.messageId,
        chatId: input.chatId,
        userId: input.analytics?.userId,
        organizationId: input.analytics?.organizationId,
        optimizationMode: input.analytics?.optimizationMode,
        sources:
          getSourceMetadata(responseBlocks).length > 0
            ? getSourceMetadata(responseBlocks)
            : input.analytics?.sources,
        location: input.analytics?.location,
        userAgent: input.analytics?.userAgent,
      })
        .then(() => {
          logQueryRuntime('query log saved', {
            query: input.followUp,
            status: 'success',
          });
        })
        .catch((analyticsErr) => {
          console.error(
            'Failed to record successful query analytics:',
            analyticsErr,
          );
          logQueryRuntime('query log failed', {
            query: input.followUp,
            status: 'success',
          });
        });
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      logQueryRuntime('generation failed', {
        query: input.followUp,
        model: input.analytics?.model,
        provider: input.analytics?.provider,
        error: errorMessage,
      });
      const currentErrorBlocks = session.getAllBlocks();
      if (
        getSourceMetadata(currentErrorBlocks).length === 0 &&
        retrievedSources.length > 0
      ) {
        session.emitBlock({
          id: crypto.randomUUID(),
          type: 'source',
          data: retrievedSources,
        });
      }

      const existingBlocks = ensureSourceBlock(
        session.getAllBlocks(),
        retrievedSources.length > 0
          ? retrievedSources
          : getSourceMetadata(session.getAllBlocks()),
      );
      const hasReadableError = existingBlocks.some(
        (block) => block.type === 'text' && block.data.trim().length > 0,
      );
      const responseBlocks: Block[] = hasReadableError
        ? existingBlocks
        : [
            ...existingBlocks,
            {
              id: crypto.randomUUID(),
              type: 'text',
              data: errorMessage,
            },
          ];

      if (!hasReadableError) {
        session.emitBlock(responseBlocks[responseBlocks.length - 1]);
      }

      await db
        .update(messages)
        .set({
          status: 'error',
          responseBlocks,
        })
        .where(
          and(
            eq(messages.chatId, input.chatId),
            eq(messages.messageId, input.messageId),
          ),
        )
        .execute()
        .catch((updateErr) => {
          console.error('Failed to persist errored message:', updateErr);
        });

      await recordQueryAnalytics({
        queryText: input.followUp,
        model: input.analytics?.model,
        provider: input.analytics?.provider,
        status: 'error',
        errorMessage,
        startedAt: analyticsStartedAt,
        completedAt: new Date(),
        responseBlocks,
        responseId: session.id,
        messageId: input.messageId,
        chatId: input.chatId,
        userId: input.analytics?.userId,
        organizationId: input.analytics?.organizationId,
        optimizationMode: input.analytics?.optimizationMode,
        sources:
          getSourceMetadata(responseBlocks).length > 0
            ? getSourceMetadata(responseBlocks)
            : input.analytics?.sources,
        location: input.analytics?.location,
        userAgent: input.analytics?.userAgent,
      })
        .then(() => {
          logQueryRuntime('query log saved', {
            query: input.followUp,
            status: 'error',
          });
        })
        .catch((analyticsErr) => {
          console.error('Failed to record query analytics:', analyticsErr);
          logQueryRuntime('query log failed', {
            query: input.followUp,
            status: 'error',
          });
        });
      throw err;
    }
  }
}

export default SearchAgent;
