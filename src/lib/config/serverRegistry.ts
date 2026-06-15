import configManager from './index';
import { ConfigModelProvider } from './types';

export const getConfiguredModelProviders = (): ConfigModelProvider[] => {
  return configManager.getConfig('modelProviders', []);
};

export const getConfiguredModelProviderById = (
  id: string,
): ConfigModelProvider | undefined => {
  return getConfiguredModelProviders().find((p) => p.id === id) ?? undefined;
};

export const getSearxngURL = () => {
  const configuredURL = configManager.getConfig('search.searxngURL', '');
  const url =
    process.env.SEARXNG_API_URL || configuredURL || 'http://localhost:8080';

  return url.replace(/\/+$/, '');
};
