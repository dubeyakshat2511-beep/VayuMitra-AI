import { useState } from 'react';
import type { HourlyAqiPoint, SafeOutdoorWindow } from '../types/vayu';
import { getAqiCategory } from '../utils/aqi';

interface DispersionChartProps {
  hourly: HourlyAqiPoint[];
  safeWindow: SafeOutdoorWindow;
  cityName: string;
}

export function DispersionChart({ hourly, safeWindow, cityName }: DispersionChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (!hourly || hourly.length < 2) {
    return null;
  }

  const width = 920;
  const height = 188;
  const padLeft = 44;
  const padRight = 18;
  const padTop = 20;
  const padBottom = 32;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const maxDataAqi = Math.max(...hourly.map((h) => h.usAqi), 160);
  const yMax = Math.ceil(maxDataAqi / 50) * 50;

  const xFor = (idx: number) => padLeft + (idx / (hourly.length - 1)) * plotW;
  const yFor = (aqi: number) => padTop + plotH - (Math.min(aqi, yMax) / yMax) * plotH;

  const linePath = hourly
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(1)} ${yFor(pt.usAqi).toFixed(1)}`)
    .join(' ');

  const areaPath = `${linePath} L ${xFor(hourly.length - 1).toFixed(1)} ${(padTop + plotH).toFixed(
    1
  )} L ${xFor(0).toFixed(1)} ${(padTop + plotH).toFixed(1)} Z`;

  const safeX1 = xFor(Math.max(0, safeWindow.startIndex));
  const safeX2 = xFor(Math.min(hourly.length - 1, safeWindow.endIndex));

  const gridTicks = [0, 50, 100, 150, 200, 300, 400, 500].filter((v) => v <= yMax);
  const activeIdx = hoverIdx ?? safeWindow.startIndex;
  const activePt = hourly[activeIdx];
  const activeCat = getAqiCategory(activePt.usAqi);

  return (
    <div id="dispersion-curve" className="pt-5 border-t border-slate-800/90">
      <div className="flex flex-wrap items-baseline justify-between gap-4 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-100 tracking-wide">
            24-Hour Smog Dispersion Curve — {cityName}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Hourly Open-Meteo US AQI trajectory · Shaded band marks lowest daytime particulate load ({safeWindow.windowLabel})
          </p>
        </div>

        {/* Live Crosshair Readout */}
        <div className="flex items-center gap-3 text-xs font-mono tabular-nums text-slate-300">
          <span className="text-slate-400">{activePt.hourLabel}</span>
          <span aria-hidden="true" className="text-slate-600">·</span>
          <span className={activeCat.darkTextClass}>
            AQI {activePt.usAqi} ({activeCat.shortLabel})
          </span>
          <span aria-hidden="true" className="text-slate-600">·</span>
          <span>PM2.5 {activePt.pm25.toFixed(1)} µg/m³</span>
          <span aria-hidden="true" className="text-slate-600 hidden sm:inline">·</span>
          <span className="hidden sm:inline text-slate-400">PM10 {activePt.pm10.toFixed(1)} µg/m³</span>
        </div>
      </div>

      <div className="relative w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`24-hour US AQI forecast for ${cityName}`}
          className="w-full h-auto min-w-[600px] select-none cursor-crosshair"
          onMouseLeave={() => setHoverIdx(null)}
        >
          <defs>
            <linearGradient id="vayuAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={activeCat.strokeHex} stopOpacity="0.24" />
              <stop offset="100%" stopColor={activeCat.strokeHex} stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Horizontal Grid Lines & Y-Axis Ticks */}
          {gridTicks.map((tick) => {
            const y = yFor(tick);
            const isWarningLine = tick === 150 || tick === 200;
            return (
              <g key={tick}>
                <line
                  x1={padLeft}
                  x2={width - padRight}
                  y1={y}
                  y2={y}
                  stroke={isWarningLine ? 'rgba(245, 158, 11, 0.25)' : 'rgba(148, 163, 184, 0.14)'}
                  strokeDasharray={isWarningLine ? '4 4' : undefined}
                  strokeWidth="1"
                />
                <text
                  x={padLeft - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  className="fill-slate-400 font-mono text-[10px]"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          {/* Highlighted Safe Outdoor Window Band */}
          <rect
            x={safeX1}
            y={padTop}
            width={Math.max(safeX2 - safeX1, 16)}
            height={plotH}
            fill="rgba(16, 185, 129, 0.14)"
            stroke="rgba(16, 185, 129, 0.42)"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
          <text
            x={Math.min(safeX1 + 6, width - padRight - 110)}
            y={padTop + 12}
            className="fill-emerald-300 font-mono text-[10px] font-medium"
          >
            Best Window
          </text>

          {/* Area & Line Curve */}
          <path d={areaPath} fill="url(#vayuAreaGrad)" />
          <path
            d={linePath}
            fill="none"
            stroke="#34d399"
            strokeWidth="2.2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Interactive Hover Column & Point */}
          <line
            x1={xFor(activeIdx)}
            x2={xFor(activeIdx)}
            y1={padTop}
            y2={padTop + plotH}
            stroke="rgba(226, 232, 240, 0.45)"
            strokeWidth="1"
            strokeDasharray="2 2"
          />
          <circle
            cx={xFor(activeIdx)}
            cy={yFor(activePt.usAqi)}
            r="4.5"
            fill={activeCat.strokeHex}
            stroke="#0f172a"
            strokeWidth="2"
          />

          {/* X-Axis Hour Labels every 3 hours */}
          {hourly.map((pt, i) => {
            if (i % 3 !== 0 && i !== hourly.length - 1) return null;
            return (
              <text
                key={pt.isoTime}
                x={xFor(i)}
                y={height - 10}
                textAnchor="middle"
                className="fill-slate-400 font-mono text-[10px]"
              >
                {pt.hourLabel}
              </text>
            );
          })}

          {/* Invisible Hit Targets for Crisp Mouse/Touch Scrubbing */}
          {hourly.map((pt, i) => {
            const sliceW = plotW / (hourly.length - 1);
            return (
              <rect
                key={`hit-${pt.isoTime}`}
                x={Math.max(padLeft, xFor(i) - sliceW / 2)}
                y={padTop}
                width={sliceW}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHoverIdx(i)}
                onClick={() => setHoverIdx(i)}
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}
