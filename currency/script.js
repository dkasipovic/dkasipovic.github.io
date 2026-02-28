'use strict';

// ── Constants ──────────────────────────────────────────────────────────────
const API_BASE = 'https://api.frankfurter.app';
const GEO_API  = 'https://nominatim.openstreetmap.org/reverse';
const LS_KEY   = 'currency-prefs';

// Hardcoded country-code → ISO 4217 currency mapping for GPS detection.
// Only countries whose currencies are supported by Frankfurter are included.
const COUNTRY_CURRENCY = {
  AT: 'EUR', AU: 'AUD', BA: 'BAM', BE: 'EUR', BG: 'BGN', BR: 'BRL',
  CA: 'CAD', CH: 'CHF', CN: 'CNY', CY: 'EUR', CZ: 'CZK', DE: 'EUR',
  DK: 'DKK', EE: 'EUR', ES: 'EUR', FI: 'EUR', FR: 'EUR', GB: 'GBP',
  GR: 'EUR', HK: 'HKD', HR: 'EUR', HU: 'HUF', ID: 'IDR', IE: 'EUR',
  IL: 'ILS', IN: 'INR', IS: 'ISK', IT: 'EUR', JP: 'JPY', KR: 'KRW',
  LT: 'EUR', LU: 'EUR', LV: 'EUR', MT: 'EUR', MX: 'MXN', MY: 'MYR',
  NL: 'EUR', NO: 'NOK', NZ: 'NZD', PH: 'PHP', PL: 'PLN', PT: 'EUR',
  RO: 'RON', RS: 'RSD', SA: 'SAR', SE: 'SEK', SG: 'SGD', SI: 'EUR',
  SK: 'EUR', TH: 'THB', TR: 'TRY', TZ: 'TZS', UA: 'UAH', US: 'USD',
  ZA: 'ZAR', AE: 'AED', RU: 'RUB',
};

// ── State ─────────────────────────────────────────────────────────────────
let debounceTimer  = null;
let lastRate       = null;
let lastUpdated    = null;
let activePeriod   = 30;       // days; matches default .period-btn.active
let historyLoaded  = false;    // lazy-load flag

// ── Init ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initNavigation();
  await loadCurrencies();
  const hasPrefs = loadPreferences();
  if (!hasPrefs) detectLocationCurrency();
  await fetchConversion();
  bindConvertEvents();
  bindHistoryEvents();
});

// ── Navigation ────────────────────────────────────────────────────────────
// Single handler for both sidebar buttons and bottom-nav buttons via [data-tab].
function initNavigation() {
  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;

      document.querySelectorAll('[data-tab]').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll(`[data-tab="${tab}"]`).forEach((b) => b.classList.add('active'));

      document.querySelectorAll('.tab-content').forEach((p) => p.classList.remove('active'));
      document.getElementById(`tab-${tab}`).classList.add('active');

      if (tab === 'history' && !historyLoaded) {
        historyLoaded = true;
        fetchHistory();
      }
    });
  });
}

// ── Currency List ─────────────────────────────────────────────────────────
async function loadCurrencies() {
  try {
    const res = await fetch(`${API_BASE}/currencies`);
    if (!res.ok) throw new Error();
    const currencies = await res.json();
    ['from-currency', 'to-currency', 'history-from', 'history-to'].forEach((id) =>
      populateSelect(id, currencies)
    );
  } catch {
    showConvertError(true);
  }
}

function populateSelect(id, currencies) {
  const sel = document.getElementById(id);
  sel.innerHTML = Object.entries(currencies)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, name]) => `<option value="${code}">${code} — ${name}</option>`)
    .join('');
}

// ── localStorage Preferences ──────────────────────────────────────────────
// Returns true if saved prefs existed (skips GPS detection), false on first visit.
function loadPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (!saved) return false;
    setSelect('from-currency',  saved.from    || 'USD');
    setSelect('to-currency',    saved.to      || 'EUR');
    setSelect('history-from',   saved.histFrom || 'USD');
    setSelect('history-to',     saved.histTo   || 'EUR');
    return true;
  } catch {
    return false;
  }
}

function savePreferences() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      from:     getSelect('from-currency'),
      to:       getSelect('to-currency'),
      histFrom: getSelect('history-from'),
      histTo:   getSelect('history-to'),
    }));
  } catch { /* quota exceeded — ignore */ }
}

function setSelect(id, value) {
  const sel = document.getElementById(id);
  if (sel && [...sel.options].some((o) => o.value === value)) sel.value = value;
}

function getSelect(id) {
  return document.getElementById(id).value;
}

// ── GPS-based Currency Detection ──────────────────────────────────────────
// Only runs on first visit (no saved prefs). Silent on denial or error.
function detectLocationCurrency() {
  if (!navigator.geolocation) return;

  showLocationStatus('Detecting your location…');

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      try {
        const { latitude, longitude } = pos.coords;
        const url = `${GEO_API}?lat=${latitude}&lon=${longitude}&format=json`;
        const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
        const data = await res.json();

        const countryCode = data.address?.country_code?.toUpperCase();
        const currency = COUNTRY_CURRENCY[countryCode];

        if (currency && currency !== getSelect('from-currency')) {
          setSelect('from-currency', currency);
          setSelect('history-from',  currency);
          savePreferences();
          fetchConversion();
          showLocationStatus(`Set to ${currency} based on your location`, 3000);
        } else {
          hideLocationStatus();
        }
      } catch {
        hideLocationStatus();
      }
    },
    () => hideLocationStatus(),   // denied or timed out → silent fallback
    { timeout: 8000, maximumAge: 0 }
  );
}

function showLocationStatus(msg, autohideMs) {
  const el = document.getElementById('location-status');
  el.textContent = msg;
  el.style.display = 'block';
  if (autohideMs) setTimeout(hideLocationStatus, autohideMs);
}

function hideLocationStatus() {
  document.getElementById('location-status').style.display = 'none';
}

// ── Convert Tab ───────────────────────────────────────────────────────────
function bindConvertEvents() {
  document.getElementById('amount-input').addEventListener('input', scheduleConversion);
  document.getElementById('from-currency').addEventListener('change', () => {
    savePreferences();
    scheduleConversion();
  });
  document.getElementById('to-currency').addEventListener('change', () => {
    savePreferences();
    scheduleConversion();
  });
  document.getElementById('swap-btn').addEventListener('click', swapCurrencies);
}

// Debounce: 300ms after last keystroke before firing the API call.
function scheduleConversion() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(fetchConversion, 300);
}

async function fetchConversion() {
  const from   = getSelect('from-currency');
  const to     = getSelect('to-currency');
  const amount = parseFloat(document.getElementById('amount-input').value);

  if (!from || !to) return;

  // Same-currency shortcut — no network call needed.
  if (from === to) {
    document.getElementById('result-value').textContent =
      isNaN(amount) ? '—' : formatAmount(amount);
    setRateInfo(`<span class="rate-highlight">1 ${from} = 1 ${to}</span>`);
    return;
  }

  showConvertError(false);
  setRateInfoLoading(true);

  try {
    // GET /latest?from=USD&to=EUR
    // Response: { amount:1, base:"USD", date:"…", rates:{ EUR:0.91234 } }
    const res = await fetch(`${API_BASE}/latest?from=${from}&to=${to}`);
    if (!res.ok) throw new Error();

    const data = await res.json();
    lastRate    = data.rates[to];
    lastUpdated = new Date();

    const converted = isNaN(amount) ? null : amount * lastRate;
    document.getElementById('result-value').textContent =
      converted !== null ? formatAmount(converted) : '—';

    setRateInfo(
      `<span class="rate-highlight">1 ${from} = ${formatAmount(lastRate)} ${to}</span>` +
      ` · Updated ${formatRelativeTime(lastUpdated)}`
    );
  } catch {
    setRateInfoLoading(false);
    showConvertError(true);
    document.getElementById('result-value').textContent = '—';
  }
}

function swapCurrencies() {
  const from = document.getElementById('from-currency');
  const to   = document.getElementById('to-currency');
  const temp = from.value;
  from.value = to.value;
  to.value   = temp;
  savePreferences();
  fetchConversion();
}

// Adaptive precision: ≥1000 → 2dp, ≥1 → 4dp, <1 → 6dp
function formatAmount(n) {
  if (Math.abs(n) >= 1000) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (Math.abs(n) >= 1)    return n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  return n.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 });
}

function setRateInfo(html) {
  const el = document.getElementById('rate-info');
  el.innerHTML = html;
  el.classList.remove('loading');
}

function setRateInfoLoading(on) {
  const el = document.getElementById('rate-info');
  if (on) {
    el.textContent = 'Loading…';
    el.classList.add('loading');
  } else {
    el.classList.remove('loading');
  }
}

function showConvertError(show) {
  document.getElementById('convert-error').style.display = show ? 'block' : 'none';
}

function formatRelativeTime(date) {
  if (!date) return '';
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 10)   return 'just now';
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

// ── History Tab ───────────────────────────────────────────────────────────
function bindHistoryEvents() {
  document.getElementById('history-from').addEventListener('change', () => {
    savePreferences();
    fetchHistory();
  });
  document.getElementById('history-to').addEventListener('change', () => {
    savePreferences();
    fetchHistory();
  });
  document.querySelectorAll('.period-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.period-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activePeriod = parseInt(btn.dataset.period, 10);
      fetchHistory();
    });
  });
}

async function fetchHistory() {
  const from = getSelect('history-from');
  const to   = getSelect('history-to');

  showHistoryLoading(true);
  showHistoryContent(false);
  showHistoryError(false);

  const fmt = (d) => d.toISOString().slice(0, 10);
  const endDate   = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - activePeriod);

  try {
    // GET /2026-01-29..2026-02-28?from=USD&to=EUR
    // Response: { amount:1, base:"USD", rates:{ "2026-01-29":{ EUR:0.912 }, … } }
    const url = `${API_BASE}/${fmt(startDate)}..${fmt(endDate)}?from=${from}&to=${to}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error();

    const data  = await res.json();
    const dates = Object.keys(data.rates).sort();
    const rates = dates.map((d) => data.rates[d][to]);

    renderChart({ dates, rates, from, to });
    renderHistoryTable({ dates, rates });

    showHistoryLoading(false);
    showHistoryContent(true);
  } catch {
    showHistoryLoading(false);
    showHistoryError(true);
  }
}

// ── SVG Chart ─────────────────────────────────────────────────────────────
// Pure SVG, no library. viewBox 0 0 600 200.
function renderChart({ dates, rates, from, to }) {
  const svg = document.getElementById('rate-chart');
  const W = 600, H = 200;
  const PAD = { top: 16, right: 16, bottom: 24, left: 58 };
  const iW  = W - PAD.left - PAD.right;
  const iH  = H - PAD.top  - PAD.bottom;

  const n       = dates.length;
  const minRate = Math.min(...rates);
  const maxRate = Math.max(...rates);
  const range   = maxRate - minRate || 1;

  const xOf = (i) => PAD.left + (i / Math.max(n - 1, 1)) * iW;
  const yOf = (r) => PAD.top  + (1 - (r - minRate) / range) * iH;

  const pts   = rates.map((r, i) => `${xOf(i).toFixed(1)},${yOf(r).toFixed(1)}`).join(' ');
  const fillD = [
    `M ${xOf(0).toFixed(1)} ${yOf(rates[0]).toFixed(1)}`,
    ...rates.slice(1).map((r, i) => `L ${xOf(i + 1).toFixed(1)} ${yOf(r).toFixed(1)}`),
    `L ${xOf(n - 1).toFixed(1)} ${(PAD.top + iH).toFixed(1)}`,
    `L ${PAD.left.toFixed(1)} ${(PAD.top + iH).toFixed(1)} Z`,
  ].join(' ');

  const yLabels = [
    { v: maxRate,               y: PAD.top },
    { v: (minRate + maxRate) / 2, y: PAD.top + iH / 2 },
    { v: minRate,               y: PAD.top + iH },
  ];

  svg.innerHTML = `
    <defs>
      <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="#8b5cf6" stop-opacity="0.28"/>
        <stop offset="100%" stop-color="#8b5cf6" stop-opacity="0.02"/>
      </linearGradient>
    </defs>

    ${yLabels.map((l) => `
      <line x1="${PAD.left}" y1="${l.y.toFixed(1)}"
            x2="${(PAD.left + iW).toFixed(1)}" y2="${l.y.toFixed(1)}"
            stroke="#2a2a32" stroke-width="1" stroke-dasharray="4 4"/>
      <text x="${(PAD.left - 6).toFixed(1)}" y="${(l.y + 4).toFixed(1)}"
            text-anchor="end" fill="#606068" font-size="10"
            font-family="ui-monospace,monospace">${l.v.toFixed(4)}</text>
    `).join('')}

    <path d="${fillD}" fill="url(#cg)"/>

    <polyline points="${pts}" fill="none" stroke="#8b5cf6"
              stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>

    <text x="${PAD.left}" y="${H - 4}" text-anchor="start"
          fill="#606068" font-size="10">${fmtDateShort(dates[0])}</text>
    <text x="${(PAD.left + iW).toFixed(1)}" y="${H - 4}" text-anchor="end"
          fill="#606068" font-size="10">${fmtDateShort(dates[n - 1])}</text>
  `;

  document.getElementById('chart-header').innerHTML =
    `<span>${from} → ${to}</span>` +
    `<span>Range: ${minRate.toFixed(4)} – ${maxRate.toFixed(4)}</span>`;
}

function fmtDateShort(dateStr) {
  // Append T00:00:00 to parse as local time, not UTC (avoids off-by-one-day bugs)
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  });
}

// ── History Table ─────────────────────────────────────────────────────────
// Most recent 20 rows, newest first, with color-coded change column.
function renderHistoryTable({ dates, rates }) {
  const rows = dates
    .map((d, i) => ({ date: d, rate: rates[i] }))
    .reverse()
    .slice(0, 20);

  document.getElementById('history-tbody').innerHTML = rows
    .map(({ date, rate }, idx) => {
      const prev   = idx < rows.length - 1 ? rows[idx + 1].rate : null;
      const change = prev !== null ? rate - prev : null;
      const sign   = change !== null ? (change >= 0 ? '+' : '') : '';
      const cls    = change === null ? 'change-neutral'
                   : change > 0     ? 'change-positive'
                   : change < 0     ? 'change-negative'
                   :                  'change-neutral';

      return `<tr>
        <td class="date-cell">${fmtDateDisplay(date)}</td>
        <td class="rate-cell">${rate.toFixed(4)}</td>
        <td class="${cls}">${change !== null ? sign + change.toFixed(4) : '—'}</td>
      </tr>`;
    })
    .join('');
}

function fmtDateDisplay(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

// ── UI Helpers ────────────────────────────────────────────────────────────
function showHistoryLoading(show) {
  document.getElementById('history-loading').style.display = show ? 'flex' : 'none';
}

function showHistoryContent(show) {
  document.getElementById('chart-container').style.display         = show ? 'block' : 'none';
  document.getElementById('history-table-container').style.display = show ? 'block' : 'none';
}

function showHistoryError(show) {
  document.getElementById('history-error').style.display = show ? 'block' : 'none';
}
