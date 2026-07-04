// Dev-time generator for the per-continent SVG maps in ./maps/.
// Not loaded by the app — run manually when regenerating maps:
//
//   1. Download Natural Earth 50m admin-0 countries (public domain):
//      https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson
//   2. node build-maps.mjs /path/to/ne_50m_admin_0_countries.geojson
//
// Countries listed in data.json become clickable <path class="country" data-code="XX">;
// everything else visible in the window is drawn as non-interactive .territory context.
// Tiny countries additionally get a visible dot + an enlarged invisible tap circle.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const geojsonPath = process.argv[2];
if (!geojsonPath) {
  console.error('Usage: node build-maps.mjs <ne_50m_admin_0_countries.geojson>');
  process.exit(1);
}

const data = JSON.parse(readFileSync(join(here, 'data.json'), 'utf8'));
const geo = JSON.parse(readFileSync(geojsonPath, 'utf8'));

const WIDTH = 1000;
const TINY_DIAGONAL = 22; // projected bbox diagonal below which a country gets a dot + tap circle

// lon/lat windows per continent; shift() normalizes antimeridian-crossing longitudes
const WINDOWS = {
  europe: { lon: [-25, 50], lat: [34, 72], shift: (l) => l },
  asia: { lon: [25, 150], lat: [-11, 62], shift: (l) => (l < -150 ? l + 360 : l) },
  africa: { lon: [-26, 60], lat: [-36, 38], shift: (l) => l },
  'north-america': { lon: [-170, -12], lat: [5, 84], shift: (l) => (l > 150 ? l - 360 : l) },
  'south-america': { lon: [-93, -32], lat: [-57, 13], shift: (l) => l },
  oceania: { lon: [110, 240], lat: [-50, 10], shift: (l) => (l < 0 ? l + 360 : l) },
};

const countriesByContinent = {};
for (const c of data.countries) {
  (countriesByContinent[c.continent] ||= []).push(c);
}

function iso2(props) {
  const v = props.ISO_A2_EH;
  return v && /^[A-Z]{2}$/.test(v) ? v : null;
}

// Flatten a feature's geometry into an array of rings (outer + holes alike;
// even-odd fill makes holes render correctly without distinguishing them).
function rings(geom) {
  if (geom.type === 'Polygon') return geom.coordinates;
  if (geom.type === 'MultiPolygon') return geom.coordinates.flat();
  return [];
}

function build(continent) {
  const win = WINDOWS[continent];
  const [lon0, lon1] = win.lon;
  const [lat0, lat1] = win.lat;
  const latMid = ((lat0 + lat1) / 2) * (Math.PI / 180);
  const cosMid = Math.cos(latMid);
  const scale = WIDTH / ((lon1 - lon0) * cosMid);
  const height = Math.round((lat1 - lat0) * scale);

  const px = (lon) => (lon - lon0) * cosMid * scale;
  const py = (lat) => (lat1 - lat) * scale;

  const own = new Set(countriesByContinent[continent].map((c) => c.code));
  const countryPaths = new Map(); // code -> d fragments
  const countryBounds = new Map(); // code -> {minX,minY,maxX,maxY, biggest ring info}
  const territoryPaths = [];

  for (const feature of geo.features) {
    const code = iso2(feature.properties);
    const isOwn = code !== null && own.has(code);
    const minStep = isOwn ? 0.6 : 1.2;
    const frags = [];

    for (const ring of rings(feature.geometry)) {
      // bbox test in projected space, on shifted longitudes
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let minLon = Infinity, maxLon = -Infinity;
      const pts = [];
      for (const [lonRaw, lat] of ring) {
        const lon = win.shift(lonRaw);
        const x = px(lon);
        const y = py(lat);
        pts.push([x, y]);
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      if (maxX < 0 || minX > WIDTH || maxY < 0 || minY > height) continue; // outside window
      // A ring torn apart by the antimeridian shift (e.g. one crossing the
      // prime meridian on a shifted window) smears across the whole map — drop it.
      if (maxLon - minLon > 300) continue;

      // round + thin; clamp far off-screen runs so thinning collapses them
      // (the viewBox crops them anyway, no need to carry exact geometry)
      const MARGIN = 30;
      const clampX = (v) => Math.max(-MARGIN, Math.min(WIDTH + MARGIN, v));
      const clampY = (v) => Math.max(-MARGIN, Math.min(height + MARGIN, v));
      let d = '';
      let lastX = null, lastY = null, kept = 0;
      for (let i = 0; i < pts.length; i++) {
        const x = Math.round(clampX(pts[i][0]) * 10) / 10;
        const y = Math.round(clampY(pts[i][1]) * 10) / 10;
        const isLast = i === pts.length - 1;
        if (lastX !== null && !isLast && Math.hypot(x - lastX, y - lastY) < minStep) continue;
        d += (kept === 0 ? 'M' : 'L') + x + ' ' + y;
        lastX = x; lastY = y; kept++;
      }
      if (kept < 3) {
        // Ring collapsed at this scale (e.g. Vatican). Own countries still need
        // a path (the visible dot marks them); territories can just vanish.
        if (!isOwn) continue;
        const cx = Math.round(((minX + maxX) / 2) * 10) / 10;
        const cy = Math.round(((minY + maxY) / 2) * 10) / 10;
        d = `M${cx - 0.6} ${cy - 0.6}L${cx + 0.6} ${cy - 0.6}L${cx + 0.6} ${cy + 0.6}L${cx - 0.6} ${cy + 0.6}`;
      }
      frags.push(d + 'Z');

      if (isOwn) {
        const b = countryBounds.get(code) || {
          minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity,
          bigArea: 0, cx: 0, cy: 0,
        };
        b.minX = Math.min(b.minX, minX);
        b.minY = Math.min(b.minY, minY);
        b.maxX = Math.max(b.maxX, maxX);
        b.maxY = Math.max(b.maxY, maxY);
        const area = (maxX - minX) * (maxY - minY);
        if (area >= b.bigArea) {
          b.bigArea = area;
          b.cx = (minX + maxX) / 2;
          b.cy = (minY + maxY) / 2;
        }
        countryBounds.set(code, b);
      }
    }

    if (frags.length === 0) continue;
    if (isOwn) {
      countryPaths.set(code, (countryPaths.get(code) || '') + frags.join(''));
    } else {
      territoryPaths.push(frags.join(''));
    }
  }

  const missing = countriesByContinent[continent]
    .filter((c) => !countryPaths.has(c.code))
    .map((c) => c.code);
  if (missing.length) {
    console.error(`FATAL: ${continent} is missing geometry for: ${missing.join(', ')}`);
    process.exit(1);
  }

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${height}">\n`;
  svg += '<g class="territories">\n';
  for (const d of territoryPaths) {
    svg += `<path class="territory" fill-rule="evenodd" d="${d}"/>\n`;
  }
  svg += '</g>\n<g class="countries">\n';
  for (const c of countriesByContinent[continent]) {
    svg += `<path class="country" data-code="${c.code}" fill-rule="evenodd" vector-effect="non-scaling-stroke" d="${countryPaths.get(c.code)}"/>\n`;
  }
  svg += '</g>\n<g class="tap-targets">\n';
  let dots = 0;
  for (const c of countriesByContinent[continent]) {
    const b = countryBounds.get(c.code);
    const diag = Math.hypot(b.maxX - b.minX, b.maxY - b.minY);
    if (diag >= TINY_DIAGONAL) continue;
    const cx = Math.round(b.cx * 10) / 10;
    const cy = Math.round(b.cy * 10) / 10;
    svg += `<circle class="dot" data-code="${c.code}" cx="${cx}" cy="${cy}" r="4"/>\n`;
    svg += `<circle class="tap" data-code="${c.code}" cx="${cx}" cy="${cy}" r="16"/>\n`;
    dots++;
  }
  svg += '</g>\n</svg>\n';

  const out = join(here, 'maps', `${continent}.svg`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, svg);
  console.log(
    `${continent}: ${Math.round(svg.length / 1024)} KB, viewBox 0 0 ${WIDTH} ${height}, ` +
    `${countryPaths.size} countries, ${territoryPaths.length} territories, ${dots} dots`
  );
}

for (const continent of Object.keys(WINDOWS)) build(continent);
