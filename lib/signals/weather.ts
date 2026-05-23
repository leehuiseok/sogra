export type WeatherSignal = {
  temperatureC: number;
  condition: 'clear' | 'rain' | 'snow' | 'cloudy' | 'heat' | 'cold' | 'unknown';
  raw: string;
};

const UNKNOWN: WeatherSignal = { temperatureC: 0, condition: 'unknown', raw: 'no_api_key' };

export async function getWeatherSignal(city: string = 'Seoul'): Promise<WeatherSignal> {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) return UNKNOWN;

  let data: Record<string, unknown>;
  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric&lang=kr`,
    );
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    return { temperatureC: 0, condition: 'unknown', raw: 'fetch_error' };
  }

  const weatherArr = data['weather'] as Array<{ main: string }> | undefined;
  const mainData = data['main'] as { temp?: number } | undefined;
  const tempC = mainData?.temp ?? 0;
  const rawMain = weatherArr?.[0]?.main ?? 'unknown';

  let condition: WeatherSignal['condition'];
  if (tempC >= 30) {
    condition = 'heat';
  } else if (tempC <= 0) {
    condition = 'cold';
  } else if (rawMain === 'Rain' || rawMain === 'Drizzle' || rawMain === 'Thunderstorm') {
    condition = 'rain';
  } else if (rawMain === 'Snow') {
    condition = 'snow';
  } else if (rawMain === 'Clear') {
    condition = 'clear';
  } else if (rawMain === 'Clouds') {
    condition = 'cloudy';
  } else {
    condition = 'unknown';
  }

  return { temperatureC: tempC, condition, raw: rawMain };
}
