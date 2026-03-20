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
  let playing = false;
  let playTimer = null;

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
    d3.json("data/energy.json"),
    d3.json("data/world-110m.json"),
  ]).then(([energy, world]) => {
    allData = energy;
    worldTopo = world;
    init();
  });

  // --- Init ---
  function init() {
    populateRegionFilter();
    drawMap();
    drawLegend();
    bindControls();
    updateMap();
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
      .attr("stroke", "#c5cdd5")
      .attr("stroke-width", 0.4);

    mapG = mapSvg.append("g");

    const countries = topojson.feature(worldTopo, worldTopo.objects.countries).features;

    mapG
      .selectAll(".country-path")
      .data(countries)
      .join("path")
      .attr("class", "country-path")
      .attr("d", pathGen)
      .attr("fill", "#dde3e9")
      .on("mouseover", onCountryHover)
      .on("mousemove", onCountryMove)
      .on("mouseout", onCountryOut)
      .on("click", onCountryClick);
  }

  function getColorScale() {
    // Consider data within ±5 years for color scale
    let vals = allData
      .filter((d) => Math.abs(d.year - currentYear) <= 5 && d[currentMetric] != null)
      .map((d) => d[currentMetric]);

    if (currentMetric === "energy_per_capita") {
      // Diverging for per-capita
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

    // Build a lookup: for each country, find the closest year within ±5 years
    // that has data for the current metric
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

    mapG
      .selectAll(".country-path")
      .transition()
      .duration(200)
      .attr("fill", function (d) {
        const alpha3 = ISO_NUM_TO_ALPHA3[d.id];
        const rec = dataMap[alpha3];
        if (!rec || rec[currentMetric] == null) return "#dde3e9";
        return colorScale(rec[currentMetric]);
      });

    // Show/hide no-data warning
    mapSvg.selectAll(".no-data-msg").remove();
    if (dataCount === 0) {
      mapSvg.append("text")
        .attr("class", "no-data-msg")
        .attr("x", mapWidth / 2)
        .attr("y", mapHeight / 2)
        .attr("text-anchor", "middle")
        .attr("fill", "#5a6f80")
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
      .attr("fill", "#8899aa").attr("font-size", 10)
      .text(fmt(domain[0]));

    svg.append("text").attr("x", 30 + w).attr("y", h + 16)
      .attr("text-anchor", "end")
      .attr("fill", "#8899aa").attr("font-size", 10)
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

  function onCountryClick(event, d) {
    const alpha3 = ISO_NUM_TO_ALPHA3[d.id];
    if (!alpha3) return;
    const rec = closestYearData(alpha3, currentYear);
    if (!rec) return;

    // Toggle selection
    if (selectedCountry === alpha3) {
      selectedCountry = null;
      d3.selectAll(".country-path").classed("selected", false);
      d3.select("#chart-title").text("Select a country on the map");
      d3.select("#stack-chart").selectAll("*").remove();
      d3.select("#annotation-box").html("");
    } else {
      selectedCountry = alpha3;
      d3.selectAll(".country-path").classed("selected", function (dd) {
        return ISO_NUM_TO_ALPHA3[dd.id] === alpha3;
      });
      drawStackedArea(alpha3, rec.country);
    }

    // Add to comparison if not already
    if (alpha3 && !comparedCountries.find((c) => c.code === alpha3)) {
      if (comparedCountries.length >= 6) comparedCountries.shift();
      comparedCountries.push({ code: alpha3, country: rec.country });
      drawSparklines();
    }
  }

  // ============================================================
  // STACKED AREA CHART (electricity production by source)
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

    // Prepare data
    const cdata = getCountryData(code)
      .filter((d) => {
        return ENERGY_SOURCES.some((s) => d[s.key] != null);
      })
      .sort((a, b) => a.year - b.year);

    if (!cdata.length) {
      g.append("text")
        .attr("x", width / 2).attr("y", height / 2)
        .attr("text-anchor", "middle")
        .attr("fill", "#5a6f80")
        .text("No electricity source data available");
      return;
    }

    // Normalize: fill nulls with 0
    const stackData = cdata.map((d) => {
      const row = { year: d.year };
      ENERGY_SOURCES.forEach((s) => {
        row[s.key] = d[s.key] || 0;
      });
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

    // Area generator
    const area = d3.area()
      .x((d) => x(d.data.year))
      .y0((d) => y(d[0]))
      .y1((d) => y(d[1]))
      .curve(d3.curveMonotoneX);

    // Draw areas with transition
    g.selectAll(".area-layer")
      .data(series)
      .join("path")
      .attr("class", "area-layer")
      .attr("fill", (d, i) => ENERGY_SOURCES[i].color)
      .attr("d", area)
      .on("mouseover", function (event, d) {
        const src = ENERGY_SOURCES.find((s) => s.key === d.key);
        d3.select("#tooltip")
          .style("display", "block")
          .html(`<div class="tt-title">${src.label}</div>`);
      })
      .on("mousemove", onCountryMove)
      .on("mouseout", onCountryOut)
      .attr("opacity", 0)
      .transition()
      .duration(600)
      .attr("opacity", 0.85);

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

    // Legend for sources
    const legendG = g.append("g").attr("transform", `translate(${width - 130}, -14)`);
    ENERGY_SOURCES.forEach((s, i) => {
      const row = legendG.append("g").attr("transform", `translate(0, ${i * 14})`);
      row.append("rect").attr("width", 10).attr("height", 10).attr("rx", 2).attr("fill", s.color);
      row.append("text").attr("x", 14).attr("y", 9).attr("fill", "#8899aa").attr("font-size", 10).text(s.label);
    });

    // Annotation box
    updateAnnotationBox(code);
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
  // SPARKLINES (Country Comparison)
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

      // Remove button
      card.append("button")
        .attr("class", "remove-btn")
        .text("✕")
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

      sparkSvg.append("path")
        .datum(cdata)
        .attr("d", line)
        .attr("fill", "none")
        .attr("stroke", "#4fc3f7")
        .attr("stroke-width", 1.5);

      // Current year dot
      const cyData = cdata.find((d) => d.year === currentYear);
      if (cyData) {
        sparkSvg.append("circle")
          .attr("cx", sx(cyData.year))
          .attr("cy", sy(cyData[currentMetric]))
          .attr("r", 3)
          .attr("fill", "#ffeb3b");
      }
    });
  }

  // ============================================================
  // CONTROLS
  // ============================================================
  function bindControls() {
    // Year slider
    d3.select("#year-slider").on("input", function () {
      currentYear = +this.value;
      d3.select("#year-label").text(currentYear);
      onYearChange();
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
  }

  function onYearChange() {
    updateMap();
    if (selectedCountry) {
      const rec = closestYearData(selectedCountry, currentYear);
      if (rec) drawStackedArea(selectedCountry, rec.country);
    }
    drawSparklines();
  }

  function togglePlay() {
    if (playing) {
      playing = false;
      clearInterval(playTimer);
      d3.select("#play-btn").text("▶ Play").classed("playing", false);
    } else {
      playing = true;
      d3.select("#play-btn").text("⏸ Pause").classed("playing", true);
      if (currentYear >= 2020) currentYear = 1960;
      playTimer = setInterval(() => {
        currentYear++;
        if (currentYear > 2020) {
          togglePlay();
          return;
        }
        d3.select("#year-slider").property("value", currentYear);
        d3.select("#year-label").text(currentYear);
        onYearChange();
      }, 300);
    }
  }
})();
