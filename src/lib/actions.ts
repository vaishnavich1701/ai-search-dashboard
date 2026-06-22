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

type AnalyticsLocation = {
  latitude?: number | null;
  longitude?: number | null;
  area?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  timezone?: string | null;
  source?: string | null;
};

const reverseGeocode = async (
  latitude?: number | null,
  longitude?: number | null,
) => {
  if (!latitude || !longitude) return null;

  const reverseController = new AbortController();
  const reverseTimeout = setTimeout(() => reverseController.abort(), 3 * 1000);

  try {
    const reverseRes = await fetch(
      `https://api-bdc.io/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`,
      { signal: reverseController.signal },
    );

    if (!reverseRes.ok) return null;
    const reverse = await reverseRes.json();
    const neighborhood = reverse.localityInfo?.informative?.find(
      (item: { description?: string }) =>
        item.description === 'neighbourhood' ||
        item.description === 'suburb' ||
        item.description === 'county' ||
        item.description === 'postcode',
    )?.name;

    return {
      area: neighborhood || reverse.locality || reverse.postcode || null,
      city: reverse.city || reverse.locality || reverse.principalSubdivision,
      region: reverse.principalSubdivision,
      country: reverse.countryCode || reverse.countryName,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(reverseTimeout);
  }
};

const getPreciseBrowserLocation =
  async (): Promise<AnalyticsLocation | null> => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return null;

    const permission = await navigator.permissions
      ?.query({ name: 'geolocation' as PermissionName })
      .catch(() => null);

    // Avoid surprising users with a fresh permission prompt during query logging.
    if (permission?.state && permission.state !== 'granted') return null;

    const position = await new Promise<GeolocationPosition>(
      (resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          maximumAge: 5 * 60 * 1000,
          timeout: 4 * 1000,
        });
      },
    ).catch(() => null);

    if (!position) return null;

    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;
    const reverse = await reverseGeocode(latitude, longitude);

    return {
      latitude,
      longitude,
      area: reverse?.area ?? null,
      city: reverse?.city ?? null,
      region: reverse?.region ?? null,
      country: reverse?.country ?? null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      source: 'browser-geolocation',
    };
  };

const getIpLocation = async (): Promise<AnalyticsLocation> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6 * 1000);

  const res = await fetch('https://free.freeipapi.com/api/json', {
    method: 'GET',
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));

  const data = await res.json();
  const reverse = await reverseGeocode(data.latitude, data.longitude);

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
    area:
      reverse?.area || data.zipCode || data.postalCode || data.locality || null,
    city: reverse?.city || data.cityName,
    region: reverse?.region || data.regionName,
    country: reverse?.country || data.countryCode || data.countryName,
    timezone: data.timeZone,
    source: 'freeipapi',
  };
};

export const getApproxLocation = async () => {
  const preciseLocation = await getPreciseBrowserLocation();
  return preciseLocation || getIpLocation();
};
