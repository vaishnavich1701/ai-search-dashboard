import { UIConfigField } from '@/lib/config/types';
import { getConfiguredModelProviderById } from '@/lib/config/serverRegistry';
import { Model, ModelList, ProviderMetadata } from '../../types';
import BaseEmbedding from '../../base/embedding';
import BaseModelProvider from '../../base/provider';
import BaseLLM from '../../base/llm';
import OpenRouterLLM from './openrouterLLM';

interface OpenRouterConfig {
  apiKey: string;
  baseURL: string;
  httpReferer?: string;
  xTitle?: string;
}

const providerConfigFields: UIConfigField[] = [
  {
    type: 'password',
    name: 'API Key',
    key: 'apiKey',
    description: 'Your OpenRouter API key',
    required: true,
    placeholder: 'OpenRouter API Key',
    env: 'OPENROUTER_API_KEY',
    scope: 'server',
  },
  {
    type: 'string',
    name: 'Base URL',
    key: 'baseURL',
    description: 'The base URL for the OpenRouter OpenAI-compatible API',
    required: true,
    placeholder: 'OpenRouter Base URL',
    default: 'https://openrouter.ai/api/v1',
    env: 'OPENROUTER_BASE_URL',
    scope: 'server',
  },
  {
    type: 'string',
    name: 'HTTP Referer',
    key: 'httpReferer',
    description: 'Optional HTTP-Referer header sent to OpenRouter',
    required: false,
    placeholder: 'https://your-app.example.com',
    env: 'OPENROUTER_HTTP_REFERER',
    scope: 'server',
  },
  {
    type: 'string',
    name: 'X-Title',
    key: 'xTitle',
    description: 'Optional X-Title header sent to OpenRouter',
    required: false,
    placeholder: 'Vane',
    env: 'OPENROUTER_X_TITLE',
    scope: 'server',
  },
];

class OpenRouterProvider extends BaseModelProvider<OpenRouterConfig> {
  constructor(id: string, name: string, config: OpenRouterConfig) {
    super(id, name, config);
  }

  private getOptionalHeaders(): Record<string, string> {
    return {
      ...(this.config.httpReferer
        ? { 'HTTP-Referer': this.config.httpReferer }
        : {}),
      ...(this.config.xTitle ? { 'X-Title': this.config.xTitle } : {}),
    };
  }

  async getDefaultModels(): Promise<ModelList> {
    const res = await fetch(
      `${this.config.baseURL.replace(/\/+$/, '')}/models`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
          ...this.getOptionalHeaders(),
        },
      },
    );

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(
        `Error Loading OpenRouter Models. ${res.status} ${res.statusText}${errorText ? `: ${errorText}` : ''}`,
      );
    }

    const data = await res.json();
    const defaultChatModels: Model[] = [];

    if (Array.isArray(data.data)) {
      data.data.forEach((m: any) => {
        if (m?.id) {
          defaultChatModels.push({
            key: String(m.id),
            name: String(m.name || m.id),
          });
        }
      });
    }

    return {
      embedding: [],
      chat: defaultChatModels,
    };
  }

  async getModelList(): Promise<ModelList> {
    const defaultModels = await this.getDefaultModels();
    const configProvider = getConfiguredModelProviderById(this.id)!;

    return {
      embedding: [
        ...defaultModels.embedding,
        ...configProvider.embeddingModels,
      ],
      chat: [...defaultModels.chat, ...configProvider.chatModels],
    };
  }

  async loadChatModel(key: string): Promise<BaseLLM<any>> {
    const modelList = await this.getModelList();
    const exists = modelList.chat.find((m) => m.key === key);

    if (!exists) {
      throw new Error(
        'Error Loading OpenRouter Chat Model. Invalid or missing model/router slug selected. Add or select an OpenRouter model/router slug in Settings → Connections.',
      );
    }

    return new OpenRouterLLM({
      apiKey: this.config.apiKey,
      model: key,
      baseURL: this.config.baseURL,
      defaultHeaders: this.getOptionalHeaders(),
      structuredOutputMode: 'prompted-json',
    });
  }

  async loadEmbeddingModel(key: string): Promise<BaseEmbedding<any>> {
    throw new Error('OpenRouter Provider does not support embedding models.');
  }

  static parseAndValidate(raw: any): OpenRouterConfig {
    if (!raw || typeof raw !== 'object')
      throw new Error('Invalid config provided. Expected object');
    if (!raw.apiKey)
      throw new Error('Invalid config provided. API key must be provided');

    return {
      apiKey: String(raw.apiKey),
      baseURL: raw.baseURL
        ? String(raw.baseURL).replace(/\/+$/, '')
        : 'https://openrouter.ai/api/v1',
      httpReferer: raw.httpReferer ? String(raw.httpReferer) : undefined,
      xTitle: raw.xTitle ? String(raw.xTitle) : undefined,
    };
  }

  static getProviderConfigFields(): UIConfigField[] {
    return providerConfigFields;
  }

  static getProviderMetadata(): ProviderMetadata {
    return {
      key: 'openrouter',
      name: 'OpenRouter',
    };
  }
}

export default OpenRouterProvider;
