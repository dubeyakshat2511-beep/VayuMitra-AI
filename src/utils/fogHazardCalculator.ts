import type { CommuteOption, LiveWeatherSnapshot } from '../types/vayu';

/** Qualitative winter fog & smog-haze visibility classification. */
export type FogSeverityTier =
  | 'Clear'
  | 'Haze / Mist'
  | 'Moderate Fog'
  | 'Dense Fog'
  | 'Zero-Visibility Smog-Fog';

/** Qualitative road surface pothole-avoidance and emergency braking risk tier. */
export type PotholeBrakingRisk = 'Low' | 'Moderate' | 'High' | 'Extreme';

/** Input meteorological and particulate parameters for {@link calculateFogHazard}. */
export interface FogHazardInput {
  /** Ambient air temperature in °C. */
  temperatureC: number;
  /** Dew point temperature in °C (optional; estimated via Magnus formula if omitted). */
  dewPointC?: number | null;
  /** Relative humidity percentage (0–100). */
  relativeHumidityPct: number;
  /** Near-surface wind speed in km/h (calm winds < 8 km/h intensify fog trapping). */
  windSpeedKmh: number;
  /** Live ambient PM2.5 concentration in µg/m³ (hygroscopic smog-fog nuclei). */
  pm25: number;
  /** Primary user commute mode to calibrate safe speed cap and braking guidance. */
  commute?: CommuteOption;
  /** Optional direct visibility measurement/model value from Open-Meteo in meters. */
  reportedVisibilityMeters?: number | null;
}

/** Structured output produced by {@link calculateFogHazard}. */
export interface FogHazardAssessment {
  /** Estimated effective road visibility in meters (20 m to 10,000 m). */
  estimatedVisibilityMeters: number;
  /** Temperature minus dew point spread in °C (values <= 2 °C indicate fog saturation). */
  dewPointSpreadC: number;
  /** Computed or supplied dew point temperature in °C. */
  dewPointC: number;
  /** Classified winter fog severity tier. */
  fogSeverity: FogSeverityTier;
  /** Recommended maximum safe road speed in km/h. */
  safeSpeedCapKmh: number;
  /** Estimated cold/damp road stopping distance (reaction + braking) in meters at the speed cap. */
  stoppingDistanceMeters: number;
  /** Risk level for late pothole detection and sudden braking. */
  potholeBrakingRisk: PotholeBrakingRisk;
  /** Plain-language commuter road hazard summary. */
  summary: string;
  /** Actionable fog & pothole defensive driving checklist tailored to the commute mode. */
  commuterTips: string[];
}

/**
 * Estimates dew point temperature (°C) from ambient temperature (°C) and
 * relative humidity (%) using the August-Roche-Magnus approximation.
 */
export function estimateDewPointC(temperatureC: number, relativeHumidityPct: number): number {
  const safeTemp = Number.isFinite(temperatureC) ? temperatureC : 15;
  const clampedRh = Math.min(
    100,
    Math.max(1, Number.isFinite(relativeHumidityPct) ? relativeHumidityPct : 60)
  );
  const a = 17.625;
  const b = 243.04;
  const alpha = Math.log(clampedRh / 100) + (a * safeTemp) / (b + safeTemp);
  const dewPoint = (b * alpha) / (a - alpha);
  return Number(dewPoint.toFixed(1));
}

/**
 * Provides a conservative winter Indo-Gangetic weather fallback when live
 * Open-Meteo weather readings are temporarily absent from a telemetry payload.
 */
export function buildFallbackWeatherSnapshot(pm25: number): LiveWeatherSnapshot {
  const safePm25 = Number.isFinite(pm25) && pm25 >= 0 ? pm25 : 80;
  const humidity = safePm25 >= 150 ? 88 : safePm25 >= 80 ? 78 : 62;
  const temp = safePm25 >= 150 ? 11 : 16;
  return {
    temperatureC: temp,
    dewPointC: estimateDewPointC(temp, humidity),
    relativeHumidityPct: humidity,
    windSpeedKmh: safePm25 >= 150 ? 4.5 : 8.0,
    reportedVisibilityMeters: null,
  };
}

/**
 * Calculates estimated stopping distance (reaction + damp-pavement braking) in meters
 * for a given vehicle speed in km/h.
 */
export function calculateStoppingDistanceMeters(speedKmh: number, isWetOrFoggy: boolean): number {
  const safeSpeed = Math.max(0, Number.isFinite(speedKmh) ? speedKmh : 0);
  const speedMs = safeSpeed / 3.6;
  const reactionTimeSec = isWetOrFoggy ? 1.5 : 1.1;
  const frictionCoeff = isWetOrFoggy ? 0.45 : 0.65;
  const g = 9.81;
  const reactionDist = speedMs * reactionTimeSec;
  const brakingDist = (speedMs * speedMs) / (2 * frictionCoeff * g);
  return Math.round(reactionDist + brakingDist);
}

/**
 * Evaluates winter smog-fog visibility, severity tier, safe speed cap, and
 * pothole-braking hazard risk from meteorological parameters and live PM2.5.
 */
export function calculateFogHazard(input: FogHazardInput): FogHazardAssessment {
  const temperatureC = Number.isFinite(input.temperatureC) ? input.temperatureC : 15;
  const relativeHumidityPct = Math.min(
    100,
    Math.max(1, Number.isFinite(input.relativeHumidityPct) ? input.relativeHumidityPct : 65)
  );
  const windSpeedKmh = Math.max(
    0,
    Number.isFinite(input.windSpeedKmh) ? input.windSpeedKmh : 6
  );
  const pm25 = Math.max(0, Number.isFinite(input.pm25) ? input.pm25 : 0);

  const dewPointC =
    typeof input.dewPointC === 'number' && Number.isFinite(input.dewPointC)
      ? Number(input.dewPointC.toFixed(1))
      : estimateDewPointC(temperatureC, relativeHumidityPct);

  const dewPointSpreadC = Number(Math.max(0, temperatureC - dewPointC).toFixed(1));

  // Base meteorological visibility (meters) from dew-point saturation and relative humidity
  let modeledVisibility = 8000;
  if (dewPointSpreadC <= 0.8 && relativeHumidityPct >= 95) {
    modeledVisibility = 45;
  } else if (dewPointSpreadC <= 1.5 && relativeHumidityPct >= 90) {
    modeledVisibility = 120;
  } else if (dewPointSpreadC <= 2.5 && relativeHumidityPct >= 84) {
    modeledVisibility = 280;
  } else if (dewPointSpreadC <= 4.0 && relativeHumidityPct >= 75) {
    modeledVisibility = 750;
  } else if (dewPointSpreadC <= 6.5 && relativeHumidityPct >= 65) {
    modeledVisibility = 1800;
  } else {
    modeledVisibility = 6000;
  }

  // Calm winds (< 8 km/h) suppress vertical mixing and trap radiative fog near roads
  if (windSpeedKmh < 5 && relativeHumidityPct >= 80) {
    modeledVisibility *= 0.7;
  } else if (windSpeedKmh < 8 && relativeHumidityPct >= 75) {
    modeledVisibility *= 0.85;
  } else if (windSpeedKmh >= 18) {
    modeledVisibility *= 1.35;
  }

  // Hygroscopic PM2.5 scattering drastically reduces optical range in humid winter air
  const hygroscopicMultiplier =
    relativeHumidityPct >= 85 ? 1.45 : relativeHumidityPct >= 70 ? 1.15 : 0.85;
  const pm25VisibilityCeiling =
    pm25 > 5 ? Math.round(75000 / (pm25 * hygroscopicMultiplier)) : 10000;

  let estimatedVisibilityMeters = Math.min(modeledVisibility, pm25VisibilityCeiling);

  // Blend conservatively with live Open-Meteo visibility when provided
  if (
    typeof input.reportedVisibilityMeters === 'number' &&
    Number.isFinite(input.reportedVisibilityMeters) &&
    input.reportedVisibilityMeters > 0
  ) {
    estimatedVisibilityMeters = Math.min(
      estimatedVisibilityMeters,
      input.reportedVisibilityMeters * 1.1
    );
  }

  estimatedVisibilityMeters = Math.max(
    20,
    Math.min(10000, Math.round(estimatedVisibilityMeters))
  );

  const isTwoWheeler = input.commute === 'Two-Wheeler (Bike/Scooter)';
  const isAuto = input.commute === 'Auto/E-Rickshaw';

  let fogSeverity: FogSeverityTier;
  let safeSpeedCapKmh: number;
  let potholeBrakingRisk: PotholeBrakingRisk;

  if (estimatedVisibilityMeters <= 50) {
    fogSeverity = 'Zero-Visibility Smog-Fog';
    safeSpeedCapKmh = isTwoWheeler || isAuto ? 15 : 20;
    potholeBrakingRisk = 'Extreme';
  } else if (estimatedVisibilityMeters <= 200) {
    fogSeverity = 'Dense Fog';
    safeSpeedCapKmh = isTwoWheeler || isAuto ? 25 : 30;
    potholeBrakingRisk = 'Extreme';
  } else if (estimatedVisibilityMeters <= 500) {
    fogSeverity = 'Moderate Fog';
    safeSpeedCapKmh = isTwoWheeler || isAuto ? 35 : 45;
    potholeBrakingRisk = 'High';
  } else if (estimatedVisibilityMeters <= 1500) {
    fogSeverity = 'Haze / Mist';
    safeSpeedCapKmh = isTwoWheeler || isAuto ? 45 : 55;
    potholeBrakingRisk = 'Moderate';
  } else {
    fogSeverity = 'Clear';
    safeSpeedCapKmh = isTwoWheeler || isAuto ? 50 : 60;
    potholeBrakingRisk = 'Low';
  }

  const isFoggy = estimatedVisibilityMeters <= 500;
  const stoppingDistanceMeters = calculateStoppingDistanceMeters(safeSpeedCapKmh, isFoggy);

  const summary =
    estimatedVisibilityMeters <= 200
      ? `${fogSeverity} (~${estimatedVisibilityMeters} m visibility, ${relativeHumidityPct}% RH, PM2.5 ${pm25.toFixed(
          1
        )} µg/m³). Cap speed at ${safeSpeedCapKmh} km/h—potholes and unmarked speed-breakers appear within ${stoppingDistanceMeters} m of braking distance.`
      : estimatedVisibilityMeters <= 1500
        ? `${fogSeverity} (~${estimatedVisibilityMeters} m visibility). Keep speed under ${safeSpeedCapKmh} km/h and leave extra braking margin for shadowed potholes.`
        : `Clear surface visibility (~${estimatedVisibilityMeters} m). Maintain standard defensive speed (${safeSpeedCapKmh} km/h cap) and watch for morning dew patches.`;

  const commuterTips: string[] = [
    isFoggy
      ? 'Use low-beam headlights and yellow fog lamps only—high beams reflect off water/PM2.5 droplets and blind pothole contrast.'
      : 'Keep headlights on low beam during early-morning or dusk haze to improve oncoming visibility.',
    isTwoWheeler
      ? `Avoid sudden front-brake grabs over damp winter roads; scan 3–4 seconds ahead and cap speed at ${safeSpeedCapKmh} km/h with an anti-fog visor.`
      : `Maintain a ${Math.max(4, Math.ceil(stoppingDistanceMeters / 6))}-second following gap and keep cabin AC on recirculate + defogger to prevent windshield misting.`,
    potholeBrakingRisk === 'Extreme' || potholeBrakingRisk === 'High'
      ? 'Track painted left-edge lane markings rather than overtaking blind; defer pre-9 AM highway trips until solar warming lifts the fog.'
      : 'Watch for damp shaded intersections and uneven road shoulders near construction zones.',
  ];

  return {
    estimatedVisibilityMeters,
    dewPointSpreadC,
    dewPointC,
    fogSeverity,
    safeSpeedCapKmh,
    stoppingDistanceMeters,
    potholeBrakingRisk,
    summary,
    commuterTips,
  };
}
