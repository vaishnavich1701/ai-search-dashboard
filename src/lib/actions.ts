export const getSuggestions = async (chatHistory: [string, string][]) => {
  const chatModel = localStorage.getItem('chatModelKey');
  const chatModelProvider = localStorage.getItem('chatModelProviderId');

  const res = await fetch(`/api/suggestions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chatHistory,
      chatModel: {
        providerId: chatModelProvider,
        key: chatModel,
      },
    }),
  });

  const data = (await res.json()) as { suggestions: string[] };

  return data.suggestions;
};

export const getApproxLocation = async () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6 * 1000);

  const res = await fetch('https://free.freeipapi.com/api/json', {
    method: 'GET',
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));

  const data = await res.json();

  let area = data.zipCode || data.postalCode || data.locality || null;

  if (data.latitude && data.longitude) {
    const reverseController = new AbortController();
    const reverseTimeout = setTimeout(
      () => reverseController.abort(),
      3 * 1000,
    );

    try {
      const reverseRes = await fetch(
        `https://api-bdc.io/data/reverse-geocode-client?latitude=${data.latitude}&longitude=${data.longitude}&localityLanguage=en`,
        { signal: reverseController.signal },
      );

      if (reverseRes.ok) {
        const reverse = await reverseRes.json();
        const neighborhood = reverse.localityInfo?.informative?.find(
          (item: { description?: string }) =>
            item.description === 'neighbourhood' ||
            item.description === 'suburb' ||
            item.description === 'county',
        )?.name;
        area = neighborhood || reverse.locality || reverse.postcode || area;
      }
    } catch {
      // Keep the original IP-derived location if reverse geocoding is unavailable.
    } finally {
      clearTimeout(reverseTimeout);
    }
  }

  return {
    latitude: data.latitude,
    longitude: data.longitude,
    area,
    city: data.cityName,
    region: data.regionName,
    country: data.countryCode || data.countryName,
    timezone: data.timeZone,
    source: 'freeipapi',
  };
};
