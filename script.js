/**
 * Urban Pollution & Human Health Monitor — script.js
 *
 * KEY FIX: AQI is calculated using the US EPA formula from
 * actual PM2.5 and O3 µg/m³ concentrations — NOT the OWM 1-5 index.
 * This gives real AQI values (0–500+) matching government standards.
 *
 * Features:
 *  - Geolocation + city search
 *  - Real US AQI from PM2.5 & O3 breakpoints
 *  - Full health advisory + rich preventive measures grid
 *  - Sensitive groups guidance
 *  - Pollutant breakdown bars
 *  - Chart.js history trend
 *  - Leaflet dark map with PM2.5 overlay
 */

"use strict";

/* ── CONFIG ── */
const API_KEY  = "b871b4234c3395d1b1321ebf4148e3c7";
const OWM      = "https://api.openweathermap.org";

/* ═══════════════════════════════════════════════
   US EPA AQI BREAKPOINTS
   Source: US EPA 40 CFR Part 58, Appendix G
   ═══════════════════════════════════════════════ */

/* PM2.5 breakpoints (µg/m³, 24-hr avg) */
const PM25_BP = [
  { cLow:  0.0, cHigh:  12.0, iLow:   0, iHigh:  50 },
  { cLow: 12.1, cHigh:  35.4, iLow:  51, iHigh: 100 },
  { cLow: 35.5, cHigh:  55.4, iLow: 101, iHigh: 150 },
  { cLow: 55.5, cHigh: 150.4, iLow: 151, iHigh: 200 },
  { cLow:150.5, cHigh: 250.4, iLow: 201, iHigh: 300 },
  { cLow:250.5, cHigh: 350.4, iLow: 301, iHigh: 400 },
  { cLow:350.5, cHigh: 500.4, iLow: 401, iHigh: 500 },
];

/* O3 breakpoints (µg/m³) — converted from ppm: 1 ppm = 1961.4 µg/m³ @ STP */
/* Using 8-hour O3 breakpoints in ppm × 1961.4 */
const O3_BP = [
  { cLow:  0,    cHigh:  117.7, iLow:   0, iHigh:  50  },
  { cLow:117.8,  cHigh:  156.5, iLow:  51, iHigh: 100  },
  { cLow:156.6,  cHigh:  196.1, iLow: 101, iHigh: 150  },
  { cLow:196.2,  cHigh:  274.6, iLow: 151, iHigh: 200  },
  { cLow:274.7,  cHigh:  392.3, iLow: 201, iHigh: 300  },
];

/**
 * EPA linear interpolation formula:
 * AQI = ((iHigh - iLow) / (cHigh - cLow)) * (c - cLow) + iLow
 */
function calcAQI(concentration, breakpoints) {
  const c = parseFloat(concentration.toFixed(1));
  for (const bp of breakpoints) {
    if (c >= bp.cLow && c <= bp.cHigh) {
      return Math.round(
        ((bp.iHigh - bp.iLow) / (bp.cHigh - bp.cLow)) * (c - bp.cLow) + bp.iLow
      );
    }
  }
  // Above highest breakpoint
  return 500;
}

/** Return the dominant AQI from PM2.5 and O3 (highest wins) */
function getDominantAQI(pm25, o3) {
  const aqiPM25 = calcAQI(pm25, PM25_BP);
  const aqiO3   = calcAQI(o3,   O3_BP);
  return Math.max(aqiPM25, aqiO3);
}

/* ═══════════════════════════════════════════════
   AQI LEVEL DEFINITIONS WITH RICH CONTENT
   ═══════════════════════════════════════════════ */
function getAQILevel(aqi) {
  if (aqi <= 50)  return LEVELS.good;
  if (aqi <= 100) return LEVELS.moderate;
  if (aqi <= 150) return LEVELS.usg;
  if (aqi <= 200) return LEVELS.unhealthy;
  if (aqi <= 300) return LEVELS.very;
  return LEVELS.hazardous;
}

const LEVELS = {
  good: {
    label:       "Good",
    riskLabel:   "LOW RISK",
    color:       "#00e676",
    colorBg:     "rgba(0,230,118,0.15)",
    colorBorder: "rgba(0,230,118,0.3)",
    icon:        "🌿",
    borderColor: "#00e676",
    title:       "Air Quality is Good",
    desc:        "Air quality is satisfactory and poses little or no risk to health. Enjoy your day outdoors!",
    affectedGroups: [],
    measures: [
      { icon:"🏃", title:"Exercise Freely",      desc:"Ideal conditions for all outdoor sports, jogging, and cycling." },
      { icon:"🪟", title:"Open Windows",          desc:"Let fresh air circulate through your home and workplace." },
      { icon:"🌳", title:"Enjoy Nature",           desc:"Parks, gardens, and trails are safe and refreshing to visit." },
      { icon:"😊", title:"No Mask Needed",        desc:"No protective equipment required for healthy individuals." },
    ],
    sensitiveGroups: [],
  },
  moderate: {
    label:       "Moderate",
    riskLabel:   "MODERATE RISK",
    color:       "#ffea00",
    colorBg:     "rgba(255,234,0,0.15)",
    colorBorder: "rgba(255,234,0,0.3)",
    icon:        "🌤️",
    borderColor: "#ffea00",
    title:       "Air Quality is Moderate",
    desc:        "Acceptable air quality, but some pollutants may cause concerns for a small number of sensitive individuals.",
    affectedGroups: ["People unusually sensitive to air pollution"],
    measures: [
      { icon:"😮‍💨", title:"Limit Intense Exertion",  desc:"Reduce prolonged outdoor exercise if you feel respiratory irritation." },
      { icon:"💊",  title:"Keep Medication Handy",  desc:"Asthma or allergy sufferers should carry their inhaler/medication." },
      { icon:"🌬️", title:"Ventilate Wisely",         desc:"Open windows in the morning/evening; close during peak traffic hours." },
      { icon:"👀",  title:"Monitor Symptoms",         desc:"Watch for eye irritation, coughing, or shortness of breath." },
    ],
    sensitiveGroups: [
      { icon:"🫁", label:"Asthma patients: limit outdoor exertion, use prescribed inhalers." },
      { icon:"🤧", label:"Allergy sufferers: watch for increased pollen + pollution combo." },
    ],
  },
  usg: {
    label:       "Unhealthy for Sensitive Groups",
    riskLabel:   "ELEVATED RISK",
    color:       "#ff6d00",
    colorBg:     "rgba(255,109,0,0.15)",
    colorBorder: "rgba(255,109,0,0.3)",
    icon:        "😷",
    borderColor: "#ff6d00",
    title:       "Unhealthy for Sensitive Groups",
    desc:        "Sensitive groups may experience health effects. The general public is less likely to be affected, but caution is advised.",
    affectedGroups: ["Children","Elderly","People with lung disease","People with heart disease"],
    measures: [
      { icon:"😷", title:"Wear a Mask Outdoors",      desc:"Use a surgical or N95 mask, especially in high-traffic areas." },
      { icon:"🏠", title:"Reduce Outdoor Time",        desc:"Limit outdoor activities to 1 hour or less. Avoid rush-hour exposure." },
      { icon:"🌀", title:"Use Air Purifier",            desc:"Run a HEPA air purifier indoors on medium–high setting." },
      { icon:"🚗", title:"Use AC in Recirculate Mode", desc:"Keep car windows closed; switch AC to recirculate to block outside air." },
      { icon:"💧", title:"Stay Hydrated",               desc:"Drink plenty of water — it helps flush inhaled irritants." },
      { icon:"🏋️", title:"Move Exercise Indoors",       desc:"Substitute outdoor workouts with indoor gym or yoga sessions." },
    ],
    sensitiveGroups: [
      { icon:"🧒", label:"Children: cancel outdoor PE classes and recess if possible." },
      { icon:"👴", label:"Elderly: stay indoors and avoid strenuous activity." },
      { icon:"🫁", label:"Asthma/COPD patients: increase monitoring, use rescue inhaler as prescribed." },
      { icon:"❤️", label:"Heart disease patients: avoid exertion; watch for chest pain or palpitations." },
    ],
  },
  unhealthy: {
    label:       "Unhealthy",
    riskLabel:   "HIGH RISK",
    color:       "#f44336",
    colorBg:     "rgba(244,67,54,0.15)",
    colorBorder: "rgba(244,67,54,0.3)",
    icon:        "⚠️",
    borderColor: "#f44336",
    title:       "Unhealthy Air Quality",
    desc:        "Everyone may begin to experience adverse health effects. Members of sensitive groups may experience more serious effects.",
    affectedGroups: ["Everyone","Children","Elderly","Heart & Lung patients"],
    measures: [
      { icon:"🏠", title:"Stay Indoors",                desc:"Remain inside with windows and doors shut. Avoid all non-essential outdoor trips." },
      { icon:"😷", title:"N95/KN95 Mask Mandatory",     desc:"If you must go outside, wear a properly fitted N95 or KN95 mask at all times." },
      { icon:"🌀", title:"Air Purifier — Max Setting",  desc:"Run all air purifiers on maximum. Seal gaps under doors with wet towels." },
      { icon:"🚫", title:"No Outdoor Exercise",          desc:"Cancel all outdoor sports, walking, jogging, and cycling activities today." },
      { icon:"💊", title:"Pre-medicate if Prescribed",  desc:"Asthma/COPD patients: take prescribed preventive medication before going out." },
      { icon:"📵", title:"Avoid Smoking & Incense",     desc:"Refrain from indoor smoking, burning incense, or using fireplaces — worsens indoor air." },
      { icon:"🍵", title:"Herbal Teas & Fluids",        desc:"Ginger, tulsi, and honey teas soothe irritated airways. Drink 2–3 L of water daily." },
      { icon:"🩺", title:"Seek Medical Advice",         desc:"If you experience coughing, wheezing, or chest tightness, consult a doctor promptly." },
    ],
    sensitiveGroups: [
      { icon:"🧒", label:"Children: keep at home; if school is unavoidable, request indoor-only activities." },
      { icon:"👴", label:"Elderly: monitor blood pressure and oxygen levels. Seek help if dizzy or breathless." },
      { icon:"🫁", label:"Respiratory patients: contact doctor for adjusted medication plan." },
      { icon:"🤰", label:"Pregnant women: minimize exposure; pollutants can affect fetal development." },
    ],
  },
  very: {
    label:       "Very Unhealthy",
    riskLabel:   "VERY HIGH RISK",
    color:       "#9c27b0",
    colorBg:     "rgba(156,39,176,0.15)",
    colorBorder: "rgba(156,39,176,0.3)",
    icon:        "🚨",
    borderColor: "#9c27b0",
    title:       "Very Unhealthy — Health Alert",
    desc:        "Health alert! Everyone is likely to be affected. Serious health effects are possible for the entire population.",
    affectedGroups: ["Everyone — serious health effects possible"],
    measures: [
      { icon:"🔒", title:"Do Not Go Outside",            desc:"Avoid any outdoor exposure. This is a health emergency — stay indoors completely." },
      { icon:"🏨", title:"Seal Your Indoor Space",       desc:"Close all windows and doors. Seal ventilation gaps. Use wet cloths under doors." },
      { icon:"😷", title:"Wear Mask Even Indoors",       desc:"In poorly ventilated spaces, wear an N95 mask indoors too." },
      { icon:"🌀", title:"All Purifiers at Maximum",     desc:"Run every HEPA purifier at maximum capacity. Replace filters if overdue." },
      { icon:"🚗", title:"Avoid All Commuting",          desc:"Work from home. Postpone all non-essential travel until AQI improves." },
      { icon:"🍎", title:"Antioxidant-Rich Diet",        desc:"Eat fruits high in Vitamin C & E (oranges, spinach) to counter oxidative stress from pollutants." },
      { icon:"💨", title:"No Candles / Cooking Smoke",  desc:"Avoid burning candles, incense, or high-smoke cooking. Use exhaust fans." },
      { icon:"📞", title:"Emergency Contacts Ready",    desc:"Keep local emergency/hospital contacts handy. Monitor symptoms closely." },
      { icon:"🩺", title:"Immediate Medical Attention",  desc:"Any breathing difficulty, chest pain, or confusion — go to ER immediately." },
    ],
    sensitiveGroups: [
      { icon:"🧒", label:"Children: absolute indoor confinement. Cancel all outdoor activities." },
      { icon:"👴", label:"Elderly: keep blood pressure medications ready; check oxygen saturation." },
      { icon:"🫁", label:"Respiratory patients: call doctor proactively — do not wait for symptoms." },
      { icon:"❤️", label:"Heart patients: avoid any physical stress; risk of cardiac events increases." },
      { icon:"🤰", label:"Pregnant women: this level can impact birth weight — consult OB immediately." },
    ],
  },
  hazardous: {
    label:       "Hazardous",
    riskLabel:   "EMERGENCY LEVEL",
    color:       "#e57373",
    colorBg:     "rgba(183,28,28,0.2)",
    colorBorder: "rgba(183,28,28,0.5)",
    icon:        "☠️",
    borderColor: "#b71c1c",
    title:       "Hazardous — Emergency Conditions",
    desc:        "Emergency conditions. The entire population is likely to be seriously affected. Maximum precautions required.",
    affectedGroups: ["ENTIRE POPULATION — Emergency conditions"],
    measures: [
      { icon:"🚨", title:"EMERGENCY: Stay Indoors",      desc:"Mandatory indoor shelter. Treat this like a natural disaster. Do not go outside for any reason." },
      { icon:"🏨", title:"Completely Seal Building",     desc:"Seal ALL gaps, vents, and windows with tape and wet cloth. Block every air entry point." },
      { icon:"😷", title:"N95 + Goggles Indoors",       desc:"Wear N95 mask AND protective goggles in poorly ventilated or large indoor spaces." },
      { icon:"📺", title:"Follow Official Alerts",       desc:"Monitor government emergency broadcasts. Follow all official evacuation or shelter-in-place orders." },
      { icon:"🚫", title:"Zero Physical Activity",       desc:"No movement, exercise, or exertion of any kind. Rest completely to minimize breathing rate." },
      { icon:"🌀", title:"Industrial-Grade Purification",desc:"Use the highest-grade HEPA/activated carbon purifiers available. Close off rooms without purifiers." },
      { icon:"🏥", title:"Pre-arrange Hospital Access",  desc:"Know your nearest emergency room. Pre-call your doctor for contingency plans." },
      { icon:"📞", title:"Emergency Numbers Ready",      desc:"Have 108 (India), 911 (US), or local emergency services on speed dial." },
      { icon:"💧", title:"Constant Hydration",           desc:"Drink water every 30 minutes. Avoid alcohol and caffeine which dehydrate." },
    ],
    sensitiveGroups: [
      { icon:"🧒", label:"Children: hospital-grade protection needed. Consider temporary evacuation." },
      { icon:"👴", label:"Elderly: requires immediate medical supervision if any respiratory symptoms." },
      { icon:"🫁", label:"All respiratory patients: contact hospital for possible admission or stronger medication." },
      { icon:"❤️", label:"Heart patients: risk of acute cardiac events is critical. Minimize all stress." },
      { icon:"🤰", label:"Pregnant women: evacuate the area if possible or seek immediate medical care." },
    ],
  },
};

/* ═══════════════════════════════════════════════
   POLLUTANT DEFINITIONS
   ═══════════════════════════════════════════════ */
const POLLUTANTS = [
  { key:"pm2_5", name:"PM2.5",              fullName:"Fine Particulate Matter",     unit:"µg/m³", max:75,    good:12,  moderate:35 },
  { key:"pm10",  name:"PM10",               fullName:"Coarse Particulate Matter",   unit:"µg/m³", max:150,   good:54,  moderate:154 },
  { key:"o3",    name:"O₃",                fullName:"Ozone",                       unit:"µg/m³", max:240,   good:100, moderate:160 },
  { key:"no2",   name:"NO₂",               fullName:"Nitrogen Dioxide",            unit:"µg/m³", max:200,   good:40,  moderate:100 },
  { key:"so2",   name:"SO₂",               fullName:"Sulfur Dioxide",              unit:"µg/m³", max:500,   good:20,  moderate:80  },
  { key:"co",    name:"CO",                fullName:"Carbon Monoxide",             unit:"µg/m³", max:15400, good:4400,moderate:9400},
  { key:"no",    name:"NO",                fullName:"Nitric Oxide",               unit:"µg/m³", max:200,   good:40,  moderate:100 },
  { key:"nh3",   name:"NH₃",              fullName:"Ammonia",                     unit:"µg/m³", max:200,   good:25,  moderate:100 },
];

/* ═══════════════════════════════════════════════
   STATE
   ═══════════════════════════════════════════════ */
let aqiHistory = [];
let chartInst  = null;
let mapInst    = null;
let mapMarker  = null;

/* ═══════════════════════════════════════════════
   DOM
   ═══════════════════════════════════════════════ */
const $  = id => document.getElementById(id);
const locBtn      = $("locBtn");
const searchBtn   = $("searchBtn");
const cityInput   = $("cityInput");
const statusMsg   = $("statusMsg");
const resultsEl   = $("results");

/* ═══════════════════════════════════════════════
   EVENTS
   ═══════════════════════════════════════════════ */
locBtn.addEventListener("click", () => {
  if (!navigator.geolocation) { setStatus("Geolocation not supported by your browser.", "error"); return; }
  setStatus("Detecting your location…", "loading");
  navigator.geolocation.getCurrentPosition(
    pos => fetchAQI(pos.coords.latitude, pos.coords.longitude, "Your Location"),
    err => setStatus(`Location denied: ${err.message}`, "error"),
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

searchBtn.addEventListener("click", doSearch);
cityInput.addEventListener("keydown", e => { if (e.key === "Enter") doSearch(); });

/* ═══════════════════════════════════════════════
   CITY SEARCH
   ═══════════════════════════════════════════════ */
async function doSearch() {
  const city = cityInput.value.trim();
  if (!city) { setStatus("Please enter a city name.", ""); return; }
  setStatus(`Searching for "${city}"…`, "loading");
  try {
    const url  = `${OWM}/geo/1.0/direct?q=${encodeURIComponent(city)}&limit=1&appid=${API_KEY}`;
    const data = await fetchJSON(url);
    if (!data.length) { setStatus(`City "${city}" not found. Try a different spelling.`, "error"); return; }
    const { lat, lon, name, country, state } = data[0];
    const label = state ? `${name}, ${state}, ${country}` : `${name}, ${country}`;
    fetchAQI(lat, lon, label);
  } catch (e) {
    setStatus(`Error: ${e.message}`, "error");
  }
}

/* ═══════════════════════════════════════════════
   MAIN FETCH
   ═══════════════════════════════════════════════ */
async function fetchAQI(lat, lon, label) {
  setStatus("Fetching air quality data…", "loading");
  try {
    const url  = `${OWM}/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${API_KEY}`;
    const data = await fetchJSON(url);
    if (!data.list?.length) throw new Error("No data returned for this location.");

    const record     = data.list[0];
    const components = record.components;

    // ── Calculate real US AQI from PM2.5 and O3 concentrations
    const pm25Val = components.pm2_5 || 0;
    const o3Val   = components.o3    || 0;
    const aqiVal  = getDominantAQI(pm25Val, o3Val);
    const level   = getAQILevel(aqiVal);

    setStatus("", "");

    renderAQI(aqiVal, level);
    renderLocation(lat, lon, label);
    renderHealthBanner(level);
    renderPreventive(level, aqiVal);
    renderPollutants(components);
    updateHistory(aqiVal, level, label);
    renderChart();
    renderMap(lat, lon, aqiVal, level);
    renderPM25Highlight(pm25Val, level);

    resultsEl.classList.remove("hidden");
    $("lastUpdated").textContent = new Date().toLocaleString([], {
      weekday:"short", month:"short", day:"numeric",
      hour:"2-digit", minute:"2-digit"
    });

  } catch (e) {
    console.error(e);
    setStatus(`Failed: ${e.message}`, "error");
  }
}

/* ═══════════════════════════════════════════════
   RENDER FUNCTIONS
   ═══════════════════════════════════════════════ */

function setStatus(msg, type) {
  statusMsg.textContent = msg;
  statusMsg.className   = "status-msg" + (type ? ` ${type}` : "");
}

/* AQI gauge + badge */
function renderAQI(aqi, level) {
  // Gauge: map 0-500 to the arc length (472px circumference for r=90 with 75% arc)
  const maxArc   = 472;   // total coloured arc length
  const fill     = Math.min(aqi / 500, 1) * maxArc;
  const gaugeFill = $("gaugeFill");
  gaugeFill.style.strokeDasharray = `${fill} 574`;

  $("aqiNum").textContent   = aqi;
  $("aqiNum").style.color   = level.color;

  const badge = $("aqiBadge");
  badge.textContent        = level.label;
  badge.style.color        = level.color;
  badge.style.background   = level.colorBg;
  badge.style.borderColor  = level.colorBorder;

  $("aqiDesc").textContent = level.desc;

  // Scale pointer: map AQI 0-500 to 0-100%
  const pct = Math.min(aqi / 500 * 100, 98);
  $("scalePointer").style.left = pct + "%";
  $("scalePointer").style.color = level.color;
}

function renderLocation(lat, lon, label) {
  $("locName").textContent   = label;
  $("locCoords").textContent = `${lat.toFixed(5)}° N,  ${lon.toFixed(5)}° E`;
}

function renderPM25Highlight(pm25, level) {
  $("pm25Val").textContent = `${pm25.toFixed(2)} µg/m³`;
  const pct = Math.min(pm25 / 75 * 100, 100);
  const fill = $("pm25Fill");
  fill.style.background = level.color;
  requestAnimationFrame(() => { fill.style.width = pct + "%"; });
  $("pm25Status").textContent = `WHO guideline: 15 µg/m³ (24-hr avg) · Current: ${pm25.toFixed(1)} µg/m³`;
}

/* Health banner */
function renderHealthBanner(level) {
  const banner = $("healthBanner");
  banner.classList.remove("hidden");
  banner.style.borderLeftColor = level.borderColor;

  $("hbIcon").textContent  = level.icon;
  $("hbRisk").textContent  = level.riskLabel;
  $("hbRisk").style.color  = level.color;
  $("hbTitle").textContent = level.title;
  $("hbMsg").textContent   = level.desc;

  const groups = $("hbGroups");
  groups.innerHTML = "";
  level.affectedGroups.forEach(g => {
    const el = document.createElement("div");
    el.className = "hb-group";
    el.innerHTML = `<span class="hb-group-icon">👤</span>${g}`;
    groups.appendChild(el);
  });
}

/* Preventive measures grid */
function renderPreventive(level, aqi) {
  const card = $("prevCard");
  card.classList.remove("hidden");

  const badge = $("prevRiskBadge");
  badge.textContent       = `${level.riskLabel} · AQI ${aqi}`;
  badge.style.color       = level.color;
  badge.style.background  = level.colorBg;
  badge.style.borderColor = level.colorBorder;

  // Main measures
  const grid = $("prevGrid");
  grid.innerHTML = "";
  level.measures.forEach((m, i) => {
    const el      = document.createElement("div");
    el.className  = "prev-item";
    el.style.animationDelay = `${i * 0.06}s`;
    el.innerHTML  = `
      <div class="prev-item-icon">${m.icon}</div>
      <div>
        <div class="prev-item-title">${m.title}</div>
        <div class="prev-item-desc">${m.desc}</div>
      </div>`;
    grid.appendChild(el);
  });

  // Sensitive groups
  const secEl = $("sensitiveSection");
  const sgGrid = $("sensitiveGrid");
  sgGrid.innerHTML = "";
  if (level.sensitiveGroups && level.sensitiveGroups.length) {
    secEl.classList.remove("hidden");
    level.sensitiveGroups.forEach(sg => {
      const el     = document.createElement("div");
      el.className = "sg-item";
      el.innerHTML = `<span class="sg-icon">${sg.icon}</span>${sg.label}`;
      sgGrid.appendChild(el);
    });
  } else {
    secEl.classList.add("hidden");
  }
}

/* Pollutants */
function renderPollutants(comp) {
  const grid = $("pollGrid");
  grid.innerHTML = "";
  POLLUTANTS.forEach(p => {
    const val = comp[p.key] ?? 0;
    const pct = Math.min(val / p.max * 100, 100);
    let barColor = "#00e676";
    if      (val > p.moderate) barColor = "#f44336";
    else if (val > p.good)     barColor = "#ff6d00";
    else                       barColor = "#00e676";

    const el = document.createElement("div");
    el.className = "poll-item";
    el.innerHTML = `
      <div class="poll-row1">
        <span class="poll-name">${p.name} <span style="font-weight:300;color:var(--text3)">${p.fullName}</span></span>
        <span class="poll-val">${val.toFixed(2)}<span class="poll-unit"> ${p.unit}</span></span>
      </div>
      <div class="poll-bar-wrap">
        <div class="poll-bar" style="width:0;background:${barColor}" data-w="${pct}"></div>
      </div>
      <div class="poll-level" style="color:${barColor}">
        ${val <= p.good ? "✓ Within safe limits" : val <= p.moderate ? "⚠ Moderate level" : "✗ Above safe threshold"}
      </div>`;
    grid.appendChild(el);
  });
  requestAnimationFrame(() => {
    document.querySelectorAll(".poll-bar").forEach(b => { b.style.width = b.dataset.w + "%"; });
  });
}

/* Chart history */
function updateHistory(aqi, level, label) {
  const time = new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
  const city = label.split(",")[0];
  aqiHistory.push({ label:`${city} ${time}`, value: aqi, color: level.color });
  if (aqiHistory.length > 8) aqiHistory.shift();
}

function renderChart() {
  const ctx    = $("aqiChart").getContext("2d");
  const labels = aqiHistory.map(h => h.label);
  const values = aqiHistory.map(h => h.value);
  const colors = aqiHistory.map(h => h.color);

  if (chartInst) {
    chartInst.data.labels                           = labels;
    chartInst.data.datasets[0].data                = values;
    chartInst.data.datasets[0].pointBackgroundColor= colors;
    chartInst.data.datasets[0].borderColor         = colors[colors.length - 1];
    chartInst.update();
    return;
  }

  chartInst = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label:"AQI",
        data: values,
        borderColor: colors[colors.length - 1],
        pointBackgroundColor: colors,
        pointRadius: 6, pointHoverRadius: 9,
        borderWidth: 2.5, tension: 0.4,
        fill: true,
        backgroundColor: "rgba(0,212,170,0.05)",
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` AQI ${ctx.parsed.y} — ${getAQILevel(ctx.parsed.y).label}`
          }
        }
      },
      scales: {
        x: {
          ticks: { color:"#475569", font:{ size:10, family:"Outfit" } },
          grid:  { color:"rgba(255,255,255,0.04)" },
        },
        y: {
          min: 0,
          ticks: {
            color:"#475569", font:{ size:10 },
            callback: v => `${v}`
          },
          grid: { color:"rgba(255,255,255,0.04)" },
        },
      },
    },
  });
}

/* Leaflet map */
function renderMap(lat, lon, aqi, level) {
  if (!mapInst) {
    mapInst = L.map("mapEl", { zoomControl:true, scrollWheelZoom:false })
              .setView([lat, lon], 11);

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution:'© OSM © CartoDB', subdomains:"abcd", maxZoom:19,
    }).addTo(mapInst);

    L.tileLayer(
      `https://tile.openweathermap.org/map/PM2_5/{z}/{x}/{y}.png?appid=${API_KEY}`,
      { opacity:0.6 }
    ).addTo(mapInst);

  } else {
    mapInst.setView([lat, lon], 11);
    if (mapMarker) mapMarker.remove();
  }

  const icon = L.divIcon({
    html: `<div style="width:22px;height:22px;border-radius:50%;background:${level.color};border:3px solid #fff;box-shadow:0 0 16px ${level.color}"></div>`,
    className:"", iconSize:[22,22], iconAnchor:[11,11],
  });

  mapMarker = L.marker([lat, lon], { icon })
    .addTo(mapInst)
    .bindPopup(`<b>AQI ${aqi} — ${level.label}</b><br><small>${level.title}</small>`)
    .openPopup();
}

/* ── Helper ── */
async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
