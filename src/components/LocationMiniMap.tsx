import { useEffect, useState } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  Map as GoogleMap,
  Pin,
  useMap,
} from '@vis.gl/react-google-maps';
import type { MapMouseEvent } from '@vis.gl/react-google-maps';
import { Crosshair, MapPin, X } from 'lucide-react';
import type { LocationSelection } from '../types/vayu';

interface CameraControllerProps {
  lat: number;
  lng: number;
  zoom: number;
}

function CameraController({ lat, lng, zoom }: CameraControllerProps) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    map.panTo({ lat, lng });
    map.setZoom(zoom);
  }, [map, lat, lng, zoom]);

  return null;
}

interface LocationMiniMapProps {
  location: LocationSelection;
  onPinCoordinateClick?: (lat: number, lng: number) => void;
  onClose: () => void;
}

export function LocationMiniMap({
  location,
  onPinCoordinateClick,
  onClose,
}: LocationMiniMapProps) {
  const envKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ?? '';
  const [apiKey, setApiKey] = useState<string>(envKey);
  const [isLoadingKey, setIsLoadingKey] = useState<boolean>(!envKey);
  const [mapLoadError, setMapLoadError] = useState<string | null>(null);
  const [recenterNonce, setRecenterNonce] = useState<number>(0);

  useEffect(() => {
    if (envKey) {
      setApiKey(envKey);
      setIsLoadingKey(false);
      return;
    }

    let cancelled = false;
    fetch('/api/maps-config')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Config fetch failed'))))
      .then((data: { apiKey?: string }) => {
        if (!cancelled) {
          setApiKey(data.apiKey ?? '');
          setIsLoadingKey(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsLoadingKey(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [envKey]);

  const zoomLevel = location.isLandmark ? 14 : 11;
  const center = { lat: location.latitude, lng: location.longitude };

  const handleMapClick = (event: MapMouseEvent) => {
    const latLng = event.detail.latLng;
    if (!latLng || !onPinCoordinateClick) return;
    onPinCoordinateClick(
      Number(latLng.lat.toFixed(4)),
      Number(latLng.lng.toFixed(4))
    );
  };

  return (
    <div
      aria-label="Selected location coordinate preview map"
      className="mt-2.5 rounded-lg border border-slate-700/90 bg-slate-950 overflow-hidden"
    >
      {/* Compact Coordinate Confirmation Header */}
      <div className="px-3 py-2 flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-950/90">
        <div className="min-w-0 flex items-center gap-2">
          <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
          <span className="text-xs font-semibold text-white truncate">
            {location.displayName}
          </span>
          <span aria-hidden="true" className="text-slate-600 text-xs">·</span>
          <span className="text-[11px] font-mono tabular-nums text-slate-400 whitespace-nowrap shrink-0">
            {location.latitude.toFixed(4)}°, {location.longitude.toFixed(4)}°
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setRecenterNonce((n) => n + 1)}
            title="Recenter map on selected pin"
            aria-label="Recenter map on selected pin"
            className="p-1 text-slate-400 hover:text-emerald-300 rounded transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <Crosshair className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Hide mini-map preview"
            aria-label="Hide mini-map preview"
            className="p-1 text-slate-400 hover:text-white rounded transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Explicit-Height Interactive Google Map Viewport (CF2 & CF9 compliant) */}
      <div className="relative w-full h-44 bg-slate-900">
        {isLoadingKey ? (
          <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">
            Loading interactive map preview...
          </div>
        ) : !apiKey || mapLoadError ? (
          <div className="w-full h-full flex flex-col items-center justify-center px-4 text-center gap-1">
            <p className="text-xs font-medium text-slate-300">
              {mapLoadError || 'Google Maps API key unavailable for mini-map preview.'}
            </p>
            <p className="text-[11px] font-mono tabular-nums text-slate-400">
              Confirmed coordinates: {location.latitude.toFixed(4)}°N, {location.longitude.toFixed(4)}°E
            </p>
          </div>
        ) : (
          <APIProvider
            apiKey={apiKey}
            libraries={['marker']}
            language="en"
            region="IN"
            onError={() =>
              setMapLoadError('Unable to load Google Maps preview. Coordinates remain active.')
            }
          >
            <GoogleMap
              mapId="DEMO_MAP_ID"
              defaultCenter={center}
              defaultZoom={zoomLevel}
              gestureHandling="greedy"
              mapTypeControl={false}
              streetViewControl={false}
              fullscreenControl={false}
              zoomControl={true}
              onClick={handleMapClick}
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              className="w-full h-full"
            >
              <CameraController
                key={recenterNonce}
                lat={location.latitude}
                lng={location.longitude}
                zoom={zoomLevel}
              />
              <AdvancedMarker
                position={center}
                title={`${location.displayName} (${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)})`}
              >
                <Pin
                  background="#059669"
                  borderColor="#064e3b"
                  glyphColor="#ecfdf5"
                />
              </AdvancedMarker>
            </GoogleMap>
          </APIProvider>
        )}
      </div>

      {/* Subtle Interactive Hint Footer */}
      <div className="px-3 py-1.5 flex items-center justify-between gap-2 text-[11px] text-slate-400 bg-slate-950/90 border-t border-slate-800/80">
        <span>Drag to pan · Scroll to zoom · Click map to adjust pin</span>
        <span className="font-mono tabular-nums text-emerald-400/90">Pin active</span>
      </div>
    </div>
  );
}
