// ============================================================
// Global Energy Transition Explorer — D3.js Interactive Viz
// ============================================================

(function () {
  "use strict";

  // --- State ---
  let allData = [];
  let worldTopo = null;
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

  // ============================================================
  // DIRECTION 1: Data-driven ambient background
  // ============================================================
  // 1960 → warm amber tint, 2020 → cool blue-green tint
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
    document.getElementById("app").style.background = `rgb(${r},${g},${b})`;

    // Year label color also shifts
    const yearEl = document.getElementById("year-label");
    yearEl.style.color = interpolateColor(YEAR_COLOR_WARM, YEAR_COLOR_COOL, t);
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
        card.style.boxShadow = `${-x * 8}px ${y * 8}px 24px rgba(0,0,0,0.08)`;
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

  // --- Helpers ---
  function getCountryData(code) {
    return allData.filter((d) => d.code === code);
  }

  function getYearData(year) {
    return allData.filter((d) => d.year === year);
  }

  function getCountryYearData(code, year) {
    return allData.find((d) => d.code === code && d.year === year);
  }

  function closestYearData(code, year) {
    const cdata = getCountryData(code);
    if (!cdata.length) return null;
    cdata.sort((a, b) => Math.abs(a.year - year) - Math.abs(b.year - year));
    return cdata[0];
  }

  function fmt(v) {
    if (v == null) return "N/A";
    return v >= 1000 ? d3.format(",.0f")(v) : d3.format(".1f")(v);
  }

  // --- Data Loading ---
  Promise.all([
    d3.json("data/energy.json?v=" + Date.now()),
    d3.json("data/world-110m.json"),
  ]).then(([energy, world]) => {
    allData = energy;
    worldTopo = world;
    // Debug: check data completeness
    const y1970 = energy.filter(d => d.year === 1970);
    const rp1970 = y1970.filter(d => d.renewable_pct != null);
    console.log(`[DEBUG] Total records: ${energy.length}, 1970 records: ${y1970.length}, 1970 w/ renewable_pct: ${rp1970.length}`);
    if (rp1970.length > 0) console.log("[DEBUG] Sample:", rp1970[0]);
    init();
  });

  // --- Init ---
  function init() {
    populateRegionFilter();
    drawMap();
    drawLegend();
    bindControls();
    updateMap();
    updateAmbientBackground();
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

  function drawMap() {
    const container = document.getElementById("map-container");
    mapWidth = container.clientWidth;
    mapHeight = Math.min(mapWidth * 0.55, 520);

    mapSvg = d3
      .select("#map-svg")
      .attr("viewBox", `0 0 ${mapWidth} ${mapHeight}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

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
      });

    mapSvg.call(zoom);

    // Graticule
    mapSvg
      .append("path")
      .datum(d3.geoGraticule10())
      .attr("d", pathGen)
      .attr("fill", "none")
      .attr("stroke", "rgba(255,255,255,0.06)")
      .attr("stroke-width", 0.4);

    mapG = mapSvg.append("g");

    const countries = topojson.feature(worldTopo, worldTopo.objects.countries).features;

    mapG
      .selectAll(".country-path")
      .data(countries)
      .join("path")
      .attr("class", "country-path")
      .attr("d", pathGen)
      .attr("fill", "#1a2332")
      .on("mouseover", onCountryHover)
      .on("mousemove", onCountryMove)
      .on("mouseout", onCountryOut)
      .on("click", onCountryClick);

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
        const alpha3 = ISO_NUM_TO_ALPHA3[d.id];
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
      .text(fmt(domain[0]));

    svg.append("text").attr("x", 30 + w).attr("y", h + 16)
      .attr("text-anchor", "end")
      .attr("fill", "rgba(255,255,255,0.45)").attr("font-size", 10)
      .text(fmt(domain[1]));

    container.append("span").text(METRIC_LABELS[currentMetric]);
  }

  // --- Map interactions ---
  function onCountryHover(event, d) {
    const alpha3 = ISO_NUM_TO_ALPHA3[d.id];
    if (!alpha3) return;
    const rec = closestYearData(alpha3, currentYear);
    if (!rec) return;

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
    const alpha3 = ISO_NUM_TO_ALPHA3[d.id];
    if (!alpha3) return;
    const rec = closestYearData(alpha3, currentYear);
    if (!rec) return;

    // DIRECTION 2: Ripple
    createRipple(event);

    // Remove guide on first click
    mapSvg.selectAll(".map-guide").transition().duration(400).style("opacity", 0).remove();

    // Toggle selection
    if (selectedCountry === alpha3) {
      selectedCountry = null;
      d3.selectAll(".country-path").classed("selected", false).classed("dimmed", false);
      d3.select("#chart-title").text("Select a country on the map");
      d3.select("#stack-chart").selectAll("*").remove();
      d3.select("#annotation-box").html("");
    } else {
      selectedCountry = alpha3;
      // Highlight: dim all others, highlight selected
      d3.selectAll(".country-path")
        .classed("selected", function (dd) {
          return ISO_NUM_TO_ALPHA3[dd.id] === alpha3;
        })
        .classed("dimmed", function (dd) {
          return ISO_NUM_TO_ALPHA3[dd.id] !== alpha3;
        });
      drawStackedArea(alpha3, rec.country);
    }

    // Add to comparison
    if (alpha3 && !comparedCountries.find((c) => c.code === alpha3)) {
      if (comparedCountries.length >= 6) comparedCountries.shift();
      comparedCountries.push({ code: alpha3, country: rec.country });
      drawSparklines();
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

    // Legend
    const legendG = g.append("g").attr("transform", `translate(${width - 130}, -14)`);
    ENERGY_SOURCES.forEach((s, i) => {
      const row = legendG.append("g").attr("transform", `translate(0, ${i * 14})`);
      row.append("rect").attr("width", 10).attr("height", 10).attr("rx", 2).attr("fill", s.color);
      row.append("text").attr("x", 14).attr("y", 9).attr("fill", "rgba(255,255,255,0.45)").attr("font-size", 10).text(s.label);
    });

    // BRUSHING: drag to select year range on chart
    const brush = d3.brushX()
      .extent([[0, 0], [width, height]])
      .on("brush end", function (event) {
        if (!event.selection) {
          // Brush cleared
          brushedYearRange = null;
          d3.select("#brush-label").remove();
          updateMap();
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
      });

    g.append("g")
      .attr("class", "chart-brush")
      .call(brush);

    updateAnnotationBox(code);
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
        const alpha3 = ISO_NUM_TO_ALPHA3[d.id];
        if (avgMap[alpha3] == null) return "#1a2332";
        return colorScale(avgMap[alpha3]);
      });
  }

  function updateAnnotationBox(code) {
    const rec = closestYearData(code, currentYear);
    if (!rec) return;
    let html = "";
    if (rec.renewable_pct != null) html += `<strong>Renewable:</strong> ${fmt(rec.renewable_pct)}% &nbsp;`;
    if (rec.fossil_fuel_pct != null) html += `<strong>Fossil Fuel:</strong> ${fmt(rec.fossil_fuel_pct)}% &nbsp;`;
    if (rec.access_electricity != null) html += `<strong>Electricity Access:</strong> ${fmt(rec.access_electricity)}%`;
    d3.select("#annotation-box").html(html);
  }

  // ============================================================
  // SPARKLINES — DIRECTION 3: draw-line animation
  // ============================================================
  function drawSparklines() {
    const container = d3.select("#sparklines");
    container.selectAll("*").remove();

    comparedCountries.forEach((c) => {
      const card = container.append("div").attr("class", "spark-card");

      card.append("div").attr("class", "spark-title").text(c.country);

      const cdata = getCountryData(c.code)
        .filter((d) => d[currentMetric] != null)
        .sort((a, b) => a.year - b.year);

      const latestVal = cdata.length ? cdata[cdata.length - 1] : null;
      card.append("div").attr("class", "spark-value")
        .text(latestVal ? `${METRIC_LABELS[currentMetric]}: ${fmt(latestVal[currentMetric])} (${latestVal.year})` : "No data");

      card.append("button")
        .attr("class", "remove-btn")
        .text("\u2715")
        .on("click", () => {
          comparedCountries = comparedCountries.filter((cc) => cc.code !== c.code);
          if (selectedCountry === c.code) {
            selectedCountry = null;
            d3.selectAll(".country-path").classed("selected", false);
            d3.select("#chart-title").text("Select a country on the map");
            d3.select("#stack-chart").selectAll("*").remove();
            d3.select("#annotation-box").html("");
          }
          drawSparklines();
        });

      if (cdata.length < 2) return;

      const sw = 180, sh = 40;
      const sparkSvg = card.append("svg").attr("width", sw).attr("height", sh);

      const sx = d3.scaleLinear().domain(d3.extent(cdata, (d) => d.year)).range([0, sw]);
      const sy = d3.scaleLinear().domain(d3.extent(cdata, (d) => d[currentMetric])).range([sh - 2, 2]);

      const line = d3.line()
        .x((d) => sx(d.year))
        .y((d) => sy(d[currentMetric]))
        .curve(d3.curveMonotoneX);

      // DIRECTION 3: Animated sparkline draw
      const path = sparkSvg.append("path")
        .datum(cdata)
        .attr("d", line)
        .attr("fill", "none")
        .attr("stroke", "#58a6ff")
        .attr("stroke-width", 1.5);

      const totalLen = path.node().getTotalLength();
      path
        .attr("stroke-dasharray", totalLen)
        .attr("stroke-dashoffset", totalLen)
        .transition()
        .duration(800)
        .ease(d3.easeCubicOut)
        .attr("stroke-dashoffset", 0);

      // Current year dot
      const cyData = cdata.find((d) => d.year === currentYear);
      if (cyData) {
        sparkSvg.append("circle")
          .attr("cx", sx(cyData.year))
          .attr("cy", sy(cyData[currentMetric]))
          .attr("r", 0)
          .attr("fill", "#f97316")
          .transition()
          .delay(700)
          .duration(300)
          .attr("r", 3);
      }
    });
  }

  // ============================================================
  // CONTROLS
  // ============================================================
  function bindControls() {
    let prevYear = currentYear;

    // Year slider
    d3.select("#year-slider").on("input", function () {
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
      currentMetric = this.value;
      updateMap();
      drawSparklines();
      if (selectedCountry) {
        const rec = closestYearData(selectedCountry, currentYear);
        if (rec) drawStackedArea(selectedCountry, rec.country);
      }
    });

    // Region filter
    d3.select("#region-select").on("change", function () {
      currentRegion = this.value;
      updateMap();
    });

    // Play button
    d3.select("#play-btn").on("click", togglePlay);

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
  }

  function onYearChange() {
    updateMap();
    if (selectedCountry) {
      const rec = closestYearData(selectedCountry, currentYear);
      if (rec) drawStackedArea(selectedCountry, rec.country);
    }
    drawSparklines();
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
      if (currentYear >= 2019) currentYear = 1960;
      startPlayInterval();
    }
  }
})();
