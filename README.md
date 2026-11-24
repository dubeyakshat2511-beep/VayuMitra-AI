# VayuMitra AI — Urban Air Quality & Smog Assistant

VayuMitra AI pairs live Open-Meteo atmospheric & air quality telemetry with personalized household smog action plans, indoor lung-care yoga & athletic conditioning modules, smoker particulate burden recovery protocols, interactive Google Maps location previews, and a multilingual Web Speech voice read-aloud assistant.

## Key Features

- **Live Telemetry & Autocomplete:** Real-time US AQI, PM2.5, PM10, 24-hour dispersion trend chart, safest outdoor window calculation, 250ms debounced location autocomplete, and interactive mini-map coordinate confirmation.
- **Family & Lifestyle Profile:** Multi-select household vulnerabilities (Children, Elderly Parents, Asthma/Respiratory Sensitivity, Outdoor Runner/Athlete), commute type, home filtration setup, community language, and daily **Cigarettes Smoked Today** tracker with real-time combined PM2.5 lung burden calculation.
- **Consolidated AI Smog Action Plan:** Single structured Gemini API call (with `sessionStorage` caching, cooldown protection, 429 retry, and deterministic local fallback) generating Daily Routine, Indoor Hacks, Health Yoga & Pranayama, Indoor Athletic Conditioning, Smoker Lung-Recovery Initials & Exercises, Sustainable Swaps, and RWA WhatsApp Alerts.
- **Guided Breathing Pacer & Multilingual Voice Assistant:** Built-in visual breathing pacer modal and optional multilingual voice read-aloud assistant (English India, Hindi, Hinglish, Spanish, French, German).

## Local Development

```bash
npm install
npm run dev
```

## Running Tests

Automated unit and integration tests run 100% offline with [Vitest](https://vitest.dev/):

```bash
npm install
npm test
```

## Production Build

```bash
npm run build
npm start
```
