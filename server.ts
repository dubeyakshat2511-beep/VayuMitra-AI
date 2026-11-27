import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import fs from 'fs';
import http from 'http';
import type { IncomingMessage } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import { GoogleGenAI, Modality, Type } from '@google/genai';
import type { LiveServerMessage } from '@google/genai';
import type {
  FamilyProfile,
  HourlyAqiPoint,
  LiveAqiData,
  LiveWeatherSnapshot,
  SafeOutdoorWindow,
  SmogActionPlan,
} from './src/types/vayu.ts';
import {
  calculateCombinedParticulateLoad,
  getHouseholdMode,
  isIndividualSoloProfile,
} from './src/utils/exposureCalculator.ts';
import {
  buildFallbackWeatherSnapshot,
  calculateFogHazard,
  estimateDewPointC,
} from './src/utils/fogHazardCalculator.ts';
import {
  buildLocalSmogPlan,
  buildLocalVoiceBriefing,
} from './src/utils/localFallbackPlan.ts';
import {
  BoundedTtlCache,
  isValidCoordinatePair,
  isValidLiveAqiPayload,
  sanitizeCityQuery,
  sanitizeFamilyProfile,
  sanitizeHazardReportText,
  sanitizeTextInput,
  sanitizeVoiceChatHistory,
} from './src/utils/requestValidation.ts';
import { buildLocalVoiceChatReply } from './src/utils/voiceFallback.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const UPSTREAM_FETCH_TIMEOUT_MS = 10_000;
const aqiTelemetryCache = new BoundedTtlCache<LiveAqiData>(100, 5 * 60 * 1000);

const app = express();
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=(self)');
  next();
});
app.use(express.json({ limit: '1mb' }));

interface GeoResult {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  country_code?: string;
  admin1?: string;
  population?: number;
}

const CITY_ALIASES: Record<string, { searchName: string; preferredAdmin?: string; displayOverride?: string }> = {
  'delhi ncr': {
    searchName: 'New Delhi',
    preferredAdmin: 'Delhi',
    displayOverride: 'Delhi NCR, India',
  },
  'ncr': {
    searchName: 'New Delhi',
    preferredAdmin: 'Delhi',
    displayOverride: 'Delhi NCR, India',
  },
  'gurugram': {
    searchName: 'Gurgaon',
    preferredAdmin: 'Haryana',
    displayOverride: 'Gurugram, Haryana',
  },
  'gurugram, haryana': {
    searchName: 'Gurgaon',
    preferredAdmin: 'Haryana',
    displayOverride: 'Gurugram, Haryana',
  },
};

function formatHour12(hour24: number): string {
  const h = ((hour24 % 24) + 24) % 24;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:00 ${suffix}`;
}

async function fetchGeocode(query: string): Promise<GeoResult[]> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    query
  )}&count=8&language=en&format=json`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(UPSTREAM_FETCH_TIMEOUT_MS) });
  if (!resp.ok) {
    throw new Error(`Open-Meteo Geocoding API returned HTTP ${resp.status}`);
  }
  const data = (await resp.json()) as { results?: GeoResult[] };
  return data.results ?? [];
}

async function resolveCity(rawQuery: string): Promise<{
  geo: GeoResult;
  displayName: string;
}> {
  const trimmed = rawQuery.trim();
  const lower = trimmed.toLowerCase();
  const alias = CITY_ALIASES[lower];

  let searchTerm = alias ? alias.searchName : trimmed;
  let hintRegion = alias?.preferredAdmin?.toLowerCase() ?? '';

  if (!alias && trimmed.includes(',')) {
    const segments = trimmed.split(',').map((s) => s.trim()).filter(Boolean);
    searchTerm = segments[0];
    hintRegion = segments.slice(1).join(' ').toLowerCase();
  }

  let results = await fetchGeocode(searchTerm);

  // Fallback: if full query failed and had spaces, try first token
  if (results.length === 0 && searchTerm.includes(' ')) {
    results = await fetchGeocode(searchTerm.split(' ')[0]);
  }

  if (results.length === 0) {
    throw new Error(`No coordinates found for "${trimmed}". Try a nearby major city name.`);
  }

  // Pick best match prioritizing region hint, then India when relevant, then highest population
  const sorted = [...results].sort((a, b) => {
    const score = (r: GeoResult) => {
      let s = 0;
      const admin = (r.admin1 ?? '').toLowerCase();
      const country = (r.country ?? '').toLowerCase();
      if (hintRegion && (admin.includes(hintRegion) || country.includes(hintRegion))) {
        s += 1000;
      }
      if (r.country_code === 'IN' && (!hintRegion || hintRegion.includes('india') || hintRegion.includes('pradesh') || hintRegion.includes('haryana') || hintRegion.includes('bihar') || hintRegion.includes('delhi'))) {
        s += 250;
      }
      s += Math.min((r.population ?? 0) / 100000, 150);
      return s;
    };
    return score(b) - score(a);
  });

  const best = sorted[0];
  const displayName =
    alias?.displayOverride ??
    [best.name, best.admin1, best.country].filter(Boolean).slice(0, 2).join(', ');

  return { geo: best, displayName };
}

function computeSafeOutdoorWindow(hourly: HourlyAqiPoint[]): SafeOutdoorWindow {
  if (hourly.length < 3) {
    const fallbackAqi = hourly[0]?.usAqi ?? 150;
    return {
      windowLabel: '1:00 PM – 3:00 PM',
      avgAqi: fallbackAqi,
      minAqi: fallbackAqi,
      maxAqi: fallbackAqi,
      avgPm25: hourly[0]?.pm25 ?? 50,
      advisory: 'Prefer midday hours when solar warming lifts the winter inversion layer.',
      severity: fallbackAqi <= 100 ? 'safe' : fallbackAqi <= 150 ? 'caution' : 'restricted',
      startIndex: 0,
      endIndex: Math.max(0, hourly.length - 1),
    };
  }

  // Evaluate 2-hour contiguous windows (3 consecutive hourly points, e.g., 1 PM -> 3 PM)
  // Prefer daytime hours (07:00 to 19:00) so we don't recommend 3:00 AM walks
  const windowSpan = 2; // 2 hours span = indices i..i+2
  let bestStart = 0;
  let bestScore = Number.POSITIVE_INFINITY;

  const evaluateRange = (daytimeOnly: boolean) => {
    let found = false;
    for (let i = 0; i <= hourly.length - 1 - windowSpan; i++) {
      const slice = hourly.slice(i, i + windowSpan + 1);
      const midHour = slice[1].hour24;
      if (daytimeOnly && (midHour < 7 || midHour > 19)) {
        continue;
      }
      found = true;
      const avgAqi = slice.reduce((sum, p) => sum + p.usAqi, 0) / slice.length;
      const avgPm25 = slice.reduce((sum, p) => sum + p.pm25, 0) / slice.length;
      const score = avgAqi * 10 + avgPm25;
      if (score < bestScore) {
        bestScore = score;
        bestStart = i;
      }
    }
    return found;
  };

  if (!evaluateRange(true)) {
    evaluateRange(false);
  }

  const endIdx = Math.min(bestStart + windowSpan, hourly.length - 1);
  const bestSlice = hourly.slice(bestStart, endIdx + 1);
  const avgAqi = Math.round(bestSlice.reduce((s, p) => s + p.usAqi, 0) / bestSlice.length);
  const minAqi = Math.min(...bestSlice.map((p) => p.usAqi));
  const maxAqi = Math.max(...bestSlice.map((p) => p.usAqi));
  const avgPm25 = Number(
    (bestSlice.reduce((s, p) => s + p.pm25, 0) / bestSlice.length).toFixed(1)
  );

  const startLabel = formatHour12(hourly[bestStart].hour24);
  const endLabel = formatHour12(hourly[endIdx].hour24 + 1);
  const windowLabel = `${startLabel} – ${endLabel}`;

  let severity: SafeOutdoorWindow['severity'] = 'safe';
  let advisory = 'Lowest particulate load today; suitable for brief walks and cross-ventilation.';
  if (avgAqi > 200) {
    severity = 'avoid';
    advisory = 'Even the lowest-AQI window remains Very Unhealthy. Avoid outdoor exertion; wear N95 if essential.';
  } else if (avgAqi > 150) {
    severity = 'restricted';
    advisory = 'Lowest particulate dip in the next 24 hours, though still Unhealthy. Keep errands under 20 min with an N95 mask.';
  } else if (avgAqi > 100) {
    severity = 'caution';
    advisory = 'Relative dispersion window. Manageable for healthy adults; sensitive groups should limit strenuous activity.';
  }

  return {
    windowLabel,
    avgAqi,
    minAqi,
    maxAqi,
    avgPm25,
    advisory,
    severity,
    startIndex: bestStart,
    endIndex: endIdx,
  };
}

app.get('/api/maps-config', (_req: Request, res: Response) => {
  const apiKey =
    process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
  res.json({ apiKey });
});

app.get('/api/aqi', async (req: Request, res: Response) => {
  const city = sanitizeCityQuery(req.query.city, 120);
  const latParam = typeof req.query.lat === 'string' ? Number(req.query.lat) : Number.NaN;
  const lonParam = typeof req.query.lon === 'string' ? Number(req.query.lon) : Number.NaN;
  const hasExactCoords = isValidCoordinatePair(latParam, lonParam);

  if (!hasExactCoords && city.length < 2) {
    res.status(400).json({ error: 'Please provide a valid city, locality name, or coordinates.' });
    return;
  }

  const displayNameParam = sanitizeCityQuery(req.query.displayName, 120);
  const cacheKey = hasExactCoords
    ? `coords:${latParam.toFixed(3)},${lonParam.toFixed(3)}:${displayNameParam.toLowerCase()}`
    : `city:${city.toLowerCase()}`;

  const cachedTelemetry = aqiTelemetryCache.get(cacheKey);
  if (cachedTelemetry) {
    res.setHeader('Cache-Control', 'public, max-age=180');
    res.json(cachedTelemetry);
    return;
  }

  try {
    let geo: GeoResult;
    let displayName: string;

    if (hasExactCoords) {
      const nameParam = displayNameParam || city || `${latParam.toFixed(2)}, ${lonParam.toFixed(2)}`;
      const admin1Param = sanitizeTextInput(req.query.admin1, 80) || undefined;
      const countryParam = sanitizeTextInput(req.query.country, 80) || undefined;

      geo = {
        name: nameParam,
        latitude: latParam,
        longitude: lonParam,
        admin1: admin1Param,
        country: countryParam,
      };
      displayName = nameParam;
    } else {
      const resolved = await resolveCity(city);
      geo = resolved.geo;
      displayName = resolved.displayName;
    }

    const aqUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${geo.latitude}&longitude=${geo.longitude}&current=us_aqi,pm2_5,pm10,nitrogen_dioxide,ozone,carbon_monoxide&hourly=us_aqi,pm2_5,pm10&timezone=auto&forecast_days=2`;
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${geo.latitude}&longitude=${geo.longitude}&current=temperature_2m,relative_humidity_2m,dew_point_2m,wind_speed_10m,visibility&timezone=auto`;

    const [aqResp, weatherResp] = await Promise.all([
      fetch(aqUrl, { signal: AbortSignal.timeout(UPSTREAM_FETCH_TIMEOUT_MS) }),
      fetch(weatherUrl, { signal: AbortSignal.timeout(UPSTREAM_FETCH_TIMEOUT_MS) }).catch(
        () => null
      ),
    ]);

    if (!aqResp.ok) {
      throw new Error(`Open-Meteo Air Quality API returned HTTP ${aqResp.status}`);
    }

    const aqJson = (await aqResp.json()) as {
      timezone?: string;
      current?: {
        time: string;
        us_aqi?: number | null;
        pm2_5?: number | null;
        pm10?: number | null;
        nitrogen_dioxide?: number | null;
        ozone?: number | null;
        carbon_monoxide?: number | null;
      };
      hourly?: {
        time: string[];
        us_aqi: (number | null)[];
        pm2_5: (number | null)[];
        pm10: (number | null)[];
      };
    };

    let weatherSnapshot: LiveWeatherSnapshot | null = null;
    if (weatherResp && weatherResp.ok) {
      try {
        const wJson = (await weatherResp.json()) as {
          current?: {
            temperature_2m?: number | null;
            relative_humidity_2m?: number | null;
            dew_point_2m?: number | null;
            wind_speed_10m?: number | null;
            visibility?: number | null;
          };
        };
        const wc = wJson.current;
        if (wc && typeof wc.temperature_2m === 'number' && typeof wc.relative_humidity_2m === 'number') {
          const tempC = Number(wc.temperature_2m.toFixed(1));
          const rhPct = Math.round(wc.relative_humidity_2m);
          const dewPointC =
            typeof wc.dew_point_2m === 'number'
              ? Number(wc.dew_point_2m.toFixed(1))
              : estimateDewPointC(tempC, rhPct);
          const windKmh =
            typeof wc.wind_speed_10m === 'number' ? Number(wc.wind_speed_10m.toFixed(1)) : 6.0;
          const visibilityM =
            typeof wc.visibility === 'number' && Number.isFinite(wc.visibility)
              ? Math.round(wc.visibility)
              : null;
          weatherSnapshot = {
            temperatureC: tempC,
            dewPointC,
            relativeHumidityPct: rhPct,
            windSpeedKmh: windKmh,
            reportedVisibilityMeters: visibilityM,
          };
        }
      } catch {
        weatherSnapshot = null;
      }
    }

    const current = aqJson.current;
    const hourlyRaw = aqJson.hourly;
    if (!current || !hourlyRaw || !hourlyRaw.time?.length) {
      throw new Error('Incomplete air quality telemetry returned by Open-Meteo.');
    }

    // Align 24-hour forecast starting at current local hour
    const currentHourPrefix = current.time.slice(0, 13); // YYYY-MM-DDTHH
    let startIdx = hourlyRaw.time.findIndex((t) => t.startsWith(currentHourPrefix));
    if (startIdx < 0) startIdx = 0;

    const hourly: HourlyAqiPoint[] = [];
    for (let i = startIdx; i < Math.min(startIdx + 24, hourlyRaw.time.length); i++) {
      const iso = hourlyRaw.time[i];
      const hour24 = parseInt(iso.slice(11, 13), 10) || 0;
      const aqiVal = hourlyRaw.us_aqi[i];
      const pm25Val = hourlyRaw.pm2_5[i];
      const pm10Val = hourlyRaw.pm10[i];
      hourly.push({
        isoTime: iso,
        hourLabel: formatHour12(hour24).replace(':00 ', ' '),
        hour24,
        usAqi: Math.round(aqiVal ?? current.us_aqi ?? 0),
        pm25: Number((pm25Val ?? current.pm2_5 ?? 0).toFixed(1)),
        pm10: Number((pm10Val ?? current.pm10 ?? 0).toFixed(1)),
      });
    }

    const safeWindow = computeSafeOutdoorWindow(hourly);

    const payload: LiveAqiData = {
      query: city,
      displayName,
      admin1: geo.admin1,
      country: geo.country,
      latitude: Number(geo.latitude.toFixed(4)),
      longitude: Number(geo.longitude.toFixed(4)),
      timezone: aqJson.timezone ?? 'Asia/Kolkata',
      observedAt: current.time,
      current: {
        usAqi: Math.round(current.us_aqi ?? hourly[0]?.usAqi ?? 0),
        pm25: Number((current.pm2_5 ?? hourly[0]?.pm25 ?? 0).toFixed(1)),
        pm10: Number((current.pm10 ?? hourly[0]?.pm10 ?? 0).toFixed(1)),
        no2: current.nitrogen_dioxide != null ? Number(current.nitrogen_dioxide.toFixed(1)) : null,
        ozone: current.ozone != null ? Number(current.ozone.toFixed(1)) : null,
        co: current.carbon_monoxide != null ? Number(current.carbon_monoxide.toFixed(0)) : null,
      },
      weather: weatherSnapshot,
      safeWindow,
      hourly,
    };

    aqiTelemetryCache.set(cacheKey, payload);
    res.setHeader('Cache-Control', 'public, max-age=180');
    res.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch live AQI data.';
    res.status(502).json({ error: message });
  }
});

const smogPlanResponseSchema = {
  type: Type.OBJECT,
  properties: {
    citySummary: {
      type: Type.STRING,
      description: 'Concise 1-sentence atmospheric assessment referencing the exact city, US AQI, and PM2.5.',
    },
    headlineAdvisory: {
      type: Type.STRING,
      description: 'Clear 1-sentence top priority health directive for this specific household.',
    },
    dailyRoutine: {
      type: Type.ARRAY,
      description: 'Exactly 4 time-blocked periods in order: Morning, Afternoon, Evening, Night.',
      items: {
        type: Type.OBJECT,
        properties: {
          period: {
            type: Type.STRING,
            description: 'Must be exactly one of: Morning, Afternoon, Evening, Night.',
          },
          timeRange: {
            type: Type.STRING,
            description: 'Local time range such as 5:30 AM – 10:00 AM.',
          },
          riskLevel: {
            type: Type.STRING,
            description: 'Must be exactly one of: Low, Moderate, High, Severe.',
          },
          ventilationAction: {
            type: Type.STRING,
            description: 'Explicit directive on opening/closing windows and exhaust fans.',
          },
          inversionExplanation: {
            type: Type.STRING,
            description: 'Clear explanation of winter temperature inversion, boundary layer height, and pollutant trapping or dispersion during this block.',
          },
          maskGuidance: {
            type: Type.STRING,
            description: 'Specific respiratory protection guidance (e.g., N95/KN95 fit, scarf warning, or no mask indoors).',
          },
          familyActions: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '2 to 3 concrete actions tailored directly to the household members and commute.',
          },
        },
        required: [
          'period',
          'timeRange',
          'riskLevel',
          'ventilationAction',
          'inversionExplanation',
          'maskGuidance',
          'familyActions',
        ],
      },
    },
    indoorHacks: {
      type: Type.ARRAY,
      description: 'Exactly 4 actionable, budget-friendly indoor air quality hacks tailored to the household air setup.',
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          estimatedPm25ReductionPct: {
            type: Type.NUMBER,
            description: 'Realistic numeric percentage estimate of indoor PM2.5 reduction (e.g., 15 to 75).',
          },
          costEstimate: {
            type: Type.STRING,
            description: 'Realistic Indian household cost estimate (e.g., Free, ₹150–₹300, ₹1,800 DIY).',
          },
          timeRequired: {
            type: Type.STRING,
            description: 'Setup or daily routine effort (e.g., 10 min daily, 25 min one-time).',
          },
          howToExecute: {
            type: Type.STRING,
            description: 'Clear, practical step-by-step instruction.',
          },
          whyItWorks: {
            type: Type.STRING,
            description: 'Scientific particle-physics or airflow explanation.',
          },
        },
        required: [
          'title',
          'estimatedPm25ReductionPct',
          'costEstimate',
          'timeRequired',
          'howToExecute',
          'whyItWorks',
        ],
      },
    },
    sustainableSwaps: {
      type: Type.ARRAY,
      description: 'Exactly 3 tailored habit swaps covering Commute, Cooking, and Waste.',
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          category: {
            type: Type.STRING,
            description: 'Must be exactly one of: Commute, Cooking, Waste.',
          },
          title: { type: Type.STRING },
          currentHabit: { type: Type.STRING },
          sustainableAction: { type: Type.STRING },
          weeklyCo2SavedKg: {
            type: Type.NUMBER,
            description: 'Realistic weekly CO2 saved in kilograms (e.g., 2.5 to 18.5).',
          },
          weeklyPm25NoxPreventedGrams: {
            type: Type.NUMBER,
            description: 'Realistic weekly PM2.5 + NOx emissions prevented in grams (e.g., 4.0 to 45.0).',
          },
          lungHealthBenefit: {
            type: Type.STRING,
            description: 'Clear, plain-language physiological benefit to lungs/airways for the household members.',
          },
          practicalTip: {
            type: Type.STRING,
            description: 'One practical implementation tip for Indian urban households.',
          },
        },
        required: [
          'id',
          'category',
          'title',
          'currentHabit',
          'sustainableAction',
          'weeklyCo2SavedKg',
          'weeklyPm25NoxPreventedGrams',
          'lungHealthBenefit',
          'practicalTip',
        ],
      },
    },
    communityAlert: {
      type: Type.OBJECT,
      properties: {
        subject: {
          type: Type.STRING,
          description: 'Short notice header for RWA / Society WhatsApp group.',
        },
        lines: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Exactly 4 concise, high-impact lines ready to paste into WhatsApp/Society notice warning about today AQI spike and discouraging open leaf/garbage burning.',
        },
        languageUsed: { type: Type.STRING },
        callToAction: {
          type: Type.STRING,
          description: 'Short community coordination reminder (e.g., RWA security rounds or wet-sweeping schedule).',
        },
      },
      required: ['subject', 'lines', 'languageUsed', 'callToAction'],
    },
    healthYoga: {
      type: Type.OBJECT,
      description: 'Indoor Lung-Care Yoga & Pranayama module for respiratory recovery and lung detox, tailored to live AQI and household vulnerabilities.',
      properties: {
        summary: {
          type: Type.STRING,
          description: 'Concise 1-2 sentence overview tailored to the household vulnerabilities and live AQI.',
        },
        aqiSafetyGuidance: {
          type: Type.STRING,
          description: 'Specific respiratory safety instruction based on live AQI and home air setup.',
        },
        sessions: {
          type: Type.ARRAY,
          description: 'Exactly 6 sessions: 3 under categoryGroup "Pranayama (Breathwork)" (Nadi Shodhana, Bhramari, Diaphragmatic Belly Breathing) and 3 under categoryGroup "Chest-Opening Asanas" (Bhujangasana, Matsyasana, Setu Bandhasana).',
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              name: { type: Type.STRING },
              categoryGroup: {
                type: Type.STRING,
                description: 'Must be either "Pranayama (Breathwork)" or "Chest-Opening Asanas".',
              },
              sessionType: {
                type: Type.STRING,
                description: 'Must be exactly one of: Pranayama, Restorative, Dynamic Flow.',
              },
              durationMinutes: { type: Type.INTEGER },
              durationLabel: { type: Type.STRING },
              howToSteps: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '3 to 4 concise, clear step-by-step instructions.',
              },
              lungOrPerformanceImpact: {
                type: Type.STRING,
                description: 'Direct physiological lung-health and respiratory recovery benefit.',
              },
              tailoredNote: {
                type: Type.STRING,
                description: 'Specific modification for the user household members (e.g. Elderly, Children, Asthma) and current AQI.',
              },
              pacerConfig: {
                type: Type.OBJECT,
                properties: {
                  inhaleSec: { type: Type.INTEGER },
                  holdSec: { type: Type.INTEGER },
                  exhaleSec: { type: Type.INTEGER },
                },
                required: ['inhaleSec', 'holdSec', 'exhaleSec'],
              },
            },
            required: [
              'id',
              'name',
              'categoryGroup',
              'sessionType',
              'durationMinutes',
              'durationLabel',
              'howToSteps',
              'lungOrPerformanceImpact',
              'tailoredNote',
              'pacerConfig',
            ],
          },
        },
      },
      required: ['summary', 'aqiSafetyGuidance', 'sessions'],
    },
    trainYoga: {
      type: Type.OBJECT,
      description: 'High-AQI Indoor Athletic Yoga & Breath Conditioning module for runners and athletes forced indoors during smog spikes.',
      properties: {
        summary: {
          type: Type.STRING,
          description: 'Concise 1-2 sentence indoor conditioning strategy tailored to today live AQI and home setup.',
        },
        smogConditioningNote: {
          type: Type.STRING,
          description: 'Practical indoor workout ventilation/breathing pacing note to avoid PM2.5 inhalation.',
        },
        sessions: {
          type: Type.ARRAY,
          description: 'Exactly 5 sessions: Surya Namaskar ("Dynamic Flow"), Ujjayi Pranayama & Controlled Kumbhaka/Pursed-Lip Recovery ("Breath-Hold & Lung Capacity Drills"), and Ustrasana & Dhanurasana ("Post-Workout Chest & Thoracic Mobility").',
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              name: { type: Type.STRING },
              categoryGroup: {
                type: Type.STRING,
                description: 'Must be one of: "Dynamic Flow", "Breath-Hold & Lung Capacity Drills", or "Post-Workout Chest & Thoracic Mobility".',
              },
              sessionType: {
                type: Type.STRING,
                description: 'Must be exactly one of: Pranayama, Restorative, Dynamic Flow.',
              },
              durationMinutes: { type: Type.INTEGER },
              durationLabel: { type: Type.STRING },
              howToSteps: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '3 to 4 concise, clear step-by-step instructions.',
              },
              lungOrPerformanceImpact: {
                type: Type.STRING,
                description: 'Direct athletic stamina, diaphragmatic strength, or oxygen uptake impact.',
              },
              tailoredNote: {
                type: Type.STRING,
                description: 'Smog-day pacing adaptation based on live AQI and home filtration setup.',
              },
              pacerConfig: {
                type: Type.OBJECT,
                properties: {
                  inhaleSec: { type: Type.INTEGER },
                  holdSec: { type: Type.INTEGER },
                  exhaleSec: { type: Type.INTEGER },
                },
                required: ['inhaleSec', 'holdSec', 'exhaleSec'],
              },
            },
            required: [
              'id',
              'name',
              'categoryGroup',
              'sessionType',
              'durationMinutes',
              'durationLabel',
              'howToSteps',
              'lungOrPerformanceImpact',
              'tailoredNote',
              'pacerConfig',
            ],
          },
        },
      },
      required: ['summary', 'smogConditioningNote', 'sessions'],
    },
    roadSafetyAdvice: {
      type: Type.OBJECT,
      description:
        'Winter Fog & Pothole Commute Shield guidance calibrated to estimated visibility, dew point, humidity, wind, PM2.5, and commute mode.',
      properties: {
        visibilityMeters: { type: Type.INTEGER },
        fogSeverity: { type: Type.STRING },
        safeSpeedCapKmh: { type: Type.INTEGER },
        potholeBrakingRisk: { type: Type.STRING },
        commuteDirective: {
          type: Type.STRING,
          description: 'Concise 1-2 sentence road visibility and pothole-braking directive for the user commute.',
        },
        hazardChecklist: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: '3 actionable defensive driving/riding precautions for fog and winter potholes.',
        },
      },
      required: [
        'visibilityMeters',
        'fogSeverity',
        'safeSpeedCapKmh',
        'potholeBrakingRisk',
        'commuteDirective',
        'hazardChecklist',
      ],
    },
  },
  required: [
    'citySummary',
    'headlineAdvisory',
    'dailyRoutine',
    'indoorHacks',
    'sustainableSwaps',
    'communityAlert',
    'healthYoga',
    'trainYoga',
    'roadSafetyAdvice',
  ],
};

const smokerRecoverySchema = {
  type: Type.OBJECT,
  description:
    'Dedicated Smoker Lung-Recovery Initials & Exercises protocol generated when cigarettesSmokedToday > 0.',
  properties: {
    burdenSummary: {
      type: Type.STRING,
      description:
        'Concise 1-2 sentence explanation of combined ambient PM2.5 + cigarette equivalent PM2.5 (~22 µg/m³ per cigarette) lung burden.',
    },
    cardioWarning: {
      type: Type.STRING,
      description:
        'Explicit warning against intense outdoor cardio/running when combined ambient AQI and smoking exposure are elevated, recommending a 2-hour post-smoking exertion hold.',
    },
    immediateInitials: {
      type: Type.ARRAY,
      description:
        'Exactly 4 immediate first-60-minute recovery steps: warm saline/plain steam inhalation, warm water + vitamin-C/antioxidant hydration, 2-hour outdoor exertion hold, and switching to indoor filtered/sealed air.',
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          title: { type: Type.STRING },
          timingWindow: { type: Type.STRING },
          action: { type: Type.STRING },
          physiologicalReason: { type: Type.STRING },
        },
        required: ['id', 'title', 'timingWindow', 'action', 'physiologicalReason'],
      },
    },
    lungClearingExercises: {
      type: Type.ARRAY,
      description:
        'Exactly 4 targeted indoor lung-clearing exercises: Pursed-Lip Breathing, Diaphragmatic (Belly) Breathing, Huff Coughing / Controlled Airway Clearance, and Bhramari / Nadi Shodhana Pranayama.',
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          name: { type: Type.STRING },
          categoryGroup: { type: Type.STRING },
          sessionType: {
            type: Type.STRING,
            description: 'Must be exactly one of: Pranayama, Restorative, Dynamic Flow.',
          },
          durationMinutes: { type: Type.INTEGER },
          durationLabel: { type: Type.STRING },
          howToSteps: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          lungOrPerformanceImpact: { type: Type.STRING },
          tailoredNote: { type: Type.STRING },
          pacerConfig: {
            type: Type.OBJECT,
            properties: {
              inhaleSec: { type: Type.INTEGER },
              holdSec: { type: Type.INTEGER },
              exhaleSec: { type: Type.INTEGER },
            },
            required: ['inhaleSec', 'holdSec', 'exhaleSec'],
          },
        },
        required: [
          'id',
          'name',
          'categoryGroup',
          'sessionType',
          'durationMinutes',
          'durationLabel',
          'howToSteps',
          'lungOrPerformanceImpact',
          'tailoredNote',
          'pacerConfig',
        ],
      },
    },
  },
  required: ['burdenSummary', 'cardioWarning', 'immediateInitials', 'lungClearingExercises'],
};

const smogPlanWithSmokerResponseSchema = {
  type: Type.OBJECT,
  properties: {
    ...smogPlanResponseSchema.properties,
    smokerRecovery: smokerRecoverySchema,
  },
  required: [...smogPlanResponseSchema.required, 'smokerRecovery'],
};

const PRIMARY_GEMINI_MODEL = 'gemini-3.1-flash-lite';
const FALLBACK_GEMINI_MODEL = 'gemini-4-hydrogen';

function isRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('429') ||
    msg.toLowerCase().includes('rate limit') ||
    msg.toLowerCase().includes('quota')
  );
}

async function generateWithModelFallback(
  ai: GoogleGenAI,
  prompt: string,
  systemInstruction: string,
  responseSchema: Record<string, unknown>
) {
  const models = [PRIMARY_GEMINI_MODEL, FALLBACK_GEMINI_MODEL];
  let lastError: unknown;

  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema,
        },
      });
      return { response, modelUsed: model };
    } catch (err) {
      lastError = err;
      const errMsg = err instanceof Error ? err.message : String(err);
      const isAuthFailure =
        errMsg.includes('API_KEY_INVALID') ||
        errMsg.includes('PERMISSION_DENIED') ||
        errMsg.includes('403');
      if (isAuthFailure) {
        throw err;
      }
      // Fall through to try gemini-4-hydrogen if gemini-3.1-flash-lite fails
    }
  }
  throw lastError;
}

app.post('/api/smog-plan', async (req: Request, res: Response) => {
  const apiKey = process.env.GEMINI_API_KEY;
  const { aqiData: rawAqiData, profile: rawProfile, isRetry } = req.body as {
    aqiData?: unknown;
    profile?: unknown;
    isRetry?: boolean;
  };

  const profile = sanitizeFamilyProfile(rawProfile);
  if (!isValidLiveAqiPayload(rawAqiData) || !profile) {
    res.status(400).json({
      error: 'Missing or invalid live AQI telemetry or profile selections.',
    });
    return;
  }

  const aqiData: LiveAqiData = {
    ...rawAqiData,
    displayName: sanitizeTextInput(rawAqiData.displayName, 120) || 'Your City',
    query: sanitizeTextInput(rawAqiData.query, 120) || 'Your City',
  };

  if (!apiKey) {
    res.json(buildLocalSmogPlan(aqiData, profile));
    return;
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const isHinglish = profile.language === 'Hinglish/Hindi';
  const languageDirective = isHinglish
    ? 'Write the Community RWA Alert lines in clear, warm, natural Hinglish (Romanized Hindi mixed with everyday English health terms like AQI, PM2.5, N95, RWA — easily readable by Indian residential societies on WhatsApp). For Tabs 1, 2, and 3, write crisp, practical English with familiar Indian urban context and brief Hinglish phrasing where helpful so every family member understands instantly.'
    : 'Write all 4 tabs including the Community RWA Alert in clear, concise, practical English suited for Indian urban households and RWA WhatsApp groups.';

  const systemInstruction = `You are VayuMitra AI, an environmental health scientist and urban air quality advisor specializing in severe North Indian winter smog, Indo-Gangetic Plain boundary-layer temperature inversions, and practical household exposure reduction.
Provide empirically grounded, realistic, compassionate, and hyper-practical guidance.
Never exaggerate numbers or fabricate miraculous reductions. Keep PM2.5 reduction percentages scientifically defensible (e.g., wet mopping 15-25%, sealing door gaps 20-30%, DIY MERV-13 / HEPA exhaust box filter 45-65%, single HEPA room zoning 55-75%).
Keep CO2 (kg/week) and PM2.5/NOx (grams/week) savings realistic for a single urban Indian household.
${languageDirective}`;

  const hourlySummary = aqiData.hourly
    .filter((_, idx) => idx % 3 === 0)
    .map((h) => `${h.hourLabel}: AQI ${h.usAqi} (PM2.5 ${h.pm25} µg/m³)`)
    .join(', ');

  const {
    cigarettesCount,
    smokingEquivalentPm25,
    combinedPm25Burden,
    hasSmokingExposure,
  } = calculateCombinedParticulateLoad(aqiData.current.pm25, profile.cigarettesSmokedToday);

  const smokerPromptSection = hasSmokingExposure
    ? `
- Cigarettes Smoked Today: ${cigarettesCount} (adds ~${smokingEquivalentPm25} µg/m³ equivalent PM2.5 burden at ~22 µg/m³ per cigarette; Combined Equivalent PM2.5 Load = ${combinedPm25Burden} µg/m³)`
    : `
- Cigarettes Smoked Today: 0 (Non-Smoker)`;

  const smokerRequirementSection = hasSmokingExposure
    ? `
7. smokerRecovery (Smoker Lung-Recovery Initials & Exercises — REQUIRED because cigarettesSmokedToday = ${cigarettesCount}):
   - Also factor this smoking exposure (+${smokingEquivalentPm25} µg/m³ PM2.5; combined ${combinedPm25Burden} µg/m³) into headlineAdvisory, healthYoga (soothing airway clearance first), and trainYoga (explicitly warn against intense outdoor cardio and require a 2-hour post-smoking exertion hold).
   - immediateInitials (First 60 Minutes): Provide EXACTLY 4 actionable immediate steps:
     1) Warm saline gargle & plain steam inhalation (0–15 min) for mucociliary airway clearance
     2) Warm water + Vitamin-C / antioxidant hydration (15–30 min) to counter acute oxidative stress
     3) Avoid outdoor exertion & strenuous cardio for at least 2 hours post-smoking
     4) Switch immediately to indoor filtered/sealed air tailored to "${profile.homeSetup}"
   - lungClearingExercises: Provide EXACTLY 4 targeted indoor lung-clearing drills calibrated to ${cigarettesCount} cigarettes today and US AQI ${aqiData.current.usAqi}:
     1) Pursed-Lip Breathing (trapped-air release & oxygen exchange, sessionType "Pranayama")
     2) Diaphragmatic (Belly) Breathing (deep lower-lobe ventilation & calm breathing, sessionType "Pranayama")
     3) Huff Coughing / Controlled Airway Clearance (gentle mucus clearance without harsh coughing, sessionType "Restorative")
     4) Bhramari / Nadi Shodhana Pranayama (sinus/throat soothing & stress relief indoors; explicitly advise against intense outdoor cardio or forceful Kapalabhati/Bhastrika when combined AQI and cigarette count are high, sessionType "Pranayama").`
    : '';

  const weatherSnapshot =
    aqiData.weather ?? buildFallbackWeatherSnapshot(aqiData.current.pm25);
  const fogHazard = calculateFogHazard({
    temperatureC: weatherSnapshot.temperatureC,
    dewPointC: weatherSnapshot.dewPointC,
    relativeHumidityPct: weatherSnapshot.relativeHumidityPct,
    windSpeedKmh: weatherSnapshot.windSpeedKmh,
    pm25: aqiData.current.pm25,
    commute: profile.commute,
    reportedVisibilityMeters: weatherSnapshot.reportedVisibilityMeters,
  });

  const isSoloMode = isIndividualSoloProfile(profile.members);
  const householdMode = getHouseholdMode(profile.members);
  const soloModeDirective = isSoloMode
    ? `
SOLO / INDIVIDUAL MODE ACTIVE (profileMode: "individual" / "solo"):
- This user is a single adult ("Individual / Solo") managing their own daily schedule.
- Focus ALL dailyRoutine actions, indoor ventilation tips, indoorHacks, sustainableSwaps, healthYoga tailoredNotes, and trainYoga conditioning specifically on personal daily routines, solo commuting (${profile.commute}), single-room/studio/workspace air management, and individual outdoor exercise/work schedules.
- Do NOT include child care, school-drop, or elderly-parent care guidance in dailyRoutine, indoorHacks, healthYoga, or trainYoga.`
    : '';

  const prompt = `Generate a personalized Winter Smog Action Plan JSON for this exact ${
    isSoloMode ? 'solo adult' : 'household'
  } and live air quality reading:

LOCATION & LIVE TELEMETRY (Open-Meteo):
- City/Locality: ${aqiData.displayName} (Lat ${aqiData.latitude}, Lon ${aqiData.longitude})
- Current US AQI: ${aqiData.current.usAqi}
- Current PM2.5: ${aqiData.current.pm25} µg/m³ (WHO 24h limit is 15 µg/m³)
- Current PM10: ${aqiData.current.pm10} µg/m³
- Winter Fog & Road Telemetry: Temp ${weatherSnapshot.temperatureC}°C, Dew Point ${fogHazard.dewPointC}°C (Spread ${fogHazard.dewPointSpreadC}°C), RH ${weatherSnapshot.relativeHumidityPct}%, Wind ${weatherSnapshot.windSpeedKmh} km/h, Estimated Visibility ${fogHazard.estimatedVisibilityMeters} m (${fogHazard.fogSeverity}), Recommended Speed Cap ${fogHazard.safeSpeedCapKmh} km/h, Pothole-Braking Risk: ${fogHazard.potholeBrakingRisk}
- Computed Safest Daytime Window: ${aqiData.safeWindow.windowLabel} (Forecast Avg AQI: ${aqiData.safeWindow.avgAqi}, Avg PM2.5: ${aqiData.safeWindow.avgPm25} µg/m³)
- 24-Hour Trend (3-hr samples): ${hourlySummary}

HOUSEHOLD & LIFESTYLE PROFILE:
- Profile Mode: ${householdMode} (${isSoloMode ? 'individual / solo single adult' : 'multi-member family household'})
- Selected Profile Options: ${profile.members.join(', ')}
- Primary Daily Commute: ${profile.commute}
- Home Air Setup: ${profile.homeSetup}
- Preferred Language for Sharing: ${profile.language}${smokerPromptSection}${soloModeDirective}

REQUIREMENTS FOR THE ${hasSmokingExposure ? '8' : '7'} SECTIONS:
1. dailyRoutine: Exactly 4 objects in chronological order: "Morning", "Afternoon", "Evening", "Night". Explicitly reference winter temperature inversion dynamics (early morning & post-sunset inversion trapping smog near ground vs afternoon solar mixing lifting the boundary layer) and align ventilation timing with today's actual Safest Window (${aqiData.safeWindow.windowLabel}). Tailor activities specifically to ${
    isSoloMode
      ? `a solo adult's personal daily routine, ${profile.commute} commute, and individual work/exercise schedule`
      : `${profile.members.join(', ')} and their ${profile.commute} commute`
  }.
2. indoorHacks: Exactly 4 practical, budget-friendly hacks tailored specifically to "${profile.homeSetup}"${
    isSoloMode ? ' in a single-adult apartment, bedroom, or personal workspace' : ''
  }. Include realistic estimatedPm25ReductionPct numbers (e.g. wet-mopping instead of dry jhadu/sweeping, DIY box-fan MERV-13 filter or HEPA placement optimization, damp cloth/weatherstrip door-gap sealing, kitchen exhaust/tadka fume control, or low-maintenance indoor plants as secondary support).
3. sustainableSwaps: Exactly 3 swaps with categories "Commute", "Cooking", and "Waste" (one for each category). Tailor the Commute swap specifically to "${profile.commute}". Provide realistic numeric weeklyCo2SavedKg and weeklyPm25NoxPreventedGrams, plus a clear lungHealthBenefit explaining how reducing these local emissions protects the airways of ${
    isSoloMode ? 'an individual solo commuter' : profile.members.join(', ')
  }.
4. communityAlert: A ready-to-copy 4-line WhatsApp/Society RWA notice ("lines" array must have exactly 4 concise lines) mentioning ${aqiData.displayName}, today's US AQI (${aqiData.current.usAqi}) and PM2.5 (${aqiData.current.pm25} µg/m³), advising vulnerable residents indoors, and strongly discouraging open leaf/garbage/bonfire burning in the society.
5. healthYoga (Indoor Lung-Care Yoga & Pranayama — Respiratory Recovery & Lung Detox):
   - Tailor guidance for ${
     isSoloMode
       ? 'an individual solo adult managing personal work and commute exposure'
       : profile.members.join(', ')
   } at US AQI ${aqiData.current.usAqi} (PM2.5 ${aqiData.current.pm25} µg/m³) with home setup "${profile.homeSetup}".
   - Provide EXACTLY 6 sessions:
     * Under categoryGroup "Pranayama (Breathwork)" (sessionType "Pranayama"):
       1) Nadi Shodhana (Alternate Nostril Breathing) — airway balance & stress reduction
       2) Bhramari Pranayama (Humming Bee Breath) — sinus & throat soothing
       3) Diaphragmatic Belly Breathing — gentle deep lower-lobe lung recovery
     * Under categoryGroup "Chest-Opening Asanas" (sessionType "Restorative"):
       4) Bhujangasana (Cobra Pose) — expands chest capacity & eases shallow breathing
       5) Matsyasana (Fish Pose) — supported ribcage expansion
       6) Setu Bandhasana (Bridge Pose) — opens chest & relieves respiratory tension
   - If AQI > 200 or Asthma/Elderly are in the household${hasSmokingExposure ? ' or smoking exposure is logged' : ''}, keep breath holds gentle (0–2s) and explicitly warn against forceful rapid breathing (Kapalabhati or Bhastrika) in unfiltered air.
6. trainYoga (High-AQI Indoor Athletic Yoga & Breath Conditioning — Indoor Smog-Day Conditioning):
   - Designed for outdoor runners and athletes forced indoors during smog spikes at US AQI ${aqiData.current.usAqi} with "${profile.homeSetup}".
   - Provide EXACTLY 5 sessions:
     * Under categoryGroup "Dynamic Flow" (sessionType "Dynamic Flow"):
       1) Surya Namaskar (Sun Salutation Rounds) — indoor cardio & full-body mobility without outdoor PM2.5 inhalation
     * Under categoryGroup "Breath-Hold & Lung Capacity Drills" (sessionType "Pranayama"):
       2) Ujjayi Pranayama (Ocean Breath) — rhythmic endurance & airway control
       3) Controlled Kumbhaka & Pursed-Lip Recovery Breathing — diaphragm & intercostal muscle conditioning
     * Under categoryGroup "Post-Workout Chest & Thoracic Mobility" (sessionType "Restorative"):
       4) Ustrasana (Camel Pose) — counters tight posture & opens chest wall
       5) Dhanurasana (Bow Pose) — thoracic mobility to maximize oxygen uptake
   - Provide realistic pacerConfig values (inhaleSec 3–5, holdSec 0–4, exhaleSec 4–8) suitable for each practice.
7. roadSafetyAdvice (Winter Fog & Pothole Commute Shield):
   - Use visibilityMeters=${fogHazard.estimatedVisibilityMeters}, fogSeverity="${fogHazard.fogSeverity}", safeSpeedCapKmh=${fogHazard.safeSpeedCapKmh}, potholeBrakingRisk="${fogHazard.potholeBrakingRisk}".
   - Provide a concise commuteDirective and 3 practical hazardChecklist items specifically for "${profile.commute}" addressing low-beam fog lighting, pothole braking margin (~${fogHazard.stoppingDistanceMeters} m), and pre-9 AM winter smog-fog traps.${smokerRequirementSection}`;

  try {
    const activeSchema = hasSmokingExposure
      ? smogPlanWithSmokerResponseSchema
      : smogPlanResponseSchema;

    const { response } = await generateWithModelFallback(
      ai,
      prompt,
      systemInstruction,
      activeSchema
    );
    const rawText = (response.text ?? '').trim();
    if (!rawText) {
      throw new Error('Empty response received from Gemini.');
    }

    const parsed = JSON.parse(rawText) as Omit<SmogActionPlan, 'generatedAt'>;
    const plan: SmogActionPlan = {
      ...parsed,
      roadSafetyAdvice: parsed.roadSafetyAdvice
        ? {
            ...parsed.roadSafetyAdvice,
            visibilityMeters: fogHazard.estimatedVisibilityMeters,
            fogSeverity: fogHazard.fogSeverity,
            safeSpeedCapKmh: fogHazard.safeSpeedCapKmh,
            potholeBrakingRisk: fogHazard.potholeBrakingRisk,
          }
        : {
            visibilityMeters: fogHazard.estimatedVisibilityMeters,
            fogSeverity: fogHazard.fogSeverity,
            safeSpeedCapKmh: fogHazard.safeSpeedCapKmh,
            potholeBrakingRisk: fogHazard.potholeBrakingRisk,
            commuteDirective: fogHazard.summary,
            hazardChecklist: fogHazard.commuterTips,
          },
      smokerRecovery:
        hasSmokingExposure && parsed.smokerRecovery
          ? {
              ...parsed.smokerRecovery,
              cigarettesCount,
              smokingEquivalentPm25,
              combinedPm25Burden,
            }
          : hasSmokingExposure
            ? buildLocalSmogPlan(aqiData, {
                ...profile,
                cigarettesSmokedToday: cigarettesCount,
              }).smokerRecovery
            : null,
      generatedAt: new Date().toISOString(),
    };

    res.json(plan);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate personalized smog plan.';
    console.error('Gemini API error:', err);

    if (isRateLimitError(err)) {
      if (!isRetry) {
        res.status(429).json({
          retryable: true,
          error: 'Optimizing air quality analysis...',
        });
        return;
      }
      // Quota still temporarily exhausted after retry -> seamless local fallback
      res.json(buildLocalSmogPlan(aqiData, profile));
      return;
    }

    if (message.includes('API_KEY_INVALID') || message.includes('PERMISSION_DENIED')) {
      res.status(403).json({
        error: 'Gemini API authentication failed. Please verify your API key in Settings > Secrets.',
      });
      return;
    }

    if (isRetry) {
      res.json(buildLocalSmogPlan(aqiData, profile));
      return;
    }
    res.status(502).json({ error: message });
  }
});

const ALLOWED_VOICE_LANGUAGES = [
  'English (India)',
  'Hindi (हिन्दी)',
  'Hinglish',
  'Spanish',
  'French',
  'German',
] as const;

type VoiceLanguage = (typeof ALLOWED_VOICE_LANGUAGES)[number];

const voiceBriefingSchema = {
  type: Type.OBJECT,
  properties: {
    script: {
      type: Type.STRING,
      description:
        'A natural, warm spoken audio briefing in plain prose (no markdown, no bullet points, no asterisks, no emojis) starting with the exact greeting "Hello sir, here is your personalized smog action plan for [City Name]." followed by the localized briefing.',
    },
  },
  required: ['script'],
};

app.post('/api/voice-briefing', async (req: Request, res: Response) => {
  const apiKey = process.env.GEMINI_API_KEY;
  const { aqiData, plan, language, isRetry } = req.body as {
    aqiData?: LiveAqiData;
    plan?: SmogActionPlan;
    language?: string;
    isRetry?: boolean;
  };

  if (!aqiData || !plan) {
    res.status(400).json({ error: 'Missing live AQI telemetry or generated action plan.' });
    return;
  }

  const targetLanguage: VoiceLanguage = ALLOWED_VOICE_LANGUAGES.includes(language as VoiceLanguage)
    ? (language as VoiceLanguage)
    : 'English (India)';

  if (!apiKey) {
    res.json({
      script: buildLocalVoiceBriefing(aqiData, plan, targetLanguage),
      language: targetLanguage,
    });
    return;
  }

  const cityName = aqiData.displayName || aqiData.query || 'your city';
  const mandatoryOpening = `Hello sir, here is your personalized smog action plan for ${cityName}.`;

  const topHack = plan.indoorHacks?.[0];
  const topRoutine = plan.dailyRoutine?.[0];
  const topYoga = plan.healthYoga?.sessions?.[0];

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const languageInstructions: Record<VoiceLanguage, string> = {
    'English (India)':
      'Speak in warm, clear, natural Indian English suitable for being read aloud by a voice assistant.',
    'Hindi (हिन्दी)':
      'Begin with the exact required English opening sentence, then seamlessly continue the rest of the spoken briefing in natural, clear Devanagari Hindi (हिन्दी) that sounds polite and easy to understand when spoken aloud.',
    Hinglish:
      'Begin with the exact required English opening sentence, then seamlessly continue in warm, natural Romanized Hinglish (everyday spoken Hindi mixed with clear English terms like AQI, PM 2.5, N95, and safe outdoor window).',
    Spanish:
      'Begin with the exact required English opening sentence, then seamlessly continue the rest of the spoken briefing in natural, warm Spanish (Español).',
    French:
      'Begin with the exact required English opening sentence, then seamlessly continue the rest of the spoken briefing in natural, warm French (Français).',
    German:
      'Begin with the exact required English opening sentence, then seamlessly continue the rest of the spoken briefing in natural, warm German (Deutsch).',
  };

  const prompt = `Convert this VayuMitra AI smog action plan into a concise, natural spoken briefing (80 to 115 words total) meant to be read aloud via text-to-speech.

MANDATORY OPENING:
You MUST begin the script with this exact sentence verbatim:
"${mandatoryOpening}"

LANGUAGE INSTRUCTION:
${languageInstructions[targetLanguage]}

CONTENT TO COVER NATURALLY AFTER THE OPENING:
1. Live AQI status: US AQI ${aqiData.current.usAqi}, PM2.5 is ${aqiData.current.pm25} micrograms per cubic meter.
2. Safe outdoor window: ${aqiData.safeWindow.windowLabel} (${aqiData.safeWindow.advisory}).
3. Top indoor air hack: ${topHack ? `${topHack.title} (reduces indoor PM2.5 by roughly ${topHack.estimatedPm25ReductionPct}%) — ${topHack.howToExecute}` : 'Keep windows sealed and wet-mop floors.'}
4. Priority household directive: ${plan.headlineAdvisory}
5. Brief mention of either ${topRoutine ? `morning guidance (${topRoutine.ventilationAction})` : 'ventilation timing'} or ${topYoga ? `gentle indoor ${topYoga.name}` : 'indoor lung care'}.${
      plan.smokerRecovery && plan.smokerRecovery.cigarettesCount > 0
        ? `\n6. Immediate smoker lung-recovery step: ${plan.smokerRecovery.cigarettesCount} cigarettes logged today — start with ${plan.smokerRecovery.immediateInitials?.[0]?.title || 'warm steam inhalation and warm water hydration'} and avoid outdoor cardio for 2 hours.`
        : ''
    }

STYLE RULES:
- Plain conversational sentences only.
- NO markdown, NO bullet points, NO emojis, NO hashtags, NO symbols like "µg/m³" (write "micrograms per cubic meter" or the localized spoken equivalent).
- Sound calm, reassuring, and respectful.`;

  try {
    const { response } = await generateWithModelFallback(
      ai,
      prompt,
      'You are VayuMitra Voice Assistant. You produce clean, natural, punctuation-friendly text-to-speech briefings with zero markdown formatting.',
      voiceBriefingSchema
    );

    const rawText = (response.text ?? '').trim();
    if (!rawText) {
      throw new Error('Empty voice briefing received from Gemini.');
    }

    const parsed = JSON.parse(rawText) as { script?: string };
    let script = (parsed.script ?? '').replace(/[*#`_]/g, '').replace(/\s+/g, ' ').trim();

    if (!script) {
      throw new Error('Gemini returned an empty voice briefing script.');
    }

    const expectedPrefixLower = `hello sir, here is your personalized smog action plan for ${cityName}`.toLowerCase();
    if (!script.toLowerCase().startsWith(expectedPrefixLower)) {
      const cleaned = script.replace(/^hello\s+sir[,!.\s-]*/i, '').trim();
      script = `${mandatoryOpening} ${cleaned}`;
    }

    res.json({
      script,
      language: targetLanguage,
    });
  } catch (err) {
    console.error('Gemini voice briefing error:', err);
    if (isRateLimitError(err)) {
      if (!isRetry) {
        res.status(429).json({
          retryable: true,
          error: 'Optimizing air quality analysis...',
        });
        return;
      }
      res.json({
        script: buildLocalVoiceBriefing(aqiData, plan, targetLanguage),
        language: targetLanguage,
      });
      return;
    }

    // Graceful fallback so voice playback never breaks
    res.json({
      script: buildLocalVoiceBriefing(aqiData, plan, targetLanguage),
      language: targetLanguage,
    });
  }
});

const voiceChatResponseSchema = {
  type: Type.OBJECT,
  properties: {
    reply: {
      type: Type.STRING,
      description:
        'A concise, warm spoken response (2 to 4 short natural sentences, zero markdown, zero emojis, spell out units like micrograms per cubic meter).',
    },
  },
  required: ['reply'],
};

app.post('/api/voice-chat', async (req: Request, res: Response) => {
  const apiKey = process.env.GEMINI_API_KEY;
  const { message, history, aqiData, profile, planHeadline } = req.body as {
    message?: unknown;
    history?: unknown;
    aqiData?: unknown;
    profile?: unknown;
    planHeadline?: unknown;
  };

  const trimmed = sanitizeHazardReportText(message, 500);
  if (!trimmed) {
    res.status(400).json({ error: 'Please provide a spoken or typed question.' });
    return;
  }

  const validAqiData = isValidLiveAqiPayload(aqiData) ? aqiData : null;
  const fallbackProfile: FamilyProfile = sanitizeFamilyProfile(profile) ?? {
    members: ['Individual / Solo'],
    commute: 'Two-Wheeler (Bike/Scooter)',
    homeSetup: 'No Air Purifier (Budget/Natural hacks needed)',
    language: 'English',
    cigarettesSmokedToday: 0,
  };
  const safePlanHeadline = sanitizeTextInput(planHeadline, 300) || null;
  const safeHistory = sanitizeVoiceChatHistory(history, 6, 400);

  if (!apiKey) {
    res.json({ reply: buildLocalVoiceChatReply(trimmed, validAqiData, fallbackProfile) });
    return;
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const systemInstruction = buildLiveVoiceSystemInstruction({
    aqiData: validAqiData,
    profile: fallbackProfile,
    planHeadline: safePlanHeadline,
  });

  const recentHistory = safeHistory
    .map((turn) => `${turn.role === 'user' ? 'User' : 'VayuMitra'}: ${turn.text}`)
    .join('\n');

  const prompt = `${recentHistory ? `RECENT CONVERSATION:\n${recentHistory}\n\n` : ''}USER QUESTION: ${trimmed}\n\nRespond warmly and concisely in 2 to 4 plain spoken sentences with zero markdown.`;

  try {
    const { response } = await generateWithModelFallback(
      ai,
      prompt,
      systemInstruction,
      voiceChatResponseSchema
    );
    const rawText = (response.text ?? '').trim();
    const parsed = JSON.parse(rawText) as { reply?: string };
    const cleanReply = (parsed.reply ?? '').replace(/[*#`_]/g, '').replace(/\s+/g, ' ').trim();

    res.json({
      reply: cleanReply || buildLocalVoiceChatReply(trimmed, validAqiData, fallbackProfile),
    });
  } catch (err) {
    console.error('Gemini voice-chat fallback error:', err);
    res.json({
      reply: buildLocalVoiceChatReply(trimmed, validAqiData, fallbackProfile),
    });
  }
});

const LIVE_VOICE_MODEL = 'gemini-3.8-live';
const ALLOWED_LIVE_VOICES = ['Zephyr', 'Kore', 'Puck', 'Charon', 'Fenrir'] as const;
type LiveVoiceName = (typeof ALLOWED_LIVE_VOICES)[number];

interface LiveVoiceContextPayload {
  voiceName?: string;
  aqiData?: LiveAqiData | null;
  profile?: FamilyProfile | null;
  planHeadline?: string | null;
}

function extractLiveErrorReason(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'object' && err !== null) {
    const record = err as {
      message?: unknown;
      reason?: unknown;
      code?: unknown;
      error?: { message?: unknown };
    };
    if (typeof record.message === 'string' && record.message.trim()) return record.message;
    if (typeof record.error?.message === 'string' && record.error.message.trim()) {
      return record.error.message;
    }
    if (typeof record.reason === 'string' && record.reason.trim()) return record.reason;
    if (typeof record.code === 'number') return `WebSocket closed (code ${record.code})`;
  }
  return 'Live audio stream unavailable in this network environment.';
}

function buildLiveVoiceSystemInstruction(ctx: LiveVoiceContextPayload): string {
  const parts: string[] = [
    'You are VayuMitra AI, a calm, knowledgeable, and compassionate urban air quality and winter smog advisor having a real-time spoken voice conversation.',
    'Keep spoken replies natural, concise (2 to 4 short sentences unless asked for detail), and easy to follow aloud. Never output markdown, asterisks, bullet symbols, or raw units like "µg/m³" (say "micrograms per cubic meter").',
    'Base your advice strictly on the user live telemetry and household profile provided below. Remind users to consult a physician for acute respiratory distress.',
  ];

  if (ctx.aqiData) {
    const aqi = ctx.aqiData;
    const weather = aqi.weather ?? buildFallbackWeatherSnapshot(aqi.current.pm25);
    const fog = calculateFogHazard({
      temperatureC: weather.temperatureC,
      dewPointC: weather.dewPointC,
      relativeHumidityPct: weather.relativeHumidityPct,
      windSpeedKmh: weather.windSpeedKmh,
      pm25: aqi.current.pm25,
      commute: ctx.profile?.commute,
      reportedVisibilityMeters: weather.reportedVisibilityMeters,
    });
    parts.push(
      `LIVE TELEMETRY FOR ${aqi.displayName}: US AQI ${aqi.current.usAqi}, PM2.5 ${aqi.current.pm25} micrograms per cubic meter, PM10 ${aqi.current.pm10} micrograms per cubic meter. Computed safest outdoor window today: ${aqi.safeWindow.windowLabel} (average AQI ${aqi.safeWindow.avgAqi}, ${aqi.safeWindow.advisory}). Road fog shield: ${fog.fogSeverity}, roughly ${fog.estimatedVisibilityMeters} meters visibility, safe speed cap ${fog.safeSpeedCapKmh} kilometers per hour, pothole-braking risk ${fog.potholeBrakingRisk}.`
    );
  }

  if (ctx.profile) {
    const p = ctx.profile;
    const isSolo = isIndividualSoloProfile(p.members);
    const exposure = calculateCombinedParticulateLoad(
      ctx.aqiData?.current.pm25 ?? 0,
      p.cigarettesSmokedToday
    );
    parts.push(
      `USER PROFILE (${getHouseholdMode(p.members)} mode): Selected options: ${p.members.join(', ')}. Primary commute: ${p.commute}. Home air setup: ${p.homeSetup}. Preferred language: ${p.language}.${
        isSolo
          ? ' Focus advice on personal solo routines, individual commute, and solo exercise/work schedules rather than child or elderly care.'
          : ''
      }`
    );
    if (exposure.hasSmokingExposure) {
      parts.push(
        `SMOKING EXPOSURE TODAY: ${exposure.cigarettesCount} cigarettes logged (adds roughly ${exposure.smokingEquivalentPm25} micrograms per cubic meter equivalent PM2.5, for a combined load of ${exposure.combinedPm25Burden} micrograms per cubic meter). Advise immediate warm steam/saline clearance, hydration, avoiding outdoor cardio for 2 hours, and gentle indoor breathing drills.`
      );
    }
  }

  if (ctx.planHeadline) {
    parts.push(`CURRENT PRIORITY ACTION PLAN DIRECTIVE: ${ctx.planHeadline}`);
  }

  return parts.join(' ');
}

function attachLiveVoiceWebSocket(httpServer: http.Server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });

  httpServer.on('upgrade', (request: IncomingMessage, socket, head) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (pathname !== '/api/live-voice') {
      return;
    }

    wss.handleUpgrade(request, socket, head, (clientWs) => {
      wss.emit('connection', clientWs, request);
    });
  });

  wss.on('connection', (clientWs: WebSocket) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      if (clientWs.readyState === clientWs.OPEN) {
        clientWs.send(
          JSON.stringify({
            type: 'live_unavailable',
            reason: 'Gemini Live API key is not configured; using Browser Voice Mode.',
          })
        );
      }
      clientWs.close();
      return;
    }

    // Gemini Live BidiGenerateContent requires apiVersion 'v1beta' on @google/genai 3.x
    const liveAi = new GoogleGenAI({
      apiKey,
      apiVersion: 'v1beta',
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    type LiveSession = Awaited<ReturnType<typeof liveAi.live.connect>>;
    let sessionPromise: Promise<LiveSession> | null = null;
    let activeSession: LiveSession | null = null;
    let readySent = false;
    let closed = false;

    const safeSend = (payload: Record<string, unknown>) => {
      if (!closed && clientWs.readyState === clientWs.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    const connectSession = (context: LiveVoiceContextPayload) => {
      if (sessionPromise) return sessionPromise;

      const requestedVoice = context.voiceName as LiveVoiceName | undefined;
      const voiceName: LiveVoiceName =
        requestedVoice && ALLOWED_LIVE_VOICES.includes(requestedVoice)
          ? requestedVoice
          : 'Zephyr';

      sessionPromise = liveAi.live
        .connect({
          model: LIVE_VOICE_MODEL,
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName },
              },
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            systemInstruction: buildLiveVoiceSystemInstruction(context),
          },
          callbacks: {
            onopen: () => {
              // Wait briefly for setupComplete; if server accepts cleanly we mark ready on setupComplete
            },
            onmessage: (message: LiveServerMessage) => {
              if (!readySent) {
                readySent = true;
                safeSend({ type: 'ready', model: LIVE_VOICE_MODEL, voiceName });
              }
              const content = message.serverContent;
              if (content?.inputTranscription?.text) {
                safeSend({
                  type: 'inputTranscript',
                  text: content.inputTranscription.text,
                });
              }
              if (content?.outputTranscription?.text) {
                safeSend({
                  type: 'outputTranscript',
                  text: content.outputTranscription.text,
                });
              }
              for (const part of content?.modelTurn?.parts ?? []) {
                if (part.inlineData?.data) {
                  safeSend({
                    type: 'audio',
                    data: part.inlineData.data,
                  });
                }
              }
              if (content?.interrupted) {
                safeSend({ type: 'interrupted' });
              }
              if (content?.turnComplete) {
                safeSend({ type: 'turnComplete' });
              }
            },
            onerror: (err: unknown) => {
              const reason = extractLiveErrorReason(err);
              console.warn('Gemini Live API handshake/stream error, signaling browser fallback:', reason);
              safeSend({ type: 'live_unavailable', reason });
            },
            onclose: (event: unknown) => {
              if (closed) return;
              const reason = extractLiveErrorReason(event);
              if (!readySent) {
                safeSend({ type: 'live_unavailable', reason });
              } else {
                safeSend({ type: 'closed', reason });
              }
            },
          },
        })
        .then((session) => {
          activeSession = session;
          if (closed) {
            try {
              session.close();
            } catch {
              // Ignore teardown error
            }
          }
          return session;
        })
        .catch((err) => {
          const reason = extractLiveErrorReason(err);
          console.warn('Gemini Live API connect rejected, signaling browser fallback:', reason);
          safeSend({ type: 'live_unavailable', reason });
          throw err;
        });

      return sessionPromise;
    };

    clientWs.on('message', (raw) => {
      if (closed) return;

      let msg: {
        type?: string;
        data?: string;
        text?: string;
        voiceName?: string;
        aqiData?: LiveAqiData | null;
        profile?: FamilyProfile | null;
        planHeadline?: string | null;
      };

      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (msg.type === 'setup') {
        void connectSession({
          voiceName: msg.voiceName,
          aqiData: msg.aqiData,
          profile: msg.profile,
          planHeadline: msg.planHeadline,
        }).catch(() => {});
        return;
      }

      if (msg.type === 'stop') {
        closed = true;
        if (activeSession) {
          try {
            activeSession.close();
          } catch {
            // Ignore teardown error
          }
          activeSession = null;
        }
        clientWs.close();
        return;
      }

      if (!sessionPromise) {
        void connectSession({}).catch(() => {});
      }

      if (msg.type === 'audio' && typeof msg.data === 'string' && msg.data.length > 0) {
        const audioData = msg.data;
        sessionPromise
          ?.then((session) => {
            if (!closed) {
              session.sendRealtimeInput({
                audio: { data: audioData, mimeType: 'audio/pcm;rate=16000' },
              });
            }
          })
          .catch(() => {});
      } else if (msg.type === 'text' && typeof msg.text === 'string' && msg.text.trim()) {
        const textPrompt = msg.text.trim();
        sessionPromise
          ?.then((session) => {
            if (!closed) {
              session.sendRealtimeInput({ text: textPrompt });
            }
          })
          .catch(() => {});
      }
    });

    clientWs.on('close', () => {
      closed = true;
      if (activeSession) {
        try {
          activeSession.close();
        } catch {
          // Ignore teardown error
        }
        activeSession = null;
      } else if (sessionPromise) {
        sessionPromise
          .then((session) => {
            try {
              session.close();
            } catch {
              // Ignore teardown error
            }
          })
          .catch(() => {});
      }
    });
  });
}

async function startServer() {
  const distPath = path.resolve(__dirname, 'dist');
  const distIndexPath = path.join(distPath, 'index.html');
  const hasBuiltDist = fs.existsSync(distIndexPath);
  const isDevCommand = process.env.npm_lifecycle_event === 'dev';
  const useProductionStatic =
    !isDevCommand &&
    hasBuiltDist &&
    (process.env.NODE_ENV === 'production' || Boolean(process.env.K_SERVICE));

  if (!useProductionStatic) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(distIndexPath);
    });
  }

  const httpServer = http.createServer(app);
  attachLiveVoiceWebSocket(httpServer);

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`VayuMitra AI server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
