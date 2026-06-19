'use client';

import { Wind } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getApproxLocation } from '@/lib/actions';

type LocationResult = {
  latitude: number;
  longitude: number;
  city: string;
};

const WEATHER_REFRESH_MS = 30 * 1000;
const LOCATION_TIMEOUT_MS = 8 * 1000;
const FETCH_TIMEOUT_MS = 6 * 1000;

const fetchWithTimeout = async (url: string, init?: RequestInit) => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
  }
};

const getBrowserLocation = () =>
  new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is unavailable.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: LOCATION_TIMEOUT_MS,
      maximumAge: 10 * 60 * 1000,
    });
  });

const reverseGeocode = async (position: GeolocationPosition) => {
  const res = await fetchWithTimeout(
    `https://api-bdc.io/data/reverse-geocode-client?latitude=${position.coords.latitude}&longitude=${position.coords.longitude}&localityLanguage=en`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    },
  );

  if (!res.ok) throw new Error('Reverse geocoding failed.');

  const data = await res.json();

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    city:
      data.locality ||
      data.city ||
      data.principalSubdivision ||
      'Current location',
  };
};

const getApproximateLocation = async (): Promise<LocationResult | null> => {
  try {
    const location = await getApproxLocation();

    if (
      typeof location.latitude !== 'number' ||
      typeof location.longitude !== 'number'
    ) {
      return null;
    }

    return {
      latitude: location.latitude,
      longitude: location.longitude,
      city:
        location.city ||
        location.region ||
        location.country ||
        'Current location',
    };
  } catch (err) {
    console.error('Failed to get approximate location', err);
    return null;
  }
};

const getLocation = async (): Promise<LocationResult | null> => {
  if (!navigator.geolocation) return getApproximateLocation();

  try {
    const permission = await navigator.permissions?.query?.({
      name: 'geolocation',
    });

    if (permission?.state === 'denied') return getApproximateLocation();
  } catch (err) {
    console.warn('Unable to query geolocation permission', err);
  }

  try {
    return await reverseGeocode(await getBrowserLocation());
  } catch (err) {
    console.warn(
      'Precise geolocation failed; falling back to approximate location',
      err,
    );
    return getApproximateLocation();
  }
};

const WeatherWidget = () => {
  const [data, setData] = useState({
    temperature: 0,
    condition: '',
    location: '',
    humidity: 0,
    windSpeed: 0,
    icon: '',
    temperatureUnit: 'C',
    windSpeedUnit: 'm/s',
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const updateWeather = async () => {
    setLoading(true);
    setError(false);

    try {
      const location = await getLocation();

      if (!location) {
        setError(true);
        return;
      }

      const res = await fetch(`/api/weather`, {
        method: 'POST',
        body: JSON.stringify({
          lat: location.latitude,
          lng: location.longitude,
          measureUnit: localStorage.getItem('measureUnit') ?? 'Metric',
        }),
      });

      if (!res.ok) {
        console.error('Error fetching weather data');
        setError(true);
        return;
      }

      const weather = await res.json();

      setData({
        temperature: weather.temperature,
        condition: weather.condition,
        location: location.city,
        humidity: weather.humidity,
        windSpeed: weather.windSpeed,
        icon: weather.icon,
        temperatureUnit: weather.temperatureUnit,
        windSpeedUnit: weather.windSpeedUnit,
      });
    } catch (err) {
      console.error('Error updating weather data', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    updateWeather();
    const intervalId = setInterval(updateWeather, WEATHER_REFRESH_MS);
    return () => clearInterval(intervalId);
  }, []);

  return (
    <div className="bg-light-secondary dark:bg-dark-secondary rounded-2xl border border-light-200 dark:border-dark-200 shadow-sm shadow-light-200/10 dark:shadow-black/25 flex flex-row items-center w-full h-24 min-h-[96px] max-h-[96px] px-3 py-2 gap-3">
      {loading ? (
        <>
          <div className="flex flex-col items-center justify-center w-16 min-w-16 max-w-16 h-full animate-pulse">
            <div className="h-10 w-10 rounded-full bg-light-200 dark:bg-dark-200 mb-2" />
            <div className="h-4 w-10 rounded bg-light-200 dark:bg-dark-200" />
          </div>
          <div className="flex flex-col justify-between flex-1 h-full py-1 animate-pulse">
            <div className="flex flex-row items-center justify-between">
              <div className="h-3 w-20 rounded bg-light-200 dark:bg-dark-200" />
              <div className="h-3 w-12 rounded bg-light-200 dark:bg-dark-200" />
            </div>
            <div className="h-3 w-16 rounded bg-light-200 dark:bg-dark-200 mt-1" />
            <div className="flex flex-row justify-between w-full mt-auto pt-1 border-t border-light-200 dark:border-dark-200">
              <div className="h-3 w-16 rounded bg-light-200 dark:bg-dark-200" />
              <div className="h-3 w-8 rounded bg-light-200 dark:bg-dark-200" />
            </div>
          </div>
        </>
      ) : error ? (
        <div className="flex flex-col justify-center w-full h-full text-sm text-black/60 dark:text-white/60">
          <span className="font-semibold text-black dark:text-white">
            Weather unavailable
          </span>
          <span className="text-xs">
            Unable to load your location right now.
          </span>
        </div>
      ) : (
        <>
          <div className="flex flex-col items-center justify-center w-16 min-w-16 max-w-16 h-full">
            <img
              src={`/weather-ico/${data.icon}.svg`}
              alt={data.condition}
              className="h-10 w-auto"
            />
            <span className="text-base font-semibold text-black dark:text-white">
              {data.temperature}°{data.temperatureUnit}
            </span>
          </div>
          <div className="flex flex-col justify-between flex-1 h-full py-2">
            <div className="flex flex-row items-center justify-between">
              <span className="text-sm font-semibold text-black dark:text-white">
                {data.location}
              </span>
              <span className="flex items-center text-xs text-black/60 dark:text-white/60 font-medium">
                <Wind className="w-3 h-3 mr-1" />
                {data.windSpeed} {data.windSpeedUnit}
              </span>
            </div>
            <span className="text-xs text-black/50 dark:text-white/50 italic">
              {data.condition}
            </span>
            <div className="flex flex-row justify-between w-full mt-auto pt-2 border-t border-light-200/50 dark:border-dark-200/50 text-xs text-black/50 dark:text-white/50 font-medium">
              <span>Humidity {data.humidity}%</span>
              <span className="font-semibold text-black/70 dark:text-white/70">
                Now
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default WeatherWidget;
