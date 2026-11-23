import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import type {
  FamilyProfile,
  HourlyAqiPoint,
  LiveAqiData,
  SafeOutdoorWindow,
  SmogActionPlan,
} from './src/types/vayu.ts';
import {
  buildLocalSmogPlan,
  buildLocalVoiceBriefing,
} from './src/utils/localFallbackPlan.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const app = express();
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
  const resp = await fetch(url);
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
  const city = typeof req.query.city === 'string' ? req.query.city.trim() : '';
  const latParam = typeof req.query.lat === 'string' ? Number(req.query.lat) : Number.NaN;
  const lonParam = typeof req.query.lon === 'string' ? Number(req.query.lon) : Number.NaN;
  const hasExactCoords =
    Number.isFinite(latParam) &&
    Number.isFinite(lonParam) &&
    latParam >= -90 &&
    latParam <= 90 &&
    lonParam >= -180 &&
    lonParam <= 180;

  if (!hasExactCoords && (!city || city.length < 2)) {
    res.status(400).json({ error: 'Please provide a valid city, locality name, or coordinates.' });
    return;
  }

  try {
    let geo: GeoResult;
    let displayName: string;

    if (hasExactCoords) {
      const nameParam =
        typeof req.query.displayName === 'string' && req.query.displayName.trim()
          ? req.query.displayName.trim()
          : city || `${latParam.toFixed(2)}, ${lonParam.toFixed(2)}`;
      const admin1Param =
        typeof req.query.admin1 === 'string' && req.query.admin1.trim()
          ? req.query.admin1.trim()
          : undefined;
      const countryParam =
        typeof req.query.country === 'string' && req.query.country.trim()
          ? req.query.country.trim()
          : undefined;

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

    const aqResp = await fetch(aqUrl);
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
      safeWindow,
      hourly,
    };

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
  ],
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
  const { aqiData, profile, isRetry } = req.body as {
    aqiData?: LiveAqiData;
    profile?: FamilyProfile;
    isRetry?: boolean;
  };

  if (!aqiData || !profile || !Array.isArray(profile.members) || profile.members.length === 0) {
    res.status(400).json({
      error: 'Missing live AQI telemetry or family profile selections.',
    });
    return;
  }

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

  const prompt = `Generate a personalized Winter Smog Action Plan JSON for this exact household and live air quality reading:

LOCATION & LIVE TELEMETRY (Open-Meteo):
- City/Locality: ${aqiData.displayName} (Lat ${aqiData.latitude}, Lon ${aqiData.longitude})
- Current US AQI: ${aqiData.current.usAqi}
- Current PM2.5: ${aqiData.current.pm25} µg/m³ (WHO 24h limit is 15 µg/m³)
- Current PM10: ${aqiData.current.pm10} µg/m³
- Computed Safest Daytime Window: ${aqiData.safeWindow.windowLabel} (Forecast Avg AQI: ${aqiData.safeWindow.avgAqi}, Avg PM2.5: ${aqiData.safeWindow.avgPm25} µg/m³)
- 24-Hour Trend (3-hr samples): ${hourlySummary}

HOUSEHOLD & LIFESTYLE PROFILE:
- Household Members: ${profile.members.join(', ')}
- Primary Daily Commute: ${profile.commute}
- Home Air Setup: ${profile.homeSetup}
- Preferred Language for Sharing: ${profile.language}

REQUIREMENTS FOR THE 6 SECTIONS:
1. dailyRoutine: Exactly 4 objects in chronological order: "Morning", "Afternoon", "Evening", "Night". Explicitly reference winter temperature inversion dynamics (early morning & post-sunset inversion trapping smog near ground vs afternoon solar mixing lifting the boundary layer) and align ventilation timing with today's actual Safest Window (${aqiData.safeWindow.windowLabel}). Tailor activities to ${profile.members.join(', ')} and their ${profile.commute} commute.
2. indoorHacks: Exactly 4 practical, budget-friendly hacks tailored specifically to "${profile.homeSetup}". Include realistic estimatedPm25ReductionPct numbers (e.g. wet-mopping instead of dry jhadu/sweeping, DIY box-fan MERV-13 filter or HEPA placement optimization, damp cloth/weatherstrip door-gap sealing, kitchen exhaust/tadka fume control, or low-maintenance indoor plants as secondary support).
3. sustainableSwaps: Exactly 3 swaps with categories "Commute", "Cooking", and "Waste" (one for each category). Tailor the Commute swap specifically to "${profile.commute}". Provide realistic numeric weeklyCo2SavedKg and weeklyPm25NoxPreventedGrams, plus a clear lungHealthBenefit explaining how reducing these local emissions protects the airways of ${profile.members.join(', ')}.
4. communityAlert: A ready-to-copy 4-line WhatsApp/Society RWA notice ("lines" array must have exactly 4 concise lines) mentioning ${aqiData.displayName}, today's US AQI (${aqiData.current.usAqi}) and PM2.5 (${aqiData.current.pm25} µg/m³), advising vulnerable residents indoors, and strongly discouraging open leaf/garbage/bonfire burning in the society.
5. healthYoga (Indoor Lung-Care Yoga & Pranayama — Respiratory Recovery & Lung Detox):
   - Tailor guidance for ${profile.members.join(', ')} at US AQI ${aqiData.current.usAqi} (PM2.5 ${aqiData.current.pm25} µg/m³) with home setup "${profile.homeSetup}".
   - Provide EXACTLY 6 sessions:
     * Under categoryGroup "Pranayama (Breathwork)" (sessionType "Pranayama"):
       1) Nadi Shodhana (Alternate Nostril Breathing) — airway balance & stress reduction
       2) Bhramari Pranayama (Humming Bee Breath) — sinus & throat soothing
       3) Diaphragmatic Belly Breathing — gentle deep lower-lobe lung recovery
     * Under categoryGroup "Chest-Opening Asanas" (sessionType "Restorative"):
       4) Bhujangasana (Cobra Pose) — expands chest capacity & eases shallow breathing
       5) Matsyasana (Fish Pose) — supported ribcage expansion
       6) Setu Bandhasana (Bridge Pose) — opens chest & relieves respiratory tension
   - If AQI > 200 or Asthma/Elderly are in the household, keep breath holds gentle (0–2s) and explicitly warn against forceful rapid breathing (Kapalabhati or Bhastrika) in unfiltered air.
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
   - Provide realistic pacerConfig values (inhaleSec 3–5, holdSec 0–4, exhaleSec 4–8) suitable for each practice.`;

  try {
    const { response } = await generateWithModelFallback(
      ai,
      prompt,
      systemInstruction,
      smogPlanResponseSchema
    );
    const rawText = (response.text ?? '').trim();
    if (!rawText) {
      throw new Error('Empty response received from Gemini.');
    }

    const parsed = JSON.parse(rawText) as Omit<SmogActionPlan, 'generatedAt'>;
    const plan: SmogActionPlan = {
      ...parsed,
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
5. Brief mention of either ${topRoutine ? `morning guidance (${topRoutine.ventilationAction})` : 'ventilation timing'} or ${topYoga ? `gentle indoor ${topYoga.name}` : 'indoor lung care'}.

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

async function startServer() {
  const isProduction =
    process.env.NODE_ENV === 'production' || Boolean(process.env.K_SERVICE);

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VayuMitra AI server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
