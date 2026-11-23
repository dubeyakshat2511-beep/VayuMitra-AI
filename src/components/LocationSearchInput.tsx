import { KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { Loader2, MapPin, Search } from 'lucide-react';
import type { LocationSelection } from '../types/vayu';

interface CuratedEntry extends LocationSelection {
  keywords?: string[];
}

const CURATED_LOCATIONS: CuratedEntry[] = [
  // Curated Indian Landmarks (also merged at top for 2+ char queries)
  {
    name: 'India Gate, New Delhi',
    displayName: 'India Gate, New Delhi',
    admin1: 'Delhi',
    country: 'India',
    latitude: 28.6129,
    longitude: 77.2295,
    isLandmark: true,
    keywords: ['delhi - india gate', 'india gate', 'delhi'],
  },
  {
    name: 'Connaught Place, New Delhi',
    displayName: 'Connaught Place, New Delhi',
    admin1: 'Delhi',
    country: 'India',
    latitude: 28.6315,
    longitude: 77.2167,
    isLandmark: true,
    keywords: ['cp', 'delhi', 'connaught place'],
  },
  {
    name: 'Anand Vihar, Delhi',
    displayName: 'Anand Vihar, Delhi',
    admin1: 'Delhi',
    country: 'India',
    latitude: 28.6469,
    longitude: 77.316,
    isLandmark: true,
    keywords: ['anand vihar', 'delhi'],
  },
  {
    name: 'IIT Kanpur, Kanpur',
    displayName: 'IIT Kanpur, Kanpur',
    admin1: 'Uttar Pradesh',
    country: 'India',
    latitude: 26.5123,
    longitude: 80.2329,
    isLandmark: true,
    keywords: ['iit kanpur', 'kalyanpur', 'kanpur'],
  },
  {
    name: 'Gomti Nagar, Lucknow',
    displayName: 'Gomti Nagar, Lucknow',
    admin1: 'Uttar Pradesh',
    country: 'India',
    latitude: 26.8496,
    longitude: 81.0072,
    isLandmark: true,
    keywords: ['gomti nagar', 'lucknow'],
  },
  {
    name: 'Cyber City, Gurugram',
    displayName: 'Cyber City, Gurugram',
    admin1: 'Haryana',
    country: 'India',
    latitude: 28.4949,
    longitude: 77.0895,
    isLandmark: true,
    keywords: ['dlf cyber city', 'cyber hub', 'gurugram', 'gurgaon'],
  },
  {
    name: 'Taj Mahal, Agra',
    displayName: 'Taj Mahal, Agra',
    admin1: 'Uttar Pradesh',
    country: 'India',
    latitude: 27.1751,
    longitude: 78.0421,
    isLandmark: true,
    keywords: ['taj mahal', 'agra'],
  },
  {
    name: 'Gateway of India, Mumbai',
    displayName: 'Gateway of India, Mumbai',
    admin1: 'Maharashtra',
    country: 'India',
    latitude: 18.922,
    longitude: 72.8347,
    isLandmark: true,
    keywords: ['gateway of india', 'colaba', 'mumbai'],
  },
  {
    name: 'Marine Drive, Mumbai',
    displayName: 'Marine Drive, Mumbai',
    admin1: 'Maharashtra',
    country: 'India',
    latitude: 18.9432,
    longitude: 72.8235,
    isLandmark: true,
    keywords: ['marine drive', 'mumbai'],
  },
  {
    name: 'Howrah Bridge, Kolkata',
    displayName: 'Howrah Bridge, Kolkata',
    admin1: 'West Bengal',
    country: 'India',
    latitude: 22.5851,
    longitude: 88.3468,
    isLandmark: true,
    keywords: ['howrah', 'kolkata'],
  },
  {
    name: 'Dashashwamedh Ghat, Varanasi',
    displayName: 'Dashashwamedh Ghat, Varanasi',
    admin1: 'Uttar Pradesh',
    country: 'India',
    latitude: 25.3065,
    longitude: 83.0104,
    isLandmark: true,
    keywords: ['ghat', 'kashi', 'varanasi'],
  },

  // Curated Major Indian Cities & States
  {
    name: 'Delhi',
    displayName: 'Delhi, India',
    admin1: 'Delhi',
    country: 'India',
    latitude: 28.6519,
    longitude: 77.2315,
    keywords: ['delhi ncr'],
  },
  {
    name: 'New Delhi',
    displayName: 'New Delhi, Delhi',
    admin1: 'Delhi',
    country: 'India',
    latitude: 28.6139,
    longitude: 77.209,
    keywords: ['delhi ncr', 'capital'],
  },
  {
    name: 'Kanpur',
    displayName: 'Kanpur, Uttar Pradesh',
    admin1: 'Uttar Pradesh',
    country: 'India',
    latitude: 26.4499,
    longitude: 80.3319,
  },
  {
    name: 'Lucknow',
    displayName: 'Lucknow, Uttar Pradesh',
    admin1: 'Uttar Pradesh',
    country: 'India',
    latitude: 26.8467,
    longitude: 80.9462,
  },
  {
    name: 'Mumbai',
    displayName: 'Mumbai, Maharashtra',
    admin1: 'Maharashtra',
    country: 'India',
    latitude: 19.076,
    longitude: 72.8777,
    keywords: ['bombay'],
  },
  {
    name: 'Gurugram',
    displayName: 'Gurugram, Haryana',
    admin1: 'Haryana',
    country: 'India',
    latitude: 28.4595,
    longitude: 77.0266,
    keywords: ['gurgaon', 'ncr'],
  },
  {
    name: 'Noida',
    displayName: 'Noida, Uttar Pradesh',
    admin1: 'Uttar Pradesh',
    country: 'India',
    latitude: 28.5355,
    longitude: 77.391,
    keywords: ['greater noida', 'ncr'],
  },
  {
    name: 'Bengaluru',
    displayName: 'Bengaluru, Karnataka',
    admin1: 'Karnataka',
    country: 'India',
    latitude: 12.9716,
    longitude: 77.5946,
    keywords: ['bangalore'],
  },
  {
    name: 'Kolkata',
    displayName: 'Kolkata, West Bengal',
    admin1: 'West Bengal',
    country: 'India',
    latitude: 22.5726,
    longitude: 88.3639,
    keywords: ['calcutta'],
  },
  {
    name: 'Patna',
    displayName: 'Patna, Bihar',
    admin1: 'Bihar',
    country: 'India',
    latitude: 25.5941,
    longitude: 85.1376,
  },
  {
    name: 'Chandigarh',
    displayName: 'Chandigarh, India',
    admin1: 'Chandigarh',
    country: 'India',
    latitude: 30.7333,
    longitude: 76.7794,
  },
  {
    name: 'Jaipur',
    displayName: 'Jaipur, Rajasthan',
    admin1: 'Rajasthan',
    country: 'India',
    latitude: 26.9124,
    longitude: 75.7873,
  },
  {
    name: 'Varanasi',
    displayName: 'Varanasi, Uttar Pradesh',
    admin1: 'Uttar Pradesh',
    country: 'India',
    latitude: 25.3176,
    longitude: 82.9739,
    keywords: ['banaras', 'kashi'],
  },
  {
    name: 'Agra',
    displayName: 'Agra, Uttar Pradesh',
    admin1: 'Uttar Pradesh',
    country: 'India',
    latitude: 27.1767,
    longitude: 78.0081,
  },
  {
    name: 'Ahmedabad',
    displayName: 'Ahmedabad, Gujarat',
    admin1: 'Gujarat',
    country: 'India',
    latitude: 23.0225,
    longitude: 72.5714,
  },
  {
    name: 'Amritsar',
    displayName: 'Amritsar, Punjab',
    admin1: 'Punjab',
    country: 'India',
    latitude: 31.634,
    longitude: 74.8723,
  },
  {
    name: 'Bhopal',
    displayName: 'Bhopal, Madhya Pradesh',
    admin1: 'Madhya Pradesh',
    country: 'India',
    latitude: 23.2599,
    longitude: 77.4126,
  },
  {
    name: 'Chennai',
    displayName: 'Chennai, Tamil Nadu',
    admin1: 'Tamil Nadu',
    country: 'India',
    latitude: 13.0827,
    longitude: 80.2707,
  },
  {
    name: 'Faridabad',
    displayName: 'Faridabad, Haryana',
    admin1: 'Haryana',
    country: 'India',
    latitude: 28.4089,
    longitude: 77.3178,
  },
  {
    name: 'Ghaziabad',
    displayName: 'Ghaziabad, Uttar Pradesh',
    admin1: 'Uttar Pradesh',
    country: 'India',
    latitude: 28.6692,
    longitude: 77.4538,
  },
  {
    name: 'Hyderabad',
    displayName: 'Hyderabad, Telangana',
    admin1: 'Telangana',
    country: 'India',
    latitude: 17.385,
    longitude: 78.4867,
  },
  {
    name: 'Indore',
    displayName: 'Indore, Madhya Pradesh',
    admin1: 'Madhya Pradesh',
    country: 'India',
    latitude: 22.7196,
    longitude: 75.8577,
  },
  {
    name: 'Prayagraj',
    displayName: 'Prayagraj, Uttar Pradesh',
    admin1: 'Uttar Pradesh',
    country: 'India',
    latitude: 25.4358,
    longitude: 81.8463,
    keywords: ['allahabad'],
  },
  {
    name: 'Pune',
    displayName: 'Pune, Maharashtra',
    admin1: 'Maharashtra',
    country: 'India',
    latitude: 18.5204,
    longitude: 73.8567,
  },
  {
    name: 'Surat',
    displayName: 'Surat, Gujarat',
    admin1: 'Gujarat',
    country: 'India',
    latitude: 21.1702,
    longitude: 72.8311,
  },

  // Global Cities for broad 1-character prefix coverage
  {
    name: 'Beijing',
    displayName: 'Beijing, China',
    admin1: 'Beijing',
    country: 'China',
    latitude: 39.9042,
    longitude: 116.4074,
  },
  {
    name: 'Dhaka',
    displayName: 'Dhaka, Bangladesh',
    admin1: 'Dhaka Division',
    country: 'Bangladesh',
    latitude: 23.8103,
    longitude: 90.4125,
  },
  {
    name: 'Kathmandu',
    displayName: 'Kathmandu, Nepal',
    admin1: 'Bagmati Province',
    country: 'Nepal',
    latitude: 27.7172,
    longitude: 85.324,
  },
  {
    name: 'Lahore',
    displayName: 'Lahore, Pakistan',
    admin1: 'Punjab',
    country: 'Pakistan',
    latitude: 31.5204,
    longitude: 74.3587,
  },
  {
    name: 'London',
    displayName: 'London, United Kingdom',
    admin1: 'England',
    country: 'United Kingdom',
    latitude: 51.5072,
    longitude: -0.1276,
  },
  {
    name: 'Los Angeles',
    displayName: 'Los Angeles, California',
    admin1: 'California',
    country: 'United States',
    latitude: 34.0522,
    longitude: -118.2437,
  },
  {
    name: 'New York',
    displayName: 'New York, United States',
    admin1: 'New York',
    country: 'United States',
    latitude: 40.7128,
    longitude: -74.006,
  },
  {
    name: 'Paris',
    displayName: 'Paris, France',
    admin1: 'Île-de-France',
    country: 'France',
    latitude: 48.8566,
    longitude: 2.3522,
  },
  {
    name: 'Singapore',
    displayName: 'Singapore',
    admin1: 'Central Singapore',
    country: 'Singapore',
    latitude: 1.3521,
    longitude: 103.8198,
  },
  {
    name: 'Tokyo',
    displayName: 'Tokyo, Japan',
    admin1: 'Tokyo',
    country: 'Japan',
    latitude: 35.6762,
    longitude: 139.6503,
  },
];

interface OpenMeteoGeoResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
}

function matchSingleCharPrefix(charLower: string): LocationSelection[] {
  return CURATED_LOCATIONS.filter((item) => {
    if (item.name.toLowerCase().startsWith(charLower)) return true;
    if (item.admin1?.toLowerCase().startsWith(charLower)) return true;
    if (item.keywords?.some((k) => k.toLowerCase().startsWith(charLower))) return true;
    return false;
  }).slice(0, 8);
}

function matchLocalLandmarks(queryLower: string): LocationSelection[] {
  return CURATED_LOCATIONS.filter((item) => {
    if (!item.isLandmark) return false;
    const haystack = [item.name, item.admin1 ?? '', ...(item.keywords ?? [])]
      .join(' ')
      .toLowerCase();
    return haystack.includes(queryLower);
  }).slice(0, 3);
}

function formatSubtitle(item: LocationSelection): string {
  const parts = [item.admin1, item.country].filter(Boolean);
  return parts.join(', ');
}

interface LocationSearchInputProps {
  value: string;
  onChange: (nextVal: string) => void;
  onSelectLocation: (loc: LocationSelection) => void;
}

export function LocationSearchInput({
  value,
  onChange,
  onSelectLocation,
}: LocationSearchInputProps) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const userTypingRef = useRef(false);

  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<LocationSelection[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Close dropdown on click outside
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Debounced 250ms autocomplete search when user types 1+ characters
  useEffect(() => {
    if (!userTypingRef.current) {
      return;
    }

    const trimmed = value.trim();
    if (trimmed.length === 0) {
      setSuggestions([]);
      setIsOpen(false);
      setIsSearching(false);
      setActiveIndex(-1);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const lower = trimmed.toLowerCase();

      if (trimmed.length === 1) {
        const localMatches = matchSingleCharPrefix(lower);
        setSuggestions(localMatches);
        setIsOpen(localMatches.length > 0);
        setActiveIndex(localMatches.length > 0 ? 0 : -1);
        setIsSearching(false);
        return;
      }

      // 2 or more characters: query Open-Meteo Geocoding API + merge matching local landmarks at top
      setIsSearching(true);
      const landmarkMatches = matchLocalLandmarks(lower);

      try {
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
          trimmed
        )}&count=8&language=en&format=json`;
        const response = await fetch(url, { signal: controller.signal });
        let remoteSuggestions: LocationSelection[] = [];

        if (response.ok) {
          const data = (await response.json()) as { results?: OpenMeteoGeoResult[] };
          remoteSuggestions = (data.results ?? []).map((r) => ({
            name: r.name,
            displayName: [r.name, r.admin1, r.country].filter(Boolean).slice(0, 2).join(', '),
            admin1: r.admin1,
            country: r.country,
            latitude: r.latitude,
            longitude: r.longitude,
          }));
        }

        // Merge local landmarks at top, then deduplicate remote entries
        const seen = new Set<string>();
        const merged: LocationSelection[] = [];

        for (const item of [...landmarkMatches, ...remoteSuggestions]) {
          const key = `${item.name.toLowerCase()}|${(item.admin1 ?? '').toLowerCase()}|${(
            item.country ?? ''
          ).toLowerCase()}`;
          if (!seen.has(key)) {
            seen.add(key);
            merged.push(item);
          }
        }

        // Fallback to curated cities if remote returned nothing (e.g. partial compound query like "Kanpur, U")
        if (merged.length === 0) {
          const curatedFallback = CURATED_LOCATIONS.filter((c) => {
            const hay = `${c.name} ${c.admin1 ?? ''} ${c.country ?? ''} ${(c.keywords ?? []).join(' ')}`.toLowerCase();
            return hay.includes(lower);
          }).slice(0, 8);
          merged.push(...curatedFallback);
        }

        setSuggestions(merged.slice(0, 8));
        setIsOpen(merged.length > 0);
        setActiveIndex(merged.length > 0 ? 0 : -1);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        // Graceful fallback to curated matches on transient network error
        const fallback = CURATED_LOCATIONS.filter((c) => {
          const hay = `${c.name} ${c.admin1 ?? ''} ${c.country ?? ''} ${(c.keywords ?? []).join(' ')}`.toLowerCase();
          return hay.includes(lower);
        }).slice(0, 8);
        setSuggestions(fallback);
        setIsOpen(fallback.length > 0);
        setActiveIndex(fallback.length > 0 ? 0 : -1);
      } finally {
        if (!controller.signal.aborted) {
          setIsSearching(false);
        }
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  const handleSelect = (loc: LocationSelection) => {
    userTypingRef.current = false;
    setIsOpen(false);
    setActiveIndex(-1);
    onChange(loc.displayName);
    onSelectLocation(loc);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (isOpen) {
        e.preventDefault();
        setIsOpen(false);
        setActiveIndex(-1);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      if (suggestions.length === 0) return;
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setActiveIndex(0);
      } else {
        setActiveIndex((prev) => (prev + 1) % suggestions.length);
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      if (suggestions.length === 0) return;
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setActiveIndex(suggestions.length - 1);
      } else {
        setActiveIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
      }
      return;
    }

    if (e.key === 'Enter' && isOpen && activeIndex >= 0 && suggestions[activeIndex]) {
      e.preventDefault();
      handleSelect(suggestions[activeIndex]);
    }
  };

  return (
    <div ref={containerRef} className="relative flex-1">
      <Search
        className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
        aria-hidden="true"
      />
      <input
        id="city-search-input"
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-activedescendant={
          isOpen && activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined
        }
        autoComplete="off"
        value={value}
        onChange={(e) => {
          userTypingRef.current = true;
          onChange(e.target.value);
        }}
        onKeyDown={handleKeyDown}
        placeholder="Enter city or locality (e.g., Kanpur, Uttar Pradesh)"
        className="w-full h-11 pl-10 pr-9 bg-slate-950/90 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 transition-colors"
      />
      {isSearching && (
        <Loader2
          className="w-4 h-4 text-emerald-400 animate-spin absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
          aria-label="Searching locations"
        />
      )}

      {isOpen && suggestions.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Location suggestions"
          className="absolute left-0 right-0 top-full mt-1.5 z-50 max-h-72 overflow-y-auto rounded-lg bg-slate-950 border border-slate-700 shadow-xl divide-y divide-slate-800/80"
        >
          {suggestions.map((loc, idx) => {
            const isActive = idx === activeIndex;
            const subtitle = formatSubtitle(loc);
            return (
              <li
                key={`${loc.name}-${loc.latitude}-${loc.longitude}-${idx}`}
                id={`${listboxId}-opt-${idx}`}
                role="option"
                aria-selected={isActive}
              >
                <button
                  type="button"
                  onMouseDown={(e) => {
                    // Prevent input blur from firing before selection
                    e.preventDefault();
                    handleSelect(loc);
                  }}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className={`w-full text-left px-3.5 py-2.5 flex items-center gap-3 transition-colors duration-100 cursor-pointer ${
                    isActive
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <MapPin
                    className={`w-4 h-4 shrink-0 ${
                      loc.isLandmark || isActive ? 'text-emerald-400' : 'text-slate-500'
                    }`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    <span className="font-semibold text-white">{loc.name}</span>
                    {subtitle && (
                      <>
                        <span className="text-slate-500 mx-1.5" aria-hidden="true">
                          —
                        </span>
                        <span className="text-xs text-slate-400">{subtitle}</span>
                      </>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
