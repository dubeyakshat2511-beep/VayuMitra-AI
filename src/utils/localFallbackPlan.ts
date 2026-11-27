import type {
  FamilyProfile,
  IndoorHack,
  LiveAqiData,
  RoutineRiskLevel,
  SmogActionPlan,
  SmokerRecoveryModule,
  SustainableSwap,
} from '../types/vayu';

import {
  calculateCombinedParticulateLoad,
  isIndividualSoloProfile,
} from './exposureCalculator.ts';
import {
  buildFallbackWeatherSnapshot,
  calculateFogHazard,
} from './fogHazardCalculator.ts';

function getRiskForAqi(aqi: number): RoutineRiskLevel {
  if (aqi <= 50) return 'Low';
  if (aqi <= 120) return 'Moderate';
  if (aqi <= 200) return 'High';
  return 'Severe';
}

/**
 * Builds a complete, deterministic offline {@link SmogActionPlan} tailored to live
 * AQI telemetry, household vulnerability profiles, commute, home setup, and daily
 * cigarette exposure when the upstream Gemini API is rate-limited or unavailable.
 */
export function buildLocalSmogPlan(
  aqiData: LiveAqiData,
  profile: FamilyProfile
): SmogActionPlan {
  const { displayName, current, safeWindow } = aqiData;
  const { usAqi, pm25, pm10 } = current;
  const isSevere = usAqi > 200;
  const isUnhealthy = usAqi > 150;
  const isHinglish = profile.language === 'Hinglish/Hindi';

  const hasAsthma = profile.members.includes('Asthma/Respiratory Sensitivity');
  const hasElderly = profile.members.includes('Elderly Parents');
  const hasChildren = profile.members.includes('Children');
  const hasAthlete = profile.members.includes('Outdoor Runner/Athlete');
  const isSolo = isIndividualSoloProfile(profile.members);
  const isSensitiveHousehold = hasAsthma || hasElderly || hasChildren;
  const {
    cigarettesCount,
    smokingEquivalentPm25,
    combinedPm25Burden,
    hasSmokingExposure,
  } = calculateCombinedParticulateLoad(pm25, profile.cigarettesSmokedToday);

  const morningRisk: RoutineRiskLevel = getRiskForAqi(Math.round(usAqi * 1.15));
  const afternoonRisk: RoutineRiskLevel = getRiskForAqi(safeWindow.avgAqi);
  const eveningRisk: RoutineRiskLevel = getRiskForAqi(Math.round(usAqi * 1.1));
  const nightRisk: RoutineRiskLevel = getRiskForAqi(Math.round(usAqi * 1.2));

  const citySummary = hasSmokingExposure
    ? `${displayName} is recording US AQI ${usAqi} with ambient PM2.5 at ${pm25.toFixed(
        1
      )} µg/m³ (combined with ${cigarettesCount} ${
        cigarettesCount === 1 ? 'cigarette' : 'cigarettes'
      } today: ~${combinedPm25Burden.toFixed(1)} µg/m³ equivalent PM2.5 lung burden).`
    : `${displayName} is currently recording US AQI ${usAqi} with PM2.5 at ${pm25.toFixed(
        1
      )} µg/m³ and PM10 at ${pm10.toFixed(1)} µg/m³.`;

  const baseHeadlineAdvisory = isSolo
    ? isSevere
      ? `Stay indoors with sealed room drafts, run personal single-room filtration or wet-mopping, wear a snug N95 mask for essential solo ${profile.commute} trips, and move your workouts indoors.`
      : isUnhealthy
        ? `Time your solo errands and outdoor exercise for the ${safeWindow.windowLabel} window (est. AQI ${safeWindow.avgAqi}), wear N95 protection on your ${profile.commute} commute, and keep your workspace/bedroom sealed.`
        : `Schedule your solo outdoor workout, commute errands, and brief room cross-ventilation during ${safeWindow.windowLabel} (est. AQI ${safeWindow.avgAqi}) before evening smog builds up.`
    : isSevere
      ? `Keep ${profile.members.join(
          ', '
        )} indoors with sealed drafts, run indoor filtration or wet-mopping protocols, and require a snug N95 mask for any essential ${
          profile.commute
        } travel.`
      : isUnhealthy
        ? `Limit outdoor exposure to the ${safeWindow.windowLabel} window (est. AQI ${safeWindow.avgAqi}), wear N95 protection during ${profile.commute} trips, and protect sensitive lungs indoors.`
        : `Plan outdoor errands and brief cross-ventilation during ${safeWindow.windowLabel} (est. AQI ${safeWindow.avgAqi}) while monitoring evening winter smog build-up.`;

  const headlineAdvisory = hasSmokingExposure
    ? `${baseHeadlineAdvisory} Because ${cigarettesCount} ${
        cigarettesCount === 1 ? 'cigarette adds' : 'cigarettes add'
      } ~${smokingEquivalentPm25} µg/m³ PM2.5 burden, start the 60-minute lung-recovery initials immediately and avoid outdoor exertion for at least 2 hours.`
    : baseHeadlineAdvisory;

  const dailyRoutine: SmogActionPlan['dailyRoutine'] = isSolo
    ? [
        {
          period: 'Morning',
          timeRange: '5:30 AM – 10:00 AM',
          riskLevel: morningRisk,
          ventilationAction:
            'Keep your bedroom and workspace windows tightly shut; run the kitchen exhaust fan only while making breakfast or tea.',
          inversionExplanation:
            'Overnight radiative cooling creates a shallow winter temperature inversion layer that traps vehicular exhaust and domestic smoke near ground level until late morning sun warms the air.',
          maskGuidance: isUnhealthy
            ? 'Fitted N95/KN95 required for your solo commute and outdoor errands; avoid cloth scarves.'
            : 'N95 advised for solo rush-hour commuting through congested intersections.',
          familyActions: [
            hasAthlete
              ? 'Move your morning run or outdoor workout indoors until afternoon dispersion improves.'
              : 'Delay non-essential outdoor walks or solo errands until the afternoon dispersion window.',
            profile.commute === 'Work From Home'
              ? 'Keep your personal home-office room sealed during peak morning traffic and take short indoor mobility breaks.'
              : `Time your solo ${profile.commute} departure to skip peak idling queues and keep an N95 mask sealed over your nose bridge.`,
            hasAsthma
              ? 'Keep your reliever inhaler in your daily commute bag and avoid cold-air deep breaths right after stepping outside.'
              : 'Leave outdoor footwear at the entry and damp-wipe desk dust before starting your workday.',
          ],
        },
        {
          period: 'Afternoon',
          timeRange: '12:00 PM – 4:30 PM',
          riskLevel: afternoonRisk,
          ventilationAction:
            safeWindow.avgAqi <= 150
              ? `Open windows for a brief 20-minute cross-ventilation of your room/workspace around ${safeWindow.windowLabel} to flush indoor CO₂ while outdoor particulate load is lowest.`
              : `Keep windows mostly closed even during ${safeWindow.windowLabel}; crack an interior vent only 5–10 minutes if your workspace feels stuffy.`,
          inversionExplanation:
            'Peak solar heating lifts the atmospheric mixing height, dispersing trapped morning PM2.5 upward and creating the lowest relative particulate concentrations of the day.',
          maskGuidance:
            safeWindow.avgAqi > 150
              ? 'Wear an N95 mask for solo midday errands, lunch walks, or transit.'
              : 'Optional for a quick solo midday walk; recommended near busy arterial roads.',
          familyActions: [
            `Batch your solo errands, grocery runs, and lunch-break walks into the ${safeWindow.windowLabel} window (est. AQI ${safeWindow.avgAqi}).`,
            hasAthlete
              ? 'Keep high-intensity cardio indoors if AQI stays above 150; use the Train tab Surya Namaskar and Ujjayi conditioning instead.'
              : 'Schedule any brief solo outdoor fitness walk during this dispersion dip, and complete quick wet-mopping indoors while floors dry fast.',
          ],
        },
        {
          period: 'Evening',
          timeRange: '5:00 PM – 9:00 PM',
          riskLevel: eveningRisk,
          ventilationAction:
            'Seal your apartment or bedroom windows before 5:00 PM as sunset cools the ground and rush-hour commute emissions spike.',
          inversionExplanation:
            'As sunlight fades, the surface cools rapidly and the winter boundary layer collapses downward, trapping peak evening traffic exhaust and neighborhood biomass smoke at breathing height.',
          maskGuidance:
            'Wear a snug N95 mask on your solo return commute and avoid jogging or walking along congested arterial roads.',
          familyActions: [
            `Right after returning from your ${profile.commute} commute, wash your face, rinse nostrils with saline spray, and change out of outer commute clothes.`,
            'Keep your personal living space smoke-free—avoid incense, scented candles, mosquito coils, or smoky pan-frying indoors.',
            'Decompress after work with 10 minutes of indoor lung-care breathing or solo mobility drills from the Health/Train tabs.',
          ],
        },
        {
          period: 'Night',
          timeRange: '9:30 PM – 5:30 AM',
          riskLevel: nightRisk,
          ventilationAction:
            'Keep your bedroom door and windows sealed; place a rolled damp towel or weatherstrip along bottom door gaps.',
          inversionExplanation:
            'Calm night winds and strong nocturnal temperature inversion cause PM2.5 and PM10 concentrations to climb steadily through the night, seeping indoors through unsealed frames.',
          maskGuidance: 'No mask required indoors; focus on clean single-room bedroom air zoning.',
          familyActions: [
            profile.homeSetup === '1 HEPA Air Purifier'
              ? 'Run your HEPA air purifier in your closed bedroom 45 minutes before sleep on medium-quiet mode for overnight personal lung recovery.'
              : profile.homeSetup === 'Central Filtration'
                ? 'Verify central HVAC recirculation is set to MERV-13+ filtration with fresh-air intake throttled during severe smog.'
                : 'Keep your bedroom door shut to isolate a compact solo clean-air zone and place a damp microfiber draft stopper at the door base.',
            hasAsthma
              ? 'Keep your personal reliever inhaler on your nightstand and take 5 minutes of warm plain steam if throat irritation appears.'
              : 'Finish your day with a 5-minute solo diaphragmatic belly breathing wind-down to lower resting respiratory rate overnight.',
          ],
        },
      ]
    : [
        {
          period: 'Morning',
          timeRange: '5:30 AM – 10:00 AM',
          riskLevel: morningRisk,
          ventilationAction:
            'Keep all exterior windows and balcony doors tightly shut; run kitchen exhaust only while actively cooking.',
          inversionExplanation:
            'Overnight radiative cooling creates a shallow winter temperature inversion layer that traps vehicular exhaust and domestic smoke near ground level until late morning sun warms the air.',
          maskGuidance: isUnhealthy
            ? 'Fitted N95/KN95 required for all outdoor departures; avoid cloth scarves.'
            : 'N95 advised for asthma/elderly commuters during peak rush-hour intersections.',
          familyActions: [
            hasElderly
              ? 'Shift morning walks for elderly parents indoors to hallway pacing or gentle stretching.'
              : 'Delay non-essential outdoor activity until the afternoon dispersion window.',
            hasChildren
              ? 'Provide children with a properly sealed kids-size N95 mask and warm water hydration before school transit.'
              : `Prepare ${profile.commute} transit with minimal idling and eye-rinse protection.`,
            hasAsthma
              ? 'Keep reliever inhaler accessible and avoid cold-air deep breaths right after stepping outside.'
              : 'Wet-wipe entryway dust and leave outdoor footwear at the threshold.',
          ],
        },
        {
          period: 'Afternoon',
          timeRange: '12:00 PM – 4:30 PM',
          riskLevel: afternoonRisk,
          ventilationAction:
            safeWindow.avgAqi <= 150
              ? `Brief 20-minute cross-ventilation around ${safeWindow.windowLabel} to flush indoor CO₂ while outdoor particulate load is lowest.`
              : `Keep windows mostly closed even during ${safeWindow.windowLabel}; crack an interior ventilator only 5–10 minutes if CO₂ feels stuffy.`,
          inversionExplanation:
            'Peak solar heating lifts the atmospheric mixing height, dispersing trapped morning PM2.5 upward and creating the lowest relative particulate concentrations of the day.',
          maskGuidance:
            safeWindow.avgAqi > 150
              ? 'Wear an N95 mask for outdoor errands even during the midday dip.'
              : 'Optional for healthy adults on short errands; recommended for asthma or elderly members.',
          familyActions: [
            `Schedule essential outdoor errands and groceries inside the ${safeWindow.windowLabel} window (est. AQI ${safeWindow.avgAqi}).`,
            hasAthlete
              ? 'Keep high-intensity cardio indoors if AQI remains above 150; use the Train tab Surya Namaskar and Ujjayi conditioning instead.'
              : 'Complete wet-mopping and damp-cloth dusting while solar warmth helps floors dry rapidly.',
          ],
        },
        {
          period: 'Evening',
          timeRange: '5:00 PM – 9:00 PM',
          riskLevel: eveningRisk,
          ventilationAction:
            'Seal windows before 5:00 PM as sunset cools the ground and rush-hour emissions spike.',
          inversionExplanation:
            'As sunlight fades, the surface cools rapidly and the winter boundary layer collapses downward, trapping peak evening traffic exhaust and neighborhood biomass smoke at breathing height.',
          maskGuidance:
            'Wear an N95 mask during return commutes and avoid walking near congested arterial roads.',
          familyActions: [
            `On returning from ${profile.commute}, wash face, rinse nostrils with saline spray, and change outer clothes to shed settled PM2.5.`,
            'Avoid incense sticks, dhoop, mosquito coils, or dry frying indoors; use covered pans and kitchen exhaust.',
            'Practice 10 minutes of slow indoor lung-care breathing from the Health tab once indoor air is settled.',
          ],
        },
        {
          period: 'Night',
          timeRange: '9:30 PM – 5:30 AM',
          riskLevel: nightRisk,
          ventilationAction:
            'Keep bedroom doors and windows sealed; seal bottom door gaps with a rolled damp towel or weatherstrip.',
          inversionExplanation:
            'Calm night winds and strong nocturnal temperature inversion cause PM2.5 and PM10 concentrations to climb steadily through the night, seeping indoors through unsealed frames.',
          maskGuidance: 'No mask required indoors; prioritize clean bedroom air zoning.',
          familyActions: [
            profile.homeSetup === '1 HEPA Air Purifier'
              ? 'Move your HEPA air purifier into the primary sleeping bedroom 45 minutes before bedtime on medium-quiet mode.'
              : profile.homeSetup === 'Central Filtration'
                ? 'Verify central HVAC recirculation is set to MERV-13+ filtration with fresh-air intake throttled during severe smog.'
                : 'Keep bedroom doors shut to create a low-infiltration clean zone and place a damp microfiber draft stopper at the door base.',
            isSensitiveHousehold
              ? 'Keep bedrooms dust-free and slightly humidified with warm steam inhalation before sleep if throat irritation occurs.'
              : 'Run a 5-minute diaphragmatic belly breathing wind-down before sleep.',
          ],
        },
      ];

  const indoorHacks: IndoorHack[] =
    profile.homeSetup === '1 HEPA Air Purifier'
      ? [
          {
            title: 'Single-Room HEPA Clean-Zone Sealing',
            estimatedPm25ReductionPct: 68,
            costEstimate: 'Free',
            timeRequired: '5 min daily',
            howToExecute: isSolo
              ? 'Keep your HEPA purifier in your closed bedroom at night and next to your personal workspace during the day, placed at least 30 cm away from walls and curtains.'
              : 'Keep your HEPA purifier in one closed bedroom at night and the main family room during the day, placed at least 30 cm away from walls and curtains.',
            whyItWorks:
              'A single HEPA unit achieves 4–5 air changes per hour in a closed 150–200 sq ft room, whereas open doors dilute filtration efficiency dramatically.',
          },
          {
            title: 'Wet-Mopping Instead of Dry Sweeping (Jhadu)',
            estimatedPm25ReductionPct: 22,
            costEstimate: 'Free',
            timeRequired: '10 min daily',
            howToExecute:
              'Replace dry broom sweeping with a damp microfiber mop and wet dusting of fan blades, sills, and tables once every morning.',
            whyItWorks:
              'Dry sweeping re-suspends settled PM2.5 and PM10 dust back into the 1–1.5m breathing zone for hours; damp mopping captures particles permanently.',
          },
          {
            title: 'Silicone Door-Gap & Window-Frame Weatherstripping',
            estimatedPm25ReductionPct: 28,
            costEstimate: '₹250–₹450',
            timeRequired: '20 min one-time',
            howToExecute:
              'Apply peel-and-stick EPDM foam tape along leaky window tracks and place a door sweep or rolled damp towel at the bottom gap of exterior doors.',
            whyItWorks:
              'Reduces outdoor smog infiltration driven by indoor-outdoor winter temperature pressure differences, letting your HEPA filter run quieter and longer.',
          },
          {
            title: 'Tadka Fume Capture & Zero-Combustion Indoors',
            estimatedPm25ReductionPct: 35,
            costEstimate: 'Free',
            timeRequired: 'During cooking',
            howToExecute:
              'Always switch on the kitchen exhaust fan or chimney 2 minutes before heating oil, keep lids on boiling pots, and pause agarbatti/dhoop during high-AQI days.',
            whyItWorks:
              'High-heat oil tempering and indoor incense generate indoor PM2.5 spikes above 300 µg/m³ that rapidly saturate HEPA filters.',
          },
        ]
      : profile.homeSetup === 'Central Filtration'
        ? [
            {
              title: 'MERV-13 Media Upgrade & Recirculation Tuning',
              estimatedPm25ReductionPct: 72,
              costEstimate: '₹1,500–₹3,000',
              timeRequired: '15 min inspection',
              howToExecute:
                'Confirm your central air handler uses pleated MERV-13 filters (inspected monthly during winter smog) and reduce outdoor intake dampers when AQI exceeds 150.',
              whyItWorks:
                'Standard MERV-8 dust filters let fine PM2.5 pass through; MERV-13 electret media traps sub-micron winter smog aerosols across every room.',
            },
            {
              title: 'Wet-Mopping & Microfiber Surface Reset',
              estimatedPm25ReductionPct: 20,
              costEstimate: 'Free',
              timeRequired: '10 min daily',
              howToExecute:
                'Switch strictly from dry sweeping to damp microfiber mopping and wipe return-air grilles weekly so settled dust is removed rather than recirculated.',
              whyItWorks:
                'Eliminates secondary particulate resuspension indoors and prevents premature clogging of central filtration cartridges.',
            },
            {
              title: 'Entryway Vestibule & Door-Sweep Containment',
              estimatedPm25ReductionPct: 24,
              costEstimate: '₹300–₹600',
              timeRequired: '20 min one-time',
              howToExecute:
                'Seal main-door bottom gaps with brush/silicone sweeps and establish a shoe-off mat at the front foyer.',
            whyItWorks:
                'Blocks road-dust track-in and unfiltered stairwell drafts from bypassing your central filtration loop.',
            },
            {
              title: 'Kitchen Exhaust Isolation During Cooking',
              estimatedPm25ReductionPct: 32,
              costEstimate: 'Free',
              timeRequired: 'During cooking',
              howToExecute:
                'Close the kitchen door when tempering spices, run the exterior-vented chimney on high, and avoid indoor candles or incense.',
              whyItWorks:
                'Prevents cooking aerosols from entering central return ducts and spreading fine oily particulates into bedrooms.',
            },
          ]
        : [
            {
              title: 'DIY Box-Fan + MERV-13 / HEPA Exhaust Filter',
              estimatedPm25ReductionPct: 55,
              costEstimate: '₹1,400–₹2,200',
              timeRequired: '25 min one-time',
              howToExecute:
                'Tape a replacement HEPA or MERV-13 pleated filter snugly to the intake side of an existing table/exhaust fan with cardboard shrouding along the corners.',
              whyItWorks:
                'Pulling indoor air continuously through a sealed MERV-13/HEPA sheet delivers high Clean Air Delivery Rate (CADR) at a fraction of commercial purifier cost.',
            },
            {
              title: 'Wet-Mopping Instead of Dry Sweeping (Jhadu)',
              estimatedPm25ReductionPct: 22,
              costEstimate: 'Free',
              timeRequired: '10 min daily',
              howToExecute:
                'Stop all dry sweeping and feather-dusting during smog spikes; mop floors with a wrung damp cloth and wipe tabletops with a moist microfiber rag.',
              whyItWorks:
                'Dry jhadu kicks settled PM2.5 and PM10 back into breathing height for 2–3 hours, while damp mopping traps particulates safely into water.',
            },
            {
              title: 'Damp-Towel & Foam-Tape Door Gap Sealing',
              estimatedPm25ReductionPct: 26,
              costEstimate: 'Free to ₹300',
              timeRequired: '10 min setup',
              howToExecute:
                'Press rolled damp cotton towels along exterior door bottoms at dusk and line loose sliding-window tracks with inexpensive foam weatherstrip tape.',
              whyItWorks:
                'Blocks cold nighttime inversion drafts from leaking outdoor PM2.5 into bedrooms while you sleep.',
            },
            {
              title: 'Covered-Pan Cooking & Exhaust Fume Control',
              estimatedPm25ReductionPct: 34,
              costEstimate: 'Free',
              timeRequired: 'During cooking',
              howToExecute:
                'Run the kitchen exhaust fan while cooking, keep lids on pans, avoid smoky deep-frying/tadka indoors, and suspend agarbatti or mosquito coils.',
              whyItWorks:
                'Without an electric air purifier, preventing indoor combustion spikes is the fastest way to keep indoor PM2.5 below outdoor smog levels.',
            },
          ];

  const commuteSwap: SustainableSwap =
    profile.commute === 'Work From Home'
      ? {
          id: 'swap-commute',
          category: 'Commute',
          title: 'Batch Local Errands & Walk/Cycle Midday',
          currentHabit: 'Taking multiple short solo motor trips for groceries and errands',
          sustainableAction:
            'Combine weekly errands into one midday trip or choose walking/e-rickshaw during the lowest-AQI window',
          weeklyCo2SavedKg: 4.8,
          weeklyPm25NoxPreventedGrams: 9.2,
          lungHealthBenefit:
            'Cuts neighborhood cold-start exhaust plumes right outside your home gate, lowering acute NO₂ irritation.',
          practicalTip:
            'Order bulk staples once a week to eliminate multiple two-wheeler delivery trips down your lane.',
        }
      : {
          id: 'swap-commute',
          category: 'Commute',
          title:
            profile.commute === 'Petrol/Diesel Car'
              ? 'Carpool or Metro 2 Days/Week + Zero Red-Light Idling'
              : `Shift 2 ${profile.commute} Days to Metro/Shared Transit + Eco-Throttle`,
          currentHabit: `Daily solo ${profile.commute} commute through peak-hour traffic congestion`,
          sustainableAction:
            'Switch 2 commute days per week to shared transit/carpooling and switch off engines at red lights longer than 30 seconds',
          weeklyCo2SavedKg: profile.commute === 'Petrol/Diesel Car' ? 14.5 : 7.6,
          weeklyPm25NoxPreventedGrams: profile.commute === 'Petrol/Diesel Car' ? 24.0 : 15.8,
          lungHealthBenefit:
            'Directly slashes breathing-zone exposure to tailpipe ultrafine soot and nitrogen oxides during congested stops.',
          practicalTip:
            'Check tire pressure every Sunday—under-inflated tires burn up to 8% extra fuel and emit more exhaust particulates.',
        };

  const sustainableSwaps: SustainableSwap[] = [
    commuteSwap,
    {
      id: 'swap-cooking',
      category: 'Cooking',
      title: 'Pressure-Cook & Induction Boiling Over Open-Flame Simmering',
      currentHabit: 'Prolonged open-flame LPG simmering and smoky high-oil frying indoors',
      sustainableAction:
        'Use a pressure cooker with pre-soaked dal/rice and an electric kettle or induction plate for daily tea and boiling',
      weeklyCo2SavedKg: 5.2,
      weeklyPm25NoxPreventedGrams: 11.4,
      lungHealthBenefit:
        'Cuts indoor nitrogen dioxide (NO₂) and cooking aerosol build-up that trigger coughing and asthma flare-ups in closed winter rooms.',
      practicalTip:
        'Soak dals and chickpeas 30 minutes prior to cut active stove burner time by nearly half.',
    },
    {
      id: 'swap-waste',
      category: 'Waste',
      title: 'Zero Open-Burning Compost & Wet-Waste Segregation',
      currentHabit: 'Mixed garden leaves and household trash left for roadside piling or winter burning',
      sustainableAction:
        'Segregate dry leaves and kitchen peels into a society compost bin or mulched planter pots instead of letting waste be burned',
      weeklyCo2SavedKg: 6.4,
      weeklyPm25NoxPreventedGrams: 28.5,
      lungHealthBenefit:
        'Prevents toxic dioxins, carbon monoxide, and dense PM2.5 smoke plumes that linger inside residential compounds all evening.',
      practicalTip:
        'Ask your society gardener to pile fallen winter leaves into a corner leaf-mold pit instead of sweeping them to roadside fires.',
    },
  ];

  const communityAlert: SmogActionPlan['communityAlert'] = isHinglish
    ? {
        subject: `RWA Air Quality Alert — ${displayName} (US AQI ${usAqi})`,
        lines: [
          `Namaste residents, aaj ${displayName} mein US AQI ${usAqi} (PM2.5: ${pm25.toFixed(1)} µg/m³) record hua hai — kripya bachchon aur buzurgon ko ghar ke andar rakhein.`,
          `Outdoor errands sirf ${safeWindow.windowLabel} ke beech plan karein aur bahar nikalte waqt properly fitted N95 mask pehnein.`,
          `Society guards aur sabhi residents se vinamra anurodh hai ki sookhe patte, kachra ya raat ka bonfire bilkul na jalayein — open burning se AQI turant khatarnak level par pahunch jata hai.`,
          `Subah dry jhadu ki jagah wet sweeping aur water sprinkling mein sahyog karein taaki hum sabki hawa surakshit rahe.`,
        ],
        languageUsed: 'Hinglish / Hindi',
        callToAction:
          'Coordinate with RWA security to replace nighttime guard wood fires with electric room heaters and enforce water sprinkling before morning sweeping.',
      }
    : {
        subject: `Society RWA Smog Advisory — ${displayName} (US AQI ${usAqi})`,
        lines: [
          `Urgent Air Alert: ${displayName} is currently at US AQI ${usAqi} (PM2.5: ${pm25.toFixed(1)} µg/m³); please keep children, seniors, and asthma-sensitive residents indoors.`,
          `Limit essential outdoor errands to ${safeWindow.windowLabel} (lowest forecasted dispersion window) and wear a snug N95 mask outside.`,
          `Strict No-Burning Request: Please do not burn dry leaves, garbage, or open winter bonfires inside or around our society perimeter.`,
          `Let us support morning wet-sweeping and switch off idling car engines in the parking lane to protect our shared air.`,
        ],
        languageUsed: 'English',
        callToAction:
          'Share in the RWA WhatsApp group and request building security to switch night guards to electric heaters instead of wood/coal fires.',
      };

  const gentleHold = isSevere || hasAsthma || hasElderly || cigarettesCount >= 3 ? 2 : 4;

  const healthYoga: SmogActionPlan['healthYoga'] = {
    summary: isSolo
      ? hasSmokingExposure
        ? `Personal indoor respiratory recovery sessions tailored to your solo schedule at ${displayName}'s live US AQI ${usAqi} plus ${cigarettesCount} ${
            cigarettesCount === 1 ? 'cigarette' : 'cigarettes'
          } today (~${combinedPm25Burden.toFixed(1)} µg/m³ combined PM2.5 load).`
        : `Personal indoor respiratory recovery sessions tailored to your solo routine and ${profile.commute} commute at ${displayName}'s live US AQI of ${usAqi}.`
      : hasSmokingExposure
        ? `Gentle indoor respiratory recovery sessions calibrated for ${profile.members.join(
            ', '
          )} at ${displayName}'s live US AQI ${usAqi} plus ${cigarettesCount} ${
            cigarettesCount === 1 ? 'cigarette' : 'cigarettes'
          } today (~${combinedPm25Burden.toFixed(1)} µg/m³ combined PM2.5 load).`
        : `Gentle indoor respiratory recovery sessions calibrated for ${profile.members.join(
            ', '
          )} at ${displayName}'s live US AQI of ${usAqi}.`,
    aqiSafetyGuidance: isSevere || combinedPm25Burden >= 150
      ? `Combined particulate burden is elevated (AQI ${usAqi}${
          hasSmokingExposure ? `, ${combinedPm25Burden.toFixed(1)} µg/m³ combined PM2.5` : ''
        }): practice slow, quiet nasal breathwork indoors only and avoid forceful rapid breathing such as Kapalabhati or Bhastrika.`
      : `Practice indoors away from open windows with relaxed nasal breathing; stop immediately if you notice wheezing or dizziness.`,
    sessions: [
      {
        id: 'health-nadi-shodhana',
        name: 'Nadi Shodhana (Alternate Nostril Breathing)',
        categoryGroup: 'Pranayama (Breathwork)',
        sessionType: 'Pranayama',
        durationMinutes: 6,
        durationLabel: '6 min (8–10 slow rounds)',
        howToSteps: [
          'Sit upright in a closed room with relaxed shoulders; rest left hand on knee.',
          'Gently close the right nostril with your right thumb and inhale slowly through the left nostril.',
          'Close both nostrils briefly, then release the right nostril and exhale smoothly without force.',
          'Inhale through the right nostril, switch, and exhale through the left to complete one balanced round.',
        ],
        lungOrPerformanceImpact:
          'Balances nasal airflow resistance, calms stress-induced shallow breathing, and slows respiratory rate so less PM2.5 is drawn indoors.',
        tailoredNote:
          hasAsthma || hasElderly || isSevere
            ? 'Keep the breath-hold brief (0–2s) or omit retention entirely; prioritize a gentle, unforced exhale.'
            : isSolo
              ? 'Use between focused work blocks or right after your solo commute in your cleanest closed room.'
              : 'Maintain a calm 1:1:1.5 inhale-hold-exhale rhythm in your cleanest room.',
        pacerConfig: { inhaleSec: 4, holdSec: gentleHold, exhaleSec: 6 },
      },
      {
        id: 'health-bhramari',
        name: 'Bhramari Pranayama (Humming Bee Breath)',
        categoryGroup: 'Pranayama (Breathwork)',
        sessionType: 'Pranayama',
        durationMinutes: 5,
        durationLabel: '5 min (7–9 humming breaths)',
        howToSteps: [
          'Sit comfortably with spine tall and eyes softly closed; relax your jaw.',
          'Lightly rest index fingers near the ear cartilage (tragus) without pressing hard.',
          'Inhale calmly through the nose for 4 seconds.',
          'Exhale slowly while making a gentle, steady low-pitched humming sound like a bee.',
        ],
        lungOrPerformanceImpact:
          'Gentle nasal humming boosts paranasal nitric oxide release, soothing smog-irritated sinuses and throat lining.',
        tailoredNote: isSolo
          ? 'Ideal post-commute or before sleep to calm dry smog-irritated airways after a long solo workday.'
          : hasChildren
            ? 'Easy and soothing for children and seniors alike—keep the hum soft and playful without straining the throat.'
            : 'Ideal before bedtime to ease dry winter smog throat scratchiness.',
        pacerConfig: { inhaleSec: 4, holdSec: 0, exhaleSec: 6 },
      },
      {
        id: 'health-diaphragmatic',
        name: 'Diaphragmatic Belly Breathing',
        categoryGroup: 'Pranayama (Breathwork)',
        sessionType: 'Pranayama',
        durationMinutes: 6,
        durationLabel: '6 min (12 slow cycles)',
        howToSteps: [
          'Lie on your back with knees bent (or sit supported in a chair) with one hand on chest and one on belly.',
          'Inhale gently through your nose for 4 seconds, feeling your belly rise while your upper chest stays quiet.',
          'Pause softly for 2 seconds without tensing your neck.',
          'Exhale slowly for 6 seconds through the nose or softly pursed lips as the belly lowers.',
        ],
        lungOrPerformanceImpact:
          'Recruits lower lung lobes, reduces accessory neck-muscle fatigue, and improves oxygen exchange efficiency.',
        tailoredNote: isSolo
          ? 'Quick personal recovery reset after solo commuting or desk work—safe even on AQI > 200 evenings.'
          : 'Safe baseline recovery technique for elderly parents and asthma-sensitive members even on AQI > 200 days.',
        pacerConfig: { inhaleSec: 4, holdSec: 2, exhaleSec: 6 },
      },
      {
        id: 'health-bhujangasana',
        name: 'Bhujangasana (Gentle Cobra Pose)',
        categoryGroup: 'Chest-Opening Asanas',
        sessionType: 'Restorative',
        durationMinutes: 4,
        durationLabel: '4 min (4 gentle holds)',
        howToSteps: [
          'Lie face down on a yoga mat with palms under shoulders and elbows tucked close to your ribs.',
          'Inhale slowly and lift only your chest and collarbone a few inches off the mat.',
          'Draw shoulder blades down and back to open the front of the ribcage.',
          'Exhale smoothly as you lower your forehead back to the mat and rest.',
        ],
        lungOrPerformanceImpact:
          'Stretches tight pectoral and intercostal muscles to expand anterior chest capacity and ease shallow breathing.',
        tailoredNote: isSolo
          ? 'Counters rounded desk or handlebar posture from your solo workday and commute; keep the lift low and comfortable.'
          : hasElderly
            ? 'Elderly practitioners can substitute a seated chair chest-opener by interlacing hands behind the backrest.'
            : 'Keep the lift low and comfortable; never crunch the lower back.',
        pacerConfig: { inhaleSec: 4, holdSec: 2, exhaleSec: 5 },
      },
      {
        id: 'health-matsyasana',
        name: 'Matsyasana (Supported Fish Pose)',
        categoryGroup: 'Chest-Opening Asanas',
        sessionType: 'Restorative',
        durationMinutes: 5,
        durationLabel: '5 min (supported rest)',
        howToSteps: [
          'Place a rolled blanket or firm bolster horizontally beneath your upper shoulder blades.',
          'Lie back gently over the support so your chest lifts and your head rests comfortably on a pillow.',
          'Let your arms open wide with palms facing upward to broaden the collarbones.',
          'Breathe slowly into the side ribs for 8–10 unhurried breaths before rolling gently to one side.',
        ],
        lungOrPerformanceImpact:
          'Passively opens the upper thoracic cavity and bronchial pathways with zero cardiovascular strain.',
        tailoredNote: isSolo
          ? 'A zero-strain evening thoracic opener to decompress your chest after solo work hours or indoor training.'
          : 'Using a bolster or folded cushion makes this restorative pose completely safe for seniors and asthma recovery.',
        pacerConfig: { inhaleSec: 4, holdSec: 2, exhaleSec: 6 },
      },
      {
        id: 'health-setu-bandhasana',
        name: 'Setu Bandhasana (Bridge Pose)',
        categoryGroup: 'Chest-Opening Asanas',
        sessionType: 'Restorative',
        durationMinutes: 5,
        durationLabel: '5 min (3–4 slow rounds)',
        howToSteps: [
          'Lie on your back with knees bent, feet hip-width apart and flat on the floor.',
          'Inhale slowly and press through your heels to lift hips gently until torso forms a soft slope.',
          'Roll shoulders slightly underneath to open your sternum toward your chin.',
          'Hold for 3–4 calm breaths, then exhale and roll down vertebra by vertebra.',
        ],
        lungOrPerformanceImpact:
          'Opens the anterior ribcage and diaphragm attachment while encouraging steady, full-depth exhalations.',
        tailoredNote:
          'Place a firm cushion under the sacrum for a gentle supported bridge if lower-back stiffness is present.',
        pacerConfig: { inhaleSec: 4, holdSec: 2, exhaleSec: 6 },
      },
    ],
  };

  const trainYoga: SmogActionPlan['trainYoga'] = {
    summary: hasSmokingExposure
      ? `Low-intensity indoor conditioning calibrated for ${displayName} at US AQI ${usAqi} and ${cigarettesCount} ${
          cigarettesCount === 1 ? 'cigarette' : 'cigarettes'
        } today (~${combinedPm25Burden.toFixed(1)} µg/m³ combined PM2.5)—avoid outdoor cardio and prioritize nasal pacing.`
      : isSolo
        ? `Personal indoor smog-day fitness and breath conditioning for your solo workout schedule when ${displayName} sits at US AQI ${usAqi}, keeping your lungs protected from outdoor PM2.5.`
        : `Indoor smog-day conditioning for runners and active adults when ${displayName} sits at US AQI ${usAqi}, protecting lungs from outdoor PM2.5 inhalation.`,
    smogConditioningNote: hasSmokingExposure
      ? `Wait at least 2 hours after smoking before starting dynamic movement. With AQI ${usAqi} and ${cigarettesCount} ${
          cigarettesCount === 1 ? 'cigarette' : 'cigarettes'
        } logged today, skip outdoor running/HIIT completely and keep indoor sessions slow and strictly nasal-breathed.`
      : isSevere
        ? `At AQI ${usAqi}, move all running indoors, keep windows shut, and strictly maintain nasal breathing so minute-ventilation stays controlled.`
        : `Perform dynamic rounds in a dust-mopped interior room with steady nasal breath pacing to maintain aerobic base safely.`,
    sessions: [
      {
        id: 'train-surya-namaskar',
        name: 'Surya Namaskar (Sun Salutation Conditioning Flow)',
        categoryGroup: 'Dynamic Flow',
        sessionType: 'Dynamic Flow',
        durationMinutes: 12,
        durationLabel: '12 min (8–12 controlled rounds)',
        howToSteps: [
          'Begin standing tall in Samasthiti; inhale sweeping arms overhead, exhale hinging into forward fold.',
          'Step back to high plank on inhale, lower with control on exhale, and lift into Cobra/Upward Dog on inhale.',
          'Press back to Downward-Facing Dog for 2 steady nasal breaths to lengthen calves and hamstrings.',
          'Step forward on inhale, rise tall, and link each transition to one smooth nasal breath.',
        ],
        lungOrPerformanceImpact:
          'Delivers aerobic heart-rate conditioning, posterior-chain mobility, and core endurance indoors without inhaling high-velocity outdoor PM2.5.',
        tailoredNote: isSevere
          ? 'Keep pace moderate so you can breathe strictly through your nose throughout every round.'
          : 'Build gradually from 6 warm-up rounds to 12 rhythmic rounds for full indoor cardio.',
        pacerConfig: { inhaleSec: 4, holdSec: 0, exhaleSec: 4 },
      },
      {
        id: 'train-ujjayi',
        name: 'Ujjayi Pranayama (Ocean Breath Endurance Drill)',
        categoryGroup: 'Breath-Hold & Lung Capacity Drills',
        sessionType: 'Pranayama',
        durationMinutes: 6,
        durationLabel: '6 min (12 rhythmic cycles)',
        howToSteps: [
          'Sit tall with ribcage stacked over pelvis; seal lips gently for nasal-only breathing.',
          'Lightly constrict the back of the throat to create a soft ocean-wave whisper on a 4-second inhale.',
          'Hold comfortably at the top for 4 seconds without shoulder tension.',
          'Exhale smoothly for 6 seconds with the same gentle throat resistance.',
        ],
        lungOrPerformanceImpact:
          'Builds inspiratory/expiratory muscle strength and trains rhythmic cadence control for distance running.',
        tailoredNote:
          'Keep the throat whisper soft and smooth—never force loud or harsh inhalations when indoor air is unfiltered.',
        pacerConfig: { inhaleSec: 4, holdSec: 4, exhaleSec: 6 },
      },
      {
        id: 'train-kumbhaka-pursed',
        name: 'Controlled Kumbhaka & Pursed-Lip Recovery Breathing',
        categoryGroup: 'Breath-Hold & Lung Capacity Drills',
        sessionType: 'Pranayama',
        durationMinutes: 6,
        durationLabel: '6 min (10 recovery cycles)',
        howToSteps: [
          'Inhale steadily through the nose for 4 seconds, expanding the lower ribs 360 degrees.',
          'Apply a comfortable, relaxed breath-hold (Antara Kumbhaka) for 4 seconds.',
          'Purse lips gently as if blowing through a narrow straw and exhale steadily for 6 seconds.',
          'Rest briefly before beginning the next cycle to keep heart rate calm.',
        ],
        lungOrPerformanceImpact:
          'Strengthens the diaphragm and intercostal muscles while positive airway pressure keeps small airways open during post-exercise recovery.',
        tailoredNote:
          'Skip or shorten the breath-hold to 2 seconds if you feel any chest tightness during high-AQI days.',
        pacerConfig: { inhaleSec: 4, holdSec: isSevere ? 2 : 4, exhaleSec: 6 },
      },
      {
        id: 'train-ustrasana',
        name: 'Ustrasana (Camel Pose Thoracic Opener)',
        categoryGroup: 'Post-Workout Chest & Thoracic Mobility',
        sessionType: 'Restorative',
        durationMinutes: 4,
        durationLabel: '4 min (3 holds × 30s)',
        howToSteps: [
          'Kneel hip-width apart with toes tucked and hands supporting your lower back/sacrum.',
          'Inhale to lift your sternum upward, gently drawing elbows toward each other.',
          'Lean back only as far as comfortable—either keep hands on hips or reach lightly to heels.',
          'Take 3–4 smooth breaths into your upper chest, then rise on an inhale and rest in Child Pose.',
        ],
        lungOrPerformanceImpact:
          'Reverses rounded desk and runner posture, opening the anterior thoracic wall to maximize tidal oxygen uptake.',
        tailoredNote:
          'Keep chin slightly tucked rather than dropping the head back if you feel any neck tension.',
        pacerConfig: { inhaleSec: 4, holdSec: 2, exhaleSec: 6 },
      },
      {
        id: 'train-dhanurasana',
        name: 'Dhanurasana (Bow Pose Post-Workout Expansion)',
        categoryGroup: 'Post-Workout Chest & Thoracic Mobility',
        sessionType: 'Restorative',
        durationMinutes: 4,
        durationLabel: '4 min (3 controlled lifts)',
        howToSteps: [
          'Lie prone on your mat, bend both knees, and hold the outsides of your ankles.',
          'Inhale deeply and kick your shins gently backward to lift your chest and thighs off the mat.',
          'Keep knees hip-width apart and gaze softly forward while breathing steadily across your collarbone.',
          'Exhale smoothly to release down, turn one cheek to the mat, and recover for 20 seconds.',
        ],
        lungOrPerformanceImpact:
          'Mobilizes the thoracic spine and strengthens upper-back extensors so lungs expand freely during endurance efforts.',
        tailoredNote:
          'If ankles feel tight, loop a towel around your feet or perform alternating half-bow lifts.',
        pacerConfig: { inhaleSec: 4, holdSec: 2, exhaleSec: 6 },
      },
    ],
  };

  const smokerRecovery: SmokerRecoveryModule | null = hasSmokingExposure
    ? {
        cigarettesCount,
        smokingEquivalentPm25,
        combinedPm25Burden,
        burdenSummary: `Smoking ${cigarettesCount} ${
          cigarettesCount === 1 ? 'cigarette' : 'cigarettes'
        } today adds roughly +${smokingEquivalentPm25} µg/m³ equivalent PM2.5 on top of ${displayName}'s ambient ${pm25.toFixed(
          1
        )} µg/m³ (${combinedPm25Burden.toFixed(
          1
        )} µg/m³ total). Follow these immediate 60-minute recovery initials and gentle indoor lung-clearing drills.`,
        cardioWarning:
          isUnhealthy || cigarettesCount >= 3
            ? `Avoid all intense outdoor cardio, running, or mouth-breathing exertion for at least 2 hours (and all day outdoors while AQI is ${usAqi}). Elevated carbon monoxide from smoke plus ambient PM2.5 sharply increases cardiovascular and bronchial strain.`
            : `Avoid strenuous outdoor cardio for at least 2 hours after smoking so heart rate, vascular tone, and airway cilia begin recovering in clean indoor air.`,
        immediateInitials: [
          {
            id: 'smoker-initial-steam',
            title: 'Warm Saline Gargle & Plain Steam Inhalation',
            timingWindow: '0–15 min',
            action:
              'Gargle gently with warm salt water for 30 seconds, then inhale plain warm steam (towel over bowl, no harsh menthol/eucalyptus oils) for 5–7 minutes indoors.',
            physiologicalReason:
              'Hydrates dried pharyngeal lining and loosens tar-trapped mucus so airway cilia can clear smoke and ambient PM2.5 particles upward.',
          },
          {
            id: 'smoker-initial-hydration',
            title: 'Warm Water + Vitamin-C / Antioxidant Hydration',
            timingWindow: '15–30 min',
            action:
              'Sip 350–500 ml of warm water with fresh lemon/amla or warm ginger-tulsi infusion within the first 30 minutes, avoiding iced or sugary drinks.',
            physiologicalReason:
              'Thins bronchial secretions for easier clearance while Vitamin C and polyphenols help buffer acute free-radical oxidative stress in lung tissue.',
          },
          {
            id: 'smoker-initial-exertion-hold',
            title: '2-Hour Outdoor Exertion Hold',
            timingWindow: 'Next 2 hours',
            action:
              'Pause brisk walking, running, stair sprints, and heavy outdoor errands for at least 2 full hours; wear a snug N95 mask if stepping outside is unavoidable.',
            physiologicalReason:
              'Prevents elevated minute-ventilation from pulling ambient winter PM2.5 deep into smoke-sensitized bronchioles while carboxyhemoglobin levels remain raised.',
          },
          {
            id: 'smoker-initial-clean-air',
            title: 'Switch Immediately to Filtered / Sealed Indoor Air',
            timingWindow: 'Immediate',
            action:
              profile.homeSetup === 'No Air Purifier (Budget/Natural hacks needed)'
                ? 'Move into a closed interior room with wet-mopped floors and damp-cloth door-gap seals, avoiding incense, dhoop, or kitchen frying fumes.'
                : `Move immediately into your ${profile.homeSetup} clean-air room with windows shut and fan running on medium-high for 45 minutes.`,
            physiologicalReason:
              'Halts ongoing dual particulate exposure immediately so mucociliary clearance can outpace fresh fine-particle deposition.',
          },
        ],
        lungClearingExercises: [
          {
            id: 'smoker-pursed-lip',
            name: 'Pursed-Lip Breathing (Trapped-Air Release)',
            categoryGroup: 'Lung-Clearing Drill',
            sessionType: 'Pranayama',
            durationMinutes: 5,
            durationLabel: '5 min (10–12 slow cycles)',
            howToSteps: [
              'Sit upright in a clean indoor room with neck and shoulders completely relaxed.',
              'Inhale slowly and quietly through your nose for 4 seconds without lifting your shoulders.',
              'Purse your lips gently as if cooling hot tea or blowing through a narrow straw.',
              'Exhale slowly and evenly through pursed lips for 6–8 seconds without forcing the last air out.',
            ],
            lungOrPerformanceImpact:
              'Creates gentle positive end-expiratory pressure (PEEP) that keeps small airways open longer, releases stale trapped air, and improves oxygen exchange.',
            tailoredNote: `Calibrated for ${cigarettesCount} ${
              cigarettesCount === 1 ? 'cigarette' : 'cigarettes'
            } today at AQI ${usAqi}: keep the exhale twice as long as the inhale and never gasp.`,
            pacerConfig: { inhaleSec: 4, holdSec: 0, exhaleSec: 7 },
          },
          {
            id: 'smoker-diaphragmatic',
            name: 'Diaphragmatic (Belly) Breathing',
            categoryGroup: 'Lung-Clearing Drill',
            sessionType: 'Pranayama',
            durationMinutes: 6,
            durationLabel: '6 min (12 calm cycles)',
            howToSteps: [
              'Lie back with knees bent or sit supported with one hand on your upper chest and one on your abdomen.',
              'Inhale gently through the nose for 4 seconds so your lower belly rises while your upper chest stays still.',
              'Hold comfortably for 2 seconds without clenching your jaw or throat.',
              'Exhale smoothly for 6 seconds as your abdomen falls naturally inward.',
            ],
            lungOrPerformanceImpact:
              'Ventilates lower lung bases that often stay under-recruited after smoking, reducing shallow chest breathing and calming nicotine-elevated heart rate.',
            tailoredNote:
              'Practice indoors away from smoke or traffic drafts; pause if you feel lightheaded.',
            pacerConfig: { inhaleSec: 4, holdSec: 2, exhaleSec: 6 },
          },
          {
            id: 'smoker-huff-cough',
            name: 'Huff Coughing (Controlled Airway Clearance)',
            categoryGroup: 'Airway Clearance',
            sessionType: 'Restorative',
            durationMinutes: 4,
            durationLabel: '4 min (3 gentle cycles)',
            howToSteps: [
              'Take 3 slow diaphragmatic breaths first to relax the chest wall after warm water or steam.',
              'Take a medium-sized gentle breath in through your nose (about 70% full, never a forceful gasp).',
              'Open your mouth in an "O" shape and push air out steadily with a soft "haaa" huff—like fogging up a mirror.',
              'Repeat 2 gentle huffs, then rest with 30 seconds of calm Pursed-Lip Breathing before deciding if another cycle is needed.',
            ],
            lungOrPerformanceImpact:
              'Mobilizes loosened mucus from mid-airways gently without the bronchial collapse and throat irritation caused by harsh, explosive coughing.',
            tailoredNote:
              'Always perform after sipping warm water or plain steam inhalation, and stop immediately if airways feel tight or wheezy.',
            pacerConfig: { inhaleSec: 3, holdSec: 1, exhaleSec: 4 },
          },
          {
            id: 'smoker-bhramari-nadi',
            name: 'Bhramari & Nadi Shodhana Pranayama',
            categoryGroup: 'Soothing Pranayama',
            sessionType: 'Pranayama',
            durationMinutes: 6,
            durationLabel: '6 min (5 Bhramari + 5 Nadi Shodhana)',
            howToSteps: [
              'Begin with 5 slow Bhramari breaths: inhale 4s through the nose, then exhale 6s with a soft, steady low humming sound.',
              'Transition to 5 balanced Nadi Shodhana rounds: inhale left nostril (4s), switch softly, exhale right nostril (6s), then inhale right and exhale left.',
              'Keep breath velocity whisper-quiet so air warms and filters fully through the nasal passages.',
              'Finish with 30 seconds of quiet sitting and sip warm water afterward.',
            ],
            lungOrPerformanceImpact:
              'Increases nasal nitric oxide to soothe smoke-irritated throat/sinuses and lowers sympathetic stress cravings without forceful breathing.',
            tailoredNote:
              'Strictly avoid forceful rapid practices like Kapalabhati or Bhastrika and avoid intense outdoor cardio while combined particulate load is high.',
            pacerConfig: { inhaleSec: 4, holdSec: 0, exhaleSec: 6 },
          },
        ],
      }
    : null;

  const weather = aqiData.weather ?? buildFallbackWeatherSnapshot(pm25);
  const fogHazard = calculateFogHazard({
    temperatureC: weather.temperatureC,
    dewPointC: weather.dewPointC,
    relativeHumidityPct: weather.relativeHumidityPct,
    windSpeedKmh: weather.windSpeedKmh,
    pm25,
    commute: profile.commute,
    reportedVisibilityMeters: weather.reportedVisibilityMeters,
  });

  const roadSafetyAdvice = {
    visibilityMeters: fogHazard.estimatedVisibilityMeters,
    fogSeverity: fogHazard.fogSeverity,
    safeSpeedCapKmh: fogHazard.safeSpeedCapKmh,
    potholeBrakingRisk: fogHazard.potholeBrakingRisk,
    commuteDirective: fogHazard.summary,
    hazardChecklist: fogHazard.commuterTips,
  };

  return {
    generatedAt: new Date().toISOString(),
    citySummary,
    headlineAdvisory,
    dailyRoutine,
    indoorHacks,
    sustainableSwaps,
    communityAlert,
    healthYoga,
    trainYoga,
    smokerRecovery,
    roadSafetyAdvice,
  };
}

/**
 * Generates a clean, punctuation-friendly multilingual TTS voice briefing starting
 * with the required `"Hello sir, here is your personalized smog action plan for [City]."`
 * opening across English, Hindi, Hinglish, Spanish, French, and German.
 */
export function buildLocalVoiceBriefing(
  aqiData: LiveAqiData,
  plan: SmogActionPlan,
  language: string
): string {
  const cityName = aqiData.displayName || aqiData.query || 'your city';
  const aqi = aqiData.current.usAqi;
  const pm25 = aqiData.current.pm25.toFixed(1);
  const windowLabel = aqiData.safeWindow.windowLabel;
  const topHack = plan.indoorHacks?.[0]?.title || 'wet-mopping and sealing door gaps';
  const opening = `Hello sir, here is your personalized smog action plan for ${cityName}.`;
  const smokerNoteEn =
    plan.smokerRecovery && plan.smokerRecovery.cigarettesCount > 0
      ? ` Because ${plan.smokerRecovery.cigarettesCount} ${
          plan.smokerRecovery.cigarettesCount === 1 ? 'cigarette was' : 'cigarettes were'
        } logged today, start your immediate recovery with ${
          plan.smokerRecovery.immediateInitials?.[0]?.title || 'warm steam inhalation and hydration'
        } and avoid outdoor cardio for at least two hours.`
      : '';

  switch (language) {
    case 'Hindi (हिन्दी)':
      return `${opening} अभी यहाँ का यूएस ए क्यू आई ${aqi} है और पी एम 2.5 का स्तर ${pm25} माइक्रोग्राम प्रति घन मीटर है। बाहर जाने के लिए सबसे सुरक्षित समय ${windowLabel} के बीच है। घर के अंदर की हवा साफ रखने के लिए ${topHack} अपनाएं। ${plan.headlineAdvisory}`;
    case 'Hinglish':
      return `${opening} Abhi ${cityName} ka live US AQI ${aqi} hai aur PM 2.5 level ${pm25} micrograms per cubic meter hai. Bahar jaane ke liye sabse safe outdoor window ${windowLabel} hai. Ghar ke andar hawa clean rakhne ke liye ${topHack} follow karein, aur bahar nikalte waqt N95 mask zaroor pehnein.${
        plan.smokerRecovery && plan.smokerRecovery.cigarettesCount > 0
          ? ` Aaj ${plan.smokerRecovery.cigarettesCount} cigarette ke baad pehle 60 minute mein warm steam aur warm water hydration lein aur 2 ghante tak bahar heavy exercise avoid karein.`
          : ''
      }`;
    case 'Spanish':
      return `${opening} En este momento el índice de calidad del aire es ${aqi}, con PM 2.5 en ${pm25} microgramos por metro cúbico. La ventana más segura al aire libre es de ${windowLabel}. Para el aire interior, priorice ${topHack} y limite la exposición de las personas sensibles.`;
    case 'French':
      return `${opening} L'indice de qualité de l'air actuel est de ${aqi}, avec des particules PM 2.5 à ${pm25} microgrammes par mètre cube. Le créneau extérieur le plus sûr est ${windowLabel}. À l'intérieur, privilégiez ${topHack} et protégez les personnes sensibles avec un masque N95 à l'extérieur.`;
    case 'German':
      return `${opening} Der aktuelle Luftqualitätsindex liegt bei ${aqi}, mit einem PM 2.5 Wert von ${pm25} Mikrogramm pro Kubikmeter. Das sicherste Zeitfenster im Freien ist ${windowLabel}. Für saubere Raumluft empfehlen wir ${topHack} und bei Bedarf eine N95 Maske im Freien.`;
    case 'English (India)':
    default:
      return `${opening} Right now, the live US AQI is ${aqi}, with PM 2.5 at ${pm25} micrograms per cubic meter. Your safest outdoor window today is ${windowLabel}. For cleaner indoor air, start with ${topHack}.${smokerNoteEn} Priority recommendation: ${plan.headlineAdvisory}`;
  }
}
