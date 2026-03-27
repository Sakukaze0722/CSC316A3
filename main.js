// ============================================================
// Global Energy Transition Explorer — D3.js Interactive Viz
// ============================================================

(function () {
  "use strict";

  // --- State ---
  let allData = [];
  let dataByCode = new Map();
  let worldTopo = null;
  let worldCountries = [];
  let allEvents = [];
  let eventsByCode = new Map();
  let shockLensState = null;
  let currentYear = 2000;
  let currentMetric = "fossil_fuel_pct";
  let currentRegion = "all";
  let selectedCountry = null;
  let comparedCountries = []; // [{code, country}]
  let brushedYearRange = null; // [startYear, endYear] or null
  let playing = false;
  let playTimer = null;
  const SPEED_OPTIONS = [1, 2, 4, 8];
  let speedIndex = 0;
  let playSpeed = SPEED_OPTIONS[0];
  const SHOCK_WINDOW_YEARS = 5;
  const STORY_STEP_DELAY_MS = 5200;
  let storyActive = false;
  let storyStepIndex = -1;
  let storyTimer = null;
  let resizeTimer = null;

  const ENERGY_SOURCES = [
    { key: "elec_coal", label: "Coal", color: "#5d4037" },
    { key: "elec_oil", label: "Oil", color: "#e65100" },
    { key: "elec_gas", label: "Natural Gas", color: "#ff8f00" },
    { key: "elec_nuclear", label: "Nuclear", color: "#7b1fa2" },
    { key: "elec_hydro", label: "Hydroelectric", color: "#0288d1" },
    { key: "elec_renewable", label: "Other Renewables", color: "#43a047" },
  ];

  const METRIC_LABELS = {
    renewable_pct: "Renewable Energy (%)",
    fossil_fuel_pct: "Fossil Fuel (%)",
    access_electricity: "Electricity Access (%)",
    renewable_elec_output: "Renewable Elec. Output (%)",
    energy_per_capita: "Energy per Capita (kg oil eq.)",
  };

  const ANNOTATIONS = [
    { year: 1973, text: "1973 Oil Crisis" },
    { year: 1979, text: "1979 Energy Crisis" },
    { year: 1986, text: "Chernobyl Disaster" },
    { year: 2005, text: "Kyoto Protocol" },
    { year: 2015, text: "Paris Agreement" },
  ];

  const STORY_STEPS = [
    {
      year: 1973,
      code: "USA",
      metric: "fossil_fuel_pct",
      title: "1973 Oil Crisis",
      text: "Energy security became a central policy concern and exposed fossil dependency risks.",
    },
    {
      year: 1986,
      code: "FRA",
      metric: "renewable_pct",
      title: "Post-Chernobyl Reassessment",
      text: "Safety concerns reshaped long-term electricity planning and diversified transition pathways.",
    },
    {
      year: 2000,
      code: "DEU",
      metric: "renewable_elec_output",
      title: "Germany Feed-in Law Era",
      text: "Feed-in policies accelerated renewable deployment and shifted generation structure.",
    },
    {
      year: 2015,
      code: "GBR",
      metric: "fossil_fuel_pct",
      title: "Paris Agreement Momentum",
      text: "Decarbonization targets strengthened and fossil-heavy generation began a visible decline.",
    },
  ];

  // ============================================================
  // DIRECTION 1: Data-driven ambient background
  // ============================================================
  // 1960 → warm amber tint, 2019 → cool blue-green tint
  // Dark theme: subtle hue shift in the deep background
  const BG_WARM = { r: 18, g: 12, b: 8 };   // #120c08 warm dark
  const BG_COOL = { r: 8, g: 14, b: 24 };   // #080e18 cool dark
  const YEAR_COLOR_WARM = "#f97316";  // orange
  const YEAR_COLOR_COOL = "#58a6ff";  // blue

  function updateAmbientBackground() {
    const t = (currentYear - 1960) / (2019 - 1960);  // 0..1
    const r = Math.round(BG_WARM.r + t * (BG_COOL.r - BG_WARM.r));
    const g = Math.round(BG_WARM.g + t * (BG_COOL.g - BG_WARM.g));
    const b = Math.round(BG_WARM.b + t * (BG_COOL.b - BG_WARM.b));
    document.body.style.background = `rgb(${r},${g},${b})`;
    const app = document.getElementById("app");
    if (app) app.style.background = "transparent";

    const root = document.documentElement;
    const c1 = t < 0.5
      ? interpolateColor("#f97316", "#7c3aed", t / 0.5)
      : interpolateColor("#7c3aed", "#0ea5e9", (t - 0.5) / 0.5);
    const c2 = t < 0.5
      ? interpolateColor("#dc2626", "#b87fff", t / 0.5)
      : interpolateColor("#b87fff", "#10b981", (t - 0.5) / 0.5);
    const c3 = interpolateColor("#f97316", "#10b981", t);
    root.style.setProperty("--aurora-c1", c1);
    root.style.setProperty("--aurora-c2", c2);
    root.style.setProperty("--aurora-c3", c3);

    // Year label color also shifts
    const yearEl = document.getElementById("year-label");
    const yearColor = interpolateColor(YEAR_COLOR_WARM, YEAR_COLOR_COOL, t);
    yearEl.style.color = yearColor;
    yearEl.style.textShadow = `0 0 30px ${yearColor}44, 0 0 60px ${yearColor}1a`;

    const mapContainer = document.getElementById("map-container");
    if (mapContainer) mapContainer.setAttribute("data-year", String(currentYear));
  }

  function interpolateColor(c1, c2, t) {
    const parse = (hex) => [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ];
    const [r1, g1, b1] = parse(c1);
    const [r2, g2, b2] = parse(c2);
    const r = Math.round(r1 + t * (r2 - r1));
    const g = Math.round(g1 + t * (g2 - g1));
    const b = Math.round(b1 + t * (b2 - b1));
    return `rgb(${r},${g},${b})`;
  }

  // ============================================================
  // DIRECTION 4: Scroll reveal with IntersectionObserver
  // ============================================================
  function initScrollReveal() {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
    );
    document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
  }

  // ============================================================
  // DIRECTION 5: Micro-interactions
  // ============================================================

  // 5a. 3D tilt on description cards and chart panel
  function initTiltCards() {
    const cards = document.querySelectorAll("#description > div, .tilt-card");
    cards.forEach((card) => {
      card.addEventListener("mousemove", (e) => {
        const rect = card.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;  // -0.5 .. 0.5
        const y = (e.clientY - rect.top) / rect.height - 0.5;
        card.style.transform = `perspective(600px) rotateY(${x * 6}deg) rotateX(${-y * 6}deg)`;
        card.style.boxShadow = `${-x * 10}px ${y * 10}px 32px rgba(0,0,0,0.3)`;
      });
      card.addEventListener("mouseleave", () => {
        card.style.transform = "";
        card.style.boxShadow = "";
      });
    });
  }

  // 5b. Animated year counter
  function animateYearLabel(from, to) {
    const el = document.getElementById("year-label");
    const duration = 300;
    const start = performance.now();
    const diff = to - from;
    if (diff === 0) return;

    // Trigger tick animation
    el.classList.remove("tick");
    void el.offsetWidth; // force reflow
    el.classList.add("tick");

    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease out
      const eased = 1 - Math.pow(1 - progress, 3);
      const val = Math.round(from + diff * eased);
      el.textContent = val;
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function triggerYearFx() {
    const yearLabel = document.getElementById("year-label");
    const yearDisplay = document.getElementById("year-display");
    if (yearLabel) {
      yearLabel.classList.remove("glitch");
      void yearLabel.offsetWidth;
      yearLabel.classList.add("glitch");
    }
    if (yearDisplay) {
      yearDisplay.classList.remove("flash");
      void yearDisplay.offsetWidth;
      yearDisplay.classList.add("flash");
    }
  }

  // --- Helpers ---
  function buildDataIndex(rows) {
    dataByCode = new Map();
    rows.forEach((d) => {
      if (!d || !d.code) return;
      if (!dataByCode.has(d.code)) dataByCode.set(d.code, []);
      dataByCode.get(d.code).push(d);
    });
    dataByCode.forEach((list) => list.sort((a, b) => a.year - b.year));
  }

  function getCountryData(code) {
    return dataByCode.get(code) || [];
  }

  function getYearData(year) {
    return allData.filter((d) => d.year === year);
  }

  function getCountryYearData(code, year) {
    return getCountryData(code).find((d) => d.year === year) || null;
  }

  function closestYearData(code, year) {
    const cdata = getCountryData(code);
    if (!cdata.length) return null;
    let best = cdata[0];
    let bestGap = Math.abs(best.year - year);
    for (let i = 1; i < cdata.length; i++) {
      const gap = Math.abs(cdata[i].year - year);
      if (gap < bestGap) {
        best = cdata[i];
        bestGap = gap;
      }
    }
    return best;
  }

  function passesRegionFilter(rec) {
    if (!rec) return false;
    return currentRegion === "all" || rec.region === currentRegion;
  }

  function countryAlpha3FromTopoId(topoId) {
    if (topoId == null) return null;
    const raw = String(topoId);
    if (ISO_NUM_TO_ALPHA3[raw]) return ISO_NUM_TO_ALPHA3[raw];

    // world-110m ids may be zero-padded ("036"), while our map may use "36".
    const normalized = raw.replace(/^0+/, "");
    if (normalized && ISO_NUM_TO_ALPHA3[normalized]) return ISO_NUM_TO_ALPHA3[normalized];

    return null;
  }

  function fmt(v) {
    if (v == null) return "N/A";
    return v >= 1000 ? d3.format(",.0f")(v) : d3.format(".1f")(v);
  }

  function formatMetricValue(v, metricKey) {
    if (v == null || !Number.isFinite(v)) return "N/A";
    if (metricKey === "energy_per_capita") {
      return `${d3.format(",.0f")(v)} kg oil eq.`;
    }
    return `${d3.format(".1f")(v)}%`;
  }

  function getMetricUnit(metricKey) {
    return metricKey === "energy_per_capita" ? "kg oil eq." : "%";
  }

  function formatLegendValue(v, metricKey) {
    if (v == null || !Number.isFinite(v)) return "N/A";
    if (metricKey === "energy_per_capita") return d3.format(",.0f")(v);
    return `${d3.format(".1f")(v)}%`;
  }

  function updateBrushHintText() {
    const hint = d3.select("#brush-hint");
    if (hint.empty()) return;

    if (!selectedCountry) {
      hint.text("Tip: Select a country, then drag on the chart to filter map by year range.");
      return;
    }

    if (brushedYearRange && brushedYearRange.length === 2) {
      const [start, end] = brushedYearRange;
      hint.text(`Map filtered by ${start}-${end}. Drag another range or click empty chart area to clear.`);
      return;
    }

    hint.text("Tip: Drag on the chart to filter map by year range.");
  }

  function updateDeselectButton() {
    const btn = d3.select("#deselect-country-btn");
    if (btn.empty()) return;
    const visible = !!selectedCountry;
    btn.style("display", visible ? "inline-flex" : "none");
    btn.property("disabled", !visible);
  }

  function applyCountryHighlight() {
    d3.selectAll(".country-path")
      .classed("selected", function (dd) {
        return !!selectedCountry && countryAlpha3FromTopoId(dd.id) === selectedCountry;
      })
      .classed("dimmed", function (dd) {
        return !!selectedCountry && countryAlpha3FromTopoId(dd.id) !== selectedCountry;
      });
  }

  function clearSelectedCountry(clearBrush = true) {
    clearPolicyShockLens(false);
    if (clearBrush && brushedYearRange) {
      brushedYearRange = null;
      updateMap();
    }
    selectedCountry = null;
    applyCountryHighlight();
    d3.select("#chart-title").text("Select a country on the map");
    d3.select("#stack-chart").selectAll("*").remove();
    d3.select("#annotation-box").html("");
    updateShockNav();
    updateBrushHintText();
    updateDeselectButton();
  }

  function focusCountry(code, countryName = null, addToComparison = true) {
    if (!code) return false;
    const rec = closestYearData(code, currentYear);
    if (!rec || !passesRegionFilter(rec)) return false;

    if (shockLensState && shockLensState.code !== code) clearPolicyShockLens(false);
    selectedCountry = code;
    applyCountryHighlight();
    if (mapSvg) mapSvg.selectAll(".map-guide").remove();
    drawStackedArea(code, countryName || rec.country);

    if (addToComparison && !comparedCountries.find((c) => c.code === code)) {
      if (comparedCountries.length >= 6) comparedCountries.shift();
      comparedCountries.push({ code, country: rec.country });
      drawComparisonChart();
    }

    updateShockNav();
    updateBrushHintText();
    updateDeselectButton();
    return true;
  }

  function normalizeEventRecord(evt) {
    if (!evt || !evt.code || evt.year == null) return null;
    const year = +evt.year;
    if (!Number.isFinite(year)) return null;
    return {
      code: String(evt.code).toUpperCase(),
      country: evt.country || "",
      year,
      keyword: evt.keyword || "",
      title: evt.title || "",
      impact: evt.impact || "",
    };
  }

  function buildEventsIndex(events) {
    eventsByCode = new Map();
    events.forEach((evt) => {
      const rec = normalizeEventRecord(evt);
      if (!rec) return;
      if (!eventsByCode.has(rec.code)) eventsByCode.set(rec.code, []);
      eventsByCode.get(rec.code).push(rec);
    });
    eventsByCode.forEach((list) => list.sort((a, b) => a.year - b.year));
  }

  function getCountryEvents(code) {
    return eventsByCode.get(code) || [];
  }

  function getNearbyCountryEvents(code, year, windowYears = 3) {
    return getCountryEvents(code).filter((evt) => Math.abs(evt.year - year) <= windowYears);
  }

  function meanMetricInRange(series, key, startYear, endYear) {
    const vals = series
      .filter((d) => d.year >= startYear && d.year <= endYear && d[key] != null)
      .map((d) => +d[key]);
    if (!vals.length) return null;
    return d3.mean(vals);
  }

  function computeMetricWindowStats(series, key, beforeStart, beforeEnd, afterStart, afterEnd) {
    const before = meanMetricInRange(series, key, beforeStart, beforeEnd);
    const after = meanMetricInRange(series, key, afterStart, afterEnd);
    const delta = before == null || after == null ? null : after - before;
    return { before, after, delta };
  }

  function meanMetricForRegionRange(region, key, startYear, endYear) {
    if (!region) return null;
    const vals = allData
      .filter((d) => d.region === region && d.year >= startYear && d.year <= endYear && d[key] != null)
      .map((d) => +d[key]);
    if (!vals.length) return null;
    return d3.mean(vals);
  }

  function computeRegionMetricWindowStats(region, key, beforeStart, beforeEnd, afterStart, afterEnd) {
    const before = meanMetricForRegionRange(region, key, beforeStart, beforeEnd);
    const after = meanMetricForRegionRange(region, key, afterStart, afterEnd);
    const delta = before == null || after == null ? null : after - before;
    return { before, after, delta };
  }

  function formatSignedPP(v) {
    if (v == null || !Number.isFinite(v)) return "N/A";
    const sign = v > 0 ? "+" : "";
    return `${sign}${v.toFixed(1)} pp`;
  }

  function formatPercent(v) {
    if (v == null || !Number.isFinite(v)) return "N/A";
    return `${v.toFixed(1)}%`;
  }

  function buildPolicyShockLensState(code, countryName, event, windowYears = SHOCK_WINDOW_YEARS) {
    if (!event || event.year == null) return null;

    const eventYear = +event.year;
    const beforeStart = Math.max(1960, eventYear - windowYears);
    const beforeEnd = Math.max(1960, eventYear - 1);
    const afterStart = Math.min(2019, eventYear + 1);
    const afterEnd = Math.min(2019, eventYear + windowYears);
    const selectedAtEvent = closestYearData(code, eventYear);
    const regionName = selectedAtEvent ? selectedAtEvent.region : "";

    const selectedSeries = getCountryData(code);
    const selectedRenew = computeMetricWindowStats(selectedSeries, "renewable_pct", beforeStart, beforeEnd, afterStart, afterEnd);
    const selectedFossil = computeMetricWindowStats(selectedSeries, "fossil_fuel_pct", beforeStart, beforeEnd, afterStart, afterEnd);
    const focus = {
      country: countryName || code,
      renewBefore: selectedRenew.before,
      renewAfter: selectedRenew.after,
      deltaRenew: selectedRenew.delta,
      fossilBefore: selectedFossil.before,
      fossilAfter: selectedFossil.after,
      deltaFossil: selectedFossil.delta,
    };

    const regionRenew = computeRegionMetricWindowStats(regionName, "renewable_pct", beforeStart, beforeEnd, afterStart, afterEnd);
    const regionFossil = computeRegionMetricWindowStats(regionName, "fossil_fuel_pct", beforeStart, beforeEnd, afterStart, afterEnd);
    const regionFocus = {
      renewBefore: regionRenew.before,
      renewAfter: regionRenew.after,
      deltaRenew: regionRenew.delta,
      fossilBefore: regionFossil.before,
      fossilAfter: regionFossil.after,
      deltaFossil: regionFossil.delta,
    };

    return {
      code,
      country: countryName || (selectedAtEvent && selectedAtEvent.country) || (focus && focus.country) || code,
      region: regionName || "",
      eventYear,
      eventKeyword: event.keyword || "Energy Event",
      eventTitle: event.title || "",
      eventImpact: event.impact || "",
      beforeStart,
      beforeEnd,
      afterStart,
      afterEnd,
      focus,
      regionFocus,
    };
  }

  const TRANSITION_METRICS = [
    { key: "renewable_pct", label: "Renewables", minShift: 6, preferredDirection: "up", unit: "pp", weight: 1.15, maxPicks: 2 },
    { key: "fossil_fuel_pct", label: "Fossil Fuel", minShift: 6, preferredDirection: "down", unit: "pp", weight: 1.1, maxPicks: 2 },
    { key: "renewable_elec_output", label: "Renewable Electricity", minShift: 6, preferredDirection: "up", unit: "pp", weight: 1.2, maxPicks: 2 },
    {
      key: "energy_per_capita",
      label: "Energy per Capita",
      minShift: 350,
      preferredDirection: "either",
      unit: "kg oil eq.",
      weight: 0.45,
      maxPicks: 1,
      significanceMultiplier: 1.5,
    },
  ];

  function nearestEventGap(year, eventYears) {
    if (!eventYears.length) return Infinity;
    let best = Infinity;
    eventYears.forEach((evtYear) => {
      const gap = Math.abs(year - evtYear);
      if (gap < best) best = gap;
    });
    return best;
  }

  function detectCountryTransitions(code, maxTransitions = 4) {
    const cdata = getCountryData(code).slice().sort((a, b) => a.year - b.year);
    if (!cdata.length) return [];

    const metricMetaByKey = new Map(TRANSITION_METRICS.map((m) => [m.key, m]));
    const countryEventYears = getCountryEvents(code).map((evt) => evt.year);
    const candidates = [];
    TRANSITION_METRICS.forEach((metric) => {
      const series = cdata.filter((d) => d[metric.key] != null);
      if (series.length < 8) return;

      const vals = series.map((d) => d[metric.key]);
      const range = (d3.max(vals) || 0) - (d3.min(vals) || 0);
      const threshold = Math.max(metric.minShift, range * 0.12);
      const significanceMultiplier = metric.significanceMultiplier || 1;

      // 3-year mean before vs after a focal year to detect structural shifts.
      for (let i = 3; i < series.length - 3; i++) {
        const before = d3.mean(series.slice(i - 3, i), (d) => d[metric.key]);
        const after = d3.mean(series.slice(i + 1, i + 4), (d) => d[metric.key]);
        if (before == null || after == null) continue;

        const shift = after - before;
        if (Math.abs(shift) < threshold * significanceMultiplier) continue;
        if (metric.preferredDirection === "up" && shift < 0) continue;
        if (metric.preferredDirection === "down" && shift > 0) continue;

        const year = series[i].year;
        const eventGap = nearestEventGap(year, countryEventYears);
        let score = Math.abs(shift) / threshold;
        score *= metric.weight || 1;
        if (eventGap <= 1) score += 0.6;
        else if (eventGap <= 3) score += 0.3;
        else if (eventGap <= 5) score += 0.1;

        candidates.push({
          year,
          metricKey: metric.key,
          metricLabel: metric.label,
          unit: metric.unit,
          shift,
          direction: shift >= 0 ? "up" : "down",
          score,
          eventGap,
        });
      }
    });

    candidates.sort((a, b) => b.score - a.score || a.year - b.year);

    const picked = [];
    const pickedByMetric = new Map();

    const tryPick = (cand) => {
      const nearExisting = picked.some((p) => Math.abs(p.year - cand.year) <= 2);
      if (nearExisting) return false;

      const metricMeta = metricMetaByKey.get(cand.metricKey);
      const cap = metricMeta && Number.isFinite(metricMeta.maxPicks) ? metricMeta.maxPicks : maxTransitions;
      const used = pickedByMetric.get(cand.metricKey) || 0;
      if (used >= cap) return false;

      picked.push(cand);
      pickedByMetric.set(cand.metricKey, used + 1);
      return true;
    };

    // Prefer power-mix transitions first; they are easier to explain with policy events.
    const preferredMetricOrder = ["renewable_elec_output", "renewable_pct", "fossil_fuel_pct"];
    preferredMetricOrder.forEach((metricKey) => {
      if (picked.length >= maxTransitions) return;
      const best = candidates.find((c) => c.metricKey === metricKey);
      if (best) tryPick(best);
    });

    for (const cand of candidates) {
      if (picked.length >= maxTransitions) break;
      tryPick(cand);
    }

    return picked.sort((a, b) => a.year - b.year);
  }

  function matchEventsToTransitions(events, transitions, maxGap = 3) {
    if (!events.length || !transitions.length) return [];

    const matches = [];
    events.forEach((evt) => {
      let best = null;
      transitions.forEach((t) => {
        const gap = Math.abs(evt.year - t.year);
        if (gap > maxGap) return;
        if (!best || gap < best.gap || (gap === best.gap && t.score > best.transition.score)) {
          best = { transition: t, gap };
        }
      });
      if (best) {
        matches.push({
          ...evt,
          transition: best.transition,
          gap: best.gap,
        });
      }
    });

    matches.sort((a, b) => a.gap - b.gap || b.transition.score - a.transition.score);
    return matches;
  }

  function formatTransitionShift(transition) {
    const magnitude = Math.abs(transition.shift);
    if (transition.unit === "pp") return `${magnitude.toFixed(1)} ${transition.unit}`;
    return `${d3.format(",.0f")(magnitude)} ${transition.unit}`;
  }

  function setShockLensVisibility(active) {
    const panel = document.getElementById("shock-lens-panel");
    if (!panel) return;
    panel.classList.toggle("active", !!active);
  }

  function shockMetricClass(delta, betterDirection = "up") {
    if (delta == null || !Number.isFinite(delta) || Math.abs(delta) < 0.05) return "flat";
    if (betterDirection === "down") return delta <= 0 ? "up" : "down";
    return delta >= 0 ? "up" : "down";
  }

  function shockMetricWidth(delta, maxAbsDelta) {
    if (delta == null || !Number.isFinite(delta)) return 0;
    if (!maxAbsDelta || maxAbsDelta <= 0) return 0;
    return Math.max(6, Math.min(100, (Math.abs(delta) / maxAbsDelta) * 100));
  }

  function renderShockMetricRow(label, before, after, delta, betterDirection, maxAbsDelta) {
    const cls = shockMetricClass(delta, betterDirection);
    const width = shockMetricWidth(delta, maxAbsDelta);
    return `<div class="shock-metric-row">
      <div class="shock-metric-head">
        <span class="shock-metric-label">${label}</span>
        <span class="shock-metric-delta ${cls}">${formatSignedPP(delta)}</span>
      </div>
      <div class="shock-metric-range">${formatPercent(before)} → ${formatPercent(after)}</div>
      <div class="shock-metric-track">
        <span class="shock-metric-fill ${cls}" style="width:${width.toFixed(1)}%"></span>
      </div>
    </div>`;
  }

  function updatePolicyShockLensPanel() {
    if (!shockLensState) {
      setShockLensVisibility(false);
      return;
    }

    const f = shockLensState.focus || {};
    const r = shockLensState.regionFocus || {};
    const maxAbsDelta = Math.max(
      2,
      d3.max([
        Math.abs(f.deltaRenew || 0),
        Math.abs(f.deltaFossil || 0),
        Math.abs(r.deltaRenew || 0),
        Math.abs(r.deltaFossil || 0),
      ]) || 0
    );

    const windowText = `${shockLensState.eventYear} event • before ${shockLensState.beforeStart}-${shockLensState.beforeEnd} vs after ${shockLensState.afterStart}-${shockLensState.afterEnd}`;
    const titleText = `${shockLensState.country} — ${shockLensState.eventKeyword}`;

    d3.select("#shock-lens-title").text(titleText);
    d3.select("#shock-lens-window").text(windowText);
    d3.select("#shock-region-title").text(shockLensState.region ? `${shockLensState.region} Region Average` : "Region Context");

    const countryHtml =
      renderShockMetricRow("Renewable", f.renewBefore, f.renewAfter, f.deltaRenew, "up", maxAbsDelta)
      + renderShockMetricRow("Fossil Fuel", f.fossilBefore, f.fossilAfter, f.deltaFossil, "down", maxAbsDelta);
    const regionHtml =
      renderShockMetricRow("Renewable", r.renewBefore, r.renewAfter, r.deltaRenew, "up", maxAbsDelta)
      + renderShockMetricRow("Fossil Fuel", r.fossilBefore, r.fossilAfter, r.deltaFossil, "down", maxAbsDelta);

    d3.select("#shock-country-summary").html(countryHtml);
    d3.select("#shock-region-summary").html(regionHtml);

    setShockLensVisibility(true);
  }

  function activatePolicyShockLens(code, countryName, event) {
    const nextState = buildPolicyShockLensState(code, countryName, event);
    if (!nextState) return;

    shockLensState = nextState;
    if (playing) togglePlay();

    currentYear = nextState.eventYear;
    d3.select("#year-slider").property("value", currentYear);
    d3.select("#year-label").text(currentYear);
    updateAmbientBackground();
    onYearChange();
    updatePolicyShockLensPanel();
    updateShockNav();
  }

  function clearPolicyShockLens(redrawChart = true) {
    const hadLens = !!shockLensState;
    shockLensState = null;
    setShockLensVisibility(false);
    d3.select("#shock-country-summary").html("");
    d3.select("#shock-region-summary").html("");
    d3.select("#shock-region-title").text("Region Context");

    if (hadLens && redrawChart && selectedCountry) {
      const rec = closestYearData(selectedCountry, currentYear);
      if (rec) drawStackedArea(selectedCountry, rec.country);
    }
    updateShockNav();
  }

  function closestEventToYear(events, year) {
    if (!events.length) return null;
    let best = events[0];
    let bestGap = Math.abs(best.year - year);
    for (let i = 1; i < events.length; i++) {
      const gap = Math.abs(events[i].year - year);
      if (gap < bestGap) {
        best = events[i];
        bestGap = gap;
      }
    }
    return best;
  }

  function getSelectedShockNavEvent() {
    if (!selectedCountry) return null;
    const events = getCountryEvents(selectedCountry);
    if (!events.length) return null;

    const selectEl = document.getElementById("shock-event-select");
    const selectedYear = selectEl ? +selectEl.value : NaN;
    const match = events.find((evt) => evt.year === selectedYear);
    return match || closestEventToYear(events, currentYear);
  }

  function shiftShockNavEvent(step) {
    const selectEl = document.getElementById("shock-event-select");
    if (!selectEl || !selectEl.options.length) return;
    const opts = Array.from(selectEl.options);
    const cur = opts.findIndex((opt) => opt.value === selectEl.value);
    const currentIndex = cur >= 0 ? cur : 0;
    const nextIndex = Math.max(0, Math.min(opts.length - 1, currentIndex + step));
    selectEl.value = opts[nextIndex].value;
  }

  function applyShockNavSelection() {
    if (!selectedCountry) return;
    const event = getSelectedShockNavEvent();
    if (!event) return;

    const rec = closestYearData(selectedCountry, currentYear);
    activatePolicyShockLens(selectedCountry, rec ? rec.country : selectedCountry, event);
  }

  function updateShockNav() {
    const navEl = document.getElementById("shock-nav");
    if (!navEl) return;

    const toggleEl = document.getElementById("shock-nav-enable");
    const selectEl = document.getElementById("shock-event-select");
    const prevBtn = document.getElementById("shock-prev-btn");
    const nextBtn = document.getElementById("shock-next-btn");
    const applyBtn = document.getElementById("shock-apply-btn");
    const closeBtn = document.getElementById("shock-close-btn");
    const countryEl = document.getElementById("shock-nav-country");
    const hintEl = document.getElementById("shock-nav-hint");

    const hasCountry = !!selectedCountry;
    const active = !!(shockLensState && hasCountry && shockLensState.code === selectedCountry);

    if (!hasCountry) {
      navEl.classList.add("disabled");
      if (countryEl) countryEl.textContent = "Country: —";
      if (hintEl) hintEl.textContent = "Select a country on the map to enable event navigation.";
      if (toggleEl) {
        toggleEl.checked = false;
        toggleEl.disabled = true;
      }
      if (selectEl) {
        selectEl.innerHTML = "";
        selectEl.disabled = true;
      }
      [prevBtn, nextBtn, applyBtn, closeBtn].forEach((btn) => {
        if (btn) btn.disabled = true;
      });
      return;
    }

    const rec = closestYearData(selectedCountry, currentYear);
    const countryName = rec ? rec.country : selectedCountry;
    if (countryEl) countryEl.textContent = `Country: ${countryName}`;

    const events = getCountryEvents(selectedCountry);
    const hasEvents = events.length > 0;
    navEl.classList.toggle("disabled", !hasEvents);
    if (toggleEl) toggleEl.checked = active;

    if (!hasEvents) {
      if (hintEl) hintEl.textContent = "No catalogued events for this country yet.";
      if (toggleEl) toggleEl.disabled = true;
      if (selectEl) {
        selectEl.innerHTML = "";
        selectEl.disabled = true;
      }
      [prevBtn, nextBtn, applyBtn].forEach((btn) => {
        if (btn) btn.disabled = true;
      });
      if (closeBtn) closeBtn.disabled = !active;
      return;
    }

    if (toggleEl) toggleEl.disabled = false;
    const desiredYear = active
      ? shockLensState.eventYear
      : (selectEl && selectEl.value ? +selectEl.value : null);
    const defaultEvent = desiredYear != null
      ? events.find((evt) => evt.year === desiredYear) || closestEventToYear(events, currentYear)
      : closestEventToYear(events, currentYear);
    const targetYear = defaultEvent ? defaultEvent.year : events[0].year;

    if (selectEl) {
      const currentValues = Array.from(selectEl.options).map((opt) => +opt.value);
      const nextValues = events.map((evt) => evt.year);
      const changed = currentValues.length !== nextValues.length
        || currentValues.some((v, i) => v !== nextValues[i]);

      if (changed) {
        selectEl.innerHTML = "";
        events.forEach((evt) => {
          const label = `${evt.year} · ${evt.keyword || evt.title || "Energy Event"}`;
          const opt = document.createElement("option");
          opt.value = String(evt.year);
          opt.textContent = label;
          selectEl.appendChild(opt);
        });
      }
      selectEl.disabled = false;
      selectEl.value = String(targetYear);
    }

    [prevBtn, nextBtn, applyBtn].forEach((btn) => {
      if (btn) btn.disabled = false;
    });
    if (closeBtn) closeBtn.disabled = !active;

    if (hintEl) {
      if (active) {
        hintEl.textContent = `Active: ${shockLensState.eventYear} · ${shockLensState.eventKeyword}. Use Prev/Next or choose another event.`;
      } else {
        hintEl.textContent = "Choose an event and click Apply Lens, or enable the toggle for immediate apply.";
      }
    }
  }

  // --- Data Loading ---
  Promise.all([
    d3.json("data/energy.json?v=" + Date.now()),
    d3.json("data/world-110m.json"),
    d3.json("data/events.json?v=" + Date.now()),
  ]).then(([energy, world, events]) => {
    allData = energy;
    buildDataIndex(allData);
    worldTopo = world;
    allEvents = Array.isArray(events) ? events : [];
    buildEventsIndex(allEvents);
    init();
  });

  // --- Init ---
  function init() {
    populateRegionFilter();
    drawMap();
    drawLegend();
    drawTimeline();
    bindControls();
    updateMap();
    drawComparisonChart();
    updateInsightBar();
    updateAmbientBackground();
    setShockLensVisibility(false);
    updateShockNav();
    updateBrushHintText();
    updateDeselectButton();
    updateStoryUI();
    window.addEventListener("resize", handleWindowResize, { passive: true });
    initScrollReveal();
    initTiltCards();
  }

  // --- Region filter ---
  function populateRegionFilter() {
    const regions = [...new Set(allData.map((d) => d.region).filter(Boolean))].sort();
    const sel = d3.select("#region-select");
    regions.forEach((r) => sel.append("option").attr("value", r).text(r));
  }

  // ============================================================
  // CHOROPLETH MAP
  // ============================================================
  let mapSvg, mapG, projection, pathGen, mapWidth, mapHeight;
  let zoom;

  function mapTransformIsIdentity(transform) {
    if (!transform) return true;
    return (
      Math.abs(transform.k - 1) < 1e-3
      && Math.abs(transform.x) < 0.5
      && Math.abs(transform.y) < 0.5
    );
  }

  function updateMapResetButton(transform) {
    const btn = d3.select("#map-reset-btn");
    if (btn.empty()) return;
    btn.property("disabled", mapTransformIsIdentity(transform));
  }

  function resetMapZoom() {
    if (!mapSvg || !zoom) return;
    mapSvg
      .transition()
      .duration(380)
      .ease(d3.easeCubicOut)
      .call(zoom.transform, d3.zoomIdentity);
  }

  function drawMap() {
    const container = document.getElementById("map-container");
    mapWidth = container.clientWidth;
    mapHeight = Math.min(mapWidth * 0.55, 520);

    mapSvg = d3
      .select("#map-svg")
      .attr("viewBox", `0 0 ${mapWidth} ${mapHeight}`)
      .attr("preserveAspectRatio", "xMidYMid meet");
    mapSvg.selectAll("*").remove();

    projection = d3
      .geoNaturalEarth1()
      .fitSize([mapWidth - 20, mapHeight - 20], topojson.feature(worldTopo, worldTopo.objects.countries))
      .translate([mapWidth / 2, mapHeight / 2]);

    pathGen = d3.geoPath().projection(projection);

    // Zoom behavior
    zoom = d3.zoom()
      .scaleExtent([1, 8])
      .on("zoom", (event) => {
        mapG.attr("transform", event.transform);
        updateMapResetButton(event.transform);
      });

    mapSvg.call(zoom);
    updateMapResetButton(d3.zoomIdentity);

    // Graticule
    mapSvg
      .append("path")
      .datum(d3.geoGraticule10())
      .attr("d", pathGen)
      .attr("fill", "none")
      .attr("stroke", "rgba(255,255,255,0.06)")
      .attr("stroke-width", 0.4);

    mapG = mapSvg.append("g");

    worldCountries = topojson.feature(worldTopo, worldTopo.objects.countries).features;

    mapG
      .selectAll(".country-path")
      .data(worldCountries)
      .join("path")
      .attr("class", "country-path")
      .attr("d", pathGen)
      .attr("fill", "#1a2332")
      .on("mouseover", onCountryHover)
      .on("mousemove", onCountryMove)
      .on("mouseout", onCountryOut)
      .on("click", onCountryClick);
    applyCountryHighlight();

    if (!selectedCountry) {
      // Narrative guide overlay
      const guideG = mapSvg.append("g").attr("class", "map-guide");
      guideG.append("circle")
        .attr("cx", mapWidth / 2)
        .attr("cy", mapHeight / 2)
        .attr("r", 28)
        .attr("fill", "none")
        .attr("stroke", "rgba(88,166,255,0.6)")
        .attr("stroke-width", 2)
        .attr("class", "guide-ring");
      guideG.append("text")
        .attr("x", mapWidth / 2)
        .attr("y", mapHeight / 2 + 52)
        .attr("text-anchor", "middle")
        .attr("fill", "rgba(255,255,255,0.6)")
        .attr("font-size", 14)
        .attr("font-weight", 600)
        .text("Click a country to explore");
      // Pointer icon
      guideG.append("text")
        .attr("x", mapWidth / 2)
        .attr("y", mapHeight / 2 + 7)
        .attr("text-anchor", "middle")
        .attr("font-size", 24)
        .attr("fill", "rgba(88,166,255,0.8)")
        .text("\u{1F447}");
    }
  }

  function getColorScale() {
    let vals = allData
      .filter((d) => Math.abs(d.year - currentYear) <= 5 && d[currentMetric] != null)
      .map((d) => d[currentMetric]);

    if (currentMetric === "energy_per_capita") {
      return d3
        .scaleSequential(d3.interpolateYlOrRd)
        .domain([0, d3.quantile(vals.sort(d3.ascending), 0.95) || 5000]);
    }
    if (currentMetric === "fossil_fuel_pct") {
      return d3
        .scaleSequential(d3.interpolateOrRd)
        .domain([0, 100]);
    }
    return d3.scaleSequential(d3.interpolateGnBu).domain([0, 100]);
  }

  function updateMap() {
    const colorScale = getColorScale();

    const dataMap = {};
    const candidateYears = [];
    for (let y = currentYear; y >= currentYear - 5; y--) candidateYears.push(y);
    for (let y = currentYear + 1; y <= currentYear + 5; y++) candidateYears.push(y);

    allData.forEach((d) => {
      if (currentRegion !== "all" && d.region !== currentRegion) return;
      if (d[currentMetric] == null) return;
      if (!candidateYears.includes(d.year)) return;
      const existing = dataMap[d.code];
      if (!existing || Math.abs(d.year - currentYear) < Math.abs(existing.year - currentYear)) {
        dataMap[d.code] = d;
      }
    });

    const dataCount = Object.keys(dataMap).length;

    // DIRECTION 2: Smooth map color transitions — speed-aware
    const transDuration = Math.max(80, 300 / playSpeed);
    mapG
      .selectAll(".country-path")
      .transition()
      .duration(transDuration)
      .ease(d3.easeCubicInOut)
      .attr("fill", function (d) {
        const alpha3 = countryAlpha3FromTopoId(d.id);
        const rec = dataMap[alpha3];
        if (!rec || rec[currentMetric] == null) return "#1a2332";
        return colorScale(rec[currentMetric]);
      });

    mapSvg.selectAll(".no-data-msg").remove();
    if (dataCount === 0) {
      mapSvg.append("text")
        .attr("class", "no-data-msg")
        .attr("x", mapWidth / 2)
        .attr("y", mapHeight / 2)
        .attr("text-anchor", "middle")
        .attr("fill", "rgba(255,255,255,0.35)")
        .attr("font-size", 16)
        .text(`No data available for "${METRIC_LABELS[currentMetric]}" around ${currentYear}`);
    }

    drawLegend(colorScale);
  }

  // --- Legend ---
  function drawLegend(colorScale) {
    const container = d3.select("#legend-container");
    container.selectAll("*").remove();

    if (!colorScale) colorScale = getColorScale();

    const w = 260, h = 14;
    const svg = container.append("svg").attr("width", w + 60).attr("height", h + 24);

    const defs = svg.append("defs");
    const lg = defs
      .append("linearGradient")
      .attr("id", "legend-grad")
      .attr("x1", "0%").attr("x2", "100%");

    const domain = colorScale.domain();
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const val = domain[0] + t * (domain[1] - domain[0]);
      lg.append("stop")
        .attr("offset", `${t * 100}%`)
        .attr("stop-color", colorScale(val));
    }

    svg.append("rect")
      .attr("x", 30).attr("y", 2)
      .attr("width", w).attr("height", h)
      .attr("rx", 3)
      .attr("fill", "url(#legend-grad)");

    svg.append("text").attr("x", 30).attr("y", h + 16)
      .attr("fill", "rgba(255,255,255,0.45)").attr("font-size", 10)
      .text(formatLegendValue(domain[0], currentMetric));

    svg.append("text").attr("x", 30 + w).attr("y", h + 16)
      .attr("text-anchor", "end")
      .attr("fill", "rgba(255,255,255,0.45)").attr("font-size", 10)
      .text(formatLegendValue(domain[1], currentMetric));

    container.append("span").text(METRIC_LABELS[currentMetric]);
    container.append("span").attr("class", "legend-unit").text(getMetricUnit(currentMetric));
  }

  // --- Map interactions ---
  function onCountryHover(event, d) {
    const alpha3 = countryAlpha3FromTopoId(d.id);
    if (!alpha3) return;
    const rec = closestYearData(alpha3, currentYear);
    if (!rec || !passesRegionFilter(rec)) return;

    const tip = d3.select("#tooltip");
    tip.style("display", "block");

    let html = `<div class="tt-title">${rec.country} (${currentYear})</div>`;
    html += `<div class="tt-row"><span class="tt-label">Region:</span><span class="tt-val">${rec.region}</span></div>`;
    html += `<div class="tt-row"><span class="tt-label">${METRIC_LABELS[currentMetric]}:</span><span class="tt-val">${fmt(rec[currentMetric])}</span></div>`;
    if (rec.renewable_pct != null)
      html += `<div class="tt-row"><span class="tt-label">Renewable %:</span><span class="tt-val">${fmt(rec.renewable_pct)}</span></div>`;
    if (rec.fossil_fuel_pct != null)
      html += `<div class="tt-row"><span class="tt-label">Fossil Fuel %:</span><span class="tt-val">${fmt(rec.fossil_fuel_pct)}</span></div>`;

    tip.html(html);
  }

  function onCountryMove(event) {
    d3.select("#tooltip")
      .style("left", event.clientX + 14 + "px")
      .style("top", event.clientY - 10 + "px");
  }

  function onCountryOut() {
    d3.select("#tooltip").style("display", "none");
  }

  // DIRECTION 2: Ripple effect on map click
  function createRipple(event) {
    const container = document.getElementById("map-container");
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const size = Math.max(rect.width, rect.height) * 0.6;

    const ripple = document.createElement("div");
    ripple.className = "map-ripple";
    ripple.style.width = size + "px";
    ripple.style.height = size + "px";
    ripple.style.left = (x - size / 2) + "px";
    ripple.style.top = (y - size / 2) + "px";
    container.appendChild(ripple);

    ripple.addEventListener("animationend", () => ripple.remove());
  }

  function onCountryClick(event, d) {
    const alpha3 = countryAlpha3FromTopoId(d.id);
    if (!alpha3) return;
    const rec = closestYearData(alpha3, currentYear);
    if (!rec || !passesRegionFilter(rec)) return;

    if (storyActive) stopStoryMode(false);

    if (brushedYearRange) {
      brushedYearRange = null;
      updateMap();
    }

    // DIRECTION 2: Ripple
    createRipple(event);

    // Remove guide on first click
    mapSvg.selectAll(".map-guide").transition().duration(400).style("opacity", 0).remove();

    // Toggle selection
    if (selectedCountry === alpha3) {
      clearSelectedCountry(false);
    } else {
      focusCountry(alpha3, rec.country, true);
    }
  }

  // ============================================================
  // STACKED AREA CHART — DIRECTION 3: draw-in animation
  // ============================================================
  function drawStackedArea(code, countryName) {
    d3.select("#chart-title").text(`${countryName} — Electricity Sources`);

    const svg = d3.select("#stack-chart");
    svg.selectAll("*").remove();

    const container = document.getElementById("chart-panel");
    const margin = { top: 20, right: 20, bottom: 36, left: 42 };
    const width = container.clientWidth - 32 - margin.left - margin.right;
    const height = 300 - margin.top - margin.bottom;

    svg.attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`);

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const cdata = getCountryData(code)
      .filter((d) => ENERGY_SOURCES.some((s) => d[s.key] != null))
      .sort((a, b) => a.year - b.year);

    if (!cdata.length) {
      g.append("text")
        .attr("x", width / 2).attr("y", height / 2)
        .attr("text-anchor", "middle")
        .attr("fill", "rgba(255,255,255,0.35)")
        .text("No electricity source data available");
      return;
    }

    const stackData = cdata.map((d) => {
      const row = { year: d.year };
      ENERGY_SOURCES.forEach((s) => { row[s.key] = d[s.key] || 0; });
      return row;
    });

    const keys = ENERGY_SOURCES.map((s) => s.key);
    const stack = d3.stack().keys(keys).order(d3.stackOrderNone).offset(d3.stackOffsetNone);
    const series = stack(stackData);

    const x = d3.scaleLinear()
      .domain(d3.extent(stackData, (d) => d.year))
      .range([0, width]);

    const y = d3.scaleLinear()
      .domain([0, d3.max(series, (s) => d3.max(s, (d) => d[1])) || 100])
      .nice()
      .range([height, 0]);

    const area = d3.area()
      .x((d) => x(d.data.year))
      .y0((d) => y(d[0]))
      .y1((d) => y(d[1]))
      .curve(d3.curveMonotoneX);

    // DIRECTION 3: Clip-rect reveal animation (wipe from left to right)
    const clipId = "area-clip-" + Date.now();
    const clipRect = g.append("defs")
      .append("clipPath").attr("id", clipId)
      .append("rect")
      .attr("x", 0).attr("y", 0)
      .attr("width", 0)
      .attr("height", height + margin.top);

    clipRect.transition()
      .duration(1000)
      .ease(d3.easeCubicOut)
      .attr("width", width);

    const areaG = g.append("g").attr("clip-path", `url(#${clipId})`);

    areaG.selectAll(".area-layer")
      .data(series)
      .join("path")
      .attr("class", "area-layer")
      .attr("fill", (d, i) => ENERGY_SOURCES[i].color)
      .attr("d", area)
      .attr("opacity", 0.85)
      .on("mouseover", function (event, d) {
        const src = ENERGY_SOURCES.find((s) => s.key === d.key);
        d3.select("#tooltip")
          .style("display", "block")
          .html(`<div class="tt-title">${src.label}</div>`);
      })
      .on("mousemove", onCountryMove)
      .on("mouseout", onCountryOut);

    // Axes
    g.append("g")
      .attr("class", "chart-axis")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x).tickFormat(d3.format("d")).ticks(8));

    g.append("g")
      .attr("class", "chart-axis")
      .call(d3.axisLeft(y).ticks(5).tickFormat((d) => d + "%"));

    // Current year indicator
    if (x.domain()[0] <= currentYear && currentYear <= x.domain()[1]) {
      g.append("line")
        .attr("class", "year-indicator")
        .attr("x1", x(currentYear)).attr("x2", x(currentYear))
        .attr("y1", 0).attr("y2", height);
    }

    const detectedTransitions = detectCountryTransitions(code);
    const allCountryEvents = getCountryEvents(code);
    const matchedEvents = matchEventsToTransitions(allCountryEvents, detectedTransitions, 3);
    const matchedEventByYear = new Map();
    matchedEvents.forEach((evt) => {
      if (!matchedEventByYear.has(evt.year)) matchedEventByYear.set(evt.year, evt);
    });

    // Annotations
    ANNOTATIONS.forEach((ann) => {
      if (ann.year >= x.domain()[0] && ann.year <= x.domain()[1]) {
        g.append("line")
          .attr("class", "annotation-line")
          .attr("x1", x(ann.year)).attr("x2", x(ann.year))
          .attr("y1", 0).attr("y2", height);
        g.append("text")
          .attr("class", "annotation-label")
          .attr("x", x(ann.year) + 3)
          .attr("y", 10)
          .attr("transform", `rotate(-45, ${x(ann.year) + 3}, 10)`)
          .text(ann.text);
      }
    });

    // Country-specific energy transition events
    const countryEvents = allCountryEvents.filter(
      (evt) => evt.year >= x.domain()[0] && evt.year <= x.domain()[1]
    );
    if (countryEvents.length) {
      const eventG = g.append("g").attr("class", "country-events");
      const activeShockYear = shockLensState && shockLensState.code === code ? shockLensState.eventYear : null;
      const baseEventRadius = (d) => (activeShockYear != null && d.year === activeShockYear ? 5.2 : 4);

      eventG.selectAll(".country-event-line")
        .data(countryEvents)
        .join("line")
        .attr("class", "country-event-line")
        .classed("matched", (d) => matchedEventByYear.has(d.year))
        .classed("shock-active", (d) => activeShockYear != null && d.year === activeShockYear)
        .attr("x1", (d) => x(d.year))
        .attr("x2", (d) => x(d.year))
        .attr("y1", 0)
        .attr("y2", height);

      eventG.selectAll(".country-event-dot")
        .data(countryEvents)
        .join("circle")
        .attr("class", "country-event-dot")
        .classed("matched", (d) => matchedEventByYear.has(d.year))
        .classed("shock-active", (d) => activeShockYear != null && d.year === activeShockYear)
        .attr("cx", (d) => x(d.year))
        .attr("cy", 12)
        .attr("r", (d) => baseEventRadius(d))
        .on("mouseover", function (event, d) {
          const tip = d3.select("#tooltip");
          tip.style("display", "block");
          let html = `<div class="tt-title">${d.year} • ${d.keyword || "Energy Event"}</div>`;
          if (d.title) html += `<div class="tt-row"><span class="tt-label">Event:</span><span class="tt-val">${d.title}</span></div>`;
          if (d.impact) html += `<div class="tt-row"><span class="tt-label">Context:</span><span class="tt-val">${d.impact}</span></div>`;
          const match = matchedEventByYear.get(d.year);
          if (match) {
            const dir = match.transition.direction === "up" ? "increased" : "decreased";
            html += `<div class="tt-row"><span class="tt-label">Detected Shift:</span><span class="tt-val">${match.transition.metricLabel} ${dir} (${formatTransitionShift(match.transition)})</span></div>`;
          }
          html += `<div class="tt-row"><span class="tt-label">Action:</span><span class="tt-val">Click for ±5y shock lens</span></div>`;
          tip.html(html);
          d3.select(this).attr("r", 7);
        })
        .on("mousemove", onCountryMove)
        .on("mouseout", function (event, d) {
          d3.select("#tooltip").style("display", "none");
          d3.select(this).attr("r", baseEventRadius(d));
        })
        .on("click", function (event, d) {
          event.stopPropagation();
          activatePolicyShockLens(code, countryName, d);
        });
    }

    const visibleTransitions = detectedTransitions.filter(
      (t) => t.year >= x.domain()[0] && t.year <= x.domain()[1]
    );
    if (visibleTransitions.length) {
      const trG = g.append("g").attr("class", "detected-transitions");

      trG.selectAll(".detected-transition-line")
        .data(visibleTransitions)
        .join("line")
        .attr("class", "detected-transition-line")
        .attr("x1", (d) => x(d.year))
        .attr("x2", (d) => x(d.year))
        .attr("y1", 0)
        .attr("y2", height);

      trG.selectAll(".detected-transition-dot")
        .data(visibleTransitions)
        .join("circle")
        .attr("class", "detected-transition-dot")
        .attr("cx", (d) => x(d.year))
        .attr("cy", height - 10)
        .attr("r", 3.5)
        .on("mouseover", function (event, d) {
          const dir = d.direction === "up" ? "increased" : "decreased";
          d3.select("#tooltip")
            .style("display", "block")
            .html(`<div class="tt-title">${d.year} • Structural Shift</div><div class="tt-row"><span class="tt-label">Metric:</span><span class="tt-val">${d.metricLabel}</span></div><div class="tt-row"><span class="tt-label">Change:</span><span class="tt-val">${dir} by ~${formatTransitionShift(d)}</span></div>`);
          d3.select(this).attr("r", 5);
        })
        .on("mousemove", onCountryMove)
        .on("mouseout", function () {
          d3.select("#tooltip").style("display", "none");
          d3.select(this).attr("r", 3.5);
        });
    }

    // Legend
    const legendG = g.append("g").attr("transform", `translate(${width - 130}, -14)`);
    ENERGY_SOURCES.forEach((s, i) => {
      const row = legendG.append("g").attr("transform", `translate(0, ${i * 14})`);
      row.append("rect").attr("width", 10).attr("height", 10).attr("rx", 2).attr("fill", s.color);
      row.append("text").attr("x", 14).attr("y", 9).attr("fill", "rgba(255,255,255,0.45)").attr("font-size", 10).text(s.label);
    });

    // BRUSHING: drag to select year range on chart
    const brush = d3.brushX()
      // Keep top area free so event dots remain clickable.
      .extent([[0, 22], [width, height]])
      .on("brush end", function (event) {
        if (!event.selection) {
          // Brush cleared
          brushedYearRange = null;
          d3.select("#brush-label").remove();
          updateMap();
          updateBrushHintText();
          return;
        }
        const [x0, x1] = event.selection;
        const y0 = Math.round(x.invert(x0));
        const y1 = Math.round(x.invert(x1));
        brushedYearRange = [y0, y1];

        // Show brushed range label
        g.selectAll("#brush-label").remove();
        g.append("text")
          .attr("id", "brush-label")
          .attr("x", (x0 + x1) / 2)
          .attr("y", -6)
          .attr("text-anchor", "middle")
          .attr("fill", "var(--accent-blue, #58a6ff)")
          .attr("font-size", 11)
          .attr("font-weight", 700)
          .text(`${y0} – ${y1}`);

        updateMapForBrush(y0, y1);
        updateBrushHintText();
      });

    g.append("g")
      .attr("class", "chart-brush")
      .call(brush);

    updateAnnotationBox(code, detectedTransitions, matchedEvents);
  }

  // Update map to show average for brushed year range
  function updateMapForBrush(y0, y1) {
    const colorScale = getColorScale();
    const dataMap = {};

    allData.forEach((d) => {
      if (currentRegion !== "all" && d.region !== currentRegion) return;
      if (d[currentMetric] == null) return;
      if (d.year < y0 || d.year > y1) return;
      if (!dataMap[d.code]) dataMap[d.code] = [];
      dataMap[d.code].push(d[currentMetric]);
    });

    // Average values
    const avgMap = {};
    Object.keys(dataMap).forEach((code) => {
      const vals = dataMap[code];
      avgMap[code] = vals.reduce((a, b) => a + b, 0) / vals.length;
    });

    const transDuration = Math.max(80, 300 / playSpeed);
    mapG
      .selectAll(".country-path")
      .transition()
      .duration(transDuration)
      .ease(d3.easeCubicInOut)
      .attr("fill", function (d) {
        const alpha3 = countryAlpha3FromTopoId(d.id);
        if (avgMap[alpha3] == null) return "#1a2332";
        return colorScale(avgMap[alpha3]);
      });
  }

  function updateAnnotationBox(code, detectedTransitions = null, matchedEvents = null) {
    const rec = closestYearData(code, currentYear);
    if (!rec) return;
    let html = `<div class="anno-metrics">`;
    if (rec.renewable_pct != null) html += `<strong>Renewable:</strong> ${fmt(rec.renewable_pct)}% &nbsp;`;
    if (rec.fossil_fuel_pct != null) html += `<strong>Fossil Fuel:</strong> ${fmt(rec.fossil_fuel_pct)}% &nbsp;`;
    if (rec.access_electricity != null) html += `<strong>Electricity Access:</strong> ${fmt(rec.access_electricity)}%`;
    html += `</div>`;

    if (!shockLensState || shockLensState.code !== code) {
      html += `<div class="anno-section"><span class="anno-heading">Policy Shock Lens Entry</span><div class="anno-event">Click an event dot on the country chart (top markers) to compare 5 years before vs 5 years after that event.</div></div>`;
    }

    if (shockLensState && shockLensState.code === code && shockLensState.focus) {
      const f = shockLensState.focus;
      const renewClass = f.deltaRenew != null && f.deltaRenew >= 0 ? "up" : "down";
      const fossilClass = f.deltaFossil != null && f.deltaFossil <= 0 ? "up" : "down";

      html += `<div class="anno-section">`;
      html += `<span class="anno-heading">Policy Shock Lens</span>`;
      html += `<div class="anno-event"><span class="anno-year">${shockLensState.eventYear}</span><span class="anno-keyword">${shockLensState.eventKeyword}</span> ${shockLensState.eventTitle || ""}</div>`;
      html += `<div class="anno-event">Window: ${shockLensState.beforeStart}-${shockLensState.beforeEnd} vs ${shockLensState.afterStart}-${shockLensState.afterEnd}</div>`;
      html += `<div class="shock-anno-grid">`;
      html += `<div class="shock-anno-metric"><span class="shock-anno-label">Renewable Change</span><span class="shock-anno-delta ${renewClass}">${formatSignedPP(f.deltaRenew)}</span><span class="shock-anno-range">${formatPercent(f.renewBefore)} → ${formatPercent(f.renewAfter)}</span></div>`;
      html += `<div class="shock-anno-metric"><span class="shock-anno-label">Fossil Fuel Change</span><span class="shock-anno-delta ${fossilClass}">${formatSignedPP(f.deltaFossil)}</span><span class="shock-anno-range">${formatPercent(f.fossilBefore)} → ${formatPercent(f.fossilAfter)}</span></div>`;
      html += `</div>`;
      html += `</div>`;
    }

    const transitions = detectedTransitions || detectCountryTransitions(code);
    const transitionsForDisplay = transitions.some((t) => t.metricKey !== "energy_per_capita")
      ? transitions.filter((t) => t.metricKey !== "energy_per_capita")
      : transitions;
    const transitionMatches = matchedEvents || matchEventsToTransitions(getCountryEvents(code), transitions, 3);
    const matchByYear = new Map();
    transitionMatches.forEach((evt) => {
      if (!matchByYear.has(evt.year)) matchByYear.set(evt.year, evt);
    });

    if (transitionsForDisplay.length) {
      html += `<div class="anno-section"><span class="anno-heading">Detected Structural Shifts</span>`;
      transitionsForDisplay.slice(0, 3).forEach((t) => {
        const dir = t.direction === "up" ? "increased" : "decreased";
        html += `<div class="anno-event"><span class="anno-year">${t.year}</span><span class="anno-keyword">${t.metricLabel}</span> ${dir} by ~${formatTransitionShift(t)}</div>`;
      });
      html += `</div>`;
    }

    const nearbyEvents = getNearbyCountryEvents(code, currentYear, 3).slice().sort((a, b) => a.year - b.year);
    const keyEvents = getCountryEvents(code);
    const keyEventsByDistance = keyEvents
      .slice()
      .sort((a, b) => Math.abs(a.year - currentYear) - Math.abs(b.year - currentYear) || a.year - b.year);

    if (nearbyEvents.length) {
      html += `<div class="anno-section"><span class="anno-heading">Near ${currentYear}</span>`;
      nearbyEvents.forEach((evt) => {
        const match = matchByYear.get(evt.year);
        let detail = "";
        if (match) detail = ` <span class="anno-match">linked to ${match.transition.metricLabel} shift</span>`;
        html += `<div class="anno-event"><span class="anno-year">${evt.year}</span><span class="anno-keyword">${evt.keyword || "Energy Event"}</span> - ${evt.title}${detail}</div>`;
      });
      html += `</div>`;
    } else if (keyEvents.length) {
      html += `<div class="anno-section"><span class="anno-heading">Key Transition Events</span>`;
      keyEventsByDistance.slice(0, 3).forEach((evt) => {
        html += `<div class="anno-event"><span class="anno-year">${evt.year}</span><span class="anno-keyword">${evt.keyword || "Energy Event"}</span> - ${evt.title}</div>`;
      });
      html += `</div>`;
    }

    if (transitionMatches.length) {
      html += `<div class="anno-section"><span class="anno-heading">Likely Drivers</span>`;
      transitionMatches.slice(0, 3).forEach((evt) => {
        const dir = evt.transition.direction === "up" ? "increase" : "decline";
        const title = evt.title || evt.keyword || "Energy Event";
        html += `<div class="anno-event"><span class="anno-year">${evt.year}</span><span class="anno-keyword">${evt.keyword || "Energy Event"}</span> - ${title} <span class="anno-match">linked to ${evt.transition.metricLabel} ${dir}</span></div>`;
      });
      html += `</div>`;
    }

    d3.select("#annotation-box").html(html);
  }

  // ============================================================
  // TIMELINE with mini trend + event markers
  // ============================================================
  let timelineSvg, tlX, tlPlayhead;

  function drawTimeline() {
    const svgEl = document.getElementById("timeline-chart");
    const containerW = svgEl.clientWidth || 800;
    const margin = { top: 8, right: 16, bottom: 18, left: 16 };
    const w = containerW - margin.left - margin.right;
    const h = 52 - margin.top - margin.bottom;

    timelineSvg = d3.select("#timeline-chart");
    timelineSvg.selectAll("*").remove();
    timelineSvg
      .attr("viewBox", `0 0 ${containerW} 52`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    const g = timelineSvg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Build global average per year for fossil + renewable
    const yearAvg = {};
    for (let y = 1960; y <= 2019; y++) {
      const yd = allData.filter(d => d.year === y);
      const fVals = yd.filter(d => d.fossil_fuel_pct != null).map(d => d.fossil_fuel_pct);
      const rVals = yd.filter(d => d.renewable_pct != null).map(d => d.renewable_pct);
      yearAvg[y] = {
        fossil: fVals.length ? fVals.reduce((a, b) => a + b, 0) / fVals.length : null,
        renewable: rVals.length ? rVals.reduce((a, b) => a + b, 0) / rVals.length : null,
      };
    }

    tlX = d3.scaleLinear().domain([1960, 2019]).range([0, w]);
    const yMax = 100;
    const tlY = d3.scaleLinear().domain([0, yMax]).range([h, 0]);

    // Fossil area (warm)
    const fossilData = [];
    const renewData = [];
    for (let y = 1960; y <= 2019; y++) {
      if (yearAvg[y].fossil != null) fossilData.push({ year: y, val: yearAvg[y].fossil });
      if (yearAvg[y].renewable != null) renewData.push({ year: y, val: yearAvg[y].renewable });
    }

    const areaGen = d3.area()
      .x(d => tlX(d.year))
      .y0(h)
      .y1(d => tlY(d.val))
      .curve(d3.curveMonotoneX);

    g.append("path")
      .datum(fossilData)
      .attr("d", areaGen)
      .attr("fill", "rgba(249,115,22,0.2)")
      .attr("stroke", "rgba(249,115,22,0.5)")
      .attr("stroke-width", 1.2);

    g.append("path")
      .datum(renewData)
      .attr("d", areaGen)
      .attr("fill", "rgba(63,185,80,0.2)")
      .attr("stroke", "rgba(63,185,80,0.5)")
      .attr("stroke-width", 1.2);

    // Tiny labels
    g.append("text").attr("x", w - 2).attr("y", tlY(fossilData[fossilData.length - 1].val) - 2)
      .attr("text-anchor", "end").attr("fill", "rgba(249,115,22,0.6)").attr("font-size", 8).attr("font-weight", 600)
      .text("Fossil");
    g.append("text").attr("x", w - 2).attr("y", tlY(renewData[renewData.length - 1].val) - 2)
      .attr("text-anchor", "end").attr("fill", "rgba(63,185,80,0.6)").attr("font-size", 8).attr("font-weight", 600)
      .text("Renewable");

    // Event markers
    ANNOTATIONS.forEach(ann => {
      const cx = tlX(ann.year);
      g.append("line")
        .attr("x1", cx).attr("x2", cx)
        .attr("y1", 0).attr("y2", h)
        .attr("stroke", "rgba(255,255,255,0.12)")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "2 2");

      g.append("circle")
        .attr("class", "timeline-event-dot")
        .attr("cx", cx).attr("cy", h + 1)
        .attr("r", 3.5)
        .attr("fill", "var(--accent-purple)")
        .attr("stroke", "var(--bg-deep)")
        .attr("stroke-width", 1.5)
        .on("mouseover", function (event) {
          d3.select("#tooltip").style("display", "block")
            .html(`<div class="tt-title">${ann.text}</div>`);
          d3.select(this).attr("r", 5);
        })
        .on("mousemove", onCountryMove)
        .on("mouseout", function () {
          d3.select("#tooltip").style("display", "none");
          d3.select(this).attr("r", 3.5);
        })
        .on("click", function () {
          if (storyActive) stopStoryMode(false);
          currentYear = ann.year;
          d3.select("#year-slider").property("value", currentYear);
          d3.select("#year-label").text(currentYear);
          onYearChange();
          updateAmbientBackground();
        });

      g.append("text")
        .attr("class", "timeline-event-label")
        .attr("x", cx).attr("y", -2)
        .attr("text-anchor", "middle")
        .text(ann.year);
    });

    // Playhead
    tlPlayhead = g.append("line")
      .attr("class", "timeline-playhead")
      .attr("x1", tlX(currentYear)).attr("x2", tlX(currentYear))
      .attr("y1", -4).attr("y2", h + 6);
  }

  function updateTimelinePlayhead() {
    if (tlPlayhead && tlX) {
      tlPlayhead.interrupt().transition().duration(100)
        .attr("x1", tlX(currentYear)).attr("x2", tlX(currentYear));
    }
  }

  // ============================================================
  // INSIGHT BAR — dynamic key stats
  // ============================================================
  function updateInsightBar() {
    const yd = allData.filter(
      (d) => d.year === currentYear && (currentRegion === "all" || d.region === currentRegion)
    );

    // Countries with >50% renewable
    const renewHigh = yd.filter(d => d.renewable_pct != null && d.renewable_pct > 50);
    d3.select("#insight-countries").text(renewHigh.length);

    // Global avg fossil fuel
    const fossilVals = yd.filter(d => d.fossil_fuel_pct != null).map(d => d.fossil_fuel_pct);
    const avgFossil = fossilVals.length ? (fossilVals.reduce((a, b) => a + b, 0) / fossilVals.length) : 0;
    d3.select("#insight-avg-fossil").text(fossilVals.length ? avgFossil.toFixed(1) + "%" : "—");

    // Highest renewable country
    const topRenew = yd.filter(d => d.renewable_pct != null).sort((a, b) => b.renewable_pct - a.renewable_pct)[0];
    d3.select("#insight-top").text(topRenew ? `${topRenew.country} (${topRenew.renewable_pct.toFixed(0)}%)` : "—");

    // Global avg electricity access
    const accessVals = yd.filter(d => d.access_electricity != null).map(d => d.access_electricity);
    const avgAccess = accessVals.length ? (accessVals.reduce((a, b) => a + b, 0) / accessVals.length) : 0;
    d3.select("#insight-access").text(accessVals.length ? avgAccess.toFixed(1) + "%" : "—");
  }

  // ============================================================
  // OVERLAY COMPARISON CHART (replaces sparklines)
  // ============================================================
  const COMPARE_COLORS = ["#58a6ff", "#f97316", "#3fb950", "#b87fff", "#f85149", "#ffc658"];

  function drawComparisonChart() {
    const svg = d3.select("#compare-chart");
    svg.selectAll("*").remove();
    const legendEl = d3.select("#compare-legend");
    legendEl.selectAll("*").remove();

    const clearBtn = d3.select("#clear-compare-btn");
    clearBtn.style("display", comparedCountries.length > 0 ? "block" : "none");

    if (comparedCountries.length === 0) {
      const ctr = document.getElementById("compare-chart-container");
      svg.attr("viewBox", `0 0 ${ctr.clientWidth} 220`);
      svg.append("text")
        .attr("x", ctr.clientWidth / 2).attr("y", 110)
        .attr("text-anchor", "middle")
        .attr("fill", "var(--text-muted)")
        .attr("font-size", 13)
        .text("Click countries on the map to add them here");
      return;
    }

    const container = document.getElementById("compare-chart-container");
    const margin = { top: 20, right: 20, bottom: 32, left: 48 };
    const width = container.clientWidth - margin.left - margin.right - 16;
    const height = 220 - margin.top - margin.bottom;

    svg.attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`);
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    // Gather all data
    const allSeries = comparedCountries.map((c, i) => {
      const cdata = getCountryData(c.code)
        .filter(d => d[currentMetric] != null)
        .sort((a, b) => a.year - b.year);
      return { ...c, data: cdata, color: COMPARE_COLORS[i % COMPARE_COLORS.length] };
    });

    const allYears = allSeries.flatMap(s => s.data.map(d => d.year));
    const allVals = allSeries.flatMap(s => s.data.map(d => d[currentMetric]));
    if (!allYears.length) return;

    const x = d3.scaleLinear()
      .domain(d3.extent(allYears))
      .range([0, width]);

    const y = d3.scaleLinear()
      .domain([0, d3.max(allVals) * 1.1 || 100])
      .nice()
      .range([height, 0]);

    // Grid lines
    g.append("g").attr("class", "chart-axis")
      .call(d3.axisLeft(y).ticks(5).tickSize(-width).tickFormat(d => {
        if (currentMetric === "energy_per_capita") return d >= 1000 ? d3.format(",.0f")(d) : d;
        return d + "%";
      }))
      .selectAll("line").attr("stroke", "rgba(255,255,255,0.06)");

    g.append("g").attr("class", "chart-axis")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x).tickFormat(d3.format("d")).ticks(10));

    const line = d3.line()
      .x(d => x(d.year))
      .y(d => y(d[currentMetric]))
      .curve(d3.curveMonotoneX);

    const bisectYear = d3.bisector((d) => d.year).left;
    function nearestSeriesPoint(series, targetYear) {
      if (!series || !series.length) return null;
      const idx = bisectYear(series, targetYear);
      if (idx <= 0) return series[0];
      if (idx >= series.length) return series[series.length - 1];
      const prev = series[idx - 1];
      const next = series[idx];
      return Math.abs(prev.year - targetYear) <= Math.abs(next.year - targetYear) ? prev : next;
    }

    // Draw each country line with animation
    allSeries.forEach((s, idx) => {
      if (s.data.length < 2) return;

      // Area fill
      const areaFill = d3.area()
        .x(d => x(d.year))
        .y0(height)
        .y1(d => y(d[currentMetric]))
        .curve(d3.curveMonotoneX);

      g.append("path")
        .datum(s.data)
        .attr("d", areaFill)
        .attr("fill", s.color)
        .attr("opacity", 0.06);

      // Line
      const path = g.append("path")
        .datum(s.data)
        .attr("d", line)
        .attr("fill", "none")
        .attr("stroke", s.color)
        .attr("stroke-width", 2.5)
        .attr("opacity", 0.9);

      // Draw-in animation
      const totalLen = path.node().getTotalLength();
      path
        .attr("stroke-dasharray", totalLen)
        .attr("stroke-dashoffset", totalLen)
        .transition()
        .duration(800)
        .delay(idx * 150)
        .ease(d3.easeCubicOut)
        .attr("stroke-dashoffset", 0);

      // Current year dot
      const cyData = s.data.find(d => d.year === currentYear);
      if (cyData) {
        g.append("circle")
          .attr("cx", x(cyData.year))
          .attr("cy", y(cyData[currentMetric]))
          .attr("r", 0)
          .attr("fill", s.color)
          .attr("stroke", "var(--bg-deep)")
          .attr("stroke-width", 2)
          .transition()
          .delay(600 + idx * 150)
          .duration(300)
          .attr("r", 5);
      }
    });

    // Current year line
    if (x.domain()[0] <= currentYear && currentYear <= x.domain()[1]) {
      g.append("line")
        .attr("class", "year-indicator")
        .attr("x1", x(currentYear)).attr("x2", x(currentYear))
        .attr("y1", 0).attr("y2", height);
    }

    // Hover readout: bisect nearest year + multi-series tooltip.
    const hoverG = g.append("g")
      .attr("class", "compare-hover-layer")
      .style("display", "none")
      .style("pointer-events", "none");

    const hoverLine = hoverG.append("line")
      .attr("class", "compare-hover-line")
      .attr("y1", 0)
      .attr("y2", height);

    const hoverDots = hoverG.selectAll(".compare-hover-dot")
      .data(allSeries)
      .join("circle")
      .attr("class", "compare-hover-dot")
      .attr("r", 4.2)
      .attr("fill", (d) => d.color)
      .attr("stroke", "var(--bg-deep)")
      .attr("stroke-width", 1.8);

    g.append("rect")
      .attr("class", "compare-hover-capture")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", width)
      .attr("height", height)
      .attr("fill", "transparent")
      .style("cursor", "crosshair")
      .on("mouseenter", function () {
        hoverG.style("display", null);
      })
      .on("mousemove", function (event) {
        const [mx] = d3.pointer(event, this);
        const clampedX = Math.max(0, Math.min(width, mx));
        const minYear = Math.round(x.domain()[0]);
        const maxYear = Math.round(x.domain()[1]);
        const hoverYear = Math.max(minYear, Math.min(maxYear, Math.round(x.invert(clampedX))));

        hoverLine
          .attr("x1", x(hoverYear))
          .attr("x2", x(hoverYear));

        const rows = [];
        hoverDots.each(function (series) {
          const point = nearestSeriesPoint(series.data, hoverYear);
          if (!point) {
            d3.select(this).style("display", "none");
            return;
          }
          d3.select(this)
            .style("display", null)
            .attr("cx", x(point.year))
            .attr("cy", y(point[currentMetric]));

          rows.push({
            country: series.country,
            color: series.color,
            value: point[currentMetric],
            year: point.year,
          });
        });

        if (!rows.length) {
          d3.select("#tooltip").style("display", "none");
          return;
        }

        let html = `<div class="tt-title">${hoverYear} • ${METRIC_LABELS[currentMetric]}</div>`;
        rows.forEach((row) => {
          const yearSuffix = row.year === hoverYear ? "" : ` (${row.year})`;
          html += `<div class="tt-row"><span class="tt-label" style="color:${row.color}">${row.country}${yearSuffix}:</span><span class="tt-val">${formatMetricValue(row.value, currentMetric)}</span></div>`;
        });

        d3.select("#tooltip").style("display", "block").html(html);
        onCountryMove(event);
      })
      .on("mouseleave", function () {
        hoverG.style("display", "none");
        d3.select("#tooltip").style("display", "none");
      });

    // Metric label
    g.append("text")
      .attr("x", -margin.left + 4).attr("y", -8)
      .attr("fill", "var(--text-muted)").attr("font-size", 10).attr("font-weight", 600)
      .text(METRIC_LABELS[currentMetric]);

    // Interactive legend
    allSeries.forEach((s, idx) => {
      const latestVal = s.data.length ? s.data[s.data.length - 1] : null;
      const item = legendEl.append("div").attr("class", "compare-legend-item");

      item.append("span").attr("class", "compare-legend-dot")
        .style("background", s.color);

      item.append("span").attr("class", "compare-legend-name")
        .text(s.country);

      if (latestVal) {
        item.append("span").attr("class", "compare-legend-val")
          .text(formatMetricValue(latestVal[currentMetric], currentMetric));
      }

      item.append("span").attr("class", "compare-legend-remove")
        .text("\u2715")
        .on("click", (event) => {
          event.stopPropagation();
          comparedCountries = comparedCountries.filter(cc => cc.code !== s.code);
          if (selectedCountry === s.code) {
            clearSelectedCountry();
          }
          drawComparisonChart();
          updateShockNav();
          updateBrushHintText();
          updateDeselectButton();
        });
    });
  }

  function updateStoryUI() {
    const bar = d3.select("#story-bar");
    if (bar.empty()) return;

    bar.classed("inactive", !storyActive);
    d3.select("#story-prev-btn").property("disabled", !storyActive || storyStepIndex <= 0);
    d3.select("#story-next-btn").property("disabled", !storyActive || storyStepIndex >= STORY_STEPS.length - 1);
    d3.select("#story-stop-btn").property("disabled", !storyActive);
    d3.select("#story-btn").text(storyActive ? "Restart Story" : "Start Story Mode");

    if (!storyActive && storyStepIndex < 0) {
      d3.select("#story-title").text("Guided Narrative");
      d3.select("#story-text").text("Walk through key energy transition moments across countries.");
    }
  }

  function clearStoryTimer() {
    if (storyTimer) {
      clearTimeout(storyTimer);
      storyTimer = null;
    }
  }

  function stopStoryMode(resetCopy = true) {
    storyActive = false;
    clearStoryTimer();
    if (resetCopy) storyStepIndex = -1;
    updateStoryUI();
  }

  function applyStoryStep(index, scheduleNext = true) {
    if (index < 0 || index >= STORY_STEPS.length) return;
    const step = STORY_STEPS[index];
    storyActive = true;
    storyStepIndex = index;
    clearStoryTimer();

    if (playing) togglePlay();

    if (currentRegion !== "all") {
      currentRegion = "all";
      d3.select("#region-select").property("value", "all");
    }
    if (step.metric && currentMetric !== step.metric) {
      currentMetric = step.metric;
      d3.select("#metric-select").property("value", currentMetric);
    }
    if (brushedYearRange) brushedYearRange = null;

    currentYear = step.year;
    d3.select("#year-slider").property("value", currentYear);
    d3.select("#year-label").text(currentYear);
    updateAmbientBackground();
    onYearChange();
    focusCountry(step.code, null, true);

    const countryRec = closestYearData(step.code, currentYear);
    const countryName = countryRec ? countryRec.country : step.code;
    d3.select("#story-title").text(`${index + 1}/${STORY_STEPS.length} • ${step.title}`);
    d3.select("#story-text").text(`${countryName} (${step.year}): ${step.text}`);
    updateStoryUI();

    if (scheduleNext && storyActive && index < STORY_STEPS.length - 1) {
      storyTimer = setTimeout(() => {
        if (!storyActive) return;
        applyStoryStep(storyStepIndex + 1, true);
      }, STORY_STEP_DELAY_MS);
    }
  }

  function stepStory(delta) {
    if (!storyActive) {
      applyStoryStep(delta < 0 ? STORY_STEPS.length - 1 : 0, true);
      return;
    }
    const nextIndex = Math.max(0, Math.min(STORY_STEPS.length - 1, storyStepIndex + delta));
    applyStoryStep(nextIndex, true);
  }

  function handleWindowResize() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      drawMap();
      updateMap();
      drawTimeline();
      drawComparisonChart();

      if (selectedCountry) {
        const rec = closestYearData(selectedCountry, currentYear);
        if (rec && passesRegionFilter(rec)) {
          applyCountryHighlight();
          drawStackedArea(selectedCountry, rec.country);
        } else {
          clearSelectedCountry(false);
        }
      }

      updatePolicyShockLensPanel();
      updateShockNav();
      updateBrushHintText();
      updateDeselectButton();
      updateStoryUI();
    }, 150);
  }

  // ============================================================
  // CONTROLS
  // ============================================================
  function bindControls() {
    let prevYear = currentYear;

    // Year slider
    d3.select("#year-slider").on("input", function () {
      if (storyActive) stopStoryMode(false);
      const newYear = +this.value;
      // DIRECTION 5b: Animated counter (only if small jump)
      if (Math.abs(newYear - prevYear) <= 5 && Math.abs(newYear - prevYear) > 1) {
        animateYearLabel(prevYear, newYear);
      } else {
        d3.select("#year-label").text(newYear);
      }
      prevYear = newYear;
      currentYear = newYear;
      onYearChange();
      // DIRECTION 1: Update ambient bg
      updateAmbientBackground();
    });

    // Metric select
    d3.select("#metric-select").on("change", function () {
      if (storyActive) stopStoryMode(false);
      currentMetric = this.value;
      if (brushedYearRange) brushedYearRange = null;
      updateMap();
      drawComparisonChart();
      const selectedRec = selectedCountry ? closestYearData(selectedCountry, currentYear) : null;
      if (selectedCountry && selectedRec) drawStackedArea(selectedCountry, selectedRec.country);
      if (shockLensState && selectedCountry === shockLensState.code) {
        const eventRef = {
          year: shockLensState.eventYear,
          keyword: shockLensState.eventKeyword,
          title: shockLensState.eventTitle,
          impact: shockLensState.eventImpact,
        };
        shockLensState = buildPolicyShockLensState(selectedCountry, selectedRec ? selectedRec.country : shockLensState.country, eventRef);
        updatePolicyShockLensPanel();
      }
      updateShockNav();
      updateBrushHintText();
    });

    // Region filter
    d3.select("#region-select").on("change", function () {
      if (storyActive) stopStoryMode(false);
      currentRegion = this.value;
      if (brushedYearRange) brushedYearRange = null;
      d3.select("#tooltip").style("display", "none");
      const selectedRec = selectedCountry ? closestYearData(selectedCountry, currentYear) : null;
      if (selectedCountry && !passesRegionFilter(selectedRec)) {
        clearSelectedCountry(false);
      }
      if (shockLensState && selectedCountry === shockLensState.code) {
        const eventRef = {
          year: shockLensState.eventYear,
          keyword: shockLensState.eventKeyword,
          title: shockLensState.eventTitle,
          impact: shockLensState.eventImpact,
        };
        shockLensState = buildPolicyShockLensState(selectedCountry, selectedRec ? selectedRec.country : shockLensState.country, eventRef);
        if (!shockLensState) clearPolicyShockLens(false);
      } else if (shockLensState) {
        clearPolicyShockLens(false);
      }
      updateMap();
      updateInsightBar();
      updatePolicyShockLensPanel();
      updateShockNav();
      updateBrushHintText();
    });

    // Clear comparison list
    d3.select("#clear-compare-btn").on("click", function () {
      comparedCountries = [];
      drawComparisonChart();
      updateBrushHintText();
    });

    d3.select("#deselect-country-btn").on("click", function () {
      if (storyActive) stopStoryMode(false);
      clearSelectedCountry();
    });

    d3.select("#map-reset-btn").on("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      resetMapZoom();
    });

    // Play button
    d3.select("#play-btn").on("click", function () {
      if (storyActive) stopStoryMode(false);
      togglePlay();
    });

    d3.select("#story-btn").on("click", function () {
      applyStoryStep(0, true);
    });

    d3.select("#story-prev-btn").on("click", function () {
      stepStory(-1);
    });

    d3.select("#story-next-btn").on("click", function () {
      stepStory(1);
    });

    d3.select("#story-stop-btn").on("click", function () {
      stopStoryMode(true);
    });

    d3.select("#shock-lens-close-btn").on("click", function () {
      clearPolicyShockLens();
    });

    d3.select("#shock-nav-enable").on("change", function () {
      if (this.checked) applyShockNavSelection();
      else clearPolicyShockLens();
    });

    d3.select("#shock-event-select").on("change", function () {
      const autoApply = d3.select("#shock-nav-enable").property("checked");
      if (autoApply) applyShockNavSelection();
      else updateShockNav();
    });

    d3.select("#shock-prev-btn").on("click", function () {
      shiftShockNavEvent(-1);
      const autoApply = d3.select("#shock-nav-enable").property("checked");
      if (autoApply) applyShockNavSelection();
      else updateShockNav();
    });

    d3.select("#shock-next-btn").on("click", function () {
      shiftShockNavEvent(1);
      const autoApply = d3.select("#shock-nav-enable").property("checked");
      if (autoApply) applyShockNavSelection();
      else updateShockNav();
    });

    d3.select("#shock-apply-btn").on("click", function () {
      applyShockNavSelection();
    });

    d3.select("#shock-close-btn").on("click", function () {
      clearPolicyShockLens();
    });

    // Speed button
    d3.select("#speed-btn").on("click", function () {
      speedIndex = (speedIndex + 1) % SPEED_OPTIONS.length;
      playSpeed = SPEED_OPTIONS[speedIndex];
      d3.select(this).text(playSpeed + "x");
      // Restart interval if currently playing
      if (playing) {
        clearInterval(playTimer);
        startPlayInterval();
      }
    });

    updateShockNav();
    updateBrushHintText();
    updateDeselectButton();
    updateStoryUI();
  }

  function onYearChange() {
    triggerYearFx();
    if (brushedYearRange) brushedYearRange = null;
    updateMap();
    if (selectedCountry) {
      const rec = closestYearData(selectedCountry, currentYear);
      if (rec && passesRegionFilter(rec)) {
        drawStackedArea(selectedCountry, rec.country);
      } else {
        clearSelectedCountry(false);
      }
    }
    if (shockLensState) {
      if (!selectedCountry || shockLensState.code !== selectedCountry) {
        clearPolicyShockLens(false);
      } else {
        const rec = closestYearData(selectedCountry, currentYear);
        const eventRef = {
          year: shockLensState.eventYear,
          keyword: shockLensState.eventKeyword,
          title: shockLensState.eventTitle,
          impact: shockLensState.eventImpact,
        };
        shockLensState = buildPolicyShockLensState(selectedCountry, rec ? rec.country : shockLensState.country, eventRef);
        if (!shockLensState) clearPolicyShockLens(false);
        else updatePolicyShockLensPanel();
      }
    }
    drawComparisonChart();
    updateInsightBar();
    updateTimelinePlayhead();
    updateShockNav();
    updateBrushHintText();
    updateDeselectButton();
  }

  function startPlayInterval() {
    playTimer = setInterval(() => {
      currentYear++;
      if (currentYear > 2019) {
        togglePlay();
        return;
      }
      d3.select("#year-slider").property("value", currentYear);
      d3.select("#year-label").text(currentYear);
      updateAmbientBackground();
      onYearChange();
    }, 300 / playSpeed);
  }

  function togglePlay() {
    if (playing) {
      playing = false;
      clearInterval(playTimer);
      d3.select("#play-btn").text("\u25b6 Play").classed("playing", false);
    } else {
      playing = true;
      d3.select("#play-btn").text("\u23f8 Pause").classed("playing", true);
      if (currentYear >= 2019) {
        currentYear = 1960;
        d3.select("#year-slider").property("value", currentYear);
        d3.select("#year-label").text(currentYear);
        onYearChange();
        updateAmbientBackground();
      }
      startPlayInterval();
    }
  }
})();
