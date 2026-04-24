/**
 * app.jsx — AQI Intelligence Dashboard
 *
 * ─── ARCHITECTURE ──────────────────────────────────────────
 * All user-adjustable environmental data lives in ONE state object:
 *   envParams: { pm25, pm10, temperature, humidity }
 *
 * To connect your backend:
 *   1. Call your API in handlePredict() (search for "── API INTEGRATION POINT ──")
 *   2. Pass envParams as the request body: JSON.stringify(envParams)
 *   3. Replace the local calculateAQI() result with your API response
 *
 * ─── COMPONENT TREE ───────────────────────────────────────
 *   App
 *   ├── BlobBackground
 *   ├── Header
 *   ├── GaugePanel          ← RadialGauge + StatPills
 *   ├── ControlPanel        ← Sliders + SimToggle
 *   ├── TrendChart          ← Recharts AreaChart (24h forecast)
 *   ├── GlobalContextPanel  ← CountrySelector + StationInfo
 *   └── HealthRecsPanel     ← 3 recommendation cards
 */

"use strict";

// ─── DESTRUCTURE GLOBALS ────────────────────────────────────────────────────
const {
  useState, useEffect, useRef, useCallback, useMemo
} = React;

const {
  AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer
} = Recharts;


// ══════════════════════════════════════════════════════════════════════════════
// AQI CONSTANTS & HELPERS
// ══════════════════════════════════════════════════════════════════════════════

const AQI_LEVELS = [
  {
    max: 50,
    label: 'Good',
    shortLabel: 'Good',
    color: '#10b981',
    blob1: '#059669',
    blob2: '#34d399',
    recStyle: 'rec-safe',
    badgeStyle: 'status-safe',
  },
  {
    max: 100,
    label: 'Moderate',
    shortLabel: 'Moderate',
    color: '#f59e0b',
    blob1: '#d97706',
    blob2: '#fbbf24',
    recStyle: 'rec-moderate',
    badgeStyle: 'status-caution',
  },
  {
    max: 150,
    label: 'Unhealthy for Sensitive Groups',
    shortLabel: 'Unhealthy (Sensitive)',
    color: '#f97316',
    blob1: '#ea580c',
    blob2: '#fb923c',
    recStyle: 'rec-warn',
    badgeStyle: 'status-warn',
  },
  {
    max: 200,
    label: 'Unhealthy',
    shortLabel: 'Unhealthy',
    color: '#ef4444',
    blob1: '#dc2626',
    blob2: '#f87171',
    recStyle: 'rec-warn',
    badgeStyle: 'status-warn',
  },
  {
    max: 300,
    label: 'Very Unhealthy',
    shortLabel: 'Very Unhealthy',
    color: '#a855f7',
    blob1: '#9333ea',
    blob2: '#c084fc',
    recStyle: 'rec-warn',
    badgeStyle: 'status-warn',
  },
  {
    max: 500,
    label: 'Hazardous',
    shortLabel: 'Hazardous',
    color: '#dc2626',
    blob1: '#991b1b',
    blob2: '#b91c1c',
    recStyle: 'rec-warn',
    badgeStyle: 'status-warn',
  },
];

function getAQILevel(aqi) {
  return AQI_LEVELS.find(l => aqi <= l.max) || AQI_LEVELS[AQI_LEVELS.length - 1];
}

/**
 * calculateAQI — US EPA breakpoint formula (simplified)
 * Uses PM2.5 and PM10 — returns the higher of the two sub-indices.
 *
 * ── API INTEGRATION POINT ──────────────────────────────────
 * Replace this function's return value with your backend's prediction:
 *
 *   const res = await fetch('/api/predict', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify(envParams),           // <-- full state object
 *   });
 *   const { predicted_aqi } = await res.json();
 *   return predicted_aqi;
 * ──────────────────────────────────────────────────────────
 */
function calculateAQI({ pm25, pm10 }) {
  const p25 = Number(pm25);
  const p10 = Number(pm10);

  // PM2.5 → AQI
  let aqi25;
  if      (p25 <=  12.0) aqi25 = lerp(p25,    0,  12.0,   0,  50);
  else if (p25 <=  35.4) aqi25 = lerp(p25, 12.1,  35.4,  51, 100);
  else if (p25 <=  55.4) aqi25 = lerp(p25, 35.5,  55.4, 101, 150);
  else if (p25 <= 150.4) aqi25 = lerp(p25, 55.5, 150.4, 151, 200);
  else if (p25 <= 250.4) aqi25 = lerp(p25, 150.5, 250.4, 201, 300);
  else                   aqi25 = lerp(p25, 250.5, 500.4, 301, 500);

  // PM10 → AQI
  let aqi10;
  if      (p10 <=  54) aqi10 = lerp(p10,   0,  54,   0,  50);
  else if (p10 <= 154) aqi10 = lerp(p10,  55, 154,  51, 100);
  else if (p10 <= 254) aqi10 = lerp(p10, 155, 254, 101, 150);
  else if (p10 <= 354) aqi10 = lerp(p10, 255, 354, 151, 200);
  else if (p10 <= 424) aqi10 = lerp(p10, 355, 424, 201, 300);
  else                 aqi10 = lerp(p10, 425, 504, 301, 500);

  return Math.min(500, Math.round(Math.max(aqi25, aqi10)));
}

// Linear interpolation between two AQI breakpoints
function lerp(c, cLow, cHigh, iLow, iHigh) {
  return ((iHigh - iLow) / (cHigh - cLow)) * (c - cLow) + iLow;
}


// ══════════════════════════════════════════════════════════════════════════════
// 24-HOUR TREND DATA GENERATOR
// ══════════════════════════════════════════════════════════════════════════════

function generate24hTrend(baseAqi) {
  const now = new Date();
  return Array.from({ length: 25 }, (_, i) => {
    const h = (now.getHours() + i) % 24;
    const label = i === 0 ? 'Now'
      : h === 0 ? '12am'
      : h < 12  ? `${h}am`
      : h === 12 ? '12pm'
      : `${h - 12}pm`;

    // Sinusoidal variation + noise for realism
    const diurnal = Math.sin((h / 24) * Math.PI * 2 - 1) * 18;
    const noise   = (Math.random() * 22) - 11;
    const aqi     = Math.max(0, Math.min(500, Math.round(baseAqi + diurnal + noise)));
    return { label, aqi };
  });
}


// ══════════════════════════════════════════════════════════════════════════════
// COUNTRY & STATION DATA  (replace with live API later)
// ══════════════════════════════════════════════════════════════════════════════

const COUNTRIES = [
  {
    code: 'IN', flag: '🇮🇳', name: 'India',
    stations: [
      { name: 'Delhi – Anand Vihar', aqi: 178, updated: '3 min ago' },
      { name: 'Mumbai – Bandra Kurla', aqi: 89,  updated: '6 min ago' },
      { name: 'Bengaluru – Silk Board', aqi: 62,  updated: '1 min ago' },
    ],
  },
  {
    code: 'CN', flag: '🇨🇳', name: 'China',
    stations: [
      { name: 'Beijing – Dongcheng', aqi: 155, updated: '2 min ago' },
      { name: 'Shanghai – Pudong',   aqi: 72,  updated: '8 min ago' },
    ],
  },
  {
    code: 'US', flag: '🇺🇸', name: 'United States',
    stations: [
      { name: 'Los Angeles – Downtown', aqi: 58, updated: '1 min ago' },
      { name: 'New York – Manhattan',   aqi: 42, updated: '4 min ago' },
      { name: 'Houston – Downtown',     aqi: 67, updated: '5 min ago' },
    ],
  },
  {
    code: 'DE', flag: '🇩🇪', name: 'Germany',
    stations: [
      { name: 'Berlin – Mitte',    aqi: 31, updated: '7 min ago' },
      { name: 'Munich – City Ctr', aqi: 26, updated: '3 min ago' },
    ],
  },
  {
    code: 'AU', flag: '🇦🇺', name: 'Australia',
    stations: [
      { name: 'Sydney – CBD',        aqi: 22, updated: '2 min ago' },
      { name: 'Melbourne – Fitzroy', aqi: 18, updated: '9 min ago' },
    ],
  },
  {
    code: 'JP', flag: '🇯🇵', name: 'Japan',
    stations: [
      { name: 'Tokyo – Shinjuku', aqi: 44, updated: '4 min ago' },
      { name: 'Osaka – Umeda',    aqi: 37, updated: '6 min ago' },
    ],
  },
];


// ══════════════════════════════════════════════════════════════════════════════
// HEALTH RECOMMENDATIONS
// ══════════════════════════════════════════════════════════════════════════════

function getRecommendations(aqi) {
  if (aqi <= 50) return [
    {
      category: 'Outdoor Activity',
      icon: '🏃',
      title: 'Safe to Run',
      detail: 'Perfect conditions for all outdoor activities including strenuous exercise.',
      style: 'rec-safe',
      badge: 'Safe',
      badgeStyle: 'status-safe',
    },
    {
      category: 'Protection',
      icon: '😊',
      title: 'No Mask Needed',
      detail: 'Air quality poses little or no risk — enjoy the outdoors freely.',
      style: 'rec-safe',
      badge: 'Safe',
      badgeStyle: 'status-safe',
    },
    {
      category: 'Vulnerable Groups',
      icon: '👶',
      title: 'All Groups Safe',
      detail: 'Elderly, children, and those with respiratory conditions can go outside without restrictions.',
      style: 'rec-safe',
      badge: 'Safe',
      badgeStyle: 'status-safe',
    },
  ];

  if (aqi <= 100) return [
    {
      category: 'Outdoor Activity',
      icon: '🚶',
      title: 'Light Activity OK',
      detail: 'Most people can exercise outdoors. Unusually sensitive individuals should consider limiting prolonged exertion.',
      style: 'rec-moderate',
      badge: 'Moderate',
      badgeStyle: 'status-caution',
    },
    {
      category: 'Protection',
      icon: '😷',
      title: 'Optional Mask',
      detail: 'A surgical mask is optional for sensitive individuals during extended outdoor exposure.',
      style: 'rec-safe',
      badge: 'Low Risk',
      badgeStyle: 'status-safe',
    },
    {
      category: 'Vulnerable Groups',
      icon: '⚠️',
      title: 'Sensitive Groups: Caution',
      detail: 'Children, elderly, and those with asthma or heart disease should limit prolonged outdoor activity.',
      style: 'rec-moderate',
      badge: 'Caution',
      badgeStyle: 'status-caution',
    },
  ];

  if (aqi <= 150) return [
    {
      category: 'Outdoor Activity',
      icon: '🚫',
      title: 'Limit Exercise',
      detail: 'Active children and adults should limit prolonged outdoor exertion. Move heavy workouts indoors.',
      style: 'rec-warn',
      badge: 'Limit',
      badgeStyle: 'status-warn',
    },
    {
      category: 'Protection',
      icon: '😷',
      title: 'Wear Surgical Mask',
      detail: 'A mask is recommended if going outside for more than 30 minutes.',
      style: 'rec-warn',
      badge: 'Advised',
      badgeStyle: 'status-caution',
    },
    {
      category: 'Vulnerable Groups',
      icon: '🏠',
      title: 'Stay Indoors',
      detail: 'Elderly, children under 14, and anyone with heart or lung conditions should avoid outdoor activity.',
      style: 'rec-warn',
      badge: 'High Risk',
      badgeStyle: 'status-warn',
    },
  ];

  // Unhealthy and above
  return [
    {
      category: 'Outdoor Activity',
      icon: '🏠',
      title: 'Stay Indoors',
      detail: 'Everyone should avoid all outdoor physical activity. Keep windows and doors closed.',
      style: 'rec-warn',
      badge: 'Danger',
      badgeStyle: 'status-warn',
    },
    {
      category: 'Protection',
      icon: '🛡️',
      title: 'Wear N95 / KN95',
      detail: 'An N95 or KN95 respirator is required for any unavoidable outdoor exposure.',
      style: 'rec-warn',
      badge: 'Required',
      badgeStyle: 'status-warn',
    },
    {
      category: 'Vulnerable Groups',
      icon: '🚨',
      title: 'Health Emergency Risk',
      detail: 'Serious health effects are possible for everyone. All vulnerable groups must remain indoors with an air purifier running.',
      style: 'rec-warn',
      badge: 'Critical',
      badgeStyle: 'status-warn',
    },
  ];
}


// ══════════════════════════════════════════════════════════════════════════════
// RADIAL GAUGE COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

function RadialGauge({ aqi, level }) {
  const SIZE = 280;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const RADIUS = 106;
  const STROKE = 14;
  const START_DEG = 135;
  const END_DEG   = 405;
  const SWEEP     = END_DEG - START_DEG;

  const toRad = deg => (deg - 90) * (Math.PI / 180);

  // Build SVG arc path
  const arcPath = (startDeg, endDeg, r) => {
    const s = toRad(startDeg);
    const e = toRad(endDeg);
    const x1 = CX + r * Math.cos(s);
    const y1 = CY + r * Math.sin(s);
    const x2 = CX + r * Math.cos(e);
    const y2 = CY + r * Math.sin(e);
    const large = (endDeg - startDeg) > 180 ? 1 : 0;
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  };

  const progress  = Math.min(Math.max(aqi / 500, 0), 1);
  const fillAngle = START_DEG + progress * SWEEP;

  // Needle tip coords
  const needleLen = RADIUS - STROKE / 2 - 10;
  const needleRad = toRad(fillAngle);
  const nx = CX + needleLen * Math.cos(needleRad);
  const ny = CY + needleLen * Math.sin(needleRad);

  // Tick marks at key AQI breakpoints
  const ticks = [0, 50, 100, 150, 200, 300, 500];

  return (
    <div className="gauge-wrapper">
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        style={{ overflow: 'visible', display: 'block', margin: '0 auto' }}
        aria-label={`AQI gauge showing ${aqi} — ${level.label}`}
        role="img"
      >
        <defs>
          {/* Spectrum gradient for the arc */}
          <linearGradient id="spectrumGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#10b981" />
            <stop offset="25%"  stopColor="#f59e0b" />
            <stop offset="50%"  stopColor="#f97316" />
            <stop offset="70%"  stopColor="#ef4444" />
            <stop offset="87%"  stopColor="#a855f7" />
            <stop offset="100%" stopColor="#7f1d1d" />
          </linearGradient>

          {/* Soft glow filter */}
          <filter id="arcGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter id="needleGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Track (background arc) */}
        <path
          d={arcPath(START_DEG, END_DEG, RADIUS)}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={STROKE}
          strokeLinecap="round"
        />

        {/* Progress arc */}
        <path
          d={arcPath(START_DEG, Math.max(START_DEG + 0.01, fillAngle), RADIUS)}
          fill="none"
          stroke="url(#spectrumGrad)"
          strokeWidth={STROKE}
          strokeLinecap="round"
          filter="url(#arcGlow)"
          style={{ transition: 'all 0.85s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
        />

        {/* AQI breakpoint ticks */}
        {ticks.map(val => {
          const deg = START_DEG + (val / 500) * SWEEP;
          const rad = toRad(deg);
          const outerR = RADIUS + STROKE / 2 + 7;
          const innerR = RADIUS + STROKE / 2 + 3;
          return (
            <line
              key={val}
              x1={(CX + outerR * Math.cos(rad)).toFixed(2)}
              y1={(CY + outerR * Math.sin(rad)).toFixed(2)}
              x2={(CX + innerR * Math.cos(rad)).toFixed(2)}
              y2={(CY + innerR * Math.sin(rad)).toFixed(2)}
              stroke="rgba(255,255,255,0.25)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          );
        })}

        {/* Needle */}
        <line
          x1={CX} y1={CY}
          x2={nx.toFixed(2)} y2={ny.toFixed(2)}
          stroke={level.color}
          strokeWidth="3"
          strokeLinecap="round"
          filter="url(#needleGlow)"
          style={{ transition: 'all 0.85s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
        />

        {/* Needle pivot */}
        <circle cx={CX} cy={CY} r="9"  fill={level.color} filter="url(#needleGlow)"
          style={{ transition: 'fill 0.8s ease' }} />
        <circle cx={CX} cy={CY} r="4.5" fill="#fff" />
        <circle cx={CX} cy={CY} r="2"   fill={level.color} style={{ transition: 'fill 0.8s ease' }} />
      </svg>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
// SLIDER COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

function Slider({ label, unit, min, max, value, step = 1, onChange, color }) {
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 500, color: '#94a3b8' }}>{label}</span>
        <span style={{ fontSize: '0.85rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color }}>
          {value}{unit}
        </span>
      </div>

      <div className="slider-wrapper">
        {/* Filled track */}
        <div
          className="slider-fill"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${color}55, ${color})`,
          }}
        />

        {/* Thumb */}
        <div
          className="slider-thumb"
          style={{
            left: `${pct}%`,
            borderColor: color,
            boxShadow: `0 0 10px ${color}80`,
          }}
        />

        {/* Native range input (invisible — handles interaction) */}
        <input
          type="range"
          className="slider-native"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
        <span style={{ fontSize: '0.65rem', color: '#475569' }}>{min}{unit}</span>
        <span style={{ fontSize: '0.65rem', color: '#475569' }}>{max}{unit}</span>
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
// CHART TOOLTIP
// ══════════════════════════════════════════════════════════════════════════════

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const val = payload[0].value;
  const lvl = getAQILevel(val);
  return (
    <div style={{
      background: 'rgba(8,8,18,0.95)',
      border: `1px solid ${lvl.color}44`,
      borderRadius: '10px',
      padding: '10px 14px',
      backdropFilter: 'blur(12px)',
    }}>
      <p style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '4px' }}>{label}</p>
      <p style={{ fontSize: '1rem', fontWeight: 700, fontFamily: 'Orbitron, monospace', color: lvl.color }}>
        AQI {val}
      </p>
      <p style={{ fontSize: '0.65rem', color: lvl.color, marginTop: '2px' }}>{lvl.shortLabel}</p>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ══════════════════════════════════════════════════════════════════════════════

function App() {

  // ── Single state object — pass this directly to your backend API ──────────
  const [envParams, setEnvParams] = useState({
    pm25:        45,
    pm10:        80,
    temperature: 28,
    humidity:    65,
  });

  // ── UI state ───────────────────────────────────────────────────────────────
  const [simulating, setSimulating]         = useState(false);
  const [selectedCountry, setSelectedCountry] = useState('');
  const [trendData, setTrendData]           = useState([]);
  const [apiLastUpdated, setApiLastUpdated] = useState(new Date().toLocaleTimeString());

  const simRef = useRef(null);

  // ── Derived values ─────────────────────────────────────────────────────────
  const aqi   = useMemo(() => calculateAQI(envParams), [envParams]);
  const level = useMemo(() => getAQILevel(aqi),        [aqi]);
  const recs  = useMemo(() => getRecommendations(aqi), [aqi]);

  // ── Update trend on AQI change ─────────────────────────────────────────────
  useEffect(() => {
    setTrendData(generate24hTrend(aqi));
    setApiLastUpdated(new Date().toLocaleTimeString());
  }, [aqi]);

  // ── Real-time simulation ───────────────────────────────────────────────────
  useEffect(() => {
    if (simulating) {
      simRef.current = setInterval(() => {
        setEnvParams(prev => ({
          pm25:        Math.round(Math.max(0,   Math.min(500, prev.pm25        + (Math.random() * 24 - 12)))),
          pm10:        Math.round(Math.max(0,   Math.min(500, prev.pm10        + (Math.random() * 28 - 14)))),
          temperature: Math.round(Math.max(-10, Math.min(50,  prev.temperature + (Math.random() * 3  - 1.5)))),
          humidity:    Math.round(Math.max(0,   Math.min(100, prev.humidity    + (Math.random() * 8  - 4)))),
        }));
      }, 1600);
    } else {
      clearInterval(simRef.current);
    }
    return () => clearInterval(simRef.current);
  }, [simulating]);

  // ── Param update helper ────────────────────────────────────────────────────
  const updateParam = useCallback((key) => (val) => {
    setEnvParams(prev => ({ ...prev, [key]: val }));
  }, []);

  // ── Country lookup ─────────────────────────────────────────────────────────
  const country = COUNTRIES.find(c => c.code === selectedCountry) || null;

  // ── CSS vars for AQI-reactive theme ───────────────────────────────────────
  const rootStyle = {
    '--aqi-color':     level.color,
    '--aqi-color-dim': level.color + '33',
  };

  // ── State object for API preview ──────────────────────────────────────────
  const apiPayload = {
    envParams: {
      pm25:        envParams.pm25,
      pm10:        envParams.pm10,
      temperature: envParams.temperature,
      humidity:    envParams.humidity,
    },
    predicted_aqi:   aqi,
    aqi_category:    level.label,
    timestamp:       new Date().toISOString(),
  };

  // ════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════
  return (
    <div className="dashboard-root" style={rootStyle}>

      {/* ── Animated Background Blobs ── */}
      <div className="blob-bg">
        <div className="blob blob-1" style={{ background: level.blob1 }} />
        <div className="blob blob-2" style={{ background: level.blob2 }} />
        <div className="blob blob-3" />
      </div>

      {/* ── Page Content ── */}
      <div style={{ position: 'relative', zIndex: 10, maxWidth: '1280px', margin: '0 auto', padding: '32px 16px' }}>

        {/* ═══ HEADER ════════════════════════════════════════════════════════ */}
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div className="logo-icon">🌬️</div>
            <div>
              <div className="dashboard-title">AQI Intelligence</div>
              <div style={{ fontSize: '0.7rem', color: '#475569', marginTop: '2px' }}>
                Real-time Air Quality Monitoring & Prediction
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="pulse-dot" style={{ '--aqi-color': level.color }} />
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Live Analysis</div>
              <div style={{ fontSize: '0.65rem', color: '#374151' }}>{apiLastUpdated}</div>
            </div>
          </div>
        </header>

        {/* ═══ MAIN GRID ═════════════════════════════════════════════════════ */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '20px',
          alignItems: 'start',
        }}>

          {/* ─── LEFT: GAUGE PANEL ─────────────────────────────────────────── */}
          <div className="glass-card" style={{ padding: '28px 24px' }}>
            <div className="section-label" style={{ textAlign: 'center', marginBottom: '18px' }}>
              Predicted AQI
            </div>

            {/* Gauge + overlaid number */}
            <div style={{ position: 'relative' }}>
              <RadialGauge aqi={aqi} level={level} />

              {/* Centered AQI number overlay */}
              <div style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                paddingTop: '28px',
                pointerEvents: 'none',
              }}>
                <div className="aqi-number" style={{ color: level.color }}>{aqi}</div>
                <div className="aqi-badge" style={{
                  background: level.color + '22',
                  borderColor: level.color + '55',
                  color: level.color,
                }}>
                  {level.shortLabel}
                </div>
              </div>
            </div>

            {/* Stat pills grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '20px' }}>
              {[
                { label: 'PM2.5',    value: envParams.pm25,        unit: 'μg/m³', color: '#818cf8' },
                { label: 'PM10',     value: envParams.pm10,        unit: 'μg/m³', color: '#a78bfa' },
                { label: 'Temp',     value: envParams.temperature, unit: '°C',    color: '#fb923c' },
                { label: 'Humidity', value: envParams.humidity,    unit: '%',     color: '#22d3ee' },
              ].map(s => (
                <div key={s.label} className="stat-pill" style={{ '--pill-color': s.color }}>
                  <div className="pill-label">{s.label}</div>
                  <div>
                    <span className="pill-value" style={{ color: s.color }}>{Math.round(s.value)}</span>
                    <span className="pill-unit">{s.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ─── RIGHT: CONTROLS + CHART ────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Environmental parameters card */}
            <div className="glass-card" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '22px' }}>
                <div className="section-label">Environmental Parameters</div>

                {/* Simulate Real-Time Toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className={`sim-label ${simulating ? 'sim-active' : ''}`}>
                    {simulating ? '⟳ Simulating…' : 'Simulate Real-Time'}
                  </span>
                  <div
                    className={`toggle ${simulating ? 'is-on' : ''}`}
                    onClick={() => setSimulating(s => !s)}
                    role="switch"
                    aria-checked={simulating}
                    tabIndex={0}
                    onKeyDown={e => e.key === 'Enter' && setSimulating(s => !s)}
                  >
                    <div className="toggle-thumb" />
                  </div>
                </div>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '22px',
              }}>
                <Slider
                  label="PM2.5 (Fine Particles)"
                  unit=" μg/m³"
                  min={0} max={500}
                  value={Math.round(envParams.pm25)}
                  onChange={updateParam('pm25')}
                  color="#818cf8"
                />
                <Slider
                  label="PM10 (Coarse Particles)"
                  unit=" μg/m³"
                  min={0} max={500}
                  value={Math.round(envParams.pm10)}
                  onChange={updateParam('pm10')}
                  color="#a78bfa"
                />
                <Slider
                  label="Temperature"
                  unit="°C"
                  min={-10} max={50}
                  value={Math.round(envParams.temperature)}
                  onChange={updateParam('temperature')}
                  color="#fb923c"
                />
                <Slider
                  label="Humidity"
                  unit="%"
                  min={0} max={100}
                  value={Math.round(envParams.humidity)}
                  onChange={updateParam('humidity')}
                  color="#22d3ee"
                />
              </div>
            </div>

            {/* 24-hour trend chart */}
            <div className="glass-card chart-area" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div className="section-label">24-Hour AQI Forecast</div>
                <div style={{ fontSize: '0.68rem', color: level.color, fontWeight: 600 }}>
                  Peak: {trendData.length ? Math.max(...trendData.map(d => d.aqi)) : '—'}
                </div>
              </div>

              <div style={{ height: '200px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={trendData}
                    margin={{ top: 5, right: 8, left: -20, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="aqiAreaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={level.color} stopOpacity={0.35} />
                        <stop offset="95%" stopColor={level.color} stopOpacity={0} />
                      </linearGradient>
                    </defs>

                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />

                    <XAxis
                      dataKey="label"
                      tick={{ fill: '#475569', fontSize: 10, fontFamily: 'DM Sans' }}
                      axisLine={false}
                      tickLine={false}
                      interval={4}
                    />

                    <YAxis
                      tick={{ fill: '#475569', fontSize: 10, fontFamily: 'DM Sans' }}
                      axisLine={false}
                      tickLine={false}
                      domain={[0, 500]}
                      ticks={[0, 100, 200, 300, 400, 500]}
                    />

                    <Tooltip content={<ChartTooltip />} />

                    <Area
                      type="monotone"
                      dataKey="aqi"
                      stroke={level.color}
                      strokeWidth={2}
                      fill="url(#aqiAreaGrad)"
                      dot={false}
                      activeDot={{ r: 5, fill: level.color, stroke: '#fff', strokeWidth: 2 }}
                      isAnimationActive={true}
                      animationDuration={600}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>
        </div>

        {/* ═══ BOTTOM ROW: GLOBAL + HEALTH RECS ══════════════════════════════ */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '20px',
          marginTop: '20px',
        }}>

          {/* ─── GLOBAL CONTEXT ─────────────────────────────────────────────── */}
          <div className="glass-card" style={{ padding: '24px' }}>
            <div className="section-label" style={{ marginBottom: '16px' }}>Global Context</div>

            <div className="select-wrapper" style={{ marginBottom: '16px' }}>
              <select
                className="country-select"
                value={selectedCountry}
                onChange={e => setSelectedCountry(e.target.value)}
                aria-label="Select a country"
              >
                <option value="">— Select a Country —</option>
                {COUNTRIES.map(c => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.name}
                  </option>
                ))}
              </select>
              <div className="select-arrow">▾</div>
            </div>

            {country ? (
              <div>
                <div style={{ fontSize: '0.65rem', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px' }}>
                  Live Monitoring Stations — {country.flag} {country.name}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {country.stations.map((st, i) => {
                    const stLvl = getAQILevel(st.aqi);
                    return (
                      <div key={i} className="station-card" style={{ '--station-color': stLvl.color }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div className="station-name">{st.name}</div>
                            <div className="station-updated">Updated {st.updated}</div>
                          </div>
                          <div>
                            <div className="station-aqi" style={{ color: stLvl.color }}>{st.aqi}</div>
                            <div className="station-status" style={{ color: stLvl.color }}>{stLvl.shortLabel}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="station-empty">
                <div className="station-empty-icon">🌍</div>
                <div style={{ fontSize: '0.82rem', color: '#374151' }}>
                  Select a country to view live station data
                </div>
              </div>
            )}
          </div>

          {/* ─── HEALTH RECOMMENDATIONS ─────────────────────────────────────── */}
          <div className="glass-card" style={{ padding: '24px' }}>
            <div className="section-label" style={{ marginBottom: '16px' }}>Health Recommendations</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {recs.map((rec, i) => (
                <div key={i} className={`rec-card ${rec.style}`}>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <div className="rec-icon">{rec.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
                        <div className="rec-category">{rec.category}</div>
                        <div className={`status-badge ${rec.badgeStyle}`}>{rec.badge}</div>
                      </div>
                      <div className="rec-title">{rec.title}</div>
                      <div className="rec-detail">{rec.detail}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ═══ API INTEGRATION PANEL ══════════════════════════════════════════ */}
        <div className="api-panel" style={{ marginTop: '20px' }}>
          <div className="api-header">
            <div className="api-dot" />
            <div className="api-label">API-Ready State Object · Integration Preview</div>
          </div>

          <pre className="api-preview-code" aria-label="JSON state object ready for backend API">
            {JSON.stringify(apiPayload, null, 2)}
          </pre>

          <p className="api-hint">
            To connect your backend, search for <code>── API INTEGRATION POINT ──</code> in{' '}
            <code>app.jsx</code> and replace <code>calculateAQI()</code> with your API call
            passing <code>envParams</code> as the request body.
          </p>
        </div>

      </div>{/* end page content */}
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
// MOUNT
// ══════════════════════════════════════════════════════════════════════════════

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
