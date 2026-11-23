export interface AqiCategoryMeta {
  label: string;
  shortLabel: string;
  level: 'good' | 'moderate' | 'sensitive' | 'unhealthy' | 'very-unhealthy' | 'hazardous';
  textClass: string;
  darkTextClass: string;
  surfaceClass: string;
  borderClass: string;
  barColor: string;
  strokeHex: string;
  healthNote: string;
}

export function getAqiCategory(aqi: number): AqiCategoryMeta {
  if (aqi <= 50) {
    return {
      label: 'Good',
      shortLabel: 'Good',
      level: 'good',
      textClass: 'text-emerald-700',
      darkTextClass: 'text-emerald-400',
      surfaceClass: 'bg-emerald-50',
      borderClass: 'border-emerald-200',
      barColor: 'bg-emerald-500',
      strokeHex: '#10b981',
      healthNote: 'Air quality is satisfactory with minimal pollution risk.',
    };
  }
  if (aqi <= 100) {
    return {
      label: 'Moderate',
      shortLabel: 'Moderate',
      level: 'moderate',
      textClass: 'text-amber-700',
      darkTextClass: 'text-amber-300',
      surfaceClass: 'bg-amber-50',
      borderClass: 'border-amber-200',
      barColor: 'bg-amber-500',
      strokeHex: '#f59e0b',
      healthNote: 'Acceptable air quality; unusually sensitive individuals should limit prolonged exertion.',
    };
  }
  if (aqi <= 150) {
    return {
      label: 'Unhealthy for Sensitive Groups',
      shortLabel: 'Sensitive Alert',
      level: 'sensitive',
      textClass: 'text-orange-700',
      darkTextClass: 'text-orange-400',
      surfaceClass: 'bg-orange-50',
      borderClass: 'border-orange-200',
      barColor: 'bg-orange-500',
      strokeHex: '#f97316',
      healthNote: 'Children, elderly, and asthma patients should limit outdoor exposure.',
    };
  }
  if (aqi <= 200) {
    return {
      label: 'Unhealthy',
      shortLabel: 'Unhealthy',
      level: 'unhealthy',
      textClass: 'text-red-700',
      darkTextClass: 'text-red-400',
      surfaceClass: 'bg-red-50',
      borderClass: 'border-red-200',
      barColor: 'bg-red-600',
      strokeHex: '#ef4444',
      healthNote: 'Everyone may experience airway irritation; wear N95 outdoors and keep windows closed.',
    };
  }
  if (aqi <= 300) {
    return {
      label: 'Very Unhealthy',
      shortLabel: 'Very Unhealthy',
      level: 'very-unhealthy',
      textClass: 'text-rose-800',
      darkTextClass: 'text-rose-400',
      surfaceClass: 'bg-rose-50',
      borderClass: 'border-rose-200',
      barColor: 'bg-rose-700',
      strokeHex: '#e11d48',
      healthNote: 'Severe smog risk across all age groups. Avoid outdoor exercise and seal indoor drafts.',
    };
  }
  return {
    label: 'Hazardous',
    shortLabel: 'Hazardous',
    level: 'hazardous',
    textClass: 'text-red-900',
    darkTextClass: 'text-red-300',
    surfaceClass: 'bg-red-100',
    borderClass: 'border-red-300',
    barColor: 'bg-red-900',
    strokeHex: '#991b1b',
    healthNote: 'Health emergency conditions. Remain indoors with active filtration or DIY air cleaning.',
  };
}

export function getWhoPm25Multiple(pm25: number): string {
  // WHO 2021 24-hour guideline for PM2.5 is 15 µg/m³
  const ratio = pm25 / 15;
  if (ratio <= 1) return 'Within WHO 24h guideline (15 µg/m³)';
  return `${ratio.toFixed(1)}× WHO 24h limit (15 µg/m³)`;
}

export function formatObservedTime(isoTime: string): string {
  if (!isoTime) return 'Live reading';
  const parts = isoTime.split('T');
  if (parts.length < 2) return isoTime;
  const [hourStr, minStr] = parts[1].split(':');
  const hour = parseInt(hourStr, 10);
  if (Number.isNaN(hour)) return isoTime;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${parts[0]} · ${hour12}:${minStr ?? '00'} ${suffix} local`;
}
