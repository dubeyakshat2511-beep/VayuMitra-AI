# VayuMitra AI — Urban Air Quality & Winter Commute Safety Assistant

**VayuMitra AI** is a hybrid deterministic and generative AI urban air quality, respiratory protection, and winter fog road-safety co-pilot built with **React 19**, **TypeScript**, **Open-Meteo**, and the **Google Gemini API** (`@google/genai`).

Instead of displaying a raw Air Quality Index (AQI) number with generic advice, VayuMitra AI translates live pollutant telemetry and meteorological conditions into personalized daily schedules, cumulative lung-burden estimates, and low-visibility road-safety protocols tailored to each user's lifestyle and household profile.

---

## Key Features

### 1. Real-Time Multi-Pollutant & Meteorological Telemetry
* Fetches live **US AQI**, **PM2.5**, **PM10**, **NO₂**, **O₃**, **temperature**, **dew point**, **relative humidity**, and **wind speed** via the **Open-Meteo Air Quality & Weather APIs**.
* Uses `sessionStorage` caching to minimize redundant network requests and deliver sub-second repeat lookups.

### 2. Personalized Household & Individual Lifestyle Profiles
* **Individual / Solo Mode:** Tailors daily outdoor fitness windows, commute protection, and indoor ventilation advice for solo adults and daily commuters.
* **Vulnerable Group Modes:** Adapts safety thresholds and action plans for **Seniors**, **Children**, **Asthma / Respiratory Sensitivity**, and **Outdoor Commuters**.

### 3. Cumulative Lung-Burden & Smoker Exposure Protocol (`src/utils/exposureCalculator.ts`)
* Deterministically converts ambient outdoor PM2.5 concentration into equivalent daily cigarette exposure and combines it with user-reported daily cigarette intake before invoking Gemini, preventing LLM arithmetic hallucinations.

### 4. Winter Fog & Pothole Commute Shield (`src/utils/fogHazardCalculator.ts`)
* Computes temperature–dew-point spread, humidity, wind speed, and PM2.5 smog density to classify road visibility into four deterministic risk tiers: **Clear**, **Moderate Mist**, **Dense Fog Warning**, and **Zero-Visibility Pileup Risk**.
* Provides safe highway/urban speed caps, low-beam and amber fog-lamp checklists, pothole-braking guidance, and an interactive local hazard logger (`localStorage`) for flagging dense fog pockets and waterlogged potholes.

### 5. Zero-Failure Multilingual Voice Assistant
* Supports interactive spoken briefings across **6 languages** (**English**, **Hindi**, **Hinglish**, **Spanish**, **French**, and **German**).
* Connects via **`gemini-3.8-live`** with an automatic browser **Web Speech API** (`SpeechRecognition` + `speechSynthesis`) fallback so voice interaction works reliably even inside restricted iframe sandboxes or fluctuating networks.

### 6. Accessible WCAG AA Dark Mode & Offline Resilience
* Includes a persistent Sun/Moon theme toggle (`vayumitra_theme` in `localStorage` with `prefers-color-scheme: dark` system detection), semantic HTML landmarks, and `aria-live="polite"` status announcements.
* Automatically falls back to a deterministic rule-based protocol generator if external APIs are unreachable.

---

## System Architecture

```text
┌──────────────────────────────────────────────────────────────────────┐
│                        React 19 + TypeScript UI                      │
│  HeaderNav • AirQualityMetricsCard • FogRoadSafetyCard • VoiceBar    │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
        ┌───────────────────────┴───────────────────────┐
        ▼                                               ▼
┌───────────────────────────────┐       ┌──────────────────────────────┐
│   Deterministic Risk Layer    │       │    Generative AI Layer       │
│  • Open-Meteo Telemetry API   │       │  • gemini-2.5-flash (JSON    │
│  • exposureCalculator.ts      │──────▶│    responseSchema enforced)  │
│  • fogHazardCalculator.ts     │       │  • gemini-3.8-live + Web     │
│  • sessionStorage Caching     │       │    Speech API Fallback       │
└───────────────────────────────┘       └──────────────────────────────┘


VayuMitra-AI/
├── index.html
├── package.json
├── tsconfig.json
├── README.md
└── src/
    ├── App.tsx
    ├── components/
    │   ├── HeaderNav.tsx
    │   ├── AirQualityMetricsCard.tsx
    │   ├── SmokerExposurePanel.tsx
    │   ├── FogRoadSafetyCard.tsx
    │   └── VoiceAssistantBar.tsx
    ├── services/
    │   ├── airQualityService.ts
    │   └── geminiService.ts
    ├── utils/
    │   ├── exposureCalculator.ts
    │   └── fogHazardCalculator.ts
    └── __tests__/
        ├── airQualityAndSmoking.test.ts
        └── voiceAndCaching.test.ts
